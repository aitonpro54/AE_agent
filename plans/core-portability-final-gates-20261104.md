# Завершение P2/P5 переносимости Core

4 ноября 2026. Пользователь поручил добить необходимый остаток после принятого
практического переноса. Titles/Slideshow остаются на паузе, облако вне scope.
Исходная точка — `97b6fe7`, обе машины на этом commit, рабочие деревья чистые.

## План

1. На desktop выполнить один настоящий same-package repeat штатными средствами:
   fresh preflight → новый `maintain-owner stop` → inspect/proof → resume →
   обычный verified standalone apply. `owner-update` одинаковый hash запрещает;
   его guard сохраняется. Между resume/apply не вызывать MCP и не запускать owner.
2. Проверить сохранность installationId/stateDir/origins, прежнего receiver journal,
   ledger, пользовательских preferences и соседних config/legacy. Новые role tokens,
   predecessor/transaction и owner boot — ожидаемые изменения. После штатного
   client/CEP reconnect выполнить одну свежую typed inspection и release.
3. Для P2 подготовить минимальный `physical.peer.origin` из уже аутентифицированного
   peer. Никаких выводов из URL панели/adoption origin. Проверить candidate, затем
   затронутые named checks, package/install и реальный status на обеих машинах.
4. После каждого принятого блока обновлять evidence/manifest; итоговую P1–P8
   матрицу свести по фактическим результатам. Полный release не подменять переносимостью.

## Progress

- [x] Сверены текущий checkout и прежние P2/P5 gaps.
- [x] Desktop fresh preflight: owner healthy, holder null, pending/UNKNOWN/fault0;
  пакет cdf/80, standalone5d5/98 verified, actual stop/update/apply0.
- [x] Read-only specialist принял существующий stop→resume→ordinary apply маршрут.
- [x] P2: status и адресные логи не содержат literal Origin; собственный Core4 CEP
  engine не имеет debug port. Native UI не адресует его child для контекстного меню;
  ввод отклонён до действия. Debug flags, packet capture и инъекции не применялись.
- [x] P5 actual same-package repeat/read-back: stop1/resume1/apply1, transaction9157, защищённые bytes сохранены.
- [ ] P5 post-repeat configured refresh/native3→5; [checkpoint](core-portability-p5-repeat-20261104.md).
- [ ] P2 candidate/source/package и installed proof двух машин.
- [ ] Итоговые evidence/manifest и синхронизация.

## Decision Log

- Один live-контроллер: root завершил MSI read-only UI-осмотр; далее desktop
  controller выполняет P5. Local implementer работает только в ignored candidate stage.
- `stopped_update_scope` не ослаблять. Resume официально архивирует stop barrier,
  освобождает gates и возвращает `runtimeStarted:false`; обычный apply сохраняет
  собственные lease/CAS/settled-history guards. Это настоящий повтор, не dry-run/no-op.
- Race с owner startup должен завершиться известным pre-write refusal. При любом
  неизвестном исходе ordinary apply сохранять original transaction/stages/gates,
  без reapply или удаления markers. `update-finish` не является finisher ordinary apply;
  rollback требует полностью applied baseline и свободных leases.
- Новое диагностическое поле P2 содержит только literal Origin подтверждённого peer,
  без secrets/MAC/headers dump и без изменения auth/Origin/Host/AE gates.

## Validation

- До выполнения нового блока source current48/71, 21integration +2Titles held open;
  это прежний срез, candidate пока не принят и production source не менялся.
- Новых AE-команд, install/apply/stop/reset/adoption/replay на подготовительном
  этапе0. Исходный desktop apply82b0de47… не повторяется.
- [Подготовительное evidence](../docs/evidence/core-portability-final-gates-preparation-20261104.json).

## P5 checkpoint: actual apply подтверждён, reconnect pending

### Progress

Desktop сохранил отдельное [evidence](../docs/evidence/core-portability-p5-repeat-20261104.json) после ordinary standalone repeat9157. Configured post-repeat proof ещё не получен.

### Decision Log

Старый thin client32372 держит startup descriptor до role rotation. Bounded UI/API search не обнаружил поддерживаемый адресный Core4 refresh; app-server/client не завершались, подменный runtime не запускался. Новый native read не отправлялся. Parent определяет следующий необходимый технический шаг после этого reviewable checkpoint.

### Validation

Actual stop/resume/apply1/1/1, protected read-back PASS; receiver prefix3, ledger absent, AE unchanged. Source keys71/current48/23 неизменны. P5/P2/full certification остаются open.
