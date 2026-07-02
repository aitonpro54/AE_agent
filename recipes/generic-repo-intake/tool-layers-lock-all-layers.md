# tool-layers-lock-all-layers Intake Note

## Source

- Source path: `Layers/Lock_All_Layers.jsx`
- Candidate id: `tool-layers-lock-all-layers`
- Import run: `external-script-intake-run`

## Adaptation

This intake adapts only the high-level active-composition layer lock intent into
`recipes/lock-all-layers-typed-plan.md`. No raw JSX is copied into the product.

The safe typed path uses current active-comp and layer inventory evidence, builds
an explicit all-layer target list, then uses `set_layer_metadata` with
`locked:true` and expected layer-name guards. This keeps the mutation inside the
accepted metadata writer rather than relying on raw ExtendScript, hidden UI
selection state, or project-wide assumptions.

## Scope

- The target is one inspected active composition only.
- All affected layer indices and optional expected layer names must come from
  `get_comp_details` read-only evidence for the same comp.
- Already locked layers are idempotent no-ops and may be included in the reviewed
  target list.
- The workflow does not unlock layers, toggle mixed lock states, alter shy/solo,
  visibility, labels, comments, selection, timing, parenting, effects, sources,
  project items, or render queue state.
- Source-exact native undo behavior, UI selection side effects, locked-state
  toggling, and cross-comp/project-wide locking require separate reviewed
  contracts.

## Validation

