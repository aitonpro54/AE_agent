# tool-layers-replace-grid-rig-control Intake Note

## Source

- Repository: `https://github.com/reviewed external AE script collection`
- Source path: `Layers/Replace_Grid_Rig_Control.jsx`
- Source SHA-256:
  `b57137e6d1262a3ab0f3d7a914ce003b88f8758343430033133b574d8c836039`

## Safe Adaptation

The supported path replaces only one explicit generated or reviewed Grid Rig
Control layer. It creates one generated shape replacement, preserves the
reviewed layer `label`, `enabled`, and `guideLayer` metadata through
`set_layer_metadata`, adds two generated `ADBE Slider Control` effects named
`Gutter` and `Matte Roundness`, deletes exactly one inspected old layer through
`delete_layer`, then reads the stack, layer, and effects back.

No raw JSX is copied into the product.

## Required Tools

- `get_selected_layers`
- `get_layer_details`
- `create_shape_layer`
- `set_layer_metadata`
- `add_effect`
- `get_effect_details`
- `delete_layer`
- `get_comp_details`

## Fail-Closed Scope

- Source-exact selected-layer inference remains out of scope until selection is
  reduced to one explicit layer index/name.
- Non-generated destructive replacement requires explicit checkpoint/rollback
  scope and is not implied by the generated-only proof lane.
- Third-party Flex semantics beyond the reviewed Grid Rig Control layer name,
  expression/property copying, parenting, track mattes, arbitrary effect
  copying, layer stack reordering beyond the generated replacement insertion,
  file I/O, render queue work, source-checkout execution, and raw JSX remain
  fail-closed.

## Proof Lane

Live lane: `grid-rig-control-replacement-generated-only`.

Focused command:

```cmd
node scripts/cep-panel-cdp-smoke.js full-ui-agent-grid-rig-control-openai-cli-smoke
```

The lane creates a generated comp and old generated control null, applies
metadata including `guideLayer`, creates a generated shape replacement, adds the
two Slider Control effects, deletes the old layer, and verifies final layer and
effect read-back. Cleanup is owned by the scenario runner.
