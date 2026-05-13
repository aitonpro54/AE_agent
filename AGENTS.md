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
- `node scripts/bridge-only-smoke-test.js`
- `node scripts/smoke-test.js`
- relevant live CEP smoke tests, such as `node scripts/cep-panel-cdp-smoke.js smoke`, when After Effects and the panel are available

If a check cannot run, record why and what would be needed to run it.
