# tool-layers-toggle-specific-effects Intake Note

## Parent Reducer Decision

- Candidate id: `tool-layers-toggle-specific-effects`
- Source path: `Layers/Toggle_Specific_Effects.jsx`
- Status: accepted only as a scoped generated-only typed-plan/proof lane
  adaptation.

## Safe Adaptation

The source idea is represented by
`recipes/toggle-specific-effects-typed-plan.md`. No raw source JSX is copied.
The adaptation uses current typed evidence to bind one explicit generated or
reviewed layer/effect target, then mutates only `effect.enabled` through
`set_effect_enabled`.

The generated-only proof lane creates a generated shape layer, adds one
reviewed `ADBE Turbulent Displace` effect, reads its initial enabled state,
sets `enabled:false`, then reads the same effect and layer back.

Source-exact all-project traversal, alt-key behavior, broad selected-layer
matching, unreviewed user effects, third-party effect semantics, effect
addition/removal/reordering, property edits, and raw ExtendScript remain
fail-closed until a separate reviewed contract exists.

## Validation Owner

Parent reducer owns bridge tool validation, semantic verification, scenario
smoke coverage, solution-library smoke coverage, the generated-only live lane
entry, scoped Full Intaker retry evidence, plan/handoff updates, and the
reviewable milestone commit.
