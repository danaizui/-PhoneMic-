==================================================
  PhoneMic - use your phone as a computer microphone
  3-minute quick start
==================================================

[1] Check that Node.js is installed
  Press Win+R, type cmd, then run:   node -v
  If you see something like v18.x / v20.x / v22.x, you are good.
  If it says "not recognized", download the LTS version from
  https://nodejs.org and install it (keep clicking Next).


[2] Double-click start.bat
  A black window opens - keep it open.
  It shows a QR code and an address like:
     https://192.168.1.34:8443/?k=a1b2c3d4
  The dashboard also opens in your browser.

  If Windows Firewall asks on first run, click "Allow access",
  otherwise the phone cannot connect.


[3] Scan the QR code with your phone
  1) The phone must be on the same Wi-Fi as the PC.
  2) The browser warns "Your connection is not private".
     Tap Advanced -> Proceed. This is normal for the self-signed
     certificate, because phone browsers only allow the microphone
     on https pages.
  3) Tap the big microphone button and allow the microphone.
  4) Talk - your voice now comes out of the computer.
     (Only you can hear it. For game voice chat, see below.)


[No sound / cannot connect?]
  - No sound on the PC: the audio may be going to an unconnected
    output (e.g. an HDMI monitor). Run in this folder:
         node server.js --list-devices
    then pick one:
         node server.js --device "Realtek"
  - Phone cannot connect: usually the firewall. In an admin cmd:
         netsh advfirewall firewall add rule name="PhoneMic" dir=in action=allow protocol=TCP localport=8443
  - Choppy audio: raise the buffer
         node server.js --latency 200
  - Guest/office Wi-Fi may block devices from seeing each other.
    Use another Wi-Fi or a phone hotspot.


[Game voice chat (so teammates hear you)]
  You need the free VB-Audio Virtual Cable (install once):

  1) Open https://vb-audio.com/Cable/ and download VBCABLE_Driver_Pack*.zip
  2) Unzip, right-click VBCABLE_Setup_x64.exe -> "Run as administrator"
     -> Install Driver
  3) Reboot (required)
  4) Back in this folder, double-click start-mic.bat

  Then in your game: Settings -> Audio/Voice -> Microphone, pick
        CABLE Output (VB-Audio Virtual Cable)
  Use the in-game mic test and talk into the phone.

  Easier: in Windows "Sound settings -> More sound settings ->
  Recording", set CABLE Output as "Default Device" and
  "Default Communication Device". Every game then uses it.

  If teammates hear your game / desktop audio:
    Windows is sending desktop audio into the cable (the default
    communications playback device is CABLE Input).
    Press Win+R, run mmsys.cpl:
      Playback  -> right-click headphones/speakers -> Set as Default
                   Device + Set as Default Communication Device
      Recording -> right-click CABLE Output -> Set as Default Device
                   + Set as Default Communication Device
    Then run: node server.js --doctor   (or double-click doctor.bat)

  Howling / weird loop with speakers:
    The phone mic hears the speakers. For gaming use start-mic.bat;
    to hear yourself use --monitor but WEAR HEADPHONES.

  Note: if the PC has no sound after installing the cable, Windows
  switched the default playback device to CABLE Input. Set it back
  to your headphones/speakers. PhoneMic outputs by device name and
  does not use the system default.

  Hear yourself too (optional, ~0.1 s delay):
        start-mic.bat --monitor

  Using VoiceMeeter or another virtual cable?
        node server.js --cable "name fragment"
  (check names with node server.js --list-devices; the ones with
   a left arrow are virtual cables)


[Other]
  - Not on the same Wi-Fi: install cloudflared, then
        node server.js --tunnel
    You get a real https URL that works over 4G.
  - Language: click EN / 中文 in the top-right corner of the web UI,
    or start with: node server.js --lang en
  - More options: node server.js --help
  - Full docs: README.en.md (English) / README.md (Chinese)

==================================================
