# База Core: подключение, восстановление и диагностика

**B6 source checkpoint,3ноября:** 15checks/330unique cases (87fresh/243exact current-key reuse)/55boundaries PASS.
Исправлен подтверждённый PowerShell startup отказ в очищенном env owner, runtime
delta1file; четыре named test budgets скорректированы после timeout, assertions
сохранены. Candidatecdf7338f… built/verified/dry-run, actual install0. Штатная
поставка меняет одну args-line Core MCP entry и требует узкого уточнения scope
из-за действующей паузы MCP/Codex config. Native delivery/late callback/mutation
recovery остаются открытыми; старый pre-submit run не повторять.
[Точный срез и evidence](../docs/core-base-b6-windows-probe-20261103.md).

1 ноября 2026. Прямое поручение пользователя в чате
`01a19665-19c8-7301-9869-f0db66042251`. Исходный commit
`6fcee4cdd213759e6e1f351657b19f6b919f15df`.

## Цель и границы

Довести обычную эксплуатацию Core без зависимости от ремонта типографики.
Titles и Slideshow на паузе; R5 Titles остаётся отдельной незавершённой приёмкой.
Его missing_stroke_color, существующие отказы и тесты сохраняются как evidence.
Уточнение пользователя 2 ноября в чате `01a19c49-8b10-7fe2-af4b-ce58f19219d5`:
добавить обязательный режим «Начать заново» и снять лишние ограничения отладки.
Для результата базы разрешены необходимые тестовые AEP, их изменения/save,
сохранение текущей работы для защиты, restart AE/CEP/Core, штатная установка
и адресные диагностические JSX через поддержанный путь с техническими gates.
Повторное общее разрешение на эти действия не требуется. Пользовательские
исходники/несохранённую работу защищать сохранением или копией; собственные
временные тестовые данные можно удалять/пересоздавать. Это заменяет прежний
scope-запрет на новый AEP/save/restart/raw, не возобновляет разработку Titles.
Промпт продолжения — [редакция 2 ноября](core-base-continuation-prompt-20261102.md).

Сначала исследовать существующие MCP: готовая замена, переиспользуемая часть,
заимствуемый подход или отсутствие подтверждённого преимущества. Оценивать
стоимость интеграции и дальнейшей поддержки, не число tools или тестов.
Один отдельный Argon запрос по плану базы; по дополнительному прямому поручению
пользователя — второй независимый сравнительный запрос в другом диалоге Argon.
Оба через единственный существующий ARGON_BrowserUse controller. Повторов нет.

## Порядок

1. **B0 — сравнительный research.** Официальные MCP transport/lifecycle/errors,
   готовые AE MCP, релевантные desktop bridges и средства диагностики.
   Для каждого: механизм, первичный источник/версия, подтверждённая граница,
   стоимость принятия и решение use/adapt/defer. Отсутствие доказательства
   гарантии не считать доказательством отсутствия реализации.
2. **B1 — понятные исходы и диагностика.** На точных исходниках подтвердить
   потерю terminal read rejection на owner boundary. Выбрать минимальный
   доверенный контракт результата; не выдавать произвольное исключение за
   завершённую команду. pending/UNKNOWN/fault сохраняют прежние ограничения.
   Ошибка должна показывать причину и допустимый следующий шаг.
3. **B2 — подключение и восстановление.** Пройти конечную матрицу ниже,
   исправлять только воспроизведённые базовые дефекты. Использовать status и
   существующую project-inspection; нет зависимости от текстового модуля.
   Сначала уточнить disconnect contract: установленная facade сейчас возвращает
   disconnected:false / physical_link_owned_by_installation_owner. Разделить
   detach клиента, release controller и физическое отключение общего peer.
   Метод базового Broker не доказывает доступность disconnect установленной facade.
4. **B3 — штатный режим «Начать заново».** Минимальное расширение текущего
   механизма, доступное через Core и кнопку панели. Прекратить старые планы и
   неотправленную очередь; исключить позднее исполнение уже отправленных команд
   до допуска новой работы. Старые UNKNOWN архивировать как явно оставленные с
   неизвестным исходом, без подмены на success/cancelled и без обязательного
   выяснения каждого исхода. Принять свежепрочитанное состояние AE за новую базу;
   уже внесённые изменения не откатываются. Старые результаты/клиенты не должны
   возобновлять прежнюю работу или менять новый сеанс. Если невозможно надёжно
   остановить старое исполнение в живом AE, использовать необходимый restart AE
   с защитой работы; не делать restart обязательным для каждого сброса.
   Сохранить историю и no-replay, реализовать штатное прекращение старых блокировок
   после подтверждённого прекращения исполнения. Восстановление самого прерванного
   сброса не должно давать частично очищенное состояние или повтор команды.
   Существующий reset_task отменяет queued-unsent, а не весь UNKNOWN; reconcile_task
   ищет original completion и не заменяет B3. До production write зафиксировать
   узкий контракт/файлы/проверки; детали технического решения ещё не приняты.
5. **L0 — отдельное исследование смены проекта.** Документально установить,
   какие сигналы дают текущие CEP/ExtendScript, доступные новые API и SDK.
   Различать restart процесса, другой path и same-path open/revert/replacement.
   Результат — feasibility, пробелы и минимальный следующий эксперимент.
   Без нового lifecycle provider, SDK-установки и разрастания tests в этом срезе.
6. После B1/B2/B3 и адресной installed-проверки зафиксировать готовность именно
   базы; вернуться к предметным модулям отдельным этапом. Read-only proof не
   закрывает recovery принятой
   mutation, native Titles acceptance, full release или portability.

## Конечная матрица базовой приёмки

