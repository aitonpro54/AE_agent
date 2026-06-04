# New Adjust Typed Plan

## Goal

Create one generated adjustment layer in a verified target composition through existing typed bridge tools, without copying source JSX or relying on unreviewed AE scripting side effects.

## Applies When

- The user asks to add a new adjustment layer, adjustment-layer matte/control layer, comp-wide generated adjustment layer, or similar blank adjustment layer.
- The target composition is the active comp or an explicit comp that can be read before mutation.
- The requested layer name, timing, and coverage can be reviewed before confirmation.
- The workflow needs only a blank generated adjustment layer and optional naming/timing metadata supported by `create_adjustment_layer`.
- If the request requires source-exact `newAdjust.jsx` behavior, exact stack insertion semantics, selection changes, current-time trimming, copying effects or switches, UI prompt behavior, or arbitrary raw ExtendScript, fail closed and require a separate typed-tool contract.

## Inputs

- `targetComp` (`comp`, required): active or explicit composition target verified by `get_active_comp` or `get_comp_details` before mutation.
- `adjustmentLayerSpec` (`object`, optional): reviewed generated layer name, start time, duration, and coverage policy.

## Plan Pattern

1. Run `get_active_comp` or `get_comp_details` to bind the target composition identity, dimensions, duration, frame rate, current time when available, and current layer count.
2. Normalize the requested adjustment layer name to a generated-prefix name unless the user explicitly requested a safe custom generated name.
3. Choose `startTime` and duration from reviewed user intent. Default to `startTime:0` and the full target comp duration when the user asks for a normal comp-wide adjustment layer.
4. Disclose the target comp, layer name, start time, duration, and unsupported source-exact placement or selection semantics before confirmation.
5. Run `create_adjustment_layer` with the reviewed generated name, target comp dimensions, `startTime`, and duration.
6. Use `verifyAfter:true` and a stable `idempotencyKeyTemplate` on the mutating create step.
7. Run `get_comp_details` after mutation to read back the target comp layer count and generated layer presence.
8. Run `get_layer_details` for the generated layer to confirm `adjustmentLayer:true`, expected name, timing, dimensions when exposed, and absence of unexpected effects or source changes.

## Safety Gates

- Mutating composition workflow.
- Requires validated Agent plan, dry-run, explicit confirmation, `allowMutations:true`, idempotency, checkpoint/edit-session protection, and post-mutation read-back.
- Mutate only the generated adjustment layer created by this plan.
- Do not delete, rename, reorder, trim, relink, or edit existing user layers.
- Do not change existing effects, properties, masks, expressions, keyframes, sources, render queue items, project items, comp settings, selection state, or work area.
- Treat exact source JSX behavior, layer stack placement guarantees beyond typed-tool evidence, UI prompts, current-time-sensitive native behavior, and raw ExtendScript as typed-tool gaps.

## Verification

- Pre-run evidence identifies the target comp, dimensions, duration, current layer count, and selected/generated timing policy.
- Dry-run evidence shows the generated layer name, start time, duration, and unsupported source-exact semantics.
- `create_adjustment_layer` returns one generated layer in the expected target comp.
- `get_comp_details` and `get_layer_details` read-back show the generated layer with `adjustmentLayer:true`.
- Post-run evidence shows no unexpected changes to existing user layers, effects, properties, masks, keyframes, expressions, sources, comp settings, render queue items, project items, selection state, or work area.
