# Plan Confidence And Risk Classification

Milestone 77 adds a compact classification layer on top of Agent plan validation. It does not replace validation, dry-run, mutation gates, checkpoint/edit-session protection, or read-back verification.

The classifier returns `ae-agent-plan-classification.v1` inside `planValidation.classification`, as a top-level `planClassification` on `plan_with_ai_agent`, and as `run.classification` for plan runner results.

## Categories

- `safe typed-tool` - validated read-only plan that uses available typed MCP tools.
- `needs clarification` - plan has a clarifying question, no executable steps, no tool on a step, or missing required fields.
- `risky` - plan is valid but includes project mutations, checkpoint/edit-session expectations, raw ExtendScript, declared high/medium risk, or risky reviewed Solution Library hints.
- `unsupported` - plan references unknown tools or tools that are not available to AI Agent plans.

## Signals

Classification is derived from the existing validation summary:

- step count and executable count;
- mutation count;
- affected target summaries;
- checkpoint expectation;
- raw ExtendScript usage;
- validation warnings and blockers.

When available, it also includes advisory context signals from:

- Solution Library retrieval, including raw ExtendScript recipes, high-risk recipes, mutating recipes and typed-tool-candidate hints;
- Project Intent Memory retrieval, including matched memory ids, categories and high-priority entries.

These context signals are advisory. They never make a plan executable and never bypass runtime safety gates.

## UI Contract

The CEP Plan Review transcript shows a short `Confidence:` verdict before dry-run/run controls. The plan-run status row uses the classification tone:

- `safe typed-tool` -> read-only ready state;
- `risky` -> dry-run-first mutating state;
- `needs clarification` and `unsupported` -> blocked state.

Normal `Run plan` is disabled when `classification.blocksRun` is true. Dry-run is also blocked by the backend when `classification.allowsDryRun` is false.

## Validation

Use:

```powershell
node .\scripts\plan-classification-smoke.js
```

The smoke covers safe, ambiguous, risky and unsupported fixture plans, and checks that Solution Library plus Project Intent Memory signals are reflected in the classification output.
