# AE Agent Orchestrator

This clean repo keeps only the AE Agent-specific orchestration surface needed
for current Full Intaker/importer work.

## Current Commands

- `npm run generic-repo:auto-intake`
- `npm run generic-repo:full-intake`
- `npm run generic-repo:tool-importer`
- `npm run generic-repo:importer-supervisor`
- `npm run generic-repo:queue-supervisor`
- `npm run full-intake:status`
- `npm run full-intake:diagnose`
- `npm run full-intake:proof`

## Boundaries

- Historical SDK write/governance proof packets are not part of this clean
  repo.
- Generic reusable SDK orchestration should move toward the sibling
  `codex-sdk-orchestrator-tool`; this repo keeps AE Agent-specific policy and
  bounded importer behavior.
- Runtime artifacts stay in ignored local runtime directories.
- Live CEP/After Effects mutation, external-provider planner validation,
  dependency changes, push, and PR remain separate approval-gated work.

## Validation

Use `npm run check:rules` for clean current-state checks and run the relevant
`smoke:*` package scripts for product or Full Intaker changes.
