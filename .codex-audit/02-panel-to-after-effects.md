# 02 Panel to After Effects Audit

## Scope

Проверялся только runtime-flow:

`CEP panel UI -> local bridge daemon queue -> CEP polling -> CSInterface.evalScript -> After Effects -> result/error -> bridge daemon -> CEP panel UI`.

Codex CLI internals не проверялись. Agent output учитывался только там, где он приводит к `/agents/plan/run`, `callToolLogged()`, `runExtendScriptBody()` и дальнейшему `evalScript`.

## Files inspected

- path: `.codex-audit/00-index.md`
  - sections: candidate runtime areas and initial hypotheses
  - why inspected: взять карту проекта и не расширять фазу за пределы CEP/AE bridge.

- path: `.codex-audit/01-panel-to-codex.md`
  - sections: actual flow, findings
  - why inspected: отделить Codex request flow от AE host execution flow.

- path: `cep-panel/panel.js`
  - relevant functions/classes: `new CSInterface()`, `request()`, `postResult()`, `executeCommand()`, `poll()`, `connect()`, `disconnect()`, `runLastPlan()`, `formatPlanRun()`
  - line ranges or approximate sections: `18`, `214-270`, `2748-2824`, `2968-3020`, `3118-3208`
  - why inspected: найти единственный host-call path, request/result posting, UI busy state and error display.

- path: `mcp-server/bridge-daemon.js`
  - relevant functions/classes: `COMMAND_TIMEOUT_MS`, `aeLiteral()`, `resolveScriptFile()`, `enqueueAeCommand()`, `wrapExtendScriptBody()`, `runExtendScriptBody()`, `/bridge/next`, `/bridge/result`, `runValidatedAgentPlan()`, `callToolLogged()`, `run_extendscript`, `run_extendscript_file`, mutation verification helpers
  - line ranges or approximate sections: `26-47`, `868-872`, `1126-1268`, `1420-1438`, `1558-1611`, `1760-1876`, `4308-4550`, `5260-5324`, `5850-5892`, `7968-8028`, `10720-10805`
  - why inspected: backend queue, timeout, wrapper serialization, raw JSX boundary, plan gates and error propagation.

## Actual flow

1. `cep-panel/panel.js` creates `var cs = new CSInterface();` once at panel startup.

2. User-facing actions do not call `evalScript` directly. The panel connects to the local bridge and starts `poll()`, which repeatedly calls `GET /bridge/next`.

3. When a backend tool or Agent plan step needs AE, `bridge-daemon.js` calls `runExtendScriptBody(body, timeoutMs)`.

4. `runExtendScriptBody()` wraps the body in `wrapExtendScriptBody()`, then calls `enqueueAeCommand(script, timeoutMs)`.

5. `enqueueAeCommand()` creates a UUID command id, stores `{resolve, reject, timeout, createdAt, script}` in `inflightCommands`, pushes `{id, script}` to `pendingCommands`, records `ae_command_queued`, and wakes any waiting panel poll.

6. CEP `poll()` receives `{ok:true, command:{id, script}}` from `/bridge/next`, calls `executeCommand(command)`, then schedules the next poll after `50ms`.

7. `executeCommand()` runs `cs.evalScript(command.script, callback)`.

8. CEP callback behavior:
   - if `result` is a string beginning with `EvalScript error.`, panel posts `/bridge/result` with `{id, ok:false, result:null, error:result}`;
   - otherwise panel posts `/bridge/result` with `{id, ok:true, result:result, error:null}`.

9. `/bridge/result` looks up the id in `inflightCommands`, clears the backend timeout, removes the command, retains the command result, and either resolves or rejects the original `enqueueAeCommand()` promise.

10. For normal wrapped scripts, `result` is expected to be a JSON string from `wrapExtendScriptBody()`:
    - `{"ok":true,"result":...}`
    - `{"ok":false,"error":"...","line":...}`

11. `runExtendScriptBody()` parses that JSON. If `ok:false`, it throws an Error with `error.line`. If JSON parsing fails, it currently returns `{ok:true,result:raw,raw:true}`.

12. `callToolLogged()` records tool start/finish/failure events, optionally creates checkpoints, attaches mutation metadata, and for mutating tools tries to attach verification by running another AE readback script.

13. `runValidatedAgentPlan()` adds higher-level gates for plan execution: dry-run, `confirm:true`, `allowMutations:true`, edit-session/checkpoint protection, and raw ExtendScript dry-run approval.

14. CEP UI sees AE errors mainly through plan-run formatting. `formatPlanRun()` shows `run.error`, step `reason`, step `error`, and some verification/mutation details. It does not appear to print `step.result.error`, `line`, or `lineContext` for `toolResult(..., true)` payloads.

