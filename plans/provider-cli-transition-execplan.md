# Переход на Codex CLI и AntiGravity CLI

Дата: 5 октября 2026. Статус: **PLANNED — реализация не начата**.
Исходный product checkpoint: `codex/release-3.3.0`,
`2b8be32c89396d72c756b89dbc343ffadbd7f7cc`.
Основной план: [target-app-execplan.md](target-app-execplan.md); старт нового чата:
[готовый промпт](../docs/provider-cli-transition-start-prompt.md).
Будущий HEAD может содержать последующие planning-docs commits. Блок 1 сверяет
ancestry и diff относительно product checkpoint, отдельно оценивает более новые
source changes и только затем фиксирует фактический baseline; exact HEAD не навязывается.

## Цель и разрешённая область

После перехода активны ровно два провайдера: **Codex CLI** и **AntiGravity CLI**.
Codex сохраняет текущую автономную сессию. AntiGravity получает законченную задачу:
старшая модель внутри AGY сама планирует и выполняет её в разрешённой области,
а Codex принимает результат по статусу, артефактам и независимому read-back.
Текущая настроенная модель AGY — `gemini-3.8-flash-high`, effort `high`;
Это имя модели внутри CLI, а не разрешение вернуть Gemini API.

OpenAI API, Gemini API, Claude API (существующая вкладка, названная пользователем
«Cloud»), OpenRouter и Local/Ollama замораживаются. Их код и сохранённые настройки
остаются для совместимости, ключи не удаляются. Они не выбираются как активные,
не запускают chat/readiness/model enumeration/self-test и не используются как fallback.
Custom/env-конфигурация не может включить третий транспорт или подменить transport активного ID.
Agent Hardcore удаляется из текущего продукта, включая backend, API/MCP surface,
loop, автопродвижение, выделенные рецепты и маршруты тестов. Исторические receipts
и пользовательские runtime-материалы сохраняются.

Это локальная реализация в одном новом чате, без смены версии или провайдера Codex;
новый чат не создаётся автоматически. Текущий этап создаёт только план и промпт;
реальные вызовы моделей, установка панели и AE-действия сейчас не выполняются.

## Что подтверждено, а что нужно установить

Подтверждено чтением source на исходном checkpoint:

- `mcp-server/ai-agents.js` содержит единый каталог API/CLI и custom providers,
  readiness, model listing и chat. Default до перехода может вести в OpenRouter.
  Серверной provider-заморозки ещё нет; intake hash lock её не заменяет.
- `cep-panel/index.html` показывает Gemini/OpenAI/Claude/OpenRouter/Local и
  Hardcore; `cep-panel/panel.js` использует `gemini-api` и обычные chat/plan routes.
  AGY agent/transport в этом маршруте отсутствует.
- `config/agy-bridge.json` уже задаёт профиль `ae-agent`. Общий мост живёт в
  соседнем `agy-bridge`; существующие AE completion/visual-review интеграции
  читают receipts завершённых AGY runs, а не запускают provider-задачу панели.
- AGY использует task packet, run/status, проверку schema/artifacts и явный
  conversation ID для продолжения. Status не останавливает процесс. Отдельный
  CLI `cancel` в прочитанном контракте не подтверждён; timeout/kill не доказывает
  завершение descendants или внешних AE операций.
- Hardcore использует общие authority/runner/registry/memory части. Проверка
  `run_agent_hardcore_session` отклоняет обычный MCP source, но это не делает
  безопасным удаление общих guards. На текущем и предыдущем release baseline
  известен сбой synthetic Hardcore assertion; его причина не установлена.
- `smoke:bridge` включает `provider-api-smoke.js`; другие группы повторяют
  solution/evidence/autonomy проверки. Старые aggregate-команды нельзя считать
  новой матрицей двух активных CLI без проверки их состава.

Не установлены текущие installed CEP/daemon identity, CLI/auth/MCP grants,
effective model нового AGY run и фактическая live connectivity. В блоке 1 нужно
уточнить границу shared/Hardcore-only функций, mapping AE-задачи на `kind` и
`allowed_scope`, trusted MCP authority AGY и способ запуска/наблюдения процесса
без расширения auth. AE-write нельзя объявлять read-only `inspect` ради schema.
Эти вопросы решаются по контрактам, а не выдуманными endpoint/CLI-командами.

