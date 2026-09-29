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
- Work milestone by milestone for substantive work; do not turn a small fix into
  a new acceptance milestone. Resolve small ambiguities autonomously and record
  material decisions. Communicate with the user and write new handoffs in Russian
  unless requested otherwise; this instruction is scoped to this repository.
- After each completed milestone, update `.codex/handoff.md` with goal, files
  touched, validation, decisions, risks, commit id, and exact next prompt.
- Keep `plans/target-app-execplan.md` compact and current.

## Context and continuation

Use the current client's actual remaining budget and a fresh user-reported UI meter
when available. Do not infer a UI percentage from internal counters, add a fabricated
20-point tolerance, or assume a fixed 258K window. A long conversation alone is not
a mandatory stop. Keep outputs bounded and read only relevant files.

At meaningful checkpoints, update a compact `.codex/handoff.md` with goal, state,
files, completed/not-run checks, decisions, risks, commit id if any, and next step.
Do not create a new thread after every small change. If compaction/limit is genuinely
near, stop expanding scope and record a safe continuation state; capture pending AE
requests and uncertainty before handing off. Do not abandon an in-flight mutation
without recording its status, and do not repeat it after compaction without read-back.
After compaction or a new thread, recheck the current repo/runtime baseline instead
of treating an old handoff as current. An explicit user request for immediate handoff
(such as STRICT HANDOFF NOW) is honored. A reported percentage alone is a signal,
not an unconditional instruction to abandon the task.

## Engineering rules

- В AE-задачах сначала ищи готовое решение через `search_solutions`, затем
  читай нужные страницы `get_solution`; не загружай весь registry в контекст.
- Используй свежие результаты инспекции в пределах операции; запрашивай только
  недостающие поля. После мутаций проверяй изменённые цели заново.
- Для поддерживаемых операций предпочитай `build_solution_plan`, затем
  `propose_ai_agent_plan` и обычные dry-run/confirmation/read-back gates.
  Raw JSX допустим только при конкретном пробеле typed tools.
- Если в CEP активна `Автономная сессия Codex`, после успешного
  dry-run можно выполнить через MCP только server-proposed typed mutating plan.
  Direct mutations, raw JSX и destructive plans остаются в ручном CEP flow.
- Настройка автономной сессии по умолчанию включается при первом доверенном
  подключении панели; явное выключение сохраняется. Полный доступ Codex к файлам
  не заменяет bridge gates. Настройка не управляет поиском, сбором кандидатов,
  продвижением рецептов или статистикой.
- Расход и ограничения измерений описаны в `docs/solution-reuse.md`;
  `npm.cmd run report:reuse` показывает наблюдаемые события, не процент экономии.

- Reuse existing components and design tokens.
- Do not introduce a parallel design system.
- Prefer small, typed modules over large monolithic files.
- Do not add production dependencies without recording the decision.
- Keep API contracts explicit.
- Do not remove tests unless replacing them with better current coverage.

## AE references and text layout

- When the user supplies layout examples, use them to identify visual hierarchy,
  typography, spacing, and alignment for the target frame.
- Before editing, compare the relevant examples with the actual target frame:
  date as one visual group, event type versus event title, main performers versus
  supporting details such as cities and instruments. Record the intended hierarchy.
- Preserve that hierarchy when replacing text. If one typed text update would
  flatten different styles in a layer, use separately controllable text ranges or
  reviewed text layers in the existing comp. Fit text with deliberate line breaks,
  font size, weight, leading, and tracking while preserving the frame and animation.
- Judge centering against the visible text bounds and the visible inner panel,
  including perspective in the final comp. Check balanced left/right margins and
  roughly balanced vertical gaps between date, captions, and title; a centered
  layer position alone does not prove the text looks centered.
- Inspect the finished frame at a readable preview size after each layout change.
  For animated text, also inspect entry and exit as needed. Read back the edited
  layers and correct clipping, overlap, or weak visual hierarchy before saving.
