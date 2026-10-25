# Пакет переключения Core

Этот пакет подготовлен офлайн. Выполнены synthetic CEP/state tests и сборка WinExe launcher; production state, credentials, installed CEP, MCP/Antigravity config и runtime не переключались. Команды ниже относятся к будущему отдельно разрешённому cutover. Prepare/status не выдают authority: `runtimeProofVerified:false`, `readyForStartup:false` остаются неизменными даже при полном совпадении файлов.

## Состав и зафиксированные границы

- Legacy: `C:/Users/Ant/Documents/Codex/AE_agent`, source checkpoint `1b48076e0aa4a68f21b3229af511d9e526ed0072`. Core: `C:/Users/Ant/Documents/Codex/AE_Agent_Core`.
- Core workflow: `get_plan_builder_contract` → `build_solution_plan` → `propose_ai_agent_plan` → dry-run → риск/ручное подтверждение → read-back. `search_solutions/get_solution` отсутствуют.
- `scripts/core-state-migration.js`: только `prepare`, `status`, `prepare-rollback`, `status-rollback`; CLI roots фиксированы. `scripts/core-state-migration-smoke.js`: только synthetic ресурсы внутри ignored Core test root. Нет apply, grant flag, process control, HTTP или native factories.
- Default layout: `.codex-runtime/project-intent/project-intent-state.json`, соседний `.lifecycle-initialized.json`, `logs/autonomy-preference.json`. Неизвестный/missing/corrupt store/marker/preference, нештатные redirects или namespace entries закрывают подготовку. Установленный `AE_BRIDGE_STATE_DIR` требует отдельного layout review: этот пакет не угадывает actual path.
- Config reader имеет ограниченный supported subset: обычные unescaped bare/double/singlequoted table/key tokens, `.env` tables, trailing comments и scalar env values. Escaped/complex selectors, dotted LHS, любые inline MCP tables и неподдержанные key/value forms закрываются `migration_config_layout_unknown` до capture; это не общий TOML parser. Env keys в точно распознанной unrelated server env table не меняют выбранный AE layout. Ошибка содержит только filename/lineNumber/fieldName/reason.
- Store и preference переносятся побайтово. Marker меняет только `storePathHash = project-lifecycle-contract.hash(path.resolve(finalStatePath))`; schema остаётся `ae-project-lifecycle-initialized.v1`. Защищённые project paths/keys/revisions/ownership/review/lifecycle records не переписываются. Explicit OFF сохраняется в обоих направлениях.
- Из legacy не переносить `.codex-runtime` целиком, journals/grants/registrations/keys, `.codex-autonomy`, provider settings или credentials. Advisory intent registry остаётся в legacy read-only. Historical CEP receipts/localStorage не стирать:32 removed action names доступны только для чтения,16 active actions не расширяются.

## До любых production moves

1. Зафиксировать final Core commit, `config/core-runtime-manifest.json`, hashes adapter/daemon/launcher и всех8 CEP assets. Повторить релевантные офлайн checks. SOURCE STOP: один writer и один AE/CEP/runtime controller.
2. Отдельное разрешение пользователя должно покрывать installed CEP/config/native runtime cutover. Подготовка этого пакета им не является.
3. Свежий source read-back: `pendingCommands=0`, `inflightCommands=[]`, `activeEditSession=null`, lifecycle без pending/problem, bootstrap idle, CEP без active action/recovery transport, physical inflight0. Текущие submitted/UNKNOWN операции сверяются по исходным IDs/receipts; исторические UNKNOWN сохраняют свои fences/noReplay и не превращаются в PASS.
4. Через существующий source gated flow отключить polling панели и завершить именно старый owned daemon. Использовать pinned Node и source `scripts/owned-runtime-control.js status`, при допустимом новом shutdown — `shutdown-bridge-once --operation-id <один UUID>`, затем `read-back --operation-id <тот же UUID>`. При уже известном результате читать его; при timeout/UNKNOWN не создавать новый shutdown UUID. Требуется exact generation/kernel identity и реальное terminal exit proof (`WAIT_OBJECT_0`), а не один свободный port/отсутствующий PID. Отказ gate не обходить.
5. Отдельно подтвердить отсутствие destination daemon/controller и чужого listener на3456. Native/UI/build owners завершены или сверены. Сохранить фактические proof refs, timestamps и controller identity вне публичного вывода. Это root evidence, helper его не выдумывает и не проверяет как runtime authority.

