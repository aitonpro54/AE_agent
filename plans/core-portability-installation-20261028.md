# Штатная установка при переносе AE Agent Core

28 октября 2026, Asia/Yekaterinburg. Baseline `5d4447a`, MSI,
`C:/Users/Ant/Documents/Codex/AE_agent_core`. Пользователь поручил продолжить
работу после [завершённого ремонта панели](core-panel-installation-handoff-20261028.md).
Это первый ограниченный блок milestone 4 [устанавливаемого среза](core-4.0.0-installable.md),
по постоянному [контракту переносимости](../docs/portability.md).

## Цель и границы

Устранить зависимость адреса MCP-конфигурации от каталога запуска installer.
Обычный запуск из перенесённого source checkout должен выбирать его workspace
и текущий проверяемый Node без ручного редактирования путей. Существующие
`planInstall`, точный package hash, CAS, shared lease и state/authority gates
сохраняются. Это source installer change; runtime/CEP package не переустанавливается.

Configured-client reconnect остаётся самостоятельной незавершённой проверкой.
Новый собственный сервер вместо него не запускается. Manual host adoption,
mutation/save/raw, открытие AEP и фактический перенос на другую машину в этот
блок не входят.

## Матрица фактически наблюдённых сред

| Свойство | MSI, свежее наблюдение 28 октября | Десктоп |
| --- | --- | --- |
| ОС | Windows 11 Pro, 10.0.26200, x64 | Не наблюдалась в этом блоке |
| Node | v24.15.0; actual executable/hash совпадает с installation descriptor | Не наблюдался |
| AE | 26.2, PID 20108, UTC birth `2026-10-28T09:48:46.7068940Z` | Не наблюдался |
| CEP engine | 12.0.1, executable работающего процесса | Не наблюдался |
| Codex | Runtime metadata: `0.165.0-alpha.1.2`, desktop_app | Не наблюдался |
| Установка | Package `fa9e2f4545888c3cfca07221819e3bda4436680ab4602bf74a4f13c6a39b1199`, descriptor v2; release/CEP bytes верифицированы | Не проверялась |
| Configured MCP | CLI видит включённую project entry; tools отсутствуют в текущем чате | Не проверялся |
| Живой native proof | Исторический успешный installed read из handoff; новых sends в этом блоке 0 | Не проверялся |

Это наблюдения одной среды, а не обещание поддержки всех версий. Process census
не подтверждает отсутствие чужой AE-очереди, а file version CEP не доказывает
его JSON/API capabilities. Предыдущий host adoption относится к другому AE PID;
этот блок его не обновляет и не выдаёт полномочия на мутацию.

## Progress

- [x] Сверены чистый baseline, действующая project MCP entry и точные installed
  release/CEP bytes. Descriptor SHA-256
  `cc1ad553b518bd2ecdd59e9f6e09379d2545f5dc6b7e147576655dbf8cb7fd75`.
- [x] Выполнена одна попытка прочитать configured server status через штатный
  existing `app-server proxy`: отказ сокета 10050 до initialize, AE sends 0.
  Root запросил ручной reconnect и продолжил независимый source scope.
- [x] Read-only audit installer выявил cwd-dependent config target и отсутствие
  автоматического выбора уже выполняемого Node; записана матрица одной среды.
- [x] Исправлен выбор workspace/Node; адресные subprocess regressions приняты.
- [x] Root сверил deterministic runtime closure: тот же fa9e package/60 файлов.
  Actual CLI dry-run финальных source bytes из постороннего каталога выбрал
  правильные workspace/config/Node; protected local bytes остались прежними.
- [x] Завершён самостоятельный source milestone с обязательными selected checks;
  итоговые изменения подготовлены как один reviewable commit.
- [ ] Подтверждён configured Codex-client `core_status`.
- [x] После сообщения пользователя о reconnect проверен actual MCP startup:
  current configured client всё ещё отказывает initialize (`connection closed`).
  Отдельный диагностический stdio child23156 дал initialize/status PASS,
  затем clean exit0 без native dispatch и без изменения journal/owners.
- [ ] Выполнены оставшиеся implementation/acceptance gaps и P1–P8 обеих машин.

## Decision Log

- Default workspace определяется расположением source installer и проверяемым
  marker/layout checkout, не `cwd` и не именем компьютера. Явный абсолютный
  workspace разрешает первоначальный выбор другого source checkout; неверная
  цель даёт отказ до записи. Не вводится поиск диска или silent fallback.
- CLI сохраняет `--node` для существующих сценариев. Без него используется
  `process.execPath`; существующие проверки actual Node path/version/hash
  остаются обязательными. Это обнаружение уже запущенного Node, не установка
  зависимости и не гарантия наличия Node на неподготовленном компьютере.
