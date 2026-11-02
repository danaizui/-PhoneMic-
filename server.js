#!/usr/bin/env node
'use strict';
/* eslint-disable no-console */
/**
 * PhoneMic —— 把手机当作电脑的临时麦克风
 *
 *  手机浏览器打开 https://<电脑局域网IP>:8443/?k=xxxx  →  点击开始  →  声音从电脑输出
 *
 * 架构：
 *   手机  --(WebSocket, Int16 PCM 20ms 帧)-->  Node 服务
 *   Node 服务 --(抖动缓冲 + 重采样 + 混音)-->  audiosink.exe --(waveOut)--> 声卡
 *
 * 没有第三方原生依赖：音频输出用系统自带的 csc.exe 现场编译一个小程序。
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const https = require('https');
const net = require('net');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');
const { performance } = require('perf_hooks');

const { WebSocketServer } = require('ws');
const QRCode = require('qrcode');
const selfsigned = require('selfsigned');

const { t, detectLang, normalizeLang } = require('./lib/i18n');

const ROOT = __dirname;

// 当前界面语言：auto 时在启动时按系统语言判定，--lang 可以强制指定。
let LANG = detectLang();
const T = (key, vars) => t(LANG, key, vars);
const PUBLIC = path.join(ROOT, 'public');
const CERTS = path.join(ROOT, 'certs');
const BUILD = path.join(ROOT, 'build');
const SINK_SRC = path.join(ROOT, 'bin', 'audiosink.cs');

// 一帧音频的时长。声卡端必须是 30ms：实测 Windows 共享模式下 20ms 的
// waveOut 缓冲每块会被驱动多拖 5ms（播放比实时慢 20%），30ms 以上就正好实时。
// 手机端仍然按 20ms 小块发送，服务端自己攒够 30ms 再送去声卡。
const FRAME_MS = 30;

// ---------------------------------------------------------------------------
// 命令行参数
// ---------------------------------------------------------------------------
const DEFAULTS = {
  port: 8443,          // 局域网 HTTPS 端口
  httpPort: 8080,      // 本机 HTTP 端口（给 cloudflared / 本机测试用）
  host: '0.0.0.0',
  httpHost: '127.0.0.1',
  rate: 48000,         // 声卡输出采样率
  latency: 120,        // 抖动缓冲目标（毫秒），网络越差调越大
  player: 'native',    // native | browser | none
  device: null,        // 声卡名字片段或序号
  mic: false,          // --mic：自动找到虚拟声卡并输出过去（游戏麦克风模式）
  cable: null,         // --cable：手动指定虚拟声卡（名字片段或序号）
  monitorDevice: null, // --monitor：额外把声音送到另一个设备让自己听见
  token: null,         // null => 自动生成
  tunnel: false,       // 用 cloudflared 开公网 HTTPS 地址  publicUrl: null,     // 手动指定对外地址
  open: true,          // 自动打开控制台页面
  record: null,        // 把收到的声音同时录成 wav
  verbose: false,
  doctor: false,       // --doctor：检查默认设备路由
  lang: 'auto',        // --lang：界面语言 zh / en / auto
};

function parseArgs(argv) {
  const o = { ...DEFAULTS };
  const takesValue = new Set([
    '--port', '--http-port', '--host', '--http-host', '--rate', '--latency',
    '--player', '--device', '--cable', '--monitor', '--token', '--public-url',
    '--record', '--ip', '--lang',
  ]);

  for (let i = 0; i < argv.length; i++) {
    let a = argv[i];
    let v = null;
    const eq = a.indexOf('=');
    if (a.startsWith('--') && eq > 0) { v = a.slice(eq + 1); a = a.slice(0, eq); }

    // --monitor 的值可以省略：只写 --monitor 表示用系统默认播放设备
    if (a === '--monitor' && v === null) {
      const nxt = argv[i + 1];
      if (nxt !== undefined && !nxt.startsWith('-')) { v = nxt; i++; }
      else v = 'default';
    }

    if (takesValue.has(a) && v === null) {
      v = argv[++i];
      if (v === undefined) die(T('err.needsValue', { arg: a }));
    }

    switch (a) {
      case '--port': o.port = int(v, a); break;
      case '--http-port': o.httpPort = int(v, a); break;
      case '--host': o.host = v; break;
      case '--http-host': o.httpHost = v; break;
      case '--ip': o.ip = v; break;
      case '--rate': o.rate = int(v, a); break;
      case '--latency': o.latency = int(v, a); break;
      case '--player': o.player = v; break;
      case '--device': o.device = v; break;
      case '--mic': o.mic = true; break;
      case '--cable': o.cable = v; o.mic = true; break;
      case '--monitor': o.monitorDevice = v; break;
      case '--token': o.token = v; break;
      case '--no-token': o.token = ''; break;
      case '--tunnel': o.tunnel = true; break;
      case '--public-url': o.publicUrl = v; break;
      case '--record': o.record = v; break;
      case '--no-open': o.open = false; break;
      case '--open': o.open = true; break;
      case '--http': o.httpHost = '0.0.0.0'; break;
      case '--verbose': o.verbose = true; break;
      case '--list-devices': o.listDevices = true; break;
      case '--doctor': o.doctor = true; break;
      case '--lang': {
        const lang = normalizeLang(v);
        if (lang === undefined) die(T('err.badLang', { value: v }));
        o.lang = lang || 'auto';
        break;
      }
      case '-h':
      case '--help': o.help = true; break;
      default:
        if (a.startsWith('-')) die(T('err.unknownArg', { arg: a }));
    }
  }
  return o;
}

function int(v, name) {
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n)) die(T('err.notNumber', { name, value: v }));
  return n;
}

function die(msg) {
  console.error('\n✖ ' + msg + '\n');
  process.exit(1);
}

function helpText() {
  return T('help.text');
}

// ---------------------------------------------------------------------------
// 网络辅助
// ---------------------------------------------------------------------------
function listInterfaces() {
  const out = [];
  const ifs = os.networkInterfaces();
  for (const name of Object.keys(ifs)) {
    for (const ni of ifs[name] || []) {
      if (ni.family === 'IPv4' && !ni.internal) out.push({ name, address: ni.address });
    }
  }
  return out;
}

function pickLanIP(preferred) {
  const all = listInterfaces();
  if (preferred) {
    const hit = all.find((x) => x.address === preferred);
    if (hit) return hit.address;
    die(T('err.badIp', {
      ip: preferred,
      list: all.map((x) => x.address).join(', ') || T('dev.none'),
    }));
  }
  const rank = (a) =>
    a.address.startsWith('192.168.') ? 0
      : a.address.startsWith('10.') ? 1
        : /^172\.(1[6-9]|2\d|3[01])\./.test(a.address) ? 2 : 3;
  all.sort((a, b) => rank(a) - rank(b));
  return all.length ? all[0].address : '127.0.0.1';
}

// ---------------------------------------------------------------------------
// 自签名证书（手机浏览器需要 https 才允许使用麦克风）
// ---------------------------------------------------------------------------
function ensureCertificate(ips) {
  fs.mkdirSync(CERTS, { recursive: true });
  const keyPath = path.join(CERTS, 'key.pem');
  const crtPath = path.join(CERTS, 'cert.pem');
  const metaPath = path.join(CERTS, 'meta.json');

  const wanted = JSON.stringify(
    [...new Set(['127.0.0.1', 'localhost', ...ips])].sort(),
  );

  try {
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    if (meta.names === wanted && fs.existsSync(keyPath) && fs.existsSync(crtPath)) {
      return { key: fs.readFileSync(keyPath), cert: fs.readFileSync(crtPath), reused: true };
    }
  } catch { /* 首次运行或者缓存损坏，重新生成 */ }

  const altNames = [
    { type: 2, value: 'localhost' },
    { type: 7, ip: '127.0.0.1' },
    ...ips.filter((ip) => ip !== '127.0.0.1' && ip !== 'localhost').map((ip) => ({ type: 7, ip })),
  ];

  const pems = selfsigned.generate([{ name: 'commonName', value: 'phonemic.local' }], {
    days: 800,
    keySize: 2048,
    // 默认是 sha1 / 1024 位，Chrome 会直接拒绝，必须显式改成 sha256 + 2048
    algorithm: 'sha256',
    extensions: [
      { name: 'basicConstraints', cA: true },
      { name: 'keyUsage', digitalSignature: true, keyEncipherment: true, keyCertSign: true },
      { name: 'extKeyUsage', serverAuth: true },
      { name: 'subjectAltName', altNames },
    ],
  });

  fs.writeFileSync(keyPath, pems.private);
  fs.writeFileSync(crtPath, pems.cert);
  fs.writeFileSync(metaPath, JSON.stringify({ names: wanted, created: new Date().toISOString() }, null, 2));

  return { key: pems.private, cert: pems.cert, reused: false };
}

