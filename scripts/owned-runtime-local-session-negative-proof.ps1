#requires -Version 5.1
# Declares one reviewed installed-negative parent action; no execution on import.
Set-StrictMode -Version Latest

function Invoke-LocalSessionInstalledNegativeProof {
    [CmdletBinding()]
    param([Parameter(Mandatory=$true)][ValidateSet('controller_invalid_frame','creator_wrong_ack','ordinary_fixture_dot','ordinary_fixture_space')][string]$Case)
    $ErrorActionPreference='Stop'
    if(-not $ParentSourceGo){throw 'Точный parent source GO обязателен.'}
    $fixed=Initialize-LocalSessionSyntheticCapture
    $state=@{capture=$null;children=(New-Object 'System.Collections.Generic.List[object]');channel=$null;ordinal=[UInt64]0;nonce=$null;bindings=$null;openedBefore=[UInt64]0;openedAfter=[UInt64]0;ackWrite=$null;controllerWrite=$null;pendingRead=$null;allClosed=$false}
    $audit=[ordered]@{schema='ae-agent.local-session.installed-negative.v1';scope='isolated_installed_private_seams';case=$Case;status='UNKNOWN';nativeDisposition='UNKNOWN';productionAuthority=$false;productionReady=$false;genuineChatIdentity=$false;executionAdmission=$false;replayAllowed=$false;stage='capture';sourcePins=$sourcePins;remainingNativeMatrix='UNVERIFIED';full19InstalledMatrix='NOT_RUN';launchGuardFsCase='NOT_RUN';actualFixedDispositionDeadlineCase='NOT_RUN'}
    function Assert-NegativeSources {
        foreach($pin in $sourcePins){if((Get-FileHash -LiteralPath (Join-Path $repoRoot $pin.name) -Algorithm SHA256).Hash.ToLowerInvariant()-ne $pin.sha256){throw "Source freeze drift: $($pin.name)"}}
        $state.capture.AssertFresh()
    }
    function Invoke-NegativeBuild([string]$header,[string]$output){
        Assert-NegativeSources;$paths=$state.capture.PrepareCompilerPaths($header,$output);$project=Join-Path $repoRoot 'native/owned-runtime-local-session/LocalSessionBroker.vcxproj'
        $text=New-Object Text.StringBuilder;$tail=New-Object 'System.Collections.Generic.Queue[string]';$bytes=0;$complete=$true
        & $fixed.msbuild $project /nologo /m:1 /p:Configuration=Release /p:Platform=x64 /p:LocalSessionInstalledSeamsReviewed=true "/p:LocalSessionPinsDir=$([IO.Path]::GetDirectoryName($paths.Header))" "/p:LocalSessionOutputDir=$($paths.Output)" 2>&1 | ForEach-Object {
            $line=[string]$_;$lineBytes=[Text.Encoding]::UTF8.GetByteCount($line+[Environment]::NewLine)
            if($complete-and $lineBytes-le (1048576-$bytes)){[void]$text.AppendLine($line);$bytes+=$lineBytes}else{$complete=$false}
            if($tail.Count-eq 16){[void]$tail.Dequeue()};$tail.Enqueue($line.Substring(0,[Math]::Min($line.Length,2048)))
        }
        $code=$LASTEXITCODE;$log=$state.capture.WriteBuildOutput($output,$text.ToString())
        $audit[([IO.Path]::GetFileName($output)+'Result')]=[ordered]@{exitCode=$code;profileSha256=(Get-FileHash -LiteralPath $header -Algorithm SHA256).Hash.ToLowerInvariant();fullOutputPath=$log.Original.CanonicalPath;fullOutputSha256=$log.Sha256();fullOutputComplete=$complete;lastLines=@($tail.ToArray())}
        if(-not $complete-or $code-ne 0){throw 'Native build refused/incomplete; no retry.'};Assert-NegativeSources;return $state.capture.HoldBuiltExecutable($output)
    }
    function Start-NegativeOriginal($binary,[string]$verb){
        Assert-NegativeSources;$paths=$state.capture.PrepareOriginalLaunch($binary,$verb)
        $start=New-Object Diagnostics.ProcessStartInfo;$start.FileName=$paths.Executable;$start.Arguments=$verb;$start.WorkingDirectory=$paths.WorkingDirectory;$start.UseShellExecute=$false;$start.CreateNoWindow=$true;$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true;$start.RedirectStandardInput=($verb-eq '--enroll-fixed')
        if($start.RedirectStandardInput-and $start.GetType().GetProperty('StandardInputEncoding')){$start.StandardInputEncoding=New-Object Text.UTF8Encoding $false}
        $process=New-Object Diagnostics.Process;$process.StartInfo=$start
        $child=[pscustomobject]@{process=$process;observer=$null;verb=$verb;startAttempted=$false;started=$false;createdMono=[UInt64][LocalSessionSyntheticCapture.Session]::MonotonicMs;deadline=[UInt64]0;stdout=$null;stderr=$null;gate=$(if($verb-eq '--enroll-fixed'){'binary'}else{'locator'});prefixTask=$null;closed=$false;bindingKnown=$false;facts=[ordered]@{executable=$binary.Original.CanonicalPath;fileId=$binary.Original.FileIdHex;sha256=$binary.Sha256();workingDirectory=$paths.WorkingDirectory;exactHeldExit=$false}}
        $state.children.Add($child);$child.deadline=$child.createdMono+$(if($verb-eq '--enroll-fixed'){[UInt64]40000}else{[UInt64]70000})
        Assert-NegativeSources;$state.capture.AssertOriginalLaunch($paths,$binary,$verb)
        $child.startAttempted=$true;if(-not $process.Start()){throw 'Original child creation failed; no retry.'};$child.started=$true
        [void]$process.Handle;$child.stderr=New-Object LocalSessionSyntheticCapture.BoundedText -ArgumentList @($process.StandardError,8192)
        $child.observer=$state.capture.HoldOriginalChild($process,$binary);$child.bindingKnown=$true;$child.facts.birth=$child.observer.Birth;$child.facts.userSid=$child.observer.UserSid;$child.facts.imageHash=$child.observer.ImageHash
        if($start.RedirectStandardInput-and $process.StandardInput.Encoding.GetPreamble().Length-ne 0){throw 'Original ACK stream has encoding preamble; no retry.'};return $child
    }
    function Start-OriginalText($child){
        if($null-eq $child.stdout){$child.stdout=New-Object LocalSessionSyntheticCapture.BoundedText -ArgumentList @($child.process.StandardOutput,8192);$child.gate='text'}
    }
    function New-OriginalPrefixObservation([object]$line){
        # Diagnostic only: the original completed read remains the sole locator
        # input. This bounded/redacted snapshot cannot supply channel authority.
        if($null-eq $line){return [ordered]@{completedOriginalRead=$true;eof=$true;characters=0;scanOverflow=$false;lineTruncated=$false;sanitizedLine=$null}}
        $text=[string]$line;$bounded=$text.Substring(0,[Math]::Min($text.Length,8192))
        $sanitized=[regex]::Replace($bounded,'(?i)("(?:nonce|pipe)"\s*:\s*")[^"]*("|$)','$1<redacted>$2')
        $sanitized=[regex]::Replace($sanitized,'(?i)(?<![0-9a-f])[0-9a-f]{32,}(?![0-9a-f])','<hex-id>')
        $sanitized=[regex]::Replace($sanitized,'[\x00-\x1f\x7f]','<control>')
        return [ordered]@{completedOriginalRead=$true;eof=$false;characters=$text.Length;scanOverflow=($text.Length-gt 8192);lineTruncated=($sanitized.Length-gt 2048);sanitizedLine=$sanitized.Substring(0,[Math]::Min($sanitized.Length,2048))}
    }
    function Assert-OriginalRootRefusal($reply){
        # Validate only the raw completed original read. Sanitized diagnostics
        # never provide a result, locator, identity, or authority factory input.
        if($reply-isnot [pscustomobject]){throw 'Original root refusal must be one scalar object'}
        $expected=@{schema='ae-agent.local-broker.result.v2';code='installed_original_root_contract_invalid';authorityMode='local_controller_session'}
        foreach($name in $expected.Keys){$field=$reply.PSObject.Properties[$name];if($null-eq $field-or $field.Value-isnot [string]-or $field.Value-cne $expected[$name]){throw ('Exact original root refusal string unproven: '+$name)}}
        foreach($name in @('ok','unknown','unavailable','genuineChatIdentity','executionAdmission','replayAllowed')){$field=$reply.PSObject.Properties[$name];if($null-eq $field-or $field.Value-isnot [bool]-or $field.Value-ne $false){throw ('Original root refusal false flag unproven: '+$name)}}
        if(($reply.win32Error-isnot [int]-and $reply.win32Error-isnot [long])-or $reply.win32Error-ne 0){throw 'Original root refusal error value unproven'}
        return [ordered]@{schema=$reply.schema;code=$reply.code;win32Error=$reply.win32Error;ok=$reply.ok;unknown=$reply.unknown;unavailable=$reply.unavailable;authorityMode=$reply.authorityMode;genuineChatIdentity=$reply.genuineChatIdentity;executionAdmission=$reply.executionAdmission;replayAllowed=$reply.replayAllowed}
    }
    function Update-OriginalObservation($child){
        if(-not $child.startAttempted){$child.closed=$true;return}
        if(-not $child.closed){if($child.observer){try{$child.closed=$child.observer.PollExit()}catch{$child.facts.originalObserverFailure=[string]$_;$child.bindingKnown=$false;$child.closed=$child.process.WaitForExit(0)}}else{$child.closed=$child.process.WaitForExit(0)};if($child.closed){$child.facts.exactHeldExit=$true;$child.facts.exitCode=$(if($child.observer-and $child.observer.Exited){$child.observer.ExitCode}else{$child.process.ExitCode});$child.facts.observedExitMono=[UInt64][LocalSessionSyntheticCapture.Session]::MonotonicMs}}
        # The existing binary/locator task owns stdout until completion. Never
        # start a competing reader, close a channel, or resend after UNKNOWN.
        if($null-eq $child.stdout-and ($null-eq $child.prefixTask-or $child.prefixTask.IsCompleted)){Start-OriginalText $child}
        $child.facts.stdoutComplete=($child.stdout-and $child.stdout.Complete-and $child.stdout.Eof-and -not $child.stdout.Overflow-and -not $child.stdout.Error)
        $child.facts.stderrComplete=($child.stderr-and $child.stderr.Complete-and $child.stderr.Eof-and -not $child.stderr.Overflow-and -not $child.stderr.Error)
        if($child.stdout){$child.facts.stdout=$child.stdout.Text;$child.facts.stdoutCharacters=$child.stdout.Characters;$child.facts.stdoutOverflow=$child.stdout.Overflow;$child.facts.stdoutError=$child.stdout.Error}
        if($child.stderr){$child.facts.stderr=$child.stderr.Text;$child.facts.stderrCharacters=$child.stderr.Characters;$child.facts.stderrOverflow=$child.stderr.Overflow;$child.facts.stderrError=$child.stderr.Error}
    }
    function Wait-OriginalDisposition($child){
        $lastNotice=[UInt64]0
        if(-not $child.startAttempted){$child.closed=$true;return}
        for(;;){Update-OriginalObservation $child;if($child.closed-and $child.stdout-and $child.stdout.Complete-and $child.stderr-and $child.stderr.Complete){return}
            $now=[UInt64][LocalSessionSyntheticCapture.Session]::MonotonicMs
            if($now-ge $child.deadline){$audit.status='UNKNOWN';$audit.stage='original_observer_pending';$audit.observerDeadlineExceeded=$true;$script:LocalSessionNegativeUnknown=$state
                # The observation budget never extends the native grant. Keep
                # the original observer alive if disposition/stdio is unresolved.
                if($lastNotice-eq 0-or $now-$lastNotice-ge 30000){Write-Host ('UNKNOWN_PENDING original observer retained; case='+$Case+'; no resend/stop/reopen');$lastNotice=$now}
            }
            if($child.closed){Start-Sleep -Milliseconds 250}else{[void]$child.process.WaitForExit(250)}
        }
    }
    function Read-GenuineCreator($child){
        $bytes=New-Object byte[] 480;$offset=0;$watch=[Diagnostics.Stopwatch]::StartNew()
        while($offset-lt 480){$remaining=10000-[int]$watch.ElapsedMilliseconds;if($remaining-le 0){throw 'Genuine creator observation UNKNOWN; no retry.'};$child.prefixTask=$child.process.StandardOutput.BaseStream.ReadAsync($bytes,$offset,480-$offset);if(-not $child.prefixTask.Wait($remaining)-or $child.prefixTask.Result-le 0){throw 'Genuine creator observation EOF/UNKNOWN; no retry.'};$offset+=$child.prefixTask.Result}
        $child.prefixTask=$null;return ,$bytes
    }
    function New-ControllerFrame([UInt16]$verb){
        $state.ordinal++;$frame=New-Object byte[] 128;[Text.Encoding]::ASCII.GetBytes('LCSB').CopyTo($frame,0);[BitConverter]::GetBytes([UInt16]2).CopyTo($frame,4);[BitConverter]::GetBytes($verb).CopyTo($frame,6);[BitConverter]::GetBytes([UInt64]$state.ordinal).CopyTo($frame,8);$state.nonce.CopyTo($frame,16);return ,$frame
    }
    function Send-ControllerOnce([byte[]]$frame){Assert-NegativeSources;$state.controllerWrite=$state.channel.WriteAsync($frame,0,128);if(-not $state.controllerWrite.Wait(5000)){throw 'Original controller write UNKNOWN; no resend.'}}
    function Invoke-Controller([UInt16]$verb){
        $frame=New-ControllerFrame $verb;Send-ControllerOnce $frame;$reply=New-Object byte[] 128;$state.pendingRead=$state.channel.ReadAsync($reply,0,128);if(-not $state.pendingRead.Wait(5000)-or $state.pendingRead.Result-ne 128){throw 'Original controller reply UNKNOWN; no resend.'}
        if([Text.Encoding]::ASCII.GetString($reply,0,4)-ne 'LCSB'-or [BitConverter]::ToUInt16($reply,4)-ne 2-or [BitConverter]::ToUInt16($reply,6)-ne $verb-or [BitConverter]::ToUInt64($reply,8)-ne $state.ordinal){throw 'Original reply frame mismatch'}
        for($j=0;$j-lt 16;$j++){if($reply[16+$j]-ne $state.nonce[$j]){throw 'Original reply nonce mismatch'}}
        $generation=[BitConverter]::ToString($reply,32,16).Replace('-','').ToLowerInvariant();$boot=[BitConverter]::ToString($reply,48,16).Replace('-','').ToLowerInvariant();if($generation-eq ('0'*32)-or $boot-eq ('0'*32)){throw 'Original generation/boot missing'}
        if($null-eq $state.bindings){$state.bindings=@{generation=$generation;boot=$boot}}elseif($state.bindings.generation-ne $generation-or $state.bindings.boot-ne $boot){throw 'Original generation/boot changed'}
        for($j=64;$j-lt 112;$j++){if($reply[$j]-ne 0){throw 'Closed reply payload mismatch'}};if([BitConverter]::ToUInt32($reply,120)-ne 0-or [BitConverter]::ToUInt32($reply,124)-ne 0){throw 'Closed reply flags mismatch'};Assert-NegativeSources;return [BitConverter]::ToUInt64($reply,112)
    }
    try{
        $state.capture=New-Object LocalSessionSyntheticCapture.Session -ArgumentList @($repoRoot,$fixed.node,$Case);$audit.runPath=$state.capture.RunPath;$audit.fixtureRoot=$state.capture.FixturePath;$audit.originalController=[ordered]@{birth=$state.capture.ControllerBirth;userSid=$state.capture.UserSid;heldThroughout=$true}
        $mock=@'
"use strict";
// Fixed isolated negative fixture: no AE/CEP/HTTP/provider imports or calls.
const net=require("node:net"),fs=require("node:fs"),path=require("node:path");
const scenario=fs.readFileSync(path.join(__dirname,"..","synthetic-fixture.scope"),"utf8");
if(!["controller_invalid_frame","creator_wrong_ack","ordinary_fixture_dot","ordinary_fixture_space"].includes(scenario))throw Error("closed case");
const events=path.join(__dirname,"..","synthetic-events.jsonl");function event(kind,extra={}){fs.appendFileSync(events,JSON.stringify({kind,pid:process.pid,...extra})+"\n",{flag:"a"});}
function nonce(name){const x=process.env[name];if(!/^[0-9a-f]{32}$/.test(x||""))throw Error("closed nonce");return Buffer.from(x,"hex");}
const n=nonce("AE_AGENT_LOCAL_SESSION_NONCE"),g=nonce("AE_AGENT_LOCAL_SESSION_GENERATION"),b=nonce("AE_AGENT_LOCAL_SESSION_BOOT"),p=process.env.AE_AGENT_LOCAL_SESSION_PIPE;
if(!/^\\\\\.\\pipe\\AEAgent\.LocalSession\.[0-9a-f]{64}\.daemon\.[0-9a-f]{32}$/.test(p||""))throw Error("closed pipe");event("creation");const peer=net.connect(p);let ordinal=0n;
function send(verb,epoch=0n,mask=0){const x=Buffer.alloc(128);x.write("LCSB",0,"ascii");x.writeUInt16LE(2,4);x.writeUInt16LE(verb,6);x.writeBigUInt64LE(++ordinal,8);n.copy(x,16);g.copy(x,32);b.copy(x,48);x.writeBigUInt64LE(epoch,112);x.writeUInt32LE(mask,120);peer.write(x);event("sent",{verb});}
peer.on("connect",()=>{event("connected");send(17);setTimeout(()=>send(18,1n,127),30);});peer.on("error",()=>{});peer.on("close",()=>process.exit(0));setInterval(()=>{},1000);
'@
        $state.capture.CreateSyntheticSource($mock)
        if($Case-like 'ordinary_fixture_*'){$state.capture.AssertNormalizationPair();$audit.normalization=[ordered]@{exactCanonical=$state.capture.Repository.Leaf.Original;ordinarySibling=$state.capture.OrdinarySibling.Original;ordinaryAlias=$state.capture.OrdinaryAlias.Original;ordinaryLocator=$state.capture.NormalizationOrdinaryLocator;actualDistinctIdsAndNormalizedSibling=$true;launcherWorkingDirectory='fixed stable held Run'}}
        $audit.stage='enrollment_build';$header=$state.capture.WriteProfile($false);$output=$state.capture.NewOutput('build-enrollment');$binary=Invoke-NegativeBuild $header $output
        $audit.stage='original_creator';$creator=Start-NegativeOriginal $binary '--enroll-fixed';$audit.originalCreator=$creator.facts;$challenge=Read-GenuineCreator $creator
        Assert-NegativeSources;$state.capture.CaptureEnrollmentWhileCreatorHeld($creator.process,$binary,$challenge);$audit.originalCreation=[ordered]@{observationSha256=$state.capture.EnrollmentObservationSha256;creatorBirth=$state.capture.EnrollmentCreatorBirth;fourPinsMatchedWhileCreatorHeld=$true;installation=$state.capture.InstallationFile.Original;policy=$state.capture.PolicyFile.Original;lock=$state.capture.LockFile.Original;journal=$state.capture.Journal.Original}
        $audit.stage='one_original_ack';[byte[]]$ack=if($Case-eq 'creator_wrong_ack'){$state.capture.CreateCorruptedEnrollmentAcknowledgement()}else{$state.capture.CreateEnrollmentAcknowledgement()};$state.ackWrite=$creator.process.StandardInput.BaseStream.WriteAsync($ack,0,80);if(-not $state.ackWrite.Wait(5000)){throw 'One original ACK write UNKNOWN; no retry.'};$audit.ackSentOnce=$true;Start-OriginalText $creator;Wait-OriginalDisposition $creator
        if(-not $creator.bindingKnown-or -not $creator.facts.stdoutComplete-or -not $creator.facts.stderrComplete){throw 'Original creator source binding/stdio UNKNOWN'};$enrolled=$creator.stdout.Text|ConvertFrom-Json
        if($Case-eq 'creator_wrong_ack'){
            if($creator.observer.ExitCode-ne 2-or $enrolled.schema-ne 'ae-agent.local-broker.result.v2'-or $enrolled.ok-ne $false-or $enrolled.unknown-ne $true-or $enrolled.code-ne 'creator_ack_binding_refused'){throw 'Expected genuine creator binding refusal/exit2 unproven'}
            $state.capture.ConfirmEnrollmentRefusal();$audit.oracle='Genuine held creation pins/challenge; one nonce bit corrupted in one original ACK; original creator exact exit2 and creator_ack_binding_refused. No final profile/build/broker.';$audit.noFinalBroker=$true
        }else{
            if($creator.observer.ExitCode-ne 0-or $enrolled.ok-ne $true-or $enrolled.unknown-ne $false-or $enrolled.code-ne 'provisioned_original_ids_parent_acknowledged'){throw 'Genuine original enrollment failed'};$state.capture.ConfirmEnrollmentExactExit()
            $audit.stage='final_build';$header=$state.capture.WriteProfile($true);$output=$state.capture.NewOutput('build-final');$binary=Invoke-NegativeBuild $header $output
            if($Case-like 'ordinary_fixture_*'){$state.capture.AssertRootRefusalJournalEmpty();$audit.rootJournalBeforeBroker=[ordered]@{frameCount=0;originalJournal=$state.capture.Journal.Original;originalEnrollmentPinsAndBytesPreserved=$true}}
            $audit.stage='original_broker';$broker=Start-NegativeOriginal $binary '--broker';$audit.originalBroker=$broker.facts;$broker.prefixTask=$broker.process.StandardOutput.ReadLineAsync();if(-not $broker.prefixTask.Wait(10000)){throw 'Original locator UNKNOWN; no replay.'}
            $originalPrefix=$broker.prefixTask.Result;$broker.facts.originalPrefix=New-OriginalPrefixObservation $originalPrefix
            $reply=$originalPrefix|ConvertFrom-Json;Start-OriginalText $broker
            if($Case-like 'ordinary_fixture_*'){
                $audit.stage='original_root_refusal';$audit.originalRootRefusal=Assert-OriginalRootRefusal $reply;Wait-OriginalDisposition $broker
                if(-not $broker.bindingKnown-or -not $broker.facts.stdoutComplete-or -not $broker.facts.stderrComplete-or $broker.observer.ExitCode-ne 2){throw 'Exact original root-refusal broker binding/exit2/stdio unproven'}
                if($null-ne $state.channel-or $state.ordinal-ne 0){throw 'Root-refusal case must have no controller channel or frames'}
                $state.capture.AssertNormalizationPair();$state.capture.AssertRootRefusalJournalEmpty();$audit.rootJournalAfterBroker=[ordered]@{frameCount=0;originalJournal=$state.capture.Journal.Original;originalEnrollmentPinsAndBytesPreserved=$true}
                $audit.nativeDisposition='DENIED';$audit.noControllerChannel=$true;$audit.controllerFramesSent=0;$audit.consumedFrames=0
                $audit.oracle='Actual exact NT fixture/sibling distinct IDs and readonly normalized sibling alias; genuine creator held pins/ACK/exact exit0. Raw original broker result installed_original_root_contract_invalid with false flags/replay, exact held exit2/complete stdio, actual same original empty journal before/after. Frozen initialization refuses before locator/Store/Reserve/daemon creation; source-branch evidence, not OS dispatch trace.'
            }else{
                $locator=$reply
                if($locator.schema-ne 'ae-agent.local-broker.locator.v2'-or $locator.authorityMode-ne 'local_controller_session'-or $locator.executionAdmission-ne $false-or $locator.genuineChatIdentity-ne $false-or $locator.pipe-notmatch '^\\\\\.\\pipe\\AEAgent\.LocalSession\.[0-9a-f]{64}\.controller\.[0-9a-f]{32}$'-or $locator.nonce-notmatch '^[0-9a-f]{32}$'){throw 'Closed original locator mismatch'}
                $audit.prelaunchFrames=@($state.capture.VerifyJournal(2));$state.channel=New-Object IO.Pipes.NamedPipeClientStream -ArgumentList @('.',$locator.pipe.Substring('\\.\pipe\'.Length),[IO.Pipes.PipeDirection]::InOut,[IO.Pipes.PipeOptions]::Asynchronous);$state.channel.Connect(5000);$state.channel.ReadMode=[IO.Pipes.PipeTransmissionMode]::Message
                $state.nonce=New-Object byte[] 16;for($j=0;$j-lt 16;$j++){$state.nonce[$j]=[Convert]::ToByte($locator.nonce.Substring(2*$j,2),16)}
                $state.openedBefore=[LocalSessionSyntheticCapture.Session]::MonotonicMs;if((Invoke-Controller 1)-ne 1){throw 'Expected original SESSION_OPEN'};$state.openedAfter=[LocalSessionSyntheticCapture.Session]::MonotonicMs
                $broker.deadline=$state.openedAfter+[LocalSessionSyntheticCapture.Session]::FixedSessionMs+[LocalSessionSyntheticCapture.Session]::FixedDispositionGraceMs+[UInt64]10000;$audit.originalDispositionObservationUpperBound=$broker.deadline
                if((Invoke-Controller 2)-ne 3){throw 'Expected one TARGET_HELD; no resend.'};$audit.consumedFrames=@($state.capture.VerifyJournal(3));$watch=[Diagnostics.Stopwatch]::StartNew();$ready=$false
                while($watch.ElapsedMilliseconds-lt 5000){$value=Invoke-Controller 3;if($value-eq 4){$ready=$true;break};if($value-ne 3){throw 'Original daemon registration closed'};Start-Sleep -Milliseconds 25};if(-not $ready){throw 'RegisteredReadClosed unproven'};$audit.registeredReadClosed=$true
                $bad=New-ControllerFrame 3;[BitConverter]::GetBytes([UInt16]3).CopyTo($bad,4);$audit.stage='one_post_registration_invalid_frame';Send-ControllerOnce $bad;$audit.invalidFrameSentOnce=$true
                Wait-OriginalDisposition $broker;if(-not $broker.bindingKnown-or -not $broker.facts.stdoutComplete-or -not $broker.facts.stderrComplete-or $broker.observer.ExitCode-ne 2){throw 'Exact original broker binding/exit2/stdio unproven'}
                $records=@($broker.stderr.Text.Trim()-split '\r?\n'|Where-Object{$_}|ForEach-Object{$_|ConvertFrom-Json})
                if(@($records|Where-Object{$_.schema-eq 'ae-agent.local-broker.failure-observation.v1'-and $_.stage-eq 'broker_loop_caught_failure'-and $_.brokerDisposition-eq 'UNKNOWN'-and $_.result.code-eq 'wire_version_refused'}).Count-ne 1){throw 'Sticky protocol UNKNOWN diagnostic unproven'}
                $earliestDeadline=$state.openedBefore+[LocalSessionSyntheticCapture.Session]::FixedSessionMs+[LocalSessionSyntheticCapture.Session]::FixedDispositionGraceMs
                if($broker.facts.observedExitMono-ge $earliestDeadline){throw 'Broker exit2 cannot distinguish exact target exit from disposition ceiling'}
                $audit.oracle='Real RegisteredReadClosed, then one invalid frame: sticky UNKNOWN plus exact broker exit2 before earliest immutable disposition deadline. Frozen RunFixed with retained original daemon reaches this terminal branch only through original HANDLE ExactExit; no admission upgrade.'
                $audit.finalFrames=@($state.capture.VerifyJournal(3));for($j=0;$j-lt 2;$j++){if($audit.finalFrames[$j].Hash-ne $audit.prelaunchFrames[$j].Hash-or $audit.finalFrames[$j].FileId-ne $audit.prelaunchFrames[$j].FileId){throw 'Original journal prefix drift'}}
                for($j=0;$j-lt 3;$j++){if($audit.finalFrames[$j].Hash-ne $audit.consumedFrames[$j].Hash-or $audit.finalFrames[$j].FileId-ne $audit.consumedFrames[$j].FileId){throw 'Original consumed journal drift'}}
            }
        }
        $eventText=$state.capture.ReadSyntheticEvents();$events=@(if($null-ne $eventText){$eventText.Trim()-split '\r?\n'|Where-Object{$_}|ForEach-Object{$_|ConvertFrom-Json}});$audit.diagnosticEvents=$events
        if($Case-eq 'controller_invalid_frame'){if(@($events|Where-Object{$_.kind-eq 'creation'}).Count-ne 1-or @($events|Where-Object{$_.kind-eq 'sent'-and $_.verb-eq 17}).Count-ne 1){throw 'Original synthetic creation/boot diagnostics mismatch'}}elseif($events.Count-ne 0){throw 'Unexpected synthetic events; native negative proof closed'}
        if($audit.Contains('observerDeadlineExceeded')){throw 'Observer exceeded original disposition observation bound; UNKNOWN cannot become PASS'}
        Assert-NegativeSources;$audit.status='PASS';$audit.nativeBuild=$true;$audit.nativeExecuted=$true
        if($Case-like 'ordinary_fixture_*'){$audit.stage='expected_native_root_refusal_observed';$audit.cleanup='New own scratch preserved; native DENIED before locator/Store/launch, same empty journal. No replay/stop/adoption.'}else{$audit.stage='expected_native_unknown_observed';$audit.cleanup='New own scratch preserved; expected native UNKNOWN remains closed/spent. No replay/stop/adoption.'}
        $state.allClosed=$true;$state.capture.WriteEvidence('receipt.json',($audit|ConvertTo-Json -Depth 12));$audit|ConvertTo-Json -Depth 12
    }catch{
        $audit.failure=[string]$_;$audit.status='UNKNOWN';$audit.cleanup='Original observer/channels/witnesses retained; no new send, stop, reopen, reprovision or following case.';$script:LocalSessionNegativeUnknown=$state
        foreach($child in $state.children){try{Wait-OriginalDisposition $child}catch{$audit.originalObservationError=[string]$_}}
        $audit.children=@($state.children|ForEach-Object{$_.facts});$state.allClosed=(@($state.children|Where-Object{$_.startAttempted-and -not $_.closed}).Count-eq 0)
        if($state.capture){try{$state.capture.WriteEvidence('failure.json',($audit|ConvertTo-Json -Depth 12))}catch{$audit.evidenceWriteFailure=[string]$_}};$audit|ConvertTo-Json -Depth 12
        if(-not $state.allClosed){$lastNotice=[UInt64]0;for(;;){foreach($child in $state.children){try{Update-OriginalObservation $child}catch{$child.facts.pendingObservationFailure=[string]$_}};$state.allClosed=(@($state.children|Where-Object{$_.startAttempted-and -not $_.closed}).Count-eq 0);if($state.allClosed){break};$now=[UInt64][LocalSessionSyntheticCapture.Session]::MonotonicMs;if($lastNotice-eq 0-or $now-$lastNotice-ge 30000){Write-Host 'UNKNOWN_PENDING: original references retained; external stop/adoption/replay forbidden';$lastNotice=$now};Start-Sleep -Milliseconds 250}}
        throw
    }finally{
        if($state.allClosed){if($state.channel){$state.channel.Dispose()};foreach($child in $state.children){if($child.observer){$child.observer.Dispose()};$child.process.Dispose()};if($state.capture){$state.capture.Dispose()}}
    }
}
