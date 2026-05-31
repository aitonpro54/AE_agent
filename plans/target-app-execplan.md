# Target App Execution Plan

## Active Baseline

This file is the compact active plan for AE Agent. Historical milestone detail through
2026-05-31 is archived at
`plans/archive/target-app-execplan-history-through-2026-05-31.md`.

The target product remains the AE Agent 2.0.0 local After Effects CEP panel described
in `specs/target-app.md`: provider setup, Chat/Agent/Agent Hardcore modes, bridge-owned
planning and execution gates, protected AE mutations, compact diagnostics, and manual
Codex App dev-request handoff for repository work.

## Operating Guardrails

- Do not read `plans/archive/**` by default. Use it only for a targeted historical
  lookup with a narrow reason.
- Do not read old `.codex-runtime/**`, proof envelopes, batch reports, or generated
  runtime reports by default. Prefer compact handoff/status files and targeted `rg`.
- Keep this active plan compact. Target size is under 24 KB; hard cap is 32 KB.
  If it grows past the target, archive historical detail before starting new work.
- Keep `.codex/handoff.md` compact. Target size is under 12 KB; hard cap is 16 KB.
  If it grows past the target, replace stale detail with a concise continuation state.
- Do not use Local/Ollama unless explicitly requested in the current turn.
- Do not use broad/default CEP smoke, old longrun flows, real importer runs with
  `max-items > 1`, dependency/package changes, push, or PR creation without explicit
  approval.
- For live validation, prefer read-only CEP/CDP connectivity checks and narrow
  generated-only OpenAI CLI lanes when they are required and available.

## Progress

- [x] Milestone 1: AUX-100 importer child-run guard stabilization committed as
  `39b36f5`.
- [x] Milestone 2: Baseline reset active docs. The oversized active plan was archived,
  this compact baseline became the only active plan, archive/runtime-read guardrails
  were added, and active plan/handoff size guards were established.
- [x] Milestone 3: Camera-controller recovery review. The existing dirty recovery
  patch was salvaged as a typed-plan advisory recipe, and compact prompt guidance now
  preserves `camera.parent` verification plus the `multi-camera switch` fail-closed
  warning.
- [x] Milestone 4: Provider self-test guardrail hardening. The CEP provider
  self-test now uses setup/readiness-only checks with `checkModels=0`, keeps
  Local/Ollama visible as a manual `Detect Ollama` / `Check model` path, and smoke
  coverage now asserts that the shared self-test button does not probe Local/Ollama
  or refresh provider model lists.

## Current Dirty State

No known pre-existing dirty recovery state remains after Milestone 4. Continue with
new work only after a fresh context/status check.

## Next Milestone

Milestone 5: resume normal target-app progression from this compact baseline with a
new narrow, reviewable task. Do not read archives/runtime reports by default, and keep
the same guardrails: no Local/Ollama, broad/default CEP smoke, dependency/package
changes, push/PR, old longrun, or importer `max-items > 1` without explicit approval.

## Decision Log

- The old active plan was preserved as history rather than summarized in place, because
  it contained useful historical proof but was too large for safe active-context use.
- The active plan is now a baseline and queue pointer, not a complete execution log.
- Runtime/proof artifacts are treated as cold storage. New chats should read compact
  handoff/status first and only open old reports by exact path when needed.
- Existing camera-controller recovery changes are separate from Milestone 2 and remain
  outside this commit except for being named as the next review target.
- Milestone 3 accepted the camera-controller recovery change rather than rejecting it:
  the recipe stays bounded to one generated camera plus one generated 3D null
  controller, uses `create_camera_with_controller` and `get_layer_details`, rejects
  existing-layer re-parenting and broader camera-rig semantics, and records that no
  source JSX was copied.
- The parent-link failure was a compact prompt-guidance issue, not a missing recipe
  safety rule. The registry `verificationRecipe.summary` was shortened so retrieval
  prompt text includes both `camera.parent` and `multi-camera switch`.
- The provider self-test is a lightweight setup/auth preflight, not a model catalog
  refresh or Local/Ollama detector. The explicit `Check model` action and Local
  `Detect Ollama` control remain the opt-in paths for those checks.

## Validation

Milestone 2 targeted validation:

- [x] `git diff --check` passed with existing CRLF normalization warnings.
- [x] `node scripts/solution-registry-smoke.js` passed.
- [x] `node scripts/solution-retrieval-smoke.js` passed.
- [ ] `node scripts/solution-library-validation-smoke.js` failed on the pre-existing
  camera-controller recovery patch: `prompt section should preserve parent-link
  verification guidance`.

The failing smoke is not caused by this documentation reset and remains the next
milestone's target.

Milestone 3 targeted validation:

- [x] `node --check scripts/solution-library-validation-smoke.js` passed.
- [x] `node scripts/solution-registry-smoke.js` passed.
- [x] `node scripts/solution-retrieval-smoke.js` passed.
- [x] `node scripts/solution-library-validation-smoke.js` passed.
- [x] `git diff --check -- registry/solutions.json scripts/solution-library-validation-smoke.js recipes/add-camera-with-controller-typed-plan.md` passed with existing CRLF normalization warnings only.

Not run by design for this targeted recovery review: Local/Ollama, broad/default CEP
smoke, live CEP/AE mutation, dependency/package changes, push/PR, old longrun, and
real importer runs with `max-items > 1`.

Milestone 4 targeted validation:

- [x] `node --check cep-panel/panel.js` passed.
- [x] `node --check scripts/cep-panel-cdp-smoke.js` passed.
- [x] `npm.cmd run check:rules` passed after plain `npm run check:rules` was blocked
  by PowerShell `npm.ps1` ExecutionPolicy.
- [x] Required local smoke scripts passed: provider contract, Solution Library
  registry/candidate/promotion/retrieval/validation, project intent memory, plan
  classification, plan repair, semantic verification, reliability suite smoke,
  ChatGPT connector, provider API, prompt optimization, bridge-only smoke, and
  `scripts/smoke-test.js`.
- [x] `git diff --check` passed with existing CRLF normalization warnings only.
- [x] `node scripts/cep-panel-cdp-smoke.js inspect` passed against the installed CEP
  panel.
- [x] `node scripts/cep-panel-cdp-smoke.js connector-status-smoke` passed.

Not run by design: broad/default CEP smoke, Local/Ollama provider validation,
dependency/package changes, push/PR, old longrun, real importer runs with
`max-items > 1`, and live CEP mutation. The targeted
`provider-self-test-smoke` was not run against the installed panel because the
installed `%AppData%` CEP bundle was older than the worktree and syncing/installing
the panel plus clearing CEP cache was not explicitly approved in this turn.

## Handoff

Use `.codex/handoff.md` as the primary continuation record. Keep it compact and update
it after each completed milestone.
