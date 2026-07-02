# tool-layers-toggle-puppet-pins-as-guide-layers Intake Note

## Source

- Repository: `https://github.com/reviewed external AE script collection`
- Source path: `Layers/Toggle_Puppet_Pins_As_Guide_Layers.jsx`
- Source SHA-256:
  `3a1cd2bb5ae313a339978f4157332340c5308b1779cbbf4712693a251646d4e5`

## Safe Adaptation

The supported path is not a project-wide DuIK scan. It accepts only one
explicit generated or reviewed Puppet pin host layer, proves Puppet-like effect
identity through `get_effect_details`, changes only native layer `guideLayer`
through `set_layer_metadata`, then reads back the same layer and effect.

Generated proof uses `ADBE FreePin3` on a generated shape layer. Exact
`Pseudo/Duik pin02` behavior requires explicit reviewed evidence or a separate
generated/mock third-party fixture before mutation. No raw JSX is copied into
the product.

## Required Tools

- `create_comp`
- `create_shape_layer`
- `add_effect`
- `get_effect_details`
- `set_layer_metadata`
- `get_layer_details`

## Fail-Closed Scope

- Source-exact all-project comp/layer/effect traversal remains out of scope.
- Alt-key branching is replaced by an explicit reviewed `guideLayer` boolean.
- User DuIK effects, inferred `Pseudo/Duik pin02` targets, puppet pin atom
  mutation, pin-size changes, property renames, expressions, keyframes, layer
  transforms, source relinking, selection persistence, Project item edits,
  render queue work, file I/O, source-checkout execution, and raw JSX remain
  fail-closed.

## Proof Lane

Live lane: `puppet-pin-guide-layer-generated-only`.

Focused command:

```cmd
node scripts/cep-panel-cdp-smoke.js full-ui-agent-puppet-guide-layer-openai-cli-smoke
```

The lane creates a generated comp and shape layer, adds generated `ADBE FreePin3`
evidence, sets `guideLayer:true` with `set_layer_metadata`, and verifies
`get_layer_details` plus `get_effect_details` read-back. Cleanup is owned by
the scenario runner.
