# Перенос 3.3.0 на Windows и локальная проверка

Передаётся проверенный код `codex/release-3.3.0` с компактной офлайн-диагностикой.
Это готовность к установке и локальной приёмке. Текущие Windows/AE/CEP runtime,
реальные provider calls и пользовательские AEP в облаке не проверялись.
Исторические live-результаты в документации не заменяют свежую проверку этого
локального checkout. Точный переданный commit находится в `transfer-manifest.json`.

## Пакет и восстановление

Пакет содержит полный Git bundle ветки с её историей, diff относительно
`b66404628a5ef56c1c6061a67a5e34c17773d233`, офлайн-отчёты, hashes и поручение
локальному Codex. Игнорируемые локальные настройки, credentials, runtime,
модели, AEP/media и установленная CEP-копия в Git bundle не входят.
Включённый отчёт с receipt использует явно обозначенную synthetic fixture.

Нужны Git и Node.js; в облаке проверен Node `24.19.0`. Для локальной проверки
рекомендуется Node 24 LTS: CEP CDP helper использует встроенный `WebSocket`.
Производственные npm-зависимости отсутствуют, `npm install` для этого переноса
не требуется. Сначала сверьте SHA-256 ZIP с опубликованным рядом значением:

```powershell
Get-FileHash -Algorithm SHA256 .\AE_agent-local-transfer.zip
Expand-Archive .\AE_agent-local-transfer.zip -DestinationPath .\AE_agent-transfer
Set-Location .\AE_agent-transfer
$ErrorActionPreference = 'Stop'
$packageRoot = (Get-Location).Path
$manifest = Get-Content .\transfer-manifest.json -Raw -Encoding UTF8 | ConvertFrom-Json
foreach ($entry in $manifest.files) {
  $file = Join-Path $packageRoot $entry.path
  $actual = (Get-FileHash -Algorithm SHA256 $file).Hash.ToLowerInvariant()
  if ($actual -ne $entry.sha256 -or (Get-Item $file).Length -ne $entry.bytes) {
    throw "Transfer file mismatch: $($entry.path)"
  }
}
$bundle = Join-Path $packageRoot 'AE_agent.bundle'
$repoDir = Join-Path $packageRoot 'AE_agent-local'
if (Test-Path $repoDir) { throw 'Choose a new empty checkout path.' }
git clone --config core.autocrlf=false --single-branch --branch $manifest.branch $bundle $repoDir
if ($LASTEXITCODE -ne 0) { throw 'Clone failed.' }
Set-Location $repoDir
git bundle verify $bundle
if ($LASTEXITCODE -ne 0) { throw 'Bundle verification failed.' }
$head = (git rev-parse HEAD).Trim()
$branch = (git branch --show-current).Trim()
if ($head -ne $manifest.headCommit -or $branch -ne $manifest.branch) {
  throw 'Source branch/commit mismatch.'
}
git status --short --branch
```

Свежий clone сохраняет исходные байты с LF; это важно для raw SHA-256 и точного
сопоставления installed CEP assets. Его `origin` указывает на локальный bundle.
Для переноса push/fetch из сети не нужен. Обновлять существующий рабочий checkout
следует отдельно, после проверки его ветки, commit и локальных изменений;
не применяйте поверх него reset/clean или слепое копирование.

## Офлайн-проверка на Windows

До запуска AE/bridge из нового checkout:

```powershell
node --version
node --check scripts/diagnostics.js
node --check scripts/diagnostics-smoke.js
node --check scripts/reliability-validation-suite.js
npm.cmd run smoke:diagnostics
if ($LASTEXITCODE -ne 0) { throw 'Diagnostic regressions failed.' }
npm.cmd run diagnostics -- --checks=rules,reliability-suite-catalog,project-intent-memory,semantic-verification,solution-registry,solution-candidate-report,agent-run-report-schema
if ($LASTEXITCODE -ne 0) { throw 'Offline diagnostics incomplete.' }
git diff --check
```

Успешный итог агрегатора — `passed=7, failed=0, skipped=0, timed-out=0`.
Отчёт сохраняется в `logs/diagnostics/`; skipped/timeout не засчитываются как
PASS. Ошибка останавливает переход к локальной live-приёмке. Не запускайте
`smoke:full-intake`, `generic-repo:*`, broad CEP smoke или provider suites как
побочный шаг установки. Frozen manifest и его baseline остаются прежними.

## Активация локальной копии

