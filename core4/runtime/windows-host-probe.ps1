$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$processes = @(Get-CimInstance Win32_Process -Filter "Name = 'AfterFX.exe'")
$items = @()
foreach ($item in $processes) {
    if (-not $item.ExecutablePath -or -not $item.CreationDate) { throw 'host_process_identity_unavailable' }
    $exe = Get-Item -LiteralPath $item.ExecutablePath
    $items += [ordered]@{ pid = [int]$item.ProcessId; birth = $item.CreationDate.ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ss.fffffffZ'); executablePath = $item.ExecutablePath; executableHash = (Get-FileHash -LiteralPath $item.ExecutablePath -Algorithm SHA256).Hash.ToLowerInvariant(); executableLength = $exe.Length }
}
[ordered]@{ version = 1; hostname = [Environment]::MachineName; observedAt = [DateTime]::UtcNow.ToString('o'); processes = $items } | ConvertTo-Json -Depth 5 -Compress
