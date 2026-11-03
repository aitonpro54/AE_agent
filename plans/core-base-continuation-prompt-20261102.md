# Промпт продолжения базы Core — 2 ноября 2026

**Release-manifest, 3 ноября — последнее поручение:** пользователь попросил
актуальный состав необходимых проверок/reuse/remaining с сохранением паузы
Titles/Slideshow. [Manifest подготовлен](core-release-manifest-20261103.md):
71 Core checks, 31 exact-key + 2 byte-command-bound reuse, 38 открытых;
две dedicated Titles held, 36 открытых без этого hold. Shared Core с Titles
dependencies не исключается. JSON содержит точные keys/commands/evidence,
29 будущих batch candidates и отдельные package/native/portability gates.
Автозапуска нет, source tests и live операции не выполнялись;
`releaseCertified=false`. Продолжение начинается со сверки fingerprint и
выбора адресного scope, а не с повторения всей B1–B7 или settled transactions.

**Сверка остаточной приёмки,3ноября — последнее поручение:** пользователь
поручил сверить оставшиеся пробелы базы и выделить необходимые проверки.
[Реестр решений](core-base-remaining-acceptance-20261103.md): все 15 ключей B6
совпали, 27 известных deferred integration closures (19 B6 + 8 B3) открыты без
нового PASS; ограниченная база B1–B7 сохраняет принятие. Native прерывание
finisher не обязательно для уже принятой базы; перед full release нужен
актуальный manifest, поскольку команды 55 из 71 проверок карты имеют entry files
вне существующей `check:release`. Новые live действия и full release не входят
в эту сверку.
Titles/Slideshow остаются на паузе; maintenance завершён. Новые PID/session/
authority здесь не подтверждаются, исторические IDs не повторять.

**Maintenance,3ноября — последнее поручение завершено:** пользователь явно выбрал
возврат к MCP/Codex maintenance. Свежие configured status/diagnostics/effective
config PASS; same Core27100/bootb76c6e87…, app-server16688 прежний. Current7/1,
143protected files+bindings/AEP и UNKNOWN26/20 сохранены exact. Подтверждённого
дефекта нет, restart/config/auth/AE commands0; deferred refresh закрыт как
утративший необходимость. [Результат и границы](core-codex-mcp-maintenance-20261103.md).
Ожидающих maintenance действий нет; новая пауза maintenance не вводилась.
Titles/Slideshow остаются на паузе. Записи ниже сохраняют прежние состояния;
актуальные runtime pins всегда требуют свежей проверки.

**B7,3ноября — актуальная база:** configuredcdf7338f… принят обычным текущим MCP,
без service/AE restart/config. Native saved project-inspection/release1 PASS;
owner27100/birth639293110869903720/bootb76c6e87… и AE30024 прежние, один3457,
CEP connected, sessionce977de2… baselineRequired=false, current7/1settled,
pending/UNKNOWN/fault0.143protected files+bindings/AEP unchanged, old UNKNOWN26/20
exact archived. [Сводная матрица](../docs/core-base-b7-configured-matrix-20261103.md).
B1–B7 bounded base принята; новых действий этой матрицы не требуется. Runtime pins
не являются future authority. Full release/portability и предметные продукты —
отдельные scopes; MCP/Codex maintenance и Titles/Slideshow автоматически не возобновлять.

**B6 native завершён,3ноября:** installedcdf7338f…; exact owner fault1,
original mutation Yes1, поздний callback отказ, UNKNOWN26/20 archived exact.
Own saved/reopened AEPb6eaea7e…/comp1/layer13/BASE_B read-back PASS.
Reset2fecd11c… завершён; sessionce977de2… baseline/release и old session denial PASS.
Fresh host readoptcd5bb102… завершён для AE30024. Последний standard owner27100/
birth639293110869903720/bootb76c6e87…, один3457, CEP connected, current5/1settled,
pending/UNKNOWN/fault0. Все settled IDs не повторять; live pins заново проверять.
[Полный checkpoint](../docs/core-base-b6-native-recovery-20261103.md).
Новых B6 действий не требуется; configured/full release/portability остаются
открытыми, MCP/Codex maintenance и Titles/Slideshow не возобновлять автоматически.
Следующие записи — provenance прежних checkpoints.

**B6 installed,3ноября:** approved packagecdf7338f… installed/enabled.
Не повторять settled stopf41dbe21…/update806719be…. Standard owner15616/bootbed482de…
и sameAE21960 наблюдались ready; native inspection BASE_A PASS. Prepared
task0558d0cf…/proposalc477c55e… ещё runAttempts0, root client поддерживает lease.
Далее fresh dry-run/run и native scenario по [focused плану](core-base-delivery-recovery-20261103.md).
MCP/Codex service refresh/restarts остаются отложенными; pins не выдаются за future authority.

