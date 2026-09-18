# Effect Template Chain Typed Plan

## Goal

Apply one reviewed effect template to a verified layer using typed effect tools
and effect read-back. This adapts only the fixed whitelist behavior from the
source script; no raw JSX or temp-args launcher behavior is copied.

## Applies When

- The user asks for one of these whitelisted templates: `gaussian-blur`,
  `directional-blur`, `color-balance`, `brightness-contrast`, `glow`,
  `drop-shadow`, `cinematic-look`, or `text-pop`.
- The target layer is selected or explicitly identified in the current active
  composition.
- Template settings are simple reviewed numbers, booleans, or RGBA color arrays
  that can be bound to properties returned by `get_effect_details`.

## Template Whitelist

| Template | Effect chain | Safe settings |
| --- | --- | --- |
| `gaussian-blur` | `ADBE Gaussian Blur 2` | `Blurriness`, default `20` |
| `directional-blur` | `ADBE Directional Blur` | `Direction`, default `0`; `Blur Length`, default `10` |
| `color-balance` | `ADBE Color Balance (HLS)` | `Hue`, `Lightness`, `Saturation`, default `0` |
| `brightness-contrast` | `ADBE Brightness & Contrast 2` | `Brightness`, `Contrast`, default `0`; `Use Legacy`, default `false` |
| `glow` | `ADBE Glow` | `Glow Threshold`, default `50`; `Glow Radius`, default `15`; `Glow Intensity`, default `1` |
| `drop-shadow` | `ADBE Drop Shadow` | `Shadow Color`, default `[0, 0, 0, 1]`; `Opacity`, default `50`; `Direction`, default `135`; `Distance`, default `10`; `Softness`, default `10` |
| `cinematic-look` | `ADBE CurvesCustom`, then `ADBE Vibrance` | Add Curves unconfigured only; set `Vibrance` `15` and `Saturation` `-5` only after property read-back |
| `text-pop` | `ADBE Drop Shadow`, then `ADBE Glow` | Drop Shadow `Shadow Color`, `Opacity` `75`, `Distance` `5`, `Softness` `10`; Glow `Glow Threshold` `50`, `Glow Radius` `10`, `Glow Intensity` `1.5` |

## Plan Pattern

1. Run `get_active_comp` and `get_selected_layers`, or use explicit comp/layer
   indices, to verify the exact target layer before mutation.
2. Reject any `templateName` outside the whitelist above. Reject standalone
   `curves` and any request to edit curve points or channels because current
   typed evidence does not define safe Curves property semantics.
3. For each effect in the selected template, run `add_effect` with the listed
   effect matchName and the verified target layer.
4. Run `get_effect_details` with property read-back after each `add_effect`.
5. Run `set_effect_property` only for settings whose exact property target was
   identified by `get_effect_details`; prefer `propertyMatchName` or
   `propertyPath` from current typed evidence over display-name guessing.
6. Run final `get_effect_details` for every added effect and `get_layer_details`
   for the target layer.

## Safety Gates

- Mutating workflow.
- Requires validated Agent plan, dry-run, explicit confirmation,
  `allowMutations:true`, idempotency, checkpoint or edit-session protection, and
  post-mutation read-back.
- Do not apply settings when the property is missing, ambiguous, hidden, or not
  safely typed by `get_effect_details`.
- Do not infer a layer target from prior chat context.
- Do not use raw ExtendScript, source temp args, display-name-only property
  mutation, arbitrary preset paths, or unreviewed template aliases.

## Fail-Closed Scope

- Standalone `curves` is not enabled. `ADBE CurvesCustom` may be added only as
  the unconfigured first effect in `cinematic-look`; curve point/channel edits
  require a separate typed-tool contract and generated-only proof.
- Unknown templates, partial template name matches, external preset files, and
  custom effect chains require separate review.
- Source result formatting, warning output, temp file argument loading, and
  filesystem behavior are not reproduced.

## Verification

- `add_effect` and first `get_effect_details` show each expected effect
  matchName on the verified layer, in the requested chain order when applicable.
- Every `set_effect_property` target is backed by prior `get_effect_details`
  property evidence and by final post-mutation read-back.
- `get_layer_details` confirms the target layer identity after mutation.
- The plan records any skipped property as fail-closed instead of silently
  guessing.
