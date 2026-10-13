#requires -Version 5.1
# Supporting source for the sole reviewed synthetic launch_eof parent action.
# Dot-sourcing declares functions only; Add-Type/native/build happen inside that
# explicit action. No profile, PID, root, Node or controller selector is accepted.
Set-StrictMode -Version Latest

function Invoke-LocalSessionInstalledBaseline {
    [CmdletBinding()]
    param()
    $ErrorActionPreference='Stop'
    if(-not $ParentSourceGo){throw 'Точный parent source GO обязателен.'}
    $fixedNode='C:\Program Files\nodejs\node.exe'
    $fixedMsBuild='C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\MSBuild\Current\Bin\MSBuild.exe'
    if(-not (Test-Path -LiteralPath $fixedNode)-or -not (Test-Path -LiteralPath $fixedMsBuild)){throw 'Fixed Node/MSBuild недоступен; fallback отсутствует.'}
    $captureSource=@'
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Win32.SafeHandles;

namespace LocalSessionSyntheticCapture {
  // Evidence objects are test-driver observations; serialized copies are never
  // passed to the broker. The private header is embedded before each exact build.
  public sealed class Pin {
    public string CanonicalPath, VolumeAnchor, FileIdHex;
    public byte[] VolumeGuid, FileId; public ulong Serial; public long Length;
  }
  public sealed class Witness : IDisposable {
    internal SafeFileHandle Handle;
    public readonly Pin Original; public readonly bool Directory;
    internal Witness(SafeFileHandle h,bool directory) {Handle=h;Directory=directory;try{Original=Native.ReadPin(h,directory);}catch{h.Dispose();throw;}}
    public Pin Fresh(){var p=Native.ReadPin(Handle,Directory);if(!Native.Same(p,Original))throw new IOException("original held physical pin changed");return p;}
    public byte[] Bytes(){Fresh();return Native.ReadBytes(Handle);}
    public string Sha256(){return Native.Hex(Native.Hash(Bytes()));}
    public void Dispose(){Handle.Dispose();}
  }
  public sealed class Chain {
    public readonly List<Witness> Held=new List<Witness>();
    public Witness Leaf {get{return Held[Held.Count-1];}}
    public string[] Components {get{return Leaf.Original.CanonicalPath.Substring(49).Split(new[]{'\\'},StringSplitOptions.RemoveEmptyEntries);}}
  }
  public sealed class JournalFrame {
    public ulong Sequence,Epoch; public ushort Type;public string FileId,Hash,Previous,Scope,Genesis,Owner,Key,Payload;
  }
  public sealed class CompilerPaths {public string Header,Output;}
  public sealed class LaunchPaths {
    public readonly string Executable,WorkingDirectory;
    internal readonly Witness Image,Fixture;internal readonly string ImageHash;
    internal LaunchPaths(string executable,string workingDirectory,Witness image,Witness fixture){Executable=executable;WorkingDirectory=workingDirectory;Image=image;Fixture=fixture;ImageHash=image.Sha256();}
  }
  internal static class Native {
    internal const uint ReadAttributes=0x80, Sync=0x100000;
    [StructLayout(LayoutKind.Sequential)] struct UnicodeString {public ushort Length,MaximumLength;public IntPtr Buffer;}
    [StructLayout(LayoutKind.Sequential)] struct ObjectAttributes {public uint Length;public IntPtr Root,Name;public uint Attributes;public IntPtr Security,Qos;}
    [StructLayout(LayoutKind.Sequential)] struct IoStatus {public IntPtr Status,Information;}
    [DllImport("ntdll.dll")] static extern int NtCreateFile(out IntPtr handle,uint access,ref ObjectAttributes attributes,out IoStatus io,IntPtr allocation,uint fileAttributes,uint share,uint disposition,uint options,IntPtr ea,uint eaLength);
    [DllImport("ntdll.dll")] static extern uint RtlNtStatusToDosError(int status);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] internal static extern SafeFileHandle CreateFileW(string path,uint access,uint share,IntPtr security,uint creation,uint flags,IntPtr template);
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetFileInformationByHandleEx(SafeFileHandle handle,int kind,IntPtr buffer,uint size);
    [DllImport("kernel32.dll",SetLastError=true)] static extern uint GetFileType(SafeFileHandle handle);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern uint GetFinalPathNameByHandleW(SafeFileHandle handle,StringBuilder path,uint length,uint flags);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool GetVolumeInformationByHandleW(SafeFileHandle handle,IntPtr volume,uint volumeLength,IntPtr serial,IntPtr maximum,IntPtr flags,StringBuilder fs,uint fsLength);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool GetVolumeNameForVolumeMountPointW(string fixedLocator,StringBuilder volume,uint length);
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetHandleInformation(SafeFileHandle handle,uint mask,uint flags);
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool ReadFile(SafeFileHandle handle,byte[] bytes,uint wanted,out uint read,IntPtr overlap);
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool WriteFile(SafeFileHandle handle,byte[] bytes,uint wanted,out uint written,IntPtr overlap);
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool FlushFileBuffers(SafeFileHandle handle);
    [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetFilePointerEx(SafeFileHandle handle,long offset,out long position,uint method);
    [DllImport("kernel32.dll")] internal static extern IntPtr GetCurrentProcess();
    [DllImport("kernel32.dll",SetLastError=true)] internal static extern bool DuplicateHandle(IntPtr sourceProcess,IntPtr source,IntPtr destination,out SafeWaitHandle result,uint access,bool inherit,uint options);
    [DllImport("kernel32.dll",SetLastError=true)] internal static extern uint WaitForSingleObject(SafeWaitHandle process,uint timeout);
    [DllImport("kernel32.dll",SetLastError=true)] internal static extern bool GetProcessTimes(SafeWaitHandle process,out long birth,out long exit,out long kernel,out long user);
    [DllImport("kernel32.dll",SetLastError=true)] internal static extern bool GetExitCodeProcess(SafeWaitHandle process,out uint code);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] internal static extern bool QueryFullProcessImageNameW(SafeWaitHandle process,uint flags,StringBuilder image,ref uint length);
    [DllImport("advapi32.dll",SetLastError=true)] static extern bool OpenProcessToken(SafeWaitHandle process,uint access,out SafeWaitHandle token);
    [DllImport("advapi32.dll",SetLastError=true)] static extern bool GetTokenInformation(SafeWaitHandle token,int kind,IntPtr buffer,uint length,out uint returned);
    [DllImport("advapi32.dll",SetLastError=true)] static extern bool IsValidSid(IntPtr sid);
    [DllImport("advapi32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool ConvertSidToStringSidW(IntPtr sid,out IntPtr text);
    [DllImport("kernel32.dll")] static extern IntPtr LocalFree(IntPtr memory);
    static void Check(bool ok,string operation){if(!ok)throw new Win32Exception(Marshal.GetLastWin32Error(),operation);}
    static IntPtr Query(SafeFileHandle h,int kind,int size){IntPtr b=Marshal.AllocHGlobal(size);if(!GetFileInformationByHandleEx(h,kind,b,(uint)size)){int e=Marshal.GetLastWin32Error();Marshal.FreeHGlobal(b);throw new Win32Exception(e,"required file query");}return b;}
    internal static string Hex(byte[] b){return BitConverter.ToString(b).Replace("-","").ToLowerInvariant();}
    internal static byte[] Hash(byte[] b){using(var sha=SHA256.Create())return sha.ComputeHash(b);}
    internal static bool Same(Pin a,Pin b){return a.Serial==b.Serial&&a.FileIdHex==b.FileIdHex&&String.Equals(a.CanonicalPath,b.CanonicalPath,StringComparison.OrdinalIgnoreCase)&&a.VolumeGuid.SequenceEqual(b.VolumeGuid);}
    static IOException StandardRefusal(SafeFileHandle h,string reason,bool expectedDirectory,long length,uint links,byte deletePending,byte actualDirectory){
      // Diagnostic only: this path never selects or authorizes an object.
      var path=new StringBuilder(32761);uint n=GetFinalPathNameByHandleW(h,path,32761,1);
      string heldPath=n>0&&n<32761?path.ToString():"<held path query failed: "+Marshal.GetLastWin32Error()+">";
      return new IOException(reason+"; expectedDirectory="+expectedDirectory+"; endOfFile="+length+"; links="+links+"; deletePending="+deletePending+"; actualDirectory="+actualDirectory+"; heldCanonicalPath="+heldPath);
    }
    internal static Pin ReadPin(SafeFileHandle h,bool directory){
      if(h.IsClosed||h.IsInvalid||GetFileType(h)!=1)throw new IOException("held local disk required");
      IntPtr b=Query(h,9,8);try{uint a=unchecked((uint)Marshal.ReadInt32(b));if((a&0x00441400)!=0||((a&16)!=0)!=directory)throw new IOException("reparse/offline/recall/type refused");}finally{Marshal.FreeHGlobal(b);}
      // FILE_STANDARD_INFO from the pinned SDK: size 24, EndOfFile+8,
      // NumberOfLinks+16, BOOLEAN DeletePending+20 and Directory+21.
      long length;uint links;byte deletePending,actualDirectory;
      b=Query(h,1,24);try{length=Marshal.ReadInt64(b,8);links=unchecked((uint)Marshal.ReadInt32(b,16));deletePending=Marshal.ReadByte(b,20);actualDirectory=Marshal.ReadByte(b,21);}finally{Marshal.FreeHGlobal(b);}
      if(length<0)throw StandardRefusal(h,"negative_length_refused",directory,length,links,deletePending,actualDirectory);
      if(deletePending!=0)throw StandardRefusal(h,"delete_pending_refused",directory,length,links,deletePending,actualDirectory);
      if((actualDirectory!=0)!=directory)throw StandardRefusal(h,"standard_directory_type_refused",directory,length,links,deletePending,actualDirectory);
      if(!directory&&links!=1)throw StandardRefusal(h,"regular_file_single_link_refused",directory,length,links,deletePending,actualDirectory);
      if(directory){b=Query(h,23,4);try{if((Marshal.ReadInt32(b)&1)!=0)throw new IOException("case-sensitive directory refused");}finally{Marshal.FreeHGlobal(b);}}
      var fs=new StringBuilder(32);Check(GetVolumeInformationByHandleW(h,IntPtr.Zero,0,IntPtr.Zero,IntPtr.Zero,IntPtr.Zero,fs,32),"filesystem query");if(fs.ToString()!="NTFS")throw new IOException("NTFS required");
      ulong serial;byte[] fileId=new byte[16];b=Query(h,18,24);try{serial=unchecked((ulong)Marshal.ReadInt64(b));Marshal.Copy(IntPtr.Add(b,8),fileId,0,16);}finally{Marshal.FreeHGlobal(b);}
      var path=new StringBuilder(32761);uint n=GetFinalPathNameByHandleW(h,path,32761,1);if(n==0||n>=32761)throw new Win32Exception(Marshal.GetLastWin32Error(),"canonical volume query");string canonical=path.ToString();Guid guid;
      if(canonical.Length<49||!canonical.StartsWith(@"\\?\Volume{",StringComparison.Ordinal)||canonical[47]!='}'||canonical[48]!='\\'||!Guid.TryParse(canonical.Substring(10,38),out guid)||fileId.All(x=>x==0))throw new IOException("canonical physical pin refused");
      return new Pin{CanonicalPath=canonical,VolumeAnchor=canonical.Substring(0,49),VolumeGuid=guid.ToByteArray(),Serial=serial,FileId=fileId,FileIdHex=Hex(fileId),Length=length};
    }
    internal static SafeFileHandle Relative(Witness parent,string name,bool directory,uint disposition,bool write,bool stable,bool metadataOnly){
      parent.Fresh();if(String.IsNullOrEmpty(name)||name=="."||name==".."||name.Length>255||name.IndexOfAny(new[]{'\\','/',':','\0'})>=0)throw new IOException("single component required");
      IntPtr chars=Marshal.StringToHGlobalUni(name),us=IntPtr.Zero;try{var unicode=new UnicodeString{Length=(ushort)(name.Length*2),MaximumLength=(ushort)(name.Length*2),Buffer=chars};us=Marshal.AllocHGlobal(Marshal.SizeOf(typeof(UnicodeString)));Marshal.StructureToPtr(unicode,us,false);var oa=new ObjectAttributes{Length=(uint)Marshal.SizeOf(typeof(ObjectAttributes)),Root=parent.Handle.DangerousGetHandle(),Name=us,Attributes=0x40};
        uint access=ReadAttributes|Sync|(metadataOnly?0u:1u)|(write?(directory?6u:2u):0u);uint share=metadataOnly?7u:(directory?3u:(stable||write?1u:3u));IoStatus io;IntPtr raw;int status=NtCreateFile(out raw,access,ref oa,out io,IntPtr.Zero,0x80,share,disposition,0x00200020u|(directory?1u:0x40u),IntPtr.Zero,0);
        if(status<0)throw new Win32Exception((int)RtlNtStatusToDosError(status),"relative no-follow disposition="+disposition+"; no retry");var h=new SafeFileHandle(raw,true);try{Check(SetHandleInformation(h,1,0),"clear inheritance");ReadPin(h,directory);return h;}catch{h.Dispose();throw;}
      }finally{if(us!=IntPtr.Zero)Marshal.FreeHGlobal(us);Marshal.FreeHGlobal(chars);}
    }
    internal static Chain OpenFixedChain(string fixedLocator){
      string absolute=Path.GetFullPath(fixedLocator).TrimEnd('\\');if(absolute.Length<3||absolute[1]!=':'||absolute[2]!='\\'||absolute.StartsWith(@"\\"))throw new IOException("fixed local enrollment locator required");
      var volume=new StringBuilder(64);Check(GetVolumeNameForVolumeMountPointW(absolute.Substring(0,3),volume,64),"fixed volume locator");var anchor=CreateFileW(volume.ToString(),1|ReadAttributes|Sync,3,IntPtr.Zero,3,0x02200000,IntPtr.Zero);if(anchor.IsInvalid)throw new Win32Exception(Marshal.GetLastWin32Error());Check(SetHandleInformation(anchor,1,0),"anchor inheritance");
      var chain=new Chain();try{chain.Held.Add(new Witness(anchor,true));if(chain.Leaf.Original.CanonicalPath!=chain.Leaf.Original.VolumeAnchor)throw new IOException("directory volume anchor required");foreach(string part in absolute.Substring(3).Split(new[]{'\\'},StringSplitOptions.RemoveEmptyEntries))chain.Held.Add(new Witness(Relative(chain.Leaf,part,true,1,false,false,false),true));return chain;}
      catch{foreach(var w in chain.Held.AsEnumerable().Reverse())w.Dispose();throw;}
    }
    internal static Witness OpenFile(Witness parent,string name,bool stable,bool metadataOnly){return new Witness(Relative(parent,name,false,1,false,stable,metadataOnly),false);}
    internal static byte[] ReadBytes(SafeFileHandle h){var p=ReadPin(h,false);if(p.Length>134217728)throw new IOException("bounded file required");long position;Check(SetFilePointerEx(h,0,out position,0),"read seek");byte[] bytes=new byte[(int)p.Length];uint got;Check(ReadFile(h,bytes,(uint)bytes.Length,out got,IntPtr.Zero),"read exact");if(got!=bytes.Length)throw new IOException("short read");return bytes;}
    internal static Witness NewText(Witness parent,string name,string text){byte[] bytes=new UTF8Encoding(false,true).GetBytes(text);Pin original;using(var h=Relative(parent,name,false,2,true,false,false)){original=ReadPin(h,false);if(original.Length!=0)throw new IOException("original FILE_CREATE not empty");uint n;Check(WriteFile(h,bytes,(uint)bytes.Length,out n,IntPtr.Zero),"single new-file write");if(n!=bytes.Length)throw new IOException("short write UNKNOWN; no replay");Check(FlushFileBuffers(h),"new-file flush");if(!Same(ReadPin(h,false),original)||!ReadBytes(h).SequenceEqual(bytes))throw new IOException("new-file readback UNKNOWN");}var witness=OpenFile(parent,name,true,false);if(!Same(witness.Original,original)){witness.Dispose();throw new IOException("original created ID changed");}return witness;}
    internal static Witness NewDirectory(Witness parent,string name){return new Witness(Relative(parent,name,true,2,true,false,false),true);}
    internal static Witness EnsureScratchContainer(Witness parent,string name){return new Witness(Relative(parent,name,true,3,true,false,false),true);}
    internal static string ProcessImage(SafeWaitHandle process){var image=new StringBuilder(32761);uint n=32761;Check(QueryFullProcessImageNameW(process,0,image,ref n),"original process image");if(n==0)throw new IOException("empty process image");return image.ToString();}
    internal static ulong Birth(SafeWaitHandle process){long birth,exit,kernel,user;Check(GetProcessTimes(process,out birth,out exit,out kernel,out user),"original process birth");return unchecked((ulong)birth);}
    internal static string Sid(SafeWaitHandle process){SafeWaitHandle token;Check(OpenProcessToken(process,8,out token),"original process token");using(token){uint length;GetTokenInformation(token,1,IntPtr.Zero,0,out length);if(Marshal.GetLastWin32Error()!=122||length<16||length>65536)throw new IOException("token user size refused");IntPtr b=Marshal.AllocHGlobal((int)length);try{Check(GetTokenInformation(token,1,b,length,out length),"token user");IntPtr sid=Marshal.ReadIntPtr(b);if(!IsValidSid(sid))throw new IOException("invalid SID");IntPtr text;Check(ConvertSidToStringSidW(sid,out text),"SID format");try{return Marshal.PtrToStringUni(text);}finally{LocalFree(text);}}finally{Marshal.FreeHGlobal(b);}}}
    internal static string[] Inventory(Witness directory){directory.Fresh();var names=new List<string>();IntPtr b=Marshal.AllocHGlobal(65536);bool first=true;try{for(;;){if(!GetFileInformationByHandleEx(directory.Handle,first?11:10,b,65536)){int e=Marshal.GetLastWin32Error();if(e==18)break;throw new Win32Exception(e,"bounded inventory");}first=false;int offset=0;for(;;){if(offset<0||offset>65432)throw new IOException("inventory offset");int next=Marshal.ReadInt32(b,offset),length=Marshal.ReadInt32(b,offset+60);if(length<0||length%2!=0||length>65536-offset-104)throw new IOException("inventory name");string name=Marshal.PtrToStringUni(IntPtr.Add(b,offset+104),length/2);if(name!="."&&name!=".."){if(names.Count>=256||names.Contains(name))throw new IOException("inventory limit/duplicate");names.Add(name);}if(next==0)break;if(next<104||next>65536-offset)throw new IOException("inventory next");offset+=next;}}}finally{Marshal.FreeHGlobal(b);}names.Sort(StringComparer.Ordinal);return names.ToArray();}
  }
  public sealed class Session : IDisposable {
    readonly List<Witness> owned=new List<Witness>();readonly List<Chain> chains=new List<Chain>();readonly List<Witness> namespaces=new List<Witness>();
    readonly SafeWaitHandle controller;readonly string originalImage;public readonly ulong ControllerBirth;public readonly string UserSid;
    SafeWaitHandle enrollmentCreator;Witness enrollmentImage;string enrollmentImagePath;ulong enrollmentBirth;byte[] enrollmentNonce,enrollmentObservationHash;
    bool creationPinsMatched,ackConsumed,enrollmentExitObserved;
    public ulong EnrollmentCreatorBirth {get{return enrollmentBirth;}}
    public string EnrollmentNonceHex {get{return enrollmentNonce==null?null:Native.Hex(enrollmentNonce);}}
    public string EnrollmentObservationSha256 {get{return enrollmentObservationHash==null?null:Native.Hex(enrollmentObservationHash);}}
    readonly byte[] installation=Random(16),lineage=Random(16),launch=Random(16),stop=Random(16),actor=Random(16),audit=Random(32);
    public readonly string RunPath,FixturePath;public readonly Chain Repository,Runtime;public readonly Witness Run,Evidence,Node,ControllerImage;
    public Witness Bridge,Marker,InstallationFile,PolicyFile,LockFile,Journal;readonly List<Witness> knownSlots=new List<Witness>();
    Witness enrollmentHeader,finalHeader,enrollmentOutput,finalOutput,enrollmentExecutable,finalExecutable;
    LaunchPaths enrollmentLaunch,finalLaunch;
    public bool LastBuildOutputComplete {get;private set;}
    static byte[] Random(int n){byte[] b=new byte[n];using(var rng=RandomNumberGenerator.Create())rng.GetBytes(b);if(b.All(x=>x==0))throw new IOException("empty RNG");return b;}
    Witness Own(Witness w){owned.Add(w);return w;} Chain OwnChain(string path){var c=Native.OpenFixedChain(path);chains.Add(c);return c;}
    public Session(string fixedRepository,string fixedNode){
      SafeWaitHandle captured;var self=Native.GetCurrentProcess();if(!Native.DuplicateHandle(self,self,self,out captured,0x101000,false,0))throw new Win32Exception(Marshal.GetLastWin32Error(),"held original controller duplicate");controller=captured;ControllerBirth=Native.Birth(controller);UserSid=Native.Sid(controller);originalImage=Native.ProcessImage(controller);
      // Reject incompatible original read-only captures before any FILE_CREATE
      // or FILE_OPEN_IF. Existing UNKNOWN namespaces are never reopened here.
      var repo=OwnChain(fixedRepository);
      var nodeParent=OwnChain(Path.GetDirectoryName(fixedNode));Node=Own(Native.OpenFile(nodeParent.Leaf,Path.GetFileName(fixedNode),true,false));var controllerParent=OwnChain(Path.GetDirectoryName(originalImage));ControllerImage=Own(Native.OpenFile(controllerParent.Leaf,Path.GetFileName(originalImage),true,false));
      if(!repo.Leaf.Original.VolumeGuid.SequenceEqual(Node.Original.VolumeGuid)||!repo.Leaf.Original.VolumeGuid.SequenceEqual(ControllerImage.Original.VolumeGuid))throw new IOException("one canonical captured volume required; no fallback");AssertFresh();
      var scratch=Own(Native.EnsureScratchContainer(repo.Leaf,".codex-runtime"));scratch=Own(Native.EnsureScratchContainer(scratch,"local-session-proof"));Run=Own(Native.NewDirectory(scratch,"installed-launch-eof-"+Guid.NewGuid().ToString("N")));RunPath=Run.Original.CanonicalPath;
      var fixture=Own(Native.NewDirectory(Run,"fixture"));FixturePath=fixture.Original.CanonicalPath;Own(Native.NewDirectory(fixture,"mcp-server"));Own(Native.NewDirectory(fixture,"initial-local"));Evidence=Own(Native.NewDirectory(Run,"evidence"));
      foreach(string name in new[]{"initial","daemon","panel","plan","fixtures","retained"})namespaces.Add(Own(Native.NewDirectory(fixture,name)));
      Repository=OwnChain(FixturePath.Replace(Run.Original.VolumeAnchor,Path.GetPathRoot(fixedRepository)));Runtime=OwnChain(Repository.Leaf.Original.CanonicalPath.Replace(Run.Original.VolumeAnchor,Path.GetPathRoot(fixedRepository))+"\\initial-local");
      if(!Repository.Leaf.Original.VolumeGuid.SequenceEqual(Node.Original.VolumeGuid)||!Repository.Leaf.Original.VolumeGuid.SequenceEqual(ControllerImage.Original.VolumeGuid))throw new IOException("one canonical captured volume required; no fallback");AssertFresh();
    }
    public void CreateSyntheticSource(string source){if(Bridge!=null||Marker!=null)throw new IOException("source already created; no replay");var parent=Own(new Witness(Native.Relative(Repository.Leaf,"mcp-server",true,1,false,false,false),true));Bridge=Own(Native.NewText(parent,"bridge-daemon.js",source));Marker=Own(Native.NewText(Repository.Leaf,"synthetic-fixture.scope","launch_eof"));}
    public void AssertFresh(){if(Native.WaitForSingleObject(controller,0)!=258||Native.Birth(controller)!=ControllerBirth||Native.Sid(controller)!=UserSid||Native.ProcessImage(controller)!=originalImage)throw new IOException("original controller lifetime changed");foreach(var chain in chains)foreach(var w in chain.Held)w.Fresh();foreach(var w in owned)w.Fresh();}
    void AssertCreatorHeld(){AssertFresh();if(enrollmentCreator==null||Native.WaitForSingleObject(enrollmentCreator,0)!=258||Native.Birth(enrollmentCreator)!=enrollmentBirth||Native.Sid(enrollmentCreator)!=UserSid||Native.ProcessImage(enrollmentCreator)!=enrollmentImagePath)throw new IOException("original creator no longer held/live");enrollmentImage.Fresh();}
    static void MatchBytes(BinaryReader reader,byte[] expected,string kind){if(!reader.ReadBytes(expected.Length).SequenceEqual(expected))throw new IOException("creator observation "+kind+" mismatch");}
    static void MatchPin(BinaryReader reader,Pin expected){MatchBytes(reader,expected.VolumeGuid,"volume");if(reader.ReadUInt64()!=expected.Serial)throw new IOException("creator observation serial mismatch");MatchBytes(reader,expected.FileId,"original FILE_CREATE ID");}
    byte[] InstallationBytes(){var b=new List<byte>(Encoding.ASCII.GetBytes("OWNLINS2"));Put(b,installation);Put(b,lineage);PutPin(b,Repository.Leaf.Original);PutPin(b,Runtime.Leaf.Original);PutPin(b,LockFile.Original);PutPin(b,Journal.Original);return b.ToArray();}
    void AssertEnrollmentBytes(){if(LockFile.Fresh().Length!=0||Native.Inventory(Journal).Length!=0||!PolicyFile.Bytes().SequenceEqual(PolicyBytes())||!InstallationFile.Bytes().SequenceEqual(InstallationBytes()))throw new IOException("original enrollment bytes/inventory changed");}
    public void CaptureEnrollmentWhileCreatorHeld(Process original,Witness binary,byte[] observation){
      AssertFresh();if(enrollmentCreator!=null||InstallationFile!=null||PolicyFile!=null||LockFile!=null||Journal!=null)throw new IOException("original creation readback already attempted; no replay");
      SafeWaitHandle captured;var self=Native.GetCurrentProcess();if(!Native.DuplicateHandle(self,original.Handle,self,out captured,0x101000,false,0))throw new Win32Exception(Marshal.GetLastWin32Error(),"duplicate original creator HANDLE");enrollmentCreator=captured;enrollmentBirth=Native.Birth(captured);enrollmentImagePath=Native.ProcessImage(captured);
      string imageLocator=enrollmentImagePath.StartsWith(Run.Original.VolumeAnchor,StringComparison.OrdinalIgnoreCase)?Path.GetPathRoot(originalImage)+enrollmentImagePath.Substring(49):enrollmentImagePath;
      var imageParent=OwnChain(Path.GetDirectoryName(imageLocator));enrollmentImage=Own(Native.OpenFile(imageParent.Leaf,Path.GetFileName(imageLocator),true,false));if(!Native.Same(enrollmentImage.Original,binary.Fresh())||enrollmentImage.Sha256()!=binary.Sha256())throw new IOException("original creator source binary mismatch");AssertCreatorHeld();
      if(observation==null||observation.Length!=480)throw new IOException("closed creator observation size");
      var names=Native.Inventory(Runtime.Leaf);if(!names.SequenceEqual(new[]{".initial-owned-fence.lock",".initial-owned-local.installation",".initial-owned-local.policy","journal"}))throw new IOException("partial/foreign enrollment; no reprovision");
      // READ|WRITE sharing permits the still-held original writer. No DELETE
      // sharing prevents replacement. Exact bytes are checked before one ACK;
      // after exact exit the same IDs are also held through stable read opens.
      InstallationFile=Own(Native.OpenFile(Runtime.Leaf,".initial-owned-local.installation",false,false));PolicyFile=Own(Native.OpenFile(Runtime.Leaf,".initial-owned-local.policy",false,false));LockFile=Own(Native.OpenFile(Runtime.Leaf,".initial-owned-fence.lock",false,true));Journal=Own(new Witness(Native.Relative(Runtime.Leaf,"journal",true,1,false,false,false),true));
      AssertEnrollmentBytes();
      using(var reader=new BinaryReader(new MemoryStream(observation),Encoding.UTF8)){
        MatchBytes(reader,Encoding.ASCII.GetBytes("OWNLCR01"),"magic");if(reader.ReadUInt16()!=1||reader.ReadUInt16()!=1||reader.ReadUInt32()!=480)throw new IOException("closed creator observation framing");enrollmentNonce=reader.ReadBytes(16);if(enrollmentNonce.All(x=>x==0)||reader.ReadUInt64()!=enrollmentBirth)throw new IOException("original creator birth/nonce mismatch");
        MatchBytes(reader,installation,"installation");MatchBytes(reader,lineage,"lineage");MatchBytes(reader,Native.Hash(PolicyBytes()),"policy hash");MatchPin(reader,Repository.Leaf.Original);MatchPin(reader,Runtime.Leaf.Original);MatchPin(reader,InstallationFile.Original);MatchPin(reader,PolicyFile.Original);MatchPin(reader,LockFile.Original);MatchPin(reader,Journal.Original);MatchBytes(reader,Native.Hash(InstallationBytes()),"installation bytes");MatchBytes(reader,Native.Hash(PolicyBytes()),"policy bytes");MatchPin(reader,enrollmentImage.Original);MatchBytes(reader,Native.Hash(enrollmentImage.Bytes()),"original creator image hash");if(reader.BaseStream.Position!=480)throw new IOException("creator trailing frame");
      }
      AssertCreatorHeld();AssertEnrollmentBytes();enrollmentObservationHash=Native.Hash(observation);creationPinsMatched=true;
    }
    public byte[] CreateEnrollmentAcknowledgement(){
      if(!creationPinsMatched||ackConsumed||enrollmentExitObserved)throw new IOException("one original creator ACK only");AssertCreatorHeld();AssertEnrollmentBytes();ackConsumed=true;
      var b=new List<byte>(Encoding.ASCII.GetBytes("OWNLCA01"));U16(b,1);U16(b,2);Put(b,BitConverter.GetBytes((uint)80));Put(b,enrollmentNonce);U64(b,enrollmentBirth);Put(b,enrollmentObservationHash);U64(b,0);if(b.Count!=80)throw new IOException("ACK internal size");return b.ToArray();
    }
    public void ConfirmEnrollmentExactExit(){
      AssertFresh();uint code;if(!creationPinsMatched||!ackConsumed||enrollmentExitObserved||Native.WaitForSingleObject(enrollmentCreator,0)!=0||Native.Birth(enrollmentCreator)!=enrollmentBirth||!Native.GetExitCodeProcess(enrollmentCreator,out code)||code!=0)throw new IOException("exact original creator exit not proven");
      var stableInstallation=Own(Native.OpenFile(Runtime.Leaf,".initial-owned-local.installation",true,false));var stablePolicy=Own(Native.OpenFile(Runtime.Leaf,".initial-owned-local.policy",true,false));if(!Native.Same(stableInstallation.Original,InstallationFile.Fresh())||!Native.Same(stablePolicy.Original,PolicyFile.Fresh()))throw new IOException("original created IDs changed at close");InstallationFile=stableInstallation;PolicyFile=stablePolicy;AssertEnrollmentBytes();AssertFresh();enrollmentExitObserved=true;
    }
    static void Put(List<byte> b,byte[] bytes){b.AddRange(bytes);}static void U16(List<byte>b,ushort n){b.Add((byte)n);b.Add((byte)(n>>8));}static void U64(List<byte>b,ulong n){for(int i=0;i<8;++i)b.Add((byte)(n>>(8*i)));}
    static void PutPin(List<byte>b,Pin p){Put(b,p.VolumeGuid);U64(b,p.Serial);Put(b,p.FileId);}
    byte[] PolicyBytes(){var b=new List<byte>(Encoding.ASCII.GetBytes("OWNLPOL2"));U64(b,1);U16(b,0x1f);b.Add(1);U64(b,30000);U64(b,60000);Put(b,audit);Put(b,lineage);Put(b,Encoding.Unicode.GetBytes(UserSid));return b.ToArray();}
    byte[] ScopeBytes(){if(Journal==null||LockFile==null)throw new IOException("original enrollment pins required");var b=new List<byte>();Put(b,installation);PutPin(b,Repository.Leaf.Original);PutPin(b,Runtime.Leaf.Original);PutPin(b,Journal.Original);PutPin(b,LockFile.Original);return b.ToArray();}
    byte[] LaunchKey(){var b=new List<byte>();Put(b,installation);U16(b,(ushort)UserSid.Length);Put(b,Encoding.Unicode.GetBytes(UserSid));U64(b,Runtime.Leaf.Original.Serial);Put(b,Runtime.Leaf.Original.FileId);Put(b,lineage);return Native.Hash(b.ToArray());}
    static string Wide(string s){return "L\""+s.Replace("\\","\\\\").Replace("\"","\\\"")+"\"";}static string Bytes(byte[] b){return "{"+String.Join(",",b.Select(x=>"0x"+x.ToString("x2")))+"}";}static string Parts(IEnumerable<string>parts){return "{"+String.Join(",",parts.Select(Wide))+"}";}
    static string CppPin(Pin p){return p==null?"local_session::ObjectPin{}":"local_session::ObjectPin{"+Bytes(p.VolumeGuid)+","+Bytes(p.FileId)+",0x"+p.Serial.ToString("x16")+"ULL,"+Wide(p.CanonicalPath)+"}";}
    static string CppFile(Witness w,IEnumerable<string>parts){return "local_session::reviewed::File{"+Parts(parts)+","+CppPin(w.Original)+","+Bytes(Native.Hash(w.Bytes()))+"}";}
    public string WriteProfile(bool enrolled){AssertFresh();if(Bridge==null||Marker==null||(enrolled&&(!creationPinsMatched||!ackConsumed||!enrollmentExitObserved||Journal==null||InstallationFile==null)))throw new IOException("profile stage mismatch");string name=enrolled?"profile-final":"profile-enrollment";var directory=Own(Native.NewDirectory(Run,name));var b=new StringBuilder("#pragma once\n// Private generated synthetic profile; no production registration/admission.\nnamespace local_session_reviewed {\ninline const local_session::reviewed::Profile kProfile=[](){\nlocal_session::reviewed::Profile p;\n");
      b.Append("p.canonicalVolumeAnchor="+Wide(Repository.Leaf.Original.VolumeAnchor)+";\np.repositoryComponents="+Parts(Repository.Components)+";\np.runtimeComponents="+Parts(Runtime.Components)+";\np.repositoryAncestors={"+String.Join(",",Repository.Held.Select(w=>CppPin(w.Original)))+"};\np.runtimeAncestors={"+String.Join(",",Runtime.Held.Select(w=>CppPin(w.Original)))+"};\np.repository="+CppPin(Repository.Leaf.Original)+";\np.runtime="+CppPin(Runtime.Leaf.Original)+";\np.userSid="+Wide(UserSid)+";\n");
      b.Append("p.installation="+Bytes(installation)+";p.lineage="+Bytes(lineage)+";p.launchTarget="+Bytes(launch)+";p.stopTarget="+Bytes(stop)+";p.actorTarget="+Bytes(actor)+";\np.authorizationAudit="+Bytes(audit)+";p.policyHash="+Bytes(Native.Hash(PolicyBytes()))+";p.sourceSetHash="+Bytes(Native.Hash(Bridge.Bytes().Concat(Marker.Bytes()).ToArray()))+";\np.policyEpoch=1;p.maximumSessionMs=30000;p.maximumLeaseMs=60000;p.capabilities=0x001f;p.enabled=true;\n");
      b.Append("p.sourceFiles={"+CppFile(Bridge,new[]{"mcp-server","bridge-daemon.js"})+","+CppFile(Marker,new[]{"synthetic-fixture.scope"})+"};\np.node="+CppFile(Node,Node.Original.CanonicalPath.Substring(49).Split('\\'))+";\np.controllerImage="+CppFile(ControllerImage,ControllerImage.Original.CanonicalPath.Substring(49).Split('\\'))+";\np.inventories={"+String.Join(",",namespaces.Select(w=>"local_session::reviewed::Inventory{"+Parts(new[]{Path.GetFileName(w.Original.CanonicalPath)})+",false,"+CppPin(w.Original)+"}"))+"};\n");
      b.Append("p.installationFile="+CppPin(enrolled?InstallationFile.Original:null)+";p.policyFile="+CppPin(enrolled?PolicyFile.Original:null)+";p.lockFile="+CppPin(enrolled?LockFile.Original:null)+";p.journal="+CppPin(enrolled?Journal.Original:null)+";\nreturn p;}();\n}\n");var header=Own(Native.NewText(directory,"local_session_installation_pins.h",b.ToString()));if(enrolled)finalHeader=header;else enrollmentHeader=header;return header.Original.CanonicalPath;
    }
    public string NewOutput(string name){AssertFresh();if(name!="build-enrollment"&&name!="build-final")throw new IOException("fixed output branch required");var output=Own(Native.NewDirectory(Run,name));if(name=="build-enrollment")enrollmentOutput=output;else finalOutput=output;return output.Original.CanonicalPath;}
    string HeldOrdinaryLocator(Witness original){
      AssertFresh();var pin=original.Fresh();if(!pin.VolumeGuid.SequenceEqual(Run.Original.VolumeGuid)||pin.Serial!=Run.Original.Serial||!pin.CanonicalPath.StartsWith(Run.Original.VolumeAnchor,StringComparison.OrdinalIgnoreCase))throw new IOException("ordinary locator outside held original volume");
      string ordinary=Path.GetPathRoot(originalImage)+pin.CanonicalPath.Substring(49);
      var chain=OwnChain(original.Directory?ordinary:Path.GetDirectoryName(ordinary));var alias=original.Directory?chain.Leaf:Own(Native.OpenFile(chain.Leaf,Path.GetFileName(ordinary),true,false));
      if(!Native.Same(alias.Fresh(),pin)||(!original.Directory&&!alias.Bytes().SequenceEqual(original.Bytes())))throw new IOException("ordinary locator does not name original held object/bytes");AssertFresh();return ordinary;
    }
    public CompilerPaths PrepareCompilerPaths(string header,string output){
      AssertFresh();Witness heldHeader,heldOutput;
      if(enrollmentHeader!=null&&enrollmentOutput!=null&&header==enrollmentHeader.Original.CanonicalPath&&output==enrollmentOutput.Original.CanonicalPath){heldHeader=enrollmentHeader;heldOutput=enrollmentOutput;}
      else if(finalHeader!=null&&finalOutput!=null&&header==finalHeader.Original.CanonicalPath&&output==finalOutput.Original.CanonicalPath){heldHeader=finalHeader;heldOutput=finalOutput;}
      else throw new IOException("closed original build stage required; no caller path selector");
      // Only compiler arguments use this verified locator. Embedded runtime pins
      // retain their canonical volume paths; no header is copied or regenerated.
      return new CompilerPaths{Header=HeldOrdinaryLocator(heldHeader),Output=HeldOrdinaryLocator(heldOutput)};
    }
    public Witness WriteBuildOutput(string output,string text){
      AssertFresh();string name;if(enrollmentOutput!=null&&output==enrollmentOutput.Original.CanonicalPath)name="msbuild-enrollment.log";else if(finalOutput!=null&&output==finalOutput.Original.CanonicalPath)name="msbuild-final.log";else throw new IOException("closed build log stage required");
      LastBuildOutputComplete=Encoding.UTF8.GetByteCount(text)<=1048576;
      if(!LastBuildOutputComplete){int count=Math.Min(text.Length,262000);if(count>0&&Char.IsHighSurrogate(text[count-1]))--count;text=text.Substring(0,count)+"\nFULL_OUTPUT_LIMIT_EXCEEDED: incomplete evidence; baseline remains UNKNOWN.\n";}
      return Own(Native.NewText(Evidence,name,text));
    }
    public Witness HoldBuiltExecutable(string output){
      AssertFresh();Witness heldOutput;bool enrolled;
      if(enrollmentOutput!=null&&output==enrollmentOutput.Original.CanonicalPath&&enrollmentExecutable==null){heldOutput=enrollmentOutput;enrolled=false;}
      else if(finalOutput!=null&&output==finalOutput.Original.CanonicalPath&&finalExecutable==null){heldOutput=finalOutput;enrolled=true;}
      else throw new IOException("closed original executable stage required; no caller path selector/reopen");
      var build=OwnChain(HeldOrdinaryLocator(heldOutput)+"\\bin");var executable=Own(Native.OpenFile(build.Leaf,"LocalSessionBroker.exe",true,false));
      if(enrolled)finalExecutable=executable;else enrollmentExecutable=executable;AssertFresh();return executable;
    }
    public LaunchPaths PrepareOriginalLaunch(Witness executable,string verb){
      AssertFresh();bool enrolled;
      if(verb=="--enroll-fixed"&&enrollmentExecutable!=null&&Object.ReferenceEquals(executable,enrollmentExecutable)&&enrollmentLaunch==null)enrolled=false;
      else if(verb=="--broker"&&finalExecutable!=null&&Object.ReferenceEquals(executable,finalExecutable)&&finalLaunch==null)enrolled=true;
      else throw new IOException("one closed original child stage required; no caller executable/working-directory selector");
      // Ordinary locators are only Process.Start compatibility arguments. Both
      // resolve to exact held physical witnesses; profile authority stays canonical.
      var paths=new LaunchPaths(HeldOrdinaryLocator(executable),HeldOrdinaryLocator(Repository.Leaf),executable,Repository.Leaf);
      if(enrolled)finalLaunch=paths;else enrollmentLaunch=paths;AssertOriginalLaunch(paths,executable,verb);return paths;
    }
    public void AssertOriginalLaunch(LaunchPaths paths,Witness executable,string verb){
      AssertFresh();bool exact=verb=="--enroll-fixed"&&Object.ReferenceEquals(paths,enrollmentLaunch)&&Object.ReferenceEquals(executable,enrollmentExecutable);
      exact=exact||(verb=="--broker"&&Object.ReferenceEquals(paths,finalLaunch)&&Object.ReferenceEquals(executable,finalExecutable));
      if(paths==null||!exact||!Object.ReferenceEquals(paths.Image,executable)||!Object.ReferenceEquals(paths.Fixture,Repository.Leaf))throw new IOException("original launch binding drift");
      // Resolve and hold each current ordinary alias again at the final precreate
      // guard. No filesystem HANDLE is passed to Process.Start or its child.
      if(paths.Executable!=HeldOrdinaryLocator(executable)||paths.WorkingDirectory!=HeldOrdinaryLocator(Repository.Leaf)||paths.ImageHash!=executable.Sha256())throw new IOException("original launch locator/held bytes drift");AssertFresh();
    }
    public void WriteEvidence(string name,string text){if(name!="receipt.json"&&name!="failure.json"&&name!="enrollment.json")throw new IOException("fixed evidence selector required");Own(Native.NewText(Evidence,name,text));}
    public JournalFrame[] VerifyJournal(int expectedCount){AssertFresh();if(expectedCount!=2&&expectedCount!=3)throw new IOException("closed journal proof stage");var names=Native.Inventory(Journal);if(names.Length!=expectedCount)throw new IOException("journal count drift");var frames=new List<JournalFrame>();string previous=new string('0',64),genesis=null,owner=null;string expectedScope=Native.Hex(Native.Hash(ScopeBytes()));for(int index=0;index<expectedCount;++index){ulong sequence=(ulong)index+1;string name=sequence.ToString("D20")+".rec";if(names[index]!=name)throw new IOException("journal inventory gap");var file=Own(Native.OpenFile(Journal,name,true,false));byte[] bytes=file.Bytes();if(bytes.Length<228||bytes.Length>16384)throw new IOException("frame size");string hash=Native.Hex(Native.Hash(bytes.Take(bytes.Length-32).ToArray()));using(var reader=new BinaryReader(new MemoryStream(bytes),Encoding.UTF8)){if(!reader.ReadBytes(8).SequenceEqual(Encoding.ASCII.GetBytes("OWNJRN01"))||reader.ReadUInt16()!=1)throw new IOException("frame version");ushort type=reader.ReadUInt16();if(reader.ReadUInt32()!=bytes.Length)throw new IOException("frame declared length");string scope=Native.Hex(reader.ReadBytes(32)),frameLineage=Native.Hex(reader.ReadBytes(16)),frameGenesis=Native.Hex(reader.ReadBytes(32));ulong seq=reader.ReadUInt64(),epoch=reader.ReadUInt64();string frameOwner=Native.Hex(reader.ReadBytes(16)),prior=Native.Hex(reader.ReadBytes(32)),key=Native.Hex(reader.ReadBytes(32));uint length=reader.ReadUInt32();if(length>4096||reader.BaseStream.Position+length+32!=bytes.Length)throw new IOException("payload length");byte[] payload=reader.ReadBytes((int)length);if(Native.Hex(reader.ReadBytes(32))!=hash||scope!=expectedScope||frameLineage!=Native.Hex(lineage)||seq!=sequence||prior!=previous)throw new IOException("frame physical/hash/chain/scope binding");
          if(index==0){var expected=new List<byte>(ScopeBytes());Put(expected,launch);U16(expected,2);U16(expected,2);Put(expected,actor);U16(expected,3);Put(expected,stop);var keyBytes=new List<byte>();U16(keyBytes,1);Put(keyBytes,Native.Hash(ScopeBytes()));if(type!=1||epoch!=0||frameOwner!=new string('0',32)||frameGenesis!=new string('0',64)||!payload.SequenceEqual(expected)||key!=Native.Hex(Native.Hash(keyBytes.ToArray())))throw new IOException("genesis semantics");genesis=hash;}
          else if(index==1){var keyBytes=new List<byte>();U16(keyBytes,2);Put(keyBytes,Native.Hash(ScopeBytes()));Put(keyBytes,lineage);U64(keyBytes,0);Put(keyBytes,payload);if(type!=2||epoch!=1||frameOwner==new string('0',32)||frameGenesis!=genesis||Native.Hex(payload)!=frameOwner||key!=Native.Hex(Native.Hash(keyBytes.ToArray())))throw new IOException("acquisition owner semantics");owner=frameOwner;}
          else{var expected=new List<byte>();U16(expected,1);Put(expected,launch);if(type!=3||epoch!=1||frameOwner!=owner||frameGenesis!=genesis||!payload.SequenceEqual(expected)||key!=Native.Hex(LaunchKey()))throw new IOException("launch consumption semantics");}
          var known=knownSlots.FirstOrDefault(w=>w.Original.CanonicalPath==file.Original.CanonicalPath);if(known!=null&&known.Original.FileIdHex!=file.Original.FileIdHex)throw new IOException("original journal slot replaced");if(known==null)knownSlots.Add(file);frames.Add(new JournalFrame{Sequence=seq,Epoch=epoch,Type=type,FileId=file.Original.FileIdHex,Hash=hash,Previous=prior,Scope=scope,Genesis=frameGenesis,Owner=frameOwner,Key=key,Payload=Native.Hex(payload)});previous=hash;
        }}AssertFresh();return frames.ToArray();
    }
    public void Dispose(){foreach(var w in owned.AsEnumerable().Reverse())w.Dispose();foreach(var c in chains.AsEnumerable().Reverse())foreach(var w in c.Held.AsEnumerable().Reverse())w.Dispose();if(enrollmentCreator!=null)enrollmentCreator.Dispose();controller.Dispose();}
  }
}
'@
    if('LocalSessionSyntheticCapture.Session'-as [type]){throw 'Capture type уже загружен: новый controller/run обязателен, повтор UNKNOWN запрещён.'}
    Add-Type -TypeDefinition $captureSource -Language CSharp
    $baseline=$null;$originalEnrollment=$null;$originalBroker=$null;$brokerErrors=$null;$brokerOutput=$null;$line=$null;$channel=$null;$knownExit=$false;$script:LocalSessionBaselinePendingChild=$null
    $audit=[ordered]@{schema='ae-agent.local-session.synthetic-baseline.v1';scope='isolated_installed_private_seams';scenario='launch_eof';productionAuthority=$false;productionReady=$false;genuineChatIdentity=$false;executionAdmission=$false;sourcePins=$sourcePins;status='UNKNOWN';stage='capture';replayAllowed=$false}
    function Assert-BaselineSources {
        foreach($pin in $sourcePins){if((Get-FileHash -LiteralPath (Join-Path $repoRoot $pin.name) -Algorithm SHA256).Hash.ToLowerInvariant()-ne $pin.sha256){throw "Source freeze drift: $($pin.name)"}}
        $baseline.AssertFresh()
    }
    function Invoke-BaselineBuild([string]$header,[string]$output){
        Assert-BaselineSources
        $project=Join-Path $repoRoot 'native/owned-runtime-local-session/LocalSessionBroker.vcxproj'
        $compilerPaths=$baseline.PrepareCompilerPaths($header,$output)
        $buildLines=@(& $fixedMsBuild $project /nologo /m:1 /p:Configuration=Release /p:Platform=x64 /p:LocalSessionInstalledSeamsReviewed=true "/p:LocalSessionPinsDir=$([System.IO.Path]::GetDirectoryName($compilerPaths.Header))" "/p:LocalSessionOutputDir=$($compilerPaths.Output)" 2>&1)
        $buildCode=$LASTEXITCODE
        $buildText=[string]::Join([Environment]::NewLine,@($buildLines|ForEach-Object{[string]$_}))+[Environment]::NewLine
        $buildLog=$baseline.WriteBuildOutput($output,$buildText)
        $audit[([System.IO.Path]::GetFileName($output)+'Result')]=[ordered]@{exitCode=$buildCode;header=$header;profileSha256=(Get-FileHash -LiteralPath $header -Algorithm SHA256).Hash.ToLowerInvariant();compilerHeader=$compilerPaths.Header;compilerOutput=$compilerPaths.Output;output=$output;fullOutputPath=$buildLog.Original.CanonicalPath;fullOutputSha256=$buildLog.Sha256();fullOutputComplete=$baseline.LastBuildOutputComplete;lastLines=@($buildLines|Select-Object -Last 16|ForEach-Object{[string]$_})}
        if(-not $baseline.LastBuildOutputComplete){throw 'MSBuild full output exceeded 1 MiB evidence bound; UNKNOWN, no retry.'}
        if($buildCode-ne 0){throw "Native build failed $buildCode; no retry."}
        Assert-BaselineSources
        return $baseline.HoldBuiltExecutable($output)
    }
    function Start-OriginalBaselineChild($executable,[string]$verb){
        if($verb-ne '--enroll-fixed'-and $verb-ne '--broker'){throw 'Closed original child branch'}
        Assert-BaselineSources
        $launchPaths=$baseline.PrepareOriginalLaunch($executable,$verb)
        $start=New-Object System.Diagnostics.ProcessStartInfo
        $start.FileName=$launchPaths.Executable;$start.Arguments=$verb;$start.WorkingDirectory=$launchPaths.WorkingDirectory;$start.UseShellExecute=$false;$start.CreateNoWindow=$true;$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
        $start.RedirectStandardInput=($verb-eq '--enroll-fixed')
        if($start.RedirectStandardInput-and $start.GetType().GetProperty('StandardInputEncoding')){$start.StandardInputEncoding=New-Object System.Text.UTF8Encoding $false}
        $child=New-Object System.Diagnostics.Process;$child.StartInfo=$start
        $script:LocalSessionBaselinePendingChild=$child
        $launchAuditName=if($verb-eq '--enroll-fixed'){'originalEnrollmentLaunch'}else{'originalBrokerLaunch'}
        $audit[$launchAuditName]=[ordered]@{executable=$launchPaths.Executable;workingDirectory=$launchPaths.WorkingDirectory;canonicalExecutable=$executable.Original.CanonicalPath;canonicalWorkingDirectory=$baseline.Repository.Leaf.Original.CanonicalPath;fileId=$executable.Original.FileIdHex;sha256=$executable.Sha256();runtimeAuthority='canonical_private_profile'}
        Assert-BaselineSources;$baseline.AssertOriginalLaunch($launchPaths,$executable,$verb)
        if(-not $child.Start()){throw 'Original child creation failed; no retry.'}
        [void]$child.Handle # Retain original returned process HANDLE, no PID reopen.
        if($start.RedirectStandardInput-and $child.StandardInput.Encoding.GetPreamble().Length-ne 0){throw 'Original binary ACK channel has an encoding preamble; UNKNOWN, no retry.'}
        return $child
    }
    function Read-OriginalCreationObservation([System.IO.Stream]$stream){
        $bytes=New-Object byte[] 480;$offset=0;$watch=[System.Diagnostics.Stopwatch]::StartNew()
        while($offset-lt $bytes.Length){
            $remaining=10000-[int]$watch.ElapsedMilliseconds;if($remaining-le 0){throw 'Original creator observation timeout UNKNOWN; no replay.'}
            $read=$stream.ReadAsync($bytes,$offset,$bytes.Length-$offset)
            if(-not $read.Wait($remaining)-or $read.Result-le 0){throw 'Original creator observation EOF/UNKNOWN; no replay.'}
            $offset+=$read.Result
        }
        return ,$bytes
    }
    try{
        $baseline=New-Object -TypeName 'LocalSessionSyntheticCapture.Session' -ArgumentList @($repoRoot,$fixedNode)
        $audit.runPath=$baseline.RunPath;$audit.fixtureRoot=$baseline.FixturePath;$audit.originalController=[ordered]@{birth=$baseline.ControllerBirth;userSid=$baseline.UserSid;heldThroughout=$true}
        $mockSource=@'
"use strict";
// Fixed isolated synthetic daemon: no AE/CEP/HTTP/provider imports or calls.
const net=require("node:net"),fs=require("node:fs"),path=require("node:path");
const events=path.join(__dirname,"..","synthetic-events.jsonl");
function event(kind,extra={}){fs.appendFileSync(events,JSON.stringify({kind,pid:process.pid,...extra})+"\n",{flag:"a"});}
function nonce(name){const text=process.env[name];if(!/^[0-9a-f]{32}$/.test(text||""))throw Error("closed private nonce");return Buffer.from(text,"hex");}
if(fs.readFileSync(path.join(__dirname,"..","synthetic-fixture.scope"),"utf8")!=="launch_eof")throw Error("closed scenario");
const channel=nonce("AE_AGENT_LOCAL_SESSION_NONCE"),generation=nonce("AE_AGENT_LOCAL_SESSION_GENERATION"),boot=nonce("AE_AGENT_LOCAL_SESSION_BOOT");
const locator=process.env.AE_AGENT_LOCAL_SESSION_PIPE;if(!/^\\\\\.\\pipe\\AEAgent\.LocalSession\.[0-9a-f]{64}\.daemon\.[0-9a-f]{32}$/.test(locator||""))throw Error("closed pipe");
event("creation");const peer=net.connect(locator);let ordinal=0n;
function send(verb,epoch=0n,mask=0){const frame=Buffer.alloc(128);frame.write("LCSB",0,"ascii");frame.writeUInt16LE(2,4);frame.writeUInt16LE(verb,6);frame.writeBigUInt64LE(++ordinal,8);channel.copy(frame,16);generation.copy(frame,32);boot.copy(frame,48);frame.writeBigUInt64LE(epoch,112);frame.writeUInt32LE(mask,120);peer.write(frame);event("sent",{verb});}
peer.on("connect",()=>{event("connected");send(17);setTimeout(()=>send(18,1n,127),30);});
peer.on("error",error=>{event("pipe_error",{code:error.code});process.exitCode=24;});
peer.on("close",()=>{event("closed");process.exit(0);});setInterval(()=>{},1000);
'@
        $baseline.CreateSyntheticSource($mockSource)
        $audit.stage='enrollment_build';$enrollmentHeader=$baseline.WriteProfile($false);$enrollmentOutput=$baseline.NewOutput('build-enrollment');$enrollmentExe=Invoke-BaselineBuild $enrollmentHeader $enrollmentOutput
        $audit.enrollmentExecutable=[ordered]@{path=$enrollmentExe.Original.CanonicalPath;fileId=$enrollmentExe.Original.FileIdHex;sha256=$enrollmentExe.Sha256()}
        $audit.stage='original_enrollment_create';$originalEnrollment=Start-OriginalBaselineChild $enrollmentExe '--enroll-fixed';$audit.originalEnrollment=[ordered]@{diagnosticPid=$originalEnrollment.Id;birthUtc=$originalEnrollment.StartTime.ToUniversalTime().ToString('o')}
        $enrollmentErr=$originalEnrollment.StandardError.ReadToEndAsync();$observation=Read-OriginalCreationObservation $originalEnrollment.StandardOutput.BaseStream
        Assert-BaselineSources;$baseline.CaptureEnrollmentWhileCreatorHeld($originalEnrollment,$enrollmentExe,$observation)
        $audit.originalEnrollment.creatorBirthFileTime=$baseline.EnrollmentCreatorBirth;$audit.originalEnrollment.observationSha256=$baseline.EnrollmentObservationSha256;$audit.originalEnrollment.nonce=$baseline.EnrollmentNonceHex;$audit.originalEnrollment.creationPinsMatchedWhileHeld=$true;$audit.originalEnrollment.observationHex=[BitConverter]::ToString($observation).Replace('-','').ToLowerInvariant()
        $audit.stage='one_original_creator_ack';Assert-BaselineSources;$ack=$baseline.CreateEnrollmentAcknowledgement()
        $ackWrite=$originalEnrollment.StandardInput.BaseStream.WriteAsync($ack,0,$ack.Length)
        if(-not $ackWrite.Wait(5000)){throw 'Original creator ACK send UNKNOWN; no retry/reprovision.'}
        $audit.originalEnrollment.ackSentOnce=$true;$enrollmentOut=$originalEnrollment.StandardOutput.ReadToEndAsync()
        if(-not $originalEnrollment.WaitForExit(10000)){throw 'Original enrollment UNKNOWN; preserve evidence, no reprovision.'}
        if(-not $enrollmentOut.Wait(1000)-or -not $enrollmentErr.Wait(1000)){throw 'Original enrollment output UNKNOWN; no reprovision.'}
        $audit.originalEnrollment.exitCode=$originalEnrollment.ExitCode;$audit.originalEnrollment.output=$enrollmentOut.Result;$audit.originalEnrollment.stderr=$enrollmentErr.Result;$audit.originalEnrollment.exactExit=$true
        $enrolled=$enrollmentOut.Result|ConvertFrom-Json
        if($originalEnrollment.ExitCode-ne 0-or $enrolled.ok-ne $true-or $enrolled.unknown-ne $false-or $enrolled.code-ne 'provisioned_original_ids_parent_acknowledged'){throw 'Native enrollment refused/UNKNOWN; no retry.'}
        $baseline.ConfirmEnrollmentExactExit();$audit.originalEnrollment.creationPinsRetainedAfterExactExit=$true;$audit.enrollmentPinEvidence='Four original FILE_CREATE IDs and bytes matched via held original creator birth/image-bound stdout observation before one nonce/hash-bound original-stdin ACK; same parent witnesses retained and stable reads checked after exact exit.';$baseline.WriteEvidence('enrollment.json',($audit.originalEnrollment|ConvertTo-Json -Depth 5))
        $audit.originalPins=[ordered]@{repository=$baseline.Repository.Leaf.Original;runtime=$baseline.Runtime.Leaf.Original;node=$baseline.Node.Original;controllerImage=$baseline.ControllerImage.Original;installation=$baseline.InstallationFile.Original;policy=$baseline.PolicyFile.Original;lock=$baseline.LockFile.Original;journal=$baseline.Journal.Original;bridge=$baseline.Bridge.Original;marker=$baseline.Marker.Original}
        $audit.stage='final_build';$finalHeader=$baseline.WriteProfile($true);$finalOutput=$baseline.NewOutput('build-final');$finalExe=Invoke-BaselineBuild $finalHeader $finalOutput
        $audit.finalExecutable=[ordered]@{path=$finalExe.Original.CanonicalPath;fileId=$finalExe.Original.FileIdHex;sha256=$finalExe.Sha256()}
        $audit.stage='original_broker_create';$originalBroker=Start-OriginalBaselineChild $finalExe '--broker';$audit.originalBroker=[ordered]@{diagnosticPid=$originalBroker.Id;birthUtc=$originalBroker.StartTime.ToUniversalTime().ToString('o')};$brokerErrors=$originalBroker.StandardError.ReadToEndAsync();$line=$originalBroker.StandardOutput.ReadLineAsync()
        if(-not $line.Wait(10000)){throw 'Original broker locator UNKNOWN; no replay.'}
        $locator=$line.Result|ConvertFrom-Json
        if($locator.schema-ne 'ae-agent.local-broker.locator.v2'-or $locator.genuineChatIdentity-ne $false-or $locator.executionAdmission-ne $false-or $locator.authorityMode-ne 'local_controller_session'-or $locator.pipe-notmatch '^\\\\\.\\pipe\\AEAgent\.LocalSession\.[0-9a-f]{64}\.controller\.[0-9a-f]{32}$'-or $locator.nonce-notmatch '^[0-9a-f]{32}$'){throw 'Original broker remained closed; no launch attempt.'}
        $audit.prelaunchFrames=@($baseline.VerifyJournal(2));$audit.stage='original_controller_channel';$pipeName=$locator.pipe.Substring('\\.\pipe\'.Length);$channel=New-Object System.IO.Pipes.NamedPipeClientStream('.', $pipeName,[System.IO.Pipes.PipeDirection]::InOut,[System.IO.Pipes.PipeOptions]::Asynchronous);$channel.Connect(5000);$channel.ReadMode=[System.IO.Pipes.PipeTransmissionMode]::Message
        $nonce=New-Object byte[] 16;for($i=0;$i-lt 16;$i++){$nonce[$i]=[Convert]::ToByte($locator.nonce.Substring($i*2,2),16)}
        $ordinal=[UInt64]0;$replyBindings=@{generation=$null;boot=$null}
        function Invoke-BaselineController([UInt16]$verb){
            if($verb-notin @(1,2,3)){throw 'Closed controller proof verb'}
            Assert-BaselineSources
            $script:baselineOrdinal++
            $frame=New-Object byte[] 128;[System.Text.Encoding]::ASCII.GetBytes('LCSB').CopyTo($frame,0);[BitConverter]::GetBytes([UInt16]2).CopyTo($frame,4);[BitConverter]::GetBytes($verb).CopyTo($frame,6);[BitConverter]::GetBytes([UInt64]$script:baselineOrdinal).CopyTo($frame,8);$nonce.CopyTo($frame,16)
            $write=$channel.WriteAsync($frame,0,$frame.Length);if(-not $write.Wait(5000)){throw 'Original controller send UNKNOWN; no replay.'}
            $reply=New-Object byte[] 128;$read=$channel.ReadAsync($reply,0,$reply.Length);if(-not $read.Wait(5000)-or $read.Result-ne 128){throw 'Original controller reply UNKNOWN; no replay.'}
            if([System.Text.Encoding]::ASCII.GetString($reply,0,4)-ne 'LCSB'-or [BitConverter]::ToUInt16($reply,4)-ne 2-or [BitConverter]::ToUInt16($reply,6)-ne $verb-or [BitConverter]::ToUInt64($reply,8)-ne $script:baselineOrdinal){throw 'Original controller reply binding mismatch.'}
            for($j=0;$j-lt 16;$j++){if($reply[16+$j]-ne $nonce[$j]){throw 'Original reply nonce mismatch'}}
            $generation=[BitConverter]::ToString($reply,32,16).Replace('-','').ToLowerInvariant();$boot=[BitConverter]::ToString($reply,48,16).Replace('-','').ToLowerInvariant()
            if($generation-eq ('0'*32)-or $boot-eq ('0'*32)){throw 'Original reply generation/boot missing'}
            if($null-eq $replyBindings.generation){$replyBindings.generation=$generation;$replyBindings.boot=$boot}elseif($replyBindings.generation-ne $generation-or $replyBindings.boot-ne $boot){throw 'Original generation/boot changed'}
            for($j=64;$j-lt 112;$j++){if($reply[$j]-ne 0){throw 'Closed reply reference/digest fields'}}
            if([BitConverter]::ToUInt32($reply,120)-ne 0-or [BitConverter]::ToUInt32($reply,124)-ne 0){throw 'Closed reply readiness/reserved fields'}
            $baseline.AssertFresh()
            return [BitConverter]::ToUInt64($reply,112)
        }
        $script:baselineOrdinal=$ordinal
        if((Invoke-BaselineController 1)-ne 1){throw 'Expected SESSION_OPEN'}
        $audit.stage='one_consumed_launch';if((Invoke-BaselineController 2)-ne 3){throw 'Expected TARGET_HELD; never repeat reserve.'}
        $audit.consumedFrames=@($baseline.VerifyJournal(3));$watch=[System.Diagnostics.Stopwatch]::StartNew();$ready=$false
        while($watch.ElapsedMilliseconds-lt 5000){$state=Invoke-BaselineController 3;if($state-eq 4){$ready=$true;break};if($state-ne 3){throw "Original boot closed: state $state"};Start-Sleep -Milliseconds 25}
        if(-not $ready){throw 'Original boot UNKNOWN; no reconnect/relaunch.'}
        $audit.registeredReadClosed=$true;$audit.originalReplyBindings=$replyBindings;$audit.stage='controller_eof';$channel.Dispose();$channel=$null
        if(-not $originalBroker.WaitForExit(10000)){throw 'Original broker/target disposition UNKNOWN; no external stop/relaunch.'}
        $audit.originalBroker.exitCode=$originalBroker.ExitCode;$audit.originalBroker.exactHeldExit=$true
        if(-not $brokerErrors.Wait(1000)){throw 'Original broker stderr UNKNOWN'};$audit.originalBroker.stderr=$brokerErrors.Result
        if($originalBroker.ExitCode-ne 0){throw 'Original broker terminal result failed'}
        $audit.finalFrames=@($baseline.VerifyJournal(3));for($i=0;$i-lt 3;$i++){if($audit.finalFrames[$i].Hash-ne $audit.consumedFrames[$i].Hash-or $audit.finalFrames[$i].FileId-ne $audit.consumedFrames[$i].FileId){throw 'Original journal drift after EOF'}}
        $eventsPath=Join-Path $baseline.FixturePath 'synthetic-events.jsonl';$events=@([System.IO.File]::ReadAllLines($eventsPath)|ForEach-Object{$_|ConvertFrom-Json});if(@($events|Where-Object{$_.kind-eq 'creation'}).Count-ne 1-or @($events|Where-Object{$_.kind-eq 'connected'}).Count-ne 1-or @($events|Where-Object{$_.kind-eq 'sent'-and $_.verb-eq 17}).Count-ne 1){throw 'Exactly one original synthetic daemon/boot required'}
        $audit.events=$events;$audit.exactTargetExitEvidence='Native source: RunFixed independently observes ExactExit(original retained HANDLE) before/after protocol and teardown; with the original daemon, broker return 0 requires factual exit and no prior sticky UNKNOWN. Zero grants and no admission. PID/event/ACK is diagnostic only.';$audit.status='PASS';$audit.syntheticObservations='COMPLETE';$audit.stage='complete';$audit.nativeBuild=$true;$audit.nativeExecuted=$true;$audit.remainingNativeMatrix='NOT_RUN';$audit.cleanup='Own scratch preserved; no AE/foreign stop; no replay.';$knownExit=$true
        $baseline.WriteEvidence('receipt.json',($audit|ConvertTo-Json -Depth 10));$audit|ConvertTo-Json -Depth 10
    }catch{
        $audit.failure=[string]$_;$audit.status='UNKNOWN';$audit.cleanup='Scratch and original references preserved; no retry, kill, reprovision or PID adoption.'
        if($originalBroker){
            $brokerFailure=[ordered]@{scope='retained_original_broker_process_and_stdio';status='UNKNOWN';exactHeldExit=$false;stdoutComplete=$false;stderrComplete=$false;channelDisposition='PRESERVED';replayAllowed=$false}
            $audit.originalBrokerFailure=$brokerFailure
            try{if($originalBroker.WaitForExit(2000)){$brokerFailure.exactHeldExit=$true;$brokerFailure.exitCode=$originalBroker.ExitCode}}catch{$brokerFailure.exitObservationFailure=[string]$_}
            # A pending locator read owns stdout until it completes. Never start
            # a competing read or reopen a process/pipe after UNKNOWN.
            try{
                if($line-and $line.Wait(1000)){
                    $brokerFailure.locatorReadCompleted=$true
                    if($null-eq $brokerOutput){$brokerOutput=$originalBroker.StandardOutput.ReadToEndAsync()}
                    if($brokerOutput.Wait(1000)){$text=[string]$brokerOutput.Result;$brokerFailure.stdoutCharacters=$text.Length;$brokerFailure.stdoutComplete=($text.Length-le 8192);$brokerFailure.stdout=$text.Substring(0,[Math]::Min($text.Length,8192))}
                }else{$brokerFailure.stdoutState='ORIGINAL_LOCATOR_READ_PENDING_OR_UNAVAILABLE'}
            }catch{$brokerFailure.stdoutObservationFailure=[string]$_}
            try{
                if($null-eq $brokerErrors){$brokerErrors=$originalBroker.StandardError.ReadToEndAsync()}
                if($brokerErrors.Wait(1000)){$text=[string]$brokerErrors.Result;$brokerFailure.stderrCharacters=$text.Length;$brokerFailure.stderrComplete=($text.Length-le 8192);$brokerFailure.stderr=$text.Substring(0,[Math]::Min($text.Length,8192))}
            }catch{$brokerFailure.stderrObservationFailure=[string]$_}
            if($brokerFailure.exactHeldExit-and $brokerFailure.stdoutComplete-and $brokerFailure.stderrComplete){$brokerFailure.status='ORIGINAL_EXIT_AND_STDIO_OBSERVED'}
        }
        $script:LocalSessionBaselineUnknown=[pscustomobject]@{capture=$baseline;originalEnrollment=$originalEnrollment;originalBroker=$originalBroker;pendingOriginalChild=$script:LocalSessionBaselinePendingChild;originalChannel=$channel;originalLocatorRead=$line;originalBrokerOutputRead=$brokerOutput;originalBrokerErrorRead=$brokerErrors;audit=$audit}
        if($baseline){try{$baseline.WriteEvidence('failure.json',($audit|ConvertTo-Json -Depth 10))}catch{$audit.evidenceWriteFailure=[string]$_}}
        $audit|ConvertTo-Json -Depth 10
        throw
    }finally{
        if($knownExit){if($channel){$channel.Dispose()};if($originalBroker){$originalBroker.Dispose()};if($originalEnrollment){$originalEnrollment.Dispose()};if($baseline){$baseline.Dispose()};$script:LocalSessionBaselinePendingChild=$null}
    }
}
