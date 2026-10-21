# Data-only extracted native predecessor verifier. No helper entry point,
# Win32 API, HTTP listener, process termination or production filesystem writes.
$ErrorActionPreference='Stop'
$text=[IO.File]::ReadAllText((Join-Path $PSScriptRoot 'owned-runtime-daemon-helper.ps1'));$tokens=$null;$errors=$null
$ast=[Management.Automation.Language.Parser]::ParseInput($text,[ref]$tokens,[ref]$errors);if($errors.Count){throw 'offline_helper_parse_failed'}
Add-Type -TypeDefinition @'
using System;using System.IO;using System.Security.Cryptography;
public static class OwnedDaemonKernel {public static string Hash(Stream s){long p=s.Position;s.Position=0;try{return Convert.ToHexString(SHA256.HashData(s)).ToLowerInvariant();}finally{s.Position=p;}}}
'@
foreach($name in @('Exact','Canon','HashText','Hmac','SignedActivationValue','AssertGracefulContinuationPredecessor')){$fn=$ast.Find({param($n)$n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -ceq $name},$true);if(!$fn){throw 'offline_function_missing'};Invoke-Expression $fn.Extent.Text}
$json=& node (Join-Path $PSScriptRoot 'owned-runtime-graceful-continuation-smoke.js') --native-fixture;if($LASTEXITCODE -ne 0){throw 'offline_fixture_failed'}
$fixture=$json|ConvertFrom-Json -DateKind String;$repo=$fixture.root;$base=$fixture.base;$token=$fixture.key;$schema='ae-agent.owned-runtime-supervisor.v1';$intentText=[IO.File]::ReadAllText((Join-Path $fixture.dir 'intent.json'))
$original=@{};foreach($name in @('once','submission','exit-result','final-inventory','seal')){$original[$name]=[IO.File]::ReadAllText((Join-Path $fixture.dir ($name+'.json')))}
# These adapters use owned temp files. They model raw pinning, not Win32
# denied-write/delete sharing; canonical SafeFile/kernel tests cover that layer.
function SafeFile([string]$file){return [IO.MemoryStream]::new([IO.File]::ReadAllBytes($file))}
function ReadJson([string]$file,[string]$rawPin=$null,[bool]$keep=$false){$stream=SafeFile $file;try{if($rawPin -and [OwnedDaemonKernel]::Hash($stream) -cne $rawPin){throw 'offline_raw_pin_changed'};return [IO.File]::ReadAllText($file)|ConvertFrom-Json -DateKind String}finally{$stream.Dispose()}}
function Envelope([string]$file,[bool]$keep=$false){$name=[IO.Path]::GetFileNameWithoutExtension($file);$row=if($file -eq (Join-Path $fixture.dir 'intent.json')){$script:intent}elseif($file.StartsWith($fixture.dir+[IO.Path]::DirectorySeparatorChar) -and $script:rows.ContainsKey($name)){$script:rows[$name]}else{ReadJson $file};if($row.sha256 -cne (HashText (Canon $row.value))){throw 'offline_envelope_hash_changed'};return $row}
function Reservation([string]$generation,[bool]$fresh){$dir=Join-Path $base ('daemon-reservations/'+$generation);return @{dir=$dir;reservation=(Envelope (Join-Path $dir 'reservation.json'));ticket=(Envelope (Join-Path $dir 'startup-ticket.json'))}}
function Seal($value){$data=@{};foreach($p in $value.PSObject.Properties){if($p.Name -cne 'authentication'){$data[$p.Name]=$p.Value}};$value.authentication=Hmac $data $token}
function Relink(){Seal $script:intent.value;$script:intent.sha256=HashText (Canon $script:intent.value);foreach($name in @('once','submission','exit-result','seal')){$row=$script:rows[$name];$row.value.intentSha256=$script:intent.sha256;if($name -ceq 'submission'){$row.value.onceSha256=$script:rows.once.sha256};if($name -ceq 'exit-result'){$row.value.submissionSha256=$script:rows.submission.sha256};if($name -ceq 'seal'){$row.value.onceSha256=$script:rows.once.sha256;$row.value.exitResultSha256=$script:rows['exit-result'].sha256};Seal $row.value;$row.sha256=HashText (Canon $row.value)};$script:v.source.intentSha256=$script:intent.sha256;$script:v.source.exitResultSha256=$script:rows['exit-result'].sha256;$script:v.source.gracefulContinuationReceiptSha256=$script:rows.seal.sha256}
$checks=[Collections.Generic.List[string]]::new()
function Run([string]$name,[scriptblock]$mutate,[bool]$reject){$script:intent=$intentText|ConvertFrom-Json -DateKind String;$script:rows=@{};foreach($n in $original.Keys){$script:rows[$n]=$original[$n]|ConvertFrom-Json -DateKind String};$script:locks=@();$script:v=[pscustomobject]@{kind='prior_verified_graceful_continuation';targetGeneration=$fixture.generation;predecessor=$script:intent.value.baseline.registrationRefs;sourceOperationId=$fixture.operationId;source=($fixture.proof|ConvertTo-Json -Depth 20|ConvertFrom-Json -DateKind String)};& $mutate;$failed=$false;try{AssertGracefulContinuationPredecessor $script:v $token}catch{$failed=$true;if(!$reject){throw}}finally{foreach($stream in $script:locks){$stream.Dispose()}};if($failed -ne $reject){throw ('offline_wrong_verdict_'+$name)};$checks.Add($name)}
try{
 Run 'distinct signed continuation receipt with late ACK, exact held exit and archived source/code accepted' {} $false
 Run 'wrong intent HMAC refuses' {$script:intent.value.authentication='0'*64} $true
 Run 'wrong typed seal HMAC refuses' {$script:rows.seal.value.authentication='0'*64;$script:rows.seal.sha256=HashText (Canon $script:rows.seal.value);$script:v.source.gracefulContinuationReceiptSha256=$script:rows.seal.sha256} $true
 Run 'foreign predecessor generation refuses' {$script:v.targetGeneration='00000000-0000-4000-8000-000000000001'} $true
 Run 'foreign new operation refuses' {$script:v.sourceOperationId='00000000-0000-4000-8000-000000000001'} $true
 Run 'generic prior shutdown disguise refuses' {$script:v.source.priorShutdownReceiptSha256='a'*64} $true
 Run 'separately signed unproven HANDLE refuses' {$script:rows['exit-result'].value.wait.waitResult='WAIT_TIMEOUT';$script:rows['exit-result'].value.wait.signaled=$false;Relink} $true
 Run 'separately signed wrong daemon birth refuses' {$script:rows['exit-result'].value.identity.birthFileTime='1';Relink} $true
 Run 'separately signed force/resource release disposition refuses' {$script:intent.value.baseline.disposition.forceUsed=$true;Relink} $true
 Run 'changed late drain ACK reference refuses' {$script:v.source.drainAckSha256='b'*64} $true
 Run 'changed new shutdown ACK reference refuses' {$script:v.source.shutdownAckSha256='b'*64} $true
 foreach($item in @(@('code-files/0.json','captured helper'),@('source-files/mcp-server/bridge-daemon.js.json','captured runtime'))){$file=Join-Path $fixture.dir $item[0];$raw=[IO.File]::ReadAllBytes($file);try{[IO.File]::WriteAllText($file,'{}');Run ($item[1]+' drift refuses') {} $true}finally{[IO.File]::WriteAllBytes($file,$raw)}}
 $old=Join-Path $base ('supervisor-operations/'+$fixture.originalOperationId+'/unknown.json');$raw=[IO.File]::ReadAllBytes($old);try{[IO.File]::WriteAllText($old,'{}');Run 'original UNKNOWN corruption refuses' {} $true}finally{[IO.File]::WriteAllBytes($old,$raw)}
 if($text.IndexOf("if(`$v.kind -ceq 'prior_verified_graceful_continuation'){AssertGracefulContinuationPredecessor `$v `$token}") -lt 0 -or $text.IndexOf('AssertActivationSuccessorConfiguration $r $config.token $info.Environment') -gt $text.IndexOf('StartIndependent(', $text.IndexOf('function AssertActivationSuccessorConfiguration'))){throw 'offline_last_guard_missing_or_late'}
 $fn=$ast.Find({param($n)$n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -ceq 'AssertGracefulContinuationPredecessor'},$true);if($fn.Extent.Text -match '::Force\(|::StartIndependent\(|OpenProcess|Invoke-Expression|Start-Process'){throw 'offline_verifier_has_native_effect'};$checks.Add('AST: exact typed verifier before launch; data-only code, no ignored import/native effect')
 @{ok=$true;cases=$checks.Count;checks=@($checks);scope='extracted native data verifier; invented temp records; supplied FS adapters, no native calls'}|ConvertTo-Json -Depth 4
}finally{$temp=[IO.Path]::GetFullPath([IO.Path]::GetTempPath());$target=[IO.Path]::GetFullPath($repo);if(!$target.StartsWith($temp,[StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($target) -cnotmatch '^owned-supervisor-'){throw 'offline_cleanup_root_refused'};Remove-Item -LiteralPath $target -Recurse -Force}
