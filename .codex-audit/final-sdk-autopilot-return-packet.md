# Final SDK Autopilot Return Packet

## Result
blocked-m125-sdk-write-postrun-contract

## One-line verdict
M121-M124 show successful controlled `docs-audit` and orchestrator Markdown SDKThread writes, and M124 was committed/tagged in this run; M125 did not pass because the single fixture JSON SDKThread write completed and created the planned JSON file, but the host runner failed post-run diff validation on the untracked parent directory `orchestrator/fixtures/`.

## Privacy classification
INTERNAL. This packet contains local repo paths, commit ids, command outcomes, and summarized SDK runner diagnostics. It contains no secrets, credentials, `.env` content, production data, or raw external-provider transcript.

## Goal under review
Target claim requested by the user:

> “SDK automation работает исправно для controlled docs-audit и orchestrator scopes; можно запускать дальнейшую схему в controlled режиме.”

Current evidence supports the claim only through:
- controlled docs-audit writes: M121 and M122;
- controlled orchestrator Markdown writes: M123 and M124.

The claim is not yet safe for the new M125 fixture JSON lane because the runner classified the post-run diff as failed.

## Phase 0 - M124 commit gate
M124 was uncommitted at the start of this run.

- M124 tag before gate: absent.
- M124 allowed files existed:
  - `orchestrator/m124-sdk-thread-orchestrator-scope-output.md`
  - `.codex-audit/124-second-orchestrator-scope-sdk-write.md`
  - `.codex-audit/124-chatgpt-return-packet.md`
  - `plans/target-app-execplan.md` with 11 inserted lines.
- Exact-path staging was used; `git add .` was not used.
- Commit created: `aa3039efeecb894bd673b7997b4902d558432014`.
- Commit subject: `docs: record second orchestrator docs sdk write`.
- Tag created: `sdk-m124-orchestrator-docs-second-sdk-write`.
- Tag target: `aa3039efeecb894bd673b7997b4902d558432014`.

Post-M124 checks passed:
- `node --check orchestrator/codex-sdk-orchestrator.mjs`
- `node --check orchestrator/run-buffered-acceptance.mjs`
- `node --check orchestrator/run-write-capable-scaffold.mjs`
- `npm.cmd run codex:orchestrator:help`
- `npm.cmd run check:rules`
- `git diff --check`
- `git diff --name-only` was empty.
- `git diff --stat` was empty.
- `git status --short --branch` showed only the pre-existing untracked 117r audit packets.

## Phase 1 - M125 implementation before SDK write
Implemented locally, not committed:

- `orchestrator/run-write-capable-scaffold.mjs`
  - Preserved docs-audit `sdk-write`.
  - Preserved orchestrator Markdown `sdk-write`.
  - Added orchestrator fixture JSON planned path support only under `orchestrator/fixtures/sdk-write/**`.
  - Added `.json`-only enforcement for fixture paths.
  - Rejected `.js`, `.mjs`, `.ts`, `.tsx`, `.cmd`, `.bat`, and `.ps1` under the fixture path.
  - Rejected code/runtime/out-of-scope paths including `src/**`, `scripts/**`, `specs/**`, CEP paths, `package.json` as planned SDK output, `.git/**`, `node_modules/**`, `.env`, and outside paths.
  - Added a JSON-specific SDK prompt so the planned `.json` output is valid JSON, not Markdown.
- `orchestrator/run-buffered-acceptance.mjs`
  - Updated contract smoke assertions and user-facing output for M125 controlled-output and fixture JSON mode.
- `orchestrator/README.md`
  - Documented the M125 fixture JSON lane and no-touch path categories.

Implementation checks before the SDK write passed:
- `node --check orchestrator/run-write-capable-scaffold.mjs`
- `node --check orchestrator/run-buffered-acceptance.mjs`
- `node --check orchestrator/codex-sdk-orchestrator.mjs`
- `npm.cmd run check:rules`
  - Output included `PASS M125 SDK orchestrator contract smoke`.
  - Output included `Write-capable orchestrator controlled-output sdk-write mode: pass`.
  - Output included `Write-capable orchestrator fixture JSON sdk-write mode: pass`.
