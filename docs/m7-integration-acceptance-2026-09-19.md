# M7 remediation и финализация — release acceptance

## Generated-only live acceptance 2026-09-22 — release gate passed

Scope ограничен сохранённым fixture
`.codex-runtime/review-remediation-live/CODX_REMEDIATION_LIVE.aep` (20 items).
Путь и происхождение перепроверены до mutations; клиентские AEP/media не открывались.
Исходный SHA-256: `C05881A84ED1D49C55F8F7A9E8986654F572D2C0D59D19E38B6713F0B21E7499`.

Live composite identity:

- root comp `CODX_REMEDIATION_LIVE_ROOT`, item id 54; target layer 3/id 67;
  out-of-scope neighbour layer 2/id 70;
- два эффекта `M7 Duplicate Fill` / `ADBE Fill`: effect #1 остался красным
  `[1,0,0,1]`, effect #2 — синим `[0,0,1,1]`;
- positive run `a4993182-85e4-43c5-9788-bac9970a8d5e` завершил 3/3 шага и
  semantic verification `passed`;
- fractional descriptor `a9c9c773-063b-4186-8361-37c2f14eac2d`, conflicting identity
  `a47a292d-0979-44ec-ad89-1283dca59e18` и bulk preflight
  `0ea3770d-e3a7-4b11-9e29-3a1a23c0b89f` отказали с `executedCount=0`; независимый read-back
  подтвердил неизменность обоих эффектов и neighbour layer.

Typed save выполнялся только через proposal/dry-run/CEP confirmation. Canonical action
`act_79813ce7d44e43fbac3ac5601d79aa4d`, dry-run
`062beb08-f22e-4491-b448-6bdb2c36feff`, execution
`ca0d785a-5f91-4a30-ad5b-2a054b8dcb42`. Checkpoint
`backups/CODX_REMEDIATION_LIVE-checkpoint-session-ai-plan-ca0d785a-2026-09-22T16-38-44-009Z.aep`
имеет исходный hash. В AEP добавлен marker
`AE_AGENT_M7_RELEASE_PROOF_20260922_1622`; сохранённый hash:
`CC17B6A72484BC50EA428BFAFBFC681AF89724460F0656F0895D70F97387E2EF`.
Проект закрыт, повторно открыт по точному пути; marker, red/blue duplicate pair,
layer 2/id 70 и 20 project items независимо прочитаны повторно.

Persistent autonomy пережила безопасный daemon restart (PID 27544,
`startedAt=2026-09-22T16:02:34.065Z`) и реальный CEP Reload. Panel generation сменилась
с `1790094974396` на `1790095794160`, `desiredEnabled=true` и `active=true` сохранились.
После явного выключения через CEP `desiredEnabled=false`, `active=false`; proposal
`act_0b1710d569ce4cb888789968b0103df3` прошёл dry-run
`bf302704-cb9c-454a-b11c-b10f4cf74a99`, но real mutating call был отклонён до
исполнения (`proposal_required`). Hash и независимый read-back не изменились.

Project A/B, foreign checkpoint, manual-revision stale proposal, wrong owner/stage/
generation, terminal duplicate, unknown/replay, corrupt/legacy state и long-command
heartbeat закрыты actual-module/isolated-daemon regressions ниже. Это не выдаётся за
live AE evidence. Raw JSX, destructive tools и save сохранили отдельные manual gates.

Release deployment 3.1.0 выполнен точечно после live acceptance. В установленную CEP
копию записаны только `panel.js`, `index.html` и `CSXS/manifest.xml`; прежние версии
сохранены в `.codex-runtime/release-3.1.0-cep-backup-20260922T1700/`. SHA-256
установленных файлов совпал с repo: `panel.js`
`14C002CCB576FF83DEA8218120584B1615987B9C9066DEBDC78050008E0BECA8`,
`index.html` `35EA294468420EE3690B0D905DADF983CCA8B6CE60651C0CA1A08A6E157A8D0F`,
`manifest.xml` `768F0AB015C556E7E92E61E342377367798833441710EBDD99391CB0A20F5B7C`.
После проверки `pendingCommands=0`, `inflightCommands=[]`, отсутствия edit session и
`desiredEnabled=false` daemon был перезапущен: новый PID 7616,
`startedAt=2026-09-22T17:20:29.081Z`, runtime version `3.1.0`, autonomy осталась off.

После закрытия панели AE был непреднамеренно закрыт при выходе из встроенного Adobe
Exchange. Сохранённый generated AEP не пострадал. Повторный запуск AE оказался долгим,
но завершился: native menu показало `AE Agent 3.1.0`, панель загрузилась, Connected/online,
autonomy осталась `Выключена`. Post-bump bridge read-back: panel generation
`1790097955485`, `desiredEnabled=false`, `connectionReady=true`, `active=false`, queue
и inflight пусты. `get_project_info` вернул точный generated AEP и 20 items.

## Исправление панели 2026-09-22 — актуальный результат

Диагностика и исправление выполнены без применения AE/CEP-скиллов. Причина
`Bad bridge token`: в project-local `.codex/config.toml` был только automation
credential; новый daemon требует отдельный `AE_BRIDGE_PANEL_TOKEN` для CEP.
Добавлен отдельный случайный panel credential, установлен в CEP, daemon перезапущен
после проверки pending/inflight=0, отсутствия edit session и desiredEnabled=false.
Global config и auth/Origin/Host gates не менялись; значения credentials не публикуются.
Backup конфигурации и установленного panel.js: `.codex-runtime/panel-repair-20260922/`.

