# tool-texttokeys Intake Note

## Source

- Repository: `https://github.com/ae-scripting/scripting-snippets`
- Source path: `textToKeys.jsx`
- License: CC-BY-3.0 attribution required, recorded by the auto-intake ledger.

## Adaptation

This intake adapts only the typed workflow idea into `recipes/texttokeys-typed-plan.md`. No raw JSX is copied into the product.

The safe supported path uses `get_active_comp`, `get_selected_layers`, `get_layer_details`, and `set_property_keyframes` to write explicit Source Text keyframes on reviewed text layers, followed by `get_layer_details` read-back.

## Fail-Closed Scope

- Source-exact selected-layer traversal remains unsupported without current selected-layer/text-layer evidence.
- The original typo/no-call behavior is not reproduced.
- Text animators, range selectors, expression-driven text generation, broad layer scans, raw ExtendScript, and unrelated layer/property mutation require separate typed-tool contracts.

## Validation

- Generated-only OpenAI CLI live lane `text-to-keys-generated-only` passed for explicit Source Text keyframes.
- Importer discovery now recognizes legacy `var name = function` JSX candidates so this source file can be analyzed without raw JSX copy.
