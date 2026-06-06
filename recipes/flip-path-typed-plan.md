# Flip Path Typed Plan

## Goal

Flip one explicit generated shape or mask path horizontally or vertically by
reading complete path geometry, computing reviewed flipped geometry, writing it
through `set_path_geometry`, and reading it back with `get_path_geometry`.

## Applies When

- The user asks to flip a Shape or Mask path.
- The target is a generated or explicitly reviewed path target with concrete
  comp identity, `layerIndex`, `targetKind`, and either exact shape
  `propertyPath` or mask index/name evidence.
- Current `get_path_geometry` evidence exposes `vertices`, `inTangents`,
  `outTangents`, `closed`, expression state, and keyframes when the path is
  animated.
- The flip direction is a reviewed bounded value: `horizontal` or `vertical`.
- The plan computes the path bounding-box center from the inspected vertices,
  flips vertices and both tangent arrays around that center, preserves `closed`,
  preserves keyframe times, and writes only the accepted explicit target.
- If the request requires modal ScriptUI behavior, broad
  `comp.selectedProperties` traversal, unreviewed user paths, expression-driven
  paths, partial tangent handling, file output, or raw ExtendScript, fail closed
  and require a separate contract or approval gate.

## Plan Pattern

1. Run `get_active_comp` or create a generated comp before mutation.
2. Create or bind one explicit generated path target. For mask proof, create a
   generated layer and mask; for shape proof, bind an exact generated shape
   path property path.
3. Run `get_path_geometry` with `includeKeyframes:true` when keyframes may be
   present and capture geometry, keyframe times, expression state, target kind,
   layer identity, and mask/property identity.
4. Fail closed when geometry is missing, vertices are empty, tangent array
   lengths do not match vertices, expression state is enabled, keyframe count
   is truncated, target identity is ambiguous, or direction is not exactly
   `horizontal` or `vertical`.
5. Compute `flippedGeometry` for each static or keyframed geometry:
   - horizontal: `x = centerX - (x - centerX)`;
   - vertical: `y = centerY - (y - centerY)`;
   - tangent X values are negated for horizontal flips;
   - tangent Y values are negated for vertical flips;
   - `closed` and keyframe times are preserved.
6. Show the original geometry summary, direction, bounding-box center, target
   identity, and final `flippedGeometry` before confirmation.
7. Run `set_path_geometry` once for the explicit target, using either
   `geometry` or bounded `keyframes`, `clearExisting:true` only when replacing
   reviewed generated keyframes is acceptable, and expected layer/mask guards
   when available.
8. Run `get_path_geometry` after mutation with the same target identity and
   compare vertices, inTangents, outTangents, closed state, and keyframe times
   with `flippedGeometry`.

## Safety Gates

- Mutating path geometry workflow.
- Requires validated Agent plan, dry-run, explicit confirmation,
  `allowMutations:true`, idempotency, checkpoint/edit-session protection, and
  post-mutation read-back.
- Do not infer selected paths from screenshots, prior chat context, or source
  script behavior. Use current `get_path_geometry` evidence before every
  mutation.
- Do not traverse arbitrary selected properties in the mutating step.
- Do not mutate multiple layers, multiple masks, multiple shape paths, path
  expressions, layer transforms, source media, timing, render queue, project
  items, selection state, file output, Essential Graphics, Puppet pins, or
  third-party effects as part of this workflow.

## Verification

- Pre-run evidence identifies the exact comp, layer, target kind, shape
  property path or mask index/name, expression-disabled state, keyframe count,
  vertices, inTangents, outTangents, and closed state.
- Dry-run evidence shows the reviewed `flipDirection`, bounding-box center, and
  final `flippedGeometry` for each static value or keyframe.
- `set_path_geometry` reports the expected target identity and post-verification
  read-back evidence.
- Post-run `get_path_geometry` shows the expected flipped vertices,
  inTangents, outTangents, preserved `closed` state, and preserved keyframe
  times.
- Unsupported source-exact selectedProperties traversal, ScriptUI direction
  dialog semantics, expression-driven paths, unreviewed user paths, file export,
  or raw ExtendScript are reported as typed-tool gaps.