**B6 source checkpoint,3ноября:** 15checks/330unique cases (87fresh/243exact current-key reuse)/55boundaries PASS.
Исправлен подтверждённый PowerShell startup отказ в очищенном env owner, runtime
delta1file; четыре named test budgets скорректированы после timeout, assertions
сохранены. Candidatecdf7338f… built/verified/dry-run, actual install0. Штатная
поставка меняет одну args-line Core MCP entry и требует узкого уточнения scope
из-за действующей паузы MCP/Codex config. Native delivery/late callback/mutation
recovery остаются открытыми; старый pre-submit run не повторять.
[Точный срез и evidence](../docs/core-base-b6-windows-probe-20261103.md).

## Историческое состояние — 3 ноября, до B6/B7 и возврата к maintenance

Единственный рабочий корень — `C:/Users/Ant/Documents/Codex/AE_agent_core`.
B1–B3 ограниченно приняты; installed B4 package21a884fa…/distribution41d4812c…
имеет configured native proof без restart/config; MCP/Codex maintenance по-прежнему
отложен пользователем, общее «продолжай» не разрешает его возобновить. Текущие PID,
chat UUID, live authority и readiness нельзя переносить из записей ниже.

Пользователь подтвердил активный следующий scope: доводка базы — доставка,
поздние ответы и recovery. Titles/Slideshow не возобновлять. B5 составной TEMP
HTTP/VM check завершён14fresh cases/55boundaries PASS, runtime/CEP unchanged;
это не native proof. [Scope и следующий шаг](../docs/core-base-b5-channel-composition-20261103.md),
[точный checkpoint](core-base-installed-checkpoint-20261102.md).

Дальше — [native B6](core-base-delivery-recovery-20261103.md): own fixture
comp1/layer13/BASE_A/full style proof и fresh re-adoption b25b5fef… готовы;
не повторять setup или readopt. Новый owner22188/auto peer/истории15+1 settled
наблюдались в checkpoint, не выдаются за future authority. Root выполняет необходимые
панель/AE UI-действия сам, сохраняя technical gates и пользовательскую работу.
Не повторять settled reset/stop/update/enable; историю и markers не очищать.

## История актуализаций B3b3 — не текущая последовательность действий

Актуально: UNKNOWN reset69facd01… завершён root через существующий panel protocol;
session8fe8b332…/owner31404/newAE21960. Old AE9472 и historical26308 exact gone,
14unknown events и52event archive exact preserved, new3event baseline/release PASS.
Ни install, ни settled9b128005/69facd01 не повторять. Пользователь прямо запретил
привлекать его к кнопкам: необходимые UI/API/restart действия выполнять самому.
Остался configured MCP: cached client5264 остановлен один раз, auto reconnect нет,
Transport closed. Готовится scoped app-server23604 restart с возвратом в этот же
runtime-confirmed chat01a19c6c…; текущие evidence/план фиксируются до actual stop.
После restart — fresh configured status327faaac/session8fe8b332, deny old session
aeddb9ee, explicit current acquire/connect/contract/native read/release; затем
последующие задачи плана без нового чата или запроса «продолжать?».
Точные scopes — checkpoint. Delivery/late callback/mutation recovery не заявлены.

3ноября native idle reset9b128005… completed, old15584/new30888, sessionaeddb9ee…,
52events exact archived, sameAE9472 без restart, explicit ack/native baseline PASS.
Затем один retained-handle Node fault породил native read UNKNOWN: inspect-facaa741…,
14events/SHA638fbd1b…/last begin без terminal, recovered diagnostic owner19452.
Delivery не наблюдалась. Отправлен async запрос пользователю отдельно нажать
«Начать заново»/подтвердить для UNKNOWN scenario. После ответа только status и
same-intent continuation, затем required exact old AE death/archive/new baseline.
Ниже — pre-idle checkpoint установки; актуальные IDs/limits выше и в checkpoint.

B1/B2 installed/configured package2fb5aebe принят. B3a1–a4/b1/b2 и production
B3b3 source завершены; 42checks/41batches/721unique cases (212fresh/509exact reuse) PASS, boundaries55.
[Evidence](../docs/evidence/core-base-b3b3-20261103.json). Owner-v4 candidate
327faaac…/distribution4975c36a… (80runtime/98bundle) verified, dry-run PASS,
actual install завершён: stop49b423d9…/updateaf65ee78…/explicit enable settled,
original interrupted update восстановлен без повторного apply. New standard
owner15584/birth639292661152752430/boot16749b0f… ready, один3457; CEP automatic
connected, direct native read saved empty AEP PASS,52settled/prefix50 exact.
Native reset пока0: computer-use отклоняет CEP child click; пользователю отправлен
запрос нажать «Начать заново»/подтвердить. После ответа сначала status/исход,
не повторять отправку. Далее idle/UNKNOWN reset с сохранением истории и fresh
session/baseline. Configured MCP old2fb/owner_unavailable требует Restart MCP;
установку/settled49b/af65 не повторять. Точные актуальные pins — checkpoint.

