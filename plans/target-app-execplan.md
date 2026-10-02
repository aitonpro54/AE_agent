# План исполнения Target App

**Codeburn — 2 октября 2026. Progress:** stdio/HTTP get_task_usage/get_usage_history и native journal реализованы (5827223), runtime обновлён в idle, CEP Connected, persistence active. **Decision Log:** explicit runtime UUID; SQLite в Codeburn; native отдельно, guards/auth сохранены; Flash partial patch result независимо исправлен родителем. **Validation:** production-usage/usage/HTTP fixtures, syntax/diff PASS; real MCP/CLI/web totals совпали, query 0,28 с; общий план и proof — Codeburn/PLAN.md. Hooks требуют штатного trust, recovery Windows 5 мин активен.

## Активный baseline

AE Agent 3.2.0 (draft): CEP, bridge, typed tools, reviewed recipes/registry, provider layer. Product target: specs/target-app.md. GitHub baseline 3.1: c6edff9738c20347b802d481d2bb6b3ad9ffc646; исходный HEAD 3.2: d0729f69083ffe4f3156778c699febf55fcb4c2d. Runtime outputs local/ignored. Intaker/importer/supervisors frozen по config/frozen-intake-manifest.json; единственное активное исключение — orchestrator/bounded-process-result.cjs.

## Отдельная версия 3.2 — 2026-10-01

### Progress
- Checkpoint `checkpoint/ae-agent-3.1.0-before-3.2` отправлен на GitHub и прочитан обратно: target `c6edff9`. Ветка `codex/release-3.2.0` создана от `d0729f6`; локальная 3.1 возвращена к checkpoint. Версия canonical surfaces и зависимых checks обновлена до 3.2.0; описан постоянный порядок выпуска.
- Завершено: версия подготовлена commit `b86fd2c`, ветка 3.2 отправлена на GitHub, открыт draft PR №5: https://github.com/aitonpro54/AE_agent/pull/5 (head 3.2 → base 3.1). PR №4 остаётся OPEN на `c6edff9`; merge не выполнялся.

### Decision Log
- 29 накопленных commits принадлежат новой 3.2; remote 3.1 не меняется. Checkpoint фиксирует исходники, а не установленную CEP/открытый AEP. Исторические release/evidence versions не переписываются.
- До принятия PR №4 draft PR 3.2 сравнивается с веткой 3.1, но не сливается в неё. После принятия 3.1 в main — смена base и новая проверка diff отдельным поручением. Policy: docs/release-workflow.md.

### Validation
- Preflight: remote 3.1=`c6edff9`, HEAD=`d0729f6`, target branch/tag отсутствовали; annotated checkpoint опубликован и peeled target совпал. Существующие чужие untracked материалы сохранены.
- check:rules, bridge/planning/solutions/autonomy-bridge, шесть placeholder groups и plan-run-recovery — exit0. Syntax девяти изменённых JS и diff — PASS. Все daemon tests изолированы; live AE/CEP/provider/AME не запускались. Logs: .codex-runtime/release-3.2.0/.
- Remote read-back подтвердил опубликованный HEAD `b86fd2c`, неизменную 3.1=`c6edff9`, peeled checkpoint=`c6edff9` и PR №5 OPEN/isDraft=true с правильными head/base. После принятия PR №4 в main остаётся сменить base №5 и проверить diff; условие пока не наступило.

## Улучшения плейсхолдеров — 2026-09-30

### Progress
- Этап 1 завершён, commit `debb562`: bounded candidates/optional FFprobe, подтверждённый выбор, guarded relink по ID, адресный независимый read-back, recipe. Подробности: docs/placeholder-improvements-report.md.
- Этап 2 завершён, commit `8964d98`: source/occurrence map, явные группы, trusted CEP acceptance, persistent protection и stable-ID rebind. 36 usage fixtures, protection memory/actual JSX/isolated daemon и panel-handler VM PASS.
- Этап 3 завершён, commit `edbc9bc`: cover/subject-box/free-interval helper интегрирован в builder/read-back; owned live-link controls/contact sheet, pinned Flash review batches и exact cleanup.
- Этап 4 завершён: outcome v2, сохранённые server run records/read-only reconcile, semantic проверки transform/property по ID, запрет repair/Hardcore replay и CEP «Сверить результат». Итоговые bridge/planning/recovery/autonomy и статические проверки пройдены; изменения оформлены отдельным commit.

