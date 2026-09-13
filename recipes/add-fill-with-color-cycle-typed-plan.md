# Add Fill With Color Cycle Typed Plan

## Goal

Apply an `ADBE Fill` effect with one reviewed color from the six-color cycle to
explicit generated or reviewed layer targets, then read the effect color back.

## Applies When

- The user asks to add Fill with a color-cycle style result to selected or
  explicit layers.
- A stateless adaptation is acceptable: the plan uses one reviewed color from
  red, green, blue, yellow, magenta, or cyan for this run.
- Current typed evidence identifies the target comp and exact layer targets
  before mutation.
- If the request requires source-exact `app.settings` or `app.preferences`
  persistence, automatic cross-run color advancement, broad selected-layer
  traversal, or raw JSX execution, fail closed and require a separate typed-tool
  contract with preference rollback.

## Plan Pattern

1. Run `get_active_comp` and `get_selected_layers`, or use explicit generated
   layer evidence from `get_comp_details`, to bind the target comp and layer
   indices before mutation.
2. Choose and display one reviewed cycle color from this fixed palette:
   `red [1,0,0]`, `green [0,1,0]`, `blue [0,0,1]`, `yellow [1,1,0]`,
   `magenta [1,0,1]`, or `cyan [0,1,1]`.
3. Run `add_effect` with matchName `ADBE Fill` on each explicit target layer.
4. Run `get_effect_details` with `includeProperties:true` and
   `includeValues:true` for every added Fill effect.
5. Run `set_effect_property` only after `get_effect_details` identifies the
   Fill `Color` property, using the reviewed color and `setAtTime:false`.
6. Run `get_effect_details` again to confirm the same effect identity and final
   color value.
7. Run `get_layer_details` for each target layer to confirm the intended layer
   still owns the Fill effect.

## Safety Gates

- Mutating effect-property workflow.
- Requires validated Agent plan, dry-run, explicit confirmation,
  `allowMutations:true`, idempotency, checkpoint/edit-session protection, and
  post-mutation read-back.
- Do not read or write AE `app.settings`, call `app.preferences.saveToDisk`,
  persist color state between runs, or claim source-exact cycle advancement.
- Do not add Fill to unverified layers, infer layer targets from stale chat
  context, mutate non-generated user assets without explicit review, edit
  expressions/keyframes/sources/timing/render queue/project items, or execute
  raw JSX.

## Verification

- Pre-run evidence identifies the target comp, every target layer index/name,
  and the reviewed cycle color.
- `add_effect` and first `get_effect_details` show `ADBE Fill` on each expected
  layer.
- `set_effect_property` reports the same Fill effect and the reviewed color
  value with `setAtTime:false`.
- Post-run `get_effect_details` shows the Fill `Color` property set to the
  reviewed color on each expected effect.
- `get_layer_details` confirms the target layers remain the intended layers.
- Source-exact `app.settings`/`app.preferences` color-cycle persistence,
  automatic next-color state, broad selected-layer traversal, raw JSX, and
  unreviewed effect/property targets are reported as typed-tool gaps.
