function Get-AmeProfile($job) {
    if ($job.target -cnotmatch '^ame-([0-9]{1,3})\.0$') { throw 'ame_target_unsupported' }
    $major = [int]$Matches[1]
    $profile = Join-Path ([Environment]::GetFolderPath('MyDocuments')) "Adobe/Adobe Media Encoder/$major.0"
    [pscustomobject]@{ major=$major; queue=(Join-Path $profile 'batch.xml'); watch=(Join-Path $profile 'Watch Folder Info.xml'); preferences=(Join-Path $profile 'AMEPrefs.xml'); port=52741 }
}

function Get-AmeInstallation($profile, $job) {
    $directories = Get-ChildItem -LiteralPath (Join-Path $env:ProgramFiles 'Adobe') -Directory -Filter 'Adobe Media Encoder *'
    $matches = @(foreach ($directory in $directories) {
        $file = Get-Item -LiteralPath (Join-Path $directory.FullName 'Adobe Media Encoder.exe') -ErrorAction SilentlyContinue
        if ($file -and $file.VersionInfo.FileMajorPart -eq $profile.major -and [string]$file.VersionInfo.FilePrivatePart -ceq $job.build) { $file }
    })
    if ($matches.Count -ne 1) { throw 'ame_installation_unavailable' }
    $renderer = $matches[0].FullName
    $directory = $matches[0].DirectoryName
    $console = Join-Path $directory 'ame_webservice_console.exe'
    $library = Join-Path $directory 'ame_webservice.dll'
    Assert-AmePath $renderer
    foreach ($file in @($console,$library)) {
        Assert-AmePath $file
        $signed = Get-AuthenticodeSignature -LiteralPath $file
        if ($signed.Status -ne 'Valid' -or $signed.SignerCertificate.Subject -notmatch '(?:^|, )O=Adobe Inc\.,') { throw 'ame_unverified_binary' }
    }
    [pscustomobject]@{ directory=$directory; renderer=$renderer; rendererHash=(Get-AmeHash $renderer); console=$console; library=$library }
}

function Get-AmeActors {
    foreach ($name in @('Adobe Media Encoder','ame_webservice_console','AMEWebService','AMEWinService')) {
        foreach ($process in @(Get-Process -Name $name -ErrorAction SilentlyContinue)) {
            if (!$process.Path) { throw 'ame_process_unobserved' }
            [pscustomobject]@{ pid=$process.Id; path=$process.Path; birth=$process.StartTime.ToUniversalTime().Ticks.ToString() }
        }
    }
}

function Test-AmeActor($a, $b) { $a -and $b -and $a.pid -eq $b.pid -and $a.birth -ceq $b.birth -and $a.path -ieq $b.path }

function Assert-AmeListener($actor, [int]$port) {
    $listeners = @(Get-NetTCPConnection -State Listen -ErrorAction Stop | Where-Object OwningProcess -eq $actor.pid)
    if (@($listeners | Where-Object LocalAddress -cne '127.0.0.1').Count -or @($listeners | Where-Object LocalPort -eq $port).Count -ne 1) { throw 'ame_listener_unverified' }
}