Непосредственно перед публикацией proof должен оставаться свежим, обе стороны остановлены, других writers нет. Stable file hashes не заменяют native quiescence. При смене источника, процесса, paths или permission scope подготовка пересматривается до moves.

## Подготовка и адресная публикация после разрешения

В сохраняемом PowerShell owner задать literals; UUID создать один раз и записать в cutover note. Не менять UUID ради повторения неизвестной операции:

```powershell
$coreRoot = 'C:\Users\Ant\Documents\Codex\AE_Agent_Core'
$legacyRoot = 'C:\Users\Ant\Documents\Codex\AE_agent'
$fixedNode = 'C:\Users\Ant\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$migrationId = '<один lowercase UUID>'
$helper = Join-Path $coreRoot 'scripts\core-state-migration.js'
& $fixedNode $helper prepare $migrationId
& $fixedNode $helper status $migrationId
```

Prepare создаёт только свой ignored `.codex-runtime/core-cutover-preparation/<UUID>/`: immutable intent, staged `project-intent/` с двумя файлами, отдельный `autonomy-preference.json`, review metadata и result. Source не меняется, final destination не публикуется. Review не содержит protected content; staged store содержит его и не коммитится/не публикуется наружу.

Предпосылки следующего блока: статус `prepared_review_required`, `sourceStatus=unchanged`, обе locations `staged`, `originalOutputIdentityVerified=true`; proof из предыдущего раздела проверен отдельно. `result.json` связывает raw intent hash и file IDs staged outputs. Если result пропал после неизвестного исхода, status может дать `prepared_output_reconciled`: outputs не пересоздаются, original identity proof отсутствует. Root отдельно сверяет прежний intent hash/bytes и фактические object IDs; такой status сам по себе не разрешает moves.

Перед каждым `Move-Item` проверить разрешённые абсолютные paths, отсутствие reparse points в каждом ancestor, совпадение source hash/object IDs со свежим status и отсутствие destination. Ниже единственные forward moves; все пути вычисляются только из literals выше и проверенного UUID:

```powershell
if ($migrationId -cnotmatch '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$') { throw 'Invalid migration UUID' }
$preparationRoot = Join-Path $coreRoot '.codex-runtime\core-cutover-preparation'
$operationRoot = Join-Path $preparationRoot $migrationId
$stateStage = Join-Path $operationRoot 'project-intent'
$stateFinal = Join-Path $coreRoot '.codex-runtime\project-intent'
$preferenceStage = Join-Path $operationRoot 'autonomy-preference.json'
$preferenceFinal = Join-Path $coreRoot 'logs\autonomy-preference.json'
function Assert-ReviewedPath([string]$candidate, [string]$expected) {
  $absolute = [IO.Path]::GetFullPath($candidate)
  if ($absolute -ine [IO.Path]::GetFullPath($expected)) { throw 'Unreviewed move path' }
  for ($part=$absolute; $part; $part=Split-Path -Parent $part) {
    if (Test-Path -LiteralPath $part) {
      if ((Get-Item -LiteralPath $part -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Reparse point refused' }
    }
  }
}
Assert-ReviewedPath $stateStage ($coreRoot+'\.codex-runtime\core-cutover-preparation\'+$migrationId+'\project-intent')
Assert-ReviewedPath $stateFinal ($coreRoot+'\.codex-runtime\project-intent')
Assert-ReviewedPath $preferenceStage ($coreRoot+'\.codex-runtime\core-cutover-preparation\'+$migrationId+'\autonomy-preference.json')
Assert-ReviewedPath $preferenceFinal ($coreRoot+'\logs\autonomy-preference.json')
if ((Test-Path -LiteralPath $stateFinal) -or (Test-Path -LiteralPath $preferenceFinal)) { throw 'Destination already exists; status/read-back only' }
# Re-read helper status and original native proof now; require unchanged/staged.
Move-Item -LiteralPath $stateStage -Destination $stateFinal
# Re-read status: stateLocation=published, preferenceLocation=staged,
# status=publication_incomplete. Destination runtime must remain stopped.
[void](New-Item -ItemType Directory -Force -Path (Split-Path -Parent $preferenceFinal))
Move-Item -LiteralPath $preferenceStage -Destination $preferenceFinal
& $fixedNode $helper status $migrationId
```

