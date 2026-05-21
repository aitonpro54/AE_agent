# M146 SDK Narrow Production-Ready

## Result

pass

## Goal

Supersede the blocked M145 local artifact after the user restarted Codex with local Variant A config, then run one bounded SDKThread/network proof for the existing narrow `production-code` lane.

## Scope

- Definition: `narrow-lane-production-ready`.
- Scope: `production-code`.
- Planned path: `scripts/provider-contract-smoke.js`.
- General SDK autopilot repo edits remain out of scope.
- Broader production-code and CEP-panel SDK writes remain out of scope.

## SDKThread Proof

- Operation file: `.codex-runtime/sdk/operations/m146-production-code-provider-contract-production-ready-proof.json`.
- Operation id: `m146-production-code-provider-contract-production-ready-proof`.
- Runtime log: `.codex/sdk/logs/2026-05-21T13-34-58-845Z-m146-production-code-provider-contract-production-ready-proof-sdk-write.json`.
- SDK thread id: `019e4abe-638f-7bc1-901d-5bd7bbbbd6bf`.
- Result: `sdk-write-completed`.
- `sdkThreadCreated:true`.
- `sdkThreadCompleted:true`.
- `plannedFileChangedBySdk:true`.
- `sdkWritePostContract.verdict:"pass"`.
- `sdkWritePostContract.actualChangedFiles:["scripts/provider-contract-smoke.js"]`.
- No out-of-scope files.

## Source Change

`scripts/provider-contract-smoke.js` now verifies provider agent ids are unique before checking the exact expected provider order.

## Artifact

Committed artifact:

- `.codex-audit/sdk-production-readiness/146-sdk-production-ready.json`

The artifact records `productionReady:true` only for the narrow single-file lane and keeps `generalSdkWorkflow:"not-production-ready"`.

## Validation

Run after implementation:

- `node --check scripts/provider-contract-smoke.js`
- `node --check scripts/sdk-production-readiness-smoke.js`
- `node --check orchestrator/run-buffered-acceptance.mjs`
- `npm.cmd run codex:orchestrator:production-readiness:smoke`
- `npm.cmd run check:rules`

## Not Run

- Broader production-code SDK writes.
- CEP-panel SDK writes.
- External-provider/OpenAI CLI planner validation.
- Live CEP/After Effects or mutating-live validation.
- Package install or dependency changes.
- Push.