| Сценарий | Ожидаемое поведение | Способ |
| --- | --- | --- |
| Первый MCP клиент; повторный status после idle | Один owner, ответ с понятным состоянием | Existing evidence + адресный configured read при необходимости |
| Второй клиент; завершение клиента | Наблюдение доступно, второй writer не появляется | Existing process tests; новое исполнение только при изменённой closure |
| CEP отсутствует / появилась | Понятное ожидание или действие Connect | Component evidence; ограниченная live проверка после preflight |
| Disconnect / reconnect в idle | Явная семантика client/controller/physical link, история сохранена | Сначала contract decision; затем адресные tests/installed cycle |
| Известный read rejection | Точный разрешённый код, без ложного uncertain | Owner boundary integration regression |
| Потеря ответа / незавершённая команда | Никакого повторного исполнения; честное uncertain/recovery | Existing adversarial tests + узкая regression при изменении boundary |
| Мёртвый owner / устаревший клиент | Штатный recovery либо точная причина отказа | Исторический installed proof; новые tests лишь по изменённым зависимостям |
| «Начать заново»: старая очередь / UNKNOWN / поздний ответ | Прежняя работа прекращена, старое исполнение больше не вмешивается; новая база AE, история и no-replay сохранены | Адресные component/integration проверки и installed-сценарий на тестовом AEP |
| Прерывание самого сброса | Штатное завершение того же сброса, без частичной разблокировки и replay | Адресная fault-проверка выбранного B3-контракта |

Ни наличие метода, ни offline PASS сами по себе не означают installed PASS.
Для каждого пункта отмечать implemented / tested offline / observed installed /
remaining, с привязкой к версии. Restart AE разрешён для необходимого сценария
отладки/приёмки; не повторять его ради количества проверок. Разрушительные
fault-сценарии проводить на собственных тестовых данных с защитой текущей работы.

## Ограничение стоимости проверок

- Один источник ответственности и один writer на ресурс; root единственный
  live-controller. Для inventory выделен один bounded read-only scout.
- Сначала точные changed paths и validate-diff selection, затем выбранные
  релевантные проверки. Broad/full-release и Titles suites не запускать только
  из-за нового плана. Не обходить действующий selector; избыточную зависимость
  сначала обосновать и исправить отдельным ограниченным изменением.
- Сохранять доказательства неизменных closures; не повторять успешно пройденное
  без нового diff, сбоя или конкретного непокрытого риска.
- Счётчик тестов не является критерием прогресса. Отчёт: закрытый сценарий,
  изменённые файлы, проверка, оставшийся пробел.
- Каждый завершённый инженерный срез — небольшой commit с Progress,
  Decision Log и Validation. Не требовать ещё одного Argon review после fixes.

## Progress

- B6 fixture/re-adoption готовы: own saved comp1/layer13/BASE_A/full native style
  proof PASS; штатная новая b25b5fef… enabled, currentAE21960/test path. Fresh
  configured owner22188/auto peer/15receiver+1ledger settled, package/bindings/history/
  AEP unchanged across metadata operation. Native fault/mutation/reset0.
  [Evidence](../docs/evidence/core-base-b6-fixture-readoption-20261103.json).

- Configured B4 подтверждён штатным текущим MCP без service refresh: package21a884fa…,
  owner16712/один3457, sameAE21960, auto peer connect. Malformed contract до submit
  и fresh native read/release1 PASS.11settled/prefix9/protected/archive/AEP exact.
  [Evidence](../docs/evidence/core-base-b4-configured-20261103.json).
  Следующий [bounded native блок](core-base-delivery-recovery-20261103.md) использует
  отдельный own test AEP и existing manual operation для проверки базы.

- 3 ноября, B5: production HTTP receiver и VM dispatcher соединены в двух новых
  сценариях доставки/late callback. После timeout UNKNOWN journal сохранён
  побайтно; старый completion не принимается свежим receiver, новая команда
  завершает только новый журнал. Один selected check/14fresh cases/55boundaries
  PASS. Изменён только test file; production/package/install unchanged.
  [Scope](../docs/core-base-b5-channel-composition-20261103.md),
  [evidence](../docs/evidence/core-base-b5-channel-composition-20261103.json).
  Пользователь подтвердил следующий scope: дальше доводить базу — доставка,
  поздние ответы и recovery. Native proof остаётся следующим шагом; отложенные
  MCP/Codex maintenance и Titles/Slideshow этим не возобновляются.

- 3 ноября, уточнение пользователя: самостоятельные действия агента относятся
  прежде всего к панели/AE; MCP/Codex restart и configured B4 proof отложены.
  Уже запущенный helper успел завершить exact app-server28148 один раз и закончил
  работу. После уточнения новых MCP/live/start/restart/config действий0.
  Старый Core6340/listener3457 не наблюдаются; причина выхода Core неизвестна.
  AE21960 и AEP/bindings/session/history9events/архивы unchanged.
  [Evidence](../docs/evidence/core-base-b4-service-refresh-deferred-20261103.json).
  Новое service maintenance — только по прямому поручению; panel/AE UI root
  выполняет сам в рамках соответствующего задания. Titles/Slideshow на паузе.

- B4 installed: source1e9a63a/package21a884fa… штатно установлен/enabled,
  stopf36e04ce…/update7b18829f… settled, attempts1. Owner6340/один3457, CEP
  автоматически connected после собственного close/open1, та жеAE21960.
  Standard missing-contract refusal без новой записи и correct read/release1
  PASS;9settled events/prefix7/protected/session/archives/AEP exact.
  [Evidence](../docs/evidence/core-base-b4-installed-20261103.json).
  Configured client2708 cached327faaac… ещё owner_unavailable; UI project row
  disabled. Далее scoped service refresh и fresh configured proof этого же чата.

- B4 source принят: обязательный inspection contractId проверяется до invoke,
  ошибка owner_inspection_contract_required указывает get_module_contract;
  настоящий UNKNOWN и все controller/session/reset gates сохранены.
  [Scope и контракт](../docs/core-base-b4-request-validation-20261103.md),
  [source evidence](../docs/evidence/core-base-b4-source-20261103.json).
 13selected checks/214fresh cases/55boundaries PASS; новый80runtime/98bundle
  package21a884fa…/distribution41d4812c… verified/dry-run. Далее штатная новая
  установка и configured proof. Installed327faaac… пока прежний; Titles на паузе.

