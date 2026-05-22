# M125 First Orchestrator Fixture SDKThread Write

## Result

pass

## Summary

The first orchestrator fixture JSON `sdk-write` lane is accepted after fixing the host runner post-run diff contract. The M125 SDKThread had already completed and created the planned JSON fixture; the previous failure was the host runner treating the newly-created untracked parent directory `orchestrator/fixtures/` as an out-of-scope changed path.

## SDKThread Write

- SDKThread write performed: yes.
- Number of SDKThread write attempts: 1.
- SDK thread created: yes.
- SDK thread completed: yes.
- Thread id: `019e49ab-b1ee-7270-9593-22934a9bfaeb`.
- Planned output: `orchestrator/fixtures/sdk-write/m125-sdk-thread-fixture.json`.
- Planned output exists: yes.
- Planned output is valid JSON: yes.
- Planned output is non-executable: yes.
- Second M125 retry run: no.

## Host Contract Fix

- Previous failure: `Post-run diff outside orchestrator sdk-write allowlist: orchestrator/fixtures/`.
- Root cause: Git reported the untracked parent directory and the planned child file.
- Fix: `sdk-write` post-run validation now recursively enumerates changed directory entries and normalizes the parent away only when every actual child file is an explicitly planned SDK output.
- Fail-closed cases now covered: enumeration failure, empty directory, unplanned child, forbidden child, `.env`, executable fixture child, `src/**` child, and parent directory outside the selected scope.

## Fixed Validation Result

Replaying the saved M125 pre/post snapshots with the fixed validator produced:

```json
{
  "verdict": "pass",
  "actualChangedFiles": [
    "orchestrator/fixtures/sdk-write/m125-sdk-thread-fixture.json"
  ],
  "normalizedDirectoryEntries": [
    "orchestrator/fixtures/"
  ],
  "outOfScopeFiles": []
}
```

## Validation

- `node --check orchestrator/codex-sdk-orchestrator.mjs`: pass.
- `node --check orchestrator/run-buffered-acceptance.mjs`: pass.
- `node --check orchestrator/run-write-capable-scaffold.mjs`: pass.
- `npm.cmd run codex:orchestrator:help`: pass.
- `npm.cmd run check:rules`: pass; output included `Write-capable sdk-write parent directory normalization mode: pass`.
- `git diff --check`: pass; only LF-to-CRLF working-copy warnings.
- M125 fixture JSON parse check: pass.
- Targeted forbidden-zone status for `src`, `scripts`, `specs`, `cep-panel`, production paths, and `package.json`: clean.

## Safety

- External-provider validation was not run.
- OpenAI CLI planner validation was not run.
- Mutating-live was not run.
- Live CEP / AE smoke tests were not run.
- Tenant-policy bypass was not attempted.
- Production code was not changed.
- CEP panel code was not changed.
- `src/**`, `scripts/**`, and `specs/**` were not changed.
- Package installation was not run.
- Windows ACLs were not modified.
- `git add .` was not used.
