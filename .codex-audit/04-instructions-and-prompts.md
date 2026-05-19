# 04 Instructions and Prompts Audit

## Instruction inventory

| location | instruction summary | applies to | risk |
|---|---|---|---|
| `AGENTS.md` | Работать milestone-by-milestone, читать `specs/target-app.md`, `plans/target-app-execplan.md`, обновлять plan/handoff, делать commit после reviewable milestone. | Codex project work | Средний: правило полезное для разработки, но без явного исключения для audit-only фаз может провоцировать лишние plan updates/commits. |
| `AGENTS.md` | Избегать широких scans; использовать targeted `rg`, file-specific reads, сохранять большие outputs в файл и резюмировать. | Codex project work | Низкий: согласуется с текущим audit-подходом. |
| `AGENTS.md` | Перед завершением milestone запускать полный набор smoke/check scripts и live CEP checks when available. | Codex validation | Средний: для узких audit/doc фаз это слишком широкое правило, если не записать явные validation scopes. |
| `AGENTS.md` | Жёсткий context handoff rule: с 66% не начинать новое крупное чтение/валидацию, с 72% handoff mode, с 78% только handoff text. | Codex context management | Низкий: снижает риск auto-compaction, но требует краткого исключения для пользовательских stop-условий. |
| nested `AGENTS.md` | Nested `AGENTS.md` не найден. | Repository instructions | Низкий: нет конфликтов вложенных правил. |
| `README.md:7-12` | Архитектурная граница: daemon владеет портом/queue/logs/backups; MCP adapter exposes tools to Codex; CEP executes `evalScript`; ChatGPT connector read-only/gated. | Project architecture | Низкий: хорошее высокоуровневое разделение. |
| `README.md:14-39` | Current MVP tools, включая raw `run_extendscript` и `run_extendscript_file`. | Tool users / Codex MCP users | Высокий: raw tools описаны как обычные tools без safety warning в tool list. |
| `README.md:130-136` | OpenAI API и OpenAI CLI разделены; CLI вызывает `codex exec --ephemeral --json --sandbox read-only`; keys stored in `.codex\agent-secrets.json`. | Provider setup | Средний: `.codex/agent-secrets.json` существует, но audit не читал secret file; модель OpenRouter default может устаревать. |
| `README.md:166-180` | Default lifecycle: Codex starts adapter, adapter starts daemon, panel reconnects/polls. | Daemon/CEP lifecycle | Низкий: согласуется с `mcp-adapter.js`. |
| `README.md:252-265`, `chatgpt-connector/README.md:5-12` | ChatGPT connector is not a provider; exposes fixed read-only bridge allowlist plus gated JSX Lab, never raw bridge write tools. | ChatGPT connector | Низкий: правило хорошо ограничивает connector surface. |
| `README.md:365` | `external-provider` and `mutating-live` are explicit-approval paths. | Validation / live tests | Низкий: важная граница есть в README/plan, но AGENTS.md should reference scopes. |
| `README.md:445-447` | Agent mode drafts structured plan, validates, dry-runs, run is confirmed; Hardcore may fallback to raw JSX after dry-run gate; dev-request does not auto-create Codex App chat. | Panel agent UX | Средний: docs are dense and version-stacked; easy to miss current rule. |
| `specs/target-app.md:7` | Panel remains thin client; daemon owns provider access, plan validation, gates, logs, checkpoints, edit sessions. | UI / daemon boundary | Низкий: clear architecture intent. |
| `specs/target-app.md:48-54` | AE mutations must continue through validated AE Plan runner; mutating steps require confirmation, mutation permission, idempotency, verification; CLI must not run shell/workspace edits. | Safety model | Высокий: direct `/tools/call` and MCP raw tools are not described as exception/low-level admin surface. |
| `plans/target-app-execplan.md` | Decision log repeatedly says external provider/live mutating checks need explicit approval; classification is guidance while validation/gates are enforcement. | Project execution plan | Низкий: accurate but very large; reading full file each milestone is context-expensive. |
| `mcp-config.example.json` | Codex MCP config launches local Node runtime and `mcp-server/mcp-adapter.js` with default token. | Codex MCP setup | Средний: hard-coded absolute local paths make the example non-portable; token default should be marked local-dev only. |
| `.codex/agent-secrets.json` | Local provider secret store exists. | Provider secrets | Средний: not inspected by audit to avoid secret exposure; docs should explicitly say agents must not read/report it except via bridge APIs. |
| `mcp-server/ai-agents.js:58-62` | Default provider system prompt: answer in user language; do not claim AE changes unless separate AE automation tool executed. | Provider chat / plan calls | Низкий: good guardrail. |
| `mcp-server/ai-agents.js:1363-1376` | Codex CLI prompt says answer request only, do not edit files or run shell commands; bridge handles execution separately. | OpenAI CLI path | Низкий: consistent with target safety rule. |
| `mcp-server/bridge-daemon.js:49-60` | AE Plan system prompt requires JSON only, typed tools first, raw JSX only as escape hatch, mutating steps need `verifyAfter` and idempotency. | Agent plan generation | Средний: prompt is strict, but parser/repair accept less strict outputs. |
| `mcp-server/bridge-daemon.js:1907-1929` | Plan parser accepts full JSON or substring from first `{` to last `}`. | Plan normalization | Средний: conflicts with “JSON only” as an enforceable contract. |
| `mcp-server/bridge-daemon.js:4314-4455` | Plan runner enforces validation, `confirm:true`, `allowMutations:true`, raw dry-run gate, edit-session/checkpoint protection. | `/agents/plan/run` | Низкий for plan-run path; high if assumed global. |
| `mcp-server/bridge-daemon.js:5528-5635` | Tool descriptions for `plan_with_ai_agent`, `validate_ai_agent_plan`, `run_ai_agent_plan`. | MCP/Codex tool users | Средний: run tool describes gates, plan tool says non-executing. |
| `mcp-server/bridge-daemon.js:5848-5890` | Tool descriptions for `run_extendscript` and `run_extendscript_file`. | MCP/Codex tool users | Высокий: no `confirm`, no dry-run gate, no raw-JSX warning in the schema itself. |
| `mcp-server/mcp-adapter.js:153-205` | Adapter returns daemon tools and forwards `tools/call` to `/tools/call`; auto-starts daemon. | Codex MCP adapter | Высокий: no adapter-level confirmation/risk envelope; relies on daemon/tool-specific behavior. |
| `chatgpt-connector/server.js:20-28`, `192-266` | Connector descriptors advertise read-only bridge tools and gated JSX Lab with `readOnlyHint` annotations. | ChatGPT connector tools | Низкий: explicit and bounded. |
| `chatgpt-connector/jsx-lab.js:592-675` | JSX Lab real run requires checked candidate, `confirm`, `allowMutations`, `autoEditSession`, hash confirmation, generated prefix, read-back calls. | ChatGPT connector gated write path | Низкий: much clearer than raw MCP tool descriptions. |
| `mcp-server/solution-library.js:312-345` | Solution hints are advisory, compact top matches only; do not execute recipes directly or read candidate quarantine. | Planner prompt retrieval | Низкий: strong anti-bypass wording. |
| `mcp-server/project-intent-memory.js:355-384` | Project memory prompt section is advisory only, bounded, and cannot bypass read tools/gates. | Planner prompt retrieval | Низкий: strong anti-bypass wording. |
| `registry/project-intent-memory.json` | Local reviewed hints include generated prefixes, protected assets, naming conventions, Hardcore loop. | Planner hints | Средний: data is prompt-shaping behavior; currently modified in worktree and should be reviewed before relying on it. |
| `registry/solutions.json` | Reviewed solution registry provides advisory recipes and safety gates. | Planner hints | Средний: some tested version metadata says panel/bridge `1.0.0` while target/version text is `1.0.11`; may be historical but looks stale. |
| `cep-panel/panel.js:120-145` | Workflow presets inject safe Agent plan prompts, typed-tool preference, raw JSX avoidance. | Panel prompt UX | Низкий: helpful, bounded prompts. |
| `cep-panel/panel.js:2968-3005` | Run button sends `/agents/plan/run` with `confirm: !dryRun`, `allowMutations`, `autoEditSession`, raw gate id if available. | Panel plan execution | Средний: UI click is treated as confirmation; no separate confirmation wording/matrix in docs. |
| `cep-panel/panel.js:3057-3089` | Hardcore sends `allowMutations:true`, `autoEditSession:true`, `allowRawFallback:true`, `autoPromoteKnowledge:true`. | Agent Hardcore | Средний: backend gates exist, but docs need a clearer “autonomous but bounded” permission model. |
| `mcp-server/bridge-daemon.js:4006-4128` | Dev-request bundle prompt forbids broad scans, asks targeted files first, and says implement one narrow fix then run checks/commit. | Generated Codex App dev handoff | Средний: good for dev handoff, but would be wrong for audit-only handoffs unless labeled dev-only. |
| `mcp-server/bridge-daemon.js:4131-4138` | Generated `candidate.jsx` comment says do not run directly; convert to typed bridge tool when possible. | Raw JSX candidate comments | Низкий: good expected-behavior comment. |

