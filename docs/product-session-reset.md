# Штатный сброс product-сессии bridge

## Назначение

`reset_owned_runtime_product_session` начинает новую product-сессию после
нештатного исчезновения зарегистрированного daemon. Инструмент доступен локально
через MCP adapter даже при отсутствии HTTP bridge. Принимает пустой объект;
вызывающий не задаёт PID, executable, generation, paths или raw script.

Контракт и исправленный source прошли внутреннее Sol 6.1 Ultra review по прямому
выбору пользователя. Инструмент проверен изолированными офлайн-сценариями.
Состояния `reset_partial_readback_only`, `reset_pending_preflight` и `reset_active`
читаются из durable записей. Поле `daemonLiveness:not_observed` означает, что
такой status сам по себе не является живым чтением процесса или проекта.
Его консервативное `writeAdmissionReleased:false` не описывает фактический
admission работающего daemon; тот отдельно проверяет activation и обычные gates.

## Что означает успешный сброс

Новая generation имеет собственную registration и подписанный session anchor.
Прежняя control/edit ownership прекращается явным operator disposition только
для новой epoch. Предыдущие outcome остаются `unknown_preserved`,
`oldExitProven:false`, `replayAllowed:false`.

Старые edit records, checkpoints, receipts, idempotency, output reservations,
AME jobs/batches и ограничения конкретных ресурсов сохраняются. Новый сеанс
не наследует старые команды, proposals и execution capabilities. Поздний
callback прежней epoch не получает полномочий новой сессии.

Панель сохраняет UNKNOWN receipts и их tombstones. Подтверждённый reset
покрывает точные старые receipt IDs и их исходные хеши отдельным disposition для новой epoch:
они перестают быть общей блокировкой availability/connect, но не становятся
успешными и не могут исполняться повторно. Ограничения конкретных outputs,
jobs и lifecycle resources сохраняются независимо от этой классификации.

Reset требует отдельной операторской авторизации. Обычная lifecycle policy
не подразумевает права abandon прежнюю control ownership.

## Последовательность

1. Взять общий OS controller mutex; прочитать и связать текущую registration.
2. Строго установить отсутствие старого exact process и свободный fixed endpoint.
   Alive, PID reuse, access denied, чужой listener или unknown приводят к отказу.
3. Создать durable once intent по прежней registration/current hash. Потеря ACK,
   crash или смена source не разрешают второй launch этого reset.
4. Запустить daemon штатным reserved launcher и проверить новую registration.
   Сохранить reset anchor, атомарно опубликовать current после сравнения baseline.
5. Сохранять execution admission закрытым, пока панель не завершила смену delivery
   epoch и physical in-flight tracker не подтвердил отсутствие её старого evalScript.
6. Выполнить узкое свежее чтение project identity/path/dirty/revision. Сохранить
   activation receipt, после которого действуют обычные inspection/proposal/
   dry-run/confirmation gates. Сохранённого AEP и dirty=false reset не требует.

До завершения preflight результат не называется clean. Неопределённый частичный
reset допускает read-back, но не новый launch. Обычная дальнейшая shutdown/
restart succession использует настоящие held-handle exit receipts внутри новой
сессии; reset не подменяет эти доказательства.

### Штатное восстановление failed start

`recover-failed-start` выбирает исходный сбой из private current pointer,
consumed reset key, подписанных intent/binding и native candidate. Caller
не передаёт selectors. Recovery-key связан с исходной операцией и её
неизменными pins, поэтому новая версия source не разрешает повторный launch.

После потери ответа читается тот же журнал. Следующий failed recovery leaf
допускается только после отдельной проверки отсутствия обоих exact процессов,
свободного endpoint и прежних policy/lifecycle/edit bindings под controller mutex.
Fork, live/registered candidate, неизвестная identity и частичный запуск
без доказанного исхода закрывают новый launch. Оригинальные UNKNOWN и once keys
сохраняются; очередь AME к восстановлению не относится.

Свежий локальный CLI после обновления source:

```powershell
node mcp-server/owned-runtime-product-session-reset.js failed-start-status
node mcp-server/owned-runtime-product-session-reset.js recover-failed-start
```

Ниже сохранена история первоначального закрытого восстановления; его exact
UUID используются только для совместимости с прежними recovery records.

### История failed start 20.10

Для reset `67226724…` / failed candidate `889f0a88…` добавлен отдельный
`recover-failed-start`, строго без аргументов. Он не повторяет обычный reset:
старые once key, intent и UNKNOWN сохраняются, recovery использует свой журнал
и один ключ, не зависящий от новой версии source. `failed-start-status` читает
его результат без запуска. Произвольные PID/generation/paths не принимаются.

