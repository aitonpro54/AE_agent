# Generic Repo Intake: tool-layers-create-shapes-from-text

## Safe Adaptation

The supported generated-only path creates one explicit generated text layer,
reads its Source Text, and converts that single layer to AE native shape
outlines through `create_shapes_from_text`. The typed bridge tool wraps only
AE's native `Create Shapes from Text` command and requires concrete
`layerIndex`, `expectedLayerName`, and `expectedSourceText` guards.

## Required Tools

- `create_text_layer`
- `get_layer_details`
- `create_shapes_from_text`
- `get_comp_details`

## Fail-Closed Behavior

- Source-exact selected-layer traversal, converting arbitrary selected text
  layers, preserving or restoring selection side effects, font-outline fidelity
  beyond AE native output, localized menu command absence, non-generated user
  assets, file I/O, render queue work, and raw JSX remain unsupported.
- If AE does not expose the native `Create Shapes from Text` menu command in
  the current host/localization, the candidate stays terminal/live-blocked with
  that precise blocker instead of using raw ExtendScript.

## Proof Lane

Live lane: `text-shapes-from-text-generated-only`.

Focused command:

```cmd
node scripts/cep-panel-cdp-smoke.js full-ui-agent-text-shapes-openai-cli-smoke
```

The lane creates a generated comp and generated text layer, runs
`create_shapes_from_text`, then reads back the generated shape outline layer and
the source text layer. Cleanup is owned by the scenario runner.
