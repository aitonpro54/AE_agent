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
- Последний completed candidate: `tool-ar_sequencelayers`.
- Последний detached child proposal: `tool-ar_splitlayersintoframes`
  ожидает parent merge/validation.
- Compact counts после candidate: `entries=46`, `completed=15`, `queued=6`,
  `blocked_live_lane_required=24`, `blocked_policy=1`, `failed=0`.
- User-approved push текущей ветки разрешен после clean validation; PR/GitHub
  issue/PR mutations и unrelated remote writes остаются запрещены.

## Milestones

- [x] Clean baseline/docs guard: runtime outputs ignored/local, current docs
  compact, clean-current guard active.
- [x] Aturtur intake protocol hardening: init, local-use license opt-in,
  comment-aware risk scan, untracked guard, alias resolution, and artifact
  completion guard.
- [x] Child-runner resilience: quota/shell blockers classified, Windows env
  fallback scoped, and queued continuation avoids durable false stops.
- [x] Advisory imports completed through guarded runner:
  `tool-ar_addexpmantainscalewhenparented`, `tool-ar_addfolders`,
  `tool-ar_coloriselayers`, `tool-ar_coloriselayersbytype`,
  `tool-ar_createdivisionguides`, `tool-ar_createfusionloaders`,
  `tool-ar_dividelayersduration`, and `tool-ar_linkpuppetpinstonulls`.
- [x] Post-commit validation cleanup completed for prior advisory imports.
- [x] Advisory imports completed for `tool-ar_maskstofusionpolygons`,
  `tool-ar_nullstocornerpins`, and `tool-ar_parentabove`.
- [x] Detached child proposals completed for `tool-ar_selectevenlayers` and
  `tool-ar_selectoddlayers`.
- [x] Detached child proposal completed for `tool-ar_splitlayersintoframes`.
- [ ] Continue bounded `--max-items 1` intake loop for remaining `queued=6`.

## Decision Log

- 2026-05-27: Generic full-intake orchestrator processed `AR_SplitLayersIntoFrames.jsx` as `tool-ar_splitlayersintoframes`, keeping shared merge/validation/live/doc/commit gates serial and recording blocked candidates without stopping the whole queue (full-intake:full-intake-aturtur-after-effects-scripts:tool-ar_splitlayersintoframes).

- 2026-07-07: Generic full-intake orchestrator processes queued AR advisory
  candidates through serial merge/validation/ledger/docs/handoff/commit gates;
  recent completed items include `tool-ar_parentabove`,
  `tool-ar_parentaboveodd`, parity selection, and `tool-ar_sequencelayers`.
- 2026-07-07: `tool-ar_parentaboveodd` child-run proposal imports
  `ar-parentaboveodd-typed-plan` as generated/reviewed odd-scope selected-layer
  parenting guidance through existing `set_layer_parent` coverage. Source JSX
  was absent in the detached child worktree, so source-exact odd-selection
  semantics, selection ordering, native UI side effects, layer reordering,
  broad non-generated parenting, raw JSX, live validation, dependency changes,
  push, and PR remain out of scope.
- 2026-07-07: `tool-ar_parentabove` child-run proposal imports
  `ar-parentabove-typed-plan` as generated/reviewed selected-layer parenting
  guidance through existing `set_layer_parent` coverage. Source JSX was absent
  in the detached child worktree, so source-exact selection ordering, native UI
  side effects, layer reordering, broad non-generated parenting, raw JSX, live
  validation, dependency changes, push, and PR remain out of scope.
- 2026-07-07: `tool-ar_selectevenlayers` and `tool-ar_selectoddlayers` import
  active-comp parity selection guidance through existing `set_layer_selection`
  coverage. Source-exact ordering, alternate parity semantics, cross-comp or
  Project panel selection, raw JSX, live validation, dependency changes, push,
  and PR remain out of scope.
- 2026-07-07: `tool-ar_sequencelayers` detached child-run proposal imports
  selected-layer timing sequence guidance through existing
  `set_layer_time_range` coverage. Source JSX was absent in the detached child
  worktree, so source-exact AE Keyframe Assistant behavior, hidden selection
  ordering, overlap/dissolve UI behavior, raw JSX, live validation, dependency
  changes, push, and PR remain out of scope.
