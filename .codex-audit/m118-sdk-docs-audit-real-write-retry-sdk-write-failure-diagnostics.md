# SDK Write Failure Diagnostic Fallback

## Result
diagnostic-fallback

## Operation
- operationId: m118-sdk-docs-audit-real-write-retry
- operationFile: .codex-audit/m118-sdk-docs-audit-real-write-retry-operation.json
- operation fallback path if .codex/sdk/operations/ is unavailable: .codex-audit/m118-sdk-docs-audit-real-write-retry-operation.json
- attempted log path: .codex/sdk/logs/2026-05-20T18-23-14-938Z-m118-sdk-docs-audit-real-write-retry-sdk-write.json

## Original Failure
- message: stream disconnected before completion: error sending request for url (https://api.openai.com/v1/responses)
- code: (none)
- post-run failure: (none)

## SDK State
- sdkThreadCreated: true
- sdkThreadCompleted: false
- sdkThreadId: 019e46a0-303c-7b40-afca-d76be0bcb61c
- realWriteWork: false
- outputPath: .codex-audit/118-sdk-docs-audit-sdk-thread-output.md
- outputFileCreatedBySdk: false

## Log Write Failure
- message: EPERM: operation not permitted, open 'C:\Users\Ant\Documents\Codex\AE_agent\.codex\sdk\logs\2026-05-20T18-23-14-938Z-m118-sdk-docs-audit-real-write-retry-sdk-write.json'
- code: EPERM

## Safety
- This fallback report is written after a primary SDK log write failure.
- It does not create SDK threads, retry SDK writes, run provider validation, or commit changes.
- The original SDK/post-run failure above remains the primary failure; the log write failure is diagnostic metadata.
