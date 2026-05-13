$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Source = Join-Path $ProjectRoot "cep-panel"
$Destination = Join-Path $env:APPDATA "Adobe\CEP\extensions\com.codex.aemcpbridge"

if (!(Test-Path -LiteralPath $Source)) {
  throw "CEP panel source not found: $Source"
}

New-Item -ItemType Directory -Force -Path $Destination | Out-Null
Get-ChildItem -LiteralPath $Source -Force | Copy-Item -Destination $Destination -Recurse -Force

foreach ($Version in 7..13) {
  $Key = "HKCU\Software\Adobe\CSXS.$Version"
  & reg add $Key /v PlayerDebugMode /t REG_SZ /d 1 /f | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to write PlayerDebugMode for CSXS.$Version"
  }
}

Write-Host "Installed CEP panel to: $Destination"
Write-Host "Enabled PlayerDebugMode for CSXS.7 through CSXS.13"
Write-Host "Restart After Effects, then open Window > Extensions > AE Agent 1.0.0"