Live: Connected; get_project_info через MCP прошёл до и после Reload, оба result ok.
Command IDs: `642ca578-d32c-433d-8670-1b08678af60d`,
`258e58f0-f899-4b45-9482-889e9c99581f`. Финально pending/inflight=0,
connectionReady=true, desiredEnabled=false. AE mutations/save/close/reopen не выполнялись.
Открыт прежний generated fixture `.codex-runtime/review-remediation-live/CODX_REMEDIATION_LIVE.aep`;
происхождение подтверждено его session.json. 20 items, dirty=false. Ранний вывод
«non-synthetic/client» по несовпадению префикса M7 был необоснован.

В panel.js добавлено точное сообщение о panel authentication и миграции env;
401 больше не маскируется общим Bridge offline. Новый smoke:panel-auth проверяет
actual functions: guidance, network/server error separation и отсутствие echo секрета.
README описывает deployment/role migration. Установленный panel.js совпадает с repo:
SHA-256 `da21b0335ac48fc14a6b333bae8b96b1e75db5475243aefc712e4314d90141ff`.

Validation: panel-auth; helper offline (11 commands); smoke:network-boundary (3 scripts);
check:rules; node --check panel.js/panel-auth-smoke.js/m7-synthetic-live.cjs;
git diff --check — exit 0. Scoped CEP inspect/reload/state — pass.
connector-status-smoke — pass на fake responses, отдельно от реального MCP read proof.
Providers/CodeBurn refresh/Local/Ollama/intake не запускались.

После успешного восстановления переписаны 5 личных skills, их references и agent
metadata (15 файлов); JSX syntax helper сохранён. Старые деревья в `skills-before/`.
Убраны устаревшие temporary-autonomy и active-comp defaults, обязательный model routing;
добавлены credential migration, exact scope и различие offline/fake/live/save evidence.
Проверены фиксированная YAML-структура с quoted scalars, ссылки и неизменность helper.
Попытки общего YAML parse недоступны: системный python — Store alias, bundled Python
не содержит PyYAML; зависимости не устанавливались. Использован валидатор узкого
генерируемого формата, evidence `skills-rebuilt.json`.
Временная проверка diff с command-local `core.autocrlf=false` дала ложные CRLF
trailing-whitespace findings; повторный обычный `git diff --check` с настройками
репозитория прошёл. Файлы ради нормализации CRLF не переписывались. Validator ссылок
сначала захватил точку конца предложения; regex исправлен, повторный прогон прошёл.

Итог: panel connectivity repair complete; synthetic mutation/A-B/save-reopen matrix
и user acceptance остаются pending. Старые блокировки credentials ниже — история.
Уже запущенный MCP adapter не перечитывает env: при его следующем запуске должна
использоваться обновлённая project-local config; текущий daemon уже запущен с ней.
Commit/push/PR не выполнялись, прежний dirty tree сохранён.

## M7 Synthetic Live — исторический preflight 2026-09-22 до исправления

Повторное подключение после включения AE пользователем: локальное чтение и MCP
восстановились; HEAD остался `b2cdd432c99f1c0dfac2f0cf2a888e09b6778c5a`.
Проверялась текущая dirty версия. Исходный patch, file hashes и отдельные roots
projects/checkpoints/evidence/runtime-backup находятся в ignored
`.codex-runtime/m7-synthetic-live-20260922/`. Helper:
`scripts/m7-synthetic-live.cjs`; он не вызывает providers и не выполняет AE mutations.

Read-only AE preflight через CSInterface (typed bridge был disconnected):
AE `26.2x49`, `hasFile=true`, `dirty=false`, `numItems=20`,
`syntheticNamed=false`. Имя и путь проекта намеренно не экспортированы.
Создание A/B требует закрытия этого проекта, что запрещено текущим scope.
Проектные live cases остановлены; проект не закрывался и не сохранялся.

Runtime: bridge 3.0.0, PID 29896, start `2026-09-22T14:28:28.436Z`,
source identity `25e8f5474351029d96c543418652ab5854b7ab73566cf23e17f2440aaf06e36e`,
repo bridge byte hash `db21c053873b43ce8dbe7c4421ea40f1d07372e8cb51ed4f6c6c9d80ef18ea73`.
На инспекции queue/inflight=0, edit session отсутствовала, desiredEnabled=false.
Source identity и byte hash — разные измерения, не взаимозаменяемые значения.

Установленная CEP 3.0.0 была старой: `URL credentials are not accepted`.
После разрешённого backup, hash comparison, копирования только panel.js/index.html
и scoped reload она показывает `Bad bridge token`. Trusted reconnect и реальный
command contract v2 ещё не подтверждены; downgrade/fallback не включался.

| Файл CEP | Backup SHA-256 | Установленный после sync = repo SHA-256 |
|---|---|---|
| panel.js | 201047528326c20ec76f372ebd2e0a867a21629f56f1f6ea7138d8971675eb7c | d8776cb859baa250d037a593c255caf92ab6a7b470ca0f7588bce1a576cf4b44 |
| index.html | b453ea2e19a5333bf75ec821690195443237c4a6c945fa9985bc9af949eb7125 | fd73a996c73551aebdd8204984023ec8978b8ec99674bd96fa2da04c562519e3 |

