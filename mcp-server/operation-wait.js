"use strict";

const crypto = require("crypto");

const DEFAULT_WAIT_MS = 1000;
const MAX_WAIT_MS = 30000;
const POLL_INTERVAL_MS = 25;

const VALID_BRIDGE_TARGET_STATES = new Set(["connected", "idle", "connected_and_idle", "any"]);
const ALLOWED_BRIDGE_OPTIONS = new Set(["waitMs", "targetState", "pollIntervalMs"]);
const ALLOWED_PLAN_OPTIONS = new Set(["actionId", "instanceId", "revision", "waitMs", "stateToken", "targetStates", "pollIntervalMs"]);

function normalizeWaitMs(value) {
  if (value === undefined) return DEFAULT_WAIT_MS;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > MAX_WAIT_MS) {
    const error = new Error(`invalid_wait_ms: expected integer between 0 and ${MAX_WAIT_MS}, got ${JSON.stringify(value)}`);
    error.code = "invalid_wait_ms";
    throw error;
  }
  return value;
}

function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function compactLastRunSummary(lastRun) {
  if (!lastRun || typeof lastRun !== "object") return null;
  return {
    id: lastRun.id || null,
    ok: typeof lastRun.ok === "boolean" ? lastRun.ok : null,
    dryRun: typeof lastRun.dryRun === "boolean" ? lastRun.dryRun : null,
    errorCode: lastRun.errorCode || null,
    error: lastRun.error || null,
    durationMs: typeof lastRun.durationMs === "number" && Number.isFinite(lastRun.durationMs) ? lastRun.durationMs : null,
    executedCount: typeof lastRun.executedCount === "number" && Number.isSafeInteger(lastRun.executedCount) ? lastRun.executedCount : 0,
    failedCount: typeof lastRun.failedCount === "number" && Number.isSafeInteger(lastRun.failedCount) ? lastRun.failedCount : 0,
    verification: lastRun.verification || null
  };
}

function computePlanStateToken(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return "plan_absent";
  const compactRun = compactLastRunSummary(snapshot.lastRun);
  const observed = {
    actionId: snapshot.actionId || null,
    instanceId: snapshot.instanceId || null,
    revision: snapshot.revision || null,
    state: snapshot.state || null,
    lastRun: compactRun ? {
      id: compactRun.id,
      ok: compactRun.ok,
      dryRun: compactRun.dryRun,
      errorCode: compactRun.errorCode,
      executedCount: compactRun.executedCount,
      failedCount: compactRun.failedCount,
      verification: compactRun.verification
    } : null
  };
  return crypto.createHash("sha256").update(JSON.stringify(observed)).digest("hex").slice(0, 32);
}

