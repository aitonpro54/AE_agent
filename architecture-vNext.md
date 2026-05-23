# AE Agent Architecture vNext

## 1. Purpose

AE Agent vNext should become a safe, extensible After Effects automation system, not just a chat panel that sends generated scripts into AE.

The target architecture is:

- Codex CLI as the primary active intelligence layer.
- AE Bridge as the trusted execution and safety layer.
- Typed Tools as the default automation surface.
- Verified script knowledge base as a controlled source of new capabilities.
- SDK Orchestrator as the long-running automation layer for repo work, script intake, testing, promotion, and documentation.

This document is a review draft. It describes the current implemented baseline, desired direction, risks, and open questions.

## 1.1 vNext 1.1 Current Direction

Treat vNext 1.1 as the current architecture baseline until a later architecture note explicitly replaces it.

The accepted direction is not autonomous GitHub script execution. The accepted direction is a safety-aware retrieval and promotion system:

- Typed Tools remain the default execution surface.
- M100 remains the absolute boundary before any mutating, destructive, or raw JSX execution reaches AE.
- RAG/retrieval is advisory context only, never execution authority.
- External scripts enter only through local quarantine, static review, manifest metadata, and explicit promotion.
- Reviewed recipes are planning patterns, not runnable shortcuts.
- Raw JSX remains a rare, gated escape hatch behind dry-run evidence, user confirmation, and server-owned action proposals.
- SDK Orchestrator remains local-gated and queue-bounded; production-code and CEP-panel write lanes require separate scope-expansion approval.
- Prompt/context economy is a hard architecture constraint, not an optimization pass.

vNext 1.1 explicitly rejects:

- automatic download-and-run of public AE scripts;
- loading full repositories, full script libraries, or full MatchName dictionaries into normal planning prompts;
- model self-approval of generated or imported mutations;
- automatic promotion from one successful run into a trusted recipe or tool;
- broad multi-agent repo editing before the SDK lanes prove equivalent fail-closed behavior;
- transpilation promises that are not proven against real ExtendScript behavior.

## 2. Current Implemented Baseline

AE Agent already has a substantial working foundation.

Implemented:

- AE Agent 2.0.0 CEP panel connected to local Bridge daemon.
- Bridge daemon owns AE command queue, tool registry, plan validation, dry-run/run flow, M100 action proposals, mutation gates, checkpoints, edit-session protection, and read-back verification.
- Agent planning produces structured MCP plans and validates tool names, required fields, mutating counts, and safety fields.
- Agent Hardcore owner mode exists and can continue through typed tools, with raw ExtendScript only as a gated fallback.
- Codex CLI provider path exists as `openai-cli` / `codex-cli`.
- Typed Tools already cover inspection, comps, layers, text, shapes, timing, precomp/source workflows, effects, property values, keyframes, expressions, render queue, test comps, cleanup, and raw ExtendScript escape hatches.
- MatchName support partially exists through `list_effect_presets`, `list_effects`, `get_effect_details`, `add_effect`, and `set_effect_property`.
- Many mutating Typed Tools already use `app.beginUndoGroup` / `app.endUndoGroup`.
- Raw ExtendScript is already high-risk: it requires validation gates, dry-run evidence, explicit permission, and server-owned proposal flow.
- Solution registry, solution candidate reports, promotion checks, retrieval smokes, and reviewed-solution flow already exist.
- SDK Orchestrator exists inside AE Agent and is local-gated: planned path allowlists, dry-run, execution logs, commit-aware post-run validation, and bounded conveyor runs are already present.
- Standalone `codex-sdk-orchestrator-tool` exists, but is currently closer to a read-only wrapper plus extracted core utilities than a production-ready write orchestrator.

## 3. Frozen / Deprioritized Areas

For the next architecture phase, freeze active development on:

- Gemini
- Claude
- OpenRouter
- Local/Ollama
- OpenAI API provider path
- OpenAI/ChatGPT connector path

These paths may remain in code and diagnostics, but new roadmap effort should focus on:

