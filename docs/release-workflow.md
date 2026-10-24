# Отдельные версии AE Agent и возврат к предыдущему коду

## Подготовка 3.3.5 — 2026-10-24

- Ветка `codex/release-3.3.5` создана от `c9b25fb23865e1bad82e364c8514b0508abda08d`. Annotated checkpoint `checkpoint/ae-agent-3.3.4-before-3.3.5` сохраняет exact исходный HEAD; предыдущая `codex/mozart-reset-startup` и опубликованная 3.3.4 сохранены.
- Версия включает ранее завершённое startup recovery после подтверждённого reset и решение оставить AME как есть, сняв работы и новые проверки с активного scope. Это сохранение текущего продукта с согласованной identity 3.3.5 в package, server/runtime metadata, CEP title/menu/assets, bootstrap и адресных fixtures; нового AME feature нет.
- Исторические release notes/receipts, `testedAeContext`, frozen intake, reviewed maintenance paths и runtime authority не переписываются. Bump меняет source hash; прежние installed/runtime pins не переоформляются как 3.3.5 и требуют штатной сверки при установке.
- Validation PASS: `check:rules`, syntax18 JS/CJS, XML manifest и `git diff --check`; bootstrap96 (`--offline-only`), target16, actions48, completed-dry56, guard-timeout33, product-reset65, causal-observer18, causal-protocol84 и startup27. Первый rules FAIL compactness181 исправлен до180; bootstrap FAIL из-за оставшихся version regex исправлен адресно, повторный offline PASS. Это offline/VM evidence без live AE/CDP/daemon/provider calls; AME проверки не запускались. Публикация и remote read-back оформляются отдельно после проверок. Этот этап не утверждает live/full acceptance, accepted tag `v3.3.5`, PR/merge или GitHub Release; исторические ограничения не превращаются в PASS.

- Установленная панель проверена read-only с `CEP_PANEL_ENSURE_DAEMON=0`: title/assets 3.3.4, Bridge offline. Runtime status: `reset_active`, `writeAdmissionReleased=false`, `daemonLiveness=not_observed`; штатный `ensure_owned_runtime_daemon({})` вернул `owned_supervisor_native_refused`, повторный status сохранил тот же reset. Поэтому установленные assets и reload не менялись; версия CEP 3.3.5 подготовлена в исходниках. Запрет не обходился, AE-проект и AME не затрагивались.

- Atomic push и независимый remote read-back — PASS: release commit `96f3518c47492d0e119073c8da693249a6490fe5`; checkpoint tag object `9c59057063dc51cb530a13006429ef4567b1fc97`, peeled target `c9b25fb23865e1bad82e364c8514b0508abda08d`. Прежняя `codex/release-3.3.4` сохранена на `51b6553fac27762a4fd7fcb4235a3c7ed9e0a6ac`. Следующий документационный commit фиксирует только этот результат и публикуется в той же ветке.

## Подключение установленной 3.3.5 — 2026-10-25

Последующий bounded recovery supersedes состояние installed/offline из записи
24 октября выше: после PRECONNECT reset old daemon `40784` завершился штатно
(`WAIT_OBJECT_0`, exit 0), установлен canonical source 3.3.5 из `aca80be`,
`ensure` поднял daemon `44896` с source SHA `2950db71…`. Панель автоматически
подключилась; typed `get_project_info` прошёл дважды, в том числе после CEP reload
с новой panel instance. Состояние: reset_active, autonomy active, pending0,
inflight[], editnull; project file:null/items0/bits16/revision1. Полный выход и
повторный запуск AE не проверены, поэтому это scoped installed connectivity proof,
не полный acceptance. AEP не менялся/не сохранялся, AME/provider actions не было.
Push документационного обновления выполняется отдельно; `v3.3.5`, PR/merge и
GitHub Release этим статусом не объявляются.

## Интеграция 3.3.4 — 2026-10-21

