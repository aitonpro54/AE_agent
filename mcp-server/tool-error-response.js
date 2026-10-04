"use strict";

// Presentation only: never reads records, executes tools, or grants authority.
const { redactForUserDiagnostic } = require("./m100-protocol");
const SCHEMA = "ae-agent-tool-guidance.v1";
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const TAG = /^[a-zA-Z0-9_.:-]{1,160}$/;
const HASH = /^[a-f0-9]{64}$/i;
const MAX_PAYLOAD_CHARS = 2 * 1024 * 1024;
const READ_TOOLS = new Set(["reconcile_plan_run", "get_plan_run_evidence", "get_current_ai_agent_plan", "wait_for_plan_state", "wait_for_bridge_state"]);
const object = value => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const tag = value => typeof value === "string" && TAG.test(value) ? value : undefined;
const uuid = value => typeof value === "string" && UUID.test(value) ? value : undefined;
const hash = value => typeof value === "string" && HASH.test(value) ? value : undefined;
const revision = value => Number.isSafeInteger(value) && value > 0 ? value : undefined;
const diagnosticOf = value => object(value.diagnostic || object(value.m100).diagnostic);

function safeMessage(value) {
  if (typeof value !== "string") return "Tool request failed.";
  return redactForUserDiagnostic(value
    .replace(/\b(AE_BRIDGE_PANEL_TOKEN|AE_BRIDGE_TOKEN)\b["']?\s*[:=]\s*["']?[^"',\s)}]+/gi, "$1=<redacted>")
    .replace(/\b(confirmationToken|sessionToken|accessToken|apiKey|password|secret|token)\b["']?\s*[:=]\s*["']?[^\s,"'}]+/gi, "$1=<redacted>"), 400);
}

function sanitizeDiagnostic(value) {
  const source = object(value), result = {};
  for (const key of ["code", "phase", "requestId", "actionId", "executionId", "commandId", "lifecycleState"]) {
    const safe = tag(source[key]);
    if (safe !== undefined) result[key] = safe;
  }
  if (typeof source.message === "string") result.message = safeMessage(source.message);
  return result;
}

// The adapter intentionally retains only these proof fields from HTTP failures.
// executionId remains an executionId; it is never converted into a run UUID.
function sanitizeHttpFailure(body, status) {
  const source = object(body);
  const result = { ok: false, code: tag(source.code) || "bridge_http_rejected",
    phase: tag(source.phase) || "protocol_validation",
    error: safeMessage(typeof source.error === "string" ? source.error : `Bridge daemon tool call failed with HTTP ${status}`) };
  for (const key of ["requestId", "actionId", "executionId", "commandId", "lifecycleState"]) {
    const safe = tag(source[key]);
    if (safe !== undefined) result[key] = safe;
  }
  const diagnostic = sanitizeDiagnostic(source.diagnostic);
  if (Object.keys(diagnostic).length) result.diagnostic = diagnostic;
  return result;
}

function firstPayload(result) {
  const text = result && result.content && result.content[0] && result.content[0].text;
  if (typeof text !== "string" || text.length > MAX_PAYLOAD_CHARS) return {};
  try {
    const parsed = JSON.parse(text);
    return typeof parsed === "string" ? { error: parsed } : object(parsed);
  } catch { return { error: text }; }
}

function responseIdentity(payload, toolName) {
  const p = object(payload), provenance = object(p.provenance), diagnostic = diagnosticOf(p);
  const identity = {};
  let ambiguous = false;
  function take(key, values, validate = tag) {
    // M100 uses an empty requestId when no request was bound; it is absence,
    // not a contradictory ID. A nonempty malformed identity remains a blocker.
    const present = values.filter(value => value !== null && value !== undefined && value !== "");
    const safe = present.map(validate);
    if (safe.some(value => value === undefined) || new Set(safe).size > 1) { ambiguous = true; return; }
    if (safe.length) identity[key] = safe[0];
  }
  take("requestId", [p.requestId, diagnostic.requestId, object(p.m100Message).requestId]);
  take("actionId", [p.actionId, diagnostic.actionId, provenance.actionId, object(p.m100Action).actionId]);
  take("commandId", [p.commandId, diagnostic.commandId]);
  take("proposalRevision", [p.proposalRevision, provenance.proposalRevision], revision);
  take("payloadHash", [p.payloadHash], hash);
  take("planSha256", [p.planSha256, provenance.planSha256], hash);
  // Only documented response locations, never client arguments or current.lastRun.
  if (toolName === "run_ai_agent_plan") take("runId", [p.id], uuid);
  if (toolName === "reconcile_plan_run" || toolName === "get_plan_run_evidence") take("runId", [p.runId], uuid);
  if (toolName === "wait_for_plan_state") {
    // Mismatch/nonready replies echo requested pins; those are not verified pins.
    if (!["running", "pending", "dry_run_passed", "completed", "failed", "cancelled"].includes(p.state)) {
      delete identity.actionId;
    } else {
      take("instanceId", [p.instanceId]);
      take("proposalRevision", [p.revision], revision);
    }
  }
  return { identity, ambiguous };
}