Это действия локального контроллера, после офлайн-проверки и сверки текущего
runtime. Перед заменой CEP/перезапуском daemon нужны свежие `get_bridge_status`,
пустые pending/inflight и отсутствие незавершённого plan/lifecycle; daemon
restart также требует закрытого active edit session. Unknown delivery сначала
сверяется по exact command/receipt — restart не разрешает повтор.

1. В локальной MCP-конфигурации направьте adapter на абсолютный путь
   `<новый checkout>\mcp-server\mcp-adapter.js`. Сохраните существующие доверенные
   настройки; пример находится в `mcp-config.example.json`. Оба placeholder
   токена заменяются локально: разные `AE_BRIDGE_TOKEN` и `AE_BRIDGE_PANEL_TOKEN`
   обязательны. Panel token вводится в поле CEP **Panel token**, automation token
   остаётся у MCP. Не включайте dev-admin и не переносите секреты в отчёты/URL.
2. CEP устанавливается полной копией `cep-panel/` в
   `%APPDATA%\Adobe\CEP\extensions\com.codex.aemcpbridge`. Если копия уже есть,
   сохраните её вне всех CEP extension roots, например в
   `.codex-runtime/cep-panel-backup-<timestamp>/`, затем замените целую папку.
   Не создавайте вложенную `com.codex.aemcpbridge\cep-panel` и вторую копию с
   тем же extension ID/menu в системных roots. Нужны manifest, index, panel.js,
   style.css, lib и `.debug`, а не только два JS/HTML-файла.
3. Режим разработки неподписанного CEP должен соответствовать реально
   используемой версии CSXS. Существующие рабочие настройки Adobe сохраняются;
   версия CSXS и registry key не угадываются. Для CDP `.debug` задаёт порт 8870.
4. Сверьте installed assets готовым read-only helper из нового checkout:

   ```powershell
   node -e "console.log(JSON.stringify(require('./mcp-server/ae-agent-panel-bootstrap').inspectInstalledTarget(),null,2))"
   if ($LASTEXITCODE -ne 0) { throw 'Installed CEP identity/hash mismatch.' }
   ```

5. Перезапустите только сверенный idle daemon/adapter штатным локальным способом
   с конфигурацией нового checkout. Уже запущенный daemon не перечитывает env.
   Затем сверяйте `runtimeIdentity()` из `mcp-server/review-evidence.js` с
   наблюдаемыми startup identity/runtime event pins: commit и source hash
   относятся к реально запущенному процессу, а не только к файлам на диске.
   Если pins недоступны, runtime identity остаётся unverified.

## Локальная live-приёмка

Начальный этап — read-only connectivity, без provider prompts или изменений AEP.
AE запускает локальный пользователь; для bootstrap нужен ровно один проверенный
уже запущенный `AfterFX.exe`. Первый путь восстановления панели — штатный MCP
`ensure_ae_agent_panel({timeoutMs:30000})`; он может открыть/reload только
фиксированную панель и требует своих idle/identity gates.

Зафиксируйте новые `get_bridge_status` и настоящий typed `get_project_info`,
`panelConnected=true`, panel connection/generation, project file/revision и
runtime pins. HTTP health, CLI exit и synthetic `connector-status-smoke` сами
по себе connectivity не доказывают. CEP inspect при необходимости выполняется
с `CEP_PANEL_ENSURE_DAEMON=0`; reload — по
[Tool-First workflow](tool-first-workflow.md#штатная-диагностика-и-reload-cep).
Timeout/unknown bootstrap не повторяется вслепую, порядок сверки — в
[контракте bootstrap](ae-agent-panel-bootstrap.md).

Если нужен следующий этап с mutating/generated fixture, provider call,
save/reopen/render или художественной приёмкой, сначала задаётся конкретная
локальная цель и проходят существующие proposal/dry-run/confirmation/read-back
gates. Используйте отдельную тестовую AEP, точные IDs и server hashes.
Автономная сессия может включаться при первом trusted connect; проверяйте её
фактическое состояние, а не предполагаемый default. Frozen intake исключён.

Реальные receipts собираются по настоящим runId/stepIndex и pinned SHA-256
вместе с canonical record. Подайте их агрегатору через `--input` и `--log-dir`
внутри корня checkout. Если исходные logs лежат снаружи, сохраните неизменный
read-only snapshot record + receipt под `.codex-runtime/` этого checkout;
не переписывайте envelope или hash. Формат — в
[контракте диагностики](compact-diagnostics.md).
Report PASS для receipt означает integrity/binding, а его execution/verification
статусы оцениваются отдельно. Итог локального этапа должен сохранять отдельно
offline, native/live, provider и visual evidence, все skipped/timeout/unknown.