// ---------------------------------------------------------------------------
// audiosink.exe —— 按需编译
// ---------------------------------------------------------------------------
function findCompiler() {
  const candidates = [
    path.join(process.env.WINDIR || 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe'),
    path.join(process.env.WINDIR || 'C:\\Windows', 'Microsoft.NET', 'Framework', 'v4.0.30319', 'csc.exe'),
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return null;
}

function ensureSinkBinary() {
  const exe = path.join(BUILD, 'audiosink.exe');
  const upToDate = fs.existsSync(exe)
    && fs.statSync(exe).mtimeMs >= fs.statSync(SINK_SRC).mtimeMs;
  if (upToDate) return exe;

  const csc = findCompiler();
  if (!csc) die(T('err.noCsc'));

  fs.mkdirSync(BUILD, { recursive: true });
  console.log(T('log.compiling'));
  const r = spawnSync(csc, ['/nologo', '/target:exe', '/optimize+', `/out:${exe}`, SINK_SRC], {
    encoding: 'utf8',
    windowsHide: true,
  });
  if (r.status !== 0 || !fs.existsSync(exe)) {
    die(T('err.compileFailed', { output: (r.stdout || '') + (r.stderr || '') }));
  }
  return exe;
}

// 虚拟声卡的「播放端」名字。注意 Windows 的 WAVEOUTCAPS 只给 31 个字符，
// "CABLE Input (VB-Audio Virtual Cable)" 会被截成 "...Virtual Ca"，
// 所以不要依赖结尾的 "Cable" 字样，优先匹配开头的 CABLE Input。
const CABLE_HINTS = [
  { re: /cable[- ]*[ab]?\s*input/i, label: 'VB-CABLE' },
  { re: /voicemeeter\s*(aux\s*)?input/i, label: 'VoiceMeeter' },
  { re: /virtual\s*audio\s*cable/i, label: 'Virtual Audio Cable' },
  { re: /\bline\s*1\b/i, label: 'Virtual Audio Cable' },
  { re: /voicemod/i, label: 'Voicemod' },
  { re: /vb-?audio/i, label: 'VB-Audio' },
  { re: /虚拟.*(声卡|音频线|麦克风)/, label: '虚拟声卡' },
];

/** 读出 [序号, 设备名] 列表；失败返回 [] */
function readDeviceList(flag) {
  let exe;
  try {
    exe = ensureSinkBinary();
  } catch {
    return [];
  }
  const r = spawnSync(exe, [flag, '--lang', LANG], { encoding: 'utf8', windowsHide: true });
  const text = (r.stdout || '').trim();
  if (!text) return [];
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    const tab = line.indexOf('\t');
    if (tab < 0) continue;
    const index = Number.parseInt(line.slice(0, tab), 10);
    const name = line.slice(tab + 1).trim();
    if (Number.isFinite(index) && name) out.push({ index, name });
  }
  return out;
}

function listDevicesRaw() { return readDeviceList('--list'); }
function listRecordingDevicesRaw() { return readDeviceList('--list-record'); }

/** 读 Windows 当前的默认播放/录音设备（Core Audio，比 waveOut 准确） */
function readDefaultDevices() {
  let exe;
  try {
    exe = ensureSinkBinary();
  } catch {
    return null;
  }
  const r = spawnSync(exe, ['--defaults', '--lang', LANG], { encoding: 'utf8', windowsHide: true });
  const out = { playback: null, playbackComm: null, recording: null, recordingComm: null };
  let found = false;
  for (const line of (r.stdout || '').trim().split(/\r?\n/)) {
    const tab = line.indexOf('\t');
    if (tab < 0) continue;
    const k = line.slice(0, tab);
    const v = line.slice(tab + 1).trim();
    if (k === 'playback') { out.playback = v; found = true; }
    else if (k === 'playback-comm') { out.playbackComm = v; }
    else if (k === 'recording') { out.recording = v; found = true; }
    else if (k === 'recording-comm') { out.recordingComm = v; }
  }
  return found ? out : null;
}

function cableHint(name) {
  for (const h of CABLE_HINTS) if (h.re.test(name)) return h;
  return null;
}

/** 设备标签里只有一个中文标签需要翻译，其余都是产品名 */
function hintLabel(label) {
  return label === '虚拟声卡' ? T('dev.virtualCable') : label;
}

const CABLE_RECORD_HINTS = [
  { re: /cable[- ]*[ab]?\s*output/i, label: 'VB-CABLE' },
  { re: /voicemeeter\s*(aux\s*)?output/i, label: 'VoiceMeeter' },
  { re: /voicemod/i, label: 'Voicemod' },
  { re: /virtual.*(cable|audio)/i, label: '虚拟声卡' },
  { re: /虚拟.*(声卡|音频线|麦克风)/, label: '虚拟声卡' },
];

/** 判断一个「录音设备」名字是不是虚拟声卡的输出端 */
function cableRecordingHint(name) {
  if (!name) return null;
  for (const h of CABLE_RECORD_HINTS) if (h.re.test(name)) return h;
  return null;
}

/**
 * 检查 Windows 的默认设备路由，找出「桌面声音被录进麦克风」和
 * 「游戏根本没在用虚拟声卡」这两类最常见的问题。
 */
function auditAudioRouting() {
  const d = readDefaultDevices();
  const warnings = [];
  const notes = [];
  if (!d) return { defaults: null, warnings, notes };

  const playCable = cableHint(d.playback || '');
  const playCommCable = cableHint(d.playbackComm || '');
  if (playCable || playCommCable) {
    warnings.push({
      code: 'playbackCable',
      playback: playCable ? d.playback : null,
      playbackComm: playCommCable ? d.playbackComm : null,
    });
  }

  const recCable = cableRecordingHint(d.recording || '');
  const recCommCable = cableRecordingHint(d.recordingComm || '');
  const isStereoMix = (n) => /stereo\s*mix|立体声混音|what\s*u\s*hear|wave\s*out\s*mix/i.test(n || '');
  if (isStereoMix(d.recording) || isStereoMix(d.recordingComm)) {
    warnings.push({ code: 'stereoMix' });
  }
  if (recCable && recCommCable) {
    notes.push({ code: 'micBothCable' });
  } else {
    if (!recCable && !isStereoMix(d.recording)) {
      notes.push({ code: 'micNotCable', name: d.recording || null });
    }
    if (!recCommCable && !isStereoMix(d.recordingComm)) {
      notes.push({ code: 'commMicNotCable', name: d.recordingComm || null });
    }
  }

  return { defaults: d, warnings, notes };
}

/** 把结构化的问题描述格式化成当前（或指定）语言的文本 */
function formatWarning(w, lang = LANG) {
  if (!w || typeof w === 'string') return String(w);
  if (w.code === 'playbackCable') {
    const parts = [];
    if (w.playback) parts.push(t(lang, 'audit.defaultPlayback', { name: w.playback }));
    if (w.playbackComm) parts.push(t(lang, 'audit.defaultCommPlayback', { name: w.playbackComm }));
    return t(lang, 'audit.playbackCable', { which: parts.join(t(lang, 'audit.sep')) });
  }
  if (w.code === 'stereoMix') return t(lang, 'audit.stereoMix');
  return String(w.code || w);
}

function formatNote(n, lang = LANG) {
  if (!n || typeof n === 'string') return String(n);
  const unknown = t(lang, 'doctor.unknown');
  if (n.code === 'micBothCable') return t(lang, 'audit.micBothCable');
  if (n.code === 'micNotCable') return t(lang, 'audit.micNotCable', { name: n.name || unknown });
  if (n.code === 'commMicNotCable') return t(lang, 'audit.commMicNotCable', { name: n.name || unknown });
  return String(n.code || n);
}

function describeDevice(d) {
  if (!d || d.index === null || d.index === undefined) return T('dev.default');
  return `[${d.index}] ${d.name}`;
}

/** 在设备列表里按「序号」或「名字片段」找一台设备 */
function resolveDevice(spec, flag = '--device') {
  const devices = listDevicesRaw();
  if (!devices.length) die(T('err.noPlaybackDevices'));

  if (spec == null || spec === '' || spec === 'default') {
    return { index: null, name: T('dev.default') };
  }

  const list = devices.map((d) => `  [${d.index}] ${d.name}`).join('\n');
  const s = String(spec).trim();
  if (/^\d+$/.test(s)) {
    const hit = devices.find((d) => d.index === Number(s));
    if (!hit) die(T('err.deviceIndexMissing', { flag, index: s, list }));
    return hit;
  }

  const low = s.toLowerCase();
  const hits = devices.filter((d) => d.name.toLowerCase().includes(low));
  if (!hits.length) die(T('err.deviceNameMissing', { flag, name: s, list }));
  if (hits.length > 1) {
    console.log(T('devices.cableMatched', {
      flag, name: s, count: hits.length, device: describeDevice(hits[0]),
    }));
  }
  return hits[0];
}

/** 自动找一台虚拟声卡（优先 VB-CABLE 的播放端 CABLE Input） */
function findCableDevice() {
  const devices = listDevicesRaw();
  for (const hint of CABLE_HINTS) {
    const hit = devices.find((d) => hint.re.test(d.name));
    if (hit) return { device: hit, label: hint.label };
  }
  return null;
}

function cableInstallGuide() {
  console.error(T('cable.guide'));
}

function sameDeviceName(a, b) {
  if (!a || !b) return false;
  return a === b || a.startsWith(b) || b.startsWith(a);
}

function listDevices() {
  const play = listDevicesRaw();
  const rec = listRecordingDevicesRaw();
  const d = readDefaultDevices() || {};

  console.log(T('devices.playTitle'));
  if (!play.length) console.log(T('devices.nonePlay'));
  for (const x of play) {
    const marks = [];
    if (sameDeviceName(x.name, d.playback)) marks.push(T('devices.tagDefaultPlay'));
    if (sameDeviceName(x.name, d.playbackComm)) marks.push(T('devices.tagCommPlay'));
    const hint = cableHint(x.name);
    if (hint) marks.push(T('devices.tagGameMic', { label: hintLabel(hint.label) }));
    console.log(`  [${x.index}] ${x.name}${marks.length ? '   ← ' + marks.join(' / ') : ''}`);
  }

  console.log(T('devices.recTitle'));
  if (!rec.length) console.log(T('devices.noneRec'));
  for (const x of rec) {
    const marks = [];
    if (sameDeviceName(x.name, d.recording)) marks.push(T('devices.tagDefaultMic'));
    if (sameDeviceName(x.name, d.recordingComm)) marks.push(T('devices.tagCommMic'));
    const hint = cableRecordingHint(x.name);
    if (hint) marks.push(T('devices.tagPick', { label: hintLabel(hint.label) }));
    console.log(`  [${x.index}] ${x.name}${marks.length ? '   ← ' + marks.join(' / ') : ''}`);
  }

  if (d.playback || d.recording) {
    console.log(T('devices.defaultsTitle'));
    if (d.playback) console.log(T('devices.lblPlay') + d.playback);
    if (d.playbackComm) console.log(T('devices.lblPlayComm') + d.playbackComm);
    if (d.recording) console.log(T('devices.lblMic') + d.recording);
    if (d.recordingComm) console.log(T('devices.lblMicComm') + d.recordingComm);
  }

  console.log(T('devices.usage1'));
  console.log(T('devices.usage2'));
  console.log(T('devices.usage3'));
  console.log(T('devices.usage4'));
}

function printDoctor() {
  const check = auditAudioRouting();
  const cable = findCableDevice();

  console.log(T('doctor.title'));
  if (!check.defaults) {
    console.log(T('doctor.noInfo'));
  } else {
    const d = check.defaults;
    const unknown = T('doctor.unknown');
    console.log(T('doctor.current'));
    console.log(T('devices.lblPlay') + (d.playback || unknown));
    console.log(T('devices.lblPlayComm') + (d.playbackComm || unknown));
    console.log(T('devices.lblMic') + (d.recording || unknown));
    console.log(T('devices.lblMicComm') + (d.recordingComm || unknown));
    console.log('');
  }

  if (cable) {
    console.log(T('doctor.cableOk', {
      index: cable.device.index, name: cable.device.name, label: cable.label,
    }));
    console.log(T('doctor.micPick', { name: cableRecordName(cable.label, cable.device.name) }));
  } else {
    console.log(T('doctor.cableMissing1'));
    console.log(T('doctor.cableMissing2'));
  }

  if (check.warnings.length) {
    console.log(T('doctor.problems'));
    check.warnings.forEach((w, i) => console.log(`  ${i + 1}. ${formatWarning(w)}\n`));
  } else if (check.defaults) {
    console.log(T('doctor.allGood'));
  }

  if (check.notes.length) {
    console.log(T('doctor.tips'));
    check.notes.forEach((n) => console.log('  · ' + formatNote(n) + '\n'));
  }

  console.log(T('doctor.rerun'));
}

// ---------------------------------------------------------------------------
// 重采样（线性插值，够用且不引入依赖）
// ---------------------------------------------------------------------------
class Resampler {
  constructor(inRate, outRate) {
    this.step = inRate / outRate;
    this.pos = 0;
    this.tail = new Float32Array(0);
  }

  get passthrough() { return Math.abs(this.step - 1) < 1e-9; }

  process(x) {
    if (this.passthrough) return x;

    let data;
    if (this.tail.length) {
      data = new Float32Array(this.tail.length + x.length);
      data.set(this.tail, 0);
      data.set(x, this.tail.length);
    } else {
      data = x;
    }

    const n = data.length;
    if (n < 2) { this.tail = data; return new Float32Array(0); }

    const count = Math.floor((n - 1 - this.pos) / this.step) + 1;
    if (count <= 0) { this.tail = data; return new Float32Array(0); }

    const out = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const p = this.pos + i * this.step;
      const i0 = Math.floor(p);
      const frac = p - i0;
      const a = data[i0];
      const b = i0 + 1 < n ? data[i0 + 1] : a;
      out[i] = a + (b - a) * frac;
    }

    const nextPos = this.pos + count * this.step;
    let keep = Math.floor(nextPos);
    if (keep > n - 1) keep = n - 1;
    this.pos = nextPos - keep;
    this.tail = data.slice(keep);
    return out;
  }
}