Исторический срез: Source `codex/release-3.3.4` опубликован на `21f73e77b25b8bbe96d4636a110fb070e5bf5aef` (SHA `0fa0c34080907504e434270ac3310ff7412a3649775a1af64c8efb308b7744cc`); docs/plan — `715f5bc`. Causal154 и исторические проверки сохранены. Официальный read-only bridge status и ровно один `get_project_info` завершились PASS; artifacts: `mcp-get_bridge_status-1792597577719.json` и `mcp-get_project_info-1792597604483.json`. Финальный snapshot подтверждает `ready=true`, `draining=true`, queues/inflight/tickets0, shutdownPending=null; installed static read-back совпал со старой 9/9 pin set, source `8b2`, reload=false. Это не подтверждает mutation acceptance. Новый remaining-only shutdown draft FAIL/BLOCKED: native helper принимает прежнюю helper pair поколения 447400… (PID 33808) и отклоняет PID26736 с `owned_graceful_continuation_code_snapshot_invalid`; hash policy не обходится, child/key и native policy/data writes отсутствуют. Parent result от wrapper drain ACK — UNKNOWN, не timeout; replay/force запрещены. Status latency 3.85 s при лимите 3 s — FAIL. Perf draft `ec306ff6d9a36805e8921b571567dc172b4bb21aeffaa40ec95cd5e2ce9fe17e` прошёл 8 checks/review, но не deployed. AME finite-64 FAIL и native profile NOT ACCEPTED — сохранённые исторические результаты, не текущий AME долг. По решению 2026-10-24 текущая реализация AME оставлена как есть и устраивает пользователя; AME работы и новые проверки сняты с текущего scope. Вернуться после следующей версии Media Encoder и только по отдельному запросу; без напоминаний, автоматической проверки версии и обязательного backlog. Гипотеза пользователя о внешнем ПО не считается установленной причиной. Это не объявляет принятой версию 3.3.4: formal acceptance, `v3.3.4`, PR и merge в main отсутствуют; независимый runtime shutdown/status блок остаётся. Историческая остановка: после remote read-back работу остановили без новых milestones/perf/native/shared-queue работ на checkpoint `checkpoint/ae-agent-3.3.4-readonly-bridge-blocked-cutover`; решение 24 октября снимает только AME долг и не возобновляет этот scope. Практические code/panel anchors: ZIP desktop 3.3.2 SHA `fe08bcaa7d87b03abb43c5e806cf63dee996ce74ef31fdd075d33b16607bac68`; исходная установленная версия — отдельная backup 3.3.1. Эти anchors не восстанавливают runtime/authority; static restore требует отдельного reviewed scope/gates и ручного save/close AE пользователем, runtime inverse — отдельной процедуры. Полная запись: [integration](release-3.3.4-integration.md).

## Подготовка 3.3.2 — 2026-10-21

