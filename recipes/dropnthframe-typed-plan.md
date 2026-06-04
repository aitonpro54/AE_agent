# Drop Nth Frame Typed Plan

## Goal

Create a reviewed dropped-frame or stepped-motion look with existing typed bridge tools, without copying source JSX or promising source-exact frame deletion.

## Applies When

- The user asks for a drop-frame, skip-frame, every-Nth-frame, stepped playback, or choppy-motion look.
- A safe visual adaptation is acceptable: add a generated adjustment layer with `ADBE Posterize Time`, or set a reviewed Posterize Time frame rate on that generated layer.
- The target composition is the active comp or an explicit comp that can be read before mutation.
- The requested cadence is explicit, finite, and reviewed before confirmation.
- If the request requires actually deleting timeline frames, removing footage samples, time-remapping layers, changing comp duration, shifting keyframes, changing nested comp frame rates, or exact source JSX behavior, fail closed and require a separate typed-tool contract.

## Plan Pattern

1. Run `get_active_comp` or `get_comp_details` to bind the target composition identity, frame rate, duration, dimensions, and current layer count.
2. Normalize the requested cadence into a reviewed Posterize Time frame rate or explicitly report that exact every-Nth-frame deletion is unsupported.
3. Disclose the target comp, original frame rate, requested cadence, supported visual adaptation, and unsupported source-exact semantics before confirmation.
4. Run `create_adjustment_layer` with a generated-prefix name, comp-sized dimensions, `startTime:0`, and the target comp duration.
5. Run `add_effect` on the generated adjustment layer with matchName `ADBE Posterize Time`.
6. Run `get_effect_details` before setting the frame-rate property; fail closed if the Posterize Time frame-rate property cannot be identified from typed evidence.
7. Run `set_effect_property` only for the reviewed Posterize Time frame-rate property and requested value.
8. Use `verifyAfter:true` and a stable `idempotencyKeyTemplate` on each mutating step.
9. Run `get_comp_details`, `get_layer_details`, and `get_effect_details` after mutation to read back the generated adjustment layer and Posterize Time value.

## Safety Gates

- Mutating composition workflow.
- Requires validated Agent plan, dry-run, explicit confirmation, `allowMutations:true`, idempotency, checkpoint/edit-session protection, and post-mutation read-back.
- Mutate only the generated adjustment layer and its Posterize Time effect.
- Do not delete, trim, split, reorder, relink, retime, or rename existing layers.
- Do not change comp frame rate, duration, work area, keyframes, expressions, footage interpretation, render queue items, project items, selection state, sources, masks, or unrelated effects.
- Treat real every-Nth-frame removal, irregular cadence sampling, time remapping, layer splitting, source replacement, render-output frame dropping, and exact source JSX behavior as typed-tool gaps.

## Verification

- Pre-run evidence identifies the target comp, frame rate, duration, dimensions, and current layer count.
- Dry-run evidence shows the requested cadence and the reviewed Posterize Time adaptation.
- `create_adjustment_layer` and `get_layer_details` identify exactly one generated adjustment layer.
- `add_effect` and `get_effect_details` show `ADBE Posterize Time` on that generated layer.
- If a frame-rate value is requested, `set_effect_property` and post-run `get_effect_details` show the same reviewed value.
- Post-run comp read-back shows no unexpected changes to existing user layers, comp timing, keyframes, expressions, sources, render queue items, or project items.
- Unsupported exact drop-frame deletion semantics are reported as typed-tool gaps instead of being approximated silently.