- Codex CLI
- SDK Orchestrator
- Typed Tools
- Verified script library
- ExtendScript safety gates

## 4. Desired Runtime Architecture

### 4.1 Control Plane

The CEP panel remains a thin local UI.

The Bridge daemon remains the trusted backend and owns:

- provider/model interaction when needed;
- tool catalog;
- plan proposal;
- dry-run;
- execution;
- checkpoints;
- edit-session protection;
- raw JSX gates;
- read-back verification;
- diagnostics and logs.

The panel should not become the safety authority. It displays state and sends user intent, but execution authority belongs to the Bridge.

### 4.2 Active Intelligence Layer

Codex CLI becomes the primary active intelligence path.

Codex CLI is used for:

- planning AE operations;
- repository development;
- long-running script intake;
- SDK-orchestrated milestones;
- architecture review;
- tool promotion;
- test generation;
- handoff generation.

Other providers are not removed, but are not developed further in this phase.

### 4.3 Execution Layer

Default execution path:

1. User asks for AE task.
2. Agent creates structured plan.
3. Bridge validates plan.
4. Bridge creates server-owned action proposal.
5. User confirms if needed.
6. Bridge runs dry-run or execution.
7. Bridge reads back AE state.
8. Result is recorded as structured evidence.

Raw ExtendScript remains an escape hatch, not a normal planning target.

### 4.4 vNext 1.1 Action Kinds

All future roadmap items should preserve three separate action kinds:

- Typed Tools: normal bridge-owned automation surface, with explicit schemas, risk classification, idempotency expectations, checkpoint/edit-session behavior, and read-back verification.
- Reviewed Recipes: human-reviewed planning patterns retrieved as advisory context; they must compile into normal Typed Tool plans or explicitly request a reviewed JSX escape hatch.
- Raw JSX Quarantine: generated or imported JSX that is stored, scanned, reviewed, and proposed through M100 before any possible execution.

No action kind may bypass the Bridge daemon's validation, M100 proposal, dry-run, confirmation, mutation gates, checkpoint/edit-session protection, or read-back evidence.

## 5. Three Required Guardrails

### 5.1 ExtendScript Compatibility Gate

The system needs an ES3 / ExtendScript compatibility gate before raw or generated JSX can reach AE.

Recommended approach:

- v1: static syntax and risk gate.
- v2: AST parser where practical.
- v3: optional transpilation lane, if it proves reliable.

Important caution: Babel with `preset-env` is not automatically "ExtendScript safe". Babel usually targets browser/runtime environments, while After Effects ExtendScript has old JavaScript semantics and Adobe-specific quirks.

The gate should detect or reject:

- `let`, `const`, arrow functions, classes, destructuring, spread/rest, template literals where unsupported;
- async/await and promises;
- modern array/object APIs not available in ExtendScript;
- dynamic `eval`, `Function`, `BridgeTalk`, `ExternalObject`, socket/network access;
- project save/close operations;
- broad project deletion loops;
- filesystem writes/removals unless explicitly reviewed.

### 5.2 Global Undo Wrapper

Bridge should provide an automatic raw JSX wrapper:

```javascript
app.beginUndoGroup("AI Agent Task");
try {
    // AI code
} catch (e) {
    throw e;
} finally {
    app.endUndoGroup();
}
```

Do not use `alert(e.toString())` in automation. Modal alerts can freeze unattended runs. Errors should return as structured JSON to the Bridge and panel.

Typed Tools should also be hardened so every `beginUndoGroup` has a guaranteed `finally` close.

### 5.3 MatchName Dictionary

The agent needs a stronger read-only MatchName dictionary.

Current state: a small curated effect preset list and live effect inspection tools already exist.

Desired state:

- curated built-in matchName dictionary;
- live discovery from installed AE;
- plugin/effect availability detection;
- property matchName hints;
- compatibility notes per AE version;
- evidence links to tested scripts/tools;
- strict preference for matchName over localized display names.

This should reduce raw JSX usage and improve reliability when adding or configuring effects.

## 6. Verified External Script Library

The project should ingest existing public After Effects ExtendScript repositories, but never bulk-import them directly.

