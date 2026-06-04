# Toggle Onion Skinning Typed Plan

## Goal

Enable, disable, or toggle generated onion-skinning on one verified composition through the existing `toggle_onion_skinning` typed bridge tool.

## Applies When

- The user asks to turn onion skinning on or off for the active comp or for one explicit composition.
- A safe adaptation is acceptable: use the bridge-owned generated onion skin adjustment layer, `CC Wide Time` effect, and comp comment token instead of copying source JSX.
- The target composition is the active comp, or an exact `compName` / `compItemIndex` has been read from current typed evidence.
- The requested mode is explicitly reviewed as `enable`, `disable`, or `toggle`; prefer `enable` or `disable` when the desired final state is known.
- If the request needs arbitrary source JSX behavior, global property traversal, cleanup of non-generated layers, custom effect graphs, renderer settings, recursive precomp traversal, source relinking, comp duplication, or unrelated layer/property edits, fail closed and request a separate typed-tool contract.

## Plan Pattern

1. Run `get_active_comp` to establish the active composition identity, or use current explicit `get_comp_details` evidence for a named/project-indexed composition.
2. Run `get_comp_details` before mutation when targeting by name/index or when the existing onion-skin state must be inspected.
3. Disclose the target composition, requested `mode`, generated `layerName`, generated `effectName`, current comp comment token state when known, and expected final state before confirmation.
4. Run one `toggle_onion_skinning` step with the reviewed `mode`, target comp identifier, generated `layerName`, and generated `effectName`.
5. For enable/toggle-to-enable plans, run `get_layer_details` and `get_effect_details` for the generated onion skin layer/effect and confirm the generated adjustment layer plus `CC Wide Time` effect.
6. For disable/toggle-to-disable plans, run `get_comp_details` or layer read-back and confirm the generated onion skin layer/effect and comp comment token are absent.
7. Fail closed instead of using raw script execution when the request needs broad cleanup, source-exact side effects, arbitrary effect/property traversal, non-generated user-layer deletion, or adjacent composition/layer mutation.

## Safety Gates

- Mutating composition/layer/effect workflow.
- Requires validated Agent plan, dry-run, explicit confirmation, `allowMutations:true`, idempotency and post-mutation read-back.
- Use checkpoint/edit-session protection because the workflow creates or removes a generated adjustment layer/effect and updates a comp comment token.
- Mutate only the generated onion skin artifact for the accepted target comp. Do not change user layers, timing, order except generated layer placement, layer names outside the generated `layerName`, source relinking, expressions, keyframes, masks, effects outside the generated `CC Wide Time` instance, render queue items, project item names, renderer settings, selection state, or unrelated comps.
- Treat missing `CC Wide Time` support or ambiguous existing onion-skin artifacts as a typed-tool gap unless a separate contract proves safe behavior.
- Do not use this recipe for onion-skin look customization, multi-comp batch toggles, recursive precomp traversal, layer cleanup, source duplication/relinking, camera/controller workflows, version management, template batch changes, or raw script execution.

## Verification

- The plan reads the target composition before mutation and binds exactly one comp target.
- Dry-run evidence lists the reviewed `mode`, generated `layerName`, generated `effectName`, prior onion-skin state when available, and expected final state.
- Each `toggle_onion_skinning` result reports the target comp, `previousEnabled`, final `enabled`, normalized mode, and removed generated artifacts when disabling.
- Enable/toggle-to-enable read-back shows the generated adjustment layer named as requested and a `CC Wide Time` effect instance named as requested.
- Enable/toggle-to-enable read-back shows the comp comment includes the `*onion-skinning*` token managed by the typed tool.
- Disable/toggle-to-disable read-back shows the generated onion skin layer/effect and comp comment token are absent.
- Post-run evidence shows no non-generated user layer, source, timing, expression, keyframe, mask, unrelated effect, project item name, render queue, selection state, renderer setting, recursive nested comp, or unrelated composition mutation.