- 3 ноября, после restart Codex: первый configured status327faaac… PASS,
  owner25380/один3457/old31404 absent; CEP подключилась автоматически. Stale session
  отказан, current8fe8b332…/fresh project-inspection/release generation3 PASS.
  Receiver5settled/prefix3 exact;14/52event archives,8reset records, защищённые
  файлы и own AEP unchanged. Pending/UNKNOWN/fault0, install/reset/restart/save/
  mutation0. [Evidence](../docs/evidence/core-base-b3-configured-20261103.json).
  Ограниченная приёмка базы B1/B2/B3 завершена; L0 research уже выполнен.
  Read-only граница сохраняется: mutation recovery/Titles/full release/portability
  открыты. Следующий продуктовый этап — отдельный scope; Titles/Slideshow на паузе.

- UNKNOWN reset69facd01… завершён агентом через existing authenticated panel API;
  exact old Node19452/30888 и AE9472/26308 gone, ownAE restart1/new21960.14unknown
  events и earlier52event archive preserved exact. New session8fe8b332…/new store/
  explicit ack/fresh native baseline/release PASS, current3events/clean. Пользователь
  больше не выполняет кнопочные действия: прямое поручение root делать их самому.
  Configured cached client5264 остановлен адресно, manager сам не переподключил;
  Transport closed. До base acceptance остаётся fresh configured proof после
  service app-server restart; повтор installs/settled operations не нужен.

- Native B3 idle: reset9b128005…/sessionaeddb9ee… completed, exact52events
  archived, old15584 gone/new30888, sameAE9472 без restart. Missing/old session
  ack denied; explicit acquire/fresh native project baseline/release PASS,
  isolated new3event receiver. Далее actual read UNKNOWN воспроизведён одним
  точным Node fault: ipc_outcome_uncertain,14events/last begin inspect-facaa741…
  без terminal, diagnostic owner19452/queue closed. Delivery не наблюдалась.
  Ждём отдельное действие панели для UNKNOWN reset, затем exact AE death и
  original history archive/new session/baseline. Общую приёмку B3 не закрывать.

- B3c,3ноября: source `0cddee2` принят; stop49b423d9…/updateaf65ee78…/
  explicit enable завершены. Прерванный90с wrapper восстановлен official original
  pre-ready inspect/finish без повторного apply. Installed327faaac…/4975c36a…,
  exact80runtime/CEP verification PASS; protected origins/adoption/ledger/AEP preserved.
  New standard client/owner15584 и native saved empty project read PASS;
 52settled events/prefix50 exact, lease released, pending/UNKNOWN/fault0.
  AE9472 прежний, CEP закрыта/открыта1раз, mutation/restart0. Native reset пока0:
  click tool не адресует отдельный CEP process, запрошено ручное нажатие пользователя.
  Configured MCP old2fb/owner_unavailable требует Restart MCP; install не повторять.
  Далее idle/UNKNOWN reset и fresh session/baseline/configured proof.

- 3 ноября, B3b3: production startup до lifecycle/stores, readonly reset driver,
  отдельный authenticated panel control, «Начать заново»/«Продолжить сброс»,
  explicit session ack и baseline подключены. Owner-v4 package80runtime/98bundle
  собран/verified, dry-run PASS; 42checks/41batches/721unique cases (212fresh/509exact reuse) PASS,
  boundaries55. Installed B3 пока0. Далее штатный update и native idle/UNKNOWN
  reset на собственном защищённом AEP, затем оставшиеся задачи активного плана.

- 3 ноября, B3b2: private work-session и durable initial baseline, explicit current
  sessionId для acquire/transfer приняты360fresh cases/18checks, boundaries51.
  Базу снимает только one-shot proof точного успешного durable direct project
  read; copied/foreign/Broker/manual/rejected/stale результаты отказываются.
  Production composition пока legacy, новый session runtime ещё не packaged.
  Далее B3b3 startup/observer/panel/packaging, затем installed reset и оставшиеся
  задачи плана по прямому поручению пользователя «по окончанию… переходи».

- 3 ноября, B3b1: synchronous physical reset fence и window-global Native callback
  guard с отдельными session storage keys приняты264fresh cases/10checks,
  boundaries50. Старый callback использует свой исходный key/channel; normal
  maintenance drain сохранён. Production reset request/startup/panel ещё не
  подключены. Далее B3b2 session ack/baseline, затем composition.

- 3 ноября, B3a4: один private finisher с process-bound install lease, сохранением
  точных старых stores и UNKNOWN, signed archive/session receipts принят:
  7current checks/140fresh cases, boundaries50.11crash prefixes продолжаются
  только после смерти прежнего helper; same-ID completed receipt — historical
  data без доступа к новой работе. Production composition и installed reset ещё
  нет; следующий срез B3b.

- 3 ноября, F2: exact historical AE из adoption добавлен к required death
  targets при UNKNOWN. Missing-in-inventory не означает death; foreign machine
  или imprecise birth не принимаются.5selected checks/115fresh cases,
  boundaries48 PASS. Архивный reducer пока только ignored draft/TEMP prototype;
  его6exploratory cases не засчитаны как production source или installed proof.

- 3 ноября, B3a3: private process/endpoint barrier принят6selected checks/
  118cases (113fresh+5exact reuse), boundaries48. Включены обе Node identities,
  exact AE birth, crash-before-inventory, no stopped receipt, strengthened risk,
  phase drift и full shutdown role scope. Install lease/archive/new session ещё
  не реализованы; следующий срез B3a4, затем B3b composition.
- 3 ноября, natural idle: первый configured status после≥3460.720с прошёл без
  retry. Same owner24160/bootc9a04982…, peer connected/inspectionAvailable,
  controller idle, pending/UNKNOWN/fault0.46events и protected hashes unchanged.
  Нового project read или runtime mutation не было.