## Архитектурное решение

| Вариант | Стоимость перехода и риск | Решение |
|---|---|---|
| Переименовать Gemini и заменить model slug | Очень мало правок; остаётся Google HTTP API, теряются ownership и task receipts | Не соответствует цели |
| Запускать AGY как generic chat completion | Средние правки; легко потерять scope, lifecycle, unknown outcome и повторно исполнить ответ как Codex-план | Не выбирать |
| Узкий server adapter поверх существующего `agy-bridge` task protocol | Новый seam, contract fixtures и UI task state; сохраняет существующие grants/receipts, без второго orchestration engine | Выбранный путь |

Заморозку хранить как единый active/frozen статус и transport policy в существующем
provider catalogue, применять её до любых внешних действий. Не создавать параллельный
registry. Отдельный hash-manifest смешанных provider/CLI файлов создаст лишние
baseline updates при каждой активной правке; UI-only hide оставит API/env обходы.
Если блок 1 выявит техническую необходимость отдельного policy-файла, он должен
быть единственным источником статуса для того же каталога, с записанным решением.
`config/frozen-intake-manifest.json` не расширяется и не перебазируется.

Сохранить совместимый Codex ID `openai-cli`; UI label становится Codex CLI.
Новый AGY ID/transport назначить отдельно, не превращать сохранённый `gemini-api`
в CLI. Старую выбранную замороженную вкладку нормализовать к активному выбору
с видимым объяснением, без запуска задачи и без удаления старых provider preferences.
Модель AGY брать из проверяемого профиля/metadata: текущий Flash не должен стать
неизменяемым model gate в коде панели. Configured и effective model различаются.

Первый обратимый шаг — карта зависимостей и protective offline regression fixtures
без удаления кода. После этого серверная freeze policy вводится отдельным commit.
При недоступной выбранной AntiGravity-задаче возвращать явную ошибку, не исполнять
её через Codex или API. Отдельно сохраняется проектный маршрут замены *исполнителя
code-блока* после доказанной недоступности Flash и завершения прежнего процесса;
это не provider fallback продукта.

## Инварианты всех блоков

- Typed-solution library и поиск `search_solutions` → нужные `get_solution` →
  builder/proposal/dry-run/read-back сохраняются; registry целиком не загружается.
- Сохраняются proposal revision/hash, checkpoint/project binding, edit-session,
  идемпотентность, preflight, fresh CEP authority, grant/revocation и run evidence.
  Ручные raw/destructive/save confirmations остаются обязательными.
- Панель и automation credentials разделены; panel token не передаётся AGY.
  AGY project MCP grants, CLI task scope и Codex autonomous authority — разные
  уровни. «Полное управление» означает ownership всей scoped задачи, не bypass.
- Frozen intake/importer/supervisors и их hashes не менять и не выполнять;
  `orchestrator/bounded-process-result.cjs` остаётся активным исключением.
  Общий sibling `agy-bridge`, global config/grants, deps, secrets и AEP/media
  не входят в обычный scope. Новая auth/permission граница требует отдельного
  reviewed scope и обязательных технических подтверждений.
- Максимум два helpers суммарно, включая AGY и помощника Ultra; один writer на
  файл/ресурс и один AE/CEP/UI controller. Родитель — единственный Git controller.
- Timeout/transport SUCCESS не является приёмкой. До повторного запуска или
  смены writer сверить task status, process identity, pending/inflight, файлы
  и фактический read-back. Unknown сохраняется до reconciliation.

## Последовательные блоки одного чата

Каждый блок начинается с записи `[block] [executor] [reason] [ownership]`.
Native bounded задачи получают `fork_turns: none`, точные пути, baseline,
исходный запрос, ограничения и приёмку. Flash получает самостоятельный task
packet `ae-agent`, выполняет весь свой блок; родитель не дублирует реализацию.
Исполнители знают о чужих изменениях, не откатывают их и не создают помощников.
После принятого крупного блока родитель обновляет Progress/Decision Log/Validation
и делает отдельный local commit только точных scope-файлов.

### 1. Свежий baseline и карта зависимостей

