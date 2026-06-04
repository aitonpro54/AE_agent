# Target App Execution Plan

## Active Baseline

This clean repository tracks AE Agent 2.0.0: a local After Effects CEP panel
backed by a local bridge daemon. The bridge remains the owner of provider
access, chat calls, AE plan validation, execution gates, logs, checkpoints, and
edit-session protection.

The clean migration intentionally starts without historical audit packet trees,
old execution-plan archives, runtime logs, or generated proof directories. The
old `AE_agent` repository remains the historical source.

## Current State

- Product/runtime files were copied without changing AE tool contracts, bridge
  API, CEP UI semantics, provider contracts, or recipe semantics.
- Current Full Intaker/importer tooling remains available for AE-specific tool
  intake and validation.
- Full Intaker/importer real-run commands now require explicit current ledger
  paths instead of defaulting to generated runtime ledgers from the old
  workspace.
- Generic SDK write/governance history was not copied. Future generic SDK work
  should happen in the sibling `codex-sdk-orchestrator-tool` or a separate
  reviewed migration.

## Progress

- 2026-06-04: Clean baseline created, validated, and prepared to become the
  active `AE_agent` repo.
- 2026-06-04: Cleanup review removed stale project-memory history, updated the
  MCP config example to the clean path, and added checks against old absolute
  project paths and the old importer ledger default.
- 2026-06-04: Review hardening pass made the MCP config example portable,
  collapsed release notes into a clean v2.0.0 baseline, relaxed provider model
  smoke contracts, refreshed cleanup-migration tense, and clarified the
  `generic-repo:*` Full Intaker/importer boundary.
- 2026-06-04: Added a file-backed Codex Autonomy layer for bounded
  script/tool inventory, ranking, validation lanes, revalidation, reports,
  handoff generation, exact-next-prompt continuation, and Codex CLI supervisor
  dry-run/new-run support.
- 2026-06-04: Ran autonomy iteration 2 as one bounded batch. Five package
  smoke scripts were accepted by existing static lanes; autonomy state is now
  8 accepted, 75 pending, and 0 rejected/needs_lane/needs_revalidation/blocked.
- 2026-06-04: Ran one full remaining autonomy batch with batch size 75.
  Pending queue is exhausted: 78 accepted, 1 rejected, 4 blocked, and 0
  pending/needs_lane/needs_revalidation.
- 2026-06-04: Resolved the 4 autonomy blocked items with explicit safe
  mock/read-only/static fixture lanes and targeted blocked revalidation.
  Autonomy state is now done: 82 accepted, 1 rejected, 0 blocked, and
  0 pending/needs_lane/needs_revalidation.
- 2026-06-04: Added a parent-managed Codex app thread request contract for
  visible UI-thread continuation. The CLI now writes
  `.codex-autonomy/thread_request.json` with the compact prompt, required
  reads, counts, target metadata, and app-tool safety envelope.

## Guardrails

- Keep this plan compact and current.
- Do not recreate historical archive trees in this repository.
- Keep runtime outputs ignored and outside git.
- Treat Local/Ollama as explicitly requested only.
- Do not run broad/default CEP smoke, live mutation, dependency changes,
  push/PR, raw JSX copy, or external-provider planner validation without a
  separate milestone approval.

## Next Milestone

Autonomy script/tool queue and parent-managed thread-request contract are
complete. Current state is `done`: 83 candidates found, 82 accepted, 1 rejected,
and 0 pending/needs_lane/needs_revalidation/blocked. The next large milestone
is product-side work outside the autonomy queue: when After Effects and the
installed panel are available, run the deferred read-only CEP connectivity
checks and then choose the next AE Agent feature/intake milestone.

After the autonomy pass is no longer the active milestone and After Effects plus
the installed panel are available, run the deferred read-only CEP connectivity
checks: `node scripts/cep-panel-cdp-smoke.js inspect` and
`node scripts/cep-panel-cdp-smoke.js connector-status-smoke`.

## Decision Log

- 2026-06-04: Created clean-project baseline in a new repository rather than
  rewriting the old repo history.
- 2026-06-04: Kept AE Agent product and current AE-specific Full
  Intaker/importer tools; excluded old audit packet history and plan archives.
- 2026-06-04: Removed default dependencies on the old generated importer ledger;
  future Full Intaker real runs must pass `--ledger <path>` explicitly.
- 2026-06-04: Preserved `docs/cleanup-migration.md` as the only intentional
  old-repo pointer.
- 2026-06-04: `mcp-config.example.json` is a template, not a local install
  record; checked-in config uses portable `node` and a repo placeholder.
- 2026-06-04: Provider smoke should validate provider shape, order, auth/setup
  states, readiness behavior, and env overrides instead of exact
  future-sensitive default model IDs.
- 2026-06-04: `generic-repo:*` package scripts remain current AE-specific Full
  Intaker/importer entrypoints. Generic reusable SDK orchestration belongs in
  the sibling `codex-sdk-orchestrator-tool` via a separate reviewed migration.
