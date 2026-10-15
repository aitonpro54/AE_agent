[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path -LiteralPath $compiler)) { throw 'Windows .NET Framework C# compiler is required.' }
$outputDir = Join-Path $repo '.codex-runtime\windows-mcp-launcher'
[void](New-Item -ItemType Directory -Force -Path $outputDir)
$output = Join-Path $outputDir 'ae-mcp-launcher.exe'
& $compiler /nologo /target:winexe /platform:x64 /optimize+ "/out:$output" (Join-Path $PSScriptRoot 'windows-mcp-launcher.cs')
if ($LASTEXITCODE -ne 0) { throw "MCP launcher build failed: $LASTEXITCODE" }
Get-Item -LiteralPath $output | Select-Object FullName, Length
