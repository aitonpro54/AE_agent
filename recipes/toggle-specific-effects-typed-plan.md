# Toggle Specific Effects Typed Plan

## Goal

Enable or disable one reviewed effect instance on explicit generated or
explicitly reviewed layer targets using typed effect read-back.

## Applies When

- The user asks to toggle, enable, or disable a specific applied effect.
- Current typed evidence identifies the target composition, exact layer index,
  effect index/name, and exact effect `matchName`.
- The desired final state is reviewed as `enabled:true` or `enabled:false`;
  prefer explicit enable/disable over ambiguous toggle wording.
- If the request requires source-exact project-wide traversal, Alt-key behavior,
  broad selected-layer scans, unreviewed user effects, fuzzy effect matching, or
  raw JSX execution, fail closed.

## Plan Pattern

1. Run `get_active_comp` or use an explicit comp target.
2. Run `get_selected_layers`, `list_layers`, or `get_comp_details` to bind
   concrete target layer indices and names from current evidence.
3. Run `list_effects` or `get_effect_details` for each target layer and match
   only exact effect identity: `effectIndex`, `effectName`, and/or
   `effectMatchName`.
4. Disclose the current `effect.enabled` state and the reviewed final boolean
   state before confirmation.
5. Run `set_effect_enabled` for one explicit effect at a time with
   `expectedCurrentEnabled` when current read-back is available.
6. Run `get_effect_details` after mutation to confirm the same effect identity
   and final `enabled` value.
7. Run `get_layer_details` after mutation to confirm the target layer still owns
   the intended effect and no adjacent layer mutation was required.

## Safety Gates

- Mutating effect-state workflow.
- Requires validated Agent plan, dry-run, explicit confirmation,
  `allowMutations:true`, idempotency, checkpoint/edit-session protection, and
  post-mutation read-back.
- Mutate only the requested `effect.enabled` field on explicit generated or
  explicitly reviewed targets.
- Do not add, remove, reorder, rename, or edit effect properties as a substitute
  for enabled-state toggling.
- Do not traverse all project comps, mutate third-party/user effects without
  review, infer hidden target layers, preserve source-exact selection side
  effects, or run raw ExtendScript.

## Verification

- Pre-run evidence identifies the comp, layer index/name, effect
  index/name/matchName, current enabled state, and reviewed final state.
- `set_effect_enabled` reports the same effect identity, the guarded previous
  state when provided, and `postVerification.enabledMatches:true`.
- Post-run `get_effect_details` shows the same effect with the requested
  `enabled` value.
- Post-run `get_layer_details` shows the target layer still owns the intended
  effect.
- Project-wide source traversal, alt-key branching, broad selected-layer
  traversal, fuzzy display-name matching, unreviewed user effects, effect
  property edits, raw JSX, and non-generated user assets are reported as
  typed-tool gaps.