- 2026-06-04: The new autonomy layer is intentionally separate from the
  AE-specific Full Intaker/importer surface. `.codex-autonomy/` owns the
  compact state/handoff contract, while runtime `runs/` and `logs/` stay
  ignored and local.
- 2026-06-04: Autonomy continuation uses a deterministic CLI backend
  (`codex exec --sandbox workspace-write -`) and does not use GUI/browser,
  resume, Local/Ollama, fallback providers, broad live smoke, push, or PR by
  default.
- 2026-06-04: Generated validation lanes are minimal static lanes by default;
  they do not execute arbitrary candidate behavior or mask network,
  credential, live-runtime, or destructive risk.
- 2026-06-04: On this Windows PowerShell setup, `npm.ps1` can be blocked by
  execution policy. Use `npm.cmd` for npm scripts in this repo instead of
  changing machine policy.
- 2026-06-04: The local autonomy supervisor creates fresh `codex exec` CLI
  runs from `exact_next_prompt.md`; it does not itself create visible Codex app
  UI threads. App-thread creation remains parent-managed through Codex app
  tools when explicitly needed.
- 2026-06-04: External runtime risk candidates may leave `blocked` only with
  explicit `external_risk_coverage` using a `mock`, `dry-run`,
  `read-only-fixture`, or `static-fixture` strategy. Generated static lanes
  alone remain insufficient for network/credential/live-runtime risk.
- 2026-06-04: The CLI may prepare `.codex-autonomy/thread_request.json`, but it
  does not directly call Codex app tools. Visible UI-thread creation remains a
  parent-managed action using the app's `codex_app.create_thread` capability.

## Validation

- Required for the migration milestone: static no-old-reference checks,
  touched-file syntax checks, `git diff --check`, `npm run check:rules`,
  product smoke scripts, and retained Full Intaker/importer smoke scripts.
- Cleanup-review validation passed: touched-file `node --check`,
  `npm.cmd run check:rules`, static stale-reference search, `git diff --check`,
  `npm.cmd run smoke:bridge`, and `npm.cmd run smoke:full-intake`.
- Review-hardening validation passed: touched-file `node --check` for
  `mcp-server/ai-agents.js`, `scripts/provider-contract-smoke.js`,
  `scripts/reliability-validation-suite.js`, and
  `scripts/clean-current-check.js`; `npm.cmd run check:rules`;
  `npm.cmd run smoke:provider-contract`; `npm.cmd run smoke:provider-api`;
  `npm.cmd run smoke:solutions`; `npm.cmd run smoke:planning`;
  `npm.cmd run smoke:full-intake`; `npm.cmd run smoke:bridge`; and
  `git diff --check`.
- Autonomy-layer validation passed: `node --check scripts\autonomy.mjs`;
  `node --check scripts\autonomy-layer-smoke.js`;
  `npm.cmd run check:rules`; `npm.cmd run smoke:autonomy`;
  `npm.cmd run autonomy -- run-once --batch-size 3`;
  `npm.cmd run autonomy -- supervise --dry-run`; and `git diff --check`
  (Windows line-ending normalization warnings only).
- Autonomy iteration 2 bounded step passed: `npm.cmd run autonomy -- run-once
  --batch-size 5`. The requested `npm run ...` form was attempted first, but
  PowerShell blocked `npm.ps1` before the npm script started; no execution
  policy was changed. Follow-up checks passed: `npm.cmd run check:rules` and
  `git diff --check` (Windows line-ending normalization warnings only).
- Autonomy iteration 3 full remaining batch passed as a bounded static pass:
  `npm.cmd run autonomy -- run-once --batch-size 75`. It did not run live CEP/AE
  or real supervise loop. Result: pending 0, accepted 78, rejected 1, blocked 4.
- Autonomy blocked resolution passed: `node --check scripts/autonomy.mjs`;
  `node --check scripts/autonomy-layer-smoke.js`;
  `npm.cmd run autonomy -- revalidate --include-blocked --batch-size 4`;
  `npm.cmd run autonomy -- handoff`; `npm.cmd run smoke:autonomy`;
  `npm.cmd run autonomy -- supervise --dry-run`;
  `npm.cmd run autonomy -- supervise --max-iterations 3
  --max-consecutive-failures 1 --max-wall-time-minutes 5`;
  `npm.cmd run check:rules`; and `git diff --check` (Windows line-ending
  normalization warnings only). Result: autonomy state `done`, accepted 82,
  rejected 1, blocked 0.
- Parent-managed thread request validation passed: `node --check
  scripts/autonomy.mjs`; `node --check scripts/autonomy-layer-smoke.js`;
  `npm.cmd run smoke:autonomy`; and
  `npm.cmd run autonomy -- thread-request`.

## Handoff

Use `.codex/handoff.md` for compact continuation state after each milestone.
