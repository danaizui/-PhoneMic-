'use strict';
/**
 * PhoneMic —— 控制台文本的中英双语表 / bilingual console strings.
 *
 *   const { t, detectLang, normalizeLang } = require('./lib/i18n');
 *   t('en'|'zh', 'key', { name: 'value' })
 *
 * 只放「用户看得见」的文本；代码注释保持中文，方便后续维护。
 */

const MESSAGES = {
  zh: {
    // ---- 命令行 -----------------------------------------------------------
    'err.needsValue': '参数 {arg} 需要一个值（用 --help 查看用法）',
    'err.unknownArg': '未知参数：{arg}（用 --help 查看用法）',
    'err.notNumber': '参数 {name} 需要是一个数字，收到「{value}」',
    'err.badLang': '--lang 只能是 zh / en / auto，收到「{value}」',
    'err.noCsc': '找不到 .NET 编译器 csc.exe，无法编译音频输出程序。\n'
      + '  可以改用浏览器播放：node server.js --player browser',
    'err.compileFailed': '编译音频输出程序失败：\n{output}',
    'err.noPlaybackDevices': '没有找到任何音频播放设备。',
    'err.deviceIndexMissing': '{flag} 指定的序号 {index} 不存在。可用设备：\n{list}',
    'err.deviceNameMissing': '{flag} 找不到名字包含「{name}」的播放设备。可用设备：\n{list}',
    'err.badPlayer': '--player 只能是 native / browser / none，收到「{value}」',
    'err.badIp': '--ip 指定的地址 {ip} 不在本机网卡上。可用：{list}',
    'err.startFailed': '启动失败：{message}',
    'err.loopbackOnly': '只允许在本机操作',
    'err.portsBusy': '从 {start} 开始的 30 个端口都被占用了',

    // ---- 帮助 -------------------------------------------------------------
    'help.text': `
PhoneMic —— 把手机当作电脑的临时麦克风

用法：node server.js [选项]

  --port <n>           局域网 HTTPS 端口（默认 8443）
  --http-port <n>      本机 HTTP 端口（默认 8080，给隧道/本机测试用）
  --ip <地址>          指定用于二维码的局域网 IP（多网卡时有用）
  --mic                游戏麦克风模式：自动把声音送进虚拟声卡
  --cable <名字|序号>  手动指定虚拟声卡（隐含 --mic），见 --list-devices
  --monitor [名字|序号] 同时从另一个设备播放，让自己也能听见（默认设备）
  --device <名字|序号> 电脑上播放声音的设备（不用虚拟声卡时）
  --rate <n>           声卡输出采样率（默认 48000）
  --latency <ms>       抖动缓冲毫秒数，网络差就调大（默认 120）
  --player <模式>      native=电脑声卡（默认） / browser=用浏览器播放 / none
  --tunnel             自动用 cloudflared 生成公网 HTTPS 链接
  --public-url <url>   手动指定对外访问地址（自己搭反向代理时用）
  --record <文件.wav>  同时把收到的声音录下来
  --token <字符串>     自定义访问口令；--no-token 关闭口令
  --lang <zh|en|auto>  界面语言（默认 auto：跟随系统）
  --no-open            启动后不自动打开控制台网页
  --list-devices       列出电脑的播放 / 录音设备后退出
  --doctor             检查默认设备路由（桌面声音会不会跑进麦克风）
  -h, --help           显示本帮助

游戏麦克风模式需要先装免费的 VB-Audio Virtual Cable：
  https://vb-audio.com/Cable/     （装完请重启一次电脑）
然后：node server.js --mic
游戏/会议软件里的「麦克风」选 CABLE Output (VB-Audio Virtual Cable)。
`,

    // ---- 编译 / 启动日志 ---------------------------------------------------
    'log.compiling': '· 正在编译音频输出程序（仅首次需要几秒钟）…',
    'log.micIgnored': '· --mic 只在 --player native 下有效，本次忽略。',
    'log.monitorSame': '· 监听输出和主输出是同一台设备，已忽略 --monitor（否则声音会叠一倍）。',
    'log.monitorOn': '· 监听输出：{device}（自己也能听见）',
    'log.quitting': '正在退出…',
    'log.monitorClient': '· 浏览器监听起来了一个',
    'log.phoneConnected': '· 手机接入 ({id}) 来自 {ip}，共 {count} 路',
    'log.phoneLeft': '· 手机断开 ({id})，还剩 {count} 路',
    'log.tunnelStarting': '· 正在启动 cloudflared 公网隧道…',
    'log.tunnelTimeout': '✖ cloudflared 20 秒内没能建立隧道，先只用局域网地址。',
    'log.tunnelMissing1': '✖ 没找到 cloudflared 命令。',
    'log.tunnelMissing2': '  安装后再试：winget install --id Cloudflare.cloudflared',
    'log.tunnelMissing3': '  或者手动把一个 HTTPS 地址映射进来，用 --public-url 传入。',

    // ---- 设备描述 ---------------------------------------------------------
    'dev.default': '系统默认设备',
    'dev.custom': '自定义设备',
    'dev.none': '无',
    'player.none': '无（只听不看）',
    'player.gameMic': '游戏麦克风 → {device}',
    'player.card': '电脑声卡 {rate} kHz → {device}',
    'player.cardDefault': '电脑声卡 {rate} kHz（系统默认设备）',
    'player.browser': '浏览器（打开 /monitor 页面播放）',
    'devices.playTitle': '\n播放设备（声音送到哪里）：\n',
    'devices.recTitle': '\n录音设备（游戏 / 会议软件里的「麦克风」选这里）：\n',
    'devices.nonePlay': '  (没有找到任何播放设备)',
    'devices.noneRec': '  (没有找到任何录音设备)',
    'devices.tagDefaultPlay': '系统默认',
    'devices.tagCommPlay': '默认通信',
    'devices.tagDefaultMic': '系统默认麦克风',
    'devices.tagCommMic': '默认通信麦克风',
    'devices.tagGameMic': '{label}·可当游戏麦克风',
    'devices.tagPick': '{label}·选这个',
    'devices.defaultsTitle': '\nWindows 当前默认：',
    'devices.lblPlay': '  播放       ',
    'devices.lblPlayComm': '  通信播放   ',
    'devices.lblMic': '  麦克风     ',
    'devices.lblMicComm': '  通信麦克风 ',
    'devices.usage1': '\n普通外放：  --device "名字片段" 或 --device 序号',
    'devices.usage2': '游戏麦克风：--mic  （自动使用上面带 ← 的虚拟声卡）',
    'devices.usage3': '自己也想听：--mic --monitor  （默认从系统默认扬声器播放，建议戴耳机）',
    'devices.usage4': '路由体检：  --doctor\n',
    'devices.cableMatched': '· {flag}「{name}」匹配到 {count} 台设备，使用第一台：{device}',

    // ---- 路由体检 ---------------------------------------------------------
    'doctor.title': '\n🩺 PhoneMic 路由体检\n',
    'doctor.noInfo': '读不到 Windows 的默认设备信息。\n',
    'doctor.current': 'Windows 当前默认设备：',
    'doctor.unknown': '未知',
    'doctor.cableOk': '✓ 虚拟声卡：[{index}] {name}  ({label})',
    'doctor.micPick': '  游戏里的麦克风应选：{name}',
    'doctor.cableMissing1': '✖ 没有找到虚拟声卡。游戏麦克风模式需要先装 VB-Audio Virtual Cable。',
    'doctor.cableMissing2': '  https://vb-audio.com/Cable/  安装后重启电脑。',
    'doctor.problems': '\n✖ 发现问题：',
    'doctor.allGood': '\n✓ 默认播放设备没有被虚拟声卡占用，桌面声音不会跑进麦克风。',
    'doctor.tips': '提示：',
    'doctor.rerun': '改完 Windows 声音设置后，重新运行一次 --doctor 复查。\n',
    'audit.defaultPlayback': '默认播放（{name}）',
    'audit.defaultCommPlayback': '默认通信播放（{name}）',
    'audit.sep': '、',
    'audit.playbackCable': 'Windows 的{which}是虚拟声卡。电脑里的声音（游戏、音乐、队友语音）会被灌进虚拟声卡，'
      + '别人会在麦克风里听到你的桌面声音，还会形成回声循环。\n'
      + '   修复：Win+R 输入 mmsys.cpl →「播放」→ 右键你的耳机/音箱 → 设为默认设备，'
      + '再点一次「设为默认通信设备」。',
    'audit.stereoMix': 'Windows 的默认麦克风是「立体声混音 / Stereo Mix」。它录的是电脑正在播放的声音（游戏、音乐），'
      + '不是手机说话的声音，而且会把游戏声音回传到语音里。\n'
      + '   修复：Win+R 输入 mmsys.cpl →「录制」→ 右键 CABLE Output → 设为默认设备。',
    'audit.micBothCable': '✓ Windows 的默认麦克风和默认通信麦克风都是虚拟声卡，游戏会自动用手机的声音。',
    'audit.micNotCable': 'Windows 默认麦克风是「{name}」，不是虚拟声卡。'
      + '用「默认麦克风」的软件会继续收真实麦克风，请在软件里手动选 CABLE Output，'
      + '或在 Windows 声音设置里把它设为默认设备。',
    'audit.commMicNotCable': 'Windows 默认「通信」麦克风是「{name}」，不是虚拟声卡。'
      + 'CS2 / 无畏契约 / Discord 这类默认走「通信设备」的软件会收不到手机声音，'
      + '记得在软件里手动选 CABLE Output。',

    // ---- 虚拟声卡安装引导 --------------------------------------------------
    'cable.guide': [
      '',
      '✖ 没有找到虚拟声卡，游戏麦克风模式需要先装一个免费的 VB-Audio Virtual Cable。',
      '',
      '  1) 打开 https://vb-audio.com/Cable/ ，下载 VBCABLE_Driver_Pack*.zip',
      '  2) 解压后右键 VBCABLE_Setup_x64.exe →「以管理员身份运行」→ Install Driver',
      '  3) 重启电脑（装声卡驱动必须重启一次）',
      '  4) 回来重新双击 start-mic.bat（或 node server.js --mic）',
      '',
      '  装好后游戏 / 会议软件里的「麦克风」选：',
      '      CABLE Output (VB-Audio Virtual Cable)',
      '  程序这边会自动把声音送进 CABLE Input，你不需要再选。',
      '',
      '  已经装了别的虚拟声卡？用 --list-devices 看名字，然后：',
      '      node server.js --cable "设备名片段"',
      '',
    ].join('\n'),

    // ---- 启动横幅 ---------------------------------------------------------
    'banner.title': '   📱 PhoneMic · 手机当临时麦克风',
    'banner.gameMode': ' · 游戏麦克风模式',
    'banner.scan': '   手机扫码或直接打开：',
    'banner.dash': '   电脑控制台： http://127.0.0.1:{port}/dash',
    'banner.output': '   音频输出：   {desc}',
    'banner.monitor': '   监听输出：   {device}',
    'banner.gameReady': '   ✅ 游戏麦克风已就绪。在游戏 / 开黑软件里把「麦克风」设为：',
    'banner.gameBroken': '   ⚠ 游戏麦克风已启用，但 Windows 设备路由有问题（见上方警告）。',
    'banner.gameAfter': '      （不要选成扬声器 / Stereo Mix；设好后进游戏语音测试）',
    'banner.gameDefault': '      也可以在 Windows 声音设置里把它设为「默认麦克风」，这样所有游戏自动用它。',
    'banner.monitorWarn': '   ⚠ 监听请戴耳机：外放监听会让手机听到音响，形成回声循环。',
    'banner.speakerWarn1': '   ⚠ 外放模式：手机麦克风会听到音响，容易形成回声循环。',
    'banner.speakerWarn2': '     打游戏请双击 start-mic.bat 走虚拟声卡；自己监听请戴耳机。',
    'banner.cert1': '   首次连接时手机浏览器会提示「证书不安全」，',
    'banner.cert2': '   点「高级 / 继续访问」即可，这是自签名证书的正常提示。',
    'banner.fw1': '   手机连不上？多半是 Windows 防火墙拦了，允许本程序访问',
    'banner.fw2': '   专用网络即可。按 Ctrl+C 停止服务。',
    'banner.http1': '   ⚠ 你用 --http 把 HTTP 端口开放到局域网了。',
    'banner.http2': '     手机通过 http:// 访问时浏览器会禁用麦克风，只能用来调试。',
    'denied.title': '🔒 需要访问口令',
    'denied.body': '请扫描电脑上显示的那个二维码，或者在链接后面补上 <code>?k=口令</code>。',
    'cable.recordFallback': '虚拟声卡的「录音 / Output」端',
    'dev.virtualCable': '虚拟声卡',
    'client.unnamed': '未命名手机',
    'log.audioOutPrefix': '[音频输出] ',
    'log.audioStartFailed': '✖ 无法启动音频输出程序：{message}\n  可以试试：node server.js --player browser',
    'log.audioExited': '✖ 音频输出程序退出（代码 {code}）。换个设备试试：node server.js --list-devices',
    'log.monitorOutPrefix': '[监听输出] ',
    'log.monitorStartFailed': '✖ 无法启动监听输出：{message}',
    'log.monitorExited': '✖ 监听输出程序退出（代码 {code}），主输出不受影响。',

    // ---- 假手机测试工具 ---------------------------------------------------
    'fake.usage': '用法: node tools/fake-phone.js [--host 127.0.0.1] [--port 8081] [--token xxxx] [--seconds 5] [--tone 440] [--lang zh|en|auto]',
    'fake.badLang': '--lang 只能是 zh / en / auto，收到「{value}」',
    'fake.connecting': '连接 {url}',
    'fake.connected': '已连接，开始发送音频…',
    'fake.clientName': '假手机',
    'fake.done': '\n发送结束：{frames} 帧 / {seconds} 秒（协议上应为 {expected} 帧）',
    'fake.closed': '连接被关闭',
    'fake.failed': '连不上：{message}',
    'fake.hint': '请确认服务已经启动，端口和口令是否正确。',
  },

  en: {
    // ---- CLI --------------------------------------------------------------
    'err.needsValue': 'Option {arg} needs a value (see --help)',
    'err.unknownArg': 'Unknown option: {arg} (see --help)',
    'err.notNumber': 'Option {name} must be a number, got "{value}"',
    'err.badLang': '--lang must be zh, en or auto, got "{value}"',
    'err.noCsc': 'Could not find the .NET compiler csc.exe, so the audio output helper cannot be built.\n'
      + '  Try browser playback instead: node server.js --player browser',
    'err.compileFailed': 'Failed to build the audio output helper:\n{output}',
    'err.noPlaybackDevices': 'No audio playback devices were found.',
    'err.deviceIndexMissing': '{flag}: device index {index} does not exist. Available devices:\n{list}',
    'err.deviceNameMissing': '{flag}: no playback device matches "{name}". Available devices:\n{list}',
    'err.badPlayer': '--player must be native, browser or none, got "{value}"',
    'err.badIp': '--ip: {ip} is not an address of this computer. Available: {list}',
    'err.startFailed': 'Failed to start: {message}',
    'err.loopbackOnly': 'Only allowed from this computer',
    'err.portsBusy': 'All 30 ports starting at {start} are in use',

    // ---- Help -------------------------------------------------------------
    'help.text': `
PhoneMic — use your phone as your computer's microphone

Usage: node server.js [options]

  --port <n>           LAN HTTPS port (default 8443)
  --http-port <n>      Local HTTP port (default 8080, used by tunnels/tests)
  --ip <addr>          LAN IP to put in the QR code (useful with several NICs)
  --mic                Game microphone mode: route audio into a virtual cable
  --cable <name|index> Pick the virtual cable yourself (implies --mic)
  --monitor [name|idx] Also play on another device so you can hear it
  --device <name|idx>  Playback device to use (when not using a virtual cable)
  --rate <n>           Output sample rate (default 48000)
  --latency <ms>       Jitter buffer target in ms, raise it on bad networks (default 120)
  --player <mode>      native=sound card (default) / browser / none
  --tunnel             Start a public HTTPS URL with cloudflared
  --public-url <url>   Use your own public URL (reverse proxy)
  --record <file.wav>  Also record the received audio to a WAV file
  --token <string>     Custom access token; --no-token disables it
  --lang <zh|en|auto>  UI language (default auto: follow the system)
  --no-open            Do not open the dashboard automatically
  --list-devices       List playback / recording devices and exit
  --doctor             Check default-device routing (desktop audio leaking into the mic)
  -h, --help           Show this help

Game microphone mode needs the free VB-Audio Virtual Cable:
  https://vb-audio.com/Cable/     (reboot once after installing)
Then: node server.js --mic
In your game / meeting app, pick CABLE Output (VB-Audio Virtual Cable) as the microphone.
`,

    // ---- Build / startup logs ---------------------------------------------
    'log.compiling': '· Building the audio output helper (only the first run takes a few seconds)…',
    'log.micIgnored': '· --mic only works with --player native, ignoring it.',
    'log.monitorSame': '· Monitor output is the same device as the main output, ignoring --monitor (it would double the audio).',
    'log.monitorOn': '· Monitor output: {device} (so you can hear it too)',
    'log.quitting': 'Shutting down…',
    'log.monitorClient': '· Browser monitor connected',
    'log.phoneConnected': '· Phone connected ({id}) from {ip}, {count} stream(s)',
    'log.phoneLeft': '· Phone disconnected ({id}), {count} stream(s) left',
    'log.tunnelStarting': '· Starting the cloudflared public tunnel…',
    'log.tunnelTimeout': '✖ cloudflared did not open a tunnel within 20 s, staying on the LAN only.',
    'log.tunnelMissing1': '✖ cloudflared was not found.',
    'log.tunnelMissing2': '  Install it and retry: winget install --id Cloudflare.cloudflared',
    'log.tunnelMissing3': '  Or map an HTTPS URL yourself and pass it with --public-url.',

    // ---- Device descriptions ---------------------------------------------
    'dev.default': 'system default device',
    'dev.custom': 'custom device',
    'dev.none': 'none',
    'player.none': 'none (record/monitor only)',
    'player.gameMic': 'game microphone → {device}',
    'player.card': 'sound card {rate} kHz → {device}',
    'player.cardDefault': 'sound card {rate} kHz (system default device)',
    'player.browser': 'browser (open the /monitor page to play)',
    'devices.playTitle': '\nPlayback devices (where the sound goes):\n',
    'devices.recTitle': '\nRecording devices (pick one as the "microphone" in games/meetings):\n',
    'devices.nonePlay': '  (no playback devices found)',
    'devices.noneRec': '  (no recording devices found)',
    'devices.tagDefaultPlay': 'system default',
    'devices.tagCommPlay': 'default communications',
    'devices.tagDefaultMic': 'system default microphone',
    'devices.tagCommMic': 'default communications microphone',
    'devices.tagGameMic': '{label} · usable as a game microphone',
    'devices.tagPick': '{label} · pick this one',
    'devices.defaultsTitle': '\nWindows defaults right now:',
    'devices.lblPlay': '  Playback      ',
    'devices.lblPlayComm': '  Comm. playback ',
    'devices.lblMic': '  Microphone     ',
    'devices.lblMicComm': '  Comm. mic      ',
    'devices.usage1': '\nNormal speakers:   --device "name fragment" or --device index',
    'devices.usage2': 'Game microphone:   --mic  (auto-uses the virtual cable marked ← above)',
    'devices.usage3': 'Hear it yourself:  --mic --monitor  (plays on the default speakers; use headphones)',
    'devices.usage4': 'Routing check:     --doctor\n',
    'devices.cableMatched': '· {flag}: "{name}" matched {count} devices, using the first one: {device}',

    // ---- Routing check ----------------------------------------------------
    'doctor.title': '\n🩺 PhoneMic routing check\n',
    'doctor.noInfo': 'Could not read the Windows default devices.\n',
    'doctor.current': 'Windows defaults right now:',
    'doctor.unknown': 'unknown',
    'doctor.cableOk': '✓ Virtual cable: [{index}] {name}  ({label})',
    'doctor.micPick': '  Pick this as the microphone in your game: {name}',
    'doctor.cableMissing1': '✖ No virtual cable found. Game microphone mode needs VB-Audio Virtual Cable.',
    'doctor.cableMissing2': '  https://vb-audio.com/Cable/  Install it, then reboot.',
    'doctor.problems': '\n✖ Problems found:',
    'doctor.allGood': '\n✓ The default playback device is not a virtual cable, so desktop audio will not leak into the mic.',
    'doctor.tips': 'Notes:',
    'doctor.rerun': 'After changing the Windows sound settings, run --doctor again to verify.\n',
    'audit.defaultPlayback': 'default playback ({name})',
    'audit.defaultCommPlayback': 'default communications playback ({name})',
    'audit.sep': ', ',
    'audit.playbackCable': "Windows' {which} is a virtual cable. Desktop audio (game, music, teammates) is piped into the cable "
      + 'and comes back out of the microphone, so other people hear your desktop and get an echo loop.\n'
      + '   Fix: Win+R → mmsys.cpl → "Playback" → right-click your headphones/speakers → Set as Default Device, '
      + 'then set it as Default Communication Device too.',
    'audit.stereoMix': 'The Windows default microphone is "Stereo Mix". It records whatever the computer is playing '
      + '(game, music), not your phone, and sends the game audio back into voice chat.\n'
      + '   Fix: Win+R → mmsys.cpl → "Recording" → right-click CABLE Output → Set as Default Device.',
    'audit.micBothCable': '✓ Both the default and default communications microphones are the virtual cable, so games pick up your phone automatically.',
    'audit.micNotCable': 'The Windows default microphone is "{name}", not the virtual cable. '
      + 'Apps using the "default microphone" will keep recording your real mic — pick CABLE Output in the app, '
      + 'or set it as the default device in Windows sound settings.',
    'audit.commMicNotCable': 'The Windows default communications microphone is "{name}", not the virtual cable. '
      + 'Apps that follow the communications device (CS2, Valorant, Discord, …) will not hear your phone — '
      + 'pick CABLE Output in those apps.',
    'cable.guide': [
      '',
      '✖ No virtual cable found. Game microphone mode needs the free VB-Audio Virtual Cable.',
      '',
      '  1) Open https://vb-audio.com/Cable/ and download VBCABLE_Driver_Pack*.zip',
      '  2) Unzip, right-click VBCABLE_Setup_x64.exe → "Run as administrator" → Install Driver',
      '  3) Reboot (a driver install always needs one reboot)',
      '  4) Come back and double-click start-mic.bat (or run node server.js --mic)',
      '',
      '  Then pick this as the microphone in your game / meeting app:',
      '      CABLE Output (VB-Audio Virtual Cable)',
      '  PhoneMic sends the audio into CABLE Input automatically.',
      '',
      '  Already using a different virtual cable? Check --list-devices for the name, then:',
      '      node server.js --cable "name fragment"',
      '',
    ].join('\n'),

    // ---- Banner -----------------------------------------------------------
    'banner.title': '   📱 PhoneMic · your phone as a microphone',
    'banner.gameMode': ' · game microphone mode',
    'banner.scan': '   Scan this with your phone, or open:',
    'banner.dash': '   Dashboard:   http://127.0.0.1:{port}/dash',
    'banner.output': '   Audio out:   {desc}',
    'banner.monitor': '   Monitor out: {device}',
    'banner.gameReady': '   ✅ Game microphone ready. In your game / voice app, set the microphone to:',
    'banner.gameBroken': '   ⚠ Game microphone is on, but the Windows device routing has a problem (see the warning above).',
    'banner.gameAfter': '      (do not pick a speaker or Stereo Mix; test voice chat in-game)',
    'banner.gameDefault': '      You can also set it as the Windows default microphone so every game uses it.',
    'banner.monitorWarn': '   ⚠ Use headphones when monitoring: speaker output feeds the phone mic and creates an echo loop.',
    'banner.speakerWarn1': '   ⚠ Speaker mode: the phone mic will hear your speakers and can create an echo loop.',
    'banner.speakerWarn2': '     For gaming run start-mic.bat; for monitoring use headphones.',
    'banner.cert1': '   On first connect the phone warns about the certificate.',
    'banner.cert2': '   Tap "Advanced / Proceed" — that is normal for a self-signed certificate.',
    'banner.fw1': "   Phone can't connect? Windows Firewall is usually blocking it.",
    'banner.fw2': '   Allow the app on private networks. Press Ctrl+C to stop.',
    'banner.http1': '   ⚠ You opened the HTTP port to the LAN with --http.',
    'banner.http2': '     Browsers block the microphone on http:// pages, so that is for debugging only.',
    'denied.title': '🔒 Access token required',
    'denied.body': 'Scan the QR code shown on the computer, or append <code>?k=TOKEN</code> to the link.',
    'cable.recordFallback': "the virtual cable's recording / Output side",
    'dev.virtualCable': 'virtual cable',
    'client.unnamed': 'Unnamed phone',
    'log.audioOutPrefix': '[audio out] ',
    'log.audioStartFailed': '✖ Could not start the audio output helper: {message}\n  Try browser playback: node server.js --player browser',
    'log.audioExited': '✖ The audio output helper exited (code {code}). Try another device: node server.js --list-devices',
    'log.monitorOutPrefix': '[monitor out] ',
    'log.monitorStartFailed': '✖ Could not start the monitor output: {message}',
    'log.monitorExited': '✖ The monitor output exited (code {code}); the main output is not affected.',

    // ---- Fake phone test tool ---------------------------------------------
    'fake.usage': 'Usage: node tools/fake-phone.js [--host 127.0.0.1] [--port 8081] [--token xxxx] [--seconds 5] [--tone 440] [--lang zh|en|auto]',
    'fake.badLang': '--lang must be zh, en or auto, got "{value}"',
    'fake.connecting': 'Connecting to {url}',
    'fake.connected': 'Connected, sending audio…',
    'fake.clientName': 'Fake phone',
    'fake.done': '\nDone: {frames} frames / {seconds} s (protocol expects {expected} frames)',
    'fake.closed': 'Connection closed',
    'fake.failed': 'Cannot connect: {message}',
    'fake.hint': 'Make sure the server is running and the port and token are correct.',
  },
};

