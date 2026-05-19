# GPT Pro Review Request: M100 Repair Plan

## Goal

Get a skeptical GPT Pro review before implementing the M100 repair plan for the minimal safe vertical slice:

user prompt -> CEP panel -> Codex/agent process -> structured/visible response -> optional action proposal -> user confirmation -> AE JSX execution -> result/error shown in panel.

## Current State

The local audit concluded that M100 is blocked by unsafe or ambiguous behavior across AE command execution, agent/action/result protocol, confirmation gates, lifecycle diagnostics, and deterministic verification.

Source-of-truth documents included in this bundle:

- `.codex-audit/99-final-audit-report.md`
- `.codex-audit/100-m100-decision.md`
- `.codex-audit/101-m100-repair-plan.md`

Minimal existing code files included only because they are explicitly referenced by the repair plan:

- `mcp-server/bridge-daemon.js`
- `cep-panel/panel.js`
- `mcp-server/mcp-adapter.js`
- `mcp-server/ai-agents.js`

Planned files from the repair plan, such as `mcp-server/m100-protocol.js` and new `scripts/m100-*.js` smoke tests, do not exist yet and are therefore not included as code.

## Proposed Plan

Implement M100 in small patches:

1. Stabilize AE command execution.
2. Add minimal action message envelope.
3. Normalize confirmation and risk gates.
4. Improve lifecycle and diagnostics.
5. Add deterministic M100 vertical smoke.

## Stop-Lines / No-Touch Zones

- Do not implement anything during this review step.
- Do not include `.env`, secrets, logs with secrets, build/dist, `node_modules`, user data, binary files, or After Effects project files.
- Do not run live mutating After Effects checks without explicit approval.
- Do not broaden M100 into full streaming, full job/event bus, React migration, CI/package-manager work, provider default changes, or strict function/tool-call migration unless the review shows a direct M100 safety need.

## Risks And Assumptions

- Current AE command handling may allow stale timed-out commands to mutate AE later.
- Current UI/action inference may render executable controls from ambiguous `result.plan` data.
- Direct tool/MCP/raw JSX paths may bypass the same confirmation semantics as the panel plan path.
- Agent/process errors may be hidden behind generic busy/offline states.
- The proposed repair sequence may be too broad for the smallest safe first patch.
- The proposed protocol may be under-specified for unsafe direct execution paths.

## Privacy Classification

Classification: `INTERNAL` and `PRODUCTION-SENSITIVE`.

Redaction/scope handling:

- The bundle uses an explicit allowlist.
- No `.env` files, credentials, secret logs, user data, binary files, build artifacts, `node_modules`, or After Effects project files are included.
- Included code is limited to the existing files explicitly referenced by the repair plan.
- The bundle builder redacts `generic_secret`-like matches rather than including them raw.
- Local warning review: `phone_like` warnings in the included JS files are false positives caused by protocol date strings, Claude model date ids, and `ANTHROPIC_VERSION`. No raw phone numbers were intentionally included.
- If the bundle builder reports skipped files or unmatched includes, treat the bundle as incomplete until reviewed.

## Questions For GPT Pro

1. Are the chosen M100 blockers correct?
2. Is the patch sequence too broad?
3. Is the proposed agent/action protocol sufficient?
4. Are there unsafe execution paths not addressed?
5. Is the confirmation boundary strong enough?
6. What should be deferred?
7. What is the smallest safer first patch?

## Desired Output

Return a skeptical, implementation-oriented review with:

- verdict: `go`, `revise`, or `stop`
- top failure modes
- weakest assumption
- missing evidence
- recommended changes to the repair plan
- items to defer
- smallest safer first patch
- pre-flight checklist before implementation