- 2026-07-07: `tool-ar_splitlayersintoframes` detached child-run proposal
  imports selected-layer one-frame timing guidance through existing
  `set_layer_time_range` coverage. Source JSX was absent in the detached child
  worktree, so source-exact layer splitting, duplication, source slicing,
  hidden selection ordering, raw JSX, live validation, dependency changes,
  push, and PR remain out of scope.

- 2026-07-07: Generic full-intake orchestrator processed
  `AR_NullsToCornerPins.jsx` as `tool-ar_nullstocornerpins`, keeping
  shared merge, validation, ledger, docs, handoff, and commit gates serial.

- 2026-07-07: Generic full-intake orchestrator processed
  `AR_MasksToFusionPolygons.jsx` as `tool-ar_maskstofusionpolygons`, keeping
  merge, validation, ledger, docs, handoff, and commit gates parent-owned and
  serial.

- Source license для aturtur игнорируется только как local personal-use blocker.
  Это не разрешает raw JSX copy, remote publication, push, PR, dependency
  changes или отключение validation/reducer gates.
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

- [x] Full intake tool-ar_splitlayersintoframes: completed by reusable generic full-intake orchestrator (full-intake:full-intake-aturtur-after-effects-scripts:tool-ar_splitlayersintoframes); live gate not_required, importer batch full-intake-aturtur-after-effects-sc-e909cffea9-import, commit recorded after candidate commit.
- [x] `tool-ar_splitlayersintoframes` detached child-run proposal added
  advisory recipe, intake note, registry metadata, and append-only solution
  smoke assertions; parent importer still owns merge, validation, ledger, docs,
  handoff, and commit gates.
- [x] `tool-ar_sequencelayers` completed by the reusable generic full-intake
  orchestrator; live lane `not_required`, batch
  `full-intake-aturtur-after-effects-sc-b1f63fca05-import`, proof
  `contractComplete=true`, unplanned paths `0`.
- [x] Recent queued AR candidates through `tool-ar_selectoddlayers` remain
  completed with parent-owned source merge, validation, ledger, docs, handoff,
  and commit gates.

- [x] `tool-ar_nullstocornerpins` candidate completed by reusable generic
  full-intake orchestrator; live lane `not_required`, proof
  `contractComplete=true`, unplanned paths `0`, unrelated untracked paths
  allowed by explicit local opt-in.

- [x] `tool-ar_maskstofusionpolygons` candidate commit:
  `c1b9b14c1f888f876f4d178535dd0cb2b5fbb79e`; live lane `not_required`,
  proof `contractComplete=true`, unrelated untracked paths allowed by explicit
  local opt-in.

- [x] Prior guarded runner imports through `tool-ar_nullstocornerpins` remain
  completed with compact proof and post-commit cleanup.
- [x] Detached child proposals for recent candidates added only recipes,
  intake notes, registry metadata, and append-only smoke assertions; parent
  performed source merge, validation, ledger, docs, handoff, and commit gates.

## Validation Notes

Default guard remains `npm.cmd run check:rules`. Source edits also require
`node --check <touched-js-or-mjs>` and `git diff --check`; Full Intaker/importer
edits require relevant smoke coverage.

Recent child runs, including `tool-ar_splitlayersintoframes`, intentionally did
not run validation under the child-run hard boundary; parent importer owns
planned-path proof, JSON/JS checks, solution smoke, source merge, ledger update,
docs, handoff, and commit.

## Validation

| Full intake tool-ar_splitlayersintoframes | Required to let one top-level generic repo intake run handle lane proof, recipe import, non-live validation, generated-only live rerun, ledger update, docs/handoff, and commit for this queued candidate. | Passed in run `full-intake-aturtur-after-effects-scripts`: live lane `not_required`, batch `full-intake-aturtur-after-effects-sc-e909cffea9-import`, live rerun `not_required`, commit `recorded after candidate commit`. No Local/Ollama, fallback provider, dependency/package change, raw JSX copy, source checkout write, broad CEP smoke, push, PR, or GitHub automation was performed. |

Latest candidate validation: `tool-ar_sequencelayers` passed compact
status/proof/ledger checks, JS syntax, solution-library smoke, `check:rules`,
`smoke:solutions`, `smoke:planning`, `smoke:full-intake`, and diff whitespace
checks after compacting this plan and preserving `durationPolicy` in prompt
retrieval.