// ---------------------------------------------------------------------------
// 一个手机客户端：抖动缓冲
// ---------------------------------------------------------------------------
let nextId = 1;

class MicClient {
  constructor(ws, outRate, latencyMs) {
    this.id = 'c' + (nextId++);
    this.ws = ws;
    this.name = T('client.unnamed');
    this.inRate = outRate;
    this.resampler = new Resampler(outRate, outRate);
    this.chunks = [];
    this.count = 0;
    this.started = false;
    this.muted = false;
    this.bytes = 0;
    this.rms = 0;
    this.underruns = 0;
    this.lastGood = 0;
    this.connectedAt = Date.now();
    this.target = Math.round(outRate * latencyMs / 1000);
    // 延迟保险丝：缓冲涨到这个量说明声卡/网络明显跟不上，直接掐回目标值，
    // 宁可偶尔断一下，也不要让延迟越滚越大。
    this.maxBuffered = Math.round(this.target * 3);
  }

  setRate(rate) {
    if (!rate || rate === this.inRate) return;
    this.inRate = rate;
    this.resampler = new Resampler(rate, this.outRate);
    this.chunks = [];
    this.count = 0;
    this.started = false;
  }

  setOutRate(outRate) {
    this.outRate = outRate;
    if (this.inRate !== outRate) this.resampler = new Resampler(this.inRate, outRate);
  }

