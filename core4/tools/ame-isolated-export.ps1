param([string]$Action, [string]$JobFile, [string]$NodeExe)

. (Join-Path $PSScriptRoot 'ame-isolated-host.ps1')
$script:AmeTools = $PSScriptRoot
$script:AmeUtf8 = [Text.UTF8Encoding]::new($false)

function Assert-AmePath([string]$file, [switch]$Directory) {
    if ($file -cnotmatch '^[A-Za-z]:\\' -or [IO.Path]::GetFullPath($file) -cne $file) { throw 'ame_local_path_required' }
    for ($cursor = $file; $cursor; $cursor = [IO.Path]::GetDirectoryName($cursor)) {
        $item = Get-Item -LiteralPath $cursor -Force
        if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint -or
            (($cursor -ne $file -or $Directory) -ne [bool]$item.PSIsContainer)) { throw 'ame_path_unverified' }
    }
}

function Get-AmeHash([string]$file) {
    Assert-AmePath $file
    (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Write-AmeRecord([string]$file, [string]$content) {
    $stage = $file + '.stage-' + [Guid]::NewGuid().ToString('n')
    $stream = [IO.File]::Open($stage,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    try {
        $bytes = $script:AmeUtf8.GetBytes($content)
        $stream.Write($bytes,0,$bytes.Length)
        $stream.Flush($true)
    } finally { $stream.Dispose() }
    [IO.File]::Move($stage,$file)
}

function Write-AmeJson([string]$file,$value) { Write-AmeRecord $file ($value | ConvertTo-Json -Compress -Depth 10) }

function Read-AmeText([string]$file,[long]$limit) {
    Assert-AmePath $file
    if ((Get-Item -LiteralPath $file).Length -gt $limit) { throw 'ame_evidence_too_large' }
    [IO.File]::ReadAllText($file)
}

function Read-AmeJson([string]$file) { ConvertFrom-Json -InputObject (Read-AmeText $file 1048576) }

function ConvertFrom-AmeXml([string]$text) {
    $settings = [Xml.XmlReaderSettings]::new()
    $settings.DtdProcessing = [Xml.DtdProcessing]::Ignore
    $settings.XmlResolver = $null
    $settings.MaxCharactersInDocument = 67108864
    $reader = [Xml.XmlReader]::Create([IO.StringReader]::new($text),$settings)
    try {
        $xml = [Xml.XmlDocument]::new()
        $xml.XmlResolver = $null
        $xml.Load($reader)
        return ,$xml
    } finally { $reader.Dispose() }
}

function Read-AmeQueue([string]$file) {
    $xml = ConvertFrom-AmeXml (Read-AmeText $file 67108864)
    if ($xml.DocumentElement.Name -cne 'PremiereData') { throw 'ame_queue_unrecognized' }
    return ,$xml
}

function Assert-AmeProfile($profile) {
    $settings = ConvertFrom-AmeXml (Read-AmeText $profile.preferences 1048576)
    foreach ($expected in @(@('BatchSaveLocation',$profile.queue),@('WatchFolderInfoSaveLocation',$profile.watch))) {
        $values = @($settings.SelectNodes("//prop.pair[key='$($expected[0])']/ustring"))
        if ($values.Count -ne 1 -or $values[0].InnerText -ine $expected[1]) { throw 'ame_profile_unverified' }
    }
    $watch = ConvertFrom-AmeXml (Read-AmeText $profile.watch 1048576)
    if ($watch.DocumentElement.Name -cne 'PremiereData' -or $watch.DocumentElement.SelectNodes('*').Count) { throw 'ame_watch_folders_present' }
}

function Assert-AmeInputs($job,[string]$file,[string]$fileHash) {
    if ((Get-AmeHash $file) -cne $fileHash) { throw 'ame_job_changed' }
    foreach ($field in @('project','source','preset')) {
        if ((Get-AmeHash $job.$field) -cne $job.($field + 'Sha256')) { throw 'ame_input_hash' }
    }
}

function Get-AmeKnownActors($op) {
    $file = Join-Path $op.run 'actors.json'
    if (Test-Path -LiteralPath $file) { return Read-AmeJson $file }
    $file = Join-Path $op.run 'service.json'
    $service = if (Test-Path -LiteralPath $file) { Read-AmeJson $file }
    [pscustomobject]@{service=$service;renderer=$null}
}

function Get-AmeHistory($op,$actors) {
    Assert-AmeListener $actors.service $op.port
    $text = Invoke-AmeRequest $op.port 'history'
    $xml = ConvertFrom-AmeXml $text
    if ($xml.DocumentElement.Name -cne 'payload' -or $xml.payload.ServerStatus -cne 'Online' -or
        $xml.SelectNodes('/payload/CompletedJobs').Count -ne 1) { throw 'ame_history_unverified' }
    [pscustomobject]@{text=$text;id=[string]$xml.payload.JobId;status=[string]$xml.payload.JobStatus;completed=@($xml.SelectNodes('/payload/CompletedJobs/*'))}
}

function Get-AmeTerminal($op,$job,$actors) {
    $terminalFile = Join-Path $op.run 'terminal.xml'
    $acceptedFile = Join-Path $op.run 'accepted.xml'
    $acceptedId = if (Test-Path -LiteralPath $acceptedFile) {
        $accepted = ConvertFrom-AmeXml (Read-AmeText $acceptedFile 1048576)
        [string]$accepted.payload.JobId
    }
    if (Test-Path -LiteralPath $terminalFile) {
        $terminal = ConvertFrom-AmeXml (Read-AmeText $terminalFile 1048576)
        $completed = @($terminal.SelectNodes('/payload/CompletedJobs/*'))
        $currentId = [string]$terminal.payload.JobId
    } else {
        $live = @(Assert-AmeActors $actors)
        if (!@($live | Where-Object { Test-AmeActor $_ $actors.service }).Count) {
            if ($live.Count) { throw 'ame_result_pending' }
            return @{state='unknown'}
        }
        $timer = [Diagnostics.Stopwatch]::StartNew()
        do {
            $observed = Get-AmeHistory $op $actors
            if ($observed.completed.Count) { break }
            if (!$observed.id -and $observed.status -ceq 'Not Found') { return @{state='unknown'} }
            if (($acceptedId -and $observed.id -cne $acceptedId) -or $observed.status -cnotin @('Queued','Encoding','Paused','Success','Completed with warnings','Failed','Stopped')) { throw 'ame_job_unverified' }
            Start-Sleep -Milliseconds 500
        } while ($timer.Elapsed.TotalSeconds -lt 180)
        if (!$observed.completed.Count) { throw 'ame_result_pending' }
        $completed = $observed.completed
        $currentId = $observed.id
    }
    $item = $completed[0]
    if ($completed.Count -ne 1 -or $item.Name -cne 'Job' -or !$item.JobId -or $item.JobId -cne $currentId -or ($acceptedId -and $item.JobId -cne $acceptedId) -or
        $item.SourceFilePath -ine $job.source -or $item.SourcePresetPath -ine $job.preset -or $item.DestinationPath -ine $job.output -or
        $item.JobStatus -cnotin @('Success','Completed with warnings','Failed','Stopped')) { throw 'ame_terminal_unverified' }
    if (!(Test-Path -LiteralPath $terminalFile)) { Write-AmeRecord $terminalFile $observed.text }
    $result = @{state='native-failed';jobId=[string]$item.JobId;status=[string]$item.JobStatus}
    if ($item.JobStatus -cin @('Success','Completed with warnings')) {
        try {
            Assert-AmePath $job.output
            $stream = [IO.File]::OpenRead($job.output)
            try {
                $header = [byte[]]::new(12)
                if ($stream.Length -gt 128MB -or $stream.Read($header,0,12) -ne 12 -or
                    [Text.Encoding]::ASCII.GetString($header,4,4) -cne 'ftyp') { throw 'ame_media_unverified' }
                $result.bytes = $stream.Length
            } finally { $stream.Dispose() }
            $result.sha256 = Get-AmeHash $job.output
            $result.output = $job.output
            $result.state = 'done'
        } catch { $result.state = 'media-unverified' }
    }
    return $result
}

function Restore-AmeQueue($op,$job,[bool]$submitted) {
    if (@(Get-AmeActors).Count) { throw 'ame_process_still_active' }
    if (Test-Path -LiteralPath $op.held) {
        if ((Get-AmeHash $op.held) -cne $op.queueHash) { throw 'ame_held_queue_changed' }
        if (Test-Path -LiteralPath $op.queue) {
            $xml = Read-AmeQueue $op.queue
            $items = @($xml.SelectNodes('/PremiereData/BatchItem'))
            $groups = @($xml.SelectNodes('/PremiereData/Groups/Group'))
            $rootGroups = @($xml.SelectNodes('/PremiereData/BatchItemGroup'))
            if ($groups.Count -ne $items.Count -or $rootGroups.Count -ne $items.Count -or $items.Count -gt 1 -or
                ($items.Count -eq 1 -and (!$submitted -or $items[0].OutputFileName -ine $job.output))) { throw 'ame_isolated_queue_changed' }
            [IO.File]::Move($op.queue,$op.retired)
        }
        if (@(Get-AmeActors).Count) { throw 'ame_process_still_active' }
        [IO.File]::Move($op.held,$op.queue)
    }
    if ((Get-AmeHash $op.queue) -cne $op.queueHash) { throw 'ame_queue_restore_unverified' }
}

function Complete-AmeOperation($op,$job,[string]$active) {
    $actors = Get-AmeKnownActors $op
    $submitted = Test-Path -LiteralPath (Join-Path $op.run 'dispatch.json')
    $result = if ($submitted) { Get-AmeTerminal $op $job $actors } else { @{state='not-dispatched'} }
    Stop-AmeService $actors
    Restore-AmeQueue $op $job $submitted
    if (Test-Path -LiteralPath $op.retired) {
        Assert-AmePath $op.retired
        [IO.File]::Move($op.retired,(Join-Path $op.run 'isolated-queue.xml'))
    }
    $result.queueRestored = $true
    $result.queueSha256 = $op.queueHash
    $result.binding = $op.binding
    $result.evidence = $op.run
    $file = Join-Path $op.run 'final.json'
    if (!(Test-Path -LiteralPath $file)) { Write-AmeJson $file $result }
    if ((Get-AmeHash $active) -cne (Get-AmeHash (Join-Path $op.run 'operation.json'))) { throw 'ame_recovery_binding' }
    [IO.File]::Delete($active)
    return Read-AmeJson $file
}

function Invoke-CoreAmeIsolated([string]$mode,[string]$file,[string]$node) {
    if ($mode -cnotin @('run','recover')) { throw 'ame_usage' }
    $jobHash = Get-AmeHash $file
    $job = Read-AmeJson $file
    if ((Get-AmeHash $file) -cne $jobHash) { throw 'ame_job_changed' }
    if ($job.output -cnotmatch '^[A-Za-z]:\\' -or [IO.Path]::GetFullPath($job.output) -cne $job.output) { throw 'ame_output_scope' }
    Assert-AmePath ([IO.Path]::GetDirectoryName($job.output)) -Directory
    $profile = Get-AmeProfile $job
    Assert-AmePath ([IO.Path]::GetDirectoryName($profile.queue)) -Directory
    $active = $profile.queue + '.core4-ame-active.json'
    $run = $job.output + '.core4-ame.isolated'
    $lockKey = [BitConverter]::ToString([Security.Cryptography.SHA256]::Create().ComputeHash($script:AmeUtf8.GetBytes($profile.queue.ToUpperInvariant()))).Replace('-','')
    $mutex = [Threading.Mutex]::new($false,"Global\Core4Ame-$lockKey")
    $locked = $false
    try {
        try { $locked = $mutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $locked = $true }
        if (!$locked) { throw 'ame_isolation_busy' }
        if ($mode -ceq 'recover') {
            $op = Read-AmeJson (Join-Path $run 'operation.json')
            if ($op.jobHash -cne $jobHash -or $op.run -cne $run -or $op.queue -cne $profile.queue -or $op.port -ne $profile.port -or
                $op.id -cnotmatch '^[0-9a-f]{32}$' -or $op.held -cne ($op.queue + '.core4-held-' + $op.id) -or
                $op.retired -cne ($op.queue + '.core4-test-' + $op.id)) { throw 'ame_recovery_binding' }
            if (!(Test-Path -LiteralPath $active)) { return Read-AmeJson (Join-Path $run 'final.json') }
            if ((Get-AmeHash $active) -cne (Get-AmeHash (Join-Path $run 'operation.json'))) { throw 'ame_recovery_binding' }
            return Complete-AmeOperation $op $job $active
        }
        if (Test-Path -LiteralPath $active) { throw 'ame_recovery_required' }
        $rawPlan = & $node (Join-Path $script:AmeTools 'ame-media-export.js') plan $file
        if ($LASTEXITCODE -ne 0) { throw 'ame_plan_refused' }
        $plan = $rawPlan | ConvertFrom-Json
        Assert-AmeInputs $job $file $jobHash
        if (@(Get-AmeActors).Count) { throw 'ame_host_busy' }
        Assert-AmeProfile $profile
        $installation = Get-AmeInstallation $profile $job
        $queueHash = Get-AmeHash $profile.queue
        $original = Read-AmeQueue $profile.queue
        foreach ($output in $original.SelectNodes('/PremiereData/BatchItem/OutputFileName')) {
            if ($output.InnerText -and [IO.Path]::GetFullPath($output.InnerText) -ieq $job.output) { throw 'ame_output_is_shared' }
        }
        $id = [Guid]::NewGuid().ToString('n')
        $op = [ordered]@{id=$id;binding=$plan.binding;jobHash=$jobHash;run=$run;queue=$profile.queue;queueHash=$queueHash;
            held=($profile.queue + '.core4-held-' + $id);retired=($profile.queue + '.core4-test-' + $id);port=$profile.port}
        $null = New-Item -ItemType Directory -Path $run
        Assert-AmePath $run -Directory
        Write-AmeJson (Join-Path $run 'operation.json') $op
        Write-AmeJson $active $op
        try {
            if (@(Get-AmeActors).Count -or (Get-AmeHash $op.queue) -cne $op.queueHash) { throw 'ame_shared_queue_changed' }
            [IO.File]::Move($op.queue,$op.held)
            Start-AmeService $installation $run $op.port
            $actors = Get-AmeKnownActors $op
            $live = @(Assert-AmeActors $actors)
            $history = Get-AmeHistory $op $actors
            Assert-AmeProfile $profile
            Assert-AmeInputs $job $file $jobHash
            if ($live.Count -ne 2 -or $history.id -or $history.status -cne 'Not Found' -or $history.completed.Count -or
                (Test-Path -LiteralPath $op.queue) -or (Get-AmeHash $op.held) -cne $op.queueHash -or (Test-Path -LiteralPath $job.output)) { throw 'ame_dispatch_preflight_changed' }
            $escape = [Security.SecurityElement]
            $manifest = '<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE manifest><manifest version="1.0">' +
                '<SourcePresetPath>' + $escape::Escape($job.preset) + '</SourcePresetPath><SourceFilePath>' + $escape::Escape($job.source) +
                '</SourceFilePath><DestinationPath>' + $escape::Escape($job.output) + '</DestinationPath></manifest>'
            Write-AmeRecord (Join-Path $run 'request.xml') $manifest
            if (@(Assert-AmeActors $actors).Count -ne 2) { throw 'ame_dispatch_preflight_changed' }
            Assert-AmeListener $actors.service $op.port
            Write-AmeJson (Join-Path $run 'dispatch.json') @{binding=$op.binding;utc=[DateTime]::UtcNow.ToString('o')}
            $response = Invoke-AmeRequest $op.port 'job' $manifest
            $accepted = ConvertFrom-AmeXml $response
            if ($accepted.payload.SubmitResult -cne 'Accepted' -or !$accepted.payload.JobId) { throw 'ame_submission_unverified' }
            Write-AmeRecord (Join-Path $run 'accepted.xml') $response
        } catch {
            $failure = $_
            try { $null = Complete-AmeOperation $op $job $active } catch { throw "ame_recovery_required ($($_.Exception.Message))" }
            throw $failure
        }
        return Complete-AmeOperation $op $job $active
    } finally {
        if ($locked) { $mutex.ReleaseMutex() }
        $mutex.Dispose()
    }
}

if ($MyInvocation.InvocationName -ne '.') {
    $ErrorActionPreference = 'Stop'
    try {
        $result = Invoke-CoreAmeIsolated $Action $JobFile $NodeExe
        $result | ConvertTo-Json -Compress -Depth 10
        if ($result.state -cin @('unknown','native-failed','media-unverified')) { exit 2 }
    } catch {
        [Console]::Error.WriteLine($_.Exception.Message)
        exit 1
    }
}
