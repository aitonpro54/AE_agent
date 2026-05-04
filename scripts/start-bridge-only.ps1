param(
  [int]$Port = 3456,
  [string]$Token = "codex-ae-local"
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Daemon = Join-Path $ProjectRoot "mcp-server\bridge-daemon.js"
$BundledNode = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"

if (Test-Path -LiteralPath $BundledNode) {
  $Node = $BundledNode
} else {
  $Node = "node"
}

$env:AE_BRIDGE_PORT = [string]$Port
$env:AE_BRIDGE_TOKEN = $Token

& $Node $Daemon
