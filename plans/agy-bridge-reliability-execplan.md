# Этап 3 — завершение и восстановление поручений agy-bridge

Статус: 3 октября 2026 — R1–R3 завершены и приняты offline.
Целевой репозиторий: `C:/Users/Ant/Documents/Codex/agy-bridge`.
Документ хранится в AE Agent как связанный roadmap; общий код меняется только
в целевом репозитории по отдельному поручению на этот этап. Live acceptance
и оставшиеся AE root-render/canonical capture blockers сюда не входят.

## Цель и существующее основание

Сократить ручной разбор оборванных запусков и неоднозначного завершения,
сохраняя запрет слепого повторения edit и независимую приёмку результата.
Этап 2 AE Agent может выполняться на нынешнем мосте; этап 3 не его prerequisite.

Читать действующие AGENTS, README, WORK_LOG и `docs/AGY_BRIDGE.md` целевого repo.
Использовать уже выполненный [аудит устойчивости](../../agy-bridge/docs/RELIABILITY_AUDIT.md)
на baseline code278296f, docsbe1a3b0; сверить свежий HEAD перед реализацией.
Повторный сбор всей истории и новый live demo для старта не нужны.

Исторические пробелы диагностики, process identity, tool/protocol errors,
denial и resource lock уже закрыты `d804665`/`05d0d53`. Остались persisted
artifact observations, opt-in compact/paged diagnostics, read-only report и
точечная проверка lifecycle/ownership/consumer contracts. Причина reset/EOF не установлена.
Улучшение наблюдаемости не обещает устранить внешние сеть, OAuth или квоту.

AE Agent уже имеет read-only `ae-task-completion` и paged native evidence.
Они остаются клиентской приёмкой. Мост не получает полномочия AE executor.

## Границы контракта

- Сохранить `run/status --config`, task schema, profiles, explicit conversation
  ID, model/permission preflight и текущие default exit-code правила.
- Новые сведения вводить совместимо: schema/capability обозначены, старые
  metadata читаются с null/unknown. Breaking changes — отдельное решение.
- Разделять transport, process observation, terminal/schema validity, tool
  incidents, artifact verification и независимую acceptance. Не сводить в PASS.
- Process observation имеет observedAt и точную identity; сохранённый PID или
  его нынешнее отсутствие не доказывают завершение spawned jobs и мутаций.
- Runtime outputs остаются в configured client state_dir. Не переносить журналы
  в Git; bounded diagnostics не раскрывают credentials или скрытые рассуждения.
- Не добавлять daemon/scheduler/SDK orchestration, зависимости, fallback provider,
  auth/grants/updater/network changes. Маршрут AE не переносится на другие repo.
- Нет автоматического retry edit, silent continuation или принудительного
  освобождения ресурса по одному возрасту lock. Unknown требует reconciliation.

## R1 — причины завершения и артефакты

1. Заменить Boolean-only preflight внутренним типизированным результатом:
   stage/reason/observedAt/elapsed/exitCode, bounded stdout/stderr, model found.
   Сохранять отказ после валидного task/config, до spawn модели. Неверный input
   не создаёт частичный разрешающий state и не резервирует чужой task ID.
2. Разбирать структурированные AGY_ERROR, когда доступны; сохранять code,
   retryable declaration и error ID как сведения провайдера, не команду retry.
   Неструктурированные stderr оставить явно ограниченным сообщением.
3. Отдельно сохранять tool incidents и явные denial evidence. `no output produced`
   без подтверждённого denial не классифицировать как отказ прав.
4. Сохранить строгую приёмку terminal/schema. Восстановленный tool error может
   описываться отдельно, но сам по себе не превращает текущий failed в success.
   Изменение success-policy — отдельный рассмотренный контракт и negative tests.
5. Persist before/after artifact observations: source/request identity,
   observedAt, exists/bytes/fullSHA и read error. Changed доказывать совпавшим
   scope/request/path и разными проверенными snapshot; отсутствие before=unknown.
   Повторно проверить containment/realpath и ограничение чтения. Без file bodies.

