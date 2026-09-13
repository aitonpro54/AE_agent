# Toggle Puppet On Transparent Typed Plan

## Goal

Set the `ADBE FreePin3 On Transparent` property on one explicit generated
Puppet effect and read the boolean state back.

## Applies When

- The user asks to set Puppet `On Transparent` for a generated or explicitly
  reviewed Puppet effect target.
- The target comp, layer, effect, and property are explicit typed-tool evidence,
  not inferred from project-wide traversal.
- The plan can add or bind a generated `ADBE FreePin3` effect on a generated
  layer, read `ADBE FreePin3 On Transparent`, set a reviewed boolean value, and
  read the same property back.
- If the request requires source-exact all-project scanning, Alt-key branching,
  user-layer Puppet effects, puppet pin atom mutation, DuIK behavior, raw JSX,
  or any unreviewed effect/property target, fail closed and require a separate
  typed-tool contract.

## Plan Pattern

1. Create or bind one generated comp and one generated layer that can receive
   effects.
2. Run `add_effect` with `ADBE FreePin3` for the generated Puppet effect.
3. Run `get_effect_details` with `includeProperties:true` and `includeValues:true`
   to confirm the effect `matchName` and the boolean
   `ADBE FreePin3 On Transparent` property are present.
4. Run `set_effect_property` on the same explicit effect with
   `propertyMatchName:"ADBE FreePin3 On Transparent"`, reviewed boolean value,
   and `setAtTime:false`.
5. Run `get_effect_details` again to read back the boolean value, effect
   identity, and property identity.

## Safety Gates

- Mutating effect-property workflow.
- Requires validated Agent plan, dry-run, explicit confirmation,
  `allowMutations:true`, idempotency, checkpoint/edit-session protection, and
  post-mutation read-back.
- Do not infer Puppet effects from project contents, selected properties,
  screenshots, or source-script behavior.
- Do not traverse all project comps/layers, mutate user Puppet effects, edit
  puppet pins, edit layer transforms, expressions, keyframes, sources, timing,
  render queue items, project items, selection state, or unrelated effects.

## Verification

- Pre-run evidence identifies the generated comp, layer, generated Puppet effect
  name, `ADBE FreePin3` matchName, and `ADBE FreePin3 On Transparent` property.
- `add_effect` and first `get_effect_details` show the generated Puppet effect
  and the target boolean property on the expected layer.
- `set_effect_property` reports `propertyMatchName:"ADBE FreePin3 On Transparent"`
  and the reviewed boolean value with `setAtTime:false`.
- Post-run `get_effect_details` shows the same effect and property with the
  requested boolean value.
- Unsupported source-exact all-project traversal, Alt-key branching, user Puppet
  effects, puppet pin atom mutation, third-party DuIK behavior, raw JSX, and
  unreviewed effect/property targeting are reported as typed-tool gaps.
