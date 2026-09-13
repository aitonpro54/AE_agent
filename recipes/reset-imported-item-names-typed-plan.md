# Reset Imported Item Names Typed Plan

## Goal

Reset one or more explicit generated imported footage project item names to
their local file display names through existing typed bridge tools.

## Applies When

- The user asks to reset imported footage item names to match the source file
  name after a relink or filename change.
- Safe adaptation is acceptable: every footage item is identified by current
  typed project evidence before mutation.
- Each target is a generated/temp imported footage item whose `file` path and
  intended file display name are visible in `get_project_snapshot`,
  `find_project_items`, or the preceding `import_footage` result.
- The workflow can use `rename_project_items` with concrete `itemIndices`,
  `type:"footage"`, `mode:"exact"`, and one reviewed file display name per
  concrete footage item.
- Source-exact Project panel selection reads, selection ordering, broad all
  selected item traversal, relink operations, missing-footage repair, user
  asset mutation, arbitrary filesystem access, render queue work, and raw
  ExtendScript remain out of scope.

## Plan Pattern

1. Run `get_project_info` to establish current project context.
2. For live proof, create or use a generated/temp local footage fixture. A
   generated PNG created by `save_comp_frame_png` under `logs/generated-exports`
   is acceptable when the run also verifies and removes the generated file.
3. Run `import_footage` only for the generated/temp fixture and optionally give
   it a reviewed stale project item name to prove the reset behavior.
4. Run `get_project_snapshot` and/or `find_project_items` with
   `type:"footage"` to bind exactly the generated target footage item.
5. Derive and disclose the intended display name from the current typed file
   evidence. For the generated fixture, this is the generated PNG filename.
6. Run one `rename_project_items` call per concrete footage item with
   `itemIndices:[itemIndex]`, `type:"footage"`, `mode:"exact"`, and the
   reviewed display name.
7. Include `verifyAfter:true` and a stable `idempotencyKeyTemplate` on the
   mutating project-item rename step when used in normal Agent planning.
8. Run `find_project_items` and `get_project_snapshot` after mutation to
   confirm the footage item name equals its file display name and the `file`
   path still points at the generated/temp fixture.
9. Remove only generated/temp fixture files that were created by this proof
   lane, and let the normal scenario cleanup remove generated project items.
10. Fail closed instead of using raw script execution when the request depends
    on live Project panel selection, relinking, missing footage recovery,
    non-generated user assets, arbitrary file paths, or exact source JSX
    behavior.

## Safety Gates

- Mutating project-item rename plus generated fixture import/export workflow.
- Requires validated Agent plan, dry-run, explicit confirmation,
  `allowMutations:true`, idempotency, and post-mutation read-back.
- Use checkpoint or edit-session protection for confirmed live runs.
- Require current typed evidence for each target footage item and expected file
  display name before binding `itemIndices`.
- Restrict generated file output to `logs/generated-exports` or
  `AE_AGENT_GENERATED_EXPORT_DIR`; never write Desktop or arbitrary user paths.
- Preserve item sources, item types, parent folders, comp contents, layer
  source references, render queue items, unlisted project items, and
  non-generated footage.
- Do not promise Project panel selection reads, source relinking, missing
  footage repair, file imports from arbitrary user paths, item deletion,
  movement, folder cleanup, dependency cleanup, or exact source JSX semantics.

## Verification

- Pre-run evidence identifies every concrete generated footage `itemIndex`,
  stale name, file path, and reviewed target display name.
- `import_footage` imports only the generated/temp fixture and reports footage
  file evidence.
- `rename_project_items` reports `changedCount:1` plus before/after name
  evidence for each explicit footage item.
- Post-run `find_project_items` and `get_project_snapshot` show the target
  footage item name equals the generated file display name and its `file` path
  still points at the generated/temp fixture.
- The stale project item name is absent after reset.
- Generated fixture files are removed after verification, and project-item
  cleanup removes only generated items with the run prefix.
- Post-run evidence shows no unexpected project item deletion, movement, source
  replacement, relink, render queue mutation, project save/saveAs, or
  non-generated user asset mutation.
