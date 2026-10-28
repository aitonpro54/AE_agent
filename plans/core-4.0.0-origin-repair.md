# Core4 — точный Origin-контракт CEP без настройки по компьютеру

28 октября 2026, Asia/Yekaterinburg. Baseline
`b42942afa92df0bcdb293ada05214f4ac13a3ed3`. Поручение: продолжить ремонт и разработку
текущей панели с учётом постоянной [переносимости](../docs/portability.md).
Root — sole installed/runtime/AE/CEP/UI controller. Scope — подключение и одна
разрешённая typed read-only инспекция пустого проекта; AEP не открывать/не менять,
raw/save/destructive и full-release не входят. Таймер не возобновляется.

## Установленный факт и причина

- Root проверил установленную package closure `0aea36d0caf2f60a91dbdc72cc5d10e268a410d1973e1e2140dfd2a9b5d88589`:
  проверка runtime files и Node PASS; broker/receiver owners и ledger отсутствуют,
  receiver journal содержит только origin, native dispatch 0.
- На старте AE не работал; root запустил его без AEP. Показан Crash Repair Options
  прошлого сеанса; выбран штатный Continue без reset preferences/safe mode/settings.
  После загрузки визуально подтверждён пустой Untitled Project, открыта только
  собственная панель Core4 через Window → Extensions.
- Разовый диагностический listener на собственном loopback3457 без Core imports,
  credentials, выдачи challenge или AE-команд получил реальный POST `/challenge`.
  Exact Origin **`file://`**, 7 bytes, SHA-256
  `71205e4480342d973ab4611d557e812dc8f38731d6f407a7d43eda7a5af5b562`, Host совпал.
  Время observation `2026-10-28T07:17:22.884Z`. Listener завершился exit0.
  Панель показывает `diagnostic_observer_only`; это ожидаемый отказ observer,
  а не успешное production-подключение.
- Локальное evidence: `snapshots/core4-live-proof/IV-origin-portability-20261028/actual-cep-origin.json`
  (ignored). Body/credentials не читались/не сохранялись. Значение Origin на
  десктопе этим не подтверждено. В baseline server принимает только строку `null`.

## План адресного изменения

1. Один package-owned exact ingress-контракт допускает только `null` и `file://`.
   Не принимать missing/empty/другие file variants/дубликаты Origin. Exact IPv4
   loopback и Host/port остаются; CORS success/error/OPTIONS отражает только
   точное разрешённое значение, Vary Origin, без wildcard/cookies/credentials.
2. Сервер добавляет принятый `origin` в свой challenge. Существующий MAC полного
   challenge уже покрывает поле. `/link` проверяет equality со stored challenge
   и request Origin; private peer.origin берётся только из stored challenge.
3. Все signed post-link requests требуют peer.origin до изменения sequence,
   lastSeen, pending/completion/ACK. Текущие MAC/epoch/peer/method/path/pins,
   one-time challenge/TTL, roles, UNKNOWN/no-replay и physical guard сохраняются.
4. Panel проверяет, что challenge.origin — одно из двух exact значений, и
   подписывает полный исходный challenge. Не выводить wire Origin из
   location.origin/href и не пытаться задавать forbidden header вручную.
5. Только адресные изменения `core4/integrations/cep/http-peer.js`,
   `core4/cep/js/panel.js`, их tests/validation selection и документация. Новый
   descriptor/profile/hostname switch не нужен. Не редактировать installed files
   вручную; новый immutable package ставится штатным installer после review.

Технический source-анализ `ae_specialist` дал узкий GO этому плану; runtime model
настроен ролью, отдельный self-report не объявляется доказательством metadata.
Анализ не менял source, не запускал tests/installed/live. Он не заменяет
обязательный plan/result Argon review по [workflow](../docs/argon-review-workflow.md).
До plan-review source repair не начинается; до result-review установка не меняется.

## Проверки и границы вывода

- Два positive challenge/link/poll режима, exact CORS на success/error/OPTIONS.
- Missing/empty/foreign/file variants/duplicate Origin и wrong Host/port запрещены.
- Cross-origin link/poll/complete в обе стороны; tampered challenge.origin даже
  с корректно пересчитанным MAC запрещён. Отказ не расходует sequence и не
  завершает pending; исходный Origin с тем же next sequence продолжает штатно.
- Wrong role/secret, reused/expired/tampered challenge, epoch/sequence/path/method
  negatives; persisted UNKNOWN не снимается reconnect. Проверки выбираются
  `validate-diff` по changed paths, boundaries/syntax/diff — по scope.
- Browser panel.js VM+WebCrypto/fetch shim проверяет клиентскую обработку; это
  не настоящий CEP/CORS proof. Существующие Node tests с вручную установленным
  Origin null не доказывают работу реального браузера.
- После source/result review: deterministic package → dry-run/apply exact hash →
  release/Node/CEP/config/state read-back → настоящий installed stdio/status →
  собственный CEP connect/poll → одна typed read пустого проекта. Configured MCP
  reconnect проверяется поддерживаемым способом; новый чат не требуется.
