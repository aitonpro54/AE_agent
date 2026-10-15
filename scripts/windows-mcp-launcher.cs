// WinExe: preserve MCP byte streams without creating a console window.
using System;
using System.ComponentModel;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;

internal static class WindowsMcpLauncher
{
    const uint CREATE_NO_WINDOW = 0x08000000,
        EXTENDED_STARTUPINFO_PRESENT = 0x00080000, STARTF_USESTDHANDLES = 0x100;
    const uint KILL_ON_JOB_CLOSE = 0x2000, SILENT_BREAKAWAY_OK = 0x1000;
    static readonly IntPtr InvalidHandle = new IntPtr(-1);

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct StartupInfo {
        public int cb; public string reserved, desktop, title;
        public uint x, y, xSize, ySize, xCountChars, yCountChars, fillAttribute, flags;
        public short showWindow, reservedSize; public IntPtr reservedBytes, input, output, error;
    }
    [StructLayout(LayoutKind.Sequential)]
    struct StartupInfoEx { public StartupInfo info; public IntPtr attributes; }
    [StructLayout(LayoutKind.Sequential)]
    struct ProcessInfo { public IntPtr process, thread; public uint processId, threadId; }
    [StructLayout(LayoutKind.Sequential)]
    struct BasicLimit {
        public long processTime, jobTime; public uint flags;
        public UIntPtr minWorkingSet, maxWorkingSet; public uint activeProcessLimit;
        public UIntPtr affinity; public uint priority, schedulingClass;
    }
    [StructLayout(LayoutKind.Sequential)]
    struct IoCounters { public ulong readOps, writeOps, otherOps, readBytes, writeBytes, otherBytes; }
    [StructLayout(LayoutKind.Sequential)]
    struct ExtendedLimit {
        public BasicLimit basic; public IoCounters io;
        public UIntPtr processMemory, jobMemory, peakProcessMemory, peakJobMemory;
    }

    [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr GetStdHandle(int id);
    [DllImport("kernel32.dll")] static extern IntPtr GetCurrentProcess();
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool DuplicateHandle(IntPtr sourceProcess, IntPtr source, IntPtr targetProcess, out IntPtr target, uint access, bool inherit, uint options);
    [DllImport("kernel32.dll", SetLastError = true)] static extern IntPtr CreateJobObjectW(IntPtr security, IntPtr name);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool SetInformationJobObject(IntPtr job, int kind, ref ExtendedLimit value, uint size);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool InitializeProcThreadAttributeList(IntPtr list, int count, uint flags, ref IntPtr size);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool UpdateProcThreadAttribute(IntPtr list, uint flags, IntPtr attribute, IntPtr value, IntPtr size, IntPtr previous, IntPtr returnedSize);
    [DllImport("kernel32.dll")] static extern void DeleteProcThreadAttributeList(IntPtr list);
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern bool CreateProcessW(string application, StringBuilder command, IntPtr processSecurity, IntPtr threadSecurity, bool inherit, uint flags, IntPtr environment, string cwd, ref StartupInfoEx startup, out ProcessInfo process);
    [DllImport("kernel32.dll", SetLastError = true)] static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);
    [DllImport("kernel32.dll", SetLastError = true)] static extern bool GetExitCodeProcess(IntPtr process, out uint code);
    [DllImport("kernel32.dll")] static extern bool TerminateProcess(IntPtr process, uint code);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
    [DllImport("kernel32.dll")] static extern bool WriteFile(IntPtr handle, byte[] data, uint size, out uint written, IntPtr overlapped);

    static void Check(bool value) { if (!value) throw new Win32Exception(Marshal.GetLastWin32Error()); }
    static IntPtr DuplicateStandard(int id) {
        IntPtr original = GetStdHandle(id), result;
        if (original == IntPtr.Zero || original == InvalidHandle) throw new Win32Exception(6);
        Check(DuplicateHandle(GetCurrentProcess(), original, GetCurrentProcess(), out result, 0, true, 2));
        return result;
    }
    // Windows CRT argv escaping, including empty args, quotes and trailing backslashes.
    static string Quote(string value) {
        StringBuilder result = new StringBuilder("\""); int slashes = 0;
        foreach (char c in value) {
            if (c == '\\') { slashes++; continue; }
            if (c == '"') { result.Append('\\', slashes * 2 + 1).Append(c); slashes = 0; continue; }
            result.Append('\\', slashes).Append(c); slashes = 0;
        }
        return result.Append('\\', slashes * 2).Append('"').ToString();
    }

