param(
  [int]$Port = 3456,
  [string]$Token = "codex-ae-local"
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Server = Join-Path $ProjectRoot "mcp-server\server.js"
$BundledNode = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"

if (Test-Path -LiteralPath $BundledNode) {
  $Node = $BundledNode
} else {
  $Node = "node"
}

$env:AE_BRIDGE_PORT = [string]$Port
$env:AE_BRIDGE_TOKEN = $Token
$env:AE_BRIDGE_ONLY = "1"

& $Node $Server --bridge-only
