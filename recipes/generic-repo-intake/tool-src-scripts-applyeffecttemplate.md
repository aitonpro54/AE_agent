# Generic Repo Intake: tool-src-scripts-applyeffecttemplate

- Candidate: `tool-src-scripts-applyeffecttemplate`
- Source: `src/scripts/applyEffectTemplate.jsx`
- Safe recipe: `recipes/effect-template-chain-typed-plan.md`

This intake adapts the fixed effect-template whitelist into a typed effect
chain recipe. No raw JSX is copied into the product.

The safe supported path verifies an explicit layer target, maps only reviewed
template names to effect matchNames, adds effects with `add_effect`, reads each
effect with `get_effect_details`, and applies simple settings with
`set_effect_property` only after typed property evidence identifies the exact
target.

## Supported Template Names

- `gaussian-blur`
- `directional-blur`
- `color-balance`
- `brightness-contrast`
- `glow`
- `drop-shadow`
- `cinematic-look`
- `text-pop`

## Fail-Closed Scope

- Standalone `curves` remains blocked because Curves property semantics are
  ambiguous without a separate typed contract and generated-only proof.
- In `cinematic-look`, `ADBE CurvesCustom` may be added unconfigured only; curve
  point/channel mutation is not claimed.
- Unknown template names, partial matches, arbitrary effect chains, `.ffx`
  presets, and display-name-only property writes are not enabled.
- The temp args file wrapper, raw ExtendScript execution path, source warning
  output, result formatting, and filesystem behavior are not reproduced.

## Validation

- Registry entry: `effect-template-chain-typed-plan`.
- Solution-library smoke verifies retrieval for effect-template prompts.
- Parent closeout owns repo rule checks and Full Intake ledger validation.
