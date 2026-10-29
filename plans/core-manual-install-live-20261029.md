# MSI: восстановление receiver и установка manual composition

29 октября 2026, baseline `26f2b07`. Поручение пользователя: безопасно
восстановить ownership receiver, установить новый manual-пакет и проверить
живой путь Codex → MCP → CEP → AE. Root — sole live/CEP/UI controller.

## Scope

Точное обслуживание текущей MSI installation с сохранением origins, journal,
исходной UNKNOWN/terminal disposition и no-replay. Устанавливается final manual
candidate `3f9293f76f5dbef30f8919151145e28ebceb8fe796ee4495b9747e18e0ff8c51`
из завершённого [source этапа](core-installed-composition-20261029.md).
Пользовательский AEP, raw/destructive/save, AME, полный release и round-trip
десктоп ↔ MSI в этот блок не входят.

## Progress

- [x] Actual installed f548 проверен current verifier без открытия store.
- [x] Signed journal семантически settled:8events, original UNKNOWN сохранена,
  два complete; descriptor/origins/journal/config совпадают с baseline XVIII.
- [x] Receiver empty marker и broker marker PID25840 зафиксированы по6identity
  полям и hashes; broker ledger отсутствует, install/broker gates отсутствуют.
- [x] Current process25840/parent14720/argv/node и listener3457 установлены.
  AE отсутствует в CIM и fresh Windows inventory; native sends0.
- [x] В текущем tool inventory нет Core4. Existing control proxy current binary
  отказал до initialize:os10050, stdout0; новый app-server/runtime не запускался.
- [x] Проверенное освобождение exact PID25840 по retained native handle и
  invariant proof; historical status не назван свежим. Kill1, native0.
- [x] Stopped-state inspect, lease/CAS archive и standard install нового manual.
  Receiver и broker markers архивированы, intent/completion сохранены.
- [x] Independent installed read-back:manual59, release/CEP/Node/config PASS;
  origins/installationId/store identity сохранены, credentials ротированы.
- [x] Sole installed stdio MCP→CEP→AE read-only PASS:один native read,
  реальный AE26.3x87, пустой unsaved project, clean runtime exit0/stderr0.
- [x] Final history:10events, первые8побайтно сохранены, новый begin/complete;
  journal semantically settled, owners/gates/ledger/listener/runtime отсутствуют.
- [ ] Configured Codex-client handshake/status/native read. Tools в текущем
  чате отсутствуют, пользовательского ответа о переподключении пока нет.

## Decision Log

- Подготовка private one-case operator выполняется offline specialist в ignored
  evidence XIX; source Core4 и исторические XV/XVI launchers не меняются.
- Journal/marker timestamps не доказывают создателя marker. Архивирование
  допускается только для pinned identity, settled history и fresh остановленного
  состояния под install lease; новый UUID не создаёт authority.
- Пользователю отправлен запрос переподключить MCP для fresh configured status.
  Отсутствие tools и отказ control proxy не объявляются неисправностью CEP/AE.
- В диагностический вывод ошибочно попал actual descriptor с credentials.
  Значения не повторяются и в evidence не сохраняются; штатное обновление
  ротирует pair. Historical descriptors сохраняются для signed history.
- Независимый bounded review принял exact termination без нового MCP status:
  тот же native lifetime + verified immutable f548 + closed monotonic store
  исключают новый physical dispatch. Current census/markers/protected bytes
  перепроверены непосредственно перед Kill. Это не graceful shutdown и не
  configured-client proof. Установка затем выполняет свои fresh stopped gates.
- Два подготовительных отказа не достигли submit/Kill: обычный дочерний
  conhost не был выделен из computational children; затем PowerShell сериализовал
  пустые property arrays как[null]. Exact conhost PID34756/birth/path/hash/argv/parent
  проверен отдельно и не завершался root. Явная pipeline-сериализация даёт[].
  Первый durable submit создан только после этих исправлений; Kill был один.
- Private XIX engine сохраняет XVI semantics; изменены только transaction name
  и label. Candidate loader проверяет6helpers+59package files и один explicit
  pinned installer-only preflight. **Standalone distribution apply gap открыт:**
  этот файл отсутствует в исходной standalone closure; прежний dry-run не
  доказывал apply. Source Core4/старые launchers не изменены, fallback не добавлен.