- B3a2: private durable owner request/inspection в runtime/start-over-state.js.
  Signed intent и journal inode anchors, обе producer identities, повтор того же
  UUID, prefix/CAS/failure retention проверены17new TEMP cases.5selected checks/
  106fresh cases PASS, boundaries47. Production entry/physical fence/finisher ещё
  не подключены. Следующий срез B3a3 — barrier и архивный finisher, затем B3b.

- B3a1: отдельные supplied-history semantics и fixed native process observation
  реализованы в runtime/start-over-inspection.js и start-over-process.js.
  Проверены prefix/late completion/no-new-begin, UNKNOWN без relabel, combined
  receiver/Broker bindings, foreign/shared/unknown-origin fences и точные
  PID/birth all-AE/старых producers.6selected checks118cases PASS, boundaries46.
  Это source foundation; durable transaction/finisher/production reset ещё нет.

- 2 ноября, после restart Codex: configured package2fb5aebe принят первым
  core_status и свежей project-inspection через автоматически подключившуюся CEP.
  Новый owner24160, один3457; AE9472/пустой unsaved project прежний. Lease1
  освобождён, pending/UNKNOWN/fault0. History46events/prefix44 и protected bindings
  проверены. Следующий source срез — B3a; installed reset ещё не выполнялся.

- [x] Исследован [offline AEP модуль](../docs/offline-aep-module-research-20261101.md):
  upstream py-aep найден, local install пока не подтверждён. Подготовлено
  предложение файлового backend без панели; реализация не добавлена в B1/B2.
- [x] По дополнительному вопросу пользователя исследованы
  [панель, другие AI-клиенты и локальные модели](../docs/panel-and-client-portability-20261101.md):
  Atom/OnePrism подтверждают совместимость панели с внешним MCP;
  универсальная регистрация клиентов и беспанельный transport — разные задачи.
- [x] Пользователь изменил приоритет: база отдельно от Titles.
- [x] Read-only inventory выявил owner exception masking и ограниченное
  CEP reconnect window; потеря attachment пока не классифицирована как bug.
- [x] Первичный [сравнительный research](../docs/mcp-base-comparison-20261101.md):
  Kumo/23d1 source, OnePrism, официальный MCP/Inspector/mcpdo, FastMCP.
- [x] Начато отдельное [L0 feasibility](../docs/project-lifecycle-feasibility-20261101.md).
- [x] Два отдельных пакета переданы единственному ARGON_BrowserUse controller:
  plan consultation получена; comparative consultation вернула только отказ.
  По1upload/1send, retries0. Findings локально разобраны в decisions.md пакетов.
- [x] B0: собственные первичные источники и исходы двух запросов зафиксированы;
  содержательного comparative ответа Argon нет, самостоятельно research выполнен.
- [x] B1: узкая source-реализация и selected offline-проверки завершены;
  installed proof остаётся отдельным следующим действием.
- [x] B1 начат: [source brief и стоимость до реализации](../docs/core-base-b1-brief-20261101.md)
  готовы.4production/3test paths;24selected batches, без запуска tests.
  Следующий шаг — bounded проверка причин selection; затем frozen source slice.
- [ ] B2: завершить configured-часть матрицы после restart Codex.
- [x] B2 source: [фоновое ожидание и disconnect contract](../docs/core-base-b2-20261102.md)
  реализованы; один selected batch69/69PASS, установленная проверка впереди.
- [x] 2 ноября: требование B3 и новые разрешения отладки включены в план,
  AGENTS.md и обновлённый промпт продолжения; прежний промпт найден в чате
  `01a19bda-e7a1-7f91-836b-14e3ac611ba6`, turn `01a19c42-41ff-73f1-a836-2c108b01dfc6`.
- [ ] B3: реализация Core/панели и адресная приёмка «Начать заново».
- [x] B3: [минимальный контракт](../docs/core-base-b3-20261102.md) подготовлен до
  production write; первое [ограниченное plan review](../reviews/argon/core-base-start-over/20261102-b3-plan-01/request.md)
  передано единственному ARGON controller по новому human поручению.
  Одна загрузка/одна отправка; исходный ответ получен2ноября21:19 без новых sends.
  Verdict revise, шесть findings сверены локально, контракт уточнён;
  [локальное решение](../reviews/argon/core-base-start-over/20261102-b3-plan-01/decisions.md).
- [x] B1/B2 установленный standard/native путь: package2fb5aebe, typed read,
  finite rejected read, follow-up read и auto reconnect после96.622с без Core
  проверены. [Матрица](../docs/core-base-validation-20261102.md),
  [checkpoint](core-base-installed-checkpoint-20261102.md).
- [x] Configured MCP package2fb5aebe после restart: status/read и natural idle
  проверены; oldbe9afe99 — исторический blocker, не текущая задача.
  B3 production/installed reset, full release и portability остаются открыты.
- [x] L0 bounded research без реализации: дешёвый exact detector не доказан;
  gap открыт, SDK/UXP/provider development отложены и базу не блокируют.

## Decision Log

- B6 использует existing text operation только как инструмент native recovery базы.
  Before mutation новый exact host/project adoption получен существующим stopped
  протоколом; нет переноса old host authority, ослабления style proof или нового ingress.

- Configured B4 закрыт обычным клиентом нового текущего чата, без Codex/MCP
  restart/config. Прежняя отложенная maintenance задача не нужна для этого proof
  и не возобновляется. Новый native fault требует своей exact observed цели,
  своего commandId и нового server-owned reset; old settled IDs не повторяются.

- B5 использует реальные TEMP HTTP/HMAC/journal и явно synthetic AE callback/
  session replacement. Составной PASS дополняет B3b1, но не закрывает native
  delivery/late callback или recovery mutation. Production delta не требуется.
  Дальнейшая доводка базы прямо подтверждена пользователем; новый предметный
  продукт не выбирается, maintenance Codex/MCP не включается автоматически.

- Уточнение пользователя снимает автоматическое продолжение service refresh из
  предыдущего checkpoint. Не считать отсутствие текущего Core readiness поводом
  возобновлять отложенную диагностику/перезапуск MCP. Сохранить выполненный B4
  source/standard proof отдельно от незавершённого configured acceptance.