## Conflicts

| rule A | rule B | conflict | impact | recommendation |
|---|---|---|---|---|
| `specs/target-app.md:48` says AE mutations must continue through validated AE Plan runner. | `README.md:38-39`, `mcp-server/bridge-daemon.js:5857-5890`, `mcp-adapter.js:200-205` expose direct `run_extendscript` / `run_extendscript_file` through MCP `/tools/call`. | Safety rule sounds global, but raw tools remain direct callable surfaces. | A Codex/MCP caller can interpret raw JSX tools as normal available tools rather than admin/escape-hatch tools. | Document raw tools as low-level admin escape hatches; add schema-level `confirm`/risk requirements or route raw calls through same action envelope. |
| `AE_PLAN_SYSTEM_PROMPT` says “Return JSON only. Do not use markdown.” | `extractJsonObject()` accepts JSON embedded inside surrounding text and repair loop may normalize malformed output. | Prompt contract is stricter than parser enforcement. | Model/prompt regressions can be silently accepted; action controls can appear from non-strict responses. | Decide strict JSON-only vs forgiving repair. If forgiving remains, docs should say parser tolerates repair but validation still gates execution. |
| `docs/plan-classification.md:36-40` says `needs clarification` and `unsupported` map to blocked state. | `cep-panel/panel.js:2091-2127` labels `needs clarification` as “Runnable with review” and tooltip says non-tool steps may be skipped/replanned. | UI contract and panel behavior diverge. | Users/agents may expect clarification plans to be blocked, while UI may allow run with review. | Update docs or UI; define exact runner behavior for clarifying/no-tool steps. |
| `AGENTS.md` says commit after each independently working milestone and update plan/handoff after each milestone. | Audit phases and user stop-conditions may allow writing only one `.codex-audit/*` file and no code/plan/commit. | General milestone rule conflicts with read-only audit constraints. | Agent may create commits or touch plan/handoff when the audit phase forbids it. | Add “audit-only / user-scoped write restriction overrides milestone commit/plan update” exception. |
| `AGENTS.md` requires full smoke list before marking milestone complete. | README/plan say external-provider and mutating-live remain explicit-approval paths. | “Configured checks” can be read as broader than safe local/offline checks. | Agent may try live/provider/mutating validation without explicit approval, or waste context/time. | Split validation into `audit-only`, `local/offline`, `read-only live`, `external-provider`, `mutating-live`; require explicit approval for the last two. |
| `AGENTS.md` says continue milestone by milestone when plan defines next step. | Hard context rule says stop and handoff under context pressure; user stop-condition says stop after file. | Autonomy rule can overrun stop/handoff rules if not ordered. | Agent can keep working after requested artifact is complete. | State precedence in AGENTS outline: user scoped stop-condition and hard handoff override milestone continuity. |
| `README.md` and `target-app.md` say ChatGPT connector never exposes raw bridge write tools. | Connector local `run_extendscript_candidate` can request gated AE mutation when `AE_CHATGPT_CONNECTOR_WRITE_ACTIONS=1`. | Not a direct contradiction, but “read-only connector” shorthand is incomplete. | Reviewers may miss the opt-in gated write path. | Use consistent name: “read-only bridge proxy plus disabled-by-default gated JSX Lab write path.” |
| `README.md:445` says real Agent execution is a separate confirmed action. | `cep-panel/panel.js:2975-2982` treats Run button click as `confirm:true` payload. | “Explicit confirmation” is not defined as UI click vs confirmation dialog vs backend envelope. | Risky actions may feel under-confirmed if Run button is enough. | Define confirmation levels by risk: read-only run button, mutating confirmation, raw/destructive confirmation, direct tool confirmation. |