- `npm.cmd run codex:orchestrator:help`
- `git diff --check`
  - Only LF-to-CRLF working-copy warnings for touched text files.
- Planned output existed before SDK write: no.

## M125 SDKThread write attempt
Exactly one SDKThread write attempt was run. No retry was run.

Operation envelope:

```json
{
  "version": 1,
  "operationId": "m125-orchestrator-fixture-json-sdk-write",
  "scope": "orchestrator",
  "mode": "sdk-write",
  "prompt": "Create only `orchestrator/fixtures/sdk-write/m125-sdk-thread-fixture.json`. The file must be valid JSON and non-executable.",
  "plannedPaths": [
    "orchestrator/fixtures/sdk-write/m125-sdk-thread-fixture.json"
  ]
}
```

Command:

```cmd
npm.cmd run codex:orchestrator:write-scaffold -- --operation-file .codex-runtime/sdk/operations/m125-orchestrator-fixture-json-sdk-write-operation.json --acknowledge-existing-change .codex-audit/117r-commit-return-packet.md --acknowledge-existing-change .codex-audit/117r-worktree-reconciliation-return-packet.md --acknowledge-existing-change orchestrator/run-write-capable-scaffold.mjs --acknowledge-existing-change orchestrator/run-buffered-acceptance.mjs --acknowledge-existing-change orchestrator/README.md
```

Runner result:

```text
SDK thread write failed: Post-run diff outside orchestrator sdk-write allowlist: orchestrator/fixtures/
```

Runtime/log facts:
- SDK thread completed: yes.
- SDK thread id: `019e49ab-b1ee-7270-9593-22934a9bfaeb`.
- Selected runtime: `.codex/sdk`.
- SDK log: `.codex/sdk/logs/2026-05-21T08-34-57-134Z-m125-orchestrator-fixture-json-sdk-write-sdk-write.json`.
- Operation envelope path: `.codex-runtime/sdk/operations/m125-orchestrator-fixture-json-sdk-write-operation.json`.
- Fallback diagnostic report found under `.codex-audit/*m125*`: no.

Planned output:
- Path: `orchestrator/fixtures/sdk-write/m125-sdk-thread-fixture.json`.
- Exists after failed runner command: yes.
- Content is valid JSON and matches the requested non-executable fixture shape:

```json
{
  "result": "created-by-sdk-thread",
  "operation": {
    "operationId": "m125-orchestrator-fixture-json-sdk-write",
    "scope": "orchestrator",
    "mode": "sdk-write",
    "plannedPath": "orchestrator/fixtures/sdk-write/m125-sdk-thread-fixture.json"
  },
  "safetyNotes": [
    "Only the planned orchestrator fixture JSON output file was edited by this SDKThread turn."
  ]
}
```

Log summary:
- `sdkThreadCompleted`: `true`
- `outputFileCreatedBySdk`: `false`
- `failure.message`: `Post-run diff outside orchestrator sdk-write allowlist: orchestrator/fixtures/`
- `postRunFailure.message`: `Post-run diff outside orchestrator sdk-write allowlist: orchestrator/fixtures/`
- `postSnapshot.changedPaths` included both:
  - `orchestrator/fixtures/`
  - `orchestrator/fixtures/sdk-write/m125-sdk-thread-fixture.json`

Likely failure class:
- The SDKThread appears to have created the intended file.
- The host runner's post-run diff allowlist failed because Git reported the newly created untracked parent directory `orchestrator/fixtures/` in addition to the planned file.
- This is a host contract/snapshot normalization gap, not evidence that the SDKThread edited production, CEP, `src/**`, `scripts/**`, or `specs/**`.

