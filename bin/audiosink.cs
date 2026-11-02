// ---------------------------------------------------------------------------
// audiosink.cs —— PhoneMic 的音频输出端
//
// 从 stdin 读取裸 PCM（16 位小端，单/多声道），用 Win32 waveOut 双缓冲播放。
// 每消费完一块数据就向 stdout 写一个字节（'.'）作为「节拍应答」，
// 让 Node 端精确地按播放速度投喂数据，避免管道里堆积出上百毫秒的延迟。
//
//   audiosink.exe --list
//   audiosink.exe --device "扬声器" --rate 48000 --channels 1 --frame-ms 20
// ---------------------------------------------------------------------------
using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;

static class Program
{
    [StructLayout(LayoutKind.Sequential, Pack = 1)]
    struct WAVEFORMATEX
    {
        public ushort wFormatTag;
        public ushort nChannels;
        public uint nSamplesPerSec;
        public uint nAvgBytesPerSec;
        public ushort nBlockAlign;
        public ushort wBitsPerSample;
        public ushort cbSize;
    }

    [StructLayout(LayoutKind.Sequential)]
    struct WAVEHDR
    {
        public IntPtr lpData;
        public uint dwBufferLength;
        public uint dwBytesRecorded;
        public IntPtr dwUser;
        public uint dwFlags;
        public uint dwLoops;
        public IntPtr lpNext;
        public IntPtr reserved;
    }

