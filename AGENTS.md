# Agent instructions

## Project goal

Maintain AE Agent 2.0.0 in this clean repository. The product target is
`specs/target-app.md`; the active execution plan is
`plans/target-app-execplan.md`.

## Clean repository rules

- Keep only current product code, typed tools, recipes, registry, bridge, CEP
  panel, provider layer, and AE-specific Full Intaker/importer tooling.
- Treat the legacy repository and git history as the source for historical
  evidence; do not recreate audit archives, proof dumps, plan archives, old
  handoff-only docs, or generated runtime logs here.
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

- Reuse existing components and design tokens.
- Do not introduce a parallel design system.
- Prefer small, typed modules over large monolithic files.
- Do not add production dependencies without recording the decision.
- Keep API contracts explicit.
- Do not remove tests unless replacing them with better current coverage.

## SDK and Full Intaker boundary

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