## Data contract

Backend-to-panel command:

```json
{
  "ok": true,
  "command": {
    "id": "uuid",
    "script": "ExtendScript source string"
  }
}
```

Panel-to-backend result:

```json
{
  "id": "uuid",
  "ok": true,
  "result": "string returned by evalScript",
  "error": null
}
```

or:

```json
{
  "id": "uuid",
  "ok": false,
  "result": null,
  "error": "EvalScript error..."
}
```

Wrapped ExtendScript return string:

```json
{
  "ok": true,
  "result": "JSON-serializable value or null"
}
```

or:

```json
{
  "ok": false,
  "error": "ExtendScript exception string",
  "line": 123
}
```

Argument serialization:

- Typed tool arguments interpolated into generated JSX generally use `aeLiteral(value)`, which is `JSON.stringify(value)` plus escaping for U+2028 and U+2029. This should handle quotes, Unicode, newlines, JSON arrays/objects, and paths with spaces when used consistently.
- Raw `run_extendscript` inserts `String(args.script || "")` as function body into the wrapper. This is intentional raw code execution, not escaped data.
- `run_extendscript_file` resolves and reads a script file; by default it must resolve inside `PROJECT_ROOT`, with opt-out via `AE_ALLOW_SCRIPT_FILES_OUTSIDE_PROJECT=1`.

Result serialization:

- The wrapper uses a custom ExtendScript `__codexStringify()` rather than native `JSON.stringify`.
- Strings escape backslash, quote, CR, LF and tab.
- Unsupported/cyclic/host objects are not clearly supported; typed tools mostly avoid this by returning hand-built plain objects.

Timeout/retry:

- Backend command timeout defaults to `AE_COMMAND_TIMEOUT_MS || 30000`.
- There is no CEP-side evalScript timeout or cancellation.
- There is no retry for failed/timeout host calls.

Confirmation/undo:

- Plan-run path requires `confirm:true` for real execution and `allowMutations:true` for mutating steps.
- Raw ExtendScript plan steps require a dry-run approval gate before real run.
- Many typed mutating tools use `app.beginUndoGroup()` / `app.endUndoGroup()`.
- Mutating tool results include undo/checkpoint hints when metadata is attached.

## Findings

### Finding 1
- title: Timed-out pending commands can still execute in After Effects
- type: bug
- severity: critical
- confidence: high
- evidence: `enqueueAeCommand()` timeout deletes only `inflightCommands[id]` and rejects the promise. It does not remove the matching item from `pendingCommands`. `/bridge/next` later shifts pending commands without checking whether the id is still inflight. `/bridge/result` returns `404 Unknown command` when the late result arrives.
- impact: a command can time out from the backend caller's perspective but still run later in AE. For mutating commands this means the panel/agent may report failure while the project is changed anyway, and idempotency/verification may not record the final state.
- minimal fix: on timeout, remove the command id from `pendingCommands`; when serving `/bridge/next`, skip commands that are no longer in `inflightCommands`; include a cancelled/expired response contract.
- verification: set a very low `AE_COMMAND_TIMEOUT_MS`, enqueue a command while the panel is disconnected, reconnect after timeout, and confirm the expired command is not executed.

### Finding 2
- title: CEP can dispatch multiple evalScript calls without waiting for prior AE result
- type: architecture risk
- severity: high
- confidence: high
- evidence: after `executeCommand(response.command)`, `poll()` schedules the next poll after `50ms` immediately. `executeCommand()` does not mark a host call as in-flight or wait for the `evalScript` callback before allowing the next `/bridge/next`.
- impact: multiple AE scripts can be submitted concurrently or queued ambiguously in the host. Read/verify commands may race with mutating commands, and long operations can overlap from the bridge's point of view even if AE serializes them internally.
- minimal fix: add a CEP-side `hostCommandInFlight` gate and poll for the next command only after `/bridge/result` posting completes, or make backend issue one command per connected panel until completion.
- verification: enqueue two scripts where the first waits/does heavy work and the second reads state; verify the second is not submitted until the first has posted its result.

### Finding 3
- title: Malformed or empty evalScript result is treated as success
- type: bug
- severity: high
- confidence: high
- evidence: `runExtendScriptBody()` catches `JSON.parse(raw)` failure and returns `{ok:true,result:raw,raw:true}`. For wrapped bridge commands, non-JSON usually means the wrapper did not run correctly, returned an empty string, or the host returned an unexpected string.
- impact: AE host failures can become successful raw payloads. Agent plan runs may mark a step completed even though the expected structured contract was broken.
- minimal fix: make wrapped commands strict: if JSON parse fails, throw an error with the raw response preview. If a raw string mode is needed, make it explicit and separate from `runExtendScriptBody()`.
- verification: force `evalScript` to return an empty string or malformed wrapper output and confirm the backend reports a failed AE command, not a successful raw result.

