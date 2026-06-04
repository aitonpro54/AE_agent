# Agent Hardcore Autopilot

## Plan Pattern

Use Agent Hardcore when the user wants one autonomous pass through planning, dry-run, protected execution, read-back verification, and repair. The runner should keep each attempt compact: inspect targets, use typed tools, execute only through the validated plan runner, then feed failure and semantic verification evidence into the next attempt.

## Safety Gates

Autopilot does not bypass AE Agent safety. Mutating steps still require validation, idempotency, mutation permission, checkpoint or edit session protection, and read-back verification. Raw ExtendScript remains blocked unless a separate explicit raw gate is designed for that workflow.

## Verification

A successful session reports an ok run and semantic verification status of `passed` or `not_applicable`. Failed sessions must save the compact attempt history, checkpoint or recovery hint, and candidate report evidence for review.