Оба paths находятся на томе C:. Directory rename публикует store+marker парой; preference — отдельным move при остановленном runtime. Это не заявление о crash/power-loss atomicity всей операции. При ошибке/неизвестном результате сначала status: он различает stage/final/partial и не повторяет известный move. Нельзя запускать daemon между двумя moves. Не создавать marker заново, не удалять прежние файлы и не переподготавливать под новым UUID.

Ожидаемый final status — `published_requires_runtime_readback`, source unchanged, state/preference published, raw hashes/file IDs совпали. Дополнительно выполнить подготовленный read-only validator из Core cwd:

```powershell
Push-Location $coreRoot
try {
  $validationCode = @'
const migration=require('./scripts/core-state-migration');
const data=migration.capture(require('node:path').resolve('.'));
console.log(JSON.stringify({ok:true,summary:data.summary,autonomy:data.pref,runtimeProofVerified:false}));
'@
  & $fixedNode -e $validationCode
} finally { Pop-Location }
```

Он использует фактические destination guard/load validators, проверяет marker, schema/revisions и preference. В metadata нет project resource content. Затем source повторно сверяется неизменным; cutover note фиксирует result hashes и native proof refs.

## Config/CEP/runtime adoption

- Launcher sources: `scripts/windows-mcp-launcher.cs`, `scripts/build-windows-mcp-launcher.ps1`. Сборка из Core: `& .\scripts\build-windows-mcp-launcher.ps1`; output `.codex-runtime/windows-mcp-launcher/ae-mcp-launcher.exe`. При существующем/неизвестном output сначала сверить его; не перезаписывать используемый launcher. WinExe собран офлайн в этом milestone, не запускался.
- Fixed Node SHA `3602f2bb1a10f2cbab4c36886218a33c1ab3db87290e73b033c46c77147d0237`; portable pwsh SHA `362a356ce7f0940ec74f73a8fc2c990a2cc24a38a11c90bbd8eca947110ad139`. Supervisor/helper/control pins сохраняются. `.node`/`.aex` build или initial-owned/shared-queue provisioning не нужны default product и сюда не входят.
- Core `.codex/config.toml` after-effects: command → Core launcher, args → тот же pinned Node и Core `mcp-server/mcp-adapter.js`. Сохранять отдельные automation/panel credentials, auth/Origin/Host gates и ручные env/timeouts; не выводить секреты/не копировать весь source config. Antigravity `C:/Users/Ant/.gemini/config/mcp_config.json` получает только согласованные command/args paths. Codeburn не меняется.
- Новая Core owned-lifecycle policy создаётся только после отдельной авторизации: exact schema `ae-agent.owned-runtime-policy.v1`, новый generation, enabled, `{source:"explicit_user_chat",reference:<текущий cutover chat>}`, минимальный `acceptedServerCoverage:["owned_daemon_lifecycle"]`. Проверить `validatePolicy`, сохранить source/control pins, затем использовать existing gated `ensure-bridge --operation-id <UUID>`/read-back. Legacy grants/registrations не подставлять. Реальный первый native launch/registration/admission ещё не проверен; отказ сохраняет закрытый gate и требует exact read-back.
- Installed CEP root — `C:/Users/Ant/AppData/Roaming/Adobe/CEP/extensions/com.codex.aemcpbridge`, IDs `com.codex.aemcpbridge` / `.panel`, version3.3.5. После адресного backup заменить ровно8 assets: manifest, index, panel-action-contract, panel-actions, native-probe-startup-guard, panel.js, style.css, lib/CSInterface.js. Сверить SHA с Core. IDs/origin/localStorage сохранить; bootstrap требует единственную exact установленную копию.
- External instruction patches: подготовлены полные staged copies и source/staged SHA manifest в [`cutover/external-instructions/manifest.json`](../cutover/external-instructions/manifest.json). Bundle conditional для legacy/Core, не применён к глобальным skills или hooks. Legacy hook `scripts/ae-tool-first-pretool.js` остаётся на прежнем месте; целевой Core helper в текущей сборке отсутствует, поэтому новую hook command не объявлять и не настраивать без отдельного включения/проверки.
- Разделять Antigravity MCP registration и `agy-bridge` executor profile. Пользовательская `.gemini/config/mcp_config.json` уже регистрирует server `after-effects` с legacy path; адресная смена на подготовленные Core paths возможна только в отдельно разрешённом cutover. Это не создаёт executor profile. `AE_agent/config/agy-bridge.json` задаёт legacy profile `ae-agent`; в Core он не provisioned, поэтому source config нельзя переиспользовать молча и скрытый fallback не создаётся. Orca link отдельно не переключается.
- `config/core-runtime-manifest.json` ведёт runtime writer; этот instruction bundle и docs не являются runtime assets и не требуют runtime hash/check. До cutover адресная публикация любых staged global patches требует drift/read-link review и отдельного разрешения.
- Offline Stage 3: четыре сценарные цепочки PASS (titles2, align/review2+10, placeholders3, AE-render1); 23 safety checks PASS. Acceptance ограничена offline cases; live AE, visual review, save/reopen и render не проверялись.
- Только после согласования source/installed/runtime hashes выполнить штатный panel reconnect/bootstrap и настоящий typed `get_project_info`, проверить generation/source identity, autonomous preference (OFF остаётся OFF), current pins/manual protected flow. Reload/health не заменяют эти доказательства. Source policy/process status и Core native first-boot могут потребовать штатного технического подтверждения; offline PASS не отменяет его.