**Исполнитель:** `ae_scout` (Luna/medium), read-only; решения scope и Git — родитель.
**Ownership:** evidence для `mcp-server/{ai-agents,bridge-daemon,autonomous-session,
proposal-state,run-outcome,plan-run-reconciliation}.js`, нужных CEP handlers,
package/test routes, целевых registry entries/recipes; locked intake исключён.
Прочитать AGENTS, routing/skills и текущий AGY schema; использовать уже приведённые
факты, не повторять полный аудит. Уточнить shared callers, saved selection/defaults,
prompt optimization/dev escalation, mode flags и прямые/provider MCP entry points.

**Приёмка:** dependency map Hardcore-only/shared; каталог всех execution входов
и конкретная схема AGY request/status/authority; минимальная проверочная матрица.
Auth/cancel/schema пробелы явно обозначены. Родитель фиксирует текущий HEAD,
чужие tracked/untracked изменения и новый неперемещаемый local checkpoint;
старые release branches/tags сохраняются. `check:rules`/diff — offline baseline.
**Откат:** нет product changes; checkpoint не удаляет ignored assets/installed CEP.

### 2. Защитить автономную сессию до удаления Hardcore

**Исполнитель:** Flash/high через профиль `ae-agent`; `ae_specialist` только для
локального инженерного блокера после двух содержательных исправлений критерия.
**Ownership:** целевые fixtures в `scripts/{autonomous-session,autonomous-mcp,
persistent-autonomy-bridge,autonomy-revocation,panel-heartbeat,run-boundary,
hardcore-authority}-smoke.js`, отдельно `scripts/smoke-test.js`,
минимальные shared seams и test routing; без удаления Hardcore в этом блоке.

**Приёмка:** meaningful actual-module regressions: first trusted CEP auto-on,
explicit off persistence, stale/disconnect/revocation denial; proposal+dry-run
typed MCP execution и direct/raw/destructive/save denial; checkpoint/idempotency,
run evidence и reconciliation. Успехи и отказы не зависят от mode Hardcore.
Разделить mixed fixtures на shared и dedicated, сохранить исторический failure;
не ослаблять verifier и не удалять failing assertion до классификации его смысла.
**Проверки:** только выбранные offline autonomy/runner/authority cases, rules,
`node --check` touched JS, diff. Local protective commit.
**Откат:** revert только этого commit; product behaviour ещё прежнее.

### 3. Серверная заморозка и каталог двух активных CLI

**Исполнитель:** Flash/high, один writer.
**Ownership:** `mcp-server/ai-agents.js`, provider входы в `bridge-daemon.js`,
целевые provider preference/secret-store handlers; `scripts/provider-contract-smoke.js`,
изолированные active/frozen fixtures и нужный package routing.

**Приёмка:** активны только Codex CLI и новый AGY descriptor (AGY пока может иметь
явный `not_ready`). Frozen setup/chat/plan/readiness/models/self-test отклоняются
сервером до HTTP/CLI/Ollama действий, включая `skipReadinessCheck`, stored defaults,
custom/env overrides и прямые MCP/HTTP вызовы. Новые AGY descriptor имена — решение
этого блока, не существующий API. Старые config/keys сохраняются; key-save для
замороженной lane не активирует её. Default выбирает Codex, скрытого fallback нет.
**Проверки:** offline fake CLI/loopback/spy counters доказывают 0 frozen transport
calls и неизменность secrets/preferences; legacy API success fixtures исключены
из default active matrix. Rules/syntax/diff, local freeze commit.
**Откат:** revert freeze commit при прежнем UI; старые settings доступны без миграции ключей.

### 4. Настоящий task transport AntiGravity CLI

**Исполнитель:** Flash/high; архитектурный пробел — `ae_architect`, узкий —
`ae_specialist`. Не привлекать Ultra для каждой небольшой правки.
**Ownership:** новый узкий server module (имя выбрать по текущим patterns),
seam в `mcp-server/{ai-agents,bridge-daemon}.js`, task contract fixtures.
`config/agy-bridge.json` используется существующий; sibling bridge — только чтение.

