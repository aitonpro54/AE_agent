param(
  [string]$TaskName = "AE Agent Daemon"
)

$ErrorActionPreference = "Stop"

$Task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if (!$Task) {
  Write-Host "Startup task not installed: $TaskName"
  exit 0
}

$Info = Get-ScheduledTaskInfo -TaskName $TaskName

[PSCustomObject]@{
  TaskName = $Task.TaskName
  State = $Task.State
  LastRunTime = $Info.LastRunTime
  LastTaskResult = $Info.LastTaskResult
  NextRunTime = $Info.NextRunTime
  Actions = ($Task.Actions | ForEach-Object { "$($_.Execute) $($_.Arguments)" }) -join "`n"
} | Format-List