### Decision Log
- Расширять существующие tools/library; один writer. Offline fixtures/isolated daemon/JSX VM; AEP/save/reopen/revert, новые зависимости и изменение gates исключены.
- Два Flash хода дали partial files + timeout; процессы и фактическое состояние сверены, затем ae_specialist закрыл инженерные defects. Последний MCP отказ — дублированный recipe ID, не отказ доступа. Повтор мутаций/live demo отсутствует.
- Этап 2: после Flash-коррекций UNC canonicalization закрыта specialist; bounded review нашёл два ID/index обхода protection. Unsupported setter aliases теперь отвергаются helper/gate/actual JSX до undo; documented expected IDs разрешаются единообразно.
- Этап 3: static 2D/PAR1 geometry отдельно от sampled artistic review. Только actual official image views, hash/pin и конкретные observations дают доказательство; partial/stale batches — incomplete. Ownership проверяется по server UUID/ID/project/receipt, prefix недостаточен. Source drift останавливает создание до undo.
- Этап 4: execution/mutation/verification независимы; submitted timeout — unknown, readback timeout после receipt — applied/pending. Сверка подтверждает текущие postconditions, не выдумывает потерянный historical receipt. Mismatch не доказывает not_applied. Strict property identity сохраняется; отсутствующий checker — needs_review. MCP autonomy принимает только полный proposal identity tuple; exact pins/current/replay проверяет existing runner.

### Validation
- Этап 1: smoke:placeholder-recovery (helper/actual JSX VM/isolated daemon AE0), placeholder-plan, semantic-verification, smoke:solutions, real FFprobe 2 MP4, 7 JS syntax/rules/diff — PASS. Offline proof не live/художественная приёмка.
- Этап 2: usage 36/36, protection+CEP-role+panel VM, planning, placeholder-plan/recovery, solutions 183, 15 JS syntax/rules/diff — PASS. Два review regressions дают 0 writes/undo; preserving VM writes 2, live AE0.
- Этап 3: framing 83 assertions + 35 boundary cases; visual actual JSX VM/full ordinary isolated runner/batches; planning, plan/protection/recovery/usage, solutions 184, 21 JS syntax/rules/diff — PASS. Actual Flash09: 7 PNG views/6 observations/2 cuts rejected; synthetic drawings, не AE render/клиентская приёмка.
- Этап 4: outcome20/reconciliation39/semantic41 границы, actual JSX/panel VM и ordinary isolated runner — PASS. Planning, solutions185/RU-EN16, шесть placeholder groups, evidence, полный bridge/autonomy — PASS. Отсутствующие proposal pins дают ранний отказ с AE0; timeout/index/manual drift не повторяют запись. Rules, JS syntax и diff — PASS. Native Node shutdown transient повторно проверен успешным полным autonomy suite; live AE/установленная CEP не менялись.

## Маршрутизация и самостоятельный мост — 2026-09-30

- Progress 2026-10-01: по прямому поручению добавлен постоянный project-only доступ Flash к 141 AE MCP tool; прежний headless отказ `get_placeholder_protection` устранён реальным вызовом Flash. Панель/bridge установлены 3.2.0, Connected и чтение AEP подтверждены.
- Decision Log 2026-10-01: точные grants текущего каталога сохраняются для будущих задач; global bypass/credentials и server gates не менялись. Raw/delete/restore/save/provider direct grants не добавлялись. Контракт: docs/antigravity-ae-access.md. Основная live задача продолжается по уже заданным сценам.
- Validation 2026-10-01: backup/read-back145 grants (141 MCP, docs read, bounded media helper, точные read-only git grep/ls-files), сохранность остальных project JSON полей и actual Flash model/MCP read PASS. Native импорт8 sources и независимое чтение IDs4984–4991 подтверждены. Run04/05 прерваны сетью;05 также содержит denied незаявленной команды. Imports не повторяются, fresh05 observations сохранены. Это проверка доступа/импорта, не художественная приёмка плейсхолдеров; live продолжение06 ограничено Scene3.