async function waitForBridgeState(bridgeStatusReader, options = {}) {
  for (const key of Object.keys(options)) {
    if (!ALLOWED_BRIDGE_OPTIONS.has(key)) {
      const error = new Error(`unknown_option:${key}`);
      error.code = "unknown_option";
      throw error;
    }
  }

  const waitMs = normalizeWaitMs(options.waitMs);
  const targetState = options.targetState !== undefined ? String(options.targetState).trim().toLowerCase() : "connected";
  if (!VALID_BRIDGE_TARGET_STATES.has(targetState)) {
    const error = new Error(`invalid_target_state:${targetState}`);
    error.code = "invalid_target_state";
    throw error;
  }

  const pollInterval = typeof options.pollIntervalMs === "number" && options.pollIntervalMs > 0 ? options.pollIntervalMs : POLL_INTERVAL_MS;
  const startedAt = Date.now();
  const deadline = startedAt + waitMs;

  function evaluate(raw) {
    if (!raw || typeof raw !== "object") {
      return {
        panelConnected: null,
        idle: null,
        pendingCommands: null,
        inflightCommands: null,
        retainedResults: 0,
        state: "unknown",
        conditionMet: false
      };
    }

    const panelConnected = typeof raw.panelConnected === "boolean" ? raw.panelConnected : null;
    const pendingCommands = typeof raw.pendingCommands === "number" && Number.isSafeInteger(raw.pendingCommands)
      ? raw.pendingCommands
      : null;
    const inflightCommands = Array.isArray(raw.inflightCommands)
      ? raw.inflightCommands.length
      : (typeof raw.inflightCommands === "number" && Number.isSafeInteger(raw.inflightCommands) ? raw.inflightCommands : null);
    const retainedResults = typeof raw.retainedResults === "number" && Number.isSafeInteger(raw.retainedResults)
      ? raw.retainedResults
      : 0;

    // Idle is known true ONLY if pendingCommands is known 0 and inflightCommands is known 0.
    // If fields are missing/unknown, idle is null, not true!
    const isIdle = (pendingCommands !== null && inflightCommands !== null)
      ? (pendingCommands === 0 && inflightCommands === 0)
      : null;

    const isConnected = panelConnected === true;

    let conditionMet = false;
    if (targetState === "connected") {
      conditionMet = isConnected;
    } else if (targetState === "idle") {
      conditionMet = isIdle === true;
    } else if (targetState === "connected_and_idle") {
      conditionMet = isConnected && (isIdle === true);
    } else if (targetState === "any") {
      conditionMet = true;
    }

    let state = "unknown";
    if (panelConnected !== null) {
      if (isIdle === true) {
        state = panelConnected ? "connected_idle" : "disconnected_idle";
      } else if (isIdle === false) {
        state = panelConnected ? "connected_busy" : "disconnected_busy";
      } else {
        state = panelConnected ? "connected_unknown" : "disconnected_unknown";
      }
    }

    return {
      panelConnected,
      idle: isIdle,
      pendingCommands,
      inflightCommands,
      retainedResults,
      state,
      conditionMet
    };
  }

  while (true) {
    let rawStatus = null;
    try {
      rawStatus = typeof bridgeStatusReader === "function" ? bridgeStatusReader() : bridgeStatusReader;
    } catch {
      rawStatus = null;
    }

    const current = evaluate(rawStatus);

    if (current.conditionMet) {
      return {
        ok: true,
        panelConnected: current.panelConnected,
        idle: current.idle,
        pendingCommands: current.pendingCommands,
        inflightCommands: current.inflightCommands,
        retainedResults: current.retainedResults,
        state: current.state,
        targetState,
        timedOut: false,
        durationMs: Date.now() - startedAt,
        observedAt: new Date().toISOString()
      };
    }

    const now = Date.now();
    if (now >= deadline) {
      return {
        ok: true,
        panelConnected: current.panelConnected,
        idle: current.idle,
        pendingCommands: current.pendingCommands,
        inflightCommands: current.inflightCommands,
        retainedResults: current.retainedResults,
        state: current.state,
        targetState,
        timedOut: true,
        durationMs: now - startedAt,
        observedAt: new Date().toISOString()
      };
    }

    const remaining = deadline - now;
    await pause(Math.min(pollInterval, remaining));
  }
}

