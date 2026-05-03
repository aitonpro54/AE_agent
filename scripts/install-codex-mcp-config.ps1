$ErrorActionPreference = "Stop"

$ConfigPath = Join-Path $env:USERPROFILE ".codex\config.toml"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$ServerPath = Join-Path $ProjectRoot "mcp-server\server.js"
$NodePath = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"

if (!(Test-Path -LiteralPath $ConfigPath)) {
  throw "Codex config not found: $ConfigPath"
}

if (!(Test-Path -LiteralPath $ServerPath)) {
  throw "AE MCP server not found: $ServerPath"
}

if (!(Test-Path -LiteralPath $NodePath)) {
  throw "Codex bundled Node runtime not found: $NodePath"
}

$BackupPath = "$ConfigPath.ae-mcp-backup-$(Get-Date -Format yyyyMMdd-HHmmss)"
Copy-Item -LiteralPath $ConfigPath -Destination $BackupPath

$Config = Get-Content -LiteralPath $ConfigPath -Raw
$SectionPattern = '(?ms)^\[mcp_servers\."after-effects"\]\r?\n.*?(?=^\[|\z)'

$Section = @"
[mcp_servers."after-effects"]
enabled = true
command = '$NodePath'
args = ['$ServerPath']
startup_timeout_sec = 10
tool_timeout_sec = 120

[mcp_servers."after-effects".env]
AE_BRIDGE_PORT = '3456'
AE_BRIDGE_TOKEN = 'codex-ae-local'
AE_COMMAND_TIMEOUT_MS = '120000'
"@

if ($Config -match $SectionPattern) {
  $Config = [regex]::Replace($Config, $SectionPattern, $Section + "`r`n", 1)
} else {
  $Config = $Config.TrimEnd() + "`r`n`r`n" + $Section + "`r`n"
}

Set-Content -LiteralPath $ConfigPath -Value $Config -Encoding UTF8

Write-Host "Updated Codex MCP config: $ConfigPath"
Write-Host "Backup saved to: $BackupPath"
Write-Host "Added MCP server id: after-effects"
