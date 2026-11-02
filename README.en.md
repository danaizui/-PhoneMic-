# 📱 PhoneMic · use your phone as a computer microphone

**English** · [简体中文](README.md)

Open a web page on your phone, tap one button, and the phone starts feeding audio to your PC:

- **LAN**: the PC runs a small server, the phone scans a QR code and connects; the sound plays through your sound card.
- **Game microphone**: add `--mic` and the audio is routed into a virtual cable; pick `CABLE Output` as the microphone in your game and teammates hear you.
- **Public URL**: add `--tunnel` to get a `https://xxx.trycloudflare.com` address, so you can feed audio to your home PC from anywhere.
- **No native dependencies**: no drivers, no WebRTC, no ffmpeg. The audio output helper is compiled on first run with the .NET compiler that ships with Windows. Only game microphone mode needs a free virtual cable.

> Phone browsers only allow microphone access on **HTTPS** pages. The LAN mode therefore uses a self-signed certificate; the first connection shows a warning — tap through it (details below).

The user interface is available in **Chinese and English**; use the `EN / 中文` button in the top-right corner, or start the server with `--lang zh` / `--lang en` to force the console language.

---

## 1. Run it

Requires Node.js 18+ (`node -v` should print something).

**Three ways to start, pick one:**

1. **Double-click `start.bat`** (recommended). It installs dependencies on first run and keeps the window open with the QR code.
2. **Open the folder in VS Code and press F5**. Debug configs are included; the dropdown also offers “list devices” and “fake phone”.
3. Command line:

   ```bat
   cd phonemic
   npm install
   node server.js
   ```

The terminal prints a QR code and an address; scan it with your phone (or type it in):

```
   Scan this with your phone, or open:
   https://192.168.1.34:8443/?k=1b9d0f8d

       ██████████████    ██  ██  ██    ████
       ██          ██  ████  ████  ████████
       ...

   Dashboard:   http://127.0.0.1:8081/dash
   Audio out:   sound card 48 kHz
```

The dashboard (`/dash`) opens automatically: large QR code, connected phones, per-phone level meters and buffer state.

### Three steps on the phone

1. Scan the QR code.
2. The browser warns about the connection → **Advanced → Proceed** (normal for a self-signed certificate; only happens once).
3. Tap the big microphone button and allow the microphone. **You are live.**

Tap again to stop.

---

## 2. Turn it into a game / meeting microphone

By default the sound comes out of your speakers, so only you can hear it. To make **games, Discord, Zoom or OBS** treat your phone as a microphone, you need a virtual cable that loops audio from a playback endpoint into a recording endpoint:

```
Phone → PhoneMic → CABLE Input (virtual cable playback side)
                        │ driver loopback
                        ▼
Game microphone ← CABLE Output (virtual cable recording side)
```

### 1. Install VB-Audio Virtual Cable (once)

1. Open <https://vb-audio.com/Cable/> and download `VBCABLE_Driver_Pack*.zip`.
2. Unzip, right-click `VBCABLE_Setup_x64.exe` → **Run as administrator** → `Install Driver`.
3. **Reboot** (a driver install always needs one).
4. Check that `CABLE Input (VB-Audio Virtual Cable)` appears under sound playback devices.

> ⚠ Windows may switch the default playback device to CABLE Input after the install. Set the **default playback device back to your headphones/speakers**, otherwise game audio is piped into the microphone and teammates hear your game.

### 2. Start in game microphone mode

Double-click **`start-mic.bat`** (recommended), or:

```bat
node server.js --mic
```

PhoneMic finds `CABLE Input` automatically and prints:

```
   📱 PhoneMic · your phone as a microphone · game microphone mode
   Audio out:   game microphone → [3] CABLE Input (VB-Audio Virtual C
   ✅ Game microphone ready. In your game / voice app, set the microphone to:
      CABLE Output (VB-Audio Virtual Cable)
```

If no virtual cable is installed it does not pretend to work — it prints the install steps and exits.

> At startup, if Windows' default playback or default communications playback is set to a virtual cable, PhoneMic warns you. Follow the hint and set the default output back to your headphones/speakers, otherwise desktop audio leaks into the microphone and echoes. Run `node server.js --doctor` afterwards to verify.

### 3. Pick the microphone in-game

Game → Settings → Audio / Voice → **Microphone / Input device**:

```
CABLE Output (VB-Audio Virtual Cable)
```

Do not pick “Stereo Mix” — it records everything the PC plays. Use the in-game voice test: the level meter should move while you talk into the phone.

> Tip: you can also set `CABLE Output` as the **default device** and **default communications device** in Windows sound settings, then every game picks it up automatically.

### 4. Optional: hear yourself too

```bat
start-mic.bat --monitor
```

This plays a copy on the **default speakers**. You can name a device:

```bat
start-mic.bat --monitor "Razer"
```

