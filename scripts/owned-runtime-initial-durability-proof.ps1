#requires -Version 5.1
[CmdletBinding()]
param([switch]$BuildOnly,[switch]$RunNativeProof,[switch]$InternalDeathDriver)
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
if($InternalDeathDriver){if($BuildOnly-or $RunNativeProof){throw 'Private driver mode cannot select a parent action.'}}elseif(([int]$BuildOnly.IsPresent+[int]$RunNativeProof.IsPresent)-ne 1){throw 'Choose exactly one explicit parent action: -BuildOnly or -RunNativeProof after source GO.'}
# Test-only original pins/handles. All scratch evidence is preserved; no cleanup.
$nativeSource = @'
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Security.Cryptography;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.Win32.SafeHandles;

namespace InitialDurabilityProof {
  public sealed class Snapshot {
    public string volumeGuid, volumeSerialHex, fileIdHex, canonicalPath;
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
    public Snapshot Fresh() { return Native.Read(Handle, IsDirectory); }
    public void Dispose() { Handle.Dispose(); IsParked=true; }
  }
  public sealed class Chain : IDisposable {
    public List<Witness> Held=new List<Witness>();
    public Witness Leaf { get { return Held[Held.Count-1]; } }
    public void Dispose() { for(int i=Held.Count-1;i>=0;i--) Held[i].Dispose(); }
  }
  public static class Native {
    const uint ReadAttributes=0x80, Sync=0x100000, ShareAll=7;
    [StructLayout(LayoutKind.Sequential)] struct UnicodeString { public ushort Length, MaximumLength; public IntPtr Buffer; }
    [StructLayout(LayoutKind.Sequential)] struct ObjectAttributes { public uint Length; public IntPtr Root; public IntPtr Name; public uint Attributes; public IntPtr Security, Quality; }
    [StructLayout(LayoutKind.Sequential)] struct IoStatus { public IntPtr Status, Information; }
    [DllImport("ntdll.dll")] static extern int NtCreateFile(out IntPtr h,uint access,ref ObjectAttributes oa,out IoStatus io,IntPtr size,uint attributes,uint share,uint disposition,uint options,IntPtr ea,uint eaLength);
    [DllImport("ntdll.dll")] static extern int NtSetInformationFile(SafeFileHandle h,out IoStatus io,IntPtr buffer,uint length,int cls);
    [DllImport("ntdll.dll")] static extern uint RtlNtStatusToDosError(int status);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern SafeFileHandle CreateFileW(string path,uint access,uint share,IntPtr security,uint disposition,uint flags,IntPtr template);
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetFileInformationByHandleEx(SafeFileHandle h,int cls,IntPtr buffer,uint length);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern uint GetFinalPathNameByHandleW(SafeFileHandle h,StringBuilder path,uint size,uint flags);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool GetVolumeInformationByHandleW(SafeFileHandle h,IntPtr name,uint nameSize,IntPtr serial,IntPtr max,IntPtr flags,StringBuilder fs,uint fsSize);
    [DllImport("kernel32.dll",SetLastError=true)] static extern uint GetFileType(SafeFileHandle h);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern uint GetVolumeNameForVolumeMountPointW(string root,StringBuilder volume,uint length);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] public static extern bool CreateHardLinkW(string link,string target,IntPtr security);
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
      string name=Path.GetFileName(w.CurrentKnownPath);uint access=ReadAttributes|Sync|(name==".initial-owned-fence.lock"?0u:1u);
      var h=Relative(parent.Handle,name,access,ShareAll,1,w.IsDirectory?0x00200020u:0x00200060u);
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
        var h=CreateFileW(volume.ToString(),1|ReadAttributes|Sync,ShareAll,IntPtr.Zero,3,0x02200000,IntPtr.Zero); if(h.IsInvalid) throw new Win32Exception();
        chain.Held.Add(new Witness(h,absolute.Substring(0,3),true));
        if(chain.Leaf.Original.canonicalPath!=chain.Leaf.Original.volumeGuid) throw new InvalidOperationException("not volume root");
        foreach(string name in absolute.Substring(3).Split(new char[]{'\\'},StringSplitOptions.RemoveEmptyEntries)) {
          h=Relative(chain.Leaf.Handle,name,1|ReadAttributes|Sync,ShareAll,1,0x00200020);
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
      using(var h=Relative(chain.Leaf.Handle,Path.GetFileName(path),1|ReadAttributes|Sync,ShareAll,1,0x00200020))
        if(!Same(Read(h,false),original.Original)) throw new InvalidOperationException("original file pin mismatch: "+path);
    }
    public static Witness NewDirectory(Witness parent,string name) {
      AssertFresh(parent.DrivePath,parent);
      var h=Relative(parent.Handle,name,1|ReadAttributes|Sync,ShareAll,2,0x21);
      return new Witness(h,Path.Combine(parent.DrivePath,name),true);
    }
    public static Witness OpenChildDirectory(Witness parent,string name) {
      AssertFresh(parent.DrivePath,parent);
      return new Witness(Relative(parent.Handle,name,1|ReadAttributes|Sync,ShareAll,1,0x00200020),Path.Combine(parent.DrivePath,name),true);
    }
    public static Witness NewFile(Witness parent,string name,byte[] contents) {
      if(contents==null) throw new ArgumentNullException("contents"); // Reject before FILE_CREATE.
      AssertFresh(parent.DrivePath,parent);
      using(var write=Relative(parent.Handle,name,3|1|ReadAttributes|Sync,ShareAll,2,0x00200060)) {
        if(contents.Length>0) {uint written;Check(WriteFile(write,contents,(uint)contents.Length,out written,IntPtr.Zero));if(written!=contents.Length)throw new IOException("short provisioning write");}
      }
      // L2 lock witness profile: retain the original held metadata/pin without
      // READ_DATA, which would conflict with the unchanged exclusive share=0 fence.
      uint witnessAccess=ReadAttributes|Sync|(name==".initial-owned-fence.lock"?0u:1u);
      return new Witness(Relative(parent.Handle,name,witnessAccess,ShareAll,1,0x00200020),Path.Combine(parent.DrivePath,name),false);
    }
    public static void WriteNewText(Witness parent,string name,string contents) { using(var file=NewFile(parent,name,new UTF8Encoding(false,true).GetBytes(contents))) {} }

