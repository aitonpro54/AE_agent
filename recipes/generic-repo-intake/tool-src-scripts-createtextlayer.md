# Generic Repo Intake: tool-src-scripts-createtextlayer

- Candidate: `tool-src-scripts-createtextlayer`
- Source: `src/scripts/createTextLayer.jsx`
- Safe typed tools: `create_text_layer`, `update_text_layer`

This intake records the safe generated text-layer creation slice as partially
covered by existing bridge tools. No raw JSX is copied into the product, and no
new bridge contract is added.

The safe supported path maps source text-layer creation to `create_text_layer`
with an explicit target composition, `text`, optional generated `name`,
`position`, `fontSize`, RGB `fillColor`, `startTime`, and `duration`. Plans must
read the generated layer back with `get_layer_details` or `get_comp_details`
before claiming success.

When the request needs text changes after creation, use `update_text_layer`
against a reviewed layer index. It covers Source Text updates and common
TextDocument fields including `font`, `fontSize`, `fillColor`, `applyFill`,
stroke fields, `tracking`, and `leading`, followed by read-back.

Use explicit arguments when source-like defaults matter. The source defaults to
`"Text Layer"`, position `[960, 540]`, font size `72`, white color, start time
`0`, duration `5`, font family `"Arial"`, and centered paragraph alignment.
Current typed tools use bridge defaults unless the plan supplies covered values
directly.

## Fail-Closed Scope

- Paragraph alignment is not covered by current `create_text_layer` or
  `update_text_layer`; source `alignment` / `ParagraphJustification`
  left/center/right behavior requires a separate typed bridge contract,
  generated-only fixture, semantic read-back, cleanup/checkpoint policy, and
  proof.
- Source `fontFamily` creation-time behavior is not exposed by
  `create_text_layer`; use `update_text_layer` with explicit `font` only after
  generated layer identity is known and read back.
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

- Existing bridge contracts: `create_text_layer` and `update_text_layer`.
- Existing semantic verification and scenario fixtures cover generated text
  creation, Source Text updates, common TextDocument field updates, and
  read-back patterns.
- Parent closeout owns repo rule checks, solution smoke, and Full Intake ledger
  validation.
