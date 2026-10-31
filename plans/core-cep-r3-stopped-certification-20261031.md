# R3d2b2a: подтверждение interrupted stop

31 октября 2026. Первый самостоятельный source-блок продолжения с checkpoint
`7a4804b`. CLI/install/update интеграция следует отдельным блоком.

## Progress

- [x] Private stopped certification без normal owner election и native sends.
- [x] Valid desired-stop, settled combined history, fresh original/certifier death
  proof и exact filesystem CAS; own certificate вместо receipt старого процесса.
- [x] Recognized ready/shutdown prefixes переиспользуют существующие guards.
  Execution owner не публикуется даже временно; original history сохраняется.
- [x] Bounded sealed actor continuation (16), unknown/foreign/corrupt refusal.
- [x] Независимый bounded source review; подтверждённые post-retirement CAS
  findings исправлены адресно и проверены regression cases.
- [x] Immutable selected packet **184/184 PASS**, source unchanged.

## Decision Log

Файлы: `core4/runtime/stopped-certification.js`, private seams в
`owner-maintenance.js`/`owner-lifecycle.js` и component test. Runtime/public MCP
surface не расширен; private capability не восстанавливается из JSON.
Обновление installer/operator и первый legacy migration — следующий блок по
[плану](core-cep-r3-stopped-update-20261031.md).

После retirement дополнительно проверяются сохранность прежних lifecycle intent
inodes, отсутствие новых markers/gate и exact reference transaction tree перед
публикацией certificate и выдачей capability. Это закрывает подмену между awaited
inspection и новым baseline; нельзя принять foreign file как свежий baseline.

## Validation

`snapshots/core4-lifecycle/20261031/CERT/summary.json`, run
`3c6abf7b-911d-4629-b9f4-ee84b0689051`: **184 PASS, 0 FAIL**, sourceUnchanged=true.
Проверка через `validate-diff` selection на immutable export `7a4804b` плюс четыре
source/test файла; validation-map расширен только маршрутом certification.
Текущий параллельный update WIP в этот snapshot не включён. Raw logs, dependency
hashes, evidence keys, commands и deferred coverage сохранены в packet.

30 certification, 33 lifecycle/faults, 21 real-process owner, 18 installation,
14 marker-publication, 22 maintenance, 32 finish, 6 finish-operator и 8 operator
PASS в своих группах. Boundaries, четыре JS syntax и diff check PASS. Process
births/verifier certification синтетические; filesystem/FD/rename/hardlink TEMP
настоящие. Source review не заменяет installed acceptance.

Actual install/Core stop/AE/CEP/native dispatch этого блока — 0. Действующий
manual3f92, credentials, пользовательские AEP и historical UNKNOWN не менялись.
