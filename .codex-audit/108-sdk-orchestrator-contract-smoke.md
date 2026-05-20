# M108 SDK Orchestrator Contract Smoke

## Result
pass

## Files changed
- `orchestrator/codex-sdk-orchestrator.mjs`
- `orchestrator/run-buffered-acceptance.mjs`
- `orchestrator/README.md`
- `package.json`
- `.codex-audit/108-sdk-orchestrator-contract-smoke.md`

## Checks run
- `node --check orchestrator/codex-sdk-orchestrator.mjs` -> pass
- `node --check orchestrator/run-buffered-acceptance.mjs` -> pass
- `npm.cmd run codex:orchestrator:help` -> pass
- `npm.cmd run check:rules` -> pass
- `git diff --check` -> pass, with LF-to-CRLF working-copy warnings only

## Unsafe flags rejected
The local contract smoke verifies that buffered acceptance rejects these unsafe or bypass-capable flags before any SDK thread is created:

- `--approval`
- `--external-provider`
- `--mutating-live`
- `--network`
- `--openai-cli-planner`
- `--sandbox`
- `--skip-git-repo-check`
- `--tenant-policy-bypass`
- `--web-search`

Representative rejected cases include:

- `--sandbox danger-full-access`
- `--sandbox=danger-full-access`
- `--approval on-request`
- `--approval=on-request`
- `--network`
- `--web-search live`
- `--web-search=live`

## Remaining risks
- The general `codex:orchestrator` CLI still exposes unsafe-capable flags for explicit local experiments; M108 only enforces rejection in buffered acceptance mode.
- No real SDK turn, external-provider validation, OpenAI CLI planner validation, mutating-live validation, tenant-policy bypass, production code edit, or CEP panel edit was run.
- The contract smoke validates local wrapper behavior and documentation/script consistency, not provider availability.

## Next safe milestone
Review the M108 diff. A later milestone can add explicit value validation to the general SDK orchestrator CLI if the project wants the local experiment runner itself to reject unsafe combinations outside buffered acceptance mode.
