# M136 Production-Code Existing Source Update Hardening

## Result

pass

## Goal

Prepare the M135 production-code SDK write lane for a real update of the existing `scripts/provider-contract-smoke.js` source file without weakening docs-audit or orchestrator output-only lanes.

## Changes

- `orchestrator/run-write-capable-scaffold.mjs`
  - Adds production-code-specific SDK prompt wording for updating an existing source file.
  - Adds `validateSdkWritePlannedPathPrecondition()`.
  - Requires production-code sdk-write planned paths to already exist before SDKThread creation.
  - Keeps docs-audit and orchestrator sdk-write lanes output-only by rejecting pre-existing planned outputs.
  - Keeps the post-run diff allowlist limited to the planned path.
- `orchestrator/run-buffered-acceptance.mjs`
  - Requires contract smoke metadata proving production-code uses the existing-source update precondition.
- `orchestrator/README.md`
  - Documents that the production-code lane is an existing-source update lane.
- `plans/target-app-execplan.md`
  - Records M136 progress, decision, and validation.

## Scope Boundaries

- No SDKThread was created.
- No real SDK write work was run.
- No production-code source file was edited.
- No CEP-panel SDK write lane was enabled.
- No production-code path other than `scripts/provider-contract-smoke.js` was enabled.

## Validation

- `node --check orchestrator/run-write-capable-scaffold.mjs`: pass.
- `node --check orchestrator/run-buffered-acceptance.mjs`: pass.
- `node --check scripts/provider-contract-smoke.js`: pass.
- `npm.cmd run codex:orchestrator:write-scaffold:contract`: pass; output includes `PASS M136 write-capable runner scaffold contract smoke`.
- `npm.cmd run check:rules`: pass; output includes `PASS M136 SDK orchestrator contract smoke`.
- Configured local smoke suite: pass.
- `git diff --check`: pass; Git printed only LF-to-CRLF working-copy warnings.
