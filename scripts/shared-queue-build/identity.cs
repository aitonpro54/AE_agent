using System;
using System.IO;
using System.Text;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Threading.Tasks;
using Microsoft.Win32.SafeHandles;

// Observations of actual held Windows objects, never a native session issuer.
public sealed class SharedQueueBuildPin : IDisposable {
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern SafeFileHandle CreateFileW(string p,uint a,uint s,IntPtr sa,uint d,uint f,IntPtr t);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetFileInformationByHandleEx(SafeFileHandle h,int k,byte[] b,uint n);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern uint GetFinalPathNameByHandleW(SafeFileHandle h,StringBuilder b,uint n,uint f);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetFilePointerEx(SafeFileHandle h,long d,out long p,uint m);
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool ReadFile(SafeFileHandle h,byte[] b,uint n,out uint r,IntPtr o);
 readonly SafeFileHandle handle; readonly bool directory; readonly byte[] identity; readonly string locator;
 public readonly string CanonicalPath,VolumeGuidHex,FileIdHex,Serial,Sha256; public readonly long Bytes; public readonly uint Links;
 static void Check(bool value,string code){if(!value)throw new IOException(code+":"+Marshal.GetLastWin32Error());}
 byte[] Info(int k,int n){var b=new byte[n];Check(GetFileInformationByHandleEx(handle,k,b,(uint)n),"production_pin_query");return b;}
 string Canonical(){var b=new StringBuilder(32768);var n=GetFinalPathNameByHandleW(handle,b,(uint)b.Capacity,1);Check(n>0&&n<b.Capacity,"production_pin_canonical");return b.ToString();}
 string Hash(){long pos;Check(SetFilePointerEx(handle,0,out pos,0),"production_pin_seek");using(var hash=IncrementalHash.CreateHash(HashAlgorithmName.SHA256)){var b=new byte[65536];for(;;){uint n;Check(ReadFile(handle,b,(uint)b.Length,out n,IntPtr.Zero),"production_pin_read");if(n==0)break;hash.AppendData(b,0,(int)n);}return Convert.ToHexString(hash.GetHashAndReset()).ToLowerInvariant();}}
 static bool ExactVendor(string canonical,string volume,string serial,string fileId,string hash,long bytes,uint links){
  var physical=volume+Convert.ToHexString(BitConverter.GetBytes(UInt64.Parse(serial))).ToLowerInvariant()+fileId;
  return
   (canonical==@"\\?\Volume{c3c972fd-0862-442d-9c16-be619b003f4d}\Windows\System32\tzres.dll"&&physical=="fd72c9c362082d449c16be619b003f4de353213e1cf9ba59b5710d0000000a000000000000000000"&&hash=="1398cf1d866e49a8ba351e2a30a7803b50c8b595d17f776abe8d2ec4a9c6fb10"&&bytes==12288&&links==2)||
   (canonical==@"\\?\Volume{c3c972fd-0862-442d-9c16-be619b003f4d}\Windows\Globalization\Sorting\SortDefault.nls"&&physical=="fd72c9c362082d449c16be619b003f4de353213e1cf9ba5991c50000000001000000000000000000"&&hash=="5710c47f5c5c745854e11fc06c8d349cd61d084f5a90937396e88ab762298b67"&&bytes==3385740&&links==2)||
   (canonical==@"\\?\Volume{c3c972fd-0862-442d-9c16-be619b003f4d}\Windows\Microsoft.NET\Framework\v4.0.30319\Microsoft.Xaml.targets"&&physical=="fd72c9c362082d449c16be619b003f4de353213e1cf9ba5969cd0000000001000000000000000000"&&hash=="c7901713049b86eda6842a8aaba45daaabb560bd1ae1c4af711dd6d2fc916af0"&&bytes==19892&&links==3);
 }
 public SharedQueueBuildPin(string path,bool isDirectory,bool exactVendor=false){
  locator=path;directory=isDirectory;handle=CreateFileW(path,isDirectory?0x100081u:0x100081u,isDirectory?3u:1u,IntPtr.Zero,3,0x200000u|(isDirectory?0x2000000u:0u),IntPtr.Zero);
  Check(!handle.IsInvalid,"production_pin_open");try{var basic=Info(0,40);var standard=Info(1,24);identity=Info(18,24);
   if(standard[20]!=0||(standard[21]!=0)!=directory||(BitConverter.ToUInt32(basic,32)&0x441400)!=0)throw new IOException("production_pin_shape");
   Links=BitConverter.ToUInt32(standard,16);Bytes=BitConverter.ToInt64(standard,8);
   CanonicalPath=Canonical();if(!CanonicalPath.StartsWith(@"\\?\Volume{"))throw new IOException("production_pin_volume_guid_required");
   VolumeGuidHex=Convert.ToHexString(Guid.Parse(CanonicalPath.Substring(11,36)).ToByteArray()).ToLowerInvariant();Serial=BitConverter.ToUInt64(identity,0).ToString();FileIdHex=Convert.ToHexString(identity,8,16).ToLowerInvariant();Sha256=directory?null:Hash();
   if(!directory&&(exactVendor?!ExactVendor(CanonicalPath,VolumeGuidHex,Serial,FileIdHex,Sha256,Bytes,Links):Links!=1))throw new IOException("production_pin_single_link_or_exact_vendor_required");AssertFresh();
  }catch{handle.Dispose();throw;}
 }
 public void AssertFresh(){var current=Info(18,24);var shape=Info(1,24);if(shape[20]!=0||(shape[21]!=0)!=directory||(!directory&&BitConverter.ToUInt32(shape,16)!=Links)||!CryptographicOperations.FixedTimeEquals(current,identity)||Canonical()!=CanonicalPath||(!directory&&Hash()!=Sha256))throw new IOException("production_held_pin_changed");}
 public void Dispose(){handle.Dispose();}
}
public static class SharedQueueBuildIo {
 [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetProcessTimes(SafeProcessHandle h,out long c,out long e,out long k,out long u);
 public static string Birth(SafeProcessHandle handle){long c,e,k,u;if(!GetProcessTimes(handle,out c,out e,out k,out u))throw new IOException("production_original_creator_birth");return ((ulong)c).ToString();}
 public static async Task<byte[]> ReadExactly(Stream stream,int size){var bytes=new byte[size];int at=0;while(at<size){var n=await stream.ReadAsync(bytes,at,size-at).ConfigureAwait(false);if(n==0)throw new IOException("production_original_stdio_eof_unknown");at+=n;}return bytes;}
 public static async Task<bool> ReadEof(Stream stream){var bytes=new byte[1];return await stream.ReadAsync(bytes,0,1).ConfigureAwait(false)==0;}
 public static async Task<long> Drain(Stream stream,string destination,long maximum){long count=0;var bytes=new byte[4096];using(var output=new FileStream(destination,FileMode.CreateNew,FileAccess.Write,FileShare.Read)){for(;;){var n=await stream.ReadAsync(bytes,0,bytes.Length).ConfigureAwait(false);if(n==0)return count;count+=n;if(count>maximum)throw new IOException("production_child_output_bound_unknown");await output.WriteAsync(bytes,0,n).ConfigureAwait(false);}}}
}