Monitoring adds ~100–150 ms of delay, which quickly gets confusing while talking. For gaming, use headphones and skip monitoring (or wear one earpiece only).

### 5. Other virtual cables

VoiceMeeter, Virtual Audio Cable and Voicemod also work — PhoneMic recognises the common names. Otherwise pick the device yourself:

```bat
node server.js --cable "name fragment"
```

Devices marked with `←` in `node server.js --list-devices` can be used as a game microphone.

> Meeting apps work exactly the same way: pick `CABLE Output` as the microphone. Nothing plays on your speakers and there is no feedback.

---

## 3. Public access (phone on mobile data)

### Option A: automatic tunnel (easiest)

```bat
winget install --id Cloudflare.cloudflared
node server.js --tunnel
```

PhoneMic starts a `https://xxx-xxx.trycloudflare.com` address and points the QR code at it. It uses a **real certificate**, so the phone shows no warning, and it works over 4G/5G.

> The free tunnel gets a new address on every start and is slower than the LAN. For daily use, stay on the same Wi-Fi.

### Option B: your own domain / reverse proxy

```bat
node server.js --public-url https://mic.example.com/
```

Point the reverse proxy at `http://127.0.0.1:8080` (remember to forward WebSocket upgrades).

---

## 4. Options

| Option | Description |
| --- | --- |
| `--port <n>` | LAN HTTPS port, default `8443` |
| `--http-port <n>` | Local HTTP port, default `8080` (tunnels/debugging) |
| `--mic` | Game microphone mode: find a virtual cable automatically |
| `--cable <name\|index>` | Pick the virtual cable yourself (implies `--mic`) |
| `--monitor [name\|index]` | Also play on another device; omit the name for the system default |
| `--device <name\|index>` | Playback device when not using a virtual cable (`--list-devices`) |
| `--rate <n>` | Output sample rate, default `48000` |
| `--latency <ms>` | Jitter buffer, default `120`. Raise to `200` on bad Wi-Fi |
| `--player <mode>` | `native` sound card (default) / `browser` / `none` (record only) |
| `--record <file.wav>` | Also record the received audio to WAV |
| `--token <string>` | Custom access token; `--no-token` disables it |
| `--tunnel` | Public URL via cloudflared |
| `--public-url <url>` | Manual public URL |
| `--ip <address>` | Which local IP to put in the QR code |
| `--lang <zh\|en\|auto>` | UI language, default `auto` (follow the system) |
| `--no-open` | Do not open the dashboard automatically |
| `--list-devices` | List playback/recording devices, mark Windows defaults and virtual cables |
| `--doctor` | Check whether desktop audio leaks into the microphone |

Examples:

```bat
:: game microphone + hear it yourself
node server.js --mic --monitor

:: record + lower latency + specific sound card
node server.js --record meeting.wav --latency 90 --device 1

:: keep strangers out with your own token
node server.js --token mysecret
```

---

## 5. Test without a phone

```bat
node tools/fake-phone.js --port 8081 --token <the token from the banner>
```

It emulates a phone sending a 5-second tone sweep. If you hear it on the PC, everything except the phone capture works.

---

## 6. Troubleshooting

**The microphone is full of desktop audio / teammates hear my game and an echo?**
Windows has routed desktop audio into the virtual cable. PhoneMic does not record your desktop. Run the check:

```bat
node server.js --doctor
```

It prints the four Windows default devices and points out the problem. The two most common cases:

- **Default communications playback is `CABLE Input`**: the game, Discord and music all flow into the cable, come back out of `CABLE Output`, and other people hear your desktop (on a loop).
- **Default microphone is `Stereo Mix`**: it records whatever the PC is playing.

Fix (Windows settings — the app cannot click for you):
1. `Win+R` → `mmsys.cpl` → Enter
2. **Playback** tab: right-click your headphones/speakers → **Set as Default Device**, then right-click again → **Set as Default Communication Device**
3. **Recording** tab: right-click `CABLE Output (VB-Audio Virtual Cable)` → **Set as Default Device**, then again → **Set as Default Communication Device**
4. Run `node server.js --doctor` (or `doctor.bat`) again

The `/dash` page shows the same warning in a red card with an **Open sound settings** button.

**Howling / weird loop while using speakers?**
The phone microphone hears your speakers, creating an acoustic loop: phone → PC → speakers → phone.
- Gaming: use `start-mic.bat`; audio only goes into the virtual cable.
- Want to hear it: use `--monitor` but **wear headphones**.
- Temporary speaker use: lower the volume, move the phone away from the speakers, keep echo cancellation on.

