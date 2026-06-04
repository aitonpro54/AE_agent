# tool-keyreverse Intake Note

## Source

- Repository: `https://github.com/ae-scripting/scripting-snippets`
- Source path: `keyReverse.jsx`
- License: CC-BY-3.0 attribution required, recorded by the auto-intake ledger.

## Adaptation

This intake adapts only the selected-keyframe reverse intent into
`recipes/keyreverse-typed-plan.md`. No raw JSX is copied into the product.
Parent review confirmed the source creates new reversed keyframes starting at
the current comp time and attempts temporal/spatial ease and tangent transfer;
the accepted typed recipe deliberately does not claim that source-exact mode.

The current safe path uses existing typed keyframe tools. The plan reads the
active composition and current selected-property evidence, requires explicit
reviewed selected keyframe times and values for each accepted property, computes
a reversed value sequence at the same selected keyframe times, applies it with
`set_property_keyframes`, and reads the affected property back.

## Fail-Closed Scope

- Source JSX is not copied or executed.
- The detached child worktree did not contain `keyReverse.jsx`, so this recipe
  is limited to the candidate name, wrapper scope, existing selected-property
  keyframe tools, and fail-closed keyframe semantics.
- Selected-key discovery from native AE UI state, adding reversed key copies at
  the playhead, changing keyframe times, removing keys, recreating a full
  property timeline, preserving exact temporal or spatial interpolation,
  expression-derived sampling, source-exact native undo behavior, raw
  ExtendScript, and selection side effects are not reproduced.
- A source-exact reverse operation that adds reversed copies at current comp
  time or rewrites full keyframe state requires a separate typed-tool contract
  with explicit selected-key discovery, insert/delete/replace semantics,
  interpolation/ease evidence, idempotency, and post-mutation read-back.

## Validation

- Not run in this child batch by design.
- Parent importer owns registry validation, solution-library validation,
  semantic verification, and any future live acceptance lane.