const ROOT_SCHEMA_KEYS = new Set(["type", "properties", "required", "additionalProperties", "description", "title"]);
const ARGUMENT_SCHEMA_KEYS = new Set(["type", "enum", "minimum", "maximum", "minLength", "maxLength", "pattern", "description", "title"]);

function validArguments(schema, args) {
  if (!schema || typeof schema !== "object" || Array.isArray(schema) ||
    !Object.keys(schema).every(key => ROOT_SCHEMA_KEYS.has(key))) return false;
  const properties = object(schema.properties);
  if (schema.type !== "object" || !schema.properties || typeof schema.properties !== "object" || Array.isArray(schema.properties)) return false;
  if (schema.additionalProperties !== undefined && typeof schema.additionalProperties !== "boolean") return false;
  if (!Array.isArray(schema.required) && schema.required !== undefined) return false;
  if ((schema.required || []).some(key => typeof key !== "string" || !Object.prototype.hasOwnProperty.call(properties, key))) return false;
  if ((schema.required || []).some(key => !Object.prototype.hasOwnProperty.call(args, key))) return false;
  for (const [key, value] of Object.entries(args)) {
    if (!Object.prototype.hasOwnProperty.call(properties, key)) return false;
    const rawRule = properties[key];
    if (!rawRule || typeof rawRule !== "object" || Array.isArray(rawRule) ||
      !Object.keys(rawRule).every(ruleKey => ARGUMENT_SCHEMA_KEYS.has(ruleKey))) return false;
    const rule = rawRule;
    if (rule.type === "string" && typeof value !== "string" || rule.type === "integer" && !Number.isSafeInteger(value) || rule.type === "number" && (typeof value !== "number" || !Number.isFinite(value))) return false;
    if (!rule.type || !["string", "integer", "number"].includes(rule.type)) return false;
    if (Array.isArray(rule.enum) && !rule.enum.includes(value)) return false;
    if (rule.enum !== undefined && !Array.isArray(rule.enum)) return false;
    if (rule.minimum !== undefined && (!Number.isFinite(rule.minimum) || !["integer", "number"].includes(rule.type) || value < rule.minimum)) return false;
    if (rule.maximum !== undefined && (!Number.isFinite(rule.maximum) || !["integer", "number"].includes(rule.type) || value > rule.maximum)) return false;
    if (rule.type === "string") {
      const length = Array.from(value).length;
      if (rule.minLength !== undefined && (!Number.isSafeInteger(rule.minLength) || rule.minLength < 0 || length < rule.minLength)) return false;
      if (rule.maxLength !== undefined && (!Number.isSafeInteger(rule.maxLength) || rule.maxLength < 0 || length > rule.maxLength)) return false;
      if (rule.pattern !== undefined) {
        if (typeof rule.pattern !== "string" || rule.pattern.length > 256) return false;
        try { if (!new RegExp(rule.pattern).test(value)) return false; }
        catch { return false; }
      }
    } else if (rule.minLength !== undefined || rule.maxLength !== undefined || rule.pattern !== undefined) {
      return false;
    }
  }
  return true;
}

function isGuidanceBlock(block) {
  if (!block || block.type !== "text" || typeof block.text !== "string") return false;
  try {
    const parsed = JSON.parse(block.text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) && parsed.schema === SCHEMA &&
      parsed.identity && typeof parsed.identity === "object" && parsed.nextAction && typeof parsed.nextAction.kind === "string" &&
      typeof parsed.automaticReplayAllowed === "boolean";
  } catch { return false; }
}