## Rollback без потери новых данных

Остановить Core теми же штатными grants, сверить current UNKNOWN и получить fresh exact native exit proof; legacy тоже не должен работать. Source code/checkpoint и предыдущие config/installed backups сохранены. Не восстанавливать старый state snapshot поверх новых Core revisions/OFF.

```powershell
$rollbackId = '<новый lowercase UUID только для известной новой обратной подготовки>'
& $fixedNode $helper prepare-rollback $rollbackId $migrationId
& $fixedNode $helper status-rollback $rollbackId
```

Reverse prepare читает **текущие Core bytes** и проверяет, что legacy destination всё ещё точно совпадает с original forward source baseline (hash+object identity); иначе останавливается. Его marker заранее bound к legacy final path. При `baseline_already_matches` конкретный ресурс уже соответствует output — move не нужен. При `baseline_requires_backup` создать свой `…/<rollbackId>/rollback-backup/`, проверить absolute paths/ancestors, переместить существующий legacy state directory и preference туда отдельными `Move-Item -LiteralPath`, сохранив оригиналы; затем переместить ровно reverse staged state directory и preference в освободившиеся legacy paths. После каждого шага читать `status-rollback`, обе стороны держать остановленными. Даже в середине rollback исходы moves не угадывать и marker не удалять.

Подготовленная адресная последовательность для нового, известного rollback (функция `Assert-ReviewedPath` и native preconditions те же):

