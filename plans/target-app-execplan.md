# План исполнения Target App

## Активный baseline

AE Agent 3.1.0: CEP, bridge, typed tools, reviewed recipes/registry, provider layer.
Product target: specs/target-app.md. Начальный HEAD review-fix: 9f34a1a2fe8ca271944745f7149085fa39077331.
Runtime outputs local/ignored. Intaker/importer/supervisors frozen по config/frozen-intake-manifest.json;
единственное активное исключение — orchestrator/bounded-process-result.cjs.

## Контроль подписки по этапам 2026-09-28

- Progress: `report:quota` читает квоту и start/since; исправлены `usedPct` и известный shutdown crash. `report:task-usage` считает уникальные root/child responses; парные checkpoint и локальный empirical estimator добавлены.
- Decision Log: account delta отдельно от task estimate; проценты задачи требуют 3 проверенных интервала, model/speed weights и подтверждённой изоляции. Пока данных нет — null. Ledger не домысливает детей и не суммирует cumulative snapshots; без polling/LLM.
- Validation: quota=Codex (20% Weekly на 11:21Z; +2 п.п. аккаунта от start, task estimate null); CLI start/since и парный checkpoint. Offline smokes проверяют ledger и fail-closed калибровку; rules/syntax/diff checks. CEP/AE не менялись.

## Ревью плейсхолдеров и делегации 2026-09-28

### Progress

- Разобран чат заполнения `60p_slide_4`, CU-вызовы, три AGY-задания и usage ledger.
  Две ограниченные разведки выполнены ae_scout на runtime-подтверждённой Luna/high.
- Отчёт и смета: `docs/placeholder-workflow-review-2026-09-28.md`.
  Routing обновлён; внедрены AGY preflight, typed placeholder builder/read-back, компактный evidence, 3 кадра и пассивный AME snapshot contract.

### Decision Log

- Основная AE-сборка уже typed; оптимизировать адресные кадры, ожидание AME,
  размер evidence, ограничение AGY scope и выбор исполнителя. Gates не ослаблять.
- A/B-экономия неизвестна; cache, фактический usage и прогноз разделены.
  AME file growth и UI `done` без media probe не означают verified completion; локальная AME 26.2 ниже UXP RenderJob 27.0;
  live AE/AME и отправка job в эти offline milestones не входили.

### Validation

- Usage рассчитан по уникальным response IDs, сумма сверена с thread ledger.
  Локальные evidence/подсчёт сохранены под ignored `.codex/`.
- `npm.cmd run check:rules` — pass; `git diff --check` — pass.
- AGY input/terminal contract завершён в VideoScout `09d836e`/`6e6a8ec`:
  134 offline tests pass, 1 skip; live AGY не запускался. Placeholder preflight
  фиксирует IDs/timing; verifier сравнивает свежий read-back; `responseView:placeholder`
  сокращает MCP-ответ; `frameReview` даёт до 3 точек (`docs/placeholder-preflight.md`). AME snapshot/media probe — `docs/ame-passive-status.md`; адресные offline smokes, syntax/rules/diff pass. Следующий scope: совместимый AME adapter после обновления host.

## Узкое исправление независимого ревью 2026-09-23

### Progress

- SV-01: black-box полный semantic module воспроизвёл три ложных `passed` до патча;
  actual-module регрессии проверяют `set_property_value` и `set_effect_property`,
  composite path, comp/layer, bulk и верный read-back.
- USG-01: завершившийся provider call с `usage:null` остаётся записью с unknown метриками;
  известная сумма остаётся subtotal, repair без вызова не создаёт запись.
- CB-01/02/03: byte-capped UTF-8, ограниченный settle, period-specific coalescing/cache
  и проверка периода ответа; Windows `.cmd` проверен только временным fake executable.

### Decision Log

- Reference `source/` из ZIP не применялись к production. Старые SEM excerpt-пробы не
  засчитаны как проверка полного модуля. Результаты — `.codex-runtime/review-fix-2026-09-23/`.
- Не менялись frozen boundary, автономный TTL, auth/receipt/save gates и зависимости.
  Полный AE runner и live AE/CEP остаются непроверенными в этом scope.

