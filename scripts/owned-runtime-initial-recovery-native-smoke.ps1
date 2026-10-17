# Evaluate the actual preflight function with invented identities and mocked
# file/CIM/TCP adapters. No production reads, process queries or native effects.
$ErrorActionPreference='Stop'
$tokens=$null;$parseErrors=$null
$helper=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'owned-runtime-daemon-helper.ps1'))
$ast=[Management.Automation.Language.Parser]::ParseFile($helper,[ref]$tokens,[ref]$parseErrors)
if($parseErrors.Count){throw 'helper_ast_invalid'}
$fn=$ast.Find({param($n)$n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -ceq 'InitialRecoveryLease'},$true)
if(!$fn){throw 'preflight_missing'}
Add-Type -TypeDefinition @'
using System;using System.IO;
public static class OwnedDaemonKernel {
 public static string[] arguments;
 public static string Hash(Stream s){return "raw";}
 public static string[] Args(string s){return arguments;}
}
'@
$repo='C:\offline-initial-fixture';$base=Join-Path $repo '.codex-runtime/owned-runtime-maintenance';$node='C:\offline\node.exe'
$generation='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';$old='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';$op='cccccccc-cccc-4ccc-8ccc-cccccccccccc'
$now=[DateTimeOffset]::UtcNow
$cap=[pscustomobject]@{schema='ae-agent.owned-runtime-initial-recovery.v1.authority';mode='ordinary_initial_after_abandoned_startup';generation=$generation;authentication='signed';authorizationRef=[pscustomobject]@{source='explicit_user_chat';reference='dddddddd-dddd-4ddd-8ddd-dddddddddddd:initial-startup-recovery-20261017'};resetAnchor='1206e57f6dcc5823ffb7ea5dc0ce69d7360b9a51';historicalOutcome='unknown';historicalExitProven=$false;retainedAdmissionGranted=$false;replayAllowed=$false;issuedAt=$now.AddMinutes(-1).ToString('o');expiresAt=$now.AddMinutes(9).ToString('o');policyRawSha256='raw';configRawSha256='raw';operationId=$op;original=[pscustomobject]@{generation=$old;ticketExpiresAt=$now.AddMinutes(-10).ToString('o');kernelIdentity=[pscustomobject]@{pid=2000;birthUtc=$now.AddMinutes(-20).ToString('o');birthFileTime=$now.AddMinutes(-20).UtcDateTime.ToFileTimeUtc().ToString()};files=@()};history=@()}
$key=[pscustomobject]@{operationId=$op;successorGeneration=$generation;authorityRawSha256='raw'}
function Canon($value){return ConvertTo-Json -InputObject $value -Depth 30 -Compress}
function Envelope($file,$keep){if($file.EndsWith('initial-recovery-authority.json')){return [pscustomobject]@{value=$cap}};return [pscustomobject]@{value=$key}}
function Config {return @{token='invented-test-value'}}
function Hmac($value,$token){return 'signed'}
function ReadJson($file,$pin,$keep){return @{}}
function SafeFile($file){return [IO.MemoryStream]::new([byte[]]@(1))}
function SourcePins($pins){}
function Test-Path {param($LiteralPath);return $false}
function Get-ChildItem {param($LiteralPath,[switch]$Force);if($LiteralPath.EndsWith('daemon-reservations')){return @([pscustomobject]@{Name=$old},[pscustomobject]@{Name=$generation})};return @('native-candidate.json','registration.json','reservation.json','startup-ticket.json')|ForEach-Object {[pscustomobject]@{Name=$_}}}
[OwnedDaemonKernel]::arguments=@($node,(Join-Path $repo 'scripts/owned-runtime-initial-recovery.js'),'recover-once')
$self=[pscustomobject]@{ProcessId=$PID;ParentProcessId=1000;ExecutablePath='C:\offline\pwsh.exe';CommandLine='own helper';CreationDate=$now.UtcDateTime}
$controller=[pscustomobject]@{ProcessId=1000;ParentProcessId=999;ExecutablePath=$node;CommandLine='own controller';CreationDate=$now.UtcDateTime}
$script:scenario='valid';$script:locks=@()
function Get-CimInstance {param($ClassName,$Filter,$ErrorAction)
 if($script:scenario -eq 'cim-error'){throw 'offline_cim_refused'}
 $rows=@($self,$controller)
 if($script:scenario -eq 'old-helper'){$rows+=@([pscustomobject]@{ProcessId=2001;ParentProcessId=999;ExecutablePath='C:\offline\pwsh.exe';CommandLine='pwsh owned-runtime-daemon-helper.ps1';CreationDate=$now.UtcDateTime})}
 if($script:scenario -eq 'old-controller'){$rows+=@([pscustomobject]@{ProcessId=2002;ParentProcessId=999;ExecutablePath=$node;CommandLine='node mcp-adapter.js';CreationDate=$now.AddMinutes(-30).UtcDateTime})}
 if($script:scenario -eq 'unknown-command'){$rows+=@([pscustomobject]@{ProcessId=2003;ParentProcessId=999;ExecutablePath=$node;CommandLine=$null;CreationDate=$now.UtcDateTime})}
 return $rows
}
function Get-NetTCPConnection {param($ErrorAction)
 if($ErrorAction -cne 'Stop'){throw 'tcp_fail_closed_required'}
 if($script:scenario -eq 'tcp-error'){throw 'offline_tcp_refused'}
 if($script:scenario -eq 'listener'){return [pscustomobject]@{State='Listen';LocalPort=3456}}
 return @()
}
Invoke-Expression $fn.Extent.Text
$checks=0
try{
 [void](InitialRecoveryLease $generation);$checks++
 foreach($scenario in @('cim-error','old-helper','old-controller','unknown-command','tcp-error','listener')){
  $script:scenario=$scenario;$refused=$false
  try{[void](InitialRecoveryLease $generation)}catch{$refused=$true}
  if(!$refused){throw ('expected_refusal_'+$scenario)};$checks++
 }
 [pscustomobject]@{ok=$true;checks=$checks;scope='actual preflight AST with mocked adapters';nativeEffects=0}|ConvertTo-Json -Compress
}finally{foreach($stream in $script:locks){$stream.Dispose()}}
