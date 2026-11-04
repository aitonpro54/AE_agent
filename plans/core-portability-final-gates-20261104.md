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
- [ ] P5 final configured activation после required P2 successor transfer; intermediate CDF activation=not_performed и отдельно не требуется. [Checkpoint](core-portability-p5-repeat-20261104.md).
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

## P2 source block — 4 ноября

### Progress

Одна runtime-строка добавляет authenticated `physical.peer.origin`; no peer→null, stale peer сохраняет исторический Origin при connected=false. Расширены существующие real HTTP assertions.8canonicalfull named checks PASS в frozen stage; same bytes приняты в checkout. Candidate package1f8c/80 иdistribution18f2/98 verified. [Evidence](../docs/evidence/core-portability-peer-origin-source-20261104.json).

### Decision Log

Ни telemetry headers dump, ни debugports, ни auth/gate changes. Для strict P2 требуется actualconnected status обоих хостов после установки. P5repeat9157 preserved, activationnotperformed; specialist принял следующий реальный перенос1f8c и один конечный configured native proof, без ложного CDF activation claim.

### Validation

24keys changed/47same;12прежних accepted refs superseded,36reused+8fresh=44current. Exact25remaining sourcechecks запущены отдельным этапом,2Titlesheld. Первый harness launch отказал до teststart из-за нескольких Node paths, originaldiagnostic сохранён; все8реальных runnersexited0, noSKIP/cancel. Runtime пока не установлен.

## Desktop successor1f8c — installed/read-back PASS, activation blocked

### Progress

Реальная e75 source delta получена.1f8c/80 и18f247/98 воспроизведены, foreign-CWD dry-run PASS, applya88c одинраз иprotected read-back PASS. [Checkpoint](core-portability-desktop-origin-installed-20261104.md), [evidence](../docs/evidence/core-portability-desktop-origin-installed-20261104.json).

### Decision Log

Новая project MCP entry правильная; существующийCDFthinclient32372 не был пересоздан за наблюдавшийся configwatch/status. Owner_unavailable — конкретный pre-dispatch blocker; freshconfiguredOrigin/native не заявляются. Старыеapply/stop/resume не повторять. Root связывает следующийнеобходимый supportedclientrefresh послеэтого checkpoint.

### Validation

Runtime80/CEP7/lineage/origins/historyprefix3/configforeign/global/prefs/legacy PASS. Source71keys/current44 остаютсяe75,25offlinequeue не запускаласьнаdesktop. Native commands0, AErestart/save/mutation/reset0. P2/P5strict остаютсяopen дофактической finalactivation.

## MSI: installed Origin runtime

### Progress

Штатный stopa982→owner-update3a052→inspect→enable выполнен по1разу, package1f8c/80 installed/enabled. Desktop1f8c receipt1ce получен через Git при недоступном remote host. [MSI evidence](../docs/evidence/core-portability-msi-origin-installed-20261104.json).

### Decision Log

Обе дисковые установки уже актуальны; повторные install не нужны. Старые configured clients держатCDF credentials. MSI Core row в GUI readonly, targetedRestart не обнаружен; daemon CLI наWindows явно unsupported. Обновление службCodex отложено до завершения уже работающей source25queue, чтобы не прервать процессы проверок. Remote native continuation требует восстановления host connection.

### Validation

1756protected oldfiles exact,29preferences,receiver11/ledger1/AEP exact;80runtime+7CEP verified. СобственнаяCEPclose/open1, новый document; sameAE13608, restart/save/mutation/reset0. Fresh configured status отказалowner_unavailable доdispatch; newnative/Origin0. Source44current/25queue/2Titlesheld без изменений.

## Завершена текущая source-очередь — 4 ноября

### Progress

25полных named PASS, current69/71=36reuse+8Origin+25remaining. Только2Titlesheld остаются open. [Evidence](../docs/evidence/core-portability-current-source-20261104.json).

### Decision Log

Stageprerequisite exact-f548 восстановлен из exacthistoricalCODE artifact; прежнийENOENTfailure сохранён, sourcebytes/keyunchanged, только его freshattempt02 повторён. Никаких других retries/cancellations.

### Validation

25PASS/26attempts, all71keys/215sourcefiles/33supplemental exact, rawlogs+processrecords проверены parent. Все собственные runners exited. Package1f8c/80 иstandalone18f247/98 unchanged. Далее — configured MCP service refresh и one final native/Origin на каждой машине; installIDssettled не повторять.