Candidate sources may include:

- `kyletmartinez/after-effects-scripts`
- `aturtur/after-effects-scripts`
- `Yan-K/Yan-K-ToolKit`
- `Eliepse/AEScript-Explode-Shape-Layer`
- `ScarecrowArts/Label-Me`

Each external source goes through a staged pipeline:

1. Repository inventory.
2. License detection.
3. File classification.
4. Static risk scan.
5. Capability extraction.
6. Duplicate/similarity clustering.
7. Candidate scoring.
8. Sandbox AE test only for admitted candidates.
9. Promotion to one of:
   - Typed Tool
   - reviewed recipe
   - reviewed JSX file
   - rejected/archived candidate

License handling is mandatory. If a repository has no usable license, do not copy code into the product. It may still inspire a newly written tool if the implementation is independent.

### 6.1 vNext 1.1 External Script Manifest

Every external script candidate needs a compact manifest before any model or worker may use it as planning context.

Required manifest fields:

- `id`: stable local candidate id.
- `sourceRepo`: public source repository URL.
- `sourceCommit`: exact commit or release tag inspected.
- `sourcePath`: path inside the source repository.
- `sha256`: content hash for the reviewed file.
- `license`: detected license and whether product use is allowed.
- `licenseDisposition`: `allowed`, `inspiration-only`, `blocked`, or `unknown`.
- `sizeBytes`: source size, with hard caps for reviewed JSX promotion.
- `capabilityTags`: compact capability labels.
- `requiresPlugins`: known third-party AE plugin dependencies.
- `aeVersionTested`: AE versions used for sandbox validation.
- `es3Status`: `passes-static`, `fails-static`, `needs-review`, or `not-reviewed`.
- `undoStatus`: `has-wrapper`, `needs-wrapper`, `unsafe`, or `not-mutating`.
- `riskFlags`: filesystem, network, BridgeTalk, ExternalObject, eval, project save/close, broad delete, render/output, modal UI, or unknown APIs.
- `promotionTarget`: `typed-tool`, `reviewed-recipe`, `reviewed-jsx`, `rejected`, or `quarantine`.
- `reviewDecision`: human/reviewer decision with timestamp and evidence references.

Normal planning retrieval may use only compact manifests and reviewed recipes. It must not include raw candidate source. Deep source inspection belongs only to explicit intake/review tasks.

## 7. Self-Learning System Boundaries

The system may learn from:

- successful tool runs;
- failed tool runs;
- raw JSX workarounds;
- external script scans;
- live AE read-back evidence;
- matchName discoveries;
- promotion decisions;
- rejected candidates.

But "self-learning" must not mean automatic production promotion.

Safe self-learning means:

- store compact evidence;
- update candidate scores;
- improve retrieval;
- propose tool gaps;
- generate review packets.

Unsafe self-learning means:

- silently adding raw scripts;
- trusting unlicensed GitHub code;
- letting a model approve its own generated mutation;
- expanding prompts with hundreds of scripts;
- bypassing dry-run or read-back verification.

## 8. Token and Context Strategy

The verified library must be designed for token efficiency.

Do not load full script repositories into model context by default.

Store local manifests:

- repo URL;
- commit hash;
- license;
- script path;
- SHA-256;
- size;
- detected APIs;
- risk flags;
- capability tags;
- short summary;
- test status;
- promotion status.

At planning time, retrieve only:

- relevant Typed Tools;
- relevant recipes;
- 1-3 candidate summaries;
- exact script source only when performing deep review.

Target retrieval size:

- normal AE task: 15-40 relevant tools/recipes;
- script review task: one repo summary plus selected candidate files;
- promotion task: one candidate plus tests/evidence.

This is the golden middle: enough memory to improve over time, not enough noise to drown the planner.

### 8.1 vNext 1.1 RAG Contract

RAG is required for vNext 1.1, but it must be safety-aware retrieval rather than a generic vector dump.

The retrieval system should be split into five corpora:

