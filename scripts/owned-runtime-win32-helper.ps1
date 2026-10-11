# Fixed private NDJSON transport. No command text, executable or path launch input.
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Globalization;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
public sealed class OwnedIdentity {
  public int pid {get;set;}
  public string birthFileTime {get;set;}
  public string birthUtc {get;set;}
  public string imagePath {get;set;}
  public string executableSha256 {get;set;}
}
public sealed class OwnedWait {
  public string waitResult {get;set;}
  public bool signaled {get;set;}
  public long? exitCode {get;set;}
}
public sealed class OwnedWindows {
  public int count {get;set;}
  public string hwnd {get;set;}
}
public static class OwnedNative {
  [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr OpenProcess(uint rights,bool inherit,int pid);
  [DllImport("kernel32.dll",SetLastError=true)] static extern uint GetProcessId(IntPtr h);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetProcessTimes(IntPtr h,out long birth,out long exit,out long kernel,out long user);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool QueryFullProcessImageName(IntPtr h,uint flags,StringBuilder path,ref uint length);
  [DllImport("kernel32.dll",SetLastError=true)] static extern uint WaitForSingleObject(IntPtr h,uint ms);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetExitCodeProcess(IntPtr h,out uint code);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool TerminateProcess(IntPtr h,uint code);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool CloseHandle(IntPtr h);
  [StructLayout(LayoutKind.Sequential,Pack=4)] struct FileInfo {public uint attributes;public long birth,access,write;public uint volume,sizeHigh,sizeLow,links,indexHigh,indexLow;}
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetFileInformationByHandle(IntPtr h,out FileInfo info);
  public static string FileIdentity(FileStream file) {FileInfo i;if(!GetFileInformationByHandle(file.SafeFileHandle.DangerousGetHandle(),out i))Error();if(i.links!=1 || (i.attributes & 0x400)!=0)throw new InvalidOperationException("owned_profile_file_identity");return i.volume.ToString()+":"+i.indexHigh.ToString()+":"+i.indexLow.ToString();}
  delegate bool EnumProc(IntPtr window,IntPtr state);
  [DllImport("user32.dll",SetLastError=true)] static extern bool EnumWindows(EnumProc proc,IntPtr state);
  [DllImport("user32.dll",SetLastError=true)] static extern uint GetWindowThreadProcessId(IntPtr hwnd,out uint pid);
  [DllImport("user32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern int GetClassName(IntPtr hwnd,StringBuilder name,int max);
  [DllImport("user32.dll",SetLastError=true)] static extern bool PostMessage(IntPtr hwnd,uint msg,IntPtr w,IntPtr l);
  static void Error() {throw new Win32Exception(Marshal.GetLastWin32Error());}
  public static IntPtr Open(int pid,bool termination) {
    IntPtr h=OpenProcess(0x00100000|0x1000|(termination ? (uint)1 : 0),false,pid);
    if(h==IntPtr.Zero) Error(); return h;
  }
  public static OwnedIdentity Identity(IntPtr h) {
    uint pid=GetProcessId(h); if(pid==0 || pid>Int32.MaxValue) Error();
    long b,e,k,u; if(!GetProcessTimes(h,out b,out e,out k,out u)) Error();
    StringBuilder p=new StringBuilder(32768); uint size=(uint)p.Capacity;
    if(!QueryFullProcessImageName(h,0,p,ref size)) Error();
    return new OwnedIdentity {pid=(int)pid,birthFileTime=b.ToString(CultureInfo.InvariantCulture),
      birthUtc=DateTime.FromFileTimeUtc(b).ToString("yyyy-MM-ddTHH:mm:ss.fffffffZ",CultureInfo.InvariantCulture),imagePath=p.ToString()};
  }
  public static string Hash(Stream file) {file.Position=0;using(SHA256 s=SHA256.Create())return BitConverter.ToString(s.ComputeHash(file)).Replace("-","").ToLowerInvariant();}
  public static OwnedWait Wait(IntPtr h,uint ms) {
    uint value=WaitForSingleObject(h,ms);
    if(value==0) {uint code;if(!GetExitCodeProcess(h,out code))Error();return new OwnedWait {waitResult="WAIT_OBJECT_0",signaled=true,exitCode=(long)code};}
    if(value==258)return new OwnedWait {waitResult="WAIT_TIMEOUT",signaled=false};
    Error();throw new InvalidOperationException("owned_wait_invalid");
  }
  public static OwnedWindows Windows(IntPtr h,int expectedPid) {
    if(Wait(h,0).signaled)return new OwnedWindows {count=0};
    if(GetProcessId(h)!=(uint)expectedPid)throw new InvalidOperationException("owned_identity_changed");
    int count=0;IntPtr found=IntPtr.Zero;
    EnumProc callback=delegate(IntPtr w,IntPtr unused) {uint pid; if(GetWindowThreadProcessId(w,out pid)==0)Error();if(pid==(uint)expectedPid){count++;found=w;}return true;};
    if(!EnumWindows(callback,IntPtr.Zero))Error();
    return new OwnedWindows {count=count,hwnd=count==1 ? found.ToInt64().ToString(CultureInfo.InvariantCulture) : null};
  }
  static string[] FixtureClasses(int expectedPid) {
    var names=new System.Collections.Generic.List<string>();
    EnumProc callback=delegate(IntPtr w,IntPtr unused) {uint pid;GetWindowThreadProcessId(w,out pid);if(pid==(uint)expectedPid){StringBuilder name=new StringBuilder(256);GetClassName(w,name,name.Capacity);names.Add(name.ToString());}return true;};EnumWindows(callback,IntPtr.Zero);return names.ToArray();
  }
  public static bool Graceful(IntPtr h,int pid,string hwnd,Action leaseCheck,string expiresAt) {
    OwnedWindows found=Windows(h,pid);
    if(found.count!=1 || found.hwnd!=hwnd)throw new InvalidOperationException("owned_window_changed");
    IntPtr w=new IntPtr(Int64.Parse(hwnd,CultureInfo.InvariantCulture));uint owner;
    if(GetWindowThreadProcessId(w,out owner)==0)Error();
    leaseCheck();
    OwnedWindows current=Windows(h,pid);
    if(current.count!=1 || current.hwnd!=hwnd)throw new InvalidOperationException("owned_window_changed");
    if(GetWindowThreadProcessId(w,out owner)==0)Error();
    if(owner!=(uint)pid || Wait(h,0).signaled || GetProcessId(h)!=(uint)pid)throw new InvalidOperationException("owned_window_owner_changed");
    if(DateTimeOffset.UtcNow>=DateTimeOffset.Parse(expiresAt,CultureInfo.InvariantCulture))throw new InvalidOperationException("owned_native_lease_stale");
    if(!PostMessage(w,0x0010,IntPtr.Zero,IntPtr.Zero))Error();return true;
  }
  public static void Force(IntPtr h,Action leaseCheck,string expiresAt) {leaseCheck();if(Wait(h,0).signaled)throw new InvalidOperationException("owned_force_already_exited");if(DateTimeOffset.UtcNow>=DateTimeOffset.Parse(expiresAt,CultureInfo.InvariantCulture))throw new InvalidOperationException("owned_native_lease_stale");if(!TerminateProcess(h,137))Error();}
  public static void Dispose(IntPtr h) {if(h!=IntPtr.Zero && !CloseHandle(h))Error();}
  // Only smoke fixtures use this code path. Windows stay hidden and self-expire.
  [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] struct WndClass {public uint style;public WndProc proc;public int classExtra,windowExtra;public IntPtr instance,icon,cursor,background;public string menu,name;}
  [StructLayout(LayoutKind.Sequential)] struct Message {public IntPtr hwnd;public uint msg;public UIntPtr w;public IntPtr l;public uint time;public int x,y;public uint extra;}
  delegate IntPtr WndProc(IntPtr hwnd,uint msg,IntPtr w,IntPtr l);
  [DllImport("user32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern ushort RegisterClass(ref WndClass c);
  [DllImport("user32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr CreateWindowEx(uint ex,string cls,string name,uint style,int x,int y,int width,int height,IntPtr parent,IntPtr menu,IntPtr instance,IntPtr param);
  [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern IntPtr DefWindowProc(IntPtr hwnd,uint msg,IntPtr w,IntPtr l);
  [DllImport("user32.dll")] static extern int GetMessage(out Message m,IntPtr w,uint first,uint last);
  [DllImport("user32.dll")] static extern IntPtr DispatchMessage(ref Message m);
  [DllImport("imm32.dll")] static extern bool ImmDisableIME(uint threadId);
  public static void Fixture(string kind,int deadlineMs) {
    ManualResetEvent ready=new ManualResetEvent(false),closed=new ManualResetEvent(false);
    if(kind!="headless") {
      Thread t=new Thread(delegate() {
        ImmDisableIME(0);
        string name="OwnedSmoke_"+Guid.NewGuid().ToString("N");
        WndProc callback=delegate(IntPtr h,uint msg,IntPtr w,IntPtr l) {if(msg==0x0010){if(kind!="stubborn")closed.Set();return IntPtr.Zero;}return DefWindowProc(h,msg,w,l);};
        WndClass c=new WndClass {proc=callback,name=name};if(RegisterClass(ref c)==0)Error();
        if(CreateWindowEx(0,name,"Synthetic owned lifecycle smoke",0x00CF0000,0,0,40,40,IntPtr.Zero,IntPtr.Zero,IntPtr.Zero,IntPtr.Zero)==IntPtr.Zero)Error();
        ready.Set();Message m;while(GetMessage(out m,IntPtr.Zero,0,0)>0)DispatchMessage(ref m);
        GC.KeepAlive(callback);
      });t.IsBackground=true;t.SetApartmentState(ApartmentState.MTA);t.Start();if(!ready.WaitOne(4000))throw new InvalidOperationException("owned_fixture_window_timeout");
    }
    IntPtr handle=Open(System.Diagnostics.Process.GetCurrentProcess().Id,false);
    try {OwnedIdentity identity=Identity(handle);using(FileStream file=new FileStream(identity.imagePath,FileMode.Open,FileAccess.Read,FileShare.Read))identity.executableSha256=Hash(file);
      Console.WriteLine(System.Text.Json.JsonSerializer.Serialize(new {ok=true,type="fixture",identity=identity,fixtureClasses=FixtureClasses(identity.pid)}));Console.Out.Flush();
    }finally {Dispose(handle);}
    closed.WaitOne(deadlineMs);Environment.Exit(kind=="exit259" ? 259 : 0);
  }
}
'@
function Emit($value) { $value | ConvertTo-Json -Compress -Depth 12; [Console]::Out.Flush() }
function Exact($value, [string[]]$keys) {
  if ((($value.PSObject.Properties.Name | Sort-Object) -join ',') -cne (($keys | Sort-Object) -join ',')) { throw 'owned_rpc_schema' }
}
function BootstrapIdle($value) {
  if ($null -eq $value) { return $false }
  $keys=@($value.PSObject.Properties.Name)
  if ($keys -contains 'stage' -and $value.stage -cne 'verified') { return $false }
  return ($value.busy -ceq $false -or ($keys -notcontains 'busy' -and $value.stage -ceq 'verified'))
}
function ParseCredentialConfig([string]$text,[string]$repo) {
  if ([Text.Encoding]::UTF8.GetByteCount($text) -gt 1048576 -or $text.Contains([char]0)) { throw 'owned_fixed_config_required' }
  $selected=$false;$sections=0
  $values=[Collections.Generic.Dictionary[string,string]]::new([StringComparer]::Ordinal)
  foreach ($line in ($text -replace '^\uFEFF','') -split '\r?\n') {
    if ($line -cmatch '^\s*\[') {
      $selected=$line.Trim() -ceq '[mcp_servers."after-effects".env]'
      if ($selected) { $sections++;if ($sections -ne 1) { throw 'owned_fixed_config_duplicate' } }
      continue
    }
    if (!$selected -or $line -cmatch '^\s*(?:#.*)?$') { continue }
    if ($line -cnotmatch '^\s*([A-Z][A-Z0-9_]*)\s*=\s*("(?:[^"\\\r\n]|\\["\\bfnrt]|\\u[0-9a-fA-F]{4})*")\s*(?:#.*)?$') { throw 'owned_fixed_config_required' }
    $key=$Matches[1];$encoded=$Matches[2]
    if ($values.ContainsKey($key)) { throw 'owned_fixed_config_duplicate' }
    try { $value=$encoded | ConvertFrom-Json -DateKind String } catch { throw 'owned_fixed_config_required' }
    if ($value -cmatch '[\u0000-\u001f\u007f]') { throw 'owned_fixed_config_required' }
    $values.Add($key,$value)
  }
  if ($sections -ne 1 -or $values['AE_BRIDGE_TOKEN'] -cnotmatch '^[!-~]+$' -or $values['AE_BRIDGE_PANEL_TOKEN'] -cnotmatch '^[!-~]+$' -or $values['AE_BRIDGE_TOKEN'] -ceq $values['AE_BRIDGE_PANEL_TOKEN'] -or ($values.ContainsKey('AE_BRIDGE_HOST') -and $values['AE_BRIDGE_HOST'] -cne '127.0.0.1') -or ($values.ContainsKey('AE_BRIDGE_PORT') -and $values['AE_BRIDGE_PORT'] -cne '3456') -or ($values.ContainsKey('AE_BRIDGE_LOG_DIR') -and [IO.Path]::GetFullPath($values['AE_BRIDGE_LOG_DIR']) -cne (Join-Path $repo 'logs'))) { throw 'owned_fixed_config_required' }
  return $values['AE_BRIDGE_TOKEN']
}
function FixedCredential([string]$root,[string]$fingerprint) {
  # The root is selected privately by ProfileFile: repo for production or the
  # exact nonce fixture root. No RPC path, environment or global fallback.
  $file=Join-Path $root '.codex/config.toml';$ancestor=$file
  while ($ancestor -ne '') { if (((Get-Item -LiteralPath $ancestor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'owned_fixed_config_identity' };$ancestor=[IO.Path]::GetDirectoryName($ancestor);if ($null -eq $ancestor) { break } }
  $stream=[IO.FileStream]::new($file,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
  try {
    [void][OwnedNative]::FileIdentity($stream)
    if ($stream.Length -gt 1048576) { throw 'owned_fixed_config_required' }
    $reader=[IO.StreamReader]::new($stream,[Text.UTF8Encoding]::new($false),$true,4096,$true)
    try { $token=ParseCredentialConfig $reader.ReadToEnd() $root } finally { $reader.Dispose() }
    $secret=[IO.MemoryStream]::new([Text.Encoding]::UTF8.GetBytes($token))
    try { if ([OwnedNative]::Hash($secret) -cne $fingerprint) { throw 'owned_native_auth_changed' } } finally { $secret.Dispose() }
    if ($null -ne $script:effectKind) { $script:witnessLocks+=@($stream);$stream=$null }
    return $token
  } finally { if ($null -ne $stream) { $stream.Dispose() } }
}
function ReleaseLeaseLocks {
  foreach ($lock in $script:witnessLocks) { $lock.Dispose() }
  $script:witnessLocks=@()
  if ($null -ne $script:effectLease) { $script:effectLease.Dispose();$script:effectLease=$null }
  $script:effectKind=$null
}
function ProfileFile {
  $resolved=[IO.Path]::GetFullPath($script:lease.profilePath)
  $repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
  $base=Join-Path $repo '.codex-runtime/owned-runtime-maintenance'
  $migration=Join-Path $base 'profiles/migration-fixture-children-v1.json'
  $synthetic=$resolved.StartsWith($base+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase) -and $resolved -match '[\\/]synthetic-[a-f0-9]{32}[\\/]profiles[\\/]fixture.json$'
  if ($resolved -ine $migration -and !$synthetic) { throw 'owned_profile_fixed_source_required' }
  if ($synthetic -and $script:expected.imagePath -ine [Diagnostics.Process]::GetCurrentProcess().MainModule.FileName) { throw 'owned_synthetic_image_required' }
  $current=$resolved
  while ($null -ne $current) {
    $item=Get-Item -LiteralPath $current -Force
    if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'owned_profile_reparse_refused' }
    $current=[IO.Path]::GetDirectoryName($current)
    if ($current -eq '') { break }
  }
  $stream=[IO.FileStream]::new($resolved,[IO.FileMode]::Open,[IO.FileAccess]::Read,([IO.FileShare]::ReadWrite -bor [IO.FileShare]::Delete))
  try {
    $id=[OwnedNative]::FileIdentity($stream)
    if ($null -ne $script:profileIdentity -and $id -cne $script:profileIdentity) { throw 'owned_profile_source_replaced' }
    if ([OwnedNative]::Hash($stream) -cne $script:lease.profileRawSha256) { throw 'owned_profile_source_changed' }
    $stream.Position=0;$reader=[IO.StreamReader]::new($stream,[Text.UTF8Encoding]::new($false),$true,4096,$true)
    try { $profile=$reader.ReadToEnd() | ConvertFrom-Json -DateKind String } finally { $reader.Dispose() }
    if ($profile.schema -cne 'ae-agent.owned-runtime-profile.v1' -or $profile.generation -cne $script:lease.generation -or $profile.context.runId -cne $script:lease.runId -or $profile.expiresAt -cne $script:lease.expiresAt -or [DateTimeOffset]::UtcNow -ge [DateTimeOffset]::Parse($profile.expiresAt) -or [DateTimeOffset]::UtcNow -lt [DateTimeOffset]::Parse($profile.issuedAt)) { throw 'owned_native_lease_stale' }
    $stage=@($profile.stages | Where-Object { $_.stageId -ceq $script:lease.stageId })
    if ($stage.Count -ne 1 -or $stage[0].identity.pid -ne $script:expected.pid -or $stage[0].identity.birthFileTime -cne $script:expected.birthFileTime -or $stage[0].identity.imagePath -ine $script:expected.imagePath -or $stage[0].identity.executableSha256 -cne $script:expected.executableSha256 -or !$profile.policy.disposableFixture -or ($script:effectKind -eq 'force' -and !$profile.policy.allowForce)) { throw 'owned_native_policy_refused' }
    # Every synthetic lease also exercises the same parser/locked file reader,
    # using its own fixed nonce-root source; it cannot substitute repo credentials.
    if ($synthetic) { $credentialRoot=[IO.Path]::GetDirectoryName([IO.Path]::GetDirectoryName($resolved)) } else { $credentialRoot=$repo }
    $token=FixedCredential $credentialRoot $profile.daemon.credentialSha256
    if (!$synthetic) {
      if ($profile.daemon.port -ne 3456) { throw 'owned_native_auth_changed' }
      $canonicalPath=Join-Path $repo ('logs/evidence/plan-runs/'+$profile.context.runId+'.json')
      if ($profile.canonicalRecord.path -ine $canonicalPath) { throw 'owned_native_canonical_path' }
      $ancestor=$canonicalPath
      while ($ancestor -ne '') { if (((Get-Item -LiteralPath $ancestor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'owned_native_canonical_reparse' };$ancestor=[IO.Path]::GetDirectoryName($ancestor);if ($null -eq $ancestor) { break } }
      $cf=[IO.FileStream]::new($canonicalPath,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
      try {
        [void][OwnedNative]::FileIdentity($cf)
        if ([OwnedNative]::Hash($cf) -cne $profile.canonicalRecord.rawSha256) { throw 'owned_native_canonical_changed' }
        if ($null -ne $script:effectKind) { $script:witnessLocks+=@($cf);$cf=$null }
      } finally { if ($null -ne $cf) { $cf.Dispose() } }
      foreach ($witness in $profile.stages) {
        foreach ($pin in $witness.pins.PSObject.Properties.Value) {
          $pinPath=[IO.Path]::GetFullPath($pin.path)
          if (!$pinPath.StartsWith((Join-Path $repo '.codex-runtime')+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) { throw 'owned_native_witness_path' }
          $ancestor=$pinPath
          while ($ancestor -ne '') { if (((Get-Item -LiteralPath $ancestor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'owned_native_witness_reparse' };$ancestor=[IO.Path]::GetDirectoryName($ancestor);if ($null -eq $ancestor) { break } }
          $wfile=[IO.FileStream]::new($pinPath,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
          try { [void][OwnedNative]::FileIdentity($wfile);if ([OwnedNative]::Hash($wfile) -cne $pin.rawSha256) { throw 'owned_native_witness_changed' };if ($null -ne $script:effectKind) { $script:witnessLocks+=@($wfile);$wfile=$null } } finally { if ($null -ne $wfile) { $wfile.Dispose() } }
        }
      }
      foreach ($protected in $profile.protected) {
        if ($protected.pid -eq $script:expected.pid) { throw 'owned_native_protected_target' }
        $ph=[OwnedNative]::Open([int]$protected.pid,$false)
        try {
          $pi=[OwnedNative]::Identity($ph)
          if ($pi.birthFileTime -cne $protected.birthFileTime -or $pi.imagePath -ine $protected.imagePath -or [OwnedNative]::Wait($ph,0).signaled) { throw 'owned_native_protected_identity_changed' }
          $pfile=[IO.FileStream]::new($pi.imagePath,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
          try { if ([OwnedNative]::Hash($pfile) -cne $protected.executableSha256) { throw 'owned_native_protected_image_changed' } } finally { $pfile.Dispose() }
        } finally { [OwnedNative]::Dispose($ph) }
      }
      $daemon=[OwnedNative]::Open([int]$profile.daemon.identity.pid,$false)
      try {
        $di=[OwnedNative]::Identity($daemon)
        if ($di.birthFileTime -cne $profile.daemon.identity.birthFileTime -or $di.imagePath -ine $profile.daemon.identity.imagePath -or [OwnedNative]::Wait($daemon,0).signaled) { throw 'owned_native_original_daemon_changed' }
      } finally { [OwnedNative]::Dispose($daemon) }
      $client=[Net.Http.HttpClient]::new();$client.Timeout=[TimeSpan]::FromSeconds(3)
      try {
        [void]$client.DefaultRequestHeaders.Add('x-ae-bridge-token',$token)
        $baseUrl='http://127.0.0.1:3456'
        $status=$client.GetStringAsync($baseUrl+'/dev/status').GetAwaiter().GetResult() | ConvertFrom-Json -DateKind String
        if (!$status.ok -or $status.humanGuardRuntime.pid -ne $profile.daemon.identity.pid -or $status.startedAt -cne $profile.daemon.startedAt -or $status.humanGuardRuntime.sourceSha256 -cne $profile.daemon.loadedRuntimeSha256 -or $status.pendingCommands -ne 0 -or @($status.inflightCommands).Count -ne 0 -or $null -ne $status.activeEditSession -or $status.projectLifecycle.blocked -cne $false -or $status.projectLifecycle.pending -or !(BootstrapIdle $status.panelBootstrap)) { throw 'owned_native_daemon_status_refused' }
        $body=@{name='inspect_native_fixture_attempt';arguments=@{stageId=$script:lease.stageId}} | ConvertTo-Json -Compress
        $content=[Net.Http.StringContent]::new($body,[Text.Encoding]::UTF8,'application/json')
        try { $reply=$client.PostAsync($baseUrl+'/tools/call',$content).GetAwaiter().GetResult();$reply.EnsureSuccessStatusCode() | Out-Null;$answer=$reply.Content.ReadAsStringAsync().GetAwaiter().GetResult() | ConvertFrom-Json -DateKind String } finally { $content.Dispose() }
        $texts=@($answer.result.content | Where-Object { $_.type -eq 'text' })
        if (!$answer.ok -or $answer.result.isError -or $texts.Count -ne 1) { throw 'owned_native_registration_refused' }
        $registered=$texts[0].text | ConvertFrom-Json -DateKind String
        if ($registered.stageId -cne $script:lease.stageId -or $registered.verificationScope -cne 'current_private_issuer_and_durable_ledger' -or $registered.launch.sha256 -cne $stage[0].pins.launch.valueSha256 -or $registered.reservation.sha256 -cne $stage[0].pins.reservation.valueSha256) { throw 'owned_native_registration_refused' }
        $after=$client.GetStringAsync($baseUrl+'/dev/status').GetAwaiter().GetResult() | ConvertFrom-Json -DateKind String
        if (!$after.ok -or $after.humanGuardRuntime.pid -ne $profile.daemon.identity.pid -or $after.startedAt -cne $profile.daemon.startedAt -or $after.humanGuardRuntime.sourceSha256 -cne $profile.daemon.loadedRuntimeSha256 -or $after.pendingCommands -ne 0 -or @($after.inflightCommands).Count -ne 0 -or $null -ne $after.activeEditSession -or $after.projectLifecycle.blocked -cne $false -or $after.projectLifecycle.pending -or !(BootstrapIdle $after.panelBootstrap)) { throw 'owned_native_daemon_status_changed' }
      } finally { $client.Dispose();$token=$null }
    }
    if ([OwnedNative]::Hash($stream) -cne $script:lease.profileRawSha256 -or [OwnedNative]::FileIdentity($stream) -cne $id -or [DateTimeOffset]::UtcNow -ge [DateTimeOffset]::Parse($profile.expiresAt)) { throw 'owned_native_lease_changed' }
    $again=[IO.FileStream]::new($resolved,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
    try { if ([OwnedNative]::FileIdentity($again) -cne $id -or [OwnedNative]::Hash($again) -cne $script:lease.profileRawSha256) { throw 'owned_native_lease_replaced' };if ($null -ne $script:effectKind) { $script:effectLease=$again;$again=$null } } finally { if ($null -ne $again) { $again.Dispose() } }
    $script:profileIdentity=$id
  } finally { $stream.Dispose() }
}
$handle = [IntPtr]::Zero
$image = $null
$expected = $null
$effect = $false
$sequence = 0
$script:witnessLocks=@()
try {
  while ($null -ne ($line = [Console]::ReadLine())) {
    try {
      if ($line.Length -gt 65536) { throw 'owned_rpc_budget' }
      $row = $line | ConvertFrom-Json -DateKind String
      if ($row.op -eq 'fixture') {
        Exact $row @('op','kind','deadlineMs')
        if ($sequence -ne 0 -or $row.kind -notin @('graceful','stubborn','headless','exit259') -or $row.deadlineMs -lt 500 -or $row.deadlineMs -gt 30000) { throw 'owned_fixture_schema' }
        [OwnedNative]::Fixture($row.kind,[int]$row.deadlineMs); break
      }
      if ($row.op -eq 'open') {
        Exact $row @('op','identity','protected','mode','authority')
        if ($sequence -ne 0 -or $row.mode -notin @('inspect','close')) { throw 'owned_open_once' }
        $expected=$row.identity
        $script:lease=$row.authority
        Exact $script:lease @('profilePath','profileRawSha256','generation','runId','stageId','expiresAt')
        Exact $expected @('pid','birthFileTime','birthUtc','imagePath','executableSha256')
        if ($expected.pid -lt 1 -or $expected.pid -gt 2147483647 -or $expected.birthFileTime -cnotmatch '^[0-9]{17,19}$' -or $expected.birthUtc -cnotmatch '^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{7}Z$' -or $expected.executableSha256 -cnotmatch '^[a-f0-9]{64}$') { throw 'owned_identity_schema' }
        foreach ($p in $row.protected) { if ($p.pid -eq $expected.pid) { throw 'owned_protected_pid' } }
        $handle=[OwnedNative]::Open([int]$expected.pid,($row.mode -eq 'close'))
        $actual=[OwnedNative]::Identity($handle)
        if ($actual.pid -ne $expected.pid -or $actual.birthFileTime -cne $expected.birthFileTime -or $actual.birthUtc -cne $expected.birthUtc -or $actual.imagePath -ine $expected.imagePath) { throw 'owned_identity_mismatch' }
        $image=[IO.FileStream]::new($actual.imagePath,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
        $actual.executableSha256=[OwnedNative]::Hash($image)
        if ($actual.executableSha256 -cne $expected.executableSha256) { throw 'owned_image_hash_mismatch' }
        $effect=$row.mode -eq 'close';$sequence++
        ProfileFile
        Emit @{ok=$true;identity=$actual;wait=[OwnedNative]::Wait($handle,0)}
        continue
      }
      if ($handle -eq [IntPtr]::Zero) { throw 'owned_handle_required' }
      if ($row.op -eq 'dispose') { Exact $row @('op'); Emit @{ok=$true};break }
      if ($row.op -eq 'wait') {
        Exact $row @('op','milliseconds')
        if ($row.milliseconds -lt 0 -or $row.milliseconds -gt 30000) { throw 'owned_wait_budget' }
        Emit @{ok=$true;wait=[OwnedNative]::Wait($handle,[uint32]$row.milliseconds)};continue
      }
      $identity=[OwnedNative]::Identity($handle)
      if ($identity.pid -ne $expected.pid -or $identity.birthFileTime -cne $expected.birthFileTime -or $identity.birthUtc -cne $expected.birthUtc -or $identity.imagePath -ine $expected.imagePath -or [OwnedNative]::Hash($image) -cne $expected.executableSha256) { throw 'owned_identity_drift' }
      if ($row.op -eq 'inspect') { Exact $row @('op');Emit @{ok=$true;windows=[OwnedNative]::Windows($handle,[int]$expected.pid);wait=[OwnedNative]::Wait($handle,0)};continue }
      if (!$effect) { throw 'owned_effect_forbidden' }
      if ($row.op -eq 'graceful') {
        Exact $row @('op','hwnd')
        if ($script:closedOnce) { throw 'owned_graceful_consumed' };$script:closedOnce=$true
        $script:effectKind='graceful'
        try { [void][OwnedNative]::Graceful($handle,[int]$expected.pid,[string]$row.hwnd,[Action]{ ProfileFile },[string]$script:lease.expiresAt) } finally { ReleaseLeaseLocks }
        Emit @{ok=$true;status='wm_close_submitted';exitProven=$false};continue
      }
      if ($row.op -eq 'force') {
        Exact $row @('op')
        if ($script:forcedOnce) { throw 'owned_force_consumed' };$script:forcedOnce=$true
        $script:effectKind='force'
        try { [OwnedNative]::Force($handle,[Action]{ ProfileFile },[string]$script:lease.expiresAt) } finally { ReleaseLeaseLocks };Emit @{ok=$true;status='termination_submitted';exitProven=$false};continue
      }
      throw 'owned_rpc_operation'
    } catch {
      $code='owned_native_api_refused'
      $reason=$_.Exception
      while ($null -ne $reason.InnerException) { $reason=$reason.InnerException }
      if ($reason.Message -cmatch '^owned_[a-z0-9_]+$') { $code=$reason.Message }
      Emit @{ok=$false;code=$code};break
    }
  }
} finally {
  ReleaseLeaseLocks
  if ($null -ne $image) { $image.Dispose() }
  if ($handle -ne [IntPtr]::Zero) { [OwnedNative]::Dispose($handle) }
}
