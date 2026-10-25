# Offline production C# metadata methods + actual resource foreach. All kernel
# entry points below are managed synthetic ports; no native API/helper factory.
$ErrorActionPreference='Stop'
$file=Join-Path $PSScriptRoot 'owned-runtime-daemon-helper.ps1'
$text=[IO.File]::ReadAllText($file);$errors=$null;$tokens=$null
$ast=[Management.Automation.Language.Parser]::ParseFile($file,[ref]$tokens,[ref]$errors)
if($errors.Count){throw 'directory_metadata_parser_failed'}
foreach($name in @('Canon','HashText')){
 $fn=$ast.Find({param($n)$n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -ceq $name}.GetNewClosure(),$true)
 Invoke-Expression $fn.Extent.Text
}
$metadata=$text.Substring($text.IndexOf(' static object Metadata('));$metadata=$metadata.Substring(0,$metadata.IndexOf("`n static void Error"))
$structs=($text -split "`n"|Where-Object {$_ -match '\] struct (FI|FB|SA) \{'}) -join "`n"
$ports=@'
 public static uint Dev=1,Ino=2;
 public static long DirectorySize=4096,FileSize=4096,MtimeNs=100,CtimeNs=200;
 static bool GetFileInformationByHandle(IntPtr h,out FI f){ulong n=(ulong)(h==new IntPtr(42)?DirectorySize:FileSize);f=new FI{volume=Dev,il=Ino,sh=(uint)(n>>32),sl=(uint)n};return true;}
 static bool GetFileInformationByHandleEx(IntPtr h,int c,out FB f,uint n){f=new FB{write=116444736000000000L+MtimeNs/100,change=116444736000000000L+CtimeNs/100};return true;}
 static IntPtr CreateFileW(string p,uint a,uint s,ref SA sa,uint c,uint f,IntPtr t){return new IntPtr(42);}
 static bool CloseHandle(IntPtr h){return true;}
 static void Error(){throw new InvalidOperationException("synthetic_metadata_failed");}
 public static object RawDirectoryMetadata(){return Metadata(new IntPtr(42));}
 public static string Hash(Stream s){s.Position=0;using(var h=SHA256.Create())return BitConverter.ToString(h.ComputeHash(s)).Replace("-","").ToLowerInvariant();}
'@
Add-Type -TypeDefinition ("using System;using System.IO;using System.Globalization;using System.Runtime.InteropServices;using System.Security.Cryptography;public static class OwnedDaemonKernel {`n"+$structs+"`n"+$metadata+"`n"+$ports+"`n}")
$final=$ast.Find({param($n)$n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -ceq 'AssertMigrationFinal'},$true)
$loop=$final.Find({param($n)$n -is [Management.Automation.Language.ForEachStatementAst] -and $n.Condition.Extent.Text -ceq '$projection.manifest.readSet.files'},$true)
if(!$loop){throw 'directory_metadata_actual_foreach_missing'}
$parent=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../.codex-runtime/core-directory-metadata-smoke'))
$root=Join-Path $parent ([Guid]::NewGuid().ToString());$checks=0
try{
 $source=Join-Path $root 'legacy';$directory=Join-Path $source '.codex-runtime/project-intent';[void][IO.Directory]::CreateDirectory($directory)
 $names=@('project-intent-state.json','project-intent-state.json.lifecycle-initialized.json')
 foreach($name in $names){[IO.File]::WriteAllText((Join-Path $directory $name),'synthetic content')}
 # Rebind only the fixed SOURCE containment literal to this owned fixture.
 $code=$loop.Extent.Text.Replace("C:\Users\Ant\Documents\Codex\AE_agent\",$source+[IO.Path]::DirectorySeparatorChar)
 $expected=@{dev='1';ino='2';size='0';mtimeNs='100';ctimeNs='200'}
 $row=[pscustomobject]@{path=$directory;kind='directory';objectId=$expected;names=$names;sortedNamesSha256=(HashText (Canon $names))}
 $projection=@{manifest=@{readSet=@{files=@($row)}}};$script:locks=@()
 if(([OwnedDaemonKernel]::RawDirectoryMetadata()).size -cne '4096'){throw 'raw_directory_4096_fixture_missing'}
 if(([OwnedDaemonKernel]::DirectoryMetadata($directory)).size -cne '0'){throw 'directory_zero_representation_failed'}
 Invoke-Expression $code;$checks++
 foreach($field in @('Dev','Ino','MtimeNs','CtimeNs')){
  switch($field){'Dev'{[OwnedDaemonKernel]::Dev=3}'Ino'{[OwnedDaemonKernel]::Ino=4}'MtimeNs'{[OwnedDaemonKernel]::MtimeNs=300}'CtimeNs'{[OwnedDaemonKernel]::CtimeNs=400}}
  $caught=$null;try{Invoke-Expression $code}catch{$caught=$_.Exception.Message}
  if($caught -cne 'owned_core_migration_resource_namespace_changed'){throw ('directory_field_not_fenced_'+$field)}
  [OwnedDaemonKernel]::Dev=1;[OwnedDaemonKernel]::Ino=2;[OwnedDaemonKernel]::MtimeNs=100;[OwnedDaemonKernel]::CtimeNs=200;$checks++
 }
 [IO.File]::WriteAllText((Join-Path $directory 'foreign.json'),'new guard');$caught=$null;try{Invoke-Expression $code}catch{$caught=$_.Exception.Message}
 if($caught -cne 'owned_core_migration_resource_namespace_changed'){throw 'directory_names_not_fenced'}
 [IO.File]::Delete((Join-Path $directory 'foreign.json'));$checks++
 # FILE metadata must retain the raw size and reject a mismatched signed size.
 function SafeFile([string]$p,[bool]$image=$false){return [IO.FileStream]::new($p,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)}
 $data=Join-Path $directory 'project-intent-state.json';$stream=SafeFile $data
 try{$sha=[OwnedDaemonKernel]::Hash($stream);if(([OwnedDaemonKernel]::FileMetadata($stream)).size -cne '4096'){throw 'file_size_was_normalized'}}finally{$stream.Dispose()}
 $fileIdentity=@{dev='1';ino='2';size='0';mtimeNs='100';ctimeNs='200'}
 $projection.manifest.readSet.files=@([pscustomobject]@{path=$data;kind='file';objectId=$fileIdentity;rawSha256=$sha})
 $caught=$null;try{Invoke-Expression $code}catch{$caught=$_.Exception.Message}
 if($caught -cne 'owned_core_migration_resource_changed'){throw 'file_size_mismatch_not_fenced'};$checks++
 $fileIdentity.size='4096';Invoke-Expression $code;foreach($s in $script:locks){$s.Dispose()};$script:locks=@();$checks++
 [OwnedDaemonKernel]::FileSize=8192;$caught=$null;try{Invoke-Expression $code}catch{$caught=$_.Exception.Message}
 if($caught -cne 'owned_core_migration_resource_changed'){throw 'file_size_drift_not_fenced'};$checks++
 Write-Output (ConvertTo-Json -Compress @{ok=$true;checks=$checks;scope='production_metadata_methods_and_resource_foreach_with_managed_kernel_ports';rawDirectorySize=4096;nodeDirectorySize=0;fileSizesUnchanged=$true;nativeCalls=0;liveProof=$false})
}finally{
 foreach($s in $script:locks){$s.Dispose()}
 if(!$root.StartsWith($parent+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'directory_metadata_cleanup_path'}
 if(Test-Path -LiteralPath $root){Remove-Item -LiteralPath $root -Force -Recurse}
}
