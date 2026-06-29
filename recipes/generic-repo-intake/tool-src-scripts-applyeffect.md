# Generic Repo Intake: tool-src-scripts-applyeffect

- Candidate: `tool-src-scripts-applyeffect`
- Source: `src/scripts/applyEffect.jsx`
- Safe recipe: `recipes/safe-effect-addition-typed-plan.md`

This intake records the bounded part of the source behavior as already covered
by existing typed effect tools, and records the arbitrary preset path branch as
a policy gap. No raw JSX is copied into the product.

The safe supported path uses `add_effect` against a verified layer target,
prefers explicit effect `matchName` evidence, reads the added effect back with
`get_effect_details`, and uses `set_effect_property` only after typed read-back
has identified the exact property target.

## Fail-Closed Scope

- `presetPath` / `.ffx` preset application is not enabled. Arbitrary user paths
  require a separate safe path policy, generated fixture, read-back, cleanup,
  and semantic verification before any product support.
- Display-name-only effect lookup is not treated as sufficient when matchName
  evidence is available.
- Loose `effectSettings` maps are not applied directly by display property
  names; property writes must be derived from `get_effect_details` evidence.
- The temp args file wrapper, raw ExtendScript execution path, source output
  formatting, and filesystem behavior are not reproduced.

## Validation

- Existing registry entry: `safe-effect-addition-typed-plan`.
- Existing solution-library smoke verifies retrieval for safe effect-addition
  prompts.
- Parent closeout owns repo rule checks and Full Intake ledger validation.
