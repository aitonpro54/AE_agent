# Actual helper AST/body with only the global process-query port replaced.
# No native helper, process census, AE, CEP, HTTP, launch or production state.
$ErrorActionPreference='Stop'
$tokens=$null;$parseErrors=$null
$helper=Join-Path $PSScriptRoot 'owned-runtime-daemon-helper.ps1'
$ast=[Management.Automation.Language.Parser]::ParseFile($helper,[ref]$tokens,[ref]$parseErrors)
if($parseErrors.Count){throw 'activation_helper_ast_invalid'}
$fn=$ast.Find({param($n)$n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -ceq 'AssertActivationNativeQuiet'},$true)
if(!$fn){throw 'activation_quiet_function_missing'}
$text=$fn.Extent.Text
$port='[Diagnostics.Process]::GetProcessesByName($name)'
if(($text.Split($port)).Count -ne 2){throw 'activation_process_query_port_changed'}
$text=$text.Replace($port,'(OfflineOwners $name)')
$script:owner=$null;$script:unknown=$false;$script:free=$true;$script:held=$true;$script:checks=0;$script:queries=0;$script:disposed=0
function AssertController {if(!$script:held){throw 'owned_supervisor_controller_lease_lost'}}
function EndpointFree {return $script:free}
function OfflineOwners($name){$script:queries++;if($script:unknown){throw 'offline_enumeration_unknown'};if($name -ceq $script:owner){return [pscustomobject]@{Dispose={}} | Add-Member -MemberType ScriptMethod -Name Dispose -Value {$script:disposed++} -Force -PassThru};return @()}
Invoke-Expression $text
AssertActivationNativeQuiet
if($script:queries -ne 12){throw 'activation_three_census_passes_required'};$script:checks++
foreach($owner in @('AfterFX','CEPHtmlEngine','aerender','Adobe Media Encoder')){
 $script:owner=$owner
 try{AssertActivationNativeQuiet;throw 'offline_expected_refusal'}catch{if($_.Exception.Message -cne 'owned_activation_native_owner_present'){throw}}
 $script:checks++
}
if($script:disposed -ne 4){throw 'activation_query_handles_not_disposed'}
$script:owner=$null;$script:unknown=$true
try{AssertActivationNativeQuiet;throw 'offline_expected_refusal'}catch{if($_.Exception.Message -cne 'offline_enumeration_unknown'){throw}};$script:checks++
$script:unknown=$false;$script:free=$false
try{AssertActivationNativeQuiet;throw 'offline_expected_refusal'}catch{if($_.Exception.Message -cne 'owned_supervisor_endpoint_occupied'){throw}};$script:checks++
$script:free=$true;$script:held=$false
try{AssertActivationNativeQuiet;throw 'offline_expected_refusal'}catch{if($_.Exception.Message -cne 'owned_supervisor_controller_lease_lost'){throw}};$script:checks++
$source=[IO.File]::ReadAllText($helper)
$guard=$source.IndexOf("`$binding.value.schema -ceq 'ae-agent.product-activation.v1.binding'")
$launch=$source.IndexOf('[OwnedDaemonKernel]::StartIndependent(', $guard)
if($guard -lt 0 -or $launch -le $guard -or !$source.Substring($guard,$launch-$guard).Contains('AssertActivationNativeQuiet')){throw 'activation_last_launch_guard_missing'};$script:checks++
$configFn=$ast.Find({param($n)$n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -ceq 'AssertActivationConfiguration'},$true)
if(!$configFn){throw 'activation_configuration_guard_missing'}
$repo='C:\offline-activation-fixture'
Invoke-Expression $configFn.Extent.Text
AssertActivationConfiguration @{}
AssertActivationConfiguration @{AE_BRIDGE_STATE_DIR=(Join-Path $repo '.codex-runtime/project-intent');AE_BRIDGE_LOG_DIR=(Join-Path $repo 'logs');AE_AGENT_HARDCORE_SESSION_DIR=(Join-Path $repo 'logs/hardcore-sessions')};$script:checks++
foreach($key in @('AE_BRIDGE_STATE_DIR','AE_BRIDGE_LOG_DIR','AE_AGENT_HARDCORE_SESSION_DIR')){try{AssertActivationConfiguration @{$key='C:\offline-foreign-root'};throw 'offline_expected_refusal'}catch{if($_.Exception.Message -cne 'owned_activation_runtime_redirect_refused'){throw}};$script:checks++}
try{AssertActivationConfiguration @{ae_agent_hardcore_session_dir=(Join-Path $repo 'logs/hardcore-sessions')};throw 'offline_expected_refusal'}catch{if($_.Exception.Message -cne 'owned_activation_runtime_redirect_refused'){throw}};$script:checks++
$configGuard=$source.LastIndexOf('AssertActivationConfiguration $info.Environment',$launch)
if($configGuard -lt 0 -or $configGuard -ge $launch -or !$source.Substring($configGuard,$launch-$configGuard).Contains('AssertActivationNativeQuiet')){throw 'activation_effective_environment_launch_guard_missing'};$script:checks++
foreach($name in @('SignedActivationValue','ActivationOrigin','AssertActivationSuccessorConfiguration')){$definition=$ast.Find({param($n)$n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -ceq $name},$true);if(!$definition){throw 'activation_successor_guard_missing'};Invoke-Expression $definition.Extent.Text}
$fixtureRoot=Join-Path ([IO.Path]::GetTempPath()) ('activation-native-'+[Guid]::NewGuid().ToString())
$fixtureFull=[IO.Path]::GetFullPath($fixtureRoot);if([IO.Path]::GetDirectoryName($fixtureFull) -ine [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') -or [IO.Path]::GetFileName($fixtureFull) -cnotmatch '^activation-native-[a-f0-9-]{36}$'){throw 'offline_fixture_root_invalid'}
try{
 $repo=$fixtureRoot;$base=Join-Path $repo '.codex-runtime/owned-runtime-maintenance';$schema='ae-agent.owned-runtime-supervisor.v1';$rootGeneration='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';$childGeneration='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';$rootOperation='cccccccc-cccc-4ccc-8ccc-cccccccccccc';$nextOperation='dddddddd-dddd-4ddd-8ddd-dddddddddddd';$script:rows=@{}
 function OfflineEnvelope($relative,$value,$sha='row'){$file=Join-Path $base $relative;[void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($file));[IO.File]::WriteAllText($file,'{}');$script:rows[$file]=[pscustomobject]@{value=[pscustomobject]$value;sha256=$sha};return $file}
 function Envelope($file,$keep){if(!$script:rows.ContainsKey($file)){throw 'offline_unexpected_envelope'};return $script:rows[$file]}
 function Hmac($data,$token){return 'signed'}
 $binding=OfflineEnvelope ('daemon-reservations/'+$rootGeneration+'/product-session-reset.json') @{schema='ae-agent.product-activation.v1.binding';generation=$rootGeneration;operationId=$rootOperation;intentSha256='intent'}
 $intent=OfflineEnvelope ('product-session-resets/'+$rootOperation+'/intent.json') @{schema='ae-agent.product-activation.v1.intent';generation=$rootGeneration;operationId=$rootOperation;authentication='signed'} 'intent'
 $exit=OfflineEnvelope ('supervisor-operations/'+$nextOperation+'/predecessor-exit.json') @{schema=$schema+'.predecessor-exit';operationId=$nextOperation;targetGeneration=$rootGeneration;authentication='signed'}
 $reservation=@{operationId=$nextOperation}
 AssertActivationSuccessorConfiguration $reservation 'offline' @{};$script:checks++
 try{AssertActivationSuccessorConfiguration $reservation 'offline' @{AE_BRIDGE_STATE_DIR='C:\foreign'};throw 'offline_expected_refusal'}catch{if($_.Exception.Message -cne 'owned_activation_runtime_redirect_refused'){throw}};$script:checks++
 $script:rows[$intent].value.authentication='invalid'
 try{AssertActivationSuccessorConfiguration $reservation 'offline' @{};throw 'offline_expected_refusal'}catch{if($_.Exception.Message -cne 'owned_activation_origin_signature_invalid'){throw}};$script:checks++;$script:rows[$intent].value.authentication='signed'
 [void](OfflineEnvelope ('daemon-succession/'+$childGeneration+'.json') @{schema=$schema+'.succession';successorGeneration=$childGeneration;anchor=[pscustomobject]@{initialGeneration=$rootGeneration};authentication='signed'})
 $script:rows[$exit].value.targetGeneration=$childGeneration
 try{AssertActivationSuccessorConfiguration $reservation 'offline' @{AE_AGENT_HARDCORE_SESSION_DIR='C:\foreign'};throw 'offline_expected_refusal'}catch{if($_.Exception.Message -cne 'owned_activation_runtime_redirect_refused'){throw}};$script:checks++
 $script:rows[$binding].value.schema='ae-agent.product-session-reset.v1.binding'
 try{AssertActivationSuccessorConfiguration $reservation 'offline' @{};throw 'offline_expected_refusal'}catch{if($_.Exception.Message -cne 'owned_activation_origin_invalid'){throw}};$script:checks++
 $script:rows[$intent].value.schema='ae-agent.product-session-reset.v1.intent';$script:rows[$intent].value|Add-Member -NotePropertyName policyRawSha256 -NotePropertyValue 'pure-policy';$script:rows[$intent].value|Add-Member -NotePropertyName authorizationRef -NotePropertyValue ([pscustomobject]@{source='explicit_user_chat';reference='offline pure product grant'})
 $script:pureAuthorization=$script:rows[$intent].value.authorizationRef
 function ReadJson($file,$pin,$keep){if($file -ine (Join-Path $base 'product-session-reset-policy.json') -or $pin -cne 'pure-policy'){throw 'owned_activation_origin_invalid'};return [pscustomobject]@{schema='ae-agent.product-session-reset.v1.policy';enabled=$true;capability='reset_owned_runtime_product_session';authorization=$script:pureAuthorization}}
 function Canon($v){return ConvertTo-Json -InputObject $v -Depth 30 -Compress}
 AssertActivationSuccessorConfiguration $reservation 'offline' @{AE_BRIDGE_STATE_DIR='C:\legacy-pure-product'};$script:checks++
 $script:rows[$binding].value.schema='unknown-schema'
 try{AssertActivationSuccessorConfiguration $reservation 'offline' @{};throw 'offline_expected_refusal'}catch{if($_.Exception.Message -cne 'owned_activation_origin_invalid'){throw}};$script:checks++
 if($source.LastIndexOf('AssertActivationSuccessorConfiguration $r $config.token $info.Environment',$launch) -lt 0){throw 'activation_successor_last_guard_missing'};$script:checks++
}finally{if([IO.Directory]::Exists($fixtureFull)){Remove-Item -LiteralPath $fixtureFull -Recurse -Force}}
@{ok=$true;checks=$script:checks;scope='actual helper AST, invented process-query/endpoint/controller ports';liveProof=$false}|ConvertTo-Json -Compress
