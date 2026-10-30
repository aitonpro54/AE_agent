# R2b: verified owner runtime и thin client entry

30 октября 2026, baseline `156df1e`. Продолжение
[R2a](core-cep-r2-attachments-20261030.md) по
[плану устойчивости](core-cep-lifecycle-20261030.md).

## Scope

Source и TEMP установки/процессы/HTTP/VM. Рабочая MSI installation manual3f92,
её MCP config, CEP, credentials и state не переключаются. Новый runtime cluster
пока добавляется к package только в явно обозначенных TEMP fixtures.

## Progress

- [x] `owner-entry.js`: builtin-only bootstrap проверяет full release/exact entry
  и Node до первого рабочего import; composition повторно проверяется под
  installation gate. Owner не закрывается при EOF stdin/клиента.
- [x] Private owner mode в `stdio-entry.js` использует тот же единственный Broker,
  receiver и provider, что и прежняя composition. Режим stdio сохраняет свой
  явный старый вход; после ошибки owner нет переключения на него.
- [x] Owner cluster обязателен целиком в verified manifest до открытия listener
  и stores. Неполный пакет получает `owner_composition_unavailable`.
- [x] HTTP loopback резервируется под install.lock до Broker/receiver.
  `createHttpPeer` принимает только проверенный native prebound server и не
  запускает второй listener. Collision отказывает без записи state/origin.
- [x] Private AsyncLocalStorage context связывает controller с physical submit.
  Guard сохраняется в pending и повторяется на обеих ветках delivery независимо
  от контекста последующего `/poll`. Original completion не требует живой lease.
- [x] Inherited методы исполняются на actual Broker; activity видит его scalar
  running/controllerBusy/controlPending. Own facade overrides сохраняют receiver.
- [x] `client-entry.js`: control-only descriptor, проверка origin/Node/full tree/
  exact root до imports; без чтения полного installation.json/AE state.
- [x] Initialize/tools-list доступны при absent owner. `owner_status` в таком
  случае возвращает coverage=unobserved, без выдуманного empty census.
- [x] Local pre-send IPC error не рвёт соседнюю принятую операцию; terminal
  uncertainty закрывает только исходный attachment, без resend.
- [x] Финальная root selected validation:129/129 PASS,0fail; boundaries34,
  source review ACCEPT. Milestone фиксируется отдельным commit.
- [ ] R2c: package/installer/launcher, затем R3 recovery и R4/R5 CEP/приёмка.

## Decision Log

- Sidecar `core-client.json` содержит только control role и public pins/paths;
  projection не выдаёт новые credentials/AE grants. Installer transaction для
  этого sidecar ещё не реализована — это следующий R2c, не ручной production шаг.
- Endpoint стабилен для installation/machine и не зависит от package revision;
  HMAC handshake всё равно проверяет exact package и новую owner boot identity.
- Ordinary MCP initialize не создаёт authenticated attachment/controller.
  Соединение создаётся по явному tool call; acquire остаётся отдельным действием.
- Cleanup proxy различает terminal IPC errors и локальные validation/capacity
  отказы. Иначе допустимый большой MCP payload мог оборвать уже принятый запрос.
- Новый lease не переносит proposals/evidence и authority прежнего controller.
  Expired connected controller пока освобождается точным release/detach; штатный
  explicit expired takeover при доказанной quiescence должен быть решён в R3,
  а TTL сам по себе не выдаёт управление другому клиенту.
- SIGTERM/SIGINT обработчик owner при pending отказывает в shutdown и оставляет
  diagnostics/original completion доступными. Windows tests эмулируют вызов
  обработчика; это не proof OS signal delivery или MSIX/job lifetime.

## Validation

Адресные writer проверки и review сохранены в ходе реализации; финальный root
packet — `snapshots/core4-lifecycle/20261030/R2b/` (ignored):

- `validate-diff` для11 изменённых Core4 paths: **129/129 PASS** — owner18,
  native-read-recovery19, installable23, installed-composition9, manual12,
  human-window3, attachments22, real-process2, artifact/routing9, client12.
- `check:boundaries`: **34 checked**,liveCalls0; JS syntax всех changed files
  и `git diff --check`: PASS. Full release suite не запускалась.
- Source/evidence hashes, selection и explicit deferred coverage — `summary.json`
  и `selection.json`; полный raw stdout — `selected.log`.
- Самая долгая выбранная regression — native-read-recovery,262.26s: реальная
  TEMP история17updates. Повторять её без source/условий/нового риска не нужно.

Loader положительные stub-fixtures доказывают порядок
проверки/import, а actual thin Node clients + TEMP installed owner отдельно
доказывают IPC/EOF/common Broker. VM read не является live AE proof.

Full release/P1–P8, actual install, autolaunch и round-trip переносимости не
выполнялись. Existing installed receiver остаётся закрыт после restart; это не
обходится ради текущих тестов.

## Следующий участок

R2c: включить owner cluster и версионированный runtime contract в явный package
selector; installer транзакционно создаёт role-only sidecar/config с rollback/CAS.
Затем выбрать и проверить trusted owner launcher без второго Broker и без
кражи живого endpoint. Persistent Windows lifetime проверяется отдельно.
R3 должен дать штатный settled-owner recovery и новую AE adoption; old exact
transactions не повторяются, pending/UNKNOWN/fences сохраняются.