- Typed Tool Catalog: tool names, parameters, risk levels, mutating/read-only status, idempotency expectations, and verification hints.
- Reviewed Recipes: promoted entries from the solution registry and `recipes/`, always advisory and never directly executable.
- MatchName / AE Capability Index: effect matchNames, property hints, availability, plugin requirements, AE-version notes, and tested evidence.
- External Script Candidate Manifest: quarantine metadata, summaries, license status, hashes, risk flags, ES3/undo status, and promotion state.
- Run Evidence / Error Memory: compact records of successful runs, failed runs, stale recipes, missing tools, unavailable effects, and recovery notes.

Normal planning retrieval must apply hard filters before scoring:

- include only reviewed statuses unless the task is explicitly an intake/review task;
- prefer Typed Tools over reviewed JSX whenever both match the intent;
- omit blocked, unknown-license, incompatible, or plugin-missing candidates;
- cap returned context by entry count and character budget;
- return summaries and evidence references, not raw script bodies.

Minimum vNext 1.1 retrieval interfaces:

- `retrieve_planning_context(intent, constraints)`: returns compact tool, recipe, MatchName, and evidence hints for ordinary planning.
- `search_ae_recipes(intent, riskMax, mutatingAllowed)`: returns reviewed recipe summaries only.
- `search_matchname(query, aeVersion, installedOnly)`: read-only lookup for effect/property matchName and availability hints.
- `search_script_candidates(intent, filters)`: intake/review-only lookup over quarantine manifests.
- `inspect_script_candidate(id)`: explicit review-only source access with license/risk metadata and no execution path.

Retrieval output is never an authority to execute. Every actionable result must still become a normal structured MCP plan and pass validation, M100 proposal creation, dry-run, confirmation when required, mutation permission, checkpoint/edit-session gates, execution, and read-back verification.

For vNext 1.1, dependency-light hybrid retrieval is preferred: normalized keywords, tags, status/risk/license filters, simple scoring, and smoke-tested token budgets. A vector database can be considered later only after the manifest and safety filters are already enforceable without it.

## 9. SDK Orchestrator Role

SDK Orchestrator should become the long-running automation layer.

It should handle tasks that are too large for the main chat:

- GitHub script repository intake;
- license inventory;
- static analysis;
- candidate ranking;
- sandbox test generation;
- typed-tool implementation;
- validation runs;
- plan/handoff updates;
- review packet creation.

The current AE Agent SDK Orchestrator is local-gated and should be extended incrementally.

Near-term priorities:

1. Queue-specific approval text and queue-specific dry-runs.
2. Docs/plans lane.
3. Script intake inventory lane.
4. Static analysis lane.
5. Sandbox AE test lane.
6. Promotion lane.
7. Production-code write lane expansion with explicit approval.
8. CEP-panel write lane only after separate review.

## 10. Multi-Agent Shape

A full multi-agent system is not required for v1.

A practical v1 can use SDK Orchestrator with role-specific queue items:

- Inventory Worker
- License Reviewer
- Static Safety Reviewer
- Capability Classifier
- Sandbox Tester
- Tool Distiller
- Promotion Approver

These can initially be sequential Codex CLI / SDK runs with separate artifacts.

True parallel multi-agent orchestration becomes useful later if:

- repository intake volume grows;
- candidates exceed human-review capacity;
- sandbox testing becomes routine;
- promotion bottlenecks become visible.

Until then, bounded SDK conveyor runs are likely sufficient and safer.

## 11. Promotion Criteria

A candidate can become a Typed Tool only if:

- it solves a repeated real workflow;
- it has a narrow, explicit interface;
- it can be tested without relying on a specific user project;
- it supports checkpoint/edit-session safety;
- it has read-back verification;
- it avoids raw JSX at runtime.

A candidate can remain a reviewed recipe if:

- it is useful but not common enough for a tool;
- it composes existing tools;
- it needs human choice;
- it documents a workflow pattern.

A candidate can remain reviewed JSX only if:

- no Typed Tool fits;
- license permits usage;
- static checks pass;
- ES3 compatibility is proven;
- undo wrapper exists;
- generated-prefix/read-back evidence exists;
- the script is small and bounded.

