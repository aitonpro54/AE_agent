# M191 Mask Safety Live Validation Design

## Goal

M191 proves the first bounded mask write slice through the real AE Agent panel path: CDP opens the existing CEP panel, the Agent UI selects `openai-cli` with model `gpt-5.5`, the panel generates the typed plan, M100 dry run and protected run execute it, After Effects read-back verifies it, semantic verification checks it, and cleanup removes every generated item.

## Typed Tool Scope

`create_layer_mask` is intentionally narrow:

- target one existing layer by generated comp/layer context;
- create exactly one closed polygon mask;
- accept only additive `maskMode:"add"`;
- keep `inverted:false`;
- support bounded vertices, opacity, feather, and expansion;
- return mask shape read-back for semantic verification.

The first slice does not delete masks, invert masks, edit arbitrary existing mask paths, or target user assets.

## Live Acceptance

The M191 live conveyor item runs:

- read-only CEP inspect against the already-open AE Agent panel;
- bridge preflight: `get_bridge_status`, `ping_ae`, saved project, active comp, edit-session status, and render-queue baseline;
- generated-only comp and layer creation with a unique prefix;
- panel-generated typed plan containing `create_comp`, `create_solid_layer`, `create_layer_mask`, and `get_layer_details`;
- dry run;
- protected run;
- `get_layer_details` read-back inside After Effects;
- semantic verification;
- generated-prefix cleanup, failing if generated items remain.

Deterministic backend fallback, Ollama, OpenRouter, broad comp mutation, user asset mutation, destructive mask actions, package changes, push, and PR work are not acceptance evidence for M191.
