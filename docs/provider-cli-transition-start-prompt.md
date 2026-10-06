# Стартовый промпт для перехода провайдеров

Вставьте текст ниже в новый чат проекта AE Agent. Он запускает реализацию по
плану; создание чата и выполнение product-задач в текущем planning-чате не требуется.

```text
Работаем в C:/Users/Ant/Documents/Codex/AE_agent. Выполни весь переход последовательно
в ОДНОМ этом чате по plans/provider-cli-transition-execplan.md. Прочитай AGENTS.md,
docs/model-routing.md, docs/routine-dispatch-policy.md, specs/target-app.md и
plans/target-app-execplan.md, затем начни блок 1. Исходный проверенный PRODUCT baseline:
codex/release-3.3.0, 2b8be32c89396d72c756b89dbc343ffadbd7f7cc. Плановые Markdown могли
быть закоммичены позже: проверь ancestry и diff относительно 2b8be32, отдельно
оцени новые source changes, зафиксируй actual baseline. Сохрани чужие изменения
и untracked материалы, не возвращай дерево к исходному hash вслепую.

Моя цель: оставить ровно два активных провайдера и две вкладки — Codex CLI и
AntiGravity CLI. Codex CLI сохраняет текущую «Автономную сессию Codex» и все её
server gates. AntiGravity CLI заменяет место Gemini в интерфейсе, но использует
настоящий существующий CLI/task bridge, а не переименованный Gemini API.
Старшая модель внутри AGY получает всё поручение и сама ведёт его end-to-end
в разрешённом scope. Codex диспетчер проверяет результат, а не управляет каждой
командой AGY. Сейчас профиль ae-agent настроен на gemini-3.8-flash-high/high;
проверяй configured/effective model по metadata, не самоотчёту. Не делай текущий
model slug вечным hardcoded gate и не переключай выбранную модель этого чата.

Заморозить OpenAI API, Gemini API, Claude API (моя формулировка «Cloud» относится
к существующему Claude slot), OpenRouter и Local/Ollama. Сохранить их старые
конфиги/preferences/ключи без стирания. Замороженные lanes не должны быть активным
выбором или fallback и не должны запускать readiness/model listing/self-test/chat
через UI, HTTP, MCP, сохранённые defaults или custom/env overrides. Серверная
freeze policy обязательна; просто спрятать кнопки недостаточно. Для этих lanes
оставить только targeted offline rejection tests; default product checks не
должны исполнять их success transports.

Полностью убрать Agent Hardcore из current UI/modes/HTTP/MCP/loop/автопродвижения
и dedicated artifacts/test routing. До удаления добавить meaningful regressions
защиты автономной сессии и разделить Hardcore-only/shared fixtures. Сохранить
общие solution registry/manual promotion/memory/typed tools, proposal/dry-run,
checkpoint/edit-session, grant/revocation, manual raw/destructive/save gates,
run evidence/reconciliation/idempotency. Известный synthetic Hardcore failure
на исходном и предыдущем baseline не обходить удалением shared tests или
ослаблением verifier; классифицировать его и сохранить исторический факт.

Разрешаю локальную реализацию, адресные offline fixtures/checks, обновление
планов и отдельные local working commits/checkpoints после каждого принятого
крупного блока. Родитель — единственный Git controller. Работай в текущей
release-3.3.0, не назначай новую версию и не перемещай старые refs. Добавляй в Git
только точные scope-файлы. Не выполняй push, PR, merge или release.

Используй соответствующих исполнителей, включая реальный Flash через существующий
agy-bridge с config/agy-bridge.json и profile ae-agent. Прочитай ae-task-routing,
cep-panel-controls и antigravity-cli + references/ae-agent.md перед их применением.
Luna/high ae_scout — bounded evidence; ae_operator — понятные правки/сводки/checks;
Flash/high — средние implementation blocks; ae_specialist Sol/xhigh — локальный
блокер после двух исправлений критерия; ae_architect Sol/ultra — системный пробел;
ae_reviewer Sol/high — ограниченное review блока 7. Astra только после доказанной
содержательной неудачи Sol/ultra. Terra/paid API/скрытая подмена запрещены.
Максимум два активных helpers вместе с AGY и помощником Ultra, один writer на
ресурс, один AE/CEP/UI controller. Обычные helpers дальше не делегируют.
Каждому передавай исходную цель, точные пути, baseline, ownership, constraints
и приёмку; native bounded tasks — fork_turns none. Не дублируй Flash implementation.

Flash получает самостоятельный полный task packet с оригинальным запросом,
scope/refs/inputs/criteria/artifacts и exact required_commands. Project grants
и команды текущего пакета проверяются отдельно. Не передавай panel credential.
После timeout или unknown сначала status, process identity, pending/inflight,
actual files и read-back; не повторяй mutation и не передавай writer вслепую.
AGY status не является cancel. Не выдумывай cancel CLI или доказательство остановки
descendants. Выбранная пользователем AntiGravity provider-задача при недоступности
AGY явно blocked/failed и не переходит в Codex/API. Разрешённое проектом замещение
исполнителя code-блока допустимо только после проверки недоступности/завершения
Flash в том же bounded scope с записанной причиной; это не product fallback.

Не меняй frozen intake/importer/supervisors или их baseline manifest, не запускай
Full Intaker. Не редактируй sibling agy-bridge/global config/grants, auth/secrets,
не добавляй зависимости и не меняй provider/model самого Codex. Если реальная
интеграция требует нового auth/permission boundary или правок соседнего проекта,
останови только эту зависимость и подготовь конкретный reviewed scope. Optional
Tier 2 Pro review bundle полезен, но сам по себе не является mandatory gate.
Не отправляй bundle наружу без отдельного поручения.

Разрешаю финальную ограниченную обратимую integration acceptance блока 8:
после offline приёмки определить source/installed/daemon identity, проверить
idle/pending/inflight/edit-session, сделать локальный backup установленной CEP,
синхронизировать только затронутые файлы, сверить hashes и reload. Если daemon
устарел, допускается штатная локальная активация проверенного source после idle
и reconciliation, с прежними credentials/gates. Фактически посмотреть две вкладки
и отсутствие Hardcore, выполнить настоящий Codex typed READ из AE через доверенное
подключение и одну harmless read-only AGY task через новый provider seam с
run/status/schema/artifacts, metadata и независимым typed read-back. Контроллеры
работают последовательно: родитель делает CEP sync/visual/Codex READ, после idle
передаёт AGY sole AE controller её read-only задачи и наблюдает только task/process
status без параллельного AE/UI. После завершения/pending reconciliation ресурс
возвращается родителю для независимого read-back. Это integration acceptance,
а не модельная demo. Не менять AE-проект, не
сохранять/рендерить/экспортировать и не выполнять raw/destructive/live mutations.
Не расширять grants ради acceptance, runtime подтверждения остаются обязательны.
Не использовать broad/default CEP smoke или fake connector-status-smoke как
доказательство connectivity. Если AE/AGY/auth недоступны, зафиксировать live
unverified/PENDING_LIVE, продолжить независимые блоки и не объявлять полную
acceptance завершённой.

Сначала ищи существующие typed solutions и читай только нужные entries. Gates
server-enforced сохраняются для любого исполнителя; полный файловый доступ не
заменяет разрешение bridge. Не обходить gate через GUI/другой transport/модель.
Следуй девяти блокам плана, после каждого обновляй Progress/Decision Log/Validation,
проверяй только относящиеся файлы и делай local commit после приёмки. Не запускать
перекрывающиеся suites повторно без нового изменения/failure. Главный target plan
держать не длиннее 180 строк. Не переписывать исторические receipts как новые PASS.

Не спрашивай «продолжать?» после каждого блока. Не заканчивай работу из-за токенов,
длины чата или compaction и не создавай handoff/новый чат автоматически. После
compaction сверяй actual state и продолжай эту же задачу. Общение и документы —
на русском. Итог: changed files, local commits/checkpoint, проверки, реальная
installed/live evidence и точные пробелы. COMPLETE только после выполнения цели;
если финальная live часть недоступна — COMPLETE_CODE / PENDING_LIVE с причиной.
```
