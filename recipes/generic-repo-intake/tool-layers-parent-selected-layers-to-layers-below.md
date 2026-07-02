# tool-layers-parent-selected-layers-to-layers-below Intake Note

## Source

- Repository: `https://github.com/reviewed external AE script collection`
- Source path: `Layers/Parent_Selected_Layers_To_Layers_Below.jsx`
- Source SHA-256:
  `c61e30cbc795d9c27b8cfdd39f4fd1cff0a001015caed0f153379988eabc8b20`

## Adaptation

This intake adapts only the safe generated layer-below parenting intent into
`recipes/parent-selected-layers-to-layers-below-typed-plan.md`. No raw JSX is
copied into the product.

The supported path reduces selected-layer wording to explicit generated child
layer indices and concrete below-parent layer indices from current
`get_selected_layers` plus `get_comp_details` / `get_layer_details` evidence.
Each reviewed pair is applied through `set_layer_parent` with expected child and
parent name guards, then verified through post-mutation typed read-back.

## Fail-Closed Scope

- Source-exact broad selected-layer traversal remains out of scope for
  non-generated user layers.
- Bottom-layer selections, out-of-range below-parent targets, cycles, truncated
  inventory, ambiguous layer identity, and cross-comp parenting remain
  fail-closed.
- Layer creation/deletion/duplication, layer stack reordering, track matte edits,
  labels, effects, expressions, properties, switches, timing, source relinking,
  project items, render queue state, files, preferences, and UI state remain
  fail-closed.
- Raw ExtendScript, source-checkout execution, and native selection side effects
  remain forbidden.

## Validation

- Parent-owned non-live validation covers generated scenario fixtures, report
  smoke, semantic verification, solution registry/retrieval, and scoped Full
  Intaker retry.
- Generated-only live proof uses
  `node scripts/cep-panel-cdp-smoke.js full-ui-agent-layer-parent-below-openai-cli-smoke`
  after read-only CEP readiness.