- B4 installed-поставка не требует нового B3 reset, AE restart или review.
  Настройки безопасности/доступа Codex не менялись. Перед служебным обновлением
  app-server сохраняется checkpoint; текущий chat UUID установлен по runtime,
  других active chats не наблюдалось. Старые settled IDs и native команды не replay.

- B4: форма обязательного аргумента проверяется generic owner до принятия
  операции; module-specific логика и новый proof/issuer не нужны. Проверка не
  классифицирует исключения после invoke и не ослабляет private native read
  rejection proof. Рабочий контракт по-прежнему берётся из get_module_contract.
- Source-поставка B4 меняет ровно2runtime files; остальные native/AE assets
  побайтно прежние. Новый install выполняется отдельной новой транзакцией после
  source commit; historical327faaac… acceptance сохраняет provenance.

- 3 ноября: configured proof закрывает последний пробел текущей приёмки базы.
  Установку/reset не повторять; новый owner25380 не выдавать за surviving31404.
  Ошибки вызова root до submit не считать native UNKNOWN: после них journal3events
  не менялся. Успех — только отдельный корректный exact-contract read с новой
  парой begin/complete. Прежняя misleading диагностика missing contractId сохранена
  в evidence, source в этом документальном milestone не меняется.
- Готовность базы означает принятые B1/B2/B3 и bounded L0; она не разрешает
  автоматически вернуться к приостановленным Titles/Slideshow. Ненаблюдавшиеся
  delivery/late callback wire, mutation recovery и two-machine round-trip остаются
  отдельными границами, без нового Argon review или broad test-прогона.

- UNKNOWN request через штатный panel-role wire protocol — допустимый API-путь
  по прямому поручению пользователя, с nonce/HMAC/purpose/pins и one-attempt audit.
  Новых endpoints, credential roles или private injection нет. Actual button UI
  отдельно наблюдался на idle сценарии; API action не переименовывается в UI click.
  Stale configured transport — отдельная задача клиента Codex: exact client stop
  не обеспечил auto reconnect. Нужен scoped backend restart с сохранением окна/
  возвратом в текущий чат; ни install, ни Core reset для этого не повторяются.

- Native сценарии: alert/$.sleep/busyloop в AE допускают параллельное CEP read;
  successful exploratory reads не переименованы в UNKNOWN. Actual Node fault
  привязан к появлению новой journaled read-команды через retained handle и
  fresh exact CIM scope. Подтверждены persisted begin/no terminal и native death;
  доставка/late callback не наблюдались и не входят в этот native proof.

- B3c: original interrupted update завершать только official pre-ready recovery
  с exact intent/pins; wrapper timeout не разрешает повтор owner-update.
  Settled49b423d9…/af65ee78… сохранены. UI click отказан до input из-за
  CEPHtmlEngine child target; raw reset RPC ради обхода этого отказа не вводится.
  Запрошено ручное действие пользователя, actual reset пока0. Standard client
  нового package не подменяет fresh configured proof старого cached MCP.

- B3b3: pending reset перехватывается до lifecycle/Broker/receiver; driver держит
  canonical endpoints и не имеет execution lane. До lease автоматически ждёт
  только exact old-node/AE death; post-claim fault требует explicit continuation
  того же intent из нового process. UNKNOWN остаётся прежним исходом. Panel
  reset использует отдельные HMAC purpose/action/epoch и одноразовый nonce,
  доступен при физическом fence/latch. Потерянный ответ не повторяет request.
- Owner-v4 закрывает полный package cluster; exact v3 читается как historical DATA
  для update, не как новый executable. Pending reset запрещает installer/downgrade.
  Failed70-file expectation исправлено на80. Тестовое90с ожидание оказалось
  недостаточным при продолжающемся archive; expanded240с observation с последней
  диагностикой не меняет production RPC/auth/retry. Неудачные batches исключены. После повторного expiry240с исправлен
  квадратичный обход realpath: lstat/link/type каждого предка сохранены, полный
  canonical path проверяется один раз (для ENOENT — existing parent). Три новые
  junction/canonical/missing-parent проверки PASS; current full entry cases
  прошли77.2/81.8/88.5с. Content/inode/CAS и production timeouts не ослаблены.

- Work session — отдельный logical namespace, не AE epoch/grant. Legacy mode
  явно ограничен установкой до первого сброса. Новые acquire/transfer требуют
  точного sessionId, thin client не подставляет его автоматически. Initial
  baseline хранится отдельным signed receipt и не переписывается при каждом
  owner boot; текущие target/authority gates сохраняются. Старые credentials
  разрешаются только существующей verified installation lineage как DATA.

- Physical reset switch отделён от ordinary attachment freeze: принятая, но
  недоставленная команда больше не выдаётся по poll; уже доставленный callback
  может завершить только старую запись. Timeout сохраняет UNKNOWN. Historical
  format1 test fixture теперь хранит exact прежний dispatcher741824cf…; source
  исторического disposition validator не менялся.

- Архивные rename выполняются только под собственным sealed mutex и двумя
  удерживаемыми endpoints; старые producers и прежние finisher actors должны
  прекратиться по exact native identity. Ограниченная цепочка12attempts не
  допускает бесконечных takeover. Новый work session остаётся baselineRequired
  и не выдаёт AE authority. Собственный inert atomic stage допустим только как
  точный локальный alias; внешняя hardlink блокирует продолжение.

- Known host-adoption origin — отдельный death target вместе с current inventory
  и constraint origins. Сохранённая adoption не выдаёт authority свежему AE.
  В B3a4 потребуется также death proof прежних finisher actors до takeover lease.

- B3a3 фиксирует AE inventory один раз после смерти producers, если owner не
  успел сделать это сам. Новая AE incarnation не вызывает бесконечный restart;
  вновь обнаруженный UNKNOWN не использует прежнее дешёвое idle observation.
  Barrier capability относится к native/endpoint proof; install lease и archive
  пока отсутствуют и отдельным JSON flag не подменяются.