## Missing rules

- A single caller/capability matrix: `CEP panel`, `Codex MCP adapter`, `provider agents`, `ChatGPT connector`, `dev-request Codex App handoff`, and what each may read, write, execute, or never do.
- A global risk taxonomy for actions: `read_only`, `mutating`, `destructive`, `unsafe`, including required confirmation and validation per risk.
- A unified action/result envelope with `messageType`, `requestId`, `actionId`, `executionId`, lifecycle status, preview, confirmation state, log/event ids, and error details.
- A rule that direct `/tools/call` and MCP `tools/call` must enforce the same mutating/raw/destructive confirmation policy as `/agents/plan/run`, or be explicitly documented as developer-only/admin-only.
- A JSX-specific policy in one place: typed tools first, raw JSX only when no typed tool fits, accepted dry-run gate, file-path boundary, undo group expectations, result serialization, error line/context display, and never run captured `candidate.jsx` directly.
- A result-returning policy: what panel must show after success/failure, which IDs/log file hints are user-visible, and how backend JSONL events map to UI messages.
- An error logging policy: required fields for provider, planner, plan-run, tool-call, AE queue, evalScript, and connector errors.
- A task completion policy for audit-only phases: allowed write paths, no source edits, no commits unless explicitly requested, and no full smoke suite.
- A context discipline appendix for large plan files: read the plan index/Progress/Decision Log slices first, not the whole file by default.
- A provider/live validation approval policy in AGENTS.md, not only README/plan.
- A secrets handling rule for `.codex/agent-secrets.json`: do not read or quote raw secrets in audits; access only through bridge status/redacted APIs.
- A freshness policy for date-sensitive provider/model recommendations such as OpenRouter defaults.