    // ---- Windows Core Audio：读「默认播放 / 默认录音」设备（含通信设备） ----
    [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
    class MMDeviceEnumeratorComObject { }

    [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMMDeviceEnumerator
    {
        int EnumAudioEndpoints(int dataFlow, int stateMask, out IntPtr devices);
        int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice endpoint);
        int GetDevice([MarshalAs(UnmanagedType.LPWStr)] string id, out IMMDevice device);
        int RegisterEndpointNotificationCallback(IntPtr client);
        int UnregisterEndpointNotificationCallback(IntPtr client);
    }

    [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IMMDevice
    {
        int Activate(ref Guid iid, int dwClsCtx, IntPtr pActivationParams,
            [MarshalAs(UnmanagedType.IUnknown)] out object ppInterface);
        int OpenPropertyStore(int stgmAccess, out IPropertyStore ppProperties);
        int GetId([MarshalAs(UnmanagedType.LPWStr)] out string ppstrId);
        int GetState(out int pdwState);
    }

    [ComImport, Guid("886d8eeb-8cf2-4446-8d02-cdba1dbdcf99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    interface IPropertyStore
    {
        int GetCount(out int cProps);
        int GetAt(int iProp, out PROPERTYKEY pkey);
        int GetValue(ref PROPERTYKEY key, out PROPVARIANT pv);
        int SetValue(ref PROPERTYKEY key, ref PROPVARIANT pv);
        int Commit();
    }

    [StructLayout(LayoutKind.Sequential)]
    struct PROPERTYKEY
    {
        public Guid fmtid;
        public int pid;
    }

    [StructLayout(LayoutKind.Explicit, Size = 24)]
    struct PROPVARIANT
    {
        [FieldOffset(0)] public ushort vt;
        [FieldOffset(2)] public ushort wReserved1;
        [FieldOffset(4)] public ushort wReserved2;
        [FieldOffset(6)] public ushort wReserved3;
        [FieldOffset(8)] public IntPtr pointerValue;
    }

    [DllImport("ole32.dll")] static extern int PropVariantClear(ref PROPVARIANT pvar);

    const uint WHDR_DONE = 0x00000001;
    const uint CALLBACK_NULL = 0x00000000;
    const uint CALLBACK_EVENT = 0x00050000;
    const uint WAIT_TIMEOUT = 0x00000102;
    static readonly IntPtr WAVE_MAPPER = new IntPtr(-1);

    // 控制台语言：由 server.js 通过 --lang 传入（默认英文）
    static string Lang = "en";
    static string M(string zh, string en) { return Lang == "zh" ? zh : en; }

    // WAVEINCAPS: wMid(2) wPid(2) vDriverVersion(4) szPname(64) dwFormats(4)
    //             wChannels(2) wReserved1(2)  => 80 字节
    const int IN_CAPS_SIZE = 80;
    const int IN_CAPS_NAME_OFFSET = 8;
    const int IN_CAPS_NAME_BYTES = 64;

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern IntPtr CreateEvent(IntPtr lpEventAttributes, bool bManualReset, bool bInitialState, string lpName);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool ResetEvent(IntPtr hEvent);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern uint WaitForSingleObject(IntPtr hHandle, uint dwMilliseconds);
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool CloseHandle(IntPtr hObject);

    [DllImport("winmm.dll")] static extern int waveOutGetNumDevs();
    [DllImport("winmm.dll")] static extern int waveOutGetDevCapsW(IntPtr uDeviceID, [In, Out] byte[] pwoc, int cbwoc);
    [DllImport("winmm.dll")] static extern int waveInGetNumDevs();
    [DllImport("winmm.dll")] static extern int waveInGetDevCapsW(IntPtr uDeviceID, [In, Out] byte[] pwic, int cbwic);
    [DllImport("winmm.dll")] static extern int waveOutOpen(out IntPtr phwo, IntPtr uDeviceID, ref WAVEFORMATEX pwfx, IntPtr dwCallback, IntPtr dwInstance, uint fdwOpen);
    [DllImport("winmm.dll")] static extern int waveOutPrepareHeader(IntPtr hwo, IntPtr pwh, int cbwh);
    [DllImport("winmm.dll")] static extern int waveOutWrite(IntPtr hwo, IntPtr pwh, int cbwh);
    [DllImport("winmm.dll")] static extern int waveOutReset(IntPtr hwo);
    [DllImport("winmm.dll")] static extern int waveOutClose(IntPtr hwo);

    // WAVEOUTCAPS: wMid(2) wPid(2) vDriverVersion(4) szPname(64) dwFormats(4)
    //              wChannels(2) wReserved1(2) dwSupport(4)  => 84 字节
    const int OUT_CAPS_SIZE = 84;
    const int OUT_CAPS_NAME_OFFSET = 8;
    const int OUT_CAPS_NAME_BYTES = 64;

    static int Main(string[] args)
    {
        string deviceArg = null;
        int rate = 48000;
        int channels = 1;
        int frameMs = 20;
        bool list = false;
        bool listRecord = false;
        bool defaults = false;

        for (int i = 0; i < args.Length; i++)
        {
            switch (args[i])
            {
                case "--list": list = true; break;
                case "--list-record": listRecord = true; break;
                case "--defaults": defaults = true; break;
                case "--lang": if (i + 1 < args.Length) Lang = args[++i].StartsWith("zh") ? "zh" : "en"; break;
                case "--device": if (i + 1 < args.Length) deviceArg = args[++i]; break;
                case "--rate": if (i + 1 < args.Length) rate = int.Parse(args[++i]); break;
                case "--channels": if (i + 1 < args.Length) channels = int.Parse(args[++i]); break;
                case "--frame-ms": if (i + 1 < args.Length) frameMs = int.Parse(args[++i]); break;
            }
        }

        if (list) { ListDevices(); return 0; }
        if (listRecord) { ListRecordingDevices(); return 0; }
        if (defaults) { PrintDefaults(); return 0; }

        IntPtr devId = ResolveDevice(deviceArg);

        var fmt = new WAVEFORMATEX();
        fmt.wFormatTag = 1; // WAVE_FORMAT_PCM
        fmt.nChannels = (ushort)channels;
        fmt.nSamplesPerSec = (uint)rate;
        fmt.wBitsPerSample = 16;
        fmt.nBlockAlign = (ushort)(channels * 2);
        fmt.nAvgBytesPerSec = (uint)(rate * channels * 2);
        fmt.cbSize = 0;

        IntPtr hwo;
        IntPtr hEvent = CreateEvent(IntPtr.Zero, true, false, null);
        // 用事件通知而不是轮询：Windows 的 Sleep 精度只有 15.6ms，
        // 轮询会把 20ms 的节拍拖成 25ms，听起来就是断断续续。
        int rc = waveOutOpen(out hwo, devId, ref fmt, hEvent, IntPtr.Zero, CALLBACK_EVENT);
        if (rc != 0)
        {
            Err(M("waveOutOpen 失败，错误码 ", "waveOutOpen failed, error code ") + rc);
            return 2;
        }

        int chunkBytes = rate * frameMs / 1000 * channels * 2;
        if (chunkBytes < 256) chunkBytes = 256;
        if ((chunkBytes & 1) != 0) chunkBytes++;

        int hdrSize = Marshal.SizeOf(typeof(WAVEHDR));
        IntPtr mem0 = Marshal.AllocHGlobal(chunkBytes);
        IntPtr mem1 = Marshal.AllocHGlobal(chunkBytes);
        IntPtr hdr0 = Marshal.AllocHGlobal(hdrSize);
        IntPtr hdr1 = Marshal.AllocHGlobal(hdrSize);

        InitHeader(hdr0, mem0, chunkBytes, hdrSize);
        InitHeader(hdr1, mem1, chunkBytes, hdrSize);
        waveOutPrepareHeader(hwo, hdr0, hdrSize);
        waveOutPrepareHeader(hwo, hdr1, hdrSize);

        Stream input = Console.OpenStandardInput();
        Stream ack = StdOut;
        byte[] buf = new byte[chunkBytes];

        // 预填两块，形成双缓冲
        if (!ReadInto(input, buf, chunkBytes)) return 0;
        Marshal.Copy(buf, 0, mem0, chunkBytes);
        Play(hwo, hdr0, hdrSize);

        if (!ReadInto(input, buf, chunkBytes)) { Thread.Sleep(60); return 0; }
        Marshal.Copy(buf, 0, mem1, chunkBytes);
        Play(hwo, hdr1, hdrSize);

        while (true)
        {
            if (WaitForSingleObject(hEvent, 1000) == WAIT_TIMEOUT) break;
            ResetEvent(hEvent);

            bool progressed = false;
            if (IsDone(hdr0))
            {
                Ack(ack);
                if (!ReadInto(input, buf, chunkBytes)) break;
                Marshal.Copy(buf, 0, mem0, chunkBytes);
                Play(hwo, hdr0, hdrSize);
                progressed = true;
            }
            if (IsDone(hdr1))
            {
                Ack(ack);
                if (!ReadInto(input, buf, chunkBytes)) break;
                Marshal.Copy(buf, 0, mem1, chunkBytes);
                Play(hwo, hdr1, hdrSize);
                progressed = true;
            }
            if (!progressed) Thread.Yield();
        }

        Thread.Sleep(60);
        waveOutReset(hwo);
        waveOutClose(hwo);
        CloseHandle(hEvent);
        Marshal.FreeHGlobal(mem0);
        Marshal.FreeHGlobal(mem1);
        Marshal.FreeHGlobal(hdr0);
        Marshal.FreeHGlobal(hdr1);
        return 0;
    }

    static bool IsDone(IntPtr hdr)
    {
        var h = (WAVEHDR)Marshal.PtrToStructure(hdr, typeof(WAVEHDR));
        return (h.dwFlags & WHDR_DONE) != 0;
    }

    static void InitHeader(IntPtr hdr, IntPtr data, int length, int hdrSize)
    {
        var h = new WAVEHDR();
        h.lpData = data;
        h.dwBufferLength = (uint)length;
        h.dwBytesRecorded = 0;
        h.dwUser = IntPtr.Zero;
        h.dwFlags = 0;
        h.dwLoops = 0;
        h.lpNext = IntPtr.Zero;
        h.reserved = IntPtr.Zero;
        Marshal.StructureToPtr(h, hdr, false);
    }

    // 写入前清掉 DONE 标志，否则下面的 IsDone 会误判为「已经播完」
    static void Play(IntPtr hwo, IntPtr hdr, int hdrSize)
    {
        var h = (WAVEHDR)Marshal.PtrToStructure(hdr, typeof(WAVEHDR));
        h.dwFlags &= ~WHDR_DONE;
        Marshal.StructureToPtr(h, hdr, false);
        waveOutWrite(hwo, hdr, hdrSize);
    }

    static void Ack(Stream s)
    {
        s.WriteByte(46); // '.'
        s.Flush();
    }

    static bool ReadInto(Stream s, byte[] buf, int count)
    {
        int got = 0;
        while (got < count)
        {
            int n;
            try { n = s.Read(buf, got, count - got); }
            catch (IOException) { return false; }
            if (n <= 0) return false;
            got += n;
        }
        return true;
    }

    static int Count() { return waveOutGetNumDevs(); }

    // 控制台代码页（简体中文系统通常是 936）会把设备名搞成乱码，
    // 所以这里绕开 Console，直接把 UTF-8 字节写到标准输出/错误。
    static readonly Stream StdOut = Console.OpenStandardOutput();
    static readonly Stream StdErr = Console.OpenStandardError();

    static void Out(string s) { WriteUtf8(StdOut, s); }
    static void Err(string s) { WriteUtf8(StdErr, s); }

    static void WriteUtf8(Stream s, string text)
    {
        byte[] b = System.Text.Encoding.UTF8.GetBytes(text + "\n");
        s.Write(b, 0, b.Length);
        s.Flush();
    }

    static string DeviceName(int i)
    {
        byte[] caps = new byte[OUT_CAPS_SIZE];
        int rc = waveOutGetDevCapsW(new IntPtr(i), caps, OUT_CAPS_SIZE);
        if (rc != 0) return M("(未知设备)", "(unknown device)");
        string name = System.Text.Encoding.Unicode.GetString(caps, OUT_CAPS_NAME_OFFSET, OUT_CAPS_NAME_BYTES);
        int z = name.IndexOf('\0');
        if (z >= 0) name = name.Substring(0, z);
        return name.Trim();
    }

    static void ListDevices()
    {
        int n = Count();
        if (n == 0)
        {
            Out(M("(没有找到任何音频播放设备)", "(no audio playback devices found)"));
            return;
        }
        for (int i = 0; i < n; i++)
            Out(i + "\t" + DeviceName(i));
    }

    static string RecordingDeviceName(IntPtr id)
    {
        byte[] caps = new byte[IN_CAPS_SIZE];
        int rc = waveInGetDevCapsW(id, caps, IN_CAPS_SIZE);
        if (rc != 0) return M("(未知设备)", "(unknown device)");
        string name = System.Text.Encoding.Unicode.GetString(caps, IN_CAPS_NAME_OFFSET, IN_CAPS_NAME_BYTES);
        int z = name.IndexOf('\0');
        if (z >= 0) name = name.Substring(0, z);
        return name.Trim();
    }

    static void ListRecordingDevices()
    {
        int n = waveInGetNumDevs();
        if (n == 0)
        {
            Out(M("(没有找到任何录音设备)", "(no audio recording devices found)"));
            return;
        }
        for (int i = 0; i < n; i++)
            Out(i + "\t" + RecordingDeviceName(new IntPtr(i)));
    }

    // WAVE_MAPPER 传给 GetDevCaps 就是「系统默认设备」
    static void PrintDefaults()
    {
        string play = DefaultEndpointName(0, 0) ?? DeviceName(-1);
        string playComm = DefaultEndpointName(0, 2) ?? play;
        string rec = DefaultEndpointName(1, 0) ?? RecordingDeviceName(WAVE_MAPPER);
        string recComm = DefaultEndpointName(1, 2) ?? rec;
        Out("playback\t" + play);
        Out("playback-comm\t" + playComm);
        Out("recording\t" + rec);
        Out("recording-comm\t" + recComm);
    }

    static string DefaultEndpointName(int dataFlow, int role)
    {
        IMMDeviceEnumerator enumerator = null;
        IMMDevice device = null;
        IPropertyStore store = null;
        try
        {
            enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject());
            IMMDevice dev;
            if (enumerator.GetDefaultAudioEndpoint(dataFlow, role, out dev) != 0 || dev == null) return null;
            device = dev;

            IPropertyStore ps;
            if (device.OpenPropertyStore(0 /* STGM_READ */, out ps) != 0 || ps == null) return null;
            store = ps;

            var key = new PROPERTYKEY
            {
                fmtid = new Guid("a45c254e-df1c-4efd-8020-67d146a850e0"),
                pid = 14 // PKEY_Device_FriendlyName
            };
            PROPVARIANT pv;
            if (store.GetValue(ref key, out pv) != 0) return null;
            if (pv.vt != 31 /* VT_LPWSTR */) { PropVariantClear(ref pv); return null; }
            string name = Marshal.PtrToStringUni(pv.pointerValue);
            PropVariantClear(ref pv);
            return name;
        }
        catch { return null; }
        finally
        {
            if (store != null) Marshal.ReleaseComObject(store);
            if (device != null) Marshal.ReleaseComObject(device);
            if (enumerator != null) Marshal.ReleaseComObject(enumerator);
        }
    }

    static IntPtr ResolveDevice(string s)
    {
        if (string.IsNullOrEmpty(s) || s == "default" || s == "-1") return WAVE_MAPPER;

        int idx;
        if (int.TryParse(s, out idx))
        {
            if (idx >= 0 && idx < Count()) return new IntPtr(idx);
            Err(M("设备序号 ", "Device index ") + idx + M(" 不存在，改用系统默认设备。", " does not exist, using the system default device."));
            return WAVE_MAPPER;
        }

        string want = s.ToLowerInvariant();
        int n = Count();
        for (int i = 0; i < n; i++)
        {
            if (DeviceName(i).ToLowerInvariant().IndexOf(want, StringComparison.Ordinal) >= 0)
                return new IntPtr(i);
        }
        Err(M("找不到名字包含「" + s + "」的播放设备，改用系统默认设备。",
              "No playback device name contains \"" + s + "\", using the system default device."));
        return WAVE_MAPPER;
    }
}
