# tool-guitemplate Intake Note

## Source

- Repository: `https://github.com/ae-scripting/scripting-snippets`
- Source path: `guiTemplate.jsx`
- License: CC-BY-3.0 attribution required, recorded by the auto-intake ledger.

## Adaptation

This intake adapts only the ScriptUI template and panel-scaffold idea into `recipes/guitemplate-typed-plan.md`. No raw JSX is copied into the product.

The safe supported path is advisory and non-mutating. It treats GUI scaffold requests as development work for a separate Codex App handoff, not as an AE project operation to run through Agent execution. The Agent may gather minimal read-only project context when relevant, then prepare a compact implementation request that names the target panel files, expected controls, state persistence, safety gates, and verification scope.

## Fail-Closed Scope

- Source-exact `guiTemplate.jsx` ScriptUI layout, event handlers, global object shape, and `somescript.run` execution behavior are not reproduced.
- Automatic CEP/ScriptUI file edits from inside AE chat, raw ExtendScript execution, live panel mutation, dependency changes, broad repository scans, and direct user-asset mutations require a separate Codex App development chat and explicit approval gates.
- If the user asks to build or change the AE Agent panel, this recipe can prepare the dev-request bundle only; it must not imply that the Codex App chat, source edit, live CEP smoke, push, or PR was created automatically.
- The detached child worktree did not contain the source JSX, so this recipe keeps the imported behavior limited to the candidate name, wrapper scope, existing AE Agent dev-handoff policy, and fail-closed generic UI-template semantics.

## Validation

- Not run in this child batch by design.
- Parent importer owns registry validation, solution-library validation, and any live acceptance lane.