## Overbroad rules

- `AGENTS.md` “Before coding, read `specs/target-app.md`, `plans/target-app-execplan.md`, and this file” can force full reads of a very large plan on every milestone. Prefer “read target spec, AGENTS, handoff, and only relevant plan sections.”
- `AGENTS.md` “checks that are configured for this repository” plus the long smoke list can push agents into broad local/live validation even for documentation or audit-only work.
- “Do not ask the user for the next step when the plan already defines it; continue milestone by milestone” can encourage work beyond a user’s stop-condition.
- Generated dev-request start prompt says “implement one narrow typed tool or panel fix… run checks… make one reviewable commit.” That is right for dev handoff, but if reused during audit it would force code changes before audit is complete.
- Agent Hardcore wording “autonomous project owner” plus panel defaults `allowMutations:true`, `allowRawFallback:true`, and `autoPromoteKnowledge:true` can sound broader than the actual runner gates. It needs a compact “bounded autonomy” rule.
- README line `Current MVP tools` lists many write/raw tools without grouping them by risk. This makes direct raw tools look as ordinary as read-only inspection tools.
- The execution plan is both roadmap and long audit/validation history. Instructions that say “read the plan” without line/section targeting are context-expensive.

## Proposed AGENTS.md outline

- Project Goal
- Precedence And Stop Conditions
  - user write restrictions and stop-conditions
  - hard context handoff rule
  - audit-only exception
- Architecture Boundaries
  - CEP UI
  - local bridge daemon
  - MCP adapter / Codex
  - provider agents
  - ChatGPT connector
  - AE bridge / JSX executor
- Agent Permissions Matrix
  - allowed reads
  - allowed writes
  - allowed executions
  - forbidden actions
  - actions requiring explicit user approval
- Planning And Prompt Rules
  - typed tools first
  - advisory memory/solution hints
  - strict vs repairable JSON
  - bounded context retrieval
- Action Safety Protocol
  - risk taxonomy
  - confirmation policy
  - checkpoint/edit-session/idempotency/verification
  - direct MCP/raw JSX policy
- JSX Policy
  - raw escape hatch
  - file path limits
  - dry-run gate
  - undo group expectations
  - error reporting
- Logging And Result Contract
  - request/action/execution ids
  - user-visible summaries
  - backend JSONL evidence
  - error display
- Validation Scopes
  - audit-only
  - local/offline
  - read-only live
  - external-provider
  - mutating-live
