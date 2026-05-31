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
- [x] Milestone 5: Provider self-test installed-panel validation. The installed CEP
  panel was synced through the narrow `cep-sync-health --sync --check` path, copying
  only `panel.js`, clearing only this extension's CEP cache while preserving Local
  Storage, and the targeted live self-test smoke proved `checkModels=0` with no
  `ollama-local` probe.
- [x] Milestone 6: Agent Hardcore typed-tool handoff proof. Failed TypedTools in the
  Hardcore transcript now name the `Codex App start prompt`, and the targeted live
  Hardcore UI smoke proves the typed tool is marked not working, the start prompt is
  shown, and no automatic Codex App dev chat is implied.
- [x] Milestone 7: Full Intaker bounded onion-skinning tail review. Compact ledger
  status showed the old remaining six as five `queued` candidates plus the already
  reviewed camera-controller recovery entry. The first queued candidate,
  `tool-compositions-toggle-onion-skinning`, was advanced through strict one-phase
  `select_candidate`, `prove_or_register_live_lane`, and `run_importer_phase`.
  Its registered generated-only live lane was ready, but the importer stopped before
  implementation with `implementation-child-run-failed:
  queue-batch-1-5fc7d26bd2`; the candidate is now terminal `failed_import`, leaving
  four queued candidates and zero `queued live_lane_needed`.
- [x] Milestone 8: Full Intaker bounded fill-in-keyframes tail review.
  `tool-keyframes-fill-in-keyframes` was advanced through strict one-phase
  `select_candidate`, `prove_or_register_live_lane`, and `run_importer_phase`.
  Its registered generated-only live lane was ready, but the importer stopped before
  implementation with `implementation-child-run-failed:
  queue-batch-1-75b0df2dec`; the candidate is now terminal `failed_import`, leaving
  three queued candidates and zero `queued live_lane_needed`.
- [x] Milestone 9: Full Intaker remaining queue drain. At the user's request, the
  remaining queue was completed in one work block while preserving strict one-phase
  `max-items 1` runs per candidate. `tool-keyframes-keyframe-current-value-from-expression`,
  `tool-keyframes-set-spacial-in-tanget`, and
  `tool-properties-separate-size-dimensions` all had ready generated-only live lanes,
  then stopped before implementation with `implementation-child-run-failed`
  terminal `failed_import` results. The durable ledger now has zero `queued`
  candidates and zero `queued live_lane_needed`.
- [x] Milestone 10: Full Intaker blocked live-lane synthesis drain. A scoped
  resolution pass was run only for the nine
  `blocked_live_lane_synthesis_incomplete` candidates requested by the user. The
  existing resolution path grouped them into two generated-only OpenAI CLI families:
  six layer-timing candidates and three effect-property candidates. Both families
  failed closed at generated-only proof read-back, so no candidates were requeued
  and the ledger still has nine `blocked_live_lane_synthesis_incomplete` entries,
  zero `queued`, and zero `queued live_lane_needed`.
- [x] Milestone 11: Full Intaker unsafe-skip triage. The 75
  `unsafe_skip_tool_gap` entries were grouped in
  `plans/full-intake-unsafe-skip-triage.md`: 28 safe-next generated-only, 32 needing
  new typed-tool contracts, and 15 approval-gated/last.

## Current Dirty State

No known pre-existing dirty recovery state remains after Milestone 6. Continue with
new work only after a fresh context/status check.

## Next Milestone

Milestone 12: start one bounded repair slice. Best first choice is the Selection
unsafe-skip family from `plans/full-intake-unsafe-skip-triage.md`; alternatively fix
the layer-timing/effect-property proof lanes before retrying the nine blocked
live-lane candidates.

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
- The installed-panel validation gap was closed with the sync helper instead of the
  full installer, because only tracked CEP file drift was present and full
  PlayerDebugMode/install work was unnecessary.
- Agent Hardcore transcript copy should say `Codex App start prompt` for typed-tool
  failure handoffs. The panel prepares a manual continuation prompt; it does not claim
  that a Codex App dev chat was created automatically.
- For the resumed Full Intaker work, the camera-controller recovery ledger entry is
  treated as historically stale relative to Milestone 3's reviewed commit, while the
  remaining actionable old tails are the current `queued` and `failed_import` ledger
  entries.
