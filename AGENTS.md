# Agent instructions

## Project goal

Maintain AE Agent 3.1.0 in this clean repository. The product target is
`specs/target-app.md`; the active execution plan is
`plans/target-app-execplan.md`.

## Clean repository rules

- Keep only current product code, typed tools, recipes, registry, bridge, CEP
  panel, provider layer, and AE-specific Full Intaker/importer tooling.
- Treat the legacy repository and git history as the source for historical
  context; do not recreate legacy evidence archives or generated runtime logs
  here.
- Keep runtime outputs ignored and local, including `.codex/`,
  `.codex-runtime/`, `.codex-autonomy/`, `logs/`, `backups/`, `snapshots/`,
  and `pro-review-bundles/`.
- Work milestone by milestone. Resolve small ambiguities autonomously and
  record decisions in the plan or handoff.
- After each completed milestone, update `.codex/handoff.md` with goal, files
  touched, validation, decisions, risks, commit id, and exact next prompt.
- Keep `plans/target-app-execplan.md` compact and current.

## Context meter calibration

- A user-reported Codex UI context percentage is authoritative.
- Do not treat internal goal/tool token counters as the UI context meter.
- If an internal token-derived estimate is the only available signal, add a 20
  percentage-point tolerance before making a handoff decision.
- Do not stop new work for context pressure when the user reports the UI context
  meter is below 70%, unless there is another concrete blocker.

## Engineering rules

- В AE-задачах сначала ищи готовое решение через `search_solutions`, затем
  читай нужные страницы `get_solution`; не загружай весь registry в контекст.
- Используй свежие результаты инспекции в пределах операции; запрашивай только
  недостающие поля. После мутаций проверяй изменённые цели заново.
- Для поддерживаемых операций предпочитай `build_solution_plan`, затем
  `propose_ai_agent_plan` и обычные dry-run/confirmation/read-back gates.
  Raw JSX допустим только при конкретном пробеле typed tools.
- Если пользователь включил в CEP `Автономную сессию Codex`, после успешного
  dry-run можно выполнить через MCP только server-proposed typed mutating plan.
  Direct mutations, raw JSX и destructive plans остаются в ручном CEP flow.
- Если пользователь включил в CEP `Автономную сессию Codex`, после успешного
  dry-run можно выполнить через MCP только server-proposed typed mutating plan.
  Direct mutations, raw JSX и destructive plans остаются в ручном CEP flow.
- Расход и ограничения измерений описаны в `docs/solution-reuse.md`;
  `npm.cmd run report:reuse` показывает наблюдаемые события, не процент экономии.

- Reuse existing components and design tokens.
- Do not introduce a parallel design system.
- Prefer small, typed modules over large monolithic files.
- Do not add production dependencies without recording the decision.
- Keep API contracts explicit.
- Do not remove tests unless replacing them with better current coverage.

## SDK and Full Intaker boundary

- Intaker/importer/supervisors frozen: exact boundary is
  `config/frozen-intake-manifest.json`; `check:rules` checks its locked hashes.
  No routine search/refactor or full-intake execution inside that boundary.
  The active exception `orchestrator/bounded-process-result.cjs` stays supported.
  Thaw/baseline changes require a separate reviewed scope; normal checks never update it.

- Keep AE Agent-specific Full Intaker/importer tooling in this repo.
- Do not rebuild broad generic SDK orchestration history here. Move reusable
  generic SDK behavior toward the sibling `codex-sdk-orchestrator-tool` only in
  a separate reviewed migration.
- Keep Local/Ollama, fallback providers, broad CEP smoke, live mutation,
  dependency changes, push, and PR approval-gated.

## Verification

Before marking a milestone complete, run the checks relevant to touched files.
For this clean baseline, the default command is:

- `npm.cmd run check:rules`

For source changes, also run:

- `node --check` for every touched JavaScript file
- `git diff --check`

For product/tooling changes, run the relevant smoke groups:

- `npm.cmd run smoke:provider-contract`
- `npm.cmd run smoke:provider-api`
- `npm.cmd run smoke:solutions`
- `npm.cmd run smoke:planning`
- `npm.cmd run smoke:bridge`
- `npm.cmd run smoke:full-intake`

For read-only live connectivity, when After Effects and the panel are available:

- `node scripts/cep-panel-cdp-smoke.js inspect`
- `node scripts/cep-panel-cdp-smoke.js connector-status-smoke`

Do not run mutating live validation, OpenAI CLI planner lanes, Local/Ollama, or
broad/default CEP smoke unless the current milestone explicitly approves it.

## Windows PowerShell encoding

Read Russian/UTF-8 Markdown files with `Get-Content -Encoding UTF8`.
## Shared AE MCP routing

- Для массового read-only поиска, инвентаризации и первичной классификации используй ae_scout (Luna / medium), не более двух параллельных анализов.
- Используй ae_specialist (Sol / high), когда готового решения нет, нужна параметризация raw JSX или две попытки исправления не прошли проверку.
- Используй ae_architect (Astra / high) только для повторяющихся системных сбоев, изменения нескольких подсистем bridge/registry/promotion или архитектурного решения с высокой ценой ошибки.
- После protected raw ExtendScript запуска проверь quarantine candidate: найди точные повторы через list_solution_candidates, затем читай только выбранный через get_solution_candidate.
- Candidate не становится доверенным автоматически: перед продвижением проверь параметры, воспроизводимость, синтаксис, safety gates и read-back.
- Не делегируй готовый простой план: эскалация модели оправдана анализом или разработкой, а не самой AE-мутацией.
