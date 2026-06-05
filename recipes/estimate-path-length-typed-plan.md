# Estimate Path Length Typed Plan

## Goal

Add reviewed Path Samples and Path Length slider controls to one explicit
generated shape layer and drive the Path Length slider with a generated
expression that samples a known generated vector path.

## Applies When

- The user asks to estimate or expose the length of a shape path.
- The target is a generated or explicitly reviewed shape layer with one known
  rectangle or ellipse vector path and a stable property path.
- The plan can add new Slider Control effects named `Path Samples` and
  `Path Length` on the same generated layer.
- The Path Length expression is generated from typed evidence and references
  only the known generated path plus the generated Path Samples slider, using
  `pointOnPath` sampling to compute the displayed length.
- If the request requires arbitrary selected path traversal, mask paths,
  Bezier vertex/tangent geometry read/write, keyframed paths, source-exact
  selectedProperties behavior, existing slider reuse, expression merging,
  selection persistence, file output, or raw ExtendScript, fail closed and
  require a separate typed-tool contract.

## Plan Pattern

1. Run `get_active_comp` or create a generated comp to bind the target.
2. Create or identify one generated shape layer with a stable rectangle or
   ellipse path target and no existing Path Samples or Path Length effects.
3. Run `add_effect` with `ADBE Slider Control` for `Path Samples`.
4. Run `get_effect_details` for the generated Path Samples slider.
5. Run `set_effect_property` on the Path Samples slider value with reviewed
   sample count, defaulting to `100` only when acceptable.
6. Run `add_effect` with `ADBE Slider Control` for `Path Length`.
7. Run `get_effect_details` for the generated Path Length slider.
8. Run `set_expression` on the Path Length slider property using only the
   reviewed generated path expression and `effect("Path Samples")("Slider")`.
9. Run `get_layer_details` and `get_effect_details` to read back both sliders,
   the sample count, the Path Length expression text, enabled state, and
   expression error state.

## Safety Gates

- Mutating effect/expression workflow.
- Requires validated Agent plan, dry-run, explicit confirmation,
  `allowMutations:true`, idempotency, checkpoint/edit-session protection, and
  post-mutation read-back.
- Do not infer selected paths from prior context, screenshots, or raw source
  script behavior.
- Do not edit the vector path, mask paths, vertices, tangents, keyframes, layer
  transforms, layer names, sources, timing, render queue items, project items,
  selection state, or unrelated effects/properties.

## Verification

- Pre-run evidence identifies the exact generated comp, layer, path target,
  and slider names.
- `add_effect` and `get_effect_details` show generated `Path Samples` and
  `Path Length` Slider Control effects on the expected layer.
- `set_effect_property` reports the expected `Path Samples` value.
- `set_expression` and post-run read-back show the exact generated Path Length
  expression, `expressionEnabled:true`, and no `expressionError`.
- Post-run `get_layer_details`/`get_effect_details` evidence shows no unrelated
  keyframe, path, transform, layer name, source, timing, render queue, project
  item, selection, or unreviewed property mutation.
- Unsupported source-exact selectedProperties traversal, arbitrary path
  geometry, mask paths, path export, keyframed paths, existing expression merge,
  slider reuse, and raw ExtendScript are reported as typed-tool gaps.