**Приёмка:** panel→authenticated bridge→existing AGY task packet/run/status;
workspace/profile binding, исходный запрос без потерь, constraints/criteria,
allowed scope, refs/inputs, explicit required_commands и expected artifacts.
AGY владеет задачей end-to-end; Codex не исполняет повторно текст ответа как план.
`required_commands` и project grants проверяются отдельно. AE task scope не даёт
обычному panel chat права редактировать repository или произвольный shell.
Состояния running/completed/failed/blocked/unknown выводятся по фактам; schema,
terminal result/artifacts/effective metadata проверяются отдельно от транспорта.
Повторный submit/reload не создаёт второй run. Продолжение только с новым task ID
и явным conversation ID завершённого хода. Неподтверждённый CLI cancel не выдумывать;
deadline/timeout показывать честно, не объявлять остановку descendants доказанной.
**Проверки:** fake AGY runner + actual module fixtures, неверные scope/schema,
timeout/partial/malformed/artifact mismatch/replay cases; 0 real model calls.
Rules/syntax/diff, local adapter commit.
**Откат:** revert adapter commit; AGY descriptor остаётся явно not-ready, Codex работает.

### 5. Две вкладки и совместимый CEP state

**Исполнитель:** Flash/high; родитель принимает UI по DOM snapshots, live пока нет.
**Ownership:** `cep-panel/{index.html,panel.js}` и existing style tokens при нужде,
offline panel/state fixtures, provider self-tests, targeted dev-request routing.

**Приёмка:** ровно Codex CLI и AntiGravity CLI как активные вкладки; API/CLI split,
API-key/Local/free-model controls отсутствуют в активном flow. Codex chat/Agent и
автономный control сохранены. AGY показывает owner task/status/configured model,
передаёт полное поручение и не запускает Codex step loop. Hardcore control/mode
исчезают; сохранённый hardcore mode нормализуется безопасно без старта loop.
Frozen selected provider/history и unknown preference fields не теряют данные;
loading/error/blocked/unknown states и single active command работают после reload.
**Проверки:** DOM/panel VM/state migration плюс blocks 2–4 regressions при изменённых
seams; rules/syntax/diff. Local UI commit.
**Откат:** вернуть UI commit; backend freeze не снимается и старый UI не обходит отказ.

### 6. Удалить Hardcore backend и dedicated artifacts

**Исполнитель:** Flash/high по принятой dependency map; `ae_operator` для последующей
ясной docs/test-routing правки. Writers идут последовательно.
**Ownership:** Hardcore функции/routes/tool declarations/flags в `bridge-daemon.js`,
MCP adapter/schema по фактической карте; `recipes/agent-hardcore-autopilot.md`,
только dedicated entries в `registry/solutions.json`, dedicated tests и package routes.

**Приёмка:** нет runnable Hardcore mode/HTTP/MCP/loop/promotion/metrics surface;
старые запросы получают явный unsupported ответ без AE/model writes. Shared
manual solution promotion, библиотека, память, runner и dev escalation сохранены
там, где нужны активным сценариям. Удалять registry entry только после проверки
его callers; исторические receipts, пользовательские logs/media/AEP не чистить.
Hardcore-only tests заменяются проверкой удалённой surface; shared cases остаются.
**Проверки:** targeted reference scan в текущем продукте без frozen intake;
blocks 2–5, solution retrieval/build/manual-promotion и memory tests по изменённым
callers; rules/syntax/diff. Local removal commit.
**Откат:** отдельный revert removal commit сохраняет freeze и AGY adapter.

### 7. Одна offline matrix и ограниченное независимое review

**Исполнители:** `ae_operator` (Luna/medium) собирает и запускает scoped matrix;
затем `ae_reviewer` (Sol/high), read-only bounded diff/contract review.
**Ownership:** `package.json`, active provider/AGY/autonomy/bridge test routing,
targeted fixtures и записи этого плана; production changes только адресной correction.

**Приёмка:** default product groups не запускают success lanes frozen API/Ollama;
offline frozen-rejection negatives остаются. Общие bridge/provider/evidence/autonomy
checks выполняются один раз на принятый final source, CI/aggregate overlap сокращён
без потери покрытия. Reviewer проверяет двух active transports, task ownership,
auth separation, сохранность Codex gates и отсутствие lost-result/replay.
Новая найденная auth/permission граница требует отдельного reviewed scope; optional
Tier 2 Pro bundle полезен, но не является обязательной остановкой этого плана.
**Проверки:** final selected offline groups, rules, syntax всех touched JS, diff;
нет default broad CEP/CLI planner/full-intake. Local integration commit.
**Откат:** revert test routing/correction commit, не скрывать унаследованные failures.

