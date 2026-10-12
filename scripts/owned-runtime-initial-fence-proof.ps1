#requires -Version 5.1
[CmdletBinding()]
param(
    [switch]$RunNativeProof,
    [switch]$BuildOnly,
    [switch]$TimeoutBarrierProof,
    [switch]$AllowTemporaryDosDeviceProof
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if (([int]$RunNativeProof.IsPresent + [int]$BuildOnly.IsPresent + [int]$TimeoutBarrierProof.IsPresent) -ne 1) {
    throw 'Choose exactly one explicit parent action: -BuildOnly, -RunNativeProof or -TimeoutBarrierProof (after independent source GO).'
}

# Test-only APIs, no AE/daemon/service/config access. All writable paths are new
# descendants of one independently pinned scratch container. There is no cleanup.
$nativeSource = @'
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading.Tasks;
using Microsoft.Win32.SafeHandles;

namespace InitialFenceProof {
  public sealed class Snapshot {
    public string volumeGuid, volumeSerialHex, fileIdHex, canonicalPath;
  }
  public sealed class LockSymlinkReadback {
    public Snapshot identity;
    public uint fileAttributes, reparseTag;
    public bool noFollow;
  }
  public sealed class Raw {
    public bool ok; public int win32Error; public uint ntStatus;
    public Raw(bool value, int error) { ok=value; win32Error=error; }
  }
  public sealed class Witness : IDisposable {
    internal SafeFileHandle Handle;
    public readonly string DrivePath;
    public readonly Snapshot Original;
    public readonly bool IsDirectory;
    public string CurrentKnownPath { get; internal set; }
    public bool IsParked { get; internal set; }
    internal Witness(SafeFileHandle handle, string path, bool directory) {
      Handle=handle; DrivePath=path; CurrentKnownPath=path; IsDirectory=directory;
      try { Original=Native.Read(handle, directory); } catch { handle.Dispose(); throw; }
    }
    public Snapshot Fresh() { return Native.Read(Handle, true); }
    public void Dispose() { Handle.Dispose(); IsParked=true; }
  }
  public sealed class Chain : IDisposable {
    public List<Witness> Held=new List<Witness>();
    public Witness Leaf { get { return Held[Held.Count-1]; } }
    public void Dispose() { for(int i=Held.Count-1;i>=0;i--) Held[i].Dispose(); }
  }
  public sealed class Channel : IDisposable {
    public readonly Process Process;
    internal readonly SafeProcessHandle ProcessHandle;
    public readonly string InstanceId;
    public Task<string> Pending;
    private bool inputClosed;
    private static string QuoteArg(string value) {
      var text=new StringBuilder("\"");int slashes=0;
      foreach(char ch in value) {
        if(ch=='\\'){slashes++;continue;}
        if(ch=='"'){text.Append('\\',slashes*2+1);text.Append(ch);}
        else {text.Append('\\',slashes);text.Append(ch);}
        slashes=0;
      }
      text.Append('\\',slashes*2);text.Append('"');return text.ToString();
    }
    public Channel(string executable, string root, string instance) {
      if(root.IndexOf('"')>=0 || instance.IndexOf('"')>=0) throw new ArgumentException("unsafe argv");
      InstanceId=instance;
      var info=new ProcessStartInfo(executable, "--fixture-root "+QuoteArg(root)+" --factory-instance "+QuoteArg(instance));
      info.UseShellExecute=false; info.CreateNoWindow=true; info.WindowStyle=ProcessWindowStyle.Hidden;
      info.RedirectStandardInput=true; info.RedirectStandardOutput=true; info.RedirectStandardError=true;
      info.StandardOutputEncoding=new UTF8Encoding(false,true); info.StandardErrorEncoding=new UTF8Encoding(false,true);
      Process=new Process(); Process.StartInfo=info;
      if(!Process.Start()) throw new InvalidOperationException("child did not start");
      ProcessHandle=Process.SafeHandle; // Hold the original process instance, never reopen by PID.
      Pending=ReadBounded(Process.StandardOutput);
    }
    private static async Task<string> ReadBounded(StreamReader reader) {
      var text=new StringBuilder(); var buffer=new char[1];
      for(;;) {
        int count=await reader.ReadAsync(buffer,0,1).ConfigureAwait(false);
        if(count==0) { if(text.Length==0) return null; throw new IOException("partial child ACK"); }
        if(buffer[0]=='\n') return text.ToString();
        if(text.Length>=8191) throw new IOException("child ACK exceeds 8KiB");
        text.Append(buffer[0]);
      }
    }
    public void Send(string command) {
      if(command.Length>256) throw new ArgumentException("driver command length");
      Process.StandardInput.WriteLine(command); Process.StandardInput.Flush();
      if(Pending==null) Pending=ReadBounded(Process.StandardOutput);
    }
    public string Receive(int milliseconds) {
      if(Pending==null) throw new InvalidOperationException("no pending ACK");
      if(!Pending.Wait(milliseconds)) return null; // Retain the same pending read; no replay.
      string value=Pending.GetAwaiter().GetResult(); Pending=null; return value;
    }
    public bool ExactExited(int milliseconds) { return Native.WaitForSingleObject(ProcessHandle, (uint)milliseconds)==0; }
    public uint ExactExitCode() { uint code; if(!Native.GetExitCodeProcess(ProcessHandle,out code)) throw new Win32Exception(); return code; }
    public Raw TerminateExact() { bool value=Native.TerminateProcess(ProcessHandle,91); return new Raw(value,value?0:Marshal.GetLastWin32Error()); }
    public void CloseInput() { if(inputClosed)return;inputClosed=true;Process.StandardInput.Close(); }
    public void SendInvalidByte() { var stream=Process.StandardInput.BaseStream; stream.WriteByte(0xff); stream.WriteByte(10); stream.Flush(); if(Pending==null) Pending=ReadBounded(Process.StandardOutput); }
    public void SendOverlongProofLine() { Process.StandardInput.WriteLine(new string('x',257)); Process.StandardInput.Flush(); if(Pending==null) Pending=ReadBounded(Process.StandardOutput); }
    public void SendPartialCommandProof() { Process.StandardInput.Write("dispose"); Process.StandardInput.Flush(); if(Pending==null) Pending=ReadBounded(Process.StandardOutput); }
    public string BoundedStderr() { if(!ExactExited(0)) return "child still live"; char[] chars=new char[1024]; int n=Process.StandardError.Read(chars,0,chars.Length); return new string(chars,0,n); }
    public void Dispose() { if(ExactExited(0)) Process.Dispose(); }
  }

  public static class Native {
    const uint ReadAttributes=0x80, Sync=0x100000, ShareAll=7;
    [StructLayout(LayoutKind.Sequential)] struct UnicodeString { public ushort Length, MaximumLength; public IntPtr Buffer; }
    [StructLayout(LayoutKind.Sequential)] struct ObjectAttributes { public uint Length; public IntPtr Root; public IntPtr Name; public uint Attributes; public IntPtr Security, Quality; }
    [StructLayout(LayoutKind.Sequential)] struct IoStatus { public IntPtr Status, Information; }
    [DllImport("ntdll.dll")] static extern int NtCreateFile(out IntPtr h,uint access,ref ObjectAttributes oa,out IoStatus io,IntPtr size,uint attributes,uint share,uint disposition,uint options,IntPtr ea,uint eaLength);
    [DllImport("ntdll.dll")] static extern uint RtlNtStatusToDosError(int status);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern SafeFileHandle CreateFileW(string path,uint access,uint share,IntPtr security,uint disposition,uint flags,IntPtr template);
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetFileInformationByHandleEx(SafeFileHandle h,int cls,IntPtr buffer,uint length);
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetFileInformationByHandle(SafeFileHandle h,int cls,IntPtr buffer,uint length);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern uint GetFinalPathNameByHandleW(SafeFileHandle h,StringBuilder path,uint size,uint flags);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool GetVolumeInformationByHandleW(SafeFileHandle h,IntPtr name,uint nameSize,IntPtr serial,IntPtr max,IntPtr flags,StringBuilder fs,uint fsSize);
    [DllImport("kernel32.dll",SetLastError=true)] static extern uint GetFileType(SafeFileHandle h);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern uint GetVolumeNameForVolumeMountPointW(string root,StringBuilder volume,uint length);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] public static extern bool MoveFileExW(string existing,string target,uint flags);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] public static extern bool DeleteFileW(string path);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] public static extern bool RemoveDirectoryW(string path);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] public static extern bool CreateHardLinkW(string link,string target,IntPtr security);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]
    [return: MarshalAs(UnmanagedType.U1)]
    public static extern bool CreateSymbolicLinkW(string link,string target,uint flags);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] public static extern uint QueryDosDeviceW(string name,StringBuilder value,uint length);
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool WriteFile(SafeFileHandle h,byte[] bytes,uint length,out uint written,IntPtr overlap);
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool DeviceIoControl(SafeFileHandle h,uint code,byte[] input,uint length,IntPtr output,uint outputLength,out uint returned,IntPtr overlap);
    [DllImport("kernel32.dll",SetLastError=true)] public static extern uint WaitForSingleObject(SafeProcessHandle h,uint milliseconds);
    [DllImport("kernel32.dll",SetLastError=true)] public static extern bool GetExitCodeProcess(SafeProcessHandle h,out uint code);
    [DllImport("kernel32.dll",SetLastError=true)] public static extern bool TerminateProcess(SafeProcessHandle h,uint code);

    static void Check(bool result) { if(!result) throw new Win32Exception(Marshal.GetLastWin32Error()); }
    static IntPtr Query(SafeFileHandle h,int cls,int size) {
      IntPtr buffer=Marshal.AllocHGlobal(size);
      if(!GetFileInformationByHandleEx(h,cls,buffer,(uint)size)) { int e=Marshal.GetLastWin32Error(); Marshal.FreeHGlobal(buffer); throw new Win32Exception(e); }
      return buffer;
    }
    static SafeFileHandle Relative(SafeFileHandle parent,string name,uint access,uint share,uint disposition,uint options) {
      if(String.IsNullOrEmpty(name)||name.IndexOfAny(new char[]{'\\','/',':','\0'})>=0||name=="."||name==".."||name.Length>255) throw new ArgumentException("single component required");
      IntPtr chars=Marshal.StringToHGlobalUni(name), us=IntPtr.Zero;
      try {
        var unicode=new UnicodeString{Length=(ushort)(name.Length*2),MaximumLength=(ushort)(name.Length*2),Buffer=chars};
        us=Marshal.AllocHGlobal(Marshal.SizeOf(typeof(UnicodeString))); Marshal.StructureToPtr(unicode,us,false);
        var oa=new ObjectAttributes{Length=(uint)Marshal.SizeOf(typeof(ObjectAttributes)),Root=parent.DangerousGetHandle(),Name=us,Attributes=0x40};
        IoStatus io; IntPtr raw; int status=NtCreateFile(out raw,access,ref oa,out io,IntPtr.Zero,0x80,share,disposition,options,IntPtr.Zero,0);
        if(status<0) throw new Win32Exception((int)RtlNtStatusToDosError(status),"NtCreateFile status="+unchecked((uint)status).ToString("x8"));
        return new SafeFileHandle(raw,true);
      } finally { if(us!=IntPtr.Zero) Marshal.FreeHGlobal(us); Marshal.FreeHGlobal(chars); }
    }
    internal static Snapshot Read(SafeFileHandle h,bool directory) {
      if(GetFileType(h)!=1) throw new InvalidOperationException("not local disk");
      IntPtr attr=Query(h,9,8);
      try { uint flags=unchecked((uint)Marshal.ReadInt32(attr)); if((flags&0x00441400)!=0 || ((flags&16)!=0)!=directory) throw new InvalidOperationException("reparse/offline/recall/type refused"); } finally {Marshal.FreeHGlobal(attr);}
      IntPtr standard=Query(h,1,24);
      try { if(Marshal.ReadByte(standard,20)!=0 || (Marshal.ReadByte(standard,21)!=0)!=directory) throw new InvalidOperationException("delete pending/type refused"); } finally {Marshal.FreeHGlobal(standard);}
      if(directory) {
        IntPtr sensitive=Query(h,23,4);
        try { if((Marshal.ReadInt32(sensitive)&1)!=0) throw new InvalidOperationException("case-sensitive directory refused"); } finally {Marshal.FreeHGlobal(sensitive);}
      }
      var fs=new StringBuilder(32); Check(GetVolumeInformationByHandleW(h,IntPtr.Zero,0,IntPtr.Zero,IntPtr.Zero,IntPtr.Zero,fs,32));
      if(fs.ToString()!="NTFS") throw new InvalidOperationException("NTFS required");
      IntPtr id=Query(h,18,24); string serial,fileId;
      try { serial=unchecked((ulong)Marshal.ReadInt64(id)).ToString("x16"); byte[] bytes=new byte[16]; Marshal.Copy(IntPtr.Add(id,8),bytes,0,16); fileId=BitConverter.ToString(bytes).Replace("-","").ToLowerInvariant(); } finally {Marshal.FreeHGlobal(id);}
      var path=new StringBuilder(32761); uint n=GetFinalPathNameByHandleW(h,path,32761,1);
      if(n==0||n>=32761) throw new Win32Exception(Marshal.GetLastWin32Error(),"canonical GUID query");
      string canonical=path.ToString();
      if(canonical.Length<49 || !canonical.StartsWith(@"\\?\Volume{",StringComparison.Ordinal) || canonical[47]!='}' || canonical[48]!='\\') throw new InvalidOperationException("canonical volume GUID required");
      Guid parsed; if(!Guid.TryParse(canonical.Substring(10,38),out parsed)) throw new InvalidOperationException("invalid volume GUID");
      return new Snapshot{volumeGuid=canonical.Substring(0,49),volumeSerialHex=serial,fileIdHex=fileId,canonicalPath=canonical};
    }
    public static bool Same(Snapshot a,Snapshot b) {
      return a.volumeSerialHex==b.volumeSerialHex && a.fileIdHex==b.fileIdHex && String.Equals(a.volumeGuid,b.volumeGuid,StringComparison.OrdinalIgnoreCase) && String.Equals(a.canonicalPath,b.canonicalPath,StringComparison.OrdinalIgnoreCase);
    }
    public static void RequireHeld(Witness w) {
      if(w.IsParked || w.Handle.IsClosed || w.Handle.IsInvalid) throw new InvalidOperationException("parked witness cannot authorize open/write/child: "+w.DrivePath);
    }
    // Only validate an ALREADY HELD, tracked own node for parking/verified moves.
    // Intentional attributes do not authorize path traversal, reopen or mutation.
    public static Snapshot VerifyOwnHeldPinAt(Witness w,string knownPath) {
      RequireHeld(w);
      if(GetFileType(w.Handle)!=1) throw new InvalidOperationException("held own node is not disk");
      IntPtr id=Query(w.Handle,18,24);string serial,fileId;
      try {serial=unchecked((ulong)Marshal.ReadInt64(id)).ToString("x16");byte[] bytes=new byte[16];Marshal.Copy(IntPtr.Add(id,8),bytes,0,16);fileId=BitConverter.ToString(bytes).Replace("-","").ToLowerInvariant();}finally{Marshal.FreeHGlobal(id);}
      var path=new StringBuilder(32761);uint n=GetFinalPathNameByHandleW(w.Handle,path,32761,1);
      if(n==0||n>=32761) throw new Win32Exception(Marshal.GetLastWin32Error(),"held own canonical query");
      if(knownPath.Length<3 || knownPath[1]!=':' || knownPath[2]!='\\') throw new InvalidOperationException("known original subtree path required");
      string expected=w.Original.volumeGuid+knownPath.Substring(3);
      if(serial!=w.Original.volumeSerialHex || fileId!=w.Original.fileIdHex || !String.Equals(path.ToString(),expected,StringComparison.OrdinalIgnoreCase)) throw new InvalidOperationException("held own original pin/current-known-path mismatch");
      return new Snapshot{volumeGuid=w.Original.volumeGuid,volumeSerialHex=serial,fileIdHex=fileId,canonicalPath=path.ToString()};
    }
    public static void ParkOwnWitness(Witness w) { VerifyOwnHeldPinAt(w,w.CurrentKnownPath);w.Dispose(); }
    public static void RecordVerifiedOwnMove(Witness w,string oldPrefix,string newPrefix) {
      if(String.Equals(w.CurrentKnownPath,oldPrefix,StringComparison.OrdinalIgnoreCase))w.CurrentKnownPath=newPrefix;
      else if(w.CurrentKnownPath.StartsWith(oldPrefix+"\\",StringComparison.OrdinalIgnoreCase))w.CurrentKnownPath=newPrefix+w.CurrentKnownPath.Substring(oldPrefix.Length);
    }
    public static Snapshot ReholdOriginalFromHeldParent(Witness w,Witness parent) {
      if(!w.IsParked) throw new InvalidOperationException("rehold requires parked original ref");
      RequireHeld(parent);VerifyOwnHeldPinAt(parent,parent.CurrentKnownPath);
      Read(parent.Handle,true); // Reopen still requires strict no-reparse/case/type profile.
      if(!String.Equals(Path.GetDirectoryName(w.CurrentKnownPath),parent.CurrentKnownPath,StringComparison.OrdinalIgnoreCase)) throw new InvalidOperationException("rehold parent is not known original parent");
      var h=Relative(parent.Handle,Path.GetFileName(w.CurrentKnownPath),ReadAttributes|Sync,ShareAll,1,w.IsDirectory?0x00200020u:0x00200060u);
      try {
        var actual=Read(h,w.IsDirectory);
        if(actual.volumeSerialHex!=w.Original.volumeSerialHex || actual.fileIdHex!=w.Original.fileIdHex || !String.Equals(actual.volumeGuid,w.Original.volumeGuid,StringComparison.OrdinalIgnoreCase) || !String.Equals(actual.canonicalPath,w.Original.volumeGuid+w.CurrentKnownPath.Substring(3),StringComparison.OrdinalIgnoreCase)) throw new InvalidOperationException("rehold refuses changed original physical ID");
        w.Handle=h;w.IsParked=false;return actual;
      }catch{h.Dispose();throw;}
    }
    public static Chain OpenChain(string path) {
      string absolute=Path.GetFullPath(path).TrimEnd('\\');
      if(absolute.Length<3||absolute[1]!=':'||absolute[2]!='\\'||absolute.StartsWith(@"\\")) throw new ArgumentException("absolute drive path only");
      var device=new StringBuilder(1024); if(QueryDosDeviceW(absolute.Substring(0,2),device,1024)==0) throw new Win32Exception();
      if(!device.ToString().StartsWith(@"\Device\HarddiskVolume",StringComparison.Ordinal)) throw new InvalidOperationException("SUBST/device refused");
      var volume=new StringBuilder(64); Check(GetVolumeNameForVolumeMountPointW(absolute.Substring(0,3),volume,64)!=0);
      var chain=new Chain();
      try {
        var h=CreateFileW(volume.ToString(),ReadAttributes|Sync,ShareAll,IntPtr.Zero,3,0x02200000,IntPtr.Zero); if(h.IsInvalid) throw new Win32Exception();
        chain.Held.Add(new Witness(h,absolute.Substring(0,3),true));
        if(chain.Leaf.Original.canonicalPath!=chain.Leaf.Original.volumeGuid) throw new InvalidOperationException("not volume root");
        foreach(string name in absolute.Substring(3).Split(new char[]{'\\'},StringSplitOptions.RemoveEmptyEntries)) {
          h=Relative(chain.Leaf.Handle,name,ReadAttributes|Sync,ShareAll,1,0x00200020);
          chain.Held.Add(new Witness(h,Path.Combine(chain.Leaf.DrivePath,name),true));
        }
        return chain;
      } catch {chain.Dispose();throw;}
    }
    public static void AssertFresh(string path,Witness original) {
      RequireHeld(original);
      using(var chain=OpenChain(path)) if(!Same(chain.Leaf.Original,original.Original)) throw new InvalidOperationException("original pin mismatch: "+path);
    }
    public static void AssertFreshFile(string path,Witness original) {
      RequireHeld(original);
      using(var chain=OpenChain(Path.GetDirectoryName(path)))
      using(var h=Relative(chain.Leaf.Handle,Path.GetFileName(path),ReadAttributes|Sync,ShareAll,1,0x00200020))
        if(!Same(Read(h,false),original.Original)) throw new InvalidOperationException("original file pin mismatch: "+path);
    }
    // Fixed test-fixture readback only; strict Native.Read is unchanged. The
    // reparse node is queried through the original held parent, never followed.
    public static LockSymlinkReadback ReadLockSymlinkProof(Witness parent) {
      AssertFresh(parent.DrivePath,parent);
      const string name=".initial-owned-fence.lock";
      using(var h=Relative(parent.Handle,name,ReadAttributes|Sync,ShareAll,1,0x00200060)) {
        if(GetFileType(h)!=1) throw new InvalidOperationException("symlink setup is not disk file");
        IntPtr attr=Query(h,9,8);uint flags,tag;
        try {flags=unchecked((uint)Marshal.ReadInt32(attr));tag=unchecked((uint)Marshal.ReadInt32(attr,4));}finally{Marshal.FreeHGlobal(attr);}
        if((flags&0x400)==0 || (flags&0x00441010)!=0 || tag!=0xA000000Cu) throw new InvalidOperationException("actual non-directory IO_REPARSE_TAG_SYMLINK required");
        IntPtr id=Query(h,18,24);string serial,fileId;
        try {serial=unchecked((ulong)Marshal.ReadInt64(id)).ToString("x16");byte[] bytes=new byte[16];Marshal.Copy(IntPtr.Add(id,8),bytes,0,16);fileId=BitConverter.ToString(bytes).Replace("-","").ToLowerInvariant();}finally{Marshal.FreeHGlobal(id);}
        var path=new StringBuilder(32761);uint n=GetFinalPathNameByHandleW(h,path,32761,1);
        if(n==0||n>=32761) throw new Win32Exception(Marshal.GetLastWin32Error(),"no-follow symlink canonical query");
        string expected=parent.Original.canonicalPath+"\\"+name;
        if(serial!=parent.Original.volumeSerialHex || !String.Equals(path.ToString(),expected,StringComparison.OrdinalIgnoreCase)) throw new InvalidOperationException("symlink setup escaped original held parent");
        return new LockSymlinkReadback{identity=new Snapshot{volumeGuid=parent.Original.volumeGuid,volumeSerialHex=serial,fileIdHex=fileId,canonicalPath=path.ToString()},fileAttributes=flags,reparseTag=tag,noFollow=true};
      }
    }
    public static Witness NewDirectory(Witness parent,string name) {
      AssertFresh(parent.DrivePath,parent);
      var h=Relative(parent.Handle,name,ReadAttributes|Sync,ShareAll,2,0x21);
      return new Witness(h,Path.Combine(parent.DrivePath,name),true);
    }
    public static Witness OpenChildDirectory(Witness parent,string name) {
      AssertFresh(parent.DrivePath,parent);
      return new Witness(Relative(parent.Handle,name,ReadAttributes|Sync,ShareAll,1,0x00200020),Path.Combine(parent.DrivePath,name),true);
    }
    public static Witness NewFile(Witness parent,string name,byte[] contents) {
      if(contents==null) throw new ArgumentNullException("contents"); // Reject before FILE_CREATE.
      AssertFresh(parent.DrivePath,parent);
      using(var write=Relative(parent.Handle,name,3|ReadAttributes|Sync,ShareAll,2,0x00200060)) {
        if(contents.Length>0) {uint written;Check(WriteFile(write,contents,(uint)contents.Length,out written,IntPtr.Zero));if(written!=contents.Length)throw new IOException("short provisioning write");}
      }
      return new Witness(Relative(parent.Handle,name,ReadAttributes|Sync,ShareAll,1,0x00200020),Path.Combine(parent.DrivePath,name),false);
    }
    public static void WriteNewText(Witness parent,string name,string contents) { using(var file=NewFile(parent,name,new UTF8Encoding(false,true).GetBytes(contents))) {} }
    public static Raw OpenReadWrite(string path) { using(var h=CreateFileW(path,0x100083,7,IntPtr.Zero,3,0x00200000,IntPtr.Zero)) return new Raw(!h.IsInvalid,h.IsInvalid?Marshal.GetLastWin32Error():0); }
    public static Raw DeleteAccess(string path,bool directory) { using(var h=CreateFileW(path,0x110080,7,IntPtr.Zero,3,directory?0x02200000u:0x00200000u,IntPtr.Zero)) return new Raw(!h.IsInvalid,h.IsInvalid?Marshal.GetLastWin32Error():0); }
    public static SafeFileHandle HoldFenceProfile(string path) {var h=CreateFileW(path,0x100083,0,IntPtr.Zero,3,0x00200000,IntPtr.Zero);if(h.IsInvalid)throw new Win32Exception();return h;}
    public static Raw SetCaseSensitive(string path) {
      using(var h=CreateFileW(path,0x100180,7,IntPtr.Zero,3,0x02200000,IntPtr.Zero)) {
        if(h.IsInvalid)return new Raw(false,Marshal.GetLastWin32Error()); IntPtr flags=Marshal.AllocHGlobal(4);
        try {Marshal.WriteInt32(flags,1);bool value=SetFileInformationByHandle(h,23,flags,4);return new Raw(value,value?0:Marshal.GetLastWin32Error());}finally{Marshal.FreeHGlobal(flags);}
      }
    }
    public static Raw MarkOffline(string path) {
      using(var h=CreateFileW(path,0x100180,7,IntPtr.Zero,3,0x02200000,IntPtr.Zero)) {
        if(h.IsInvalid)return new Raw(false,Marshal.GetLastWin32Error());IntPtr basic=Marshal.AllocHGlobal(40);
        try {for(int i=0;i<40;i++)Marshal.WriteByte(basic,i,0);Marshal.WriteInt32(basic,32,0x1010);bool value=SetFileInformationByHandle(h,0,basic,40);return new Raw(value,value?0:Marshal.GetLastWin32Error());}finally{Marshal.FreeHGlobal(basic);}
      }
    }
    public static SafeFileHandle HoldDeletePending(string path) {
      var h=CreateFileW(path,0x100080|0x10000,7,IntPtr.Zero,3,0x00200000,IntPtr.Zero);if(h.IsInvalid)throw new Win32Exception();
      IntPtr value=Marshal.AllocHGlobal(1);try{Marshal.WriteByte(value,1);Check(SetFileInformationByHandle(h,4,value,1));return h;}catch{h.Dispose();throw;}finally{Marshal.FreeHGlobal(value);}
    }
    public static Raw Junction(string path,string target) {
      string substitute=@"\??\"+target; byte[] sub=Encoding.Unicode.GetBytes(substitute), print=Encoding.Unicode.GetBytes(target);
      byte[] buffer=new byte[16+sub.Length+2+print.Length+2];
      Array.Copy(BitConverter.GetBytes(0xA0000003u),0,buffer,0,4); Array.Copy(BitConverter.GetBytes((ushort)(buffer.Length-8)),0,buffer,4,2);
      Array.Copy(BitConverter.GetBytes((ushort)sub.Length),0,buffer,10,2);Array.Copy(BitConverter.GetBytes((ushort)(sub.Length+2)),0,buffer,12,2);Array.Copy(BitConverter.GetBytes((ushort)print.Length),0,buffer,14,2);
      Array.Copy(sub,0,buffer,16,sub.Length);Array.Copy(print,0,buffer,18+sub.Length,print.Length);
      using(var h=CreateFileW(path,0x40000000,7,IntPtr.Zero,3,0x02200000,IntPtr.Zero)) {
        if(h.IsInvalid)return new Raw(false,Marshal.GetLastWin32Error());uint returned;bool value=DeviceIoControl(h,0x900A4,buffer,(uint)buffer.Length,IntPtr.Zero,0,out returned,IntPtr.Zero);return new Raw(value,value?0:Marshal.GetLastWin32Error());
      }
    }
    public static Raw Last(bool result) {return new Raw(result,result?0:Marshal.GetLastWin32Error());}
    public static Raw TryMove(string source,string target) {return Last(MoveFileExW(source,target,0));}
    public static Raw TryDelete(string path) {return Last(DeleteFileW(path));}
    public static Raw TryHardLink(string link,string target) {return Last(CreateHardLinkW(link,target,IntPtr.Zero));}
    public static Raw TrySymlink(string link,string target) {
      bool value=CreateSymbolicLinkW(link,target,2);
      int error=Marshal.GetLastWin32Error(); // Capture immediately; BOOLEAN is U1.
      return new Raw(value,value?0:error);
    }
  }
}
'@
Add-Type -TypeDefinition $nativeSource -Language CSharp

