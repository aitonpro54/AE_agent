# Add Camera With Controller Typed Plan

## Goal

Create a generated camera and 3D null controller rig in one explicit composition using `create_camera_with_controller` with typed read-back of parenting and controller state.

## Applies When

- The user asks to add a camera with controller, create a camera rig, or parent a camera to a null controller in a composition.
- A safe adaptation is acceptable: use one explicit comp target, create one generated camera/controller pair with `create_camera_with_controller`, then read back camera-parent and controller state.
- The request can accept a bounded rig contract: `camera.parent -> controller`, controller `threeDLayer:true`, and optional `separateControllerPositionDimensions:true`.
- The target composition can be proven by current `get_active_comp` or `get_comp_details` evidence before mutation.
- If the request needs re-parenting existing user layers, multi-camera switch systems, expression-driven controller rigs, arbitrary transform/property edits, recursive project-wide camera setup, or exact source JSX behavior, fail closed and request a separate typed-tool contract.
- The workflow does not require raw script execution, render queue edits, project-item source relinking, dependency changes, or broad user-asset mutation.

## Plan Pattern

1. Run `get_active_comp` for active-comp workflows, or require an explicit composition target and read it with `get_comp_details`.
2. Confirm and disclose the reviewed target comp identity, requested camera/controller names, timing values (`startTime`, `duration`), camera settings (`pointOfInterest`, `cameraPosition`, `zoom`), and `separateControllerPositionDimensions` behavior before confirmation.
3. Run `create_camera_with_controller` once with the explicit comp target and reviewed arguments. Keep `separateControllerPositionDimensions:true` unless the user explicitly asks otherwise.
4. Capture returned `cameraLayer`, `controllerLayer`, and comp identity evidence from the same mutating step.
5. Run `get_layer_details` for the returned camera layer index to confirm the created camera identity and `parent` linkage.
6. Run `get_layer_details` for the returned controller layer index to confirm controller identity and 3D/separated Position state.
7. Fail closed instead of using raw scripts when the request requires re-parenting existing user layers, custom multi-node camera systems, expression-controller networks, camera-switch choreography, recursive/global traversal, or exact source JSX semantics.

## Safety Gates

- Mutating composition-layer workflow.
- Requires validated Agent plan, dry-run, explicit confirmation, `allowMutations:true`, idempotency and post-mutation read-back.
- Use checkpoint or edit-session protection for confirmed live runs.
- Require current explicit comp evidence before binding camera/controller creation targets.
- Mutate only by adding one generated camera and one generated controller layer plus bounded camera/controller fields exposed by `create_camera_with_controller`.
- Do not rename, delete, move, relink, re-parent, retime, or otherwise mutate unrelated existing user layers, comp settings, project items, render queue items, expressions, effects, masks, keyframes, or selection state.
- Treat multi-rig orchestration, existing-layer re-parenting, recursive/global camera operations, and source-exact behavior as typed-tool gaps unless a separate contract proves them.
- Do not use this recipe for render setup/start, project save/saveAs, template-wide camera rewrites, broad automation across comps, or raw ExtendScript.

## Verification

- The plan identifies exactly one explicit target composition before mutation.
- Dry-run evidence lists target comp identity, reviewed camera/controller names, timing values, camera settings, and `separateControllerPositionDimensions` behavior.
- `create_camera_with_controller` returns comp identity plus concrete `cameraLayer` and `controllerLayer` evidence.
- The mutating step evidence confirms `camera.parent` references the generated controller.
- Post-run `get_layer_details` read-back confirms the camera layer identity and the same parent controller identity.
- Post-run `get_layer_details` read-back confirms controller `threeDLayer:true` and separated Position dimensions when requested.
- Skipped or rejected requests are reported with explicit typed-tool gap reasons instead of speculative mutation.
- Post-run evidence shows no unexpected existing-layer re-parenting, no unrelated transform/property changes, no source relinking, no render queue mutation, and no non-generated user-asset mutation.