- `tool-compositions-toggle-onion-skinning` was selected because it was first in the
  queue and already had a registered generated-only `toggle_onion_skinning` live lane.
  Since implementation planning failed before any source merge or live run, no CEP/AE
  mutation or OpenAI CLI live acceptance lane was started in this milestone.
- `tool-keyframes-fill-in-keyframes` was selected as the next first queued candidate
  with no `live_lane_needed` backlog. Since implementation planning failed before any
  source merge or live run, no CEP/AE mutation or OpenAI CLI live acceptance lane was
  started in this milestone.
- The remaining queue was drained in Milestone 9 because the user explicitly asked
  for the whole queue. The safety shape stayed bounded: three separate candidate
  transactions, each preserving `max-items 1` and strict phase boundaries. No source
  merge, live rerun, CEP/AE mutation, or OpenAI CLI live acceptance lane was started
  because each candidate failed during importer implementation planning.
- For Milestone 10, `--resolution-candidate-ids` with the nine explicit candidate
  ids was treated as the safe bounded path. The command kept `--compact-json`,
  `--max-items 1`, and `--no-commit`, so the run processed resolution tickets and
  stopped at `completed_no_candidates` without importer/source merge phases.
- The nine blocked entries now have fresh terminal resolution tickets in two
  families. The layer-timing generated-only proof failed because a generated layer
  timing start-time read-back expected `0.5` and got `2.75`. The effect-property
  generated-only proof failed because the generated effect property value was not
  found by read-back.
- Milestone 11 treated `unsafe_skip_tool_gap` as a backlog triage problem, not an
  importer retry problem. No source merge or lane retry was run; the next useful
  slice is Selection because it has many candidates and clear generated-only
  read-back semantics.

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

Milestone 5 targeted validation:

- [x] Pre-sync `node scripts/cep-sync-health.js --check` failed as expected with only
  `panel.js` different between repo and the installed CEP panel.
- [x] `node scripts/cep-sync-health.js --sync --check` passed; copied 1 file
  (`panel.js`), skipped 3 same files, cleared 4 extension CEP cache folders, and
  preserved Local Storage.
- [x] Post-sync `node scripts/cep-sync-health.js --check` passed.
- [x] `node scripts/cep-panel-cdp-smoke.js inspect` passed against the installed
  panel.
- [x] `node scripts/cep-panel-cdp-smoke.js provider-self-test-smoke` passed with 5
  readiness URLs, all `checkModels=0`, and no `agentId=ollama-local`.
- [x] `node scripts/cep-panel-cdp-smoke.js connector-status-smoke` passed.
- [x] `git diff --check` passed with existing CRLF normalization warnings only.

Not run by design: broad/default CEP smoke, Local/Ollama provider validation,
dependency/package changes, push/PR, old longrun, real importer runs with
`max-items > 1`, live CEP/AE mutation, and the full local smoke suite because this
milestone changed no source behavior beyond syncing the already validated installed
CEP panel bundle.

Milestone 6 targeted validation:

- [x] `node --check cep-panel/panel.js` passed.
- [x] `node --check scripts/cep-panel-cdp-smoke.js` passed.
- [x] `git diff --check` passed with existing CRLF normalization warnings only.
- [x] `npm.cmd run check:rules` passed.
- [x] `node scripts/cep-sync-health.js --check` first reported only `panel.js`
  drift; `node scripts/cep-sync-health.js --sync --check` copied only `panel.js`;
  post-sync `node scripts/cep-sync-health.js --check` passed.
- [x] `node scripts/cep-panel-cdp-smoke.js inspect` passed against the installed
  panel.
- [x] `node scripts/cep-panel-cdp-smoke.js connector-status-smoke` passed.
- [x] `node scripts/cep-panel-cdp-smoke.js hardcore-autopilot-ui-smoke` passed and
  proved `marked not working`, `Codex App start prompt file`, and the no-auto-chat
  start prompt claim.
- [x] Required local smoke scripts passed: provider contract, Solution Library
  registry/candidate/promotion/retrieval/validation, project intent memory, plan
  classification, plan repair, semantic verification, reliability suite smoke,
  ChatGPT connector, provider API, prompt optimization, bridge-only smoke, and
  `scripts/smoke-test.js`.

Not run by design: broad/default CEP smoke, Local/Ollama provider validation,
dependency/package changes, push/PR, old longrun, real importer runs with
`max-items > 1`, and live CEP/AE mutation.

Milestone 7 targeted validation:

