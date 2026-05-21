# M119 SDK Disconnect / Local Permission Diagnostics

## Result
pass

## Scope
M119 diagnosed the M118 SDK stream/API disconnect and the local `.codex/sdk/**` permission failures without creating SDK threads, without retrying SDK writes, and without network diagnostics.

## M118 Commit Gate
- M118 partial diagnostic retry commit: `bab5451de641ecadb54499f48883b9cbdcf03343`.
- M118 tag: `sdk-m118-docs-audit-sdk-write-retry-partial`.
- Tag target: `bab5451de641ecadb54499f48883b9cbdcf03343`.
- Classification: partial diagnostic retry, not success.
- Planned SDK output `.codex-audit/118-sdk-docs-audit-sdk-thread-output.md`: absent.
- Fallback diagnostic report: `.codex-audit/m118-sdk-docs-audit-real-write-retry-sdk-write-failure-diagnostics.md`.

## M118 Failure Evidence
- SDKThread retry performed in M118: yes, exactly one.
- SDK thread created in M118: yes.
- Thread id: `019e46a0-303c-7b40-afca-d76be0bcb61c`.
- SDKThread completed: no.
- Failure class: SDK stream/API request disconnection before completion.
- Original SDK error: `stream disconnected before completion: error sending request for url (https://api.openai.com/v1/responses)`.
- Primary SDK log write succeeded: no.
- Primary SDK log write error: `EPERM: operation not permitted, open 'C:\Users\Ant\Documents\Codex\AE_agent\.codex\sdk\logs\2026-05-20T18-23-14-938Z-m118-sdk-docs-audit-real-write-retry-sdk-write.json'`.
- Fallback report used: yes.

## Local Permission Evidence
- `.codex` exists.
- `.codex/sdk` exists.
- `.codex/sdk/logs` exists and is listable.
- `.codex/sdk/operations` does not exist.
- `cmd /c dir /a .codex\sdk\operations` returned `File Not Found`.
- `icacls .codex\sdk\operations` failed because the path does not exist.
- `.codex/sdk/logs/m119-permission-probe.tmp` write probe failed with Access denied and no probe file remained.
- `.codex/sdk/operations/m119-permission-probe.tmp` was skipped because `.codex/sdk/operations` is missing.

## ACL Findings
`icacls` shows `.codex`, `.codex\sdk`, and `.codex\sdk\logs` carry an explicit or inherited DENY ACE for SID `S-1-5-21-1783675053-1114247332-2213642931-3321327164`.

The DENY entries include write/delete/create-child style permissions:
- `.codex`: `(DENY)(W,D,Rc,DC)` and child inherit `(DENY)(W,D,Rc,GW,DC)`.
- `.codex\sdk`: inherited `(DENY)(W,D,Rc,DC)` and child inherit `(DENY)(W,D,Rc,GW,DC)`.
- `.codex\sdk\logs`: inherited `(DENY)(W,D,Rc,DC)` and child inherit `(DENY)(W,D,Rc,GW,DC)`.

The same ACLs also list modify/full permissions for other principals, including `DESKTOP-32974QF\CodexSandboxUsers` and `DESKTOP-32974QF\Ant`, but Windows DENY ACEs take precedence for tokens that include the denied SID.

## Conclusions
- `.codex/sdk/logs` is readable/listable but not writable by the current diagnostic process.
- `.codex/sdk/operations` is absent. M118 already recorded that creating it failed with `Access denied`; M119 did not retry directory creation by instruction.
- The most likely local cause of `.codex/sdk/operations` `Access denied` and `.codex/sdk/logs/**` `EPERM` is the inherited explicit DENY ACL on `.codex/**`.
- File lock, read-only attribute, AV/Defender, and Controlled Folder Access are less likely based on the direct ACL evidence and the successful read/list behavior, but they were not exhaustively tested because M119 was limited to local non-network diagnostics.
- The SDK stream/API disconnect is a separate transport/API request failure reported before completion. M119 did not run network/API diagnostics, so the likely cause remains a transient or environment-level SDK/API transport disconnect with low confidence.
- Fallback reporting behavior worked as designed: the runner preserved the original SDK failure, reported the SDK log write failure separately, and wrote a Markdown fallback under `.codex-audit/**`.

## Safety
- SDKThread retry during M119: no.
- SDK thread created during M119: no.
- Network diagnostics: no.
- External-provider validation: no.
- OpenAI CLI planner validation: no.
- Mutating-live: no.
- Live CEP / AE smoke tests: no.
- Tenant-policy bypass: no.
- Production code changed: no.
- CEP panel code changed: no.
- Package installation: no.
- `git add .`: no.