- If footage is missing, inspect whether it contributes to the requested visible
  result. Leave irrelevant missing files alone; report a limitation only if the
  missing material changes the output or prevents the requested verification.
- After a text edit, read back layer identity and name before later guarded steps:
  AE may rename a text layer from its new content. If a plan stops partway through,
  reconcile completed steps and submit only the remaining work. If the aggregate
  response conflicts with step results, use independent property and visual
  read-back; never blindly replay a possibly completed mutation.
- If a broad comp inspection fails on multiline text, use narrower comp, layer,
  and property reads. Before executing a proposal, preserve its exact current
  action/revision/hash fields; a rejected submission is not proof of mutation.
- For multiple plaque variants, save each reviewed project under its event name
  and verify the saved path and final frame. Inspect inherited render-queue paths
  before any later export; a saved project or preview screenshot is not a render.

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
  dependency changes, push, and PR approval-gated. An explicit instruction covering
  the current operation supplies task approval; do not ask for the same scope twice.
  Runtime grants, tool confirmations and frozen-boundary rules remain in force.

## Verification

Before marking a milestone complete, run the checks relevant to touched files.
For this clean baseline, the default command is:

- `npm.cmd run check:rules`

For source changes, also run:

- `node --check` for every touched JavaScript file
- `git diff --check`

For product/tooling changes, select the relevant configured smoke groups after
checking their scope; this list is not an instruction to run every group:

- `npm.cmd run smoke:provider-contract`
- `npm.cmd run smoke:provider-api`
- `npm.cmd run smoke:solutions`
- `npm.cmd run smoke:planning`
- `npm.cmd run smoke:bridge`
- `npm.cmd run smoke:full-intake` only after checking it is an allowed offline
  contract check; never treat this name as permission for frozen Full Intaker execution

For read-only live connectivity, when After Effects and the panel are available:

- `node scripts/cep-panel-cdp-smoke.js inspect`
- `node scripts/cep-panel-cdp-smoke.js connector-status-smoke`

Do not run mutating live validation, OpenAI CLI planner lanes, Local/Ollama, or
broad/default CEP smoke unless the current scope explicitly approves it. For
Markdown/TOML-only instruction changes, use rules/config validation and diff checks;
do not run a product acceptance suite or modify AE projects as an incidental test.
Tests that cannot run are reported with reasons; a fake/offline test is not live proof.
Protected raw, destructive and save operations retain their own gates. For live work,
use `ae-safe-project-automation`; for visual UI work, use the installed vendor
computer-use plus `ae-computer-use-workflow`, without modifying plugin cache.

## Windows PowerShell encoding

Read Russian/UTF-8 Markdown files with `Get-Content -Encoding UTF8`.
## AE model routing and shared runtime

Load `ae-task-routing` only when routing/delegation is relevant. Preferred configured
roles: `ae_scout` Luna/high (read-only); `ae_operator` Luna/high (bounded known work);
`ae_specialist` Sol/high (implementation); `ae_reviewer` Sol/high (independent read-only
review); `ae_architect` Astra/high (rare cross-system decisions). Exact IDs live in
the installed role TOML files: gpt-6-luna, gpt-6-sol, gpt-6-astra. This table is policy,
not proof that Codex switched models. Verify available roles and actual/effective
model+effort; report unavailable runtime verification rather than guessing.

Do not select Terra in any active default, fallback, planner, reviewer or recovery
route for these tasks. Do not silently switch providers or enable paid API usage.
Unavailable role: use an allowed available non-Terra model sequentially, or report
the exact blocker. Do not change the parent's user-selected model automatically.
At most two children, no child-created grandchildren, no duplicate parent/child work.
Parallelize only independent file work or immutable snapshots. One designated
controller owns all live AE/CEP/UI access at a time. A read-only filesystem sandbox
is not proof that inherited MCP/UI tools cannot mutate an application.

Do not require two failed live edits before escalation. Resolve auth, stale state and
unknown submission outcomes before choosing whether more reasoning would help.
Use the existing typed library first; candidate promotion is separate from capture.