### 8. Установленная панель и реальные read-only результаты

**Исполнитель/controller:** последовательно родитель для CEP/visual/Codex READ,
затем Flash/AGY — единственный AE controller своей read-only задачи после idle.
Родитель в это время наблюдает только task/process status, без параллельного AE/UI.
После завершения и pending reconciliation AGY возвращает ресурс родителю для
независимого typed read-back. Остальные helpers работают по snapshots. Сейчас live нет.
**Ownership:** только установленная копия затронутых CEP файлов, её локальный backup,
runtime evidence в ignored `.codex-runtime/`; repository/source acceptance уже пройдена.

**Приёмка:** определить installed/source/daemon composite identity; перед sync/reload
проверить idle/pending/inflight/edit-session, сохранить backup, скопировать только
нужные файлы и сверить hashes. Если daemon устарел, штатная ограниченная активация
только после idle/reconciliation, с прежними auth/gates. Фактически увидеть две
вкладки и отсутствие Hardcore; настоящий Codex typed READ из AE с существующей
trusted connection. После передачи sole controller AGY task проходит новый provider seam:
полная цель → run/status → schema/artifacts → возврат ресурса → независимый typed read-back;
проверить configured/effective model по metadata. Это integration acceptance,
а не демонстрация маршрутизации модели. AE mutations/save/render запрещены.
**Проверки:** exact status/native reads; visual snapshot фактически просмотреть.
`connector-status-smoke` с fake overrides/reload/clicks не заменяет connectivity.
Не расширять grants ради теста. Недоступный AE/AGY/auth фиксируется как
**PENDING_LIVE / live unverified**, независимые blocks продолжаются; общий переход
не объявлять полностью принятым. Evidence/model response не повышать до artwork acceptance.
**Откат:** восстановить только installed backup после idle; Git revert не откатывает
installed CEP/runtime автоматически. Не трогать AEP/media и явное autonomy off.

### 9. Итоговая документация и checkpoint

**Исполнитель:** `ae_operator` (Luna/medium), docs only; финальная приёмка/Git — родитель.
**Ownership:** `specs/target-app.md`, актуальные provider/routing docs и оба execplans;
не переписывать историческую evidence. Этот план содержит ссылки на actual checks,
commits и live limitations; главный target plan остаётся не длиннее 180 строк.
**Приёмка:** docs описывают два CLI, frozen API и полный AGY task ownership;
Hardcore отсутствует в current product contract; coding fallback отличен от
provider fallback. Последний checkpoint и порядок возврата подтверждены локально.
`COMPLETE` допустим после blocks 1–8 и настоящей ограниченной live acceptance;
иначе честно `COMPLETE_CODE / PENDING_LIVE` с точным blocker и следующим действием.
**Проверки:** docs/rules/diff, final source report из блока 7 переиспользуется без
повторного широкого прогона. Local docs commit. Push/PR/merge/release не выполняются.
**Откат:** revert milestone commits по зависимостям; старые refs не перемещать,
чужие изменения и ignored assets не сбрасывать.

## Порядок продолжения и отчёт

В одном чате переходить к следующему разрешённому блоку сразу после приёмки.
Не спрашивать «продолжать?» при готовом плане; не создавать новый чат/handoff из-за
токенов, окна или compaction. После compaction сверить план, HEAD, процессы и
незавершённый ownership и продолжить ту же работу. При блокере остановить только
зависимую операцию; не обходить отказ другой моделью, transport или GUI.
Два исправления критерия Flash → specialist для локального либо architect для
системного пробела. Astra только после содержательной неудачи Sol/ultra с
перечнем проверенных гипотез и оставшимся gap; auth/quota не лечатся escalation.

Progress: все блоки 1–9 pending. Decision Log: task adapter существующего AGY bridge,
единая runtime freeze policy и защитные Codex regressions до удаления Hardcore.
Validation подготовки: `npm.cmd run check:rules` и `git diff --check` PASS;
новые документы без trailing whitespace, target plan 180 строк; product/runtime/модели не запускались.
Parent выполняет bounded review: независимая reviewer-роль недоступна по runtime thread limit,
поэтому её успешная проверка сейчас не заявляется. Parent принял архитектуру и проверил scope/consistency.
