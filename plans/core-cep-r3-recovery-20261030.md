# R3: штатное восстановление installation owner

30 октября 2026. Разработка по [плану устойчивости](core-cep-lifecycle-20261030.md).
Этот документ фиксирует выбранные границы следующего source-блока; actual
recovery/installation ещё не выполнены.

## Состав этапа

R3a — [явная передача истёкшего controller lease](core-cep-r3-transfer-20261030.md).
Дальше последовательно: semantic inspection без открытия stores; версионированный
process/boot ownership и settled restart; durable maintenance/stop и новая AE
adoption через проверяемый stopped путь. Каждый блок имеет свои tests/evidence.

## Решение

Owner резервирует единственный fixed HTTP endpoint до открытия stores, затем
захватывает общий startup/install gate без неограниченного ожидания. При live либо
неприписываемом gate освобождает endpoint и отказывает. Installer, удерживая свой
gate, не ожидает завершения нового owner. Перед открытием stores или reclaim
повторно проверяются descriptor и filesystem bindings под gate.

Резервирование endpoint выбирает contender, но не доказывает смерть прежнего
процесса. Recovery требует exact PID/Windows birth и однозначную принадлежность
каждого marker прежнему boot. Неточный probe/permissions/PID reuse не превращается
в разрешение. Новый owner пишет и fsync-проверяет boot-bound records до создания
связанных markers. Прежний process record не заменяется до сохранения provenance.

Отдельный read-only reader проверяет receiver history, ledger и lifecycle/control
intents без конструкторов Broker/openCompletionStore и без mkdir/open-write.
Receiver UNKNOWN без принятого оригинального terminal disposition, torn/corrupt
journal, незавершённый command/control/reservation intent блокируют обычный старт.
Process record с `idle` не заменяет semantic proof. Existing constraints и история
не сбрасываются, unsent/accepted requests не повторяются автоматически.

Recovery сохраняет durable intent с exact originals/CAS, архивирует принадлежащие
старому boot markers и проверяет bytes/identity/read-back до completion. Crash
между шагами распознаётся по exact phase facts. Неоднозначная комбинация файлов
остаётся fenced: отсутствие файла само по себе не доказывает завершение шага.

Перед штатным stop/update сохраняется durable desired stopped/maintenance intent.
Auto-bootstrap не снимает его. Startup проверяет его до reclaim и под gate;
разрешить новый обычный старт может exact completion либо rollback соответствующей
maintenance/install transaction. Это не AE grant и не новая project incarnation.

## Legacy migration

Текущий installed manual3f92 оставляет пустой receiver marker. Пустой marker и
generic orphan gates нельзя задним числом приписать новому boot. Первый переход
требует отдельного stopped/verified operator с fresh process witness, exact CAS,
семантически settled history и архивом originals. Старые одноразовые maintenance
scripts не повторяются. Новая AE adoption требует собственного свежего native
host identity; смена чата или reconnect не объявляет continuity прежней incarnation.

## Progress

- [x] Read-only архитектурная проверка рисков; границы включены в решение root.
- [x] Receiver/ledger semantic fact readers,11component+5routing PASS и actual
  signed history read-only; [границы](core-cep-r3-inspection-20261030.md).
- [ ] Boot-bound ownership/recovery state machine и crash/CAS/process tests.
- [ ] Maintenance/stop/adoption путь, scoped validation и review.
- [ ] Installed acceptance в R5; old markers пока не изменялись.

## Decision Log

- Один fixed endpoint и общий gate сохраняют один execution owner. Новый broker,
  монолитный fallback, перенос credentials/authority и native C++ SDK не вводятся.
- Автоматический restart разрешён только для нового однозначного формата ownership.
  Legacy first migration и неизвестные markers требуют отдельного доказательства.
- Оригинальный receipt/reconciliation сохраняет отдельный recovery маршрут при
  UNKNOWN; generic controller acquire не получает права повторить команду.
- Actual Windows job lifetime и двусторонний перенос между машинами не выводятся
  из source/TEMP tests и проверяются своими отдельными условиями приёмки.

## Validation

R3b:16selectedPASS и read-only actual history unchanged; source review ACCEPT.
Control intents и production wiring не покрыты этим компонентом. Код recovery не создан;
статус текущего installed receiver storeClosed/UNKNOWN сохраняется. Stop Core,
restart AE, install, save и native dispatch этим документом не выполнялись.
