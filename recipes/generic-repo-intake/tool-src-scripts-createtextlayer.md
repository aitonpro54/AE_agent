# Generic Repo Intake: tool-src-scripts-createtextlayer

- Candidate: `tool-src-scripts-createtextlayer`
- Source: `src/scripts/createTextLayer.jsx`
- Safe typed tools: `create_text_layer`, `update_text_layer`

This intake records the safe generated text-layer creation slice as covered by
typed bridge tools. No raw JSX is copied into the product.

The safe supported path maps source text-layer creation to `create_text_layer`
with an explicit target composition, `text`, optional generated `name`,
`position`, `fontSize`, RGB `fillColor`, paragraph `justification`, `startTime`,
and `duration`. Plans must read the generated layer back with
`get_layer_details` or `get_comp_details` before claiming success.

When the request needs text changes after creation, use `update_text_layer`
against a reviewed layer index. It covers Source Text updates and common
TextDocument fields including `font`, `fontSize`, `fillColor`, `applyFill`,
stroke fields, `tracking`, `leading`, and `justification`, followed by
read-back.

Use explicit arguments when source-like defaults matter. The source defaults to
`"Text Layer"`, position `[960, 540]`, font size `72`, white color, start time
`0`, duration `5`, font family `"Arial"`, and centered paragraph alignment. Use
explicit covered arguments when those defaults matter; for source-style centered
alignment, pass `justification:"center"` and verify `text.justification` in
read-back.

## Fail-Closed Scope

- Source `fontFamily` creation-time behavior is not exposed by
  `create_text_layer`; use `update_text_layer` with explicit `font` only after
  generated layer identity is known and read back.
- Paragraph justification is intentionally bounded to `left`, `center`, and
  `right`; full justify, vertical text, paragraph boxes, baseline/anchor
  inference, and arbitrary TextDocument fields require separate typed-tool
  contracts.
- The source temp args file wrapper, filesystem temp behavior, raw ExtendScript
  execution path, and JSON output formatting are not reproduced.
- Hidden source default semantics, unverified active-comp assumptions, broad
  project scans, source-exact native stack placement, selection side effects,
  text animator changes, render queue changes, and arbitrary layer/property
  mutation require separate typed-tool contracts.
- The supported path requires normal Agent plan validation, mutation
  confirmation, idempotency, checkpoint or edit-session protection, and
  post-mutation read-back before any live run.

## Validation

- Bridge contracts: `create_text_layer` and `update_text_layer`, including
  bounded `justification:left|center|right`.
- Semantic verification covers generated text creation, Source Text updates,
  bounded paragraph justification, common TextDocument field updates, and
  read-back patterns.
- Solution recipe: `recipes/text-layer-justification-typed-plan.md`.
- Parent closeout owns repo rule checks, solution smoke, and Full Intake ledger
  validation.