- На MSI результат ограничен этой машиной. P1–P8 переносимости не закрываются
  без desktop/round-trip evidence. Fences общих ресурсов сохраняются.

## Progress

- [x] Фактический Origin собственной установленной панели измерен; причина найдена.
- [x] Получен bounded source-analysis GO на минимальный portable repair.
- [x] Подготовлен и принят Argon plan-review packet04: go,5 findings разобраны root; источник и ограничения — в [decisions](../reviews/argon/cep-origin/20261028-origin-plan-04/decisions.md). Замороженный внешний план имеет собственный digest; локальный план после review обновляется только как operational record.
- [x] Repair реализован в4файлах; final installable20/manual12/documentation1, boundaries21/syntax/source diff PASS; independent bounded source-review ACCEPT без actionable findings.
- [x] Source milestone зафиксирован: `30311539ce2b2eb091d19c179667e513217e41cc`.
- [ ] Принят Argon result-review либо записано явное пользовательское исключение именно для этой установки; result01 пока `submission-unknown`, запроса повторно нет.
- [ ] Обновлена установка и выполнен фактический read-only proof подключения.

## Decision Log

- Origin ограничивает ingress, но не удостоверяет собственную extension.
  Фактическая authority остаётся за panel secret, pins и текущими epoch/sequence.
- Один exact контракт для двух поддерживаемых форм устраняет зависимость
  настройки от имени машины; новый Origin не обучается по первому запросу.
- Новое поручение возобновляет scoped ремонт панели. Остановленная автоматизация
  продолжения не восстанавливается. Standing authorization необходимых Argon
  checkpoints подтверждена предыдущим прямым поручением пользователя; root
  запросил только свежую readiness существующего controller без prompts/uploads.
- Чужие изменения workflow и untracked continuation plan сохраняются отдельно.
- Пользователь изменил получателя: «используй aiton, он открыт». Один пакет04
  отправлен существующим controller в Aiton/Argon/Высокий (максимум из трёх
  показанных уровней). После local capacity failures контроллера забран ответ
  того же запроса; повторных отправок0. Root проверил response hash/bindings,
  принял5 findings для минимальной реализации и выделил одного source writer.

## Validation

- Actual observation и чистое исходное состояние зафиксированы выше. Native
  inspection/mutation/save 0; tests нового контракта пока не выполнялись.
- Старый installed read-back и новый source-analysis не являются новым live PASS.
- На момент измерения source changes отсутствовали; дальнейшие результаты
  добавляются только после фактического выполнения.
- Plan-review packet04,49 552bytes, submission attempt1 подтверждён; response
 32 102bytes, SHA-256 `df165fdf3be48ca7c1efd5c2bc56b94dbe5dedcbf1405895ee26f19658d1eeeb`
  сверен root. Digest вычислял root, не Argon; его go/source reading — внешнее
  evidence, проверяемые findings привязаны к baseline в decisions. До patch
  и tests новые source/runtime PASS отсутствуют.
- Source freeze: `http-peer.js`, `panel.js`, `installable-runtime.test.js`,
  `core4/README.md`; `peer-protocol.js`/signed-body schema не менялись. Exact
  исходники и full logs — `implementation-freeze/` в том же ignored evidence
  каталоге. Final selected suites20+12+1 PASS, boundaries21 и syntax/diff PASS.
  Тестовые попытки с ECONNRESET reuse/cross-realm canonical сохранены; исправлен
  только стенд (`agent:false`, настоящий browser canonical), source gates не
  ослаблялись. OWS нормализует Node HTTP parser; отдельный timing activePoll test
  не добавлен, общий auth guard расположен до effects. Это явные границы покрытия.
- Root независимо сверил5sourcehashes и56packagefiles; build побайтно совпал с
  candidate. PackageHash `6c94efb678b9a56861b18e762076da7b38824bbbe30233770c4133ff81edc696`,
  file SHA `fd4320d1f0e95540dce83515fffaf21c92bbdac09f82303005d305930f5caad3`,
  286740bytes, immutable `dist/core4/4.0.0-origin-6c94efb678b9/core4-4.0.0.json`.
  В runtime package против0aea изменены только `http-peer.js` и `panel.js`.
  Source reviewer дал ACCEPT (read-only, tests/live0). Installed/live ещё прежние;
  result-review и actual read proof остаются следующим переходом.
- Result packet01 подтверждён root (85 746bytes, SHAe353f32aff36,8context/request,
  exact core diff и3source snapshots). Однократная передача в Aiton/Argon/Высокий
  получила противоречивый UI outcome; после одного read-only reload состояние
  `submission-unknown` осталось. Metadata сохраняет initial receipt и расхождение,
  нового response нет. Root не повторяет send/upload и не применяет package до
  решения review gate. Пользователю задан scoped вопрос об исключении; ответа
  на момент записи ещё нет. Source/installed/live outcomes не смешиваются.