function Start-AmeService($installation, $run, [int]$port) {
    $directory = Join-Path $run 'local-service'
    $null = New-Item -ItemType Directory -Path $directory
    foreach ($file in @($installation.console,$installation.library)) {
        $copy = Join-Path $directory ([IO.Path]::GetFileName($file))
        [IO.File]::Copy($file,$copy,$false)
        if ((Get-AmeHash $file) -cne (Get-AmeHash $copy)) { throw 'ame_binary_copy_changed' }
    }
    Write-AmeRecord (Join-Path $directory 'ame_webservice_config.ini') "ip = 127.0.0.1`nport = $port`njob_history = 10`n"
    $console = Join-Path $directory 'ame_webservice_console.exe'
    $sockets = @()
    $child = $null
    try {
        # A non-listening reservation prevents a fallback to either Adobe default port.
        foreach ($blocked in @(8080,8000)) {
            $socket = [Net.Sockets.Socket]::new([Net.Sockets.AddressFamily]::InterNetwork,[Net.Sockets.SocketType]::Stream,[Net.Sockets.ProtocolType]::Tcp)
            $sockets += $socket
            $socket.ExclusiveAddressUse = $true
            $socket.Bind([Net.IPEndPoint]::new([Net.IPAddress]::Any,$blocked))
        }
        if (@(Get-AmeActors).Count -or @(Get-NetTCPConnection -State Listen | Where-Object LocalPort -eq $port).Count) { throw 'ame_host_busy' }
        if ((Get-AmeHash $installation.renderer) -cne $installation.rendererHash) { throw 'ame_renderer_changed' }
        $originalPath = $env:Path
        try {
            $env:Path = "$($installation.directory);$originalPath"
            $child = Start-Process -FilePath $console -WorkingDirectory $directory -WindowStyle Hidden -PassThru `
                -RedirectStandardOutput (Join-Path $run 'service.stdout.log') -RedirectStandardError (Join-Path $run 'service.stderr.log')
        } finally { $env:Path = $originalPath }
        $service = [pscustomobject]@{pid=$child.Id;path=$console;birth=$child.StartTime.ToUniversalTime().Ticks.ToString()}
        Write-AmeJson (Join-Path $run 'service.json') $service
        $timer = [Diagnostics.Stopwatch]::StartNew()
        do {
            if ($child.HasExited) { throw 'ame_service_exited' }
            $actors = @(Get-AmeActors)
            $renderers = @($actors | Where-Object path -ieq $installation.renderer)
            if (@($actors | Where-Object { !(Test-AmeActor $_ $service) -and $_.path -ine $installation.renderer }).Count -or $renderers.Count -gt 1) { throw 'ame_foreign_process' }
            if ($renderers.Count -eq 1 -and $renderers[0].birth -ge $service.birth) {
                if (!(Test-Path -LiteralPath (Join-Path $run 'actors.json'))) {
                    Write-AmeJson (Join-Path $run 'actors.json') ([pscustomobject]@{service=$service;renderer=$renderers[0]})
                }
                $listeners = @(Get-NetTCPConnection -State Listen | Where-Object OwningProcess -eq $service.pid)
                if (@($listeners | Where-Object LocalAddress -cne '127.0.0.1').Count) { throw 'ame_listener_unverified' }
                if (@($listeners | Where-Object LocalPort -eq $port).Count -eq 1) {
                    try {
                        $status = ConvertFrom-AmeXml (Invoke-AmeRequest $port 'server')
                        if ($status.payload.ServerStatus -ceq 'Online') { return }
                    } catch { }
                }
            }
            Start-Sleep -Milliseconds 350
        } while ($timer.Elapsed.TotalSeconds -lt 45)
        throw 'ame_service_start_timeout'
    } catch {
        if ($child -and !$child.HasExited) { $child.Kill() }
        throw
    } finally { foreach ($socket in $sockets) { $socket.Dispose() } }
}

function Assert-AmeActors($known) {
    $live = @(Get-AmeActors)
    foreach ($actor in $live) {
        if (!(Test-AmeActor $actor $known.service) -and !(Test-AmeActor $actor $known.renderer)) { throw 'ame_foreign_process' }
    }
    return $live
}

function Stop-AmeService($known) {
    $live = @(Assert-AmeActors $known)
    foreach ($actor in @($known.renderer,$known.service)) {
        if (!$actor -or !@($live | Where-Object { Test-AmeActor $_ $actor }).Count) { continue }
        $process = Get-Process -Id $actor.pid -ErrorAction SilentlyContinue
        if (!$process) { continue }
        if ($process.Path -ine $actor.path -or $process.StartTime.ToUniversalTime().Ticks.ToString() -cne $actor.birth) { throw 'ame_process_changed' }
        if ($actor.pid -eq $known.renderer.pid) {
            if (!$process.CloseMainWindow()) { throw 'ame_renderer_needs_close' }
        } else { $process.Kill() }
        if (!$process.WaitForExit(15000)) { throw 'ame_process_still_active' }
    }
    if (@(Get-AmeActors).Count) { throw 'ame_process_still_active' }
}

function Invoke-AmeRequest([int]$port,[string]$resource,[string]$manifest) {
    Add-Type -AssemblyName System.Net.Http
    $handler = [Net.Http.HttpClientHandler]::new()
    $handler.UseProxy = $false
    $handler.AllowAutoRedirect = $false
    $client = [Net.Http.HttpClient]::new($handler)
    $client.Timeout = [TimeSpan]::FromSeconds(15)
    $client.MaxResponseContentBufferSize = 1048576
    try {
        $uri = "http://127.0.0.1:$port/$resource"
        if ($manifest) {
            $body = [Net.Http.StringContent]::new($manifest,[Text.Encoding]::UTF8,'text/xml')
            $reply = $client.PostAsync($uri,$body).GetAwaiter().GetResult()
        } else { $reply = $client.GetAsync($uri).GetAwaiter().GetResult() }
        if (!$reply.IsSuccessStatusCode) { throw 'ame_http_refused' }
        $reply.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    } finally { $client.Dispose() }
}
