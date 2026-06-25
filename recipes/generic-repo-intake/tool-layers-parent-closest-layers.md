# tool-layers-parent-closest-layers Intake Note

## Source

- Repository: `https://github.com/kyletmartinez/after-effects-scripts`
- Source path: `Layers/Parent_Closest_Layers.jsx`
- Source SHA-256:
  `f6dde815b5e3bfa48b922e0f00911ed23c4997717996ce918b4ae7f5e4ce621a`

## Adaptation

This intake adapts only the safe generated closest-layer parenting intent into
`recipes/parent-closest-layers-typed-plan.md`. No raw JSX is copied into the
product.

The supported path reduces selected-layer wording to explicit generated child
layer indices and concrete nearest-parent layer indices from current
`get_selected_layers`, `get_comp_details`, and `get_layer_details` position
evidence. Each reviewed pair is applied through `set_layer_parent` with expected
child and parent name guards, then verified through post-mutation typed
read-back.

## Fail-Closed Scope

- Source-exact broad selected-layer traversal remains out of scope for
  non-generated user layers.
- Missing Transform Position evidence, equal-distance ties, self-parenting,
  cycles, truncated inventory, ambiguous layer identity, and cross-comp parenting
  remain fail-closed.
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
  `node scripts/cep-panel-cdp-smoke.js full-ui-agent-layer-parent-closest-openai-cli-smoke`
  after read-only CEP readiness.