Существующая reset policy, exact signed intent/candidate и immutable raw hashes
обязательны. Pointer должен оставаться на прежней `deda8ab3…`; у failed child
не допускаются registration, anchor, activation и успешный result. Controller
mutex удерживается при обеих native absence проверках: прежний daemon и failed
child должны дать ERROR87+endpointFree, повторно перед launch. Остальные исходы
закрывают запуск. Новый обычный reset intent/generation использует штатные
registration→anchor→CAS и physical project preflight; AME jobs не меняются.
Любая частичная recovery допускает только read-back, без второго child.

Причина этого failed start — старый MCP process вычислил reservation из
закэшированного списка92 модулей и свежих bytes; новый daemon вычислил99 и
отклонил source binding до listener. Это локализовано отдельными read-only
проверками, а не выведено из одного кода child-exited. Текущий код фиксирует
hash собственного `review-evidence.js` при module load и отказывает в новом
вычислении census после изменения этого файла. Guard обнаруживает устаревший
каталог; он не является attestation реально загруженного кода.

Lifecycle после изменения source catalog выполнять из свежего локального CLI,
а не из ранее загруженного MCP collector. Восстановление этого exact случая:
`node mcp-server/owned-runtime-product-session-reset.js recover-failed-start`;
чтение — та же команда с `failed-start-status`. После старта всё равно нужны
Connected/idle и настоящий native project read. Forensic census в ignored runtime
остаётся диагностикой и не даёт authority на запуск.

Live 20.10: fresh CLI recovery9ed078cc… создал generation
`1fc98c2e-16c5-4d94-894f-e5075013d483`, daemon PID17752/sourcea6555f60… .
Старт занял4.2s, затем обычный preflight активирован: Connected/idle,
autonomy active, native source unchanged/clean/revision12968816. Новый async
STATUS повторно подтвердил два существующих AME jobs queued, новых addDL/START0.
Оригинальные beb3141d…/67226724… UNKNOWN/keys сохранены. Recovery status читает
сохранённую квитанцию `failed_start_recovered_pending_preflight`; фактическое
`reset_active` подтверждается отдельным current runtime status/activation,
а живое подключение — bridge/project reads. Evidence находится в ignored
`.codex-runtime/title-comps-20261020/`; code/recovery63/supervisor91/async6,
syntax/rules/diff и independent High review PASS.

## Границы

Инструмент поддерживает отсутствующий зарегистрированный product daemon.
Initial/retained deployment и реально незавершённый lifecycle transition в v1
не сбрасываются. Сброс не останавливает процессы, не чистит AE/AME очереди,
не запускает рендер, не сохраняет/открывает проекты и не восстанавливает jobs.

Смена control epoch не доказывает завершение прежних внешних AE/AME effects.
Запреты повторной доставки и спорные output/resource reservations остаются
действующими. Reset не применяется автоматически после отказа ensure.

## Операторский доступ

Новая private policy `product-session-reset-policy.json` отделена от обычной
lifecycle policy. Её создаёт оператор по явному поручению пользователя:

```powershell
node mcp-server/owned-runtime-product-session-reset.js authorize 'Ссылка на явное поручение штатного сброса'
```

Затем доступен именованный MCP tool с аргументами `{}`. Если каталог уже
запущенного MCP adapter ещё не обновлён, тот же reducer вызывается локально:

```powershell
node mcp-server/owned-runtime-product-session-reset.js reset
node mcp-server/owned-runtime-product-session-reset.js status
```

Параметр reference описывает пользовательское поручение; он не принимает
credentials, PID или пути. Команда authorize не запускает daemon и не выполняет
reset. Вызов reset — отдельная операторская операция, требующая своего поручения.

При известном отказе read-only preflight новый challenge допускается только
после подтверждения пустого physical tracker. Повторяются лишь смена контрольной
epoch и фиксированное чтение; launch и прежние команды не повторяются. Если исход
native callback неизвестен, tracker остаётся закрытым до отдельной сверки.

### Ограниченное восстановление legacy physical latch 20.10.2026

Для уже порученного reset `f0fb9754-678c-4649-9620-d7d3471d4294`, generation
`9f2d63af-266f-4ae4-8f0f-1c8f89194ab4`, добавлен отдельный операторский helper:

```powershell
node scripts/cep-panel-reset-physical-fence.js inspect
node scripts/cep-panel-reset-physical-fence.js prepare-held-exit
node scripts/cep-panel-reset-physical-fence.js readback
node scripts/cep-panel-reset-physical-fence.js recover
node scripts/cep-panel-reset-physical-fence.js adopt-external-close
```

CLI принимает только эти команды, без PID, scripts, paths, credentials или
переопределений. Он проверяет текущий подписанный reset anchor и private policy.
Другой reset этим helper не обслуживается. Штатные gates и загруженные panel/server
sources не изменяются; reset/admission инструмент повторно не запускается.