    [DllImport("kernel32.dll",SetLastError=true)] static extern bool ReadFile(SafeFileHandle h,byte[] bytes,uint length,out uint read,IntPtr overlap);
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetFilePointerEx(SafeFileHandle h,long offset,out long position,uint method);
    public sealed class SlotRead { public Snapshot Pin; public byte[] Bytes; }
    public static SlotRead ReadSlotRaw(Witness journal,ulong sequence) {
      RequireHeld(journal);if(!Same(journal.Original,Read(journal.Handle,true)))throw new IOException("original held journal changed");
      if(sequence==0||sequence>256)throw new IOException("bounded slot required");string name=sequence.ToString("D20")+".rec";
      using(var h=Relative(journal.Handle,name,1|ReadAttributes|Sync,3,1,0x00200060)) {
        Snapshot pin=Read(h,false);IntPtr s=Query(h,1,24);long length;uint links;
        try{length=Marshal.ReadInt64(s,8);links=unchecked((uint)Marshal.ReadInt32(s,16));}finally{Marshal.FreeHGlobal(s);}
        if(links!=1||length<0||length>16384)throw new IOException("slot shape/size refused");
        if(!String.Equals(pin.canonicalPath,journal.Original.canonicalPath+"\\"+name,StringComparison.OrdinalIgnoreCase)||pin.volumeSerialHex!=journal.Original.volumeSerialHex)throw new IOException("slot escaped held journal");
        long position;if(!SetFilePointerEx(h,0,out position,0))throw new Win32Exception();byte[] b=new byte[(int)length];uint n;
        Check(ReadFile(h,b,(uint)b.Length,out n,IntPtr.Zero));if(n!=b.Length)throw new IOException("independent short read");return new SlotRead{Pin=pin,Bytes=b};
      }
    }
    public static SlotRead ReadSlot(Witness journal,ulong sequence) {var r=ReadSlotRaw(journal,sequence);if(r.Bytes.Length<228)throw new IOException("partial slot");return r;}
    public static Witness TakeOriginalJournal(long locator,string drivePath,Snapshot original) {
      if(locator<=0)throw new IOException("original inherited journal required");var w=new Witness(new SafeFileHandle(new IntPtr(locator),true),drivePath,true);if(!Same(w.Original,original)){w.Dispose();throw new IOException("original journal pin refused");}return w;
    }
    public static string[] Inventory(Witness journal) {
      RequireHeld(journal);if(!Same(journal.Original,Read(journal.Handle,true)))throw new IOException("original journal changed");
      var names=new List<string>();IntPtr b=Marshal.AllocHGlobal(65536);bool first=true;
      try {for(;;){bool ok=GetFileInformationByHandleEx(journal.Handle,first?11:10,b,65536);first=false;if(!ok){int e=Marshal.GetLastWin32Error();if(e==18)break;throw new Win32Exception(e);}int offset=0;
          for(;;){if(offset<0||offset>65432)throw new IOException("directory offset invalid");int next=Marshal.ReadInt32(b,offset);int length=Marshal.ReadInt32(b,offset+60);if(length<0||length%2!=0||length>65536-offset-104)throw new IOException("directory name invalid");string name=Marshal.PtrToStringUni(IntPtr.Add(b,offset+104),length/2);
            if(name!="."&&name!=".."){names.Add(name);if(names.Count>257)throw new IOException("proof inventory bounded at 257");}if(next==0)break;if(next<104||next>65536-offset)throw new IOException("directory next invalid");offset+=next;}}
      }finally{Marshal.FreeHGlobal(b);}names.Sort(StringComparer.Ordinal);return names.ToArray();
    }
    public static void ParkRecord(Witness journal,ulong sequence,Witness preservation,string preservedName) {
      RequireHeld(journal);Read(journal.Handle,true);string name=sequence.ToString("D20")+".rec";
      using(var h=Relative(journal.Handle,name,0x10000|ReadAttributes|Sync,7,1,0x00200060)) {
        Read(h,false);RenameHeld(h,preservation,preservedName);
      }
    }
    public static void RenameHeld(SafeFileHandle source,Witness parent,string name) {
      RequireHeld(parent);VerifyOwnHeldPinAt(parent,parent.CurrentKnownPath);Snapshot target=Read(parent.Handle,true);
      if(String.IsNullOrEmpty(name)||name.IndexOfAny(new char[]{'\\','/',':','\0'})>=0||name=="."||name==".."||name.Length>255)throw new ArgumentException("fixed component required");
      IntPtr standard=Query(source,1,24);bool directory;try{directory=Marshal.ReadByte(standard,21)!=0;}finally{Marshal.FreeHGlobal(standard);}
      Snapshot original=Read(source,directory);
      if(original.volumeSerialHex!=target.volumeSerialHex||!String.Equals(original.volumeGuid,target.volumeGuid,StringComparison.OrdinalIgnoreCase))throw new IOException("relative rename requires original same volume");
      // Native FileRenameInformation (10): simple component relative to the held
      // target directory; zero ReplaceIfExists forbids overwrite. Buffer includes
      // sizeof(FILE_RENAME_INFORMATION), name bytes and spare zero terminator.
      // https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/ntifs/ns-ntifs-_file_rename_information
      byte[] chars=Encoding.Unicode.GetBytes(name);int nameOffset=IntPtr.Size==8?20:12,structureSize=IntPtr.Size==8?24:16;
      int capacity=checked(structureSize+chars.Length+2);IntPtr b=Marshal.AllocHGlobal(capacity);
      try {
        for(int i=0;i<capacity;i++)Marshal.WriteByte(b,i,0);
        Marshal.WriteIntPtr(b,IntPtr.Size==8?8:4,parent.Handle.DangerousGetHandle());Marshal.WriteInt32(b,IntPtr.Size==8?16:8,chars.Length);Marshal.Copy(chars,0,IntPtr.Add(b,nameOffset),chars.Length);
        IoStatus io;int status=NtSetInformationFile(source,out io,b,(uint)capacity,10);
        if(status<0)throw new Win32Exception((int)RtlNtStatusToDosError(status),"NtSetInformationFile FileRenameInformation status="+unchecked((uint)status).ToString("x8")+"; no retry/fallback");
        int completion=unchecked((int)io.Status.ToInt64());
        if(status!=0||completion!=0)throw new IOException("relative rename completion UNKNOWN status="+unchecked((uint)status).ToString("x8")+" completion="+unchecked((uint)completion).ToString("x8")+"; no retry/fallback");
        Snapshot renamed=Read(source,directory);VerifyOwnHeldPinAt(parent,parent.CurrentKnownPath);
        if(!Same(target,Read(parent.Handle,true))||renamed.fileIdHex!=original.fileIdHex||renamed.volumeSerialHex!=original.volumeSerialHex||!String.Equals(renamed.volumeGuid,original.volumeGuid,StringComparison.OrdinalIgnoreCase)||!String.Equals(renamed.canonicalPath,target.canonicalPath+"\\"+name,StringComparison.OrdinalIgnoreCase))throw new IOException("relative rename readback UNKNOWN; no retry/fallback");
      }finally{Marshal.FreeHGlobal(b);}
    }
    public static void ReplaceKnownSlot(Witness journal,ulong sequence,Witness preservation,bool identical) {
      var old=ReadSlot(journal,sequence);ParkRecord(journal,sequence,preservation,"preserved-"+sequence.ToString("D20")+".evidence");
      using(var next=NewFile(journal,sequence.ToString("D20")+".rec",identical?old.Bytes:new byte[]{1})) {if(next.Original.fileIdHex==old.Pin.fileIdHex)throw new IOException("replacement requires new native ID");}
    }
    public static SafeFileHandle OpenOwnDeleteHandle(Witness own,Witness parent,string name) {
      VerifyOwnHeldPinAt(own,own.CurrentKnownPath);VerifyOwnHeldPinAt(parent,parent.CurrentKnownPath);
      if(!own.IsDirectory||!String.Equals(own.CurrentKnownPath,Path.Combine(parent.CurrentKnownPath,name),StringComparison.OrdinalIgnoreCase))throw new IOException("original direct directory child required");
      Snapshot original=Read(own.Handle,true);Read(parent.Handle,true);
      var h=Relative(parent.Handle,name,0x10000|ReadAttributes|Sync,ShareAll,1,0x00200021);
      try{if(!Same(original,Read(h,true)))throw new IOException("temporary DELETE handle is not original held directory");VerifyOwnHeldPinAt(own,own.CurrentKnownPath);VerifyOwnHeldPinAt(parent,parent.CurrentKnownPath);return h;}catch{h.Dispose();throw;}
    }
    public static Raw SetOwnJunction(Witness node,Witness target) {
      VerifyOwnHeldPinAt(node,node.CurrentKnownPath);VerifyOwnHeldPinAt(target,target.CurrentKnownPath);
      string sub=@"\??\"+target.CurrentKnownPath;byte[] a=Encoding.Unicode.GetBytes(sub),c=Encoding.Unicode.GetBytes(target.CurrentKnownPath);byte[] b=new byte[16+a.Length+2+c.Length+2];
      Array.Copy(BitConverter.GetBytes(0xA0000003u),b,4);Array.Copy(BitConverter.GetBytes((ushort)(b.Length-8)),0,b,4,2);Array.Copy(BitConverter.GetBytes((ushort)a.Length),0,b,10,2);Array.Copy(BitConverter.GetBytes((ushort)(a.Length+2)),0,b,12,2);Array.Copy(BitConverter.GetBytes((ushort)c.Length),0,b,14,2);Array.Copy(a,0,b,16,a.Length);Array.Copy(c,0,b,18+a.Length,c.Length);
      using(var h=CreateFileW(node.CurrentKnownPath,0x40000000,7,IntPtr.Zero,3,0x02200000,IntPtr.Zero)){if(h.IsInvalid)return new Raw(false,Marshal.GetLastWin32Error());uint n;bool value=DeviceIoControl(h,0x900A4,b,(uint)b.Length,IntPtr.Zero,0,out n,IntPtr.Zero);return new Raw(value,value?0:Marshal.GetLastWin32Error());}
    }
    public static Raw HardlinkKnownSlot(Witness journal,ulong sequence,Witness preservation) {ReadSlot(journal,sequence);VerifyOwnHeldPinAt(journal,journal.CurrentKnownPath);VerifyOwnHeldPinAt(preservation,preservation.CurrentKnownPath);string source=Path.Combine(journal.CurrentKnownPath,sequence.ToString("D20")+".rec"),link=Path.Combine(preservation.CurrentKnownPath,"extra-link.evidence");bool ok=CreateHardLinkW(link,source,IntPtr.Zero);return new Raw(ok,ok?0:Marshal.GetLastWin32Error());}
    public static string ErrorDetails(Exception error) {
      var text=new StringBuilder();var queue=new Queue<Exception>();if(error!=null)queue.Enqueue(error);
      for(int count=0;queue.Count>0&&count<8;count++){Exception current=queue.Dequeue();string message=current.Message??"";text.Append(current.GetType().FullName).Append(" hresult=").Append(current.HResult.ToString("x8")).Append(": ").Append(message.Substring(0,Math.Min(message.Length,1024))).Append('\n');var aggregate=current as AggregateException;if(aggregate!=null){foreach(Exception inner in aggregate.InnerExceptions.Take(8))queue.Enqueue(inner);}else if(current.InnerException!=null)queue.Enqueue(current.InnerException);}
      return text.ToString(0,Math.Min(text.Length,8192));
    }
    public sealed class OriginalProcessObservation {public bool originalHandleHeld,exactExited;public uint waitResult;public uint? exactExit;public int win32Error;public string disposition;}
    public static OriginalProcessObservation ObserveOriginalProcess(SafeProcessHandle original) {
      var result=new OriginalProcessObservation{disposition="UNVERIFIED",waitResult=0xffffffff};if(original==null||original.IsInvalid||original.IsClosed)return result;result.originalHandleHeld=true;result.waitResult=WaitForSingleObject(original,0);
      if(result.waitResult==0){uint code;if(GetExitCodeProcess(original,out code)){result.exactExited=true;result.exactExit=code;result.disposition="original_exact_exit_observed";}else result.win32Error=Marshal.GetLastWin32Error();}else if(result.waitResult==258)result.disposition="original_not_signaled";else result.win32Error=Marshal.GetLastWin32Error();return result;
    }
  }
  public sealed class Channel : IDisposable {
    [StructLayout(LayoutKind.Sequential)] struct SA {public int Length;public IntPtr Security;public int Inherit;}
    [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] struct SI {public int cb;public string Reserved,Desktop,Title;public uint X,Y,XSize,YSize,XCount,YCount,Fill,Flags;public ushort Show,Reserved2;public IntPtr ReservedBytes,In,Out,Error;}
    [StructLayout(LayoutKind.Sequential)] struct SIX {public SI Startup;public IntPtr Attributes;}
    [StructLayout(LayoutKind.Sequential)] struct PI {public IntPtr Process,Thread;public uint Pid,Tid;}
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool CreatePipe(out IntPtr read,out IntPtr write,ref SA sa,uint size);
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetHandleInformation(IntPtr h,uint mask,uint value);
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool InitializeProcThreadAttributeList(IntPtr list,int count,uint flags,ref IntPtr size);
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool UpdateProcThreadAttribute(IntPtr list,uint flags,IntPtr attribute,IntPtr value,IntPtr size,IntPtr previous,IntPtr returned);
    [DllImport("kernel32.dll")] static extern void DeleteProcThreadAttributeList(IntPtr list);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool CreateProcessW(string app,StringBuilder command,IntPtr ps,IntPtr ts,bool inherit,uint flags,IntPtr environment,string cwd,ref SIX startup,out PI process);
    [DllImport("kernel32.dll")] static extern IntPtr GetCurrentProcess();
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool DuplicateHandle(IntPtr source,IntPtr handle,IntPtr target,out IntPtr copy,uint access,bool inherit,uint options);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
    public static SafeProcessHandle OriginalDriver() {IntPtr h;if(!DuplicateHandle(GetCurrentProcess(),GetCurrentProcess(),GetCurrentProcess(),out h,0,true,2))throw new Win32Exception();return new SafeProcessHandle(h,true);}
    public SafeProcessHandle ProcessHandle;
    public SafeWaitHandle ThreadHandle;
    public string Instance;
    public StreamWriter Input;
    StreamReader output;FileStream error;Task errorDrain;readonly object errorGate=new object();readonly byte[] errorPrefix=new byte[8192];int errorLength;bool errorTruncated,errorComplete;string errorFault;
    public Task<string> Pending;
    public string FatalReadFault {get;private set;}
    public string Session;
    public byte[] Owner;
    public bool ClosedInput;
    public ulong LastPortCounter;
    public string LastStage;
    public ulong CreateCount,WriteCount,FlushCount;
    static string Quote(string text){if(text.IndexOf('"')>=0||text.IndexOf('\0')>=0||text.EndsWith("\\",StringComparison.Ordinal))throw new ArgumentException("fixed argv refused");return "\""+text+"\"";}
    static void Check(bool ok){if(!ok)throw new Win32Exception(Marshal.GetLastWin32Error());}
    public Channel(string instance) {Instance=instance;}
    public void StartNormal(string executable,SafeProcessHandle driver) {if(ProcessHandle!=null)throw new IOException("channel already started");Launch(executable,Quote(executable)+" --approved-instance "+Quote(Instance),driver,false,false);}
    public void StartTransferHelper(string executable,SafeProcessHandle driver) {if(ProcessHandle!=null)throw new IOException("channel already started");Launch(executable,Quote(executable)+" --approved-instance "+Quote(Instance),driver,false,true);}
    public void StartSuspendedDriver(string powershell,string script,SafeProcessHandle parent) {if(ProcessHandle!=null)throw new IOException("driver already started");Launch(powershell,Quote(powershell)+" -NoLogo -NoProfile -NonInteractive -File "+Quote(script)+" -InternalDeathDriver",parent,true,false);}
    void Launch(string executable,string commandLine,SafeProcessHandle driver,bool suspended,bool deferProtocolRead) {
      var sa=new SA{Length=Marshal.SizeOf(typeof(SA)),Inherit=1};IntPtr ri=IntPtr.Zero,wi=IntPtr.Zero,ro=IntPtr.Zero,wo=IntPtr.Zero,re=IntPtr.Zero,we=IntPtr.Zero,list=IntPtr.Zero,handles=IntPtr.Zero;PI pi=new PI();bool initialized=false;
      try{Check(CreatePipe(out ri,out wi,ref sa,0));Check(CreatePipe(out ro,out wo,ref sa,0));Check(CreatePipe(out re,out we,ref sa,0));Check(SetHandleInformation(wi,1,0));Check(SetHandleInformation(ro,1,0));Check(SetHandleInformation(re,1,0));
        IntPtr size=IntPtr.Zero;InitializeProcThreadAttributeList(IntPtr.Zero,1,0,ref size);if(size==IntPtr.Zero)throw new Win32Exception();list=Marshal.AllocHGlobal(size);Check(InitializeProcThreadAttributeList(list,1,0,ref size));initialized=true;handles=Marshal.AllocHGlobal(IntPtr.Size*4);Marshal.WriteIntPtr(handles,0,ri);Marshal.WriteIntPtr(handles,IntPtr.Size,wo);Marshal.WriteIntPtr(handles,IntPtr.Size*2,we);Marshal.WriteIntPtr(handles,IntPtr.Size*3,driver.DangerousGetHandle());Check(UpdateProcThreadAttribute(list,0,new IntPtr(0x20002),handles,new IntPtr(IntPtr.Size*4),IntPtr.Zero,IntPtr.Zero));
        var si=new SIX{Startup=new SI{cb=Marshal.SizeOf(typeof(SIX)),Flags=0x100,In=ri,Out=wo,Error=we},Attributes=list};var command=new StringBuilder(commandLine);Check(CreateProcessW(executable,command,IntPtr.Zero,IntPtr.Zero,true,0x08080000u|(suspended?4u:0u),IntPtr.Zero,Path.GetDirectoryName(executable),ref si,out pi));ProcessHandle=new SafeProcessHandle(pi.Process,true);pi.Process=IntPtr.Zero;if(suspended){ThreadHandle=new SafeWaitHandle(pi.Thread,true);pi.Thread=IntPtr.Zero;}
        Input=new StreamWriter(new FileStream(new SafeFileHandle(wi,true),FileAccess.Write),new UTF8Encoding(false,true)){NewLine="\n",AutoFlush=true};wi=IntPtr.Zero;
        output=new StreamReader(new FileStream(new SafeFileHandle(ro,true),FileAccess.Read),new UTF8Encoding(false,true));ro=IntPtr.Zero;error=new FileStream(new SafeFileHandle(re,true),FileAccess.Read);re=IntPtr.Zero;errorDrain=DrainStderr();if(!deferProtocolRead)Pending=ReadBounded();
      }finally{if(initialized)DeleteProcThreadAttributeList(list);if(list!=IntPtr.Zero)Marshal.FreeHGlobal(list);if(handles!=IntPtr.Zero)Marshal.FreeHGlobal(handles);foreach(IntPtr h in new IntPtr[]{ri,wi,ro,wo,re,we,pi.Thread,pi.Process})if(h!=IntPtr.Zero)CloseHandle(h);}
    }
    [DllImport("kernel32.dll",SetLastError=true)] static extern uint ResumeThread(SafeWaitHandle thread);
    public void ResumeOriginal(){if(ThreadHandle==null||ThreadHandle.IsClosed||ResumeThread(ThreadHandle)!=1)throw new Win32Exception();ThreadHandle.Dispose();ThreadHandle=null;}
    public long DuplicateOriginalDriverIntoSelf(){IntPtr copy;Check(DuplicateHandle(GetCurrentProcess(),ProcessHandle.DangerousGetHandle(),ProcessHandle.DangerousGetHandle(),out copy,0x100000,true,0));return copy.ToInt64();}
    public long DuplicateOriginalJournalIntoSelf(Witness journal){Native.VerifyOwnHeldPinAt(journal,journal.CurrentKnownPath);IntPtr copy;Check(DuplicateHandle(GetCurrentProcess(),journal.Handle.DangerousGetHandle(),ProcessHandle.DangerousGetHandle(),out copy,0x100081,false,0));return copy.ToInt64();}
    public sealed class Transfer {public long Process,ReadOnlyOutput;}
    public Transfer TransferOriginalHelperTo(SafeProcessHandle parent){var t=new Transfer();IntPtr copy;Check(DuplicateHandle(GetCurrentProcess(),ProcessHandle.DangerousGetHandle(),parent.DangerousGetHandle(),out copy,0x101001,false,0));t.Process=copy.ToInt64();Check(DuplicateHandle(GetCurrentProcess(),((FileStream)output.BaseStream).SafeFileHandle.DangerousGetHandle(),parent.DangerousGetHandle(),out copy,0x80000000,false,0));t.ReadOnlyOutput=copy.ToInt64();return t;}
    void RequireReaderHealthy(){if(FatalReadFault==null&&Pending!=null&&(Pending.IsFaulted||Pending.IsCanceled))FatalReadFault=Pending.IsCanceled?"original reader canceled":Native.ErrorDetails(Pending.Exception);if(FatalReadFault!=null)throw new IOException("fatal original reader; no new read/command: "+FatalReadFault);}
    public void Bootstrap(string text){RequireReaderHealthy();if(text.Length>12000||text.IndexOf('\n')>=0)throw new IOException("private bootstrap bound");Input.WriteLine(text);}
    public void ReadbackOriginal(){RequireReaderHealthy();if(Pending==null||ClosedInput)throw new IOException("original pending channel required");Input.WriteLine("inspect");}
    public void ContinueRead(){RequireReaderHealthy();if(Pending!=null||output==null)throw new IOException("original reader already pending");Pending=ReadBounded();}
    async Task<string> ReadBounded(){var s=new StringBuilder();char[] c=new char[1];for(;;){int n=await output.ReadAsync(c,0,1).ConfigureAwait(false);if(n==0){if(s.Length==0)return null;throw new IOException("partial channel frame");}if(c[0]=='\n')return s.ToString();if(c[0]<32||c[0]>126||s.Length>=40000)throw new IOException("bounded channel frame refused char="+((int)c[0]).ToString()+" prefix="+s.ToString(0,Math.Min(s.Length,128)));s.Append(c[0]);}}
    async Task DrainStderr(){byte[] bytes=new byte[256];try{for(;;){int n=await error.ReadAsync(bytes,0,bytes.Length).ConfigureAwait(false);if(n==0)break;lock(errorGate){int keep=Math.Min(n,errorPrefix.Length-errorLength);Array.Copy(bytes,0,errorPrefix,errorLength,keep);errorLength+=keep;if(keep<n)errorTruncated=true;}}}catch(Exception e){lock(errorGate){errorFault=Native.ErrorDetails(e);}}finally{lock(errorGate){errorComplete=true;}}}
    public sealed class StderrEvidence {public int capturedBytes;public bool truncated,drainComplete;public string rawHexPrefix,utf8DiagnosticText,readerFailure;}
    public StderrEvidence ObserveStderr(){lock(errorGate){byte[] bytes=errorPrefix.Take(errorLength).ToArray();return new StderrEvidence{capturedBytes=errorLength,truncated=errorTruncated,drainComplete=errorComplete&&errorDrain!=null&&errorDrain.IsCompleted,rawHexPrefix=BitConverter.ToString(bytes).Replace("-","").ToLowerInvariant(),utf8DiagnosticText=Encoding.UTF8.GetString(bytes),readerFailure=errorFault};}}
    public void SendCommand(string command){RequireReaderHealthy();if(Pending!=null)throw new IOException("unknown pending result; no replay");if(command.Length>256||command.IndexOf('\n')>=0)throw new ArgumentException();Input.WriteLine(command);Pending=ReadBounded();}
    public void ReplyPort(string response){RequireReaderHealthy();if(Pending!=null)throw new IOException("port has pending read");Input.WriteLine(response);Pending=ReadBounded();}
    public string Receive(int ms){RequireReaderHealthy();if(Pending==null)throw new IOException("no pending read");try{if(!Pending.Wait(ms))return null;string value=Pending.GetAwaiter().GetResult();Pending=null;return value;}catch(Exception e){FatalReadFault=Native.ErrorDetails(e);throw new IOException("original reader fault; no retry: "+FatalReadFault,e);}}
    public bool ExactExited(int ms){return ProcessHandle!=null&&Native.WaitForSingleObject(ProcessHandle,(uint)ms)==0;}
    public uint ExactExit(){uint code;if(!ExactExited(0)||!Native.GetExitCodeProcess(ProcessHandle,out code))throw new Win32Exception();return code;}
    public void CloseInput(){if(!ClosedInput){ClosedInput=true;if(Input!=null){try{Input.Dispose();}catch(IOException){/* Exact original process wait still required. */}}}}
    public Raw TerminateExact(){bool ok=Native.TerminateProcess(ProcessHandle,91);return new Raw(ok,ok?0:Marshal.GetLastWin32Error());}
    public Native.OriginalProcessObservation ObserveOriginal(){return Native.ObserveOriginalProcess(ProcessHandle);}
    public void Dispose(){if(ProcessHandle==null||!ExactExited(0))return;if(Input!=null)Input.Dispose();if(output!=null)output.Dispose();if(error!=null)error.Dispose();if(ThreadHandle!=null)ThreadHandle.Dispose();ProcessHandle.Dispose();}
  }
  public sealed class OriginalHelperObserver : IDisposable {
    readonly SafeProcessHandle process;readonly StreamReader reader;Task<string> pending;public string FatalReadFault {get;private set;}
    public OriginalHelperObserver(long processLocator,long readLocator){if(processLocator<=0||readLocator<=0)throw new IOException("original transfer required");process=new SafeProcessHandle(new IntPtr(processLocator),true);var read=new SafeFileHandle(new IntPtr(readLocator),true);uint wait=Native.WaitForSingleObject(process,0);if(GetFileType(read)!=3||(wait!=258&&wait!=0)){read.Dispose();process.Dispose();throw new IOException("original transferred instances refused");}reader=new StreamReader(new FileStream(read,FileAccess.Read),new UTF8Encoding(false,true));}
    [DllImport("kernel32.dll",SetLastError=true)] static extern uint GetFileType(SafeFileHandle h);
    async Task<string> Read(){var b=new StringBuilder();char[] c=new char[1];for(;;){int n=await reader.ReadAsync(c,0,1).ConfigureAwait(false);if(n==0){if(b.Length==0)return null;throw new IOException("partial original observer frame");}if(c[0]=='\n')return b.ToString();if(b.Length>=40000||c[0]<32||c[0]>126)throw new IOException("observer frame bound");b.Append(c[0]);}}
    // P must call only after exact original D is signaled; P never owns H stdin.
    public string ReadAfterDriverExit(Channel originalDriver,int ms){if(FatalReadFault!=null)throw new IOException("fatal original observer reader; no retry: "+FatalReadFault);if(!originalDriver.ExactExited(0))throw new IOException("no concurrent driver/observer reader");if(pending==null)pending=Read();try{if(!pending.Wait(ms))return null;string line=pending.GetAwaiter().GetResult();pending=null;return line;}catch(Exception e){FatalReadFault=Native.ErrorDetails(e);throw new IOException("original observer reader fault; no retry: "+FatalReadFault,e);}}
    public bool ExactExited(int ms){return Native.WaitForSingleObject(process,(uint)ms)==0;}
    public uint ExactExit(){uint code;if(!ExactExited(0)||!Native.GetExitCodeProcess(process,out code))throw new IOException("original helper exit unknown");return code;}
    public Raw TerminateExact(){bool ok=Native.TerminateProcess(process,91);return new Raw(ok,ok?0:Marshal.GetLastWin32Error());}
    public Native.OriginalProcessObservation ObserveOriginal(){return Native.ObserveOriginalProcess(process);}
    public void Dispose(){if(!ExactExited(0))return;reader.Dispose();process.Dispose();}
  }
  public sealed class Frame {
    public ushort Type;public ulong Sequence,Epoch;public byte[] Scope,Lineage,Genesis,Owner,Previous,Key,Payload,Hash,Bytes;
    public static byte[] HashBytes(byte[] b){using(var h=SHA256.Create())return h.ComputeHash(b);}
    public static bool Same(byte[] a,byte[] b){return a!=null&&b!=null&&a.SequenceEqual(b);}
    public static string Hex(byte[] b){return BitConverter.ToString(b).Replace("-","").ToLowerInvariant();}
    public static byte[] Unhex(string s){if(s.Length%2!=0||s.Length>32768||s.Any(c=>!((c>='0'&&c<='9')||(c>='a'&&c<='f'))))throw new IOException("closed hex refused");byte[] b=new byte[s.Length/2];for(int i=0;i<b.Length;i++)b[i]=Convert.ToByte(s.Substring(i*2,2),16);return b;}
    static byte[] Get(BinaryReader r,int n){byte[] b=r.ReadBytes(n);if(b.Length!=n)throw new IOException("frame truncated");return b;}
    public static Frame Parse(byte[] b){if(b.Length<228||b.Length>16384)throw new IOException("frame size refused");using(var r=new BinaryReader(new MemoryStream(b,false))){if(Encoding.ASCII.GetString(Get(r,8))!="OWNJRN01"||r.ReadUInt16()!=1)throw new IOException("frame version refused");var f=new Frame{Type=r.ReadUInt16()};if(f.Type<1||f.Type>5||r.ReadUInt32()!=b.Length)throw new IOException("frame type/length refused");f.Scope=Get(r,32);f.Lineage=Get(r,16);f.Genesis=Get(r,32);f.Sequence=r.ReadUInt64();f.Epoch=r.ReadUInt64();f.Owner=Get(r,16);f.Previous=Get(r,32);f.Key=Get(r,32);uint n=r.ReadUInt32();if(n>4096||n+32!=r.BaseStream.Length-r.BaseStream.Position)throw new IOException("payload bounds refused");f.Payload=Get(r,(int)n);f.Hash=Get(r,32);f.Bytes=b;if(r.BaseStream.Position!=b.Length||!Same(HashBytes(b.Take(b.Length-32).ToArray()),f.Hash))throw new IOException("frame digest refused");return f;}}
    public static byte[] Join(params byte[][] arrays){using(var m=new MemoryStream()){foreach(var a in arrays)m.Write(a,0,a.Length);return m.ToArray();}}
    public static byte[] Pin(Snapshot pin){return Join(new Guid(pin.volumeGuid.Substring(10,38)).ToByteArray(),BitConverter.GetBytes(Convert.ToUInt64(pin.volumeSerialHex,16)),Unhex(pin.fileIdHex));}
  }
  // Independent live driver state. Not serializable authority or a production issuer.
  public sealed class Floor {
    public readonly Witness Journal;
    public readonly byte[] ScopeBytes,Scope,Lineage,Selectors;
    public readonly List<Frame> Known=new List<Frame>();
    public readonly List<string> SlotIds=new List<string>();
    public Frame Pending;
    public string PendingCreatedId;
    public Channel Active;
    readonly HashSet<string> revoked=new HashSet<string>(StringComparer.Ordinal);
    public bool SuppressNextWitness,DropPendingAck,RefusePort;
    public string InjectAtStage;
    public Action<string> StageHook;
    public Floor(Witness journal,byte[] scopeBytes,byte[] lineage,byte[] selectors){Journal=journal;ScopeBytes=scopeBytes;Scope=Frame.HashBytes(scopeBytes);Lineage=lineage;Selectors=selectors;}
    byte[] Head {get{return Known.Count==0?new byte[32]:Known[Known.Count-1].Hash;}}
    ulong Epoch {get{return Known.Count==0?0:Known[Known.Count-1].Epoch;}}
    byte[] Genesis {get{return Known.Count==0?new byte[32]:Known[0].Hash;}}
    public string Snapshot(Channel child){using(var m=new MemoryStream())using(var w=new BinaryWriter(m)){w.Write(Scope);w.Write(Genesis);w.Write((ulong)Known.Count);w.Write(Epoch);w.Write(Head);w.Write((ushort)SlotIds.Count);foreach(string id in SlotIds)w.Write(Frame.Unhex(id));w.Write(child.Owner??new byte[16]);w.Write((byte)(Pending==null?0:1));if(Pending!=null){w.Write((ulong)Known.Count);w.Write(Epoch);w.Write(Head);w.Write(Pending.Sequence);w.Write(Pending.Type);w.Write(Pending.Key);w.Write(Pending.Hash);w.Write(Pending.Owner);w.Write((byte)(PendingCreatedId==null?0:1));if(PendingCreatedId!=null)w.Write(Frame.Unhex(PendingCreatedId));}return Frame.Hex(m.ToArray());}}
    void CheckFrame(Frame f,Channel child,bool registering){
      if(!Frame.Same(f.Scope,Scope)||!Frame.Same(f.Lineage,Lineage)||f.Sequence!=(ulong)Known.Count+1||!Frame.Same(f.Previous,Head))throw new IOException("driver chain scope/CAS refused");
      byte[] stable;
      if(f.Type==1){if(Known.Count!=0||f.Epoch!=0||f.Genesis.Any(x=>x!=0)||f.Owner.Any(x=>x!=0)||!Frame.Same(f.Payload,Frame.Join(ScopeBytes,Selectors)))throw new IOException("driver genesis refused");stable=Frame.Join(BitConverter.GetBytes(f.Type),Scope);}
      else {if(Known.Count==0||!Frame.Same(f.Genesis,Genesis))throw new IOException("driver genesis reference refused");
        if(f.Type==2){if(Epoch==ulong.MaxValue||f.Epoch!=Epoch+1||f.Owner.All(x=>x==0)||!Frame.Same(f.Payload,f.Owner)||Known.Any(x=>x.Type==2&&Frame.Same(x.Owner,f.Owner)))throw new IOException("driver owner refused");stable=Frame.Join(BitConverter.GetBytes(f.Type),Scope,Lineage,BitConverter.GetBytes(Epoch),f.Payload);}
        else{if(Epoch==0||f.Epoch!=Epoch||!Frame.Same(f.Owner,Known[Known.Count-1].Owner))throw new IOException("driver stale owner refused");
          if(f.Type==3){if(f.Payload.Length!=18)throw new IOException("driver consume payload refused");ushort cl=BitConverter.ToUInt16(f.Payload,0);bool allowed=cl==1&&f.Payload.Skip(2).SequenceEqual(Selectors.Take(16));for(int i=18;i<Selectors.Length;i+=18)allowed|=f.Payload.SequenceEqual(Selectors.Skip(i).Take(18));if(cl<1||cl>3||!allowed)throw new IOException("driver selector refused");stable=Frame.Join(Scope,Lineage,f.Payload);}
          else if(f.Type==4){if(f.Payload.Length!=34||BitConverter.ToUInt16(f.Payload,32)<1||BitConverter.ToUInt16(f.Payload,32)>3||!Known.Any(x=>x.Type==3&&x.Hash.SequenceEqual(f.Payload.Take(32))))throw new IOException("driver observation refused");stable=Frame.Join(BitConverter.GetBytes(f.Type),Scope,Lineage,f.Payload);}
          else{if(f.Type!=5||f.Payload.Length!=64)throw new IOException("driver NOTE refused");stable=Frame.Join(BitConverter.GetBytes(f.Type),Scope,Lineage,f.Payload);}}
      }
      if(!Frame.Same(Frame.HashBytes(stable),f.Key)||Known.Any(x=>Frame.Same(x.Key,f.Key)))throw new IOException("driver key refused");if(registering&&f.Type!=1&&!Frame.Same(f.Owner,child.Owner))throw new IOException("driver crosschild owner refused");
    }
    void VerifyKnown(){if(!Native.Same(Journal.Original,Journal.Fresh()))throw new IOException("driver original journal changed");for(int i=0;i<Known.Count;i++){var r=Native.ReadSlot(Journal,(ulong)i+1);if(r.Pin.fileIdHex!=SlotIds[i]||!Frame.Same(r.Bytes,Known[i].Bytes))throw new IOException("driver known prefix rollback/replacement");}}
    void Witness(Channel child,string hash,string id,bool recovery){if(Pending==null||PendingCreatedId==null)throw new IOException("driver no independently bound original created slot");VerifyKnown();var r=Native.ReadSlot(Journal,Pending.Sequence);var f=Frame.Parse(r.Bytes);CheckFrame(f,child,false);if(r.Pin.fileIdHex!=PendingCreatedId||!Frame.Same(f.Bytes,Pending.Bytes)||Frame.Hex(f.Hash)!=hash||(id!=null&&r.Pin.fileIdHex!=id))throw new IOException("driver pending independent readback refused");
      // No callback/intervening command in this serial critical section.
      Known.Add(f);SlotIds.Add(r.Pin.fileIdHex);Pending=null;PendingCreatedId=null;
    }
    public string Handle(Channel child,string line){if(child.ExactExited(0)||RefusePort)throw new IOException("original child/continuity unavailable");string[] p=line.Split(' ');ulong nonce;if(p.Length<3||p[0]!="P"||!ulong.TryParse(p[1],out nonce)||nonce!=child.LastPortCounter+1)throw new IOException("private port counter refused");child.LastPortCounter=nonce;
      if(p[2]=="guard"){if(p.Length!=9||p[5]!=Frame.Hex(Scope)||!p[4].StartsWith(child.Instance+":",StringComparison.Ordinal)||!ulong.TryParse(p[6],out child.CreateCount)||!ulong.TryParse(p[7],out child.WriteCount)||!ulong.TryParse(p[8],out child.FlushCount))throw new IOException("scope/session binding refused");string binding=child.Instance+"/"+p[4];if(revoked.Contains(binding))throw new IOException("revoked acquisition");if(child.Session!=p[4]||!Object.ReferenceEquals(Active,child)){if(Active!=null&&Active.Session!=null)revoked.Add(Active.Instance+"/"+Active.Session);child.Session=p[4];child.Owner=Guid.NewGuid().ToByteArray();Active=child;}child.LastStage=p[3];if(StageHook!=null)StageHook(p[3]);if(InjectAtStage==p[3])throw new IOException("test synthetic continuity refusal");}
      else if(p[2]=="pending"){if(p.Length!=4||!Object.ReferenceEquals(Active,child)||Pending!=null||child.LastStage!="before_pending")throw new IOException("pending binding refused");VerifyKnown();var frame=Frame.Parse(Frame.Unhex(p[3]));CheckFrame(frame,child,true);if(Native.Inventory(Journal).Length!=Known.Count)throw new IOException("pending requires exact empty next slot");Pending=frame;PendingCreatedId=null;if(DropPendingAck){DropPendingAck=false;throw new IOException("test pending registered; ACK lost before CREATE");}}
      else if(p[2]=="created"){if(p.Length!=5||!Object.ReferenceEquals(Active,child)||Pending==null||PendingCreatedId!=null||child.LastStage!="before_created_witness"||p[3]!=Frame.Hex(Pending.Hash))throw new IOException("created-slot binding refused");VerifyKnown();var r=Native.ReadSlotRaw(Journal,Pending.Sequence);if(r.Bytes.Length!=0||r.Pin.fileIdHex!=p[4]||Native.Inventory(Journal).Length!=Known.Count+1)throw new IOException("independent original empty created slot refused");PendingCreatedId=r.Pin.fileIdHex;}
      else if(p[2]=="witness"){if(p.Length!=5||!Object.ReferenceEquals(Active,child)||child.LastStage!="before_witness")throw new IOException("witness binding refused");if(SuppressNextWitness){SuppressNextWitness=false;throw new IOException("test lost ACK before independent witness");}Witness(child,p[3],p[4],false);}
      else if(p[2]=="reconcile"){if(p.Length!=4||child.LastStage!="before_reconcile")throw new IOException("reconcile binding refused");Witness(child,p[3],null,true);}
      else throw new IOException("closed driver verb refused");
      return "Q "+p[1]+" OK "+Snapshot(child);
    }
  }
}
'@
# Add-Type is a parent-only explicit proof action, never a source validation step.
Add-Type -TypeDefinition $nativeSource -Language CSharp
if($InternalDeathDriver){
    # The closed private stdout protocol is LF-only, including READY/STAGE.
    # Console.Out defaults to CRLF on Windows; Channel deliberately rejects CR.
    [Console]::Out.NewLine="`n"
    # Only an original parent-created suspended driver is resumed into this
    # closed bootstrap. Numeric fields locate handles already duplicated here;
    # there is no PID open, path authority, floor import or production fallback.
    $bootstrapRead=[Console]::In.ReadLineAsync();if(-not $bootstrapRead.Wait(60000)){exit 82};$bootstrapText=$bootstrapRead.GetAwaiter().GetResult()
    if($null -eq $bootstrapText -or $bootstrapText.Length -gt 12000){exit 82}
    $packet=$bootstrapText|ConvertFrom-Json
    $expectedNames=@('schema','nonce','parentHandle','driverHandle','journalHandle','journalDrivePath','journalPin','scopeBytes','lineage','selectors','approvedInstance','executable','killStage','partial')
    if(@(Compare-Object @($packet.PSObject.Properties.Name|Sort-Object) @($expectedNames|Sort-Object)).Count -ne 0 -or $packet.schema -cne 'ae-agent.private-death-fixture.v1'){exit 82}
    $privateParent=New-Object Microsoft.Win32.SafeHandles.SafeProcessHandle([IntPtr]([long]$packet.parentHandle),$true)
    $privateDriver=New-Object Microsoft.Win32.SafeHandles.SafeProcessHandle([IntPtr]([long]$packet.driverHandle),$true)
    if([InitialDurabilityProof.Native]::WaitForSingleObject($privateParent,0)-ne 258 -or [InitialDurabilityProof.Native]::WaitForSingleObject($privateDriver,0)-ne 258){exit 82}
    $pin=New-Object InitialDurabilityProof.Snapshot;$pin.volumeGuid=$packet.journalPin.volumeGuid;$pin.canonicalPath=$packet.journalPin.canonicalPath;$pin.volumeSerialHex=$packet.journalPin.volumeSerialHex;$pin.fileIdHex=$packet.journalPin.fileIdHex
    $privateJournal=[InitialDurabilityProof.Native]::TakeOriginalJournal([long]$packet.journalHandle,$packet.journalDrivePath,$pin)
    $privateFloor=New-Object InitialDurabilityProof.Floor($privateJournal,[InitialDurabilityProof.Frame]::Unhex($packet.scopeBytes),[InitialDurabilityProof.Frame]::Unhex($packet.lineage),[InitialDurabilityProof.Frame]::Unhex($packet.selectors))
    $helper=$null;$currentCommand='';$ready=$false
    function Private-Line([int]$milliseconds){
        $taskLine=[Console]::In.ReadLineAsync();if(-not $taskLine.Wait($milliseconds)){throw 'private parent bootstrap/ACK timeout'}
        if([InitialDurabilityProof.Native]::WaitForSingleObject($privateParent,0)-ne 258){throw 'original parent is not live'}
        $line=$taskLine.GetAwaiter().GetResult();if($null -eq $line -or $line.Length -gt 12000){throw 'private parent EOF/bound'};return $line
    }
    function Private-Pump {
        $clock=[Diagnostics.Stopwatch]::StartNew()
        for(;;){$left=10000-[int]$clock.ElapsedMilliseconds;if($left -le 0){throw 'private helper outcome UNKNOWN'};$line=$helper.Receive($left);if($null -eq $line){throw 'private helper EOF/timeout'}
            if($line.StartsWith('P ',[StringComparison]::Ordinal)){$response=$privateFloor.Handle($helper,$line);$helper.ReplyPort($response);continue}
            if(-not $line.StartsWith('R ',[StringComparison]::Ordinal)){throw 'private helper frame refused'};return $line.Substring(2)|ConvertFrom-Json
        }
    }
    try {
        $helper=New-Object InitialDurabilityProof.Channel($packet.approvedInstance)
        $helper.StartTransferHelper($packet.executable,$privateDriver)
        $transfer=$helper.TransferOriginalHelperTo($privateParent)
        [Console]::Out.WriteLine('READY '+$packet.nonce+' '+$transfer.Process.ToString()+' '+$transfer.ReadOnlyOutput.ToString());[Console]::Out.Flush()
        if((Private-Line 10000)-cne ('READY_ACK '+$packet.nonce)){throw 'private exact READY ACK refused'};$ready=$true;$helper.ContinueRead()
        $startup=Private-Pump;if(-not $startup.ok){throw 'private helper startup refused'}
        if($packet.killStage -ceq 'replacement_refusal'){
            $helper.SendCommand('acquire');$r=Private-Pump;if(-not $r.ok){throw 'replacement private fence refused'}
            foreach($command in @('inspect','epoch','consume-launch')){$helper.SendCommand($command);$r=Private-Pump;if($r.ok -or $r.createAttempts -cne '0'){throw 'replacement driver attempted positive recovery'};[Console]::Out.WriteLine('REFUSED '+$packet.nonce+' '+$command+' '+$r.createAttempts+' '+$r.code);[Console]::Out.Flush()}
            $helper.CloseInput();if(-not $helper.ExactExited(6000)-or $helper.ExactExit()-ne 0){throw 'replacement helper exact exit unavailable'}
            [Console]::Out.WriteLine('CLOSED '+$packet.nonce+' 0');[Console]::Out.Flush();if((Private-Line 10000)-cne ('CLOSE_ACK '+$packet.nonce)){throw 'replacement observer ACK refused'}
            [Environment]::Exit(84)
        }
        foreach($command in @('acquire','genesis','epoch')){$currentCommand=$command;$helper.SendCommand($command);$r=Private-Pump;if(-not $r.ok){throw "private $command refused"}}
        $privateFloor.StageHook=[Action[string]]{
            param($stage)
            if($currentCommand -ceq 'consume-launch' -and $stage -ceq $packet.killStage){
                $pendingHash=if($null -ne $privateFloor.Pending){[InitialDurabilityProof.Frame]::Hex($privateFloor.Pending.Hash)}else{'none'}
                $slotId=if($null -ne $privateFloor.PendingCreatedId){$privateFloor.PendingCreatedId}elseif($privateFloor.SlotIds.Count){$privateFloor.SlotIds[$privateFloor.SlotIds.Count-1]}else{'none'}
                [Console]::Out.WriteLine('STAGE '+$packet.nonce+' '+$stage+' '+$helper.CreateCount.ToString()+' '+$helper.WriteCount.ToString()+' '+$helper.FlushCount.ToString()+' '+$pendingHash+' '+$privateFloor.Known.Count.ToString()+' '+$slotId);[Console]::Out.Flush()
                if((Private-Line 10000)-cne ('DIE_ACK '+$packet.nonce)){throw 'original observer stage ACK refused'}
                # No Q is sent to H. The independent floor dies here. P owns
                # original creation process and read-only stdout copies only.
                [Environment]::Exit(83)
            }
        }
        $currentCommand='consume-launch';$helper.SendCommand($currentCommand);$null=Private-Pump;throw 'planned driver death stage was not reached'
    }catch{
        [Console]::Error.WriteLine('PRIVATE_DRIVER_FAILURE stage='+$packet.killStage+' readyAccepted='+$ready.ToString()+' '+[InitialDurabilityProof.Native]::ErrorDetails($_.Exception));[Console]::Error.Flush()
        if($null -ne $helper -and $null -ne $helper.ProcessHandle){$helper.CloseInput();if(-not $helper.ExactExited(6000)){[Console]::Error.WriteLine('PRIVATE_DRIVER_FORCED_HELPER_CLOSE');[Console]::Error.Flush();$forced=$helper.TerminateExact();if(-not $forced.ok -or -not $helper.ExactExited(5000)){[Console]::Out.WriteLine('DRIVER_HELPER_EXIT_UNKNOWN '+$packet.nonce);[Console]::Out.Flush();exit 82}};[Console]::Error.WriteLine(($helper.ObserveOriginal()|ConvertTo-Json -Compress));[Console]::Error.WriteLine(($helper.ObserveStderr()|ConvertTo-Json -Compress));[Console]::Error.Flush()}
        [Console]::Out.WriteLine('DRIVER_REFUSED '+$packet.nonce);[Console]::Out.Flush();exit 82
    }finally{if($null -ne $helper){$helper.Dispose()};$privateJournal.Dispose();$privateDriver.Dispose();$privateParent.Dispose()}
    exit 82
}
$projectRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$sourceFiles=@('native/owned-runtime-initial-durability/store_win32.h','native/owned-runtime-initial-durability/store_win32.cpp','native/owned-runtime-initial-durability/durability_proof_main.cpp','native/owned-runtime-initial-durability/DurabilityPrerequisiteProof.vcxproj','native/owned-runtime-initial-fence/fence_win32.h','native/owned-runtime-initial-fence/fence_win32.cpp','scripts/owned-runtime-initial-durability-proof.ps1')
$sourceHashes=@($sourceFiles|ForEach-Object{[ordered]@{path=$_;sha256=(Get-FileHash -LiteralPath (Join-Path $projectRoot $_) -Algorithm SHA256).Hash.ToLowerInvariant()}})
$msbuild='C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\MSBuild\Current\Bin\MSBuild.exe'
$compiler='C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC\14.44.35207\bin\Hostx64\x64\cl.exe'
$sdkHeader='C:\Program Files (x86)\Windows Kits\10\Include\10.0.26100.0\um\windows.h'
if(-not [IO.File]::Exists($msbuild)-or -not [IO.File]::Exists($compiler)-or -not [IO.File]::Exists($sdkHeader)){throw 'Pinned v143 14.44.35207 / SDK 10.0.26100.0 unavailable; no fallback/install.'}
$runId='durability-'+[Guid]::NewGuid().ToString('N')
$held=New-Object 'System.Collections.Generic.List[System.IDisposable]'
$children=New-Object 'System.Collections.Generic.List[object]'
$fixtures=New-Object 'System.Collections.Generic.List[object]'
$slots=New-Object 'System.Collections.Generic.List[object]'
$cases=[ordered]@{}
$control=@{stopped=$false;reason=$null;childStarts=0;namespaceEffects=0;forcedChildren=0;exactClosed=0;deathDriversClosed=0;buildExited=$false;buildStarted=$false;buildForced=$false;receiptReady=$false}
$driverHandle=$null;$container=$null;$evidence=$null;$build=$null;$roots=$null;$fault=$null;$buildProcess=$null;$buildHandle=$null
$deathDrivers=New-Object 'System.Collections.Generic.List[object]'
$failureErrors=New-Object 'System.Collections.Generic.List[object]';$activeCase=$null;$receiptWritten=$false
function Capture-Failure([string]$context,[System.Management.Automation.ErrorRecord]$record){
    if($failureErrors.Count -ge 128){return};$trace=[string]$record.ScriptStackTrace;$line=0;if($null -ne $record.InvocationInfo){$line=$record.InvocationInfo.ScriptLineNumber}
    $failureErrors.Add([ordered]@{context=$context;details=[InitialDurabilityProof.Native]::ErrorDetails($record.Exception);scriptStack=$trace.Substring(0,[Math]::Min($trace.Length,4096));scriptLine=$line})
}
function Own($item){$held.Add($item);return $item}
function Assert([bool]$ok,[string]$why){if(-not $ok){throw "ASSERT: $why"}}
function Guard-Effects {
    if($control.stopped){throw "UNKNOWN: no next effects: $($control.reason)"}
    if($null -ne $container){[InitialDurabilityProof.Native]::VerifyOwnHeldPinAt($container,$container.CurrentKnownPath)|Out-Null}
}
function New-Dir($parent,[string]$name){Guard-Effects;$control.namespaceEffects++;return Own ([InitialDurabilityProof.Native]::NewDirectory($parent,$name))}
function New-File($parent,[string]$name,[byte[]]$bytes){Guard-Effects;$control.namespaceEffects++;return Own ([InitialDurabilityProof.Native]::NewFile($parent,$name,$bytes))}
function Ensure-Parent($parent,[string]$name){try{return Own ([InitialDurabilityProof.Native]::OpenChildDirectory($parent,$name))}catch{$errorValue=$_.Exception;while($null -ne $errorValue.InnerException){$errorValue=$errorValue.InnerException};if($errorValue -isnot [ComponentModel.Win32Exception]-or $errorValue.NativeErrorCode -notin @(2,3)){throw};return New-Dir $parent $name}}
function Wide([string]$text){return 'L"'+$text.Replace('\','\\').Replace('"','\"')+'"'}
function Ascii([string]$text){return '"'+$text.Replace('\','\\').Replace('"','\"')+'"'}
function Pin($w){return '{'+(Wide $w.DrivePath)+','+(Wide $w.Original.canonicalPath)+','+(Ascii $w.Original.volumeSerialHex)+','+(Ascii $w.Original.fileIdHex)+'}'}
function Add-Case([string]$id,[string]$kind='native'){$cases[$id]=[ordered]@{id=$id;mandatory=$true;kind=$kind;status='UNVERIFIED';reason='not executed';evidence=@()}}
function New-Fixture([string]$name){
    $root=New-Dir $roots $name;$journal=New-Dir $root 'journal';$preserved=New-Dir $root 'preserved';$lock=New-File $root '.initial-owned-fence.lock' ([byte[]]@())
    $installation=[Guid]::NewGuid().ToByteArray();$lineage=[Guid]::NewGuid().ToByteArray();$launch=[Guid]::NewGuid().ToByteArray();$dispatch=[Guid]::NewGuid().ToByteArray();$stop=[Guid]::NewGuid().ToByteArray()
    $selector=[InitialDurabilityProof.Frame]::Join($launch,[BitConverter]::GetBytes([uint16]2),[BitConverter]::GetBytes([uint16]2),$dispatch,[BitConverter]::GetBytes([uint16]3),$stop)
    $scope=[InitialDurabilityProof.Frame]::Join($installation,[InitialDurabilityProof.Frame]::Pin($container.Original),[InitialDurabilityProof.Frame]::Pin($root.Original),[InitialDurabilityProof.Frame]::Pin($journal.Original),[InitialDurabilityProof.Frame]::Pin($lock.Original))
    $f=[pscustomobject]@{index=$fixtures.Count;name=$name;root=$root;journal=$journal;preserved=$preserved;lock=$lock;installation=$installation;lineage=$lineage;launch=$launch;dispatch=$dispatch;stop=$stop;selector=$selector;floor=(New-Object InitialDurabilityProof.Floor($journal,$scope,$lineage,$selector));normal=$null;alternate=$null;fault=$null}
    $fixtures.Add($f);return $f
}
function New-Slot($f,[string]$crash='',[string]$ioFault='',[bool]$lostAck=$false,[bool]$withoutPort=$false){$s=[pscustomobject]@{instance="$runId-$($slots.Count+1)";fixture=$f;crash=$crash;ioFault=$ioFault;lostAck=$lostAck;withoutPort=$withoutPort;driverHandle=$driverHandle.DangerousGetHandle().ToInt64();deathDriver=$null};$slots.Add($s);return $s}
function New-DeathDriver($f,[string]$stage,[bool]$partial=$false){
    Guard-Effects
    $powershell=Join-Path $env:WINDIR 'System32/WindowsPowerShell/v1.0/powershell.exe'
    $d=New-Object InitialDurabilityProof.Channel('isolated-death-driver')
    $record=[pscustomobject]@{fixture=$f;channel=$d;driverHandle=0L;journalHandle=0L;stage=$stage;partial=$partial;observer=$null;helperExit=$null;driverExit=$null;nonce=[Guid]::NewGuid().ToString('N');slot=$null;stageEvidence=$null;results=@();resumed=$false;abortedBeforeResume=$false;forced=$false;readyAccepted=$false;closed=$false}
    $deathDrivers.Add($record)
    $d.StartSuspendedDriver($powershell,$PSCommandPath,$driverHandle)
    $record.driverHandle=$d.DuplicateOriginalDriverIntoSelf();$record.journalHandle=$d.DuplicateOriginalJournalIntoSelf($f.journal)
    $s=New-Slot $f $(if($partial){'partial'}else{''});$s.driverHandle=$record.driverHandle;$s.deathDriver=$record;$record.slot=$s;return $record
}
function Envelope($r){Assert ($r.schema -ceq 'ae-agent.initial-durability-prerequisite.v1' -and $r.scope -ceq 'windows_initial_durability_prerequisite' -and -not $r.productionAuthority -and -not $r.admission -and -not $r.mayDispatch -and -not $r.replayAllowed -and $r.issuerStatus -ceq 'unavailable') 'closed fixture envelope';foreach($n in @('sequence','epoch','createAttempts','writeAttempts','flushAttempts')){Assert ($r.$n -is [string] -and $r.$n -cmatch '^(0|[1-9][0-9]*)$') "decimal uint64 $n"}}
function Pump($child,[int]$timeoutMs=6000,[switch]$ExpectedCrash,[switch]$KnownLostAck){
    $clock=[Diagnostics.Stopwatch]::StartNew()
    for(;;){$remaining=$timeoutMs-[int]$clock.ElapsedMilliseconds;if($remaining -le 0){$control.stopped=$true;$control.reason='bounded channel timeout';throw 'UNKNOWN: original child/channel pending; no replay'}
        $line=$child.channel.Receive($remaining)
        if($null -eq $line){if($ExpectedCrash -and $null -eq $child.channel.Pending -and $child.channel.ExactExited(1000)){return $null}
            if($KnownLostAck -and $null -ne $child.channel.Pending -and -not $child.channel.ExactExited(0) -and $child.slot.lostAck -and $child.slot.fixture.floor.Known.Count -eq 3 -and $null -eq $child.slot.fixture.floor.Pending -and $child.channel.LastStage -ceq 'before_ack'){$child.externalUnknown=$true;return $null}
            $control.stopped=$true;$control.reason='EOF/timeout before ACK';throw 'UNKNOWN: EOF/timeout before exact result'}
        if($line.StartsWith('P ',[StringComparison]::Ordinal)){
            if($child.portTrace.Count -ge 256){throw 'bounded stage trace overflow'};$parts=$line.Split(' ');$child.portTrace.Add($parts[2..([Math]::Min(4,$parts.Length-1))] -join ' ')
            try{$response=$child.slot.fixture.floor.Handle($child.channel,$line)}catch{$response='Q '+$parts[1]+' NO closed';$child.portFailures.Add($_.Exception.Message)}
            $child.channel.ReplyPort($response);continue
        }
        Assert ($line.StartsWith('R ',[StringComparison]::Ordinal)) 'closed native result prefix';$r=$line.Substring(2)|ConvertFrom-Json;Envelope $r;$child.results.Add($r);return $r
    }
}
function Start-Child($slot){
    Guard-Effects;$control.childStarts++
    $inventoryBefore=try{[InitialDurabilityProof.Native]::Inventory($slot.fixture.journal)}catch{@('original held journal refused: '+$_.Exception.Message)}
    $channel=New-Object InitialDurabilityProof.Channel($slot.instance)
    $child=[pscustomobject]@{slot=$slot;channel=$channel;results=(New-Object 'System.Collections.Generic.List[object]');portTrace=(New-Object 'System.Collections.Generic.List[string]');portFailures=(New-Object 'System.Collections.Generic.List[string]');exit=$null;before=$inventoryBefore;externalUnknown=$false;notCreated=$false}
    $children.Add($child);$channel.StartNormal($executable,$driverHandle);$child|Add-Member -NotePropertyName startup -NotePropertyValue (Pump $child);return $child
}
function Command($child,[string]$command,[switch]$ExpectedCrash){if($control.stopped){throw 'UNKNOWN: ordinary command after barrier'};$child.channel.SendCommand($command);return Pump $child -ExpectedCrash:$ExpectedCrash}
function Close-Child($child,[uint32]$expected=0){
    $child.channel.CloseInput();Assert ($child.channel.ExactExited(6000)) 'original held child exact exit';$child.exit=$child.channel.ExactExit();Assert ($child.exit -eq $expected) "original exit code $expected";$control.exactClosed++
}
function Prepare($slot){$child=Start-Child $slot;Assert $child.startup.ok 'fixture startup';Assert (Command $child 'acquire').ok 'held kernel fence';Assert (Command $child 'genesis').ok 'GENESIS';Assert (Command $child 'epoch').ok 'epoch1';return $child}
function Expect-Refusal($r,[string]$reason=''){Assert (-not $r.ok) 'refusal';Assert ($r.createAttempts -ceq '0') 'zero new creates';if($reason){Assert ($r.code -ceq $reason) "exact refusal $reason"}}
function Run-Case([string]$id,[scriptblock]$body){Guard-Effects;$script:activeCase=$id;try{&$body;$cases[$id].status='PASS';$cases[$id].reason='exact assertions passed';$script:activeCase=$null}catch{$cases[$id].status=if($_.Exception.Message.StartsWith('ASSERT:')){'FAIL'}else{'UNVERIFIED'};$cases[$id].reason=$_.Exception.Message;throw}}
function Rename-FixtureDirectory([string]$id,$f,$own,$parent,[string]$name){
    Guard-Effects
    Assert ($id -in @('root_replacement','journal_replacement','journal_reparse') -and $f.floor.Known.Count -eq 0 -and $null -eq $f.floor.Pending) 'closed empty directory fault fixture only'
    foreach($child in $children){Assert ($child.channel.ExactExited(0) -and $null -eq $child.channel.Pending) 'all original helpers exact closed before directory handle parking'}
    Assert (@($deathDrivers|Where-Object {[object]::ReferenceEquals($_.fixture,$f)}).Count -eq 0) 'no private driver owns this directory fixture'
    $old=$own.CurrentKnownPath;$preservationName='preserved-'+$name;$next=Join-Path $parent.CurrentKnownPath $preservationName
    $refs=@();if($id -eq 'root_replacement'){$refs=@($f.journal,$f.preserved,$f.lock)}
    $data=[ordered]@{state='VALIDATED';originalPin=$own.Original;parentOriginalPin=$parent.Original;beforeKnownPath=$old;preservationKnownPath=$next;targetContinuouslyHeld=$true;originalChildrenExactClosed=$true;immutablePinsReissued=$false;sameHeldOriginalReadback=$null;descendants=@()}
    $null=[InitialDurabilityProof.Native]::VerifyOwnHeldPinAt($own,$old);$null=[InitialDurabilityProof.Native]::VerifyOwnHeldPinAt($parent,$parent.CurrentKnownPath)
    foreach($w in $refs){$actual=[InitialDurabilityProof.Native]::VerifyOwnHeldPinAt($w,$w.CurrentKnownPath);$data.descendants+=@{originalPin=$w.Original;beforeKnownPath=$w.CurrentKnownPath;heldReadback=$actual;parked=$false;reheldSameOriginal=$false;reholdReadback=$null}}
    $cases[$id].evidence+=@{directoryRename=$data}
    $delete=[InitialDurabilityProof.Native]::OpenOwnDeleteHandle($own,$parent,$name)
    try{
        for($i=0;$i -lt $refs.Count;$i++){[InitialDurabilityProof.Native]::ParkOwnWitness($refs[$i]);$data.descendants[$i].parked=$true};$data.state='DESCENDANTS_PARKED'
        [InitialDurabilityProof.Native]::RenameHeld($delete,$parent,$preservationName)
        $data.sameHeldOriginalReadback=[InitialDurabilityProof.Native]::VerifyOwnHeldPinAt($own,$next);$data.state='SAME_ORIGINAL_RENAMED'
        foreach($w in @($own)+@($refs)){[InitialDurabilityProof.Native]::RecordVerifiedOwnMove($w,$old,$next)}
        for($i=0;$i -lt $refs.Count;$i++){$data.descendants[$i].reholdReadback=[InitialDurabilityProof.Native]::ReholdOriginalFromHeldParent($refs[$i],$own);$data.descendants[$i].reheldSameOriginal=$true}
        $null=[InitialDurabilityProof.Native]::VerifyOwnHeldPinAt($own,$next);$null=[InitialDurabilityProof.Native]::VerifyOwnHeldPinAt($parent,$parent.CurrentKnownPath);$data.state='READBACK_COMPLETE'
    }finally{$delete.Dispose()}
}
function Run-Death($d,[switch]$Replacement){
    Guard-Effects
    $packet=[ordered]@{schema='ae-agent.private-death-fixture.v1';nonce=$d.nonce;parentHandle=$driverHandle.DangerousGetHandle().ToInt64().ToString();driverHandle=$d.driverHandle.ToString();journalHandle=$d.journalHandle.ToString();journalDrivePath=$d.fixture.journal.DrivePath;journalPin=$d.fixture.journal.Original;scopeBytes=[InitialDurabilityProof.Frame]::Hex($d.fixture.floor.ScopeBytes);lineage=[InitialDurabilityProof.Frame]::Hex($d.fixture.lineage);selectors=[InitialDurabilityProof.Frame]::Hex($d.fixture.selector);approvedInstance=$d.slot.instance;executable=$executable;killStage=$d.stage;partial=$d.partial}
    $d.channel.Bootstrap(($packet|ConvertTo-Json -Compress -Depth 6));$d.resumed=$true;$d.channel.ResumeOriginal()
    $ready=$d.channel.Receive(60000);Assert ($null -ne $ready) 'bounded original D READY';$p=$ready.Split(' ');Assert ($p.Count -eq 4 -and $p[0] -ceq 'READY' -and $p[1] -ceq $d.nonce) 'one original private READY'
    $d.observer=New-Object InitialDurabilityProof.OriginalHelperObserver([long]$p[2],[long]$p[3]);$d.readyAccepted=$true;$d.channel.SendCommand('READY_ACK '+$d.nonce)
    if($Replacement){
        $refusals=@();foreach($command in @('inspect','epoch','consume-launch')){$line=$d.channel.Receive(10000);Assert ($null -ne $line) 'bounded D2 original refusal';$p=$line.Split(' ');Assert ($p.Count -eq 5 -and $p[0] -ceq 'REFUSED' -and $p[1] -ceq $d.nonce -and $p[2] -ceq $command -and $p[3] -ceq '0') 'replacement D2/H2 zero creates';$refusals+=@{operation=$command;code=$p[4];createAttempts='0'};$d.channel.ContinueRead()}
        $closed=$d.channel.Receive(10000);Assert ($closed -ceq ('CLOSED '+$d.nonce+' 0')) 'D2 original H2 exact exit report';$d.channel.SendCommand('CLOSE_ACK '+$d.nonce)
        Assert ($d.channel.ExactExited(10000)) 'original D2 exact exit';$d.driverExit=$d.channel.ExactExit();Assert ($d.driverExit -eq 84) 'D2 planned exit84';Assert ($d.observer.ExactExited(6000)) 'original H2 exact exit';$d.helperExit=$d.observer.ExactExit();Assert ($d.helperExit -eq 0) 'H2 clean closed';$d.stageEvidence=@{replacementRefusals=$refusals;emptyReplacementFloor=$true;floorRestored=$false};return
    }
    $stage=$d.channel.Receive(20000);Assert ($null -ne $stage) 'bounded original driver stage';$p=$stage.Split(' ');Assert ($p.Count -eq 9 -and $p[0] -ceq 'STAGE' -and $p[1] -ceq $d.nonce -and $p[2] -ceq $d.stage) 'exact observer stage';$d.stageEvidence=@{stage=$p[2];createAttempts=$p[3];writeAttempts=$p[4];flushAttempts=$p[5];pendingHash=$p[6];floorSequence=$p[7];originalObservedSlotId=$p[8]}
    $d.channel.SendCommand('DIE_ACK '+$d.nonce);Assert ($d.channel.ExactExited(10000)) 'original D exact signaled';$d.driverExit=$d.channel.ExactExit();Assert ($d.driverExit -eq 83) 'planned exact D death83'
    $line=$d.observer.ReadAfterDriverExit($d.channel,10000);Assert ($null -ne $line -and $line.StartsWith('R ',[StringComparison]::Ordinal)) 'H independent stdout only after D death';$r=$line.Substring(2)|ConvertFrom-Json;Envelope $r;$d.results+=,$r;Assert (-not $r.ok -and $r.unavailable -and $r.code -in @('original_driver_not_live','continuity_broken','continuity_read_failed','continuity_refused')) 'dead original driver closes H'
    Assert ($d.observer.ExactExited(7000)) 'original H exact exit';$d.helperExit=$d.observer.ExactExit();Assert ($d.helperExit -eq 0) 'H closed after original stdin EOF'
    switch($d.stage){
        input {Assert ($r.createAttempts -ceq '0' -and $r.writeAttempts -ceq '0' -and $r.flushAttempts -ceq '0') 'beforeappend driverdeath zero IO';Assert (@([InitialDurabilityProof.Native]::Inventory($d.fixture.journal)).Count -eq 2) 'unchanged known prefix'}
        before_write {Assert ($r.unknown -and $r.createAttempts -ceq '1' -and $r.writeAttempts -ceq '0' -and $r.flushAttempts -ceq '0') 'empty slot in-flight UNKNOWN';$raw=[InitialDurabilityProof.Native]::ReadSlotRaw($d.fixture.journal,3);Assert ($raw.Bytes.Length -eq 0 -and $raw.Pin.fileIdHex -ceq $p[8]) 'actual original independently bound empty slot retained'}
        after_write {Assert ($r.unknown -and $r.actualPartialWrite -and $r.writeAttempts -ceq '1' -and $r.flushAttempts -ceq '0') 'real requested half frame UNKNOWN before crash hook';$raw=[InitialDurabilityProof.Native]::ReadSlotRaw($d.fixture.journal,3);Assert ($raw.Bytes.Length -gt 0 -and $raw.Bytes.Length -lt 228 -and $raw.Pin.fileIdHex -ceq $p[8]) 'independent original actual partial bytes';$d.stageEvidence.actualPartialBytes=$raw.Bytes.Length.ToString()}
        after_witness {Assert ($r.unknown -and -not $r.consumptionRecorded -and $r.persistence -ceq 'none' -and @($r.spentKeys).Count -eq 1) 'consumed complete head without ACK/permit';$raw=[InitialDurabilityProof.Native]::ReadSlot($d.fixture.journal,3);$frame=[InitialDurabilityProof.Frame]::Parse($raw.Bytes);Assert ($frame.Type -eq 3 -and $p[7] -ceq '3' -and $raw.Pin.fileIdHex -ceq $p[8]) 'independent original complete CONSUME/head advanced before D death'}
    }
}
try {
    $repo=Own ([InitialDurabilityProof.Native]::OpenChain($projectRoot));$runtime=Ensure-Parent $repo.Leaf '.codex-runtime';$owned=Ensure-Parent $runtime 'initial-owned-durability';$container=New-Dir $owned $runId;$roots=New-Dir $container 'roots';$build=New-Dir $container 'build';$evidence=New-Dir $container 'evidence';$driverHandle=Own ([InitialDurabilityProof.Channel]::OriginalDriver())
    $ids=@('baseline','child_reconstruction','competing_writers','stale_cas','takeover','same_child_reacquire','source_config_key','unfenced_genesis','unfenced_epoch','unfenced_append','unfenced_reconcile','private_nonreentrancy','pending_tail_disappearance','known_slot_identical_replacement','root_replacement','journal_replacement','journal_reparse','slot_hardlink','foreign_entry','suffix_rollback','missing_genesis_provisioned','missing_initial_floor','driver_disconnect_beforeappend','driver_disconnect_inflight','unknown_blocks_epoch_append','consume_unknown_terminal_observation','lost_ack_duplicate','crash_publication','stale_crosschild','inventory_257','inventory_gap','semantic_invalid_hash_valid','duplicate_key_inventory','timeout_barrier')
    $crashes=@('input','before_pending','registered_before_create','unbound_create','after_create','partial','full_write','pre_flush','post_flush','pre_ack')
    foreach($id in $ids){Add-Case $id}
    foreach($stage in $crashes){Add-Case "crash_$stage"}
    foreach($ioFault in @('invalid_flush_handle','synthetic_flush_failure','synthetic_readback_failure','synthetic_short_write')){Add-Case $ioFault $(if($ioFault.StartsWith('synthetic')){'synthetic fault injection'}else{'actual Win32 error'})}
    foreach($id in @('driver_death_beforeappend','driver_death_inflight','driver_death_partial_afterwrite','driver_death_afterhead','replacement_driver_refusal','actual_partial_frame_abrupt_exit','aggregate_limit_unit','counter_overflow_unit','missing_pins','missing_port','identity_query_failure','invalid_refs','move_active_source','move_active_destination','conflicting_payload','new_operation_id','pending_registered_ack_lost_beforecreate','pending_slot_identical_replacement')){Add-Case $id}
    foreach($id in @('aggregate_limit_unit','counter_overflow_unit')){$cases[$id].kind='source predicate boundary unit; not physical filesystem capacity'}
    # Finite immutable fixture inventory is created before any native proof child.
    foreach($id in @($ids|Where-Object{$_ -notin @('child_reconstruction','stale_cas','takeover','same_child_reacquire','source_config_key','unfenced_epoch','unfenced_append','unfenced_reconcile','private_nonreentrancy','consume_unknown_terminal_observation','stale_crosschild')})){
        $f=New-Fixture $id;$f.normal=New-Slot $f;$f.alternate=New-Slot $f
    }
    foreach($stage in $crashes){$f=New-Fixture "crash_$stage";$f.normal=New-Slot $f;$f.alternate=New-Slot $f;$f.fault=New-Slot $f $stage}
    foreach($ioFault in @('invalid_flush_handle','synthetic_flush_failure','synthetic_readback_failure','synthetic_short_write')){$f=New-Fixture $ioFault;$f.normal=New-Slot $f;$f.alternate=New-Slot $f;$f.fault=New-Slot $f '' $ioFault}
    foreach($id in @('aggregate_limit_unit','counter_overflow_unit','missing_pins','missing_port','identity_query_failure','invalid_refs','move_active_source','move_active_destination','conflicting_payload','new_operation_id','pending_registered_ack_lost_beforecreate')){$f=New-Fixture $id;$f.normal=New-Slot $f '' $(if($id -eq 'identity_query_failure'){'identity_query_failure'}else{''}) $false ($id -eq 'missing_port');$f.alternate=New-Slot $f}
    $f=$fixtures|Where-Object name -eq 'lost_ack_duplicate';$f.fault=New-Slot $f '' '' $true
    $f=$fixtures|Where-Object name -eq 'crash_publication';$f.fault=New-Slot $f 'publication'
    $f=New-Fixture 'pending_slot_identical_replacement';$f.normal=New-Slot $f;$f.alternate=New-Slot $f;$f.fault=New-Slot $f 'full_write'
    foreach($pair in @(@('driver_death_beforeappend','input'),@('driver_death_inflight','before_write'),@('driver_death_partial_afterwrite','after_write'),@('driver_death_afterhead','after_witness'))){$f=New-Fixture $pair[0];$null=New-DeathDriver $f $pair[1] ($pair[1] -eq 'after_write')}
    $f=$fixtures|Where-Object name -eq 'driver_death_afterhead';$replacementDriver=New-DeathDriver $f 'replacement_refusal'
    # Both headers are create-new files under original held build directory.
    $h=New-Object Text.StringBuilder;$null=$h.AppendLine('#pragma once');$null=$h.AppendLine('#include <cstdint>');$null=$h.AppendLine('namespace test_pins { struct Pin { const wchar_t* drivePath; const wchar_t* canonicalPath; const char* serialHex; const char* fileIdHex; }; struct Slot { const char* instanceId; unsigned int fixtureIndex; const char* pauseStage; const wchar_t* pauseComponent; const wchar_t* eventBase; bool invalidateCaseQuery; bool invalidateLockQuery; bool crashProof; bool lostAcquireAck; bool bindingProof; unsigned int canonicalFault; bool lockPropertyProof; }; inline constexpr bool kCanonicalProofEnabled=true;')
    $null=$h.AppendLine('inline const Pin kVolumeRoot='+(Pin $repo.Held[0])+'; inline const Pin kRunRoot='+(Pin $container)+';')
    foreach($table in @(@('kFixtures','root'),@('kOriginalLocks','lock'),@('kCanonicalRunRoots','container'))){$null=$h.AppendLine('inline const Pin '+$table[0]+'[]={');foreach($f in $fixtures){$w=if($table[1] -eq 'container'){$container}else{$f.($table[1])};$null=$h.AppendLine((Pin $w)+',')};$null=$h.AppendLine('};')}
    $null=$h.AppendLine('inline const Slot kSlots[]={');foreach($s in $slots){$null=$h.AppendLine('{'+(Ascii $s.instance)+','+$s.fixture.index+',"",L"",L"",false,false,true,false,false,0,false},')};$null=$h.AppendLine('}; }');$null=New-File $build 'fence_expected_pins.h' ([Text.Encoding]::UTF8.GetBytes($h.ToString()))
    $h=New-Object Text.StringBuilder;$null=$h.AppendLine('#pragma once');$null=$h.AppendLine('#include <cstdint>');$null=$h.AppendLine('namespace durability_pins { struct Pin {const wchar_t* drivePath; const wchar_t* canonicalPath; const char* serialHex; const char* fileIdHex;}; struct Slot {const char* instanceId; unsigned int fixtureIndex; const char* crashStage; const char* ioFault; bool suppressConsumeAck; bool withoutPort; std::uintptr_t originalDriverHandle;};')
    foreach($table in @(@('kRunRoots','container'),@('kFixtures','root'),@('kJournals','journal'),@('kLocks','lock'))){$null=$h.AppendLine('inline const Pin '+$table[0]+'[]={');foreach($f in $fixtures){$w=if($table[1] -eq 'container'){$container}else{$f.($table[1])};$pinText=Pin $w;if($table[0] -eq 'kJournals' -and $f.name -eq 'missing_pins'){$pinText='{'+(Wide $w.DrivePath)+','+(Wide $w.Original.canonicalPath)+','+(Ascii $w.Original.volumeSerialHex)+',""}'};$null=$h.AppendLine($pinText+',')};$null=$h.AppendLine('};')}
    foreach($table in @(@('kInstallationIds','installation'),@('kLineages','lineage'),@('kSelectors','selector'),@('kLaunchTargets','launch'),@('kDispatchTargets','dispatch'),@('kStopTargets','stop'))){$null=$h.AppendLine('inline const char* '+$table[0]+'[]={');foreach($f in $fixtures){$null=$h.AppendLine((Ascii ([InitialDurabilityProof.Frame]::Hex($f.($table[1]))))+',')};$null=$h.AppendLine('};')}
    $null=$h.AppendLine('inline const Slot kSlots[]={');foreach($s in $slots){$null=$h.AppendLine('{'+(Ascii $s.instance)+','+$s.fixture.index+','+(Ascii $s.crash)+','+(Ascii $s.ioFault)+','+$(if($s.lostAck){'true'}else{'false'})+','+$(if($s.withoutPort){'true'}else{'false'})+','+$s.driverHandle.ToString()+'ULL},')};$null=$h.AppendLine('}; }');$null=New-File $build 'durability_expected_pins.h' ([Text.Encoding]::UTF8.GetBytes($h.ToString()))
    Guard-Effects
    $buildInfo=New-Object Diagnostics.ProcessStartInfo($msbuild);$buildInfo.UseShellExecute=$false;$buildInfo.CreateNoWindow=$true;$buildInfo.WindowStyle=[Diagnostics.ProcessWindowStyle]::Hidden
    $buildInfo.Arguments='"'+(Join-Path $projectRoot 'native/owned-runtime-initial-durability/DurabilityPrerequisiteProof.vcxproj')+'" /nologo /v:minimal /p:Configuration=Release /p:Platform=x64 /p:VCToolsVersion=14.44.35207 /p:WindowsTargetPlatformVersion=10.0.26100.0 "/p:DurabilityProofPinsDir='+$build.DrivePath+'" "/p:DurabilityProofOutputDir='+$build.DrivePath+'"'
    $buildProcess=New-Object Diagnostics.Process;$buildProcess.StartInfo=$buildInfo;Assert $buildProcess.Start() 'original MSBuild process started';$control.buildStarted=$true;$buildHandle=$buildProcess.SafeHandle
    if([InitialDurabilityProof.Native]::WaitForSingleObject($buildHandle,60000)-ne 0){$control.stopped=$true;$control.reason='build outcome UNKNOWN';throw 'UNKNOWN: held MSBuild still live; no native proof admission'}
    $control.buildExited=$true;Assert ($buildProcess.ExitCode -eq 0) 'native build succeeded'
    $executable=Join-Path $build.DrivePath 'bin/DurabilityPrerequisiteProof.exe';Assert ([IO.File]::Exists($executable)) 'unique output executable exists'
    if($RunNativeProof){
        $f=$fixtures|Where-Object name -eq 'baseline'
        Run-Case baseline {$a=Prepare $f.normal;$r=Command $a 'consume-launch';Assert ($r.ok -and $r.consumptionRecorded -and $r.persistence -ceq 'os_flush_ack_and_readback') 'real immutable IO/readback';$baselineConsume=$r.recordHash;Assert (Command $a 'observation-unknown').ok 'UNKNOWN observation';Assert (Command $a 'observation-ack').ok 'terminal observation';$cases.consume_unknown_terminal_observation.status='PASS';$cases.consume_unknown_terminal_observation.reason='UNKNOWN record retained; exact terminal observation adds record';$before=Command $a 'inspect';Assert (@($before.spentKeys).Count -eq 1) 'one permanently spent launch key';Expect-Refusal (Command $a 'stale-note') 'stale_cas';$cases.stale_cas.status='PASS';$cases.stale_cas.reason='real stale CAS, 0creates';Assert (Command $a 'seam-proof').ok 'private nonreentrant boundary';$cases.private_nonreentrancy.status='PASS';$cases.private_nonreentrancy.reason='release/dispose/reacquire/reentrant/cross refs rejected';Assert (Command $a 'release').ok 'release';Assert (Command $a 'acquire').ok 'same child reacquire';Assert ((Command $a 'epoch').epoch -ceq '2') 'new epoch2';$cases.same_child_reacquire.status='PASS';$cases.same_child_reacquire.reason='new acquisition epoch2';$duplicate=Command $a 'consume-launch';Assert ($duplicate.code -ceq 'duplicate_readback' -and $duplicate.recordHash -ceq $baselineConsume) 'same stable consumption after reacquire';Assert (Command $a 'changed-note').ok 'source/config diagnostic changed';$again=Command $a 'consume-launch';Assert ($again.recordHash -ceq $baselineConsume -and $again.createAttempts -ceq '0') 'same key after source/config';$cases.source_config_key.status='PASS';$cases.source_config_key.reason='same consumed record independent of NOTE';Close-Child $a
            $b=Start-Child $f.alternate;Assert (Command $b 'acquire').ok 'child B fence';$reconstructed=Command $b 'inspect';Assert ($reconstructed.ok -and @($reconstructed.spentKeys).Count -eq 1) 'child reconstruction same spent key';$cases.child_reconstruction.status='PASS';$cases.child_reconstruction.reason='original live floor across exact child exit';Expect-Refusal (Command $b 'consume-launch') 'stale_owner';Assert ((Command $b 'epoch').epoch -ceq '3') 'takeover epoch3';$cases.takeover.status='PASS';$cases.takeover.reason='B new owner epoch3; normal stale owner refused';$cases.stale_crosschild.status='PASS';$cases.stale_crosschild.reason='B normal append before epoch 0creates';Close-Child $b
        }
        $f=$fixtures|Where-Object name -eq 'competing_writers'
        Run-Case competing_writers {$a=Prepare $f.normal;$b=Start-Child $f.alternate;$busy=Command $b 'acquire';Assert (-not $busy.ok -and $busy.code -ceq 'fence_busy') 'physical root kernel exclusion';Close-Child $b;Assert (Command $a 'consume-launch').ok 'one writer append';Close-Child $a}
        $f=$fixtures|Where-Object name -eq 'unfenced_genesis'
        Run-Case unfenced_genesis {$a=Start-Child $f.normal;foreach($command in @('genesis','epoch','consume-launch','reconcile')){Expect-Refusal (Command $a $command) 'actual_fence_required'};foreach($id in @('unfenced_epoch','unfenced_append','unfenced_reconcile')){$cases[$id].status='PASS';$cases[$id].reason='actual acquired fence absent, zero creates'};Close-Child $a}
        foreach($stage in $crashes){$f=$fixtures|Where-Object name -eq "crash_$stage";$caseId="crash_$stage"
            Run-Case $caseId {$a=Prepare $f.fault;$before=[InitialDurabilityProof.Native]::Inventory($f.journal);$null=Command $a 'consume-launch' -ExpectedCrash;Close-Child $a 73;$after=[InitialDurabilityProof.Native]::Inventory($f.journal);$cases[$caseId].evidence+=@{before=$before;after=$after;exactExit=73;pending=($null -ne $f.floor.Pending);pendingCreatedId=$f.floor.PendingCreatedId;stage=$stage;actualPartialRequested=($stage -eq 'partial')}
                if($stage -eq 'unbound_create'){Assert ($null -eq $f.floor.PendingCreatedId -and $a.channel.CreateCount -eq 1 -and $a.channel.WriteCount -eq 0 -and $a.channel.FlushCount -eq 0 -and [InitialDurabilityProof.Native]::ReadSlotRaw($f.journal,3).Bytes.Length -eq 0) 'actual created empty slot never captured, remains unbound/no writes'}
                if($stage -eq 'after_create'){Assert ($null -ne $f.floor.PendingCreatedId -and $a.channel.CreateCount -eq 1 -and $a.channel.WriteCount -eq 0 -and $a.channel.FlushCount -eq 0) 'original new slot ID independently captured before writes'}
                $b=Start-Child $f.alternate;Assert (Command $b 'acquire').ok 'restart original fixture fence';$r=Command $b 'reconcile'
                if($stage -in @('input','before_pending')){Assert ($r.ok -and $r.code -ceq 'no_pending' -and $after.Count -eq $before.Count) 'beforepending zero IO'}
                elseif($stage -in @('registered_before_create','unbound_create','after_create','partial')){Assert (-not $r.ok -and $r.unknown -and $null -ne $f.floor.Pending) 'partial/missing pending retained';Expect-Refusal (Command $b 'epoch');Expect-Refusal (Command $b 'consume-launch')}
                else{Assert ($r.ok -and $r.persistence -ceq 'recovered_readback_only' -and $null -eq $f.floor.Pending) 'exact full tail reconciliation';Assert (Command $b 'epoch').ok 'new owner after readback';$duplicate=Command $b 'consume-launch';Assert ($duplicate.code -ceq 'duplicate_readback' -and $duplicate.createAttempts -ceq '0') 'no second consume'};Close-Child $b
                if($stage -eq 'partial'){$raw=[InitialDurabilityProof.Native]::ReadSlotRaw($f.journal,3);[byte[]]$expectedHalf=$f.floor.Pending.Bytes[0..([int]($f.floor.Pending.Bytes.Length/2)-1)];Assert ($raw.Pin.fileIdHex -ceq $f.floor.PendingCreatedId -and [InitialDurabilityProof.Frame]::Same($raw.Bytes,$expectedHalf)) 'real exact requested half frame remains, no flush ACK';$cases.actual_partial_frame_abrupt_exit.status='PASS';$cases.actual_partial_frame_abrupt_exit.reason='actual WriteFile of a deliberate half frame then original ExitProcess73; not an OS short write';$cases.actual_partial_frame_abrupt_exit.evidence+=@{exactExit=73;actualRequestedPartialBytes=$raw.Bytes.Length.ToString();slotPin=$raw.Pin;naturalOSShortWrite=$false;syntheticAPIFailure=$false}}
            }
        }
        foreach($ioFault in @('invalid_flush_handle','synthetic_flush_failure','synthetic_readback_failure','synthetic_short_write')){$f=$fixtures|Where-Object name -eq $ioFault
            Run-Case $ioFault {$a=Prepare $f.fault;$r=Command $a 'consume-launch';Assert (-not $r.ok -and $r.unknown -and $null -ne $f.floor.Pending) 'failed IO is UNKNOWN/pending';if($ioFault -eq 'invalid_flush_handle'){Assert ($r.actualHandleError -and $r.win32Error -eq 6 -and -not $r.syntheticFault) 'actual Win32 invalid handle flush error6'}else{Assert $r.syntheticFault 'honest synthetic fault flag'};Expect-Refusal (Command $a 'epoch');Expect-Refusal (Command $a 'consume-dispatch');$cases.unknown_blocks_epoch_append.status='PASS';$cases.unknown_blocks_epoch_append.reason='same store UNKNOWN blocks all writes';Close-Child $a}
        }
        $f=$fixtures|Where-Object name -eq 'pending_tail_disappearance'
        Run-Case pending_tail_disappearance {$faultSlot=$slots|Where-Object{$_.fixture.name -eq 'crash_pre_ack' -and $_.crash -eq 'pre_ack'}
            # This fixture uses a before-witness live refusal, not a fabricated flush receipt.
            $a=Prepare $f.normal;$f.floor.SuppressNextWitness=$true;$r=Command $a 'consume-launch';Assert ($r.unknown -and $null -ne $f.floor.Pending) 'complete tail pending before driver query';Close-Child $a;$old=[InitialDurabilityProof.Native]::ReadSlot($f.journal,3);[InitialDurabilityProof.Native]::ParkRecord($f.journal,3,$f.preserved,'pending-tail.evidence');$b=Start-Child $f.alternate;Assert (Command $b 'acquire').ok 'same original fixture';$r=Command $b 'reconcile';Assert (-not $r.ok -and $r.unknown -and $null -ne $f.floor.Pending -and @($r.spentKeys).Count -eq 1) 'disappeared pending consume conservatively spent';Expect-Refusal (Command $b 'epoch');Expect-Refusal (Command $b 'genesis');Close-Child $b
        }
        foreach($id in @('known_slot_identical_replacement','slot_hardlink','foreign_entry','suffix_rollback','missing_genesis_provisioned','inventory_gap','semantic_invalid_hash_valid','duplicate_key_inventory')){$f=$fixtures|Where-Object name -eq $id
            Run-Case $id {$a=Prepare $f.normal;Assert (Command $a 'consume-launch').ok 'known consumed prefix';Close-Child $a
                switch($id){
                    known_slot_identical_replacement {[InitialDurabilityProof.Native]::ReplaceKnownSlot($f.journal,2,$f.preserved,$true)}
                    slot_hardlink {$link=[InitialDurabilityProof.Native]::HardlinkKnownSlot($f.journal,2,$f.preserved);Assert $link.ok 'actual hardlink created'}
                    foreign_entry {$null=New-File $f.journal 'foreign.evidence' ([byte[]]@(1))}
                    suffix_rollback {[InitialDurabilityProof.Native]::ParkRecord($f.journal,3,$f.preserved,'tail.evidence')}
                    missing_genesis_provisioned {[InitialDurabilityProof.Native]::ParkRecord($f.journal,1,$f.preserved,'genesis.evidence')}
                    inventory_gap {[InitialDurabilityProof.Native]::ParkRecord($f.journal,2,$f.preserved,'gap.evidence')}
                    semantic_invalid_hash_valid {$valid=[InitialDurabilityProof.Native]::ReadSlot($f.journal,3);[byte[]]$bad=$valid.Bytes.Clone();$bad[16]=[byte]($bad[16] -bxor 1);$hash=[InitialDurabilityProof.Frame]::HashBytes($bad[0..($bad.Length-33)]);[Array]::Copy($hash,0,$bad,$bad.Length-32,32);$null=New-File $f.journal '00000000000000000004.rec' $bad}
                    duplicate_key_inventory {$valid=[InitialDurabilityProof.Native]::ReadSlot($f.journal,3);[byte[]]$bad=$valid.Bytes.Clone();[Array]::Copy([BitConverter]::GetBytes([uint64]4),0,$bad,96,8);[Array]::Copy($valid.Bytes[($valid.Bytes.Length-32)..($valid.Bytes.Length-1)],0,$bad,128,32);$hash=[InitialDurabilityProof.Frame]::HashBytes($bad[0..($bad.Length-33)]);[Array]::Copy($hash,0,$bad,$bad.Length-32,32);$null=New-File $f.journal '00000000000000000004.rec' $bad}
                };$b=Start-Child $f.alternate;Assert (Command $b 'acquire').ok 'fault fixture fence';Expect-Refusal (Command $b 'inspect');Expect-Refusal (Command $b 'epoch');Close-Child $b
            }
        }
        foreach($id in @('root_replacement','journal_replacement','journal_reparse')){$f=$fixtures|Where-Object name -eq $id
            Run-Case $id {$own=if($id -eq 'root_replacement'){$f.root}else{$f.journal};$parent=if($id -eq 'root_replacement'){$roots}else{$f.root};$name=if($id -eq 'root_replacement'){$f.name}else{'journal'};Rename-FixtureDirectory $id $f $own $parent $name;$replacement=New-Dir $parent $name
                if($id -eq 'journal_reparse'){$tag=[InitialDurabilityProof.Native]::SetOwnJunction($replacement,$f.preserved);Assert $tag.ok 'actual owned journal junction'}
                $a=Start-Child $f.normal;if($id -eq 'root_replacement'){Assert (-not $a.startup.ok) 'original root pin refusal';Close-Child $a 2}else{Assert (Command $a 'acquire').ok 'original root fence';Expect-Refusal (Command $a 'genesis');Close-Child $a}
            }
        }
        $f=$fixtures|Where-Object name -eq 'inventory_257'
        Run-Case inventory_257 {for($n=1;$n -le 257;$n++){$null=New-File $f.journal ($n.ToString('D20')+'.rec') ([byte[]]@(1))};$a=Start-Child $f.normal;Assert (Command $a 'acquire').ok 'fence';Expect-Refusal (Command $a 'inspect') 'inventory_limit';Close-Child $a}
        foreach($id in @('missing_initial_floor','driver_disconnect_beforeappend','driver_disconnect_inflight')){$f=$fixtures|Where-Object name -eq $id
            Run-Case $id {$a=if($id -eq 'missing_initial_floor'){Start-Child $f.normal}else{Prepare $f.normal};if($id -eq 'missing_initial_floor'){Assert (Command $a 'acquire').ok 'fence';$f.floor.RefusePort=$true;$r=Command $a 'genesis';Expect-Refusal $r;Assert $r.unavailable 'absent live floor unavailable'}else{$f.floor.InjectAtStage=if($id -eq 'driver_disconnect_beforeappend'){'input'}else{'after_write'};$r=Command $a 'consume-launch';Assert (-not $r.ok -and $r.unavailable) 'private live port refusal closes';if($id -eq 'driver_disconnect_beforeappend'){Assert ($r.createAttempts -ceq '0') 'beforeappend0creates'}else{Assert $r.unknown 'inflight UNKNOWN'};Expect-Refusal (Command $a 'epoch')};Close-Child $a;$cases[$id].evidence+=@{syntheticPortRefusal=$true;actualDriverDeath=$false}
            }
        }
        $f=$fixtures|Where-Object name -eq 'invalid_refs'
        Run-Case invalid_refs {$a=Prepare $f.normal;foreach($command in @('invalid-root-ref','invalid-fence-ref','foreign-factory-ref')){Expect-Refusal (Command $a $command)};Assert (Command $a 'consume-launch').ok 'own original refs still usable after invalid borrowers';Close-Child $a}
        foreach($pair in @(@('move_active_source','move-source-proof'),@('move_active_destination','move-destination-proof'))){$f=$fixtures|Where-Object name -eq $pair[0];Run-Case $pair[0] {$a=Prepare $f.normal;Expect-Refusal (Command $a $pair[1]) 'fenced_callback_invalid';Assert (Command $a 'inspect').ok 'rejected move retained original owner';Close-Child $a}}
        foreach($id in @('aggregate_limit_unit','counter_overflow_unit')){$f=$fixtures|Where-Object name -eq $id;Run-Case $id {$a=Start-Child $f.normal;Assert (Command $a 'acquire').ok 'original fence for private unit';$r=Command $a 'bounds-proof';Assert ($r.ok -and $r.syntheticFault -and $r.code -ceq 'bounds_unit_checked' -and $r.createAttempts -ceq '0') 'same source predicates reject boundary overflow';$cases[$id].evidence+=@{taggedUnit=$true;physicalOversizeIOProven=$false};Close-Child $a}}
        foreach($id in @('missing_pins','missing_port')){$f=$fixtures|Where-Object name -eq $id;Run-Case $id {$a=Start-Child $f.normal;Expect-Refusal $a.startup $(if($id -eq 'missing_pins'){'pin_length_invalid'}else{'continuity_unavailable'});Assert (@([InitialDurabilityProof.Native]::Inventory($f.journal)).Count -eq 0) 'startup missing dependency zero private writes';Close-Child $a 2}}
        $f=$fixtures|Where-Object name -eq 'identity_query_failure'
        Run-Case identity_query_failure {$a=Start-Child $f.normal;Assert (Command $a 'acquire').ok 'held fence';$r=Command $a 'genesis';Expect-Refusal $r 'identity_query_failed';Assert ($r.actualHandleError -and $r.win32Error -eq 6 -and -not $r.syntheticFault) 'actual invalid HANDLE GetFileInformationByHandleEx error6';Close-Child $a}
        $f=$fixtures|Where-Object name -eq 'conflicting_payload'
        Run-Case conflicting_payload {$a=Prepare $f.normal;$consume=Command $a 'consume-launch';Assert $consume.ok 'original consume';Expect-Refusal (Command $a 'conflicting-consume') 'closed_record_extra_fields';$duplicate=Command $a 'consume-launch';Assert ($duplicate.recordHash -ceq $consume.recordHash -and $duplicate.createAttempts -ceq '0') 'same key cannot add conflicting request fields';$cases.conflicting_payload.evidence+=@{closedTypedPayload=$true;stableKeyConflictInventoryCoveredBy='duplicate_key_inventory'};Close-Child $a}
        $f=$fixtures|Where-Object name -eq 'new_operation_id'
        Run-Case new_operation_id {$a=Prepare $f.normal;Assert (Command $a 'consume-launch').ok 'spent launch';Expect-Refusal (Command $a ('consume-launch '+[Guid]::NewGuid().ToString('N'))) 'protocol_refused';Close-Child $a 2;Assert (@([InitialDurabilityProof.Native]::Inventory($f.journal)).Count -eq 3) 'caller operation ID cannot create second consume'}
        $f=$fixtures|Where-Object name -eq 'pending_registered_ack_lost_beforecreate'
        Run-Case pending_registered_ack_lost_beforecreate {$a=Prepare $f.normal;$f.floor.DropPendingAck=$true;$r=Command $a 'consume-launch';Assert (-not $r.ok -and $r.unavailable -and $r.unknown -and $r.createAttempts -ceq '0' -and @($r.spentKeys).Count -eq 1 -and $null -ne $f.floor.Pending) 'independent pending committed, lost ACK retains local UNKNOWN/spent key before CREATE';Assert (@([InitialDurabilityProof.Native]::Inventory($f.journal)).Count -eq 2) 'pending ACK loss performs no CREATE';Expect-Refusal (Command $a 'epoch');Expect-Refusal (Command $a 'consume-stop');Close-Child $a;$b=Start-Child $f.alternate;Assert (Command $b 'acquire').ok 'new child same original floor';$r=Command $b 'reconcile';Assert (-not $r.ok -and $r.unknown -and @($r.spentKeys).Count -eq 1 -and $null -ne $f.floor.Pending) 'missing registered slot cannot clear Pending or free key';Expect-Refusal (Command $b 'epoch');Close-Child $b}
        $f=$fixtures|Where-Object name -eq 'lost_ack_duplicate'
        Run-Case lost_ack_duplicate {$a=Prepare $f.fault;$a.channel.SendCommand('consume-launch');$null=Pump $a -KnownLostAck;Assert ($a.externalUnknown -and $null -ne $a.channel.Pending -and $f.floor.Known.Count -eq 3 -and $null -eq $f.floor.Pending) 'actual suppressed ACK, original independent consumed prefix observed';$originalHash=[InitialDurabilityProof.Frame]::Hex($f.floor.Known[2].Hash);$a.channel.ReadbackOriginal();$readback=Pump $a;Assert ($readback.ok -and @($readback.spentKeys).Count -eq 1 -and $readback.createAttempts -ceq '0') 'only read-only original-channel reconciliation';$duplicate=Command $a 'consume-launch';Assert ($duplicate.code -ceq 'duplicate_readback' -and $duplicate.recordHash -ceq $originalHash -and $duplicate.persistence -ceq 'readback_only' -and $duplicate.createAttempts -ceq '0') 'same child exact duplicate, zero consume replay';Close-Child $a;$b=Start-Child $f.alternate;Assert (Command $b 'acquire').ok 'original root in child B';Assert (Command $b 'inspect').ok 'spent prefix reconstructed';Assert (Command $b 'epoch').ok 'new epoch';$duplicate=Command $b 'consume-launch';Assert ($duplicate.recordHash -ceq $originalHash -and $duplicate.createAttempts -ceq '0') 'new acquisition retains exact consumed record';Close-Child $b}
        $f=$fixtures|Where-Object name -eq 'crash_publication'
        Run-Case crash_publication {$a=Prepare $f.fault;$null=Command $a 'consume-launch' -ExpectedCrash;Close-Child $a 73;Assert ($f.floor.Known.Count -eq 3 -and $null -eq $f.floor.Pending) 'floor advanced and pending cleared before publication crash';$b=Start-Child $f.alternate;Assert (Command $b 'acquire').ok 'original restart fence';$r=Command $b 'inspect';Assert ($r.ok -and @($r.spentKeys).Count -eq 1 -and $r.persistence -ceq 'readback_only') 'complete consume without publication ACK remains spent';Assert (Command $b 'epoch').ok 'new owner';$r=Command $b 'consume-launch';Assert ($r.code -ceq 'duplicate_readback' -and $r.createAttempts -ceq '0') 'publication crash no second consume';Close-Child $b}
        $f=$fixtures|Where-Object name -eq 'pending_slot_identical_replacement'
        Run-Case pending_slot_identical_replacement {$a=Prepare $f.fault;$null=Command $a 'consume-launch' -ExpectedCrash;Close-Child $a 73;Assert ($null -ne $f.floor.Pending -and $null -ne $f.floor.PendingCreatedId -and $f.floor.Known.Count -eq 2) 'original created slot ID independently held before full-write crash';$oldId=$f.floor.PendingCreatedId;$old=[InitialDurabilityProof.Native]::ReadSlot($f.journal,3);Assert ($old.Pin.fileIdHex -ceq $oldId) 'actual original pending slot ID';[InitialDurabilityProof.Native]::ReplaceKnownSlot($f.journal,3,$f.preserved,$true);$replacement=[InitialDurabilityProof.Native]::ReadSlot($f.journal,3);Assert ($replacement.Pin.fileIdHex -cne $oldId -and [InitialDurabilityProof.Frame]::Same($old.Bytes,$replacement.Bytes)) 'real byte-identical replacement with new FileID';$b=Start-Child $f.alternate;Assert (Command $b 'acquire').ok 'original root retained';$r=Command $b 'reconcile';Expect-Refusal $r 'pending_slot_replaced_or_unbound';Assert ($r.unknown -and @($r.spentKeys).Count -eq 1 -and $f.floor.PendingCreatedId -ceq $oldId -and $null -ne $f.floor.Pending) 'replacement cannot clear pending or free consumed key';Expect-Refusal (Command $b 'epoch');Expect-Refusal (Command $b 'consume-stop');Close-Child $b;$cases.pending_slot_identical_replacement.evidence+=@{originalCreatedId=$oldId;replacementCreatedId=$replacement.Pin.fileIdHex;byteIdentical=$true;exactCrashExit=73;pendingRetained=$true}}
        foreach($d in @($deathDrivers|Where-Object stage -ne 'replacement_refusal')){$id=$d.fixture.name;Run-Case $id {Run-Death $d;$cases[$id].evidence+=@{actualDriverExit=$d.driverExit;actualHelperExit=$d.helperExit;stage=$d.stageEvidence;result=$d.results;floorRestored=$false;observerHasHelperInput=$false}}}
        Run-Case replacement_driver_refusal {Run-Death $replacementDriver -Replacement;$cases.replacement_driver_refusal.evidence+=@{originalD2Exit=$replacementDriver.driverExit;originalH2Exit=$replacementDriver.helperExit;result=$replacementDriver.stageEvidence;floorRestored=$false}}
        # Last ordinary proof: a deliberately withheld input guard creates a
        # real bounded channel UNKNOWN. From the barrier onwards only original
        # channel readback/close/wait is allowed; no next proof/effect begins.
        $f=$fixtures|Where-Object name -eq 'timeout_barrier'
        Run-Case timeout_barrier {$a=Prepare $f.normal;$a.channel.SendCommand('consume-launch');$guard=$a.channel.Receive(2000);Assert ($null -ne $guard -and $guard.StartsWith('P ',[StringComparison]::Ordinal) -and $guard.Split(' ')[3] -ceq 'input') 'original pending input guard';$a.channel.ContinueRead();Assert ($null -eq $a.channel.Receive(100) -and $null -ne $a.channel.Pending) 'bounded pending read retained';$control.stopped=$true;$control.reason='intentional mandatory timeout barrier';$starts=$control.childStarts;$effects=$control.namespaceEffects;$blocked=$false;try{Guard-Effects}catch{$blocked=$true};Assert $blocked 'new namespace/child effects blocked';$blocked=$false;try{$null=Command $a 'consume-stop'}catch{$blocked=$true};Assert $blocked 'new ordinary command blocked';Assert ($starts -eq $control.childStarts -and $effects -eq $control.namespaceEffects) 'no subsequent effects';$line=$a.channel.Receive(6000);Assert ($null -ne $line -and $line.StartsWith('R ',[StringComparison]::Ordinal)) 'original pending result reconciled without replay';$r=$line.Substring(2)|ConvertFrom-Json;Envelope $r;$a.results.Add($r);Assert (-not $r.ok -and $r.unavailable -and $r.code -ceq 'continuity_timeout' -and $r.createAttempts -ceq '0') 'actual private roundtrip timeout zero CREATE';Assert (@([InitialDurabilityProof.Native]::Inventory($f.journal)).Count -eq 2) 'prefix unchanged';$cases.timeout_barrier.evidence+=@{syntheticPortWithheld=$true;realContinuityTimeout=$true;noNextEffects=$true};Close-Child $a}
    }
} catch {Capture-Failure 'proof' $_;$fault=[InitialDurabilityProof.Native]::ErrorDetails($_.Exception);$control.stopped=$true;if($null -eq $control.reason){$control.reason=$fault}}
finally {
    # UNKNOWN reconciliation owns only original processes/channels. It never
    # reissues a command, reopens PID, starts replacement or deletes scratch.
    if($control.buildStarted -and -not $control.buildExited){try{if([InitialDurabilityProof.Native]::WaitForSingleObject($buildHandle,1000)-ne 0){$control.buildForced=$true;if(-not [InitialDurabilityProof.Native]::TerminateProcess($buildHandle,91)){throw 'original MSBuild termination UNKNOWN'}};if([InitialDurabilityProof.Native]::WaitForSingleObject($buildHandle,5000)-eq 0){$control.buildExited=$true}else{throw 'original MSBuild exit remains UNKNOWN'}}catch{Capture-Failure 'original_build_reconciliation' $_;if($null -eq $fault){$fault=$_.Exception.Message}}}
    foreach($child in $children){if($null -eq $child.exit){try{if($null -eq $child.channel.ProcessHandle){$child.notCreated=$true;$control.exactClosed++;continue};$child.channel.CloseInput();if(-not $child.channel.ExactExited(7000)){$raw=$child.channel.TerminateExact();$control.forcedChildren++;if(-not $raw.ok){throw 'original held child terminate unknown'}};if($child.channel.ExactExited(5000)){$child.exit=$child.channel.ExactExit();$control.exactClosed++}else{throw 'original child exit remains UNKNOWN'}}catch{Capture-Failure ('original_H_reconciliation:'+ $child.slot.instance) $_;if($null -eq $fault){$fault=$_.Exception.Message}}}}
    foreach($d in $deathDrivers){
        try{
            if($null -eq $d.channel.ProcessHandle){$d.abortedBeforeResume=$true;$d.closed=$true;$control.deathDriversClosed++;continue}
            if(-not $d.resumed){
                # Planned source-build abort of a never-resumed original D.
                # No helper was created; this cannot count as actual driver death.
                $d.abortedBeforeResume=$true;$raw=$d.channel.TerminateExact();if(-not $raw.ok -or -not $d.channel.ExactExited(5000)){throw 'suspended original D abort UNKNOWN'};$d.driverExit=$d.channel.ExactExit();$d.channel.CloseInput();$d.closed=$true;$control.deathDriversClosed++;continue
            }
            if($null -eq $d.observer -and $null -ne $d.channel.Pending){
                # Read only the already pending original D channel. A late READY
                # may transfer existing original H instances for bounded closure;
                # reconciliation sends no READY_ACK and admits no helper append.
                if($null -ne $d.channel.FatalReadFault){$failureErrors.Add([ordered]@{context='late_READY_skipped_fatal_reader';instance=$d.slot.instance;details=$d.channel.FatalReadFault;readerRetried=$false})}
                else{try{$late=$d.channel.Receive(1000);if($null -ne $late){$parts=$late.Split(' ');if($parts.Count -eq 4 -and $parts[0] -ceq 'READY' -and $parts[1] -ceq $d.nonce){$d.observer=New-Object InitialDurabilityProof.OriginalHelperObserver([long]$parts[2],[long]$parts[3])}}}catch{Capture-Failure ('late_READY_original_reader:'+ $d.slot.instance) $_}}
            }
            $d.channel.CloseInput()
            if(-not $d.channel.ExactExited(7000)){$d.forced=$true;$control.forcedChildren++;$raw=$d.channel.TerminateExact();if(-not $raw.ok){throw 'original D termination UNKNOWN'}}
            if(-not $d.channel.ExactExited(5000)){throw 'original D exit remains UNKNOWN'};$d.driverExit=$d.channel.ExactExit()
            if($null -eq $d.observer){throw 'resumed D has no independently captured original H; no receipt/admission'}
            if(-not $d.observer.ExactExited(7000)){$d.forced=$true;$control.forcedChildren++;$raw=$d.observer.TerminateExact();if(-not $raw.ok){throw 'original H termination UNKNOWN'}}
            if(-not $d.observer.ExactExited(5000)){throw 'original H exit remains UNKNOWN'};$d.helperExit=$d.observer.ExactExit();$d.closed=$true;$control.deathDriversClosed++
        }catch{Capture-Failure ('original_D_H_reconciliation:'+ $d.nonce) $_;if($null -eq $fault){$fault=$_.Exception.Message}}
    }
    if(($control.forcedChildren -gt 0 -or $control.buildForced) -and $null -eq $fault){$fault='NO-GO: an original proof process required forced termination'}
    $control.receiptReady=($control.exactClosed -eq $children.Count -and $control.deathDriversClosed -eq $deathDrivers.Count -and $control.buildExited)
    if($null -ne $container -and $null -ne $evidence -and $control.receiptReady){
        $receipt=[ordered]@{
            schema='ae-agent.initial-durability-proof-driver.v1';scope='windows_initial_durability_prerequisite';productionAuthority=$false;issuerStatus='unavailable';admission=$false;mayDispatch=$false;replayAllowed=$false
            runId=$runId;mode=if($BuildOnly){'build_only'}else{'native_proof'};sourceHashes=$sourceHashes;runRootPin=$container.Original;originalDriverHandleHeld=$true
            powerLoss='UNVERIFIED';hardwareRollback='UNVERIFIED';naturalOSShortWriteEndToEndProven=$false;deadFloorRestored=$false;control=$control;fault=$fault;cases=@($cases.Values)
            children=@($children|ForEach-Object{[ordered]@{instance=$_.slot.instance;fixture=$_.slot.fixture.name;exactExit=$_.exit;notCreated=$_.notCreated;externalAckUnknown=$_.externalUnknown;results=$_.results.ToArray();portTrace=$_.portTrace.ToArray();portFailures=$_.portFailures.ToArray();before=$_.before}})
            deathDrivers=@($deathDrivers|ForEach-Object{[ordered]@{fixture=$_.fixture.name;instance=if($null -ne $_.slot){$_.slot.instance}else{$null};stage=$_.stage;resumed=$_.resumed;abortedBeforeResume=$_.abortedBeforeResume;actualDriverDeath=($_.driverExit -eq 83 -and -not $_.forced);originalDriverExit=$_.driverExit;originalHelperExit=$_.helperExit;readyAccepted=$_.readyAccepted;forced=$_.forced;closed=$_.closed;observerHasHelperInput=$false;deadFloorRestored=$false;stageEvidence=$_.stageEvidence;results=$_.results}})
            pending=@($fixtures|ForEach-Object{[ordered]@{fixture=$_.name;floorLocation=if($_.name.StartsWith('driver_death_')){'original isolated D; dead and never imported'}else{'original live parent'};floorSequence=$_.floor.Known.Count.ToString();pendingCreatedId=$_.floor.PendingCreatedId;pendingHash=if($null -ne $_.floor.Pending){[InitialDurabilityProof.Frame]::Hex($_.floor.Pending.Hash)}else{$null}}})
        }
        try{[InitialDurabilityProof.Native]::VerifyOwnHeldPinAt($evidence,$evidence.CurrentKnownPath)|Out-Null;[InitialDurabilityProof.Native]::WriteNewText($evidence,'receipt.json',($receipt|ConvertTo-Json -Depth 24));$receiptWritten=$true;Write-Output (Join-Path $evidence.DrivePath 'receipt.json')}catch{Capture-Failure 'receipt_write' $_;if($null -eq $fault){$fault=$_.Exception.Message}}
    }
    if($null -ne $container -and $null -ne $evidence -and ($null -ne $fault -or -not $control.receiptReady -or ($RunNativeProof -and @($cases.Values|Where-Object status -ne 'PASS').Count -gt 0))){
        # Diagnostic CREATE_NEW is confined to the held evidence directory. It
        # grants no journal write, recovery, admission, receipt or process adoption.
        $audit=[ordered]@{
            schema='ae-agent.initial-durability-failure-audit.v1';scope='windows_initial_durability_prerequisite';evidenceRole='failure_diagnostics_only';aggregatePass=$false;acceptance='UNVERIFIED'
            productionAuthority=$false;issuerStatus='unavailable';admission=$false;mayDispatch=$false;replayAllowed=$false;deadFloorRestored=$false
            runId=$runId;sourceHashes=$sourceHashes;runRootPin=$container.Original;receiptReady=$control.receiptReady;admissionReceiptWritten=$false;prerequisiteReceiptWritten=$receiptWritten;activeCase=$activeCase;control=$control;fault=$fault;errors=$failureErrors.ToArray();cases=@($cases.Values)
            handleSnapshotPhase='original instances still held; disposal follows only exact exit';buildOriginal=[InitialDurabilityProof.Native]::ObserveOriginalProcess($buildHandle)
            children=@($children|ForEach-Object{[ordered]@{instance=$_.slot.instance;fixture=$_.slot.fixture.name;exactExit=$_.exit;notCreated=$_.notCreated;originalProcess=$_.channel.ObserveOriginal();pendingReader=($null -ne $_.channel.Pending);fatalReadFault=$_.channel.FatalReadFault;stderr=$_.channel.ObserveStderr()}})
            deathDrivers=@($deathDrivers|ForEach-Object{[ordered]@{instance=if($null -ne $_.slot){$_.slot.instance}else{$null};fixture=$_.fixture.name;stage=$_.stage;resumed=$_.resumed;abortedBeforeResume=$_.abortedBeforeResume;closed=$_.closed;forced=$_.forced;originalDriverExit=$_.driverExit;originalD=$_.channel.ObserveOriginal();originalHCaptured=($null -ne $_.observer);originalH=if($null -ne $_.observer){$_.observer.ObserveOriginal()}else{'UNVERIFIED: no original helper instance captured'};originalHelperExit=$_.helperExit;readyAccepted=$_.readyAccepted;fatalDReadFault=$_.channel.FatalReadFault;fatalHReadFault=if($null -ne $_.observer){$_.observer.FatalReadFault}else{$null};stderr=$_.channel.ObserveStderr();stageEvidence=$_.stageEvidence}})
            pending=@($fixtures|ForEach-Object{[ordered]@{fixture=$_.name;floorLocation=if($_.name.StartsWith('driver_death_')){'original isolated D; never imported'}else{'original live parent'};floorSequence=$_.floor.Known.Count.ToString();pendingCreatedId=$_.floor.PendingCreatedId;pendingHash=if($null -ne $_.floor.Pending){[InitialDurabilityProof.Frame]::Hex($_.floor.Pending.Hash)}else{$null}}})
        }
        try{[InitialDurabilityProof.Native]::VerifyOwnHeldPinAt($evidence,$evidence.CurrentKnownPath)|Out-Null;[InitialDurabilityProof.Native]::WriteNewText($evidence,'failure-audit.json',($audit|ConvertTo-Json -Depth 24));Write-Output (Join-Path $evidence.DrivePath 'failure-audit.json')}catch{Capture-Failure 'failure_audit_write' $_;[Console]::Error.WriteLine('FAILURE_AUDIT_WRITE_REFUSED '+[InitialDurabilityProof.Native]::ErrorDetails($_.Exception));[Console]::Error.Flush();if($null -eq $fault){$fault=$_.Exception.Message}}
    }
    foreach($child in $children){$child.channel.Dispose()}
    foreach($d in $deathDrivers){if($null -ne $d.observer){$d.observer.Dispose()};$d.channel.Dispose()}
    if($null -ne $buildProcess -and $control.buildExited){$buildProcess.Dispose()}
    for($i=$held.Count-1;$i -ge 0;$i--){$held[$i].Dispose()}
}
if($fault){throw $fault}
if($RunNativeProof){$incomplete=@($cases.Values|Where-Object status -ne 'PASS');if($incomplete.Count){throw "NO-GO: $($incomplete.Count) mandatory cases not PASS; inspect preserved receipt."}}
