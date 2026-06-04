# Target App Execution Plan

## Active Baseline

This clean repository tracks AE Agent 2.0.0: a local After Effects CEP panel
backed by a local bridge daemon. The bridge remains the owner of provider
access, chat calls, AE plan validation, execution gates, logs, checkpoints, and
edit-session protection.

The clean migration intentionally starts without historical audit packet trees,
old execution-plan archives, runtime logs, or generated proof directories. The
old `AE_agent` repository remains the historical source.

## Current State

- Product/runtime files were copied without changing AE tool contracts, bridge
  API, CEP UI semantics, provider contracts, or recipe semantics.
- Current Full Intaker/importer tooling remains available for AE-specific tool
  intake and validation.
- Generic SDK write/governance history was not copied. Future generic SDK work
  should happen in the sibling `codex-sdk-orchestrator-tool` or a separate
  reviewed migration.

## Guardrails

- Keep this plan compact and current.
- Do not recreate historical archive trees in this repository.
- Keep runtime outputs ignored and outside git.
- Treat Local/Ollama as explicitly requested only.
- Do not run broad/default CEP smoke, live mutation, dependency changes,
  push/PR, raw JSX copy, or external-provider planner validation without a
  separate milestone approval.

## Next Milestone

After this migration commit, the next product milestone can resume from the old
handoff context if needed, but it should record only compact current evidence in
this clean repo.

## Decision Log

- 2026-06-04: Created clean-project baseline in a new repository rather than
  rewriting the old repo history.
- 2026-06-04: Kept AE Agent product and current AE-specific Full
  Intaker/importer tools; excluded old audit packet history and plan archives.

## Validation

- Required for the migration milestone: static no-old-reference checks,
  touched-file syntax checks, `git diff --check`, `npm run check:rules`,
  product smoke scripts, and retained Full Intaker/importer smoke scripts.

## Handoff

Use `.codex/handoff.md` for compact continuation state after each milestone.