| Критерий / сценарий | Ожидаемый результат | Статус и evidence |
|---|---|---|
| Runtime identity и сохранность | Проверенные hashes, zero client writes | passed, baseline.json, runtime-backup, ae-preflight.json |
| Trusted CEP / v2 | Панель подключена с v2 receipt | blocked, actual DOM: Bad bridge token |
| ID01–ID07 exact duplicate, invalid descriptors, bulk, fractions, neighbours | Точный target; отказ до записи; independent read-back | blocked, нет разрешённого пустого synthetic workspace в AE |
| RUN01–05 A/B, checkpoint, preflight switch, manual edit | Старый план отказан, ручная правка сохранена | blocked, та же граница проекта |
| RUN06–08 lifecycle, timeout/reload/restart | Unknown reconciliation без повторной mutation | passed-isolated, новый run-boundary/persistent-autonomy-bridge/Hardcore; real AE not_tested |
| AUT reload/restart/off/heartbeat | Durable intent + trusted readiness; off блокирует следующую mutation | blocked, credentials; новый live run не создавался |
| Protected save/reopen/receipt replay | Manual gate, disk proof и независимый reopen | blocked, synthetic AEP не создан |
| CEP error и usage unavailable | Видимый error; unknown отдельно от zero | passed-scoped, actual DOM panel-state-*.json: состояние недоступно, CodeBurn/quota unavailable |
| CEP enabled/waiting/off/version mismatch/verification coverage | Реально отображаемые состояния | not_tested, подключение не установлено |
| Usage native/aggregate/estimate/quota с fixtures | Раздельные источники и unknown | static UI contract regression passed; новые data fixtures not_tested; прежний offline proof не переименован в live |

Actual commands: `node scripts/cep-panel-cdp-smoke.js inspect` exit 0;
`node scripts/m7-synthetic-live.cjs baseline` exit 0;
`node scripts/m7-synthetic-live.cjs ae-preflight` exit 0;
`node scripts/cep-panel-cdp-smoke.js reload` exit 0;
`node scripts/m7-synthetic-live.cjs state` exit 0; scoped PowerShell backup/sync/hash
exit 0. Read-only process/file inspection первоначально получила sandbox access denied,
затем разрешённая escalation прошла. Позже command runner временно перестал возвращать
результат даже чтения файлов, затем восстановился. Финальные syntax/offline проверки прошли.
Ограниченный ae_architect review также blocked дочерним runner, findings не заявляются.

Новый ограниченный offline прогон: `node scripts/m7-synthetic-live.cjs offline` exit 0.
Все 11 commands дали exit 0: node --check helper; clean-current-check; frozen-intake-guard;
property-identity-smoke; run-boundary-smoke; persistent-autonomy-smoke;
persistent-autonomy-bridge-smoke; autonomy-revocation-smoke; panel-heartbeat-smoke;
hardcore-authority-smoke; usage-panel-smoke. Полные stdout/exits/timings:
`evidence/offline.json` (относительно evidence root выше).
Дополнительно `npm.cmd run check:rules`, `git diff --check`, JSON parse ledger — exit 0.
Isolated fixtures завершили собственные процессы и удалили disposable temp roots;
сохранён stdout evidence, реальные AEP не создавались. Full-intake не выполнялся.

Статусы независимо: product diff `offline_validated` в указанном scope;
новый milestone не завершён технической приёмкой; `synthetic_live_blocked`;
`user_acceptance_pending`. Новые regression/syntax/rules проверки завершены.
AE mutations/provider calls/live test grants/live test runs=0. Рабочий bridge не перезапускался,
client AEP оставлен открытым; CEP обновлена, но authentication blocked. Commit отсутствует.
Для продолжения пользователь закрывает текущий проект сам; также требуется исправное
доверенное credential provisioning панели без изменения security gates. Runner восстановлен.

Дата: 2026-09-22. Baseline/HEAD: `b2cdd432c99f1c0dfac2f0cf2a888e09b6778c5a`.
Работа выполнена в существующем dirty `main`; commit/push/PR/merge/reset/clean/stash не выполнялись.
Прямые ограничения пользователя для remediation имеют приоритет над ранними стопами MASTER_PLAN.

## Вердикт и границы

Offline scope FZ → ID → NET → RUN → AUT завершён; M6 usage регрессий не обнаружено.
R01–R07 исправлены и проверены на текущих modules/generated JSX/isolated daemon,
а не зачтены по историческим probes. Это ограниченная приёмка перечисленных
контрактов, не full repo audit и не доказательство AE correctness.

- `offline_validated`: true в указанном ниже scope.
- `synthetic_live_validated`: true в перечисленном generated-only scope.
- `release_gate`: passed; client visual acceptance остаётся отдельным продуктовым scope.
- `not_tested`: клиентские AEP, real providers/CodeBurn network/quota refresh,
  public connector deployment, installer/dependencies и broad CEP smoke.
- Frozen intake/importer/supervisors не исполнялись; merge не разрешён.

## M7 claim → actual source/test → disposition

| Claim | Current source/test | Disposition |
|---|---|---|
| Frozen boundary существовала только в README | manifest/lock + frozen-intake-guard, temp-copy smoke | implemented, 26 frozen files; helper active |
| Exact identity/bulk safety | bridge actual generated JSX + property-identity VM | fixed, пять call sites; остальные перечислены ниже |
| Единой network policy не было | http-boundary, bridge routes, connector + network regressions | fixed offline; deployment pending |
| Manual project/result parity | guarded command delivery/JSX, command-receipt + run-boundary | fixed; offline A/B плюс generated save/reopen live proof |
| Failed ошибочно скрывался incomplete | run-outcome + actual module assertions | failed и coverage разделены |
| AUT имела 20-minute TTL | persistent manager + reload/restart/revoke/heartbeat tests | replaced; trusted reconnect и proposal grant разделены |
| M6 usage | native/CodeBurn/service/panel synthetic fixtures + fake CLI | retained, USG01–USG17 |

## Фактические финальные команды

Только local unit/VM/temp fixtures, отдельные loopback daemon/fake panel и fake HTTP/CLI providers.
Точные stdout/exit summaries находятся локально в ignored `logs/m7-final-*.log`
и `logs/m7-final-results.json`; это runtime evidence, не tracked архив.
Каждая повторная команда ниже действительно запускалась.