### Validation

До исправления новые регрессии SV/USG/CB падали (exit 1); после исправления
black-box, адресные offline smokes, `check:rules`, syntax и diff checks прошли.
Штатные составные `smoke:planning` и `smoke:usage` не запускались, поскольку включают
bridge daemon; точные команды и exit codes сохранены в `verification-results.json`.

### Follow-up независимого ревью

- Progress: CodeBurn v0.9.24 передаёт читаемую метку в `period`, enum в `periodKey`;
  CB-03 теперь проверяет `periodKey`, а legacy `period` принимает только как точный enum.
  Fixture `set_effect_property` использует относительный входной путь при полном
  composite path в результате и read-back; semantic production code не менялся.
- Decision Log: actual-shaped CodeBurn fixture сначала дала exit 1 на прежнем коде;
  настоящий CodeBurn и live AE/CEP остаются вне текущего offline scope. Уже отделившийся
  Windows descendant после выхода launcher — отдельный остаточный риск.
- Validation: адресные CodeBurn, semantic, usage offline smokes, `check:rules`, syntax
  и diff checks выполнены после исправления; точные exit codes — в локальном
  `.codex-runtime/review-fix-cb03-2026-09-23/`.

## Текущий milestone — M7 завершён, release 3.1.0

2026-09-22: credential blocker устранён отдельным `AE_BRIDGE_PANEL_TOKEN` без
ослабления auth/Origin/Host gates. Generated fixture
`.codex-runtime/review-remediation-live/CODX_REMEDIATION_LIVE.aep` подтверждён
по path/session evidence; клиентские AEP и media не использовались.

Live acceptance: второй из двух одноимённых Fill изменён по composite identity;
fractional/conflicting/stale descriptors и плохая bulk target отказали до записи;
соседние/out-of-scope объекты сохранены. Persistent autonomy пережила daemon restart
и реальный CEP Reload с новой generation. Explicit off заблокировал следующий
proposal-backed mutating run до исполнения. Typed save прошёл через CEP confirmation:
checkpoint сохранил исходный SHA-256, marker записан, новый hash подтверждён, проект
закрыт, повторно открыт и независимо прочитан. Точные IDs/hashes — в M7 report.

Остальные A/B, owner/stage/generation, terminal duplicate, unknown/replay, corrupt/
legacy state и heartbeat cases закрыты actual-module/isolated-daemon regressions.
Они честно отделены от live AE proof. Обязательная offline-матрица зелёная; после
этого канонические package/daemon/adapter/CEP поверхности подняты до 3.1.0.

### Progress

- [x] FZ: manifest/lock/guard, temp edit/delete/rename/addition/lock/CRLF regressions.
- [x] ID/R06: exact indexed candidate + name/matchName validation, strict identity numbers,
  preflight bulk targets; actual generated JSX и независимый fixture read-back.
- [x] NET/R01–R03: роли automation/panel/dev-admin, GET read-only, bounded JSON,
  async route boundary, connector auth/Origin/Host, nested credential sanitation.
- [x] RUN/R04/R05/R07: project/checkpoint parity, delivery+JSX checks, receipt v2,
  exact duplicate idempotency, unknown no replay, failed + separate coverage.
- [x] AUT: durable desiredEnabled, trusted reconnect, explicit off, corrupt/legacy off,
  persistence errors, heartbeat без leasing, submitted result/read-back continuity.
- [x] Hardcore grant pinned: off/off-on между draft/dry-run/run не даёт manual fallback.
- [x] M6 usage сохранён: USG01–USG17 synthetic/fake tests pass, quota отдельно.
- [x] Все обязательные offline группы, syntax и diff check выполнены; см. actual exits в отчёте.
- [x] Установленная CEP: role migration, reload/reconnect и live read-only v2 proof.
- [x] Пять AE/CEP-скиллов пересобраны после диагностики без их применения.
- [x] Generated-only live identity, negative preflight, restart/reload/off и save/reopen proof.
- [x] Version 3.1.0 + canonical consistency gate; release branch `codex/release-3.1.0`.