- [x] `git status --short --branch --untracked-files=all` started and ended clean on
  `road-map-2.0`.
- [x] `node orchestrator/full-intake-status.mjs --run-id full-intake-kyletmartinez
  --compact --event-limit 8 --batch-limit 1` showed
  `tool-compositions-toggle-onion-skinning -> failed_import`.
- [x] `node orchestrator/full-intake-ledger-summary.mjs --compact` showed
  `queued:4`, `failed_import:12`, and `Queued live_lane_needed: 0`.
- [x] `node orchestrator/full-intake-proof.mjs --run-id full-intake-kyletmartinez
  --compact-json` showed phase `run_importer_phase`, status `failed_import`,
  `changedPathCount:0`, and `contractComplete:false`.
- [x] No JavaScript files were touched, so no `node --check` target was required.
- [x] `git diff --check` passed with existing CRLF normalization warnings only.
- [x] `npm.cmd run check:rules` passed.
- [x] Required local smoke scripts passed: provider contract, Solution Library
  registry/candidate/promotion/retrieval/validation, project intent memory, plan
  classification, plan repair, semantic verification, reliability suite smoke,
  ChatGPT connector, provider API, prompt optimization, bridge-only smoke, and
  `scripts/smoke-test.js`.
- [x] Read-only live connectivity checks passed:
  `node scripts/cep-panel-cdp-smoke.js inspect` and
  `node scripts/cep-panel-cdp-smoke.js connector-status-smoke`.

Not run by design: mutating live CEP/AE validation and OpenAI CLI generated-only lane,
because the candidate failed during importer implementation planning before any source
merge or live rerun requirement. Broad/default CEP smoke, Local/Ollama provider
validation, dependency changes, push/PR, old longrun, and importer `max-items > 1`
remain prohibited.

Milestone 8 targeted validation:

- [x] `git status --short --branch --untracked-files=all` started clean on
  `road-map-2.0`.
- [x] `node orchestrator/run-generic-repo-full-intake.mjs --ledger
  .codex-runtime/sdk/generic-repo-importer/kyletmartinez-after-effects-scripts-intake/queue-ledger.json
  --run-id full-intake-kyletmartinez --max-items 1 --resolution-candidate-ids
  tool-keyframes-fill-in-keyframes --context-percent 20 --compact-json` was run
  three times, one strict phase per invocation.
- [x] `node orchestrator/full-intake-status.mjs --run-id full-intake-kyletmartinez
  --compact --event-limit 8 --batch-limit 1` showed
  `tool-keyframes-fill-in-keyframes -> failed_import`.
- [x] `node orchestrator/full-intake-ledger-summary.mjs --compact` showed
  `queued:3`, `failed_import:13`, and `Queued live_lane_needed: 0`.
- [x] `node orchestrator/full-intake-proof.mjs --run-id full-intake-kyletmartinez
  --compact-json` showed phase `run_importer_phase`, status `failed_import`,
  `changedPathCount:0`, and `contractComplete:false`.
- [x] No JavaScript files were touched, so no `node --check` target was required.
- [x] `git diff --check` passed with existing CRLF normalization warnings only.
- [x] `npm.cmd run check:rules` passed.
- [x] Required local smoke scripts passed: provider contract, Solution Library
  registry/candidate/promotion/retrieval/validation, project intent memory, plan
  classification, plan repair, semantic verification, reliability suite smoke,
  ChatGPT connector, provider API, prompt optimization, bridge-only smoke, and
  `scripts/smoke-test.js`.
- [x] Read-only live connectivity checks passed:
  `node scripts/cep-panel-cdp-smoke.js inspect` and
  `node scripts/cep-panel-cdp-smoke.js connector-status-smoke`.

Note: the first `node scripts/plan-repair-smoke.js` attempt failed with a transient
bridge health `socket hang up`; the immediate targeted rerun passed.

Not run by design: mutating live CEP/AE validation and OpenAI CLI generated-only
lane, because the candidate failed during importer implementation planning before
any source merge or live rerun requirement. Broad/default CEP smoke, Local/Ollama
provider validation, dependency changes, push/PR, old longrun, and importer
`max-items > 1` remain prohibited.

Milestone 9 targeted validation:

- [x] `git status --short --branch --untracked-files=all` started clean on
  `road-map-2.0`.