  /** ws 收到的二进制帧：16 位小端单声道 PCM */
  onPcm(buf) {
    const n = buf.length >> 1;
    if (n === 0) return;
    this.bytes += buf.length;

    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const f = new Float32Array(n);
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const v = view.getInt16(i * 2, true) / 32768;
      f[i] = v;
      sum += v * v;
    }
    this.rms = Math.sqrt(sum / n);

    let samples = this.resampler.passthrough ? f : this.resampler.process(f);
    if (!samples.length) return;

    this.chunks.push(samples);
    this.count += samples.length;

    // 手机端如果发得比实时快（时钟偏差 / 暂停后恢复），丢掉最旧的数据防止延迟越积越大
    if (this.count > this.maxBuffered) {
      while (this.count > this.target && this.chunks.length > 1) {
        const dropped = this.chunks.shift();
        this.count -= dropped.length;
        this.dropped = (this.dropped || 0) + dropped.length;
      }
    }
  }

  /** 取 n 个采样叠加到 out（由播放循环驱动） */
  take(n, out) {
    if (!this.started) {
      if (this.count < this.target) return; // 先把抖动缓冲垫起来
      this.started = true;
    }

    let need = n;
    let off = 0;

    while (need > 0 && this.chunks.length) {
      const c = this.chunks[0];
      if (c.length <= need) {
        if (!this.muted) out.set(c, off);
        off += c.length;
        need -= c.length;
        this.chunks.shift();
      } else {
        if (!this.muted) out.set(c.subarray(0, need), off);
        this.chunks[0] = c.subarray(need);
        off += need;
        need = 0;
      }
    }

    this.count -= (n - need);

    if (need > 0) {
      // 数据不够，本帧补静音；持续断流就重新垫缓冲
      this.underruns++;
      if (this.started && performance.now() - this.lastGood > 1500) this.started = false;
    } else {
      this.lastGood = performance.now();
    }
  }

  info() {
    return {
      id: this.id,
      name: this.name,
      rate: this.inRate,
      rms: Number(this.rms.toFixed(4)),
      bytes: this.bytes,
      muted: this.muted,
      underruns: this.underruns,
      connectedAt: this.connectedAt,
      bufferedMs: Math.round((this.count / (this.outRate || 48000)) * 1000),
    };
  }
}

// ---------------------------------------------------------------------------
// 混音 / 输出引擎
// ---------------------------------------------------------------------------
class Engine {
  constructor(opts) {
    this.outRate = opts.rate;
    this.frameSamples = Math.round(this.outRate * FRAME_MS / 1000);
    this.clients = new Map();
    this.monitors = new Set();       // 用浏览器播放的 WebSocket
    this.sink = null;
    this.mirror = null;              // 第二个声卡（--monitor，让自己听见）
    this.timer = null;
    this.wav = null;
    this.level = 0;
    this.totalFrames = 0;
    if (opts.record) this.wav = new WavWriter(opts.record, this.outRate);
  }

  add(client) {
    client.outRate = this.outRate;
    this.clients.set(client.id, client);
  }

  remove(client) {
    this.clients.delete(client.id);
  }

  setOutRate(rate) {
    this.outRate = rate;
    this.frameSamples = Math.round(rate * FRAME_MS / 1000);
    for (const c of this.clients.values()) c.setOutRate(rate);
  }

  /** 产生一帧混音结果，返回 PCM Buffer */
  renderFrame() {
    const n = this.frameSamples;
    const mix = new Float32Array(n);
    for (const c of this.clients.values()) c.take(n, mix);

    let peak = 0;
    for (let i = 0; i < n; i++) {
      const a = mix[i] < 0 ? -mix[i] : mix[i];
      if (a > peak) peak = a;
    }
    this.level = peak;

    const pcm = Buffer.allocUnsafe(n * 2);
    for (let i = 0; i < n; i++) {
      let v = mix[i];
      if (v > 1) v = 1; else if (v < -1) v = -1;
      pcm.writeInt16LE((v * 32767) | 0, i * 2);
    }

    this.totalFrames++;
    if (this.wav) this.wav.write(pcm);

    if (this.mirror) this.mirror.push(pcm);

    if (this.monitors.size) {
      for (const ws of this.monitors) {
        if (ws.readyState === 1 && ws.bufferedAmount < 1 << 20) ws.send(pcm, { binary: true });
      }
    }
    return pcm;
  }

