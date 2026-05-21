# M137 Production-Code SDKThread Write Partial

## Result

partial

## Goal

Run exactly one real production-code SDKThread write through the M135/M136 lane for `scripts/provider-contract-smoke.js`.

## Attempt

- Operation file: `.codex-runtime/sdk/operations/m137-production-code-provider-contract-sdk-write.json`
- Operation id: `m137-production-code-provider-contract-sdk-write`
- Scope: `production-code`
- Mode: `sdk-write`
- Planned path: `scripts/provider-contract-smoke.js`
- SDK thread id: `019e4a48-6b4e-7703-a190-c82435911b6f`

## Result Detail

The SDKThread was created but disconnected before completion:

`stream disconnected before completion: error sending request for url (https://api.openai.com/v1/responses)`

The runner recorded:

- `plannedPathCheck.allowed:true`
- `plannedPathPrecondition.mode:"existing-source-update"`
- `plannedPathPrecondition.existingPlannedPaths:["scripts/provider-contract-smoke.js"]`
- `sdkThreadCreated:true`
- `sdkThreadCompleted:false`
- `plannedFileChangedBySdk:false`
- `postDiffCheck.ok:true`
- no changed, staged, or untracked paths after the attempt

## Retry Decision

No second SDKThread attempt was run in M137. A network/escalated retry was requested after the first failure, but auto-review rejected it because it would create a second real SDKThread/network attempt after the milestone was scoped to one attempt.

## Validation

- Pre-attempt operation envelope validation: pass.
- Post-attempt git status: clean.
- Post-attempt `scripts/provider-contract-smoke.js` diff: empty.
- Full post-attempt validation was not rerun because no file changed and M137 ended as a partial SDK disconnect diagnostic.

## Scope Boundaries

- No production-code source file changed.
- No CEP-panel SDK write lane was enabled.
- No broad production-code lane was enabled.
- No second SDKThread retry was run.
