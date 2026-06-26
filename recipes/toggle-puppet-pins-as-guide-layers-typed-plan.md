# Toggle Puppet Pins As Guide Layers Typed Plan

## Goal

Set native `guideLayer` on one explicit generated or reviewed Puppet pin host
layer, then read the layer and effect evidence back.

## Applies When

- The user asks to set Puppet pin host layers visible or as guide layers, and a
  generated-only adaptation is acceptable.
- Current typed evidence identifies one explicit comp, one layer index/name,
  and a Puppet-like effect on that same layer.
- Generated proof uses `ADBE FreePin3` evidence from `get_effect_details`.
  Exact DuIK `Pseudo/Duik pin02` semantics require explicit reviewed evidence
  or a separate generated/mock third-party fixture before mutation.
- The requested guide state is explicit, such as `guideLayer:true` or
  `guideLayer:false`; Alt-key branching is not inferred.

## Plan Pattern

1. Create or bind one generated comp and generated layer, or bind one explicitly
   reviewed layer with checkpoint/edit-session protection.
2. For generated proof, add `ADBE FreePin3` to the explicit layer with
   `add_effect`; otherwise require existing `get_effect_details` evidence for
   the reviewed Puppet/DuIK-like effect on that same layer.
3. Run `get_effect_details` with bounded property depth/limit and confirm the
   effect identity belongs to the reviewed layer.
4. Run `set_layer_metadata` with one concrete `layerIndices` value,
   matching `expectedLayerNames`, and the explicit `guideLayer` value.
5. Run `get_layer_details` and `get_effect_details` after mutation to prove the
   guide-layer state and effect identity are still present.

## Safety Gates

- Mutating layer metadata workflow.
- Requires validated Agent plan, dry-run, explicit confirmation,
  `allowMutations:true`, idempotency, checkpoint/edit-session protection, and
  post-mutation read-back.
- Do not infer targets from project-wide scans, selected properties, DuIK naming
  conventions, screenshots, prior chat context, or source-script Alt-key state.
- Do not mutate user DuIK effects, edit puppet pin atoms, rename properties,
  change pin sizes, alter expressions/keyframes/layer transforms/sources,
  change timing, touch render queue items, edit Project items, write files, or
  use raw JSX.

## Verification

- Pre-run typed evidence identifies the comp, layer index/name, Puppet-like
  effect name, and effect matchName such as `ADBE FreePin3` or an explicitly
  reviewed `Pseudo/Duik pin02`.
- `set_layer_metadata` reports one target layer and `guideLayer:true` or
  `guideLayer:false` with expected-name guards.
- Post-run `get_layer_details` shows the same layer name/index and requested
  `guideLayer` value.
- Post-run `get_effect_details` shows the same Puppet-like effect identity on
  the same layer.
- Unsupported source-exact all-project traversal, Alt-key branching, user DuIK
  effect mutation, puppet pin atom edits, third-party semantics without a
  generated/mock fixture, raw JSX, and unreviewed targets are reported as
  typed-tool gaps.