- Progress: модель/effort чата свободно выбирает пользователь; Sol 6.1/high рекомендован. Проектные model/effort и default_subagent overrides удалены. Делегирование: простые поручения Luna/medium, средние Flash/high, блокеры Sol/xhigh, архитектура Sol/ultra, Astra/high после неудачи Ultra; контроль выбранной моделью чата. 1 октября роли `ae_scout`/`ae_operator` получили 272000 токенов при общем окне 500000; 2 октября глобальный порог автосжатия и профили Astra/media получили 425000, три роли Luna — 230000.
- Decision Log: маршрут относится к делегированию и не ограничивает UI/CLI выбор. Flash в AE Agent и VideoScout имеет разные проектные границы; один короткий вызов выполняет диспетчер. Два помощника суммарно включая AGY/Ultra. Загруженные роли требуют новой загрузки; provider и AE grants не переключались. `luna-standard` выбирается явно с high; пороги автосжатия 425000/230000 задаются в глобальных/ролевых TOML и не запускают handoff.
- Validation: rules/diff, TOML config без model/effort/default_subagent overrides, сохранность остальных настроек/MCP и metadata/references skills — PASS. Роли и каталог проверены ранее; LLM/live AE/UI selector не запускались. Evidence: .codex-runtime/routing-2026-09-30/{validation,luna-validation,model-choice-validation}.json. PATH CLI 0.156.1 старее Desktop 0.159.2; quick_validate без PyYAML недоступен. 1 октября сверены TOML ролей и тексты маршрута. 2 октября разобраны шесть TOML с порогами, сверены наследование семи ролей и сохранность остальных полей; `check:rules` и `git diff --check` PASS.

## Автономная сессия и правила AE-текста — 2026-09-29

- Progress: новое предпочтение auto-on при первом доверенном подключении CEP;   off/повреждённый state остаются off. Правила афиш и частичного плана в `AGENTS.md`.   Четыре плашки остановлены без рендера по просьбе пользователя.
- Decision Log: файловый доступ Codex не заменяет bridge permission; кнопка даёт   только MCP-исполнение typed plans, не поиск, capture, promotion или статистику.   Live bridge уже хранит on, но панель отключена; новый default вступит при restart.
- Validation: `smoke:autonomy-bridge`, `check:rules`, syntax, diff — pass offline;   live первого подключения нового профиля не проверялось.

## Контроль подписки по этапам 2026-09-28

- Progress: `report:quota` читает квоту и start/since; исправлены `usedPct` и известный shutdown crash. `report:task-usage` считает уникальные root/child responses; парные checkpoint и локальный empirical estimator добавлены.
- Decision Log: account delta отдельно от task estimate; проценты задачи требуют 3 проверенных интервала, model/speed weights и подтверждённой изоляции. Пока данных нет — null. Ledger не домысливает детей и не суммирует cumulative snapshots; без polling/LLM.
- Validation: CodeBurn 21% Weekly used на 11:47:57Z (+3 п.п. аккаунта от start, attribution unknown, partial/shutdown warning); native Codex usage API также 21%. Парный ledger выбранных текущего и предыдущего root+child: 335 responses, input 40 022 398 (cached 39 157 248), output 146 598; task estimate null без 3 изолированных интервалов/весов. Offline smokes ledger/quota/estimate, rules/diff; CEP/AE не менялись.

## Ревью плейсхолдеров и делегации 2026-09-28

### Progress

- Разобран чат заполнения `60p_slide_4`, CU-вызовы, три AGY-задания и usage ledger.   Две ограниченные разведки выполнены ae_scout на runtime-подтверждённой Luna/high.
- Отчёт и смета: `docs/placeholder-workflow-review-2026-09-28.md`.   Routing обновлён; внедрены AGY preflight, typed placeholder builder/read-back, компактный evidence, 3 кадра, пассивный AME snapshot и offline submit guard.

### Decision Log

- Основная AE-сборка уже typed; оптимизировать адресные кадры, ожидание AME,   размер evidence, ограничение AGY scope и выбор исполнителя. Gates не ослаблять.
- A/B-экономия неизвестна; cache, usage и прогноз разделены. AME file growth и UI `done` не доказывают completion. Проверена AME 26.2.0.52: UXP getJob/getStatus с 27.0; нужен AME job ID из submit, точного range read-back в RenderJob нет. Adapter блокирован. Offline guard атомарно блокирует повтор по destination после unknown, но пока не подключён к submit. Live AE/AME и отправка job не проводились.

