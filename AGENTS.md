# Agent instructions

## Project goal

Build and maintain AE Agent 2.0.0 in this clean repository. The target product
is described in `specs/target-app.md`; the active execution plan is
`plans/target-app-execplan.md`.

## Clean repository rules

- The old `AE_agent` repository is the historical source. This clean repo must
  not depend on old audit packet trees, plan archives, generated runtime logs,
  old handoff-only docs, or broad proof dumps.
- Keep runtime outputs ignored and local.
- Work milestone by milestone.
- Resolve small ambiguities autonomously and record decisions in the plan or
  handoff.
- After each completed milestone, update `.codex/handoff.md` with goal, files
  touched, validation, decisions, risks, commit id, and exact next prompt.
- Keep `plans/target-app-execplan.md` compact and current.

## Engineering rules

- Reuse existing components and design tokens.
- Do not introduce a parallel design system.
- Prefer small, typed modules over large monolithic files.
- Do not add production dependencies without recording the decision.
- Keep API contracts explicit.
- Do not remove tests unless replacing them with better current coverage.

## SDK and Full Intaker boundary

- Keep AE Agent-specific Full Intaker/importer tooling in this repo.
- Do not rebuild the broad generic SDK orchestrator history here.
- Move generic reusable SDK orchestration behavior toward the sibling
  `codex-sdk-orchestrator-tool` in a separate reviewed migration.
- Keep Local/Ollama, fallback providers, broad CEP smoke, live mutation,
  dependency changes, push, and PR approval-gated.

## Verification

Before marking a milestone complete, run the checks relevant to touched files.
For this clean baseline, the default command is:

- `npm run check:rules`

For source changes, also run:

- `node --check` for every touched JavaScript file
- `git diff --check`

For product/tooling changes, run the relevant smoke groups:

- `npm run smoke:provider-contract`
- `npm run smoke:provider-api`
- `npm run smoke:solutions`
- `npm run smoke:planning`
- `npm run smoke:bridge`
- `npm run smoke:full-intake`

For read-only live connectivity, when After Effects and the panel are available:

- `node scripts/cep-panel-cdp-smoke.js inspect`
- `node scripts/cep-panel-cdp-smoke.js connector-status-smoke`

Do not run mutating live validation, OpenAI CLI planner lanes, Local/Ollama, or
broad/default CEP smoke unless the current milestone explicitly approves it.

## Windows PowerShell encoding

Read Russian/UTF-8 Markdown files with `Get-Content -Encoding UTF8`.
