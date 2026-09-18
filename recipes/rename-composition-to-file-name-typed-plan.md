# Rename Composition To File Name Typed Plan

## Goal

Rename one explicit generated composition project item to the reviewed project
file basename using existing typed bridge tools.

## Applies When

- The user asks to rename a composition to match the current After Effects
  project file name.
- The target composition is explicit and generated, with current
  `get_comp_details` and `find_project_items` evidence before mutation.
- `get_project_info.file` is available and its basename without extension is
  disclosed as the exact target name before confirmation.
- If the project is unsaved, `get_project_info.file` is null, the basename is
  ambiguous, the target would collide with an existing project item, or the
  request needs Project panel selection semantics, fail closed.
- The task does not require saving the project, exporting files, reading or
  writing arbitrary filesystem paths, source relinking, layer mutation, render
  queue work, or raw script execution.

## Plan Pattern

1. Run `get_project_info` and derive a single project file basename from
   `get_project_info.file`. Do not use a user-entered path or prior chat
   context as the only basename evidence.
2. Run `get_active_comp` or `find_project_items` to bind one explicit target
   composition. Use `get_comp_details` to verify the target is a generated
   composition and record item identity, current name, width, height, duration,
   frame rate, layer count and work area.
3. Run `find_project_items` for the target basename to check for project item
   name collisions before mutation.
4. Run `rename_project_items` once with concrete `itemIndices`, `type:"comp"`,
   `mode:"exact"`, `name:<projectFileBasename>`, `verifyAfter:true`, and a
   stable `idempotencyKeyTemplate`.
5. Run `find_project_items` for the basename and `get_comp_details` after
   mutation to prove the same generated composition was renamed and structural
   fields stayed unchanged.
6. Fail closed instead of using raw script execution when exact source JSX
   behavior, Project panel selection, unsaved project naming, file I/O, broad
   composition traversal, source relinking, or user-asset mutation is required.

## Safety Gates

- Mutating project-item rename workflow for one explicit generated composition
  only.
- Requires validated Agent plan, dry-run, explicit confirmation,
  `allowMutations:true`, idempotency, checkpoint/edit-session protection, and
  post-mutation read-back.
- `usesFileIo` is allowed only as read-only `get_project_info.file` basename
  evidence. The plan must not save the project, create files, export files, read
  arbitrary paths, write arbitrary paths, or reveal/open filesystem locations.
- Mutate only the composition project item name; do not change comp settings,
  layers, sources, folders, render queue items, expressions, masks, effects,
  keyframes, or non-generated user assets.

## Verification

- `get_project_info.file` is present and the exact project file basename is
  shown before confirmation.
- Pre-run `find_project_items` and `get_comp_details` identify exactly one
  generated composition target and no target-name collision.
- `rename_project_items` uses concrete `itemIndices`, `type:"comp"`,
  `mode:"exact"`, and the reviewed project file basename as `name`.
- `rename_project_items` reports `changedCount:1` plus before/after evidence.
- Post-run `find_project_items` and `get_comp_details` show the renamed
  generated composition with unchanged item identity, width, height, duration,
  frame rate, layer count and work area.
- The plan reports unsaved projects, basename collisions, Project panel
  selection, arbitrary filesystem work, source relinking, non-generated user
  assets, broad traversal and exact source JSX semantics as typed-tool gaps.