  /** native 模式由声卡程序的应答驱动；其余模式用定时器驱动 */
  startTimer() {
    if (this.timer) return;
    let next = performance.now();
    const step = FRAME_MS;
    this.timer = setInterval(() => {
      const now = performance.now();
      // 简单追赶：落后太多就一次性补上，避免长期漂移
      let guard = 0;
      while (now >= next && guard++ < 5) {
        this.onFrameNeeded();
        next += step;
      }
      if (next < now - 200) next = now;
    }, step / 2);
  }

  // 定时驱动模式下（--player browser / none），每个节拍产出一帧
  onFrameNeeded() { this.renderFrame(); }

  stop() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  snapshot() {
    return {
      outRate: this.outRate,
      frameMs: FRAME_MS,
      level: Number(this.level.toFixed(4)),
      frames: this.totalFrames,
      clients: [...this.clients.values()].map((c) => c.info()),
      monitors: this.monitors.size,
    };
  }
}

// ---------------------------------------------------------------------------
// WAV 录音
// ---------------------------------------------------------------------------
class WavWriter {
  constructor(file, rate, channels = 1) {
    this.file = path.resolve(file);
    this.rate = rate;
    this.channels = channels;
    this.dataBytes = 0;
    this.writes = 0;
    this.fd = fs.openSync(this.file, 'w');
    fs.writeSync(this.fd, this.header(0));
  }

  header(dataBytes) {
    const b = Buffer.alloc(44);
    const byteRate = this.rate * this.channels * 2;
    b.write('RIFF', 0);
    b.writeUInt32LE(36 + dataBytes, 4);
    b.write('WAVE', 8);
    b.write('fmt ', 12);
    b.writeUInt32LE(16, 16);
    b.writeUInt16LE(1, 20);
    b.writeUInt16LE(this.channels, 22);
    b.writeUInt32LE(this.rate, 24);
    b.writeUInt32LE(byteRate, 28);
    b.writeUInt16LE(this.channels * 2, 32);
    b.writeUInt16LE(16, 34);
    b.write('data', 36);
    b.writeUInt32LE(dataBytes, 40);
    return b;
  }

  write(buf) {
    try {
      fs.writeSync(this.fd, buf);
      this.dataBytes += buf.length;
      // 每隔约 1 秒回填一次文件头：这样即使进程被强杀，录音文件也能直接播放
      if (++this.writes % 33 === 0) {
        fs.writeSync(this.fd, this.header(this.dataBytes), 0, 44, 0);
      }
    } catch { /* 磁盘问题不打断主流程 */ }
  }

  close() {
    try {
      fs.writeSync(this.fd, this.header(this.dataBytes), 0, 44, 0);
      fs.closeSync(this.fd);
    } catch { /* ignore */ }
  }
}

// ---------------------------------------------------------------------------
// 声卡输出后端
// ---------------------------------------------------------------------------
class NativePlayer {
  constructor(engine, device, rate) {
    this.engine = engine;
    this.device = device || { index: null, name: T('dev.default') };
    this.rate = rate;
    this.proc = null;
    this.pending = 0;
    this.blocked = false;
    this.alive = false;
    this.stopping = false;
  }

  get deviceName() { return this.device.name; }

