# tool-layers-reset-layer-names

## Candidate

- Source candidate: `tool-layers-reset-layer-names`
- Source behavior: reset every active-comp layer name to the empty string.

## Safe Adaptation

The supported path is a generated/reviewed layer-name reset using
`rename_layers` with an explicit empty-name opt-in:

1. Inspect one explicit generated composition with `get_comp_details
   includeLayers:true`.
2. Bind concrete `layerIndices` and `expectedLayerNames` from that inventory.
3. Run one `rename_layers` call per reviewed layer with `mode:"exact"`,
   `name:""`, `allowEmptyName:true`, one `layerIndices` value, matching
   `expectedLayerNames`, `verifyAfter:true`, and idempotency.
4. Read the same comp back with `get_comp_details` and verify the target layer
   indices now have empty names.

## Fail-Closed Scope

- Broad all-project or unreviewed active-comp traversal.
- Empty-name reset without generated/reviewed target evidence.
- Multi-layer exact rename with `name:""`.
- Stale layer order without `expectedLayerNames`.
- Project item rename, source relinking, layer timing/order changes, effects,
  masks, parenting, expressions, render queue work, file I/O, raw JSX, and
  source-checkout execution.

## Validation Notes

This note records only the typed generated-only adaptation. The source-exact
behavior on arbitrary user comps remains blocked until there is an explicitly
approved checkpoint/rollback scope for destructive non-generated layer-name
mutation.
