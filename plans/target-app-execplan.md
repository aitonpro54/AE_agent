# План исполнения Target App

## Активный baseline

AE Agent 3.0.0: CEP-панель After Effects, bridge daemon, typed tools,
reviewed recipes, registry, provider layer и AE-specific Full Intaker.
Product target: `specs/target-app.md`. Runtime outputs остаются local/ignored.
## Текущий фокус

2026-09-15: QA завершён; production остановлен пользователем, scope уточнён до 10 сцен.

### Progress

- [x] Прочитаны диагностика и сборщик; добавлены comp/layer motionBlur и audioEnabled.
- [x] Текущий proposal: revision/instanceId, project binding, supersession, dry-run receipt.
- [x] MCP regression: scope/replay, гонки adopt/run, подмена полномочий, чужой checkpoint,
  смена проекта, старый dry-run, лимит шагов и отзыв сессии между mutations.
- [x] 11 узких slideshow tools, строгий manifest и staged builder; 133: 10 этапов, <=50 шагов.
- [x] Установка CEP/daemon, generated-only acceptance и итоговый review.
- [x] Реальный AE: сокращение без переноса ключей, сохранение соседних ключей при продлении.
- [ ] Production остановлен: первые 10 собраны, аудиохвост 13 мс и визуальная приёмка не завершены.

### Decision Log

- Один pending proposal заменяет предыдущий; confirmed/executing имеют одного owner.
- Proposal привязан к сохранённому проекту; offline planner выдаёт только draft.
- GET не выдаёт токен; CEP adoption требует CAS и нового dry-run, сохраняет repair budget.
- Исправление: максимум два новых proposal setters на тех же целях и проекте после
  инспекции. Raw JSX, создание/import и неизвестный исход не повторяются.
- Статистика по allowlist без аргументов, текста, путей и секретов.
### Validation

Проходят planning, solutions, bridge, provider-contract/API (mock), autonomy и slideshow.
CEP/MCP синхронизированы; stale-кнопки отключаются. Live R3: 21+20+20 шагов,
С учётом switches и финальных Layer.id/index: 75 шагов, 42/42 checks, uncovered=0.
Read-back выявил и помог исправить порядок восстановления interpolation и выбор
скопированного слоя по Layer.id. Исходные 41 слой/133.2667 с и SHA-256 AEP не изменились.
Production stop: lease off, очередь пуста; в master уже 14 пар, исходник не изменён.
Копия Scene 1 прошла live read-back после исправления погрешности касательных AE;
planning/slideshow smokes, syntax, check:rules и diff check прошли.
Подробности: `docs/autonomous-editing.md`.

2026-09-13 завершён review/promotion reducer от `8fe053a`; исходный audit candidate
не promoted из-за redaction/File I/O. Выпуск 3.0.0 опубликован двумя связанными PR:
baseline `3bd69eb` → `main` и текущий выпуск от `79f421a` → baseline.
Прежнее разрешение выпуска не распространяется на push/PR текущего milestone.

## Milestones

- [x] Проверить фактическое применение базы и маршруты MCP/CEP.
- [x] Исправить silent truncation; bounded planner context до 24 000 символов.
- [x] Добавить MCP search/get и RU/EN retrieval.
- [x] Добавить 4 локальных builders scalar linear keyframes и strict verification.
- [x] Добавить usage/reuse telemetry и offline A/B reporter.
- [x] Обновить рабочий AE-навык; активировать новый daemon и MCP preview.
- [x] Согласовать версии panel/manifest/assets/package/bridge до 3.0.0.
- [x] Обновить установленную панель и проверить scoped branding/reload.
- [x] Push, baseline/release PR и handoff с точными ссылками.
- [x] Настроить глобальные Codex model roles и AE workflow для любых проектов.
- [x] Открыть через MCP read-only очередь карантинных JSX-candidates.
- [x] Добавить временную CEP autonomous session для proposal-backed typed plans.
- [x] Реализовать локальный reducer exact-repeat candidate review и проверяемый builder proposal.