  start() {
    const exe = ensureSinkBinary();
    const devArg = (this.device.index === null || this.device.index === undefined)
      ? 'default'
      : String(this.device.index);
    const args = [
      '--device', devArg,
      '--rate', String(this.rate),
      '--channels', '1',
      '--frame-ms', String(FRAME_MS),
      '--lang', LANG,
    ];
    this.proc = spawn(exe, args, { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    this.alive = true;

    this.proc.stdout.on('data', (chunk) => {
      this.pending += chunk.length;
      this.pump();
    });

    this.proc.stderr.on('data', (d) => {
      const s = String(d).trim();
      if (s) console.error(T('log.audioOutPrefix') + s);
    });

    this.proc.on('error', (e) => {
      this.alive = false;
      console.error('\n' + T('log.audioStartFailed', { message: e.message }) + '\n');
    });

    this.proc.on('exit', (code) => {
      this.alive = false;
      if (!this.stopping && code !== 0 && code !== null) {
        console.error('\n' + T('log.audioExited', { code }) + '\n');
      }
    });

    // 声卡程序会先连续读两帧才能形成双缓冲，这里先垫两帧，
    // 之后完全由它的应答节拍驱动，管道里不会堆积延迟。
    this.pending = 2;
    setTimeout(() => { if (this.alive) this.pump(); }, 0);
  }

  pump() {
    if (!this.alive || this.blocked || !this.proc) return;
    while (this.pending > 0) {
      this.pending--;
      const pcm = this.engine.renderFrame();
      if (!this.proc.stdin.write(pcm)) {
        this.blocked = true;
        this.proc.stdin.once('drain', () => { this.blocked = false; this.pump(); });
        return;
      }
    }
  }

  stop() {
    this.stopping = true;
    this.alive = false;
    try { this.proc && this.proc.stdin.end(); } catch { /* ignore */ }
    try { this.proc && this.proc.kill(); } catch { /* ignore */ }
  }
}

// ---------------------------------------------------------------------------
// 监听输出（--monitor）：把主输出已经渲染好的同一帧再送到另一个设备。
// 它不驱动渲染，完全跟随主声卡；对方跟不上就丢帧，绝不拖慢主输出。
// ---------------------------------------------------------------------------
class MirrorSink {
  constructor(device, rate) {
    this.device = device;
    this.rate = rate;
    this.proc = null;
    this.alive = false;
    this.pending = 2;      // 与 NativePlayer 一样先垫两帧形成双缓冲
    this.queue = [];
    this.blocked = false;
    this.dropped = 0;
    this.written = 0;
  }

  get deviceName() { return this.device.name; }

  start() {
    const exe = ensureSinkBinary();
    const devArg = (this.device.index === null || this.device.index === undefined)
      ? 'default'
      : String(this.device.index);
    this.proc = spawn(exe, [
      '--device', devArg,
      '--rate', String(this.rate),
      '--channels', '1',
      '--frame-ms', String(FRAME_MS),
      '--lang', LANG,
    ], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    this.alive = true;

    this.proc.stdout.on('data', (chunk) => {
      this.pending = Math.min(2, this.pending + chunk.length);
      this.flush();
    });
    this.proc.stderr.on('data', (d) => {
      const s = String(d).trim();
      if (s) console.error(T('log.monitorOutPrefix') + s);
    });
    this.proc.on('error', (e) => {
      this.alive = false;
      console.error('\n' + T('log.monitorStartFailed', { message: e.message }) + '\n');
    });
    this.proc.on('exit', (code) => {
      this.alive = false;
      if (!this.stopping && code !== 0 && code !== null) console.error('\n' + T('log.monitorExited', { code }) + '\n');
    });

    this.flush();
  }

  /** 主引擎每渲染一帧就调用一次；最多排 2 帧，多了直接丢掉 */
  push(pcm) {
    if (!this.alive) return;
    this.queue.push(pcm);
    while (this.queue.length > 2) { this.queue.shift(); this.dropped++; }
    this.flush();
  }

  flush() {
    if (!this.alive || this.blocked || !this.proc) return;
    while (this.pending > 0 && this.queue.length) {
      this.pending--;
      this.written++;
      const pcm = this.queue.shift();
      if (!this.proc.stdin.write(pcm)) {
        this.blocked = true;
        this.proc.stdin.once('drain', () => { this.blocked = false; this.flush(); });
        return;
      }
    }
  }

  stop() {
    this.stopping = true;
    this.alive = false;
    try { this.proc && this.proc.stdin.end(); } catch { /* ignore */ }
    try { this.proc && this.proc.kill(); } catch { /* ignore */ }
  }

  snapshot() {
    return { name: this.device.name, dropped: this.dropped, written: this.written };
  }
}

// ---------------------------------------------------------------------------
// 主程序
// ---------------------------------------------------------------------------
function main() {
  const cfg = parseArgs(process.argv.slice(2));
  LANG = cfg.lang === 'auto' ? detectLang() : cfg.lang;
  if (cfg.help) { console.log(helpText()); return; }
  if (cfg.listDevices) { listDevices(); return; }
  if (cfg.doctor) { printDoctor(); return; }

  if (cfg.token === null) cfg.token = crypto.randomBytes(4).toString('hex');

  const lanIP = pickLanIP(cfg.ip);
  const ips = [...new Set([lanIP, ...listInterfaces().map((x) => x.address)])];

  const engine = new Engine({ rate: cfg.rate, record: cfg.record });

  // ---- 对外地址 ----------------------------------------------------------
  let publicURL = null;
  if (cfg.publicUrl) publicURL = cfg.publicUrl;
  const lanURL = `https://${lanIP}:${cfg.port}/`;
  let mainURL = publicURL || lanURL;
  if (cfg.token) mainURL += (mainURL.includes('?') ? '&' : '?') + 'k=' + cfg.token;

  // ---- 播放后端 ----------------------------------------------------------
  let player = null;
  let mirrorSink = null;
  let playerDesc = T('player.none');
  let outputInfo = { index: null, name: T('dev.none'), cable: false, label: null };
  let monitorInfo = null;

  if (cfg.mic && cfg.player !== 'native') {
    console.log(T('log.micIgnored'));
    cfg.mic = false;
    cfg.cable = null;
  }

  if (cfg.player === 'native') {
    let target = null;
    let cableLabel = null;
    let gameMic = false;

    if (cfg.mic) {
      if (cfg.cable) {
        target = resolveDevice(cfg.cable, '--cable');
        cableLabel = (cableHint(target.name) || {}).label || T('dev.custom');
      } else {
        const found = findCableDevice();
        if (!found) { cableInstallGuide(); process.exit(1); }
        target = found.device;
        cableLabel = found.label;
      }
      gameMic = true;
      playerDesc = T('player.gameMic', { device: describeDevice(target) });
    } else if (cfg.device) {
      target = resolveDevice(cfg.device, '--device');
      const hint = cableHint(target.name);
      if (hint) { gameMic = true; cableLabel = hint.label; }
      playerDesc = T('player.card', { rate: cfg.rate / 1000, device: describeDevice(target) });
    } else {
      playerDesc = T('player.cardDefault', { rate: cfg.rate / 1000 });
    }

    player = new NativePlayer(engine, target, cfg.rate);
    outputInfo = {
      index: target ? target.index : null,
      name: target ? target.name : T('dev.default'),
      cable: gameMic,
      label: cableLabel,
    };
  } else if (cfg.player === 'browser') {
    engine.startTimer();
    playerDesc = T('player.browser');
  } else if (cfg.player === 'none') {
    engine.startTimer();
  } else {
    die(T('err.badPlayer', { value: cfg.player }));
  }

  // ---- 监听输出（可选） ---------------------------------------------------
  if (cfg.monitorDevice) {
    const md = resolveDevice(cfg.monitorDevice, '--monitor');
    const sameAsMain = cfg.player === 'native' && (
      (outputInfo.index === null && md.index === null) ||
      (outputInfo.index !== null && md.index === outputInfo.index)
    );
    if (sameAsMain) {
      console.log(T('log.monitorSame'));
      cfg.monitorDevice = null;
    } else {
      mirrorSink = new MirrorSink(md, cfg.rate);
      engine.mirror = mirrorSink;
      monitorInfo = { index: md.index, name: md.name };
      console.log(T('log.monitorOn', { device: describeDevice(md) }));
    }
  }

  if (player) player.start();
  if (mirrorSink) mirrorSink.start();

  // ---- 路由体检（找出「桌面声音被当成麦克风」的配置问题） -----------------
  let audioCheck = null;
  try {
    audioCheck = auditAudioRouting();
  } catch { /* 体检失败不影响启动 */ }

  if (audioCheck) {
    for (const w of audioCheck.warnings) console.log('\n⚠ ' + formatWarning(w));
    if (outputInfo.cable) {
      for (const n of audioCheck.notes) console.log('· ' + formatNote(n));
    }
  }

  // ---- HTTP / HTTPS ------------------------------------------------------
  const state = {
    cfg,
    engine,
    lanURL,
    mainURL,
    lanIP,
    outputInfo,
    monitorInfo,
    audioCheck,
    audioCheckAt: Date.now(),
    lang: LANG,
  };

  const requestHandler = makeRequestHandler(state);

  const httpServer = http.createServer(requestHandler);
  const wss = new WebSocketServer({ noServer: true });
  attachWebSocket(state, wss);

  httpServer.on('upgrade', (req, socket, head) => upgrade(state, req, socket, head, wss));

  let httpsServer = null;
  if (cfg.host !== 'no-tls') {
    const cert = ensureCertificate(ips);
    httpsServer = https.createServer({ key: cert.key, cert: cert.cert }, requestHandler);
    httpsServer.on('upgrade', (req, socket, head) => upgrade(state, req, socket, head, wss));
  }

  // ---- 端口绑定（被占用就顺延） -----------------------------------------
  // Windows 上 SO_REUSEADDR 会让 listen() 在端口被占用时也不报错，
  // 结果就是「绑上了但收不到请求」，所以必须先主动探测一次。
  const portFree = (port) => new Promise((resolve) => {
    const s = net.connect({ port, host: '127.0.0.1' });
    let done = false;
    const finish = (free) => {
      if (done) return;
      done = true;
      try { s.destroy(); } catch { /* ignore */ }
      resolve(free);
    };
    s.setTimeout(400, () => finish(true));
    s.once('connect', () => finish(false));
    s.once('error', () => finish(true));
  });

  const findPort = async (start) => {
    for (let p = start; p < start + 30; p++) {
      if (await portFree(p)) return p;
    }
    throw new Error(T('err.portsBusy', { start }));
  };

  const bind = (server, port, host) => new Promise((resolve, reject) => {
    const tryListen = (p) => {
      const onError = (err) => {
        if (err.code === 'EADDRINUSE') tryListen(p + 1);
        else reject(err);
      };
      server.once('error', onError);
      server.listen(p, host, () => {
        server.removeListener('error', onError);
        resolve(p);
      });
    };
    tryListen(port);
  });

  (async () => {
    const httpPort = await bind(httpServer, await findPort(cfg.httpPort), cfg.httpHost);
    state.httpPort = httpPort;

    if (httpsServer) {
      const httpsPort = await bind(httpsServer, await findPort(cfg.port), cfg.host);
      state.httpsPort = httpsPort;
      if (httpsPort !== cfg.port) {
        state.lanURL = `https://${lanIP}:${httpsPort}/`;
        state.mainURL = state.lanURL + (cfg.token ? '?k=' + cfg.token : '');
      }
    }

    // ---- 公网隧道 ------------------------------------------------------
    if (cfg.tunnel) {
      const url = await startTunnel(httpPort, cfg.verbose);
      if (url) {
        state.publicURL = url;
        state.mainURL = url + (cfg.token ? '?k=' + cfg.token : '');
      }
    }

    await printBanner(state, playerDesc);

    if (cfg.open && process.platform === 'win32') {
      const dash = `http://127.0.0.1:${httpPort}/dash`;
      spawn('cmd', ['/c', 'start', '', dash], { windowsHide: true, detached: true }).unref?.();
    }
  })().catch((err) => {
    die(T('err.startFailed', { message: err && err.message ? err.message : String(err) }));
  });

  // ---- 退出清理 ----------------------------------------------------------
  const shutdown = (sig) => {
    console.log('\n' + T('log.quitting'));
    engine.stop();
    if (player) player.stop();
    if (mirrorSink) mirrorSink.stop();
    if (engine.wav) engine.wav.close();
    try { httpServer.close(); } catch { /* ignore */ }
    try { httpsServer && httpsServer.close(); } catch { /* ignore */ }
    setTimeout(() => process.exit(0), 150).unref();
    void sig;
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

// ---------------------------------------------------------------------------
// HTTP 路由
// ---------------------------------------------------------------------------
function publicAudioCheck(state, lang = state.lang || LANG) {
  const now = Date.now();
  if (!state.audioCheckAt || now - state.audioCheckAt > 15000) {
    try {
      state.audioCheck = auditAudioRouting();
      state.audioCheckAt = now;
    } catch { /* 保留上一次结果 */ }
  }
  const c = state.audioCheck;
  return c ? {
    defaults: c.defaults,
    warnings: c.warnings.map((w) => formatWarning(w, lang)),
    notes: c.notes.map((n) => formatNote(n, lang)),
  } : null;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};

function makeRequestHandler(state) {
  const { cfg, engine } = state;

  return (req, res) => {
    let url;
    try {
      url = new URL(req.url, 'http://localhost');
    } catch {
      res.writeHead(400).end('bad request');
      return;
    }
    const p = decodeURIComponent(url.pathname);

    // ---- API ----
    if (p === '/api/status') {
      const reqLang = normalizeLang(url.searchParams.get('lang')) || state.lang || LANG;
      return sendJSON(res, {
        ...engine.snapshot(),
        lang: reqLang,
        langs: ['zh', 'en'],
        lanURL: state.lanURL,
        mainURL: state.mainURL,
        publicURL: state.publicURL || null,
        httpsPort: state.httpsPort,
        httpPort: state.httpPort,
        tokenRequired: !!cfg.token,
        player: cfg.player,
        output: {
          index: state.outputInfo.index,
          name: state.outputInfo.name,
          cable: state.outputInfo.cable,
          label: state.outputInfo.label,
        },
        monitor: state.monitorInfo,
        mirror: engine.mirror ? engine.mirror.snapshot() : null,
        gameMic: !!(state.outputInfo && state.outputInfo.cable),
        audioCheck: publicAudioCheck(state, reqLang),
        latencySetting: cfg.latency,
        lanIP: state.lanIP,
        record: cfg.record || null,
        uptime: Math.round(process.uptime()),
      });
    }

    if (p === '/api/open-sound' && req.method === 'POST') {
      if (!isLoopback(req.socket.remoteAddress)) {
        return sendJSON(res, { ok: false, error: T('err.loopbackOnly') });
      }
      spawn('cmd', ['/c', 'start', '', 'mmsys.cpl'], { windowsHide: true, detached: true }).unref?.();
      return sendJSON(res, { ok: true });
    }

    if (p === '/api/qr.svg') {
      const text = url.searchParams.get('text') || state.mainURL;
      return QRCode.toString(text, { type: 'svg', margin: 1, width: 512, errorCorrectionLevel: 'M' })
        .then((svg) => {
          res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' });
          res.end(svg);
        })
        .catch(() => res.writeHead(500).end('qr error'));
    }

    if (p === '/api/qr.txt') {
      const text = url.searchParams.get('text') || state.mainURL;
      return QRCode.toString(text, { type: 'terminal', small: true })
        .then((art) => {
          res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end(art);
        })
        .catch(() => res.writeHead(500).end('qr error'));
    }

    // ---- 页面 ----
    let file;
    if (p === '/') {
      if (cfg.token && url.searchParams.get('k') !== cfg.token) {
        res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(deniedPage(state.lang || LANG));
        return;
      }
      file = 'index.html';
    } else if (p === '/dash' || p === '/dash/') {
      file = 'dash.html';
    } else if (p === '/monitor') {
      file = 'monitor.html';
    } else {
      file = p.replace(/^\/+/, '');
      if (!file || file.includes('..')) {
        res.writeHead(404).end('not found');
        return;
      }
    }

    const full = path.join(PUBLIC, file);
    if (!full.startsWith(PUBLIC)) { res.writeHead(403).end('forbidden'); return; }

    fs.readFile(full, (err, data) => {
      if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404'); return; }
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(full).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(data);
    });
  };
}

function sendJSON(res, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

function deniedPage(lang) {
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <body style="background:#0b0f14;color:#e6edf3;font:16px/1.6 system-ui;padding:40px 24px;text-align:center">
  <h2>${t(lang, 'denied.title')}</h2>
  <p style="color:#8b98a5">${t(lang, 'denied.body')}</p></body>`;
}

// ---------------------------------------------------------------------------
// WebSocket
// ---------------------------------------------------------------------------
function isLoopback(addr) {
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}

function upgrade(state, req, socket, head, wss) {
  let url;
  try { url = new URL(req.url, 'http://localhost'); } catch { socket.destroy(); return; }

  if (url.pathname !== '/ws') { socket.destroy(); return; }

  // 监听页面（浏览器播放）在本机上不需要口令：它只收不听麦，
  // 而控制台本来也只有本机能打开。
  const role = url.searchParams.get('role');
  const exempt = role === 'monitor' && isLoopback(req.socket.remoteAddress);

  if (!exempt && state.cfg.token && url.searchParams.get('k') !== state.cfg.token) {
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
}

function attachWebSocket(state, wss) {
  const { engine, cfg } = state;

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, 'http://localhost');
    const role = url.searchParams.get('role');

    if (role === 'monitor') {
      engine.monitors.add(ws);
      ws.on('close', () => engine.monitors.delete(ws));
      ws.on('error', () => engine.monitors.delete(ws));
      safeSend(ws, JSON.stringify({ t: 'ready', outRate: engine.outRate, frameMs: FRAME_MS }));
      console.log(T('log.monitorClient'));
      return;
    }

    const client = new MicClient(ws, engine.outRate, cfg.latency);
    engine.add(client);

    const ip = (req.socket.remoteAddress || '').replace(/^::ffff:/, '');
    console.log(T('log.phoneConnected', { id: client.id, ip, count: engine.clients.size }));

    safeSend(ws, JSON.stringify({ t: 'ready', outRate: engine.outRate, frameMs: FRAME_MS, latency: cfg.latency }));

    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        client.onPcm(Buffer.isBuffer(data) ? data : Buffer.from(data));
        return;
      }
      let msg;
      try { msg = JSON.parse(data.toString()); } catch { return; }
      switch (msg.t) {
        case 'hello':
          if (msg.name) client.name = String(msg.name).slice(0, 40);
          if (msg.rate) client.setRate(Number(msg.rate) || engine.outRate);
          break;
        case 'mute':
          client.muted = !!msg.value;
          break;
        case 'ping':
          safeSend(ws, JSON.stringify({ t: 'pong', ts: msg.ts }));
          break;
        default:
          break;
      }
    });

    const drop = () => {
      if (engine.clients.has(client.id)) {
        engine.remove(client);
        console.log(T('log.phoneLeft', { id: client.id, count: engine.clients.size }));
      }
    };
    ws.on('close', drop);
    ws.on('error', drop);
  });
}

function safeSend(ws, text) {
  if (ws.readyState === 1) {
    try { ws.send(text); } catch { /* ignore */ }
  }
}

// ---------------------------------------------------------------------------
// cloudflared 隧道
// ---------------------------------------------------------------------------
function startTunnel(localPort, verbose) {
  return new Promise((resolve) => {
    console.log(T('log.tunnelStarting'));
    let child;
    try {
      child = spawn('cloudflared', ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${localPort}`], {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
    } catch {
      return resolve(null);
    }

    let done = false;
    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        console.error(T('log.tunnelTimeout'));
        resolve(null);
      }
    }, 20000);

    const scan = (buf) => {
      const text = String(buf);
      const m = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (m && !done) {
        done = true;
        clearTimeout(timer);
        resolve(m[0]);
      }
    };

    child.stdout.on('data', scan);
    child.stderr.on('data', (d) => {
      scan(d);
      if (verbose) process.stderr.write('[cloudflared] ' + d);
    });
    child.on('error', () => {
      if (!done) {
        done = true;
        clearTimeout(timer);
        console.error(T('log.tunnelMissing1'));
        console.error(T('log.tunnelMissing2'));
        console.error(T('log.tunnelMissing3'));
        resolve(null);
      }
    });
    child.on('exit', () => { if (!done) { done = true; clearTimeout(timer); resolve(null); } });
  });
}

