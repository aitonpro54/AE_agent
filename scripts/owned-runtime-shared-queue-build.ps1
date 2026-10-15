#requires -Version 7.0
[CmdletBinding()]
param(
 [Parameter(Mandatory)][ValidateSet('Collect','Validate','CompileOnly','BuildAndSeal')][string]$Action,
 [Parameter(Mandatory)][string]$InputFile,
 [Parameter(Mandatory)][string]$InputSha256,
 [string]$NodePath='C:/Users/Ant/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe',
 [string]$RootReviewedDriverSha256
)
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$sqUtf8=[Text.UTF8Encoding]::new($false,$true)
$sqHelpers=Join-Path $PSScriptRoot 'shared-queue-build'
$sqCli=Join-Path $sqHelpers 'cli.js'
function Get-SQHash([string]$Path){(Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()}
function Assert-SQPlain([string]$Path){
 $sqWalk=[IO.Path]::GetFullPath($Path)
 while($sqWalk){if(Test-Path -LiteralPath $sqWalk){if(([IO.File]::GetAttributes($sqWalk)-band [IO.FileAttributes]::ReparsePoint)-ne 0){throw 'PRODUCTION_REPARSE_PATH_REFUSED'}};$sqParent=[IO.Path]::GetDirectoryName($sqWalk);if($sqParent-eq $sqWalk){break};$sqWalk=$sqParent}
}
function Write-SQNew([string]$Path,[byte[]]$Bytes){$sqStream=[IO.File]::Open($Path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read);try{$sqStream.Write($Bytes,0,$Bytes.Length);$sqStream.Flush($true)}finally{$sqStream.Dispose()}}
function Save-SQNew([string]$Path,$Value){Write-SQNew $Path ($sqUtf8.GetBytes(($Value|ConvertTo-Json -Depth 100 -Compress)+"`n"))}
function Read-SQJson([string]$Path){Get-Content -LiteralPath $Path -Encoding UTF8 -Raw|ConvertFrom-Json -AsHashtable}
function Get-SQStartDisposition([bool]$Started,[bool]$HandleAcquired,[int]$Win32Error,[bool]$NoAssociatedHandle){
 if($Started-and $HandleAcquired){return 'STARTED'}
 if(-not $Started-and -not $HandleAcquired-and $Win32Error-eq 87-and $NoAssociatedHandle){return 'NOT_CREATED'}
 return 'UNKNOWN'
}
function Start-SQChild([string]$Image,[string[]]$Arguments,[string]$WorkingDirectory,[string]$Prefix,[bool]$Binary=$false,$ExpectedImage=$null,[bool]$NodeCliStartup=$false){
 if($Image-notmatch '^[A-Za-z]:[\\/]'-or $Image-match '[\x00-\x1f\x7f]'){throw 'PRODUCTION_ORDINARY_LAUNCH_LOCATOR_REQUIRED'}
 $Image=[IO.Path]::GetFullPath($Image)
 Assert-SQPlain $Image
 $sqImagePin=[SharedQueueBuildPin]::new($Image,$false,$false);$global:SharedQueueBuildOwner.pins.Add($sqImagePin)
 if($null-ne $ExpectedImage){$sqImagePin.AssertExpected($ExpectedImage.pin.volumeGuidHex,[string]$ExpectedImage.pin.serial,$ExpectedImage.pin.fileIdHex,$ExpectedImage.pin.canonicalPath,$ExpectedImage.sha256)}
 elseif($sqImagePin.Sha256-ne '3602f2bb1a10f2cbab4c36886218a33c1ab3db87290e73b033c46c77147d0237'){throw 'PRODUCTION_EXACT_NODE_LAUNCH_IMAGE_REQUIRED'}
 $sqImagePin.AssertAlias($Image)
 $sqInfo=[Diagnostics.ProcessStartInfo]::new();$sqInfo.FileName=$Image;$sqInfo.WorkingDirectory=$WorkingDirectory;$sqInfo.UseShellExecute=$false;$sqInfo.CreateNoWindow=$true;$sqInfo.RedirectStandardInput=$true;$sqInfo.RedirectStandardOutput=$true;$sqInfo.RedirectStandardError=$true
 $sqInfo.StandardInputEncoding=[Text.UTF8Encoding]::new($false)
 foreach($sqArgument in $Arguments){$sqInfo.ArgumentList.Add($sqArgument)}
 $sqInfo.Environment.Clear()
 foreach($sqName in @('SystemRoot','WINDIR','ComSpec','ProgramData','ALLUSERSPROFILE','USERPROFILE','APPDATA','LOCALAPPDATA','SystemDrive')){if([Environment]::GetEnvironmentVariable($sqName)){$sqInfo.Environment[$sqName]=[Environment]::GetEnvironmentVariable($sqName)}}
 $sqInfo.Environment['PATH']='C:\Windows\System32;C:\Windows';$sqInfo.Environment['TEMP']=[IO.Path]::GetDirectoryName($Prefix);$sqInfo.Environment['TMP']=[IO.Path]::GetDirectoryName($Prefix)
 $sqInfo.Environment['MSBUILDDISABLENODEREUSE']='1';$sqInfo.Environment['MSBUILDPRESERVETOOLTEMPFILES']='1'
 if($NodeCliStartup){
  if($Binary-or $Arguments.Count-lt 3-or $Arguments[0]-cne '--expose-internals'-or [IO.Path]::GetFullPath($Arguments[1])-cne [IO.Path]::GetFullPath($sqCli)){throw 'PRODUCTION_FIXED_NODE_CLI_STARTUP_ONLY'}
  $sqInfo.Environment['AE_AGENT_SHARED_QUEUE_BUILD_STARTUP_V1']='1'
 }
 $sqProcess=[Diagnostics.Process]::new();$sqProcess.StartInfo=$sqInfo
 $sqRecord=[ordered]@{image=$Image;arguments=$Arguments;outcome='UNKNOWN';originalProcess=$sqProcess;startReturned=$false;originalHandleAcquired=$false;noAssociatedHandleObserved=$false;imagePin=$sqImagePin;originalBirth=$null;originalImageLocator=$null;originalImageVerified=$false;startupHandshake=$NodeCliStartup;startupReleaseAttempted=$false;startupReleaseWriteCompleted=$false;win32Error=0;stderr=$null;stdout=$null;prefix=$Prefix;binary=$Binary}
 $global:SharedQueueBuildOwner.children.Add($sqRecord)
 Save-SQNew ($Prefix+'.start-intent.json') ([ordered]@{schema='ae-agent.shared-queue-child-start.v1';stage='intent';imageLocator=$Image;imageCanonicalPath=$sqImagePin.CanonicalPath;imageSha256=$sqImagePin.Sha256;originalHandleAcquired=$false})
 $sqImagePin.AssertAlias($Image)
 $sqStarted=[SharedQueueBuildIo]::StartOriginal($sqProcess)
 $sqRecord.startReturned=$sqStarted.Started;$sqRecord.originalHandleAcquired=$sqStarted.OriginalHandleAcquired;$sqRecord.noAssociatedHandleObserved=$sqStarted.NoAssociatedHandleObserved;$sqRecord.win32Error=$sqStarted.Win32Error
 $sqDisposition=Get-SQStartDisposition $sqStarted.Started $sqStarted.OriginalHandleAcquired $sqStarted.Win32Error $sqStarted.NoAssociatedHandleObserved
 if($sqDisposition-eq 'NOT_CREATED'){
  $sqRecord.outcome='NOT_CREATED'
  Save-SQNew ($Prefix+'.start-refused.json') ([ordered]@{schema='ae-agent.shared-queue-child-start.v1';stage='known_before_create';win32Error=87;originalHandleAcquired=$false;noAssociatedHandleObserved=$true;creatorStarted=$false})
  throw 'PRODUCTION_CHILD_PARAMETER_REFUSED_BEFORE_CREATE'
 }
 if($sqDisposition-ne 'STARTED'){throw 'PRODUCTION_CHILD_START_UNKNOWN'}
 # Query immediately, before hashing aliases or draining large MSBuild output.
 # Node CLI waits on stdin, so its pure main cannot exit before this query.
 $sqRecord.originalBirth=[SharedQueueBuildIo]::Birth($sqProcess.SafeHandle)
 $sqRecord.originalImageLocator=[SharedQueueBuildIo]::Image($sqProcess.SafeHandle)
 $sqRecord.stderr=[SharedQueueBuildIo]::Drain($sqProcess.StandardError.BaseStream,($Prefix+'.stderr'),4194304)
 if(-not $Binary){$sqRecord.stdout=[SharedQueueBuildIo]::Drain($sqProcess.StandardOutput.BaseStream,($Prefix+'.stdout'),67108864)}
 $sqImagePin.AssertAlias($sqRecord.originalImageLocator);$sqImagePin.AssertAlias($Image);$sqRecord.originalImageVerified=$true
 Save-SQNew ($Prefix+'.started.json') ([ordered]@{schema='ae-agent.shared-queue-child-start.v1';stage='started';imageLocator=$Image;imageCanonicalPath=$sqImagePin.CanonicalPath;imageSha256=$sqImagePin.Sha256;originalHandleAcquired=$true;originalBirth=$sqRecord.originalBirth;originalImageLocator=$sqRecord.originalImageLocator;originalImageVerified=$true;startupHandshake=$NodeCliStartup})
 if($NodeCliStartup){
  Save-SQNew ($Prefix+'.startup-go-intent.json') ([ordered]@{schema='ae-agent.shared-queue-child-start.v1';stage='startup_go_intent';protocol='AE_AGENT_SHARED_QUEUE_BUILD_GO_V1';originalBirth=$sqRecord.originalBirth;originalImageVerified=$true})
  $sqRecord.startupReleaseAttempted=$true
  $sqGo=[Text.Encoding]::ASCII.GetBytes("AE_AGENT_SHARED_QUEUE_BUILD_GO_V1`n")
  $sqProcess.StandardInput.BaseStream.Write($sqGo,0,$sqGo.Length);$sqProcess.StandardInput.BaseStream.Flush();$sqProcess.StandardInput.Close()
  $sqRecord.startupReleaseWriteCompleted=$true
 }elseif(-not $Binary){$sqProcess.StandardInput.Close()}
 return $sqRecord
}
function Wait-SQChild($Child,[int]$Timeout=300000){
 if(-not $Child.originalImageVerified-or -not $Child.originalBirth){throw 'PRODUCTION_ORIGINAL_CHILD_START_OBSERVATION_REQUIRED'}
 $Child.imagePin.AssertAlias($Child.image)
 if(-not $Child.originalProcess.WaitForExit($Timeout)){throw 'PRODUCTION_ORIGINAL_CHILD_PENDING_UNKNOWN_NO_REPLAY'}
 if(-not $Child.stderr.Wait(10000)-or (-not $Child.binary-and -not $Child.stdout.Wait(10000))){throw 'PRODUCTION_CHILD_EOF_PENDING_UNKNOWN_NO_REPLAY'}
 [void]$Child.stderr.GetAwaiter().GetResult();if(-not $Child.binary){[void]$Child.stdout.GetAwaiter().GetResult()}
 if([SharedQueueBuildIo]::Birth($Child.originalProcess.SafeHandle)-cne $Child.originalBirth){throw 'PRODUCTION_ORIGINAL_CHILD_BIRTH_CHANGED'}
 # The OS may no longer provide an image query after exit. The original live
 # query above stays bound by the same retained process handle and birth.
 $Child.imagePin.AssertAlias($Child.image)
 $Child.outcome='CLOSED';$Child.exitCode=$Child.originalProcess.ExitCode
 if($Child.exitCode-ne 0){throw 'PRODUCTION_CHILD_EXIT_REFUSED'}
}
function Invoke-SQNode([string[]]$Arguments,[string]$Prefix){
 $sqChild=Start-SQChild $NodePath (@('--expose-internals',$sqCli)+$Arguments) ([IO.Path]::GetDirectoryName($sqCli)) $Prefix $false $null $true
 Wait-SQChild $sqChild 60000
}
function Get-SQObservation([string]$Locator,[bool]$Directory,[bool]$Vendor=$false,[bool]$Retain=$false){
 Assert-SQPlain $Locator
 $sqHeld=[SharedQueueBuildPin]::new($Locator,$Directory,$Vendor)
 try{
  $sqObserved=[ordered]@{locator=$Locator;directory=$Directory;pin=[ordered]@{volumeGuidHex=$sqHeld.VolumeGuidHex;fileIdHex=$sqHeld.FileIdHex;serial=$sqHeld.Serial;canonicalPath=$sqHeld.CanonicalPath};sha256=$sqHeld.Sha256;bytes=$sqHeld.Bytes;links=$sqHeld.Links}
  if($Retain){$global:SharedQueueBuildOwner.pins.Add($sqHeld);$sqHeld=$null}
  return $sqObserved
 }finally{if($null-ne $sqHeld){$sqHeld.Dispose()}}
}
function Assert-SQHeld{foreach($sqHeld in $global:SharedQueueBuildOwner.pins){$sqHeld.AssertFresh()}}
function Test-SQPlannedExactVendor([string]$Locator,$BuildInputs,$ExternalInputs){
 $sqVendorLocator=[IO.Path]::GetFullPath($Locator)
 foreach($sqVendorCode in @(1020,1021,1022)){
  $sqVendorRows=@($BuildInputs|Where-Object {$_.code-eq $sqVendorCode})
  if($sqVendorRows.Count-ne 1){continue}
  $sqVendorRow=$sqVendorRows[0]
  $sqExpectedVendorLinks=if($sqVendorCode-eq 1022){3}else{2}
  if([string]::Equals($sqVendorLocator,[IO.Path]::GetFullPath($sqVendorRow.file.pin.canonicalPath),[StringComparison]::OrdinalIgnoreCase)){return $true}
  $sqVendorAliases=@($ExternalInputs|Where-Object {[string]::Equals($sqVendorLocator,[IO.Path]::GetFullPath($_.path),[StringComparison]::OrdinalIgnoreCase)-and $_.sha256.ToLowerInvariant()-ceq $sqVendorRow.file.sha256-and $_.links-eq $sqExpectedVendorLinks})
  if($sqVendorAliases.Count-eq 1){return $true}
 }
 return $false
}
function Read-SQFrame($Creator,[int]$Size,[string]$Destination,[int]$Timeout=30000){
 $sqRead=[SharedQueueBuildIo]::ReadExactly($Creator.originalProcess.StandardOutput.BaseStream,$Size)
 $global:SharedQueueBuildOwner.reads.Add($sqRead)
 if(-not $sqRead.Wait($Timeout)){throw 'PRODUCTION_ORIGINAL_STDIO_PENDING_UNKNOWN_NO_REPLAY'}
 $sqBytes=$sqRead.GetAwaiter().GetResult();Write-SQNew $Destination $sqBytes
}
if($InputSha256-notmatch '^[A-Fa-f0-9]{64}$'-or (Get-SQHash $InputFile)-ne $InputSha256.ToLowerInvariant()){throw 'PRODUCTION_EXACT_INPUT_DIGEST_REQUIRED'}
if((Get-SQHash $NodePath)-ne '3602f2bb1a10f2cbab4c36886218a33c1ab3db87290e73b033c46c77147d0237'){throw 'PRODUCTION_EXACT_NODE_IMAGE_REQUIRED'}
if(Get-Variable -Name SharedQueueBuildOwner -Scope Global -ErrorAction SilentlyContinue){throw 'PRODUCTION_OWNER_ALREADY_USED_NO_REPLAY'}
if($MyInvocation.InvocationName-ne '.'){throw 'PRODUCTION_ROOT_RETAINED_DOT_SOURCE_OWNER_REQUIRED'}
if($RootReviewedDriverSha256-notmatch '^[A-Fa-f0-9]{64}$'-or (Get-SQHash $PSCommandPath)-ne $RootReviewedDriverSha256.ToLowerInvariant()){throw 'PRODUCTION_ROOT_REVIEWED_DRIVER_REQUIRED'}
if(-not ('SharedQueueBuildPin'-as [type])){Add-Type -Path (Join-Path $sqHelpers 'identity.cs')}
$global:SharedQueueBuildOwner=[ordered]@{stage='created';children=[Collections.Generic.List[object]]::new();pins=[Collections.Generic.List[object]]::new();locks=[Collections.Generic.List[object]]::new();reads=[Collections.Generic.List[object]]::new();creator=$null;sealed=$false;closed=$false;authority=$false}
$sqOwner=$global:SharedQueueBuildOwner
try{
 $sqInput=Read-SQJson $InputFile
 if($Action-eq 'Collect'){
  $sqOut=[IO.Path]::GetFullPath($sqInput.outputDirectory);Assert-SQPlain $sqOut
  foreach($sqDirectory in @($sqInput.outputDirectory,$sqInput.pinsDirectory,$sqInput.artifactDirectory,$sqInput.runtimeDirectory,$sqInput.setupDirectory,$sqInput.snapshotDirectory,$sqInput.mediaOutputDirectory,$sqInput.manualQueueReservationDirectory,$sqInput.panelBootstrapDirectory)){
   Assert-SQPlain $sqDirectory;[void][IO.Directory]::CreateDirectory($sqDirectory)
  }
  foreach($sqEmpty in @($sqInput.runtimeDirectory,$sqInput.panelBootstrapDirectory)){if(@([IO.Directory]::EnumerateFileSystemEntries($sqEmpty)).Count-ne 0){throw 'PRODUCTION_FRESH_RUNTIME_OR_BOOTSTRAP_REQUIRED'}}
  foreach($sqInventory in $sqInput.inventories){Assert-SQPlain $sqInventory.path;if($sqInventory.absent){if(Test-Path -LiteralPath $sqInventory.path){throw 'PRODUCTION_ABSENT_INVENTORY_PRESENT'}}else{[void][IO.Directory]::CreateDirectory($sqInventory.path);if(@([IO.Directory]::EnumerateFileSystemEntries($sqInventory.path)).Count-ne 0){throw 'PRODUCTION_INVENTORY_NOT_EMPTY'}}}
  foreach($sqName in @('local_session_production_artifact_pins.h','local_session_installation_pins.h','local_session_trusted_read_pins.h','build-inputs.bin')){Write-SQNew (Join-Path $sqInput.pinsDirectory $sqName) ([byte[]]::new(0))}
  $sqPlanFile=Join-Path $sqOut 'collection-plan.json';Invoke-SQNode @('collection-plan',$InputFile,$sqPlanFile) (Join-Path $sqOut 'collection-plan')
  $sqPlan=Read-SQJson $sqPlanFile;$sqObservations=[Collections.Generic.List[object]]::new()
  foreach($sqDirectory in @($sqPlan.directories|Sort-Object Length, {$_})){$sqObservations.Add((Get-SQObservation $sqDirectory $true))}
  foreach($sqFile in $sqPlan.files){$sqExternal=@($sqPlan.externalInputs|Where-Object {[string]::Equals([IO.Path]::GetFullPath($_.path),[IO.Path]::GetFullPath($sqFile),[StringComparison]::OrdinalIgnoreCase)});$sqIsVendor=$sqExternal.Count-eq 1-and $sqExternal[0].links-gt 1;$sqObservations.Add((Get-SQObservation $sqFile $false $sqIsVendor))}
  $sqObservedFile=Join-Path $sqOut 'actual-object-observations.json';Save-SQNew $sqObservedFile @($sqObservations)
  $sqManifestFile=Join-Path $sqOut 'production-build-inputs.json';$sqSid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  Invoke-SQNode @('assemble',$sqPlanFile,$sqObservedFile,$sqSid,$sqManifestFile) (Join-Path $sqOut 'assemble')
  $sqOwner.stage='collected_passive_inputs';$sqOwner.closed=$true
  [ordered]@{ok=$true;stage=$sqOwner.stage;manifest=$sqManifestFile;sha256=Get-SQHash $sqManifestFile;authority=$false;nativeFactories=0;sealed=$false}|ConvertTo-Json -Compress
  return
 }
 $sqOut=$sqInput.build.outputDirectory;Assert-SQPlain $sqOut
 $sqValidation=Join-Path $sqOut ('validation-'+[Guid]::NewGuid().ToString('N')+'.json')
 Invoke-SQNode @('validate',$InputFile,$InputSha256,$sqValidation) ($sqValidation+'.process')
 if($Action-eq 'Validate'){$sqOwner.stage='validated_source_only';$sqOwner.closed=$true;Get-Content -LiteralPath $sqValidation -Raw -Encoding UTF8;return}
 # Keep all original control and actual source/build objects immutable while
 # children execute. Generated rows1..3 and M are written in place before seal.
 $sqInputLock=[IO.File]::Open($InputFile,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read);$sqOwner.locks.Add($sqInputLock)
 $sqPhase=if($Action-eq 'CompileOnly'){'preflight'}else{'seal'}
 if($Action-eq 'BuildAndSeal'){
  $sqPriorCompile=Read-SQJson (Join-Path $sqOut 'compile-only-receipt.json')
  if($sqPriorCompile.schema-ne 'ae-agent.shared-queue-compile-only-receipt.v1'-or $sqPriorCompile.ok-ne $true-or $sqPriorCompile.authority-ne $false-or $sqPriorCompile.productionAdmission-ne $false-or $sqPriorCompile.inputSha256-cne $InputSha256.ToLowerInvariant()-or $sqPriorCompile.roles.Count-ne 3-or $sqPriorCompile.creatorStarted-ne $false-or $sqPriorCompile.fixedRootDeployed-ne $false-or $sqPriorCompile.sealCreated-ne $false){throw 'PRODUCTION_SAME_INPUT_COMPILE_ONLY_PREFLIGHT_REQUIRED'}
 }
 $sqRequestFile=Join-Path $sqOut ('held-object-requests-'+$sqPhase+'.json');Invoke-SQNode @('pin-requests',$InputFile,$InputSha256,$sqRequestFile) (Join-Path $sqOut ('pin-requests-'+$sqPhase))
 foreach($sqRequest in (Read-SQJson $sqRequestFile)){
  if($sqRequest.generated){continue}
  $sqVendor=@($sqInput.definition.buildInputs|Where-Object {$_.code-in @(1020,1021,1022)-and $_.file.pin.canonicalPath-ceq $sqRequest.locator}).Count-eq 1
  $sqActual=Get-SQObservation $sqRequest.locator $sqRequest.directory $sqVendor $true
  if(($sqActual.pin|ConvertTo-Json -Compress)-cne ($sqRequest.pin|ConvertTo-Json -Compress)-or ($sqRequest.sha256-and $sqActual.sha256-cne $sqRequest.sha256)){throw 'PRODUCTION_ACTUAL_PIN_OR_BYTES_CHANGED'}
 }
 function Build-SQRole($Role,[bool]$Deploy=$true){
  if($sqOwner.sealed-or $sqOwner.stage-eq 'seal_requested'){throw 'PRODUCTION_COMPILE_AFTER_SEAL_REFUSED'}
  Assert-SQHeld
  $sqPrefix=Join-Path $sqOut ($Role.role+'-'+$sqPhase+'-compile')
  $sqArguments=@($Role.project,'/noautoresponse','/nologo','/m:1','/nodeReuse:false','/t:Rebuild','/p:Configuration=Release','/p:Platform=x64',('/p:LocalSessionTrustedReadOutputDir='+$sqOut),('/p:LocalSessionTrustedReadPinsDir='+$sqInput.build.pinsDirectory),('/p:LocalSessionNodeSdkDir='+$sqInput.build.nodeSdkDirectory),('/p:LocalSessionTrustedRead'+$(if($Role.code-eq 3){'Setup'}else{'Source'})+'Reviewed=true'))
  $sqArguments+=@('/p:PreferredToolArchitecture=x64','/p:BuildProjectReferences=false','/p:PreBuildEventUseInBuild=false','/p:PreLinkEventUseInBuild=false','/p:PostBuildEventUseInBuild=false')
  $sqPpArguments=@($sqArguments|Where-Object {$_-ne '/t:Rebuild'})+@('/pp')
  $sqPp=Start-SQChild $sqInput.build.msbuildLocator $sqPpArguments $sqInput.build.repository ($sqPrefix+'-preprocess') $false $sqInput.build.msbuild;Wait-SQChild $sqPp 120000
  $sqAllowed=[Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
  foreach($sqRow in $sqInput.definition.buildInputs){[void]$sqAllowed.Add($sqRow.file.pin.canonicalPath)}
  [xml]$sqPpXml=[IO.File]::ReadAllText(($sqPrefix+'-preprocess.stdout'),$sqUtf8)
  $sqImports=@($sqPpXml.SelectNodes('//comment()')|ForEach-Object {[regex]::Matches($_.Value,'(?m)^\s*((?:[A-Za-z]:[\\/]|\\\\)[^\r\n<>"|]+?)\s*$')}|ForEach-Object {$_.Groups[1].Value}|Sort-Object -Unique)
  if(-not $sqImports.Count){throw 'PRODUCTION_PREPROCESS_IMPORT_OBSERVATIONS_REQUIRED'}
  foreach($sqImport in $sqImports){$sqVendorImport=$sqImport-match '(?i)\\Windows\\Microsoft\.NET\\Framework\\v4\.0\.30319\\Microsoft\.Xaml\.targets$';$sqImported=Get-SQObservation $sqImport $false $sqVendorImport;if(-not $sqAllowed.Contains($sqImported.pin.canonicalPath)){throw 'PRODUCTION_UNPLANNED_MSBUILD_IMPORT_REFUSED'}}
  Assert-SQHeld
  $sqBuild=Start-SQChild $sqInput.build.msbuildLocator $sqArguments $sqInput.build.repository $sqPrefix $false $sqInput.build.msbuild
  Wait-SQChild $sqBuild 600000;Assert-SQHeld
  $sqReports=@(Get-ChildItem -LiteralPath (Join-Path $sqOut ($Role.role+'/obj')) -Filter '*.dependencies.json' -File)
  if($sqReports.Count-ne $Role.translationUnits.Count){throw 'PRODUCTION_EXACT_TRANSLATION_UNIT_COUNT_REQUIRED'}
  $sqSourceSeen=[Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
  foreach($sqReport in $sqReports){$sqDependencies=Read-SQJson $sqReport.FullName;if($sqDependencies.Version-ne '1.2'-or -not $sqSourceSeen.Add([IO.Path]::GetFullPath($sqDependencies.Data.Source))){throw 'PRODUCTION_SOURCE_DEPENDENCIES_SHAPE_REFUSED'}
   foreach($sqSource in @($sqDependencies.Data.Source)+@($sqDependencies.Data.Includes)){$sqObserved=Get-SQObservation $sqSource $false;if(-not $sqAllowed.Contains($sqObserved.pin.canonicalPath)){throw 'PRODUCTION_UNPLANNED_COMPILER_INPUT_REFUSED'}}
  }
  foreach($sqExpected in $Role.translationUnits){if(-not $sqSourceSeen.Contains([IO.Path]::GetFullPath($sqExpected))){throw 'PRODUCTION_EXACT_ROLE_SOURCE_SET_REQUIRED'}}
  $sqLinkReads=@(Get-ChildItem -LiteralPath (Join-Path $sqOut ($Role.role+'/obj')) -Recurse -Filter 'link.read.*.tlog' -File)
  if($sqLinkReads.Count-ne 1){throw 'PRODUCTION_EXACT_LINK_READ_TRACKING_REQUIRED'}
  foreach($sqLine in (Get-Content -LiteralPath $sqLinkReads[0].FullName -Encoding Unicode)){
   if(-not $sqLine-or $sqLine.StartsWith('^')){continue}
   $sqLinkPath=$sqLine.Trim();if([IO.Path]::GetExtension($sqLinkPath)-in @('.obj','.pdb')){if(-not [IO.Path]::GetFullPath($sqLinkPath).StartsWith(([IO.Path]::GetFullPath((Join-Path $sqOut ($Role.role+'/obj'))).TrimEnd('\')+'\'),[StringComparison]::OrdinalIgnoreCase)){throw 'PRODUCTION_FOREIGN_GENERATED_LINK_INPUT_REFUSED'};continue}
   $sqExactLinkVendor=Test-SQPlannedExactVendor $sqLinkPath $sqInput.definition.buildInputs $sqInput.build.externalInputs
   try{$sqActualLink=Get-SQObservation $sqLinkPath $false $sqExactLinkVendor}
   catch{throw [IO.IOException]::new(('PRODUCTION_LINK_INPUT_OBSERVATION_REFUSED path='+$sqLinkPath+'; cause='+$_.Exception.GetBaseException().Message),$_.Exception)}
   if(-not $sqAllowed.Contains($sqActualLink.pin.canonicalPath)){throw [IO.IOException]::new(('PRODUCTION_UNPLANNED_LINK_INPUT_REFUSED path='+$sqLinkPath+'; canonical='+$sqActualLink.pin.canonicalPath))}
  }
  $sqImage=Join-Path $sqOut $Role.image
  if(-not $Deploy){return Get-SQObservation $sqImage $false $false $true}
  $sqArtifact=$sqInput.definition.artifacts|Where-Object {$_.code-eq $Role.code}
  $sqDestination=Join-Path $sqInput.build.repository ([IO.Path]::Combine([string[]]$sqArtifact.components));Assert-SQPlain $sqDestination
  [IO.File]::Copy($sqImage,$sqDestination,$false)
  return Get-SQObservation $sqDestination $false $false $true
 }
 Invoke-SQNode @('generate-setup',$InputFile,$InputSha256) (Join-Path $sqOut ('generate-setup-'+$sqPhase))
 $sqSetupHeaderPins=[Collections.Generic.List[object]]::new()
 foreach($sqHeaderRow in $sqInput.definition.buildInputs|Where-Object {$_.code-le 3}){$sqHeaderPin=[SharedQueueBuildPin]::new($sqHeaderRow.file.pin.canonicalPath,$false,$false);$sqSetupHeaderPins.Add($sqHeaderPin);$sqOwner.pins.Add($sqHeaderPin)}
 if($Action-eq 'CompileOnly'){
  $sqOwner.stage='compile_only_preflight';$sqCompileImages=[Collections.Generic.List[object]]::new()
  foreach($sqPreflightRole in $sqInput.build.plannedRoles){$sqCompiled=Build-SQRole $sqPreflightRole $false;$sqCompileImages.Add([ordered]@{role=$sqPreflightRole.role;code=$sqPreflightRole.code;image=$sqCompiled})}
  Assert-SQHeld;$sqOwner.stage='compile_only_closed';$sqOwner.closed=$true
  $sqCompileReceipt=Join-Path $sqOut 'compile-only-receipt.json'
  Save-SQNew $sqCompileReceipt ([ordered]@{schema='ae-agent.shared-queue-compile-only-receipt.v1';ok=$true;authority=$false;productionAdmission=$false;inputSha256=$InputSha256.ToLowerInvariant();roles=@($sqCompileImages);nativeFactories=0;creatorStarted=$false;fixedRootDeployed=$false;sealCreated=$false;finalGeneratedCommitment=$false;liveQueueProof=$false})
  [ordered]@{ok=$true;stage=$sqOwner.stage;receipt=$sqCompileReceipt;authority=$false;creatorStarted=$false;sealCreated=$false}|ConvertTo-Json -Compress
  return
 }
 $sqOwner.stage='building_original_creator';$sqCreatorRole=$sqInput.build.plannedRoles|Where-Object {$_.code-eq 3};$sqCreatorFile=Build-SQRole $sqCreatorRole
 $sqCreatorObservation=Join-Path $sqOut 'creator-actual.json';Save-SQNew $sqCreatorObservation ([ordered]@{components=@();pin=$sqCreatorFile.pin;sha256=$sqCreatorFile.sha256})
 $sqOwner.stage='original_creator_started';$sqCreator=Start-SQChild $sqCreatorFile.locator @('--prepare-and-seal-fixed') $sqInput.build.repository (Join-Path $sqOut 'original-creator') $true $sqCreatorFile;$sqOwner.creator=$sqCreator
 $sqBirth=[SharedQueueBuildIo]::Birth($sqCreator.originalProcess.SafeHandle)
 $sqPrepareFrame=Join-Path $sqOut 'original-prepare-424.bin';Read-SQFrame $sqCreator 424 $sqPrepareFrame
 $sqPrepare=Join-Path $sqOut 'original-prepare.json';Invoke-SQNode @('prepare',$InputFile,$InputSha256,$sqCreatorObservation,$sqPrepareFrame,$sqBirth,$sqPrepare) (Join-Path $sqOut 'verify-prepare')
 foreach($sqHeaderPin in $sqSetupHeaderPins){$sqHeaderPin.AssertFresh();[void]$sqOwner.pins.Remove($sqHeaderPin);$sqHeaderPin.Dispose()}
 $sqOwner.stage='original_anchor_retained_final_build';$sqGenerated=Join-Path $sqOut 'generated-input-commitment.json'
 Invoke-SQNode @('generate-final',$InputFile,$InputSha256,$sqPrepare,$sqGenerated) (Join-Path $sqOut 'generate-final')
 foreach($sqPath in @($sqInput.definition.buildInputs|Where-Object {$_.code-le 3}|ForEach-Object {$_.file.pin.canonicalPath})+@($sqInput.definition.buildInputManifest.pin.canonicalPath)){[void](Get-SQObservation $sqPath $false $false $true)}
 $sqArtifacts=[Collections.Generic.List[object]]::new();$sqArtifacts.Add([ordered]@{code=3;file=[ordered]@{components=@();pin=$sqCreatorFile.pin;sha256=$sqCreatorFile.sha256}})
 foreach($sqRole in $sqInput.build.plannedRoles|Where-Object {$_.code-ne 3}){$sqFinalFile=Build-SQRole $sqRole;$sqArtifacts.Add([ordered]@{code=$sqRole.code;file=[ordered]@{components=@();pin=$sqFinalFile.pin;sha256=$sqFinalFile.sha256}})}
 $sqArtifactFile=Join-Path $sqOut 'actual-final-artifacts.json';Save-SQNew $sqArtifactFile @($sqArtifacts|Sort-Object code)
 Assert-SQHeld;$sqSealAck=Join-Path $sqOut 'seal-request-80.bin';Invoke-SQNode @('seal-request',$InputFile,$InputSha256,$sqPrepare,$sqPrepareFrame,$sqSealAck) (Join-Path $sqOut 'seal-request')
 $sqOwner.stage='seal_requested';$sqBytes=[IO.File]::ReadAllBytes($sqSealAck);$sqCreator.originalProcess.StandardInput.BaseStream.Write($sqBytes,0,$sqBytes.Length);$sqCreator.originalProcess.StandardInput.BaseStream.Flush()
 $sqFinalFrame=Join-Path $sqOut 'original-final-752.bin';Read-SQFrame $sqCreator 752 $sqFinalFrame
 $sqFinalResult=Join-Path $sqOut 'verified-final.json';$sqFinalAck=Join-Path $sqOut 'final-ack-80.bin'
 Invoke-SQNode @('verify-final',$InputFile,$InputSha256,$sqPrepare,$sqGenerated,$sqArtifactFile,$sqFinalFrame,$sqFinalResult,$sqFinalAck) (Join-Path $sqOut 'verify-final')
 Assert-SQHeld;$sqOwner.sealed=$true;$sqBytes=[IO.File]::ReadAllBytes($sqFinalAck);$sqCreator.originalProcess.StandardInput.BaseStream.Write($sqBytes,0,$sqBytes.Length);$sqCreator.originalProcess.StandardInput.BaseStream.Flush()
 # Keep stdin OPEN until native checks its original pipe for trailing bytes.
 $sqEof=[SharedQueueBuildIo]::ReadEof($sqCreator.originalProcess.StandardOutput.BaseStream);$sqOwner.reads.Add($sqEof)
 if(-not $sqCreator.originalProcess.WaitForExit(30000)){throw 'PRODUCTION_CREATOR_ACK_EXIT_PENDING_UNKNOWN_NO_REPLAY'}
 if(-not $sqEof.Wait(10000)){throw 'PRODUCTION_CREATOR_EOF_PENDING_UNKNOWN_NO_REPLAY'};if(-not $sqEof.GetAwaiter().GetResult()){throw 'PRODUCTION_CREATOR_TRAILING_STDOUT_REFUSED'}
 Wait-SQChild $sqCreator 1000;Assert-SQHeld;$sqOwner.stage='sealed_creator_closed';$sqOwner.closed=$true
 Save-SQNew (Join-Path $sqOut 'build-and-seal-receipt.json') ([ordered]@{schema='ae-agent.shared-queue-production-build-receipt.v1';ok=$true;inputSha256=$InputSha256.ToLowerInvariant();stage=$sqOwner.stage;sealed=$true;originalCreatorExit=0;originalStdoutEof=$true;originalStderrEof=$true;automaticRuntimeLaunch=$false;liveQueueProof=$false;mediaVerified=$false;generatedCommitment=Read-SQJson $sqGenerated;final=Read-SQJson $sqFinalResult})
 [ordered]@{ok=$true;stage=$sqOwner.stage;receipt=Join-Path $sqOut 'build-and-seal-receipt.json';runtimeLaunched=$false;liveQueueProof=$false}|ConvertTo-Json -Compress
}catch{
 $sqOwner.error=$_.Exception.Message;$sqPendingChild=@($sqOwner.children|Where-Object {$_.outcome-eq 'UNKNOWN'}).Count-gt 0;$sqOwner.stage=if(($sqOwner.creator-and -not $sqOwner.closed)-or $sqPendingChild){'UNKNOWN_RETAIN_ORIGINAL_OWNER_NO_REPLAY'}else{'closed_source_or_build_refusal'}
 Write-Error -Message ('Shared queue driver: '+$sqOwner.stage+'; '+$sqOwner.error) -ErrorAction Continue
 throw
}finally{
 $sqPendingChild=@($sqOwner.children|Where-Object {$_.outcome-eq 'UNKNOWN'}).Count-gt 0
 if($sqOwner.closed-or (-not $sqOwner.creator-and -not $sqPendingChild)){foreach($sqHeld in $sqOwner.pins){$sqHeld.Dispose()};foreach($sqLock in $sqOwner.locks){$sqLock.Dispose()};foreach($sqChild in $sqOwner.children){if($sqChild.outcome-in @('CLOSED','NOT_CREATED')){$sqChild.originalProcess.Dispose()}}}
 # UNKNOWN keeps the SAME original creator, streams, pending reads and pins in
 # $global:SharedQueueBuildOwner. Do not close its root PowerShell owner or retry.
}