| Команда | Exit | Время |
|---|---:|---:|
| `npm.cmd run check:rules` | 0 | 0.81 s |
| `npm.cmd run smoke:frozen-intake` | 0 | 1.05 s |
| `npm.cmd run smoke:network-boundary` | 0 | 7.56 s |
| `npm.cmd run smoke:project-save` | 0 | 4.18 s |
| `npm.cmd run smoke:planning` | 0 | 2.1 s |
| `npm.cmd run smoke:solutions` | 0 | 7.44 s |
| `npm.cmd run smoke:evidence` | 0 | 6.21 s |
| `npm.cmd run smoke:autonomy-bridge` | 0 | 46.62 s |
| `npm.cmd run smoke:autonomy` | 0 | 2.13 s |
| `npm.cmd run smoke:slideshow` | 0 | 4.05 s |
| `npm.cmd run smoke:usage` | 0 | 3.29 s |
| `npm.cmd run smoke:provider-contract` | 0 | 2.57 s |
| `node logs/m7-catalog-check.cjs` | 0 | — |
| `npm.cmd run smoke:network-boundary` | 0 | 7.07 s |
| `npm.cmd run smoke:network-boundary` | 0 | 7.34 s |
| `npm.cmd run smoke:autonomy-bridge` | 0 | 46.91 s |
| `npm.cmd run smoke:bridge` | 0 | 29.06 s |
| `npm.cmd run smoke:project-save` | 0 | 2.62 s |
| `npm.cmd run smoke:planning` | 0 | 3.34 s |
| `npm.cmd run smoke:evidence` | 0 | 4.93 s |
| `npm.cmd run smoke:slideshow` | 0 | 4.11 s |
| `npm.cmd run smoke:usage` | 0 | 3.34 s |
| `npm.cmd run smoke:network-boundary` | 0 | 7.24 s |
| `npm.cmd run check:rules` | 0 | — |
| `git diff --check` | 0 | — |
| `node --check cep-panel/panel.js` | 0 | — |
| `node --check chatgpt-connector/server.js` | 0 | — |
| `node --check mcp-server/autonomous-session.js` | 0 | — |
| `node --check mcp-server/bridge-daemon.js` | 0 | — |
| `node --check mcp-server/codeburn-usage-adapter.js` | 0 | — |
| `node --check mcp-server/command-receipt.js` | 0 | — |
| `node --check mcp-server/http-boundary.js` | 0 | — |
| `node --check mcp-server/mcp-adapter.js` | 0 | — |
| `node --check mcp-server/native-usage.js` | 0 | — |
| `node --check mcp-server/reuse-telemetry.js` | 0 | — |
| `node --check mcp-server/run-outcome.js` | 0 | — |
| `node --check mcp-server/usage-service.js` | 0 | — |
| `node --check scripts/autonomous-mcp-smoke.js` | 0 | — |
| `node --check scripts/autonomous-session-smoke.js` | 0 | — |
| `node --check scripts/autonomy-revocation-smoke.js` | 0 | — |
| `node --check scripts/bridge-only-smoke-test.js` | 0 | — |
| `node --check scripts/chatgpt-connector-smoke.js` | 0 | — |
| `node --check scripts/clean-current-check.js` | 0 | — |
| `node --check scripts/codeburn-usage-adapter-smoke.js` | 0 | — |
| `node --check scripts/fake-project-panel.js` | 0 | — |
| `node --check scripts/frozen-intake-guard.js` | 0 | — |
| `node --check scripts/frozen-intake-smoke.js` | 0 | — |
| `node --check scripts/hardcore-authority-smoke.js` | 0 | — |
| `node --check scripts/http-response-regression-smoke.js` | 0 | — |
| `node --check scripts/native-usage-smoke.js` | 0 | — |
| `node --check scripts/network-boundary-smoke.js` | 0 | — |
| `node --check scripts/network-test-fixture.js` | 0 | — |
| `node --check scripts/panel-heartbeat-smoke.js` | 0 | — |
| `node --check scripts/persistent-autonomy-bridge-smoke.js` | 0 | — |
| `node --check scripts/persistent-autonomy-smoke.js` | 0 | — |
| `node --check scripts/plan-classification-smoke.js` | 0 | — |
| `node --check scripts/plan-repair-smoke.js` | 0 | — |
| `node --check scripts/project-save-plan-smoke.js` | 0 | — |
| `node --check scripts/prompt-optimization-smoke.js` | 0 | — |
| `node --check scripts/property-identity-smoke.js` | 0 | — |
| `node --check scripts/provider-contract-smoke.js` | 0 | — |
| `node --check scripts/run-boundary-smoke.js` | 0 | — |
| `node --check scripts/slideshow-plan-validation-smoke.js` | 0 | — |
| `node --check scripts/smoke-test.js` | 0 | — |
| `node --check scripts/solution-discovery-smoke.js` | 0 | — |
| `node --check scripts/solution-plan-run-smoke.js` | 0 | — |
| `node --check scripts/usage-bridge-smoke.js` | 0 | — |
| `node --check scripts/usage-panel-smoke.js` | 0 | — |
| `node --check scripts/usage-service-smoke.js` | 0 | — |

Отдельные узкие команды до общего прогона: `node scripts/property-identity-smoke.js`,
`network-boundary-smoke.js`, `run-boundary-smoke.js`, `persistent-autonomy-smoke.js`,
`persistent-autonomy-bridge-smoke.js`, `autonomous-session-smoke.js`,
`http-response-regression-smoke.js`, `panel-heartbeat-smoke.js`,
`autonomy-revocation-smoke.js`, `hardcore-authority-smoke.js`,
`chatgpt-connector-smoke.js`, `reuse-telemetry-smoke.js` и `frozen-intake-smoke.js`
после fixes дали exit 0. У сокращённых имён та же команда `node scripts/<имя>`.
Fake provider-contract нужен отдельно для USG08; реальные model calls отсутствуют.

