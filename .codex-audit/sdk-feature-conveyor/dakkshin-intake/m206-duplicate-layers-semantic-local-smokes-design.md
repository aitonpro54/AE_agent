# M206 Duplicate Layers Semantic Local Smokes Design

## Goal

Add deterministic local semantic verification for the `duplicate_layers` runtime tool.

## Scope

- Treat `duplicate_layers` as a mutating Agent tool for semantic verification.
- Verify one source/duplicate pair per requested `layerIndices` entry.
- Verify duplicate names derived from the returned pairs and expected `nameSuffix`/`sourceNames`.
- Verify before/after layer counts and duplicate count from bridge result fields.
- Require a post-run read-back step after the mutation before semantic status can pass.

## Non-Goals

- No destructive layer deletion.
- No source relinking or deep source/precomp duplication.
- No mask, path, or audio workflow coverage.
- No CEP panel edits, live AE/CEP mutation, dependency changes, push, or PR work.

## Local Evidence Strategy

`scripts/semantic-verification-smoke.js` now builds a synthetic `duplicate_layers` run with two requested sources and a post-run `get_comp_details` read-back. The semantic verifier must report passing checks for source/duplicate pairs, expected duplicate names, and `2 -> 4` layer counts.

The same smoke includes a negative duplicate-many fixture without a post-run read-back step. That fixture must stay `needs_review`, proving duplicate success is not accepted from the mutation payload alone.

`scripts/smoke-test.js` keeps daemon-local queued-tool coverage focused on runtime response shape: one duplicate per requested source, expected duplicate names, and before/after count/post-verification fields.