- Ветка `codex/release-3.3.2` создана от desktop HEAD `ce9d97778e6dc81590535a3640947b215dd7c19a`. В выпуск сохраняются 111 накопленных неопубликованных commits и все текущие pending improvements. Предыдущая опубликованная точка 3.3.1 — `662f41099944fbf57e03a0820d238b26abb642a1`; точный checkpoint desktop — `checkpoint/ae-agent-3.3.1-before-3.3.2`, аннотированный tag object `4a5c5c5feb3a1b52d79fcd6087cc768bf8f31971` указывает на exact prior HEAD `ce9d97778e6dc81590535a3640947b215dd7c19a`.
- Публикация подтверждена remote read-back: `codex/release-3.3.2` — `714392a94cf91964fb470f30c66598a47f63feaa`; `origin/codex/release-3.3.1` сохранена на `662f41099944fbf57e03a0820d238b26abb642a1`, локальный старый указатель восстановлен на ту же опубликованную точку. Все 111 исходных commits сохранены в новой ветке. `origin/codex/release-3.3.3` ноутбука не затронута и остаётся на `1d246ae5a94238a54dadd5f2d01e9eb2eaf986ae`.
- Product identity и runtime/fixture ожидания того среза синхронизированы на 3.3.2. Тогда сохранённый список pending improvements включал routing/reuse docs, common-title continuation и отдельный компонент manual AME queue grant. Упоминание grant — историческая запись комплектации 3.3.2, не текущий обязательный backlog по решению от 24 октября; он использовался только своим offline smoke и не был включён в server/CEP routes.
- Ноутбук: `origin/codex/release-3.3.3` — `1d246ae5a94238a54dadd5f2d01e9eb2eaf986ae`; общий предок с desktop — `63c8027a6832282810a7180c3dd5114b5e608cc6`, на исходном desktop HEAD `ce9d977` расхождение составляет 29 desktop-only / 184 laptop-only commits. Существующий laptop checkpoint `f92a75b89073bd1ba8848440a67928c22f529283` отличается от exact desktop HEAD. Следующий отдельный этап объединит desktop 3.3.2 и laptop 3.3.3 в новую 3.3.4; затем — отдельный аудит: inventory компонентов и измерение представительных задач с разделением runtime эффективности и затрат разработки/отладки (время, токены), после него адресная оптимизация подтверждённых bottlenecks отдельными milestones. Интеграция и аудит сейчас не выполняются.
- Validation PASS: `check:rules`, синтаксис всех 18 изменённых/pending JS, XML manifest и `git diff --check`; `ame-manual-queue-grant-smoke` (9 групп), `cep-panel-target-smoke` (16), `cep-panel-actions-smoke` (48 actions/full VM). AME title-jobs VM — 16 групп PASS; вторая часть `smoke:ame-title-jobs` — FAIL `fixture_runner_launch_identity_required`: существующий semantic fixture возвращает `{pid}`, production runner уже требует исходный process identity witness.
- Validation BLOCKED: `bridge-only-smoke-test` и network-часть `ae-agent-panel-bootstrap-smoke` — `owned_supervisor_unreserved_startup_refused`; изолированный fixture использует production `PROJECT_ROOT`, где существующий startup gate требует reservation. Bootstrap unit/VM часть достигла network stage без ошибки. Common-title recovery/reconnect — отсутствует обязательный ignored receipt `logs/cep-panel-control/cb5c3b53-5443-474e-93df-aa8210758886.json` (ENOENT). Gate/fixture проблемы присутствуют в исходном коде до bump; authority не ослаблялась и historical evidence не подменялись.
- Continuation contract исправлен отдельным `failedRecoveryCaptureIdle` из согласованных state/catalog/state; общий `nativeControlIdle` не ослаблен. Самодостаточный `common-title-assembly-continuation-smoke` — PASS (66 checks, deterministic synthetic evidence, production validators, без historical/live proof); независимый `ae_reviewer` одобрил исправление, blocking findings отсутствуют. Итоговые rules/syntax18/XML/diff — PASS; перечисленные выше FAIL/BLOCKED остаются ограничениями release validation. Исторические receipts, testedAeContext и frozen-intake baseline сохранены. Установка, reload, live AE/CEP/provider acceptance, PR, merge и GitHub Release не выполнялись.

## Дополнение к 3.3.3 — systemic recovery, 2026-10-21

Включены fast-forward в `codex/release-3.3.3` коммиты `08ee550` (изоляция
fixture), `b97cdb7` (generic recovery) и `2b74353` (live proof и документация).
Push и независимый remote read-back подтвердили
`ccbd63221c32cbeed31b06eab471ab64fc2ceb1d`; последующий docs commit фиксирует этот
результат без изменения кода. Историческая подготовка и публикация исходной ветки ниже остаются
записью предыдущего этапа.

Контракт описан в [`crash-recovery.md`](crash-recovery.md): исходные bytes и
UNKNOWN остаются неизменными, `replayAllowed:false`; API восстановления —
`recover_ae_agent_panel({})` без caller selectors. Причинная epoch, exact
terminal witness и disposition отделяют новые факты от исхода старой команды;
активный указатель обновляется CAS. Generic failed-start reducer выбирает сбой
из signed lineage без новых привязок к UUID инцидентов. Сетевой fixture запускает
backend из физической временной копии source без переноса рабочей authority.
Runtime census включает 105 source pins.

Offline validation: 51 component cases, E2E 16, fixture 24, bootstrap 96/110,
reset 65, service 35, supervisor 91, product lifecycle 12, actions 48/16,
refresh 33, dry-run 56, четыре network группы — PASS. На локально установленном
3.3.3 проверены source `eed86411…`, PID 32524; старый `90cddf8f…` завершён как
`UNKNOWN/noReplay`, отдельный ensure — `verified`, затем обычный project read —
PASS (476 items, revision 12975229). AEP SHA `f84a56ff…` не изменился.
AME enqueue/START/render/save/CU не выполнялись. Предыдущий checkpoint tag
`c287061251253a968c44d268ef580d439e65a8ac` сохранён; force push, новый accepted
tag, PR/merge и GitHub Release не создавались. Чужие WIP исключены из публикации.