## Current working tree after stop
No M125 commit or tag was created.

`git status --short --branch` after the failed attempt:

```text
## codex/roadmap-1.3-planning...origin/codex/roadmap-1.3-planning [ahead 40]
 M orchestrator/README.md
 M orchestrator/run-buffered-acceptance.mjs
 M orchestrator/run-write-capable-scaffold.mjs
?? .codex-audit/117r-commit-return-packet.md
?? .codex-audit/117r-worktree-reconciliation-return-packet.md
?? orchestrator/fixtures/
```

Additional local/ignored runtime files exist:
- `.codex-runtime/sdk/operations/m125-orchestrator-fixture-json-sdk-write-operation.json`
- `.codex/sdk/logs/2026-05-21T08-34-57-134Z-m125-orchestrator-fixture-json-sdk-write-sdk-write.json`

This final packet was then created:
- `.codex-audit/final-sdk-autopilot-return-packet.md`

## Safety assertions
- SDKThread write attempts during M125: 1.
- Second M125 SDKThread attempt: no.
- External-provider validation: not run.
- OpenAI CLI planner validation: not run.
- Mutating-live: not run.
- Live CEP / AE smoke tests: not run.
- Tenant-policy bypass: not attempted.
- Production code edits: no.
- CEP panel edits: no.
- `src/**` edits: no.
- `scripts/**` edits: no.
- `specs/**` edits: no.
- Package installation: not run.
- Windows ACL mutation: not run.
- `git add .`: not used.
- Auto-push / branch switch / force-push / history rewrite: not performed.
- M125 commit/tag: not created.

## Stop reason
The autopilot loop stopped because the user-defined global stop condition was hit:

> Stop immediately and create `.codex-audit/final-sdk-autopilot-return-packet.md` if any SDKThread write fails.

The M125 SDKThread write command exited with status 1 due to post-run contract failure.

## Recommended next safe step
Do not retry M125 as-is.

Recommended next milestone:
- Fix the host runner's post-run diff contract for planned outputs inside newly created untracked directories.
- The safest design is to normalize or ignore untracked parent-directory status entries when every actual child change under that directory is an explicitly planned SDK output and no forbidden/out-of-scope child exists.
- Keep the same no-touch zones: no production writes, no CEP writes, no `src/**`, no `scripts/**`, no `specs/**`, no provider/live/mutating validation.
- After the host fix passes local contract smoke, start a fresh controlled M125 retry with exactly one SDKThread write attempt.

## Questions for ChatGPT Pro
1. Is the failure correctly classified as a host post-run diff normalization gap rather than an SDKThread safety failure?
2. Should the next fix normalize untracked parent directory entries, or should the repo commit an inert fixture directory placeholder before retrying?
3. What exact additional contract smoke should be required before a retry, so a newly created nested planned file cannot fail on its parent directory again?
4. Given M121-M124 passed and M125 failed at host post-run validation, is it fair to say controlled docs-audit and orchestrator Markdown scopes are stable, while fixture JSON scope is not yet accepted?
5. Should any of the uncommitted M125 implementation be kept, revised, or discarded before retry?

## Exact next prompt
Continue in `C:\Users\Ant\Documents\Codex\AE_agent`. Read `AGENTS.md`, `.codex/handoff.md`, and `.codex-audit/final-sdk-autopilot-return-packet.md` first. Do not run another M125 SDKThread write. Fix only the host runner post-run diff contract for planned outputs inside newly created untracked directories, keeping the same forbidden zones: no external-provider, no OpenAI CLI planner, no mutating-live, no live CEP/AE smoke, no production/CEP/src/scripts/specs edits, no package install, no tenant-policy bypass. Validate locally with syntax checks, `npm.cmd run check:rules`, `npm.cmd run codex:orchestrator:help`, `git diff --check`, and targeted status/diff checks. Then create a new return packet for ChatGPT Pro before any retry.
