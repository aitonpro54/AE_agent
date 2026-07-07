# План исполнения Target App

## Активный baseline

AE Agent 2.0.0 - локальная CEP-панель After Effects с локальным bridge daemon.
Bridge отвечает за provider-доступ, chat-вызовы, проверку планов AE,
execution gates, логи, checkpoints, защиту edit-session и post-run verification.

Репозиторий остается чистым рабочим baseline: product runtime, typed tools,
recipes, solution registry, provider layer и текущие AE-specific Full
Intaker/importer tooling. Runtime outputs остаются ignored/local.

## Текущий фокус

- Run id: `full-intake-aturtur-after-effects-scripts`.
- Ledger: `.codex-runtime/sdk/generic-repo-importer/aturtur-after-effects-scripts-19599911-intake/queue-ledger.json`.
- Последний completed candidate: `tool-ar_trimlayerstomatte`.
- Compact counts после candidate: `entries=46`, `completed=18`, `queued=3`,
  `blocked_live_lane_required=24`, `blocked_policy=1`, `failed=0`.
- Next queued preview: `tool-ar_trimlayerstoparent`,
  `tool-ar_trimlayerstoworkarea`, `tool-ar_workareatoselectedlayer`.
- User-approved push текущей ветки разрешен после clean validation; PR/GitHub
  issue/PR mutations и unrelated remote writes остаются запрещены.

## Milestones

- [x] Clean baseline/docs guard: runtime outputs ignored/local, current docs
  compact, clean-current guard active.
- [x] Aturtur intake protocol hardening: init, local-use license opt-in,
  comment-aware risk scan, untracked guard, alias resolution, artifact guard.
- [x] Child-runner resilience: quota/shell blockers classified, Windows env
  fallback scoped, and queued continuation avoids durable false stops.
- [x] Advisory imports completed through guarded runner up to
  `tool-ar_trimlayerstomatte` with parent-owned merge/validation/ledger/docs
  and one reviewable commit per milestone.
- [ ] Continue bounded `--max-items 1` intake loop for remaining `queued=3`.
- [ ] For `blocked_live_lane_required=24`, build a missing-validation map,
  create feasible narrow lanes, requeue scoped candidates, then retry.

## Decision Log

- 2026-07-07: Generic full-intake orchestrator processes queued AR advisory
  candidates through serial merge/validation/ledger/docs/handoff/commit gates.
- 2026-07-07: `tool-ar_sequencelayers`,
  `tool-ar_splitlayersintoframes`, and `tool-ar_trimlayerstokeyframes` import
  selected-layer timing guidance through existing typed coverage such as
  `set_layer_time_range`; trim-to-keyframe also requires
  `get_selected_properties` evidence.
- 2026-07-07: `tool-ar_trimlayerstomatte` imports selected-layer
  trim-to-matte timing guidance using existing matte read-back fields,
  `verifiedMatteLayerTiming`, and `set_layer_time_range`.
- 2026-07-07: Source JSX was absent in detached child worktrees for recent AR
  timing/selection candidates, so source-exact hidden selection ordering,
  native UI side effects, keyframe movement, layer duplication/slicing,
  time-remap edits, raw JSX, live validation, dependency changes, push, and PR
  remain out of scope unless a narrow lane explicitly proves them.
- Source license для aturtur игнорируется только как local personal-use blocker.
  Это не разрешает raw JSX copy, remote publication, PR, dependency changes или
  отключение validation/reducer gates.
- Parent reducer остается единственным central writer. Child worktrees остаются
  proposal-only: без commit, branch, push, PR, central ledger/docs writes,
  dependency changes, raw JSX copy и live mutation.
- Unrelated local untracked files допустимы только через explicit opt-in и
  только пока они не пересекаются с planned/shared paths.
- Windows sandbox fallback включается только через
  `AE_AGENT_ALLOW_CHILD_RUNNER_DANGER_FULL_ACCESS_ON_WINDOWS_SANDBOX_FAILURE=1`.
  Он меняет только actual child Codex sandbox; detached worktree,
  planned-path checks, no-push/no-PR, duplicate checks, artifact checks и
  validation остаются обязательными.
- Если candidate требует отсутствующий typed tool или proof lane, следующий
  большой цикл должен сначала создать узкий contract/lane, затем requeue/retry
  только подходящих кандидатов через обычные gates.
- Imported advisory recipe ids require explicit smoke quality/retrieval checks;
  compact plan notes must not preserve legacy runtime markers.
- Recent advisory imports are intentionally typed-contract/guidance only.
  Source-exact UI side effects, raw JSX, unsafe live mutation, dependency
  changes, PR/GitHub mutation, and arbitrary user-asset/file operations remain
  fail-closed unless a narrow lane explicitly proves them.

## Progress

- [x] `tool-ar_trimlayerstomatte` completed by reusable generic full-intake
  orchestrator; live lane `not_required`, proof `contractComplete=true`,
  unplanned paths `0`.

- [x] `tool-ar_trimlayerstokeyframes` completed by reusable generic full-intake
  orchestrator; live lane `not_required`, proof `contractComplete=true`,
  unplanned paths `0`.
- [x] Recent queued AR candidates through `tool-ar_splitlayersintoframes` remain
  completed with parent-owned source merge, validation, ledger, docs, handoff,
  and commit gates.
- [x] Detached child proposals for recent candidates added only recipes,
  intake notes, registry metadata, and append-only smoke assertions; parent
  performed source merge, validation, ledger update, docs, handoff, and commit.
- [x] Prior guarded runner imports through `tool-ar_nullstocornerpins` remain
  completed with compact proof and post-commit cleanup.

## Validation Notes

Default guard remains `npm.cmd run check:rules`. Source edits also require
`node --check <touched-js-or-mjs>` and `git diff --check`; Full Intaker/importer
edits require relevant smoke coverage.

Recent child runs intentionally did not run validation under the child-run hard
boundary; parent importer owns planned-path proof, JSON/JS checks, solution
smoke, source merge, ledger update, docs, handoff, and commit.

Latest candidate validation: `tool-ar_trimlayerstomatte` passed compact
status/proof/ledger checks, `node --check`, solution-library smoke,
`check:rules`, `smoke:planning`, `smoke:full-intake`, and diff whitespace
checks. `smoke:solutions` initially caught a missing
`verifiedMatteLayerTiming` recipe token; this cleanup adds the explicit evidence
token before rerunning the failed solution smoke and amending the candidate
commit.