Fresh preflight: owner24160/birth639292395293906370, same bootc9a04982…,
AE9472/birth639292254253597850. Собственный пустой AEP сохранён как
snapshots/core-base-b3-native-20261103.aep (8367bytes/SHA8299fd9f…). Typed read
подтвердил saved path;50settled receiver events/SHA94f31e18…/prefix46 exact,
protected bindings/origins/adoption/ledger unchanged. Это не future authority.

Один Argon plan review получен и локально разобран; новых sends/reviews нет.
L0 feasibility уже завершён, не повторять. Продолжать следующие этапы без
вопроса «продолжать?», не создавать новый чат; Titles/Slideshow остаются на паузе
до приёмки базы. Точные settled IDs и исторические пределы —
[checkpoint](core-base-installed-checkpoint-20261102.md).

## Исходная постановка

Заменяет промпт из чата `01a19bda-e7a1-7f91-836b-14e3ac611ba6`,
turn `01a19c42-41ff-73f1-a836-2c108b01dfc6`.
Добавлены B3 «Начать заново» и прямые разрешения пользователя на необходимую
отладку, включая сохранение и перезапуск AE. Это постановка разработки;
сам сброс и реализация пока не выполнены. Новый чат автоматически не создаётся.

Скопировать в чат продолжения:

