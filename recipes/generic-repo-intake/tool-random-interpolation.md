# tool-random-interpolation Intake Note

## Source

- Repository: `https://github.com/ae-scripting/scripting-snippets`
- Source path: `Random Interpolation.jsx`
- License: CC-BY-3.0 attribution required, recorded by the auto-intake ledger.

## Adaptation

This intake adapts only the random keyframe interpolation workflow idea into `recipes/random-interpolation-typed-plan.md`. No raw JSX is copied into the product.

The safe supported path is a deterministic typed-plan adaptation: inspect current selected properties, require explicit reviewed selected keyframes, compute a reviewed `randomInterpolationPolicy` with stable `interpolationAssignments`, apply only bridge-supported interpolation modes through `apply_keyframe_ease`, and read the affected layer/property keyframes back.

## Fail-Closed Scope

- Exact source `Random Interpolation.jsx` selection traversal, UI prompts, randomness, and interpolation behavior are not reproduced.
- Mutation-time nondeterminism, hidden selected-key discovery, broad property scans, arbitrary interpolation/ease curves, spatial tangent edits, keyframe value/time changes, expression edits, raw ExtendScript, and unrelated layer/property mutation require separate typed-tool contracts.
- The detached child worktree did not contain the source JSX, so this recipe keeps the imported behavior limited to the candidate name, wrapper scope, existing selected-property/keyframe typed tools, and fail-closed interpolation semantics.

## Validation

- Not run in this child batch by design.
- Parent importer owns registry validation, solution-library validation, and any live acceptance lane.
