# Target App Execution Plan

## Active Baseline

AE Agent 2.0.0 is a local After Effects CEP panel backed by a local bridge
daemon. The bridge owns provider access, chat calls, AE plan validation,
execution gates, logs, checkpoints, edit-session protection, and post-run
verification.

This repository is the clean working baseline. It keeps the product runtime,
typed tools, recipes, solution registry, provider layer, and current
AE-specific Full Intaker/importer tooling. It must not depend on historical
evidence trees, old plan archives, or longrun runtime logs.

## Current Milestones

- [x] Runtime purge (2026-07-02): removed ignored local runtime/log/backup
  artifacts from `.codex-runtime/`, `logs/`, `backups/`, `snapshots/`, and
  `pro-review-bundles/`. `.codex/handoff.md` remains the compact continuation
  file. Commit: `4863eb9`.
- [x] Documentation cleanup (2026-07-02): kept README, AGENTS, cleanup
  migration notes, releases, project memory, and this execution plan compact;
  removed stale architecture and unsafe-triage docs. Commit: `5de90a3`.
- [x] Tracked tooling cleanup (2026-07-02): removed tracked
  `.codex-autonomy` state, ignored the runtime root, and kept autonomy as a
  stateless dev tool. Commit: `c556a24`.
- [x] Registry/test noise cleanup (2026-07-02): normalized visible QA fixture
  naming and historical importer references without changing typed-tool
  contracts. Commit: `2305f5c`.
- [x] Final guard pass (2026-07-02): strengthened clean-current guard for
  tracked runtime roots, compact plan size, ignore surface, and legacy
  longrun/evidence markers outside importer protocol fixtures. Commit: final
  guard commit.
- [ ] Provider/Auth Contracts + Codex CLI Read-Only Planner: define and test
  the non-mutating provider/auth/planning surface before runtime provider or
  CLI implementation. Scope: provider readiness/result contracts, UI-facing
  billing/auth copy, secret-store interface plus redaction, Codex CLI detection
  and fixture-only JSONL parsing, scratch-dir planner contract, AE Plan gate
  fixtures, and generated fixtures only. Likely touched surfaces:
  `mcp-server/`, `scripts/`, `cep-panel/`, `specs/`, and this plan. Stop-lines:
  no live AE mutation, no raw ExtendScript fallback implementation, no
  broad/default CEP smoke, no OpenAI CLI planner live lane, no Local/Ollama live
  path, no fallback routing, no ChatGPT cookies/undocumented APIs, no
  dependency changes, no push/PR. Acceptance: readiness fixtures cover every
  provider state, API-vs-CLI copy is deterministic, secrets are masked and not
  stored in browser localStorage, Codex CLI runs only from generated scratch
  input when enabled, JSONL parser covers auth/model/malformed/timeout/cancel/
  partial/non-zero/final-message cases, AE Plan fixtures cover read-only,
  mutating, invalid tool, raw script rejection, idempotency, and semantic
  verifier failure. Validate with touched-file `node --check`,
  `npm.cmd run check:rules`, `git diff --check`, and focused non-live smokes.

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
- Longrun/evidence marker literals are allowed only where they are protocol
  contracts or smoke fixtures for the generic repository importer.
- Codex CLI planning is treated as untrusted text generation. The bridge must
  launch it only from a generated, redacted per-request scratch directory and
  parse bounded JSONL output into a normalized backend result before any AE Plan
  validation.
- OpenAI API billing and ChatGPT/Codex CLI subscription access are separate
  provider modes with distinct readiness, UI labels, storage, and error states.

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

Provider/Auth + planner contract milestones also require generated fixture
coverage for provider readiness, secret redaction, Codex CLI JSONL parsing, and
AE Plan normalization before any live provider or live planner lane is enabled.

Live AE/CEP checks are read-only unless the current milestone explicitly
approves mutation:

- `node scripts/cep-panel-cdp-smoke.js inspect`
- `node scripts/cep-panel-cdp-smoke.js connector-status-smoke`

## Handoff

Use `.codex/handoff.md` after each milestone. Keep it concise: goal, current
state, files touched, validation, decisions, risks, commit id, and exact next
prompt.
