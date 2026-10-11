# Свежая капсула reload после миграции daemon

Этот отдельный helper завершает установку панели, если исходная капсула
`native-fixture-retained-maintenance/capture.json` истекла до применения.
Замороженный runtime и исходная капсула остаются неизменными. Работа выполняется
текущим контроллером; helper не запускает и не останавливает процессы.

## Progress

Добавлены `scripts/owned-runtime-panel-reload.js` и узкий офлайн smoke. Команды
не принимают PID, URL, файлы, generation, selectors или ownership-факты:

```powershell
node scripts/owned-runtime-panel-reload.js capture
node scripts/owned-runtime-panel-reload.js apply-once
node scripts/owned-runtime-panel-reload.js read-back
```

Перед `capture` текущий daemon должен иметь полную доверенную регистрацию, а
фиксированная исходная пара fixture — валидный R2 audit/disposition с обеими
оригинальными held-handle retirement proofs. Audit готовится штатными typed
`/ame/native-fixture-abandonment/capture` и `/authorize` после регистрации daemon.
Отсутствующий или частичный audit запрещает даже новую капсулу reload.

`capture` дважды читает точную исходную приватную строку панели, индекс,
canonical, полный fixture inventory, proofs, actor, CDP target, установленные и
загруженные assets. Наблюдения должны совпасть с неизменным историческим якорем
и текущим зарегистрированным runtime. Новая капсула хранится в приватном
`.codex-runtime/owned-runtime-maintenance/panel-reload/<registered-generation>/`.
Generation берётся только из существующей полной регистрации supervisor.

`apply-once` в пределах десяти минут копирует только `panel-actions.js` и
`panel.js`, затем отправляет один `Page.reload` тому же точному target. Общий
controller lock и свежие policy/registration/source/code pins проверяются перед
эффектами. Fsync intent и backups предшествуют копированию; отдельный fsync
reload intent предшествует единственному reload.

После загрузки панели `read-back` проверяет новые bytes, загруженный код и новый
actor, однократно выполняет существующий trusted refresh и обязательно читает
`get_panel_action_result` через текущий daemon. Последнее чтение проверяет
динамический sidecar и создаёт существующую приватную server adoption lease.
Оригинальный результат остаётся `ok:false`, `UNKNOWN`, `replayAllowed:false`.
Release относится к этой точной fixture-паре; чужие protected UNKNOWN могут
по-прежнему держать aggregate admission закрытым.

## Decision Log

Историческая капсула используется только как неизменный raw/envelope якорь,
связанный фиксированным legacy profile. Чтение этого профиля с `fresh:false`
проверяет provenance и pins; оно не продлевает истёкший shutdown или reload
grant. Новый effect grant ограничен собственным десятиминутным TTL, текущей
enabled policy, текущей регистрацией daemon, валидным R2 audit и точным frame.
Raw SHA самого нового helper включён в новую капсулу отдельно от runtime digest.
После применения review-проверенного prospective patch 5 helper явно использует
`loadHistoricalLegacyProfile` только для чтения завершённого original signed
source и его исторических pins. Этот reader не принимает `sourceStable:false` как
обход и сам не выдаёт effect authority. Для reload по-прежнему обязательны
текущая полная регистрация runtime, current R2 audited disposition и новая
свежая десятиминутная CAP; succession или совпадение SHA daemon их не заменяют.

Любой известный partial intent либо неизвестный ответ после reload запрещает
повторный `apply-once`. При потерянном ответе разрешены только наблюдения.
Refresh имеет свой immutable intent: после его появления helper не отправит
refresh повторно. Если неизвестный refresh фактически не состоялся, read-back
честно остаётся unproven. Повторные пассивные read-back не копируют assets, не
повторяют reload/refresh и не возобновляют native plan. Истечение нового TTL
запрещает эффекты установки, но допускает проверку уже потреблённой операции.

## Validation

`node scripts/owned-runtime-panel-reload-smoke.js` проверяет expired historical
anchor с отдельным fresh TTL, отсутствие audit, поздний TTL/policy/registration
drift, raw code/target/assets drift, partial intent, lost reload/refresh response,
неподтверждённый sidecar и позднюю смену actor. Используются реальные индекс,
receipts, R2 audit и private control adoption; CDP, регистрация и legacy reader
заменены приватными тестовыми читателями. Это офлайн evidence, не live proof.
Также требуются синтаксические проверки двух новых JS, `check:rules` и diff check.
Итог этого блока: 24/24 офлайн cases, JS syntax 2/2, rules и scoped diff check
PASS. Live API/CDP/AE/AME операции и commits не выполнялись.
