# tool-ar-addexpmantainscalewhenparented Intake Note

## Candidate

- Candidate id: `tool-ar-addexpmantainscalewhenparented`
- Source path: `AR_AddExpMantainScaleWhenParented.jsx`
- Typed plan: `recipes/ar-addexpmantainscalewhenparented-typed-plan.md`

## Safe Adaptation

The candidate intent is treated as a selected-layer expression workflow: add a
bounded immediate-parent maintain-scale expression to `Transform > Scale` for
layers that are already parented in current typed evidence.

The supported adaptation uses `get_active_comp`, `get_selected_layers`,
`get_layer_details` and `set_expression`. It requires explicit selected-layer
targets, concrete parent evidence, exact Scale property paths, dry-run disclosure
of the expression text, confirmation, idempotency and post-mutation expression
read-back.

## Out Of Scope

Source-exact raw JSX execution, creating or changing parenting, applying the
expression to unparented layers, deleting or toggling expressions, replacing
unrelated existing expressions without explicit confirmation, nested parent-chain
compensation, controller rigs, broad property scans, selection side effects,
keyframe edits, layer transform value edits, render queue work, file I/O and
non-generated user-asset mutation remain fail-closed.