- При B3a2 intent публикуется только полным hardlink record; исходные journal
  inodes удерживаются anchors, prefix bytes допускают append completion.
  Inspection/stopped request не объявляются доказательством смерти producers.
  Никакой UI/RPC заглушки до finisher и реальной композиции не добавлено.

- B3a1 отделён от destructive archive writer. Семантические и process facts не
  выдают permit. Новый receiver begin после reset prefix — нарушение admission,
  не допустимый drain. Нельзя локальным новым record скрыть исходный foreign
  fence; первая реализация откажет с точной причиной. История другой машины или
  legacy constraint без точной AE origin не снимается смертью текущего AE.

- Configured B1/B2 proof завершён без повторной установки. Новый owner после
  restart подтверждён fresh PID/birth; прежний19892 отсутствует, его survival
  и причина выхода не заявляются. Native read не выдаёт mutation authority.

- 2 ноября, получение B3 review: через тот же ARGON controller подтверждены
  Aiton/обычный «Чат»/Argon/Высокий, переключения не требовались. Raw41896bytes,
  SHA35c4e7ce…; payload и7source hashes exact. F1–F6/S1 разобраны как требования
  нового механизма, не текущая production acceptance. Приняты physical reset fence,
  diagnostic/unclean barriers, persistent startup/baseline gates и window latch;
  новый aborted-before-delivery status автоматически не принят. Дополнительно
  уточнены archive snapshot после death и явное new-session подтверждение control
  после reconnect старого клиента. Следующий source срез — B3a; второго review нет.
- 2 ноября, installed B1/B2: из-за недоступного чтения B3 review выполнена
  независимая приёмка уже готовой обычной базы. Штатный новый stop/update/enable
  и same-descriptor stop/resume завершены; B3 reset не имитировался. Пакет2fb5aebe
  работает через real standard client/CEP/AE; configured proof требует restart
  app transport и не заменяется этим результатом. Старые transactions не повторять.
- 2 ноября, Argon: первая B3 отправка подтверждена receipt, полный ответ и verdict
  не получены из-за Debugger unattached. После восстановления читать существующий
  диалог без новой загрузки/отправки. B1/B2 работа не зависела от этого ответа;
  B3 остаётся отдельным незавершённым инженерным срезом.
- 2 ноября, B3: выбран кандидат archive/new-session после доказанного прекращения
  старого исполнения. По прямому human поручению текущего чата первое review
  самостоятельного B3 этапа отправлено в Aiton/Argon/максимальный доступный effort.
  Immutable payload45298bytes, без credentials/runtime/PII. Повторного review нет;
  до разбора ответа B3 production code не писать.

- 2 ноября, B2: transport absence после50с продолжает ожидаться с паузой15с
  перед новым ограниченным окном. Auth/pins/HTTP refusal/duplicate-peer бюджет
  и latch/UNKNOWN gates не ослаблены. Existing disconnect facade сохраняет
  физический peer; detach, controller release и owner stop — разные действия.

- 2 ноября, B1: private exact Error → durable completion → operation context/contract/target
  сохраняет finite rejected code без выдачи evidence/grants. pending/UNKNOWN/fault
  остаются uncertain; Broker/receiver semantics/Titles не изменены. Selector audit
  сохранил24checks. До B2 edits все24 evidence keys исходного среза и frozen copy
  совпали;12 complete batches переиспользованы, незавершённый batch не засчитан
  и выполнен заново. Остальные проверки завершены на том же frozen source.

- 2 ноября: прекращение старого заказа не требует разгадать все старые исходы.
  Для новой работы требуется доказать прекращение возможности старого исполнения;
  UNKNOWN остаётся историческим фактом. Ручное удаление markers/journals не является
  механизмом сброса. При необходимости restart AE разрешён как часть решения.
- 2 ноября: прежние ограничения AEP/save/restart/raw защищали узкий read-only scope,
  но пользователь расширил разрешения для отладки. Не вводить повторные общие
  согласования уже разрешённых действий. Точные targets, один controller,
  no-replay, защита исходников и технические runtime gates сохраняются.
- Работа с закрытыми AEP требует отдельной offline capability и файлового
  ресурса; это не CEP fallback и не live authority. Первое возможное применение —
  новый candidate-файл с отдельными structural/native/visual результатами.
- Панель не считать зависимостью от Codex. Установщик пока Codex-specific;
  смена AI-клиента не требует сама по себе замены CEP. Опциональный UI остаётся
  архитектурной рекомендацией, а два production transport не добавляются в B1.
- Прежнее требование завершить Titles для приёмки обычного подключения снято
  прямым поручением пользователя. Полнота native mutation proof остаётся отдельной.
- Не принимать broad framework migration лишь по README или обещанию retry.
  Восстановление транспорта не доказывает исход AE-команды.
- Кандидат B1: `attachment-owner.js` маскирует ошибки invoke как
  owner_outcome_uncertain. Нужна явная классификация доверенного terminal read
  outcome; чистые facts сами по себе не являются достаточным proof.
- Дополнительное source evidence: `runtime/stdio-entry.js` facade.disconnect
  не отключает peer. Ранняя сводка чата по Broker.disconnect была неполной;
  B2 должен описывать фактическую установленную композицию, не только public names.
- После Argon: B1 отдельно от reconnect/telemetry. Матрица служит учёту evidence,
  не обязательному новому прогону всех сценариев. Финальная селекция определяется
  изменённой closure, не произвольным числом4. Нельзя переписать journal в owner,
  довериться public terminal flag или автоматически восстановить grant по PID/path.
- Comparison: готовые компоненты реально полезны; сейчас узкий B1, Kumo transport
  остаётся альтернативой для отдельного ограниченного сравнения. Migration не
  отвергается лишь из-за уже потраченных усилий, но вместе с B1 не начинается.

## Validation

- B6 setup raw/own отдельно от typed: fixture save1, native style/project reads2;
  fixed native probe и verified standalone readopt/enable PASS. Истории15+1 и
  bindings/AEP exact across re-adoption; source suites без production diff не повторялись.