- Первая sole stdio диагностика receiver открыла, но панель ранее загрузилась
  при отсутствующем runtime и сохранила Failed to fetch. Coordinate input CEF
  rejected as non-target; accessibility click также не выполнился. Native sends0,
  runtime clean exit0. Для следующего опыта runtime запущен до открытия панели;
  ordinary connect и единственный native read успешны. AE повторно не запускался.
- Старая adopted host identity PID31452 сохранена как исторические данные;
  она не принята как authority нового AE10856. Manual mutation/adoption и
  automatic lifecycle не проверялись. Два diagnostic stdio процесса работали
  последовательно после завершения managed runtime, не одновременно с ним.

## Validation

`snapshots/core4-live-proof/XIX-manual-install-live-20261029/`:
`collect-snapshot.cjs`/`root-observation.json` — current verifier, signed settlement,
marker identity и protected hashes; `configured-proxy-result.json` — отказ до
initialize. Descriptor SHA256 `67202b2e5e75e462eb3631757e035f512a86dc5f78db6af1b17355e84ea4419e`,
journal SHA256 `0354eb5e308336776e85963efb5c940534fb3c2b94ea2d7b53feb9e69e21fb7f`.
Actual install/recovery/native0 на этом preflight.

### Итог фактического обслуживания

- Offline/temp operator:**109/109PASS** (63inherited/real +46binding/closure),
  два реальных temp updates с синтетической signed history; forged MAC/ABA/
  no-replay/changed evidence gates проверены. Независимый source review ACCEPT.
- `root-invariant-proof.json`, `root-maintenance-submit/result.json`,
  `root-maintenance.json`: exact service stop1, без marker mutations в stop.
- `recovery-result-2026-10-29T13-36-49-396Z-77e00564-858e-4cc9-bc53-9d33a15875bf.json`:
  один archive/install, штатный same-lease installer, native0.
- `root-installed-readback.json`: package3f9293…,manual59, descriptor SHA256
  `be339768da4ec60f10a2aceb8f0614774c02a4b3dd9cc138fb07281e21632103`,
  config SHA256 `134450e0ad0c44a1c0363bdd49a7f436efc0140512774b8771d2dc39dd7e7a8e`.
- `live-stdio-result.json`: первая диагностика,native0,clean exit0;
  `live-stdio-result-panel-order.json`: initialize/discovery/contract + read PASS,
  PID16120, AE26.3x87, effect none, authority/continuity false, native1, mutation0.
  После read pending=null,unresolved=[],storeClosed/storeFault/unknown=false,
  ownership/ledger faults отсутствуют; stderr пустой, graceful diagnostic close0.
- `root-final-state.json`/`root-final-census.json`: signed10events, original8bytes
  сохранены, new command `inspect-c5e4cc9b-9c3d-417e-be2f-44ad06b8a197` completed;
  journal SHA256 `2c75bba19f04a82a026c22558eef28af7295960b773d6da867083fe4ea9e0584`.
  Runtime/receiver/broker owners и install gates0, listener3457отсутствует;
  AE10856 остаётся открытым с пустым проектом. Save/raw/destructive/AME0.

## Продолжение

Продолжение по прямому поручению самому восстановить клиент:
[configured MCP diagnostics](core-client-reconnect-20261029.md). Новый managed
manual process наблюдался, но текущий чат сохраняет старый MCP snapshot;
configured read остаётся открытым, общий app-server restart затронет другую работу.

Установка и отдельная живая техническая диагностика завершены. Для полного
запрошенного Codex-path proof остаётся configured client после переподключения
MCP; не повторять recovery/install или diagnostic native read вместо него.
Следующий вызов при появлении tools:core_status→discovery/contract→один fresh
project-inspection. Если панель остановилась после закрытия diagnostic runtime,
открыть её после готовности configured runtime; старую UNKNOWN не повторять.
Standalone distribution closure требует отдельного адресного исправления и
temp actual apply acceptance; full release/P1–P8 остаются открытыми.