    static int Main(string[] args) {
        IntPtr job = IntPtr.Zero, list = IntPtr.Zero, handles = IntPtr.Zero, jobs = IntPtr.Zero;
        IntPtr[] streams = new IntPtr[3]; ProcessInfo child = new ProcessInfo();
        bool attributesReady = false, completed = false;
        try {
            if (args.Length == 0 || !Path.IsPathRooted(args[0]) || !File.Exists(args[0]))
                throw new ArgumentException("absolute executable required");
            job = CreateJobObjectW(IntPtr.Zero, IntPtr.Zero); Check(job != IntPtr.Zero);
            ExtendedLimit limits = new ExtendedLimit();
            // Kill only the adapter on launcher cancellation. Shared daemons started
            // by the adapter must not inherit this private lifetime job.
            limits.basic.flags = KILL_ON_JOB_CLOSE | SILENT_BREAKAWAY_OK;
            Check(SetInformationJobObject(job, 9, ref limits, (uint)Marshal.SizeOf(limits)));
            for (int i = 0; i < 3; i++) streams[i] = DuplicateStandard(-10 - i);
            IntPtr bytes = IntPtr.Zero;
            InitializeProcThreadAttributeList(IntPtr.Zero, 2, 0, ref bytes);
            list = Marshal.AllocHGlobal(bytes);
            Check(InitializeProcThreadAttributeList(list, 2, 0, ref bytes)); attributesReady = true;
            handles = Marshal.AllocHGlobal(IntPtr.Size * 3);
            Marshal.Copy(streams, 0, handles, 3);
            // PROC_THREAD_ATTRIBUTE_HANDLE_LIST: inherit only the three MCP pipes.
            Check(UpdateProcThreadAttribute(list, 0, new IntPtr(0x20002), handles, new IntPtr(IntPtr.Size * 3), IntPtr.Zero, IntPtr.Zero));
            // Windows 10+ JOB_LIST assigns atomically with creation: cancellation
            // cannot strand a suspended process before a later AssignProcess call.
            jobs = Marshal.AllocHGlobal(IntPtr.Size); Marshal.WriteIntPtr(jobs, job);
            Check(UpdateProcThreadAttribute(list, 0, new IntPtr(0x2000d), jobs, new IntPtr(IntPtr.Size), IntPtr.Zero, IntPtr.Zero));
            StartupInfoEx startup = new StartupInfoEx(); startup.info.cb = Marshal.SizeOf(startup);
            startup.info.flags = STARTF_USESTDHANDLES;
            startup.info.input = streams[0]; startup.info.output = streams[1]; startup.info.error = streams[2];
            startup.attributes = list;
            StringBuilder command = new StringBuilder();
            foreach (string arg in args) { if (command.Length > 0) command.Append(' '); command.Append(Quote(arg)); }
            Check(CreateProcessW(args[0], command, IntPtr.Zero, IntPtr.Zero, true,
                CREATE_NO_WINDOW | EXTENDED_STARTUPINFO_PRESENT,
                IntPtr.Zero, null, ref startup, out child));
            CloseHandle(child.thread); child.thread = IntPtr.Zero;
            for (int i = 0; i < streams.Length; i++) { CloseHandle(streams[i]); streams[i] = IntPtr.Zero; }
            Check(WaitForSingleObject(child.process, 0xffffffff) == 0);
            uint exit; Check(GetExitCodeProcess(child.process, out exit)); completed = true;
            return unchecked((int)exit);
        } catch (Exception error) {
            // Diagnostics only on stderr; never log argv/environment/credentials.
            int code = error is Win32Exception ? ((Win32Exception)error).NativeErrorCode : 87;
            byte[] message = Encoding.UTF8.GetBytes("AE MCP launcher failed (Windows error " + code + ").\n");
            uint written; WriteFile(GetStdHandle(-12), message, (uint)message.Length, out written, IntPtr.Zero);
            return 126;
        } finally {
            if (!completed && child.process != IntPtr.Zero) TerminateProcess(child.process, 126);
            if (child.thread != IntPtr.Zero) CloseHandle(child.thread);
            if (child.process != IntPtr.Zero) CloseHandle(child.process);
            if (job != IntPtr.Zero) CloseHandle(job);
            foreach (IntPtr stream in streams) if (stream != IntPtr.Zero) CloseHandle(stream);
            if (attributesReady) DeleteProcThreadAttributeList(list);
            if (list != IntPtr.Zero) Marshal.FreeHGlobal(list);
            if (handles != IntPtr.Zero) Marshal.FreeHGlobal(handles);
            if (jobs != IntPtr.Zero) Marshal.FreeHGlobal(jobs);
        }
    }
}