### Finding 4
- title: Direct raw ExtendScript tool execution lacks the same confirmation boundary as plan-run
- type: security risk
- severity: high
- confidence: medium
- evidence: `runValidatedAgentPlan()` blocks raw ExtendScript unless `allowRawExtendscript` and matching dry-run approval are present. But `callTool()` handles `run_extendscript` with only `script` and optional `timeoutMs`, and `run_extendscript_file` with only `filePath` and optional `timeoutMs`. The tool schemas do not require `confirm`, `allowMutations`, or `allowRawExtendscript`.
- impact: the safer boundary exists for panel Agent plan execution, but not at the lowest tool layer. A direct MCP/tool caller with bridge token can execute agent-generated JSX without the same confirmation semantics.
- minimal fix: enforce `confirm:true`, `allowMutations:true`, and preferably a raw-JSX approval flag at `callTool()` for `run_extendscript` and `run_extendscript_file`, not only in plan-run.
- verification: call `/tools/call` or MCP `run_extendscript` without confirmation and confirm it is rejected before AE execution.

### Finding 5
- title: AE error details can be hidden from the panel run summary
- type: bad UX
- severity: medium
- confidence: high
- evidence: `run_extendscript_file` catches ExtendScript errors and returns `toolResult({ error, line, wrappedLine, lineContext }, true)`. `runValidatedAgentPlan()` stores that payload as `item.result` with `item.isError=true`, but `formatPlanRun()` prints `step.error` and selected success fields; it does not visibly print `step.result.error`, `line`, or `lineContext`.
- impact: the backend may have useful AE line/context details, but the panel can show only "failed/needs review" or generic step text. This makes real AE errors feel lost.
- minimal fix: update plan-run formatting to display `step.result.error`, `line`, `wrappedLine`, and compact `lineContext` for failed steps.
- verification: run a `run_extendscript_file` plan with a known thrown error and confirm the panel shows the file line and nearby source context.

### Finding 6
- title: Custom ExtendScript JSON serializer has incomplete JSON escaping
- type: architecture risk
- severity: medium
- confidence: medium
- evidence: `__codexEscapeString()` escapes backslash, double quote, CR, LF and tab. It does not visibly escape every JSON control character such as backspace/formfeed/NUL, and `__codexStringify()` has no cycle guard for returned host objects.
- impact: unusual AE strings or raw script returns can produce invalid JSON or recursive serialization failures. Typed tools usually return plain objects, so risk is lower there, but raw ExtendScript and expressions can produce odd strings.
- minimal fix: harden the serializer for all `[\u0000-\u001F]`, U+2028/U+2029, and cycles/depth limits; or use a proven ExtendScript JSON polyfill in the wrapper.
- verification: return strings containing NUL/backspace/formfeed and a cyclic object from test scripts; confirm the bridge returns a structured failure or valid escaped JSON.

### Finding 7
- title: evalScript failure detection depends on a narrow string prefix
- type: architecture risk
- severity: medium
- confidence: medium
- evidence: CEP treats host failure as failure only when `typeof result === "string" && result.indexOf("EvalScript error.") === 0`. Other host-level failures, localized messages, empty result, or unexpected strings go through `ok:true`.
- impact: host failures can be misclassified before backend parsing. Combined with the non-strict parse fallback, this can hide real evalScript failures.
- minimal fix: use strict wrapper JSON validation and treat any non-wrapper response as failed for bridge commands; include raw response preview in diagnostics.
- verification: simulate syntax errors and non-standard evalScript return values and verify they produce structured failed results.

## Critical unknowns

- Did not run live After Effects or the CEP panel.
- Did not verify actual CSInterface behavior for syntax errors, empty result, Unicode, or concurrent `evalScript` calls on the installed AE/CEP version.
- Did not inspect installed panel cache or whether the running CEP bundle matches repo `panel.js`.
- Did not inspect the full body of every typed AE tool; only bridge contract, selected safety hooks, and representative undo-group evidence were checked.
- Did not inspect smoke scripts for coverage of timed-out pending commands, malformed evalScript result, or concurrent host calls.

## Next phase recommendation

Next phase should audit only:

`CEP startup/reload/connectivity -> installed panel cache -> bridge health -> stale bundle/token/base URL behavior`.

Reason: both previous phases point to instability around lifecycle and stale state. Before deeper tool-by-tool AE behavior, verify the running panel is actually the expected bundle and that connect/reload/poll status cannot falsely look healthy.