`inspect` читает exact legacy map, текущие host/CEP identity и именованный panel
state API. `prepare-held-exit` резервирует once intent и запускает скрытый bounded
watcher. Только `held-ready` означает, что read/sync handles текущего AE и всех
обнаруженных CEP submitters удерживаются. Это ещё не завершённый физический fence.
Закрыть AE может только единственный UI-контроллер после свежей проверки пустого
Untitled без items. При save prompt — Cancel и остановка; helper не закрывает,
не сохраняет, не завершает процессы принудительно и не открывает проект.

Перед новым запуском AE `readback` обязан показать `old_contexts_exited`:
`WAIT_OBJECT_0` всех удержанных identities, exit code 0 самого helper, три пустых
глобальных census AfterFX/CEP и отсутствие прежней exact CDP page. Watcher по
умолчанию ограничен 300 секундами; timeout/unknown не разрешает повторный watcher
или подразумеваемое завершение. После запуска нового AE и фиксированной панели
`recover` проверяет новый host/tree и прежние exact bytes legacy map.

В этом reducer отдельный scoped idle predicate различает `historicalBusy` и
активную работу: fresh `bridge.connect` availability, отсутствие active action,
recovery/refresh, executing proposal и pending/inflight bridge commands.
Стандартный `nativeControlIdle` не переопределяется. Старые записи должны содержать
только `submittedAt` и предшествовать текущему host; timestamp сам по себе не
доказывает ни старое выполнение, ни завершение процесса.

Затем один фиксированный `AfterFX.exe -r` read-barrier читает
project/path/dirty/revision/rendering и возвращает nonce ack. Durable pending
сохраняется до отправки; unknown/timeout не повторяет отправку. Как у штатного
bootstrap, единственность AE до/после является условной привязкой: CLI не имеет
строгого PID targeting. Пустой несохранённый проект допустим.

После completed barrier helper сохраняет HMAC-подписанный архив исходных bytes.
Финальное сравнение, запись подписанного sidecar, замена active legacy map на
`{}` и read-back выполняются только под **собственным событием** `Debugger.paused`.
Один ACK `Debugger.pause` недостаточен; уже остановленный другим контроллером
target отклоняется без resume. Возобновляется только собственная пауза. Actor/frame,
host, исходные bytes и sidecar проверяются; drift/unknown оставляет readback-only.
Собственных произвольных `Runtime.evaluate`, host JSX через CDP и injection нет:
для state используется существующий фиксированный именованный panel API.

Исходный latch остаётся в permanent signed journal и отдельном localStorage
sidecar. Исторические panel-action receipts не очищаются. `oldOutcome` остаётся
`unknown_preserved`, original host identity неизвестна, `oldExitProven:false`,
`replayAllowed:false`; отдельное поле подтверждает выход наблюдавшихся старых
контекстов и новый barrier. Retirement только позволяет штатному reset preflight
продолжиться. Успех задачи требует последующих `reset_active`, Connected и настоящего
typed project read; helper их не присваивает.

Журнал находится в ignored `.codex-runtime/owned-runtime-maintenance/` внутри
`reset-physical-fences/<operationId>/`. Изменение source/policy/anchor останавливает
adoption. `node scripts/cep-panel-reset-physical-fence-smoke.js` проверяет только
DI protocol/fake CDP и fixed JSX VM, без live AE/CEP и native процессов.

Если прежний watcher завершился timeout, а пользователь затем самостоятельно
закрыл AE, отдельная команда `adopt-external-close` проверяет фактическое отсутствие
прежних identities. Новый запуск или закрытие AE для этой проверки не требуется.
До завершения adoption AE/CEP должны отсутствовать; старый watcher не повторяется.
Прежние `failure`, `held-ready`, UNKNOWN и их исходные bytes не изменяются.

Этот переход разрешён только для исходного frozen набора трёх source pins
(`b449b7f...` module, `853c97c...` CLI, `92ccb8f...` held helper), четырёх
существующих envelopes prepare/watcher-consumed/held-ready/failure и exact отказа
`fence_native_exit_unknown`. Отдельный HMAC `source-adoption` связывает исходные
raw hashes с текущим source; произвольные исторические версии не принимаются.
Этот receipt не доказывает отсутствие процессов и не открывает reset admission.

Query-only native helper получает expected identities исключительно из подписанного
`held-ready`, через закрытый reducer. Для каждой identity допускаются native
`OpenProcess` ERROR 87 (absent), иной точный birth FILETIME (PID reused), либо
exact identity с `WAIT_OBJECT_0`. Alive, access denied и unknown отклоняются.
Затем обязательны три пустых глобальных AE/CEP census, exit code 0 самого helper
и отсутствие старой exact CDP page. Результат отдельно сохраняется в
`external-close-intent`, `external-close-evidence`, `external-close-adopted`.
Файл `held-exit` не создаётся, прежний timeout не становится успешным.

