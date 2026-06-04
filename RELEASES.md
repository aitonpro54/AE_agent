# AE Agent Releases

## v2.0.0-clean-baseline - 2026-06-04

Current baseline for the clean `AE_agent` repository.

Changed:

- Clean standalone baseline is now the active repository for AE Agent 2.0.0.
- Runtime output, generated proof/report folders, historical audit packets, old
  plan archives, and old handoff-only docs stay out of this repo.
- The product remains a local After Effects CEP panel backed by a local bridge
  daemon and stdio MCP adapter.
- Agent and Agent Hardcore can run `validation.ok` plans that still have review
  warnings; classification is guidance while raw ExtendScript, runtime binding,
  mutation, checkpoint, and edit-session gates remain enforced.
- `generic-repo:*` package scripts are retained only as the current AE-specific
  Full Intaker/importer surface. Generic reusable SDK orchestration belongs in
  the sibling `codex-sdk-orchestrator-tool` through a separate reviewed
  migration.
- Provider defaults remain configurable through environment variables, and
  smoke coverage now checks provider shape, order, auth, and readiness instead
  of locking the clean baseline to a future-sensitive model catalog.
- `mcp-config.example.json` is a safe template that uses portable `node` and a
  repository placeholder instead of machine-specific runtime paths.

Validation:

- Clean baseline validation uses `npm.cmd run check:rules`.
- Source edits require touched-file `node --check` and `git diff --check`.
- Product/provider milestones should run the relevant `smoke:*` package scripts.
- Live CEP/After Effects checks stay read-only unless a later milestone
  explicitly approves mutation.

## Legacy Summary

Earlier v0.2.0 through v1.x release notes live in the dated legacy repository:

```text
C:\Users\Ant\Documents\Codex\AE_agent_legacy_2026-06-04
```

Use that legacy repository only for targeted historical lookup. Do not recreate
old snapshot archives, audit packet trees, broad proof dumps, or generated
runtime evidence inside this clean repo.