- Configured B4: one native read/one malformed-contract refusal; journals9→11,
  только begin/complete этой inspection. Native CIM PID/birth и один3457
  совпадают со status; защищённые hashes и own AEP прежние. Mutation/reset/save/
  AE restart/install/config changes0. Source suites после doc-only diff не повторялись.

- B5:14fresh cases PASS в одном selected start-over-channel check; evidence key
  повторно совпал после выполнения. Node syntax/55boundaries PASS, production
  delta0. Первый FAIL тестовой JSON/VM boundary исправлен и не включён в PASS.
  Full release/deferred lifecycle-simulation/installed native не проверялись.

- Scope clarification: только read-only hashes/native process/listener snapshot.
  AEP, bindings, protected history9events и archives exact; helper finished,
  одна termination app-server до уточнения, последующих действий0. Source/tests/
  install/reset/AE commands не выполнялись. Новый configured proof не заявлен.

- B4 installed: official package/enable и exact runtime/CEP verification,
  native PID/birth/один3457, negative pre-submit7events unchanged и свежий native
  saved empty project read9events/release PASS. AEP/origins/adoption/session/
  baseline/ledger/архивы сохранены. Configured cached client refusal зафиксирован
  честно; source tests после doc-only изменений не повторяются.

- B4 source:13selected checks/214fresh cases/55boundaries, node --check/diff-check
  PASS. Original failing regression включал настоящий TEMP stdio/IPC. Исправлен
  один test-only empty-poll timeout; весь отменённый batch22cases выполнен заново.
  Accepted prior batches переиспользованы с exact current keys, после всех runs
  closure keys проверены ещё раз. [Evidence](../docs/evidence/core-base-b4-source-20261103.json).
  Build/verify/dry-run нового80/98file пакета PASS; installed proof ещё не выполнен.

- Configured B3 после restart PASS: first status327faaac…/native PID-birth/
  один listener, автоматический peer connect, stale-session refusal и свежий
  exact-contract saved empty project read/release.5settled events, prefix3 exact,
 14/52event archives и8reset records exact; descriptor/client/project config/
  origins/adoption/absent ledger/AEP прежние. Неуспешные pre-submit вызовы не
  добавили command events. [Evidence](../docs/evidence/core-base-b3-configured-20261103.json).
  Production source/package unchanged; source suites не повторялись. JSON,
  ссылки новых записей и git diff --check проверены перед milestone commit.

- Native UNKNOWN reset PASS в ограниченном read-only сценарии:
  [evidence](../docs/evidence/core-base-b3-unknown-reset-20261103.json).
  Exact native death, two immutable archives,8 signed reset records, installed
  protected bytes/AEP, current3events и native direct baseline/release проверены.
  Delivery/late-callback wire unobserved, mutation recovery/full release/portability
  open. Configured probe oldclient owner_unavailable→Transport closed после одного
  exact stop; свежим configured proof это не является. Production source unchanged,
  повтор source suites не нужен; docs проходят diff-check.

- Native idle reset PASS: signed transaction records, archived52events exact,
  old Node death/sameAE9472, missing/old ack refusal и successful fresh durable
  baseline/lease release. Read UNKNOWN fault: один actual termination,14events
  preserved, diagnostic startup/no replay. Evidence
  [idle](../docs/evidence/core-base-b3-idle-reset-20261103.json) и
  [UNKNOWN fault](../docs/evidence/core-base-b3-unknown-fault-20261103.json).
  UNKNOWN reset/AE death/new baseline и configured proof ещё открыты.

- B3c installed: exact80runtime/CEP verify и original pre-ready finish/enable PASS;
  cold standard status11.960с/first call, owner15584/один3457; automatic CEP
  connect и fresh saved empty native read/lease release PASS.52settled events,
  prefix50/protected bindings/origins/adoption/ledger/AEP exact. Actual reset0,
  AE restart/mutation0, configured old2fb owner_unavailable. Native identities
  и hashes повторно read-only сверены перед фиксацией
  [evidence](../docs/evidence/core-base-b3c-installed-20261103.json).
  Source suites после doc-only изменений не повторялись.

B3b3,3ноября: 42checks/41batches/721unique cases (212fresh/509exact reuse) PASS, boundaries55/diff-check.
[Evidence](../docs/evidence/core-base-b3b3-20261103.json). Общие routing/artifact
cases посчитаны один раз; reuse только по exact current keys. Real TEMP package/
entry/HTTP/IPC/CIM Node death и actual child crash; AE inventory/project synthetic,
port logical3457/ephemeral. Native installed B3/reset0. Отдельный configured
preflight прочитал пустой AE9472, затем он сохранён как собственный test AEP и
прочитан typed read:50settled events/prefix46 exact, bindings/protected unchanged.
Package327faaac…/distribution4975c36a… verified/dry-run; actual install ещё нет.

B3b2,3ноября:18current checks/360fresh cases PASS, boundaries51/diff-check.
[Evidence](../docs/evidence/core-base-b3b2-session-20261103.json). Новые25cases
проверяют TEMP/HTTP и явно synthetic installation/lineage; остальные335cases
проверяют затронутые existing component/integration closures. Actual package
rotation новых session records и installed B3 ещё не проверены.

B3b1,3ноября:10current checks/264fresh cases PASS, boundaries50/diff-check.
[Evidence](../docs/evidence/core-base-b3b1-channel-20261103.json). Реальные TEMP
HTTP/IPC/Node и VM native fixtures; installed reset/install0. Initial
disposition_fixed_asset оказался изменяемой old-package fixture; exact legacy
bytes восстановлены в test data. Неуспешный/прерванный прогон в PASS не включён.

B3a4,3ноября:7current checks/140fresh cases PASS, boundaries50/diff-check.
[Evidence](../docs/evidence/core-base-b3a4-20261103.json). Реальная TEMP filesystem,
loopback/уникальный named IPC, synthetic native observations/логический3457.
Проверены11crash prefixes, partial archive collisions, чужой inode/alias,
historical repeat без обращения к новой работе. Installed reset/install0;
production delivery/startup/session/baseline/UI ещё не входят в proof.