## Transient failures и исправления

| Контрпример/промежуточный сбой | Результат |
|---|---|
| Исходный frozen script/manifest отсутствовал | exit 1; добавлены guard, lock и smoke. |
| Исходный property resolver | negative VM tests red: duplicates/stale/fractional/bulk; после fix 13 групп green. |
| Исходный RUN outcome/result protocol | failed+incomplete дал insufficient (exit 1); result-before-submitted принимался (HTTP 200). Исправлены. |
| Исходный temporary autonomy manager | persistent desiredEnabled отсутствовал; новый regression red до замены manager. |
| Промежуточный NET JSON/oversize | malformed вернул 500; oversize fixture timeout. Общий parser/явный byte limit исправлены. |
| Промежуточный exact duplicate | HTTP 409 из-за неполной сохранённой command identity; receipt identity сохранена. |
| Explicit checkpoint | actual compactCheckpoint терял sourceFile (exit 1); positive plan regression добавлен. |
| Connector legacy assertion | старый публичный /status expectation red; теперь проверяются unauth 401 и auth 200. |
| Review: nested confirmation JSON | actual toolResult/writeJson воспроизвёл leak; recursive sanitize и regression green. |
| Review: long JSX freshness | actual manager терял readiness после 15 s; 16.4 s heartbeat integration green. |
| Review: Hardcore off после dry-run | actual function VM exit 1: mutation при null authority; pinned grant + revoke/off-on guards. |
| Hardcore unknown retry | actual function VM exit 1: unknown_after_delivery создал 3 attempts вместо 1. Timeout/unknown теперь требуют reconciliation; итоговые 6 scenarios green. |
| Legacy Hardcore read-only retries | node scripts/smoke-test.js exit 1: сначала autonomous_session_scope_blocked, затем verification_required для read-only без mutations. Один trusted internalReadOnly predicate сохраняет diagnostic attempts с pinned grant; raw/destructive/save не допускаются. |
| Hardcore negative expectation | Первый raw negative ожидал поздний scope code; actual отказ наступает раньше: dry-run-needs-review/plan_step_blocked при raw count=1. Зафиксирован этот точный gate, ноль mutations; destructive даёт autonomous_session_scope_blocked. Read-only fake inspections допускаются. |
| Catalog verification buffer | git-show ENOBUFS; повтор с явным maxBuffer=16 MiB дал exit 0. |
| Legacy product smoke auth/v2 | direct mutation/старые receipts больше не допустимы; fixtures мигрированы, assertions сохранены, default dev-admin не включается. |
| node scripts/smoke-test.js — migration reds, exit 1 | Negative seam сначала не перехватывал duplicate_layers throw; /agents/key использовал automation token; Hardcore не был явно enabled. Обновлены exact error mapping, panel credential и explicit fixture activation. |
| node scripts/plan-classification-smoke.js — exit 1 | После isolated render root прежний путь стал needs-clarification; fixture output заменён на допустимое basename, исходный risky assertion сохранён. |
| node scripts/smoke-test.js — listen EACCES, exit 1 | Порт 3607 был недоступен; fixture резервирует свободный loopback port через ОС, повтор green. |

Оставшихся failures в выполненном offline наборе нет. Pending live не считается pass.
Assertions не ослаблялись: старые transport ожидания обновлены с дополнительными
negative auth/receipt checks. Legacy handler generation вынесена в безопасный
actual-module script capture без queue/AE; нормальный product smoke не получает admin grant.
Explicit dev-admin проверяется отдельно только в network-boundary fixture.

## R01–R07

| ID | Disposition | Доказательство |
|---|---|---|
| R01 | fixed_offline | dev-http policy/GET/roles и дополнительный Hardcore revoke fallback; actual regressions network-boundary/hardcore-authority. |
| R02 | fixed_offline | Общий async route boundary + bounded typed JSON; malformed/oversize/abort и queue survival actual daemon. |
| R03 | fixed_offline_deployment_not_tested | Connector fail-closed startup/auth/Origin/Host; реальный tunnel/deployment не инспектировался. |
| R04 | fixed_offline_live_scoped | Manual/autonomous A/B и checkpoint guards — isolated actual-module; generated save/reopen — live. |
| R05 | fixed_offline | Contract v2 receipts и lifecycle; exact duplicate idempotent, wrong/conflicting/late denied. |
| R06 | fixed_offline_scoped | Actual generated JSX exact composite identity, strict integers, bulk preflight; scope пяти handlers. |
| R07 | fixed_offline | Actual run-outcome failed precedence + independent coverage; UI/telemetry потребляют оба поля. |

## Acceptance matrix

`pass-offline-scoped` означает только указанное доказательство. Test names без
префикса соответствуют `scripts/<name>-smoke.js` либо npm-группе из package.json.
USG-критерии повторяют контракт M6, но принятие здесь основано на новом offline прогоне;
исторический local CodeBurn snapshot не зачтён новым запуском.

### FZ