```text
Продолжи доводку локальной базы AE Agent Core в:
C:\Users\Ant\Documents\Codex\AE_agent_core

Цель — закончить обычное подключение, восстановление и диагностику Core/CEP,
а также реализовать штатный режим «Начать заново». Сохраняем панель и текущую
архитектуру. Последовательность: B1 → B2 → B3 → адресная installed-проверка.

Сначала прочитай действующий AGENTS.md и только необходимые документы:
- plans/core-base-reliability-20261101.md
- docs/core-base-b1-brief-20261101.md
- текущий раздел plans/core-cep-checkpoint-installed-20261031.md

Историю других этапов открывай по конкретной необходимости. Не перечитывай
большие планы и evidence целиком. Проверь HEAD и рабочее дерево; не предполагай,
что после подготовки этого промпта они остались прежними.

Исходное состояние:
- B0 research завершён; B1 спроектирован, но ещё не реализован.
- B2 и конечная матрица базы не закрыты; B3 добавлен как требование без реализации.
- Последний установленный checkpoint — package be9afe99; configured MCP
  и project-inspection работали.
- После длительного отсутствия Core панель завершает ожидание
  с runtime_wait_expired и требует Connect.
- Это исторические сведения, а не свежий preflight или runtime authority.

1. B1 — корректная передача известного завершённого read rejection.
Следуй source brief. Подтверждённый путь: facade.inspect → peer.inspect;
durable completion уже записан, но owner теряет классификацию ошибки.
Предварительный scope — четыре production-файла и три test-файла из brief.
Изменять Broker/receiver/Titles ради B1 не требуется. Сохрани различие между
доказанным завершённым отказом и неизвестным исходом: публичный флаг или
произвольное исключение не являются доказательством completion.

2. B2 — обычные циклы панели и Core.
Доведи ожидание runtime и восстановление связи, понятные состояния и следующие
действия. Раздели detach клиента, release controller и физический канал общего
owner: установленная facade.disconnect сейчас физически peer не отключает.
Исправляй подтверждённые проблемы по конечной матрице плана. Дополнительная
подсистема восстановления допустима только при конкретном необходимом пробеле.

3. B3 — обязательный штатный режим «Начать заново».
Пользователь должен иметь возможность отказаться от прежних планов и продолжить
обычную работу, даже если исход старых команд окончательно выяснить невозможно.
Реализуй механизм в Core и доступную команду в панели; кнопки без механизма мало.

Ожидаемое поведение:
- По явному действию пользователя прекратить старые планы и неотправленную очередь.
- Перед допуском новой работы исключить позднее исполнение старой команды.
  Если надёжно сделать это в живом AE нельзя, разрешён необходимый restart AE
  с защитой работы. Для каждого сброса restart сам по себе не обязателен.
- Сохранить прежние UNKNOWN в истории как оставленные с неизвестным исходом.
  Не требовать восстановить каждый старый результат и не объявлять их успешными,
  неисполненными или отменёнными без доказательств. Сброс не откатывает уже
  внесённые изменения: текущее состояние AE становится новой исходной точкой.
- После подтверждённого прекращения старого исполнения штатно завершить действие
  относящихся к нему блокировок, заново прочитать AE и открыть новый рабочий сеанс.
- Старые ответы, клиенты и сохранённые задания не должны исполняться повторно,
  возобновлять прежний план или менять новый сеанс. Прерванный сброс должен
  завершаться штатно, без частичной разблокировки и replay.
- Показывать понятный итог: новая работа доступна либо конкретное необходимое
  действие. Пользователь не должен вручную чистить locks/journals/credentials.

Это новый разрешённый engineering scope. reset_task сейчас отменяет только
queued-unsent; reconcile_task ищет original completion. Они не заменяют B3.
До production write кратко зафиксируй минимальный контракт, файлы и проверки.
Реализуй в существующей архитектуре, без универсального lifecycle framework.
Проверь старую очередь, UNKNOWN с поздним результатом и прерывание самого сброса.
Отдельно подтверди путь через установленный Core/панель на тестовом AEP.

4. Установленная проверка.
После релевантных source-проверок выполни необходимые package/install действия
штатным способом. Для обычной базы используй status и project-inspection;
для B3 — отдельный сценарий прекращения старой работы и начала новой.
Проверяй изменившиеся сценарии, historical evidence используй для неизменных частей.

Разрешения на разработку и отладку, прямо уточнённые пользователем 2 ноября:
- Разрешены необходимые создание/открытие/изменение/сохранение тестовых AEP,
  сохранение текущей работы для её защиты, restart AE/CEP/Core, reload панели
  и штатное обновление собственной установки. Не спрашивай повторно общее
  разрешение на эти действия и не останавливайся лишь из-за прежнего запрета.
- При отсутствии подходящей typed операции допустимы адресные диагностические
  JSX через поддержанный путь с техническими gates. Собственные временные
  тестовые данные можно удалять/пересоздавать.
- Пользовательские исходники и несохранённую работу защищай копией/сохранением;
  не уничтожай их молча. Используй тестовые цели, когда этого достаточно.
- Точные цели, один live-контроллер, действующие технические подтверждения,
  целостность журналов и запрет повторного исполнения сохраняются. Сброс B3
  должен штатно завершать старые ограничения, а не обходить их удалением файлов.
- Если конкретного технического gate не хватает, сначала подготовь всё доступное,
  затем назови именно недостающее действие; не запрашивай заново весь scope.

Границы результата:
- Titles/Slideshow остаются на паузе; их дефекты не блокируют приёмку подключения.
- Беспанельный transport, SDK, общий detector смены проекта, новые AI-клиенты,
  модели и offline AEP backend в этот чат не добавляются.
- Root — единственный live/CEP/UI-контроллер. Новый чат не наследует authority.
- Settled transactions не повторять. Старые команды не replay. Ручная очистка
  markers/journals не заменяет штатный B3. Новые отправки Argon не разрешены.

Критерий результата:
Обычный запуск, простой и восстановление связи не требуют ручных правок config,
удаления locks, переиздания credentials или одноразовых скриптов. Панель сама
восстанавливает связь в допустимых ситуациях и объясняет прочие состояния.
По «Начать заново» прежняя работа больше не вмешивается, исторические неизвестные
исходы сохранены, а новая работа доступна от свежего состояния AE.

Контроль стоимости:
- Перед каждым срезом кратко назови результат, файлы и необходимые проверки.
- Для B1 уже выбраны 24 checks/batches. Сначала адресно проверь причины зависимости
  по brief; не удаляй проверки ради числа и не перестраивай архитектуру ради selector.
- Выбери проверки по changed paths, зафиксируй срез и выполни релевантный набор.
  Повторяй только после изменения, сбоя или конкретного непокрытого риска.
- Broad/full-release и Titles suites не запускай автоматически. Не добавляй
  внешние ревью или субагентов автоматически. Отчитывайся закрытыми сценариями,
  а не количеством тестов. Обновления делай краткими.

После завершённых срезов обновляй Progress / Decision Log / Validation плана
и делай небольшие reviewable commits, сохраняя чужие изменения. Продолжай
B1 → B2 → B3 → installed-проверка без вопроса «продолжать?» между этапами.

Финальный отчёт: что работает в установленной базе, что ещё требует действия
пользователя, оставшиеся ограничения и commits. Read-only proof не означает
приёмку recovery mutation, полной готовности выпуска или двухмашинной переносимости.

Начни с текущего состояния и границ B1, затем переходи к реализации.
```
