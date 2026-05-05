param(
  [string]$TaskName = "Codex AE MCP Bridge Daemon"
)

$ErrorActionPreference = "Stop"

$Task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if (!$Task) {
  Write-Host "Startup task not found: $TaskName"
  exit 0
}

Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
Write-Host "Removed startup task: $TaskName"
