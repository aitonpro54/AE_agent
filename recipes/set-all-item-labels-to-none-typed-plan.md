# Set All Item Labels To None Typed Plan

## Intent

Set the AE Project panel label index to `0` for explicitly identified generated
project items using typed bridge evidence and read-back.

## Applies When

- The user asks to set all reviewed Project item labels to none.
- Current typed evidence identifies every target as concrete `itemIndices`.
- A generated-only or otherwise explicitly reviewed project-item scope is
  available before mutation.

## Plan Pattern

1. Run `get_project_info` and `get_project_snapshot`, `find_project_items`, or
   `list_project_folder_items` to enumerate the reviewed target project items.
2. Fail closed if the request depends only on current Project panel selection;
   current typed tools do not expose selected project items.
3. Bind concrete `itemIndices` from current read-back evidence.
4. Include `expectedItemNames` when names are available from the same evidence.
5. Run `set_project_item_metadata` with `label:0` only.
6. Run `find_project_items`, `get_project_snapshot`, or
   `list_project_folder_items` after mutation to read back every target label.

## Safety Gates

- Mutating project-item metadata workflow.
- Requires explicit confirmation, idempotency, and checkpoint/edit-session
  protection under the normal Agent runner.
- Mutate only the AE label index on explicit project items.
- Preserve item names, sources, types, folders, comp contents, layer references,
  render queue items, project files, and unlisted project items.
- Do not use this recipe for label defaults by type, Project panel selection
  reads, item rename, item movement, cleanup/deletion, filesystem operations,
  render queue work, proxy state, folder traversal, or raw ExtendScript.

## Verification

- The plan uses current project-item evidence before mutation.
- `set_project_item_metadata` reports `changedCount` equal to the accepted
  target count and `postVerification.ok:true`.
- Post-run project-item read-back shows every accepted target with `label:0`.
- Post-run evidence shows no unexpected project item deletion, rename, movement,
  source replacement, layer relink, folder cleanup, render queue mutation, or
  file I/O.
