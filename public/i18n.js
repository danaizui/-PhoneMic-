/* ---------------------------------------------------------------------------
 * PhoneMic —— 网页界面的中英双语（/i18n.js）
 *
 *   每个页面在 <head> 里引入本文件，然后：
 *     PMI18N.t('dash.title')             取当前语言的文案
 *     <span data-i18n="dash.title">       静态文字，载入时自动替换
 *     <span data-i18n-html="...">        允许 <b>/<code> 的文案
 *   语言选择存在 localStorage，切换后刷新页面。
 * ------------------------------------------------------------------------- */
(function (global) {
  'use strict';

  const STORE_KEY = 'phonemic.lang';
  const SUPPORTED = ['zh', 'en'];

  const DICT = {
    zh: {
      'lang.title': '切换语言 / Switch language',
      'common.unknown': '未知',

      // ---- 控制台 ---------------------------------------------------------
      'dash.title': 'PhoneMic 控制台',
      'dash.sub': '用手机当电脑的临时麦克风',
      'dash.routeTitle': '⚠ 音频路由有问题',
      'dash.openSound': '打开声音控制面板',
      'dash.qrTitle': '手机扫码进入',
      'dash.qrAlt': '二维码',
      'dash.copy': '复制链接',
      'dash.copied': '已复制 ✓',
      'dash.copyManual': '请手动选中上面的链接复制',
      'dash.statusTitle': '运行状态',
      'dash.gameReady': '游戏麦克风已就绪',
      'dash.gameBody': '在游戏 / 开黑软件里把「麦克风」设为 <code>{device}</code>，手机说话其他玩家就能听见。',
      'dash.gameWarn': '不要选成扬声器或 Stereo Mix。',
      'dash.kPlayer': '音频输出',
      'dash.kDevice': '输出设备',
      'dash.kMonitor': '监听输出',
      'dash.kRate': '输出采样率',
      'dash.kLatency': '抖动缓冲',
      'dash.kUptime': '已运行',
      'dash.kRecord': '录音',
      'dash.kLevel': '总输出电平',
      'dash.clientsTitle': '已连接的手机',
      'dash.clientsEmpty': '还没有手机连上来，用上面的二维码扫一下',
      'dash.muted': '已静音',
      'dash.buffer': '缓冲 {ms} ms · {mb} MB',
      'dash.dropouts': '断续 {n} 次',
      'dash.smooth': '流畅',
      'dash.tip': '提示',
      'dash.foot': '手机连上后在页面里点一下话筒按钮才会开始收音；首次连接需要接受一次自签名证书警告。'
        + '想让它直接进游戏语音 / 会议软件，用 <b>start.bat --mic</b> 启动（需要先装 VB-Audio Virtual Cable），'
        + '然后在游戏里把麦克风选成 CABLE Output。',
      'dash.playerGame': '游戏麦克风（虚拟声卡）',
      'dash.playerNative': '电脑声卡',
      'dash.playerBrowser': '浏览器播放',
      'dash.playerNone': '不播放（只录音/监听）',
      'dash.monitorHeadphones': '{name}（请戴耳机）',
      'dash.off': '未开启',
      'dash.micRoute': 'Windows 默认麦克风：{mic}；通信麦克风：{comm}',
      'dash.micRouteShort': 'Windows 默认麦克风：{mic}',
      'dash.micRouteOk': '（✓ 游戏会自动用它）',
      'dash.micRouteBad': '（不是 CABLE Output，游戏里请手动选）',
      'dash.micFallback': '虚拟声卡的「录音 / Output」端',
      'dash.offline': '连接不上服务',
      'dash.upH': '{h} 小时 {m} 分',
      'dash.upM': '{m} 分 {s} 秒',
      'dash.upS': '{s} 秒',

      // ---- 手机页 ---------------------------------------------------------
      'index.title': '手机麦克风',
      'index.brandText': '手机麦克风',
      'index.statusIdle': '未连接',
      'index.statusConnecting': '重连中…',
      'index.statusPreparing': '准备中…',
      'index.statusLinking': '连接电脑…',
      'index.statusLive': '已连接',
      'index.statusMuted': '已静音',
      'index.statusError': '失败',
      'index.statusStopped': '已停止',
      'index.hintStart': '点击话筒开始，手机就会变成电脑的麦克风',
      'index.hintLive': '正在收音，声音从<b>电脑</b>播放出来',
      'index.hintMuted': '已静音，电脑那边是安静的',
      'index.hintRetry': '点击话筒重试',
      'index.hintRestart': '点击话筒重新开始',
      'index.hintHttps': '需要 https 才能使用麦克风',
      'index.rate': '采样率',
      'index.latency': '延迟',
      'index.sent': '已发送',
      'index.settings': '声音设置',
      'index.gain': '麦克风音量',
      'index.gainHint': '太小就调大，破音就调小',
      'index.ec': '回声消除',
      'index.ecHint': '手机喇叭贴近电脑音箱时打开',
      'index.ns': '噪声抑制',
      'index.nsHint': '空调、风扇声比较明显时打开',
      'index.agc': '自动增益',
      'index.agcHint': '说话声忽大忽小时打开',
      'index.mute': '静音',
      'index.muteHint': '暂停收音但保持连接',
      'index.startAria': '开始',
      'index.bannerInsecure': '<b>当前页面不是安全连接，浏览器不允许使用麦克风。</b><br>'
        + '请用电脑上显示的 <code>https://</code> 开头的地址（或扫码）重新打开。'
        + '若你是手动输入的 http 地址，改一下即可。',
      'index.bannerUnsupported': '这个浏览器不支持网页录音，请换用 Chrome / Safari / Edge 的较新版本。',
      'index.bannerPerm': '麦克风权限被拒绝了。请在浏览器地址栏左边的锁/盾牌图标里，把「麦克风」改成允许，然后刷新页面。',
      'index.bannerNoMic': '这台设备上找不到麦克风。',
      'index.bannerBusy': '麦克风被别的 App 占用了，先关掉正在录音的软件再试。',
      'index.bannerNotSecure': '当前页面不允许使用麦克风，请确认是用 https:// 打开的。',
      'index.bannerSettings': '切换声音设置时出错：{message}',
      'index.errTimeout': '连接超时',
      'index.errConnect': '无法连接电脑',
      'index.devicePhone': '手机',

      // ---- 监听页 ---------------------------------------------------------
      'monitor.title': 'PhoneMic · 浏览器监听',
      'monitor.h1': '🔊 浏览器监听',
      'monitor.p': '用电脑的浏览器播放手机传过来的声音（不想让服务占用声卡时用这个）',
      'monitor.start': '开始播放',
      'monitor.stop': '停止播放',
      'monitor.stopped': '已停止',
      'monitor.playing': '播放中',
      'monitor.note': '提示：Windows 上可以用 <code>--device</code> 直接输出到声卡，不需要这个页面。<br>'
        + '在这里播放同样可以选择输出设备（Chrome 支持），包括虚拟声卡 <code>VB-Audio</code>。',
      'monitor.output': '音频输出',
      'monitor.resample': '浏览器实际采样率是 {actual}，服务端是 {expected}，会有轻微重采样',
    },

    en: {
      'lang.title': 'Switch language / 切换语言',
      'common.unknown': 'unknown',

      // ---- Dashboard ------------------------------------------------------
      'dash.title': 'PhoneMic Dashboard',
      'dash.sub': "Use your phone as your computer's microphone",
      'dash.routeTitle': '⚠ Audio routing problem',
      'dash.openSound': 'Open sound settings',
      'dash.qrTitle': 'Scan with your phone',
      'dash.qrAlt': 'QR code',
      'dash.copy': 'Copy link',
      'dash.copied': 'Copied ✓',
      'dash.copyManual': 'Select the link above and copy it manually',
      'dash.statusTitle': 'Status',
      'dash.gameReady': 'Game microphone ready',
      'dash.gameBody': 'Set the microphone in your game / voice app to <code>{device}</code> — other players will hear you through your phone.',
      'dash.gameWarn': 'Do not pick a speaker or Stereo Mix.',
      'dash.kPlayer': 'Audio output',
      'dash.kDevice': 'Output device',
      'dash.kMonitor': 'Monitor output',
      'dash.kRate': 'Sample rate',
      'dash.kLatency': 'Jitter buffer',
      'dash.kUptime': 'Uptime',
      'dash.kRecord': 'Recording',
      'dash.kLevel': 'Output level',
      'dash.clientsTitle': 'Connected phones',
      'dash.clientsEmpty': 'No phone connected yet — scan the QR code above',
      'dash.muted': 'Muted',
      'dash.buffer': 'buffer {ms} ms · {mb} MB',
      'dash.dropouts': '{n} dropouts',
      'dash.smooth': 'Smooth',
      'dash.tip': 'Tip',
      'dash.foot': 'After connecting, tap the microphone button on the phone page to start streaming. '
        + 'The first connection shows a self-signed certificate warning — accept it once. '
        + 'To feed game voice chat / meeting apps, start with <b>start.bat --mic</b> '
        + '(install VB-Audio Virtual Cable first), then pick CABLE Output as the microphone in-game.',
      'dash.playerGame': 'Game microphone (virtual cable)',
      'dash.playerNative': 'Sound card',
      'dash.playerBrowser': 'Browser playback',
      'dash.playerNone': 'No playback (record/monitor only)',
      'dash.monitorHeadphones': '{name} (use headphones)',
      'dash.off': 'Off',
      'dash.micRoute': 'Windows default mic: {mic}; communications mic: {comm}',
      'dash.micRouteShort': 'Windows default mic: {mic}',
      'dash.micRouteOk': ' (✓ games will pick it up automatically)',
      'dash.micRouteBad': ' (not CABLE Output — pick it manually in-game)',
      'dash.micFallback': "the virtual cable's recording / Output side",
      'dash.offline': 'Cannot reach the server',
      'dash.upH': '{h} h {m} min',
      'dash.upM': '{m} min {s} s',
      'dash.upS': '{s} s',

      // ---- Phone page -----------------------------------------------------
      'index.title': 'PhoneMic',
      'index.brandText': 'PhoneMic',
      'index.statusIdle': 'Not connected',
      'index.statusConnecting': 'Reconnecting…',
      'index.statusPreparing': 'Preparing…',
      'index.statusLinking': 'Connecting to PC…',
      'index.statusLive': 'Connected',
      'index.statusMuted': 'Muted',
      'index.statusError': 'Failed',
      'index.statusStopped': 'Stopped',
      'index.hintStart': "Tap the mic to turn this phone into your computer's microphone",
      'index.hintLive': 'Live — your voice plays from the <b>computer</b>',
      'index.hintMuted': 'Muted — the computer is silent',
      'index.hintRetry': 'Tap the mic to try again',
      'index.hintRestart': 'Tap the mic to start again',
      'index.hintHttps': 'HTTPS is required to use the microphone',
      'index.rate': 'Sample rate',
      'index.latency': 'Latency',
      'index.sent': 'Sent',
      'index.settings': 'Audio settings',
      'index.gain': 'Mic volume',
      'index.gainHint': "Raise it if you're too quiet, lower it if it clips",
      'index.ec': 'Echo cancellation',
      'index.ecHint': 'Turn on when the phone is near the PC speakers',
      'index.ns': 'Noise suppression',
      'index.nsHint': 'Turn on for air conditioners or fans',
      'index.agc': 'Auto gain',
      'index.agcHint': 'Turn on if your voice level keeps changing',
      'index.mute': 'Mute',
      'index.muteHint': 'Stop sending audio but keep the connection',
      'index.startAria': 'Start',
      'index.bannerInsecure': '<b>This page is not a secure context, so the browser blocks the microphone.</b><br>'
        + 'Open the <code>https://</code> address shown on the computer (or scan the QR code). '
        + 'If you typed an http:// address manually, use https:// instead.',
      'index.bannerUnsupported': 'This browser cannot record audio. Please use a recent Chrome / Safari / Edge.',
      'index.bannerPerm': 'Microphone permission was denied. Open the lock/shield icon in the address bar, allow the microphone, then reload.',
      'index.bannerNoMic': 'No microphone was found on this device.',
      'index.bannerBusy': 'Another app is using the microphone. Close the app that is recording and try again.',
      'index.bannerNotSecure': 'This page is not allowed to use the microphone. Make sure you opened it over https://.',
      'index.bannerSettings': 'Failed to apply the audio settings: {message}',
      'index.errTimeout': 'Connection timed out',
      'index.errConnect': 'Cannot reach the computer',
      'index.devicePhone': 'Phone',

      // ---- Monitor page ---------------------------------------------------
      'monitor.title': 'PhoneMic · Browser monitor',
      'monitor.h1': '🔊 Browser monitor',
      'monitor.p': "Play the phone audio in your computer's browser (useful when the server should not touch the sound card)",
      'monitor.start': 'Start playback',
      'monitor.stop': 'Stop playback',
      'monitor.stopped': 'Stopped',
      'monitor.playing': 'Playing',
      'monitor.note': 'Tip: on Windows you can use <code>--device</code> to output straight to a sound card instead of this page.<br>'
        + 'Playback here can also choose an output device (Chrome), including the virtual cable <code>VB-Audio</code>.',
      'monitor.output': 'Audio output',
      'monitor.resample': 'Browser sample rate is {actual}, server is {expected} — slight resampling will occur',
    },
  };

  function normalize(value) {
    const s = String(value || '').trim().toLowerCase();
    if (s.startsWith('zh')) return 'zh';
    if (s.startsWith('en')) return 'en';
    return null;
  }

  function fromQuery() {
    try {
      return normalize(new URLSearchParams(location.search).get('lang'));
    } catch { return null; }
  }

  function fromStorage() {
    try { return normalize(localStorage.getItem(STORE_KEY)); } catch { return null; }
  }

  function fromBrowser() {
    const list = navigator.languages && navigator.languages.length
      ? navigator.languages
      : [navigator.language || ''];
    for (const item of list) {
      const hit = normalize(item);
      if (hit) return hit;
    }
    return null;
  }

  let current = fromQuery() || fromStorage() || fromBrowser() || 'en';

  function interpolate(text, vars) {
    if (!vars) return text;
    return text.replace(/\{(\w+)\}/g, (m, k) => (
      Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : m
    ));
  }

  function t(key, vars) {
    const table = DICT[current] || DICT.en;
    let text = table[key];
    if (text === undefined) text = DICT.zh[key];
    if (text === undefined) return key;
    return interpolate(text, vars);
  }

  function setLang(lang) {
    const next = normalize(lang);
    if (!next || next === current) return false;
    try { localStorage.setItem(STORE_KEY, next); } catch { /* 隐私模式 */ }
    current = next;
    apply(document);
    const titleKey = document.documentElement.getAttribute('data-title');
    if (titleKey) document.title = t(titleKey);
    updateToggles();
    document.dispatchEvent(new CustomEvent('pmi18n', { detail: { lang: current } }));
    return true;
  }

  function toggle() {
    const next = current === 'zh' ? 'en' : 'zh';
    // 带 ?lang= 打开时，切换后地址栏保留旧参数会覆盖选择，所以直接去掉它
    try {
      localStorage.setItem(STORE_KEY, next);
      const url = new URL(location.href);
      if (url.searchParams.has('lang')) {
        url.searchParams.delete('lang');
        location.replace(url.toString());
        return;
      }
    } catch { /* 忽略 */ }
    current = next;
    location.reload();
  }

  function apply(root) {
    const scope = root || document;
    document.documentElement.lang = current === 'zh' ? 'zh-CN' : 'en';

    scope.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    scope.querySelectorAll('[data-i18n-html]').forEach((el) => {
      el.innerHTML = t(el.getAttribute('data-i18n-html'));
    });
    scope.querySelectorAll('[data-i18n-aria]').forEach((el) => {
      el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria')));
    });
    scope.querySelectorAll('[data-i18n-title]').forEach((el) => {
      el.setAttribute('title', t(el.getAttribute('data-i18n-title')));
    });
    updateToggles();
  }

  function updateToggles() {
    document.querySelectorAll('[data-lang-toggle]').forEach((el) => {
      el.textContent = current === 'zh' ? 'EN' : '中文';
      el.setAttribute('title', t('lang.title'));
      el.setAttribute('aria-label', t('lang.title'));
    });
  }

  function mount() {
    apply(document);
    const titleKey = document.documentElement.getAttribute('data-title');
    if (titleKey) document.title = t(titleKey);
    document.querySelectorAll('[data-lang-toggle]').forEach((el) => {
      if (el.dataset.bound) return;
      el.dataset.bound = '1';
      el.addEventListener('click', toggle);
    });
  }

  const api = {
    t,
    get lang() { return current; },
    supported: SUPPORTED.slice(),
    setLang,
    toggle,
    apply,
    mount,
  };

  global.PMI18N = api;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})(window);