async function waitForPlanState(proposalSnapshotReader, options = {}) {
  for (const key of Object.keys(options)) {
    if (!ALLOWED_PLAN_OPTIONS.has(key)) {
      const error = new Error(`unknown_option:${key}`);
      error.code = "unknown_option";
      throw error;
    }
  }

  const actionId = options.actionId;
  if (typeof actionId !== "string" || !actionId.trim()) {
    const error = new Error("invalid_action_id: actionId must be a non-empty string");
    error.code = "invalid_action_id";
    throw error;
  }

  const instanceId = options.instanceId;
  if (typeof instanceId !== "string" || !instanceId.trim()) {
    const error = new Error("invalid_instance_id: instanceId must be a non-empty string");
    error.code = "invalid_instance_id";
    throw error;
  }

  const revision = options.revision;
  if (typeof revision !== "number" || !Number.isSafeInteger(revision) || revision < 1) {
    const error = new Error("invalid_revision: revision must be an integer >= 1");
    error.code = "invalid_revision";
    throw error;
  }

  const waitMs = normalizeWaitMs(options.waitMs);
  const stateToken = options.stateToken ? String(options.stateToken).trim() : null;
  const targetStates = Array.isArray(options.targetStates)
    ? options.targetStates.map((s) => String(s).trim().toLowerCase())
    : null;

  const pollInterval = typeof options.pollIntervalMs === "number" && options.pollIntervalMs > 0 ? options.pollIntervalMs : POLL_INTERVAL_MS;
  const startedAt = Date.now();
  const deadline = startedAt + waitMs;

  function evaluate(snapshot) {
    if (!snapshot) {
      return {
        distinct: true,
        ok: false,
        status: "absent",
        reason: "no_active_proposal"
      };
    }

    if (typeof snapshot !== "object" || !snapshot.actionId || !snapshot.instanceId || snapshot.revision === undefined) {
      return {
        distinct: false,
        matched: false,
        status: "nonready",
        currentToken: "corrupted_snapshot",
        snapshot: null
      };
    }

    if (snapshot.instanceId !== instanceId) {
      return {
        distinct: true,
        ok: false,
        status: "superseded",
        reason: "instance_id_mismatch",
        observedInstanceId: snapshot.instanceId
      };
    }

    if (snapshot.actionId !== actionId) {
      return {
        distinct: true,
        ok: false,
        status: "superseded",
        reason: "action_id_mismatch",
        supersededBy: snapshot.actionId
      };
    }

    if (snapshot.revision !== revision) {
      return {
        distinct: true,
        ok: false,
        status: "superseded",
        reason: "revision_mismatch",
        currentRevision: snapshot.revision
      };
    }

    if (snapshot.state === "superseded") {
      return {
        distinct: true,
        ok: false,
        status: "superseded",
        reason: "proposal_superseded"
      };
    }

    let isExpired = snapshot.state === "expired";
    if (!isExpired && snapshot.expiresAt) {
      const expTime = typeof snapshot.expiresAt === "number" ? snapshot.expiresAt : Date.parse(snapshot.expiresAt);
      if (Number.isFinite(expTime) && expTime <= Date.now()) {
        isExpired = true;
      }
    }

    if (isExpired) {
      return {
        distinct: true,
        ok: false,
        status: "expired",
        reason: "proposal_expired",
        snapshot
      };
    }

    const currentToken = computePlanStateToken(snapshot);
    const currentState = String(snapshot.state || "unknown").toLowerCase();

    if (targetStates && targetStates.includes(currentState)) {
      return {
        distinct: false,
        matched: true,
        status: snapshot.state,
        currentToken,
        snapshot
      };
    }

    if (stateToken && currentToken !== stateToken) {
      return {
        distinct: false,
        matched: true,
        status: snapshot.state,
        currentToken,
        snapshot
      };
    }

    const isTerminal = ["completed", "failed", "cancelled"].includes(currentState);
    if (isTerminal && !stateToken && !targetStates) {
      return {
        distinct: false,
        matched: true,
        status: snapshot.state,
        currentToken,
        snapshot
      };
    }

    return {
      distinct: false,
      matched: false,
      status: snapshot.state,
      currentToken,
      snapshot
    };
  }

  while (true) {
    let rawSnapshot = null;
    try {
      rawSnapshot = typeof proposalSnapshotReader === "function" ? proposalSnapshotReader() : proposalSnapshotReader;
    } catch {
      rawSnapshot = null;
    }

    const res = evaluate(rawSnapshot);

    if (res.distinct) {
      return {
        ok: false,
        status: res.status,
        state: res.status,
        stateToken: res.status,
        actionId,
        instanceId,
        revision,
        reason: res.reason,
        timedOut: false,
        durationMs: Date.now() - startedAt,
        observedAt: new Date().toISOString(),
        lastRun: (res.status === "expired" && res.snapshot) ? compactLastRunSummary(res.snapshot.lastRun) : null,
        ...(res.observedInstanceId ? { observedInstanceId: res.observedInstanceId } : {}),
        ...(res.supersededBy ? { supersededBy: res.supersededBy } : {}),
        ...(res.currentRevision !== undefined ? { currentRevision: res.currentRevision } : {})
      };
    }

    if (res.matched) {
      return {
        ok: true,
        status: res.status,
        state: res.status,
        stateToken: res.currentToken,
        actionId,
        instanceId,
        revision,
        expiresAt: res.snapshot ? res.snapshot.expiresAt || null : null,
        dryRunCompletedAt: res.snapshot ? res.snapshot.dryRunCompletedAt || null : null,
        lastRun: compactLastRunSummary(res.snapshot ? res.snapshot.lastRun : null),
        timedOut: false,
        durationMs: Date.now() - startedAt,
        observedAt: new Date().toISOString()
      };
    }

    const now = Date.now();
    if (now >= deadline) {
      return {
        ok: true,
        status: res.status,
        state: res.status,
        stateToken: res.currentToken,
        actionId,
        instanceId,
        revision,
        expiresAt: res.snapshot ? res.snapshot.expiresAt || null : null,
        dryRunCompletedAt: res.snapshot ? res.snapshot.dryRunCompletedAt || null : null,
        lastRun: compactLastRunSummary(res.snapshot ? res.snapshot.lastRun : null),
        timedOut: true,
        durationMs: now - startedAt,
        observedAt: new Date().toISOString()
      };
    }

    const remaining = deadline - now;
    await pause(Math.min(pollInterval, remaining));
  }
}

module.exports = {
  DEFAULT_WAIT_MS,
  MAX_WAIT_MS,
  POLL_INTERVAL_MS,
  normalizeWaitMs,
  computePlanStateToken,
  compactLastRunSummary,
  waitForBridgeState,
  waitForPlanState
};