- Standalone installer без подтверждённого source layout не угадывает адрес
  project config. Default discovery также сверяет точное положение исполняемого
  `install-core4.js`; переложенная копия требует явного workspace. Генерируемый
  dry-run показывает фактически выбранный workspace.
- Root остаётся единственным live/installed/UI-контроллером. Bounded audit
  выполнен `ae_scout`, source patch поручен `ae_implementer` по `ae-task-routing`;
  ownership не пересекается с root plans/docs. Внешних отправок Argon нет.
- Desktop-окно обнаружено как ChatGPT. Bundled Computer Use запрещает его
  автоматизацию; этот путь для reconnect не применялся. Ошибка штатного socket
  не обходится запуском второго сервера или изменением защиты.

## Оставшиеся installer gaps

1. Node/workspace discovery этого блока не проверяет AE/CEP capabilities и
   доступность fixed endpoints до применения установки. Для этого нужен
   отдельный ограниченный preflight; отсутствие наблюдения не равно PASS.
2. Bounded TOML editor сохраняет соседний текст, `enabled` и timeout, но
   неподдерживаемый синтаксис отклоняет. Semantic MCP read-back через configured
   client ещё не принят; успешный byte read-back его не заменяет.
3. Source содержит CAS/backup/state-preserving update и negative fixtures;
   фактические повторные циклы обновления, частичная установка, оба направления
   переноса и сохранность на второй машине требуют отдельного evidence.
4. Перенос инженерного контекста должен включать commits/closure и очищенные
   evidence. Ignored local snapshots сами по Git не переносятся. Credentials,
   local state/origins, pending/UNKNOWN и executable authority не импортируются.

## Validation

Локальные evidence в ignored каталоге
`snapshots/core4-live-proof/VIII-configured-client-20261028/`:

- `installation-readback.json`: actual Node, descriptor, release/CEP verification,
  собственные owner/gate files отсутствуют; не global queue-idle proof.
- `environment-observation.json`: bounded ОС/AE/CEP census без обращений к AE DOM.
- `configured-status-attempt.json`: existing proxy exit1, socket 10050, stdout
  пустой; configured status не получен.
- `actual-installer-dry-run-final.json`: финальные source hashes, запуск actual
  CLI из `%TEMP%`, exact fa9e package/60 файлов, нужный workspace/config/Node,
  unchanged descriptor/config/journal/install+state origin и повторный release/CEP
  verifier PASS. Apply/native0. Журнал сохранил SHA-256
  `1a07b1a379a166a7c8be1af714fa9ac7f7f328f05ad98599fcf12473bdd040b4`.
- `runtime-census.json`: собственных Core4 Node процессов и listener3457 не
  наблюдалось; это не census чужих AE queues.

Финальный `node core4/tools/validate-diff.js core4/tools/install-core4.js
core4/test/installable-runtime.test.js --run` завершился exit0: **45/45 PASS**
(`installable-runtime` 23, `native-read-recovery` 19, `human-window` 3),
fail/cancelled/skipped 0. Отдельный CLI batch 3/3, boundaries 21, syntax/diff PASS.
Предыдущий pre-guard run не подменяет итог: final selected run выполнен повторно
на замороженных финальных source bytes. Report с execution/counts/hashes и raw log —
`installer-validation.json` / `installer-validation.log` в указанном каталоге.

| Финальный source файл | SHA-256 |
| --- | --- |
| `core4/tools/install-core4.js` | `d802d8dcd8643f8ac0142e38497aab78b3f901a54049da2d3f11f7c401b7b92a` |
| `core4/test/installable-runtime.test.js` | `13d219a30014c0c868afb4708fed40d105c3e081dc4c33efed41707fb3956a15` |

Selection keys финальных bytes сверены с report. Его 11 deferred consumers
сохранены как `current-closure-unverified`, `releaseCertified:false`; это не
полная release-проверка. Новые live AE-команды не запускались. P1–P8 открыты.

## Итог и следующий шаг

Изменены CLI installer, его temp/subprocess fixtures и команды в `core4/README.md`;
основной и installable планы обновлены. Текущий runtime package не изменился,
переустановка не нужна для этого source tooling fix. Исторический UNKNOWN/noReplay
и текущие local state/origins сохранены.

Пользователь уже сообщил о manual reconnect; настроенный клиент всё ещё не
прошёл initialize. Следующий шаг — установить его точную startup-причину и
получить configured `core_status`, проверить fa9e, receiver/store/ledger/pending
и текущую панель; не повторять original inspection. Подробности и отдельный
stdio proof — в [аудите skills/MCP](ae-skills-audit-20261028.md).
Для следующего блока переносимости
нужны свежие facts второй машины и ограниченный environment/capabilities preflight
по оставшимся gaps. Поддержка неизвестной desktop среды не предполагается;
фактический round-trip выполняется только при доступе к обеим машинам.
