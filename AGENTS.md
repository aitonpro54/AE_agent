# Agent instructions

## Project goal

Build this repository toward the target application described in `specs/target-app.md`.
The target UI references are in `specs/screenshots/`.
The execution plan is in `plans/target-app-execplan.md`.

## Operating rules

- Before coding, read `specs/target-app.md`, `plans/target-app-execplan.md`, and this file.
- Work milestone by milestone.
- Do not ask the user for the next step when the plan already defines it.
- Resolve small ambiguities autonomously and record the decision in the plan.
- Keep changes incremental and reviewable.
- After each milestone, update the Progress, Decision Log, and Validation sections of the plan.
- Commit after each independently working milestone.

## Context discipline

Work in milestones. Do not run large multi-hour tasks in one thread.

Before context gets high or after each completed milestone:
1. Write `.codex/handoff.md`.
2. Include goal, changed files, validation commands, decisions, risks, and the exact next prompt.
3. Start a new thread instead of relying on automatic context compaction.

Always update `.codex/handoff.md` according to the milestone handoff format after milestone work, and whenever the strict context handoff rule requires it.

Avoid broad repository scans unless explicitly requested.
Use targeted `rg`, `sed`, `head`, `tail`, and file-specific reads.
For large command outputs, save full logs to a file and summarize only the relevant lines.

## Engineering rules

- Reuse existing components and design tokens.
- Do not introduce a parallel design system.
- Prefer small, typed modules over large monolithic files.
- Do not add production dependencies without a clear reason recorded in the plan.
- Keep API contracts explicit.
- Do not remove existing tests unless replacing them with better coverage.

## Verification

Before marking a milestone complete, run:

- checks that are configured for this repository
- `node --check` for every touched JavaScript file
- `git diff --check`
- `node scripts/provider-contract-smoke.js`
- `node scripts/solution-registry-smoke.js`
- `node scripts/solution-candidate-report-smoke.js`
- `node scripts/solution-promotion-smoke.js`
- `node scripts/solution-retrieval-smoke.js`
- `node scripts/solution-library-validation-smoke.js`
- `node scripts/project-intent-memory-smoke.js`
- `node scripts/plan-classification-smoke.js`
- `node scripts/plan-repair-smoke.js`
- `node scripts/semantic-verification-smoke.js`
- `node scripts/reliability-validation-suite-smoke.js`
- `node scripts/chatgpt-connector-smoke.js`
- `node scripts/provider-api-smoke.js`
- `node scripts/prompt-optimization-smoke.js`
- `node scripts/bridge-only-smoke-test.js`
- `node scripts/smoke-test.js`
- relevant live CEP smoke tests, such as `node scripts/cep-panel-cdp-smoke.js smoke`, `node scripts/cep-panel-cdp-smoke.js connector-status-smoke`, and `node scripts/provider-key-save-smoke.js`, when After Effects and the panel are available

If a check cannot run, record why and what would be needed to run it.