- Context Discipline
  - targeted reads
  - plan section reads
  - no broad scans unless explicitly scoped
- Milestone Handoff And Commit Rules
  - normal development
  - audit/documentation phases
  - hard handoff mode

## Findings

### Finding 1

- title: Direct raw JSX tool descriptions bypass the project-level safety wording
- type: safety documentation gap
- severity: high
- confidence: high
- evidence: `specs/target-app.md:48-52` says mutations continue through validated AE Plan runner and raw tools are escape hatches. `mcp-server/bridge-daemon.js:5857-5890` exposes `run_extendscript` and `run_extendscript_file` with schemas requiring only `script` or `filePath`. `mcp-server/mcp-adapter.js:200-205` forwards MCP `tools/call` to daemon `/tools/call`.
- impact: A tool-using agent can see raw JSX tools as normal callable tools without the same explicit confirmation/risk language present in plan-run and ChatGPT connector docs.
- minimal fix: update tool descriptions and/or schema to require explicit raw JSX confirmation fields, or document direct raw tools as developer/admin-only and enforce the same confirmation envelope in `/tools/call`.
- verification: list MCP tools and confirm raw tools show risk/confirmation requirements; direct call without confirmation should fail before AE queueing.

### Finding 2

- title: Plan prompt says strict JSON, parser accepts embedded JSON
- type: prompt-contract mismatch
- severity: medium
- confidence: high
- evidence: `mcp-server/bridge-daemon.js:49-64` says “Return JSON only. Do not use markdown” and “Do not add markdown.” `mcp-server/bridge-daemon.js:1907-1919` extracts from the first `{` to the last `}` after full parse fails.
- impact: The actual acceptance contract is more permissive than the prompt. This can hide model-format regressions and makes action rendering depend on heuristic extraction.
- minimal fix: either make parsing strict JSON-only for action proposal creation, or explicitly document forgiving extraction/repair as a non-execution convenience that still cannot bypass validation.
- verification: feed responses with markdown fences, prose before/after JSON, multiple JSON objects, and malformed braces; verify accepted/rejected behavior matches docs.

### Finding 3

- title: Classification docs say clarification is blocked, panel says runnable with review
- type: docs-code mismatch
- severity: medium
- confidence: high
- evidence: `docs/plan-classification.md:36-40` maps `needs clarification` and `unsupported` to blocked state. `cep-panel/panel.js:2091-2127` returns “Runnable with review” for `needs clarification` and sets a tooltip saying non-tool steps will be skipped or require replanning.
- impact: Users and agents receive inconsistent guidance about whether ambiguous plans are executable. This can lead to skipped steps or accidental runs when a clarifying question should stop the flow.
- minimal fix: choose one policy. If clarification plans are runnable, update docs with exact runner semantics; if blocked, adjust panel control state.
- verification: create a plan with `clarifyingQuestion` or no-tool step and confirm UI label, button state, backend run result, and docs agree.

### Finding 4

- title: AGENTS.md validation rules are too broad for audit-only phases
- type: process risk
- severity: medium
- confidence: high
- evidence: `AGENTS.md` requires configured checks, many smoke scripts, `git diff --check`, and live CEP checks when available. README/plan separately mark external-provider and mutating-live as explicit-approval paths (`README.md:365`, plan decision log).
- impact: During an audit-only or instruction-only phase, an agent may waste context/time, attempt live provider calls, or mutate validation state despite a narrow write scope.
- minimal fix: add validation scopes to AGENTS.md and state that audit-only phases validate by targeted reads plus optional `git diff --check` only if allowed.
- verification: run a dry process review: for an audit-only prompt, the allowed validation list should not include provider, live CEP, mutating AE, or full smoke suite.

### Finding 5

- title: Milestone continuity can force code work before audit is complete
- type: process conflict
- severity: medium
- confidence: high
- evidence: `AGENTS.md` says continue milestone by milestone and commit after working milestones. Dev-request start prompts generated by `mcp-server/bridge-daemon.js:4110-4128` instruct the next Codex chat to implement a fix, run checks, update plan/handoff, and commit.
- impact: In audit phases, the agent can be pulled into implementation because project-level rules and generated handoffs default to development, not inspection.
- minimal fix: add an audit-mode exception: when the user scopes the phase to audit/read-only, do not implement, do not update plan, do not commit, and stop after the requested audit artifact.
- verification: start from an audit prompt and confirm the agent writes only the specified audit note and does not modify source, plan, handoff, or git metadata.

