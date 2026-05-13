param(
  [int]$Port = 3456,
  [string]$Token = "codex-ae-local",
  [string]$TaskName = "AE Agent Daemon",
  [int]$StartupDelaySeconds = 10
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$StartScript = Join-Path $ProjectRoot "scripts\start-bridge-only.ps1"

if (!(Test-Path -LiteralPath $StartScript)) {
  throw "Daemon start script not found: $StartScript"
}

$UserId = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$PowerShell = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
$Argument = "-NoProfile -ExecutionPolicy Bypass -File `"$StartScript`" -Port $Port -Token `"$Token`""

$Action = New-ScheduledTaskAction -Execute $PowerShell -Argument $Argument -WorkingDirectory $ProjectRoot
$Trigger = New-ScheduledTaskTrigger -AtLogOn -User $UserId
if ($StartupDelaySeconds -gt 0) {
  $Trigger.Delay = "PT${StartupDelaySeconds}S"
}

$Settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Days 365) `
  -MultipleInstances IgnoreNew `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 1)

$Description = "Starts the local Codex After Effects MCP bridge daemon on 127.0.0.1:$Port at user logon."

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $Action `
  -Trigger $Trigger `
  -Settings $Settings `
  -Description $Description `
  -Force | Out-Null

Write-Host "Installed startup task: $TaskName"
Write-Host "User: $UserId"
Write-Host "Command: $PowerShell $Argument"
