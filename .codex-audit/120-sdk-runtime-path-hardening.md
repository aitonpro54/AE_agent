# M120 SDK Runtime Path Hardening

## Result

pass

## Summary

M119 diagnostics were committed and tagged before M120 started. M120 removes the write-capable runner's hard dependency on writable `.codex/sdk/**` routine runtime paths by adding a runtime preflight with an ignored fallback under `.codex-runtime/sdk/**`.

## M119 Commit Gate

- Commit created: yes.
- Commit hash: `85cfe8532e5847d3ecc3126ee804c279835a1b5c`.
- Tag created: yes.
- Tag name: `sdk-m119-sdk-disconnect-permission-diagnostics`.
- Tag target: `85cfe8532e5847d3ecc3126ee804c279835a1b5c`.
- Committed files:
  - `plans/target-app-execplan.md`
  - `.codex-audit/119-sdk-disconnect-and-permission-diagnostics.md`
  - `.codex-audit/119-chatgpt-return-packet.md`

## Runtime Path Changes

- Primary runtime remains `.codex/sdk`.
- The runner preflights both `logs` and `operations` under the primary runtime.
- If primary runtime preflight is unavailable, selected routine runtime becomes `.codex-runtime/sdk`.
- Fallback runtime directories are `.codex-runtime/sdk/logs` and `.codex-runtime/sdk/operations`.
- `.codex-runtime/` is ignored by git.
- Routine SDK logs and operation fallback paths no longer use `.codex-audit/**`.
- Diagnostic fallback reports still use `.codex-audit/<operation>-sdk-write-failure-diagnostics.md`.

## Contract Coverage

- Primary runtime unavailable -> fallback selected: yes.
- Fallback runtime write probe succeeds: yes.
- Fallback runtime temp probe files cleaned: yes.
- No SDK thread creation during runtime smoke: yes.
- No real write work during runtime smoke: yes.
- Existing docs-audit sdk-write validation still passes: yes.
- Unsafe flags still rejected: yes.
- Forbidden paths still rejected: yes.
- Diagnostic report fallback still works when both primary and fallback runtime logging fail: yes.

## Validation

- `node --check orchestrator/codex-sdk-orchestrator.mjs`: pass.
- `node --check orchestrator/run-buffered-acceptance.mjs`: pass.
- `node --check orchestrator/run-write-capable-scaffold.mjs`: pass.
- `npm.cmd run codex:orchestrator:help`: pass.
- `npm.cmd run check:rules`: pass; output includes `Write-capable sdk runtime fallback mode: pass`.
- `.codex-runtime/sdk/logs/m120-runtime-probe.tmp`: write succeeded and cleanup left `exists_after_cleanup=False`.
- `.codex-runtime/sdk/operations/m120-runtime-probe.tmp`: write succeeded and cleanup left `exists_after_cleanup=False`.
- Read-only `dir /a` and `icacls` inspection of `.codex`, `.codex\sdk`, and `.codex\sdk\logs`: pass; inherited DENY write/create-child ACLs remain visible under `.codex/**`.

## Safety

- SDKThread retry run during M120: no.
- SDK thread created during M120: no.
- External-provider validation run: no.
- OpenAI CLI planner validation run: no.
- Mutating-live run: no.
- Live CEP / AE smoke tests run: no.
- Tenant-policy bypass attempted: no.
- Production code changed: no.
- CEP panel code changed: no.
- Network diagnostics run: no.
- Package installation run: no.
- Windows ACLs modified: no.
- `git add .` used: no.