F2 host origin,3ноября:5current selected checks/115fresh cases PASS,
boundaries48/diff-check. [Evidence](../docs/evidence/core-base-b3-host-origin-20261103.json).
Production reset/install/AE mutation0; архивные drafts не импортируются runtime.

B3a3,3ноября:6current selected checks/118cases PASS, boundaries48/diff-check.
[Source evidence](../docs/evidence/core-base-b3a3-barrier-20261103.json).
Native data/логический3457 в этом component suite синтетические; настоящий
native backend отдельно проверен B3a1. Installed package не обновлялся.
[Configured idle evidence](../docs/evidence/core-base-configured-idle-20261103.json):
первый status после≥3460.720с, same boot, один реальный listener3457/owner24160,
history46events и protected bindings unchanged. Это status/file proof, без
нового AE target observation, B3 reset или mutation recovery acceptance.

B3a2:5current selected checks/106fresh cases PASS; source closures проверены
до/после прогона exact evidence keys. Boundaries47/diff-check PASS.
[Evidence](../docs/evidence/core-base-b3a2-20261102.json). Synthetic verifier/
lifecycle/inventory только в test loader; real TEMP filesystem. Installed package
не обновлялся; новых live/reset/install0. Последнее configured наблюдение
AE9472/receiver46events остаётся историческим checkpoint, не новым preflight.

B3a1:19history cases и10process cases, включая actual Windows inventory/self-PID,
PASS. Final selected closure6checks/118cases:103fresh и15exact unchanged reuse;
evidence keys перепроверены до/после fresh batches. Boundaries46 и diff-check PASS.
[Evidence](../docs/evidence/core-base-b3a1-20261102.json). Никаких reset/AE/save/
mutation/install; installed package2fb5aebe прежний.3existing maintenance/component
closures перепроверены после финального history fix; full release не запускался.

После restart2ноября: configured status/connect/contract/read/release PASS,
46receiver events и точные prefix44/36, descriptor/client/config/origins/adoption/
ledger unchanged. Native PID/birth и один listener3457 проверены read-only.
[Evidence](../docs/evidence/core-base-configured-20261102.json).
Ниже сохранена история проверок до restart; прежний blocker снят.

Получение review2ноября: read-back raw bytes/SHA и исходных request/bundle/manifest
PASS,7current source hashes совпали с reviewed snapshot. Все5ответов/финальная
секция получены; typo hash owner-maintenance.js в raw отмечен без исправления.
Изменены review records/контракт/continuation docs; новых runtime/tests/AE/install0.
Fresh configured core_status всё ещё owner_unavailable; требуется restart Codex.

Последний checkpoint2ноября: installed2fb5aebe, owner19892/boot3c61188f…,
один3457/peer connected, lease released/idle, pending/UNKNOWN/fault0.
AE9472/26.3x87/пустой unsaved project. Четыре native direct inspection commands
дали8новых событий;44events/prefix36 exact. Origins/adoption/ledger unchanged,
mutation/save0. Standard known rejection и read-after-rejection PASS;
ожидание96.622с и reconnect без Connect подтверждены GUI и свежим typed read.
Configured2fb5aebe, B3, mutation recovery, full release/portability не доказаны.

Configured core_status2ноября: installedbe9afe99, owner33380/boot8f70f0f6… ready,
pending/UNKNOWN/fault0, peer disconnected. Это fresh observation до обновления;
AE/CEP connect/reset/save/mutation и installed update в текущем блоке не было.
B3 пакет COMPLETE:4payload files/7source excerpt sets, полный content scan и
read-back SHA-256 PASS. Выбранный внешний файл — только bundle.md.

B2,2ноября: node --check, один selected panel-reconnect batch69/69PASS и
git diff --check. Проверены late Core, idle outage, unload и latch во время
background wait, сохранены strict refusal/no-replay cases.
[Evidence](../docs/evidence/core-base-b2-20261102.json). Это offline VM/TEMP HTTP;
installedbe9afe99 не менялся. Затронутые deferred integration closures не
объявляются текущими PASS; следующий инженерный шаг — B3 и installed матрица.

B1,2ноября:24selected batches/473cases PASS, boundaries44PASS и git diff --check.
Production owner → IPC → stdio в TEMP установке передаёт четыре finite read
rejections; следующее чтение успешно. Проверены one-shot/forgery/lease expiry
и pending/unresolved/fault отказ. [Постоянное evidence](../docs/evidence/core-base-b1-20261102.json).
Installedbe9afe99 не менялся; это source/temp proof, без live reset/mutation,
full release и two-machine portability. Следующий шаг по плану — B2.

2 ноября: документальная редакция требований и промпта, без реализации B3.
Сверены reset_task/reconcile_task в core4/core/broker.js и owner admission в
core4/runtime/attachment-owner.js. Проверки — local links и git diff --check;
runtime/tests/install/AE restart/save/сброс не выполнялись.

Дополнение о переносимости: только официальные web-источники и локальные
source/docs; новые tests/live/install/Argon sends0. Совместимость с другими
AI-клиентами не объявлена фактически проверенной.

План и inventory: только чтение исходников/исторических evidence. Tests и live
AE/MCP/CEP действия не выполнялись; текущая runtime authority не устанавливалась.
Пакеты Argon: 6484 и 6301 bytes, очищенные summaries, exact copy/hash и manifest
проверены. Python builder не запустился (в среде только Windows alias); выполнены
Node built-in copy/hash и content scan, без установки Python/зависимостей.
Это подготовка research, не техническая приёмка нового runtime.
Source brief проверил direct project-inspection путь без Broker/Titles changes.
Один штатный selectChecks без --run; broad suites и установленный runtime не
запускались. Документальный milestone B0 — commit `e467ca2`; после него только
brief/plan, без production edits. Root проверил local links, response/payload
hashes и git diff --check; чужая .codex-attachments сохранена.
