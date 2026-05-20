# M114 SDK Write Runner Planned Operation Envelope

## Result

pass

## What changed

Added a local structured planned-operation envelope to `orchestrator/run-write-capable-scaffold.mjs`.

The envelope path is accepted only in dry-run mode through:

```powershell
npm.cmd run codex:orchestrator:write-scaffold -- --dry-run --operation-file .codex-audit/m114-operation-envelope.json
```

This path remains local-only: it does not import the SDK, does not create SDK threads, does not edit target files, does not perform real write work, does not use network access, and does not auto-commit.

## Operation envelope schema

M114 supports this minimum JSON shape:

```json
{
  "version": 1,
  "operationId": "m114-example",
  "scope": "orchestrator",
  "mode": "dry-run",
  "prompt": "Check the write runner envelope contract.",
  "plannedPaths": [
    "orchestrator/run-write-capable-scaffold.mjs",
    "orchestrator/README.md"
  ]
}
```

Supported values:

- `version`: `1`
- `mode`: `dry-run`
- `scope`: `docs-audit`, `orchestrator`, `production-code`, or `cep-panel`

## Validation behavior

Envelope validation runs before any possible SDK thread creation. It rejects:

- missing `--operation-file` in CLI dry-run mode;
- operation file paths outside the repo;
- missing operation files;
- malformed JSON;
- unsupported `version`;
- missing `operationId`;
- missing or unknown `scope`;
- `mode` other than `dry-run`;
- missing `prompt`;
- missing or empty `plannedPaths`;
- unsafe path shapes;
- forbidden paths;
- paths outside the selected scope allowlist;
- unsafe/bypass-capable CLI flags or envelope fields.

## Dry-run report contract

Envelope dry-run still reports:

- `sdkThreadCreated:false`
- `realWriteWork:false`
- `autoCommit:false`

## Validation

Allowed checks run:

- `node --check orchestrator/codex-sdk-orchestrator.mjs` -> pass
- `node --check orchestrator/run-buffered-acceptance.mjs` -> pass
- `node --check orchestrator/run-write-capable-scaffold.mjs` -> pass
- `npm.cmd run codex:orchestrator:help` -> pass
- `npm.cmd run check:rules` -> pass; output included `Write-capable operation envelope mode: pass`
- `git diff --check` -> pass; Git printed only LF-to-CRLF working-copy warnings for touched text files

## Not run

Per M114 restrictions, not run:

- external-provider validation;
- OpenAI CLI planner validation;
- mutating-live;
- live CEP / AE smoke tests;
- tenant-policy bypass;
- production code validation outside the allowed checks;
- CEP panel validation;
- network diagnostics;
- package installation;
- SDK thread creation;
- real write work;
- auto-commit or commit.

## Remaining risks

- M114 is still a local dry-run contract, not a live SDK write runner.
- The envelope validates caller-supplied planned paths; it does not infer paths from prompt text.
- Future live write milestones still need an explicit approval-gated design before SDK thread creation can be introduced.

## Next safe milestone

Keep the write runner local-only and add a dry-run fixture/report path for review tooling, or pause for review before any live SDK write execution design.