```powershell
if ($rollbackId -cnotmatch '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$') { throw 'Invalid rollback UUID' }
$rollbackRoot = Join-Path $preparationRoot $rollbackId
$backupRoot = Join-Path $rollbackRoot 'rollback-backup'
$legacyState = Join-Path $legacyRoot '.codex-runtime\project-intent'
$legacyPreference = Join-Path $legacyRoot 'logs\autonomy-preference.json'
$reverseState = Join-Path $rollbackRoot 'project-intent'
$reversePreference = Join-Path $rollbackRoot 'autonomy-preference.json'
Assert-ReviewedPath $legacyState ($legacyRoot+'\.codex-runtime\project-intent')
Assert-ReviewedPath $legacyPreference ($legacyRoot+'\logs\autonomy-preference.json')
Assert-ReviewedPath $reverseState ($coreRoot+'\.codex-runtime\core-cutover-preparation\'+$rollbackId+'\project-intent')
Assert-ReviewedPath $reversePreference ($coreRoot+'\.codex-runtime\core-cutover-preparation\'+$rollbackId+'\autonomy-preference.json')
Assert-ReviewedPath $backupRoot ($coreRoot+'\.codex-runtime\core-cutover-preparation\'+$rollbackId+'\rollback-backup')
$reverseStatus = (& $fixedNode $helper status-rollback $rollbackId) | ConvertFrom-Json
if (-not $reverseStatus.outputKnown -or $reverseStatus.sourceStatus -ne 'unchanged') { throw 'Rollback status requires reconciliation' }
# Recheck original native proofs before each resource. No running source/destination.
if ($reverseStatus.stateLocation -eq 'baseline_requires_backup') {
  [void](New-Item -ItemType Directory -Force -Path $backupRoot)
  $stateBackup = Join-Path $backupRoot 'project-intent'
  Assert-ReviewedPath $stateBackup ($coreRoot+'\.codex-runtime\core-cutover-preparation\'+$rollbackId+'\rollback-backup\project-intent')
  if (Test-Path -LiteralPath $stateBackup) { throw 'Existing backup; status/read-back only' }
  Move-Item -LiteralPath $legacyState -Destination $stateBackup
  # Verify backup raw hashes and dev/ino/size/mtime against original baseline.
  Move-Item -LiteralPath $reverseState -Destination $legacyState
}
& $fixedNode $helper status-rollback $rollbackId
$reverseStatus = (& $fixedNode $helper status-rollback $rollbackId) | ConvertFrom-Json
if ($reverseStatus.preferenceLocation -eq 'baseline_requires_backup') {
  [void](New-Item -ItemType Directory -Force -Path $backupRoot)
  $preferenceBackup = Join-Path $backupRoot 'autonomy-preference.json'
  Assert-ReviewedPath $preferenceBackup ($coreRoot+'\.codex-runtime\core-cutover-preparation\'+$rollbackId+'\rollback-backup\autonomy-preference.json')
  if (Test-Path -LiteralPath $preferenceBackup) { throw 'Existing backup; status/read-back only' }
  Move-Item -LiteralPath $legacyPreference -Destination $preferenceBackup
  # Verify backup raw hash and dev/ino/size/mtime against original baseline.
  Move-Item -LiteralPath $reversePreference -Destination $legacyPreference
}
& $fixedNode $helper status-rollback $rollbackId
```

Если прерывание произошло между backup и final move, status покажет `staged`: backup сначала сверяется с original baseline, затем выполняется **только отсутствующий final move** при отсутствии final path. `published` и `baseline_already_matches` не перемещаются повторно. Состояние `unknown`, source drift или неидентифицированный backup останавливают алгоритм. `ctime` может измениться при rename; dev/ino, size, mtime и raw hash должны совпасть. Предыдущий config backup не является разрешением потерять новые state/OFF.

Final reverse status и `migration.capture(legacyRoot)` должны пройти; проверить текущие revisions и OFF. Только затем вернуть адресные launcher/adapter/hook/installed CEP поля из backup с учётом последующих ручных изменений и выполнить штатный legacy native read-back. Если final validation не проходит, опубликованная директория сохраняется для разбора; автоматического destructive cleanup/повтора нет.
