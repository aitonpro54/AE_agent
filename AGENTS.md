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

## Windows PowerShell encoding

- In Windows PowerShell 5.1, read Russian/UTF-8 Markdown files with `Get-Content -Encoding UTF8`.
- Do not read `.codex/handoff.md` or `plans/target-app-execplan.md` with plain `Get-Content`; it can misdecode UTF-8 without BOM as mojibake.

## Engineering rules

- Reuse existing components and design tokens.
- Do not introduce a parallel design system.
- Prefer small, typed modules over large monolithic files.
- Do not add production dependencies without a clear reason recorded in the plan.
- Keep API contracts explicit.
- Do not remove existing tests unless replacing them with better coverage.

## SDK orchestrator strategy

- Treat AE Agent as the real-task adapter and proving ground for SDK-orchestrator needs, not as the permanent home for every generic SDK tool concern.
- Do not pause AE Agent product work to make the SDK orchestrator broadly production-ready in one abstract block.
- Improve SDK orchestration incrementally when a concrete AE Agent task needs it: one narrow lane, one contract, one proof, one reviewable milestone.
- Keep broad SDK repo-editing, CEP-panel SDK writes, live CEP/AE validation, external-provider/OpenAI CLI planner validation, mutating-live validation, dependency changes, push, and PR creation approval-gated.
- Move generic, reusable SDK orchestration behavior toward the sibling `codex-sdk-orchestrator-tool`; keep AE Agent-specific policy, evidence, and safety gates in this repository unless a separate migration milestone proves equivalent fail-closed behavior.

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
- live CEP/AE validation is mandatory when After Effects, the installed AE Agent panel, and the bridge are available; for planner-visible or mutating tool changes, also run the relevant generated-only Full UI Agent `openai-cli` planner acceptance lane, or create the narrow lane first if it does not exist yet
- `node scripts/cep-panel-cdp-smoke.js inspect` and `node scripts/cep-panel-cdp-smoke.js connector-status-smoke` for live connectivity
- relevant live CEP smoke tests, such as `node scripts/cep-panel-cdp-smoke.js smoke`, `node scripts/provider-key-save-smoke.js`, or the milestone-specific generated-only OpenAI CLI lane, when After Effects and the panel are available

If a check cannot run, record why and what would be needed to run it.