## Подготовка 3.3.3 — 2026-10-21

- По явному поручению пользователя создана `codex/release-3.3.3` от `f92a75b89073bd1ba8848440a67928c22f529283`. Annotated checkpoint `checkpoint/ae-agent-3.3.1-before-3.3.3` сохраняет это точное проверенное состояние 3.3.1; исходная `codex/restore-mcp-connection` остаётся на нём.
- Фактическая опубликованная `codex/release-3.3.1` перед подготовкой: `662f41099944fbf57e03a0820d238b26abb642a1` (fresh `ls-remote`); она предок исходного HEAD. Накоплено 259 commits/435 файлов; новый этап меняет идентичность версии и текущие expectations, не переписывая историю, testedAeContext и frozen-intake baseline. Устаревший local tracking ref не использовался как release base.
- В 3.3.3 входят API AME series/collector, единый checkpoint, product reset и исправления подключения. Границы live/offline и переноса на другой desktop описаны в `RELEASES.md`.
- Canonical identity обновлена до 3.3.3. `check:rules`, syntax13JS, panel-target16, offline bootstrap94, AME series14+bridgeVM6, panel-actions48 и completed-dry56 PASS; bounded version review GO, foreign hashes7/7 unchanged. AGENTS.md нормализован в LF, content diff помимо EOL — только version. Integration `bridge-only`/bootstrap network остановлены на `owned_supervisor_unreserved_startup_refused`, без обхода gate. Live AE/AME/render/installed update в release stage не выполнялись.
- Первый atomic push и fresh remote read-back PASS: release commit `03908ef4f9835ed5cfbda311332977bf7cacb067`; checkpoint tag object `c287061251253a968c44d268ef580d439e65a8ac`, peeled target `f92a75b89073bd1ba8848440a67928c22f529283`. Последующий commit фиксирует только результат публикации; код версии находится в указанном release commit.
- GitHub Release, accepted tag `v3.3.3`, PR/merge и обновление установленной 3.3.3 в этом этапе не выполняются. Публикуются release-ветка и предыдущий checkpoint; незакоммиченные пользовательские материалы остаются локально.

## Подготовка 3.3.1 — 2026-10-09

- Ветка `codex/release-3.3.1` создана от `c8f82065b3b506c3e51ff5adc10caa14ba2ab153`; первый push/read-back PASS на `e5dc9f1f736005f6faecbff56106301c8c673dbd`. Опубликованный annotated checkpoint `checkpoint/ae-agent-3.3.0-before-3.3.1`: tag object `7d53d33ddc00aa919dcd956f644e872433587d70`, peeled target `c8f82065b3b506c3e51ff5adc10caa14ba2ab153`.
- Текущие product identity, канонические документы и адресные smoke fixtures обновлены до 3.3.1. Записи выпуска 3.3.0, testedAeContext и замороженная intake-граница сохранены.
- Validation: `check:rules`, 12 JS syntax checks, `bridge-only` и panel-bootstrap offline smokes, `git diff --check` — PASS. PR, GitHub Release и live AE/CEP/provider acceptance не выполнялись.

## Подготовка 3.3.0 — 2026-10-05

- Новая ветка `codex/release-3.3.0` опубликована от проверенного состояния
  `e2d83342eb7b4837a8ac03fbbfd240de78eebdbc`; checkpoint
  `checkpoint/ae-agent-3.2.0-before-3.3` опубликован как аннотированный тег. Предыдущая
  ветка и её указатели сохранены.
- До подготовки версии накопилось 68 коммитов и 168 файлов (`+30799/-427`)
  относительно `origin/codex/release-3.2.0`. Сами накопленные изменения здесь
  не повторяются; этот этап обновляет только версии в продуктовых файлах и документацию выпуска.
- Remote read-back PASS: ветка указывает на `7d815366043ef0c6b1938bebea0977ae0997ce62`; annotated checkpoint tag указывает на `725c7498ec15e0bfa9a427e67cd1236219fb38fb` (peeled target `e2d83342eb7b4837a8ac03fbbfd240de78eebdbc`). Инвентаризацию выполнял ae_scout, правки и проверки — ae_operator, Git-операции — родитель. PR и GitHub Release
  не создавались; установленная версия и живая приёмка не заявляются.
