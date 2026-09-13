# Shape Layer Polystar Typed Plan

## Goal

Create generated or explicitly reviewed polygon and star shape layers through
the bounded `create_shape_layer` typed tool, without copying source JSX or
opening arbitrary vector-shape mutation.

## Applies When

- The user asks to create a polygon or star shape layer.
- The target composition is explicit by `compName`, `compItemIndex`, or current
  active-comp evidence.
- The requested geometry can be expressed as `shape:"polygon"` or
  `shape:"star"` with reviewed `points`, `outerRadius`, and, for stars,
  `innerRadius`.

## Plan Pattern

1. Bind the target composition with `get_active_comp`, `get_comp_details`, or an
   explicit `compName` / `compItemIndex`.
2. Choose a generated or explicitly reviewed layer name.
3. Normalize geometry to:
   - polygon: `shape:"polygon"`, integer `points` from 3 to 64, and positive
     `outerRadius`;
   - star: `shape:"star"`, integer `points` from 3 to 64, positive
     `outerRadius`, and positive `innerRadius` less than `outerRadius`.
4. Run `create_shape_layer` with explicit styling, position, timing, and the
   reviewed polygon/star geometry.
5. Run `get_layer_details` or `get_comp_details` after mutation and verify
   `shapeContents` reports matching `type`, `starType`, `points`,
   `outerRadius`, and `innerRadius` when applicable.

## Safety Gates

- Mutating workflow.
- Requires validated Agent plan, dry-run, explicit confirmation,
  `allowMutations:true`, idempotency, checkpoint or edit-session protection, and
  post-mutation read-back.
- Use generated names/prefixes for new assets unless the user explicitly reviews
  a target user composition and rollback path.
- Do not infer hidden shape defaults from screenshots, prior chat context,
  untyped selections, or old source wrapper behavior.
- Do not use raw ExtendScript, source-checkout scripts, temp args files,
  arbitrary vector path editing, broad project scans, or render queue work.

## Fail-Closed Scope

- Rectangle/ellipse `size` remains separate from polygon/star radii.
- Polygon does not accept `innerRadius`; star requires `innerRadius` lower than
  `outerRadius`.
- Source temp-args wrappers, filesystem behavior, JSON output formatting,
  hidden native defaults, selected-layer side effects, arbitrary shape group
  mutation, path vertices, roundness, trim paths, repeaters, and expressions
  require separate typed-tool contracts.
- Non-generated user-asset mutation remains fail-closed unless explicitly
  reviewed with checkpoint/edit-session protection.

## Verification

- Dry-run evidence lists the target comp, generated/reviewed layer name,
  reviewed `shape`, `points`, radii, styling, position, timing, and unsupported
  source-exact behavior.
- Mutation uses only `create_shape_layer`; `starType`, when supplied, matches
  `shape`.
- Post-run `get_layer_details` or `get_comp_details` shows the same layer with
  matching `shapeContents.type`, `shapeContents.starType`,
  `shapeContents.points`, `shapeContents.outerRadius`, and, for stars,
  `shapeContents.innerRadius`.
- The plan records unsupported wrapper, file I/O, arbitrary vector edits,
  hidden defaults, selection side effects, and raw JSX as typed-tool gaps.