## Decision Log

- Готовые решения ищутся локально; registry не загружается целиком в контекст.
  Lookup/build не вызывает второй LLM, но ответы расходуют контекст Codex.
- MCP разрешает proposal и явный `dryRun:true`. Включённая пользователем
  20-минутная CEP autonomous session разрешает только proposal-backed typed
  mutation; checkpoint/edit-session/idempotency/preflight/read-back сохраняются.
  Direct tools, raw JSX, destructive plans и replay остаются закрытыми.
- Raw JSX candidates доступны через компактную read-only MCP-очередь, но не
  становятся planner-visible и не продвигаются автоматически.
- Review reducer работает отдельно от planner: свежая группа, expected fingerprint,
  проверяемые source anchors, reviewed recipe/tool links и pending criteria.
  Output не является approval для promotion helper. V8 compile-only и lexical
  safety не доказывают ES3/AE compatibility либо безопасность.
- Для четырёх повторов composition audit предложен pure bounded builder из typed
  snapshots. Redacted source и external File I/O оставляют candidate в quarantine;
  неподдержанные property/enum/path поля не объявляются покрытыми typed tools.
- Глобальный Codex default — Terra/Medium; роли `ae_scout`, `ae_specialist` и
  `ae_architect` закрепляют Luna/Medium, Sol/High и Astra/High по сложности.
- Первые builders ограничены полной scalar linear последовательностью,
  canonical descriptor paths глубиной до 5 и максимум 5 property targets.
  До первой записи обязательна проверка свежих ключей; после — exact read-back.
- Usage внешнего Codex MCP-серверу недоступен. Декларация solution IDs не
  доказывает причинную связь; неизвестные токены остаются `null`.
- Runtime metadata отделяет рабочий порт от mock-серверов в статистике.
- Extension IDs и настройки сохраняются. Исторические testedAeContext в
  registry не переименовываются под новый выпуск.
- Новых production dependencies нет. Живые AE mutations и реальные provider
  trials в текущем выпуске не выполняются. PR не означает автоматический merge.

## Progress

