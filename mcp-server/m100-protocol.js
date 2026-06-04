"use strict";

const crypto = require("crypto");

const M100_PROTOCOL_VERSION = "m100.v1";
const M100_RISK_POLICY_VERSION = "m100-risk-v1";
const M100_BACKEND_SOURCE = "ae-agent-bridge";
const M100_ACTION_PROPOSAL_TTL_MS = 15 * 60 * 1000;
const M100_RISK_LEVELS = ["read_only", "mutating", "destructive", "raw_jsx"];
const M100_ACTION_KINDS = ["ae_tool", "ae_jsx"];
const M100_CONFIRMATION_TOKEN_PREFIX = "confirm_";
const M100_DIAGNOSTIC_PHASES = [
  "bridge_offline",
  "provider_readiness",
  "model_timeout",
  "codex_exec",
  "protocol_validation",
  "confirmation_validation",
  "ae_queue",
  "ae_execution",
  "ae_result_parse"
];

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function compactText(value, maxLength) {
  const text = String(value === undefined || value === null ? "" : value).replace(/\s+/g, " ").trim();
  const limit = Math.max(1, Math.floor(Number(maxLength || 0)) || 1000);
  return text.length > limit ? `${text.slice(0, limit - 1)}...` : text;
}

function redactForUserDiagnostic(value, maxLength) {
  const limit = Math.max(1, Math.floor(Number(maxLength || 0)) || 1000);
  let text = String(value === undefined || value === null ? "" : value);
  text = text
    .replace(/\b(OPENAI_API_KEY|OPENAI_KEY|ANTHROPIC_API_KEY|CLAUDE_API_KEY|GEMINI_API_KEY|GOOGLE_API_KEY|OPENROUTER_API_KEY|OPENROUTER_KEY|AE_BRIDGE_TOKEN|CEP_PANEL_BRIDGE_TOKEN)\b\s*[:=]\s*["']?[^"',\s)]+/gi, "$1=<redacted>")
    .replace(/\bBearer\s+[A-Za-z0-9._-]{12,}/gi, "Bearer <redacted>")
    .replace(/\bsk-[A-Za-z0-9_-]{12,}/g, "<redacted-openai-key>")
    .replace(/\bAIza[0-9A-Za-z_-]{20,}/g, "<redacted-google-key>")
    .replace(/[A-Za-z]:\\(?:[^\\/:*?"<>|\r\n]+\\)*[^\\/:*?"<>|\r\n]*/g, "<path>")
    .replace(/(^|[\s"'`(])\/(?:Users|home|tmp|var|private|mnt)\/[^\s"'`<>)]+/g, "$1<path>")
    .replace(/\b(prompt|user request|message|input)\s*[:=]\s*["']?[^"'\r\n]{32,}/gi, "$1=<redacted prompt>");
  return compactText(text, limit);
}

function compactArray(value, maxItems, maxLength) {
  const items = Array.isArray(value) ? value : [];
  return items.slice(0, Math.max(0, maxItems || 8)).map((item) => compactText(item, maxLength || 240)).filter(Boolean);
}

function stableNormalize(value) {
  if (Array.isArray(value)) return value.map(stableNormalize);
  if (!isPlainObject(value)) return value;
  const output = {};
  const keys = Object.keys(value).sort();
  for (const key of keys) {
    const item = value[key];
    if (item === undefined || typeof item === "function") continue;
    output[key] = stableNormalize(item);
  }
  return output;
}

function stableStringify(value) {
  return JSON.stringify(stableNormalize(value));
}

function sha256Text(value) {
  return `sha256:${crypto.createHash("sha256").update(String(value || ""), "utf8").digest("hex")}`;
}

function sha256Payload(value) {
  return sha256Text(stableStringify(value));
}

function createM100Id(prefix) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

function createConfirmationToken() {
  return `${M100_CONFIRMATION_TOKEN_PREFIX}${crypto.randomBytes(24).toString("hex")}`;
}

function hashConfirmationToken(value) {
  return sha256Text(value);
}

function normalizeRisk(risk) {
  const source = isPlainObject(risk) ? risk : {};
  const level = M100_RISK_LEVELS.includes(source.level) ? source.level : "mutating";
  return {
    level,
    requiresConfirmation: true,
    reasons: compactArray(source.reasons && source.reasons.length ? source.reasons : [`${level}_action`], 8, 240)
  };
}

function normalizeLogs(logs) {
  const items = Array.isArray(logs) ? logs : [];
  return items.slice(0, 12).map((item) => {
    const source = isPlainObject(item) ? item : {};
    return {
      phase: compactText(source.phase || "protocol_validation", 80),
      level: ["info", "warn", "error"].includes(source.level) ? source.level : "info",
      message: redactForUserDiagnostic(source.message || "", 500),
      logRef: source.logRef ? redactForUserDiagnostic(source.logRef, 240) : undefined
    };
  }).filter((item) => item.message);
}

function normalizeDiagnosticPhase(value, fallback) {
  const phase = compactText(value || "", 80);
  if (M100_DIAGNOSTIC_PHASES.includes(phase)) return phase;
  return M100_DIAGNOSTIC_PHASES.includes(fallback) ? fallback : "protocol_validation";
}

function normalizeDiagnosticCode(value, fallback) {
  const source = compactText(value || fallback || "m100_diagnostic", 120).toLowerCase();
  return source.replace(/[^a-z0-9_.-]+/g, "_").replace(/^_+|_+$/g, "") || "m100_diagnostic";
}

function createUserDiagnostic(options) {
  const source = options || {};
  const phase = normalizeDiagnosticPhase(source.phase, "protocol_validation");
  const code = normalizeDiagnosticCode(source.code, `${phase}_failed`);
  return {
    phase,
    code,
    message: redactForUserDiagnostic(source.message || source.error || "Request failed.", source.messageMaxLength || 1000),
    requestId: source.requestId ? compactText(source.requestId, 120) : undefined,
    actionId: source.actionId ? compactText(source.actionId, 120) : undefined,
    executionId: source.executionId ? compactText(source.executionId, 120) : undefined,
    commandId: source.commandId ? compactText(source.commandId, 120) : undefined,
    lifecycleState: source.lifecycleState ? compactText(source.lifecycleState, 80) : undefined,
    rawPreview: Object.prototype.hasOwnProperty.call(source, "rawPreview") ? redactForUserDiagnostic(source.rawPreview, source.rawPreviewMaxLength || 1000) : undefined,
    logRef: source.logRef ? redactForUserDiagnostic(source.logRef, 240) : undefined
  };
}

function createAssistantResponseEnvelope(options) {
  const source = options || {};
  return {
    protocolVersion: M100_PROTOCOL_VERSION,
    messageType: "assistant_response",
    status: source.status || "completed",
    createdBy: M100_BACKEND_SOURCE,
    serverCreated: true,
    requestId: compactText(source.requestId || createM100Id("req"), 120),
    summary: compactText(source.summary || source.text || "", 2000),
    details: source.details ? compactText(source.details, 2000) : undefined,
    logs: normalizeLogs(source.logs)
  };
}

function createActionProposalEnvelope(options) {
  const source = options || {};
  const confirmationSource = isPlainObject(source.confirmation) ? source.confirmation : {};
  const nowMs = Number(source.nowMs || Date.now());
  const payload = source.payload === undefined ? null : source.payload;
  const preview = compactText(source.preview || source.summary || "AE action proposal", 2000);
  const risk = normalizeRisk(source.risk);
  const action = isPlainObject(source.action) ? source.action : {};
  const actionKind = M100_ACTION_KINDS.includes(action.kind) ? action.kind : "ae_tool";
  const actionId = compactText(source.actionId || createM100Id("act"), 120);
  const payloadRef = compactText(action.payloadRef || source.payloadRef || createM100Id("payload"), 160);
  const proposalExpiresAt = new Date(nowMs + Math.max(1000, Number(source.ttlMs || M100_ACTION_PROPOSAL_TTL_MS))).toISOString();
  const confirmationToken = compactText(source.confirmationToken || confirmationSource.confirmationToken || createConfirmationToken(), 160);
  const confirmationSurface = compactText(source.confirmationSurface || confirmationSource.surface || "cep-panel", 80);
  const confirmationSessionId = compactText(source.confirmationSessionId || confirmationSource.sessionId || "", 160);
  return {
    protocolVersion: M100_PROTOCOL_VERSION,
    messageType: "action_proposal",
    status: "awaiting_confirmation",
    createdBy: M100_BACKEND_SOURCE,
    serverCreated: true,
    requestId: compactText(source.requestId || createM100Id("req"), 120),
    actionId,
    summary: compactText(source.summary || preview, 1000),
    details: source.details ? compactText(source.details, 2000) : undefined,
    risk,
    action: {
      kind: actionKind,
      toolName: action.toolName ? compactText(action.toolName, 160) : undefined,
      preview,
      payloadRef,
      payloadHash: action.payloadHash || sha256Payload(payload),
      previewHash: action.previewHash || sha256Text(preview)
    },
    confirmation: {
      required: true,
      state: "pending",
      proposalExpiresAt,
      riskPolicyVersion: M100_RISK_POLICY_VERSION,
      confirmationToken,
      surface: confirmationSurface,
      sessionId: confirmationSessionId || undefined
    },
    logs: normalizeLogs(source.logs)
  };
}

function createActionResultEnvelope(options) {
  const source = options || {};
  const ok = source.ok !== false;
  const errorDiagnostic = ok ? null : createUserDiagnostic({
    phase: source.phase || "protocol_validation",
    code: source.code,
    message: source.error || source.message || "Action failed.",
    requestId: source.requestId,
    actionId: source.actionId,
    executionId: source.executionId,
    rawPreview: source.rawPreview
  });
  return {
    protocolVersion: M100_PROTOCOL_VERSION,
    messageType: ok ? "action_result" : "error",
    status: ok ? "completed" : "failed",
    createdBy: M100_BACKEND_SOURCE,
    serverCreated: true,
    requestId: compactText(source.requestId || "", 120),
    actionId: source.actionId ? compactText(source.actionId, 120) : undefined,
    executionId: source.executionId ? compactText(source.executionId, 120) : undefined,
    summary: ok
      ? compactText(source.summary || "Action completed.", 1000)
      : redactForUserDiagnostic(source.summary || (errorDiagnostic && errorDiagnostic.message) || "Action failed.", 1000),
    result: ok ? {
      ok: true,
      summary: compactText(source.resultSummary || source.summary || "Action completed.", 1000),
      rawPreview: source.rawPreview ? redactForUserDiagnostic(source.rawPreview, 1000) : undefined
    } : undefined,
    error: ok ? undefined : {
      phase: errorDiagnostic.phase,
      code: errorDiagnostic.code,
      message: errorDiagnostic.message,
      rawPreview: errorDiagnostic.rawPreview
    },
    logs: normalizeLogs(source.logs)
  };
}

function createErrorEnvelope(options) {
  return createActionResultEnvelope({
    ...(options || {}),
    ok: false,
    summary: (options && options.summary) || "Request failed."
  });
}

function hashLooksValid(value) {
  return /^sha256:[a-f0-9]{64}$/.test(String(value || ""));
}

function confirmationTokenLooksValid(value) {
  return /^confirm_[a-f0-9]{48}$/.test(String(value || ""));
}

function validateActionProposalEnvelope(envelope) {
  const errors = [];
  if (!isPlainObject(envelope)) {
    return { ok: false, errors: ["envelope_not_object"] };
  }
  if (envelope.protocolVersion !== M100_PROTOCOL_VERSION) errors.push("invalid_protocol_version");
  if (envelope.messageType !== "action_proposal") errors.push("invalid_message_type");
  if (envelope.status !== "awaiting_confirmation") errors.push("invalid_status");
  if (envelope.createdBy !== M100_BACKEND_SOURCE || envelope.serverCreated !== true) errors.push("not_backend_created");
  if (!envelope.requestId) errors.push("missing_request_id");
  if (!envelope.actionId) errors.push("missing_action_id");
  if (!isPlainObject(envelope.risk)) {
    errors.push("missing_risk");
  } else {
    if (!M100_RISK_LEVELS.includes(envelope.risk.level)) errors.push("invalid_risk_level");
    if (envelope.risk.requiresConfirmation !== true) errors.push("risk_confirmation_required");
    if (!Array.isArray(envelope.risk.reasons)) errors.push("risk_reasons_required");
  }
  if (!isPlainObject(envelope.action)) {
    errors.push("missing_action");
  } else {
    if (!M100_ACTION_KINDS.includes(envelope.action.kind)) errors.push("invalid_action_kind");
    if (!envelope.action.payloadRef) errors.push("missing_payload_ref");
    if (!hashLooksValid(envelope.action.payloadHash)) errors.push("invalid_payload_hash");
    if (!hashLooksValid(envelope.action.previewHash)) errors.push("invalid_preview_hash");
    if (!envelope.action.preview) errors.push("missing_preview");
  }
  if (!isPlainObject(envelope.confirmation)) {
    errors.push("missing_confirmation");
  } else {
    if (envelope.confirmation.required !== true) errors.push("confirmation_required");
    if (envelope.confirmation.state !== "pending") errors.push("invalid_confirmation_state");
    if (!envelope.confirmation.proposalExpiresAt || Number.isNaN(Date.parse(envelope.confirmation.proposalExpiresAt))) errors.push("invalid_proposal_expiry");
    if (envelope.confirmation.riskPolicyVersion !== M100_RISK_POLICY_VERSION) errors.push("invalid_risk_policy_version");
    if (!confirmationTokenLooksValid(envelope.confirmation.confirmationToken)) errors.push("invalid_confirmation_token");
    if (!envelope.confirmation.surface) errors.push("missing_confirmation_surface");
  }
  return { ok: errors.length === 0, errors };
}

function isBackendActionProposalEnvelope(value) {
  return validateActionProposalEnvelope(value).ok;
}

module.exports = {
  M100_PROTOCOL_VERSION,
  M100_RISK_POLICY_VERSION,
  M100_BACKEND_SOURCE,
  M100_ACTION_PROPOSAL_TTL_MS,
  M100_RISK_LEVELS,
  M100_CONFIRMATION_TOKEN_PREFIX,
  M100_DIAGNOSTIC_PHASES,
  compactText,
  redactForUserDiagnostic,
  normalizeDiagnosticPhase,
  normalizeDiagnosticCode,
  createUserDiagnostic,
  sha256Payload,
  sha256Text,
  stableStringify,
  createM100Id,
  createConfirmationToken,
  hashConfirmationToken,
  createAssistantResponseEnvelope,
  createActionProposalEnvelope,
  createActionResultEnvelope,
  createErrorEnvelope,
  validateActionProposalEnvelope,
  isBackendActionProposalEnvelope
};