function normalizeLang(value) {
  const s = String(value || '').trim().toLowerCase();
  if (!s || s === 'auto') return null;
  if (s.startsWith('zh')) return 'zh';
  if (s.startsWith('en')) return 'en';
  if (MESSAGES[s]) return s;
  return undefined;
}

function envLang() {
  const raw = process.env.PHONEMIC_LANG || process.env.PHONEMICLANG || '';
  const hit = normalizeLang(raw);
  return hit || null;
}

/** auto：优先环境变量，其次 Windows 的界面语言（Intl 已经反映系统设置） */
function detectLang() {
  const fromEnv = envLang();
  if (fromEnv) return fromEnv;
  const candidates = [
    process.env.LC_ALL,
    process.env.LC_MESSAGES,
    process.env.LANG,
  ];
  for (const c of candidates) {
    const hit = normalizeLang(String(c || '').split('.')[0]);
    if (hit) return hit;
  }
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale || '';
    if (/^zh/i.test(locale)) return 'zh';
    if (/^en/i.test(locale)) return 'en';
  } catch { /* 忽略 */ }
  return 'en';
}

function interpolate(text, vars) {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, k) => (
    Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : m
  ));
}

/**
 * t(lang, key, vars)
 * lang 省略时退回到英文；key 不存在时返回 key 本身，方便发现漏翻。
 */
function t(lang, key, vars) {
  const table = MESSAGES[lang] || MESSAGES.en;
  let text = table[key];
  if (text === undefined) text = MESSAGES.zh[key];
  if (text === undefined) return key;
  return interpolate(text, vars);
}

module.exports = { MESSAGES, t, detectLang, normalizeLang };