// ---------------------------------------------------------------------------
// 终端二维码（自己画，避免 ANSI 转义把日志弄花）
// ---------------------------------------------------------------------------
function terminalQR(text) {
  try {
    const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
    const size = qr.modules.size;
    const data = qr.modules.data;
    const pad = 2;
    const blank = '  '.repeat(size + pad * 2);
    const lines = [];
    for (let i = 0; i < pad; i++) lines.push(blank);
    for (let y = 0; y < size; y++) {
      let row = '  '.repeat(pad);
      for (let x = 0; x < size; x++) row += data[y * size + x] ? '██' : '  ';
      row += '  '.repeat(pad);
      lines.push(row);
    }
    for (let i = 0; i < pad; i++) lines.push(blank);
    return lines.join('\n');
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// 启动横幅
// ---------------------------------------------------------------------------
function cableRecordName(label, deviceName) {
  const name = deviceName || '';
  const swap = () => name.replace(/input/i, 'Output');

  // VB-CABLE 的 A/B 变体：录音端叫 CABLE-A Output，直接替换 Input 最准
  if (label === 'VB-CABLE' && /cable[- ]*[ab]\s*input/i.test(name)) return swap();

  switch (label) {
    case 'VB-CABLE': return 'CABLE Output (VB-Audio Virtual Cable)';
    case 'VoiceMeeter': return 'VoiceMeeter Output (VB-Audio VoiceMeeter VAIO)';
    case 'Virtual Audio Cable': return 'Line 1 (Virtual Audio Cable)';
    case 'Voicemod': return 'Voicemod Virtual Audio Device (WDM)';
    default: break;
  }
  // 其他虚拟声卡：Windows 里播放端叫 xxx Input，录音端通常就是同名把 Input 换成 Output
  if (/input/i.test(name)) return swap();
  return T('cable.recordFallback');
}

async function printBanner(state, playerDesc) {
  const { cfg, mainURL, outputInfo, monitorInfo } = state;
  const gameMic = !!(outputInfo && outputInfo.cable);

  const art = terminalQR(mainURL);

  const line = '─'.repeat(58);
  const out = [];
  out.push('');
  out.push('  ' + line);
  out.push(T('banner.title') + (gameMic ? T('banner.gameMode') : ''));
  out.push('  ' + line);
  out.push('');
  out.push(T('banner.scan'));
  out.push('   ' + mainURL);
  out.push('');
  if (art) out.push(art.replace(/^/gm, '   ').replace(/\s+$/gm, ''));
  out.push(T('banner.dash', { port: state.httpPort }));
  out.push(T('banner.output', { desc: playerDesc }));
  if (monitorInfo) out.push(T('banner.monitor', { device: describeDevice(monitorInfo) }));
  if (gameMic) {
    const routeBroken = !!(state.audioCheck && state.audioCheck.warnings.length);
    out.push('');
    out.push(routeBroken ? T('banner.gameBroken') : T('banner.gameReady'));
    out.push('      ' + cableRecordName(outputInfo.label, outputInfo.name));
    out.push(T('banner.gameAfter'));
    out.push(T('banner.gameDefault'));
  }
  if (monitorInfo) {
    out.push('');
    out.push(T('banner.monitorWarn'));
  }
  if (cfg.player === 'native' && !gameMic) {
    out.push('');
    out.push(T('banner.speakerWarn1'));
    out.push(T('banner.speakerWarn2'));
  }
  out.push('   ' + line);
  out.push(T('banner.cert1'));
  out.push(T('banner.cert2'));
  out.push('');
  out.push(T('banner.fw1'));
  out.push(T('banner.fw2'));
  if (cfg.httpHost !== '127.0.0.1') {
    out.push('');
    out.push(T('banner.http1'));
    out.push(T('banner.http2'));
  }
  out.push('   ' + line);
  out.push('');
  console.log(out.join('\n'));
}

main();