### Decision Log

- Ошибка панели вызвана пропущенной миграцией launch env; причинная связь со скиллами
  не подтверждена. Токены раздельны, security gates не ослаблены. Локальная config
  применяется к новым adapter-процессам; уже запущенный adapter имеет старый env.
- 68 acceptance IDs закрыты указанным offline evidence; live subset помечен отдельно.
- ID07: непосредственно проверены пять handlers; остальные resolver consumers не
  объявляются автоматически поддержанными.
- Persistent on не хранит вечный proposal token и не расширяет raw/destructive/save scope.
- Off не прерывает уже submitted JSX; следующая mutation запрещена. Unknown требует сверки.
- При ошибке сохранения off процессный grant отзывается, durability после restart неизвестна.
- Post-bump файлы установленной CEP и daemon 3.1.0 проверены по hash/runtime. После
  долгого AE startup native menu и панель показали `AE Agent 3.1.0`; панель Connected,
  autonomy off, queue/inflight пусты, точный generated AEP повторно прочитан через MCP.
- Legacy handler assertions идут через безопасный actual-module capture без admin grant.
- Manifest baseline не обновляется обычными проверками; thaw — отдельный reviewed scope.
- Native exact и overlapping CodeBurn aggregates не суммируются; unknown=null,
  model×project не выводится из отдельных агрегатов, dollars не превращаются в quota.
- Новых production dependencies и frozen-baseline изменений нет; merge не разрешён.

### Validation

check:rules; smoke:frozen-intake/network-boundary/project-save/planning/solutions/evidence;
smoke:autonomy-bridge/autonomy/slideshow/usage/provider-contract/provider-api/bridge/
panel-auth — pass. Node syntax и diff checks — pass. Generated AE/CEP live — pass в
явно перечисленном scope. Providers/CodeBurn network/quota, Local/Ollama, client AEP,
full-intake и broad CEP smoke не запускались. Installed CEP release files совпали с repo
по SHA-256; daemon после безопасного restart сообщил version 3.1.0, PID 7616, autonomy off.
Точные команды, transient failures и scope каждого proof — в отчёте M7.

## Исторический контекст, не доказательство M7

- PR #1–#3 объединены в main 2026-09-19; история и старые ветки сохранены.
- F01–F17: прежние commits 417e465, 4c0c2f1, 8175c1f, ca6922d, 0bc1171;
  отдельный synthetic live scope проверял keys/scope/stale B/save-reopen.
- Прежний client AEP восстановлен clean; клиентская/визуальная приёмка неизвестна.
- Production stop: первые 10 собраны; аудиохвост 13 мс и визуальная приёмка не завершены.
  В master 14 пар; источник не изменён. Подробности: docs/autonomous-editing.md.
- M6 2026-09-19: native usage + optional CodeBurn 0.9.24; quota без windows = partial.
  Исторический read-only report не считается новым M7 network запуском.
- Старый temporary 20-minute grant заменён M7 persistent contract; прежние live/runtime
  observations не доказывают работу нового варианта в установленной панели.

## Следующие отдельные scope

M7 release не требует дальнейшей generated-only работы. Отдельно остаются client visual
acceptance, public connector deployment и MCP comparison по готовому benchmark protocol.
Backlog: bounded composition audit builder (docs/proposals/repeated-composition-audit.review.json),
synthetic A/B и RU retrieval. Candidate source остаётся quarantine; promotion отдельно.

## Frozen Full Intake backlog (историческая справка)

Run: full-intake-aturtur-after-effects-scripts.
Ledger: .codex-runtime/sdk/generic-repo-importer/aturtur-after-effects-scripts-19599911-intake/queue-ledger.json.
Последний accepted candidate: tool-ar_distributekeyframestolayer, commit 577cd6e.
Counts: entries=46, completed=27, queued=0, blocked_live_lane_required=18,
blocked_policy=1, failed=0. Эти jobs не запускались и их совместимость не перепроверялась.
Generic SDK migration, Local/Ollama/fallback, broad CEP smoke, dependencies и новые
live/provider trials требуют отдельного scope; local-use source не означает публикацию JSX.
