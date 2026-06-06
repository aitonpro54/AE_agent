# Toggle Puppet Pin Types Typed Plan

## Goal

Set one explicit `ADBE FreePin3 PosPin Type` property under one generated or
explicitly reviewed `ADBE FreePin3 PosPin Atom`, then read it back.

## Applies When

- The user asks to set or toggle a Puppet pin type on a generated or explicitly
  reviewed Puppet effect target.
- Current `get_effect_details` evidence identifies one `ADBE FreePin3` effect,
  one `ADBE FreePin3 PosPin Atom` ancestor, and the exact
  `ADBE FreePin3 PosPin Type` property path.
- The target `pinType` is explicit: `pinType 1` / `position`, or
  `pinType 4` / `advanced`.
- If the request requires source-exact selected Puppet pin traversal, automatic
  Puppet pin creation, user Puppet effects, project-wide effect scans, Alt-key
  branching, third-party DuIK behavior, raw JSX, or any inferred pin target,
  fail closed and require a separate typed-tool contract.

## Plan Pattern

1. Create or bind one generated comp and one generated layer that can receive a
   Puppet effect.
2. Run `add_effect` with `ADBE FreePin3` only when working with a generated
   target; otherwise require existing explicit typed evidence.
3. Run `get_effect_details` with `includeProperties:true`,
   `includeValues:true`, `propertyDepth:5`, and a bounded `propertyLimit` to
   capture the Puppet effect tree.
4. Confirm the target property path resolves to `ADBE FreePin3 PosPin Type`
   under an `ADBE FreePin3 PosPin Atom` ancestor.
5. Run `set_puppet_pin_type` on the same explicit comp/layer/effect with the
   reviewed `pinType` enum value and optional `expectedPinName` /
   `expectedCurrentPinType` guards.
6. Run `get_effect_details` again and compare the same pin atom/property path
   and final enum value.

## Safety Gates

- Mutating Puppet pin atom workflow.
- Requires validated Agent plan, dry-run, explicit confirmation,
  `allowMutations:true`, idempotency, checkpoint/edit-session protection, and
  post-mutation read-back.
- Do not infer Puppet pins from selected properties, screenshots, source-script
  behavior, prior chat context, or project-wide traversal.
- Do not create Puppet pins, scan every comp/layer/effect, mutate user Puppet
  effects, edit DuIK pins, edit expressions/keyframes/layer transforms/sources,
  render queue items, project items, file output, selection state, or unrelated
  properties.

## Verification

- Pre-run evidence identifies the generated comp, layer, `ADBE FreePin3`
  effect, `ADBE FreePin3 PosPin Atom` ancestor, and
  `ADBE FreePin3 PosPin Type` property path.
- `set_puppet_pin_type` reports the same effect identity, pin atom identity,
  property identity, `allowedPinTypes:[1,4]`, and the requested enum value.
- Post-run `get_effect_details` shows the same pin atom/property path with the
  requested `pinType 1` or `pinType 4` value.
- Unsupported selected-property traversal, missing generated pin atoms,
  automatic pin creation, user Puppet effects, project-wide scans, DuIK
  behavior, raw JSX, and unreviewed effect/property targeting are reported as
  typed-tool gaps.