Выход: opt-in compact recorded status с reason codes и адресными refs; canonical
evidence остаётся целиком локально. Зафиксировать лимит компактного ответа
(предлагаемый acceptance budget8KiB) и pagination больших diagnostics; старое
представление по умолчанию не менять. Коммит и WORK_LOG Progress/Decision/Validation.

## R2 — lifecycle и ограниченная сверка

1. Зафиксировать таблицу переходов: not_started/running/terminal/timeout/unknown,
   что наблюдал bridge и что осталось неизвестным после terminate/kill/crash.
2. Хранить точную identity bridge/agy process, время старта и последний public
   event. Предложить read-only fresh observation поверх recorded status;
   сохранить прежние поля и семантику без молчаливой записи нового success.
3. PID reuse, недостаток прав и неподтверждённые descendants дают unknown.
   Проверка состояния не запускает модель, AE или повторный edit.
4. Reconciliation report объединяет текущие файлы/процессы с прошлым outcome,
   сохраняя источник и время каждого наблюдения. Клиентские native receipts
   подключаются явными ссылками; общий bridge не вызывает AE и не принимает кадры.
5. Сохранить явный конечный deadline. Развести общий бюджет, inactivity diagnosis
   и provider timeout; события прогресса не продлевают работу бесконечно.

Выход: bounded reconciliation без execution authority. Коммит после tests.

## R3 — ресурсный ownership и интеграция клиентов

1. Спроектировать atomic lock по явным конфликтующим ресурсам: writer scope,
   conversation и, где применимо, единый внешний контроллер. Workspace целиком
   не считать автоматически конфликтом; пересекающиеся directory scopes учитывать.
2. Lock связывается с owner/task/request hash/process identity. Acquire до edit,
   release только своим владельцем после подтверждённого завершения. Crash даёт
   stale/unknown с отчётом сверки; read-only независимые задачи не сериализуются.
3. Определить совместимость старых task без resource declaration: безопасный
   явный режим, без неожиданного разрешения параллельных writers. Зафиксировать
   выбранную schema/version policy до изменения входа.
4. Проверить consumers AE Agent, VideoScout wrapper и codex profile fixtures.
   В AE Agent лишь минимальная адаптация `ae-task-completion` к новым доказанным
   полям. Старые before-less metadata продолжают давать changed:null.
5. Обновить bridge README/WORK_LOG/contract и только необходимые клиентские docs.
   Действующие skills сверить на совместимость, не расширять grants автоматически.

## Приёмка и измерение

- Настоящие ограниченные fixture-процессы воспроизводят delayed output, hanging
  process, abrupt exit, partial terminal, deadline/terminate и interruption bridge.
  Быстрый fake timeout не заменяет проверку lifecycle ОС; никаких model calls.
- Negative cases: invalid/duplicate task, terminal SUCCESS с bad schema,
  восстановленный tool incident, явный denial и nonspecific empty output,
  missing/tampered before proof, junction escape, PID reuse и lock races.
- Status/read-only observation не меняют fixture files и не спавнят исполнителя.
  Edit неизвестного исхода не повторяется; два конфликтующих writers не стартуют.
- После каждого блока: `python -X utf8 -m unittest discover -s tests -v`,
  py_compile изменённых Python, `git diff --check`, отдельный рабочий commit.
  Запуск команды адаптировать к доступному штатному Python, без установки deps.
- Consumer contract fixtures выполняются offline; настоящий Flash/AE/VideoScout
  запуск проводится только по отдельному поручению, с одним controller/writer.
- На следующем порученном production run измерять причины unknown, время сверки,
  повторные запуски и объём статусов. Денежную экономию заранее не объявлять.

## Progress

2026-10-03: оставшийся scope закрыт. Opt-in compact status (8 KiB), paged
public diagnostics с generation SHA, read-only paged reconciliation report,
OS source/time и recorded identities, last public event/lifecycle/stop поля;
claim дополнен request SHA. Проверены actual wrapper и все три consumer profiles.
Этапы AE 1–2 остаются на checkpoint `8560e0d`; их runtime blockers не закрывались.
Checkpoints: agy-bridge `42e11b2` (baseline), `4288fc2` (artifact proof),
`e7da18f` (report/lifecycle/приёмка); AE `652b08e` (roadmap) и `d84e8a6`
(consumer proof). Все изменения общего кода находятся в agy-bridge.