$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$sourceRelative = @('native/owned-runtime-initial-fence/fence_win32.h', 'native/owned-runtime-initial-fence/fence_win32.cpp', 'native/owned-runtime-initial-fence/fence_proof_main.cpp', 'native/owned-runtime-initial-fence/FencePrerequisiteProof.vcxproj', 'scripts/owned-runtime-initial-fence-proof.ps1')
$msbuild = 'C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\MSBuild\Current\Bin\MSBuild.exe'
$toolRoot = 'C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC'
$sdkRoot = 'C:\Program Files (x86)\Windows Kits\10'
if (-not [IO.File]::Exists($msbuild) -or -not [IO.File]::Exists((Join-Path $sdkRoot 'Include/10.0.26100.0/um/windows.h'))) { throw 'Pinned installed MSBuild/SDK unavailable; no installation/fallback.' }
$sourceHashes = @($sourceRelative | ForEach-Object { $p = Join-Path $projectRoot $_; [pscustomobject]@{path=$_; sha256=(Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant()} })
$runId = 'fence-' + [Guid]::NewGuid().ToString('N')
$allWitnesses = New-Object 'System.Collections.Generic.List[System.IDisposable]'
$channels = New-Object 'System.Collections.Generic.List[object]'
$cases = [ordered]@{}
$allSlots = New-Object 'System.Collections.Generic.List[object]'
$fixtures = [ordered]@{}
$refOwners = @{}
$usedSlots = @{}
$events = @{}
$receiptPath = $null
$driverFault = $null
$initialDriverFaultEvidence = $null
$container=$null;$build=$null;$roots=$null;$evidence=$null
$buildReceipt=$null
$parkingReceipts=New-Object 'System.Collections.Generic.List[object]'
$knownMoves=New-Object 'System.Collections.Generic.List[object]'
$controller=@{suiteStopped=$false;stopReason=$null;childStartAttempts=0;filesystemEffectBoundaryEntries=0;reconciliationComplete=$false}
$timeoutBarrier=@{armed=$false;timedOut=$false;child=$null;clock=$null;elapsedMilliseconds=0;pausedCounters=$null;timeoutCounters=$null;reconciliationEntryCounters=$null;lateAck=$null;lateAckCounters=$null;exitCounters=$null}

function Own-Witness($w) { $allWitnesses.Add($w); return $w }
function Tracked-Witnesses {
    foreach($item in $allWitnesses) {
        if($item -is [InitialFenceProof.Witness]){$item}
        elseif($item -is [InitialFenceProof.Chain]){foreach($w in $item.Held){$w}}
    }
}
function Record-KnownMove($w,[string]$oldPath,[string]$newPath) {
    # Only a successful own move followed by same-held-ID/canonical readback can
    # update location. Selector/Original/header pins are never updated.
    $actual=[InitialFenceProof.Native]::VerifyOwnHeldPinAt($w,$newPath)
    foreach($ref in (Tracked-Witnesses)){[InitialFenceProof.Native]::RecordVerifiedOwnMove($ref,$oldPath,$newPath)}
    $knownMoves.Add([ordered]@{originalSelectorPath=$w.DrivePath;originalPin=$w.Original;beforeKnownPath=$oldPath;afterKnownPath=$newPath;sameHeldPhysicalReadback=$actual;pinsReissued=$false})
}
function Park-Descendants([string]$id,$target,$parent,[string]$preservationName,$currentChild=$null) {
    Guard-Effects
    [InitialFenceProof.Native]::RequireHeld($target);[InitialFenceProof.Native]::RequireHeld($parent)
    [InitialFenceProof.Native]::AssertFresh($target.DrivePath,$target)
    [InitialFenceProof.Native]::AssertFresh($parent.DrivePath,$parent)
    foreach($child in $channels) {
        if($null -ne $currentChild -and [object]::ReferenceEquals($child,$currentChild)) {
            Assert-True ($child.Slot.kind -ceq 'before_component' -and $child.Slot.component -ceq [IO.Path]::GetFileName($target.CurrentKnownPath) -and $events[$child.Slot.instanceId].Ready.WaitOne(0) -and -not $child.Channel.ExactExited(0) -and $null -ne $child.Channel.Pending) 'current child is held at known hook before target subtree'
        } else {Assert-True ($child.Channel.ExactExited(0) -and $null -eq $child.Channel.Pending) 'all earlier children exact closed before parking'}
    }
    $descendants=@(Tracked-Witnesses|Where-Object{-not $_.IsParked -and $_.CurrentKnownPath.StartsWith($target.CurrentKnownPath+'\',[StringComparison]::OrdinalIgnoreCase)})
    $preservationPath=Join-Path $parent.CurrentKnownPath $preservationName
    $records=New-Object 'System.Collections.Generic.List[object]'
    # Validate the entire tracked live set before closing any of its handles.
    foreach($w in $descendants) {
        $pin=[InitialFenceProof.Native]::VerifyOwnHeldPinAt($w,$w.CurrentKnownPath)
        $records.Add([ordered]@{selectorDrivePath=$w.DrivePath;originalPin=$w.Original;beforeKnownPath=$w.CurrentKnownPath;knownPreservationPath=$preservationPath+$w.CurrentKnownPath.Substring($target.CurrentKnownPath.Length);heldPhysicalReadback=$pin;parked=$false;reheldSameOriginal=$false})
    }
    $data=[ordered]@{caseId=$id;scope='tracked own descendant handle parking only';targetOriginalPin=$target.Original;targetHeldPhysicalReadback=[InitialFenceProof.Native]::VerifyOwnHeldPinAt($target,$target.CurrentKnownPath);externalParentOriginalPin=$parent.Original;externalParentHeldPhysicalReadback=[InitialFenceProof.Native]::VerifyOwnHeldPinAt($parent,$parent.CurrentKnownPath);targetContinuouslyHeld=$true;originalSelectorPath=$target.DrivePath;beforeKnownPath=$target.CurrentKnownPath;knownPreservationPath=$preservationPath;currentChildInstance=if($null -ne $currentChild){$currentChild.Slot.instanceId}else{$null};previousChildrenExactClosed=$true;immutablePinsReissued=$false;foreignPathOpened=$false;descendants=$records.ToArray();state='VALIDATED'}
    $parkingReceipts.Add($data);Evidence $id @{parking=$data}
    for($i=0;$i -lt $descendants.Count;$i++){[InitialFenceProof.Native]::ParkOwnWitness($descendants[$i]);$data.descendants[$i].parked=$true}
    $data.state='PARKED'
    return [pscustomobject]@{target=$target;refs=$descendants;data=$data}
}
function Rehold-Parking($manifest,[object[]]$reusedRefs=$null) {
    Guard-Effects
    if($null -eq $reusedRefs){$reusedRefs=$manifest.refs}
    foreach($w in @($reusedRefs|Sort-Object {$_.CurrentKnownPath.Length})) {
        if(-not $w.IsParked){continue}
        $parentPath=[IO.Path]::GetDirectoryName($w.CurrentKnownPath)
        $parent=Tracked-Witnesses|Where-Object{-not $_.IsParked -and $_.IsDirectory -and $_.CurrentKnownPath.Equals($parentPath,[StringComparison]::OrdinalIgnoreCase)}|Select-Object -First 1
        Assert-True ($null -ne $parent) 'rehold has continuously held/reheld original direct parent'
        $actual=[InitialFenceProof.Native]::ReholdOriginalFromHeldParent($w,$parent)
        foreach($entry in $manifest.data.descendants) {
            if($entry.selectorDrivePath -ceq $w.DrivePath -and $entry.originalPin.fileIdHex -ceq $w.Original.fileIdHex){$entry.reheldSameOriginal=$true;$entry.reholdKnownPath=$w.CurrentKnownPath;$entry.reholdPhysicalReadback=$actual}
        }
    }
    foreach($w in $reusedRefs){$null=[InitialFenceProof.Native]::VerifyOwnHeldPinAt($w,$w.CurrentKnownPath)}
    $manifest.data.state='REUSED_REFS_REHELD_OR_UNUSED_PRESERVED'
}
function Stop-Suite([string]$reason) { $controller.suiteStopped=$true; if($null -eq $controller.stopReason){$controller.stopReason=$reason} }
function Bounded-Text([string]$value,[int]$limit) {
    if($value.Length -gt $limit){return $value.Substring(0,$limit)}
    return $value
}
function Initial-FaultEvidence($record) {
    $info=$record.InvocationInfo
    return [ordered]@{message=(Bounded-Text $record.Exception.Message 768);exceptionType=$record.Exception.GetType().FullName;fullyQualifiedErrorId=(Bounded-Text $record.FullyQualifiedErrorId 256);scriptPath=if($null -ne $info){Bounded-Text $info.ScriptName 512}else{''};line=if($null -ne $info){$info.ScriptLineNumber}else{0};column=if($null -ne $info){$info.OffsetInLine}else{0};position=(Bounded-Text $(if($null -ne $info){$info.PositionMessage}else{''}) 768);scriptStack=(Bounded-Text $record.ScriptStackTrace 2048)}
}
function Assert-EffectWindow([switch]$FinalReceipt) {
    if($FinalReceipt) {
        if(-not $controller.reconciliationComplete){throw 'UNKNOWN: final receipt forbidden before all exact child exits'}
    } elseif($controller.suiteStopped) { throw ('UNKNOWN: terminal case barrier; no new child/filesystem effect: '+$controller.stopReason) }
}
function Controller-Counters {
    return [ordered]@{childStartAttempts=$controller.childStartAttempts;childrenRegistered=$channels.Count;filesystemEffectBoundaryEntries=$controller.filesystemEffectBoundaryEntries}
}
function Assert-SameCounters($expected,$actual) {
    foreach($name in @('childStartAttempts','childrenRegistered','filesystemEffectBoundaryEntries')) { Assert-True ($expected[$name] -eq $actual[$name]) ('no next effect before exact exit: '+$name) }
}
function New-Dir($parent, [string]$name) {
    Assert-EffectWindow; $controller.filesystemEffectBoundaryEntries++
    return Own-Witness ([InitialFenceProof.Native]::NewDirectory($parent, $name))
}
function Ensure-OwnedParent($parent, [string]$name) {
    try { return Own-Witness ([InitialFenceProof.Native]::OpenChildDirectory($parent, $name)) }
    catch {
        $inner=$_.Exception
        while($null -ne $inner.InnerException){$inner=$inner.InnerException}
        if($inner -isnot [ComponentModel.Win32Exception] -or $inner.NativeErrorCode -notin @(2,3)){throw}
        return New-Dir $parent $name
    }
}
function Guard-Effects([switch]$FinalReceipt) {
    Assert-EffectWindow -FinalReceipt:$FinalReceipt
    [InitialFenceProof.Native]::AssertFresh($container.DrivePath, $container)
    [InitialFenceProof.Native]::AssertFresh($build.DrivePath, $build)
    [InitialFenceProof.Native]::AssertFresh($evidence.DrivePath, $evidence)
    [InitialFenceProof.Native]::AssertFresh($roots.DrivePath, $roots)
    $controller.filesystemEffectBoundaryEntries++
}
function Assert-True([bool]$value, [string]$message) { if (-not $value) { Stop-Suite "ASSERT: $message"; throw "ASSERT: $message" } }
function Register-Case([string]$id) { $cases[$id] = [ordered]@{id=$id; status='UNVERIFIED'; reason='not executed'; evidence=@()} }
function Evidence([string]$id, $item) { $cases[$id].evidence += $item }
function Run-Case([string]$id, [scriptblock]$body) {
    Assert-EffectWindow
    try { Guard-Effects; & $body; $cases[$id].status='PASS'; $cases[$id].reason='exact assertions passed' }
    catch {
        $cases[$id].status=if ($_.Exception.Message.StartsWith('ASSERT:')) {'FAIL'} else {'UNVERIFIED'}
        $cases[$id].reason=$_.Exception.Message; Evidence $id @{exceptionType=$_.Exception.GetType().FullName}
        # Only a named setup limitation with no pending outcome/live child can
        # continue. UNKNOWN/FAIL cannot reach another case before reconciliation.
        $safeSetup=$_.Exception.Message.StartsWith('UNVERIFIED:') -and -not $controller.suiteStopped
        foreach($child in $channels) {
            if($null -ne $child.Channel.Pending -or -not $child.Channel.ExactExited(0)){$safeSetup=$false}
        }
        Evidence $id @{safeSetupContinuation=$safeSetup}
        if(-not $safeSetup){Stop-Suite $_.Exception.Message; throw}
    }
}
function Assert-Envelope($r) {
    Assert-True ($null -ne $r -and $r.schema -eq 'ae-agent.initial-fence-prerequisite.v1' -and $r.scope -eq 'windows_identity_fence_prerequisite' -and $r.productionAuthority -eq $false -and $r.issuerStatus -eq 'unavailable' -and $r.admission -eq $false) 'prerequisite scope tags'
    if (-not $r.ok) { Assert-True (-not ($r.PSObject.Properties.Name -contains 'rootIdentity') -and -not ($r.PSObject.Properties.Name -contains 'lockIdentity') -and -not ($r.PSObject.Properties.Name -contains 'sessionRef')) 'negative result carries no positive witness' }
}
function Read-Ack($child, [string]$operation) {
    try {
        $line = $child.Channel.Receive(4000)
        if ($null -eq $line) {
            $reason="UNKNOWN: pending $operation ACK on held child $($child.Slot.instanceId); no replay/replacement"
            Stop-Suite $reason
            if($TimeoutBarrierProof -and $timeoutBarrier.armed -and [object]::ReferenceEquals($child,$timeoutBarrier.child) -and $operation -ceq 'acquire' -and $null -ne $child.Channel.Pending) {
                $timeoutBarrier.timedOut=$true; $timeoutBarrier.timeoutCounters=Controller-Counters
            }
            throw $reason
        }
        $r = $line | ConvertFrom-Json
        Assert-Envelope $r
        Assert-True ($r.operation -eq $operation) "exact ACK operation $operation"
        $child.Transcript.Add($r)
        return $r
    } catch { Stop-Suite $_.Exception.Message; throw }
}
function Command($child, [string]$line) {
    if($line.Split(' ')[0] -ceq 'acquire') {
        [InitialFenceProof.Native]::RequireHeld($fixtures[$child.Slot.fixture].witness)
        if($null -ne $fixtures[$child.Slot.fixture].lock){[InitialFenceProof.Native]::RequireHeld($fixtures[$child.Slot.fixture].lock)}
    }
    if ($null -ne $child.Channel.Pending) { Stop-Suite 'unresolved pending ACK'; throw 'UNKNOWN: unresolved pending ACK; no new ordinary command' }
    try { $child.Channel.Send($line) } catch { Stop-Suite $_.Exception.Message; throw }
    return Read-Ack $child ($line.Split(' ')[0])
}
function New-Slot([string]$fixture, [string]$kind='normal', [string]$component='') {
    $n = $allSlots.Count + 1
    $slot = [pscustomobject]@{instanceId="${runId}:$n"; fixture=$fixture; fixtureIndex=$fixtures[$fixture].index; kind=$kind; component=$component; eventBase="Local\AEAgentFenceProof-${runId}-$n"}
    $allSlots.Add($slot)
    return $slot
}
function Start-Child([string]$fixture, [string]$kind='normal', [string]$spelling='') {
    [InitialFenceProof.Native]::RequireHeld($fixtures[$fixture].witness)
    $slot = $allSlots | Where-Object {$_.fixture -eq $fixture -and $_.kind -eq $kind -and -not $usedSlots.ContainsKey($_.instanceId)} | Select-Object -First 1
    if ($null -eq $slot) { throw 'No unused immutable approved child slot; no slot recycle' }
    $usedSlots[$slot.instanceId] = $true
    if ([string]::IsNullOrEmpty($spelling)) { $spelling=$fixtures[$fixture].witness.DrivePath }
    Guard-Effects
    $controller.childStartAttempts++
    $channel = New-Object InitialFenceProof.Channel($executable, $spelling, $slot.instanceId)
    $child=[pscustomobject]@{Slot=$slot; Channel=$channel; Transcript=(New-Object 'System.Collections.Generic.List[object]'); Startup=$null; Exit=$null}
    $channels.Add($child)
    if ($kind -notin @('before_component','after_component')) { $child.Startup=Read-Ack $child 'startup' }
    return $child
}
function Exact-Exit($child, [uint32]$expected=0) {
    Assert-True ($child.Channel.ExactExited(4000)) 'exact held process exit confirmed'
    $child.Exit=$child.Channel.ExactExitCode()
    Assert-True ($child.Exit -eq $expected) "exact exit code $expected"
    if($null -ne $child.Channel.Pending) {
        $remaining=$child.Channel.Receive(1000)
        if($null -ne $child.Channel.Pending){Stop-Suite 'pending pipe result after exact exit';throw 'UNKNOWN: pending pipe result after exact exit'}
        Assert-True ($null -eq $remaining) 'exact-exited child has only expected EOF, no unconsumed ACK'
    }
}
function Stop-Child($child) {
    if (-not $child.Channel.ExactExited(0)) {
        $r=Command $child 'dispose'; Assert-True ($r.ok -and $r.fenceState -eq 'CLOSED') 'verified dispose'
    }
    Exact-Exit $child 0
}
function Acquire($child) {
    [InitialFenceProof.Native]::RequireHeld($fixtures[$child.Slot.fixture].witness)
    if($null -ne $fixtures[$child.Slot.fixture].lock){[InitialFenceProof.Native]::RequireHeld($fixtures[$child.Slot.fixture].lock)}
    $r=Command $child 'acquire'; Assert-True ($r.ok -and $r.code -eq 'acquired' -and $r.fenceState -eq 'FENCE_HELD') 'acquired live lease'
    Assert-True ($r.sessionRef.StartsWith($child.Slot.instanceId+':',[StringComparison]::Ordinal)) 'original instance prefix'
    Assert-True (-not $refOwners.ContainsKey($r.sessionRef)) 'nonrecycled acquisition ref'
    $refOwners[$r.sessionRef]=$child.Channel
    return $r
}
function Check-Own($child, [string]$ref) {
    Assert-True ([object]::ReferenceEquals($refOwners[$ref],$child.Channel)) 'driver ref bound to original held process/channel'
    $r=Command $child "check $ref"; Assert-True ($r.ok -and $r.fenceState -eq 'FENCE_HELD') 'own lease remains live'; return $r
}
function Wait-Hook($child) { Assert-True ($events[$child.Slot.instanceId].Ready.WaitOne(4000)) 'actual kernel pause boundary' }
function Resume-Hook($child) { $null=$events[$child.Slot.instanceId].Resume.Set() }
function Assert-Identity($actual, $expected) {
    Assert-True ($actual.volumeSerialHex -eq $expected.volumeSerialHex -and $actual.fileIdHex -eq $expected.fileIdHex -and $actual.volumeGuid -ieq $expected.volumeGuid -and $actual.canonicalPath -ieq $expected.canonicalPath) 'independent original handle identity'
}
function Move-Owned($w, $parent, [string]$name) {
    Guard-Effects; [InitialFenceProof.Native]::AssertFresh($w.DrivePath,$w); [InitialFenceProof.Native]::AssertFresh($parent.DrivePath,$parent)
    $target=Join-Path $parent.DrivePath $name
    $raw=[InitialFenceProof.Native]::TryMove($w.DrivePath,$target)
    if (-not $raw.ok) { throw "MoveFileExW refused: $($raw.win32Error)" }
    Record-KnownMove $w $w.CurrentKnownPath $target
    return $target
}
function Restore-Original([string]$heldPath, $w) {
    Guard-Effects
    Assert-True ($heldPath -ceq $w.CurrentKnownPath) 'restore uses verified original known preservation path'
    $chain=[InitialFenceProof.Native]::OpenChain($heldPath)
    try {
        Assert-True ($chain.Leaf.Original.volumeSerialHex -eq $w.Original.volumeSerialHex -and $chain.Leaf.Original.fileIdHex -eq $w.Original.fileIdHex) 'held original identity before restore'
        $null=[InitialFenceProof.Native]::VerifyOwnHeldPinAt($w,$heldPath)
        $raw=[InitialFenceProof.Native]::TryMove($heldPath,$w.DrivePath); Assert-True $raw.ok 'restore exact original without replacing an object'
        Record-KnownMove $w $heldPath $w.DrivePath
        [InitialFenceProof.Native]::AssertFresh($w.DrivePath,$w)
    } finally {$chain.Dispose()}
}
function Refused-Startup($child, [string[]]$codes) {
    $r=$child.Startup
    Assert-True (-not $r.ok -and $r.code -in $codes -and $r.fenceState -eq 'CLOSED' -and $r.testTrace.lockWriteOpenAttempts -eq 0) 'terminal refusal before positive witness/lock WRITE_DATA'
    Exact-Exit $child 2
    return $r
}
function Cpp-Wide([string]$value) { return 'L"' + $value.Replace('\','\\').Replace('"','\"') + '"' }
function Cpp-Ascii([string]$value) { return '"' + $value.Replace('\','\\').Replace('"','\"') + '"' }
function Pin-Initializer($w) { return '{' + (Cpp-Wide $w.DrivePath) + ',' + (Cpp-Wide $w.Original.canonicalPath) + ',' + (Cpp-Ascii $w.Original.volumeSerialHex) + ',' + (Cpp-Ascii $w.Original.fileIdHex) + '}' }

$caseIds = @(
    'root-observation','lock-observation','same-root-busy','after-release-acquire',
    'alias-case','alias-extended-prefix','alias-trailing-separator','different-roots-independent','first-refs-distinct',
    'cross-a-check-b','cross-b-check-a','cross-a-release-b','cross-b-release-a',
    'runroot-ordinary-replacement','runroot-reparse-replacement','fixture-ordinary-replacement','reparse-final-junction','reparse-intermediate-junction',
    'case-sensitive-leaf','case-sensitive-intermediate','case-query-real-invalid-handle',
    'input-drive-relative','input-relative','input-ads','input-device','input-unc','input-subst',
    'input-dot','input-dotdot','input-trailing-dot','input-trailing-space','input-empty-component',
    'race-held-ancestor-rename','race-held-ancestor-delete-access','race-preopen-reparse',
    'race-before-lock','race-after-lock','race-before-publication',
    'lock-hardlink','lock-symlink','lock-directory','lock-nonempty','lock-deletion-pending',
    'hardlink-after-acquire','hardlink-alias-read-write','held-lock-delete','held-lock-rename','held-lock-second-read-write',
    'reacquire-new-reference','stale-check','stale-release','exit-eof','exit-normal','exit-abrupt',
    'missing-root','missing-lock','denied-access','unsupported-query-real-api',
    'lost-ack-same-child-reconciliation','protocol-extra-token','protocol-unknown-command','protocol-invalid-encoding','protocol-overlong-line','protocol-partial-command-eof','partial-acquisition-closure',
    'cleanup-runroot-replaced','cleanup-fixture-replaced','cleanup-reparse-outside','cleanup-runroot-reparse-outside','cleanup-unknown-entry-preserved',
    'binding-alternate-observe','binding-alternate-dispose','binding-moved-from-root-observe','binding-moved-from-root-dispose',
    'binding-moved-from-fence-observe','binding-moved-from-fence-dispose','binding-move-live-check','binding-other-child-busy','binding-after-verified-release',
    'binding-command-unapproved-slot'
)
if($TimeoutBarrierProof){$caseIds=@('controller-timeout-barrier')}
foreach ($id in $caseIds) { Register-Case $id }
if(-not $TimeoutBarrierProof) {
    $cases['unsupported-query-real-api'].reason='Ambient unsupported FileCaseSensitiveInfo API is not induced by this driver; closed-handle fault injection is a separate case, not ambient support proof.'
    Evidence 'unsupported-query-real-api' @{caseScope='ambient unsupported API';faultInjectionIsSeparate=$true;actualUnsupportedApiProven=$false}
}

try {
    $repoChain=Own-Witness ([InitialFenceProof.Native]::OpenChain($projectRoot))
    $runtime=Ensure-OwnedParent $repoChain.Leaf '.codex-runtime'
    $base=Ensure-OwnedParent $runtime 'initial-owned-fence-prerequisite'
    $container=New-Dir $base $runId # FILE_CREATE; existing runId is never reused.
    $build=New-Dir $container 'build'; $roots=New-Dir $container 'roots'; $evidence=New-Dir $container 'evidence'
    $workspace=New-Dir $roots 'workspace'
    $outside=New-Dir $roots 'outside-fixtures'
    $outsideLeaf=New-Dir $outside 'leaf'
    $outsideMarker=Own-Witness ([InitialFenceProof.Native]::NewFile($outsideLeaf,'sentinel.txt',[Text.Encoding]::UTF8.GetBytes('owned outside-fixture sentinel; never helper effects')))
    $outsideLock=Own-Witness ([InitialFenceProof.Native]::NewFile($outsideLeaf,'.initial-owned-fence.lock',[Text.Encoding]::UTF8.GetBytes('foreign-to-fixture nonempty sentinel')))
    $owner=[ordered]@{schema='ae-agent.initial-fence-prerequisite.owner.v1'; runId=$runId; scope='windows_identity_fence_prerequisite'; productionAuthority=$false;issuerStatus='unavailable';admission=$false; userSid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value; container=$container.Original; allowedParent=$base.Original; testedRunRoot=$workspace.Original; cleanup='preserve all scratch; no recursive/pathname deletion'}
    Guard-Effects; [InitialFenceProof.Native]::WriteNewText($container,'owner.json',($owner|ConvertTo-Json -Depth 8))

    $fixtureNames=@('normalA','normalB','fixtureReplace','reparseFinal','reparseIntermediate','caseLeaf','caseIntermediate','queryFault','partialFault','missingRoot','missingLock','deniedLock','hardlinkLock','postHardlink','symlinkLock','directoryLock','nonemptyLock','pendingLock','raceHeld','raceBefore','pauseLock','pauseAfter','pausePublish','runrootProbe')
    foreach ($name in $fixtureNames) {
        $parent=$workspace
        if ($name -in @('reparseIntermediate','caseIntermediate')) { $parent=New-Dir $workspace ($name+'-ancestor'); $w=New-Dir $parent 'leaf' }
        else { $w=New-Dir $workspace $name }
        $lock=$null
        if ($name -eq 'directoryLock') { $null=New-Dir $w '.initial-owned-fence.lock' }
        elseif ($name -notin @('missingLock','caseLeaf')) {
            # An empty byte[] emitted by an if-expression becomes $null in PS5.1.
            [byte[]]$bytes=[byte[]]@()
            if($name -eq 'nonemptyLock'){$bytes=[Text.Encoding]::UTF8.GetBytes('must remain unchanged')}
            $lock=Own-Witness ([InitialFenceProof.Native]::NewFile($w,'.initial-owned-fence.lock',$bytes))
        }
        $fixtures[$name]=[pscustomobject]@{index=$fixtures.Count; witness=$w; parent=$parent; lock=$lock}
        $normalCount=if($name -eq 'normalA'){100}elseif($name -eq 'normalB'){32}else{8}
        for($i=0;$i -lt $normalCount;$i++){ $null=New-Slot $name }
    }
    $null=New-Slot 'queryFault' 'invalid-case-query'
    $null=New-Slot 'partialFault' 'invalid-lock-query'
    $null=New-Slot 'normalA' 'lost-ack'
    $null=New-Slot 'normalA' 'crash'
    for($i=0;$i -lt 9;$i++){$null=New-Slot 'normalA' 'binding-proof'}
    $null=New-Slot 'fixtureReplace' 'before_component' 'fixtureReplace'
    $null=New-Slot 'reparseFinal' 'before_component' 'reparseFinal'
    $null=New-Slot 'reparseIntermediate' 'before_component' 'reparseIntermediate-ancestor'
    $null=New-Slot 'raceHeld' 'after_component' 'raceHeld'
    $null=New-Slot 'raceHeld' 'after_component' 'raceHeld'
    $null=New-Slot 'raceBefore' 'before_component' 'raceBefore'
    $null=New-Slot 'pauseLock' 'before_lock'
    $null=New-Slot 'pauseAfter' 'after_lock'
    $null=New-Slot 'pausePublish' 'before_publish'
    $null=New-Slot 'runrootProbe' 'before_component' 'workspace'
    $null=New-Slot 'runrootProbe' 'before_component' 'workspace'

    $header=New-Object Text.StringBuilder
    $null=$header.AppendLine('#pragma once')
    $null=$header.AppendLine('// Immutable original independent driver-handle pins; prerequisite only.')
    $null=$header.AppendLine('namespace initial_fence { namespace test_pins {')
    $null=$header.AppendLine('struct Pin { const wchar_t* drivePath; const wchar_t* canonicalPath; const char* serialHex; const char* fileIdHex; };')
    $null=$header.AppendLine('struct Slot { const char* instanceId; unsigned int fixtureIndex; const char* pauseStage; const wchar_t* pauseComponent; const wchar_t* eventBase; bool invalidateCaseQuery; bool invalidateLockQuery; bool crashProof; bool lostAcquireAck; bool bindingProof; };')
    $null=$header.AppendLine(('inline const Pin kRunRoot = '+(Pin-Initializer $workspace)+';'))
    $null=$header.AppendLine('inline const Pin kFixtures[] = {')
    foreach($entry in $fixtures.Values){$null=$header.AppendLine((Pin-Initializer $entry.witness)+',')}
    $null=$header.AppendLine('}; inline const Slot kSlots[] = {')
    foreach($slot in $allSlots) {
        $stage=if($slot.kind -in @('before_component','after_component','before_lock','after_lock','before_publish')){$slot.kind}else{''}
        $flags=@(($slot.kind -eq 'invalid-case-query'),($slot.kind -eq 'invalid-lock-query'),($slot.kind -eq 'crash'),($slot.kind -eq 'lost-ack'),($slot.kind -eq 'binding-proof'))|ForEach-Object {if($_){'true'}else{'false'}}
        $null=$header.AppendLine(('{'+(Cpp-Ascii $slot.instanceId)+','+$slot.fixtureIndex+','+(Cpp-Ascii $stage)+','+(Cpp-Wide $slot.component)+','+(Cpp-Wide $slot.eventBase)+','+($flags -join ',')+'},'))
        if($stage -ne '') {
            $created=$false
            $ready=New-Object Threading.EventWaitHandle($false,[Threading.EventResetMode]::ManualReset,($slot.eventBase+'-ready'),[ref]$created)
            Assert-True $created 'fresh ready event name'
            $resume=New-Object Threading.EventWaitHandle($false,[Threading.EventResetMode]::ManualReset,($slot.eventBase+'-resume'),[ref]$created)
            Assert-True $created 'fresh resume event name'
            $events[$slot.instanceId]=[pscustomobject]@{Ready=$ready; Resume=$resume}
        }
    }
    $null=$header.AppendLine('} // slots');$null=$header.AppendLine('} }')
    # Correct the array terminator before writing; the generated source is a receipt.
    $pinsText=$header.ToString().Replace('} // slots','}; // slots')
    Guard-Effects; [InitialFenceProof.Native]::WriteNewText($build,'fence_expected_pins.h',$pinsText)

    $versionFile='C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\Microsoft.VCToolsVersion.default.txt'
    $vcToolsVersion=[IO.File]::ReadAllText($versionFile).Trim()
    if($vcToolsVersion -notmatch '^14\.\d+\.\d+$'){throw 'Installed v143 version receipt unavailable'}
    $cl=Join-Path $toolRoot "$vcToolsVersion/bin/Hostx64/x64/cl.exe"
    $link=Join-Path $toolRoot "$vcToolsVersion/bin/Hostx64/x64/link.exe"
    $sdkLib=Join-Path $sdkRoot 'Lib/10.0.26100.0/um/x64/kernel32.lib'
    foreach($path in @($cl,$link,$sdkLib)){if(-not [IO.File]::Exists($path)){throw "Pinned actual toolchain missing: $path"}}
    $toolchain=@($msbuild,$versionFile,$cl,$link,$sdkLib)|ForEach-Object{[pscustomobject]@{path=$_;sha256=(Get-FileHash -LiteralPath $_ -Algorithm SHA256).Hash.ToLowerInvariant()}}
    $project=Join-Path $projectRoot 'native/owned-runtime-initial-fence/FencePrerequisiteProof.vcxproj'
    Guard-Effects
    $buildOutput=@(& $msbuild $project /nologo /m:1 /v:minimal /p:Configuration=Release /p:Platform=x64 "/p:VCToolsVersion=$vcToolsVersion" /p:WindowsTargetPlatformVersion=10.0.26100.0 "/p:FenceProofOutputDir=$($build.DrivePath)" "/p:FenceProofPinsDir=$($build.DrivePath)" 2>&1)
    $buildExit=$LASTEXITCODE
    Guard-Effects; [InitialFenceProof.Native]::WriteNewText($build,'msbuild.log',(($buildOutput|ForEach-Object{$_.ToString()}) -join "`n"))
    if($buildExit -ne 0){throw "Actual isolated compilation failed: $buildExit"}
    $executable=Join-Path $build.DrivePath 'bin/FencePrerequisiteProof.exe'
    if(-not [IO.File]::Exists($executable)){throw 'Actual compiler did not publish proof executable'}
    foreach($source in $sourceHashes){Assert-True ((Get-FileHash -LiteralPath (Join-Path $projectRoot $source.path) -Algorithm SHA256).Hash.ToLowerInvariant() -eq $source.sha256) 'source remained frozen during build'}
    $buildReceipt=[ordered]@{schema='ae-agent.initial-fence-prerequisite.build.v1';scope='windows_identity_fence_prerequisite';productionAuthority=$false;issuerStatus='unavailable';admission=$false;runId=$runId;configuration='Release/x64 C++17 /W4 /WX /utf-8';v143Version=$vcToolsVersion;sdkVersion='10.0.26100.0';toolchain=$toolchain;sources=$sourceHashes;pinsSha256=(Get-FileHash -LiteralPath (Join-Path $build.DrivePath 'fence_expected_pins.h') -Algorithm SHA256).Hash.ToLowerInvariant();executableSha256=(Get-FileHash -LiteralPath $executable -Algorithm SHA256).Hash.ToLowerInvariant();buildExit=$buildExit;container=$container.Original;testedRunRoot=$workspace.Original;fixtures=@($fixtures.Values|ForEach-Object{@{name=$_.witness.DrivePath;original=$_.witness.Original}})}
    Guard-Effects; [InitialFenceProof.Native]::WriteNewText($evidence,'build-receipt.json',($buildReceipt|ConvertTo-Json -Depth 12))

    if($TimeoutBarrierProof) {
        Run-Case 'controller-timeout-barrier' {
            $c=Start-Child 'pausePublish' 'before_publish'
            Assert-True $c.Startup.ok 'root held before delayed successful acquire'
            $c.Channel.Send('acquire');Wait-Hook $c
            $timeoutBarrier.child=$c;$timeoutBarrier.pausedCounters=Controller-Counters
            $timeoutBarrier.clock=[Diagnostics.Stopwatch]::StartNew();$timeoutBarrier.armed=$true
            try {
                $null=Read-Ack $c 'acquire'
                Assert-True $false 'unresumed before_publish hook must retain acquire ACK beyond 4000ms'
            } finally {
                $timeoutBarrier.clock.Stop();$timeoutBarrier.elapsedMilliseconds=$timeoutBarrier.clock.ElapsedMilliseconds
            }
        }
    } elseif($RunNativeProof) {
        Run-Case 'root-observation' {
            $c=Start-Child 'normalA'; Assert-True $c.Startup.ok 'startup root query'; Assert-Identity $c.Startup.rootIdentity $fixtures.normalA.witness.Original
            $r=Command $c 'observe'; Assert-Identity $r.rootIdentity $fixtures.normalA.witness.Original
            Evidence 'root-observation' $r; Stop-Child $c
        }
        Run-Case 'lock-observation' {
            $c=Start-Child 'normalA';$r=Acquire $c;Assert-Identity $r.rootIdentity $fixtures.normalA.witness.Original;Assert-Identity $r.lockIdentity $fixtures.normalA.lock.Original
            Evidence 'lock-observation' $r;Stop-Child $c
        }
        foreach($id in @('binding-alternate-observe','binding-alternate-dispose','binding-moved-from-root-observe','binding-moved-from-root-dispose','binding-moved-from-fence-observe','binding-moved-from-fence-dispose','binding-move-live-check','binding-other-child-busy','binding-after-verified-release')) {
            Run-Case $id {
                $a=Start-Child 'normalA' 'binding-proof';$b=Start-Child 'normalA'
                $ar=Acquire $a;$bound=Command $a 'binding-proof'
                Assert-True ($bound.ok -and $bound.code -eq 'binding_checked' -and $bound.activeSessionRef -eq $ar.sessionRef -and $bound.bindingProof.Count -eq 8) 'actual move-only reference/binding proof returns original live lease'
                Assert-Identity $bound.lockIdentity $fixtures.normalA.lock.Original
                $expectedSteps=@('observe_alternate','dispose_alternate','observe_moved_from_root','dispose_moved_from_root','observe_moved_from_fence','dispose_moved_from_fence','observe_moved_objects','check_moved_objects')
                $seenSteps=New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::Ordinal)
                foreach($step in $bound.bindingProof) {
                    Assert-True ($expectedSteps -ccontains $step.operation) 'exact named binding step'
                    Assert-True ($seenSteps.Add($step.operation)) 'binding step names are unique'
                    if($step.operation -cin @('observe_moved_objects','check_moved_objects')){Assert-True ($step.ok -and $step.fenceState -eq 'FENCE_HELD') 'moved logical objects remain valid'}
                    else{Assert-True (-not $step.ok -and $step.code -eq 'invalid_lease_reference' -and $step.fenceState -eq 'FENCE_HELD') 'alternate/moved-from reference never closes or hides original held fence'}
                }
                foreach($name in $expectedSteps){Assert-True ($seenSteps.Contains($name)) 'all eight exact binding step names present'}
                $busy=Command $b 'acquire';Assert-True (-not $busy.ok -and $busy.code -eq 'fence_busy' -and $busy.win32Error -eq 32) 'another child remains busy after alternate Dispose'
                $own=Check-Own $a $ar.sessionRef
                $released=Command $a "release $($ar.sessionRef)";Assert-True ($released.ok -and $released.fenceState -eq 'ROOT_HELD') 'verified release of the restored original logical lease'
                $next=Acquire $b
                Evidence $id @{binding=$bound;otherBusy=$busy;ownBeforeRelease=$own;verifiedRelease=$released;otherAfterRelease=$next}
                Stop-Child $a;Stop-Child $b
            }
        }
        Run-Case 'binding-command-unapproved-slot' {
            $a=Start-Child 'normalA';$ar=Acquire $a;$a.Channel.Send('binding-proof');$refusal=Read-Ack $a 'protocol'
            Assert-True (-not $refusal.ok -and $refusal.code -eq 'protocol_refused' -and $refusal.fenceState -eq 'CLOSED') 'ordinary immutable slot cannot enable binding mode'
            Exact-Exit $a 2;$b=Start-Child 'normalA';$next=Acquire $b;Evidence 'binding-command-unapproved-slot' @{refusal=$refusal;afterExactExit=$next};Stop-Child $b
        }
        foreach($id in @('same-root-busy','after-release-acquire')) {
            Run-Case $id {
                $a=Start-Child 'normalA';$b=Start-Child 'normalA';$ar=Acquire $a;$br=Command $b 'acquire'
                Assert-True (-not $br.ok -and $br.code -eq 'fence_busy' -and $br.win32Error -eq 32 -and $br.fenceState -eq 'ROOT_HELD') 'B busy with original existing lock'
                Evidence $id $br
                if($id -eq 'after-release-acquire') {
                    $rr=Command $a "release $($ar.sessionRef)";Assert-True ($rr.ok -and $rr.fenceState -eq 'ROOT_HELD') 'verified release A';$r=Acquire $b;Evidence $id $r
                }
                Stop-Child $a;Stop-Child $b
            }
        }
        foreach($alias in @(@{id='alias-case';path=$fixtures.normalA.witness.DrivePath.ToUpperInvariant()},@{id='alias-extended-prefix';path='\\?\'+$fixtures.normalA.witness.DrivePath},@{id='alias-trailing-separator';path=$fixtures.normalA.witness.DrivePath+'\'})) {
            Run-Case $alias.id {
                $a=Start-Child 'normalA';$ar=Acquire $a;$b=Start-Child 'normalA' 'normal' $alias.path
                Assert-Identity $b.Startup.rootIdentity $fixtures.normalA.witness.Original
                $r=Command $b 'acquire';Assert-True (-not $r.ok -and $r.code -eq 'fence_busy') 'spelling cannot create separate fence'
                Assert-True ([IO.Directory]::GetFiles($fixtures.normalA.witness.DrivePath,'.initial-owned-fence.lock').Length -eq 1) 'single fixed namespace file'
                Evidence $alias.id @{spelling=$alias.path;result=$r};Stop-Child $a;Stop-Child $b
            }
        }
        foreach($id in @('different-roots-independent','first-refs-distinct','cross-a-check-b','cross-b-check-a','cross-a-release-b','cross-b-release-a')) {
            Run-Case $id {
                $a=Start-Child 'normalA';$b=Start-Child 'normalB';$ar=Acquire $a;$br=Acquire $b
                Assert-True ($ar.rootIdentity.fileIdHex -ne $br.rootIdentity.fileIdHex -and $ar.sessionRef -ne $br.sessionRef) 'different roots and independent first refs'
                Assert-True ($ar.sessionRef.EndsWith(':1') -and $br.sessionRef.EndsWith(':1')) 'each first acquisition counter'
                if($id.StartsWith('cross-')) {
                    $receiver=if($id.StartsWith('cross-a')){$a}else{$b};$foreign=if($id.StartsWith('cross-a')){$br.sessionRef}else{$ar.sessionRef}
                    $op=if($id.Contains('-release-')){'release'}else{'check'}
                    $r=Command $receiver "$op $foreign";Assert-True (-not $r.ok -and $r.code -eq 'foreign_session_ref' -and $r.fenceState -eq 'FENCE_HELD') 'foreign ref refuses without closing own lease';Evidence $id $r
                }
                Evidence $id @{a=(Check-Own $a $ar.sessionRef);b=(Check-Own $b $br.sessionRef)};Stop-Child $a;Stop-Child $b
            }
        }

        foreach($id in @('reacquire-new-reference','stale-check','stale-release')) {
            Run-Case $id {
                $c=Start-Child 'normalA';$old=Acquire $c;$released=Command $c "release $($old.sessionRef)";Assert-True $released.ok 'old released';$new=Acquire $c
                Assert-True ($old.sessionRef -ne $new.sessionRef -and $new.sessionRef.EndsWith(':2')) 'new acquisition object/counter'
                if($id -ne 'reacquire-new-reference') {
                    $op=if($id -eq 'stale-check'){'check'}else{'release'};$r=Command $c "$op $($old.sessionRef)"
                    Assert-True (-not $r.ok -and $r.code -eq 'stale_session_ref' -and $r.fenceState -eq 'FENCE_HELD') 'stale ref refuses without touching new handle';Evidence $id $r
                }
                Evidence $id (Check-Own $c $new.sessionRef);Stop-Child $c
            }
        }
        foreach($id in @('exit-eof','exit-normal','exit-abrupt')) {
            Run-Case $id {
                $kind=if($id -eq 'exit-abrupt'){'crash'}else{'normal'};$a=Start-Child 'normalA' $kind;$ar=Acquire $a
                if($id -eq 'exit-eof'){$a.Channel.CloseInput();Exact-Exit $a 0}
                elseif($id -eq 'exit-abrupt'){$a.Channel.Send('crash');Exact-Exit $a 73}
                else{Stop-Child $a}
                $b=Start-Child 'normalA';$r=Acquire $b;Evidence $id @{originalExit=$a.Exit;nextAcquisition=$r};Stop-Child $b
            }
        }
        foreach($id in @('held-lock-delete','held-lock-rename','held-lock-second-read-write','hardlink-after-acquire')) {
            Run-Case $id {
                $fixture=if($id -eq 'hardlink-after-acquire'){'postHardlink'}else{'normalA'}
                $c=Start-Child $fixture;$r=Acquire $c;$path=$fixtures[$fixture].lock.DrivePath
                Guard-Effects;[InitialFenceProof.Native]::AssertFresh($fixtures[$fixture].witness.DrivePath,$fixtures[$fixture].witness)
                if($id -eq 'held-lock-delete'){$raw=[InitialFenceProof.Native]::TryDelete($path)}
                elseif($id -eq 'held-lock-rename'){$raw=[InitialFenceProof.Native]::TryMove($path,(Join-Path $fixtures.normalA.witness.DrivePath 'attempted-held-lock-renamed'))}
                elseif($id -eq 'held-lock-second-read-write'){$raw=[InitialFenceProof.Native]::OpenReadWrite($path)}
                else{$raw=[InitialFenceProof.Native]::TryHardLink((Join-Path $fixtures[$fixture].witness.DrivePath 'post-acquire-link'),$path)}
                Evidence $id $raw
                if($id -eq 'hardlink-after-acquire' -and $raw.ok) {
                    $alias=[InitialFenceProof.Native]::OpenReadWrite((Join-Path $fixtures[$fixture].witness.DrivePath 'post-acquire-link'));Assert-True (-not $alias.ok -and $alias.win32Error -eq 32) 'new link cannot bypass sharing'
                    $check=Command $c "check $($r.sessionRef)";Assert-True (-not $check.ok -and $check.code -eq 'lock_standard_refused' -and $check.fenceState -eq 'CLOSED') 'fresh hardlink drift closes lease';Exact-Exit $c 2;Evidence $id @{alias=$alias;check=$check}
                } else {
                    Assert-True (-not $raw.ok -and $raw.win32Error -in @(5,32)) 'real API refusal while fence remains held'
                    Evidence $id (Check-Own $c $r.sessionRef);Stop-Child $c
                }
            }
        }

        Run-Case 'case-query-real-invalid-handle' {
            $c=Start-Child 'queryFault' 'invalid-case-query';$r=Refused-Startup $c @('case_query_failed')
            Assert-True ($r.win32Error -eq 6) 'closed-handle injection produces real FileCaseSensitiveInfo API error'
            Evidence 'case-query-real-invalid-handle' @{faultInjection='duplicate handle closed before real GetFileInformationByHandleEx';informationClass='FileCaseSensitiveInfo';ambientUnsupportedProven=$false;result=$r}
        }
        Run-Case 'partial-acquisition-closure' {
            $a=Start-Child 'partialFault' 'invalid-lock-query';$r=Command $a 'acquire';Assert-True (-not $r.ok -and $r.code -eq 'attribute_query_failed' -and $r.win32Error -eq 6 -and $r.fenceState -eq 'CLOSED' -and $r.testTrace.lockWriteOpenAttempts -eq 1 -and $r.testTrace.publishedAcquisitions -eq 0) 'actual query failure after open before publication'
            Exact-Exit $a 2;$b=Start-Child 'partialFault';$next=Acquire $b;Evidence 'partial-acquisition-closure' @{failure=$r;afterExactExit=$next};Stop-Child $b
        }
        Run-Case 'lost-ack-same-child-reconciliation' {
            $c=Start-Child 'normalA' 'lost-ack';$c.Channel.Send('acquire');$lost=$c.Channel.Receive(250)
            Assert-True ($null -eq $lost -and -not $c.Channel.ExactExited(0)) 'ACK lost; same held child live; pending read retained'
            $c.Channel.Send('observe');$r=Read-Ack $c 'observe'
            Assert-True ($r.ok -and $r.fenceState -eq 'FENCE_HELD' -and $r.activeSessionRef -eq ($c.Slot.instanceId+':1') -and $r.testTrace.lockWriteOpenAttempts -eq 1 -and $r.testTrace.publishedAcquisitions -eq 1) 'same-child reconciliation without acquire replay'
            $refOwners[$r.activeSessionRef]=$c.Channel;Evidence 'lost-ack-same-child-reconciliation' (Check-Own $c $r.activeSessionRef);Stop-Child $c
        }
        foreach($p in @(@{id='protocol-extra-token';text='acquire extra'},@{id='protocol-unknown-command';text='launch'},@{id='protocol-invalid-encoding';text=$null},@{id='protocol-overlong-line';text=('x'*257)})) {
            Run-Case $p.id {
                $a=Start-Child 'normalA';$r=Acquire $a
                if($p.id -eq 'protocol-invalid-encoding'){$a.Channel.SendInvalidByte()}elseif($p.id -eq 'protocol-overlong-line'){$a.Channel.SendOverlongProofLine()}else{$a.Channel.Send($p.text)}
                $failure=Read-Ack $a 'protocol';Assert-True (-not $failure.ok -and $failure.code -eq 'protocol_refused' -and $failure.fenceState -eq 'CLOSED') 'protocol failure closes acquired handles';Exact-Exit $a 2
                $b=Start-Child 'normalA';$next=Acquire $b;Evidence $p.id @{failure=$failure;afterExactExit=$next};Stop-Child $b
            }
        }
        Run-Case 'protocol-partial-command-eof' {
            $a=Start-Child 'normalA';$original=Acquire $a
            $a.Channel.SendPartialCommandProof();$a.Channel.CloseInput()
            $failure=Read-Ack $a 'protocol'
            Assert-True (-not $failure.ok -and $failure.code -ceq 'protocol_refused' -and $failure.fenceState -ceq 'CLOSED' -and $failure.testTrace.lockWriteOpenAttempts -eq 1 -and $failure.testTrace.publishedAcquisitions -eq 1) 'unterminated dispose bytes plus EOF are refused, acquired handles closed'
            Exact-Exit $a 2
            $b=Start-Child 'normalA';$next=Acquire $b
            Evidence 'protocol-partial-command-eof' @{originalAcquisition=$original;unterminatedAsciiBytes='dispose';newlineSent=$false;eofRequested=$true;refusal=$failure;originalExactExit=$a.Exit;afterExactExit=$next}
            Stop-Child $b
        }
        $basePath=$fixtures.normalA.witness.DrivePath
        $invalidInputs=@(
            @{id='input-drive-relative';path=$basePath.Substring(0,2)+'normalA'},@{id='input-relative';path='normalA'},
            @{id='input-ads';path=$basePath+':stream'},@{id='input-device';path='\\.\'+$basePath},@{id='input-unc';path='\\localhost\invalid-share\normalA'},
            @{id='input-dot';path=$workspace.DrivePath+'\.\normalA'},@{id='input-dotdot';path=$workspace.DrivePath+'\normalB\..\normalA'},
            @{id='input-trailing-dot';path=$basePath+'.'},@{id='input-trailing-space';path=$basePath+' '},@{id='input-empty-component';path=$workspace.DrivePath+'\\normalA'}
        )
        foreach($inputCase in $invalidInputs) {
            Run-Case $inputCase.id {$c=Start-Child 'normalA' 'normal' $inputCase.path;$r=Refused-Startup $c @('invalid_root_spelling');Evidence $inputCase.id @{input=$inputCase.path;result=$r}}
        }
        Run-Case 'input-subst' {
            if(-not $AllowTemporaryDosDeviceProof){throw 'UNVERIFIED: explicit -AllowTemporaryDosDeviceProof required for ephemeral per-logon test mapping'}
            Guard-Effects;[InitialFenceProof.Native]::AssertFresh($workspace.DrivePath,$workspace)
            $logical=[IO.Directory]::GetLogicalDrives();$letter=$null;$target='\??\'+$workspace.DrivePath
            foreach($char in 'ZYXWVUTSRQPONMLKJIHGFED'.ToCharArray()) {
                $candidate=[string]$char+':'
                if($logical -contains ($candidate+'\')){continue}
                $buffer=New-Object Text.StringBuilder(4096)
                $query=[InitialFenceProof.Native]::QueryDosDeviceW($candidate,$buffer,4096)
                $errorCode=[Runtime.InteropServices.Marshal]::GetLastWin32Error()
                if($query -eq 0 -and $errorCode -eq 2){$letter=$candidate;break}
            }
            if($null -eq $letter){throw 'UNVERIFIED: no proven unused DOS device letter'}
            # A read-before-create cannot atomically reserve a DOS-device name.
            # Do not replace an existing mapping; fresh query immediately before the call.
            Evidence 'input-subst' @{candidateLetter=$letter;exactOwnedTarget=$target;mappingCreated=$false}
            throw 'UNVERIFIED: DefineDosDeviceW has no atomic create-if-absent/no-replace; fresh unused-letter checks cannot exclude replacement race; no DOS device effect performed'
        }

        Run-Case 'fixture-ordinary-replacement' {
            $original=$fixtures.fixtureReplace.witness;$c=Start-Child 'fixtureReplace' 'before_component';Wait-Hook $c
            $parking=Park-Descendants 'fixture-ordinary-replacement' $original $workspace 'fixtureReplace-held-original' $c
            $held=Move-Owned $original $workspace 'fixtureReplace-held-original'
            $replacement=New-Dir $workspace 'fixtureReplace'
            [InitialFenceProof.Native]::WriteNewText($replacement,'marker.txt','new ordinary replacement must remain unchanged')
            $null=Own-Witness ([InitialFenceProof.Native]::NewFile($replacement,'.initial-owned-fence.lock',[byte[]]@()))
            Resume-Hook $c;$c.Startup=Read-Ack $c 'startup';$r=Refused-Startup $c @('root_identity_changed');Evidence 'fixture-ordinary-replacement' $r
            Run-Case 'cleanup-fixture-replaced' {
                $refused=$false;try{[InitialFenceProof.Native]::AssertFresh($original.DrivePath,$original)}catch{$refused=$true;Evidence 'cleanup-fixture-replaced' @{freshTraversalRefusal=$_.Exception.Message}}
                Assert-True $refused 'cleanup original pin cannot rebind to replacement'
                Assert-True ([IO.File]::ReadAllText((Join-Path $replacement.DrivePath 'marker.txt')) -eq 'new ordinary replacement must remain unchanged') 'replacement content preserved; no deletion'
            }
            $replacementParking=Park-Descendants 'fixture-ordinary-replacement' $replacement $workspace 'fixtureReplace-preserved-replacement'
            $null=Move-Owned $replacement $workspace 'fixtureReplace-preserved-replacement';$replacementParking.data.state='UNUSED_REPLACEMENT_PRESERVED_PARKED'
            Restore-Original $held $original;Rehold-Parking $parking
        }

        foreach($item in @(@{id='reparse-final-junction';fixture='reparseFinal';intermediate=$false},@{id='reparse-intermediate-junction';fixture='reparseIntermediate';intermediate=$true},@{id='race-preopen-reparse';fixture='raceBefore';intermediate=$false})) {
            Run-Case $item.id {
                $f=$fixtures[$item.fixture];$source=if($item.intermediate){$f.parent}else{$f.witness}
                $parent=$workspace;$name=[IO.Path]::GetFileName($source.DrivePath)
                $c=Start-Child $item.fixture 'before_component';Wait-Hook $c
                $parking=Park-Descendants $item.id $source $parent ($name+'-held-original') $c
                $null=Move-Owned $source $parent ($name+'-held-original')
                $replacement=New-Dir $parent $name;$target=if($item.intermediate){$outside.DrivePath}else{$outsideLeaf.DrivePath}
                Guard-Effects;[InitialFenceProof.Native]::AssertFresh($outsideLeaf.DrivePath,$outsideLeaf)
                $raw=[InitialFenceProof.Native]::Junction($replacement.DrivePath,$target);Evidence $item.id $raw
                if(-not $raw.ok){throw "UNVERIFIED: actual junction setup refused $($raw.win32Error)"}
                Resume-Hook $c;$c.Startup=Read-Ack $c 'startup'
                $r=Refused-Startup $c @('directory_attributes_refused');Evidence $item.id $r
                # Both trees are preserved. The intentional reparse replacement
                # is never reopened/moved/restored through a relaxed fresh check.
                $parking.data.state='UNUSED_ORIGINAL_SUBTREE_PRESERVED_PARKED'
                Assert-True ([IO.File]::ReadAllText($outsideMarker.DrivePath) -eq 'owned outside-fixture sentinel; never helper effects' -and [IO.File]::ReadAllText($outsideLock.DrivePath) -eq 'foreign-to-fixture nonempty sentinel') 'outside-fixture target contents unchanged'
                if($item.id -eq 'reparse-final-junction') {
                    Run-Case 'cleanup-reparse-outside' {
                        $refused=$false;try{[InitialFenceProof.Native]::AssertFresh($source.DrivePath,$source)}catch{$refused=$true;Evidence 'cleanup-reparse-outside' @{freshTraversalRefusal=$_.Exception.Message}}
                        Assert-True $refused 'no-follow cleanup refuses reparse replacement before target'
                        Assert-True ([IO.File]::ReadAllText($outsideMarker.DrivePath) -eq 'owned outside-fixture sentinel; never helper effects') 'outside preserved without deletion'
                    }
                }
            }
        }
        foreach($item in @(@{id='case-sensitive-leaf';fixture='caseLeaf';intermediate=$false},@{id='case-sensitive-intermediate';fixture='caseIntermediate';intermediate=$true})) {
            Run-Case $item.id {
                $f=$fixtures[$item.fixture];$w=if($item.intermediate){$f.parent}else{$f.witness}
                if($item.intermediate){
                    $parking=Park-Descendants $item.id $f.witness $workspace 'caseIntermediate-preserved-leaf-before-enable'
                    $null=Move-Owned $f.witness $workspace 'caseIntermediate-preserved-leaf-before-enable'
                    $parking.data.state='UNUSED_ORIGINAL_LEAF_PRESERVED_PARKED'
                }
                Guard-Effects;[InitialFenceProof.Native]::AssertFresh($w.DrivePath,$w)
                $raw=[InitialFenceProof.Native]::SetCaseSensitive($w.DrivePath);Evidence $item.id $raw
                if(-not $raw.ok){throw "UNVERIFIED: real case sensitivity setup refused $($raw.win32Error)"}
                $c=Start-Child $item.fixture;$r=Refused-Startup $c @('case_sensitive_directory');Evidence $item.id $r
            }
        }
        foreach($id in @('race-held-ancestor-rename','race-held-ancestor-delete-access')) {
            Run-Case $id {
                # Two slots are provisioned below for this exact boundary; no restart/recycle.
                $c=Start-Child 'raceHeld' 'after_component';Wait-Hook $c;$w=$fixtures.raceHeld.witness
                if($id -eq 'race-held-ancestor-rename'){$raw=[InitialFenceProof.Native]::TryMove($w.DrivePath,(Join-Path $workspace.DrivePath 'raceHeld-attempted-renamed'))}
                else{$raw=[InitialFenceProof.Native]::DeleteAccess($w.DrivePath,$true)}
                Evidence $id $raw;Assert-True (-not $raw.ok -and $raw.win32Error -eq 32) 'helper-held ancestor forbids DELETE/rename, driver witnesses share DELETE'
                Resume-Hook $c;$c.Startup=Read-Ack $c 'startup';Assert-Identity $c.Startup.rootIdentity $w.Original;$r=Acquire $c;Evidence $id (Check-Own $c $r.sessionRef);Stop-Child $c
            }
        }
        foreach($item in @(@{id='race-before-lock';fixture='pauseLock';kind='before_lock'},@{id='race-after-lock';fixture='pauseAfter';kind='after_lock'},@{id='race-before-publication';fixture='pausePublish';kind='before_publish'})) {
            Run-Case $item.id {
                $c=Start-Child $item.fixture $item.kind;Assert-True $c.Startup.ok 'root held before acquire hook';$c.Channel.Send('acquire');Wait-Hook $c
                $w=$fixtures[$item.fixture].witness
                if($item.kind -eq 'before_lock') {
                    $raw=[InitialFenceProof.Native]::TryMove($w.DrivePath,(Join-Path $workspace.DrivePath ($item.fixture+'-attempted-renamed')));Assert-True (-not $raw.ok -and $raw.win32Error -eq 32) 'held root rename refused immediately before lock open'
                    Resume-Hook $c;$r=Read-Ack $c 'acquire';Assert-True $r.ok 'same pinned root acquired after pause';$refOwners[$r.sessionRef]=$c.Channel;Evidence $item.id @{attempt=$raw;result=(Check-Own $c $r.sessionRef)};Stop-Child $c
                } elseif($item.kind -eq 'after_lock') {
                    $raw=[InitialFenceProof.Native]::OpenReadWrite($fixtures[$item.fixture].lock.DrivePath);Assert-True (-not $raw.ok -and $raw.win32Error -eq 32) 'unpublished held candidate already excludes READ|WRITE'
                    Resume-Hook $c;$r=Read-Ack $c 'acquire';Assert-True $r.ok 'candidate published after fresh checks';$refOwners[$r.sessionRef]=$c.Channel;Evidence $item.id @{attempt=$raw;result=(Check-Own $c $r.sessionRef)};Stop-Child $c
                } else {
                    $raw=[InitialFenceProof.Native]::MarkOffline($w.DrivePath);Evidence $item.id $raw
                    if(-not $raw.ok){Resume-Hook $c;$r=Read-Ack $c 'acquire';if($r.ok){$refOwners[$r.sessionRef]=$c.Channel;Stop-Child $c};throw "UNVERIFIED: mutation before publication unavailable $($raw.win32Error)"}
                    Resume-Hook $c;$r=Read-Ack $c 'acquire';Assert-True (-not $r.ok -and $r.code -eq 'directory_attributes_refused' -and $r.fenceState -eq 'CLOSED' -and $r.testTrace.publishedAcquisitions -eq 0) 'fresh before-publication checks close unpublished fence';Exact-Exit $c 2;Evidence $item.id $r
                    $rawOpen=[InitialFenceProof.Native]::OpenReadWrite($fixtures[$item.fixture].lock.DrivePath);Assert-True $rawOpen.ok 'candidate handle released after terminal exact exit';Evidence $item.id $rawOpen
                }
            }
        }
        foreach($item in @(@{id='lock-directory';fixture='directoryLock'},@{id='lock-nonempty';fixture='nonemptyLock'},@{id='missing-lock';fixture='missingLock'})) {
            Run-Case $item.id {
                $c=Start-Child $item.fixture;Assert-True $c.Startup.ok 'root observed before refused lock open';$r=Command $c 'acquire'
                Assert-True (-not $r.ok -and $r.fenceState -eq 'CLOSED' -and $r.testTrace.publishedAcquisitions -eq 0) 'invalid/missing lock closes without publication'
                if($item.id -eq 'lock-directory'){Assert-True ([IO.Directory]::Exists((Join-Path $fixtures[$item.fixture].witness.DrivePath '.initial-owned-fence.lock'))) 'directory lock not repaired'}
                elseif($item.id -eq 'lock-nonempty'){Assert-True ([IO.File]::ReadAllText($fixtures[$item.fixture].lock.DrivePath) -eq 'must remain unchanged') 'nonempty lock not truncated'}
                else{Assert-True ($r.win32Error -in @(2,3) -and -not [IO.File]::Exists((Join-Path $fixtures[$item.fixture].witness.DrivePath '.initial-owned-fence.lock'))) 'missing lock not created'}
                Exact-Exit $c 2;Evidence $item.id $r
            }
        }
        Run-Case 'missing-root' {
            $w=$fixtures.missingRoot.witness;$parking=Park-Descendants 'missing-root' $w $workspace 'missingRoot-preserved-original'
            $held=Move-Owned $w $workspace 'missingRoot-preserved-original'
            $c=Start-Child 'missingRoot';$r=Refused-Startup $c @('relative_open_failed');Assert-True ($r.win32Error -in @(2,3)) 'missing root actual open error';Evidence 'missing-root' $r
            Assert-True (-not [IO.Directory]::Exists($w.DrivePath)) 'missing root not recreated'
            Restore-Original $held $w;Rehold-Parking $parking
        }
        Run-Case 'lock-hardlink' {
            $f=$fixtures.hardlinkLock;Guard-Effects;[InitialFenceProof.Native]::AssertFresh($f.witness.DrivePath,$f.witness)
            $alias=Join-Path $f.witness.DrivePath 'existing-hardlink-alias'
            [InitialFenceProof.Native]::AssertFreshFile($f.lock.DrivePath,$f.lock)
            $raw=[InitialFenceProof.Native]::TryHardLink($alias,$f.lock.DrivePath);Evidence 'lock-hardlink' $raw
            if(-not $raw.ok){throw "UNVERIFIED: actual hardlink setup failed $($raw.win32Error)"}
            $c=Start-Child 'hardlinkLock';$r=Command $c 'acquire';Assert-True (-not $r.ok -and $r.code -eq 'lock_standard_refused' -and $r.fenceState -eq 'CLOSED') 'NumberOfLinks=2 refusal';Exact-Exit $c 2;Evidence 'lock-hardlink' $r
            Run-Case 'hardlink-alias-read-write' {
                $held=[InitialFenceProof.Native]::HoldFenceProfile($f.lock.DrivePath)
                try{$rawAlias=[InitialFenceProof.Native]::OpenReadWrite($alias);Assert-True (-not $rawAlias.ok -and $rawAlias.win32Error -eq 32) 'actual controller access profile cannot bypass sharing through existing hardlink';Evidence 'hardlink-alias-read-write' @{access='READ_DATA|WRITE_DATA|READ_ATTRIBUTES|SYNCHRONIZE';share=0;aliasOpen=$rawAlias}}
                finally{$held.Dispose()}
            }
            Assert-True ([IO.File]::Exists($alias) -and ([IO.FileInfo]$f.lock.DrivePath).Length -eq 0) 'hardlinks preserved unchanged'
        }
        Run-Case 'lock-symlink' {
            $f=$fixtures.symlinkLock;Guard-Effects;[InitialFenceProof.Native]::AssertFresh($f.witness.DrivePath,$f.witness)
            $saved=Join-Path $f.witness.DrivePath 'original-lock-preserved'
            [InitialFenceProof.Native]::AssertFreshFile($f.lock.DrivePath,$f.lock)
            $raw=[InitialFenceProof.Native]::TryMove($f.lock.DrivePath,$saved);if(-not $raw.ok){throw "UNVERIFIED: preserve original lock failed $($raw.win32Error)"}
            Record-KnownMove $f.lock $f.lock.CurrentKnownPath $saved
            $preserved=[InitialFenceProof.Native]::VerifyOwnHeldPinAt($f.lock,$saved)
            [InitialFenceProof.Native]::AssertFreshFile($outsideLock.DrivePath,$outsideLock)
            $outsidePin=[InitialFenceProof.Native]::VerifyOwnHeldPinAt($outsideLock,$outsideLock.CurrentKnownPath)
            Assert-True ([IO.File]::ReadAllText($outsideLock.DrivePath) -eq 'foreign-to-fixture nonempty sentinel') 'outside sentinel unchanged before symlink setup'
            Evidence 'lock-symlink' @{returnMarshalling='BOOLEAN/U1';createFlags=2;originalPreservedPin=$f.lock.Original;preservedHeldPhysicalReadback=$preserved;outsideOriginalPin=$outsideLock.Original;outsideHeldPhysicalReadback=$outsidePin;outsideContentUnchanged=$true;privilegeOrConfigChanged=$false}
            $raw=[InitialFenceProof.Native]::TrySymlink($f.lock.DrivePath,$outsideLock.DrivePath);Evidence 'lock-symlink' $raw
            $preservedAfterCreate=[InitialFenceProof.Native]::VerifyOwnHeldPinAt($f.lock,$saved)
            [InitialFenceProof.Native]::AssertFreshFile($outsideLock.DrivePath,$outsideLock)
            Assert-True ([IO.File]::ReadAllText($outsideLock.DrivePath) -eq 'foreign-to-fixture nonempty sentinel') 'outside sentinel unchanged after symlink API result'
            Evidence 'lock-symlink' @{afterCreateOriginalPreservedReadback=$preservedAfterCreate;outsideContentUnchanged=$true;childStarted=$false}
            if(-not $raw.ok){throw "UNVERIFIED: symlink setup unavailable $($raw.win32Error)"}
            try {$linkProof=[InitialFenceProof.Native]::ReadLockSymlinkProof($f.witness)}
            catch {Evidence 'lock-symlink' @{setupReadbackFailed=$_.Exception.Message;childStarted=$false};throw ('UNKNOWN: reported symlink creation lacks factual no-follow setup readback: '+$_.Exception.Message)}
            Evidence 'lock-symlink' @{beforeChild=$linkProof;parentOriginalPin=$f.witness.Original;access='READ_ATTRIBUTES|SYNCHRONIZE';share=7;disposition='FILE_OPEN';options='FILE_OPEN_REPARSE_POINT|FILE_NON_DIRECTORY_FILE|FILE_SYNCHRONOUS_IO_NONALERT'}
            Assert-True ($linkProof.identity.fileIdHex -cne $f.lock.Original.fileIdHex -and $linkProof.identity.fileIdHex -cne $outsideLock.Original.fileIdHex) 'symlink has its own physical identity, no target/original rebind'
            $c=Start-Child 'symlinkLock';Assert-True $c.Startup.ok 'original symlink fixture root observed';Assert-Identity $c.Startup.rootIdentity $f.witness.Original
            $r=Command $c 'acquire';Evidence 'lock-symlink' $r
            Assert-True (-not $r.ok -and $r.code -eq 'lock_attributes_refused' -and $r.fenceState -eq 'CLOSED' -and $r.testTrace.lockWriteOpenAttempts -eq 1 -and $r.testTrace.publishedAcquisitions -eq 0) 'no-follow lock symlink refusal';Exact-Exit $c 2
            $after=[InitialFenceProof.Native]::ReadLockSymlinkProof($f.witness)
            Assert-True ([InitialFenceProof.Native]::Same($linkProof.identity,$after.identity)) 'same no-follow symlink node preserved after child exact exit'
            $preservedAfter=[InitialFenceProof.Native]::VerifyOwnHeldPinAt($f.lock,$saved)
            [InitialFenceProof.Native]::AssertFreshFile($outsideLock.DrivePath,$outsideLock)
            Assert-True ([IO.File]::ReadAllText($outsideLock.DrivePath) -eq 'foreign-to-fixture nonempty sentinel') 'symlink target untouched'
            Evidence 'lock-symlink' @{afterExactExit=$after;preservedHeldPhysicalReadback=$preservedAfter;outsideContentUnchanged=$true;exactExit=$c.Exit}
        }
        Run-Case 'lock-deletion-pending' {
            $f=$fixtures.pendingLock;Guard-Effects;[InitialFenceProof.Native]::AssertFresh($f.witness.DrivePath,$f.witness)
            [InitialFenceProof.Native]::AssertFreshFile($f.lock.DrivePath,$f.lock)
            $pending=[InitialFenceProof.Native]::HoldDeletePending($f.lock.DrivePath)
            try {
                $c=Start-Child 'pendingLock';$r=Command $c 'acquire'
                Assert-True (-not $r.ok -and $r.testTrace.publishedAcquisitions -eq 0 -and $r.code -in @('relative_open_failed','fence_busy','lock_standard_refused')) 'pending-delete lock never publishes witness'
                Evidence 'lock-deletion-pending' $r
                if($r.fenceState -eq 'CLOSED'){Exact-Exit $c 2}else{Stop-Child $c}
            } finally{$pending.Dispose()}
        }
        Run-Case 'denied-access' {
            $f=$fixtures.deniedLock;Guard-Effects;[InitialFenceProof.Native]::AssertFresh($f.witness.DrivePath,$f.witness)
            [InitialFenceProof.Native]::AssertFreshFile($f.lock.DrivePath,$f.lock)
            $acl=[IO.File]::GetAccessControl($f.lock.DrivePath)
            $savedAcl=$acl.GetSecurityDescriptorSddlForm([Security.AccessControl.AccessControlSections]::Access)
            $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User
            $rule=New-Object Security.AccessControl.FileSystemAccessRule($sid,([Security.AccessControl.FileSystemRights]::ReadData -bor [Security.AccessControl.FileSystemRights]::WriteData),[Security.AccessControl.AccessControlType]::Deny)
            $acl.AddAccessRule($rule);[IO.File]::SetAccessControl($f.lock.DrivePath,$acl)
            try {
                $c=Start-Child 'deniedLock';$r=Command $c 'acquire';Assert-True (-not $r.ok -and $r.code -eq 'relative_open_failed' -and $r.win32Error -eq 5 -and $r.fenceState -eq 'CLOSED') 'actual denied READ|WRITE access fail closed';Exact-Exit $c 2;Evidence 'denied-access' $r
            } finally {
                Guard-Effects;[InitialFenceProof.Native]::AssertFresh($f.witness.DrivePath,$f.witness)
                [InitialFenceProof.Native]::AssertFreshFile($f.lock.DrivePath,$f.lock)
                $restore=New-Object Security.AccessControl.FileSecurity;$restore.SetSecurityDescriptorSddlForm($savedAcl,[Security.AccessControl.AccessControlSections]::Access);[IO.File]::SetAccessControl($f.lock.DrivePath,$restore)
            }
        }
        Run-Case 'cleanup-unknown-entry-preserved' {
            $w=$fixtures.normalB.witness;Guard-Effects;[InitialFenceProof.Native]::WriteNewText($w,'unknown-to-original-manifest.txt','preserve unknown entry')
            # This driver intentionally has no deleting cleanup implementation.
            Assert-True ([IO.File]::ReadAllText((Join-Path $w.DrivePath 'unknown-to-original-manifest.txt')) -eq 'preserve unknown entry') 'unknown entry retained under safe default'
            Evidence 'cleanup-unknown-entry-preserved' @{cleanup='preserve entire scratch';deletedEntries=0}
        }
        Run-Case 'runroot-ordinary-replacement' {
            $c=Start-Child 'runrootProbe' 'before_component';Wait-Hook $c
            $parking=Park-Descendants 'runroot-ordinary-replacement' $workspace $roots 'workspace-held-original' $c
            $held=Move-Owned $workspace $roots 'workspace-held-original';$replacement=New-Dir $roots 'workspace'
            [InitialFenceProof.Native]::WriteNewText($replacement,'marker.txt','ordinary replacement workspace preserved')
            Resume-Hook $c;$c.Startup=Read-Ack $c 'startup';$r=Refused-Startup $c @('root_identity_changed');Evidence 'runroot-ordinary-replacement' $r
            Run-Case 'cleanup-runroot-replaced' {
                $refused=$false;try{[InitialFenceProof.Native]::AssertFresh($workspace.DrivePath,$workspace)}catch{$refused=$true;Evidence 'cleanup-runroot-replaced' @{freshTraversalRefusal=$_.Exception.Message}}
                Assert-True $refused 'runRoot original pin does not rebind to ordinary replacement'
                Assert-True ([IO.File]::ReadAllText((Join-Path $replacement.DrivePath 'marker.txt')) -eq 'ordinary replacement workspace preserved') 'replacement workspace contents untouched'
            }
            $null=Move-Owned $replacement $roots 'workspace-preserved-ordinary-replacement';Restore-Original $held $workspace
            # Only these original refs are reused by the next child. Other
            # preserved fixtures remain parked and never authorize another open.
            Rehold-Parking $parking @($fixtures.runrootProbe.witness,$fixtures.runrootProbe.lock)
        }
        Run-Case 'runroot-reparse-replacement' {
            $c=Start-Child 'runrootProbe' 'before_component';Wait-Hook $c
            $parking=Park-Descendants 'runroot-reparse-replacement' $workspace $roots 'workspace-held-original' $c
            $null=Move-Owned $workspace $roots 'workspace-held-original';$replacement=New-Dir $roots 'workspace'
            $raw=[InitialFenceProof.Native]::Junction($replacement.DrivePath,$outside.DrivePath);Evidence 'runroot-reparse-replacement' $raw
            if(-not $raw.ok){throw "UNVERIFIED: runRoot junction setup failed $($raw.win32Error)"}
            Resume-Hook $c;$c.Startup=Read-Ack $c 'startup';$r=Refused-Startup $c @('directory_attributes_refused');Evidence 'runroot-reparse-replacement' $r
            $parking.data.state='UNUSED_ORIGINAL_WORKSPACE_PRESERVED_PARKED'
            Run-Case 'cleanup-runroot-reparse-outside' {
                $refused=$false;try{[InitialFenceProof.Native]::AssertFresh($workspace.DrivePath,$workspace)}catch{$refused=$true;Evidence 'cleanup-runroot-reparse-outside' @{freshTraversalRefusal=$_.Exception.Message}}
                Assert-True $refused 'runRoot reparse replacement refused by fresh no-follow traversal'
                Assert-True ([IO.File]::ReadAllText($outsideMarker.DrivePath) -eq 'owned outside-fixture sentinel; never helper effects') 'outside target untouched; no cleanup removal'
            }
        }
    }
} catch {
    # Terminal case errors unwind the suite before any subsequent case/effect.
    Stop-Suite $_.Exception.Message
    $driverFault=$_.Exception.Message
    $initialDriverFaultEvidence=Initial-FaultEvidence $_
    # Emit the bounded primary error before finally. A secondary receipt/shaping
    # failure cannot hide its original location/stack or authorize a replay.
    [pscustomobject]@{schema='ae-agent.initial-fence-prerequisite.driver-fault.v1';scope='windows_identity_fence_prerequisite';productionAuthority=$false;issuerStatus='unavailable';admission=$false;runId=$runId;initialDriverFault=$initialDriverFaultEvidence}|ConvertTo-Json -Compress -Depth 4
} finally {
    $reconciliation=New-Object 'System.Collections.Generic.List[object]'
    $allChildrenExited=$true
    $barrierFailure=$null
    if($TimeoutBarrierProof -and $timeoutBarrier.armed) {
        try {
            Assert-True ($timeoutBarrier.timedOut -and $controller.suiteStopped -and $timeoutBarrier.elapsedMilliseconds -ge 4000) 'actual acquire ACK timeout beyond 4000ms caused terminal barrier'
            Assert-SameCounters $timeoutBarrier.pausedCounters $timeoutBarrier.timeoutCounters
            $timeoutBarrier.reconciliationEntryCounters=Controller-Counters
            Assert-SameCounters $timeoutBarrier.timeoutCounters $timeoutBarrier.reconciliationEntryCounters
        } catch {$barrierFailure=$_.Exception.Message}
    }
    foreach($event in $events.Values){$null=$event.Resume.Set()}
    foreach($child in $channels) {
        $focused=$TimeoutBarrierProof -and [object]::ReferenceEquals($child,$timeoutBarrier.child)
        $item=[ordered]@{factoryInstanceId=$child.Slot.instanceId;boundToOriginalHeldProcessAndStdio=$true;pendingAckReconciled=$false;eofRequested=$false;exactExited=$false;exitCode=$null;termination=$null;state='UNKNOWN';diagnostic=$null}
        try {
            # A timeout retained this exact Channel.Pending task. Consume that ACK,
            # never acquire again and never launch a replacement child/slot.
            if($null -ne $child.Channel.Pending) {
                $late=$child.Channel.Receive($(if($focused){4000}else{1000}))
                if($null -ne $late) {
                    $lateResult=$late|ConvertFrom-Json;Assert-Envelope $lateResult
                    $child.Transcript.Add($lateResult);$item.pendingAckReconciled=$true
                    if($focused) {
                        Assert-True ($lateResult.operation -ceq 'acquire' -and $lateResult.ok -and $lateResult.code -ceq 'acquired' -and $lateResult.fenceState -ceq 'FENCE_HELD' -and $lateResult.sessionRef -ceq ($child.Slot.instanceId+':1') -and $lateResult.activeSessionRef -ceq $lateResult.sessionRef -and $lateResult.testTrace.lockWriteOpenAttempts -eq 1 -and $lateResult.testTrace.publishedAcquisitions -eq 1) 'late ACK proves actual single successful acquire, no replay'
                        Assert-Identity $lateResult.rootIdentity $fixtures.pausePublish.witness.Original
                        Assert-Identity $lateResult.lockIdentity $fixtures.pausePublish.lock.Original
                        $timeoutBarrier.lateAck=$lateResult;$timeoutBarrier.lateAckCounters=Controller-Counters
                        Assert-SameCounters $timeoutBarrier.timeoutCounters $timeoutBarrier.lateAckCounters
                    }
                } elseif($null -eq $child.Channel.Pending) {
                    $item.pendingAckReconciled=$true # Actual EOF from the retained task.
                }
            }
            if(-not $child.Channel.ExactExited(0)) {
                # EOF is sent once to the original pipe; kernel call is not
                # abandoned and closure is not inferred from this request.
                $child.Channel.CloseInput();$item.eofRequested=$true
                if(-not $child.Channel.ExactExited(3000)) {
                    # Exact held process-instance termination after reconciliation,
                    # not PID lookup/kill. Verify exit; otherwise retain UNKNOWN.
                    $item.termination=$child.Channel.TerminateExact()
                }
            }
            $item.exactExited=$child.Channel.ExactExited(3000)
            if($item.exactExited) {
                $item.exitCode=$child.Channel.ExactExitCode();$item.state='CLOSED'
                $item.diagnostic=$child.Channel.BoundedStderr()
                if($null -ne $child.Channel.Pending -and $child.Channel.Pending.IsCompleted){$null=$child.Channel.Receive(0)}
            } else {$allChildrenExited=$false}
        } catch {
            $item.diagnostic=$_.Exception.Message
            # Even a protocol/read exception cannot turn an exact live child into
            # a supposedly closed object. EOF and held-handle exit are reconciled.
            try {
                if(-not $child.Channel.ExactExited(0)){$child.Channel.CloseInput();$item.eofRequested=$true}
                $item.exactExited=$child.Channel.ExactExited(3000)
                if(-not $item.exactExited){$item.termination=$child.Channel.TerminateExact();$item.exactExited=$child.Channel.ExactExited(3000)}
                if($item.exactExited){$item.exitCode=$child.Channel.ExactExitCode();$item.state='CLOSED'}else{$allChildrenExited=$false}
            } catch {$allChildrenExited=$false;$item.state='UNKNOWN';$item.diagnostic+='; '+$_.Exception.Message}
        }
        if($focused) {
            $timeoutBarrier.exitCounters=Controller-Counters
            try {
                Assert-SameCounters $timeoutBarrier.timeoutCounters $timeoutBarrier.exitCounters
                Assert-True ($null -ne $timeoutBarrier.lateAck -and $item.pendingAckReconciled -and $item.eofRequested -and $item.exactExited -and $item.exitCode -eq 0 -and $null -eq $item.termination -and [string]::IsNullOrEmpty([string]$item.diagnostic)) 'late acquired ACK then EOF and exact exit=0 without termination'
            } catch {if($null -eq $barrierFailure){$barrierFailure=$_.Exception.Message}}
        }
        $reconciliation.Add($item)
    }
    $controller.reconciliationComplete=$allChildrenExited
    if($TimeoutBarrierProof -and $timeoutBarrier.armed) {
        Evidence 'controller-timeout-barrier' @{expectedTimeoutMilliseconds=4000;actualTimeoutMilliseconds=$timeoutBarrier.elapsedMilliseconds;terminalStop=$controller.suiteStopped;stopReason=$controller.stopReason;pausedCounters=$timeoutBarrier.pausedCounters;timeoutCounters=$timeoutBarrier.timeoutCounters;reconciliationEntryCounters=$timeoutBarrier.reconciliationEntryCounters;lateAckCounters=$timeoutBarrier.lateAckCounters;exactExitCounters=$timeoutBarrier.exitCounters;lateAcquireAck=$timeoutBarrier.lateAck;counterScope='child start attempts / registered held channels / guarded filesystem effect boundary entries; final receipt excluded';barrierFailure=$barrierFailure}
        if($null -eq $barrierFailure -and $allChildrenExited -and $channels.Count -eq 1 -and $timeoutBarrier.timedOut -and $null -ne $timeoutBarrier.lateAck) {
            $cases['controller-timeout-barrier'].status='PASS';$cases['controller-timeout-barrier'].reason='actual delayed acquired ACK reconciled on original channel, then EOF/exact exit=0; no intervening child/filesystem effect boundary'
            $driverFault=$null # Only this verified, intentionally induced timeout.
        } else {
            $cases['controller-timeout-barrier'].status=if($barrierFailure){'FAIL'}else{'UNVERIFIED'}
            $cases['controller-timeout-barrier'].reason=if($barrierFailure){$barrierFailure}else{'timeout barrier reconciliation incomplete'}
        }
    }
    $proofStatus=if(-not $allChildrenExited){'UNKNOWN'}elseif(@($cases.Values|Where-Object{$_.status -eq 'FAIL'}).Count -gt 0){'FAIL'}elseif($driverFault){'UNVERIFIED'}elseif(@($cases.Values|Where-Object{$_.status -ne 'PASS'}).Count -gt 0){'UNVERIFIED'}else{'PASS'}
    $receipt=[ordered]@{schema='ae-agent.initial-fence-prerequisite.proof.v1';scope='windows_identity_fence_prerequisite';productionAuthority=$false;issuerStatus='unavailable';admission=$false;runId=$runId;mode=if($TimeoutBarrierProof){'parent-timeout-barrier-proof'}elseif($RunNativeProof){'parent-native-proof'}else{'build-only'};status=$proofStatus;driverFault=$driverFault;initialDriverFault=$initialDriverFaultEvidence;sources=$sourceHashes;build=$buildReceipt;cases=@($cases.Values);parking=$parkingReceipts.ToArray();verifiedOwnMoves=$knownMoves.ToArray();children=@($channels|ForEach-Object{@{instanceId=$_.Slot.instanceId;commands=$_.Transcript.ToArray();proofExit=$_.Exit}});reconciliation=$reconciliation.ToArray();allExactChildrenExited=$allChildrenExited;controller=@{suiteStopped=$controller.suiteStopped;stopReason=$controller.stopReason;countersBeforeFinalReceipt=(Controller-Counters);counterScope='guarded effect boundaries, not a claim that every boundary wrote a file'};cleanup=@{filesystem='preserve all scratch';recursiveDelete=$false;pathnameCleanup=$false;unknownObjects='preserved';dosDeviceCreated=$false}}
    if($null -ne $evidence) {
        try {
            Guard-Effects -FinalReceipt
            $receiptPath=Join-Path $evidence.DrivePath 'proof-receipt.json'
            [InitialFenceProof.Native]::WriteNewText($evidence,'proof-receipt.json',($receipt|ConvertTo-Json -Depth 18))
        } catch {
            $receiptPath=$null;$driverFault='Receipt effect refused by fresh container pins: '+$_.Exception.Message;$proofStatus='UNKNOWN'
            # No fallback write to an unpinned/pathname replacement. Emit bounded
            # console evidence so the parent sees receipt unavailability.
        }
    }
    foreach($event in $events.Values){$event.Ready.Dispose();$event.Resume.Dispose()}
    foreach($child in $channels){$child.Channel.Dispose()}
    # Keep ownership witnesses to the end of the final pinned receipt effect.
    # Closing them does not authorize any subsequent file/directory cleanup.
    for($i=$allWitnesses.Count-1;$i -ge 0;$i--){$allWitnesses[$i].Dispose()}
}

[pscustomobject]@{schema='ae-agent.initial-fence-prerequisite.summary.v1';scope='windows_identity_fence_prerequisite';productionAuthority=$false;issuerStatus='unavailable';admission=$false;runId=$runId;status=$proofStatus;receipt=$receiptPath;driverFault=$driverFault;initialDriverFault=$initialDriverFaultEvidence;terminalStopReason=$controller.stopReason;cases=$cases.Count;pass=@($cases.Values|Where-Object{$_.status -eq 'PASS'}).Count;fail=@($cases.Values|Where-Object{$_.status -eq 'FAIL'}).Count;unverified=@($cases.Values|Where-Object{$_.status -eq 'UNVERIFIED'}).Count;allExactChildrenExited=$allChildrenExited;scratchPreserved=$true}|ConvertTo-Json -Compress -Depth 4
if($driverFault -or -not $allChildrenExited){exit 1}
if(($RunNativeProof -or $TimeoutBarrierProof) -and $proofStatus -ne 'PASS'){exit 2}
exit 0
