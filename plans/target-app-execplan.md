# План исполнения Target App

## Активный baseline

AE Agent 3.0.0: CEP-панель After Effects, bridge daemon, typed tools,
reviewed recipes, registry, provider layer и AE-specific Full Intaker.
Product target: `specs/target-app.md`. Runtime outputs остаются local/ignored.

## Текущий фокус

Выпуск 3.0.0 опубликован 2026-09-13 в двух связанных PR. Пользователь 2026-09-12
разрешил обновление версии панели, push, необходимые PR и подготовку handoff
для следующего чата. Автоматический перенос в новый чат не запрошен.

На старте выпуска `main` отстаёт от рабочей ветки на 319 коммитов. Публикация
делится на baseline PR (`3bd69eb` → `main`) и PR текущего выпуска
(`79f421a` и версия 3.0.0 → baseline). Это позволяет отдельно просмотреть
накопленную историю и последний feature/release diff.

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

## Decision Log

- Готовые решения ищутся локально; registry не загружается целиком в контекст.
  Lookup/build не вызывает второй LLM, но ответы расходуют контекст Codex.
- MCP разрешает proposal и явный `dryRun:true`; настоящая mutation сохраняет
  существующий CEP confirmation/checkpoint/edit-session/read-back workflow.
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

## Следующие продуктовые изменения

1. Добавить удобный перенос готового MCP-плана в CEP preview/confirmation
   без второго planner-вызова и без выдачи модели authority на confirmation.
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

Reuse milestone: check:rules; syntax 21 JS; smoke:solutions, smoke:bridge,
smoke:planning, smoke:provider-contract/API, smoke:full-intake — pass.
Изолированный runner проверяет exact pass, stale preflight block и wrong-after
failure; MCP — редактированный proposal и preview-only compatibility.
Навык обновлён: YAML frontmatter сохранён; ручная проверка инструкций/ссылок.
Стандартный quick_validate недоступен без PyYAML; зависимости не устанавливались.

Release milestone: обновлённые bridge/solution smokes, syntax, manifest/package
согласованность и diff check — pass. Установленная CEP-панель и bridge 3.0.0;
branding-smoke/reload-button-smoke прошли 2026-09-12 при online, pending/inflight=0.
Повторный статус 2026-09-13: bridge отвечает 3.0.0, CEP-панель отключена.
Для следующей live-проверки сначала подключить панель и прочитать свежий статус.
