# M109 SDK Orchestrator CLI Value Validation

## Result
pass

## Files changed
- `orchestrator/codex-sdk-orchestrator.mjs`
- `orchestrator/run-buffered-acceptance.mjs`
- `orchestrator/README.md`
- `.codex-audit/109-sdk-orchestrator-cli-value-validation.md`

## Checks run
- `node --check orchestrator/codex-sdk-orchestrator.mjs` -> pass
- `node --check orchestrator/run-buffered-acceptance.mjs` -> pass
- `npm.cmd run codex:orchestrator:help` -> pass
- `npm.cmd run check:rules` -> pass
- `git diff --check` -> pass, with LF-to-CRLF working-copy warnings only

## Invalid values rejected
The general `codex:orchestrator` CLI now rejects invalid values during local argument parsing, before creating a Codex SDK client or SDK thread.

Local contract smoke covers these representative invalid cases:

- `--sandbox writable`
- `--sandbox=`
- `--approval always`
- `--approval=`
- `--web-search enabled`
- `--web-search=`
- `--network=enabled`
- `--skip-git-repo-check=yes`

The validated general CLI value sets are:

- `--sandbox`: `read-only`, `workspace-write`, `danger-full-access`
- `--approval`: `never`, `on-request`, `on-failure`, `untrusted`
- `--web-search`: `disabled`, `cached`, `live`

Boolean flags are deterministic: bare flags mean `true`, `=false` means `false`, and any other inline value is rejected.

## Buffered acceptance safety status
unchanged

Buffered acceptance still rejects unsafe or bypass-capable flags before SDK thread creation:

- `--approval`
- `--external-provider`
- `--mutating-live`
- `--network`
- `--openai-cli-planner`
- `--sandbox`
- `--skip-git-repo-check`
- `--tenant-policy-bypass`
- `--web-search`

Buffered acceptance still forces:

- `sandboxMode: "read-only"`
- `approvalPolicy: "never"`
- `networkAccessEnabled: false`
- `webSearchMode: "disabled"`

## Remaining risks
- No real SDK turn was run by design.
- No external-provider validation, OpenAI CLI planner validation, mutating-live validation, live CEP / AE smoke test, tenant-policy bypass, production code edit, CEP panel edit, network diagnostic, or npm/cache diagnostic was run.
- The local contract smoke validates parser and wrapper contracts, not provider availability.

## Next safe milestone
Review the M109 diff. A later safe milestone can add read-only documentation or audit coverage around SDK orchestrator usage examples if needed, without running live provider or CEP/AE validation.