## 12. vNext 1.1 Acceptance Gates

The next implementation phase should not start by adding more providers or autonomous agents. It should first make these contracts testable.

Required gates:

- M100 invariant smoke: mutating, destructive, and raw JSX paths cannot execute without a server-owned proposal and valid confirmation flow.
- Candidate quarantine smoke: normal planning cannot retrieve raw candidate source or unreviewed candidates.
- Token-budget smoke: normal planning retrieval stays under fixed entry and character limits.
- ES3 static gate smoke: modern syntax and dangerous APIs are rejected before AE execution.
- Undo/finally audit: every mutating Typed Tool and every reviewed JSX path has guaranteed `app.endUndoGroup()` cleanup.
- MatchName retrieval smoke: localized/display-name intent can resolve to stable matchName hints without dumping the full dictionary into prompt context.
- License/plugin filter smoke: blocked/unknown licenses and missing plugin dependencies are excluded from normal planning retrieval.
- Wrapped JSX error mapping: if reviewed JSX is wrapped for undo/error handling, runtime errors map back to the candidate source line or clearly report wrapper offset.
- SDK lane gate: docs, manifest, inventory, and static-analysis lanes can run locally; production-code, CEP-panel, package/dependency, live mutating AE, push, and PR lanes remain approval-gated.

## 13. Key Risks

- Prompt bloat from too many tools or scripts.
- License contamination from unlicensed GitHub code.
- False confidence from static checks without AE runtime tests.
- Babel/transpilation producing code that still fails in ExtendScript.
- Raw JSX becoming the default because it is easier than building Typed Tools.
- SDK Orchestrator expanding write access too quickly.
- Context pollution from long-running automation logs.
- Self-learning loop approving its own bad outputs.

## 14. Recommended Roadmap

### Phase 0: vNext 1.1 Contract Lock

- Treat this document as the current architecture baseline.
- Preserve M100 as the execution boundary.
- Define the retrieval, manifest, ES3, undo, MatchName, and SDK lane acceptance gates before new implementation milestones.
- Keep the work in brainstorm/planning mode until an explicit milestone starts.

### Phase 1: Codex CLI Focus

- Freeze non-Codex provider development.
- Make Codex CLI the primary active planning/development path.
- Keep other providers visible only if needed for compatibility.

### Phase 2: Safety Guardrails

- Add raw JSX global undo wrapper.
- Harden Typed Tool undo groups with `finally`.
- Add ExtendScript compatibility/static gate.
- Expand MatchName dictionary.

### Phase 3: Script Intake Pipeline

- Add external repo inventory format.
- Add license scanner.
- Add static risk scanner.
- Add candidate manifest and scorecard.
- Run no AE mutation yet.

### Phase 4: Sandbox Testing

- Create generated test comps/projects.
- Run only admitted candidates.
- Require read-back verification.
- Store compact evidence.

### Phase 5: Promotion System

- Promote repeated capabilities into Typed Tools.
- Promote safe workflows into recipes.
- Keep reviewed JSX rare.
- Add smoke tests for every promoted capability.

### Phase 6: SDK Orchestrator Production Readiness

- Expand SDK lanes one by one.
- Keep planned path allowlists strict.
- Keep logs out of chat context.
- Require handoff after each milestone.
- Add standalone orchestrator adapter only after AE Agent local behavior is proven.

## 15. Review Questions

Ask reviewers to focus on:

1. Is the Typed Tool / recipe / reviewed JSX split correct?
2. Is ES3 static gate enough for v1, or is transpilation required immediately?
3. What is the minimum useful MatchName dictionary?
4. How should sandbox AE tests be isolated from user projects?
5. How large can the verified library become before retrieval is mandatory?
6. Does SDK Orchestrator need true multi-agent execution, or are role-based queue items enough?
7. Which provider/UI surfaces should be hidden while frozen?
8. What promotion criteria are too strict or too weak?
9. What safety gate is missing before allowing external scripts into the system?
10. How should licensing be represented in the verified library?