2026-10-03: R1.5 реализован в agy-bridge; persisted before до spawn и after
включая failure, request/path binding, full SHA с 16 MiB/file, 64 MiB/phase и
2 s deadline. AE consumer сверяет обе фазы и текущий файл; legacy changed:null.
Compact/pages и report остаются следующим блоком. R3.4 consumer адаптация готова.

- [x] План подготовлен; существующий аудит и границы клиентской сводки учтены.
- [x] R1 — диагностика и доказуемые artifact snapshots (offline).
- [x] R2 — process lifecycle и read-only reconciliation (offline).
- [x] R3 — ownership, lock и совместимость клиентов (offline).

2026-10-03: сопоставление R1–R3 на `agy-bridge 05d0d53`, AE `8560e0d`:
R1.1–4 существуют (preflight не резервирует task ID; причины возвращаются без
state, это сохраняемый контракт). R1.5: before только в памяти, SHA чтение
не ограничено — требуется реализация. R2.2–3/5: identity, deadline, quarantine
существуют; last public event неполон, R2.1/4 и compact/pages отсутствуют.
R3.1–3: atomic scopes/conversation и exact token существуют; request hash пока
только в state. R3.4: старый consumer всегда возвращает changed:null; нужна
минимальная адаптация и offline fixtures. Общий код только в agy-bridge.

## Decision Log

2026-10-03: default task schema/profiles/run/status/exit policy сохранены.
Compact/page/report — совместимые opt-in схемы v1. Report не пишет state и не
освобождает ресурс; query success не task acceptance. Release response сохраняет
исторические outcome; новый claim требует exact token + request SHA, legacy
без hash читается. Client-native refs не открываются. Внешний controller остаётся
у клиента; descendants unknown, auto-unlock/retry отсутствуют. File deadline
кооперативный между syscalls; state не подписан и containment не sandbox.

2026-10-03: persisted artifact evidence локальное и неподписанное; hash/binding
предотвращают смешение snapshot, не доказывают доверенность полностью
переписанного state. Windows stat/fstat ctime сравнивается внутри одной API.
Transport/native/technical/visual acceptance не объединяются.

2026-10-03: существующую реализацию не повторяем. Блоки: baseline/карта gaps;
persisted bounded artifact proof и AE consumer; read-only compact/report и
оставшиеся lifecycle/ownership contracts. Чужие untracked AE-файлы сохраняются.
Нет вызовов моделей, AE, VideoScout, auth/network изменений или закрытия
AE root-render/canonical capture blockers.

2026-10-02: общий bridge реализуется отдельным scope в своём repo. Сначала
наблюдаемость; текущая strict acceptance не ослабляется ради completed counts.
Этап 2 не ждёт R3. Persist before proof предлагается впервые, не объявлен готовым.

## Validation

2026-10-03, финальный блок: **100 bridge tests PASS**, 35,747 s; **24 AE offline
groups PASS**, check:rules/node --check/py_compile/diff checks и CLI help PASS.
Реальные finite subprocess воспроизводят deadline/hanging/abrupt exit/inherited
pipes/manager crash/PID identity/cross-process lock races. Read-only fixture
trees сохраняют SHA; 40 artifact pages и Unicode diagnostics ≤8 KiB, поколения
связаны SHA. Actual VideoScout wrapper status и codex fixtures PASS; действующие
antigravity-cli references сверены без изменений. Live/model proof отсутствует.

2026-10-03, artifact block: **89 bridge tests PASS** (29,231 s), **24 AE offline
groups PASS**, реальный Python state прочитан настоящим AE consumer; py_compile,
node --check, check:rules и git diff --check PASS. Live/model/AE calls отсутствуют.

2026-10-03: свежий baseline **80 tests PASS** (26,223 с); AE offline completion
**23 groups PASS**, check:rules и diff checks PASS. Python не менялся.

При подготовке прочитаны актуальные contracts/code и existing audit; общий
Python-код, runtime и конфигурация не менялись. 39 tests PASS в аудитном отчёте
be1a3b0 — историческое evidence, не проверка будущей реализации этого плана.
