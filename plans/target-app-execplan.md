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

## Guardrails

- Keep this plan compact and current.
- Do not recreate historical archive trees in this repository.
- Keep runtime outputs ignored and outside git.
- Treat Local/Ollama as explicitly requested only.
- Do not run broad/default CEP smoke, live mutation, dependency changes,
  push/PR, raw JSX copy, or external-provider planner validation without a
  separate milestone approval.

## Next Milestone

Continue the autonomy pass from `.codex-autonomy/exact_next_prompt.md`.
Current state is `continue`: 83 candidates found, 3 accepted, 80 pending. Run
one bounded step with `npm run autonomy -- run-once --batch-size 5`, then
refresh `.codex-autonomy/handoff.md` and this plan if another milestone closes.

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

## Handoff

Use `.codex/handoff.md` for compact continuation state after each milestone.
