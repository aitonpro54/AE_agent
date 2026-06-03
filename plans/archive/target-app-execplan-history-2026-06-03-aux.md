# Target App Execution Plan Archive: 2026-06-03 AUX Full Intake Notes

This note preserves stale active-plan detail compacted on 2026-06-03 so
`plans/target-app-execplan.md` can stay under the active-plan size target.

## Scope

- AUX parallel candidate worktrees architecture and all-queued selector work.
- ae-scripting scoped acceptances for `tool-debughelper`, `tool-dropnthframe`,
  `tool-getlayertype`, `tool-getpropertyparent`, and `tool-guitemplate`.
- Accepted ae-scripting all-queued proposals from
  `full-intake-ae-scripting-all-queued-20260603-205105`:
  `tool-makeclosest16`, `tool-newadjust`, `tool-niceprecomp`,
  `tool-random-interpolation`, `tool-selectrandomlayers`, `tool-setcolor`,
  `tool-setkeysforpaths`.
- Fail-closed candidates and aliases: `tool-filterinput`,
  `tool-getlayertype_compressed`, `tool-batchparent`,
  `tool-changeallnames`, plus the seven still-queued recovery targets.
- Narrow importer, queue-supervisor, parallel packaging, proof helper,
  child-path isolation, and accepted-registry validation repairs.

## Preserved Decisions

- Child worktrees are proposal-only. The parent owns central ledger,
  registry, recipes, docs, validation, live rerun policy, and commits.
- `--parallel-all-queued` is the explicit opt-in for every current
  parallel-safe `status=queued` candidate and conflicts with manual
  `--parallel-candidate-ids`.
- Local/Ollama, fallback providers, broad/default CEP smoke, dependency
  changes, push/PR, raw JSX copy, and live CEP/AE mutation stayed out of
  scope.
- `newadjust-typed-plan` uses canonical registry input type `comp`; the
  unsupported synonym `composition-target` was not added.
- ScriptUI object method assignments are accepted only with a ScriptUI
  container signal; handler fragments and duplicate compressed aliases remain
  fail-closed.
- ae-scripting `blocked_live_lane_required` entries remain read-only design
  material unless a future typed-tool family proves mutating contracts,
  generated-only fixtures, read-back, semantic verification, cleanup, and a
  narrow live lane.

## Preserved Validation Summary

The compacted AUX slices passed their relevant non-live checks, including
touched-file `node --check` when JavaScript changed, `git diff --check`,
solution library/registry/retrieval smokes, semantic verification,
generic-repo full-intake/importer/queue-supervisor smokes, compact proof and
ledger checks, plus targeted generated-only live lanes where explicitly
required by earlier milestones.

Not run by design during these AUX slices: Local/Ollama, fallback providers,
broad/default CEP smoke, dependency/package changes, push, PR, GitHub
automation, raw JSX copy, full runtime report reads, or live CEP/AE mutation
outside explicitly scoped parent-owned validation.