Статус `external_close_absence_adopted` разрешает запустить новый AE/CEP и продолжить
прежний `recover`: новый host/tree должен родиться после этого receipt; fixed
barrier, собственная пауза, exact storage checks и обычная reset activation
остаются обязательными. Итог различает absence proof и held-exit proof, сохраняя
`oldOutcome:unknown_preserved`, `oldExitProven:false`, `replayAllowed:false`.
Без принятого отдельного evidence failure даёт `recorded_failure_readback_only`.

Для exact завершённого barrier nonce `d6d2e42f-c4fb-45d9-81a4-f4cef03e9ca3`,
после отказа ожидания собственной паузы и до retirement-intent, команда
`refresh-completed-barrier` принимает только предыдущие четыре source pins и
одиннадцать неизменных HMAC envelopes. Отдельный `pause-source-adoption` сохраняет
их raw hashes; отдельный nonce обновляет только доказанно завершённый read.
Pending/unknown refresh не отправляется повторно. Исходный archive неизменен,
`archive-refresh-link` связывает его со свежим completed receipt. Затем сразу
выполняется `recover` в пределах 30 секунд. В idle CEP после собственного
Debugger.pause ACK запускается один штатный named state-read; обязательны
собственный paused event, atomic named snapshot и ожидание read после own resume.
При уже существующей паузе новый read и resume не выполняются. Оба native helpers,
UNKNOWN прежней работы и обычная reset activation этим переходом не изменяются.

После завершённого refresh nonce `a15e1cd3-122c-4bb8-9554-eb54f986395b`
окончание выполняет одна закрытая команда `complete-refreshed-recovery` под одним
lock. Она принимает только exact предыдущие четыре source pins и закреплённые
raw hashes пятнадцати исторических HMAC envelopes. Command-local immutable view
проверяет их подписи, source groups и связи один раз; global/TTL cache отсутствует.
Отдельный `final-controller-adoption` сохраняет эту границу. Один distinct final
read с fixed files сразу продолжается собственной паузой и retirement; unknown
pending не отправляется повторно. Authority и исходные raw hashes проверяются
заново перед SEND и retirement-intent, а отсутствие retirement проверяется свежо.
Deadline и возраст completed receipt проверяются после последних guards перед
intent и storage writes; 30 секунд не продлеваются. Все пятнадцать исходных файлов
сохраняются, summary строится после own resume и settlement штатного named read.

Временная занятость панели при загрузке agents/usage ожидается одним пассивным
таймером до native submission. Продолжение связано с тем же actor, URL и token;
смена контекста или неизвестный физический вызов отменяют его. Истёкший во время
ожидания challenge обновляется фиксированным read-only GET без повторного reset.

Подписанная activation сохраняет исходный `reset-*` actor как свидетельство
физического fence. После подтверждения activation панель переходит в отдельную
обычную числовую эпоху подключения. Текущие автономные полномочия выдаёт штатный
менеджер подключения; исторический activation actor ими не становится.

Для activation нужна установленная CEP с новым reset protocol. Старый протокол
не открывает admission новой сессии. После штатной поставки полной копии панели
применяется узкий connect/reload порядок из [Tool-First workflow](tool-first-workflow.md).

## Подтверждённые применения

20.10: reset `f0fb9754-678c-4649-9620-d7d3471d4294` / generation
`9f2d63af-266f-4ae4-8f0f-1c8f89194ab4` завершён после ручного выхода зависшего AE.
Исходный `fence_native_exit_unknown` и 15 исторических envelopes сохранены.
Завершающая команда с новым native nonce и собственной pause прошла за 8s;
retirement не присваивал activation. Последующий штатный connect подтвердил
`reset_active`, Connected/idle, autonomous typed grant и настоящий
`get_project_info` (пустой проект, revision1). Проекты и очередь AME не изменялись.
64 focused DI/fake-CDP/VM проверки, syntax/rules/diff — PASS; архитектурное
Ultra решение и ограниченное независимое High review — GO.

17.10: порученный reset выполнен один раз; подписанная activation сохранена. После
исправления startup busy и перехода в numeric epoch панель подключена к обычной
сессии: Connected/online, passive observer `connected_idle`, pending0/inflight0,
activeEditSession=null, автономная typed-сессия active. Настоящий
`get_project_info` успешно прочитал открытый проект. Повторного reset/preflight
при поставке исправлений не было; обычные рестарты имеют held-handle exit proof.

Внутреннее Ultra review финального source — GO. Изолированные проверки:
reset32, supervisor91, service35, product lifecycle12, CEP48 actions/16 VM,
rules/syntax/diff и PS AST/C# compile-only PASS. Эти offline-сценарии отдельно
от фактического подключения; queue/render acceptance не выполнялась.
