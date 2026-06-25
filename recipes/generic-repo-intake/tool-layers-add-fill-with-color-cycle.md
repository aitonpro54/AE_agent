# tool-layers-add-fill-with-color-cycle Intake Note

## Parent Reducer Decision

- Candidate id: `tool-layers-add-fill-with-color-cycle`
- Source path: `Layers/Add_Fill_With_Color_Cycle.jsx`
- Status: accepted only as a scoped generated-only stateless typed-plan/proof
  lane adaptation.

## Safe Adaptation

The source idea is represented by
`recipes/add-fill-with-color-cycle-typed-plan.md`. No raw source JSX is copied.
The adaptation uses existing typed tools on explicit generated or reviewed layer
targets: `add_effect`, `get_effect_details`, `set_effect_property`, and
`get_layer_details`.

The generated-only proof lane proves one reviewed color from the source palette
on a generated layer through `ADBE Fill` effect creation, effect-property
read-back, typed color mutation, and final read-back.

Source-exact `app.settings` and `app.preferences` persistence, automatic
cross-run next-color advancement, broad selected-layer traversal, mutation of
unreviewed user layers, and raw ExtendScript remain fail-closed until a separate
persistent settings contract with preference rollback exists.

## Validation Owner

Parent reducer owns registry validation, solution-library smoke coverage, the
generated-only live lane entry, scoped Full Intaker retry evidence, plan/handoff
updates, and the reviewable milestone commit.