- Неотслеживаемые legacy review packs и кэш Windows исключены из области выпуска и
  оставлены нетронутыми.

Каждая новая версия разрабатывается в `codex/release-X.Y.Z`. До начала новой
версии фиксируется точный проверенный commit предыдущей версии annotated тегом.
Принятый выпуск получает тег `vX.Y.Z`; промежуточная точка — `checkpoint/...`.
Существующие теги не перемещаются, старые release-ветки сохраняются.

## Текущее разделение 3.1 и 3.2

- Предыдущий GitHub код: `codex/release-3.1.0`, commit
  `c6edff9738c20347b802d481d2bb6b3ad9ffc646`.
- Точный checkpoint: `checkpoint/ae-agent-3.1.0-before-3.2` на том же commit.
- Новая `codex/release-3.2.0` начинается с `d0729f6` и включает 29 накопленных
  commits относительно предыдущей ветки, затем отдельный commit подготовки версии.
- PR №4: `codex/release-3.1.0` → `main`, остаётся открытым.
- Подготовка версии: commit `b86fd2c`; offline проверки из release-плана — PASS.
- [Draft PR №5 версии 3.2](https://github.com/aitonpro54/AE_agent/pull/5):
  `codex/release-3.2.0` → `codex/release-3.1.0`.

Base 3.1 используется для сравнения изменений. PR 3.2 нельзя сливать в 3.1:
сначала отдельным поручением принимается PR №4 в main, затем base PR 3.2 меняется
на main и diff проверяется повторно. Для последовательных зависимых PR предпочтителен
merge commit, сохраняющий ancestry; после squash/rebase необходима отдельная проверка
истории. Слияние любого PR требует отдельного явного поручения.

## Постоянный порядок обновления

1. Проверить branch/HEAD, свежий remote, отсутствие конфликтующего имени ветки
   или тега; сохранить список незакоммиченных материалов. Точкой возврата служит
   конкретный проверенный commit, а не только название версии в файле.
2. Создать annotated checkpoint старого состояния и новую release-ветку от
   выбранного исходного HEAD. Если работа накопилась в старой локальной ветке,
   сначала сохранить её HEAD в новой ветке, затем вернуть только старый локальный
   указатель к опубликованной точке. Force push старой ветки не использовать.
3. Обновить canonical surfaces, проверяемые `scripts/clean-current-check.js`,
   runtime/fixture version expectations и текущие docs. Исторические receipts,
   release notes, testedAeContext и frozen-intake baseline не менять.
4. Выполнять milestones с отдельными commits и обновлять существующий план
   (Progress, Decision Log, Validation). Перед push выполнить check:rules,
   syntax/diff и относящиеся к изменениям offline smoke groups. Добавлять в Git
   только точные файлы текущего scope, не весь набор через `git add .`.
5. Push отправляет новую ветку и отдельно выбранный тег; draft PR описывает
   итоговые изменения, проверки, пределы и зависимость от предыдущего PR.
   Ветки и теги не являются обновлением установленного приложения.
6. После отдельного принятия версии закрепить проверенный commit тегом `vX.Y.Z`
   и по поручению оформить GitHub Release. Следующую версию начинать отдельной
   веткой; обновления принятой версии оформлять patch-выпуском с новым тегом.

## Возврат к 3.1

После сохранения текущих правок прежний код доступен так:

```powershell
git switch codex/release-3.1.0
```

Для отдельного checkout точного checkpoint, без переключения текущей работы:

```powershell
git worktree add --detach ..\AE_agent-3.1-checkpoint checkpoint/ae-agent-3.1.0-before-3.2
```

Целевой каталог должен быть новым. Detached checkout предназначен для инспекции
и сборки; для новых правок создаётся отдельная ветка.

Если 3.2 уже принята в main, её отмена оформляется новым revert PR с проверками,
сохраняющим опубликованную историю. Не использовать reset/force push main для
обычного возврата. Git хранит tracked исходники; ignored runtime, секреты,
внешние media/AEP и installed CEP в checkpoint не входят. Установка прежней
CEP/daemon и работа с AEP — отдельные действия с действующими gates.