### Validation

- Usage рассчитан по уникальным response IDs, сумма сверена с thread ledger.   Локальные evidence/подсчёт сохранены под ignored `.codex/`.
- `npm.cmd run check:rules` — pass; `git diff --check` — pass.
- AGY input/terminal contract завершён в VideoScout `09d836e`/`6e6a8ec`:   134 offline tests pass, 1 skip; live AGY не запускался. Placeholder preflight   фиксирует IDs/timing; verifier сравнивает свежий read-back; `responseView:placeholder`   сокращает MCP-ответ; `frameReview` даёт до 3 точек (`docs/placeholder-preflight.md`). AME snapshot/media probe — `docs/ame-passive-status.md`; адресные offline smokes, syntax/rules/diff pass. Следующий scope: совместимый AME adapter после обновления host.
- Ограниченные fixtures: `docs/optimization-fixtures.md` — 6 placeholder plans/18 кадров, AME passive/metadata; JSON bytes измерены, model usage и A/B экономия неизвестны. Реальный синтетический MP4 проверен отдельным `smoke:ame-media`.

## Узкое исправление независимого ревью 2026-09-23

### Progress

- SV-01: black-box полный semantic module воспроизвёл три ложных `passed` до патча;   actual-module регрессии проверяют `set_property_value` и `set_effect_property`,   composite path, comp/layer, bulk и верный read-back.
- USG-01: завершившийся provider call с `usage:null` остаётся записью с unknown метриками;   известная сумма остаётся subtotal, repair без вызова не создаёт запись.
- CB-01/02/03: byte-capped UTF-8, ограниченный settle, period-specific coalescing/cache   и проверка периода ответа; Windows `.cmd` проверен только временным fake executable.

### Decision Log

- Reference `source/` из ZIP не применялись к production. Старые SEM excerpt-пробы не   засчитаны как проверка полного модуля. Результаты — `.codex-runtime/review-fix-2026-09-23/`.
- Не менялись frozen boundary, автономный TTL, auth/receipt/save gates и зависимости.   Полный AE runner и live AE/CEP остаются непроверенными в этом scope.

### Validation

До исправления новые регрессии SV/USG/CB падали (exit 1); после исправления black-box, адресные offline smokes, `check:rules`, syntax и diff checks прошли. Штатные составные `smoke:planning` и `smoke:usage` не запускались, поскольку включают bridge daemon; точные команды и exit codes сохранены в `verification-results.json`.

### Follow-up независимого ревью

- Progress: CodeBurn v0.9.24 передаёт читаемую метку в `period`, enum в `periodKey`;   CB-03 теперь проверяет `periodKey`, а legacy `period` принимает только как точный enum.   Fixture `set_effect_property` использует относительный входной путь при полном   composite path в результате и read-back; semantic production code не менялся.
- Decision Log: actual-shaped CodeBurn fixture сначала дала exit 1 на прежнем коде;   настоящий CodeBurn и live AE/CEP остаются вне текущего offline scope. Уже отделившийся   Windows descendant после выхода launcher — отдельный остаточный риск.
- Validation: адресные CodeBurn, semantic, usage offline smokes, `check:rules`, syntax   и diff checks выполнены после исправления; точные exit codes — в локальном   `.codex-runtime/review-fix-cb03-2026-09-23/`.

## Текущий milestone — M7 завершён, release 3.1.0

2026-09-22: credential blocker устранён отдельным `AE_BRIDGE_PANEL_TOKEN` без ослабления auth/Origin/Host gates. Generated fixture `.codex-runtime/review-remediation-live/CODX_REMEDIATION_LIVE.aep` подтверждён по path/session evidence; клиентские AEP и media не использовались.

Live acceptance: второй из двух одноимённых Fill изменён по composite identity; fractional/conflicting/stale descriptors и плохая bulk target отказали до записи; соседние/out-of-scope объекты сохранены. Persistent autonomy пережила daemon restart и реальный CEP Reload с новой generation. Explicit off заблокировал следующий proposal-backed mutating run до исполнения. Typed save прошёл через CEP confirmation: checkpoint сохранил исходный SHA-256, marker записан, новый hash подтверждён, проект закрыт, повторно открыт и независимо прочитан. Точные IDs/hashes — в M7 report.

