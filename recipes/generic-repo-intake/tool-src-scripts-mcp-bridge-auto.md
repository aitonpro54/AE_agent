# Generic Repo Intake: tool-src-scripts-mcp-bridge-auto

- Candidate: `tool-src-scripts-mcp-bridge-auto`
- Source: `src/scripts/mcp-bridge-auto.jsx`
- Status: terminal policy gap for the source bridge wrapper

This intake records `mcp-bridge-auto.jsx` as a policy gap, not as a product
contract to import. No raw JSX is copied into the product, and no command-file
polling bridge is added.

The source script is a floating ScriptUI bridge that polls
`Documents/ae-mcp-bridge/ae_command.json`, writes
`Documents/ae-mcp-bridge/ae_mcp_result.json`, keeps command state in the same
filesystem channel, and falls back to `eval` for JSON parsing. That transport
is outside the AE Agent 2.0 bridge model, which uses explicit typed tools,
planner proposal/run gates, confirmation for mutation, and read-back.

## Scoped Matrix

| Source surface | Current product handling |
| --- | --- |
| ScriptUI palette, scheduled polling, command/result files, status writes, JSON/eval fallback | Terminal policy gap. Do not reproduce the wrapper or filesystem command bus. |
| `getProjectInfo`, `listCompositions`, `getLayerInfo` | Use typed inspection tools such as `get_project_snapshot`, `find_comps`, `get_active_comp`, `get_comp_details`, `get_layer_details`, and `get_selected_layers` as appropriate. |
| `createComposition` | Covered by `create_comp` with explicit dimensions, timing, background color, validation, and read-back. |
| `createTextLayer` | Covered by `create_text_layer` and `update_text_layer`, including bounded left/center/right justification. |
| `createShapeLayer` | Covered by `create_shape_layer` for rectangle, ellipse, polygon, and star with bounded typed fields and read-back. |
| `createSolidLayer`, adjustment-layer branch | Covered by `create_solid_layer` and `create_adjustment_layer` with explicit generated targets and read-back. |
| `setCompositionProperties` | Covered only by bounded `set_comp_properties`; arbitrary comp fields remain fail-closed. |
| `setLayerProperties`, `batchSetLayerProperties` | Covered only by existing typed transforms, timing, and text-update tools after explicit layer evidence; broad batch mutation and source-style active-comp fallback remain fail-closed. |
| `createCamera` | Covered by `create_camera_layer` or `create_camera_with_controller` when the plan has explicit comp/camera parameters and read-back. |
| `duplicateLayer`, `deleteLayer` | Covered by `duplicate_layer`, `duplicate_layers`, and `delete_layer` only with explicit inspected layer identity and post-run read-back. |
| `setLayerMask` | Covered by `set_layer_mask` for one explicit create/update target with geometry/read-back; mask delete and broad mask traversal remain fail-closed unless another contract covers them. |
| `setLayerKeyframe` | Covered only by typed property-keyframe contracts such as `set_property_keyframes` and `apply_keyframe_ease` after explicit property-path evidence. |
| `setLayerExpression` | Covered only by `set_expression` or `clear_expression` after explicit property-path evidence and reviewed expression text. |
| `applyEffect`, `applyEffectTemplate` | Covered only by the existing typed effect and effect-template recipes; arbitrary `.ffx` preset paths, unknown templates, and Curves point/channel semantics remain fail-closed. |
| TheLlamainator-only effect/property helpers | `listLayerEffects`, `listAvailableEffects`, and `setEffectProperty` map to typed effect inspection/property tools when evidence is explicit. `setEffectKeyframe` requires the same property-keyframe evidence as other keyframe plans. |
| TheLlamainator-only layer preset/audio/remove-effect helpers | `applyLayerPreset`, audio clip/level helpers, and `removeLayerEffect` remain unsupported in this candidate. They need separate scoped typed contracts if product support is required. |
| TheLlamainator-only marker helpers | Explicit marker creation maps to `add_comp_marker` or `add_layer_marker` only for reviewed marker payloads. Audio-derived, inferred, or bulk marker workflows remain fail-closed. |
| `bridgeTestEffects` | Not a product contract. It mutates a layer by chaining effect helpers and should be represented, when needed, as an explicit generated-only typed plan with read-back. |

## Terminal Blocker

The source bridge wrapper grants a filesystem command channel the ability to run
a broad mutating dispatcher inside the user's open AE project. It also includes
an `eval` JSON fallback and writes results/status back to user Documents paths.
That combination cannot be made safe by a recipe-only import.

## Future Unblock Conditions

A future product contract would need all of the following before any bridge-auto
behavior could move out of terminal status:

- No `eval` or untrusted JSON execution path.
- No arbitrary Documents/user-path command bus; any queue must be scoped to an
  AE Agent-owned runtime directory or replaced by the existing authenticated
  bridge daemon/connector.
- A strict command allowlist that routes only to existing typed tools, not raw
  source functions.
- Proposal, dry-run, confirmation, checkpoint/edit-session policy, and
  idempotency for every mutating command.
- Generated-only fixtures for each mutating family, post-mutation read-back, and
  semantic verification.
- Cleanup policy for generated project items and generated filesystem artifacts.

## Validation

- Existing bridge contracts cover the safe pieces individually; this candidate
  note does not add a registry solution id.
- Parent closeout owns repo rule checks and Full Intake ledger validation.
