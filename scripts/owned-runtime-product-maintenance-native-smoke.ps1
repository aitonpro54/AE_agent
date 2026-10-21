# Extracted data-only predecessor verifier, invented signed temp-root records.
# No production helper entry point, native APIs, network or process controls.
$ErrorActionPreference='Stop'
$helper=Join-Path $PSScriptRoot 'owned-runtime-daemon-helper.ps1'
$text=[IO.File]::ReadAllText($helper);$tokens=$null;$errors=$null
$ast=[Management.Automation.Language.Parser]::ParseInput($text,[ref]$tokens,[ref]$errors)
if($errors.Count){throw 'offline_helper_parse_failed'}
Add-Type -TypeDefinition @'
using System;using System.IO;using System.Security.Cryptography;
public static class OwnedDaemonKernel {public static string Hash(Stream s){long p=s.Position;s.Position=0;try{return Convert.ToHexString(SHA256.HashData(s)).ToLowerInvariant();}finally{s.Position=p;}}}
'@
foreach($name in @('Exact','Canon','HashText','Hmac','SignedActivationValue','AssertProductMaintenancePredecessor')){
 $fn=$ast.Find({param($n)$n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -ceq $name},$true)
 if(!$fn){throw 'offline_function_missing'};Invoke-Expression $fn.Extent.Text
}
$fixtureScript=Join-Path $PSScriptRoot 'owned-runtime-product-maintenance-smoke.js'
$json=& node $fixtureScript --native-fixture
if($LASTEXITCODE -ne 0){throw 'offline_signed_fixture_failed'}
$fixture=$json|ConvertFrom-Json -DateKind String;$repo=$fixture.root;$base=$fixture.base;$token=$fixture.key;$schema='ae-agent.owned-runtime-supervisor.v1'
$grantFile=Join-Path $fixture.dir 'grant.json';$grantText=[IO.File]::ReadAllText($grantFile)
$original=@{};foreach($name in @('once','force-intent','native-attempt','exit-result','post-exit','retired-source')){$original[$name]=[IO.File]::ReadAllText((Join-Path $fixture.dir ($name+'.json')))}
# Filesystem adapters intentionally do not model held Win32 file identity; those
# primitives are covered by the existing daemon helper and draft native tests.
function SafeFile([string]$file){return [IO.MemoryStream]::new([IO.File]::ReadAllBytes($file))}
function ReadJson([string]$file,[string]$rawPin=$null,[bool]$keep=$false){$stream=SafeFile $file;try{if($rawPin -and [OwnedDaemonKernel]::Hash($stream) -cne $rawPin){throw 'offline_raw_pin_changed'};if($file -eq $grantFile){return $script:grant};return [IO.File]::ReadAllText($file)|ConvertFrom-Json -DateKind String}finally{$stream.Dispose()}}
function Envelope([string]$file,[bool]$keep=$false){$name=[IO.Path]::GetFileNameWithoutExtension($file);$row=if($file.StartsWith($fixture.dir+[IO.Path]::DirectorySeparatorChar) -and $script:rows.ContainsKey($name)){$script:rows[$name]}else{[IO.File]::ReadAllText($file)|ConvertFrom-Json -DateKind String};if($row.sha256 -cne (HashText (Canon $row.value))){throw 'offline_envelope_hash_changed'};return $row}
function Reservation([string]$generation,[bool]$fresh){$dir=Join-Path $base ('daemon-reservations/'+$generation);return @{dir=$dir;reservation=(Envelope (Join-Path $dir 'reservation.json'))}}
function Seal($value){$data=@{};foreach($p in $value.PSObject.Properties){if($p.Name -cne 'authentication'){$data[$p.Name]=$p.Value}};$value.authentication=Hmac $data $token}
function Relink(){foreach($name in @('exit-result','post-exit','retired-source')){
 if($name -ceq 'post-exit'){$script:rows[$name].value.exitResultSha256=$script:rows['exit-result'].sha256}
 if($name -ceq 'retired-source'){$script:rows[$name].value.exitResultSha256=$script:rows['exit-result'].sha256;$script:rows[$name].value.postExitSha256=$script:rows['post-exit'].sha256}
 Seal $script:rows[$name].value;$script:rows[$name].sha256=HashText (Canon $script:rows[$name].value)
};$script:v.source.exitResultSha256=$script:rows['exit-result'].sha256;$script:v.source.productMaintenanceReceiptSha256=$script:rows['retired-source'].sha256}
$checks=[Collections.Generic.List[string]]::new()
function Run([string]$case,[scriptblock]$mutate,[bool]$reject){
 $script:locks=@();$script:grant=$grantText|ConvertFrom-Json -DateKind String;$script:rows=@{};foreach($name in $original.Keys){$script:rows[$name]=$original[$name]|ConvertFrom-Json -DateKind String}
 $script:v=[pscustomobject]@{targetGeneration=$fixture.generation;predecessor=$script:grant.baseline.registrationRefs;sourceOperationId=$script:rows.once.value.operationId;source=[pscustomobject]@{intentSha256=$script:rows['force-intent'].sha256;exitResultSha256=$script:rows['exit-result'].sha256;drainAckSha256=$script:grant.baseline.drain.ackSha256;shutdownAckSha256=$null;priorShutdownReceiptSha256=$null;productMaintenanceReceiptSha256=$script:rows['retired-source'].sha256}}
 & $mutate;$failed=$false;try{AssertProductMaintenancePredecessor $script:v $token}catch{$failed=$true}finally{foreach($stream in $script:locks){$stream.Dispose()}}
 if($failed -ne $reject){throw ('offline_wrong_verdict_'+$case)};$checks.Add($case)
}
try{
 Run 'full signed activation-root forced receipt with captured3code bytes accepted' {} $false
 Run 'wrong HMAC refuses' {$script:grant.authentication='0'*64} $true
 Run 'separately signed forceConsent false refuses' {$script:grant.forceConsent=$false;Seal $script:grant} $true
 Run 'wrong generation refuses' {$script:v.targetGeneration='00000000-0000-4000-8000-000000000001'} $true
 Run 'changed once operation refuses' {$script:v.sourceOperationId='00000000-0000-4000-8000-000000000001'} $true
 Run 'signed unproven daemon HANDLE refuses' {$script:rows['exit-result'].value.wait.waitResult='WAIT_TIMEOUT';$script:rows['exit-result'].value.wait.signaled=$false;Relink} $true
 Run 'signed unknown console HANDLE refuses' {$script:rows['exit-result'].value.consoleHost.wait.waitResult='WAIT_FAILED';Relink} $true
 Run 'signed foreign console record refuses' {$script:rows['exit-result'].value.consoleHost.record.identity.pid++;Relink} $true
 Run 'signed resource release disposition refuses' {$script:rows['exit-result'].value.disposition.resourceFencesReleased=$true;Relink} $true
 $snapshot=Join-Path $fixture.dir 'code-files/2.json';$raw=[IO.File]::ReadAllBytes($snapshot)
 try{[IO.File]::WriteAllText($snapshot,'{}');Run 'missing target-selector bytes refuses' {} $true}finally{[IO.File]::WriteAllBytes($snapshot,$raw)}
 if($text.IndexOf('AssertProductMaintenancePredecessor $v $token') -gt $text.IndexOf('StartIndependent(', $text.IndexOf('function AssertActivationSuccessorConfiguration'))){throw 'offline_native_predecessor_guard_late'}
 $checks.Add('AST: typed predecessor guard precedes launch; verifier contains no native/process effect')
 @{ok=$true;scope='extracted data-only verifier; invented signed temp-root records; mocked filesystem pin adapters';cases=$checks.Count;checks=@($checks)}|ConvertTo-Json -Depth 4
}finally{
 $temp=[IO.Path]::GetFullPath([IO.Path]::GetTempPath());$target=[IO.Path]::GetFullPath($repo)
 if(!$target.StartsWith($temp,[StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($target) -cnotmatch '^owned-supervisor-'){throw 'offline_cleanup_root_refused'}
 Remove-Item -LiteralPath $target -Recurse -Force
}