- [x] Compact status/ledger/proof checks were run before the queue drain.
- [x] `node orchestrator/run-generic-repo-full-intake.mjs --ledger
  .codex-runtime/sdk/generic-repo-importer/kyletmartinez-after-effects-scripts-intake/queue-ledger.json
  --run-id full-intake-kyletmartinez --max-items 1 --resolution-candidate-ids
  <candidate> --context-percent 20 --compact-json` was run three strict phases each
  for `tool-keyframes-keyframe-current-value-from-expression`,
  `tool-keyframes-set-spacial-in-tanget`, and
  `tool-properties-separate-size-dimensions`.
- [x] Final `node orchestrator/full-intake-status.mjs --run-id
  full-intake-kyletmartinez --compact --event-limit 8 --batch-limit 1` showed
  `tool-properties-separate-size-dimensions -> failed_import`.
- [x] Final `node orchestrator/full-intake-ledger-summary.mjs --compact` showed
  `failed_import:16`, no `queued` count, and `Queued live_lane_needed: 0`.
- [x] Final queued-entry check showed `queued=0`.
- [x] Final `node orchestrator/full-intake-proof.mjs --run-id
  full-intake-kyletmartinez --compact-json` showed phase `run_importer_phase`,
  status `failed_import`, `changedPathCount:0`, and `contractComplete:false`.
- [x] No JavaScript files were touched, so no `node --check` target was required.
- [x] `git diff --check` passed with existing CRLF normalization warnings only.
- [x] `npm.cmd run check:rules` passed.
- [x] Required local smoke scripts passed: provider contract, Solution Library
  registry/candidate/promotion/retrieval/validation, project intent memory, plan
  classification, plan repair, semantic verification, reliability suite smoke,
  ChatGPT connector, provider API, prompt optimization, bridge-only smoke, and
  `scripts/smoke-test.js`.
- [x] Read-only live connectivity checks passed:
  `node scripts/cep-panel-cdp-smoke.js inspect` and
  `node scripts/cep-panel-cdp-smoke.js connector-status-smoke`.

Not run by design: mutating live CEP/AE validation and OpenAI CLI generated-only
lane, because all three candidates failed during importer implementation planning
before any source merge or live rerun requirement. Broad/default CEP smoke,
Local/Ollama provider validation, dependency changes, push/PR, old longrun, and
importer `max-items > 1` remain prohibited.

Milestone 10 targeted validation:

- [x] Context/status check completed; no active goal budget was reported by the
  Codex context tool.
- [x] `git status --short --branch --untracked-files=all` showed branch
  `road-map-2.0` ahead 3 and no worktree changes before documentation updates.
- [x] `node orchestrator/full-intake-ledger-summary.mjs --compact` showed
  `blocked_live_lane_synthesis_incomplete:9`, zero `queued`, and
  `Queued live_lane_needed: 0`.
- [x] Scoped bounded run:
  `node orchestrator/run-generic-repo-full-intake.mjs --ledger .codex-runtime/sdk/generic-repo-importer/kyletmartinez-after-effects-scripts-intake/queue-ledger.json --run-id full-intake-kyletmartinez --max-items 1 --resolution-candidate-ids <nine requested ids> --context-percent 20 --allow-self-improvement-lane-synthesis --compact-json --no-commit`
  completed with `status: completed_no_candidates`, `terminalTickets:2`,
  `requeued:0`, and `items:0`.
- [x] Post-run compact status and proof showed `changedPathCount:0`,
  `unplannedPathCount:0`, no active related processes, and last event
  `resolution_queue_processed`.
- [x] Fresh resolution tickets showed both generated-only proof lanes failed closed:
  layer timing read-back mismatch and effect-property read-back missing value.

Not run by design: source merge, importer phases, mutating live CEP/AE validation,
broad/default CEP smoke, Local/Ollama provider validation, dependency changes,
push/PR, old longrun, and importer `max-items > 1`.

Milestone 11 targeted validation:

- [x] Read durable ledger only and confirmed 75 `blocked_or_skipped` entries, all
  `unsafe_skip_tool_gap`.
- [x] Created `plans/full-intake-unsafe-skip-triage.md` with all 75 ids grouped into
  28 safe-next, 32 contract-needed, and 15 approval-gated/last entries.
- [x] No source files or runtime importer state were changed.

## Handoff

Use `.codex/handoff.md` as the primary continuation record. Keep it compact and update
it after each completed milestone.