### Finding 6

- title: Confirmation is described but not defined by risk level
- type: missing safety rule
- severity: high
- confidence: high
- evidence: `README.md:445` says real Agent execution is a separate confirmed action and mutating runs require explicit mutation permission. `cep-panel/panel.js:2968-2987` sends `confirm:true` when the user clicks Run, while raw JSX gates need dry-run id. ChatGPT JSX Lab requires additional hash/prefix/read-back fields in `chatgpt-connector/jsx-lab.js:592-675`.
- impact: Different paths use different meanings of confirmation: button click, boolean payload, raw dry-run id, candidate hash, generated prefix. Without a matrix, future prompts/tools can weaken the boundary accidentally.
- minimal fix: define confirmation levels for read-only, mutating, destructive, raw JSX, connector candidate, and direct MCP/admin calls.
- verification: for each action kind, attempt execution without its required confirmation fields and confirm rejection before AE execution.

### Finding 7

- title: Agent Hardcore permission model is under-specified
- type: product/safety clarity gap
- severity: medium
- confidence: medium
- evidence: `specs/target-app.md:21-23` calls Hardcore autonomous project-owner mode inside bridge safety gates. `cep-panel/panel.js:3060-3074` sends `allowMutations:true`, `autoEditSession:true`, `allowRawFallback:true`, `autoPromoteKnowledge:true`. `mcp-server/bridge-daemon.js:4629` tells Hardcore to continue with raw fallback when no typed tool can finish, after dry-run gate.
- impact: The intended autonomy is bounded by runner gates, but the visible rules do not clearly say what Hardcore may not do, when it must stop, and when user confirmation is required.
- minimal fix: add a bounded-autonomy rule: Hardcore may plan/retry within max attempts, but cannot bypass action protocol, cannot direct shell/workspace edits, cannot raw-run without matching dry-run gate, and must surface stop reasons.
- verification: run/fake a Hardcore session with typed-tool failure and raw fallback; confirm it stops or gates exactly as documented.

### Finding 8

- title: Prompt-hint registries are instructions but lack a single review boundary
- type: governance risk
- severity: medium
- confidence: medium
- evidence: `registry/project-intent-memory.json` contains active prompt-shaping hints and is modified in the current worktree. `registry/solutions.json` contains advisory recipes and safety gates; some metadata still references panel/bridge `1.0.0` while docs target `AE Agent 1.0.11`. `mcp-server/project-intent-memory.js:355-384` and `mcp-server/solution-library.js:312-345` inject these hints into planning prompts.
- impact: These registries act like soft instructions. If stale or unreviewed entries drift, planner behavior can change without an obvious prompt/code review.
- minimal fix: document registry entries as prompt instructions requiring review, freshness metadata, and smoke validation before relying on them.
- verification: run registry validators and inspect prompt sections for current version/freshness warnings before provider planning.

### Finding 9

- title: Config example is machine-specific and can become stale
- type: setup documentation risk
- severity: low
- confidence: high
- evidence: `mcp-config.example.json:4-10` hardcodes `C:\Users\Ant\.cache\...node.exe`, repository path, port `3456`, and token `codex-ae-local`.
- impact: The example works for this machine but is not a portable template; future agents/users may copy stale absolute paths or assume the local token is a production secret.
- minimal fix: label it as local-machine example or add a portable template with placeholders and a note that the token is local-dev only.
- verification: review README setup instructions and confirm a new workspace can generate a config without copying this absolute path.

### Finding 10

- title: Date-sensitive provider/model defaults have no freshness rule
- type: stale documentation risk
- severity: low
- confidence: medium
- evidence: `README.md:134` says the default OpenRouter model was chosen from a May 2026 top free model list. The current audit did not verify external provider rankings.
- impact: Provider recommendations can go stale quickly; agents may treat an old model/ranking as current instruction.
- minimal fix: move volatile model recommendations to config with `updatedAt`, or require checking official/current provider metadata before changing defaults.
- verification: during provider-default updates, record source/date in Decision Log and run provider readiness/API smoke with explicit approval when external calls are required.
