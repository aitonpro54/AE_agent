# AE Agent Releases

## v2.0.0-clean-baseline - 2026-06-04

AE Agent 2.0.0 is maintained as a compact clean baseline.

Current shape:

- local After Effects CEP panel
- local bridge daemon and stdio MCP adapter
- bridge-owned provider calls, AE plan validation, dry-run/run gates,
  checkpoints, edit-session protection, logs, and read-back verification
- typed tools, reviewed recipes, solution registry, and AE-specific Full
  Intaker/importer tooling

Cleanup refresh on 2026-07-02 keeps runtime output local and ignored, removes
stale longrun documentation from the active plan, and keeps historical evidence
in legacy storage or git history.

Validation:

- `npm.cmd run check:rules`
- touched-file `node --check` for JavaScript/MJS edits
- `git diff --check`
- focused `smoke:*` scripts for touched product/tooling surfaces

## Legacy Notes

Earlier release details live outside the clean baseline. Use legacy material
only for targeted lookup; do not re-add historical runtime evidence to this
repository.
