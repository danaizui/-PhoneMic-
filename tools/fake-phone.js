#!/usr/bin/env node
'use strict';
/**
 * 假手机 —— 不需要真手机也能验证整条链路对不对。
 *
 *   node tools/fake-phone.js                       # 连本机默认端口，播 5 秒上升音阶
 *   node tools/fake-phone.js --port 8081 --token xxxx --seconds 10
 *   node tools/fake-phone.js --tone 440            # 固定音高
 *   node tools/fake-phone.js --lang en             # 英文输出
 *
 * 如果电脑上响起了「嘀——」的声音，说明采集、传输、缓冲、声卡输出都通了。
 */

const WebSocket = require('ws');
const { t, detectLang, normalizeLang } = require('../lib/i18n');

const argv = process.argv.slice(2);
const opt = { host: '127.0.0.1', port: 8081, token: '', seconds: 5, tone: 0, rate: 48000, lang: 'auto' };
let help = false;

for (let i = 0; i < argv.length; i++) {
  const k = argv[i];
  const v = argv[i + 1];
  if (k === '--host') { opt.host = v; i++; }
  else if (k === '--port') { opt.port = Number(v); i++; }
  else if (k === '--token') { opt.token = v; i++; }
  else if (k === '--seconds') { opt.seconds = Number(v); i++; }
  else if (k === '--tone') { opt.tone = Number(v); i++; }
  else if (k === '--rate') { opt.rate = Number(v); i++; }
  else if (k === '--lang') { opt.lang = v; i++; }
  else if (k === '-h' || k === '--help') { help = true; }
}

const autoLang = detectLang();
const lang = (!opt.lang || opt.lang === 'auto') ? autoLang : normalizeLang(opt.lang);
if (!lang) {
  console.error(t(autoLang, 'fake.badLang', { value: opt.lang }));
  process.exit(2);
}
const F = (key, vars) => t(lang, key, vars);
if (help) {
  console.log(F('fake.usage'));
  process.exit(0);
}

const FRAME_MS = 20;
const frameSamples = Math.round(opt.rate * FRAME_MS / 1000);
const q = new URLSearchParams();
if (opt.token) q.set('k', opt.token);
const url = `ws://${opt.host}:${opt.port}/ws${q.toString() ? '?' + q : ''}`;

console.log(F('fake.connecting', { url }));
const ws = new WebSocket(url);

let phase = 0;
let sentFrames = 0;
let running = false;
let startAt = 0;

ws.on('open', () => {
  console.log(F('fake.connected'));
  ws.send(JSON.stringify({ t: 'hello', rate: opt.rate, name: F('fake.clientName') }));
  running = true;
  startAt = Date.now();

  // Windows 上 setTimeout 的精度只有 ~15.6ms，直接用 setInterval(20)
  // 会被拖成 ~31ms 一帧。所以这里按「绝对时间」追赶，保证 50 帧/秒。
  let next = performance.now();
  const tick = () => {
    if (!running) return;
    const now = performance.now();
    while (next <= now && running) {
      sendFrame();
      next += FRAME_MS;
    }
    if (running) setTimeout(tick, 4);
  };
  setTimeout(tick, 4);
});

function sendFrame() {
  if (ws.readyState !== 1) return;

  const pcm = Buffer.allocUnsafe(frameSamples * 2);
  // 没有 --tone 就每 1.5 秒升一个音，方便听出连续性
  const step = Math.floor(((Date.now() - startAt) / 1500)) % 5;
  const freq = opt.tone || [440, 523, 659, 784, 880][step];

  for (let i = 0; i < frameSamples; i++) {
    const t = (phase + i) / opt.rate;
    const v = Math.sin(2 * Math.PI * freq * t) * 0.35;
    pcm.writeInt16LE(Math.round(v * 32767), i * 2);
  }
  phase += frameSamples;

  ws.send(pcm);
  sentFrames++;

  if (Date.now() - startAt >= opt.seconds * 1000) {
    running = false;
    console.log(F('fake.done', { frames: sentFrames, seconds: opt.seconds, expected: opt.seconds * 50 }));
    setTimeout(() => { ws.close(); process.exit(0); }, 400);
  }
}

ws.on('close', () => { if (running) console.log(F('fake.closed')); });
ws.on('error', (e) => {
  console.error(F('fake.failed', { message: e.message }));
  console.error(F('fake.hint'));
  process.exit(1);
});
