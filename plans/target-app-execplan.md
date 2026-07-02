# Target App Execution Plan

## Active Baseline

AE Agent 2.0.0 is a local After Effects CEP panel backed by a local bridge
daemon. The bridge owns provider access, chat calls, AE plan validation,
execution gates, logs, checkpoints, edit-session protection, and post-run
verification.

This repository is the clean working baseline. It keeps the product runtime,
typed tools, recipes, solution registry, provider layer, and current
AE-specific Full Intaker/importer tooling. It must not depend on historical
audit trees, old plan archives, generated proof dumps, or longrun runtime logs.

## Current Milestones

- [x] Runtime purge (2026-07-02): removed ignored local runtime/log/backup
  artifacts from `.codex-runtime/`, `logs/`, `backups/`, `snapshots/`, and
  `pro-review-bundles/`. `.codex/handoff.md` remains the compact continuation
  file. Commit: `4863eb9`.
- [ ] Documentation cleanup: keep README, AGENTS, cleanup migration notes, and
  this execution plan compact and current.
- [ ] Tracked tooling cleanup: remove tracked `.codex-autonomy` runtime state,
  keep any useful automation as stateless tooling, and strengthen ignore/rule
  guards.
- [ ] Registry/test noise cleanup: normalize visible QA fixture naming and
  reduce historical importer/proof references without changing typed-tool
  contracts.
- [ ] Final guard pass: run relevant checks, update `.codex/handoff.md`, and
  leave one reviewable commit per completed milestone.

## Decision Log

- Historical source material stays in the legacy repository and git history.
  New repository docs should record only current state, decisions, validation,
  and exact next steps.
- Local runtime outputs are ignored and disposable: `.codex-runtime/`,
  `.codex-autonomy/`, `logs/`, `backups/`, `snapshots/`, and
  `pro-review-bundles/`.
- AE-specific Full Intaker/importer tools remain in this repo. Generic reusable
  SDK orchestration should move to the sibling `codex-sdk-orchestrator-tool`
  only through a separate reviewed migration.
- Local/Ollama remains a target provider path, but validation/intake must not
  use Local/Ollama, fallback providers, broad CEP smoke, live mutation,
  dependency changes, push, or PR without explicit approval.
- Unsafe external-script candidates remain fail-closed until a narrow typed
  bridge contract, generated-only fixture, read-back, semantic verification,
  and approval path exist.

## Validation Notes

Default guard:

```powershell
npm.cmd run check:rules
```

For source edits, also run `node --check` on every touched JavaScript/MJS file
and `git diff --check`.

Run focused smoke groups when their surface changes:

- `npm.cmd run smoke:provider-contract`
- `npm.cmd run smoke:provider-api`
- `npm.cmd run smoke:solutions`
- `npm.cmd run smoke:planning`
- `npm.cmd run smoke:bridge`
- `npm.cmd run smoke:full-intake`

Live AE/CEP checks are read-only unless the current milestone explicitly
approves mutation:

- `node scripts/cep-panel-cdp-smoke.js inspect`
- `node scripts/cep-panel-cdp-smoke.js connector-status-smoke`

## Handoff

Use `.codex/handoff.md` after each milestone. Keep it concise: goal, current
state, files touched, validation, decisions, risks, commit id, and exact next
prompt.