| ID | Статус | Current evidence | Test |
|---|---|---|---|
| FZ01 | pass-offline-scoped | Каталог сохранён: 116 inline tool descriptors и 181 registry solutions совпадают с HEAD; полный discovery проверяет импортированные tools. | catalog; solutions; bridge |
| FZ02 | pass-offline-scoped | Статический active import scan допускает только bounded-process-result.cjs; intake entrypoints не загружаются. | frozen-intake |
| FZ03 | pass-offline-scoped | Активные check/smoke entrypoints исключают frozen scripts; исполнение legacy не проверялось. | frozen-intake; package.json |
| FZ04 | pass-offline-scoped | 26 frozen files: временная копия выявляет edit/delete/rename/addition и изменение manifest. | frozen-intake |
| FZ05 | pass-offline-scoped | Нет update режима; --update отвергается, lock не переписывается. CRLF/LF нормализованы. | frozen-intake; check:rules |
| FZ06 | pass-offline-scoped | Активный helper не копируется и не изменён; bounded result/tail/process/JSON contract проверен. | frozen-intake |
| FZ07 | pass-offline-scoped | Dirty/untracked данные сохранены; registry/provenance не менялись, frozen hashes совпадают. | git inventory; catalog; guard |

### ID

| ID | Статус | Current evidence | Test |
|---|---|---|---|
| ID01 | pass-live-generated | Второй duplicate effect выбран по index+name+matchName; соседний одноимённый effect сохранён. | live run a4993182; property-identity |
| ID02 | pass-live-generated | Conflicting/fractional descriptors и плохая bulk target отклонены до первой записи. | live negative runs; property-identity |
| ID03 | pass-offline-scoped | Name-only/matchName-only ambiguous path отклоняется. | property-identity |
| ID04 | pass-live-generated | Fractional identity не округлён в live; NaN/null/unsafe/out-of-range и допустимые fractional value/time покрыты offline. | live negative run; property-identity |
| ID05 | pass-offline-scoped | Уникальные legacy string paths и корректные indexed paths выполняются. | property-identity |
| ID06 | pass-live-generated | Независимый AE read-back до/после save+reopen доказал сохранность duplicate neighbour и layer 2/id 70. | live read-back; property-identity |
| ID07 | pass-offline-scoped | 13 actual-generated-JSX VM групп покрывают пять call sites; остальные потребители перечислены как not individually tested ниже. | property-identity; call-site map |

### NET

| ID | Статус | Current evidence | Test |
|---|---|---|---|
| NET01 | pass-offline-scoped | Normal dev-http/tools/MCP paths сохраняют proposal policy; dev-admin отдельный opt-in, Hardcore без manual fallback. | network-boundary; autonomous-mcp; hardcore-authority |
| NET02 | pass-offline-scoped | GET dev mutation отвергается даже admin credential. | network-boundary |
| NET03 | pass-offline-scoped | Automation не включает autonomy и не подтверждает manual plan поддельным surface; role tokens различны. | network-boundary |
| NET04 | pass-offline-scoped | Invalid JSON/null/array/type/oversize/abort не завершают isolated daemon. | network-boundary |
| NET05 | pass-offline-scoped | После malformed/abort queued legitimate command доставляется и завершается. | network-boundary |
| NET06 | pass-offline-scoped | Public/network connector без auth не стартует; local project/status endpoints требуют token. | network-boundary; chatgpt-connector |
| NET07 | pass-offline-scoped | CLI без Origin и CEP null/file Origin с auth работают; foreign Origin/Host denied. | network-boundary |
| NET08 | pass-offline-scoped | URL token отвергается, startup его не печатает; вложенный tool-result JSON очищается. | network-boundary; http-response-regression |
| NET09 | pass-offline-scoped | Named save исключён из admin/direct/autonomous grant; отдельные manual receipt gates. | network-boundary; project-save |
| NET10 | pass-offline-scoped | Automation/admin не получают manual confirmation credential, включая content[].text. | network-boundary; http-response-regression |

### RUN

| ID | Статус | Current evidence | Test |
|---|---|---|---|
| RUN01 | pass-offline-scoped | Manual proposal A при текущем B запрещён. | run-boundary |
| RUN02 | pass-offline-scoped | Autonomous proposal A при текущем B запрещён. | autonomous-mcp |
| RUN03 | pass-offline-scoped | A/B проверяется перед delivery и синхронно в actual JSX; VM B не выполняет body. | run-boundary |
| RUN04 | pass-offline-scoped | Чужой checkpoint запрещён; явный checkpoint своего проекта проходит, sourceFile сохраняется. | run-boundary |
| RUN05 | pass-offline-scoped | Новая manual revision не заменяется старым proposal; отказ не откатывает fixture state. | run-boundary |
| RUN06 | pass-offline-scoped | Result требует v2 command/execution/lease/owner/generation и submitted stage. | run-boundary |
| RUN07 | pass-offline-scoped | Exact terminal duplicate idempotent; conflicting duplicate denied. | run-boundary |
| RUN08 | pass-offline-scoped | Timeout/unknown/restart не создаёт повторную mutation; Hardcore прекращает retry loop для неопределённого результата. | run-boundary; persistent-autonomy-bridge; hardcore-authority |
| RUN09 | pass-offline-scoped | Known failed check имеет приоритет; coverage=incomplete сохраняется отдельно. | run-boundary; run-outcome |
| RUN10 | pass-offline-scoped | Raw без proof остаётся insufficient/review. | run-boundary; evidence |
| RUN11 | pass-live-generated | Named save сохранил manual CEP gate; checkpoint/hash, marker, close/reopen и independent read-back прошли. | live action act_79813ce; project-save; run-boundary |

### AUT