**Teammates cannot hear me in-game?** Check in order:
1. The in-game microphone is **`CABLE Output (VB-Audio Virtual Cable)`** — not a speaker, not Stereo Mix.
2. The phone page is live (the dashboard shows the phone and a moving level meter).
3. Windows Settings → Privacy & security → Microphone → allow desktop apps.
4. In-game mic volume/gain is not 0; some games set a very high voice-activation threshold.
5. Another app has exclusive control of CABLE Output.
6. Try `start-mic.bat --monitor`: if you hear yourself, PhoneMic is fine and the problem is the device selection in-game.

**No sound on the PC after installing the virtual cable?**
Windows switched the default playback device to `CABLE Input`. Set it back to your headphones/speakers. PhoneMic outputs to a named device and does not depend on the default.

**Monitoring has echo/delay?**
That is expected: monitoring uses another sound card and adds ~100–150 ms. Skip it for gaming, or wear one earpiece. Keep echo cancellation on.

**The `start.bat` window closes instantly?**
Fixed. The batch files are pure **ASCII + CRLF**, so no code page can break them, and they always stop at “Press any key to close this window”. All Chinese/English UI text comes from Node itself.

**The phone says the connection is not private?**
Self-signed certificates always do. Use `--tunnel` or `--public-url` if you want a real certificate.

**Tapping the mic does nothing / it asks for HTTPS?**
You opened an `http://` address. Phone browsers only grant microphone access on HTTPS (or localhost).

**No audio at all?**
1. `node server.js --list-devices` — maybe the output went to an unconnected HDMI monitor.
2. Pick a device explicitly: `--device "Realtek"`.
3. Check the Windows volume mixer: the node process may be muted.

**Choppy audio?**
Set `--latency 200`, make sure phone and PC are on the same 5 GHz Wi-Fi, and watch the dropout count / buffer ms on the dashboard.

**Echo or feedback?**
The phone is too close to the speakers. Keep **echo cancellation** on, lower the PC volume, or use headphones / the virtual cable.

**It stops when the phone screen locks?**
Phone browser limitation. The page requests a Wake Lock, but aggressive battery savers still kill it. Keep the page in the foreground.

**Cannot connect over the LAN?**
Windows Firewall asks once; choose Allow. If you cancelled it:
```bat
netsh advfirewall firewall add rule name="PhoneMic 8443" dir=in action=allow protocol=TCP localport=8443
```
(administrator required)

**Port already in use?**
PhoneMic tries the next port (8443 → 8444 …) and prints the real address. Port 8080 is often taken by other software; that is fine.

**After changing PC or network the phone cannot connect?**
The certificate is bound to the IP. Delete `certs/` and let it regenerate.

---

## 7. How it works

```
 Phone browser
  ├─ getUserMedia captures the microphone
  ├─ AudioWorklet turns it into 20 ms Int16 frames (off the main thread)
  └─ WebSocket binary frames ─────────────┐
                                          ▼
                                 Node server (server.js)
                                   ├─ one jitter buffer per phone (default 120 ms)
                                   ├─ linear-interpolation resampling when rates differ
                                   ├─ mixes several phones together
                                   └─ feeds the sound card at its own playback pace
                                          ▼
                                build/audiosink.exe (compiled by csc)
                                   ├─ waveOut double buffering → sound card
                                   └─ --mic: → CABLE Input → pick CABLE Output in-game
                                      --monitor: same frame to a second card (drops on overflow)
```

Two key design choices:

1. **Ack-driven feeding**: the sink writes one byte to stdout after playing each block; Node sends the next block only after that byte. The pipe never holds more than 1–2 blocks, so latency cannot pile up.
2. **30 ms blocks**: under Windows shared mode a 20 ms waveOut buffer is stretched ~5 ms per block by the driver (playback runs at ~80% real time); 30 ms is exactly real time. The phone still sends 20 ms frames and the server groups them into 30 ms blocks.

## 8. Project layout

```
phonemic/
├─ server.js            HTTPS + WebSocket + mixing + sound card scheduling
├─ lib/i18n.js          Console strings (Chinese / English)
├─ bin/audiosink.cs     Sound card helper source (auto-compiled on first run)
├─ public/
│  ├─ index.html        Phone page (microphone capture)
│  ├─ worklet.js        AudioWorklet used for capture
│  ├─ i18n.js           Web UI strings (Chinese / English)
│  ├─ dash.html         Desktop dashboard (QR / levels / clients)
│  └─ monitor.html      Play audio in the browser instead of the sound card
├─ tools/fake-phone.js  Fake phone for testing the pipeline
├─ certs/               Generated self-signed certificate
├─ build/               Generated audiosink.exe
├─ start.bat            Double-click: normal speaker mode
├─ start-mic.bat        Double-click: game microphone mode
└─ doctor.bat           Double-click: check Windows audio routing
```

## 9. Privacy

- Audio travels directly between your phone and your PC. No third-party server is involved (unless you enable the tunnel).
- A random access token is generated on every start; without it the page is inaccessible.
- Without `--record`, no audio is written to disk.

## License

MIT — see [LICENSE](LICENSE).
