# Increment Composition Versions Typed Plan

## Goal

Инкрементировать явный version token в именах generated composition project items через existing typed bridge tools.

## Applies When

- Пользователь просит increment composition versions, bump generated comp version names, or rename generated compositions from one explicit version token to another.
- Safe adaptation is acceptable: every target composition is explicitly found with `find_project_items`, confirmed as a generated composition with `get_comp_details`, then renamed only with `rename_project_items`.
- `currentVersionToken` and `nextVersionToken` are explicit literal strings, such as `_v001` and `_v002`, and the planned before/after names are shown before confirmation.
- This recipe is for generated composition names only; non-generated user assets and ambiguous shared composition names must fail closed.
- If the request needs arbitrary version parsing, numeric carry behavior, all-composition traversal, source relinking, source duplication, onion-skinning, camera/controller parenting, layer timing changes, or exact source JSX behavior, fail closed and request a separate typed-tool contract.
- Задача не требует raw script execution, comp property mutation, layer mutation, render queue edits, source replacement, import/export, or broad project mutation.

## Plan Pattern

1. Run `find_project_items` with explicit generated composition names, a generated-prefix query, or another narrow user-provided search term. Do not use prior chat context as the only target evidence.
2. Require every candidate target to be a composition project item and a generated composition. Use `get_comp_details` for each accepted composition before mutation and record item identity, current name, width, height, duration, frame rate, layer count and comp item identity.
3. Fail closed when targets are missing, duplicated, not compositions, not generated, selected only in the Project panel without typed evidence, or mixed with non-generated user assets.
4. Normalize one literal `currentVersionToken`, one literal `nextVersionToken`, and explicit `caseSensitive` behavior. Default to `caseSensitive:true` unless the user explicitly asks for case-insensitive matching.
5. Compute and disclose `versionIncrementPlan`: target item indices, previous names, expected next names, `currentVersionToken`, `nextVersionToken`, and skipped targets. Fail closed when a target name lacks the current token, the next name would collide, or arbitrary version parsing is required.
6. Run `rename_project_items` with concrete `itemIndices`, `mode:"findReplace"`, literal `find:currentVersionToken`, literal `replace:nextVersionToken`, explicit `caseSensitive`, `verifyAfter:true`, and a stable `idempotencyKeyTemplate`. If different token groups are requested, use one reviewed `rename_project_items` step per token group.
7. Run `find_project_items` for the expected renamed names and `get_comp_details` for the renamed compositions after mutation.
8. Fail closed instead of using raw script execution when the request needs all-composition traversal, source relinking, comp duplication, nested source updates, version-token parsing beyond explicit literal replacement, onion-skinning, camera/controller parenting, or exact source JSX semantics.

## Safety Gates

- Mutating project-item rename workflow for generated compositions only.
- Requires validated Agent plan, dry-run, explicit confirmation, `allowMutations:true`, idempotency and post-mutation read-back.
- Use checkpoint or edit-session protection for confirmed live runs.
- Require current `find_project_items` and `get_comp_details` evidence for every target composition before binding `itemIndices`.
- Mutate only the names of explicit generated composition project items; do not change comp settings, layers, sources, footage, folders, render queue items, expressions, masks, effects, keyframes, or non-generated user assets.
- Treat version matching as literal find/replace only. Do not infer arbitrary version parsing, regex matching, numeric carry behavior, recursive traversal, or source-exact prompt behavior.
- Do not use this recipe for all-composition project traversal, source relinking, versioned comp duplication, source replacement, onion-skinning, camera/controller parenting, template batch updates, user-asset cleanup, or raw script execution.

## Verification

- The plan uses `find_project_items` to identify explicit generated composition project items before mutation.
- Pre-run `get_comp_details` records every target generated composition name, item identity, width, height, duration, frame rate, layer count and comp item identity.
- Dry-run evidence lists `currentVersionToken`, `nextVersionToken`, case-sensitivity, previous names, expected next names, skipped targets, and collision checks.
- The mutating step uses `rename_project_items` with `mode:"findReplace"`, concrete `itemIndices`, literal current and next version tokens, `verifyAfter:true`, and idempotency evidence.
- `rename_project_items` reports `changedCount` for the accepted target count and before/after rename evidence.
- Post-run `find_project_items` and `get_comp_details` show the renamed generated composition names with the requested next version token, no remaining current token on accepted targets, and unchanged width, height, duration, frame rate, layer count and comp item identity.
- The plan reports non-generated user assets, ambiguous targets, arbitrary version parsing, all-composition traversal, source relinking, source duplication, onion-skinning, camera/controller parenting and exact source JSX semantics as typed-tool gaps.