| ID | Статус | Current evidence | Test |
|---|---|---|---|
| AUT01 | pass-offline-scoped | Fake clock +3 часа сохраняет enabled при свежей панели. | persistent-autonomy |
| AUT02 | pass-live-generated | Реальный CEP Reload сменил generation и сохранил enabled/active. | live panel generations; persistent-autonomy |
| AUT03 | pass-live-generated | Реальный daemon restart восстановил desired on только после trusted panel reconnect; stale grants не восстанавливаются offline. | live PID 27544; persistent-autonomy-bridge |
| AUT04 | pass-offline-scoped | Explicit off переживает restart при успешной записи. | persistent-autonomy-bridge |
| AUT05 | pass-offline-scoped | Новый/повреждённый state off. | persistent-autonomy |
| AUT06 | pass-offline-scoped | Legacy temporary state не становится permanent. | persistent-autonomy |
| AUT07 | pass-live-generated | Explicit CEP off заблокировал следующий mutating run до исполнения; queued/leased и Hardcore branches покрыты offline. | live action act_0b1710; autonomy-revocation |
| AUT08 | pass-offline-scoped | Submitted + reload/restart не даёт duplicate/replay. | persistent-autonomy-bridge |
| AUT09 | pass-offline-scoped | Proposal expiry оставляет desiredEnabled=true. | autonomy-revocation |
| AUT10 | pass-offline-scoped | Stranger/stale generation и automation self-enable denied; heartbeat не bootstrap. | persistent-autonomy-bridge; network-boundary; panel-heartbeat |
| AUT11 | pass-offline-scoped | Project A/B guards сохранены при on. | autonomous-mcp; run-boundary |
| AUT12 | pass-live-generated | Save потребовал отдельный CEP confirmation; raw/destructive exclusions покрыты offline. | live save; autonomous-mcp; project-save |
| AUT13 | pass-live-generated | Реальная установленная CEP показывает persistent toggle без TTL/countdown. | live CEP; persistent-autonomy |
| AUT14 | pass-offline-scoped | Write failures явно отображаются; enable не выдаёт grant, off немедленно отзывает текущий grant. | persistent-autonomy |
| AUT15 | pass-offline-scoped | Без панели enabled остаётся, readiness=false; отдельный heartbeat поддерживает long JSX. | persistent-autonomy; panel-heartbeat |
| AUT16 | pass-offline-scoped | После off submitted result и завершающий read-back принимаются, следующая mutation запрещена. | autonomy-revocation |

### USG

| ID | Статус | Current evidence | Test |
|---|---|---|---|
| USG01 | pass-offline-scoped | Несколько моделей сохраняются отдельными строками native summary. | usage (synthetic fixtures) |
| USG02 | pass-offline-scoped | Неизвестный raw model ID остаётся без выдуманной цены. | usage (synthetic fixtures) |
| USG03 | pass-offline-scoped | Отсутствующее значение null отличается от наблюдаемого нуля. | usage (synthetic fixtures) |
| USG04 | pass-offline-scoped | Повторная загрузка records/report не увеличивает расход. | usage (synthetic fixtures) |
| USG05 | pass-offline-scoped | Cumulative/reset/повторные snapshots не превращаются в increments. | usage (synthetic fixtures) |
| USG06 | pass-offline-scoped | Cache и reasoning остаются подмножествами input/output. | usage (synthetic fixtures) |
| USG07 | pass-offline-scoped | Native и overlapping CodeBurn показаны рядом; combined total=null. | usage (synthetic fixtures) |
| USG08 | pass-offline-scoped | Fake CLI подтверждает сохранение --ephemeral и --json. | provider-contract (fake CLI) |
| USG09 | pass-offline-scoped | Unavailable/invalid/timeout и отсутствующий CLI дают явный статус. | usage (synthetic fixtures) |
| USG10 | pass-offline-scoped | Quota exit=0 без windows даёт partial; только synthetic fixture. | usage (synthetic fixtures) |
| USG11 | pass-offline-scoped | Project/worktree поля сохраняют реальную гранулярность источника. | usage (synthetic fixtures) |
| USG12 | pass-offline-scoped | Model×project не выводится из независимых агрегатов. | usage (synthetic fixtures) |
| USG13 | pass-offline-scoped | Provider-call IDs дедуплицируются; parent/child snapshots и rollups не суммируются. | usage (synthetic fixtures) |
| USG14 | pass-offline-scoped | Allowlist/redaction: prompts, private paths и raw stderr не экспортируются. | usage (synthetic fixtures) |
| USG15 | pass-offline-scoped | Отсутствующий CodeBurn не блокирует bridge health и возможность AE editing. | usage (synthetic fixtures) |
| USG16 | pass-offline-scoped | Fixed argv, timeout/output bounds, coalescing и bounded cache проверены. | usage (synthetic fixtures) |
| USG17 | pass-offline-scoped | API-equivalent estimate вторичен и не превращается в процент подписки. | usage (synthetic fixtures) |

## Ограничения и непроверенные поверхности

- ID07: непосредственно исполнены handlers `set_property_value`, `set_property_keyframes`,
  `set_expression`, `set_effect_property`, `get_effect_details`; read-back читает
  fixture objects независимо от resolver. Остальные потребители общего resolver
  (path geometry, essential graphics, fill keys, expression keyframe, ease/spatial
  tangents, clear_expression, separate shape dimensions, set_effect_enabled,
  puppet paths) не имеют полного индивидуального VM/live identity proof.
  Общий fix не объявляет все AE property types поддержанными.
- Bulk preflight покрывает разрешимые цели затронутого setter. Runtime setter error
  в самом AE не является транзакцией; rollback и universal atomicity не обещаются.
- Checkpoint на диске не гарантирует сохранения произвольных несохранённых ручных изменений AE.
  Generated named-save checkpoint/hash и reopen проверены; manual-revision A/B остаётся
  isolated actual-module proof, а не отдельный live UI experiment.
- Frozen lock ловит расхождение manifest; намеренное совместное изменение guard/lock
  требует review. Это repository integrity gate, не защита от полного OS-доступа.
- AUT off при disk write failure немедленно отзывает процессный grant, но сохранение
  off после restart не гарантируется; UI показывает persistence error. Порядок rename
  протестирован на этой Windows filesystem, crash/power-loss durability не доказана.