- Feature commit `79f421a`: 119 MCP tools, 181 reviewed решения, четыре builders.
- Release commit `7dcd36f`: согласованная версия 3.0.0 и release notes.
- [PR #1](https://github.com/aitonpro54/AE_agent/pull/1): накопленная база
  `codex/ae-3-baseline` → `main`, draft; требуется самостоятельный обзор истории.
- [PR #2](https://github.com/aitonpro54/AE_agent/pull/2): reuse и выпуск
  `codex/pro-review-longrun` → `codex/ae-3-baseline`, открыт для review.
  Сначала интегрировать #1 через merge commit с сохранением ancestry, затем
  перенаправить #2 на `main` и проверить diff. Merge не выполнялся.
- Обе ветки отправлены в origin; продолжение описано в `.codex/handoff.md`.
- 12/12 RU и EN контрольных запросов находят ожидаемое решение в top-3;
  все 181 точных названий находятся. Это словарный поиск, не embeddings.
- Стрессовый planner пример: 13 397 символов при бюджете 24 000, сохранён
  обязательный конец prompt. Это не оценка биллинга Codex.
- Рабочая MCP-цепочка builder → proposal → dry-run прошла: четыре ready steps,
  ноль выполненных AE-команд; CEP online.
- `docs/solution-reuse.md` описывает ограничения, telemetry и восемь A/B-сценариев.
- Глобальные `config.toml`, `AGENTS.md`, AE skill и три agent profiles установлены
  в пользовательский Codex home; новые чаты применят их после перезапуска Codex.
- Изолированный MCP smoke выполнил typed plan при активном CEP lease и подтвердил
  блокировку без lease, direct mutation, raw JSX, destructive direct call и replay.
- Review milestone: `review:candidates` и `solution-candidate-review-proposal.v1`;
  [контракт и review](../docs/proposals/repeated-composition-audit.md), шесть matched
  parameters, четыре exact repeats, ноль registry writes. Изолированные fixtures
  проверяют reducer; воспроизведение будущего audit builder остаётся pending.

## Следующие продуктовые изменения

1. В следующем отдельном milestone реализовать pure bounded composition audit
   builder по `docs/proposals/repeated-composition-audit.review.json`, проверить
   inspection contracts и synthetic reproduction. Promotion требует review
   реализации и доказательств; runtime candidate остаётся planner-invisible.
2. Подготовить воспроизводимые изолированные сцены для A/B; после отдельного
   согласования real provider/live scope измерить tokens на успешную задачу.
3. По трассам оптимизировать крупные inspection/tool responses; fresh evidence
   переиспользовать только пока цель не изменилась.
4. Расширять RU retrieval и builders по реально частым запросам и промахам,
   включая tests на новые перефразировки и строгую проверку metadata.
5. Проверять актуальность comp frame rate/work area/layer bounds перед записью
   builder-плана; затем отдельно доказать поддержку Bezier/ease/vector keys.

## Сохранённый Full Intake backlog

Run: `full-intake-aturtur-after-effects-scripts`.
Ledger: `.codex-runtime/sdk/generic-repo-importer/aturtur-after-effects-scripts-19599911-intake/queue-ledger.json`.
Последний accepted candidate: `tool-ar_distributekeyframestolayer`, commit `577cd6e`.
Counts: entries=46, completed=27, queued=0, blocked_live_lane_required=18,
blocked_policy=1, failed=0. Шесть AR timing/boundary candidates ранее приняты
через generated-only live lanes с contractComplete=true/unplannedPathCount=0.
Оставшиеся family lanes: effects/visual, file/SRT/render/cleanup, shape/mask,
tracked-light. Старый intake в этом выпуске не запускается.

Generic SDK migration, Local/Ollama/fallback, broad CEP smoke, dependencies,
новые live/provider trials требуют отдельного scope. Parent сохраняет serial
acceptance/reducer. Разрешение local-use source не означает публикацию raw JSX.

## Validation Notes

Candidate review milestone: `check:rules`, syntax четырёх touched JS,
`smoke:solutions` (включая новый reducer smoke), `smoke:planning`, scoped
`solution-discovery-smoke` и `git diff --check` — pass. Discovery: 121 tools,
четыре dry-run steps, aeCommands=0. Reducer fixtures подтверждают deterministic
output, stale/malformed/incomplete source и group guards, неизменность registry,
quarantine и discovery, отказ promotion helper принять proposal как approval.
Реальная выбранная группа: parse-only-pass, 6/6 anchors matched, status=blocked
из-за source redaction и external I/O. Ни source, ни AE scene не исполнялись.

Reuse milestone: check:rules; syntax 21 JS; smoke:solutions, smoke:bridge,
smoke:planning, smoke:provider-contract/API, smoke:full-intake — pass.
Изолированный runner проверяет exact pass, stale preflight block и wrong-after
failure; MCP — редактированный proposal и preview-only compatibility.
Навык обновлён: YAML frontmatter сохранён; ручная проверка инструкций/ссылок.
Стандартный quick_validate недоступен без PyYAML; зависимости не устанавливались.

Release milestone: bridge/solution smokes, syntax, manifest/package и diff — pass.
Установлены CEP/bridge 3.0.0; scoped branding/reload прошли 2026-09-12.

Global autonomy/reuse milestone: добавлены read-only candidate queue и
in-memory CEP autonomous lease. Unit и isolated daemon/MCP/fake-panel smokes
проверяют expiry, revoke, restart, typed execution и запреты scope. Live AE
mutation и реальные provider-вызовы не выполнялись. `check:rules`, syntax,
`smoke:solutions`, `smoke:bridge`, `smoke:planning`, provider-contract и
`git diff --check` прошли. В рабочей quarantine найдено 34 candidate и 2 группы
точных повторов; очередь остаётся planner-invisible. Три CEP-файла установлены,
SHA-256 совпадают с repo, scoped reload-button-smoke прошёл.