Остальные A/B, owner/stage/generation, terminal duplicate, unknown/replay, corrupt/ legacy state и heartbeat cases закрыты actual-module/isolated-daemon regressions. Они честно отделены от live AE proof. Обязательная offline-матрица зелёная; после этого канонические package/daemon/adapter/CEP поверхности подняты до 3.1.0.

### Progress

- [x] FZ: manifest/lock/guard, temp edit/delete/rename/addition/lock/CRLF regressions.
- [x] ID/R06: exact indexed candidate + name/matchName validation, strict identity numbers,   preflight bulk targets; actual generated JSX и независимый fixture read-back.
- [x] NET/R01–R03: роли automation/panel/dev-admin, GET read-only, bounded JSON,   async route boundary, connector auth/Origin/Host, nested credential sanitation.
- [x] RUN/R04/R05/R07: project/checkpoint parity, delivery+JSX checks, receipt v2,   exact duplicate idempotency, unknown no replay, failed + separate coverage.
- [x] AUT: durable desiredEnabled, trusted reconnect, explicit off, corrupt/legacy off,   persistence errors, heartbeat без leasing, submitted result/read-back continuity.
- [x] Hardcore grant pinned: off/off-on между draft/dry-run/run не даёт manual fallback.
- [x] M6 usage сохранён: USG01–USG17 synthetic/fake tests pass, quota отдельно.
- [x] Все обязательные offline группы, syntax и diff check выполнены; см. actual exits в отчёте.
- [x] Установленная CEP: role migration, reload/reconnect и live read-only v2 proof.
- [x] Пять AE/CEP-скиллов пересобраны после диагностики без их применения.
- [x] Generated-only live identity, negative preflight, restart/reload/off и save/reopen proof.
- [x] Version 3.1.0 + canonical consistency gate; release branch `codex/release-3.1.0`.

### Decision Log

- Ошибка панели вызвана пропущенной миграцией launch env; причинная связь со скиллами   не подтверждена. Токены раздельны, security gates не ослаблены. Локальная config   применяется к новым adapter-процессам; уже запущенный adapter имеет старый env.
- 68 acceptance IDs закрыты указанным offline evidence; live subset отдельно. ID07: пять handlers непосредственно проверены, остальные resolver consumers не объявляются автоматически поддержанными.
- Persistent on не хранит вечный proposal token и не расширяет raw/destructive/save scope. Off не прерывает submitted JSX; следующие mutations запрещены, unknown требует сверки. Ошибка сохранения off отзывает process grant, durability после restart неизвестна.
- Post-bump файлы установленной CEP и daemon 3.1.0 проверены по hash/runtime. После   долгого AE startup native menu и панель показали `AE Agent 3.1.0`; панель Connected,   autonomy off, queue/inflight пусты, точный generated AEP повторно прочитан через MCP.
- Legacy handler assertions идут через actual-module capture без admin grant. Frozen manifest baseline не обновляется обычными проверками; thaw — отдельный scope.
- Native exact и overlapping CodeBurn aggregates не суммируются; unknown=null, model×project не выводится догадкой, dollars≠quota. Новых production deps/frozen-baseline изменений нет; merge не разрешён.

### Validation

check:rules; smoke:frozen-intake/network-boundary/project-save/planning/solutions/evidence; smoke:autonomy-bridge/autonomy/slideshow/usage/provider-contract/provider-api/bridge/ panel-auth — pass. Node syntax и diff checks — pass. Generated AE/CEP live — pass в явно перечисленном scope. Providers/CodeBurn network/quota, Local/Ollama, client AEP, full-intake и broad CEP smoke не запускались. Installed CEP release files совпали с repo по SHA-256; daemon после безопасного restart сообщил version 3.1.0, PID 7616, autonomy off. Точные команды, transient failures и scope каждого proof — в отчёте M7.

## Следующие отдельные scope

M7 release не требует дальнейшей generated-only работы. Отдельно остаются client visual acceptance, public connector deployment и MCP comparison по готовому benchmark protocol. Backlog: bounded composition audit builder (docs/proposals/repeated-composition-audit.review.json), synthetic A/B и RU retrieval. Candidate source остаётся quarantine; promotion отдельно.

## Frozen Full Intake backlog (историческая справка)