- Submitted JSX не прерывается off. Unknown требует reconciliation; reboot не
  восстанавливает незавершённый run автоматически. Старый panel contract требует v2.
- Hardcore сохраняет read-only diagnostic attempts через внутренний контекст и тот же
  pinned grant; request options не включают этот режим. Проверяются actual/record
  read-only risk, ноль mutations и raw steps. Обычный MCP grant не расширен.
- Native usage process-local; CodeBurn aggregates и native не суммируются;
  model×project не выводится из независимых агрегатов; quota и API-equivalent отдельно.
- Static catalog comparison не является M0 runtime snapshot исторического установленного
  daemon. 116 — inline descriptors, не полное число MCP tools с импортированными наборами.
- Целевой reviewer перепроверил sanitize/heartbeat/AUT16; затем Hardcore bypass
  подтверждён actual-function VM и исправлен. Полное повторное review всех handlers не выполнялось.

## Generated-only live checklist (`completed in scoped/hybrid evidence`)

- Live AE/CEP: exact duplicate effect, negative descriptors/bulk, neighbour read-back,
  persistent on across daemon restart + CEP Reload, explicit off denial, protected
  typed save, checkpoint/hash, marker, close/reopen and independent read-back.
- Actual-module/isolated daemon: project A/B and foreign checkpoint, manual-revision stale
  proposal, owner/stage/generation, terminal duplicate, timeout/unknown, corrupt/legacy
  state and heartbeat. Эти cases не переименованы в live AE evidence.
- Generated AEP и runtime logs оставлены локально и ignored; cleanup не выполнялся.

## Review-ready diff

| Блок | Файлы/ответственность |
|---|---|
| FZ | config/frozen-intake-manifest.{json,sha256}, scripts/frozen-intake-{guard,smoke}.js, clean-current-check.js, .rgignore, AGENTS.md |
| Identity/run | bridge-daemon.js, command-receipt.js, run-outcome.js, reuse-telemetry.js, property-identity/run-boundary tests |
| Network | http-boundary.js, bridge routes, mcp-adapter.js, chatgpt-connector/server.js, network-test-fixture, network/http-response/hardcore tests |
| Persistent AUT/CEP | autonomous-session.js, CEP panel.js/index.html, persistent-autonomy(-bridge), autonomy-revocation, panel-heartbeat tests |
| Existing fixtures | fake-project-panel и legacy bridge/planning/save/solution/usage/connector smokes мигрированы на roles/v2; handler assertions сохранены |
| Documentation | README, этот отчёт, TASK_LEDGER/PROGRESS, compact execplan, .codex/handoff.md |
| Pre-existing M6/user work | native-usage/codeburn-usage-adapter/usage-service, usage UI/docs/tests/fixtures, provider-contract ephemeral assertion; сохранены |
| Reference materials | untracked ZIP/package, historical reports/patches, architecture-vNext.md и triage note не удалялись и не выдаются за M7 implementation |

Проверять diff блоками; целый dirty tree содержит M6 и ранее существовавшие материалы.
Dependency/install/global configuration changes отсутствуют. HEAD не менялся.

## Вопросы к следующему сравнению MCP

1. Какие стабильные identifiers поддерживаются для comp/layer/effect/property/key и
   как система ведёт себя при duplicates, reorder и reopen?
2. Одна ли mutation policy применяется к MCP, HTTP, panel, diagnostics/admin и raw JSX?
3. Можно ли получать компактный каталог tools с paging/search/schema-on-demand вместо
   загрузки полного контракта в каждый prompt?
4. Есть ли детерминированные parameterized recipes/builders и чем доказана их версия?
5. Делается ли independent read-back тем же resolver или отдельным наблюдаемым путём?
6. Как продолжение переживает ручную правку, stale proposal, restart и unknown result,
   не повторяя mutation?
7. Разделены ли provider planning и AE execution; где хранятся credentials/permissions?
8. Какие usage поля являются exact, aggregate и unknown; можно ли исключить double count?
9. Как связаны command/execution/lease/generation/result и terminal duplicates?
10. Какие реальные workflow costs: tool calls, latency, payload/token usage, retries,
    raw JSX, human interventions и out-of-scope changes?

## Benchmark protocol для отдельного запуска

- Сравнивать на одном versioned synthetic AEP snapshot, одной модели, effort, service
  tier и одинаковом prompt/task contract. Frozen Intaker исключить; уже импортированные
  product tools считать частью продукта.
- До каждого trial восстанавливать byte-identical AEP и settings; фиксировать SHA-256,
  project/comp fingerprints и tool catalog/version. Минимум 3 независимых повтора.
- Фиксированные задачи: duplicate-property exact set; A/B stale/manual edit; reconnect
  persistent on/off; unknown result without duplicate; nested generated-only edit with
  independent read-back; checkpointed save/reopen.
- Hard correctness: expected target changed exactly, protected neighbours unchanged,
  stale/wrong-project/owner denied before write, semantic+reopen read-back совпадает.
- Измерять wall time, tool calls, schema/payload chars, exact observable tokens по
  источнику, retries, raw JSX count, failures, human actions и residual artifacts.
- Ручное художественное улучшение записывать отдельно от исправления defect. Trial с
  вмешательством не объединять с fully autonomous trial.
- Не суммировать native exact и overlapping aggregate usage. До/после одной сессии при
  параллельной работе не считать причинной экономией.
- Stop conditions: client data discovered, scope mutation, provider call без разрешения,
  lost ownership/generation, unknown after delivery или невозможность clean restore.

Само сравнение, compact MCP и панель готовых кнопок в M7 не реализовывались.
