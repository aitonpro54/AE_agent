# Перенос AE Agent 3.3.1 на MSI — 12 октября 2026

Статус: восстановление и ограниченная offline-проверка завершены. Это не release,
не live admission и не приёмка перенесённого WIP. Пакет оставлен неизменным.

## Progress
- Рабочий путь: `C:/Users/Ant/Documents/Codex/AE_agent`.
- Ветка: `codex/laptop-dev-20261012`; база — WIP snapshot
  `e530adbc461c3713dcbe44d4a912831d1dcb8252`, parent
  `63c8027a6832282810a7180c3dd5114b5e608cc6`.
- Origin: `https://github.com/aitonpro54/AE_agent.git`; push/PR не выполнялись.
- Transfer verifier и независимая проверка: 21 104 файла, 3 923 632 450 байт,
  sizes/SHA256, три bundles/refs, snapshot/parent и raw WIP6 — PASS.
- `MANIFEST.json`: `0f2ea4bd39a43a879757d8d75a139d04c34451453986307ada9a1f2de644cbde`.
- `READY.json`: `d5524e547eb3e02d5ca923afe1b58170ae4e0d67cb47e847b8090437f43161ca`.
- До замены: старый bridge имел pending/inflight=0, edit session отсутствовала,
  panel disconnected. AE показывал пустой Untitled Project; AME — пустую очередь,
  без текущего encoding. Stop был ограничен проверенными identities старых adapters.
- Все пять локальных commits старого HEAD
  `6c8fbea80b94c62cb0fc6b01e36bb487c49bc649` сохранены.
- Backup: `C:/AE-Agent-MSI-Backup-20261012` — полный repository, CEP, затрагиваемые
  Codex settings/auth/skills и старый checkout. Старый установленный CEP вынесен
  в `original-installed-cep` за пределами Adobe extension roots.
- `laptop-original-all.bundle` содержит старые refs; SHA256
  `3910d5e63642314d994ff60be29eaa819ed640d5a79cc6e63d16414bc03f306d`.
- `source-history.git` хранит refs исходного source bundle отдельно от active runtime.
- Из-за открытых handles whole-directory rename был недоступен. После проверки
  пустого остатка `.git` checkout восстановлен копированием stage; исходный checkout
  и его полный `.git` сохранены в backup. Reset/clean и изменения ACL не выполнялись.
- Checkout877, raw WIP6, установленный CEP9, assets46, checkpoint1, SDK432,
  pinned Node8529 и PowerShell658 совпали с соответствующими payload bytes.
- Assets восстановлены в `C:/Проекты 19/2025.10.06 - Школа музыка пушка (Былина)`.
  `titr_all.aep`: `e55edfd680a6f4bad222389ffcf5b6d08a18ff4afd2a15a27f944bdcf8856754`.
- Checkpoint находится в `.codex-runtime/msi-transfer/project-checkpoints`;
  SHA256 `dbf941fed34b68e35d68c8cf3f15733025d9a04211a364a042430821944a6344`.
- Перенесены предусмотренные пакетом десять skills и восемь roles; чужие локальные
  skills сохранены. Global AGENTS не заменён.
- MCP config объединён выборочно: одна project-local AE регистрация, разные fresh
  automation/panel/AGY credentials, `AE_DAEMON_AUTO_START=0`. Model/effort/context
  и Codex auth сохранены; TOML/role paths проверены. Historical grants, queues,
  CEP localStorage и authority исходного ПК не активированы.

## Среда и Validation
| Компонент | Проверенный результат |
| --- | --- |
| Pinned Node / PowerShell | v24.19.0 / 7.6.5; полные trees sizes/SHA256 PASS |
| System Node | v24.15.0; exact source hash PASS |
| Python для Codeburn | Совместимый bundled 3.12.14, stdlib/SQLite/tomllib PASS |
| VS Build Tools | 17.14.37710.0; complete/launchable, reboot не требуется |
| MSVC/v143 | Folder14.44.35207, serviced compiler19.44.35229.0, linker14.44.35229.0 |
| Windows SDK / AE SDK | 10.0.26100.0 / 26.5; SDK432 files PASS |
| Native proof | Windows.h + AE_GeneralPlug.h: compile/link/local x64 executable PASS |
| Codeburn | SDK1.30.0 initialize/list/call/close PASS с explicit Python и nonexistent temp DB |
| CognacC | Уже установлен per-user; font bytes/hash и HKCU registration совпали |

- Native proof — только локальный test fixture. Product native build/deploy и live
  семантика не проверены; historical artifacts сохраняют `productionReady=false`
  и `liveSemantics=UNVERIFIED`.
- Точный Python3.12.10 не установлен: официальный подписанный installer с проверенным
  SHA256 завершился MSI2203/0x80070003 и rollback. Повторов/ACL/security changes не было.
  По фактическим imports Codeburn использует stdlib; выбран существующий 3.12.14.
- Codeburn source/npm package восстановлены. Isolated smoke не читал usage/history,
  не создавал DB, не включал collection/hooks/dashboard; temporary child завершён.
- `check:rules` PASS, syntax четырёх WIP JS PASS, offline AME grant девять групп PASS,
  `git diff --check` PASS. Frozen baseline не обновлялся.
- При добавлении MSI progress первый doc check обнаружил 183 строки общего плана;
  удалены три пустые строки, историческое содержание сохранено, compact limit соблюдён.
- Первое npm launcher invocation попало в roaming npm и завершилось ошибкой;
  повтор через system Node/npm-cli прошёл. Прямой `npm.cmd run check:rules` также PASS
  при process-local PATH/prefix на `C:/Program Files/nodejs`; global PATH/npm не менялись.
- Local evidence: `.codex-runtime/msi-transfer/offline-verification.json`,
  `native-compile-verification.json`, `codeburn-verification.json` и scoped test logs.

## Decision Log и границы продолжения
- [block: MSI restore] [executor: root sole writer/controller]
  [ownership: Git/installation/config/credentials/AE/CEP/UI/assets; helpers — scoped checks].
- Git history исходного ПК и первые packaging index metadata с UNKNOWN сохранены
  как исторический контекст. Проверенные raw WIP bytes не означают принятие реализации.
- Копия AGY CLI и agy-bridge source установлены отдельно от source auth/history;
  portable readiness, fresh target login/workspace registration/grants ещё не подтверждены.
- Найдены local AME presets `FHD_HQ_alfa_nosound.epr`, `DXV3_titles_NQ.epr`,
  `1080p_20kbps_sound.epr`, `1080p_20kbps_no_sound.epr` в user Presets26.0.
  Выбор/содержимое/output compatibility не проверены; preset не считается выбранным.
- Первичный OWNED admission требует отдельного architecture proposal/review. Daemon
  autostart выключен; настоящий AE response/project read, font rendering, внешние
  media links, comps/два варианта и два AME outputs остаются непроверенными.
- Следующий milestone: reviewed initial admission plan нового компьютера и чата.
  Machine-specific config/receipts/credentials не включать в возвратный Git bundle.