Run: full-intake-aturtur-after-effects-scripts. Ledger: .codex-runtime/sdk/generic-repo-importer/aturtur-after-effects-scripts-19599911-intake/queue-ledger.json. Последний accepted candidate: tool-ar_distributekeyframestolayer, commit 577cd6e. Counts: entries=46, completed=27, queued=0, blocked_live_lane_required=18, blocked_policy=1, failed=0. Эти jobs не запускались и их совместимость не перепроверялась. Generic SDK migration, Local/Ollama/fallback, broad CEP smoke, dependencies и новые live/provider trials требуют отдельного scope; local-use source не означает публикацию JSX.

## Live клиентский AEP — 1–2 октября 2026, завершён

### Progress

26 видеослоёв/18silent1280×720/25fps/101frame/PAR1 клипов приняты. Root51reads/205checks, sourcehashes/overlap0, 16HOLDkeys и samples PASS. 12+20newPNG и прежние32source22/16normalization реально просмотрены, diskproof совпал. Финал16instances/13targets/7groups:6×2+Led1; разные фрагменты и cuts по заданным сценам. Product20/23/HOLD исправления приняты; docs/generated-png-proof.md, imported-source-proof.md, keyframe-native-proof.md.

### Decision Log

Границы/disabled variants/mattes/parents/Scene8 сохранены;16finalparent baselines PASS. Project itemIndex послеimports не identity. MAINremap12.64→.64,13.68→1.68,15→3,16.4/25.64→4; sharedcuts.24/.48/1.68/3.00.221exactAGYgrants; required_commands≠grants. Flash19cquota доwrites, Solfallback послеidle.10unregisteredreviewcomps сохранены; old19bJSON/SHA и false/partialreceipts не повышены. Groups track-based, Europecosmic; titleocclusion/тёмные карточки остаются с неустановленной причиной.

### Validation

Rules/semantic65+43+73/property/generated-safety/portablePNG/library/planbuilder/node/diff и HOLD40portable/41local PASS; sourcefullprobes/actualviews/hash/persistentcopy PASS. AEPtest_live.aep/421items открыт безsave/reopen/render; runtimePID4012/code81f25d8/SHA b8adbf319d4d9d6f393f76268236a70a2ea7ba24a1fe6ef1d9406e09bd704408,pending0/inflight[]/editnull. Runtimeданные исторические, обновлять перед новой live операцией.

## Оптимизация монтажа — 2 октября 2026

### Progress

Этап1 завершён: workflow/skills65d2379, full/summary/evidence7ae3522, completion50d5cd6. Контракты: docs/{montage-workflow,compact-plan-results,ae-task-completion,ae-skills-contract-audit}.md. По поручению пользователя подготовлены планы этапов2/3: plans/{montage-pipeline,agy-bridge-reliability}-execplan.md; старт нового чата: docs/optimization-stage-2-start.md. Реализация2/3 не начата.

### Decision Log

Full по умолчанию; полная проверка до сокращения, recorded≠fresh, unknown требует сверки. AE gates/маршрут сохранены; AEP/frozen/global/общий agy не менялись.230 exact grants:8 offline commands+1 read-only evidence. Flash потерял provider socket после code/tests; процесс завершён, Sol/high завершил прежние блоки2–3 в том же scope. Verifier drift удалён; insufficient/pass assertion уточнён по HEAD proof без изменения verifier. Changed без before proof неизвестен; PNG/declaration≠task acceptance. Этап2 — AE Agent/offline, этап3 — отдельный repo/scope; handoff создан только по явной просьбе о новом чате, scopes не объединяются.

### Validation

Этап1: rules/diff/skills fields/links PASS; quick_validate недоступен(PyYAML), deps неизменны. Compact:6 counterexamples+actual modules/HTTP/runner/parity/persistence/replay/numeric/Unicode PASS;20steps132153→12249bytes≤12KiB. Completion23groups PASS, large receipts/сменаhash/unknown; реальная failed AGY metadata=failed/unknown, exit1 ожидаем. Idle daemon21508/sourceSHA69d6616c/connected/on/queues0/editnull проверен исторически; AEP commands0. Подготовка этапов2/3: текущие builders и audit agybe1a3b0 сверены, doc/rules/diff checks; code/live/provider не запускались. Расход измерять на следующем порученном монтаже.
