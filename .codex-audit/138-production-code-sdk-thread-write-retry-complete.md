# M138 Production-Code SDKThread Write Retry Complete

## Result

complete

## Goal

Run the one risk-informed, user-approved production-code SDKThread/network retry for `.codex-runtime/sdk/operations/m137-production-code-provider-contract-sdk-write.json` with planned path `scripts/provider-contract-smoke.js`.

## Approval

The user explicitly acknowledged that the retry may send private repository code or context to the external OpenAI SDK/network endpoint, and approved exactly one retry for:

- Operation file: `.codex-runtime/sdk/operations/m137-production-code-provider-contract-sdk-write.json`
- Planned path: `scripts/provider-contract-smoke.js`

## Attempt

- Command: `npm.cmd run codex:orchestrator:write-scaffold -- --operation-file .codex-runtime/sdk/operations/m137-production-code-provider-contract-sdk-write.json`
- Result: `sdk-write-completed`
- Operation id: `m137-production-code-provider-contract-sdk-write`
- Scope: `production-code`
- Mode: `sdk-write`
- SDK thread id: `019e4a58-49e9-7231-9e3c-28d6d99c024a`
- Runtime log: `.codex/sdk/logs/2026-05-21T11-43-29-153Z-m137-production-code-provider-contract-sdk-write-sdk-write.json`

## Result Detail

The SDKThread completed and updated only `scripts/provider-contract-smoke.js`.

The runner recorded:

- `plannedPathCheck.allowed:true`
- `plannedPathPrecondition.mode:"existing-source-update"`
- `sdkThreadCreated:true`
- `sdkThreadCompleted:true`
- `plannedFileChangedBySdk:true`
- `sdkWritePostContract.verdict:"pass"`
- `postSnapshot.changedPaths:["scripts/provider-contract-smoke.js"]`
- no out-of-scope files

## Source Change

`scripts/provider-contract-smoke.js` now asserts the relative order of the provider agents:

- `openai-api`
- `openai-cli`
- `gemini-api`
- `claude-api`
- `openrouter`

## Validation

- `node --check scripts/provider-contract-smoke.js`: pass.
- `node scripts/provider-contract-smoke.js`: pass.
- `git diff --check`: pass; Git printed only the existing LF-to-CRLF working-copy warning for `scripts/provider-contract-smoke.js`.

## Scope Boundaries

- Only the planned production-code source file was changed by SDKThread.
- No CEP-panel SDK write lane was enabled.
- No broad production-code lane was enabled.
- No additional SDKThread retry was run after the approved M138 retry.
