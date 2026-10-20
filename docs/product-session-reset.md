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

## Подтверждённое применение 17.10.2026

Порученный reset выполнен один раз; подписанная activation сохранена. После
исправления startup busy и перехода в numeric epoch панель подключена к обычной
сессии: Connected/online, passive observer `connected_idle`, pending0/inflight0,
activeEditSession=null, автономная typed-сессия active. Настоящий
`get_project_info` успешно прочитал открытый проект. Повторного reset/preflight
при поставке исправлений не было; обычные рестарты имеют held-handle exit proof.

Внутреннее Ultra review финального source — GO. Изолированные проверки:
reset32, supervisor91, service35, product lifecycle12, CEP48 actions/16 VM,
rules/syntax/diff и PS AST/C# compile-only PASS. Эти offline-сценарии отдельно
от фактического подключения; queue/render acceptance не выполнялась.
