param([string]$Operator,[string]$Mode,[string]$Job,[string]$Node)
$ErrorActionPreference = 'Stop'
. $Operator

$script:FixtureRoot = [IO.Path]::GetDirectoryName($Job)
$script:FixtureActorFile = Join-Path $script:FixtureRoot 'fake-actors.json'
$script:FixtureQueue = Join-Path $script:FixtureRoot 'batch.xml'

function Get-AmeProfile($job) {
    [pscustomobject]@{queue=$script:FixtureQueue; watch=(Join-Path $script:FixtureRoot 'watch.xml');
        preferences=(Join-Path $script:FixtureRoot 'prefs.xml'); port=[int]$env:CORE4_AME_TEST_PORT}
}
function Get-AmeInstallation($profile,$job) { return @{} }
function Get-AmeActors {
    if (Test-Path -LiteralPath $script:FixtureActorFile) {
        $actors = Read-AmeJson $script:FixtureActorFile
        $actors.service
        $actors.renderer
    }
}
function Assert-AmeListener($actor,[int]$port) {
    if ($actor.path -cne 'fixture-console' -or $port -ne [int]$env:CORE4_AME_TEST_PORT) { throw 'ame_listener_unverified' }
}
function Start-AmeService($installation,$run,[int]$port) {
    if ($env:CORE4_AME_TEST_PAUSE -ceq 'isolated') {
        Write-AmeRecord (Join-Path $script:FixtureRoot 'isolated.ready') 'ready'
        while ($true) { Start-Sleep -Seconds 1 }
    }
    $actors = @{service=@{pid=101;path='fixture-console';birth='10'};renderer=@{pid=102;path='fixture-renderer';birth='11'}}
    Write-AmeJson (Join-Path $run 'actors.json') $actors
    Write-AmeJson $script:FixtureActorFile $actors
}
function Stop-AmeService($known) {
    if (@(Assert-AmeActors $known).Count) {
        [IO.File]::Delete($script:FixtureActorFile)
        Write-AmeRecord $script:FixtureQueue '<PremiereData Version="3"><BatchVersion>2</BatchVersion></PremiereData>'
    }
}

try {
    Invoke-CoreAmeIsolated $Mode $Job $Node | ConvertTo-Json -Compress -Depth 10
} catch {
    [Console]::Error.WriteLine($_.Exception.Message)
    exit 1
}