function buildGuidance(payload, context = {}) {
  const p = object(payload), toolName = context.toolName;
  const { identity, ambiguous } = responseIdentity(p, toolName);
  const diagnostic = diagnosticOf(p);
  const code = tag(p.errorCode) || tag(p.code) || tag(diagnostic.code) || tag(p.reasonCode) || tag(p.reason) || "tool_failed";
  const observation = context.observation === true;
  const guidance = { schema: SCHEMA,
    error: observation ? null : { code, message: safeMessage(p.error || p.message || diagnostic.message), phase: tag(p.phase) || tag(diagnostic.phase) || "tool_boundary" },
    identity, nextAction: { kind: "stop", reasonCode: "no_verified_next_action" }, automaticReplayAllowed: false };
  const stop = reasonCode => { guidance.nextAction = { kind: "stop", reasonCode }; return guidance; };
  function suggest(tool, args, reasonCode) {
    const available = Array.isArray(context.exposedTools) ? context.exposedTools.filter(entry => entry && entry.name === tool) : [];
    if (!READ_TOOLS.has(tool) || available.length !== 1 || !validArguments(object(available[0].inputSchema), args)) return stop("next_tool_unavailable_or_contract_changed");
    guidance.nextAction = { kind: "tool", tool, arguments: args, reasonCode };
    return guidance;
  }
  if (context.transportUnavailable === true || context.daemonAvailable !== true) return stop("daemon_transport_unavailable");
  if (context.payloadUnavailable === true) return stop("response_payload_unavailable");
  if (ambiguous) return stop("identity_ambiguous");
  // Run summary intentionally omits the verbose diagnostic. Decisions for runs
  // use shared code/safety fields rather than a full-only diagnostic phase.
  const blockerPhase = toolName === "run_ai_agent_plan" ? "" : tag(p.phase) || tag(diagnostic.phase) || "";
  const blockers = `${code} ${blockerPhase} ${tag(object(p.safety).status) || ""} ${tag(p.reasonCode) || ""} ${tag(p.recordWarning) || ""} ${tag(p.stateToken) || ""} ${safeMessage(p.error || p.message || diagnostic.message)}`;
  if (/auth|confirmation|manual|token|permission|forbidden|autonomy|session|lease|direct_mutation|proposal_required|unknown_tool_blocked|blocked_m100/i.test(blockers)) return stop("manual_or_authorization_required");
  if (/record|corrupt|integrity|binding_mismatch|run_id_invalid|run_uuid|evidence_.*(?:unavailable|missing|invalid|mismatch)|path_containment/i.test(blockers) || p.state === "absent") {
    delete identity.runId;
    return stop("record_or_identity_unavailable");
  }
  // An incomplete reconciliation must not initiate an endless native read loop.
  if (toolName === "reconcile_plan_run") {
    if (identity.runId) return suggest("get_plan_run_evidence", { runId: identity.runId, limitChars: 6000 }, "inspect_historical_run_evidence");
    return stop("record_or_identity_unavailable");
  }
  if (context.panelConnected === false) return suggest("wait_for_bridge_state", { targetState: "connected_and_idle", waitMs: 1000 }, "panel_disconnected");
  if (toolName === "wait_for_bridge_state") return suggest("wait_for_bridge_state", { targetState: "connected_and_idle", waitMs: 1000 }, "observe_bridge_condition");
  if (identity.runId && context.panelConnected === true) return suggest("reconcile_plan_run", { runId: identity.runId }, "reconcile_exact_run");
  if (toolName === "wait_for_plan_state") {
    if (p.state === "running" && identity.actionId && identity.instanceId && identity.proposalRevision) {
      return suggest("wait_for_plan_state", { actionId: identity.actionId, instanceId: identity.instanceId, revision: identity.proposalRevision, waitMs: 1000 }, "observe_pinned_running_proposal");
    }
    return suggest("get_current_ai_agent_plan", {}, "inspect_current_proposal_pins");
  }
  // Current inspection is only about proposal errors without a historical run.
  if (!identity.runId && /proposal|action_(?:expired|superseded|not_found)|revision_mismatch|instance_id_mismatch/i.test(`${code} ${tag(p.reason) || ""}`)) {
    return suggest("get_current_ai_agent_plan", {}, "inspect_current_proposal_pins");
  }
  return guidance;
}

function decorateToolResult(result, context = {}) {
  if (!result || !Array.isArray(result.content)) return result;
  const payload = firstPayload(result);
  const waitBlocked = ["wait_for_plan_state", "wait_for_bridge_state"].includes(context.toolName) && payload.ok === true && payload.timedOut === true;
  const reconcileBlocked = context.toolName === "reconcile_plan_run" && ["incomplete", "unknown"].includes(payload.status);
  if (!result.isError && payload.ok !== false && !waitBlocked && !reconcileBlocked) return result;
  if (result.content.slice(1).some(isGuidanceBlock)) return result;
  const firstText = result.content[0] && result.content[0].text;
  const guidance = buildGuidance(payload, { ...context, observation: waitBlocked || reconcileBlocked,
    payloadUnavailable: typeof firstText !== "string" || firstText.length > MAX_PAYLOAD_CHARS });
  return { ...result, content: [...result.content, { type: "text", text: JSON.stringify(guidance) }] };
}

module.exports = { SCHEMA, buildGuidance, decorateToolResult, sanitizeHttpFailure };
