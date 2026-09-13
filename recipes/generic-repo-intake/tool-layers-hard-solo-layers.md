# tool-layers-hard-solo-layers Intake Note

## Source

- Source path: `Layers/Hard_Solo_Layers.jsx`
- Candidate id: `tool-layers-hard-solo-layers`
- Source summary: disable every unselected layer by assigning each active-comp
  layer's `enabled` state from its current selected state.

## Adaptation

This intake adapts only the hard-solo layer visibility intent into
`recipes/hard-solo-layers-typed-plan.md`. No raw JSX is copied into the product.

The safe typed path uses current `get_selected_layers` and
`get_comp_details(includeLayers:true)` evidence, builds explicit selected and
unselected target lists, then calls `set_layer_metadata` with only
`enabled:true` or `enabled:false` on concrete layer indices with expected layer
name guards. The mutation stays inside the bridge-owned layer metadata writer
and requires post-mutation `get_layer_details` or complete comp read-back.

## Scope

- The target is one inspected composition only.
- Selected and unselected targets must come from current typed evidence for the
  same composition.
- Only the `Layer.enabled` state is mutated.
- Selected generated layers are kept enabled; reviewed non-selected generated
  layers are disabled.
- Native AE solo switches, labels, comments, locks, blend modes, expressions,
  properties, layer order, timing, sources, project items, render queue state,
  previous-enabled-state restoration, cross-comp/project-wide scope, and exact
  source JSX semantics remain out of scope.

## Validation

- Parent-owned non-live validation covers typed-tool schema/syntax, semantic
  verification, generated-only scenario/report fixture, solution retrieval, and
  live-lane metadata.
- No scoped retry or generated-only mutating live CEP/AE proof is run by this
  note. Candidate completion remains gated by explicit generated-only live proof
  approval and readiness.
