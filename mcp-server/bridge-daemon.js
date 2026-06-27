#!/usr/bin/env node
"use strict";

const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const aiAgents = require("./ai-agents");
const { buildSolutionHintsForPrompt } = require("./solution-library");
const { classifyAgentPlan } = require("./plan-risk-classifier");
const { repairAgentPlan } = require("./plan-repair");
const { buildSemanticVerification } = require("./semantic-verification");
const m100Protocol = require("./m100-protocol");
const {
  buildRawExtendscriptFallbackCandidateInput
} = require("./raw-fallback-candidate");
const { writeSolutionCandidateReport } = require("../scripts/solution-candidate-report");
const { validateRegistry } = require("../scripts/solution-registry-smoke");
const {
  buildProjectIntentMemoryForPrompt,
  readProjectIntentMemory,
  updateProjectIntentMemory
} = require("./project-intent-memory");

const SERVER_NAME = "codex-ae-mcp-bridge";
const SERVER_VERSION = "2.0.0";
const PROTOCOL_VERSION = "2025-03-26";
const HOST = "127.0.0.1";
const PORT = Number(process.env.AE_BRIDGE_PORT || 3456);
const TOKEN = process.env.AE_BRIDGE_TOKEN || "codex-ae-local";
const COMMAND_TIMEOUT_MS = Number(process.env.AE_COMMAND_TIMEOUT_MS || 30000);
const AE_RESULT_RAW_PREVIEW_MAX = 500;
const PROJECT_ROOT = path.resolve(__dirname, "..");
const LOG_DIR = path.join(PROJECT_ROOT, "logs");
const LOG_FILE = path.join(LOG_DIR, "bridge-events.jsonl");
const AI_CHAT_LOG_FILE = path.join(LOG_DIR, "ai-agent-chats.jsonl");
const EDIT_SESSION_ACTIVE_FILE = path.join(LOG_DIR, "edit-session-active.json");
const EDIT_SESSION_LOG_FILE = path.join(LOG_DIR, "edit-sessions.jsonl");
const IDEMPOTENCY_LOG_FILE = path.join(LOG_DIR, "idempotency-results.jsonl");
const DEV_REQUESTS_DIR = process.env.AE_AGENT_DEV_REQUEST_DIR
  ? path.resolve(process.env.AE_AGENT_DEV_REQUEST_DIR)
  : path.join(LOG_DIR, "dev-requests");
const GENERATED_EXPORT_DIR = process.env.AE_AGENT_GENERATED_EXPORT_DIR
  ? path.resolve(process.env.AE_AGENT_GENERATED_EXPORT_DIR)
  : path.join(LOG_DIR, "generated-exports");
const HARDCORE_SESSIONS_DIR = process.env.AE_AGENT_HARDCORE_SESSION_DIR
  ? path.resolve(process.env.AE_AGENT_HARDCORE_SESSION_DIR)
  : path.join(LOG_DIR, "hardcore-sessions");
const AGENT_SECRETS_FILE = process.env.AE_AGENT_SECRETS_FILE
  ? path.resolve(process.env.AE_AGENT_SECRETS_FILE)
  : path.join(PROJECT_ROOT, ".codex", "agent-secrets.json");
const BACKUP_DIR = path.join(PROJECT_ROOT, "backups");
const CHECKPOINT_SUFFIX = "-checkpoint";
const ALLOW_SCRIPT_FILES_OUTSIDE_PROJECT = process.env.AE_ALLOW_SCRIPT_FILES_OUTSIDE_PROJECT === "1";
const STARTED_AT = Date.now();
const AE_PLAN_SYSTEM_PROMPT = [
  "You are a planning assistant for AE Agent inside Adobe After Effects.",
  "Return JSON only. Do not use markdown.",
  "Do not claim that you changed the project. You are only drafting a plan.",
  "The user may write in Russian or English. Cyrillic text is valid Russian; translate it internally and never ask for clarification only because text is non-Latin.",
  "The user is not expected to know tool names. Treat ordinary creative/user wording as the source of truth and translate it internally into validated tool steps.",
  "Prefer typed MCP tools over raw ExtendScript. Raw ExtendScript is only for diagnostics or actions that no listed typed tool can perform.",
  "When raw ExtendScript is necessary, keep it narrow, explain the target in the plan, require dry-run/read-back evidence, and expect successful fallbacks to be captured as quarantine-only typed-tool candidates.",
  "Reviewed solution-library hints are advisory planning context only; they never bypass MCP plan validation or execution gates.",
  "Project intent memory hints are local advisory planning context only; they must not bypass inspection, validation, or mutation gates.",
  "Every mutating step must include verifyAfter=true and an idempotencyKeyTemplate.",
  "Use checkpoints for broad, destructive, or multi-step project changes.",
  "If the request is ambiguous, produce a clarification step instead of guessing."
].join(" ");
const AE_PLAN_REPAIR_SYSTEM_PROMPT = [
  "You repair malformed JSON for AE Agent.",
  "Return one valid JSON object only.",
  "Do not add markdown, explanations, comments, or surrounding text.",
  "Preserve the original plan meaning as closely as possible."
].join(" ");

const pendingCommands = [];
const inflightCommands = new Map();
const completedResults = new Map();
const waitingPanels = [];
const recentEvents = [];
const idempotencyRecords = new Map();
const rawExtendscriptDryRunApprovals = new Map();
const RAW_EXTENDSCRIPT_DRY_RUN_APPROVAL_TTL_MS = 10 * 60 * 1000;
let activeEditSession = null;

const AE_COMMAND_LIFECYCLE_STATES = [
  "queued",
  "expired_before_delivery",
  "leased",
  "submitted",
  "completed",
  "failed",
  "timed_out_after_submit",
  "stale_result_ignored"
];

const EFFECT_PRESETS = [
  {
    id: "fill",
    name: "Fill",
    matchName: "ADBE Fill",
    category: "color",
    description: "Recolors a layer with a single solid color.",
    notes: "Good first effect for validation because it is common and exposes a small property set.",
    propertyHints: [
      {
        name: "Color",
        matchName: "ADBE Fill-0002",
        propertyIndex: 3,
        valueType: "color",
        exampleValue: [1, 0, 0, 1],
        notes: "RGBA-like array in AE. Inspect with get_effect_details before setting in production."
      }
    ]
  },
  {
    id: "gaussian-blur",
    name: "Gaussian Blur",
    matchName: "ADBE Gaussian Blur 2",
    category: "blur",
    description: "Softens a layer with a standard Gaussian blur.",
    notes: "Use get_effect_details after adding it to confirm property names for the installed AE locale/version.",
    propertyHints: [
      {
        name: "Blurriness",
        valueType: "number",
        exampleValue: 25,
        notes: "Common first property on Gaussian Blur variants; inspect exact matchName before setting."
      },
      {
        name: "Repeat Edge Pixels",
        valueType: "boolean",
        exampleValue: true,
        notes: "Useful to avoid transparent/soft edges on full-frame blurs."
      }
    ]
  },
  {
    id: "fast-box-blur",
    name: "Fast Box Blur",
    matchName: "ADBE Box Blur2",
    category: "blur",
    description: "Fast blur effect often used for broad background softening.",
    notes: "Availability can vary by AE version; add_effect will report if the matchName is unavailable."
  },
  {
    id: "glow",
    name: "Glow",
    matchName: "ADBE Glo2",
    category: "stylize",
    description: "Adds glow around bright areas.",
    notes: "Property names vary enough that get_effect_details should be used before setting values."
  },
  {
    id: "tint",
    name: "Tint",
    matchName: "ADBE Tint",
    category: "color",
    description: "Maps black and white tones to two chosen colors.",
    notes: "Useful for simple two-color looks. Inspect property tree before setting map colors."
  },
  {
    id: "cc-wide-time",
    name: "CC Wide Time",
    matchName: "CC Wide Time",
    category: "time",
    description: "Time echo effect used by the onion-skinning typed contract.",
    notes: "Availability can vary by AE install; toggle_onion_skinning and add_effect report if it is unavailable."
  },
  {
    id: "slider-control",
    name: "Slider Control",
    matchName: "ADBE Slider Control",
    category: "expression-controls",
    description: "Adds a numeric slider effect for expression-driven controls.",
    notes: "Used by separate_shape_size_dimensions for generated rectangle/ellipse Size controls."
  },
  {
    id: "tritone",
    name: "Tritone",
    matchName: "ADBE Tritone",
    category: "color",
    description: "Maps shadows, midtones, and highlights to three colors.",
    notes: "Useful for graphic poster looks. Inspect exact properties on the target AE install."
  },
  {
    id: "curves",
    name: "Curves",
    matchName: "ADBE CurvesCustom",
    category: "color",
    description: "Advanced tonal curve adjustment.",
    notes: "Best inspected/read before automation; direct value setting can be less ergonomic than simple color effects."
  },
  {
    id: "levels",
    name: "Levels",
    matchName: "ADBE Easy Levels2",
    category: "color",
    description: "Adjusts black, white, gamma, and output levels.",
    notes: "Useful for practical tonal cleanup. Inspect property tree for exact controls."
  },
  {
    id: "drop-shadow",
    name: "Drop Shadow",
    matchName: "ADBE Drop Shadow",
    category: "perspective",
    description: "Adds a shadow offset behind a layer.",
    notes: "Common for titles and lower thirds; inspect details for opacity/distance/softness properties."
  },
  {
    id: "transform",
    name: "Transform",
    matchName: "ADBE Geometry2",
    category: "distort",
    description: "Adds effect-level transform controls independent from layer Transform.",
    notes: "Useful when layer transforms are already animated and an extra transform stack is needed."
  },
  {
    id: "displacement-map",
    name: "Displacement Map",
    matchName: "ADBE Displacement Map",
    category: "distort",
    description: "Displaces pixels using another layer as a map.",
    notes: "Requires layer references; inspect and set with care."
  },
  {
    id: "corner-pin",
    name: "Corner Pin",
    matchName: "ADBE Corner Pin",
    category: "distort",
    description: "Pins layer corners to four points.",
    notes: "Useful for screen replacements and perspective placement."
  }
];

function listEffectPresets(args) {
  const query = String(args.query || "").trim().toLowerCase();
  const category = String(args.category || "").trim().toLowerCase();
  const includeProperties = optionalBoolean(args, "includePropertyHints", true);
  const limit = Math.max(1, Math.min(100, Math.floor(optionalNumber(args, "limit", 50))));
  const categories = Array.from(new Set(EFFECT_PRESETS.map((preset) => preset.category))).sort();
  const matches = [];

  for (const preset of EFFECT_PRESETS) {
    if (category && preset.category !== category) continue;
    if (query) {
      const haystack = [
        preset.id,
        preset.name,
        preset.matchName,
        preset.category,
        preset.description,
        preset.notes
      ].join(" ").toLowerCase();
      if (!haystack.includes(query)) continue;
    }

    const item = {
      id: preset.id,
      name: preset.name,
      matchName: preset.matchName,
      category: preset.category,
      description: preset.description,
      notes: preset.notes
    };
    if (includeProperties && preset.propertyHints) {
      item.propertyHints = preset.propertyHints;
    }
    matches.push(item);
    if (matches.length >= limit) break;
  }

  return {
    query,
    category,
    categories,
    returned: matches.length,
    totalCatalogSize: EFFECT_PRESETS.length,
    workflow: [
      "Use add_effect with the matchName.",
      "Use get_effect_details with includeProperties=true to inspect exact property names, matchNames, and values.",
      "Use set_effect_property only after confirming the target property on the current AE version/project."
    ],
    presets: matches
  };
}

let lastPanelSeenAt = 0;
let lastPanelInfo = null;
let lastPanelPollLoggedAt = 0;

function log(message) {
  process.stderr.write(`[${SERVER_NAME}] ${message}\n`);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function sanitizeForLog(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    return value.length > 1000 ? `${value.slice(0, 1000)}...<truncated>` : value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => sanitizeForLog(item));
  }
  if (typeof value === "object") {
    const result = {};
    for (const key of Object.keys(value).slice(0, 50)) {
      result[key] = sanitizeForLog(value[key]);
    }
    return result;
  }
  return value;
}

function recordEvent(type, details) {
  const event = {
    at: new Date().toISOString(),
    type,
    details: sanitizeForLog(details || {})
  };

  recentEvents.push(event);
  if (recentEvents.length > 200) recentEvents.shift();

  try {
    ensureDir(LOG_DIR);
    fs.appendFileSync(LOG_FILE, `${JSON.stringify(event)}\n`, "utf8");
  } catch (error) {
    log(`Could not write event log: ${error.message}`);
  }
}

function appendJsonl(file, event) {
  try {
    ensureDir(path.dirname(file));
    fs.appendFileSync(file, `${JSON.stringify(event)}\n`, "utf8");
  } catch (error) {
    log(`Could not write ${path.basename(file)}: ${error.message}`);
  }
}

function appendAiChatEvent(type, details) {
  const event = {
    at: new Date().toISOString(),
    type,
    details: sanitizeForLog(details || {})
  };
  appendJsonl(AI_CHAT_LOG_FILE, event);
  recordEvent(`ai_agent_${type}`, details);
}

function tailJsonl(file, limit) {
  if (!fs.existsSync(file)) return [];
  const maxBytes = 1024 * 1024;
  const stat = fs.statSync(file);
  const start = Math.max(0, stat.size - maxBytes);
  const fd = fs.openSync(file, "r");
  try {
    const buffer = Buffer.alloc(stat.size - start);
    fs.readSync(fd, buffer, 0, buffer.length, start);
    return buffer
      .toString("utf8")
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(-limit)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch (_error) {
          return { malformed: true, line };
        }
      });
  } finally {
    fs.closeSync(fd);
  }
}

function readJsonFile(file) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJsonFileAtomic(file, value) {
  ensureDir(path.dirname(file));
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(tmp, file);
}

function agentApiKeyEnvName(agentId) {
  if (agentId === "openai-api") return "OPENAI_API_KEY";
  if (agentId === "gemini-api") return "GEMINI_API_KEY";
  if (agentId === "claude-api") return "ANTHROPIC_API_KEY";
  if (agentId === "openrouter") return "OPENROUTER_API_KEY";
  if (agentId === "ollama-cloud") return "OLLAMA_CLOUD_API_KEY";
  return "";
}

function loadAgentSecrets() {
  try {
    const secrets = readJsonFile(AGENT_SECRETS_FILE) || {};
    const apiKeys = secrets.apiKeys && typeof secrets.apiKeys === "object" ? secrets.apiKeys : {};
    for (const envName of Object.keys(apiKeys)) {
      if (!process.env[envName] && typeof apiKeys[envName] === "string" && apiKeys[envName]) {
        process.env[envName] = apiKeys[envName];
      }
    }
    return secrets;
  } catch (error) {
    recordEvent("ai_agent_secrets_load_failed", { error: error.message || String(error) });
    return {};
  }
}

function saveAgentApiKey(agentId, apiKey) {
  const normalizedAgentId = optionalString({ agentId }, "agentId", "").trim();
  const envName = agentApiKeyEnvName(normalizedAgentId);
  if (!envName) {
    throw new Error("Saving API keys is currently supported for openai-api, gemini-api, claude-api, openrouter, and ollama-cloud.");
  }

  const key = optionalString({ apiKey }, "apiKey", "").trim();
  if (!key) throw new Error("apiKey is required.");
  if (key.length < 12) throw new Error("apiKey looks too short.");

  const secrets = loadAgentSecrets();
  const apiKeys = secrets.apiKeys && typeof secrets.apiKeys === "object" ? secrets.apiKeys : {};
  apiKeys[envName] = key;
  const nextSecrets = {
    ...secrets,
    apiKeys,
    updatedAt: new Date().toISOString()
  };
  writeJsonFileAtomic(AGENT_SECRETS_FILE, nextSecrets);
  process.env[envName] = key;
  recordEvent("ai_agent_key_saved", {
    agentId: normalizedAgentId,
    apiKeyEnv: envName,
    keySuffix: key.slice(-4),
    secretsFile: AGENT_SECRETS_FILE
  });
  return {
    agentId: normalizedAgentId,
    apiKeyEnv: envName,
    saved: true,
    keySuffix: key.slice(-4),
    secretsFile: AGENT_SECRETS_FILE
  };
}

function appendEditSessionEvent(type, details) {
  const event = {
    at: new Date().toISOString(),
    type,
    ...details
  };
  try {
    ensureDir(LOG_DIR);
    fs.appendFileSync(EDIT_SESSION_LOG_FILE, `${JSON.stringify(event)}\n`, "utf8");
  } catch (error) {
    log(`Could not write edit session log: ${error.message}`);
  }
  recordEvent(`edit_${type}`, details);
}

function compactEditSession(session) {
  if (!session) return null;
  const latestOperation = session.operations && session.operations.length
    ? session.operations[session.operations.length - 1]
    : null;
  return {
    id: session.id,
    label: session.label || null,
    status: session.status,
    startedAt: session.startedAt,
    updatedAt: session.updatedAt || session.startedAt,
    finishedAt: session.finishedAt || null,
    outcome: session.outcome || null,
    checkpoint: compactCheckpoint(session.checkpoint),
    operationCount: Array.isArray(session.operations) ? session.operations.length : 0,
    latestOperation: latestOperation ? {
      id: latestOperation.id,
      at: latestOperation.at,
      tool: latestOperation.tool,
      ok: latestOperation.ok,
      target: latestOperation.target || null
    } : null
  };
}

function loadActiveEditSession() {
  try {
    const session = readJsonFile(EDIT_SESSION_ACTIVE_FILE);
    if (!session || session.status !== "active") return null;
    if (!Array.isArray(session.operations)) session.operations = [];
    return session;
  } catch (error) {
    log(`Could not load active edit session: ${error.message}`);
    return null;
  }
}

function persistActiveEditSession() {
  if (!activeEditSession) return;
  writeJsonFileAtomic(EDIT_SESSION_ACTIVE_FILE, activeEditSession);
}

function clearActiveEditSession() {
  try {
    if (fs.existsSync(EDIT_SESSION_ACTIVE_FILE)) {
      fs.unlinkSync(EDIT_SESSION_ACTIVE_FILE);
    }
  } catch (error) {
    log(`Could not remove active edit session file: ${error.message}`);
  }
}

function editSessionText(args, name, fallback, maxLength) {
  const value = optionalString(args, name, fallback);
  const normalized = String(value || "").trim();
  return normalized.slice(0, maxLength);
}

function editSessionDetails(session, limit) {
  const operations = Array.isArray(session.operations) ? session.operations : [];
  const max = Math.max(1, Math.min(500, Math.floor(limit || operations.length || 1)));
  return {
    ...session,
    operationCount: operations.length,
    operations: operations.slice(-max)
  };
}

async function startEditSession(args) {
  if (activeEditSession) {
    return toolResult({
      started: false,
      error: "An edit session is already active.",
      activeEditSession: compactEditSession(activeEditSession)
    }, true);
  }

  const label = editSessionText(args, "label", "", 120) || `edit-session-${timestampForFilename(new Date())}`;
  const notes = editSessionText(args, "notes", "", 1000) || null;
  let copied;
  try {
    copied = await copySavedProjectFile(`session-${label}`, "checkpoint");
  } catch (error) {
    recordEvent("edit_session_start_failed", { label, error: error.message || String(error) });
    return toolResult({
      started: false,
      label,
      error: error.message || String(error)
    }, true);
  }

  const now = new Date().toISOString();
  activeEditSession = {
    id: crypto.randomUUID(),
    label,
    notes,
    status: "active",
    startedAt: now,
    updatedAt: now,
    checkpoint: {
      label: copied.label,
      sourceFile: copied.sourceFile,
      checkpointFile: copied.destinationFile,
      bytes: copied.bytes,
      createdAt: copied.createdAt,
      project: copied.project,
      triggeredBy: "start_edit_session"
    },
    operations: []
  };

  persistActiveEditSession();
  appendEditSessionEvent("session_started", {
    session: compactEditSession(activeEditSession)
  });

  return toolResult({
    started: true,
    activeFile: EDIT_SESSION_ACTIVE_FILE,
    sessionsLogFile: EDIT_SESSION_LOG_FILE,
    session: editSessionDetails(activeEditSession)
  });
}

function getEditSessionStatus(args) {
  const limit = Math.max(1, Math.min(500, Math.floor(optionalNumber(args, "operationLimit", 100))));
  return toolResult({
    active: Boolean(activeEditSession),
    activeFile: EDIT_SESSION_ACTIVE_FILE,
    sessionsLogFile: EDIT_SESSION_LOG_FILE,
    session: activeEditSession ? editSessionDetails(activeEditSession, limit) : null
  });
}

function listEditSessions(args) {
  const limit = Math.max(1, Math.min(200, Math.floor(optionalNumber(args, "limit", 50))));
  const events = tailJsonl(EDIT_SESSION_LOG_FILE, Math.max(200, limit * 20));
  const sessionsById = new Map();

  for (const event of events) {
    if (!event || !event.session || !event.session.id) continue;
    sessionsById.set(event.session.id, {
      ...(sessionsById.get(event.session.id) || {}),
      ...event.session,
      lastEventAt: event.at,
      lastEventType: event.type
    });
  }

  if (activeEditSession) {
    sessionsById.set(activeEditSession.id, {
      ...(sessionsById.get(activeEditSession.id) || {}),
      ...compactEditSession(activeEditSession),
      lastEventType: "active"
    });
  }

  const sessions = Array.from(sessionsById.values())
    .sort((a, b) => String(b.finishedAt || b.updatedAt || b.startedAt || "").localeCompare(String(a.finishedAt || a.updatedAt || a.startedAt || "")))
    .slice(0, limit);

  return toolResult({
    active: Boolean(activeEditSession),
    activeEditSession: compactEditSession(activeEditSession),
    sessionsLogFile: EDIT_SESSION_LOG_FILE,
    sessions
  });
}

function finishEditSession(args) {
  if (!activeEditSession) {
    return toolResult("No edit session is active.", true);
  }

  const outcome = editSessionText(args, "outcome", "completed", 80) || "completed";
  const summary = editSessionText(args, "summary", "", 2000) || null;
  const finished = {
    ...activeEditSession,
    status: "finished",
    outcome,
    summary,
    finishedAt: new Date().toISOString()
  };
  finished.updatedAt = finished.finishedAt;

  appendEditSessionEvent("session_finished", {
    session: compactEditSession(finished)
  });
  activeEditSession = null;
  clearActiveEditSession();

  return toolResult({
    finished: true,
    active: false,
    session: editSessionDetails(finished)
  });
}

function planRunSessionLabel(run) {
  return `ai-plan-${String(run.id || crypto.randomUUID()).slice(0, 8)}`;
}

function isUnsavedProjectError(message) {
  return String(message || "").indexOf("has not been saved") >= 0;
}

async function startPlanRunEditSession(run, validation) {
  const label = planRunSessionLabel(run);
  const result = await startEditSession({
    label,
    notes: `AI plan run ${run.id} with ${validation.mutatingCount} mutating step(s).`
  });
  const payload = firstToolPayload(result);
  if (result.isError || !payload || payload.started !== true) {
    const rawError = operationErrorFromPayload(payload) || "Could not start an edit session.";
    return {
      ok: false,
      payload,
      rawError,
      saveProjectFirst: isUnsavedProjectError(rawError),
      error: isUnsavedProjectError(rawError)
        ? "Save the After Effects project first, then run the mutating plan again."
        : rawError
    };
  }

  return {
    ok: true,
    payload,
    session: payload.session || null,
    checkpoint: payload.session && payload.session.checkpoint
      ? compactCheckpoint(payload.session.checkpoint)
      : null
  };
}

function finishPlanRunEditSession(run) {
  const hasIssue = run.failedCount > 0 || run.steps.some((step) => step.status === "blocked" || step.status === "failed");
  const result = finishEditSession({
    outcome: hasIssue ? "needs-review" : "completed",
    summary: `AI plan run ${run.id} ${hasIssue ? "finished with issues" : "completed"}.`
  });
  const payload = firstToolPayload(result);
  if (result.isError) {
    const error = operationErrorFromPayload(payload) || "Could not finish the auto edit session.";
    run.warnings = run.warnings || [];
    run.warnings.push(error);
    if (run.safety) run.safety.finishError = error;
    return null;
  }
  return payload;
}

function firstToolPayload(result) {
  if (!result || !Array.isArray(result.content) || !result.content.length) return null;
  return parseToolText(result.content[0].text);
}

function operationErrorFromPayload(payload) {
  if (payload === null || payload === undefined) return null;
  if (typeof payload === "string") return payload;
  if (payload && typeof payload === "object") {
    return payload.error || payload.message || null;
  }
  return String(payload);
}

function trackEditSessionOperation(details) {
  if (!activeEditSession || !MUTATION_SUMMARY_TOOL_NAMES.has(details.name)) return;

  try {
    const payload = firstToolPayload(details.result);
    const mutation = payload && typeof payload === "object" ? payload.mutation || null : null;
    const operation = {
      id: details.eventId,
      at: new Date().toISOString(),
      source: details.source,
      tool: details.name,
      ok: Boolean(details.ok),
      durationMs: details.durationMs,
      target: mutation && mutation.target ? mutation.target : inferMutationTarget(details.name, details.args || {}, payload),
      mutation: mutation || null
    };

    const checkpoint = mutation && mutation.checkpoint
      ? mutation.checkpoint
      : payload && typeof payload === "object" && payload.checkpoint
        ? compactCheckpoint(payload.checkpoint)
        : null;
    if (checkpoint) operation.checkpoint = checkpoint;

    if (!details.ok) {
      operation.error = details.error || operationErrorFromPayload(payload) || "Tool call failed.";
    }

    activeEditSession.operations.push(operation);
    activeEditSession.updatedAt = operation.at;
    persistActiveEditSession();
    appendEditSessionEvent("session_operation", {
      session: compactEditSession(activeEditSession),
      operation
    });
  } catch (error) {
    recordEvent("edit_session_operation_track_failed", {
      tool: details.name,
      error: error.message || String(error)
    });
  }
}

function getBridgeStatus() {
  const now = Date.now();
  return {
    ok: true,
    server: SERVER_NAME,
    version: SERVER_VERSION,
    protocolVersion: PROTOCOL_VERSION,
    m100RiskPolicy: m100RiskPolicyStatus(),
    aeCommandLifecycleStates: AE_COMMAND_LIFECYCLE_STATES.slice(),
    host: HOST,
    port: PORT,
    uptimeMs: now - STARTED_AT,
    startedAt: new Date(STARTED_AT).toISOString(),
    panelConnected: now - lastPanelSeenAt < 15000,
    lastPanelSeenAt,
    lastPanelInfo,
    pendingCommands: countQueuedCommands(now),
    inflightCommands: Array.from(inflightCommands.values()).map((command) => compactAeCommand(command, now)),
    retainedResults: completedResults.size,
    recentResults: Array.from(completedResults.values()).slice(-25).map((result) => ({
      id: result.id,
      ok: result.ok,
      ageMs: now - result.completedAt,
      completedAt: new Date(result.completedAt).toISOString()
    })),
    waitingPanels: waitingPanels.length,
    logFile: LOG_FILE,
    aiChatLogFile: AI_CHAT_LOG_FILE,
    idempotencyLogFile: IDEMPOTENCY_LOG_FILE,
    generatedExportDir: GENERATED_EXPORT_DIR,
    hardcoreSessionDir: HARDCORE_SESSIONS_DIR,
    agentSecretsFile: AGENT_SECRETS_FILE,
    backupDir: BACKUP_DIR,
    activeEditSession: compactEditSession(activeEditSession),
    aiAgents: aiAgents.agentSummary(),
    recentEvents: recentEvents.slice(-25)
  };
}

function toolResult(text, isError) {
  return {
    content: [{ type: "text", text: typeof text === "string" ? text : JSON.stringify(text, null, 2) }],
    isError: Boolean(isError)
  };
}

function parseToolText(text) {
  if (typeof text !== "string") return text;
  try {
    return JSON.parse(text);
  } catch (_error) {
    return text;
  }
}

const MUTATION_CHECKPOINT_SCHEMA_PROPERTIES = {
  autoCheckpoint: {
    type: "boolean",
    description: "Whether to create a project checkpoint before this mutating operation. Defaults to false."
  },
  checkpointLabel: {
    type: "string",
    description: "Optional label for a checkpoint created before this mutating operation. Providing a label enables checkpoint creation."
  },
  idempotencyKey: {
    type: "string",
    description: "Optional repeat-safe key. Reusing the same key, scope, tool, and arguments returns the first successful result without running the mutation again."
  },
  idempotencyScope: {
    type: "string",
    description: "Optional namespace for idempotencyKey. Defaults to default."
  },
  verifyAfter: {
    type: "boolean",
    description: "Whether to inspect the AE project after this mutation and attach a verification snapshot. Defaults to true."
  }
};

const MUTATING_TOOL_NAMES = new Set([
  "run_extendscript",
  "run_extendscript_file",
  "create_comp",
  "create_project_folder",
  "move_project_items_to_folder",
  "create_text_layer",
  "create_shapes_from_text",
  "import_footage",
  "create_solid_layer",
  "create_null_layer",
  "create_adjustment_layer",
  "create_camera_layer",
  "create_camera_with_controller",
  "toggle_onion_skinning",
  "create_layer_mask",
  "set_layer_mask",
  "set_path_geometry",
  "export_path_points",
  "save_comp_frame_png",
  "add_project_item_to_comp",
  "duplicate_layer",
  "duplicate_layers",
  "set_layer_selection",
  "set_layer_parent",
  "set_layer_track_matte",
  "delete_layer",
  "duplicate_comp",
  "deep_duplicate_precomp_sources",
  "add_effect",
  "set_effect_property",
  "set_effect_enabled",
  "set_puppet_pin_type",
  "add_property_to_essential_graphics",
  "set_property_value",
  "set_layer_metadata",
  "set_layer_blending_mode",
  "set_project_item_metadata",
  "set_project_frames_count_type",
  "set_comp_current_time",
  "set_comp_properties",
  "refresh_comp_panel",
  "set_comp_work_area",
  "set_layer_time_range",
  "stagger_layers",
  "split_layers_at_time",
  "precompose_layers",
  "replace_layer_source",
  "rename_layers",
  "rename_project_items",
  "update_text_layer",
  "create_shape_layer",
  "create_layer_connection_line",
  "fit_layer_to_comp",
  "set_property_keyframes",
  "fill_in_keyframes",
  "keyframe_current_value_from_expression",
  "apply_keyframe_ease",
  "set_spatial_in_tangent",
  "set_expression",
  "clear_expression",
  "separate_shape_size_dimensions",
  "add_comp_to_render_queue",
  "set_render_queue_output",
  "align_layers_to_time",
  "set_layer_transform",
  "apply_transform_expression",
  "add_comp_marker",
  "add_layer_marker",
  "update_layer_marker",
  "delete_layer_marker",
  "create_test_comp",
  "cleanup_test_items"
]);

const MUTATION_SUMMARY_TOOL_NAMES = new Set([
  ...MUTATING_TOOL_NAMES,
  "checkpoint_project",
  "delete_project_checkpoint"
]);

const M100_RISK_POLICY_VERSION = m100Protocol.M100_RISK_POLICY_VERSION;
const M100_RISK_LEVELS = ["read_only", "mutating", "destructive", "raw_jsx"];
const M100_RAW_JSX_TOOL_NAMES = new Set([
  "run_extendscript",
  "run_extendscript_file"
]);
const M100_DESTRUCTIVE_TOOL_NAMES = new Set([
  "cleanup_test_items",
  "delete_project_checkpoint",
  "delete_layer"
]);
const M100_DIRECT_TOOL_SOURCES = new Set([
  "direct-tools-call"
]);
const M100_LOCAL_ADMIN_TOOL_SOURCES = new Set([
  "dev-http"
]);
const M100_DIRECT_ESCAPE_HATCH_ENV = "AE_M100_ALLOW_DIRECT_TOOL_EXECUTION";
const M100_DIRECT_ESCAPE_HATCH_ARG = "m100DirectExecutionEscapeHatch";
const m100ActionProposalStore = new Map();

function knownToolNames() {
  return new Set(tools.map((tool) => tool.name));
}

function m100RiskPolicyStatus() {
  return {
    version: M100_RISK_POLICY_VERSION,
    riskLevels: M100_RISK_LEVELS.slice(),
    directToolPolicy: "default-deny for unknown, mutating, destructive and raw_jsx tools",
    directToolSources: Array.from(M100_DIRECT_TOOL_SOURCES),
    localAdminToolSources: Array.from(M100_LOCAL_ADMIN_TOOL_SOURCES),
    escapeHatchEnv: M100_DIRECT_ESCAPE_HATCH_ENV,
    escapeHatchArg: M100_DIRECT_ESCAPE_HATCH_ARG
  };
}

function classifyM100ToolRisk(name) {
  const toolName = String(name || "");
  const known = knownToolNames().has(toolName);
  if (!known) {
    return {
      policyVersion: M100_RISK_POLICY_VERSION,
      toolName,
      known: false,
      riskLevel: null,
      requiresProposal: true,
      reasons: ["unknown_tool"]
    };
  }
  if (M100_RAW_JSX_TOOL_NAMES.has(toolName)) {
    return {
      policyVersion: M100_RISK_POLICY_VERSION,
      toolName,
      known: true,
      riskLevel: "raw_jsx",
      requiresProposal: true,
      reasons: ["raw ExtendScript execution requires a server-owned proposal"]
    };
  }
  if (M100_DESTRUCTIVE_TOOL_NAMES.has(toolName)) {
    return {
      policyVersion: M100_RISK_POLICY_VERSION,
      toolName,
      known: true,
      riskLevel: "destructive",
      requiresProposal: true,
      reasons: ["destructive tool requires a server-owned proposal"]
    };
  }
  if (MUTATING_TOOL_NAMES.has(toolName) || toolName === "run_ai_agent_plan" || toolName === "run_agent_hardcore_session") {
    return {
      policyVersion: M100_RISK_POLICY_VERSION,
      toolName,
      known: true,
      riskLevel: "mutating",
      requiresProposal: true,
      reasons: ["mutating execution path requires a server-owned proposal"]
    };
  }
  return {
    policyVersion: M100_RISK_POLICY_VERSION,
    toolName,
    known: true,
    riskLevel: "read_only",
    requiresProposal: false,
    reasons: []
  };
}

function m100DirectEscapeHatchAllowed(source, args) {
  if (M100_LOCAL_ADMIN_TOOL_SOURCES.has(source)) return true;
  if (process.env[M100_DIRECT_ESCAPE_HATCH_ENV] !== "1") return false;
  return Boolean(args && args[M100_DIRECT_ESCAPE_HATCH_ARG] === true);
}

function m100DirectToolCallBlock(source, name, args) {
  if (!M100_DIRECT_TOOL_SOURCES.has(source)) return null;
  const risk = classifyM100ToolRisk(name);
  if (risk.known && risk.riskLevel === "read_only") return null;
  if (m100DirectEscapeHatchAllowed(source, args || {})) {
    return null;
  }
  const clientProvidedConfirmation = Boolean(args && (args.confirm === true || args.confirmed === true || args.confirmationToken || args.m100ConfirmationToken));
  return {
    ok: false,
    code: risk.known ? "proposal_required" : "unknown_tool_blocked",
    message: risk.known
      ? `${risk.toolName} requires a server-owned M100 proposal before direct execution.`
      : `${risk.toolName || "Unknown tool"} is not in the M100 risk registry and is blocked by default.`,
    policyVersion: M100_RISK_POLICY_VERSION,
    surface: source,
    toolName: risk.toolName,
    riskLevel: risk.riskLevel,
    knownTool: risk.known,
    requiresProposal: true,
    clientProvidedConfirmation,
    ignoredClientConfirmation: clientProvidedConfirmation,
    reasons: risk.reasons
  };
}

function m100BlockedToolResult(block) {
  const diagnostic = m100Protocol.createUserDiagnostic({
    phase: "confirmation_validation",
    code: block.code,
    message: block.message
  });
  return toolResult({
    ok: false,
    code: block.code,
    message: diagnostic.message,
    m100: {
      policyVersion: block.policyVersion,
      surface: block.surface,
      toolName: block.toolName,
      riskLevel: block.riskLevel,
      knownTool: block.knownTool,
      requiresProposal: block.requiresProposal,
      ignoredClientConfirmation: block.ignoredClientConfirmation,
      reasons: block.reasons,
      diagnostic
    }
  }, true);
}

function m100PlanSteps(plan, validation) {
  if (validation && Array.isArray(validation.steps)) return validation.steps;
  return plan && Array.isArray(plan.steps) ? plan.steps : [];
}

function m100RiskForAgentPlan(plan, validation) {
  const steps = m100PlanSteps(plan, validation);
  let hasRawJsx = rawExtendscriptStepCount(validation) > 0;
  let hasDestructive = false;
  let hasMutating = Number(validation && validation.mutatingCount || 0) > 0;
  for (const step of steps) {
    const tool = String(step && step.tool || "");
    if (M100_RAW_JSX_TOOL_NAMES.has(tool)) hasRawJsx = true;
    if (M100_DESTRUCTIVE_TOOL_NAMES.has(tool)) hasDestructive = true;
    if (step && step.mutatesProject) hasMutating = true;
  }
  if (hasRawJsx) {
    return {
      level: "raw_jsx",
      requiresConfirmation: true,
      reasons: ["validated Agent plan includes raw ExtendScript"]
    };
  }
  if (hasDestructive) {
    return {
      level: "destructive",
      requiresConfirmation: true,
      reasons: ["validated Agent plan includes a destructive tool"]
    };
  }
  if (hasMutating) {
    return {
      level: "mutating",
      requiresConfirmation: true,
      reasons: ["validated Agent plan includes project-changing steps"]
    };
  }
  return {
    level: "read_only",
    requiresConfirmation: true,
    reasons: ["validated Agent plan is read-only"]
  };
}

function m100PreviewForAgentPlan(plan, validation) {
  const lines = [];
  if (plan && plan.summary) lines.push(`Summary: ${plan.summary}`);
  const steps = m100PlanSteps(plan, validation).slice(0, 6);
  if (steps.length) {
    lines.push("Steps:");
    steps.forEach((step, index) => {
      const title = step && (step.title || step.intent || step.tool) || "Step";
      const tool = step && step.tool ? ` [${step.tool}]` : "";
      lines.push(`${index + 1}. ${title}${tool}`);
    });
  }
  if (validation) {
    lines.push(`Validation: ${validation.ok ? "ok" : "needs review"}, ${Number(validation.stepCount || steps.length || 0)} step(s), ${Number(validation.mutatingCount || 0)} mutating.`);
  }
  return m100Protocol.compactText(lines.join("\n"), 2000);
}

function pruneM100ActionProposalStore(now = Date.now()) {
  const seen = new Set();
  for (const record of m100ActionProposalStore.values()) {
    if (!record || seen.has(record.actionId)) continue;
    seen.add(record.actionId);
    const expiresAtMs = Date.parse(record.proposalExpiresAt || record.proposal && record.proposal.confirmation && record.proposal.confirmation.proposalExpiresAt || "");
    if (Number.isFinite(expiresAtMs) && expiresAtMs + m100Protocol.M100_ACTION_PROPOSAL_TTL_MS <= now) {
      m100ActionProposalStore.delete(record.actionId);
      m100ActionProposalStore.delete(record.payloadRef);
    }
  }
}

function m100ProtocolError(code, message, details) {
  const error = new Error(message);
  error.code = code;
  if (details && typeof details === "object") {
    Object.assign(error, details);
  }
  return error;
}

function m100ErrorCode(error, fallback) {
  const providerCode = error && error.providerError && error.providerError.code;
  const ownCode = error && error.code ? String(error.code) : "";
  if (ownCode && !/^(ECONNREFUSED|ECONNRESET|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ENOENT|EPERM|EACCES)$/i.test(ownCode)) {
    return ownCode;
  }
  return String(providerCode || ownCode || fallback || "m100_request_failed");
}

function m100PhaseForError(error, fallback) {
  const code = m100ErrorCode(error, "");
  if (error && error.phase) return m100Protocol.normalizeDiagnosticPhase(error.phase, fallback || "protocol_validation");
  if (/confirmation|proposal_required|proposal_not_found|proposal_expired|token|surface|session|risk_|payload_|preview_/.test(code)) {
    return "confirmation_validation";
  }
  if (/ae_result_parse/.test(code)) return "ae_result_parse";
  if (/ae_execution/.test(code)) return "ae_execution";
  if (/expired_before_delivery|unknown_after_delivery|timed_out_after_submit|command|queue/.test(code)) return "ae_queue";
  if (error && (error.readiness || error.providerError && ["setup", "models", "readiness"].includes(error.providerError.phase))) return "provider_readiness";
  if (/model_timeout|timeout/.test(code) || /timed out|timeout/i.test(error && error.message || "")) return "model_timeout";
  if (/codex_nonzero_exit|codex_no_assistant_text/.test(code)) return "codex_exec";
  if (/codex_malformed_jsonl|malformed|validation|plan_not_valid/.test(code)) return "protocol_validation";
  if (error && error.providerError) return "codex_exec";
  return m100Protocol.normalizeDiagnosticPhase(fallback, "protocol_validation");
}

function m100RawPreviewForError(error) {
  if (!error) return undefined;
  if (Object.prototype.hasOwnProperty.call(error, "rawPreview")) return error.rawPreview;
  if (error.stderr) return error.stderr;
  if (error.stdout) return error.stdout;
  if (error.providerError && error.providerError.rawProviderMessage) return error.providerError.rawProviderMessage;
  if (error.providerError && error.providerError.response !== undefined) {
    try {
      return JSON.stringify(error.providerError.response);
    } catch (_error) {
      return String(error.providerError.response);
    }
  }
  return undefined;
}

function m100UserDiagnosticFromError(error, options = {}) {
  return m100Protocol.createUserDiagnostic({
    phase: options.phase || m100PhaseForError(error, options.fallbackPhase),
    code: options.code || m100ErrorCode(error, options.fallbackCode),
    message: options.message || error && (error.message || String(error)) || "Request failed.",
    requestId: options.requestId || error && error.requestId,
    actionId: options.actionId || error && error.actionId,
    executionId: options.executionId || error && error.executionId,
    commandId: options.commandId || error && error.commandId,
    lifecycleState: options.lifecycleState || error && error.lifecycleState,
    rawPreview: Object.prototype.hasOwnProperty.call(options, "rawPreview") ? options.rawPreview : m100RawPreviewForError(error),
    logRef: options.logRef || error && error.logRef
  });
}

function m100SanitizedProviderError(providerError) {
  if (!providerError || typeof providerError !== "object") return null;
  return m100SanitizedDiagnosticObject(providerError, 1000);
}

function m100SanitizedDiagnosticObject(value, maxLength = 4000) {
  if (value === undefined || value === null) return value;
  if (typeof value === "string") return m100Protocol.redactForUserDiagnostic(value, maxLength);
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => m100SanitizedDiagnosticObject(item, maxLength));
  if (typeof value === "object") {
    const output = {};
    for (const key of Object.keys(value)) {
      output[key] = m100SanitizedDiagnosticObject(value[key], key === "rawProviderMessage" ? 600 : maxLength);
    }
    return output;
  }
  return value;
}

function m100HttpFailure(error, options = {}) {
  const diagnostic = m100UserDiagnosticFromError(error, options);
  return {
    ok: false,
    error: diagnostic.message,
    code: diagnostic.code,
    phase: diagnostic.phase,
    requestId: diagnostic.requestId || null,
    actionId: diagnostic.actionId || null,
    executionId: diagnostic.executionId || null,
    commandId: diagnostic.commandId || null,
    lifecycleState: diagnostic.lifecycleState || null,
    line: error && error.line || null,
    rawPreview: Object.prototype.hasOwnProperty.call(diagnostic, "rawPreview") ? diagnostic.rawPreview : null,
    readiness: m100SanitizedDiagnosticObject(error && error.readiness || null),
    providerError: m100SanitizedProviderError(error && error.providerError),
    diagnostic,
    m100Message: m100Protocol.createErrorEnvelope({
      requestId: diagnostic.requestId || "",
      actionId: diagnostic.actionId,
      executionId: diagnostic.executionId,
      phase: diagnostic.phase,
      code: diagnostic.code,
      error: diagnostic.message,
      rawPreview: diagnostic.rawPreview,
      logs: [
        {
          phase: diagnostic.phase,
          level: "error",
          message: diagnostic.message,
          logRef: diagnostic.logRef
        }
      ]
    })
  };
}

function m100StoredProposalCopy(proposal) {
  const copy = JSON.parse(JSON.stringify(proposal || {}));
  if (copy.confirmation) {
    delete copy.confirmation.confirmationToken;
  }
  return copy;
}

function m100ProposalExpiresAtMs(record) {
  return Date.parse(record && record.proposalExpiresAt || "");
}

function m100ActionProposalIsExpired(record, now = Date.now()) {
  const expiresAtMs = m100ProposalExpiresAtMs(record);
  return Number.isFinite(expiresAtMs) && expiresAtMs <= now;
}

function m100ActionRecordState(record) {
  if (!record) return "missing";
  if (record.cancelledAt) return "cancelled";
  if (record.executionState) return record.executionState;
  return record.confirmedAt ? "confirmed" : "pending";
}

function storeM100ActionProposal(proposal, payload) {
  const validation = m100Protocol.validateActionProposalEnvelope(proposal);
  if (!validation.ok) {
    recordEvent("m100_action_proposal_rejected", {
      actionId: proposal && proposal.actionId || null,
      errors: validation.errors
    });
    return null;
  }
  pruneM100ActionProposalStore();
  const confirmation = proposal.confirmation || {};
  const risk = proposal.risk || {};
  const record = {
    requestId: proposal.requestId,
    actionId: proposal.actionId,
    payloadRef: proposal.action.payloadRef,
    payloadHash: proposal.action.payloadHash,
    previewHash: proposal.action.previewHash,
    riskLevel: risk.level,
    riskPolicyVersion: confirmation.riskPolicyVersion,
    proposalExpiresAt: confirmation.proposalExpiresAt,
    confirmationTokenHash: m100Protocol.hashConfirmationToken(confirmation.confirmationToken),
    confirmedAt: null,
    confirmedBySurface: null,
    confirmedBySession: null,
    confirmationSurface: confirmation.surface || "cep-panel",
    confirmationSessionId: confirmation.sessionId || "",
    executionState: "pending",
    executionId: null,
    cancelledAt: null,
    proposal: m100StoredProposalCopy(proposal),
    payload,
    createdAt: new Date().toISOString()
  };
  m100ActionProposalStore.set(record.actionId, record);
  m100ActionProposalStore.set(record.payloadRef, record);
  recordEvent("m100_action_proposal_created", {
    requestId: record.requestId,
    actionId: record.actionId,
    payloadRef: record.payloadRef,
    riskLevel: record.riskLevel,
    proposalExpiresAt: record.proposalExpiresAt,
    confirmationSurface: record.confirmationSurface,
    confirmationSessionId: record.confirmationSessionId || null
  });
  return proposal;
}

function createM100AgentPlanProposal(planResult, options = {}) {
  if (!planResult || !planResult.plan || !planResult.planValidation || planResult.planValidation.ok !== true) {
    return null;
  }
  const payload = {
    kind: "agent_plan",
    requestId: planResult.requestId || null,
    plan: planResult.plan,
    userPrompt: planResult.userPrompt || null,
    planner: {
      agentId: planResult.agentId || null,
      model: planResult.model || null,
      agentMode: planResult.agentMode || null
    }
  };
  const preview = m100PreviewForAgentPlan(planResult.plan, planResult.planValidation);
  const proposal = m100Protocol.createActionProposalEnvelope({
    requestId: planResult.requestId,
    summary: planResult.plan.summary || "Validated AE Agent plan",
    details: "Backend-created M100 proposal for the validated Agent plan.",
    risk: m100RiskForAgentPlan(planResult.plan, planResult.planValidation),
    action: {
      kind: "ae_tool",
      toolName: "run_ai_agent_plan"
    },
    payload,
    preview,
    ttlMs: options.ttlMs || planResult.m100ProposalTtlMs,
    confirmationSurface: options.confirmationSurface || planResult.m100ConfirmationSurface || "cep-panel",
    confirmationSessionId: options.confirmationSessionId || planResult.m100ConfirmationSessionId || "",
    logs: [
      {
        phase: "protocol_validation",
        level: "info",
        message: "Backend created a canonical M100 action proposal from a validated Agent plan."
      }
    ]
  });
  return storeM100ActionProposal(proposal, payload);
}

function createM100AgentPlanProposalFromRequest(body) {
  const args = body || {};
  const plan = args.plan || args;
  const requestId = optionalString(args, "requestId", "") || crypto.randomUUID();
  const prepared = validateAgentPlanWithRepair(plan, requestId, {
    solutionHints: args.solutionHints || args.planSolutionHints || null,
    projectIntentMemory: args.projectIntentMemory || args.planProjectIntentMemory || null
  }, {
    repairPlan: args.repairPlan
  });
  const validation = prepared.validation;
  if (!validation || validation.ok !== true) {
    throw m100ProtocolError("m100_agent_plan_not_valid", "Agent plan must pass backend validation before an M100 action proposal can be created.", {
      validation
    });
  }
  const ttlMs = hasArg(args, "ttlMs") ? optionalNumber(args, "ttlMs", m100Protocol.M100_ACTION_PROPOSAL_TTL_MS) : undefined;
  const planResult = {
    requestId,
    plan: prepared.plan,
    planValidation: validation,
    m100ProposalTtlMs: ttlMs,
    m100ConfirmationSurface: optionalString(args, "m100ConfirmationSurface", optionalString(args, "confirmationSurface", optionalString(args, "confirmedBySurface", "cep-panel"))),
    m100ConfirmationSessionId: optionalString(args, "m100ConfirmationSessionId", optionalString(args, "confirmationSessionId", optionalString(args, "confirmedBySession", "")))
  };
  const proposal = createM100AgentPlanProposal(planResult);
  if (!proposal) {
    throw m100ProtocolError("m100_action_proposal_create_failed", "Backend could not create an M100 action proposal for this plan.");
  }
  return {
    proposal,
    validation,
    planRepair: prepared.repair || null,
    repairedPlan: prepared.repair && prepared.repair.applied ? prepared.plan : null,
    plan: prepared.plan
  };
}

function m100PlanRunLookupKey(options) {
  const action = options && options.action && typeof options.action === "object" ? options.action : {};
  return {
    actionId: String(options && (options.actionId || options.m100ActionId) || action.actionId || "").trim(),
    payloadRef: String(options && (options.payloadRef || options.m100PayloadRef) || action.payloadRef || "").trim(),
    payloadHash: String(options && options.payloadHash || action.payloadHash || "").trim(),
    previewHash: String(options && options.previewHash || action.previewHash || "").trim(),
    riskLevel: String(options && options.riskLevel || action.riskLevel || "").trim(),
    riskPolicyVersion: String(options && options.riskPolicyVersion || action.riskPolicyVersion || "").trim(),
    confirmationToken: String(options && (options.confirmationToken || options.m100ConfirmationToken) || "").trim(),
    confirmedBySurface: String(options && (options.confirmedBySurface || options.confirmationSurface) || "").trim(),
    confirmedBySession: String(options && (options.confirmedBySession || options.confirmationSessionId) || "").trim()
  };
}

function resolveM100PlanRunOptions(options) {
  const keys = m100PlanRunLookupKey(options);
  if (!keys.actionId && !keys.payloadRef) return options || {};
  pruneM100ActionProposalStore();
  const record = m100ActionProposalStore.get(keys.payloadRef) || m100ActionProposalStore.get(keys.actionId);
  if (!record || record.payload && record.payload.kind !== "agent_plan") {
    throw m100ProtocolError("m100_action_proposal_not_found", "M100 action proposal was not found. Create a fresh Agent proposal before running.");
  }
  if (keys.actionId && keys.actionId !== record.actionId) {
    throw m100ProtocolError("m100_action_id_mismatch", "M100 actionId does not match the stored proposal.");
  }
  if (keys.payloadRef && keys.payloadRef !== record.payloadRef) {
    throw m100ProtocolError("m100_payload_ref_mismatch", "M100 payloadRef does not match the stored proposal.");
  }
  if (keys.payloadHash && keys.payloadHash !== record.payloadHash) {
    throw m100ProtocolError("m100_payload_hash_mismatch", "M100 payloadHash does not match the stored proposal.");
  }
  if (keys.previewHash && keys.previewHash !== record.previewHash) {
    throw m100ProtocolError("m100_preview_hash_mismatch", "M100 previewHash does not match the stored proposal.");
  }
  if (m100ActionProposalIsExpired(record)) {
    record.executionState = "expired";
    throw m100ProtocolError("m100_action_proposal_expired", "M100 action proposal expired. Create a fresh Agent proposal before running.", {
      actionId: record.actionId,
      proposalExpiresAt: record.proposalExpiresAt
    });
  }
  return {
    ...(options || {}),
    plan: record.payload.plan,
    userPrompt: record.payload.userPrompt || optionalString(options || {}, "userPrompt", ""),
    planner: record.payload.planner || null,
    requestId: record.requestId,
    _m100ActionProposal: record.proposal,
    _m100ActionRecord: record,
    _m100PayloadRef: record.payloadRef
  };
}

function m100PlanRequiresConfirmation(validation) {
  if (!validation) return false;
  if (Number(validation.mutatingCount || 0) > 0) return true;
  if (rawExtendscriptStepCount(validation) > 0) return true;
  const steps = Array.isArray(validation.steps) ? validation.steps : [];
  return steps.some((step) => step && M100_DESTRUCTIVE_TOOL_NAMES.has(String(step.tool || "")));
}

function confirmM100ActionProposal(record, options, run) {
  const keys = m100PlanRunLookupKey(options || {});
  if (!record) {
    throw m100ProtocolError("m100_action_proposal_not_found", "M100 action proposal was not found. Create a fresh Agent proposal before running.");
  }
  if (record.executionState === "cancelled" || record.cancelledAt) {
    throw m100ProtocolError("m100_action_proposal_cancelled", "M100 action proposal was already cancelled.");
  }
  if (record.confirmedAt || record.executionState === "confirmed" || record.executionState === "executing" || record.executionState === "completed" || record.executionState === "failed") {
    throw m100ProtocolError("m100_confirmation_replayed", "M100 confirmation token was already used.", {
      actionId: record.actionId,
      state: m100ActionRecordState(record)
    });
  }
  if (m100ActionProposalIsExpired(record)) {
    record.executionState = "expired";
    throw m100ProtocolError("m100_action_proposal_expired", "M100 action proposal expired. Create a fresh Agent proposal before running.", {
      actionId: record.actionId,
      proposalExpiresAt: record.proposalExpiresAt
    });
  }
  if (record.riskPolicyVersion !== M100_RISK_POLICY_VERSION) {
    throw m100ProtocolError("m100_risk_policy_changed", "M100 risk policy changed after this proposal was created. Create a fresh Agent proposal before running.", {
      expectedRiskPolicyVersion: record.riskPolicyVersion,
      currentRiskPolicyVersion: M100_RISK_POLICY_VERSION
    });
  }
  if (!keys.payloadHash || keys.payloadHash !== record.payloadHash) {
    throw m100ProtocolError("m100_payload_hash_mismatch", "M100 payloadHash does not match the stored proposal.");
  }
  if (!keys.previewHash || keys.previewHash !== record.previewHash) {
    throw m100ProtocolError("m100_preview_hash_mismatch", "M100 previewHash does not match the stored proposal.");
  }
  if (!keys.riskLevel || keys.riskLevel !== record.riskLevel) {
    throw m100ProtocolError("m100_risk_level_mismatch", "M100 risk level does not match the stored proposal.", {
      expectedRiskLevel: record.riskLevel,
      receivedRiskLevel: keys.riskLevel || null
    });
  }
  if (!keys.riskPolicyVersion || keys.riskPolicyVersion !== record.riskPolicyVersion) {
    throw m100ProtocolError("m100_risk_policy_mismatch", "M100 risk policy version does not match the stored proposal.", {
      expectedRiskPolicyVersion: record.riskPolicyVersion,
      receivedRiskPolicyVersion: keys.riskPolicyVersion || null
    });
  }
  if (!keys.confirmationToken || m100Protocol.hashConfirmationToken(keys.confirmationToken) !== record.confirmationTokenHash) {
    throw m100ProtocolError("m100_confirmation_token_mismatch", "M100 confirmation token does not match the stored proposal.");
  }
  if (!keys.confirmedBySurface || keys.confirmedBySurface !== record.confirmationSurface) {
    throw m100ProtocolError("m100_confirmation_surface_mismatch", "M100 confirmation surface does not match the stored proposal.", {
      expectedSurface: record.confirmationSurface,
      receivedSurface: keys.confirmedBySurface || null
    });
  }
  if (record.confirmationSessionId && keys.confirmedBySession !== record.confirmationSessionId) {
    throw m100ProtocolError("m100_confirmation_session_mismatch", "M100 confirmation session does not match the stored proposal.", {
      expectedSession: record.confirmationSessionId,
      receivedSession: keys.confirmedBySession || null
    });
  }

  record.confirmedAt = new Date().toISOString();
  record.confirmedBySurface = keys.confirmedBySurface;
  record.confirmedBySession = keys.confirmedBySession || "";
  record.executionState = "confirmed";
  record.executionId = run && run.id || null;
  recordEvent("m100_action_proposal_confirmed", {
    requestId: record.requestId,
    actionId: record.actionId,
    executionId: record.executionId,
    confirmedBySurface: record.confirmedBySurface,
    confirmedBySession: record.confirmedBySession || null
  });
  return record;
}

function m100RunFieldsForProposal(proposal, includeConfirmation) {
  if (!proposal || !proposal.action || !proposal.confirmation || !proposal.risk) return {};
  const fields = {
    actionId: proposal.actionId,
    payloadRef: proposal.action.payloadRef,
    payloadHash: proposal.action.payloadHash,
    previewHash: proposal.action.previewHash,
    riskLevel: proposal.risk.level,
    riskPolicyVersion: proposal.confirmation.riskPolicyVersion,
    requestId: proposal.requestId
  };
  if (includeConfirmation) {
    fields.confirmationToken = proposal.confirmation.confirmationToken;
    fields.confirmedBySurface = proposal.confirmation.surface || "cep-panel";
    fields.confirmedBySession = proposal.confirmation.sessionId || "";
  }
  return fields;
}

function aeLiteral(value) {
  return JSON.stringify(value)
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function hasArg(args, name) {
  return Object.prototype.hasOwnProperty.call(args, name) && args[name] !== undefined && args[name] !== null && args[name] !== "";
}

function hasRequiredPlanArg(toolName, args, name) {
  if ((toolName === "add_layer_marker" || toolName === "add_comp_marker") && name === "comment") {
    return Object.prototype.hasOwnProperty.call(args, name) && args[name] !== undefined && args[name] !== null;
  }
  return hasArg(args, name);
}

function optionalNumber(args, name, fallback) {
  if (!hasArg(args, name)) return fallback;
  const value = Number(args[name]);
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be a finite number.`);
  }
  return value;
}

function requiredPositiveInteger(args, name) {
  const value = Number(args[name]);
  if (!Number.isFinite(value) || value < 1) {
    throw new Error(`${name} must be a positive 1-based integer.`);
  }
  return Math.floor(value);
}

function requiredPositiveIntegerList(args, name) {
  let raw = args[name];
  if (typeof raw === "string" && raw.trim().startsWith("[")) {
    raw = JSON.parse(raw);
  }
  const values = Array.isArray(raw) ? raw : [raw];
  if (!values.length) throw new Error(`${name} must include at least one positive 1-based integer.`);

  const result = [];
  const seen = new Set();
  for (let index = 0; index < values.length; index += 1) {
    const value = Number(values[index]);
    if (!Number.isFinite(value) || value < 1) {
      throw new Error(`${name} must contain only positive 1-based integers.`);
    }
    const normalized = Math.floor(value);
    if (!seen.has(normalized)) {
      seen.add(normalized);
      result.push(normalized);
    }
  }
  return result;
}

function requiredExplicitPositiveIntegerList(args, name) {
  let raw = args[name];
  if (typeof raw === "string" && raw.trim().startsWith("[")) {
    raw = JSON.parse(raw);
  }
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error(`${name} must be a non-empty array of positive 1-based integers.`);
  }

  const result = [];
  const seen = new Set();
  for (let index = 0; index < raw.length; index += 1) {
    const value = Number(raw[index]);
    if (!Number.isInteger(value) || value < 1) {
      throw new Error(`${name} must contain only positive 1-based integers.`);
    }
    if (seen.has(value)) {
      throw new Error(`${name} must not contain duplicate layer indexes.`);
    }
    seen.add(value);
    result.push(value);
  }
  return result;
}

function optionalPositiveInteger(args, name) {
  if (!hasArg(args, name)) return null;
  return requiredPositiveInteger(args, name);
}

function optionalPositiveIntegerList(args, name) {
  if (!hasArg(args, name)) return null;
  return requiredPositiveIntegerList(args, name);
}

function optionalString(args, name, fallback) {
  if (!hasArg(args, name)) return fallback;
  return String(args[name]);
}

function optionalBoolean(args, name, fallback) {
  if (!hasArg(args, name)) return fallback;
  const value = args[name];
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "off"].includes(normalized)) return false;
  }
  throw new Error(`${name} must be a boolean.`);
}

function normalizePuppetPinType(value, fieldName = "pinType") {
  if (typeof value === "number") {
    if (value === 1 || value === 4) return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "1" || normalized === "position") return 1;
    if (normalized === "4" || normalized === "advanced") return 4;
  }
  throw new Error(`${fieldName} must be 1/position or 4/advanced.`);
}

function parseArrayArg(value, name) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    if (trimmed[0] === "[") {
      const parsed = JSON.parse(trimmed);
      if (!Array.isArray(parsed)) throw new Error(`${name} must be an array.`);
      return parsed;
    }
    return trimmed.split(",").map((item) => Number(item.trim()));
  }
  throw new Error(`${name} must be an array.`);
}

function optionalNumberArray(args, name, fallback, minLength, maxLength) {
  if (!hasArg(args, name)) return fallback;
  const values = parseArrayArg(args[name], name).map((value) => Number(value));
  if (values.some((value) => !Number.isFinite(value))) {
    throw new Error(`${name} must contain only finite numbers.`);
  }
  if (minLength && values.length < minLength) {
    throw new Error(`${name} must have at least ${minLength} numbers.`);
  }
  if (maxLength && values.length > maxLength) {
    throw new Error(`${name} must have no more than ${maxLength} numbers.`);
  }
  return values;
}

function parsePointArrayValue(raw, name, minLength, maxLength) {
  if (typeof raw === "string") raw = JSON.parse(raw);
  if (!Array.isArray(raw)) throw new Error(`${name} must be an array of [x, y] points.`);
  if (minLength && raw.length < minLength) throw new Error(`${name} must include at least ${minLength} points.`);
  if (maxLength && raw.length > maxLength) throw new Error(`${name} must include no more than ${maxLength} points.`);
  return raw.map((point, index) => {
    if (!Array.isArray(point) || point.length < 2) {
      throw new Error(`${name}[${index}] must be an [x, y] point.`);
    }
    const x = Number(point[0]);
    const y = Number(point[1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new Error(`${name}[${index}] must contain finite coordinates.`);
    }
    return [x, y];
  });
}

function requiredPointArray(args, name, minLength, maxLength) {
  if (!hasArg(args, name)) throw new Error(`${name} is required.`);
  return parsePointArrayValue(args[name], name, minLength, maxLength);
}

function parsePathGeometryValue(value, name, minVertices, maxVertices) {
  const raw = typeof value === "string" ? JSON.parse(value) : value;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${name} must be an object with vertices, inTangents, outTangents, and closed.`);
  }

  const vertices = parsePointArrayValue(raw.vertices, `${name}.vertices`, minVertices, maxVertices);
  const inTangents = parsePointArrayValue(raw.inTangents, `${name}.inTangents`, vertices.length, vertices.length);
  const outTangents = parsePointArrayValue(raw.outTangents, `${name}.outTangents`, vertices.length, vertices.length);
  if (typeof raw.closed !== "boolean") throw new Error(`${name}.closed must be a boolean.`);
  if (raw.closed && vertices.length < 3) throw new Error(`${name}.vertices must include at least 3 points when closed is true.`);

  const coordinateLimit = 1000000;
  const allPoints = vertices.concat(inTangents, outTangents);
  if (allPoints.some((point) => Math.abs(point[0]) > coordinateLimit || Math.abs(point[1]) > coordinateLimit)) {
    throw new Error(`${name} coordinates must be between -1000000 and 1000000.`);
  }

  return {
    vertices,
    inTangents,
    outTangents,
    closed: raw.closed
  };
}

function optionalPathGeometry(args, name, fallback) {
  if (!hasArg(args, name)) return fallback;
  return parsePathGeometryValue(args[name], name, 2, 80);
}

function pathGeometryFromTopLevelArgs(args) {
  if (!hasArg(args || {}, "vertices") && !hasArg(args || {}, "inTangents") && !hasArg(args || {}, "outTangents") && !hasArg(args || {}, "closed")) {
    return null;
  }
  return parsePathGeometryValue({
    vertices: args.vertices,
    inTangents: args.inTangents,
    outTangents: args.outTangents,
    closed: args.closed
  }, "geometry", 2, 80);
}

function requiredPathGeometryKeyframes(args, name) {
  const raw = args ? args[name] : null;
  const items = Array.isArray(raw)
    ? raw
    : typeof raw === "string" && raw.trim().startsWith("[")
      ? JSON.parse(raw)
      : null;
  if (!Array.isArray(items) || !items.length) throw new Error(`${name} must be a non-empty array.`);
  if (items.length > 80) throw new Error(`${name} must include no more than 80 keyframes.`);
  return items.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`${name}[${index}] must be an object.`);
    }
    const time = Number(item.time);
    if (!Number.isFinite(time) || time < 0) throw new Error(`${name}[${index}].time must be a non-negative finite number.`);
    return {
      time,
      geometry: parsePathGeometryValue(item.geometry || item, `${name}[${index}]`, 2, 80)
    };
  });
}

function sanitizeFilenamePart(value) {
  return String(value || "")
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

function timestampForFilename(date) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function timestampFromFilename(value) {
  const match = String(value || "").match(/^(\d{4}-\d{2}-\d{2}T\d{2})-(\d{2})-(\d{2})-(\d{3}Z)$/);
  return match ? `${match[1]}:${match[2]}:${match[3]}.${match[4]}` : null;
}

function parseCheckpointFilename(filename) {
  const parsed = path.parse(filename);
  if (parsed.ext.toLowerCase() !== ".aep") return null;

  const match = parsed.name.match(/^(.*)-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)$/);
  if (!match) return null;

  const prefix = match[1];
  const checkpointIndex = prefix.indexOf(CHECKPOINT_SUFFIX);
  if (checkpointIndex < 0) return null;

  const rawLabel = prefix.slice(checkpointIndex + CHECKPOINT_SUFFIX.length).replace(/^-/, "");
  return {
    projectName: prefix.slice(0, checkpointIndex) || null,
    label: rawLabel || null,
    createdAt: timestampFromFilename(match[2])
  };
}

async function getCurrentProjectSummary() {
  const projectInfo = await runExtendScriptBody(`
    var project = app.project;
    return {
      file: project && project.file ? project.file.fsName : null,
      name: project && project.file ? project.file.name : null,
      numItems: project ? project.numItems : 0,
      activeItemName: project && project.activeItem ? project.activeItem.name : null,
      activeItemType: project && project.activeItem ? project.activeItem.typeName : null
    };
  `);
  return projectInfo.result;
}

async function copySavedProjectFile(label, kind) {
  const safeLabel = sanitizeFilenamePart(label);
  const project = await getCurrentProjectSummary();
  const sourceFile = project.file;
  if (!sourceFile) {
    throw new Error("The current After Effects project has not been saved yet, so there is no .aep file to copy.");
  }
  if (!fs.existsSync(sourceFile)) {
    throw new Error(`Project file does not exist on disk: ${sourceFile}`);
  }

  ensureDir(BACKUP_DIR);
  const parsed = path.parse(sourceFile);
  const base = sanitizeFilenamePart(parsed.name) || "after-effects-project";
  const suffixParts = kind === "checkpoint" ? ["checkpoint"] : [];
  if (safeLabel) suffixParts.push(safeLabel);
  const suffix = suffixParts.length ? `-${suffixParts.join("-")}` : "";
  const destinationFile = path.join(BACKUP_DIR, `${base}${suffix}-${timestampForFilename(new Date())}${parsed.ext || ".aep"}`);

  fs.copyFileSync(sourceFile, destinationFile, fs.constants.COPYFILE_EXCL);
  const stat = fs.statSync(destinationFile);
  return {
    sourceFile,
    destinationFile,
    label: safeLabel || null,
    bytes: stat.size,
    createdAt: new Date().toISOString(),
    project
  };
}

function listProjectCheckpoints(args) {
  const limit = Math.max(1, Math.min(500, Math.floor(optionalNumber(args, "limit", 100))));
  ensureDir(BACKUP_DIR);

  return fs.readdirSync(BACKUP_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const parsed = parseCheckpointFilename(entry.name);
      if (!parsed) return null;

      const checkpointFile = path.join(BACKUP_DIR, entry.name);
      const stat = fs.statSync(checkpointFile);
      return {
        checkpointFile,
        filename: entry.name,
        label: parsed.label,
        projectName: parsed.projectName,
        bytes: stat.size,
        createdAt: parsed.createdAt || stat.birthtime.toISOString(),
        modifiedAt: stat.mtime.toISOString()
      };
    })
    .filter(Boolean)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, limit);
}

function checkpointDetails(checkpointFile) {
  const stat = fs.statSync(checkpointFile);
  const parsed = parseCheckpointFilename(path.basename(checkpointFile));
  return {
    checkpointFile,
    filename: path.basename(checkpointFile),
    label: parsed ? parsed.label : null,
    projectName: parsed ? parsed.projectName : null,
    bytes: stat.size,
    createdAt: parsed && parsed.createdAt ? parsed.createdAt : stat.birthtime.toISOString(),
    modifiedAt: stat.mtime.toISOString(),
    isCheckpoint: Boolean(parsed)
  };
}

function resolveCheckpointFile(checkpointFile, options) {
  const requireCheckpointName = !options || options.requireCheckpointName !== false;
  const requested = String(checkpointFile || "").trim();
  if (!requested) throw new Error("checkpointFile is required.");

  const resolvedPath = path.resolve(BACKUP_DIR, requested);
  if (!isPathInside(BACKUP_DIR, resolvedPath)) {
    throw new Error("checkpointFile must resolve inside the bridge backups folder.");
  }
  if (path.extname(resolvedPath).toLowerCase() !== ".aep") {
    throw new Error("checkpointFile must point to a .aep file.");
  }
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Checkpoint file does not exist: ${resolvedPath}`);
  }
  if (requireCheckpointName && !parseCheckpointFilename(path.basename(resolvedPath))) {
    throw new Error("checkpointFile must be a checkpoint created by checkpoint_project or an opt-in mutating tool checkpoint.");
  }

  return resolvedPath;
}

async function maybeCreateMutationCheckpoint(args, toolName) {
  if (!MUTATING_TOOL_NAMES.has(toolName)) return null;

  const label = optionalString(args, "checkpointLabel", "");
  const autoCheckpoint = optionalBoolean(args, "autoCheckpoint", false);
  if (!label && !autoCheckpoint) return null;

  const checkpointLabel = label || `before-${toolName}`;
  const copied = await copySavedProjectFile(checkpointLabel, "checkpoint");
  const checkpoint = {
    label: copied.label,
    sourceFile: copied.sourceFile,
    checkpointFile: copied.destinationFile,
    bytes: copied.bytes,
    createdAt: copied.createdAt,
    project: copied.project,
    triggeredBy: toolName
  };
  recordEvent("project_mutation_checkpoint_created", checkpoint);
  return checkpoint;
}

function compactCheckpoint(checkpoint) {
  if (!checkpoint) return null;
  return {
    label: checkpoint.label || null,
    checkpointFile: checkpoint.checkpointFile || null,
    bytes: checkpoint.bytes || null,
    createdAt: checkpoint.createdAt || null
  };
}

function inferMutationTarget(toolName, args, payload) {
  const target = { tool: toolName };
  const request = {};
  for (const key of ["compItemIndex", "compName", "layerIndex", "layerIndices", "layerName", "sourceName", "expectedLayerName", "expectedLayerNames", "comment", "label", "locked", "maskIndex", "expectedMaskName", "operation", "maskMode", "targetTime", "time", "frame", "frameRate", "expectedCurrentTime", "clampToDuration", "align", "start", "duration", "startTime", "inPoint", "outPoint", "gap", "overlap", "order", "itemIndex", "itemName", "itemIndices", "expectedItemNames", "itemType", "sourceItemIndex", "sourceItemName", "sourceCompItemIndex", "sourceCompName", "nameSuffix", "effect", "effectIndex", "effectName", "effectMatchName", "property", "propertyPath", "name", "namePrefix", "newCompName", "mode", "shape", "allowEmptyName", "renderQueueItemIndex", "outputPath", "outputFileName"]) {
    if (hasArg(args || {}, key)) request[key] = args[key];
  }
  if (Object.keys(request).length) target.request = request;

  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    if (payload.comp) target.comp = payload.comp;
    if (payload.layer) target.layer = payload.layer;
    if (payload.layers) target.layers = payload.layers;
    if (payload.effect) target.effect = payload.effect;
    if (payload.property) target.property = payload.property;
    if (payload.item) target.item = payload.item;
    if (hasArg(payload, "itemIndex") || hasArg(payload, "name") || hasArg(payload, "typeName")) {
      target.item = {
        itemIndex: payload.itemIndex || null,
        name: payload.name || null,
        typeName: payload.typeName || null
      };
    }
    if (payload.checkpointFile) target.checkpointFile = payload.checkpointFile;
    if (payload.backupFile) target.backupFile = payload.backupFile;
    if (payload.sourceFile) target.sourceFile = payload.sourceFile;
    if (payload.sourceItem) target.sourceItem = payload.sourceItem;
    if (payload.originalComp) target.originalComp = payload.originalComp;
    if (payload.duplicateComp) target.duplicateComp = payload.duplicateComp;
    if (payload.duplicatedItems) target.duplicatedItems = payload.duplicatedItems;
    if (payload.renderQueueItem) target.renderQueueItem = payload.renderQueueItem;
    if (payload.renderQueueItems) target.renderQueueItems = payload.renderQueueItems;
    if (payload.file) target.file = payload.file;
    if (payload.renamed) target.renamed = payload.renamed;
    if (payload.split) target.split = payload.split;
    if (payload.namePrefix) target.namePrefix = payload.namePrefix;
    if (Array.isArray(payload.removed)) target.removed = payload.removed;
  }

  return target;
}

function mutationUndoHint(toolName, checkpoint) {
  if (checkpoint) return "A checkpoint was created before this operation; use restore_project_checkpoint for a safe manual restore path.";
  if (toolName === "delete_project_checkpoint") return "Deleted checkpoint files cannot be restored by the bridge.";
  if (toolName === "checkpoint_project") return "Delete the checkpoint with delete_project_checkpoint if it is no longer needed.";
  return "Use After Effects Undo for the last operation when applicable, or create a checkpoint before risky edits.";
}

function buildMutationSummary(toolName, args, payload, checkpoint) {
  const effectiveCheckpoint = checkpoint || (payload && typeof payload === "object" ? payload.checkpoint : null);
  let changed = true;
  if (payload && typeof payload === "object") {
    if (typeof payload.removedCount === "number") changed = payload.removedCount > 0;
    if (typeof payload.deleted === "boolean") changed = payload.deleted;
  }

  return {
    tool: toolName,
    changed,
    target: inferMutationTarget(toolName, args || {}, payload),
    checkpoint: compactCheckpoint(effectiveCheckpoint),
    undoHint: mutationUndoHint(toolName, effectiveCheckpoint)
  };
}

function withMutationMetadata(payload, toolName, args, checkpoint) {
  let result = payload;
  if (checkpoint) {
    if (result && typeof result === "object" && !Array.isArray(result)) {
      result = { ...result, checkpoint };
    } else {
      result = { result, checkpoint };
    }
  }

  if (!MUTATION_SUMMARY_TOOL_NAMES.has(toolName)) return result;

  if (result && typeof result === "object" && !Array.isArray(result)) {
    return {
      ...result,
      mutation: buildMutationSummary(toolName, args || {}, result, checkpoint)
    };
  }

  return {
    result,
    mutation: buildMutationSummary(toolName, args || {}, result, checkpoint)
  };
}

function attachMutationMetadataToToolResult(result, toolName, args, checkpoint) {
  if (!result || result.isError || !Array.isArray(result.content) || !result.content[0]) return result;
  if (!checkpoint && !MUTATION_SUMMARY_TOOL_NAMES.has(toolName)) return result;

  const content = result.content.slice();
  const first = { ...content[0] };
  first.text = JSON.stringify(withMutationMetadata(parseToolText(first.text), toolName, args || {}, checkpoint), null, 2);
  content[0] = first;
  return {
    ...result,
    content
  };
}

function attachPayloadMetadataToToolResult(result, key, metadata) {
  if (!result || !Array.isArray(result.content) || !result.content[0]) return result;
  const content = result.content.slice();
  const first = { ...content[0] };
  const payload = parseToolText(first.text);
  let nextPayload;
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    nextPayload = { ...payload, [key]: metadata };
  } else {
    nextPayload = { result: payload, [key]: metadata };
  }
  first.text = JSON.stringify(nextPayload, null, 2);
  content[0] = first;
  return {
    ...result,
    content
  };
}

function cloneToolResult(result) {
  if (!result) return result;
  return JSON.parse(JSON.stringify(result));
}

function stableForHash(value) {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map((item) => stableForHash(item));
  if (typeof value === "object") {
    const result = {};
    for (const key of Object.keys(value).sort()) {
      if ([
        "autoCheckpoint",
        "checkpointLabel",
        "idempotencyKey",
        "idempotencyScope",
        "verifyAfter"
      ].includes(key)) continue;
      result[key] = stableForHash(value[key]);
    }
    return result;
  }
  return value;
}

function hashStableValue(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(stableForHash(value)))
    .digest("hex");
}

function idempotencyContext(toolName, args) {
  if (!MUTATING_TOOL_NAMES.has(toolName)) return null;
  const key = optionalString(args || {}, "idempotencyKey", "").trim();
  if (!key) return null;
  const scope = optionalString(args || {}, "idempotencyScope", "default").trim() || "default";
  return {
    key,
    scope,
    tool: toolName,
    recordKey: `${scope}:${toolName}:${key}`,
    argsHash: hashStableValue(args || {})
  };
}

function loadIdempotencyRecords() {
  for (const event of tailJsonl(IDEMPOTENCY_LOG_FILE, 500)) {
    if (!event || event.type !== "stored" || !event.record || !event.record.recordKey) continue;
    idempotencyRecords.set(event.record.recordKey, event.record);
  }
}

function storeIdempotencyResult(context, eventId, result) {
  if (!context || !result || result.isError) return null;
  const record = {
    ...context,
    eventId,
    recordedAt: new Date().toISOString(),
    result: cloneToolResult(result)
  };
  idempotencyRecords.set(context.recordKey, record);
  appendJsonl(IDEMPOTENCY_LOG_FILE, {
    at: record.recordedAt,
    type: "stored",
    record
  });
  return record;
}

function replayIdempotencyResult(context, record) {
  return attachPayloadMetadataToToolResult(cloneToolResult(record.result), "idempotency", {
    key: context.key,
    scope: context.scope,
    replayed: true,
    firstEventId: record.eventId,
    recordedAt: record.recordedAt
  });
}

function attachStoredIdempotencyMetadata(result, context, record) {
  if (!record) return result;
  return attachPayloadMetadataToToolResult(result, "idempotency", {
    key: context.key,
    scope: context.scope,
    replayed: false,
    firstEventId: record.eventId,
    recordedAt: record.recordedAt
  });
}

function inferVerificationTarget(toolName, args, payload) {
  const target = {
    tool: toolName,
    compItemIndex: null,
    compName: "",
    layerIndex: null,
    layerName: "",
    itemIndex: null,
    itemName: ""
  };

  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    if (payload.comp) {
      target.compItemIndex = Number(payload.comp.itemIndex || payload.comp.index) || null;
      target.compName = payload.comp.name || "";
    }
    if (payload.layer) {
      target.layerIndex = Number(payload.layer.index) || null;
      target.layerName = payload.layer.name || "";
    }
    if (hasArg(payload, "itemIndex")) target.itemIndex = Number(payload.itemIndex) || null;
    if (hasArg(payload, "name")) {
      const payloadName = String(payload.name || "");
      target.itemName = payloadName;
      if ((toolName === "create_test_comp" || toolName === "create_comp") && !target.compName) target.compName = payloadName;
    }
    if (!target.compItemIndex && payload.item && hasArg(payload.item, "itemIndex")) {
      target.compItemIndex = Number(payload.item.itemIndex) || null;
    }
    if (!target.compName && payload.item && payload.item.name) target.compName = payload.item.name;
    if (!target.itemIndex && payload.item && hasArg(payload.item, "itemIndex")) {
      target.itemIndex = Number(payload.item.itemIndex) || null;
    }
    if (!target.itemName && payload.item && payload.item.name) target.itemName = payload.item.name;
    if (!target.itemIndex && payload.folder && hasArg(payload.folder, "itemIndex")) {
      target.itemIndex = Number(payload.folder.itemIndex) || null;
    }
    if (!target.itemName && payload.folder && payload.folder.name) target.itemName = payload.folder.name;
  }

  const rawArgs = args || {};
  if (!target.compItemIndex && hasArg(rawArgs, "compItemIndex")) target.compItemIndex = Number(rawArgs.compItemIndex) || null;
  if (!target.compName && hasArg(rawArgs, "compName")) target.compName = String(rawArgs.compName || "");
  if (!target.layerIndex && hasArg(rawArgs, "layerIndex")) target.layerIndex = Number(rawArgs.layerIndex) || null;
  if (!target.layerName && hasArg(rawArgs, "layerName")) target.layerName = String(rawArgs.layerName || "");
  if (hasArg(rawArgs, "name")) {
    const argName = String(rawArgs.name || "");
    if (toolName === "create_test_comp" || toolName === "create_comp") {
      if (!target.compName) target.compName = argName;
      if (!target.itemName) target.itemName = argName;
    } else if (toolName === "create_project_folder") {
      if (!target.itemName) target.itemName = argName;
    } else if (!target.layerName) {
      target.layerName = argName;
    }
  }
  if (!target.itemIndex && hasArg(rawArgs, "itemIndex")) target.itemIndex = Number(rawArgs.itemIndex) || null;
  if (!target.itemName && hasArg(rawArgs, "itemName")) target.itemName = String(rawArgs.itemName || "");

  return target;
}

async function verifyMutationResult(toolName, args, payload) {
  if (toolName === "export_path_points" || toolName === "save_comp_frame_png") {
    const file = payload && typeof payload === "object" && !Array.isArray(payload) ? payload.file || {} : {};
    const hashOk = typeof file.sha256 === "string" && /^[a-f0-9]{64}$/i.test(file.sha256);
    const byteLength = Number(file.byteLength || 0);
    const restoration = payload && typeof payload === "object" && !Array.isArray(payload)
      ? payload.resolutionFactor || {}
      : {};
    const restored = toolName === "save_comp_frame_png"
      ? restoration.restored === true
      : true;
    return {
      ok: hashOk && byteLength > 0 && restored,
      checkedAt: new Date().toISOString(),
      target: {
        tool: toolName,
        outputFileName: file.outputFileName || args && args.outputFileName || null,
        outputPath: file.outputPath || null
      },
      file: {
        byteLength,
        sha256: file.sha256 || null,
        existsAfter: file.existsAfter === true,
        deletedAfterReadBack: file.deletedAfterReadBack === true
      },
      resolutionFactor: toolName === "save_comp_frame_png" ? restoration : null,
      warnings: hashOk && byteLength > 0 && restored ? [] : ["Generated export file read-back did not include a valid sha256/byteLength or resolutionFactor restoration evidence."]
    };
  }

  const target = inferVerificationTarget(toolName, args || {}, payload);
  const response = await runExtendScriptBody(`
      var target = ${aeLiteral(target)};

      function __codexValue(prop) {
        try {
          if (!prop) return null;
          var value = prop.value;
          if (value instanceof Array) {
            var copy = [];
            for (var i = 0; i < value.length; i++) copy.push(value[i]);
            return copy;
          }
          return value;
        } catch (__valueError) {
          return null;
        }
      }

      function __codexLayerMarkerCount(layer) {
        try {
          var markerProp = layer.property("ADBE Marker");
          return markerProp ? markerProp.numKeys : 0;
        } catch (__markerCountError) {
          return 0;
        }
      }

      function __codexLayerInfo(layer) {
        if (!layer) return null;
        var transform = layer.property("ADBE Transform Group");
        var textGroup = null;
        var sourceText = null;
        var isTextLayer = false;
        var isShapeLayer = false;
        try { textGroup = layer.property("ADBE Text Properties"); } catch (__textGroupError) {}
        if (textGroup) {
          try { sourceText = textGroup.property("ADBE Text Document").value; } catch (__sourceTextError) {}
        }
        try { isTextLayer = layer instanceof TextLayer; } catch (__textLayerClassError) {}
        if (!isTextLayer && textGroup) isTextLayer = true;
        try { isShapeLayer = layer instanceof ShapeLayer; } catch (__shapeLayerClassError) {}
        if (!isShapeLayer) {
          try { isShapeLayer = layer.matchName === "ADBE Vector Layer" || !!layer.property("ADBE Root Vectors Group"); } catch (__shapeLayerFallbackError) {}
        }
        return {
          index: layer.index,
          id: layer.id || null,
          name: layer.name || "",
          matchName: layer.matchName || null,
          textLayer: isTextLayer,
          shapeLayer: isShapeLayer,
          layerKind: isTextLayer ? "text" : (isShapeLayer ? "shape" : null),
          enabled: !!layer.enabled,
          locked: !!layer.locked,
          startTime: layer.startTime,
          inPoint: layer.inPoint,
          outPoint: layer.outPoint,
          markerCount: __codexLayerMarkerCount(layer),
          transform: transform ? {
            position: __codexValue(transform.property("ADBE Position")),
            pointOfInterest: __codexValue(transform.property("ADBE Point of Interest")),
            scale: __codexValue(transform.property("ADBE Scale")),
            orientation: __codexValue(transform.property("ADBE Orientation")),
            anchorPoint: __codexValue(transform.property("ADBE Anchor Point")),
            opacity: __codexValue(transform.property("ADBE Opacity")),
            rotation: __codexValue(transform.property("ADBE Rotate Z"))
          } : null,
          text: sourceText ? {
            text: sourceText.text || "",
            font: sourceText.font || null,
            fontSize: sourceText.fontSize || null
          } : null
        };
      }

      function __codexCompInfo(comp) {
        if (!comp) return null;
        return {
          itemIndex: comp.itemIndex || null,
          id: comp.id || null,
          name: comp.name || "",
          typeName: comp.typeName || null,
          width: comp.width,
          height: comp.height,
          duration: comp.duration,
          frameRate: comp.frameRate,
          numLayers: comp.numLayers
        };
      }

      function __codexResolveComp() {
        var item = null;
        if (target.compItemIndex) {
          try { item = app.project.item(target.compItemIndex); } catch (__indexError) {}
          if (item instanceof CompItem) return item;
        }
        if (target.compName) {
          for (var i = 1; i <= app.project.numItems; i++) {
            item = app.project.item(i);
            if (item instanceof CompItem && item.name === target.compName) return item;
          }
        }
        if (target.itemIndex) {
          try { item = app.project.item(target.itemIndex); } catch (__itemIndexError) {}
          if (item instanceof CompItem) return item;
        }
        if (app.project.activeItem instanceof CompItem) return app.project.activeItem;
        return null;
      }

      var activeItem = app.project.activeItem;
      var project = {
        numItems: app.project.numItems,
        file: app.project.file ? app.project.file.fsName : null,
        activeItem: activeItem ? {
          itemIndex: activeItem.itemIndex || null,
          name: activeItem.name || "",
          typeName: activeItem.typeName || null
        } : null
      };

      var comp = __codexResolveComp();
      var targetLayer = null;
      var sameNameLayers = [];
      if (comp) {
        if (target.layerIndex) {
          try { targetLayer = comp.layer(target.layerIndex); } catch (__layerIndexError) {}
        }
        for (var layerIndex = 1; layerIndex <= comp.numLayers; layerIndex++) {
          var layer = comp.layer(layerIndex);
          if (!targetLayer && target.layerName && layer.name === target.layerName) targetLayer = layer;
          if (target.layerName && layer.name === target.layerName) sameNameLayers.push(__codexLayerInfo(layer));
        }
      }

      return {
        checkedAt: (new Date()).toUTCString(),
        project: project,
        target: target,
        comp: __codexCompInfo(comp),
        layer: __codexLayerInfo(targetLayer),
        sameNameLayerCount: sameNameLayers.length,
        sameNameLayers: sameNameLayers.slice(0, 25)
      };
  `, 8000);

  const verification = response.result || {};
  verification.ok = true;
  verification.warnings = [];
  if (verification.target && verification.target.layerName && !verification.layer) {
    verification.warnings.push(`Layer ${verification.target.layerName} was not found after ${toolName}.`);
  }
  if (verification.sameNameLayerCount > 1) {
    verification.warnings.push(`Found ${verification.sameNameLayerCount} layers named ${verification.target.layerName}.`);
  }
  return verification;
}

async function attachMutationVerificationToToolResult(result, toolName, args) {
  if (!MUTATING_TOOL_NAMES.has(toolName) || !result || result.isError) return result;
  if (optionalBoolean(args || {}, "verifyAfter", true) === false) return result;
  try {
    const payload = firstToolPayload(result);
    const verification = await verifyMutationResult(toolName, args || {}, payload);
    return attachPayloadMetadataToToolResult(result, "verification", verification);
  } catch (error) {
    return attachPayloadMetadataToToolResult(result, "verification", {
      ok: false,
      error: error.message || String(error),
      line: error.line || null
    });
  }
}

function isPathInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function resolveScriptFile(filePath) {
  const requestedPath = optionalString({ filePath }, "filePath", "");
  if (!requestedPath) {
    throw new Error("filePath is required.");
  }

  const resolvedPath = path.resolve(PROJECT_ROOT, requestedPath);
  if (!ALLOW_SCRIPT_FILES_OUTSIDE_PROJECT && !isPathInside(PROJECT_ROOT, resolvedPath)) {
    throw new Error("filePath must resolve inside the bridge project. Set AE_ALLOW_SCRIPT_FILES_OUTSIDE_PROJECT=1 to allow external files.");
  }

  const ext = path.extname(resolvedPath).toLowerCase();
  if (![".jsx", ".jsxinc", ".js", ".txt"].includes(ext)) {
    throw new Error("filePath must point to a .jsx, .jsxinc, .js, or .txt script file.");
  }
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Script file does not exist: ${resolvedPath}`);
  }
  const stat = fs.statSync(resolvedPath);
  if (!stat.isFile()) {
    throw new Error(`Script path is not a file: ${resolvedPath}`);
  }
  if (stat.size > 2 * 1024 * 1024) {
    throw new Error("Script file is too large. Keep files under 2MB for MCP execution.");
  }

  return { resolvedPath, stat };
}

function resolveExistingFile(filePath) {
  const requestedPath = optionalString({ filePath }, "filePath", "");
  if (!requestedPath) {
    throw new Error("filePath is required.");
  }

  const resolvedPath = path.resolve(PROJECT_ROOT, requestedPath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`File does not exist: ${resolvedPath}`);
  }
  const stat = fs.statSync(resolvedPath);
  if (!stat.isFile()) {
    throw new Error(`Path is not a file: ${resolvedPath}`);
  }
  return { resolvedPath, stat };
}

function resolveOutputFilePath(filePath) {
  const requestedPath = optionalString({ filePath }, "filePath", "");
  if (!requestedPath) {
    throw new Error("outputPath is required.");
  }
  return path.resolve(PROJECT_ROOT, requestedPath);
}

function resolveGeneratedExportFile(outputFileName) {
  const requestedName = optionalString({ outputFileName }, "outputFileName", "points.txt") || "points.txt";
  if (path.isAbsolute(requestedName) || requestedName.includes("/") || requestedName.includes("\\")) {
    throw new Error("outputFileName must be a simple generated .txt filename, not a path.");
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,95}\.txt$/i.test(requestedName)) {
    throw new Error("outputFileName must be 1-96 safe characters ending in .txt.");
  }

  const resolvedPath = path.resolve(GENERATED_EXPORT_DIR, requestedName);
  if (!isPathInside(GENERATED_EXPORT_DIR, resolvedPath)) {
    throw new Error("outputFileName must resolve inside the generated export folder.");
  }
  return { outputFileName: requestedName, resolvedPath };
}

function resolveGeneratedPngExportFile(outputFileName) {
  const requestedName = optionalString({ outputFileName }, "outputFileName", "frame.png") || "frame.png";
  if (path.isAbsolute(requestedName) || requestedName.includes("/") || requestedName.includes("\\")) {
    throw new Error("outputFileName must be a simple generated .png filename, not a path.");
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,95}\.png$/i.test(requestedName)) {
    throw new Error("outputFileName must be 1-96 safe characters ending in .png.");
  }

  const resolvedPath = path.resolve(GENERATED_EXPORT_DIR, requestedName);
  if (!isPathInside(GENERATED_EXPORT_DIR, resolvedPath)) {
    throw new Error("outputFileName must resolve inside the generated export folder.");
  }
  return { outputFileName: requestedName, resolvedPath };
}

function optionalResolutionFactor(args, name) {
  const values = optionalNumberArray(args || {}, name, null, 2, 2);
  if (!values) return null;
  return values.map((value) => {
    const normalized = Math.floor(value);
    if (!Number.isInteger(normalized) || normalized < 1 || normalized > 99) {
      throw new Error(`${name} values must be integers from 1 through 99.`);
    }
    return normalized;
  });
}

function pathPointsGeometryFromArgs(args) {
  if (hasArg(args || {}, "vertices")) return requiredPointArray(args, "vertices", 1, 80);
  if (hasArg(args || {}, "geometry")) return optionalPathGeometry(args, "geometry", null).vertices;
  throw new Error("vertices or geometry is required.");
}

function roundedCoordinate(value, decimalPlaces) {
  return Number(Number(value).toFixed(decimalPlaces));
}

function buildPathPointsExport(vertices, options) {
  const decimalPlaces = Math.max(0, Math.min(4, Math.floor(Number(options.decimalPlaces))));
  const points = vertices.map((point) => [
    roundedCoordinate(point[0], decimalPlaces),
    roundedCoordinate(point[1], decimalPlaces)
  ]);
  if (options.rotateFirstPointToEnd && points.length > 1) {
    points.push(points.shift());
  }
  const variableName = optionalString(options, "variableName", "points") || "points";
  if (!/^[A-Za-z_$][A-Za-z0-9_$]{0,63}$/.test(variableName)) {
    throw new Error("variableName must be a valid JavaScript identifier up to 64 characters.");
  }
  return {
    variableName,
    points,
    content: `var ${variableName} = ${JSON.stringify(points)};`
  };
}

function exportPathPointsFile(args) {
  const vertices = pathPointsGeometryFromArgs(args || {});
  const coordinateLimit = 1000000;
  if (vertices.some((point) => Math.abs(point[0]) > coordinateLimit || Math.abs(point[1]) > coordinateLimit)) {
    throw new Error("vertices values must be between -1000000 and 1000000.");
  }

  const decimalPlaces = Math.max(0, Math.min(4, Math.floor(optionalNumber(args || {}, "decimalPlaces", 2))));
  const rotateFirstPointToEnd = optionalBoolean(args || {}, "rotateFirstPointToEnd", true);
  const deleteAfterReadBack = optionalBoolean(args || {}, "deleteAfterReadBack", false);
  const { outputFileName, resolvedPath } = resolveGeneratedExportFile(optionalString(args || {}, "outputFileName", "points.txt"));
  const exportData = buildPathPointsExport(vertices, {
    decimalPlaces,
    rotateFirstPointToEnd,
    variableName: optionalString(args || {}, "variableName", "points")
  });

  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  fs.writeFileSync(resolvedPath, exportData.content, "utf8");
  const readBack = fs.readFileSync(resolvedPath, "utf8");
  const sha256 = crypto.createHash("sha256").update(readBack).digest("hex");
  let existsAfter = true;
  if (deleteAfterReadBack) {
    fs.unlinkSync(resolvedPath);
    existsAfter = fs.existsSync(resolvedPath);
  }

  return {
    outputFileName,
    outputPath: resolvedPath,
    generatedExportDir: GENERATED_EXPORT_DIR,
    decimalPlaces,
    rotateFirstPointToEnd,
    variableName: exportData.variableName,
    sourceVertexCount: vertices.length,
    pointCount: exportData.points.length,
    points: exportData.points,
    contentPreview: readBack.slice(0, 500),
    file: {
      outputFileName,
      outputPath: resolvedPath,
      byteLength: Buffer.byteLength(readBack, "utf8"),
      sha256,
      existsAfter,
      deletedAfterReadBack: deleteAfterReadBack
    }
  };
}

function normalizePropertyPathArg(args, name) {
  const value = args ? args[name] : null;
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value.trim().startsWith("[")) {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) throw new Error(`${name} must decode to an array.`);
    return parsed;
  }
  if (typeof value === "string" && value.trim()) {
    return value.split(".").map((part) => part.trim()).filter(Boolean);
  }
  throw new Error(`${name} must be an array, a property-name string, or a JSON-encoded array string.`);
}

function requiredKeyframeArray(args, name) {
  const value = args ? args[name] : null;
  const items = Array.isArray(value)
    ? value
    : typeof value === "string" && value.trim().startsWith("[")
      ? JSON.parse(value)
      : null;
  if (!Array.isArray(items) || !items.length) throw new Error(`${name} must be a non-empty array.`);
  return items.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`${name}[${index}] must be an object.`);
    }
    const time = Number(item.time);
    if (!Number.isFinite(time)) throw new Error(`${name}[${index}].time must be a finite number.`);
    if (!hasArg(item, "value")) throw new Error(`${name}[${index}].value is required.`);
    return {
      time,
      value: item.value
    };
  });
}

function getScriptLineContext(script, line, radius) {
  const lineNumber = Math.floor(Number(line));
  if (!Number.isFinite(lineNumber) || lineNumber < 1) return [];

  const lines = String(script || "").split(/\r\n|\r|\n/);
  const start = Math.max(1, lineNumber - (radius || 3));
  const end = Math.min(lines.length, lineNumber + (radius || 3));
  const context = [];

  for (let current = start; current <= end; current += 1) {
    context.push({
      line: current,
      text: lines[current - 1],
      errorLine: current === lineNumber
    });
  }

  return context;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 15 * 1024 * 1024) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function writeJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "content-type, x-ae-bridge-token",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
  });
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req) {
  const body = await readBody(req);
  if (!body.trim()) return {};
  return JSON.parse(body);
}

function getRequestToken(req, url) {
  return req.headers["x-ae-bridge-token"] || url.searchParams.get("token") || "";
}

function requireToken(req, res, url) {
  if (getRequestToken(req, url) !== TOKEN) {
    writeJson(res, 401, { ok: false, error: "Bad bridge token" });
    return false;
  }
  return true;
}

function countQueuedCommands(now) {
  expireQueuedCommands(now || Date.now(), "status");
  return pendingCommands.reduce((count, id) => {
    const command = inflightCommands.get(id);
    return command && command.state === "queued" ? count + 1 : count;
  }, 0);
}

function isoOrNull(value) {
  return value ? new Date(value).toISOString() : null;
}

function compactAeCommand(command, now) {
  const at = now || Date.now();
  return {
    id: command.id,
    state: command.state,
    lifecycleState: command.state,
    ageMs: at - command.createdAt,
    timeoutMs: command.timeoutMs,
    createdAt: isoOrNull(command.createdAt),
    expiresAt: isoOrNull(command.expiresAt),
    leasedAt: isoOrNull(command.leasedAt),
    submittedAt: isoOrNull(command.submittedAt),
    leaseOwner: command.leaseOwner || null,
    timedOutFrom: command.timedOutFrom || null,
    errorCode: command.errorCode || null,
    phase: command.phase || null
  };
}

function commandForPanel(command) {
  return {
    id: command.id,
    script: command.script,
    lifecycleState: command.state,
    leaseOwner: command.leaseOwner || null
  };
}

function removePendingCommand(id) {
  const index = pendingCommands.indexOf(id);
  if (index >= 0) pendingCommands.splice(index, 1);
}

function createCommandLifecycleError(command, code, message) {
  const error = new Error(message);
  error.code = code;
  error.commandId = command.id;
  error.lifecycleState = command.state;
  error.timedOutFrom = command.timedOutFrom || null;
  return error;
}

function createAeCommandError(command, code, phase, message, details) {
  const error = new Error(message);
  error.code = code;
  error.phase = phase;
  error.commandId = command ? command.id : null;
  error.lifecycleState = command ? command.state : null;
  if (details && details.line !== undefined && details.line !== null) error.line = details.line;
  if (details && Object.prototype.hasOwnProperty.call(details, "rawPreview")) {
    error.rawPreview = details.rawPreview;
  }
  return error;
}

function settleCommandFailure(command, code, message) {
  if (command.settled) return;
  command.settled = true;
  command.errorCode = code;
  command.reject(createCommandLifecycleError(command, code, message));
}

function retainCommandResult(id, payload, command) {
  completedResults.set(id, {
    id,
    ok: Boolean(payload.ok),
    result: payload.result,
    error: payload.error || null,
    code: payload.code || command.errorCode || null,
    phase: payload.phase || command.phase || null,
    rawPreview: Object.prototype.hasOwnProperty.call(payload, "rawPreview") ? payload.rawPreview : null,
    line: payload.line || null,
    lifecycleState: payload.lifecycleState || command.state || null,
    timedOutFrom: command.timedOutFrom || null,
    createdAt: command.createdAt,
    completedAt: Date.now(),
    command: compactAeCommand(command)
  });

  while (completedResults.size > 200) {
    const oldestId = completedResults.keys().next().value;
    completedResults.delete(oldestId);
  }
}

function retainStaleCommandResult(id, payload, retained) {
  const staleResult = {
    id,
    ok: Boolean(payload.ok),
    result: payload.result,
    error: payload.error || null,
    lifecycleState: "stale_result_ignored",
    ignoredAt: Date.now()
  };
  const nextRetained = Object.assign({}, retained, {
    staleResult
  });
  completedResults.set(id, nextRetained);
  return staleResult;
}

function removeWaitingPanel(waiter) {
  const index = waitingPanels.indexOf(waiter);
  if (index >= 0) waitingPanels.splice(index, 1);
  clearTimeout(waiter.timer);
}

function drainWaitingPanels() {
  expireQueuedCommands(Date.now(), "drain_waiting_panels");
  while (waitingPanels.length && pendingCommands.length) {
    const waiter = waitingPanels.shift();
    clearTimeout(waiter.timer);

    if (waiter.done || waiter.res.destroyed || waiter.res.writableEnded) {
      continue;
    }

    const command = leaseNextQueuedCommand(waiter.req, waiter.url);
    if (!command) {
      waiter.done = true;
      writeJson(waiter.res, 200, { ok: true, command: null });
      continue;
    }
    waiter.done = true;
    writeJson(waiter.res, 200, { ok: true, command });
  }
}

function enqueueAeCommand(script, timeoutMs) {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const createdAt = Date.now();
    const command = {
      id,
      script,
      state: "queued",
      resolve,
      reject,
      timeout: null,
      timeoutMs,
      createdAt,
      expiresAt: createdAt + timeoutMs,
      leasedAt: null,
      submittedAt: null,
      completedAt: null,
      leaseOwner: null,
      timedOutFrom: null,
      errorCode: null,
      phase: null,
      settled: false
    };
    command.timeout = setTimeout(() => {
      timeoutAeCommand(id);
    }, timeoutMs);

    inflightCommands.set(id, command);
    pendingCommands.push(id);
    recordEvent("ae_command_queued", {
      id,
      lifecycleState: command.state,
      timeoutMs,
      expiresAt: new Date(command.expiresAt).toISOString(),
      script
    });
    drainWaitingPanels();
  });
}

function expireQueuedCommands(now, reason) {
  const at = now || Date.now();
  for (const id of pendingCommands.slice()) {
    const command = inflightCommands.get(id);
    if (!command || command.state !== "queued") {
      removePendingCommand(id);
      continue;
    }
    if (at >= command.expiresAt) {
      expireQueuedCommand(command, reason || "timeout");
    }
  }
}

function expireQueuedCommand(command, reason) {
  if (!command || command.state !== "queued") return false;
  removePendingCommand(command.id);
  clearTimeout(command.timeout);
  command.state = "expired_before_delivery";
  command.completedAt = Date.now();
  inflightCommands.delete(command.id);
  const message = "After Effects command expired before delivery to the panel; it was not executed.";
  retainCommandResult(command.id, {
    ok: false,
    error: message,
    code: "expired_before_delivery",
    lifecycleState: command.state
  }, command);
  settleCommandFailure(command, "expired_before_delivery", message);
  recordEvent("ae_command_expired_before_delivery", {
    id: command.id,
    reason,
    ageMs: Date.now() - command.createdAt,
    timeoutMs: command.timeoutMs
  });
  return true;
}

function timeoutAeCommand(id) {
  const command = inflightCommands.get(id);
  if (!command) return;
  if (command.state === "queued") {
    expireQueuedCommand(command, "timeout");
    return;
  }
  const timedOutFrom = command.state;
  command.timedOutFrom = timedOutFrom;
  command.state = "timed_out_after_submit";
  command.completedAt = Date.now();
  command.errorCode = timedOutFrom === "submitted" ? "timed_out_after_submit" : "unknown_after_delivery";
  inflightCommands.delete(id);
  const message = timedOutFrom === "submitted"
    ? "After Effects command timed out after submit to evalScript; execution may still finish later and any late result will be ignored as stale."
    : "After Effects command timed out after delivery to the panel; execution state is unknown and any late result will be ignored as stale.";
  retainCommandResult(id, {
    ok: false,
    error: message,
    code: command.errorCode,
    lifecycleState: command.state
  }, command);
  settleCommandFailure(command, command.errorCode, message);
  recordEvent("ae_command_timeout_after_delivery", {
    id,
    timedOutFrom,
    lifecycleState: command.state,
    code: command.errorCode,
    ageMs: Date.now() - command.createdAt,
    leaseOwner: command.leaseOwner
  });
}

function panelLeaseOwner(req, url) {
  const requestHeaders = req && req.headers ? req.headers : {};
  const searchParams = url && url.searchParams ? url.searchParams : new URLSearchParams();
  const panelConnectionId = String(
    searchParams.get("panelConnectionId")
    || requestHeaders["x-ae-panel-connection-id"]
    || "unknown-panel"
  );
  const panelGeneration = String(
    searchParams.get("panelGeneration")
    || requestHeaders["x-ae-panel-generation"]
    || "unknown-generation"
  );
  return {
    panelConnectionId,
    panelGeneration,
    userAgent: requestHeaders["user-agent"] || null
  };
}

function leaseOwnerMatches(command, owner) {
  if (!command || !command.leaseOwner || !owner) return false;
  return command.leaseOwner.panelConnectionId === owner.panelConnectionId
    && command.leaseOwner.panelGeneration === owner.panelGeneration;
}

function findActiveEvalScriptCommandForOwner(owner) {
  if (!owner) return null;
  for (const command of inflightCommands.values()) {
    if ((command.state === "leased" || command.state === "submitted") && leaseOwnerMatches(command, owner)) {
      return command;
    }
  }
  return null;
}

function boundedAeRawPreview(value) {
  const text = value === null || value === undefined ? "" : String(value);
  if (text.length <= AE_RESULT_RAW_PREVIEW_MAX) return text;
  return `${text.slice(0, AE_RESULT_RAW_PREVIEW_MAX)}...<truncated>`;
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function parseStrictAeWrapperResult(command, raw) {
  const rawPreview = boundedAeRawPreview(raw);
  if (typeof raw !== "string" || !raw.trim()) {
    throw createAeCommandError(
      command,
      "ae_result_parse_failed",
      "ae_result_parse",
      "After Effects returned an empty command result.",
      { rawPreview }
    );
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw createAeCommandError(
      command,
      "ae_result_parse_failed",
      "ae_result_parse",
      `After Effects returned malformed command JSON: ${error.message}`,
      { rawPreview }
    );
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || typeof parsed.ok !== "boolean") {
    throw createAeCommandError(
      command,
      "ae_result_parse_failed",
      "ae_result_parse",
      "After Effects returned a command result that does not match the bridge wrapper.",
      { rawPreview }
    );
  }

  if (parsed.ok && !hasOwn(parsed, "result")) {
    throw createAeCommandError(
      command,
      "ae_result_parse_failed",
      "ae_result_parse",
      "After Effects returned a successful wrapper without a result field.",
      { rawPreview }
    );
  }

  if (!parsed.ok) {
    throw createAeCommandError(
      command,
      "ae_execution_failed",
      "ae_execution",
      parsed.error || "After Effects script failed.",
      {
        line: parsed.line,
        rawPreview
      }
    );
  }

  return parsed;
}

function leaseNextQueuedCommand(req, url) {
  expireQueuedCommands(Date.now(), "bridge_next");
  const leaseOwner = panelLeaseOwner(req, url);
  const activeCommand = findActiveEvalScriptCommandForOwner(leaseOwner);
  if (activeCommand) return null;

  while (pendingCommands.length) {
    const id = pendingCommands.shift();
    const command = inflightCommands.get(id);
    if (!command || command.state !== "queued") continue;
    if (Date.now() >= command.expiresAt) {
      expireQueuedCommand(command, "bridge_next");
      continue;
    }
    command.state = "leased";
    command.leasedAt = Date.now();
    command.leaseOwner = leaseOwner;
    recordEvent("ae_command_leased", {
      id: command.id,
      lifecycleState: command.state,
      ageMs: Date.now() - command.createdAt,
      leaseOwner: command.leaseOwner
    });
    return commandForPanel(command);
  }
  return null;
}

function wrapExtendScriptBody(body) {
  return `var __codexMcpBridgeResult = (function () {
  function __codexEscapeString(value) {
    return String(value)
      .replace(/\\\\/g, "\\\\\\\\")
      .replace(/"/g, "\\\\\\"")
      .replace(/\\r/g, "\\\\r")
      .replace(/\\n/g, "\\\\n")
      .replace(/\\t/g, "\\\\t");
  }

  function __codexStringify(value) {
    if (value === null || value === undefined) return "null";
    var valueType = typeof value;
    if (valueType === "string") return "\\"" + __codexEscapeString(value) + "\\"";
    if (valueType === "number") return isFinite(value) ? String(value) : "null";
    if (valueType === "boolean") return value ? "true" : "false";
    if (value instanceof Date) return "\\"" + __codexEscapeString(value.toString()) + "\\"";
    if (value instanceof Array) {
      var items = [];
      for (var i = 0; i < value.length; i++) {
        items.push(__codexStringify(value[i]));
      }
      return "[" + items.join(",") + "]";
    }
    if (valueType === "object") {
      var props = [];
      for (var key in value) {
        var include = true;
        try {
          include = value.hasOwnProperty ? value.hasOwnProperty(key) : true;
        } catch (__hasOwnError) {
          include = true;
        }
        if (!include) continue;
        var propType = typeof value[key];
        if (propType === "function" || propType === "undefined") continue;
        props.push("\\"" + __codexEscapeString(key) + "\\":" + __codexStringify(value[key]));
      }
      return "{" + props.join(",") + "}";
    }
    return "\\"" + __codexEscapeString(value) + "\\"";
  }

  try {
    var __result = (function () {
${body}
    })();
    if (__result === undefined) {
      return "{\\"ok\\":true,\\"result\\":null}";
    }
    return "{\\"ok\\":true,\\"result\\":" + __codexStringify(__result) + "}";
  } catch (__error) {
    var __line = __error && __error.line ? __error.line : null;
    return "{\\"ok\\":false,\\"error\\":" + __codexStringify(String(__error)) + ",\\"line\\":" + __codexStringify(__line) + "}";
  }
}());
__codexMcpBridgeResult;`;
}

const EXTENDSCRIPT_BODY_LINE_OFFSET = (() => {
  const marker = "__codex_mcp_bridge_body_marker__";
  const wrapped = wrapExtendScriptBody(marker);
  const markerIndex = wrapped.indexOf(marker);
  if (markerIndex < 0) return 0;
  return wrapped.slice(0, markerIndex).split(/\r\n|\r|\n/).length - 1;
})();

async function runExtendScriptBody(body, timeoutMs) {
  return enqueueAeCommand(wrapExtendScriptBody(body), timeoutMs || COMMAND_TIMEOUT_MS);
}

function exposedTools() {
  return tools.map((tool) => {
    if (!MUTATING_TOOL_NAMES.has(tool.name)) return tool;

    const inputSchema = tool.inputSchema || { type: "object", properties: {} };
    return {
      ...tool,
      inputSchema: {
        ...inputSchema,
        properties: {
          ...inputSchema.properties,
          ...MUTATION_CHECKPOINT_SCHEMA_PROPERTIES
        }
      }
    };
  });
}

function aiChatRequestSummary(args) {
  args = args || {};
  return {
    agentId: args.agentId || args.agent || args.provider || null,
    model: args.model || null,
    messageCount: Array.isArray(args.messages) ? args.messages.length : args.prompt || args.message ? 1 : 0
  };
}

function extractJsonObject(text) {
  const source = String(text || "").trim();
  if (!source) throw new Error("Agent returned an empty plan.");
  try {
    return JSON.parse(source);
  } catch (_error) {}

  const firstBrace = source.indexOf("{");
  const lastBrace = source.lastIndexOf("}");
  if (firstBrace < 0 || lastBrace <= firstBrace) {
    throw new Error("Agent response did not contain a JSON object.");
  }
  return JSON.parse(source.slice(firstBrace, lastBrace + 1));
}

function normalizeAgentPlan(rawText) {
  try {
    const plan = extractJsonObject(rawText);
    if (!plan || typeof plan !== "object" || Array.isArray(plan)) {
      throw new Error("Plan JSON must be an object.");
    }
    if (!Array.isArray(plan.steps)) plan.steps = [];
    return { ok: true, plan };
  } catch (error) {
    return {
      ok: false,
      error: error.message || String(error),
      rawText
    };
  }
}

function toolByName(toolName) {
  return tools.find((tool) => tool.name === toolName) || null;
}

function planStepToolName(step) {
  if (!step || typeof step !== "object") return "";
  return String(step.tool || step.mcpTool || step.name || "").trim().slice(0, 120);
}

function planStepArgs(step) {
  if (!step || typeof step !== "object") return {};
  const args = step.args || step.arguments || step.parameters || {};
  return args && typeof args === "object" && !Array.isArray(args) ? { ...args } : {};
}

function requiredSchemaFields(tool) {
  const required = tool && tool.inputSchema && Array.isArray(tool.inputSchema.required)
    ? tool.inputSchema.required
    : [];
  return required.filter(Boolean);
}

function formatTargetPart(label, value) {
  if (value === undefined || value === null || value === "") return "";
  if (Array.isArray(value)) {
    if (!value.length) return "";
    return `${label} ${value.join(",")}`;
  }
  return `${label} ${value}`;
}

function planStepTargetSummary(toolName, args) {
  args = args || {};
  const parts = [];
  const comp = formatTargetPart("comp", args.compName || (hasArg(args, "compItemIndex") ? `#${args.compItemIndex}` : ""));
  if (comp) parts.push(comp);
  if (hasArg(args, "layerIndices")) parts.push(formatTargetPart("layers", args.layerIndices));
  if (hasArg(args, "layerIndex")) parts.push(formatTargetPart("layer", args.layerIndex));
  if (hasArg(args, "itemIndices")) parts.push(formatTargetPart("items", args.itemIndices));
  if (hasArg(args, "itemIndex")) parts.push(formatTargetPart("item", `#${args.itemIndex}`));
  if (args.itemName) parts.push(formatTargetPart("item", args.itemName));
  if (toolName === "create_comp" && args.name) parts.push(formatTargetPart("comp", args.name));
  if (toolName === "create_project_folder" && args.name) parts.push(formatTargetPart("folder", args.name));
  if (hasArg(args, "folderItemIndex")) parts.push(formatTargetPart("folder", `#${args.folderItemIndex}`));
  if (args.folderName) parts.push(formatTargetPart("folder", args.folderName));
  if (hasArg(args, "targetFolderItemIndex")) parts.push(formatTargetPart("target folder", `#${args.targetFolderItemIndex}`));
  if (args.targetFolderName) parts.push(formatTargetPart("target folder", args.targetFolderName));
  if (args.targetRoot) parts.push(formatTargetPart("target folder", "project root"));
  if (hasArg(args, "parentFolderItemIndex")) parts.push(formatTargetPart("parent folder", `#${args.parentFolderItemIndex}`));
  if (args.parentFolderName) parts.push(formatTargetPart("parent folder", args.parentFolderName));
  if (hasArg(args, "sourceItemIndex")) parts.push(formatTargetPart("source", `#${args.sourceItemIndex}`));
  if (args.sourceItemName) parts.push(formatTargetPart("source", args.sourceItemName));
  if (hasArg(args, "sourceCompItemIndex")) parts.push(formatTargetPart("source comp", `#${args.sourceCompItemIndex}`));
  if (args.sourceCompName) parts.push(formatTargetPart("source comp", args.sourceCompName));
  if (args.property || args.propertyPath) parts.push(formatTargetPart("property", args.property || (Array.isArray(args.propertyPath) ? args.propertyPath.join(".") : args.propertyPath)));
  if (args.effect || args.effectName || args.effectMatchName) parts.push(formatTargetPart("effect", args.effect || args.effectName || args.effectMatchName));
  if (hasArg(args, "renderQueueItemIndex")) parts.push(formatTargetPart("render queue item", `#${args.renderQueueItemIndex}`));
  if (args.outputPath) parts.push(formatTargetPart("output", args.outputPath));

  if (!parts.length) {
    if ([
      "get_active_comp",
      "get_selected_layers",
      "get_selected_properties",
      "set_layer_time_range",
      "stagger_layers",
      "split_layers_at_time",
      "fit_layer_to_comp",
      "rename_layers"
    ].includes(toolName)) {
      return "active comp / selected layers";
    }
    if (toolName === "set_comp_work_area") return "active comp";
    if (toolName === "deep_duplicate_precomp_sources") return "active comp / selected precomp layer";
    if (toolName === "get_render_queue_status") return "render queue";
  }
  return parts.filter(Boolean).join("; ");
}

function knownToolNamesSummary(limit) {
  return PLANNING_TOOL_NAMES.slice(0, limit || 20).join(", ");
}

function validateAgentPlanObject(plan, requestId, context) {
  const validationId = requestId || crypto.randomUUID();
  const sourcePlan = plan && typeof plan === "object" && !Array.isArray(plan) ? plan : {};
  const steps = Array.isArray(sourcePlan.steps) ? sourcePlan.steps : [];
  const validatedSteps = [];
  const warnings = [];
  let mutatingCount = 0;
  let unknownToolCount = 0;
  let executableCount = 0;

  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index] && typeof steps[index] === "object" ? steps[index] : {};
    const toolName = planStepToolName(step);
    const tool = toolName ? toolByName(toolName) : null;
    const planningTool = toolName ? PLANNING_TOOL_NAMES.includes(toolName) : false;
    const mutating = toolName ? MUTATING_TOOL_NAMES.has(toolName) : false;
    const safeArgs = tool ? normalizePlanArgAliases(planStepArgs(step), tool) : planStepArgs(step);
    const resultBindings = step.resultBindings && typeof step.resultBindings === "object" && !Array.isArray(step.resultBindings)
      ? step.resultBindings
      : {};
    const missingRequired = [];
    const boundRequired = [];
    const autofixes = [];
    const stepWarnings = [];

    if (!toolName) {
      validatedSteps.push({
        index: index + 1,
        title: step.title || step.intent || "Untooled step",
        intent: step.intent || "",
        tool: null,
        valid: true,
        executable: false,
        mutatesProject: false,
        args: safeArgs,
        safeArgs,
        warnings: stepWarnings,
        autofixes,
        missingRequired
      });
      continue;
    }

    if (!tool) {
      unknownToolCount += 1;
      stepWarnings.push(`Unknown MCP tool: ${toolName}. Use a listed tool name such as ${knownToolNamesSummary(12)}.`);
    } else if (!planningTool) {
      stepWarnings.push(`${toolName} is not available for AI Agent plans. Use a tool from the planning catalog such as ${knownToolNamesSummary(12)}.`);
    } else {
      executableCount += 1;
      for (const field of requiredSchemaFields(tool)) {
        if (hasRequiredPlanArg(toolName, safeArgs, field)) continue;
        if (hasArg(resultBindings, field)) {
          boundRequired.push(field);
        } else {
          missingRequired.push(field);
        }
      }
      if (missingRequired.length) {
        stepWarnings.push(`Missing required fields for ${toolName}: ${missingRequired.join(", ")}.`);
      }
      if (boundRequired.length) {
        stepWarnings.push(`Runtime bindings must resolve before execution: ${boundRequired.join(", ")}.`);
      }
    }

    if (mutating) {
      mutatingCount += 1;
      const safetyAutofixes = [];
      if (safeArgs.verifyAfter !== true) {
        safeArgs.verifyAfter = true;
        autofixes.push("verifyAfter=true");
        safetyAutofixes.push("verifyAfter=true");
      }
      if (!safeArgs.idempotencyKey) {
        safeArgs.idempotencyKey = `ae-plan-${validationId}-step-${index + 1}-${toolName}`;
        autofixes.push("idempotencyKey");
        safetyAutofixes.push("idempotencyKey");
      }
      if (!safeArgs.idempotencyScope) {
        safeArgs.idempotencyScope = `ae-plan:${validationId}`;
        autofixes.push("idempotencyScope");
        safetyAutofixes.push("idempotencyScope");
      }
      if (safetyAutofixes.length) {
        stepWarnings.push(`Added mutation safety defaults: ${safetyAutofixes.join(", ")}.`);
      }
      if (toolName === "run_extendscript" || toolName === "run_extendscript_file") {
        stepWarnings.push("Raw ExtendScript is an escape hatch. Use a typed MCP tool whenever one fits the request.");
      }
    }

    validatedSteps.push({
      index: index + 1,
      title: step.title || step.intent || toolName,
      intent: step.intent || "",
      tool: toolName,
      valid: Boolean(tool) && planningTool && missingRequired.length === 0,
      executable: Boolean(tool) && planningTool && missingRequired.length === 0 && boundRequired.length === 0,
      requiresRuntimeBinding: boundRequired.length > 0,
      mutatesProject: mutating,
      targetSummary: planStepTargetSummary(toolName, safeArgs),
      args: planStepArgs(step),
      safeArgs,
      warnings: stepWarnings,
      autofixes,
      missingRequired,
      boundRequired,
      resultBindings
    });
  }

  if (mutatingCount > 1 && sourcePlan.requiresCheckpoint !== true) {
    warnings.push("Multiple mutating steps planned; set requiresCheckpoint=true or rely on the runner's protected edit session before execution.");
  }
  if (unknownToolCount) {
    warnings.push(`${unknownToolCount} planned step(s) reference unknown MCP tools.`);
  }
  if (!steps.length && !sourcePlan.clarifyingQuestion) {
    warnings.push("Plan has no steps and no clarifying question.");
  }
  if (executableCount <= 0) {
    warnings.push("Plan has no executable MCP tool steps.");
  }

  const invalidSteps = validatedSteps.filter((step) => !step.valid && step.tool);
  const validation = {
    ok: invalidSteps.length === 0 && unknownToolCount === 0 && executableCount > 0,
    validationId,
    stepCount: steps.length,
    executableCount,
    mutatingCount,
    unknownToolCount,
    invalidStepCount: invalidSteps.length,
    requiresCheckpoint: sourcePlan.requiresCheckpoint === true || mutatingCount > 1,
    warnings,
    steps: validatedSteps
  };
  validation.classification = classifyAgentPlan(sourcePlan, validation, context || {});
  return validation;
}

function compactAgentPlanValidationSummary(validation) {
  if (!validation || typeof validation !== "object") return null;
  return {
    ok: Boolean(validation.ok),
    stepCount: Number(validation.stepCount || 0),
    executableCount: Number(validation.executableCount || 0),
    mutatingCount: Number(validation.mutatingCount || 0),
    unknownToolCount: Number(validation.unknownToolCount || 0),
    invalidStepCount: Number(validation.invalidStepCount || 0),
    classification: validation.classification && validation.classification.category || null
  };
}

function validateAgentPlanWithRepair(plan, requestId, context, options) {
  const config = options || {};
  const repairEnabled = optionalBoolean(config, "repairPlan", true) !== false;
  const originalValidation = validateAgentPlanObject(plan, requestId, context);
  if (!repairEnabled) {
    originalValidation.planRepair = {
      schema: "ae-agent-plan-repair.v1",
      applied: false,
      skipped: true,
      reason: "repairPlan=false"
    };
    return {
      plan,
      validation: originalValidation,
      originalValidation,
      repair: originalValidation.planRepair
    };
  }

  const repair = repairAgentPlan(plan, originalValidation, {
    tools,
    planningToolNames: PLANNING_TOOL_NAMES
  });
  if (!repair.applied || !repair.repairedPlan) {
    originalValidation.planRepair = {
      ...repair,
      repairedPlan: undefined
    };
    return {
      plan,
      validation: originalValidation,
      originalValidation,
      repair: originalValidation.planRepair
    };
  }

  const repairedValidation = validateAgentPlanObject(repair.repairedPlan, requestId, context);
  const report = {
    ...repair,
    repairedPlan: undefined,
    repairedValidation: compactAgentPlanValidationSummary(repairedValidation)
  };
  repairedValidation.planRepair = report;
  return {
    plan: repair.repairedPlan,
    validation: repairedValidation,
    originalValidation,
    repair: report
  };
}

function hasCheckpointStep(validation) {
  return Boolean(validation && Array.isArray(validation.steps) && validation.steps.some((step) => (
    step.tool === "checkpoint_project" || step.tool === "start_edit_session"
  )));
}

function valueAtPath(value, pathExpression) {
  const parts = String(pathExpression || "")
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .filter(Boolean);
  let current = value;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = current[part];
  }
  return current;
}

function isPlanBindingExpression(value) {
  const expression = String(value || "").trim();
  return /^steps\.\d+\./.test(expression)
    || expression.indexOf("previous.") === 0
    || /^step-\d+-result(?:\.|$)/.test(expression)
    || /^\{\{\s*[A-Za-z0-9_.-]+\s*\}\}$/.test(expression);
}

function firstPresent(values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function defaultPlanBindingValue(payload, targetField) {
  if (!payload || typeof payload !== "object") return payload;
  if (targetField === "compItemIndex") {
    return firstPresent([
      payload.rootCompItemIndex,
      payload.duplicatedRootCompItemIndex,
      payload.compItemIndex,
      payload.itemIndex,
      valueAtPath(payload, "duplicate.itemIndex"),
      valueAtPath(payload, "duplicateComp.itemIndex"),
      valueAtPath(payload, "comp.itemIndex"),
      valueAtPath(payload, "activeComp.itemIndex"),
      valueAtPath(payload, "project.activeItem.itemIndex"),
      valueAtPath(payload, "verification.comp.itemIndex"),
      valueAtPath(payload, "mutation.target.item.itemIndex")
    ]);
  }
  if (targetField === "folderItemIndex" || targetField === "targetFolderItemIndex") {
    return firstPresent([
      payload.folderItemIndex,
      payload.targetFolderItemIndex,
      valueAtPath(payload, "folder.itemIndex"),
      valueAtPath(payload, "targetFolder.itemIndex")
    ]);
  }
  if (targetField === "compName") {
    return firstPresent([
      payload.compName,
      payload.name,
      valueAtPath(payload, "duplicate.name"),
      valueAtPath(payload, "comp.name"),
      valueAtPath(payload, "activeComp.name"),
      valueAtPath(payload, "project.activeItem.name"),
      valueAtPath(payload, "verification.comp.name"),
      valueAtPath(payload, "mutation.target.item.name")
    ]);
  }
  if (targetField === "itemIndex") {
    return firstPresent([
      payload.itemIndex,
      valueAtPath(payload, "duplicate.itemIndex"),
      valueAtPath(payload, "item.itemIndex"),
      valueAtPath(payload, "sourceItem.itemIndex"),
      valueAtPath(payload, "mutation.target.item.itemIndex")
    ]);
  }
  if (targetField === "itemIndices" || targetField === "itemIndexes") {
    return firstPresent([
      deepDuplicateCreatedItemIndicesFromPayload(payload),
      selectedSourceCompIndicesFromPayload(payload),
      projectItemIndicesFromPayload(payload)
    ]);
  }
  if (targetField === "itemName" || targetField === "name") {
    return firstPresent([
      payload.itemName,
      payload.name,
      valueAtPath(payload, "duplicate.name"),
      valueAtPath(payload, "item.name"),
      valueAtPath(payload, "sourceItem.name"),
      valueAtPath(payload, "mutation.target.item.name")
    ]);
  }
  if (targetField === "layerIndex") {
    return firstPresent([
      payload.layerIndex,
      valueAtPath(payload, "layer.index"),
      valueAtPath(payload, "layer.layerIndex"),
      valueAtPath(payload, "mutation.target.layer.layerIndex")
    ]);
  }
  if (targetField === "layerName") {
    return firstPresent([
      payload.layerName,
      valueAtPath(payload, "layer.name"),
      valueAtPath(payload, "mutation.target.layer.name")
    ]);
  }
  return payload;
}

function positiveIntegerBindingValue(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 1) return undefined;
  return Math.floor(number);
}

function sourceCompRefFromLayer(layer) {
  const source = layer && layer.source;
  if (!source || typeof source !== "object") return null;
  const type = String(source.type || source.typeName || "").toLowerCase();
  if (type && type.indexOf("comp") === -1) return null;
  const itemIndex = positiveIntegerBindingValue(source.itemIndex || source.index);
  if (!itemIndex) return null;
  return {
    itemIndex,
    name: source.name || ""
  };
}

function uniquePositiveIntegerList(values) {
  const source = Array.isArray(values) ? values : [values];
  const result = [];
  const seen = new Set();
  for (const value of source) {
    const normalized = positiveIntegerBindingValue(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result.length ? result : undefined;
}

function itemIndicesFromObjectList(items) {
  if (!Array.isArray(items)) return undefined;
  const values = [];
  for (const item of items) {
    values.push(
      item && item.itemIndex,
      valueAtPath(item, "item.itemIndex"),
      valueAtPath(item, "source.itemIndex"),
      valueAtPath(item, "sourceItem.itemIndex")
    );
  }
  return uniquePositiveIntegerList(values);
}

function projectItemIndicesFromPayload(payload) {
  if (!payload || typeof payload !== "object") return undefined;
  return firstPresent([
    uniquePositiveIntegerList(payload.itemIndices),
    uniquePositiveIntegerList(payload.itemIndexes),
    uniquePositiveIntegerList(payload.createdItemIndices),
    uniquePositiveIntegerList(payload.duplicatedProjectItemIndices),
    uniquePositiveIntegerList([
      payload.itemIndex,
      payload.rootCompItemIndex,
      payload.duplicatedRootCompItemIndex,
      valueAtPath(payload, "duplicate.itemIndex"),
      valueAtPath(payload, "duplicateComp.itemIndex"),
      valueAtPath(payload, "item.itemIndex"),
      valueAtPath(payload, "sourceItem.itemIndex"),
      valueAtPath(payload, "mutation.target.item.itemIndex")
    ]),
    itemIndicesFromObjectList(payload.items),
    itemIndicesFromObjectList(payload.matches),
    itemIndicesFromObjectList(payload.renamed),
    itemIndicesFromObjectList(payload.removed)
  ]);
}

function deepDuplicateRootCompItemIndexFromPayload(payload) {
  if (!payload || typeof payload !== "object") return undefined;
  return firstPresent([
    positiveIntegerBindingValue(payload.rootCompItemIndex),
    positiveIntegerBindingValue(payload.duplicatedRootCompItemIndex),
    positiveIntegerBindingValue(valueAtPath(payload, "duplicateComp.itemIndex")),
    positiveIntegerBindingValue(valueAtPath(payload, "layer.source.itemIndex"))
  ]);
}

function deepDuplicateCreatedItemIndicesFromPayload(payload) {
  if (!payload || typeof payload !== "object") return undefined;
  const values = [];
  const rootCompItemIndex = deepDuplicateRootCompItemIndexFromPayload(payload);
  if (rootCompItemIndex) values.push(rootCompItemIndex);

  if (Array.isArray(payload.duplicatedItems)) {
    for (const item of payload.duplicatedItems) {
      values.push(valueAtPath(item, "duplicate.itemIndex"));
    }
  }

  return uniquePositiveIntegerList(values);
}

function withDeepDuplicateResultAliases(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  const rootCompItemIndex = deepDuplicateRootCompItemIndexFromPayload(payload);
  const createdItemIndices = deepDuplicateCreatedItemIndicesFromPayload(payload);
  const result = { ...payload };

  if (rootCompItemIndex) {
    if (!positiveIntegerBindingValue(result.rootCompItemIndex)) {
      result.rootCompItemIndex = rootCompItemIndex;
    }
    if (!positiveIntegerBindingValue(result.duplicatedRootCompItemIndex)) {
      result.duplicatedRootCompItemIndex = rootCompItemIndex;
    }
  }

  if (createdItemIndices && createdItemIndices.length) {
    if (!Array.isArray(result.createdItemIndices) || !result.createdItemIndices.length) {
      result.createdItemIndices = createdItemIndices;
    }
    if (!Array.isArray(result.duplicatedProjectItemIndices) || !result.duplicatedProjectItemIndices.length) {
      result.duplicatedProjectItemIndices = createdItemIndices;
    }
  }

  return result;
}

function selectedSourceCompRefsFromPayload(payload) {
  if (!payload || typeof payload !== "object") return undefined;
  const layerCollections = [
    payload.selectedLayers,
    valueAtPath(payload, "comp.selectedLayers"),
    valueAtPath(payload, "activeComp.selectedLayers")
  ];
  const refs = [];
  const seen = new Set();

  function addRef(ref) {
    if (!ref) return;
    const key = `${ref.itemIndex}:${ref.name || ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    refs.push(ref);
  }

  for (const layers of layerCollections) {
    if (!Array.isArray(layers)) continue;
    for (const layer of layers) {
      addRef(sourceCompRefFromLayer(layer));
    }
  }

  addRef(sourceCompRefFromLayer(payload.layer));

  return refs.length ? refs : undefined;
}

function selectedSourceCompFromPayload(payload) {
  const refs = selectedSourceCompRefsFromPayload(payload);
  if (!refs || !refs.length) return undefined;
  const first = refs[0];
  for (const ref of refs) {
    if (ref.itemIndex !== first.itemIndex) return undefined;
  }
  return first;
}

function selectedSourceCompIndicesFromPayload(payload) {
  const refs = selectedSourceCompRefsFromPayload(payload);
  if (!refs || !refs.length) return undefined;
  return uniquePositiveIntegerList(refs.map((ref) => ref.itemIndex));
}

function selectedSourceCompBindingValue(payload, targetField) {
  const ref = selectedSourceCompFromPayload(payload);
  if (!ref) return undefined;
  if (targetField === "compName" || targetField === "itemName" || targetField === "name") {
    return ref.name || undefined;
  }
  return ref.itemIndex;
}

function selectedLayerIndicesFromPayload(payload) {
  if (!payload || typeof payload !== "object") return undefined;
  const direct = firstPresent([
    payload.selectedLayerIndices,
    valueAtPath(payload, "comp.selectedLayerIndices"),
    valueAtPath(payload, "activeComp.selectedLayerIndices")
  ]);
  if (Array.isArray(direct)) return direct;

  const selectedLayers = firstPresent([
    payload.selectedLayers,
    valueAtPath(payload, "comp.selectedLayers"),
    valueAtPath(payload, "activeComp.selectedLayers")
  ]);
  if (Array.isArray(selectedLayers)) {
    return selectedLayers
      .map((layer) => layer && (layer.index || layer.layerIndex))
      .filter((value) => Number.isFinite(Number(value)) && Number(value) >= 1)
      .map((value) => Math.floor(Number(value)));
  }

  return undefined;
}

function selectedPrecompLayerIndicesFromPayload(payload) {
  if (!payload || typeof payload !== "object") return undefined;
  const selectedLayers = firstPresent([
    payload.selectedLayers,
    valueAtPath(payload, "comp.selectedLayers"),
    valueAtPath(payload, "activeComp.selectedLayers")
  ]);
  if (!Array.isArray(selectedLayers)) return undefined;

  const indices = [];
  for (const layer of selectedLayers) {
    if (!sourceCompRefFromLayer(layer)) continue;
    const index = positiveIntegerBindingValue(layer && (layer.index || layer.layerIndex));
    if (index) indices.push(index);
  }
  return uniquePositiveIntegerList(indices);
}

function isCompIndexBindingName(lower) {
  return [
    "compitemindex",
    "compositionitemindex",
    "activecompitemindex",
    "activecompositionitemindex",
    "markercompitemindex",
    "maskcompitemindex",
    "cameracompitemindex"
  ].includes(lower);
}

function isFolderIndexBindingName(lower) {
  return [
    "folderitemindex",
    "targetfolderitemindex",
    "folderindex",
    "targetfolderindex"
  ].includes(lower);
}

function isCompNameBindingName(lower) {
  return [
    "compname",
    "compositionname",
    "activecompname",
    "activecompositionname"
  ].includes(lower);
}

function isItemIndexBindingName(lower) {
  return [
    "itemindex",
    "projectitemindex"
  ].includes(lower);
}

function isItemIndicesBindingName(lower) {
  return [
    "itemindices",
    "itemindexes",
    "projectitemindices",
    "projectitemindexes"
  ].includes(lower);
}

function isItemNameBindingName(lower) {
  return [
    "itemname",
    "projectitemname"
  ].includes(lower);
}

function isLayerIndexBindingName(lower) {
  return [
    "layerindex",
    "selectedlayerindex"
  ].includes(lower);
}

function isSelectedLayerIndexBindingName(lower) {
  return [
    "selectedlayerindex"
  ].includes(lower);
}

function isSelectedLayerIndicesBindingName(lower) {
  return [
    "selectedlayerindices",
    "selectedlayerindexes",
    "selectedlayers"
  ].includes(lower);
}

function isSelectedPrecompLayerIndexBindingName(lower) {
  return [
    "selectedprecomplayerindex",
    "selectedsourcecomplayerindex",
    "selectedsourcelayerindex",
    "precomplayerindex"
  ].includes(lower);
}

function isSelectedPrecompLayerIndicesBindingName(lower) {
  return [
    "selectedprecomplayerindices",
    "selectedprecomplayerindexes",
    "selectedsourcecomplayerindices",
    "selectedsourcecomplayerindexes",
    "selectedsourcelayerindices",
    "selectedsourcelayerindexes",
    "precomplayerindices",
    "precomplayerindexes"
  ].includes(lower);
}

function isLayerNameBindingName(lower) {
  return [
    "layername",
    "selectedlayername"
  ].includes(lower);
}

function isSelectedSourceCompBindingName(lower) {
  return [
    "selectedsourcecompitemindex",
    "selectedsourceitemindex",
    "selectedlayersourceitemindex",
    "selectedlayercompitemindex",
    "selectedprecompitemindex",
    "selectedprecompcompitemindex",
    "precompitemindex",
    "precompcompitemindex",
    "selectedsourcecompname",
    "selectedsourcename",
    "selectedlayersourcename",
    "selectedprecompname",
    "precompname"
  ].includes(lower);
}

function isSelectedSourceCompIndicesBindingName(lower) {
  return [
    "selectedsourcecompitemindices",
    "selectedsourcecompitemindexes",
    "selectedsourceitemindices",
    "selectedsourceitemindexes",
    "selectedlayersourceitemindices",
    "selectedlayersourceitemindexes",
    "selectedprecompitemindices",
    "selectedprecompitemindexes",
    "precompitemindices",
    "precompitemindexes",
    "sourceitemindices",
    "sourceitemindexes"
  ].includes(lower);
}

function findBindingValueInExecutedSteps(executedSteps, resolver) {
  for (let index = executedSteps.length - 1; index >= 0; index -= 1) {
    const value = resolver(executedSteps[index].payload);
    if (Array.isArray(value) && value.length) return value;
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

function planStepText(step) {
  return String([
    step && step.title,
    step && step.intent,
    step && step.summary
  ].filter(Boolean).join(" ")).toLowerCase();
}

function shouldPreferSelectedSourceCompBinding(step, lower, targetField) {
  if (targetField !== "compItemIndex" && targetField !== "itemIndex") return false;
  if (!isCompIndexBindingName(lower) && !isItemIndexBindingName(lower)) return false;
  if (!step || step.tool !== "duplicate_comp") return false;
  return /\b(precomp|pre-comp|source|selected)\b/.test(planStepText(step));
}

function fitBindingValueToTargetField(value, targetField) {
  if (!Array.isArray(value)) return value;
  if ([
    "compItemIndex",
    "itemIndex",
    "sourceItemIndex",
    "layerIndex",
    "renderQueueItemIndex"
  ].includes(targetField)) {
    return value[0];
  }
  return value;
}

function resolveNamedPlanBinding(name, executedSteps, targetField, step) {
  const normalized = String(name || "").trim();
  const lower = normalized.toLowerCase();

  if (lower === "selectedlayerindices" || lower === "selectedlayers") {
    return findBindingValueInExecutedSteps(executedSteps, selectedLayerIndicesFromPayload);
  }
  if (lower === "selectedlayerindex") {
    const indices = findBindingValueInExecutedSteps(executedSteps, selectedLayerIndicesFromPayload);
    return Array.isArray(indices) ? indices[0] : indices;
  }
  if (isSelectedPrecompLayerIndicesBindingName(lower)) {
    const value = findBindingValueInExecutedSteps(executedSteps, selectedPrecompLayerIndicesFromPayload);
    return fitBindingValueToTargetField(value, targetField);
  }
  if (isSelectedPrecompLayerIndexBindingName(lower)) {
    const indices = findBindingValueInExecutedSteps(executedSteps, selectedPrecompLayerIndicesFromPayload);
    return Array.isArray(indices) ? indices[0] : indices;
  }
  if (isSelectedSourceCompIndicesBindingName(lower)) {
    const value = findBindingValueInExecutedSteps(executedSteps, selectedSourceCompIndicesFromPayload);
    return fitBindingValueToTargetField(value, targetField);
  }
  if (isSelectedSourceCompBindingName(lower) || shouldPreferSelectedSourceCompBinding(step, lower, targetField)) {
    return findBindingValueInExecutedSteps(executedSteps, (payload) => selectedSourceCompBindingValue(payload, targetField));
  }
  if (isItemIndicesBindingName(lower)) {
    const value = findBindingValueInExecutedSteps(executedSteps, (payload) => (
      selectedSourceCompIndicesFromPayload(payload) || projectItemIndicesFromPayload(payload)
    ));
    return fitBindingValueToTargetField(value, targetField);
  }
  if (isFolderIndexBindingName(lower)) {
    return findBindingValueInExecutedSteps(executedSteps, (payload) => defaultPlanBindingValue(payload, "folderItemIndex"));
  }
  if (isCompIndexBindingName(lower)) {
    return findBindingValueInExecutedSteps(executedSteps, (payload) => defaultPlanBindingValue(payload, "compItemIndex"));
  }
  if (isCompNameBindingName(lower)) {
    return findBindingValueInExecutedSteps(executedSteps, (payload) => defaultPlanBindingValue(payload, "compName"));
  }
  if (isItemIndexBindingName(lower)) {
    return findBindingValueInExecutedSteps(executedSteps, (payload) => defaultPlanBindingValue(payload, "itemIndex"));
  }
  if (isItemNameBindingName(lower)) {
    return findBindingValueInExecutedSteps(executedSteps, (payload) => defaultPlanBindingValue(payload, "itemName"));
  }
  if (isLayerIndexBindingName(lower)) {
    return findBindingValueInExecutedSteps(executedSteps, (payload) => defaultPlanBindingValue(payload, "layerIndex"));
  }
  if (isLayerNameBindingName(lower)) {
    return findBindingValueInExecutedSteps(executedSteps, (payload) => defaultPlanBindingValue(payload, "layerName"));
  }

  return findBindingValueInExecutedSteps(executedSteps, (payload) => {
    if (!payload || typeof payload !== "object") return undefined;
    return valueAtPath(payload, normalized);
  });
}

function resolvePlanBinding(binding, executedSteps, targetField, step) {
  const expression = String(binding || "").trim();
  const template = /^\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}$/.exec(expression);
  if (template) {
    const inner = template[1].trim();
    if (isPlanBindingExpression(inner)) {
      return resolvePlanBinding(inner, executedSteps, targetField, step);
    }
    return resolveNamedPlanBinding(inner, executedSteps, targetField, step);
  }
  const match = /^steps\.(\d+)\.(.+)$/.exec(expression);
  if (match) {
    const index = Number(match[1]) - 1;
    const rest = match[2].replace(/^result\./, "");
    const step = executedSteps[index];
    if (!step) return undefined;
    if (!rest || rest === "result") return defaultPlanBindingValue(step.payload, targetField);
    return valueAtPath(step.payload, rest);
  }
  if (expression.indexOf("previous.") === 0 && executedSteps.length) {
    return valueAtPath(executedSteps[executedSteps.length - 1].payload, expression.slice("previous.".length));
  }
  const shorthand = /^step-(\d+)-result(?:\.(.+))?$/.exec(expression);
  if (shorthand) {
    const index = Number(shorthand[1]) - 1;
    const step = executedSteps[index];
    if (!step) return undefined;
    if (shorthand[2]) return valueAtPath(step.payload, shorthand[2]);
    return defaultPlanBindingValue(step.payload, targetField);
  }
  return undefined;
}

function canonicalPlanArgField(field, schemaProperties) {
  const original = String(field || "");
  if (!schemaProperties || hasArg(schemaProperties, original)) return original;

  const aliases = {
    markercompitemindex: ["compItemIndex"],
    maskcompitemindex: ["compItemIndex"],
    cameracompitemindex: ["compItemIndex"],
    folderindex: ["targetFolderItemIndex", "folderItemIndex"],
    folderitemindex: ["targetFolderItemIndex", "folderItemIndex"],
    targetfolderindex: ["targetFolderItemIndex"],
    targetfolderitemindex: ["targetFolderItemIndex"],
    itemindex: ["itemIndices"],
    itemindexes: ["itemIndices"],
    projectitemindex: ["itemIndices"],
    projectitemindexes: ["itemIndices"],
    projectitemindices: ["itemIndices"],
    selectedprecompitemindex: ["itemIndices"],
    selectedprecompitemindexes: ["itemIndices"],
    selectedprecompitemindices: ["itemIndices"],
    sourceitemindex: ["itemIndices"],
    sourceitemindexes: ["itemIndices"],
    sourceitemindices: ["itemIndices"],
    itemtype: ["type", "itemType"],
    projectitemtype: ["type", "itemType"],
    layerindex: ["layerIndices"],
    layerindexes: ["layerIndices"],
    selectedlayerindex: ["layerIndices"],
    selectedlayerindexes: ["layerIndices"],
    selectedlayerindices: ["layerIndices"]
  };
  const candidates = aliases[original.toLowerCase()] || [];
  for (const candidate of candidates) {
    if (hasArg(schemaProperties, candidate)) return candidate;
  }
  return original;
}

function isBooleanLiteralString(value) {
  if (typeof value !== "string") return false;
  return ["true", "1", "yes", "on", "false", "0", "no", "off"].includes(value.trim().toLowerCase());
}

function normalizeProjectItemType(value) {
  if (typeof value !== "string") return value;
  const normalized = value.trim().toLowerCase();
  if (["comp", "comps", "composition", "compositions", "compositionitem", "compitem"].includes(normalized)) return "comp";
  if (["footage", "footageitem", "footages"].includes(normalized)) return "footage";
  if (["folder", "folders", "folderitem"].includes(normalized)) return "folder";
  return value;
}

function normalizePlanArgAliases(args, tool) {
  const schemaProperties = tool && tool.inputSchema && tool.inputSchema.properties && typeof tool.inputSchema.properties === "object"
    ? tool.inputSchema.properties
    : null;
  if (!schemaProperties) return { ...(args || {}) };

  const normalized = { ...(args || {}) };
  for (const field of Object.keys(normalized)) {
    const canonical = canonicalPlanArgField(field, schemaProperties);
    if (canonical === field) continue;
    if (!hasArg(normalized, canonical) || missingPlanBindingValue(normalized[canonical])) {
      normalized[canonical] = normalized[field];
    }
    delete normalized[field];
  }
  if (tool && tool.name === "find_project_items" && typeof normalized.exactName === "string" && !isBooleanLiteralString(normalized.exactName)) {
    const query = normalized.exactName.trim();
    if (query && (!hasArg(normalized, "query") || missingPlanBindingValue(normalized.query))) {
      normalized.query = query;
    }
    normalized.exactName = true;
  }
  if (hasArg(normalized, "type")) {
    normalized.type = normalizeProjectItemType(normalized.type);
  }
  if (hasArg(normalized, "itemType")) {
    normalized.itemType = normalizeProjectItemType(normalized.itemType);
  }
  return normalized;
}

function missingPlanBindingValue(value) {
  return value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
}

function runtimeBindingResolutionHint(expression, field) {
  const template = /^\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}$/.exec(String(expression || "").trim());
  if (!template) return String(field || "");

  const name = template[1].trim();
  const lower = name.toLowerCase();
  if (isSelectedPrecompLayerIndexBindingName(lower) || isSelectedPrecompLayerIndicesBindingName(lower)) {
    return `${field} (${name}: no selected precomp layer was found in prior inspection results)`;
  }
  if (isSelectedSourceCompBindingName(lower) || isSelectedSourceCompIndicesBindingName(lower)) {
    return `${field} (${name}: no selected precomp source comp was found in prior inspection results)`;
  }
  if (isSelectedLayerIndexBindingName(lower) || isSelectedLayerIndicesBindingName(lower)) {
    return `${field} (${name}: no selected layer was found in prior inspection results)`;
  }
  return `${field} (${name})`;
}

function formatUnresolvedRuntimeBindings(bound) {
  const details = bound && Array.isArray(bound.unresolvedDetails) && bound.unresolvedDetails.length
    ? bound.unresolvedDetails
    : bound.unresolved;
  return (details || []).join(", ");
}

function applyPlanRuntimeBindings(step, executedSteps) {
  const tool = toolByName(step.tool);
  const args = normalizePlanArgAliases(step.safeArgs || {}, tool);
  const bindings = step.resultBindings || {};
  const schemaProperties = tool && tool.inputSchema && tool.inputSchema.properties && typeof tool.inputSchema.properties === "object"
    ? tool.inputSchema.properties
    : null;
  const unresolved = [];
  const unresolvedDetails = [];
  for (const field of Object.keys(args)) {
    if (!isPlanBindingExpression(args[field])) continue;
    const value = resolvePlanBinding(args[field], executedSteps, field, step);
    if (missingPlanBindingValue(value)) {
      unresolved.push(field);
      unresolvedDetails.push(runtimeBindingResolutionHint(args[field], field));
    } else {
      args[field] = value;
    }
  }
  for (const field of Object.keys(bindings)) {
    const canonicalField = canonicalPlanArgField(field, schemaProperties);
    if (hasArg(args, canonicalField) && args[canonicalField] !== null && args[canonicalField] !== undefined && args[canonicalField] !== "") {
      continue;
    }
    if (schemaProperties && !hasArg(schemaProperties, canonicalField)) {
      continue;
    }
    const value = resolvePlanBinding(bindings[field], executedSteps, canonicalField, step);
    if (missingPlanBindingValue(value)) {
      unresolved.push(canonicalField);
      unresolvedDetails.push(runtimeBindingResolutionHint(bindings[field], canonicalField));
    } else {
      args[canonicalField] = value;
    }
  }
  return { args, unresolved, unresolvedDetails };
}

const PLANNING_TOOL_NAMES = [
  "get_bridge_status",
  "ping_ae",
  "get_project_snapshot",
  "get_project_info",
  "get_active_comp",
  "list_comps",
  "list_project_folder_items",
  "list_layers",
  "get_comp_details",
  "get_layer_details",
  "get_layer_essential_properties",
  "get_essential_graphics_controllers",
  "get_path_geometry",
  "get_selected_layers",
  "get_selected_properties",
  "find_project_items",
  "find_comps",
  "list_effect_presets",
  "list_effects",
  "get_effect_details",
  "get_project_checkpoint_details",
  "checkpoint_project",
  "create_comp",
  "create_project_folder",
  "move_project_items_to_folder",
  "set_project_item_metadata",
  "set_project_frames_count_type",
  "create_text_layer",
  "create_shapes_from_text",
  "import_footage",
  "create_solid_layer",
  "create_null_layer",
  "create_adjustment_layer",
  "create_camera_layer",
  "create_camera_with_controller",
  "toggle_onion_skinning",
  "create_layer_mask",
  "set_layer_mask",
  "set_path_geometry",
  "export_path_points",
  "save_comp_frame_png",
  "add_project_item_to_comp",
  "duplicate_layer",
  "duplicate_layers",
  "set_layer_selection",
  "set_layer_parent",
  "set_layer_track_matte",
  "delete_layer",
  "duplicate_comp",
  "deep_duplicate_precomp_sources",
  "add_effect",
  "set_effect_property",
  "set_effect_enabled",
  "set_puppet_pin_type",
  "add_property_to_essential_graphics",
  "set_property_value",
  "set_layer_metadata",
  "set_layer_blending_mode",
  "align_layers_to_time",
  "set_comp_current_time",
  "set_comp_properties",
  "refresh_comp_panel",
  "set_comp_work_area",
  "set_layer_time_range",
  "stagger_layers",
  "split_layers_at_time",
  "precompose_layers",
  "replace_layer_source",
  "rename_layers",
  "rename_project_items",
  "update_text_layer",
  "create_shape_layer",
  "create_layer_connection_line",
  "fit_layer_to_comp",
  "set_property_keyframes",
  "fill_in_keyframes",
  "keyframe_current_value_from_expression",
  "apply_keyframe_ease",
  "set_spatial_in_tangent",
  "set_expression",
  "clear_expression",
  "separate_shape_size_dimensions",
  "add_comp_to_render_queue",
  "set_render_queue_output",
  "get_render_queue_status",
  "set_layer_transform",
  "apply_transform_expression",
  "add_comp_marker",
  "add_layer_marker",
  "update_layer_marker",
  "delete_layer_marker",
  "create_test_comp",
  "cleanup_test_items",
  "run_extendscript",
  "run_extendscript_file"
];

function compactPromptText(text, limit) {
  const compacted = String(text || "").replace(/\s+/g, " ").trim();
  if (!compacted || compacted.length <= limit) return compacted;
  return `${compacted.slice(0, Math.max(0, limit - 1)).trim()}...`;
}

function roundedContextNumber(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return value;
  return Math.round(value * 1000) / 1000;
}

function compactContextText(value, limit) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text || text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 1)).trim()}...`;
}

function compactContextItemReference(item) {
  if (!item || typeof item !== "object") return null;
  return {
    itemIndex: item.itemIndex || null,
    name: compactContextText(item.name || "", 80),
    type: item.type || item.typeName || "unknown"
  };
}

function compactContextLayer(layer) {
  if (!layer || typeof layer !== "object") return null;
  const item = {
    index: layer.index || null,
    name: compactContextText(layer.name || "", 80),
    matchName: layer.matchName || "",
    enabled: layer.enabled !== false,
    locked: Boolean(layer.locked),
    startTime: roundedContextNumber(layer.startTime),
    inPoint: roundedContextNumber(layer.inPoint),
    outPoint: roundedContextNumber(layer.outPoint)
  };
  const source = compactContextItemReference(layer.source);
  if (source) item.source = source;
  return item;
}

function selectedSourceHintsFromLayers(layers) {
  const source = Array.isArray(layers) ? layers : [];
  const hints = [];
  const seen = new Set();
  for (const layer of source) {
    if (!layer || !layer.source) continue;
    const ref = compactContextItemReference(layer.source);
    if (!ref) continue;
    const key = `${ref.itemIndex || ""}:${ref.name}:${ref.type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    hints.push({
      layerIndex: layer.index || null,
      layerName: compactContextText(layer.name || "", 80),
      source: ref,
      bindingHint: ref.type === "comp" ? "{{selectedPrecompItemIndex}}" : null
    });
    if (hints.length >= 5) break;
  }
  return hints;
}

function compactContextEvent(event) {
  const details = event && event.details && typeof event.details === "object" ? event.details : {};
  return {
    at: event && event.at ? event.at : null,
    type: event && event.type ? event.type : "unknown",
    name: details.name || details.tool || null,
    ok: typeof details.ok === "boolean" ? details.ok : undefined,
    error: details.error ? compactContextText(details.error, 120) : undefined
  };
}

function compactBridgeForPlanContext(status) {
  return {
    panelConnected: Boolean(status.panelConnected),
    pendingCommands: status.pendingCommands || 0,
    inflightCommands: Array.isArray(status.inflightCommands) ? status.inflightCommands.length : 0,
    retainedResults: status.retainedResults || 0,
    activeEditSession: status.activeEditSession
      ? {
          id: status.activeEditSession.id || null,
          label: status.activeEditSession.label || null,
          checkpointFile: status.activeEditSession.checkpoint && status.activeEditSession.checkpoint.checkpointFile
            ? status.activeEditSession.checkpoint.checkpointFile
            : null
        }
      : null,
    recentEvents: Array.isArray(status.recentEvents)
      ? status.recentEvents.slice(-6).map(compactContextEvent)
      : []
  };
}

function unavailablePlanContext(reason) {
  return {
    available: false,
    reason: compactContextText(reason || "unavailable", 160)
  };
}

async function readPlanContextTool(name, args) {
  try {
    const result = await callToolLogged("ai-plan-context", name, args || {});
    const payload = firstToolPayload(result);
    if (result.isError) {
      return {
        ok: false,
        error: operationErrorFromPayload(payload) || `${name} failed.`
      };
    }
    return { ok: true, payload };
  } catch (error) {
    return {
      ok: false,
      error: error.message || String(error)
    };
  }
}

function compactActiveCompForPlanContext(payload) {
  if (!payload || typeof payload !== "object") return null;
  return {
    itemIndex: payload.itemIndex || null,
    name: compactContextText(payload.name || "", 80),
    size: payload.width && payload.height ? `${payload.width}x${payload.height}` : null,
    duration: roundedContextNumber(payload.duration),
    frameRate: roundedContextNumber(payload.frameRate),
    time: roundedContextNumber(payload.time),
    numLayers: payload.numLayers || 0,
    selectedLayerCount: Array.isArray(payload.selectedLayers) ? payload.selectedLayers.length : 0
  };
}

function compactRenderQueueForPlanContext(payload) {
  if (!payload || typeof payload !== "object") return null;
  const items = Array.isArray(payload.items) ? payload.items.slice(0, 3).map((item) => ({
    index: item.index || null,
    status: item.status || null,
    comp: compactContextItemReference(item.comp)
  })) : [];
  return {
    totalItems: payload.totalItems || 0,
    returned: payload.returned || items.length,
    items
  };
}

async function buildProjectContextSnapshot() {
  const status = getBridgeStatus();
  const snapshot = {
    capturedAt: new Date().toISOString(),
    bridge: compactBridgeForPlanContext(status),
    activeComp: unavailablePlanContext("not checked"),
    selectedLayers: [],
    selectedSourceHints: [],
    renderQueue: unavailablePlanContext("not checked"),
    notes: [
      "Snapshot is a compact planning hint. Verify targets with read tools before mutations."
    ]
  };

  if (!status.panelConnected) {
    snapshot.activeComp = unavailablePlanContext("CEP panel is offline.");
    snapshot.renderQueue = unavailablePlanContext("CEP panel is offline.");
    snapshot.notes.push("CEP panel is offline, so AE project context was not queried.");
    return snapshot;
  }

  const activeComp = await readPlanContextTool("get_active_comp", {});
  if (activeComp.ok) {
    const payload = activeComp.payload || {};
    const selectedLayers = Array.isArray(payload.selectedLayers) ? payload.selectedLayers : [];
    snapshot.activeComp = compactActiveCompForPlanContext(payload) || unavailablePlanContext("Active comp payload was empty.");
    snapshot.selectedLayers = selectedLayers.slice(0, 6).map(compactContextLayer).filter(Boolean);
    snapshot.selectedSourceHints = selectedSourceHintsFromLayers(selectedLayers);
    if (selectedLayers.length > snapshot.selectedLayers.length) {
      snapshot.notes.push(`Selected layer list truncated from ${selectedLayers.length} to ${snapshot.selectedLayers.length}.`);
    }
  } else {
    snapshot.activeComp = unavailablePlanContext(activeComp.error);
    snapshot.notes.push("Active composition could not be read.");
  }

  const renderQueue = await readPlanContextTool("get_render_queue_status", { limit: 3 });
  if (renderQueue.ok) {
    snapshot.renderQueue = compactRenderQueueForPlanContext(renderQueue.payload) || unavailablePlanContext("Render queue payload was empty.");
  } else {
    snapshot.renderQueue = unavailablePlanContext(renderQueue.error);
  }

  return snapshot;
}

function planningToolCatalog() {
  const lines = [];
  const seen = new Set();

  for (const name of PLANNING_TOOL_NAMES) {
    if (seen.has(name)) continue;
    const tool = toolByName(name);
    if (!tool) continue;
    seen.add(name);

    const required = requiredSchemaFields(tool);
    const mutating = MUTATING_TOOL_NAMES.has(tool.name) ? "mutates" : "read-only";
    const requiredText = required.length ? ` Required: ${required.join(", ")}.` : "";
    lines.push(`- ${tool.name} (${mutating}): ${compactPromptText(tool.description, 130)}${requiredText}`);
  }

  return lines.join("\n");
}

function planRunCheckpointFile(run) {
  if (!run || typeof run !== "object") return "";
  if (run.checkpoint && run.checkpoint.checkpointFile) return run.checkpoint.checkpointFile;
  if (run.editSession && run.editSession.checkpoint && run.editSession.checkpoint.checkpointFile) {
    return run.editSession.checkpoint.checkpointFile;
  }
  if (Array.isArray(run.steps)) {
    for (const step of run.steps) {
      if (step && step.result && step.result.checkpoint && step.result.checkpoint.checkpointFile) {
        return step.result.checkpoint.checkpointFile;
      }
      if (step && step.result && step.result.mutation && step.result.mutation.checkpoint && step.result.mutation.checkpoint.checkpointFile) {
        return step.result.mutation.checkpoint.checkpointFile;
      }
    }
  }
  return "";
}

function planRunUndoHint(run) {
  if (!run || !Array.isArray(run.steps)) return "";
  for (const step of run.steps) {
    if (step && step.result && step.result.mutation && step.result.mutation.undoHint) {
      return step.result.mutation.undoHint;
    }
  }
  return "";
}

function planRunRecoveryHint(run) {
  if (!run || run.ok) return null;
  const mutatingExecution = Boolean(run.safety && run.safety.mutatingExecution);
  const checkpointFile = planRunCheckpointFile(run);
  const undoHint = planRunUndoHint(run);
  const safetyStatus = run.safety && run.safety.status ? run.safety.status : "";

  if (run.safety && run.safety.saveProjectFirst) {
    return "No project change was started. Save the After Effects project so a checkpoint can be created, then retry the protected run.";
  }
  if (safetyStatus === "blocked_missing_edit_session") {
    return "No project change was started. Retry through the protected Run plan action, or create a checkpoint/edit session before running mutating steps.";
  }
  if (safetyStatus === "blocked_edit_session_failed") {
    return "No project change was started because edit-session protection could not be prepared. Review the safety error, then retry after the project can be checkpointed.";
  }
  if (checkpointFile) {
    return `A checkpoint is available at ${checkpointFile}. Review the AE project, then restore manually from that checkpoint only if needed.`;
  }
  if (undoHint) {
    return undoHint;
  }
  if (!mutatingExecution) {
    return "No project changes were requested. Review the failed read-only step, adjust the plan, and retry.";
  }
  return "Review the failed step before retrying. If any AE change occurred, use the checkpoint or After Effects Undo path listed in the step details.";
}

function planRunFailedStep(run) {
  const steps = run && Array.isArray(run.steps) ? run.steps : [];
  return steps.find((step) => step && (step.status === "failed" || step.status === "blocked")) || null;
}

function m100PlanRunFailurePhase(run) {
  if (!run) return "protocol_validation";
  const status = run.safety && run.safety.status || "";
  if (status === "blocked_m100_confirmation_required" || status === "blocked_m100_confirmation_failed") {
    return "confirmation_validation";
  }
  if (status === "blocked_edit_session_failed" || status === "blocked_save_project_first" || status === "blocked_missing_edit_session") {
    return "ae_queue";
  }
  if (run.validation && run.validation.ok === false) return "protocol_validation";
  const failedStep = planRunFailedStep(run);
  if (failedStep && failedStep.result && failedStep.result.phase) {
    return m100Protocol.normalizeDiagnosticPhase(failedStep.result.phase, "ae_execution");
  }
  if (failedStep && failedStep.result && failedStep.result.code === "ae_result_parse_failed") return "ae_result_parse";
  if (failedStep && (failedStep.error || failedStep.isError)) return "ae_execution";
  return run.errorCode && /m100_|confirmation|proposal/.test(run.errorCode) ? "confirmation_validation" : "protocol_validation";
}

function m100PlanRunFailureCode(run) {
  if (!run) return "plan_run_failed";
  if (run.errorCode) return run.errorCode;
  const status = run.safety && run.safety.status || "";
  if (status) return status;
  const failedStep = planRunFailedStep(run);
  if (failedStep && failedStep.result && failedStep.result.code) return failedStep.result.code;
  if (failedStep && failedStep.status === "blocked") return "plan_step_blocked";
  if (failedStep && failedStep.status === "failed") return "plan_step_failed";
  return "plan_run_failed";
}

function m100PlanRunRawPreview(run) {
  const failedStep = planRunFailedStep(run);
  if (failedStep && failedStep.result && Object.prototype.hasOwnProperty.call(failedStep.result, "rawPreview")) {
    return failedStep.result.rawPreview;
  }
  if (failedStep && failedStep.error) return failedStep.error;
  if (run && run.safety && run.safety.error) return run.safety.error;
  return undefined;
}

function attachM100PlanRunDiagnostic(run, options) {
  if (!run || run.ok) return run;
  const diagnostic = m100Protocol.createUserDiagnostic({
    phase: m100PlanRunFailurePhase(run),
    code: m100PlanRunFailureCode(run),
    message: run.error || "Agent plan run failed.",
    requestId: options && options.requestId,
    actionId: options && options._m100ActionProposal && options._m100ActionProposal.actionId,
    executionId: run.id,
    rawPreview: m100PlanRunRawPreview(run),
    logRef: LOG_FILE
  });
  run.diagnostic = diagnostic;
  run.error = diagnostic.message;
  if (!run.errorCode) run.errorCode = diagnostic.code;
  if (!run.m100Message) {
    run.m100Message = m100Protocol.createErrorEnvelope({
      requestId: diagnostic.requestId || "",
      actionId: diagnostic.actionId,
      executionId: diagnostic.executionId,
      phase: diagnostic.phase,
      code: diagnostic.code,
      error: diagnostic.message,
      rawPreview: diagnostic.rawPreview,
      logs: [
        {
          phase: diagnostic.phase,
          level: "error",
          message: diagnostic.message,
          logRef: diagnostic.logRef
        }
      ]
    });
  }
  return run;
}

function hardcoreSessionSlug(value) {
  return String(value || "agent-hardcore-session")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "agent-hardcore-session";
}

function hardcoreRegistryPath() {
  return process.env.AE_SOLUTION_REGISTRY_PATH
    ? path.resolve(process.env.AE_SOLUTION_REGISTRY_PATH)
    : path.join(PROJECT_ROOT, "registry", "solutions.json");
}

function uniqueList(values, limit) {
  const output = [];
  for (const value of values || []) {
    const text = String(value || "").trim();
    if (text && !output.includes(text)) output.push(text);
    if (limit && output.length >= limit) break;
  }
  return output;
}

function compactHardcoreText(value, limit = 500) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 1)).trim()}...`;
}

function planTools(plan) {
  const steps = plan && Array.isArray(plan.steps) ? plan.steps : [];
  return uniqueList(steps.map((step) => step && step.tool).filter(Boolean), 12);
}

function isRawExtendscriptTool(tool) {
  return tool === "run_extendscript" || tool === "run_extendscript_file";
}

const HARDCORE_INSPECTION_ONLY_TOOLS = new Set([
  "get_bridge_status",
  "ping_ae",
  "get_active_comp",
  "get_selected_layers",
  "get_selected_properties",
  "get_project_snapshot",
  "get_comp_details",
  "get_layer_details",
  "list_layers",
  "find_project_items",
  "list_project_folder_items",
  "get_render_queue_status"
]);

function hardcoreExecutablePlanBlocker(attempt) {
  const run = attempt && attempt.run;
  const validation = attempt && attempt.planResult && attempt.planResult.planValidation;
  if (!run || run.ok !== true || !validation) return null;
  const steps = Array.isArray(run.steps) ? run.steps : [];
  const noToolCount = Array.isArray(validation.steps)
    ? validation.steps.filter((step) => !step || !step.tool).length
    : 0;
  const completedToolSteps = steps.filter((step) => step && step.tool && step.status === "completed");
  const meaningfulToolSteps = completedToolSteps.filter((step) => !HARDCORE_INSPECTION_ONLY_TOOLS.has(step.tool));
  if (completedToolSteps.length <= 0) {
    return "Convert every pseudo step into real MCP tool calls; do not use conditional/execute_command/tool:null.";
  }
  if (noToolCount > 0 && meaningfulToolSteps.length <= 0) {
    return "Convert every pseudo step into real MCP tool calls; do not use conditional/execute_command/tool:null.";
  }
  return null;
}

function hardcoreAttemptSucceeded(attempt) {
  const run = attempt && attempt.run;
  if (!run || run.ok !== true) return false;
  if (hardcoreExecutablePlanBlocker(attempt)) return false;
  const semantic = run.semanticVerification || null;
  return !semantic || semantic.status === "passed" || semantic.status === "not_applicable";
}

function compactHardcoreRunFailure(run) {
  if (!run) return { error: "No run result." };
  const failedSteps = Array.isArray(run.steps)
    ? run.steps.filter((step) => step && (step.status === "failed" || step.status === "blocked")).slice(0, 4)
    : [];
  const skippedNoToolSteps = Array.isArray(run.steps)
    ? run.steps.filter((step) => step && !step.tool && step.status === "skipped").slice(0, 4)
    : [];
  return {
    ok: run.ok,
    executedCount: Number(run.executedCount || 0),
    skippedCount: Number(run.skippedCount || 0),
    error: compactHardcoreText(run.error || "", 260),
    recoveryHint: compactHardcoreText(run.recoveryHint || "", 260),
    semanticVerification: run.semanticVerification
      ? {
          status: run.semanticVerification.status || null,
          summary: compactHardcoreText(run.semanticVerification.summary || "", 260),
          failedChecks: run.semanticVerification.failedChecks || 0,
          warnings: Array.isArray(run.semanticVerification.warnings) ? run.semanticVerification.warnings.slice(0, 3) : []
        }
      : null,
    failedSteps: failedSteps.map((step) => ({
      index: step.index || null,
      title: compactHardcoreText(step.title || step.tool || "Step", 120),
      tool: step.tool || null,
      status: step.status || null,
      reason: compactHardcoreText(step.reason || step.error || "", 220)
    })),
    skippedNoToolSteps: skippedNoToolSteps.map((step) => ({
      index: step.index || null,
      title: compactHardcoreText(step.title || "Untooled step", 120),
      reason: compactHardcoreText(step.reason || "No tool for this step.", 220)
    }))
  };
}

function typedToolFailuresFromRun(run) {
  const steps = run && Array.isArray(run.steps) ? run.steps : [];
  return steps
    .filter((step) => step && step.tool && !isRawExtendscriptTool(step.tool) && step.status === "failed")
    .map((step) => ({
      tool: step.tool,
      title: compactHardcoreText(step.title || step.tool, 120),
      status: step.status,
      reason: compactHardcoreText(step.error || step.reason || valueAtPath(step, "result.error") || "Typed tool returned an error.", 300),
      targetSummary: compactHardcoreText(step.targetSummary || "", 200)
    }));
}

function recordHardcoreTypedToolFailures(session, attempt) {
  if (!session || !attempt || !attempt.run) return [];
  const failures = typedToolFailuresFromRun(attempt.run);
  const recorded = [];
  for (const failure of failures) {
    const alreadyKnown = session.typedToolFailures.some((item) => item && item.tool === failure.tool);
    if (alreadyKnown) continue;
    let bundle = null;
    try {
      bundle = createDevRequestBundle({
        source: "agent-hardcore",
        title: `TypedTool ${failure.tool} failed in Agent Hardcore`,
        goal: `Repair TypedTool ${failure.tool} for this Agent Hardcore workflow: ${session.prompt}`,
        reason: `${failure.tool} did not complete during Agent Hardcore protected execution: ${failure.reason}`,
        desiredTool: `Fix the existing typed AE Agent tool ${failure.tool}, or replace it with one narrow typed bridge capability that covers this workflow so raw ExtendScript fallback is no longer needed.`,
        acceptanceCriteria: [
          `TypedTool ${failure.tool} succeeds for the captured workflow or reports a precise unsupported precondition.`,
          "The workflow can return to typed-tool planning without raw ExtendScript fallback.",
          "Add focused smoke coverage for the failure evidence in this bundle."
        ],
        targetFiles: ["mcp-server/bridge-daemon.js", "scripts/smoke-test.js", "cep-panel/panel.js"],
        planResult: attempt.planResult,
        runResult: attempt.run,
        openCodexApp: false
      });
    } catch (error) {
      bundle = {
        error: error.message || String(error)
      };
    }
    const record = {
      ...failure,
      markedAt: new Date().toISOString(),
      bundle
    };
    session.typedToolFailures.push(record);
    recorded.push(record);
  }
  if (recorded.length) attempt.typedToolFailures = recorded;
  return recorded;
}

function compactHardcoreAttemptForPrompt(attempt) {
  return {
    attempt: attempt && attempt.index,
    planSummary: compactHardcoreText(attempt && attempt.planResult && attempt.planResult.plan && attempt.planResult.plan.summary, 220),
    validationOk: Boolean(attempt && attempt.planResult && attempt.planResult.planValidation && attempt.planResult.planValidation.ok),
    tools: planTools(attempt && attempt.planResult && attempt.planResult.plan),
    dryRunOk: attempt && attempt.dryRun ? attempt.dryRun.ok : null,
    run: compactHardcoreRunFailure(attempt && attempt.run),
    blocker: attempt && attempt.blocker ? compactHardcoreText(attempt.blocker, 260) : null
  };
}

function buildHardcoreRetryPrompt(originalPrompt, attempts, typedToolFailures) {
  const lastAttempts = attempts.slice(-2).map(compactHardcoreAttemptForPrompt);
  const typedFailures = (typedToolFailures || []).slice(-4).map((failure) => ({
    tool: failure.tool,
    reason: failure.reason,
    promptFile: failure.bundle && failure.bundle.startPromptFile || null
  }));
  return [
    originalPrompt,
    "",
    "Agent Hardcore retry context:",
    "The previous protected attempt did not finish with verified success. Draft a repaired typed-tool AE plan.",
    typedFailures.length
      ? "One or more TypedTools were marked not working and a Codex App dev prompt was prepared for each. Continue the AE task now: prefer another typed tool if possible; if no typed tool can finish this specific workflow, use one narrow raw ExtendScript fallback with explicit inspection and read-back verification."
      : "Keep the original user intent, avoid raw ExtendScript, inspect targets before mutations, and add explicit read-back verification after mutations.",
    typedFailures.length ? "TypedTool failure handoffs:" : "",
    typedFailures.length ? JSON.stringify(typedFailures, null, 2) : "",
    "Previous attempt evidence:",
    JSON.stringify(lastAttempts, null, 2)
  ].filter(Boolean).join("\n");
}

function injectedHardcorePlanResult(plan, requestId, options) {
  const prepared = validateAgentPlanWithRepair(plan, requestId, {
    solutionHints: options && options.solutionHints || null,
    projectIntentMemory: options && options.projectIntentMemory || null
  }, {
    repairPlan: options && options.repairPlan
  });
  return {
    mode: "ae-plan",
    agentMode: "hardcore",
    requestId,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs: 0,
    planParseOk: true,
    planRepaired: false,
    planRepair: prepared.repair || null,
    planRepairApplied: Boolean(prepared.repair && prepared.repair.applied),
    plan: prepared.plan,
    planValidation: prepared.validation,
    planClassification: prepared.validation ? prepared.validation.classification : null,
    planContextSnapshot: null,
    planProjectIntentMemory: null,
    planSolutionHints: null,
    planParseError: null
  };
}

function hardcorePlanFromInjectedAttempts(args, attemptIndex, sessionId) {
  const attempts = Array.isArray(args && args.attemptPlans)
    ? args.attemptPlans
    : (args && args.plan ? [args.plan] : []);
  if (!attempts.length) return null;
  const plan = attempts[Math.min(attemptIndex - 1, attempts.length - 1)];
  return injectedHardcorePlanResult(plan, `${sessionId}-attempt-${attemptIndex}`, {
    repairPlan: args && args.repairPlan !== false
  });
}

async function draftHardcorePlan(source, args, attemptIndex, session) {
  const injected = hardcorePlanFromInjectedAttempts(args, attemptIndex, session.sessionId);
  if (injected) return injected;

  const retryPrompt = attemptIndex > 1
    ? buildHardcoreRetryPrompt(session.prompt, session.attempts, session.typedToolFailures)
    : session.prompt;
  return runAgentPlanLogged(source, {
    ...(args || {}),
    prompt: retryPrompt,
    hardcore: true,
    agentMode: "hardcore",
    reasoning_effort: optionalString(args || {}, "reasoning_effort", optionalString(args || {}, "reasoningEffort", "")) || "xhigh",
    repairPlan: args && args.repairPlan !== false,
    timeoutMs: hasArg(args || {}, "timeoutMs") ? args.timeoutMs : 120000
  });
}

function writeHardcoreSessionArtifact(session) {
  const dirName = `${new Date().toISOString().replace(/[:.]/g, "-")}-${hardcoreSessionSlug(session.prompt).slice(0, 40)}-${session.sessionId.slice(0, 8)}`;
  const dir = path.join(HARDCORE_SESSIONS_DIR, dirName);
  fs.mkdirSync(dir, { recursive: true });
  const sessionPath = path.join(dir, "session.json");
  fs.writeFileSync(sessionPath, JSON.stringify(session, null, 2) + "\n", "utf8");
  return {
    directory: normalizeBundlePath(dir),
    sessionFile: normalizeBundlePath(sessionPath)
  };
}

function buildHardcoreCandidateInput(session) {
  const finalAttempt = session.finalAttempt || session.attempts[session.attempts.length - 1] || {};
  const plan = finalAttempt.planResult && finalAttempt.planResult.plan ? finalAttempt.planResult.plan : {};
  const run = finalAttempt.run || {};
  const semantic = run.semanticVerification || {};
  const affectedTargets = Array.isArray(run.steps)
    ? run.steps.map((step) => step && (step.targetSummary || step.title || step.tool)).filter(Boolean).slice(0, 12)
    : [];
  return {
    title: session.ok ? "Agent Hardcore verified typed workflow" : "Agent Hardcore workflow needs review",
    tags: uniqueList(["hardcore", "autopilot", "typed-tool"].concat(planTools(plan)), 12),
    intent: {
      summary: compactHardcoreText(session.prompt, 500),
      appliesWhen: ["A user asks Agent Hardcore to autonomously plan, run, repair, and verify an AE workflow."]
    },
    generatedPlan: plan,
    affectedTargets,
    runResult: {
      ok: run.ok === true,
      dryRun: false,
      mutating: Boolean(run.validation && run.validation.mutatingCount > 0),
      safety: run.safety || null,
      checkpoint: run.checkpoint || null,
      errorSummary: run.error || null,
      outputSummary: session.ok ? "Autonomous protected run completed with verification." : "Autonomous protected run stopped with review evidence."
    },
    verificationReadBack: {
      summary: semantic.summary || (session.ok ? "Verified by Agent Hardcore run result." : "Needs review."),
      status: semantic.status || (session.ok ? "passed" : "needs_review"),
      evidence: Array.isArray(semantic.checks)
        ? semantic.checks.slice(0, 6).map((check) => `${check.title || check.id}: ${check.status}`)
        : []
    },
    projectAssumptions: [
      "Targets were selected or discovered through normal AE Agent inspection tools.",
      "Execution stayed inside validated Agent plan gates with checkpoint/edit-session protection."
    ],
    warnings: uniqueList((session.warnings || []).concat(session.ok ? [] : ["Session did not finish with verified success."]), 12),
    suggestedPromotionAction: {
      action: session.ok ? "promote-to-recipe" : "keep-in-quarantine",
      rationale: session.ok
        ? "Autonomous session completed through typed tools and read-back evidence."
        : "Keep in quarantine until a successful verified run exists."
    },
    provenance: {
      source: "agent-hardcore-autopilot",
      runPrefix: session.sessionId,
      planner: {
        agent: session.agentId,
        model: session.model
      }
    }
  };
}

function buildHardcoreSolution(session) {
  const finalAttempt = session.finalAttempt || {};
  const plan = finalAttempt.planResult && finalAttempt.planResult.plan ? finalAttempt.planResult.plan : {};
  const validation = finalAttempt.planResult && finalAttempt.planResult.planValidation ? finalAttempt.planResult.planValidation : {};
  const tools = planTools(plan).filter((tool) => tool !== "run_extendscript" && tool !== "run_extendscript_file");
  const deepDuplicate = tools.includes("deep_duplicate_precomp_sources");
  const id = deepDuplicate ? "deep-duplicate-precomp-fileless-source" : "agent-hardcore-autopilot-typed-workflow";
  const mutating = Number(validation.mutatingCount || 0) > 0;
  const today = new Date().toISOString().slice(0, 10);

  return {
    schema: "ae-solution.v1",
    id,
    title: deepDuplicate ? "Deep Duplicate Precomp With Fileless Sources" : "Agent Hardcore Autopilot Typed Workflow",
    status: "recipe",
    tags: uniqueList((deepDuplicate
      ? ["precomp", "source", "deep-duplicate", "fileless-footage", "solid-source", "hardcore", "typed-tool"]
      : ["hardcore", "autopilot", "typed-tool", "repair-loop"]).concat(tools), 12),
    intent: {
      summary: deepDuplicate
        ? "Duplicate a selected precomp source tree even when nested adjustment or generated solid footage has no source file."
        : "Run an Agent Hardcore request as a protected plan, dry-run, mutation, read-back, and repair loop.",
      appliesWhen: deepDuplicate
        ? [
            "The user asks to deep duplicate a selected precomp/source tree.",
            "Nested sources may include generated solids, adjustment layers, placeholders, or missing footage."
          ]
        : [
            "The user asks Agent Hardcore to handle a workflow without manual dry-run/run steps.",
            "The task can be represented with existing typed AE Agent tools."
          ]
    },
    inputs: [
      {
        name: "userPrompt",
        type: "string",
        required: true,
        description: "The user's AE workflow request."
      },
      {
        name: "selectedLayer",
        type: "layer-selection",
        required: false,
        description: "Optional selected layer or precomp source inspected before mutation."
      }
    ],
    targetAssumptions: [
      "An active composition exists when the workflow targets current selection.",
      "Targets are verified through read tools before mutation."
    ],
    execution: {
      mode: "typed-plan",
      mutating,
      riskLevel: mutating ? "medium" : "low",
      recipePath: deepDuplicate ? "recipes/deep-duplicate-precomp-fileless-source.md" : "recipes/agent-hardcore-autopilot.md",
      scriptPath: null,
      preferredTools: tools.length ? tools : ["get_active_comp", "get_selected_layers"]
    },
    requiredSafetyGates: {
      planValidation: true,
      explicitConfirmation: mutating,
      allowMutations: mutating,
      idempotency: mutating,
      checkpointOrEditSession: mutating,
      postMutationReadBack: mutating
    },
    verificationRecipe: {
      summary: "Run read-back tools after the protected run and require semantic verification to pass or report needs-review evidence.",
      steps: ["Run the typed plan through dry-run first.", "Execute through protected run gates.", "Read back affected comp/layer/source state after mutation."],
      expectedEvidence: ["Run result is ok.", "Semantic verification status is passed or not_applicable.", "Candidate evidence is stored under local ignored logs."]
    },
    testedAeContext: {
      aeVersion: null,
      panelVersion: "AE Agent 2.0.0",
      bridgeVersion: SERVER_VERSION,
      projectKind: "agent-hardcore-session",
      notes: ["Auto-promoted only after local registry validation succeeds."]
    },
    promotionHistory: [
      {
        date: today,
        from: "agent-hardcore-session",
        to: "recipe",
        reviewer: "agent-hardcore-autopilot",
        evidence: "Successful Agent Hardcore session passed local candidate and registry validation before becoming planner-visible.",
        commit: null
      }
    ],
    notes: [
      "Advisory recipe only; execution still uses normal Agent plan validation, dry-run/run gates, checkpoint/edit-session protection, idempotency, and read-back verification."
    ]
  };
}

function autoPromoteHardcoreSolution(session) {
  if (!session.ok) return { ok: true, skipped: true, reason: "Session did not finish with verified success." };
  const finalAttempt = session.finalAttempt || {};
  const plan = finalAttempt.planResult && finalAttempt.planResult.plan ? finalAttempt.planResult.plan : {};
  const tools = planTools(plan);
  if (tools.includes("run_extendscript") || tools.includes("run_extendscript_file")) {
    return { ok: true, skipped: true, reason: "Raw ExtendScript plans are kept in quarantine." };
  }

  const registryPath = hardcoreRegistryPath();
  const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
  const solution = buildHardcoreSolution(session);
  if (Array.isArray(registry.solutions) && registry.solutions.some((entry) => entry && entry.id === solution.id)) {
    return { ok: true, skipped: true, reason: "Solution already exists.", solutionId: solution.id };
  }

  const nextRegistry = {
    ...registry,
    updatedAt: new Date().toISOString().slice(0, 10),
    solutions: (registry.solutions || []).concat([solution])
  };
  validateRegistry(nextRegistry);
  fs.writeFileSync(registryPath, JSON.stringify(nextRegistry, null, 2) + "\n", "utf8");
  return { ok: true, skipped: false, solutionId: solution.id, registryPath: normalizeBundlePath(registryPath) };
}

function updateHardcoreProjectMemory(session) {
  const finalAttempt = session.finalAttempt || {};
  const plan = finalAttempt.planResult && finalAttempt.planResult.plan ? finalAttempt.planResult.plan : {};
  const tools = planTools(plan);
  const deepDuplicate = tools.includes("deep_duplicate_precomp_sources");
  const entry = {
    id: deepDuplicate ? "deep-duplicate-fileless-source-fallback" : "agent-hardcore-autopilot-loop",
    status: "active",
    category: "workflow-hint",
    title: deepDuplicate ? "Deep Duplicate Fileless Source Fallback" : "Agent Hardcore Autopilot Loop",
    summary: deepDuplicate
      ? "When deep-duplicating precomp sources, generated solids or placeholders may have no file; reuse or reconstruct them with explicit warnings instead of failing the whole run."
      : "Agent Hardcore should plan, dry-run, execute protected mutations, read back results, and retry from compact failure evidence before stopping.",
    tags: deepDuplicate
      ? ["precomp", "source", "fileless-footage", "hardcore", "readback"]
      : ["hardcore", "autopilot", "repair-loop", "readback", "checkpoint"],
    appliesWhen: deepDuplicate
      ? ["A selected precomp contains adjustment layers, generated solids, placeholders, or missing footage sources."]
      : ["The user selects Agent Hardcore for an AE workflow and expects autonomous execution."],
    priority: deepDuplicate ? 8 : 7,
    confidence: session.ok ? "high" : "medium",
    source: {
      kind: "agent-hardcore-session",
      date: new Date().toISOString().slice(0, 10),
      reviewed: true
    },
    notes: ["Memory is advisory only and never bypasses typed read tools or mutation gates."]
  };
  return updateProjectIntentMemory({
    confirm: true,
    action: "upsert",
    entry
  });
}

function persistHardcoreKnowledge(session, args) {
  const result = {
    sessionArtifact: null,
    candidate: null,
    solutionPromotion: null,
    projectMemory: null,
    errors: []
  };

  try {
    result.sessionArtifact = writeHardcoreSessionArtifact(session);
  } catch (error) {
    result.errors.push(`session artifact: ${error.message || String(error)}`);
  }

  try {
    const candidate = writeSolutionCandidateReport(buildHardcoreCandidateInput(session), {
      source: "agent-hardcore-autopilot"
    });
    result.candidate = {
      candidateId: candidate.report.candidate.id,
      path: normalizeBundlePath(candidate.path),
      warnings: candidate.report.candidate.warnings.length
    };
  } catch (error) {
    result.errors.push(`candidate report: ${error.message || String(error)}`);
  }

  if (optionalBoolean(args || {}, "autoPromoteKnowledge", true)) {
    try {
      result.solutionPromotion = autoPromoteHardcoreSolution(session);
    } catch (error) {
      result.solutionPromotion = { ok: false, error: error.message || String(error) };
      result.errors.push(`solution promotion: ${error.message || String(error)}`);
    }

    try {
      const memory = updateHardcoreProjectMemory(session);
      result.projectMemory = memory.ok
        ? { ok: true, memoryPath: normalizeBundlePath(memory.memoryPath), activeCount: memory.registry && memory.registry.activeCount }
        : { ok: false, error: memory.error || "Project memory update failed." };
      if (!memory.ok) result.errors.push(`project memory: ${memory.error || "update failed"}`);
    } catch (error) {
      result.projectMemory = { ok: false, error: error.message || String(error) };
      result.errors.push(`project memory: ${error.message || String(error)}`);
    }
  }

  return result;
}

async function runAgentHardcoreSession(source, args) {
  args = args || {};
  const prompt = optionalString(args, "prompt", optionalString(args, "message", "")).trim();
  if (!prompt && !args.plan && !Array.isArray(args.attemptPlans)) {
    throw new Error("prompt is required for Agent Hardcore autopilot.");
  }

  const session = {
    schema: "ae-agent-hardcore-session.v1",
    sessionId: crypto.randomUUID(),
    source,
    startedAt: new Date().toISOString(),
    prompt: prompt || "Injected Agent Hardcore plan",
    agentId: optionalString(args, "agentId", optionalString(args, "agent", "")) || null,
    model: optionalString(args, "model", "") || null,
    maxAttempts: Math.max(1, Math.min(5, Math.floor(optionalNumber(args, "maxAttempts", 3)))),
    projectOwner: optionalBoolean(args, "projectOwner", true),
    reasoningEffort: optionalString(args, "reasoning_effort", optionalString(args, "reasoningEffort", "")) || "xhigh",
    allowMutations: optionalBoolean(args, "allowMutations", true),
    autoEditSession: optionalBoolean(args, "autoEditSession", true),
    allowRawFallback: optionalBoolean(args, "allowRawFallback", true),
    rawFallbackUsed: false,
    typedToolFailures: [],
    autoPromoteKnowledge: optionalBoolean(args, "autoPromoteKnowledge", true),
    attempts: [],
    repairHistory: [],
    warnings: [],
    artifacts: null,
    ok: false,
    finalAttempt: null,
    finalPlanResult: null,
    finalRun: null
  };

  appendAiChatEvent("hardcore_session_started", {
    sessionId: session.sessionId,
    source,
    agentId: session.agentId,
    model: session.model,
    maxAttempts: session.maxAttempts,
    reasoningEffort: session.reasoningEffort,
    projectOwner: session.projectOwner
  });

  for (let attemptIndex = 1; attemptIndex <= session.maxAttempts; attemptIndex++) {
    const attempt = {
      index: attemptIndex,
      startedAt: new Date().toISOString(),
      planResult: null,
      dryRun: null,
      run: null,
      status: "started",
      blocker: null
    };
    session.attempts.push(attempt);

    try {
      attempt.planResult = await draftHardcorePlan(source, args, attemptIndex, session);
      if (attempt.planResult && attempt.planResult.planRepair) {
        session.repairHistory.push({
          attempt: attemptIndex,
          planRepair: attempt.planResult.planRepair
        });
      }
      if (!attempt.planResult || !attempt.planResult.plan || !attempt.planResult.planValidation || !attempt.planResult.planValidation.ok) {
        attempt.status = "plan-needs-review";
        attempt.blocker = attempt.planResult && attempt.planResult.planParseError || "Plan validation failed.";
        continue;
      }
      if (!attempt.planResult.m100ActionProposal) {
        attempt.planResult.m100ConfirmationSurface = "agent-hardcore";
        attempt.planResult.m100ConfirmationSessionId = session.sessionId;
        attempt.planResult.m100ActionProposal = createM100AgentPlanProposal(attempt.planResult);
      }
      const attemptM100Proposal = attempt.planResult.m100ActionProposal || null;
      const rawStepCount = rawExtendscriptStepCount(attempt.planResult.planValidation);
      const rawFallbackAllowed = Boolean(session.allowRawFallback && session.typedToolFailures.length > 0 && rawStepCount > 0);

      attempt.dryRun = await runValidatedAgentPlan({
        ...m100RunFieldsForProposal(attemptM100Proposal, false),
        plan: attempt.planResult.plan,
        requestId: attempt.planResult.requestId,
        dryRun: true,
        repairPlan: true,
        maxSteps: optionalNumber(args, "maxSteps", 30)
      });
      if (!attempt.dryRun.ok) {
        attempt.status = "dry-run-needs-review";
        attempt.blocker = attempt.dryRun.error || "Dry run failed.";
        continue;
      }
      const rawDryRunId = rawFallbackAllowed && attempt.dryRun.safety && attempt.dryRun.safety.rawExtendscriptGate
        ? attempt.dryRun.safety.rawExtendscriptGate.dryRunId
        : "";

      attempt.run = await runValidatedAgentPlan({
        ...m100RunFieldsForProposal(attemptM100Proposal, true),
        plan: attempt.planResult.plan,
        requestId: attempt.planResult.requestId,
        dryRun: false,
        confirm: true,
        allowMutations: session.allowMutations,
        autoEditSession: session.autoEditSession,
        allowRawExtendscript: rawFallbackAllowed,
        rawExtendscriptDryRunId: rawDryRunId,
        repairPlan: true,
        maxSteps: optionalNumber(args, "maxSteps", 30)
      });
      if (rawFallbackAllowed) {
        attempt.rawFallback = {
          allowed: true,
          dryRunId: rawDryRunId || null
        };
        if (attempt.run && attempt.run.executedCount > 0) session.rawFallbackUsed = true;
      }

      const executablePlanBlocker = hardcoreExecutablePlanBlocker(attempt);
      if (executablePlanBlocker) {
        attempt.status = "run-needs-tool-plan";
        attempt.blocker = executablePlanBlocker;
        continue;
      }

      if (hardcoreAttemptSucceeded(attempt)) {
        attempt.status = "verified";
        session.ok = true;
        session.finalAttempt = attempt;
        session.finalPlanResult = attempt.planResult;
        session.finalRun = attempt.run;
        break;
      }

      attempt.status = "run-needs-review";
      attempt.blocker = attempt.run && (attempt.run.error || attempt.run.recoveryHint) || "Run did not pass semantic verification.";
      const typedFailures = recordHardcoreTypedToolFailures(session, attempt);
      for (const failure of typedFailures) {
        session.warnings.push(`TypedTool ${failure.tool} marked not working; Codex App prompt: ${failure.bundle && failure.bundle.startPromptFile || "bundle unavailable"}.`);
      }
      if (attempt.run && attempt.run.safety && attempt.run.safety.saveProjectFirst) {
        break;
      }
    } catch (error) {
      attempt.status = "failed";
      attempt.blocker = error.message || String(error);
      if (error.readiness || error.providerError) {
        attempt.providerError = error.providerError || null;
        attempt.readiness = error.readiness || null;
        break;
      }
    } finally {
      attempt.finishedAt = new Date().toISOString();
    }
  }

  if (!session.finalAttempt) {
    session.finalAttempt = session.attempts[session.attempts.length - 1] || null;
    session.finalPlanResult = session.finalAttempt && session.finalAttempt.planResult || null;
    session.finalRun = session.finalAttempt && session.finalAttempt.run || null;
  }
  session.finishedAt = new Date().toISOString();
  session.status = session.ok ? "verified" : "needs_review";
  session.artifacts = persistHardcoreKnowledge(session, args);

  appendAiChatEvent("hardcore_session_finished", {
    sessionId: session.sessionId,
    source,
    status: session.status,
    ok: session.ok,
    attempts: session.attempts.length,
    typedToolFailures: session.typedToolFailures.length,
    rawFallbackUsed: session.rawFallbackUsed,
    artifact: session.artifacts && session.artifacts.sessionArtifact ? session.artifacts.sessionArtifact.sessionFile : null,
    candidate: session.artifacts && session.artifacts.candidate ? session.artifacts.candidate.path : null
  });

  return session;
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeBundlePath(filePath) {
  const relative = path.relative(PROJECT_ROOT, filePath);
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative)
    ? relative.replace(/\\/g, "/")
    : path.basename(filePath);
}

function safeDevRequestId(value) {
  const source = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const suffix = crypto.randomBytes(3).toString("hex");
  return `${stamp}-${source || "typed-tool-request"}-${suffix}`;
}

function redactDevRequestText(value, limit = 4000) {
  let text = String(value === undefined || value === null ? "" : value);
  if (PROJECT_ROOT) text = text.replace(new RegExp(escapeRegExp(PROJECT_ROOT), "gi"), "<project-root>");
  if (process.env.USERPROFILE) text = text.replace(new RegExp(escapeRegExp(process.env.USERPROFILE), "gi"), "<user-profile>");
  if (process.env.LOCALAPPDATA) text = text.replace(new RegExp(escapeRegExp(process.env.LOCALAPPDATA), "gi"), "<local-app-data>");
  if (process.env.APPDATA) text = text.replace(new RegExp(escapeRegExp(process.env.APPDATA), "gi"), "<app-data>");
  text = text
    .replace(/\b(OPENAI_API_KEY|OPENAI_KEY|ANTHROPIC_API_KEY|CLAUDE_API_KEY|GEMINI_API_KEY|GOOGLE_API_KEY|OPENROUTER_API_KEY|OPENROUTER_KEY|AE_BRIDGE_TOKEN|CEP_PANEL_BRIDGE_TOKEN)\b\s*[:=]\s*["']?[^"',\s)]+/gi, "$1=<redacted>")
    .replace(/\bBearer\s+[A-Za-z0-9._-]{12,}/gi, "Bearer <redacted>")
    .replace(/\bsk-[A-Za-z0-9_-]{12,}/g, "<redacted-openai-key>")
    .replace(/\bAIza[0-9A-Za-z_-]{20,}/g, "<redacted-google-key>");
  if (text.length > limit) return `${text.slice(0, Math.max(0, limit - 14)).trim()}\n...<truncated>`;
  return text;
}

function sanitizeDevRequestValue(value, depth = 0) {
  if (depth > 5) return "<truncated-depth>";
  if (value === undefined) return null;
  if (value === null || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "string") return redactDevRequestText(value, 5000);
  if (Array.isArray(value)) return value.slice(0, 40).map((item) => sanitizeDevRequestValue(item, depth + 1));
  if (typeof value === "object") {
    const output = {};
    const keys = Object.keys(value).slice(0, 80);
    for (const key of keys) {
      output[key] = /token|apiKey|secret|authorization|password/i.test(key)
        ? "<redacted>"
        : sanitizeDevRequestValue(value[key], depth + 1);
    }
    if (Object.keys(value).length > keys.length) output.__truncatedKeys = Object.keys(value).length - keys.length;
    return output;
  }
  return redactDevRequestText(value, 1000);
}

function normalizeAcceptanceCriteria(value) {
  const source = Array.isArray(value) ? value : String(value || "").split(/\r?\n/);
  const criteria = source
    .map((item) => redactDevRequestText(item, 300).trim())
    .filter(Boolean)
    .slice(0, 12);
  return criteria.length ? criteria : [
    "Implement one narrow typed bridge or panel capability for this AE workflow.",
    "Keep normal AE execution routed through validated Agent plans and safety gates.",
    "Add focused smoke coverage for the new behavior."
  ];
}

function normalizeTargetFiles(value) {
  const source = Array.isArray(value) ? value : [];
  const fallback = [
    "mcp-server/bridge-daemon.js",
    "cep-panel/panel.js",
    "scripts/smoke-test.js"
  ];
  const files = [];
  for (const item of source.concat(fallback)) {
    const text = redactDevRequestText(item, 240).replace(/\\/g, "/").trim();
    if (!text || text.startsWith("..") || path.isAbsolute(text)) continue;
    if (!files.includes(text)) files.push(text);
    if (files.length >= 8) break;
  }
  return files;
}

function collectDevRequestSignals(planResult, runResult, reason) {
  const signals = [];
  const validation = planResult && planResult.planValidation ? planResult.planValidation : runResult && runResult.validation ? runResult.validation : null;
  const classification = validation && validation.classification ? validation.classification : null;
  if (reason) signals.push(reason);
  if (classification && classification.category) signals.push(`Plan classification: ${classification.category}.`);
  if (classification && classification.rawExtendscriptStepCount > 0) signals.push(`${classification.rawExtendscriptStepCount} raw ExtendScript step(s) were planned.`);
  if (classification && classification.runRecommendation) signals.push(`Run recommendation: ${classification.runRecommendation}`);
  if (runResult && runResult.ok === false && runResult.error) signals.push(`Run error: ${runResult.error}`);
  if (runResult && runResult.semanticVerification && runResult.semanticVerification.status === "needs_review") {
    signals.push(`Semantic verification needs review: ${runResult.semanticVerification.summary || "no summary"}`);
  }
  return signals.map((item) => redactDevRequestText(item, 500)).filter(Boolean).slice(0, 12);
}

function rawExtendscriptCandidatesFromPlan(planResult) {
  const plan = planResult && planResult.plan ? planResult.plan : null;
  const steps = plan && Array.isArray(plan.steps) ? plan.steps : [];
  const candidates = [];
  for (const step of steps) {
    if (!step || (step.tool !== "run_extendscript" && step.tool !== "run_extendscript_file")) continue;
    const args = step.args || {};
    if (args.script) {
      candidates.push({
        title: step.title || step.intent || "Raw ExtendScript candidate",
        tool: step.tool,
        script: redactDevRequestText(args.script, 20000)
      });
    } else if (args.filePath) {
      candidates.push({
        title: step.title || step.intent || "Raw ExtendScript file candidate",
        tool: step.tool,
        filePath: redactDevRequestText(args.filePath, 1000)
      });
    }
  }
  return candidates.slice(0, 4);
}

function buildDevRequestMarkdown(bundle) {
  const criteria = bundle.acceptanceCriteria.map((item) => `- ${item}`).join("\n");
  const signals = bundle.signals.length ? bundle.signals.map((item) => `- ${item}`).join("\n") : "- No specific tool gap signal was provided.";
  const targetFiles = bundle.targetFiles.map((item) => `- ${item}`).join("\n");
  return [
    `# AE Agent Typed Tool Request: ${bundle.title}`,
    "",
    "## Goal",
    bundle.goal,
    "",
    "## Why This Escalated",
    signals,
    "",
    "## Desired Tool Or Panel Change",
    bundle.desiredTool,
    "",
    "## Acceptance Criteria",
    criteria,
    "",
    "## Evidence",
    `- Compact evidence: \`${bundle.evidenceFile}\``,
    bundle.candidateFile ? `- Raw workaround candidate: \`${bundle.candidateFile}\`` : "- No raw workaround candidate was captured.",
    "",
    "## Targeted Files",
    targetFiles,
    "",
    "## Development Boundary",
    "- Work on one narrow typed tool or panel change only.",
    "- Do not continue the long AE chat here.",
    "- Do not broadly scan the repository before reading this bundle.",
    "- Use targeted search only if the listed files do not contain the relevant implementation point.",
    "- Keep AE mutations routed through validated Agent plans, checkpoints/edit sessions, idempotency, and read-back verification."
  ].join("\n");
}

function buildStartPromptMarkdown(bundle) {
  const targetFiles = bundle.targetFiles.map((item) => `- ${item}`).join("\n");
  return [
    `Continue development in the current AE Agent workspace for dev request \`${bundle.id}\`.`,
    "",
    "Read only these files first:",
    `- ${bundle.requestFile}`,
    `- ${bundle.evidenceFile}`,
    bundle.candidateFile ? `- ${bundle.candidateFile}` : "",
    "- specs/target-app.md",
    "- plans/target-app-execplan.md",
    "",
    "Then read only these targeted files:",
    targetFiles,
    "",
    "Do not broadly scan the whole repo. If the needed point is not found in the targeted files, use targeted rg by tool/API/UI-control name and record the reason.",
    "",
    "Task: implement one narrow typed tool or one narrow panel fix that closes this AE workflow without overloading the AE chat. After implementation, run relevant checks, update plan/handoff by milestone rules, and make one reviewable commit."
  ].filter(Boolean).join("\n");
}

function writeCandidateFile(bundleDir, candidates) {
  if (!candidates.length) return null;
  const lines = [
    "// Captured raw ExtendScript workaround for typed-tool review.",
    "// Do not run this directly from the dev request. Convert to a typed bridge tool when possible.",
    ""
  ];
  candidates.forEach((candidate, index) => {
    lines.push(`// Candidate ${index + 1}: ${candidate.title}`);
    lines.push(`// Source tool: ${candidate.tool}`);
    if (candidate.filePath) lines.push(`// Original file path: ${candidate.filePath}`);
    if (candidate.script) lines.push(candidate.script);
    lines.push("");
  });
  const filePath = path.join(bundleDir, "candidate.jsx");
  fs.writeFileSync(filePath, lines.join("\n"), "utf8");
  return filePath;
}

function createDevRequestBundle(args) {
  const goal = redactDevRequestText(optionalString(args, "goal", optionalString(args, "prompt", "AE Agent typed tool request")), 1200).trim();
  const title = redactDevRequestText(optionalString(args, "title", goal || "Typed tool request"), 120).replace(/\s+/g, " ").trim() || "Typed tool request";
  const id = safeDevRequestId(title);
  const bundleDir = path.join(DEV_REQUESTS_DIR, id);
  fs.mkdirSync(bundleDir, { recursive: true });

  const planResult = sanitizeDevRequestValue(args.planResult || null);
  const runResult = sanitizeDevRequestValue(args.runResult || null);
  const desiredTool = redactDevRequestText(optionalString(args, "desiredTool", "A narrow typed AE Agent bridge or panel tool for this workflow."), 1200).trim();
  const acceptanceCriteria = normalizeAcceptanceCriteria(args.acceptanceCriteria);
  const targetFiles = normalizeTargetFiles(args.targetFiles);
  const signals = collectDevRequestSignals(planResult, runResult, optionalString(args, "reason", ""));
  const rawCandidates = rawExtendscriptCandidatesFromPlan(planResult);

  const evidence = {
    schema: "ae-agent-dev-request-evidence.v1",
    id,
    createdAt: new Date().toISOString(),
    source: redactDevRequestText(optionalString(args, "source", "cep-panel"), 80),
    goal,
    desiredTool,
    signals,
    targetFiles,
    planResult,
    runResult,
    candidateId: redactDevRequestText(optionalString(args, "candidateId", ""), 200) || null,
    candidateReport: sanitizeDevRequestValue(args.candidateReport || null),
    notes: [
      "This bundle is local and ignored by git under logs/dev-requests by default.",
      "It intentionally contains compact evidence, not full chat history or provider secrets."
    ]
  };

  const candidateFilePath = writeCandidateFile(bundleDir, rawCandidates);
  const bundle = {
    id,
    title,
    goal,
    desiredTool,
    acceptanceCriteria,
    signals,
    targetFiles,
    requestFile: normalizeBundlePath(path.join(bundleDir, "request.md")),
    evidenceFile: normalizeBundlePath(path.join(bundleDir, "ae-evidence.json")),
    startPromptFile: normalizeBundlePath(path.join(bundleDir, "start-prompt.md")),
    candidateFile: candidateFilePath ? normalizeBundlePath(candidateFilePath) : null
  };
  const startPrompt = buildStartPromptMarkdown(bundle);

  fs.writeFileSync(path.join(bundleDir, "ae-evidence.json"), JSON.stringify(evidence, null, 2) + "\n", "utf8");
  fs.writeFileSync(path.join(bundleDir, "request.md"), buildDevRequestMarkdown(bundle) + "\n", "utf8");
  fs.writeFileSync(path.join(bundleDir, "start-prompt.md"), startPrompt + "\n", "utf8");

  recordEvent("agent_dev_request_created", {
    id,
    requestFile: bundle.requestFile,
    evidenceFile: bundle.evidenceFile,
    startPromptFile: bundle.startPromptFile,
    candidateFile: bundle.candidateFile
  });

  return {
    ...bundle,
    directory: normalizeBundlePath(bundleDir),
    startPrompt
  };
}

function launchCodexAppForDevRequest() {
  const status = aiAgents.getCodexCliStatus ? aiAgents.getCodexCliStatus() : null;
  if (!status || !status.installed || !status.command) {
    return {
      launched: false,
      error: status && status.error ? status.error : "Codex CLI was not found."
    };
  }
  try {
    const child = spawn(status.command, ["app", PROJECT_ROOT], {
      cwd: PROJECT_ROOT,
      env: process.env,
      detached: true,
      stdio: "ignore",
      windowsHide: true
    });
    child.on("error", (error) => {
      recordEvent("agent_dev_request_codex_app_error", {
        error: error.message || String(error)
      });
    });
    child.unref();
    return {
      launched: true,
      pid: child.pid || null,
      command: redactDevRequestText(status.command, 500),
      autoChatCreated: false,
      note: "Codex App launch can open the project, but creating a new chat from a bundle is still manual in v1."
    };
  } catch (error) {
    return {
      launched: false,
      error: error.message || String(error)
    };
  }
}

function rawExtendscriptStepCount(validation) {
  const classificationCount = Number(validation && validation.classification && validation.classification.rawExtendscriptStepCount || 0);
  if (classificationCount > 0) return classificationCount;
  return Array.isArray(validation && validation.steps)
    ? validation.steps.filter((step) => step && (step.tool === "run_extendscript" || step.tool === "run_extendscript_file")).length
    : 0;
}

function captureRawExtendscriptFallbackCandidate(run, plan, validation, options) {
  if (!run || run.dryRun || run.ok !== true || rawExtendscriptStepCount(validation) <= 0) return null;

  const candidateInput = buildRawExtendscriptFallbackCandidateInput({
    source: "agent-plan-raw-fallback",
    requestId: options && options.requestId || null,
    userPrompt: options && options.userPrompt || null,
    planner: options && options.planner || null,
    plan,
    validation,
    run
  });
  const artifact = writeSolutionCandidateReport(candidateInput, {
    source: "agent-plan-raw-fallback"
  });
  const captured = {
    candidateId: artifact.report.candidate.id,
    path: normalizeBundlePath(artifact.path),
    warnings: artifact.report.candidate.warnings.length,
    plannerVisible: artifact.report.safety.plannerVisible,
    quarantineOnly: artifact.report.safety.quarantineOnly,
    suggestedAction: artifact.report.candidate.suggestedPromotionAction.action
  };
  recordEvent("agent_raw_extendscript_candidate_captured", {
    runId: run.id || null,
    requestId: options && options.requestId || null,
    candidateId: captured.candidateId,
    candidateFile: captured.path,
    suggestedAction: captured.suggestedAction
  });
  return captured;
}

function planDryRunApprovalKey(plan, requestId) {
  const hash = crypto.createHash("sha256");
  hash.update(String(requestId || ""));
  hash.update("\n");
  hash.update(JSON.stringify(plan || {}));
  return hash.digest("hex");
}

function pruneRawExtendscriptDryRunApprovals(now = Date.now()) {
  for (const [key, approval] of rawExtendscriptDryRunApprovals.entries()) {
    if (!approval || Number(approval.expiresAtMs || 0) <= now) {
      rawExtendscriptDryRunApprovals.delete(key);
    }
  }
}

function recordRawExtendscriptDryRunApproval(run, plan, requestId, validation) {
  if (!run || !run.id || !validation || rawExtendscriptStepCount(validation) <= 0) return null;
  const now = Date.now();
  pruneRawExtendscriptDryRunApprovals(now);
  const approval = {
    key: planDryRunApprovalKey(plan, requestId),
    dryRunId: run.id,
    requestId: requestId || null,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + RAW_EXTENDSCRIPT_DRY_RUN_APPROVAL_TTL_MS).toISOString(),
    expiresAtMs: now + RAW_EXTENDSCRIPT_DRY_RUN_APPROVAL_TTL_MS
  };
  rawExtendscriptDryRunApprovals.set(approval.key, approval);
  return approval;
}

function rawExtendscriptRunApproval(validation, plan, requestId, dryRunId, allowRawExtendscript) {
  const classification = validation && validation.classification ? validation.classification : null;
  if (!classification || classification.blocksRun !== true) return { ok: true, approval: null };
  if (rawExtendscriptStepCount(validation) <= 0 || classification.allowsDryRun === false) {
    return { ok: false, error: classification.runRecommendation || "Plan classification blocks run." };
  }
  if (!allowRawExtendscript) {
    return { ok: false, error: "Raw ExtendScript requires allowRawExtendscript:true after a successful dry run." };
  }
  const key = planDryRunApprovalKey(plan, requestId);
  pruneRawExtendscriptDryRunApprovals();
  const approval = rawExtendscriptDryRunApprovals.get(key);
  if (!approval || approval.dryRunId !== dryRunId) {
    return { ok: false, error: "Run raw ExtendScript only after a successful dry run of the same current plan." };
  }
  return { ok: true, approval };
}

async function runValidatedAgentPlan(options) {
  options = resolveM100PlanRunOptions(options || {});
  const prepared = validateAgentPlanWithRepair(options.plan, options.requestId || null, {
    solutionHints: options.solutionHints || options.planSolutionHints || null,
    projectIntentMemory: options.projectIntentMemory || options.planProjectIntentMemory || null
  }, {
    repairPlan: options.repairPlan
  });
  const validation = prepared.validation;
  const dryRun = optionalBoolean(options, "dryRun", true);
  const confirm = optionalBoolean(options, "confirm", false);
  const allowMutations = optionalBoolean(options, "allowMutations", false);
  const autoEditSession = optionalBoolean(options, "autoEditSession", false);
  const allowRuntimeBindings = optionalBoolean(options, "allowRuntimeBindings", true);
  const allowWithoutCheckpoint = optionalBoolean(options, "allowWithoutCheckpoint", false);
  const allowRawExtendscript = optionalBoolean(options, "allowRawExtendscript", false);
  const rawExtendscriptDryRunId = optionalString(options, "rawExtendscriptDryRunId", "");
  const stopOnError = optionalBoolean(options, "stopOnError", true);
  const maxSteps = Math.max(1, Math.min(50, Math.floor(optionalNumber(options, "maxSteps", 20))));
  const mutatingExecution = !dryRun && validation.mutatingCount > 0;
  const checkpointStepPresent = hasCheckpointStep(validation);
  const activeEditSessionAtStart = Boolean(activeEditSession);

  const run = {
    id: crypto.randomUUID(),
    startedAt: new Date().toISOString(),
    dryRun,
    confirm,
    allowMutations,
    autoEditSession,
    validation,
    classification: validation.classification || null,
    planRepair: prepared.repair || null,
    executedCount: 0,
    skippedCount: 0,
    failedCount: 0,
    steps: [],
    safety: {
      mutatingExecution,
      checkpointStepPresent,
      activeEditSessionAtStart,
      autoEditSession,
      allowWithoutCheckpoint,
      allowRawExtendscript,
      protection: activeEditSessionAtStart
        ? "active_edit_session"
        : checkpointStepPresent
          ? "planned_checkpoint_step"
          : null
    }
  };
  if (activeEditSessionAtStart) {
    run.editSession = compactEditSession(activeEditSession);
  }
  if (prepared.repair && prepared.repair.applied) {
    run.repairedPlan = prepared.plan;
  }

  function finishRun() {
    run.finishedAt = new Date().toISOString();
    if (typeof run.ok !== "boolean") {
      run.ok = run.failedCount === 0 && !run.steps.some((step) => step.status === "blocked");
    }
    if (!run.dryRun && validation.mutatingCount > 0 && !run.semanticVerification) {
      run.semanticVerification = buildSemanticVerification(prepared.plan, run);
    }
    if (!run.dryRun && run.ok === true && rawExtendscriptStepCount(validation) > 0) {
      try {
        const candidate = captureRawExtendscriptFallbackCandidate(run, prepared.plan, validation, options || {});
        if (candidate) {
          run.artifacts = run.artifacts || {};
          run.artifacts.candidate = candidate;
          run.safety.rawExtendscriptCandidate = {
            status: "captured",
            candidateId: candidate.candidateId,
            path: candidate.path,
            quarantineOnly: candidate.quarantineOnly,
            plannerVisible: candidate.plannerVisible
          };
        }
      } catch (error) {
        run.warnings = run.warnings || [];
        run.warnings.push(`Raw ExtendScript candidate capture failed: ${error.message || String(error)}`);
        recordEvent("agent_raw_extendscript_candidate_capture_failed", {
          runId: run.id || null,
          requestId: options && options.requestId || null,
          error: error.message || String(error)
        });
      }
    }
    if (run.dryRun && run.ok) {
      const approval = recordRawExtendscriptDryRunApproval(run, prepared.plan, options.requestId || null, validation);
      if (approval) {
        run.safety.rawExtendscriptGate = {
          status: "dry-run-approved",
          dryRunId: approval.dryRunId,
          expiresAt: approval.expiresAt
        };
      }
    }
    if (!run.ok && !run.recoveryHint) {
      run.recoveryHint = planRunRecoveryHint(run);
    }
    if (options._m100ActionProposal) {
      const actionRecord = options._m100ActionRecord || null;
      if (actionRecord && !run.dryRun && actionRecord.executionState === "executing") {
        actionRecord.executionState = run.ok ? "completed" : "failed";
        actionRecord.executionId = run.id;
        actionRecord.finishedAt = run.finishedAt;
      }
      run.m100Action = {
        actionId: options._m100ActionProposal.actionId,
        payloadRef: options._m100PayloadRef || options._m100ActionProposal.action.payloadRef,
        payloadHash: options._m100ActionProposal.action.payloadHash,
        previewHash: options._m100ActionProposal.action.previewHash,
        riskLevel: options._m100ActionProposal.risk && options._m100ActionProposal.risk.level || null,
        riskPolicyVersion: options._m100ActionProposal.confirmation.riskPolicyVersion,
        proposalExpiresAt: options._m100ActionProposal.confirmation.proposalExpiresAt,
        confirmationState: actionRecord ? m100ActionRecordState(actionRecord) : "resolved",
        confirmedAt: actionRecord && actionRecord.confirmedAt || null,
        confirmedBySurface: actionRecord && actionRecord.confirmedBySurface || null,
        confirmedBySession: actionRecord && actionRecord.confirmedBySession || null
      };
      run.m100Message = m100Protocol.createActionResultEnvelope({
        ok: run.ok,
        requestId: options.requestId || options._m100ActionProposal.requestId,
        actionId: options._m100ActionProposal.actionId,
        executionId: run.id,
        summary: run.ok ? "Agent plan run finished." : run.error || "Agent plan run failed.",
        error: run.error || "Agent plan run failed.",
        phase: run.ok ? "ae_execution" : m100PlanRunFailurePhase(run),
        code: run.ok ? undefined : m100PlanRunFailureCode(run),
        rawPreview: run.ok ? undefined : m100PlanRunRawPreview(run)
      });
    }
    attachM100PlanRunDiagnostic(run, options);
    return run;
  }

  if (!validation.ok) {
    run.ok = false;
    run.error = "Plan validation failed.";
    return finishRun();
  }
  if (!dryRun && m100PlanRequiresConfirmation(validation) && !options._m100ActionRecord) {
    run.ok = false;
    run.error = "A server-owned M100 action proposal is required to run mutating, destructive, or raw ExtendScript plan steps.";
    run.errorCode = "m100_confirmation_required";
    run.safety.status = "blocked_m100_confirmation_required";
    run.safety.m100 = {
      code: "proposal_required",
      riskPolicyVersion: M100_RISK_POLICY_VERSION,
      reason: "client-authored confirm:true is not an execution authority for mutating/destructive/raw plan steps"
    };
    return finishRun();
  }
  if (dryRun && validation.ok !== true && validation.classification && validation.classification.allowsDryRun === false) {
    run.ok = false;
    run.error = validation.classification.runRecommendation || "Plan classification blocks dry-run.";
    return finishRun();
  }
  if (!dryRun && validation.classification && validation.classification.blocksRun === true && rawExtendscriptStepCount(validation) > 0) {
    const rawApproval = rawExtendscriptRunApproval(validation, prepared.plan, options.requestId || null, rawExtendscriptDryRunId, allowRawExtendscript);
    if (!rawApproval.ok) {
      run.ok = false;
      run.error = rawApproval.error || validation.classification.runRecommendation || "Plan classification blocks run.";
      run.safety.status = "blocked_raw_extendscript_gate";
      return finishRun();
    }
    if (rawApproval.approval) {
      run.safety.rawExtendscriptGate = {
        status: "approved",
        dryRunId: rawApproval.approval.dryRunId,
        expiresAt: rawApproval.approval.expiresAt
      };
    }
  }
  if (!dryRun && !confirm) {
    run.ok = false;
    run.error = "confirm:true is required to run a plan.";
    return finishRun();
  }
  if (!dryRun && validation.mutatingCount > 0 && !allowMutations) {
    run.ok = false;
    run.error = "allowMutations:true is required to run mutating plan steps.";
    return finishRun();
  }
  if (!dryRun && options._m100ActionRecord) {
    try {
      confirmM100ActionProposal(options._m100ActionRecord, options, run);
      options._m100ActionRecord.executionState = "executing";
    } catch (error) {
      run.ok = false;
      run.error = error.message || String(error);
      run.errorCode = error.code || "m100_confirmation_failed";
      run.safety.status = "blocked_m100_confirmation_failed";
      run.safety.m100 = {
        code: run.errorCode,
        actionId: options._m100ActionRecord.actionId,
        state: m100ActionRecordState(options._m100ActionRecord),
        proposalExpiresAt: options._m100ActionRecord.proposalExpiresAt
      };
      return finishRun();
    }
  }
  if (mutatingExecution && !activeEditSessionAtStart && !checkpointStepPresent) {
    if (!autoEditSession) {
      run.ok = false;
      run.error = "autoEditSession:true is required to run a mutating plan without an existing edit session or checkpoint step.";
      run.safety.status = "blocked_missing_edit_session";
      return finishRun();
    }

    const started = await startPlanRunEditSession(run, validation);
    if (!started.ok) {
      run.ok = false;
      run.error = started.error;
      run.safety.status = started.saveProjectFirst ? "blocked_save_project_first" : "blocked_edit_session_failed";
      run.safety.error = started.rawError;
      run.safety.saveProjectFirst = started.saveProjectFirst;
      run.editSessionStart = started.payload || null;
      return finishRun();
    }

    run.safety.status = "protected";
    run.safety.protection = "auto_edit_session";
    run.editSession = started.session;
    run.checkpoint = started.checkpoint;
  }

  const executedSteps = [];
  const autoStartedEditSession = mutatingExecution && run.safety.protection === "auto_edit_session";
  let checkpointProtectionReady = !mutatingExecution || Boolean(activeEditSession) || autoStartedEditSession;
  const steps = validation.steps.slice(0, maxSteps);
  for (const step of steps) {
    const item = {
      index: step.index,
      title: step.title,
      tool: step.tool,
      targetSummary: step.targetSummary || "",
      dryRun,
      mutatesProject: step.mutatesProject,
      status: "pending"
    };

    if (!step.tool) {
      item.status = "skipped";
      item.reason = "No tool for this step.";
      run.skippedCount += 1;
      run.steps.push(item);
      continue;
    }
    if (!step.executable && (!allowRuntimeBindings || !step.requiresRuntimeBinding)) {
      item.status = "blocked";
      item.reason = step.requiresRuntimeBinding ? "Runtime binding is required." : "Step is not executable.";
      item.validation = step;
      run.skippedCount += 1;
      run.steps.push(item);
      if (stopOnError) break;
      continue;
    }
    if (step.mutatesProject && !allowMutations) {
      item.status = dryRun ? "ready" : "blocked";
      item.reason = dryRun ? null : "Mutations are not allowed.";
      item.args = step.safeArgs;
      run.steps.push(item);
      if (!dryRun) run.skippedCount += 1;
      if (!dryRun && stopOnError) break;
      continue;
    }
    if (!dryRun && step.mutatesProject && !checkpointProtectionReady) {
      item.status = "blocked";
      item.reason = "Checkpoint/edit session protection was not established before this mutating step.";
      item.args = step.safeArgs;
      run.skippedCount += 1;
      run.steps.push(item);
      if (stopOnError) break;
      continue;
    }
    if ((step.tool === "run_extendscript" || step.tool === "run_extendscript_file") && !allowRawExtendscript) {
      item.status = "blocked";
      item.reason = "Raw ExtendScript requires allowRawExtendscript:true.";
      run.skippedCount += 1;
      run.steps.push(item);
      if (stopOnError) break;
      continue;
    }

    const bound = applyPlanRuntimeBindings(step, executedSteps);
    item.args = bound.args;
    if (bound.unresolved.length) {
      if (dryRun) {
        item.status = "ready";
        item.reason = `Runtime bindings will resolve during run: ${formatUnresolvedRuntimeBindings(bound)}`;
        item.unresolved = bound.unresolved;
        run.steps.push(item);
        continue;
      }
      item.status = "blocked";
      item.reason = `Unresolved runtime bindings: ${formatUnresolvedRuntimeBindings(bound)}`;
      item.unresolved = bound.unresolved;
      run.skippedCount += 1;
      run.steps.push(item);
      if (stopOnError) break;
      continue;
    }

    if (dryRun) {
      item.status = "ready";
      run.steps.push(item);
      continue;
    }

    try {
      const result = await callToolLogged("ai-plan-run", step.tool, bound.args);
      const payload = firstToolPayload(result);
      item.status = result.isError ? "failed" : "completed";
      item.result = payload;
      item.isError = Boolean(result.isError);
      executedSteps.push({ step, payload });
      run.executedCount += result.isError ? 0 : 1;
      if (result.isError) run.failedCount += 1;
      if (!result.isError && payload && typeof payload === "object") {
        if (step.tool === "checkpoint_project" && payload.checkpointFile) {
          checkpointProtectionReady = true;
          run.safety.protection = "planned_checkpoint_step";
          run.checkpoint = compactCheckpoint(payload);
        }
        if (step.tool === "start_edit_session" && payload.session) {
          checkpointProtectionReady = true;
          run.safety.protection = "planned_edit_session_step";
          run.editSession = payload.session;
        }
      }
      run.steps.push(item);
      if (result.isError && stopOnError) break;
    } catch (error) {
      item.status = "failed";
      item.error = error.message || String(error);
      item.line = error.line || null;
      run.failedCount += 1;
      run.steps.push(item);
      if (stopOnError) break;
    }
  }

  if (autoStartedEditSession) {
    const finished = finishPlanRunEditSession(run);
    if (finished) {
      run.editSessionFinished = finished.session || null;
      run.safety.editSessionFinished = true;
    }
  }

  return finishRun();
}

function buildAePlanPrompt(args, projectContextSnapshot, solutionHintSection, projectIntentMemorySection) {
  const userPrompt = optionalString(args || {}, "prompt", optionalString(args || {}, "message", "")).trim();
  if (!userPrompt) throw new Error("prompt or message is required for AE Plan mode.");
  const contextText = projectContextSnapshot
    ? JSON.stringify(projectContextSnapshot, null, 2)
    : JSON.stringify({ available: false, reason: "Context snapshot was not captured." }, null, 2);

  return [
    "User request:",
    userPrompt,
    "",
    "Return one JSON object with this shape:",
    "{",
    "  \"summary\": \"short user-facing summary\",",
    "  \"risk\": \"low|medium|high\",",
    "  \"requiresCheckpoint\": true,",
    "  \"clarifyingQuestion\": null,",
    "  \"steps\": [",
    "    {",
    "      \"title\": \"short step title\",",
    "      \"intent\": \"what this step checks or changes\",",
    "      \"tool\": \"MCP tool name or null\",",
    "      \"args\": {},",
    "      \"dependsOnStep\": null,",
    "      \"resultBindings\": {},",
    "      \"mutatesProject\": false,",
    "      \"verifyAfter\": true,",
    "      \"idempotencyKeyTemplate\": \"ae-plan-{requestId}-step-1\"",
    "    }",
    "  ]",
    "}",
    "",
    "Available MCP tools. Use these names exactly; do not invent tool names.",
    planningToolCatalog(),
    "",
    "Project intent memory hints. These are local project preferences, not execution shortcuts.",
    projectIntentMemorySection || "No project intent memory hints were retrieved.",
    "",
    "Reviewed solution library hints. These are advisory recipes, not execution shortcuts.",
    solutionHintSection || "No reviewed solution hints were retrieved.",
    "",
    "Current project context snapshot. Treat it as a compact planning hint, not as proof that a mutation is safe.",
    contextText,
    "",
    "Human-first planning policy:",
    "- The user may write like an AE artist, not like an engineer. Do not require them to name tools, schemas, flags, or exact MCP operations.",
    "- Translate normal Russian or English requests into the safest validated tool sequence. Keep the plan summary and step titles user-facing; tool names belong only in the JSON tool field.",
    "- If the request is underspecified but safe defaults are obvious from the active comp/project context, choose conservative defaults and verify them after mutation.",
    "- Ask a clarifying question only when target identity, destructive scope, file/output choice, or irreversible intent is genuinely ambiguous.",
    "",
    "Typed-tool and ExtendScript policy:",
    "- Prefer typed AE Agent tools whenever one fits. Use raw ExtendScript only as a narrow fallback when the listed typed tools cannot express this specific workflow.",
    "- Before a raw ExtendScript fallback, inspect targets with typed read tools. The raw step must be scoped to the inspected/generated target and followed by typed read-back or semantic verification.",
    "- Never use raw ExtendScript for broad project deletion, project save/saveAs, eval, shell execution, secrets, or hard-coded user/project paths.",
    "- Successful raw ExtendScript fallbacks are captured as quarantine-only typed-tool candidates; do not treat them as trusted reusable tools inside the plan.",
    "Treat Russian/Cyrillic user text as a normal request. If a Russian phrase is ambiguous, infer cautiously from the After Effects context before asking for clarification.",
    optionalBoolean(args || {}, "hardcore", false) || optionalString(args || {}, "agentMode", "") === "hardcore" ? "Agent Hardcore mode is enabled: act as the autonomous project owner inside the existing AE Agent safety model, using very high reasoning. Plan inspection, dry-run/read-back evidence, protected execution, and verification steps explicitly. Ask clarifying questions only for risky irreversible ambiguity. If a TypedTool fails, mark the exact tool gap, preserve compact evidence for a Codex App dev prompt, and continue the AE task with another typed tool when possible. If no typed tool can finish the current workflow, plan one narrow raw ExtendScript fallback with inspection and read-back verification; raw execution still requires the bridge dry-run gate and successful raw fallback evidence remains quarantine-only until reviewed." : "",
    optionalBoolean(args || {}, "promptOptimization", false) ? "Prompt Optimization is enabled: clarify the user's intent internally, choose conservative AE defaults, and do not expand the requested scope." : "",
    "Use get_bridge_status or ping_ae for bridge health checks. Use get_project_snapshot, get_active_comp, get_comp_details, and get_layer_details before choosing project targets.",
    "For any project-changing request, plan inspection steps first, then the narrow mutating step(s), then verification/readback steps.",
    "You do not need to add a checkpoint_project step for every mutation because the plan runner can create a protected edit session, but set requiresCheckpoint=true for broad, destructive, or multi-step project changes.",
    "When a creation tool can set a property directly, include that property in the creation tool args instead of adding a later step that needs an unknown layerIndex.",
    "For requests to align selected layers, clips, or precomps to the current time indicator, use align_layers_to_time with no layerIndices and omit targetTime so it uses the active comp CTI.",
    "For current time indicator or playhead navigation, use set_comp_current_time only on one explicit comp target with finite seconds or a reviewed frame/frameRate conversion, then read back get_comp_details.time. Do not substitute work-area, layer timing, keyframes, markers, or raw ExtendScript.",
    "For timeline trims, work areas, sequencing, splitting, and offsets, use set_comp_work_area, set_layer_time_range, stagger_layers, or split_layers_at_time.",
    "For composition marker inspection, use get_comp_details with includeMarkers=true and compare markers.items in comp.markerProperty.keyTime order; for generated composition marker setup, use add_comp_marker with an explicit comp target, reviewed time/comment, and post-mutation get_comp_details includeMarkers read-back; do not substitute layer marker tools for composition markers.",
    "For precomp/source workflows, use precompose_layers, replace_layer_source, deep_duplicate_precomp_sources, rename_layers, and rename_project_items before considering raw ExtendScript.",
    "For layer name reset workflows that intentionally set a layer name to an empty string, use rename_layers only with mode:\"exact\", name:\"\", allowEmptyName:true, exactly one explicit layerIndex per step, expectedLayerNames from current typed evidence, verifyAfter:true, and post-mutation get_comp_details read-back. Do not use empty-name reset on broad selected/user layers without generated or reviewed scope.",
    "For explicit single-layer duplication, use duplicate_layer after inspecting the target comp/layer and pairing layerIndex with the sourceName in current AE stack order. AE inserts newly created and duplicated layers at layer index 1; do not assume creation order equals layer-index order.",
    "For explicit layer selection changes, use set_layer_selection only with concrete layerIndices from current get_comp_details/list_layers/get_layer_details evidence and expectedLayerNames when possible; do not use raw ExtendScript to select layers.",
    "For explicit generated layer parenting, use set_layer_parent only with one inspected child layer, one inspected parent layer, expectedLayerName, expectedParentName, and post-run get_layer_details read-back. Do not use it for recursive hierarchy edits, bulk parenting, source-exact selection side effects, or non-generated user assets without a separate reviewed contract.",
    "For explicit generated track matte changes, use set_layer_track_matte only with one inspected fill layer, one inspected matte layer, expectedLayerName, expectedMatteLayerName, and post-run get_layer_details read-back showing hasTrackMatte, trackMatteTypeName, and trackMatteLayer. Do not use parent-link tools, layer reordering, broad layer scans, or raw ExtendScript as substitutes.",
    "For explicit bulk layer duplication, use duplicate_layers with concrete layerIndices after inspecting the target comp/layers. Pair sourceNames with layerIndices in current AE stack order, or insert get_comp_details before duplication when source-layer order is ambiguous. For selected-layer duplication, inspect with get_selected_layers first and bind layerIndices from {{selectedLayerIndices}}; never use duplicate_layers for deletion, source/precomp relinking, mask/path edits, or audio workflows.",
    "For destructive single-layer deletion, use delete_layer only after inspecting the explicit target comp/layer. Provide compItemIndex or compName, layerIndex, and expectedLayerName, then read back the comp/layer stack to prove the deleted layer is absent; never use selection-only, broad, multi-layer, or name-optional deletion.",
    "For composition settings, use set_comp_properties only for width, height, pixelAspect, duration, frameRate, bgColor, displayStartTime, native displayStartFrame, and preserveNestedFrameRate on one explicit comp, then read back the comp before reporting success. Do not route arbitrary comp fields, layers, effects, masks, or property paths through this tool.",
    "For project frame numbering, use set_project_frames_count_type only with an explicit reviewed framesCountType of FC_START_0 or FC_START_1, then read back get_project_info. Do not scan or mutate all project comps through this project-level tool.",
    "For Composition panel refresh side effects, use refresh_comp_panel only on one explicit inspected comp with optional expectedMotionBlur guard, then read back get_comp_details and prove comp.motionBlur returned to its original value. Do not use set_comp_properties, layer motionBlur, raw ExtendScript, or user comp mutation as a substitute.",
    "For explicit generated layer metadata, use set_layer_metadata only with one explicit comp target, concrete layerIndices, and expectedLayerNames when available. It only supports comment, label, locked, enabled, and guideLayer, and must be followed by get_layer_details read-back for each target layer.",
    "For explicit generated layer blending mode changes, use set_layer_blending_mode only with one explicit comp target, concrete layerIndices, expectedLayerNames when available, and reviewed blendingMode normal or difference. Follow with get_layer_details read-back for each target layer; do not infer targets from selection without typed evidence.",
    "For explicit generated project item labels, use set_project_item_metadata only with concrete itemIndices from current get_project_snapshot/find_project_items/list_project_folder_items evidence and expectedItemNames when available. It only supports label and must be followed by project-item read-back.",
    "For explicit layer switches, use set_property_value only with whitelisted layer attributes threeDLayer, collapseTransformation, or motionBlur on inspected layer indices, setAtTime:false, then read back with get_layer_details. Do not use it for parenting, selection changes, timeline switches, or arbitrary layer fields.",
    "For explicit effect enabled-state changes, use set_effect_enabled only after list_effects or get_effect_details identifies one effect instance by effectIndex, effectName, or effectMatchName and current enabled state. Prefer explicit enabled:true/false over ambiguous toggle wording, and read back with get_effect_details/get_layer_details. Do not scan all project comps, mutate unreviewed user effects, edit effect properties, or use raw ExtendScript.",
    "For timeline marker workflows, use add_layer_marker, update_layer_marker, or delete_layer_marker only with explicit layer/time/comment evidence; update/delete marker steps must target one existing marker by markerIndex or strict targetTime plus optional targetComment. Do not claim audio analysis, beat detection, or generated markers from audio unless a separate evidence tool proves it.",
    "For camera, text, shape, mask, comp-frame export, and fitting workflows, use create_camera_layer, update_text_layer, create_shapes_from_text, create_shape_layer, create_layer_connection_line, create_layer_mask, set_layer_mask, get_path_geometry, set_path_geometry, export_path_points, save_comp_frame_png, and fit_layer_to_comp. Use create_shapes_from_text only for one explicit inspected text layer with expected layer name/source text guards when available; it uses AE's native Create Shapes from Text command and must fail closed if that command is unavailable. Use create_layer_connection_line only for one generated locked connector layer between two explicit inspected layer targets. Use set_layer_mask only after inspecting the target layer/mask and read it back after create/update. Use set_path_geometry only for one explicit Shape or Mask path property with reviewed vertices, inTangents, outTangents, closed state, and optional bounded keyframes, then read back with get_path_geometry. Use export_path_points only after get_path_geometry evidence and only for generated export files; never write Desktop or arbitrary user paths. Use save_comp_frame_png only for explicit generated compositions, reviewed frame time, and simple .png output names under the generated export root; never write Desktop or arbitrary user paths. Do not delete masks, target multiple masks/layers, run roto, or traverse arbitrary property trees.",
    "For Puppet pin type changes, use set_puppet_pin_type only after get_effect_details shows one explicit ADBE FreePin3 effect, an ADBE FreePin3 PosPin Atom ancestor, and an ADBE FreePin3 PosPin Type propertyPath. Only pinType 1/position and 4/advanced are allowed; do not create or infer Puppet pins, scan the project, or mutate user Puppet effects without generated or explicitly reviewed evidence.",
    "For Essential Graphics, first inspect the explicit layer/property with get_layer_details or get_layer_essential_properties and inspect existing controllers with get_essential_graphics_controllers. Use add_property_to_essential_graphics only for one explicit propertyPath, one reviewed controllerName, and post-run get_essential_graphics_controllers read-back; do not traverse selectedProperties, export MOGRTs, mutate user template membership, or edit Essential Properties unless separate evidence and confirmation are present.",
    "For camera controller rigs, use create_camera_with_controller instead of raw ExtendScript or ad hoc parenting; read back both camera.parent and controller 3D/separated-position state with get_layer_details.",
    "For onion skinning, use toggle_onion_skinning and read back the generated adjustment layer plus CC Wide Time effect; do not use broad property traversal.",
    "For keyframes and expressions, use set_property_keyframes, apply_keyframe_ease, fill_in_keyframes, keyframe_current_value_from_expression, set_spatial_in_tangent, set_expression, and clear_expression. Use separate_shape_size_dimensions for generated rectangle/ellipse size slider separation.",
    "For render queue setup, use add_comp_to_render_queue, set_render_queue_output, and get_render_queue_status. Do not start a render.",
    "For requests about selected layers, inspect with get_active_comp or get_selected_layers first. A later layerIndex field may use {{selectedLayerIndices}} to target the selected layers.",
    "For later steps that need the active comp, compItemIndex may use {{compItemIndex}} after get_active_comp, get_comp_details, or get_selected_layers.",
    "For requests about selected precomp/source comp(s), inspect with get_active_comp or get_selected_layers first, then use {{selectedPrecompLayerIndex}} for the selected precomp layer, {{selectedPrecompItemIndex}} for one source comp, or {{selectedPrecompItemIndices}} in itemIndices for rename_project_items.",
    "For deep duplicate of a selected precomp and its sources, prefer one deep_duplicate_precomp_sources step with layerIndex {{selectedPrecompLayerIndex}} and sourceCompItemIndex {{selectedPrecompItemIndex}} after inspection; do not use run_extendscript.",
    "For read-back after deep_duplicate_precomp_sources, use get_comp_details with compItemIndex {{duplicatedRootCompItemIndex}} or {{rootCompItemIndex}}; the tool also returns createdItemIndices for project-item summaries.",
    "To verify the parent layer after deep_duplicate_precomp_sources relinks it, use get_layer_details with compItemIndex steps.<deep-duplicate-step>.result.comp.itemIndex and layerIndex {{selectedPrecompLayerIndex}}; do not reuse generic {{compItemIndex}} after reading the duplicated source comp.",
    "Use canonical schema field names such as itemIndices and layerIndices; do not use itemIndexes or layerIndexes.",
    "If a later step depends on a previous tool result, set dependsOnStep and resultBindings instead of inventing indices.",
    "If solution hints mention a typed-tool-candidate, prefer recommending a typed bridge tool implementation over repeating a workaround.",
    "If solution hints mention a reviewed raw ExtendScript file, mark the plan risky, prefer typed tools first, and only plan run_extendscript_file when no typed tool fits.",
    "Use mutating tools only as planned steps; do not execute them. Use run_extendscript only when no typed tool fits."
  ].join("\n");
}

async function repairAgentPlanJson(args, rawText) {
  const repairPrompt = [
    "The following response was intended to be one JSON object matching the AE MCP plan schema, but it was malformed.",
    "Repair it into valid JSON only. Preserve the steps, tools, args, risk, summary, and checkpoint intent.",
    "",
    "Malformed response:",
    String(rawText || "")
  ].join("\n");

  const repairResult = await aiAgents.chatWithAgent({
    ...(args || {}),
    messages: undefined,
    prompt: repairPrompt,
    system: AE_PLAN_REPAIR_SYSTEM_PROMPT,
    temperature: 0,
    maxTokens: hasArg(args || {}, "repairMaxTokens") ? args.repairMaxTokens : 2400
  });
  const repaired = normalizeAgentPlan(repairResult.text);
  return {
    repaired,
    repairText: repairResult.text,
    repairModel: repairResult.model || null
  };
}

async function runAgentChatLogged(source, args) {
  const requestId = crypto.randomUUID();
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  appendAiChatEvent("chat_started", {
    requestId,
    source,
    ...aiChatRequestSummary(args || {})
  });

  try {
    let chatArgs = args || {};
    if (optionalBoolean(chatArgs, "promptOptimization", false)) {
      chatArgs = {
        ...chatArgs,
        system: [
          optionalString(chatArgs, "system", ""),
          "Prompt Optimization is enabled: clarify ambiguous wording internally, keep the user's scope, and answer with concise After Effects-friendly details."
        ].filter(Boolean).join("\n")
      };
    }
    const result = await aiAgents.chatWithAgent(chatArgs);
    const finishedAtMs = Date.now();
    const metadata = {
      requestId,
      source,
      startedAt,
      finishedAt: new Date(finishedAtMs).toISOString(),
      durationMs: finishedAtMs - startedAtMs,
      agentId: result.agent ? result.agent.id : args.agentId || args.agent || null,
      model: result.model || args.model || null,
      textLength: result.text ? result.text.length : 0,
      logFile: AI_CHAT_LOG_FILE
    };
    appendAiChatEvent("chat_finished", metadata);
    return {
      ...result,
      requestId,
      startedAt,
      finishedAt: metadata.finishedAt,
      durationMs: metadata.durationMs,
      runLogFile: AI_CHAT_LOG_FILE,
      m100Message: m100Protocol.createAssistantResponseEnvelope({
        requestId,
        summary: result.text || "",
        text: result.text || "",
        logs: [
          {
            phase: "codex_exec",
            level: "info",
            message: "Assistant text response completed without executable controls."
          }
        ]
      })
    };
  } catch (error) {
    const finishedAtMs = Date.now();
    const metadata = {
      requestId,
      source,
      startedAt,
      finishedAt: new Date(finishedAtMs).toISOString(),
      durationMs: finishedAtMs - startedAtMs,
      ...aiChatRequestSummary(args || {}),
      error: error.message || String(error),
      readiness: error.readiness || null,
      providerError: error.providerError || null,
      logFile: AI_CHAT_LOG_FILE
    };
    appendAiChatEvent("chat_failed", metadata);
    error.requestId = requestId;
    error.startedAt = startedAt;
    error.finishedAt = metadata.finishedAt;
    error.durationMs = metadata.durationMs;
    throw error;
  }
}

async function runAgentPlanLogged(source, args) {
  const requestId = crypto.randomUUID();
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const hardcoreMode = optionalBoolean(args || {}, "hardcore", false) || optionalString(args || {}, "agentMode", "") === "hardcore";
  const reasoningEffort = optionalString(args || {}, "reasoning_effort", optionalString(args || {}, "reasoningEffort", "")) || (hardcoreMode ? "xhigh" : "");
  appendAiChatEvent("plan_started", {
    requestId,
    source,
    ...aiChatRequestSummary(args || {})
  });

  try {
    const projectContextSnapshot = await buildProjectContextSnapshot();
    const userPrompt = optionalString(args || {}, "prompt", optionalString(args || {}, "message", ""));
    const projectIntentMemory = buildProjectIntentMemoryForPrompt(userPrompt);
    const solutionHints = buildSolutionHintsForPrompt(userPrompt, {
      availableToolNames: PLANNING_TOOL_NAMES
    });
    const planPrompt = buildAePlanPrompt(args || {}, projectContextSnapshot, solutionHints.promptSection, projectIntentMemory.promptSection);
    const result = await aiAgents.chatWithAgent({
      ...(args || {}),
      messages: undefined,
      prompt: planPrompt,
      system: optionalString(args || {}, "system", AE_PLAN_SYSTEM_PROMPT),
      temperature: hasArg(args || {}, "temperature") ? args.temperature : 0.2,
      ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
      maxTokens: hasArg(args || {}, "maxTokens") ? args.maxTokens : 2200
    });
    let parsed = normalizeAgentPlan(result.text);
    let repaired = false;
    let repairError = null;
    let repairModel = null;
    if (!parsed.ok && optionalBoolean(args || {}, "repairPlan", true) !== false) {
      try {
        const repair = await repairAgentPlanJson(args || {}, result.text);
        repaired = repair.repaired.ok;
        repairModel = repair.repairModel;
        if (repair.repaired.ok) {
          parsed = repair.repaired;
        } else {
          repairError = repair.repaired.error || "Plan repair did not produce valid JSON.";
        }
      } catch (error) {
        repairError = error.message || String(error);
      }
    }
    let validation = null;
    let planRepair = null;
    let planRepairApplied = false;
    let originalPlanValidation = null;
    if (parsed.ok) {
      const prepared = validateAgentPlanWithRepair(parsed.plan, requestId, {
        solutionHints: solutionHints.retrieval,
        projectIntentMemory: projectIntentMemory.retrieval
      }, {
        repairPlan: args && args.repairPlan
      });
      validation = prepared.validation;
      planRepair = prepared.repair;
      planRepairApplied = Boolean(planRepair && planRepair.applied);
      if (planRepairApplied) {
        parsed.plan = prepared.plan;
        originalPlanValidation = compactAgentPlanValidationSummary(prepared.originalValidation);
      }
    }
    const finishedAtMs = Date.now();
    const metadata = {
      requestId,
      source,
      startedAt,
      finishedAt: new Date(finishedAtMs).toISOString(),
      durationMs: finishedAtMs - startedAtMs,
      agentId: result.agent ? result.agent.id : args.agentId || args.agent || null,
      model: result.model || args.model || null,
      parseOk: parsed.ok,
      repaired,
      planRepairApplied,
      stepCount: parsed.plan && Array.isArray(parsed.plan.steps) ? parsed.plan.steps.length : 0,
      validationOk: validation ? validation.ok : false,
      mutatingCount: validation ? validation.mutatingCount : 0,
      planClassification: validation && validation.classification ? validation.classification.category : null,
      projectIntentMemoryReturned: projectIntentMemory.retrieval && projectIntentMemory.retrieval.ok ? projectIntentMemory.retrieval.returned : 0,
      solutionHintsReturned: solutionHints.retrieval && solutionHints.retrieval.ok ? solutionHints.retrieval.returned : 0,
      solutionToolMatches: solutionHints.retrieval && solutionHints.retrieval.ok ? solutionHints.retrieval.toolMatches.length : 0,
      logFile: AI_CHAT_LOG_FILE
    };
    appendAiChatEvent("plan_finished", metadata);
    const planResponse = {
      ...result,
      mode: "ae-plan",
      agentMode: hardcoreMode ? "hardcore" : "agent",
      reasoningEffort: reasoningEffort || null,
      requestId,
      startedAt,
      finishedAt: metadata.finishedAt,
      durationMs: metadata.durationMs,
      runLogFile: AI_CHAT_LOG_FILE,
      userPrompt,
      planParseOk: parsed.ok,
      planRepaired: repaired,
      planRepairModel: repairModel,
      planRepair,
      planRepairApplied,
      plan: parsed.plan || null,
      planValidation: validation,
      originalPlanValidation,
      planClassification: validation ? validation.classification : null,
      planContextSnapshot: projectContextSnapshot,
      planProjectIntentMemory: projectIntentMemory.retrieval,
      planSolutionHints: solutionHints.retrieval,
      planRepairError: repairError,
      planParseError: parsed.error || null,
      m100ConfirmationSurface: optionalString(args || {}, "m100ConfirmationSurface", optionalString(args || {}, "confirmationSurface", "cep-panel")),
      m100ConfirmationSessionId: optionalString(args || {}, "m100ConfirmationSessionId", optionalString(args || {}, "confirmationSessionId", ""))
    };
    const actionProposal = createM100AgentPlanProposal(planResponse);
    if (actionProposal) {
      planResponse.m100ActionProposal = actionProposal;
      planResponse.m100Message = actionProposal;
    } else if (!parsed.ok) {
      const diagnostic = m100Protocol.createUserDiagnostic({
        phase: "protocol_validation",
        code: "m100_plan_parse_failed",
        message: parsed.error || "Agent response did not contain a valid AE plan.",
        requestId,
        rawPreview: result.text || "",
        logRef: AI_CHAT_LOG_FILE
      });
      planResponse.diagnostic = diagnostic;
      planResponse.planParseError = diagnostic.message;
      planResponse.m100Message = m100Protocol.createErrorEnvelope({
        requestId,
        phase: diagnostic.phase,
        code: diagnostic.code,
        error: diagnostic.message,
        rawPreview: diagnostic.rawPreview,
        logs: [
          {
            phase: diagnostic.phase,
            level: "error",
            message: diagnostic.message,
            logRef: diagnostic.logRef
          }
        ]
      });
    } else {
      planResponse.m100Message = m100Protocol.createAssistantResponseEnvelope({
        requestId,
        status: parsed.ok ? "agent_response_ready" : "failed",
        summary: result.text || parsed.error || "Agent response did not create an executable proposal.",
        logs: [
          {
            phase: "protocol_validation",
            level: parsed.ok ? "warn" : "error",
            message: validation && validation.ok !== true
              ? "Agent plan did not pass validation, so no executable M100 controls were created."
              : "Agent response is text-only for M100 executable-control purposes."
          }
        ]
      });
    }
    return planResponse;
  } catch (error) {
    const finishedAtMs = Date.now();
    const metadata = {
      requestId,
      source,
      startedAt,
      finishedAt: new Date(finishedAtMs).toISOString(),
      durationMs: finishedAtMs - startedAtMs,
      ...aiChatRequestSummary(args || {}),
      error: error.message || String(error),
      readiness: error.readiness || null,
      providerError: error.providerError || null,
      logFile: AI_CHAT_LOG_FILE
    };
    appendAiChatEvent("plan_failed", metadata);
    error.requestId = requestId;
    error.startedAt = startedAt;
    error.finishedAt = metadata.finishedAt;
    error.durationMs = metadata.durationMs;
    throw error;
  }
}

function startHttpBridge() {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${HOST}:${PORT}`);

    if (req.method === "OPTIONS") {
      writeJson(res, 204, {});
      return;
    }

    if (url.pathname === "/health") {
      const status = getBridgeStatus();
      writeJson(res, 200, {
        ok: true,
        server: status.server,
        version: status.version,
        hasToken: Boolean(TOKEN),
        port: status.port,
        pending: status.pendingCommands,
        inflight: status.inflightCommands.length,
        panelConnected: status.panelConnected,
        lastPanelSeenAt: status.lastPanelSeenAt,
        lastPanelInfo: status.lastPanelInfo,
        m100RiskPolicy: status.m100RiskPolicy
      });
      return;
    }

    if (url.pathname === "/dev/status" && req.method === "GET") {
      if (!requireToken(req, res, url)) return;
      writeJson(res, 200, getBridgeStatus());
      return;
    }

    if (url.pathname === "/dev/logs" && req.method === "GET") {
      if (!requireToken(req, res, url)) return;
      const limit = Math.max(1, Math.min(200, Math.floor(Number(url.searchParams.get("limit") || 50))));
      writeJson(res, 200, { ok: true, logFile: LOG_FILE, events: tailJsonl(LOG_FILE, limit) });
      return;
    }

    if (url.pathname === "/dev/tools" && req.method === "GET") {
      if (!requireToken(req, res, url)) return;
      writeJson(res, 200, { ok: true, tools: exposedTools() });
      return;
    }

    if ((url.pathname === "/agents" || url.pathname === "/dev/agents") && req.method === "GET") {
      if (!requireToken(req, res, url)) return;
      try {
        writeJson(res, 200, {
          ok: true,
          ...(await aiAgents.listAgents({
            includeModels: url.searchParams.get("includeModels") || "0",
            freeOnly: url.searchParams.get("freeOnly") || "0",
            timeoutMs: url.searchParams.get("timeoutMs") || undefined
          }))
        });
      } catch (error) {
        writeJson(res, 500, m100HttpFailure(error, {
          fallbackPhase: "provider_readiness"
        }));
      }
      return;
    }

    if ((url.pathname === "/agents/readiness" || url.pathname === "/dev/agents/readiness") && req.method === "GET") {
      if (!requireToken(req, res, url)) return;
      try {
        writeJson(res, 200, {
          ok: true,
          readiness: await aiAgents.checkAgentReadiness({
            agentId: url.searchParams.get("agentId") || url.searchParams.get("agent") || undefined,
            model: url.searchParams.get("model") || undefined,
            freeOnly: url.searchParams.get("freeOnly") || "0",
            checkModels: url.searchParams.get("checkModels") || "1",
            timeoutMs: url.searchParams.get("timeoutMs") || undefined
          })
        });
      } catch (error) {
        writeJson(res, 500, m100HttpFailure(error, {
          fallbackPhase: "provider_readiness"
        }));
      }
      return;
    }

    if ((url.pathname === "/agents/key" || url.pathname === "/dev/agents/key") && req.method === "POST") {
      if (!requireToken(req, res, url)) return;
      let body;
      try {
        body = await readJsonBody(req);
        const saved = saveAgentApiKey(body.agentId || body.agent || "", body.apiKey || "");
        writeJson(res, 200, {
          ok: true,
          saved,
          readiness: await aiAgents.checkAgentReadiness({
            agentId: saved.agentId,
            timeoutMs: 3000
          })
        });
      } catch (error) {
        writeJson(res, 400, m100HttpFailure(error, {
          fallbackPhase: "protocol_validation"
        }));
      }
      return;
    }

    if ((url.pathname === "/agents/setup" || url.pathname === "/dev/agents/setup") && req.method === "POST") {
      if (!requireToken(req, res, url)) return;
      let body;
      try {
        body = await readJsonBody(req);
        const setup = aiAgents.launchCodexLogin(body || {});
        writeJson(res, 200, {
          ok: true,
          setup
        });
      } catch (error) {
        const failure = m100HttpFailure(error, {
          fallbackPhase: "provider_readiness"
        });
        failure.codexStatus = m100SanitizedDiagnosticObject(error.status || null);
        writeJson(res, 400, failure);
      }
      return;
    }

    if ((url.pathname === "/agents/log" || url.pathname === "/dev/agents/log") && req.method === "GET") {
      if (!requireToken(req, res, url)) return;
      const limit = Math.max(1, Math.min(200, Math.floor(Number(url.searchParams.get("limit") || 50))));
      writeJson(res, 200, { ok: true, logFile: AI_CHAT_LOG_FILE, events: tailJsonl(AI_CHAT_LOG_FILE, limit) });
      return;
    }

    if ((url.pathname === "/agents/chat" || url.pathname === "/dev/agents/chat") && req.method === "POST") {
      if (!requireToken(req, res, url)) return;
      let body;
      try {
        body = await readJsonBody(req);
      } catch (error) {
        writeJson(res, 400, {
          ok: false,
          error: error.message || String(error)
        });
        return;
      }

      try {
        const result = await runAgentChatLogged("panel-http", body || {});
        writeJson(res, 200, {
          ok: true,
          result
        });
      } catch (error) {
        writeJson(res, 500, m100HttpFailure(error, {
          fallbackPhase: error.readiness ? "provider_readiness" : "codex_exec",
          logRef: AI_CHAT_LOG_FILE
        }));
      }
      return;
    }

    if ((url.pathname === "/agents/plan" || url.pathname === "/dev/agents/plan") && req.method === "POST") {
      if (!requireToken(req, res, url)) return;
      let body;
      try {
        body = await readJsonBody(req);
      } catch (error) {
        writeJson(res, 400, {
          ok: false,
          error: error.message || String(error)
        });
        return;
      }

      try {
        const result = await runAgentPlanLogged("panel-http", body || {});
        writeJson(res, 200, {
          ok: true,
          result
        });
      } catch (error) {
        writeJson(res, 500, m100HttpFailure(error, {
          fallbackPhase: error.readiness ? "provider_readiness" : "codex_exec",
          logRef: AI_CHAT_LOG_FILE
        }));
      }
      return;
    }

    if ((url.pathname === "/agents/plan/propose" || url.pathname === "/dev/agents/plan/propose") && req.method === "POST") {
      if (!requireToken(req, res, url)) return;
      try {
        const body = await readJsonBody(req);
        const proposed = createM100AgentPlanProposalFromRequest(body || {});
        writeJson(res, 200, {
          ok: true,
          proposal: proposed.proposal,
          validation: proposed.validation,
          planRepair: proposed.planRepair,
          repairedPlan: proposed.repairedPlan
        });
      } catch (error) {
        const failure = m100HttpFailure(error, {
          fallbackPhase: "protocol_validation",
          fallbackCode: error.code || "m100_action_proposal_create_failed"
        });
        failure.validation = error.validation || null;
        writeJson(res, 400, failure);
      }
      return;
    }

    if ((url.pathname === "/agents/plan/validate" || url.pathname === "/dev/agents/plan/validate") && req.method === "POST") {
      if (!requireToken(req, res, url)) return;
      try {
        const body = await readJsonBody(req);
        const plan = body.plan || body;
        const prepared = validateAgentPlanWithRepair(plan, body.requestId || body.validationId || null, {
          solutionHints: body.solutionHints || body.planSolutionHints || null,
          projectIntentMemory: body.projectIntentMemory || body.planProjectIntentMemory || null
        }, {
          repairPlan: body.repairPlan
        });
        const validation = prepared.validation;
        writeJson(res, 200, {
          ok: true,
          validation,
          classification: validation.classification || null,
          planRepair: prepared.repair || null,
          repairedPlan: prepared.repair && prepared.repair.applied ? prepared.plan : null
        });
      } catch (error) {
        writeJson(res, 400, {
          ok: false,
          error: error.message || String(error)
        });
      }
      return;
    }

    if ((url.pathname === "/agents/plan/run" || url.pathname === "/dev/agents/plan/run") && req.method === "POST") {
      if (!requireToken(req, res, url)) return;
      try {
        const body = await readJsonBody(req);
        const run = await runValidatedAgentPlan(body || {});
        writeJson(res, run.ok ? 200 : 400, {
          ok: run.ok,
          run,
          diagnostic: run.diagnostic || null,
          m100Message: run.m100Message || null,
          code: run.errorCode || run.diagnostic && run.diagnostic.code || null,
          phase: run.diagnostic && run.diagnostic.phase || null
        });
      } catch (error) {
        writeJson(res, 400, m100HttpFailure(error, {
          fallbackPhase: m100PhaseForError(error, "protocol_validation")
        }));
      }
      return;
    }

    if ((url.pathname === "/agents/hardcore/run" || url.pathname === "/dev/agents/hardcore/run") && req.method === "POST") {
      if (!requireToken(req, res, url)) return;
      try {
        const body = await readJsonBody(req);
        const session = await runAgentHardcoreSession("panel-http", body || {});
        writeJson(res, 200, {
          ok: session.ok,
          session
        });
      } catch (error) {
        writeJson(res, 400, m100HttpFailure(error, {
          fallbackPhase: error.readiness ? "provider_readiness" : "codex_exec",
          logRef: AI_CHAT_LOG_FILE
        }));
      }
      return;
    }

    if ((url.pathname === "/agents/dev-request" || url.pathname === "/dev/agents/dev-request") && req.method === "POST") {
      if (!requireToken(req, res, url)) return;
      try {
        const body = await readJsonBody(req);
        const bundle = createDevRequestBundle(body || {});
        const codexApp = optionalBoolean(body || {}, "openCodexApp", false)
          ? launchCodexAppForDevRequest()
          : { launched: false, skipped: true };
        writeJson(res, 200, {
          ok: true,
          bundle,
          codexApp
        });
      } catch (error) {
        writeJson(res, 400, {
          ok: false,
          error: error.message || String(error),
          code: error.code || null
        });
      }
      return;
    }

    if (url.pathname === "/tools" && req.method === "GET") {
      if (!requireToken(req, res, url)) return;
      writeJson(res, 200, { ok: true, tools: exposedTools() });
      return;
    }

    if (url.pathname === "/tools/call" && req.method === "POST") {
      if (!requireToken(req, res, url)) return;

      try {
        const body = await readJsonBody(req);
        const name = String(body.name || "");
        const args = body.arguments || {};
        const result = await callToolLogged("direct-tools-call", name, args);
        writeJson(res, 200, {
          ok: true,
          tool: name,
          result
        });
      } catch (error) {
        writeJson(res, 500, m100HttpFailure(error, {
          fallbackPhase: "ae_execution"
        }));
      }
      return;
    }

    if (url.pathname.startsWith("/dev/tool/") && (req.method === "GET" || req.method === "POST")) {
      if (!requireToken(req, res, url)) return;

      const name = decodeURIComponent(url.pathname.slice("/dev/tool/".length));
      const args = {};

      for (const [key, value] of url.searchParams.entries()) {
        if (key !== "token") args[key] = value;
      }

      if (req.method === "POST") {
        Object.assign(args, await readJsonBody(req));
      }

      try {
        const result = await callToolLogged("dev-http", name, args);
        writeJson(res, result.isError ? 500 : 200, {
          ok: !result.isError,
          tool: name,
          result: parseToolText(result.content[0].text)
        });
      } catch (error) {
        writeJson(res, 500, {
          tool: name,
          ...m100HttpFailure(error, {
            fallbackPhase: "ae_execution"
          })
        });
      }
      return;
    }

    if (url.pathname === "/dev/ping-ae" && req.method === "GET") {
      if (!requireToken(req, res, url)) return;
      try {
        const result = await runExtendScriptBody(`
          return {
            appName: app.name,
            appVersion: app.version,
            projectItems: app.project ? app.project.numItems : 0,
            activeItemName: app.project && app.project.activeItem ? app.project.activeItem.name : null,
            timestamp: (new Date()).toString()
          };
        `, 8000);
        writeJson(res, 200, { ok: true, result: result.result });
      } catch (error) {
        writeJson(res, 500, m100HttpFailure(error, {
          fallbackPhase: "ae_execution"
        }));
      }
      return;
    }

    if (url.pathname.startsWith("/results/") && req.method === "GET") {
      if (!requireToken(req, res, url)) return;
      const id = decodeURIComponent(url.pathname.slice("/results/".length));
      const result = completedResults.get(id);
      if (!result) {
        writeJson(res, 404, { ok: false, error: "Unknown result id" });
        return;
      }
      writeJson(res, 200, { ok: true, result });
      return;
    }

    if (url.pathname === "/bridge/next" && req.method === "GET") {
      if (!requireToken(req, res, url)) return;
      lastPanelSeenAt = Date.now();
      lastPanelInfo = {
        userAgent: req.headers["user-agent"] || null,
        panelConnectionId: url.searchParams.get("panelConnectionId") || req.headers["x-ae-panel-connection-id"] || null,
        panelGeneration: url.searchParams.get("panelGeneration") || req.headers["x-ae-panel-generation"] || null,
        at: lastPanelSeenAt
      };
      if (pendingCommands.length || Date.now() - lastPanelPollLoggedAt > 60000) {
        lastPanelPollLoggedAt = Date.now();
        recordEvent("panel_poll", {
          pendingCommands: countQueuedCommands(),
          userAgent: lastPanelInfo.userAgent
        });
      }

      const command = leaseNextQueuedCommand(req, url);
      if (command) {
        writeJson(res, 200, { ok: true, command });
        return;
      }

      writeJson(res, 200, { ok: true, command: null });
      return;
    }

    if (url.pathname === "/bridge/submitted" && req.method === "POST") {
      if (!requireToken(req, res, url)) return;
      const payload = await readJsonBody(req);
      const id = String(payload.id || "");
      const command = inflightCommands.get(id);

      if (!command) {
        const retained = completedResults.get(id);
        if (retained) {
          writeJson(res, 409, {
            ok: false,
            error: "Command is already terminal.",
            lifecycleState: retained.lifecycleState || null,
            code: retained.code || null
          });
          return;
        }
        writeJson(res, 404, { ok: false, error: "Unknown command id" });
        return;
      }

      const submittedOwner = {
        panelConnectionId: String(payload.panelConnectionId || "unknown-panel"),
        panelGeneration: String(payload.panelGeneration || "unknown-generation"),
        userAgent: req.headers["user-agent"] || null
      };

      if (command.state === "submitted") {
        writeJson(res, 200, { ok: true, lifecycleState: command.state });
        return;
      }

      if (command.state !== "leased") {
        writeJson(res, 409, {
          ok: false,
          error: `Command cannot be marked submitted from state ${command.state}.`,
          lifecycleState: command.state
        });
        return;
      }

      if (!leaseOwnerMatches(command, submittedOwner)) {
        recordEvent("ae_command_submit_owner_mismatch", {
          id,
          leaseOwner: command.leaseOwner,
          submittedOwner
        });
        writeJson(res, 409, {
          ok: false,
          error: "Command submit owner does not match the lease owner.",
          lifecycleState: command.state
        });
        return;
      }

      command.state = "submitted";
      command.submittedAt = Date.now();
      recordEvent("ae_command_submitted", {
        id,
        lifecycleState: command.state,
        ageMs: command.submittedAt - command.createdAt,
        leaseOwner: command.leaseOwner
      });
      writeJson(res, 200, { ok: true, lifecycleState: command.state });
      return;
    }

    if (url.pathname === "/bridge/result" && req.method === "POST") {
      if (!requireToken(req, res, url)) return;
      const body = await readBody(req);
      const payload = body ? JSON.parse(body) : {};
      const command = inflightCommands.get(payload.id);

      if (!command) {
        const retained = completedResults.get(payload.id);
        if (retained) {
          const staleResult = retainStaleCommandResult(payload.id, payload, retained);
          recordEvent("ae_command_stale_result_ignored", {
            id: payload.id,
            previousLifecycleState: retained.lifecycleState || null,
            ok: Boolean(payload.ok),
            ageMs: retained.createdAt ? Date.now() - retained.createdAt : null
          });
          writeJson(res, 200, {
            ok: true,
            stale: true,
            lifecycleState: staleResult.lifecycleState
          });
          return;
        }
        writeJson(res, 404, { ok: false, error: "Unknown command id" });
        return;
      }

      clearTimeout(command.timeout);
      inflightCommands.delete(payload.id);
      command.completedAt = Date.now();
      let parsedResult = null;
      let failure = null;

      if (payload.ok) {
        try {
          parsedResult = parseStrictAeWrapperResult(command, payload.result);
        } catch (error) {
          failure = error;
        }
      } else {
        failure = createAeCommandError(
          command,
          "ae_execution_failed",
          "ae_execution",
          payload.error || "After Effects command failed.",
          { rawPreview: boundedAeRawPreview(payload.error || payload.result || "") }
        );
      }

      if (failure) {
        command.state = "failed";
        command.errorCode = failure.code || "ae_execution_failed";
        command.phase = failure.phase || "ae_execution";
        failure.lifecycleState = command.state;
        retainCommandResult(payload.id, {
          ok: false,
          error: failure.message || "After Effects command failed.",
          code: command.errorCode,
          phase: command.phase,
          rawPreview: Object.prototype.hasOwnProperty.call(failure, "rawPreview") ? failure.rawPreview : null,
          line: failure.line || null,
          lifecycleState: command.state
        }, command);
        command.settled = true;
        command.reject(failure);
        recordEvent("ae_command_result", {
          id: payload.id,
          ok: false,
          lifecycleState: command.state,
          phase: command.phase,
          code: command.errorCode,
          ageMs: Date.now() - command.createdAt,
          error: failure.message || "After Effects command failed.",
          rawPreview: Object.prototype.hasOwnProperty.call(failure, "rawPreview") ? failure.rawPreview : null
        });
      } else {
        command.state = "completed";
        command.errorCode = null;
        command.phase = null;
        retainCommandResult(payload.id, {
          ok: true,
          result: parsedResult.result,
          lifecycleState: command.state
        }, command);
        command.settled = true;
        command.resolve(parsedResult);
        recordEvent("ae_command_result", {
          id: payload.id,
          ok: true,
          lifecycleState: command.state,
          ageMs: Date.now() - command.createdAt
        });
      }

      writeJson(res, 200, { ok: true });
      return;
    }

    writeJson(res, 404, { ok: false, error: "Not found" });
  });

  server.listen(PORT, HOST, () => {
    log(`HTTP bridge listening on http://${HOST}:${PORT}`);
    log(`AE_BRIDGE_TOKEN=${TOKEN}`);
    recordEvent("server_started", {
      host: HOST,
      port: PORT,
      version: SERVER_VERSION,
      logFile: LOG_FILE
    });
  });

  server.on("error", (error) => {
    log(`HTTP bridge error: ${error.message}`);
    recordEvent("server_error", { error: error.message });
    process.exitCode = 1;
    process.exit(1);
  });
}

const tools = [
  {
    name: "get_bridge_status",
    description: "Return MCP bridge diagnostics, panel connection status, log path, backup path, and recent events.",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "get_command_log",
    description: "Return recent JSONL bridge events from the local command log.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Number of recent events to return. Defaults to 50, maximum 200."
        }
      }
    }
  },
  {
    name: "get_ai_agent_log",
    description: "Return recent AI agent chat preflight, success, and failure events from the local JSONL log.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Number of recent AI agent events to return. Defaults to 50, maximum 200."
        }
      }
    }
  },
  {
    name: "get_project_intent_memory",
    description: "Return the local Project Intent Memory registry and optional compact retrieval hints without querying AE or external providers.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "Optional user request used to retrieve compact matching memory hints."
        },
        topN: {
          type: "number",
          description: "Optional maximum memory hints to retrieve. Defaults to 4, maximum 6."
        },
        includeEntries: {
          type: "boolean",
          description: "Whether to include full reviewed memory entries. Defaults to true."
        }
      }
    }
  },
  {
    name: "update_project_intent_memory",
    description: "Explicitly upsert or disable one reviewed local Project Intent Memory entry after secret/path/transcript hygiene checks. This does not query or mutate AE.",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: "Update action: upsert or disable. Defaults to upsert."
        },
        entry: {
          type: "object",
          description: "Memory entry for upsert. Must use ae-project-intent-memory-entry.v1-safe fields; no secrets, raw transcripts, tunnel URLs, broad project dumps, or absolute paths."
        },
        id: {
          type: "string",
          description: "Entry id for disable."
        },
        confirm: {
          type: "boolean",
          description: "Required true because this writes the local memory artifact."
        },
        dryRun: {
          type: "boolean",
          description: "Validate the update without writing the memory artifact."
        }
      },
      required: ["confirm"]
    }
  },
  {
    name: "list_ai_agents",
    description: "List configured OpenAI API, OpenAI CLI, Gemini, Claude, OpenRouter, Ollama, Ollama Cloud, and custom AI agents available through the bridge.",
    inputSchema: {
      type: "object",
      properties: {
        includeModels: {
          type: "boolean",
          description: "Whether to query provider model lists. Defaults to false."
        },
        freeOnly: {
          type: "boolean",
          description: "When querying OpenRouter models, return only free models. Defaults to false."
        },
        timeoutMs: {
          type: "number",
          description: "Optional model-list request timeout in milliseconds."
        }
      }
    }
  },
  {
    name: "check_ai_agent_readiness",
    description: "Preflight a configured AI agent and model before sending chat. Verifies setup, provider reachability, and model availability where possible.",
    inputSchema: {
      type: "object",
      properties: {
        agentId: {
          type: "string",
          description: "Agent id from list_ai_agents, such as openai-cli, openai-api, gemini-api, claude-api, openrouter, ollama-local, or ollama-cloud."
        },
        model: {
          type: "string",
          description: "Provider model id. Defaults to the agent's configured model."
        },
        freeOnly: {
          type: "boolean",
          description: "When checking OpenRouter models, inspect only free models. Defaults to false."
        },
        checkModels: {
          type: "boolean",
          description: "Whether to query the provider model list. Defaults to true."
        },
        timeoutMs: {
          type: "number",
          description: "Optional provider readiness timeout in milliseconds."
        }
      },
      required: ["agentId"]
    }
  },
  {
    name: "chat_with_ai_agent",
    description: "Send a chat prompt to a configured OpenAI API, OpenAI CLI, Gemini, Claude, OpenRouter, Ollama, or custom AI agent.",
    inputSchema: {
      type: "object",
      properties: {
        agentId: {
          type: "string",
          description: "Agent id from list_ai_agents, such as openai-cli, openai-api, gemini-api, claude-api, openrouter, ollama-local, or ollama-cloud."
        },
        model: {
          type: "string",
          description: "Provider model id. Defaults to the agent's configured model."
        },
        prompt: {
          type: "string",
          description: "Single user prompt. Use messages for multi-turn chat."
        },
        messages: {
          type: "array",
          description: "OpenAI-style chat messages with role and content."
        },
        system: {
          type: "string",
          description: "Optional system message prepended when messages do not already include one."
        },
        temperature: {
          type: "number",
          description: "Optional sampling temperature."
        },
        maxTokens: {
          type: "number",
          description: "Optional maximum response tokens where the selected provider supports it."
        },
        timeoutMs: {
          type: "number",
          description: "Optional chat request timeout in milliseconds."
        },
        skipReadinessCheck: {
          type: "boolean",
          description: "Debug escape hatch to skip provider/model preflight. Defaults to false."
        }
      },
      required: ["agentId"]
    }
  },
  {
    name: "plan_with_ai_agent",
    description: "Ask a configured AI agent to draft a safe, structured After Effects MCP plan without executing project changes.",
    inputSchema: {
      type: "object",
      properties: {
        agentId: {
          type: "string",
          description: "Agent id from list_ai_agents, such as openai-cli, openai-api, gemini-api, claude-api, openrouter, ollama-local, or ollama-cloud."
        },
        model: {
          type: "string",
          description: "Provider model id. Defaults to the agent's configured model."
        },
        prompt: {
          type: "string",
          description: "User request to convert into a safe AE MCP plan."
        },
        temperature: {
          type: "number",
          description: "Optional sampling temperature. Defaults to 0.2."
        },
        maxTokens: {
          type: "number",
          description: "Optional maximum response tokens. Defaults to 2200."
        },
        repairPlan: {
          type: "boolean",
          description: "Whether to ask the model to repair malformed JSON plans. Defaults to true."
        },
        reasoning_effort: {
          type: "string",
          description: "Optional model reasoning effort. Agent Hardcore defaults to xhigh."
        },
        hardcore: {
          type: "boolean",
          description: "When true, draft the plan with Agent Hardcore guidance: explicit inspection, dry-run/read-back evidence, verification, and typed-tool gap handoff instead of repo work in AE chat."
        },
        timeoutMs: {
          type: "number",
          description: "Optional request timeout in milliseconds."
        }
      },
      required: ["agentId", "prompt"]
    }
  },
  {
    name: "validate_ai_agent_plan",
    description: "Validate a structured AE MCP plan without executing it. Checks tool names, required args, mutation safety fields, and checkpoint need.",
    inputSchema: {
      type: "object",
      properties: {
        plan: {
          type: "object",
          description: "Plan object returned by plan_with_ai_agent."
        },
        requestId: {
          type: "string",
          description: "Optional stable id used to generate idempotency key templates."
        }
      },
      required: ["plan"]
    }
  },
  {
    name: "run_ai_agent_plan",
    description: "Dry-run or execute a validated AE MCP plan. Mutating/destructive/raw real execution requires a server-owned M100 action proposal, confirmation token, confirm:true, and allowMutations:true.",
    inputSchema: {
      type: "object",
      properties: {
        plan: {
          type: "object",
          description: "Legacy dry-run/read-only plan object. Proposal-backed real runs resolve the executable plan from actionId/payloadRef instead of this body."
        },
        actionId: {
          type: "string",
          description: "Backend-created M100 action proposal id."
        },
        payloadRef: {
          type: "string",
          description: "Server-side M100 payload reference from the action proposal."
        },
        payloadHash: {
          type: "string",
          description: "Canonical payload hash from the action proposal."
        },
        previewHash: {
          type: "string",
          description: "Canonical preview hash from the action proposal."
        },
        riskLevel: {
          type: "string",
          description: "Risk level from the action proposal."
        },
        riskPolicyVersion: {
          type: "string",
          description: "Risk policy version from the action proposal."
        },
        confirmationToken: {
          type: "string",
          description: "Single-use server-issued confirmation token from the action proposal, required for real proposal-backed runs."
        },
        confirmedBySurface: {
          type: "string",
          description: "Surface echo for the proposal confirmation, such as cep-panel."
        },
        confirmedBySession: {
          type: "string",
          description: "Session echo for the proposal confirmation when present."
        },
        requestId: {
          type: "string",
          description: "Optional stable id used to generate idempotency keys."
        },
        dryRun: {
          type: "boolean",
          description: "When true, validate and show ready steps without executing. Defaults to true."
        },
        confirm: {
          type: "boolean",
          description: "Required true for real execution."
        },
        allowMutations: {
          type: "boolean",
          description: "Required true to execute project-changing steps."
        },
        autoEditSession: {
          type: "boolean",
          description: "When true, mutating runs without an existing edit session or checkpoint step start and finish a protected edit session automatically."
        },
        allowWithoutCheckpoint: {
          type: "boolean",
          description: "Legacy compatibility flag. It does not bypass auto edit-session safety for mutating runs."
        },
        allowRawExtendscript: {
          type: "boolean",
          description: "Allow run_extendscript or run_extendscript_file steps. Defaults to false."
        },
        rawExtendscriptDryRunId: {
          type: "string",
          description: "Successful dry-run id for the same current plan, required when allowing raw ExtendScript execution."
        },
        maxSteps: {
          type: "number",
          description: "Maximum steps to consider. Defaults to 20."
        }
      },
      required: []
    }
  },
  {
    name: "run_agent_hardcore_session",
    description: "Run an autonomous Agent Hardcore session: plan, dry-run, protected execution, read-back verification, retry from compact evidence, and local knowledge capture.",
    inputSchema: {
      type: "object",
      properties: {
        agentId: {
          type: "string",
          description: "Agent id from list_ai_agents, such as openai-cli, openai-api, gemini-api, claude-api, openrouter, ollama-local, or ollama-cloud."
        },
        model: {
          type: "string",
          description: "Provider model id. Defaults to the agent's configured model."
        },
        prompt: {
          type: "string",
          description: "User request to execute autonomously through Agent Hardcore."
        },
        maxAttempts: {
          type: "number",
          description: "Maximum plan/dry-run/run/repair attempts. Defaults to 3, maximum 5."
        },
        projectOwner: {
          type: "boolean",
          description: "When true, Hardcore treats the selected agent as the autonomous project owner inside bridge safety gates. Defaults to true."
        },
        reasoning_effort: {
          type: "string",
          description: "Optional model reasoning effort. Defaults to xhigh for Hardcore planning."
        },
        allowMutations: {
          type: "boolean",
          description: "Whether protected project-changing steps may run. Defaults to true."
        },
        autoEditSession: {
          type: "boolean",
          description: "Whether the runner should create and finish a protected edit session for mutating plans. Defaults to true."
        },
        allowRawFallback: {
          type: "boolean",
          description: "When a TypedTool fails, allow a later Hardcore retry to use a narrow raw ExtendScript fallback after the matching dry-run gate. Defaults to true."
        },
        autoPromoteKnowledge: {
          type: "boolean",
          description: "Whether successful verified sessions may write validated local memory and reviewed solution metadata. Defaults to true."
        },
        timeoutMs: {
          type: "number",
          description: "Optional provider request timeout in milliseconds."
        }
      },
      required: ["agentId", "prompt"]
    }
  },
  {
    name: "start_edit_session",
    description: "Start one active safe edit session with an automatic project checkpoint before later mutations.",
    inputSchema: {
      type: "object",
      properties: {
        label: {
          type: "string",
          description: "Optional human-readable session label."
        },
        notes: {
          type: "string",
          description: "Optional session notes describing the intended edit."
        }
      }
    }
  },
  {
    name: "get_edit_session_status",
    description: "Return the active edit session, checkpoint, and recent recorded mutation operations.",
    inputSchema: {
      type: "object",
      properties: {
        operationLimit: {
          type: "number",
          description: "Maximum number of recent operations to include. Defaults to 100."
        }
      }
    }
  },
  {
    name: "finish_edit_session",
    description: "Finish the active edit session without restoring or deleting its checkpoint.",
    inputSchema: {
      type: "object",
      properties: {
        outcome: {
          type: "string",
          description: "Optional session outcome label. Defaults to completed."
        },
        summary: {
          type: "string",
          description: "Optional human-readable summary of the completed session."
        }
      }
    }
  },
  {
    name: "list_edit_sessions",
    description: "List recent edit sessions recorded in the local edit session log.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Maximum number of sessions to return. Defaults to 50."
        }
      }
    }
  },
  {
    name: "backup_project_file",
    description: "Copy the currently saved After Effects project file into the bridge backups folder without modifying the open project.",
    inputSchema: {
      type: "object",
      properties: {
        label: {
          type: "string",
          description: "Optional human-readable label to include in the backup filename."
        }
      }
    }
  },
  {
    name: "checkpoint_project",
    description: "Create a named checkpoint copy of the currently saved After Effects project in the bridge backups folder.",
    inputSchema: {
      type: "object",
      properties: {
        label: {
          type: "string",
          description: "Optional human-readable checkpoint label to include in the filename."
        }
      }
    }
  },
  {
    name: "list_project_checkpoints",
    description: "List project checkpoint .aep files in the bridge backups folder.",
    inputSchema: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "Maximum number of checkpoints to return. Defaults to 100, maximum 500."
        }
      }
    }
  },
  {
    name: "get_project_checkpoint_details",
    description: "Return validated metadata for one project checkpoint file in the bridge backups folder.",
    inputSchema: {
      type: "object",
      properties: {
        checkpointFile: {
          type: "string",
          description: "Checkpoint filename or absolute path inside the bridge backups folder."
        }
      },
      required: ["checkpointFile"]
    }
  },
  {
    name: "delete_project_checkpoint",
    description: "Delete one project checkpoint file from the bridge backups folder. Requires confirm=true.",
    inputSchema: {
      type: "object",
      properties: {
        checkpointFile: {
          type: "string",
          description: "Checkpoint filename or absolute path inside the bridge backups folder."
        },
        confirm: {
          type: "boolean",
          description: "Must be true to delete the checkpoint file."
        }
      },
      required: ["checkpointFile", "confirm"]
    }
  },
  {
    name: "restore_project_checkpoint",
    description: "Safely prepare restore instructions for a checkpoint. Requires confirm=true and does not overwrite the open project.",
    inputSchema: {
      type: "object",
      properties: {
        checkpointFile: {
          type: "string",
          description: "Checkpoint filename or absolute path inside the bridge backups folder."
        },
        confirm: {
          type: "boolean",
          description: "Must be true to acknowledge restore intent."
        }
      },
      required: ["checkpointFile", "confirm"]
    }
  },
  {
    name: "ping_ae",
    description: "Check whether the After Effects CEP panel is connected and can execute ExtendScript.",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "run_extendscript",
    description: "Run an ExtendScript function body in After Effects and return its JSON-serializable result.",
    inputSchema: {
      type: "object",
      properties: {
        script: {
          type: "string",
          description: "ExtendScript function body. Use return to send data back."
        },
        timeoutMs: {
          type: "number",
          description: "Optional timeout in milliseconds."
        }
      },
      required: ["script"]
    }
  },
  {
    name: "run_extendscript_file",
    description: "Read a local ExtendScript file from disk, run it in After Effects, and return its JSON-serializable result.",
    inputSchema: {
      type: "object",
      properties: {
        filePath: {
          type: "string",
          description: "Absolute path, or a path relative to the bridge project. Defaults to files inside the bridge project."
        },
        timeoutMs: {
          type: "number",
          description: "Optional timeout in milliseconds."
        }
      },
      required: ["filePath"]
    }
  },
  {
    name: "get_project_info",
    description: "Return basic After Effects project information.",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "set_project_frames_count_type",
    description: "Set the AE Project frame numbering mode to start at frame 0 or frame 1, with explicit read-back.",
    inputSchema: {
      type: "object",
      properties: {
        framesCountType: {
          type: "string",
          enum: ["FC_START_0", "FC_START_1", "startAtZero", "startAtOne"],
          description: "Requested final Project.framesCountType. Use FC_START_0 for frame numbering that starts at 0 or FC_START_1 for frame numbering that starts at 1."
        },
        expectedCurrentFramesCountType: {
          type: "string",
          enum: ["FC_START_0", "FC_START_1", "startAtZero", "startAtOne"],
          description: "Optional guard from get_project_info. The tool fails closed if the current frame numbering mode differs."
        }
      },
      required: ["framesCountType"]
    }
  },
  {
    name: "get_project_snapshot",
    description: "Return a compact snapshot of project items for script development and navigation.",
    inputSchema: {
      type: "object",
      properties: {
        maxItems: {
          type: "number",
          description: "Maximum number of project items to return. Defaults to 500, maximum 2000."
        },
        includeComps: {
          type: "boolean",
          description: "Whether to include compositions. Defaults to true."
        },
        includeFootage: {
          type: "boolean",
          description: "Whether to include footage items. Defaults to true."
        },
        includeFolders: {
          type: "boolean",
          description: "Whether to include folders. Defaults to true."
        }
      }
    }
  },
  {
    name: "find_project_items",
    description: "Find project items by name substring, exact name, and optional item type.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Name substring or exact name to search for. Empty query returns the first results."
        },
        type: {
          type: "string",
          enum: ["comp", "footage", "folder"],
          description: "Optional project item type filter."
        },
        exactName: {
          type: "boolean",
          description: "Whether query must match the full item name. Defaults to false."
        },
        caseSensitive: {
          type: "boolean",
          description: "Whether name matching is case-sensitive. Defaults to false."
        },
        limit: {
          type: "number",
          description: "Maximum number of items to return. Defaults to 25."
        }
      }
    }
  },
  {
    name: "list_project_folder_items",
    description: "List direct or recursive contents of a project folder. Defaults to the project root when no folder is provided.",
    inputSchema: {
      type: "object",
      properties: {
        folderItemIndex: {
          type: "number",
          description: "Optional 1-based project item index for the folder to list."
        },
        folderName: {
          type: "string",
          description: "Optional exact folder name to list when folderItemIndex is not provided."
        },
        recursive: {
          type: "boolean",
          description: "Whether to include nested folder contents. Defaults to false."
        },
        type: {
          type: "string",
          enum: ["comp", "footage", "folder"],
          description: "Optional project item type filter."
        },
        limit: {
          type: "number",
          description: "Maximum number of items to return. Defaults to 200, maximum 2000."
        }
      }
    }
  },
  {
    name: "set_project_item_metadata",
    description: "Update only the AE label index on explicit project item indices with optional expected item-name guards and required read-back.",
    inputSchema: {
      type: "object",
      properties: {
        itemIndices: {
          type: ["number", "array"],
          description: "Explicit 1-based project item index or indexes from current project-item evidence."
        },
        expectedItemNames: {
          type: "array",
          items: { type: "string" },
          description: "Optional item-name guards matching itemIndices order."
        },
        label: {
          type: "number",
          description: "AE project item label index to set. Must be an integer from 0 through 16."
        },
        ...MUTATION_CHECKPOINT_SCHEMA_PROPERTIES
      },
      required: ["itemIndices", "label"]
    }
  },
  {
    name: "create_comp",
    description: "Create a production composition with explicit dimensions, duration, frame rate, and optional project folder placement.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Composition name to create."
        },
        width: {
          type: "number",
          description: "Composition width in pixels. Defaults to 1920."
        },
        height: {
          type: "number",
          description: "Composition height in pixels. Defaults to 1080."
        },
        pixelAspect: {
          type: "number",
          description: "Pixel aspect ratio. Defaults to 1."
        },
        duration: {
          type: "number",
          description: "Composition duration in seconds. Defaults to 5."
        },
        frameRate: {
          type: "number",
          description: "Composition frame rate. Defaults to 30."
        },
        bgColor: {
          type: "array",
          items: { type: "number" },
          description: "Optional RGB background color with values from 0 to 1. Defaults to black."
        },
        parentFolderItemIndex: {
          type: "number",
          description: "Optional 1-based project item index for the destination folder."
        },
        parentFolderName: {
          type: "string",
          description: "Optional exact folder name for the destination folder when parentFolderItemIndex is not provided."
        },
        allowDuplicateName: {
          type: "boolean",
          description: "Whether to allow creating a comp when another comp already has the same name. Defaults to false."
        },
        openInViewer: {
          type: "boolean",
          description: "Whether to open the new composition in the viewer. Defaults to true."
        },
        comment: {
          type: "string",
          description: "Optional project item comment to store on the created composition."
        }
      },
      required: ["name"]
    }
  },
  {
    name: "create_project_folder",
    description: "Create a project folder, optionally inside another project folder.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Folder name to create."
        },
        parentFolderItemIndex: {
          type: "number",
          description: "Optional 1-based project item index for the parent folder."
        },
        parentFolderName: {
          type: "string",
          description: "Optional exact parent folder name when parentFolderItemIndex is not provided."
        },
        allowExisting: {
          type: "boolean",
          description: "Whether to return an existing same-name child folder instead of failing. Defaults to true."
        }
      },
      required: ["name"]
    }
  },
  {
    name: "move_project_items_to_folder",
    description: "Move explicit project items into an existing project folder or the project root.",
    inputSchema: {
      type: "object",
      properties: {
        itemIndices: {
          type: ["number", "array"],
          description: "1-based project item index or indexes to move."
        },
        targetFolderItemIndex: {
          type: "number",
          description: "Optional 1-based project item index for the target folder."
        },
        targetFolderName: {
          type: "string",
          description: "Optional exact target folder name when targetFolderItemIndex is not provided."
        },
        targetRoot: {
          type: "boolean",
          description: "Move items to the project root when no target folder is provided. Defaults to false."
        },
        includeFolders: {
          type: "boolean",
          description: "Whether itemIndices may include folder items. Defaults to false."
        }
      },
      required: ["itemIndices"]
    }
  },
  {
    name: "list_comps",
    description: "List compositions in the current After Effects project.",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "list_layers",
    description: "List layers for a composition by 1-based project item index.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: {
          type: "number",
          description: "1-based project item index for the composition."
        }
      },
      required: ["compItemIndex"]
    }
  },
  {
    name: "get_comp_details",
    description: "Return detailed information for a composition, optionally including its layers.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: {
          type: "number",
          description: "Optional 1-based project item index for the composition. Defaults to active comp."
        },
        compName: {
          type: "string",
          description: "Optional exact composition name to target when compItemIndex is not provided."
        },
        includeLayers: {
          type: "boolean",
          description: "Whether to include layer summaries. Defaults to true."
        },
        layerLimit: {
          type: "number",
          description: "Maximum number of layers to include. Defaults to 200, maximum 1000."
        },
        includeMarkers: {
          type: "boolean",
          description: "Whether to include composition marker read-back from comp.markerProperty. Defaults to false."
        },
        markerLimit: {
          type: "number",
          description: "Maximum number of composition markers to include. Defaults to 50, maximum 1000."
        }
      }
    }
  },
  {
    name: "get_layer_details",
    description: "Return detailed information for one layer, including source, transform, text, effects, masks, and optional property tree.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: {
          type: "number",
          description: "Optional 1-based project item index for the target composition. Defaults to active comp."
        },
        compName: {
          type: "string",
          description: "Optional exact composition name to target when compItemIndex is not provided."
        },
        layerIndex: {
          type: "number",
          description: "1-based layer index in the target composition."
        },
        includeProperties: {
          type: "boolean",
          description: "Whether to include a property tree. Defaults to false."
        },
        propertyDepth: {
          type: "number",
          description: "Property tree depth. Defaults to 1, maximum 5."
        },
        propertyLimit: {
          type: "number",
          description: "Maximum property nodes to include. Defaults to 120, maximum 1000."
        },
        includeValues: {
          type: "boolean",
          description: "Whether to include compact value previews for properties. Defaults to false."
        },
        includeExpressions: {
          type: "boolean",
          description: "Whether to include expression text where available. Defaults to true."
        }
      },
      required: ["layerIndex"]
    }
  },
  {
    name: "get_layer_essential_properties",
    description: "Read Essential Properties exposed on one explicit precomp layer, including property identity, source evidence, values, and expression state.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: {
          type: "number",
          description: "Optional 1-based project item index for the target composition. Defaults to active comp."
        },
        compName: {
          type: "string",
          description: "Optional exact composition name to target when compItemIndex is not provided."
        },
        layerIndex: {
          type: "number",
          description: "1-based layer index in the target composition."
        },
        includeValues: {
          type: "boolean",
          description: "Whether to include compact value previews. Defaults to true."
        },
        includeExpressions: {
          type: "boolean",
          description: "Whether to include expression text and expression state. Defaults to true."
        },
        propertyLimit: {
          type: "number",
          description: "Maximum Essential Properties to return. Defaults to 80, maximum 200."
        }
      },
      required: ["layerIndex"]
    }
  },
  {
    name: "get_essential_graphics_controllers",
    description: "Read the Essential Graphics / Motion Graphics Template controller list for one explicit composition.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: {
          type: "number",
          description: "Optional 1-based project item index for the target composition. Defaults to active comp."
        },
        compName: {
          type: "string",
          description: "Optional exact composition name to target when compItemIndex is not provided."
        }
      }
    }
  },
  {
    name: "get_path_geometry",
    description: "Read one explicit Shape or Mask path geometry from one layer, including vertices, inTangents, outTangents, closed state, and optional keyframes.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: { type: "number", description: "Optional 1-based project item index for the target composition. Defaults to active comp." },
        compName: { type: "string", description: "Optional exact composition name to target when compItemIndex is not provided." },
        layerIndex: { type: "number", description: "Required 1-based layer index in the target composition." },
        targetKind: { type: "string", enum: ["shape", "mask"], description: "Path target kind. Shape requires propertyPath; mask requires maskIndex." },
        propertyPath: { type: ["array", "string"], description: "Required for targetKind=shape. Exact property path to an ADBE Vector Shape path property.", items: {} },
        maskIndex: { type: "number", description: "Required for targetKind=mask. 1-based mask index in the layer mask group." },
        expectedLayerName: { type: "string", description: "Optional exact layer name guard." },
        expectedMaskName: { type: "string", description: "Optional exact mask name guard for targetKind=mask." },
        includeKeyframes: { type: "boolean", description: "Whether to include up to keyframeLimit Shape keyframes. Defaults to true." },
        keyframeLimit: { type: "number", description: "Maximum keyframes to include. Defaults to 80, maximum 80." }
      },
      required: ["layerIndex", "targetKind"]
    }
  },
  {
    name: "export_path_points",
    description: "Write rounded path vertices from explicit get_path_geometry evidence to a generated local text export under logs/generated-exports. This tool never writes Desktop or arbitrary user paths.",
    inputSchema: {
      type: "object",
      properties: {
        vertices: {
          type: "array",
          description: "Vertices from current get_path_geometry evidence as [x, y] points. Required unless geometry is provided.",
          items: { type: "array", items: { type: "number" } }
        },
        geometry: {
          type: "object",
          description: "Optional get_path_geometry geometry object with vertices, inTangents, outTangents, and closed. Used only for geometry.vertices."
        },
        outputFileName: {
          type: "string",
          description: "Optional generated .txt filename. Must be a simple filename, not a path. Defaults to points.txt."
        },
        decimalPlaces: {
          type: "number",
          description: "Coordinate rounding precision from 0 through 4. Defaults to 2."
        },
        rotateFirstPointToEnd: {
          type: "boolean",
          description: "Whether to move the first point to the end after rounding. Defaults to true."
        },
        variableName: {
          type: "string",
          description: "JavaScript variable name for the text payload. Defaults to points."
        },
        deleteAfterReadBack: {
          type: "boolean",
          description: "When true, write and read/hash the generated file, then delete it for generated proof cleanup. Defaults to false."
        }
      }
    }
  },
  {
    name: "save_comp_frame_png",
    description: "Save one frame from an explicit generated composition to a generated PNG under logs/generated-exports, then return byte/hash read-back and resolutionFactor restoration evidence. This tool never writes Desktop or arbitrary user paths.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: {
          type: "number",
          description: "Optional 1-based project item index for the target composition. Defaults to active comp when compName is not provided."
        },
        compName: {
          type: "string",
          description: "Optional exact composition name to target when compItemIndex is not provided."
        },
        expectedCompName: {
          type: "string",
          description: "Optional guard; fails if the resolved composition name differs."
        },
        time: {
          type: "number",
          description: "Composition time in seconds to save. Defaults to the current comp time."
        },
        outputFileName: {
          type: "string",
          description: "Simple generated .png filename only, not a path. The file is written under logs/generated-exports or AE_AGENT_GENERATED_EXPORT_DIR."
        },
        resolutionFactor: {
          type: "array",
          description: "Optional [x, y] resolution factor to apply only for the save, then restore. Defaults to [1, 1].",
          items: { type: "number" },
          minItems: 2,
          maxItems: 2
        },
        allowOverwrite: {
          type: "boolean",
          description: "When true, allows replacing an existing generated .png with the same simple filename. Defaults to false."
        },
        deleteAfterReadBack: {
          type: "boolean",
          description: "When true, save, read/hash, then delete the generated PNG for proof cleanup. Defaults to false."
        }
      }
    }
  },
  {
    name: "list_effect_presets",
    description: "Return curated After Effects effect matchName presets and automation hints.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Optional case-insensitive search across name, matchName, category, description, and notes."
        },
        category: {
          type: "string",
          description: "Optional category filter such as color, blur, stylize, distort, or perspective."
        },
        includePropertyHints: {
          type: "boolean",
          description: "Whether to include curated property hints when known. Defaults to true."
        },
        limit: {
          type: "number",
          description: "Maximum number of presets to return. Defaults to 50, maximum 100."
        }
      }
    }
  },
  {
    name: "list_effects",
    description: "Return effects applied to a layer, optionally including first-level effect properties.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: {
          type: "number",
          description: "Optional 1-based project item index for the target composition. Defaults to active comp."
        },
        compName: {
          type: "string",
          description: "Optional exact composition name to target when compItemIndex is not provided."
        },
        layerIndex: {
          type: "number",
          description: "1-based layer index in the target composition."
        },
        includeProperties: {
          type: "boolean",
          description: "Whether to include first-level effect properties. Defaults to false."
        },
        includeValues: {
          type: "boolean",
          description: "Whether to include compact value previews for properties. Defaults to false."
        },
        includeExpressions: {
          type: "boolean",
          description: "Whether to include expression text where available. Defaults to true."
        }
      },
      required: ["layerIndex"]
    }
  },
  {
    name: "get_effect_details",
    description: "Return detailed information for one layer effect, including optional property tree.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: {
          type: "number",
          description: "Optional 1-based project item index for the target composition. Defaults to active comp."
        },
        compName: {
          type: "string",
          description: "Optional exact composition name to target when compItemIndex is not provided."
        },
        layerIndex: {
          type: "number",
          description: "1-based layer index in the target composition."
        },
        effectIndex: {
          type: "number",
          description: "Optional 1-based effect index in the layer effects group."
        },
        effectName: {
          type: "string",
          description: "Optional exact effect instance name."
        },
        effectMatchName: {
          type: "string",
          description: "Optional effect matchName, such as ADBE Fill."
        },
        includeProperties: {
          type: "boolean",
          description: "Whether to include a property tree. Defaults to true."
        },
        propertyDepth: {
          type: "number",
          description: "Property tree depth below each effect property. Defaults to 1, maximum 5."
        },
        propertyLimit: {
          type: "number",
          description: "Maximum property nodes to include. Defaults to 120, maximum 1000."
        },
        includeValues: {
          type: "boolean",
          description: "Whether to include compact value previews for properties. Defaults to true."
        },
        includeExpressions: {
          type: "boolean",
          description: "Whether to include expression text where available. Defaults to true."
        }
      },
      required: ["layerIndex"]
    }
  },
  {
    name: "get_active_comp",
    description: "Return details about the active After Effects composition and its selected layers.",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "get_selected_layers",
    description: "Return selected layers in the active composition.",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "set_layer_selection",
    description: "Set the selected layers in a target composition by explicit layer indexes, with optional layer-name verification.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: {
          type: "number",
          description: "Optional 1-based project item index for the target composition. Defaults to active comp."
        },
        compName: {
          type: "string",
          description: "Optional exact composition name to target when compItemIndex is not provided."
        },
        layerIndices: {
          type: "array",
          items: { type: "number" },
          description: "Explicit non-empty list of 1-based layer indexes to select."
        },
        expectedLayerNames: {
          type: "array",
          items: { type: "string" },
          description: "Optional names expected at the same positions as layerIndices. The tool fails closed on mismatch."
        },
        makeActive: {
          type: "boolean",
          description: "Whether to open the target comp in the viewer before setting selection. Defaults to true."
        }
      },
      required: ["layerIndices"]
    }
  },
  {
    name: "get_selected_properties",
    description: "Return selected properties in the active composition, including layer context when available.",
    inputSchema: {
      type: "object",
      properties: {
        includeValues: {
          type: "boolean",
          description: "Whether to include compact value previews. Defaults to true."
        },
        includeExpressions: {
          type: "boolean",
          description: "Whether to include expression text where available. Defaults to true."
        }
      }
    }
  },
  {
    name: "find_comps",
    description: "Find compositions by case-insensitive name substring.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Case-insensitive substring to search for. Empty query returns the first results."
        },
        limit: {
          type: "number",
          description: "Maximum number of compositions to return. Defaults to 25."
        }
      }
    }
  },
  {
    name: "create_text_layer",
    description: "Create a text layer in the active comp or a comp by project item index.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: {
          type: "number",
          description: "Optional 1-based project item index for the target composition. Defaults to active comp."
        },
        compName: {
          type: "string",
          description: "Optional exact composition name to target when compItemIndex is not provided."
        },
        text: {
          type: "string",
          description: "Text content to create."
        },
        name: {
          type: "string",
          description: "Optional layer name."
        },
        position: {
          type: "array",
          items: { type: "number" },
          description: "Optional [x, y] or [x, y, z] position. Defaults to comp center."
        },
        fontSize: {
          type: "number",
          description: "Optional text font size."
        },
        fillColor: {
          type: "array",
          items: { type: "number" },
          description: "Optional RGB fill color with values from 0 to 1."
        },
        startTime: {
          type: "number",
          description: "Optional layer start time in seconds."
        },
        duration: {
          type: "number",
          description: "Optional layer duration in seconds."
        }
      },
      required: ["text"]
    }
  },
  {
    name: "create_shapes_from_text",
    description: "Convert one explicit text layer into an AE-generated shape outline layer through the native Create Shapes from Text command, with name/text guards and shape-layer read-back. Fails closed if the AE menu command is unavailable.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: {
          type: "number",
          description: "Required when compName is not provided. 1-based project item index for the explicit target composition."
        },
        compName: {
          type: "string",
          description: "Required when compItemIndex is not provided. Exact composition name for the explicit target composition."
        },
        layerIndex: {
          type: "number",
          description: "Required 1-based source text layer index."
        },
        expectedLayerName: {
          type: "string",
          description: "Optional exact name guard for layerIndex."
        },
        expectedSourceText: {
          type: "string",
          description: "Optional exact Source Text guard for the source text layer."
        },
        shapeLayerName: {
          type: "string",
          description: "Optional name to apply to the generated shape layer after conversion."
        },
        lockCreatedShapeLayer: {
          type: "boolean",
          description: "Whether to lock the generated shape layer after conversion. Defaults to false."
        },
        makeActive: {
          type: "boolean",
          description: "Whether to open the target comp in the viewer before running the native command. Defaults to true."
        }
      },
      required: ["layerIndex"]
    }
  },
  {
    name: "import_footage",
    description: "Import a local file as footage into the current After Effects project.",
    inputSchema: {
      type: "object",
      properties: {
        filePath: {
          type: "string",
          description: "Absolute path, or a path relative to the bridge project, for the footage file to import."
        },
        name: {
          type: "string",
          description: "Optional project item name to apply after import."
        },
        sequence: {
          type: "boolean",
          description: "Whether to import the file as an image sequence. Defaults to false."
        }
      },
      required: ["filePath"]
    }
  },
  {
    name: "create_solid_layer",
    description: "Create a solid layer in the active comp or a comp by project item index.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: {
          type: "number",
          description: "Optional 1-based project item index for the target composition. Defaults to active comp."
        },
        compName: {
          type: "string",
          description: "Optional exact composition name to target when compItemIndex is not provided."
        },
        name: {
          type: "string",
          description: "Optional layer and solid source name. Defaults to Codex Solid."
        },
        color: {
          type: "array",
          items: { type: "number" },
          description: "Optional RGB color with values from 0 to 1. Defaults to black."
        },
        width: {
          type: "number",
          description: "Optional solid width in pixels. Defaults to comp width."
        },
        height: {
          type: "number",
          description: "Optional solid height in pixels. Defaults to comp height."
        },
        pixelAspect: {
          type: "number",
          description: "Optional pixel aspect ratio. Defaults to comp pixel aspect."
        },
        startTime: {
          type: "number",
          description: "Optional layer start time in seconds."
        },
        duration: {
          type: "number",
          description: "Optional layer duration in seconds. Defaults to the composition duration."
        },
        insertBeforeLayerIndex: {
          type: "number",
          description: "Optional explicit 1-based layer index to place the new adjustment layer immediately above. Only the newly created layer is moved."
        },
        expectedBeforeLayerName: {
          type: "string",
          description: "Optional exact name guard for insertBeforeLayerIndex."
        }
      }
    }
  },
  {
    name: "create_null_layer",
    description: "Create a null layer in the active comp or a comp by project item index.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: {
          type: "number",
          description: "Optional 1-based project item index for the target composition. Defaults to active comp."
        },
        compName: {
          type: "string",
          description: "Optional exact composition name to target when compItemIndex is not provided."
        },
        name: {
          type: "string",
          description: "Optional layer name. Defaults to Codex Null."
        },
        startTime: {
          type: "number",
          description: "Optional layer start time in seconds."
        },
        duration: {
          type: "number",
          description: "Optional layer duration in seconds. Defaults to the composition duration."
        }
      }
    }
  },
  {
    name: "create_adjustment_layer",
    description: "Create an adjustment layer in the active comp or a comp by project item index.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: {
          type: "number",
          description: "Optional 1-based project item index for the target composition. Defaults to active comp."
        },
        compName: {
          type: "string",
          description: "Optional exact composition name to target when compItemIndex is not provided."
        },
        name: {
          type: "string",
          description: "Optional layer and solid source name. Defaults to Codex Adjustment."
        },
        color: {
          type: "array",
          items: { type: "number" },
          description: "Optional RGB solid source color with values from 0 to 1. Defaults to white."
        },
        width: {
          type: "number",
          description: "Optional solid width in pixels. Defaults to comp width."
        },
        height: {
          type: "number",
          description: "Optional solid height in pixels. Defaults to comp height."
        },
        pixelAspect: {
          type: "number",
          description: "Optional pixel aspect ratio. Defaults to comp pixel aspect."
        },
        startTime: {
          type: "number",
          description: "Optional layer start time in seconds."
        },
        duration: {
          type: "number",
          description: "Optional layer duration in seconds. Defaults to the composition duration."
        }
      }
    }
  },
  {
    name: "create_camera_layer",
    description: "Create a camera layer in the active comp or a comp by project item index.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: {
          type: "number",
          description: "Optional 1-based project item index for the target composition. Defaults to active comp."
        },
        compName: {
          type: "string",
          description: "Optional exact composition name to target when compItemIndex is not provided."
        },
        name: {
          type: "string",
          description: "Optional camera layer name. Defaults to Codex Camera."
        },
        pointOfInterest: {
          type: "array",
          items: { type: "number" },
          description: "Optional [x, y] or [x, y, z] point of interest. Defaults to comp center."
        },
        position: {
          type: "array",
          items: { type: "number" },
          description: "Optional [x, y, z] camera position. Defaults to After Effects camera placement."
        },
        zoom: {
          type: "number",
          description: "Optional camera zoom in pixels. Must be greater than 0."
        },
        startTime: {
          type: "number",
          description: "Optional layer start time in seconds."
        },
        duration: {
          type: "number",
          description: "Optional layer duration in seconds. Defaults to the composition duration."
        }
      }
    }
  },
  {
    name: "create_camera_with_controller",
    description: "Create a camera and a 3D null controller, parent the camera to the controller, separate controller Position dimensions, and return read-back evidence.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: {
          type: "number",
          description: "Optional 1-based project item index for the target composition. Defaults to active comp."
        },
        compName: {
          type: "string",
          description: "Optional exact composition name to target when compItemIndex is not provided."
        },
        cameraName: {
          type: "string",
          description: "Optional camera layer name. Defaults to Camera 1."
        },
        controllerName: {
          type: "string",
          description: "Optional controller null name. Defaults to Camera Controller."
        },
        pointOfInterest: {
          type: "array",
          items: { type: "number" },
          description: "Optional [x, y] or [x, y, z] point of interest. Defaults to comp center."
        },
        cameraPosition: {
          type: "array",
          items: { type: "number" },
          description: "Optional [x, y, z] camera position. Defaults to [0, 0, (comp.width / 0.72) * -1]."
        },
        zoom: {
          type: "number",
          description: "Optional camera zoom in pixels. Must be greater than 0."
        },
        startTime: {
          type: "number",
          description: "Optional layer start time in seconds for both created layers."
        },
        duration: {
          type: "number",
          description: "Optional layer duration in seconds for both created layers. Defaults to the composition duration."
        },
        separateControllerPositionDimensions: {
          type: "boolean",
          description: "Whether to separate the controller Position dimensions. Defaults to true."
        }
      }
    }
  },
  {
    name: "toggle_onion_skinning",
    description: "Enable, disable, or toggle generated onion skinning on one composition using an adjustment layer with CC Wide Time.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: {
          type: "number",
          description: "Optional 1-based project item index for the target composition. Defaults to active comp."
        },
        compName: {
          type: "string",
          description: "Optional exact composition name to target when compItemIndex is not provided."
        },
        mode: {
          type: "string",
          description: "enable, disable, or toggle. Defaults to toggle."
        },
        layerName: {
          type: "string",
          description: "Optional generated onion skin adjustment layer name. Defaults to Onion Skin."
        },
        effectName: {
          type: "string",
          description: "Optional CC Wide Time effect instance name. Defaults to Onion Skin."
        }
      }
    }
  },
  {
    name: "add_project_item_to_comp",
    description: "Add an existing footage or composition project item as a layer in a target composition.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: {
          type: "number",
          description: "Optional 1-based project item index for the target composition. Defaults to active comp."
        },
        compName: {
          type: "string",
          description: "Optional exact composition name to target when compItemIndex is not provided."
        },
        itemIndex: {
          type: "number",
          description: "1-based project item index for the footage or composition to add."
        },
        itemName: {
          type: "string",
          description: "Optional exact project item name to add when itemIndex is not provided."
        },
        itemType: {
          type: "string",
          enum: ["comp", "footage"],
          description: "Optional item type filter when resolving itemName."
        },
        name: {
          type: "string",
          description: "Optional layer name."
        },
        position: {
          type: "array",
          items: { type: "number" },
          description: "Optional [x, y] or [x, y, z] layer position."
        },
        scale: {
          type: "array",
          items: { type: "number" },
          description: "Optional [x, y] or [x, y, z] layer scale percentages."
        },
        startTime: {
          type: "number",
          description: "Optional layer start time in seconds."
        },
        duration: {
          type: "number",
          description: "Optional layer duration in seconds."
        }
      }
    }
  },
  {
    name: "duplicate_layer",
    description: "Duplicate one explicit layer in the active comp or a comp by project item index/name. This bounded slice does not delete layers or rely on current selection.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: {
          type: "number",
          description: "Optional 1-based project item index for the target composition. Defaults to active comp."
        },
        compName: {
          type: "string",
          description: "Optional exact composition name to target when compItemIndex is not provided."
        },
        layerIndex: {
          type: "number",
          description: "Required 1-based source layer index in the target composition."
        },
        sourceName: {
          type: "string",
          description: "Optional exact expected source layer name at the current 1-based layerIndex. AE inserts newly created and duplicated layers at the top of the stack, so inspect current stack order before setting this."
        },
        name: {
          type: "string",
          description: "Optional name for the duplicated layer. Defaults to After Effects duplicate naming."
        }
      },
      required: ["layerIndex"]
    }
  },
  {
    name: "duplicate_layers",
    description: "Duplicate a bounded explicit list of source layers in the active comp or a comp by project item index/name. This runtime slice requires concrete layerIndices, rejects selection-only targeting, and does not delete layers or deep-duplicate/relink sources.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: {
          type: "number",
          description: "Optional 1-based project item index for the target composition. Defaults to active comp."
        },
        compName: {
          type: "string",
          description: "Optional exact composition name to target when compItemIndex is not provided."
        },
        layerIndices: {
          type: "array",
          items: { type: "number" },
          description: "Required non-empty explicit 1-based source layer indexes in the target composition. Duplicate, non-positive, out-of-range, and selection-only targets are rejected."
        },
        sourceNames: {
          type: "array",
          items: { type: "string" },
          description: "Optional expected source layer names, one per layerIndices entry in current AE stack order. AE inserts newly created and duplicated layers at the top of the stack, so layerIndices [1,2] after creating A then B usually maps to [B,A]."
        },
        nameSuffix: {
          type: "string",
          description: "Optional suffix applied to each duplicate name after duplication. Defaults to After Effects duplicate naming when omitted."
        }
      },
      required: ["layerIndices"]
    }
  },
  {
    name: "delete_layer",
    description: "Delete exactly one explicit layer from one explicit composition. This destructive M100 tool requires layerIndex and expectedLayerName, rejects bulk or selection-based deletion, rejects locked/out-of-range targets, and returns before/after read-back.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: {
          type: "number",
          description: "Required when compName is omitted. 1-based project item index for the target composition."
        },
        compName: {
          type: "string",
          description: "Required when compItemIndex is omitted. Exact target composition name."
        },
        layerIndex: {
          type: "number",
          description: "Required 1-based layer index in the target composition."
        },
        expectedLayerName: {
          type: "string",
          description: "Required exact layer name expected at layerIndex before deletion."
        }
      },
      required: ["layerIndex", "expectedLayerName"]
    }
  },
  {
    name: "duplicate_comp",
    description: "Duplicate an After Effects composition and optionally open it in the viewer.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: {
          type: "number",
          description: "Optional 1-based project item index for the composition. Defaults to active comp."
        },
        compName: {
          type: "string",
          description: "Optional exact composition name to duplicate when compItemIndex is not provided."
        },
        name: {
          type: "string",
          description: "Optional name for the duplicated composition."
        },
        openInViewer: {
          type: "boolean",
          description: "Whether to open the duplicated comp in the viewer. Defaults to true."
        }
      }
    }
  },
  {
    name: "deep_duplicate_precomp_sources",
    description: "Deep-duplicate the source comp of one selected or specified precomp layer, duplicate nested comp and footage project items, relink the copied comp to copied sources, and replace the layer with the copied precomp.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: {
          type: "number",
          description: "Optional 1-based project item index for the parent composition that contains the precomp layer. Defaults to active comp."
        },
        compName: {
          type: "string",
          description: "Optional exact parent composition name when compItemIndex is not provided."
        },
        layerIndex: {
          type: "number",
          description: "Optional 1-based precomp layer index. Defaults to the single selected layer in the parent composition."
        },
        sourceCompItemIndex: {
          type: "number",
          description: "Optional expected 1-based project item index of the selected layer's source precomp. Used as a safety check before mutation."
        },
        sourceCompName: {
          type: "string",
          description: "Optional expected source precomp name when sourceCompItemIndex is omitted. Used as a safety check before mutation."
        },
        nameSuffix: {
          type: "string",
          description: "Suffix added to every duplicated project item name. Defaults to ' copy'."
        },
        fixExpressions: {
          type: "boolean",
          description: "Whether After Effects should adjust expressions while replacing sources. Defaults to false."
        },
        openInViewer: {
          type: "boolean",
          description: "Whether to open the duplicated precomp after creation. Defaults to false."
        },
        unavailableFootagePolicy: {
          type: "string",
          enum: ["reuse", "fail"],
          description: "How to handle generated, placeholder, missing, or otherwise unreimportable footage sources. 'reuse' keeps the copied comp linked to the original item with a warning; 'fail' blocks the run. Defaults to reuse."
        }
      }
    }
  },
  {
    name: "add_effect",
    description: "Add an effect to a layer by effect matchName or display name.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: {
          type: "number",
          description: "Optional 1-based project item index for the target composition. Defaults to active comp."
        },
        compName: {
          type: "string",
          description: "Optional exact composition name to target when compItemIndex is not provided."
        },
        layerIndex: {
          type: "number",
          description: "1-based layer index in the target composition."
        },
        effect: {
          type: "string",
          description: "Effect matchName or display name accepted by After Effects, such as ADBE Fill."
        },
        name: {
          type: "string",
          description: "Optional effect instance name after adding it."
        }
      },
      required: ["layerIndex", "effect"]
    }
  },
  {
    name: "set_effect_property",
    description: "Set a property on an existing layer effect.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: {
          type: "number",
          description: "Optional 1-based project item index for the target composition. Defaults to active comp."
        },
        compName: {
          type: "string",
          description: "Optional exact composition name to target when compItemIndex is not provided."
        },
        layerIndex: {
          type: "number",
          description: "1-based layer index in the target composition."
        },
        effectIndex: {
          type: "number",
          description: "Optional 1-based effect index in the layer effects group."
        },
        effectName: {
          type: "string",
          description: "Optional exact effect instance name."
        },
        effectMatchName: {
          type: "string",
          description: "Optional effect matchName, such as ADBE Fill."
        },
        propertyPath: {
          type: "array",
          description: "Optional property path relative to the effect. Segments can be names, indexes, or objects with matchName/name/propertyIndex.",
          items: {}
        },
        propertyIndex: {
          type: "number",
          description: "Optional 1-based property index within the effect."
        },
        propertyName: {
          type: "string",
          description: "Optional exact effect property name."
        },
        propertyMatchName: {
          type: "string",
          description: "Optional effect property matchName."
        },
        value: {
          description: "JSON-serializable value to set."
        },
        time: {
          type: "number",
          description: "Optional time in seconds for setValueAtTime."
        },
        setAtTime: {
          type: "boolean",
          description: "Whether to set a keyframed value at time. Defaults to true when time is provided."
        }
      },
      required: ["layerIndex", "value"]
    }
  },
  {
    name: "set_effect_enabled",
    description: "Enable or disable one explicit layer effect instance after current get_effect_details or list_effects evidence.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: {
          type: "number",
          description: "Optional 1-based project item index for the target composition. Defaults to active comp."
        },
        compName: {
          type: "string",
          description: "Optional exact composition name to target when compItemIndex is not provided."
        },
        layerIndex: {
          type: "number",
          description: "1-based layer index in the target composition."
        },
        effectIndex: {
          type: "number",
          description: "Optional 1-based effect index in the layer effects group."
        },
        effectName: {
          type: "string",
          description: "Optional exact effect instance name."
        },
        effectMatchName: {
          type: "string",
          description: "Optional effect matchName, such as ADBE Turbulent Displace."
        },
        enabled: {
          type: "boolean",
          description: "Requested final enabled state for the resolved effect instance."
        },
        expectedCurrentEnabled: {
          type: "boolean",
          description: "Optional guard from current read-back. The tool fails closed if the resolved effect has a different enabled state."
        }
      },
      required: ["layerIndex", "enabled"]
    }
  },
  {
    name: "set_puppet_pin_type",
    description: "Set one explicit ADBE FreePin3 puppet pin type property to Position or Advanced after get_effect_details evidence.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: {
          type: "number",
          description: "Optional 1-based project item index for the target composition. Defaults to active comp."
        },
        compName: {
          type: "string",
          description: "Optional exact composition name to target when compItemIndex is not provided."
        },
        layerIndex: {
          type: "number",
          description: "1-based layer index in the target composition."
        },
        effectIndex: {
          type: "number",
          description: "Optional 1-based effect index in the layer effects group."
        },
        effectName: {
          type: "string",
          description: "Optional exact Puppet effect instance name."
        },
        effectMatchName: {
          type: "string",
          description: "Optional effect matchName. If provided it must be ADBE FreePin3."
        },
        pinTypePropertyPath: {
          type: "array",
          description: "Property path from current get_effect_details evidence to the ADBE FreePin3 PosPin Type property. It may be layer-relative or effect-relative and must include or resolve under an ADBE FreePin3 PosPin Atom ancestor.",
          items: {}
        },
        expectedPinName: {
          type: "string",
          description: "Optional Puppet pin atom display name expected from get_effect_details evidence, such as Puppet Pin 1."
        },
        expectedCurrentPinType: {
          description: "Optional current pin type expected before mutation. Accepts 1/position or 4/advanced."
        },
        pinType: {
          description: "Requested pin type: 1 or position, or 4 or advanced."
        }
      },
      required: ["layerIndex", "pinTypePropertyPath", "pinType"]
    }
  },
  {
    name: "add_property_to_essential_graphics",
    description: "Add one explicit layer property to a composition's Essential Graphics controller list with reviewed naming and controller read-back.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: {
          type: "number",
          description: "Required when compName is omitted. 1-based project item index for the composition whose Essential Graphics panel is updated."
        },
        compName: {
          type: "string",
          description: "Required when compItemIndex is omitted. Exact generated or explicitly reviewed target composition name."
        },
        layerIndex: {
          type: "number",
          description: "1-based layer index containing the property to add."
        },
        expectedLayerName: {
          type: "string",
          description: "Optional exact layer-name guard from current typed evidence."
        },
        propertyPath: {
          type: ["array", "string"],
          description: "Exact property path from current get_layer_details/get_selected_properties evidence. String values may be JSON-encoded arrays.",
          items: {}
        },
        expectedPropertyName: {
          type: "string",
          description: "Optional display-name guard for the resolved property."
        },
        expectedPropertyMatchName: {
          type: "string",
          description: "Optional matchName guard for the resolved property."
        },
        controllerName: {
          type: "string",
          description: "Reviewed Essential Graphics controller name to create. 1-80 characters."
        },
        expectedControllerCountBefore: {
          type: "number",
          description: "Optional controller-count guard from get_essential_graphics_controllers evidence."
        },
        ...MUTATION_CHECKPOINT_SCHEMA_PROPERTIES
      },
      required: ["layerIndex", "propertyPath", "controllerName"]
    }
  },
  {
    name: "set_property_value",
    description: "Set an arbitrary layer property by property path or matchName path.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: {
          type: "number",
          description: "Optional 1-based project item index for the target composition. Defaults to active comp."
        },
        compName: {
          type: "string",
          description: "Optional exact composition name to target when compItemIndex is not provided."
        },
        layerIndex: {
          type: ["number", "array"],
          description: "1-based layer index in the target composition, or an array of 1-based layer indexes for the same property/value."
        },
        propertyPath: {
          type: ["array", "string"],
          description: "Property path from the layer. Segments can be names, numeric indexes, or objects with matchName/name/propertyIndex. Also accepts whitelisted layer attributes: threeDLayer, collapseTransformation, or motionBlur.",
          items: {}
        },
        value: {
          description: "JSON-serializable value to set. For TextDocument properties, pass an object with fields such as text, fontSize, fillColor, applyFill."
        },
        time: {
          type: "number",
          description: "Optional time in seconds for setValueAtTime."
        },
        setAtTime: {
          type: "boolean",
          description: "Whether to set a keyframed value at time. Defaults to true when time is provided."
        }
      },
      required: ["layerIndex", "propertyPath", "value"]
    }
  },
  {
    name: "set_layer_metadata",
    description: "Update only comment, label, locked, enabled, and guideLayer on explicit layer indices in one explicit composition, with optional expected layer-name guards and required read-back.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: {
          type: "number",
          description: "Required when compName is omitted. 1-based project item index for the explicit target composition."
        },
        compName: {
          type: "string",
          description: "Required when compItemIndex is omitted. Exact generated target composition name."
        },
        layerIndices: {
          type: "array",
          items: { type: "number" },
          description: "Required explicit 1-based layer indices. Selection-based or all-layer discovery must happen in earlier read-only steps."
        },
        expectedLayerNames: {
          type: "array",
          items: { type: "string" },
          description: "Optional expected layer names in the same order as layerIndices; when provided, mismatches fail closed before mutation."
        },
        comment: {
          type: "string",
          description: "Optional layer comment to set. Maximum 500 characters."
        },
        label: {
          type: "number",
          description: "Optional AE label index to set. Must be an integer from 0 through 16."
        },
        locked: {
          type: "boolean",
          description: "Optional locked state to set."
        },
        enabled: {
          type: "boolean",
          description: "Optional layer visibility/enabled state to set."
        },
        guideLayer: {
          type: "boolean",
          description: "Optional AE guide-layer state to set on explicit generated or reviewed layers."
        }
      },
      required: ["layerIndices"]
    }
  },
  {
    name: "set_layer_parent",
    description: "Parent one explicit layer to another explicit layer in the same composition, with optional child/parent name guards.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: {
          type: "number",
          description: "Optional 1-based project item index for the target composition. Defaults to active comp."
        },
        compName: {
          type: "string",
          description: "Optional exact composition name to target when compItemIndex is not provided."
        },
        layerIndex: {
          type: "number",
          description: "1-based child layer index to parent."
        },
        parentLayerIndex: {
          type: "number",
          description: "1-based parent layer index in the same composition."
        },
        expectedLayerName: {
          type: "string",
          description: "Optional exact child layer name guard. The tool fails closed on mismatch."
        },
        expectedParentName: {
          type: "string",
          description: "Optional exact parent layer name guard. The tool fails closed on mismatch."
        }
      },
      required: ["layerIndex", "parentLayerIndex"]
    }
  },
  {
    name: "set_layer_track_matte",
    description: "Set one explicit generated layer's track matte to one explicit matte layer in the same composition, with optional name guards and required read-back.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: {
          type: "number",
          description: "Optional 1-based project item index for the target composition. Defaults to active comp."
        },
        compName: {
          type: "string",
          description: "Optional exact generated composition name to target when compItemIndex is not provided."
        },
        layerIndex: {
          type: "number",
          description: "1-based fill layer index that will receive the track matte."
        },
        matteLayerIndex: {
          type: "number",
          description: "1-based matte layer index in the same composition."
        },
        trackMatteType: {
          type: "string",
          enum: ["alpha", "alpha_inverted", "luma", "luma_inverted"],
          description: "Reviewed track matte type to apply."
        },
        expectedLayerName: {
          type: "string",
          description: "Optional exact fill layer name guard. The tool fails closed on mismatch."
        },
        expectedMatteLayerName: {
          type: "string",
          description: "Optional exact matte layer name guard. The tool fails closed on mismatch."
        }
      },
      required: ["layerIndex", "matteLayerIndex", "trackMatteType"]
    }
  },
  {
    name: "set_layer_blending_mode",
    description: "Set only the reviewed normal or difference blending mode on explicit layer indices in one explicit composition, with optional expected layer-name and current-mode guards plus required read-back.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: {
          type: "number",
          description: "Required when compName is omitted. 1-based project item index for the explicit target composition."
        },
        compName: {
          type: "string",
          description: "Required when compItemIndex is omitted. Exact generated target composition name."
        },
        layerIndices: {
          type: "array",
          items: { type: "number" },
          description: "Required explicit 1-based layer indices. Selection-based discovery must happen in earlier read-only steps."
        },
        expectedLayerNames: {
          type: "array",
          items: { type: "string" },
          description: "Optional expected layer names in the same order as layerIndices; mismatches fail closed before mutation."
        },
        expectedCurrentBlendingModes: {
          type: "array",
          items: { type: "string", enum: ["normal", "difference"] },
          description: "Optional expected current blending modes in the same order as layerIndices; mismatches fail closed before mutation."
        },
        blendingMode: {
          type: "string",
          enum: ["normal", "difference"],
          description: "Reviewed target blending mode. Only normal and difference are supported by this generated-only contract."
        }
      },
      required: ["layerIndices", "blendingMode"]
    }
  },
  {
    name: "align_layers_to_time",
    description: "Move selected or specified layers so their in-points or start times align to a target time. Defaults to selected layers and the active comp current time indicator.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: {
          type: "number",
          description: "Optional 1-based project item index for the target composition. Defaults to active comp."
        },
        compName: {
          type: "string",
          description: "Optional exact composition name to target when compItemIndex is not provided."
        },
        layerIndices: {
          type: ["number", "array"],
          description: "Optional 1-based layer index or layer indexes. Defaults to selected layers in the target composition."
        },
        targetTime: {
          type: "number",
          description: "Optional target time in seconds. Defaults to the composition current time indicator."
        },
        align: {
          type: "string",
          enum: ["inPoint", "startTime"],
          description: "Whether to align each layer's visible inPoint or raw startTime. Defaults to inPoint, matching the AE '[' shortcut behavior."
        }
      }
    }
  },
  {
    name: "set_comp_current_time",
    description: "Set the current time indicator for one explicit composition, with bounded seconds or reviewed frame-derived target and read-back verification.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: {
          type: "number",
          description: "Required when compName is omitted. 1-based project item index for the target composition."
        },
        compName: {
          type: "string",
          description: "Required when compItemIndex is omitted. Exact target composition name."
        },
        time: {
          type: "number",
          description: "Target current time in seconds. Provide exactly one of time or frame."
        },
        frame: {
          type: "number",
          description: "Zero-based integer frame to convert to seconds. Provide exactly one of time or frame."
        },
        frameRate: {
          type: "number",
          description: "Optional positive frame rate for frame conversion. Defaults to the target comp frameRate."
        },
        expectedCurrentTime: {
          type: "number",
          description: "Optional guard for the current comp time before mutation; mismatches fail closed."
        },
        clampToDuration: {
          type: "boolean",
          description: "Whether to clamp out-of-range time to [0, duration]. Defaults to false, which fails closed."
        },
        openInViewer: {
          type: "boolean",
          description: "Whether to open the target comp in the viewer before setting time. Defaults to false."
        }
      }
    }
  },
  {
    name: "set_comp_work_area",
    description: "Set the work-area start and duration for the active or specified composition.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: {
          type: "number",
          description: "Optional 1-based project item index for the target composition. Defaults to active comp."
        },
        compName: {
          type: "string",
          description: "Optional exact composition name to target when compItemIndex is not provided."
        },
        start: {
          type: "number",
          description: "Work-area start time in seconds. Defaults to the current comp time."
        },
        duration: {
          type: "number",
          description: "Work-area duration in seconds."
        }
      },
      required: ["duration"]
    }
  },
  {
    name: "set_comp_properties",
    description: "Update a narrow approved set of properties on one explicit composition: width, height, pixelAspect, duration, frameRate, bgColor, displayStartTime, native displayStartFrame, and preserveNestedFrameRate only.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: {
          type: "number",
          description: "Required when compName is omitted. 1-based project item index for the target composition."
        },
        compName: {
          type: "string",
          description: "Required when compItemIndex is omitted. Exact target composition name."
        },
        width: { type: "number", description: "Optional composition width in pixels. Must be a positive integer." },
        height: { type: "number", description: "Optional composition height in pixels. Must be a positive integer." },
        pixelAspect: { type: "number", description: "Optional pixel aspect ratio. Must be greater than 0." },
        duration: { type: "number", description: "Optional composition duration in seconds. Must be greater than 0." },
        frameRate: { type: "number", description: "Optional frame rate in frames per second. Must be greater than 0." },
        bgColor: {
          type: "array",
          items: { type: "number" },
          description: "Optional RGB background color as three numbers from 0 to 1."
        },
        displayStartTime: { type: "number", description: "Optional display start time in seconds." },
        displayStartFrame: { type: "number", description: "Optional native integer display start frame. Requires AE support for CompItem.displayStartFrame." },
        preserveNestedFrameRate: { type: "boolean", description: "Optional Preserve frame rate when nested or in render queue setting." }
      }
    }
  },
  {
    name: "refresh_comp_panel",
    description: "Force a Composition panel refresh for one explicit composition by temporarily toggling comp.motionBlur and restoring the original value with read-back evidence.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: {
          type: "number",
          description: "Required when compName is omitted. 1-based project item index for the explicit target composition."
        },
        compName: {
          type: "string",
          description: "Required when compItemIndex is omitted. Exact target composition name."
        },
        expectedMotionBlur: {
          type: "boolean",
          description: "Optional guard from prior get_comp_details evidence. The tool fails closed if the current comp.motionBlur state differs."
        }
      }
    }
  },
  {
    name: "set_layer_time_range",
    description: "Set start, in-point, out-point, or duration for selected or specified layers.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: { type: "number", description: "Optional 1-based project item index for the target composition. Defaults to active comp." },
        compName: { type: "string", description: "Optional exact composition name to target when compItemIndex is not provided." },
        layerIndices: { type: ["number", "array"], description: "Optional layer index or indexes. Defaults to selected layers." },
        startTime: { type: "number", description: "Optional layer start time in seconds." },
        inPoint: { type: "number", description: "Optional layer in-point in seconds." },
        outPoint: { type: "number", description: "Optional layer out-point in seconds." },
        duration: { type: "number", description: "Optional visible duration in seconds, applied from the final in-point." }
      }
    }
  },
  {
    name: "stagger_layers",
    description: "Sequence selected or specified layers by preserving each layer duration and applying a gap or overlap.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: { type: "number", description: "Optional 1-based project item index for the target composition. Defaults to active comp." },
        compName: { type: "string", description: "Optional exact composition name to target when compItemIndex is not provided." },
        layerIndices: { type: ["number", "array"], description: "Optional layer index or indexes. Defaults to selected layers." },
        startTime: { type: "number", description: "Optional sequence start time. Defaults to comp current time." },
        gap: { type: "number", description: "Seconds between layer out-point and next layer in-point. Defaults to 0." },
        overlap: { type: "number", description: "Seconds each next layer overlaps the previous layer. Defaults to 0." },
        order: { type: "string", enum: ["selection", "indexAsc", "indexDesc"], description: "Layer sequencing order. Defaults to selection/request order." }
      }
    }
  },
  {
    name: "split_layers_at_time",
    description: "Split selected or specified layers at the current time indicator or a target time.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: { type: "number", description: "Optional 1-based project item index for the target composition. Defaults to active comp." },
        compName: { type: "string", description: "Optional exact composition name to target when compItemIndex is not provided." },
        layerIndices: { type: ["number", "array"], description: "Optional layer index or indexes. Defaults to selected layers." },
        time: { type: "number", description: "Optional split time in seconds. Defaults to comp current time." }
      }
    }
  },
  {
    name: "precompose_layers",
    description: "Precompose explicit layers into a new composition.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: { type: "number", description: "Optional 1-based project item index for the target composition. Defaults to active comp." },
        compName: { type: "string", description: "Optional exact composition name to target when compItemIndex is not provided." },
        layerIndices: { type: "array", items: { type: "number" }, description: "Explicit 1-based layer indexes to precompose." },
        newCompName: { type: "string", description: "Name for the new precomposition." },
        moveAllAttributes: { type: "boolean", description: "Whether to move all attributes into the new comp. Defaults to true." },
        openInViewer: { type: "boolean", description: "Whether to open the new comp after creation. Defaults to true." }
      },
      required: ["layerIndices", "newCompName"]
    }
  },
  {
    name: "replace_layer_source",
    description: "Replace selected or specified layer sources with an existing footage or composition item while preserving layer transforms.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: { type: "number", description: "Optional 1-based project item index for the target composition. Defaults to active comp." },
        compName: { type: "string", description: "Optional exact composition name to target when compItemIndex is not provided." },
        layerIndices: { type: ["number", "array"], description: "Optional layer index or indexes. Defaults to selected layers." },
        sourceItemIndex: { type: "number", description: "1-based project item index for the replacement source." },
        sourceItemName: { type: "string", description: "Exact replacement source item name when sourceItemIndex is omitted." },
        sourceItemType: { type: "string", enum: ["comp", "footage"], description: "Optional source type filter." },
        fixExpressions: { type: "boolean", description: "Whether After Effects should adjust expressions. Defaults to true." }
      }
    }
  },
  {
    name: "rename_layers",
    description: "Rename selected or specified layers with exact, prefix, suffix, or find-replace modes.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: { type: "number", description: "Optional 1-based project item index for the target composition. Defaults to active comp." },
        compName: { type: "string", description: "Optional exact composition name to target when compItemIndex is not provided." },
        layerIndices: { type: ["number", "array"], description: "Optional layer index or indexes. Defaults to selected layers." },
        expectedLayerNames: {
          type: "array",
          items: { type: "string" },
          description: "Optional expected source layer names, one per layerIndices entry. When provided, mismatches fail closed before mutation."
        },
        mode: { type: "string", enum: ["exact", "prefix", "suffix", "findReplace"], description: "Rename mode. Defaults to exact when name is provided." },
        name: { type: "string", description: "Exact base name. For multiple layers, {index} or {n} templates are supported; otherwise a number is appended." },
        allowEmptyName: { type: "boolean", description: "Explicitly allow mode:\"exact\" with name:\"\" for one reviewed layer reset. Defaults to false." },
        prefix: { type: "string", description: "Prefix to add in prefix mode." },
        suffix: { type: "string", description: "Suffix to add in suffix mode." },
        find: { type: "string", description: "Text to find in findReplace mode." },
        replace: { type: "string", description: "Replacement text for findReplace mode." },
        caseSensitive: { type: "boolean", description: "Whether findReplace matching is case-sensitive. Defaults to true." }
      }
    }
  },
  {
    name: "rename_project_items",
    description: "Rename project items by explicit indexes or a scoped search with exact, prefix, suffix, or find-replace modes.",
    inputSchema: {
      type: "object",
      properties: {
        itemIndices: { type: ["number", "array"], description: "Optional project item index or indexes." },
        query: { type: "string", description: "Optional name query used when itemIndices is omitted." },
        type: { type: "string", enum: ["comp", "footage", "folder"], description: "Optional project item type filter." },
        exactName: { type: "boolean", description: "Whether query must match the full name. Defaults to false." },
        caseSensitive: { type: "boolean", description: "Whether query/find matching is case-sensitive. Defaults to false for query and true for findReplace." },
        limit: { type: "number", description: "Maximum project items to rename. Defaults to 25, maximum 100." },
        mode: { type: "string", enum: ["exact", "prefix", "suffix", "findReplace"], description: "Rename mode." },
        name: { type: "string", description: "Exact base name. For multiple items, {index} or {n} templates are supported; otherwise a number is appended." },
        prefix: { type: "string", description: "Prefix to add in prefix mode." },
        suffix: { type: "string", description: "Suffix to add in suffix mode." },
        find: { type: "string", description: "Text to find in findReplace mode." },
        replace: { type: "string", description: "Replacement text for findReplace mode." }
      }
    }
  },
  {
    name: "update_text_layer",
    description: "Update a text layer's Source Text and common TextDocument fields.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: { type: "number", description: "Optional 1-based project item index for the target composition. Defaults to active comp." },
        compName: { type: "string", description: "Optional exact composition name to target when compItemIndex is not provided." },
        layerIndex: { type: "number", description: "1-based text layer index." },
        text: { type: "string", description: "Optional new text content." },
        font: { type: "string", description: "Optional font name." },
        fontSize: { type: "number", description: "Optional font size." },
        fillColor: { type: "array", items: { type: "number" }, description: "Optional RGB fill color with values from 0 to 1." },
        applyFill: { type: "boolean", description: "Whether fill is enabled." },
        strokeColor: { type: "array", items: { type: "number" }, description: "Optional RGB stroke color with values from 0 to 1." },
        applyStroke: { type: "boolean", description: "Whether stroke is enabled." },
        strokeWidth: { type: "number", description: "Optional stroke width." },
        tracking: { type: "number", description: "Optional tracking value." },
        leading: { type: "number", description: "Optional leading value." }
      },
      required: ["layerIndex"]
    }
  },
  {
    name: "create_shape_layer",
    description: "Create a rectangle or ellipse shape layer with fill, stroke, size, position, and timing.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: { type: "number", description: "Optional 1-based project item index for the target composition. Defaults to active comp." },
        compName: { type: "string", description: "Optional exact composition name to target when compItemIndex is not provided." },
        shape: { type: "string", enum: ["rectangle", "ellipse"], description: "Shape type. Defaults to rectangle." },
        name: { type: "string", description: "Optional layer name." },
        size: { type: "array", items: { type: "number" }, description: "Shape size [width, height]. Defaults to half comp size." },
        position: { type: "array", items: { type: "number" }, description: "Layer position [x, y] or [x, y, z]. Defaults to comp center." },
        fillColor: { type: "array", items: { type: "number" }, description: "Optional RGB fill color with values from 0 to 1." },
        strokeColor: { type: "array", items: { type: "number" }, description: "Optional RGB stroke color with values from 0 to 1." },
        strokeWidth: { type: "number", description: "Optional stroke width. Defaults to 0." },
        startTime: { type: "number", description: "Optional layer start time in seconds." },
        duration: { type: "number", description: "Optional layer duration in seconds." }
      }
    }
  },
  {
    name: "create_layer_connection_line",
    description: "Create one generated locked shape layer containing an open stroked path expression that connects two explicit layer anchor points.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: { type: "number", description: "Required when compName is not provided. 1-based project item index for the explicit target composition." },
        compName: { type: "string", description: "Required when compItemIndex is not provided. Exact composition name for the explicit target composition." },
        fromLayerIndex: { type: "number", description: "Required 1-based source layer index for the first anchor endpoint." },
        toLayerIndex: { type: "number", description: "Required 1-based source layer index for the second anchor endpoint." },
        expectedFromLayerName: { type: "string", description: "Optional exact name guard for fromLayerIndex." },
        expectedToLayerName: { type: "string", description: "Optional exact name guard for toLayerIndex." },
        name: { type: "string", description: "Optional generated connector layer name. Defaults to Codex Connection Line." },
        pathGroupName: { type: "string", description: "Optional shape group name for the connector path. Defaults to Connector." },
        strokeColor: { type: "array", items: { type: "number" }, description: "Optional RGB stroke color with values from 0 to 1. Defaults to white." },
        strokeWidth: { type: "number", description: "Optional connector stroke width. Defaults to 4." },
        startTime: { type: "number", description: "Optional layer start time in seconds." },
        duration: { type: "number", description: "Optional layer duration in seconds." },
        lockLayer: { type: "boolean", description: "Whether to lock the generated connector layer after expression setup. Defaults to true." }
      },
      required: ["fromLayerIndex", "toLayerIndex"]
    }
  },
  {
    name: "create_layer_mask",
    description: "Create one bounded additive polygon mask on an existing layer. This first mask slice does not delete masks, invert masks, or edit arbitrary existing mask paths.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: { type: "number", description: "Optional 1-based project item index for the target composition. Defaults to active comp." },
        compName: { type: "string", description: "Optional exact composition name to target when compItemIndex is not provided." },
        layerIndex: { type: "number", description: "1-based layer index in the target composition." },
        name: { type: "string", description: "Optional mask name. Defaults to Codex Mask." },
        vertices: {
          type: "array",
          description: "Polygon vertices as an array of [x, y] layer-space points. Supports 3 to 50 points.",
          items: { type: "array", items: { type: "number" } }
        },
        maskMode: { type: "string", enum: ["add"], description: "Mask mode. M191 supports only add." },
        opacity: { type: "number", description: "Optional mask opacity from 0 to 100." },
        feather: { type: "array", items: { type: "number" }, description: "Optional [x, y] mask feather values, 0 or greater." },
        expansion: { type: "number", description: "Optional mask expansion in pixels." }
      },
      required: ["layerIndex", "vertices"]
    }
  },
  {
    name: "set_layer_mask",
    description: "Create or update one bounded layer mask on one explicit layer in one explicit composition. Provide compItemIndex or compName; update mode requires one explicit maskIndex and this tool never deletes masks, runs roto, or edits arbitrary mask property trees.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: { type: "number", description: "Required when compName is not provided. 1-based project item index for the explicit target composition; set_layer_mask does not default to the active comp." },
        compName: { type: "string", description: "Required when compItemIndex is not provided. Exact composition name for the explicit target composition; set_layer_mask does not default to the active comp." },
        layerIndex: { type: "number", description: "Required 1-based layer index in the target composition." },
        operation: { type: "string", enum: ["create", "update"], description: "Required operation. Create adds one mask; update changes one existing mask by maskIndex." },
        maskIndex: { type: "number", description: "Required for update. 1-based mask index in the layer mask group." },
        expectedMaskName: { type: "string", description: "Optional exact mask name guard for update mode." },
        name: { type: "string", description: "Optional mask name for create mode. Update mode does not rename masks." },
        vertices: {
          type: "array",
          description: "Optional polygon vertices as an array of [x, y] layer-space points. Create mode requires 3 to 50 points; update mode may omit vertices when changing other bounded fields.",
          items: { type: "array", items: { type: "number" } }
        },
        maskMode: { type: "string", enum: ["add", "subtract", "intersect", "lighten", "darken", "difference", "none"], description: "Optional bounded mask mode." },
        inverted: { type: "boolean", description: "Optional mask inverted flag." },
        opacity: { type: "number", description: "Optional mask opacity from 0 to 100." },
        feather: { type: "array", items: { type: "number" }, description: "Optional [x, y] mask feather values, 0 or greater." },
        expansion: { type: "number", description: "Optional mask expansion in pixels." }
      },
      required: ["layerIndex", "operation"]
    }
  },
  {
    name: "set_path_geometry",
    description: "Set one explicit Shape or Mask path geometry on one layer using reviewed vertices, inTangents, outTangents, closed state, or a bounded keyframe list, then return immediate read-back.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: { type: "number", description: "Required when compName is not provided. 1-based project item index for the explicit target composition." },
        compName: { type: "string", description: "Required when compItemIndex is not provided. Exact composition name for the explicit target composition." },
        layerIndex: { type: "number", description: "Required 1-based layer index in the target composition." },
        targetKind: { type: "string", enum: ["shape", "mask"], description: "Path target kind. Shape requires propertyPath; mask requires maskIndex." },
        propertyPath: { type: ["array", "string"], description: "Required for targetKind=shape. Exact property path to an ADBE Vector Shape path property.", items: {} },
        maskIndex: { type: "number", description: "Required for targetKind=mask. 1-based mask index in the layer mask group." },
        expectedLayerName: { type: "string", description: "Optional exact layer name guard." },
        expectedMaskName: { type: "string", description: "Optional exact mask name guard for targetKind=mask." },
        geometry: { type: "object", description: "Optional geometry object with vertices, inTangents, outTangents, and closed. Required unless keyframes are provided." },
        vertices: { type: "array", description: "Top-level vertices alternative to geometry.vertices.", items: { type: "array", items: { type: "number" } } },
        inTangents: { type: "array", description: "Top-level inTangents alternative to geometry.inTangents.", items: { type: "array", items: { type: "number" } } },
        outTangents: { type: "array", description: "Top-level outTangents alternative to geometry.outTangents.", items: { type: "array", items: { type: "number" } } },
        closed: { type: "boolean", description: "Top-level closed state alternative to geometry.closed." },
        keyframes: { type: "array", description: "Optional bounded Shape keyframes; each item needs time plus vertices, inTangents, outTangents, and closed, or a geometry object.", items: { type: "object" } },
        clearExisting: { type: "boolean", description: "When keyframes are provided, remove existing keys before writing the reviewed sequence. Defaults to false." }
      },
      required: ["layerIndex", "targetKind"]
    }
  },
  {
    name: "fit_layer_to_comp",
    description: "Scale selected or specified layers to contain, cover, or stretch to the comp frame.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: { type: "number", description: "Optional 1-based project item index for the target composition. Defaults to active comp." },
        compName: { type: "string", description: "Optional exact composition name to target when compItemIndex is not provided." },
        layerIndices: { type: ["number", "array"], description: "Optional layer index or indexes. Defaults to selected layers." },
        mode: { type: "string", enum: ["contain", "cover", "stretch"], description: "Fit mode. Defaults to contain." },
        alignX: { type: "string", enum: ["left", "center", "right"], description: "Horizontal alignment. Defaults to center." },
        alignY: { type: "string", enum: ["top", "center", "bottom"], description: "Vertical alignment. Defaults to center." }
      }
    }
  },
  {
    name: "set_property_keyframes",
    description: "Set explicit keyframes on a layer property by property path.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: { type: "number", description: "Optional 1-based project item index for the target composition. Defaults to active comp." },
        compName: { type: "string", description: "Optional exact composition name to target when compItemIndex is not provided." },
        layerIndex: { type: "number", description: "1-based layer index in the target composition." },
        propertyPath: { type: ["array", "string"], description: "Property path from the layer.", items: {} },
        keyframes: { type: "array", description: "Array of keyframes with time and value fields.", items: { type: "object" } },
        clearExisting: { type: "boolean", description: "Whether to remove existing keys first. Defaults to false." }
      },
      required: ["layerIndex", "propertyPath", "keyframes"]
    }
  },
  {
    name: "fill_in_keyframes",
    description: "Sample a property's evaluated expression/value over a bounded time range, set linear keyframes, remove redundant identical triples, and optionally clear the expression.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: { type: "number", description: "Optional 1-based project item index for the target composition. Defaults to active comp." },
        compName: { type: "string", description: "Optional exact composition name to target when compItemIndex is not provided." },
        layerIndex: { type: "number", description: "1-based layer index in the target composition." },
        propertyPath: { type: ["array", "string"], description: "Property path from the layer.", items: {} },
        startTime: { type: "number", description: "Optional start time in seconds. Defaults to the first keyframe time, workAreaStart, or 0." },
        endTime: { type: "number", description: "Optional end time in seconds. Defaults to the last keyframe time, workArea end, or comp duration." },
        sampleEveryFrames: { type: "number", description: "Positive frame step for sampling. Defaults to 1." },
        removeRedundant: { type: "boolean", description: "Whether to remove interior keyframes whose previous/current/next values are identical. Defaults to true." },
        clearExpression: { type: "boolean", description: "Whether to clear the expression after baking keyframes. Defaults to true." }
      },
      required: ["layerIndex", "propertyPath"]
    }
  },
  {
    name: "keyframe_current_value_from_expression",
    description: "Evaluate the current post-expression property value at a time and write it as a keyframe on the same property.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: { type: "number", description: "Optional 1-based project item index for the target composition. Defaults to active comp." },
        compName: { type: "string", description: "Optional exact composition name to target when compItemIndex is not provided." },
        layerIndex: { type: "number", description: "1-based layer index in the target composition." },
        propertyPath: { type: ["array", "string"], description: "Property path from the layer.", items: {} },
        time: { type: "number", description: "Optional time in seconds. Defaults to the composition current time." },
        requireExpression: { type: "boolean", description: "Whether to require a non-empty expression before keyframing. Defaults to true." }
      },
      required: ["layerIndex", "propertyPath"]
    }
  },
  {
    name: "apply_keyframe_ease",
    description: "Apply temporal ease and optional interpolation to selected or explicit keyframes on a layer property.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: { type: "number", description: "Optional 1-based project item index for the target composition. Defaults to active comp." },
        compName: { type: "string", description: "Optional exact composition name to target when compItemIndex is not provided." },
        layerIndex: { type: "number", description: "1-based layer index in the target composition." },
        propertyPath: { type: ["array", "string"], description: "Property path from the layer.", items: {} },
        keyIndices: { type: ["number", "array"], description: "Optional keyframe index or indexes. Defaults to selected keys." },
        easeIn: { type: "object", description: "Ease-in object with speed and influence. Defaults to speed 0, influence 33." },
        easeOut: { type: "object", description: "Ease-out object with speed and influence. Defaults to speed 0, influence 33." },
        interpolation: { type: "string", enum: ["bezier", "linear", "hold"], description: "Optional interpolation type." }
      },
      required: ["layerIndex", "propertyPath"]
    }
  },
  {
    name: "set_spatial_in_tangent",
    description: "Set the spatial in tangent for a spatial keyframe from the previous keyframe delta, preserving the existing out tangent.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: { type: "number", description: "Optional 1-based project item index for the target composition. Defaults to active comp." },
        compName: { type: "string", description: "Optional exact composition name to target when compItemIndex is not provided." },
        layerIndex: { type: "number", description: "1-based layer index in the target composition." },
        propertyPath: { type: ["array", "string"], description: "Spatial property path from the layer. Defaults to Transform Position.", items: {} },
        keyIndex: { type: "number", description: "1-based keyframe index. Defaults to the first selected key." },
        factor: { type: "number", description: "Multiplier for previous-current delta. Defaults to 0.5." }
      },
      required: ["layerIndex"]
    }
  },
  {
    name: "set_expression",
    description: "Set an expression on any expression-capable layer property.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: { type: "number", description: "Optional 1-based project item index for the target composition. Defaults to active comp." },
        compName: { type: "string", description: "Optional exact composition name to target when compItemIndex is not provided." },
        layerIndex: { type: "number", description: "1-based layer index in the target composition." },
        propertyPath: { type: ["array", "string"], description: "Property path from the layer.", items: {} },
        expression: { type: "string", description: "After Effects expression source." },
        enabled: { type: "boolean", description: "Whether the expression should be enabled. Defaults to true." }
      },
      required: ["layerIndex", "propertyPath", "expression"]
    }
  },
  {
    name: "separate_shape_size_dimensions",
    description: "Add X Size and Y Size slider controls to a shape layer and drive a rectangle/ellipse Size property with an expression.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: { type: "number", description: "Optional 1-based project item index for the target composition. Defaults to active comp." },
        compName: { type: "string", description: "Optional exact composition name to target when compItemIndex is not provided." },
        layerIndex: { type: "number", description: "1-based shape layer index in the target composition." },
        propertyPath: { type: ["array", "string"], description: "Rectangle or ellipse Size property path from the layer.", items: {} },
        xSliderName: { type: "string", description: "Optional X slider effect name. Defaults to X Size." },
        ySliderName: { type: "string", description: "Optional Y slider effect name. Defaults to Y Size." }
      },
      required: ["layerIndex", "propertyPath"]
    }
  },
  {
    name: "clear_expression",
    description: "Clear an expression from any expression-capable layer property.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: { type: "number", description: "Optional 1-based project item index for the target composition. Defaults to active comp." },
        compName: { type: "string", description: "Optional exact composition name to target when compItemIndex is not provided." },
        layerIndex: { type: "number", description: "1-based layer index in the target composition." },
        propertyPath: { type: ["array", "string"], description: "Property path from the layer.", items: {} }
      },
      required: ["layerIndex", "propertyPath"]
    }
  },
  {
    name: "add_comp_to_render_queue",
    description: "Add the active or specified composition to the After Effects render queue.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: { type: "number", description: "Optional 1-based project item index for the composition. Defaults to active comp." },
        compName: { type: "string", description: "Optional exact composition name to target when compItemIndex is not provided." },
        renderSettingsTemplate: { type: "string", description: "Optional render settings template name." },
        outputModuleTemplate: { type: "string", description: "Optional output module template name." },
        outputPath: { type: "string", description: "Optional output file path." }
      }
    }
  },
  {
    name: "set_render_queue_output",
    description: "Set output path and templates for an existing render queue item.",
    inputSchema: {
      type: "object",
      properties: {
        renderQueueItemIndex: { type: "number", description: "1-based render queue item index." },
        renderSettingsTemplate: { type: "string", description: "Optional render settings template name." },
        outputModuleTemplate: { type: "string", description: "Optional output module template name." },
        outputPath: { type: "string", description: "Optional output file path." }
      },
      required: ["renderQueueItemIndex"]
    }
  },
  {
    name: "get_render_queue_status",
    description: "Return compact status for After Effects render queue items.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Maximum render queue items to return. Defaults to 50." }
      }
    }
  },
  {
    name: "set_layer_transform",
    description: "Set common transform values on a layer: position, scale, rotation, opacity, or anchor point.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: {
          type: "number",
          description: "Optional 1-based project item index for the target composition. Defaults to active comp."
        },
        compName: {
          type: "string",
          description: "Optional exact composition name to target when compItemIndex is not provided."
        },
        layerIndex: {
          type: "number",
          description: "1-based layer index in the target composition."
        },
        position: {
          type: "array",
          items: { type: "number" },
          description: "Optional [x, y] or [x, y, z] position."
        },
        scale: {
          type: "array",
          items: { type: "number" },
          description: "Optional [x, y] or [x, y, z] scale percentages."
        },
        rotation: {
          type: "number",
          description: "Optional Z rotation in degrees."
        },
        opacity: {
          type: "number",
          description: "Optional opacity percentage from 0 to 100."
        },
        anchorPoint: {
          type: "array",
          items: { type: "number" },
          description: "Optional [x, y] or [x, y, z] anchor point."
        }
      },
      required: ["layerIndex"]
    }
  },
  {
    name: "apply_transform_expression",
    description: "Apply an expression to a common transform property on a layer.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: {
          type: "number",
          description: "Optional 1-based project item index for the target composition. Defaults to active comp."
        },
        compName: {
          type: "string",
          description: "Optional exact composition name to target when compItemIndex is not provided."
        },
        layerIndex: {
          type: "number",
          description: "1-based layer index in the target composition."
        },
        property: {
          type: "string",
          enum: ["position", "scale", "rotation", "opacity", "anchorPoint"],
          description: "Transform property to receive the expression."
        },
        expression: {
          type: "string",
          description: "After Effects expression source."
        },
        enabled: {
          type: "boolean",
          description: "Whether the expression should be enabled. Defaults to true."
        }
      },
      required: ["layerIndex", "property", "expression"]
    }
  },
  {
    name: "add_comp_marker",
    description: "Add one composition marker to an explicit composition and return comp.markerProperty read-back.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: {
          type: "number",
          description: "Optional 1-based project item index for the target composition. Provide compItemIndex or compName; this tool does not default to the active comp."
        },
        compName: {
          type: "string",
          description: "Optional exact composition name to target when compItemIndex is not provided. Provide compName or compItemIndex; this tool does not default to the active comp."
        },
        time: {
          type: "number",
          description: "Marker time in seconds. Must be explicit and within the target composition duration."
        },
        comment: {
          type: "string",
          description: "Marker comment. Use an explicit empty string only when blank marker semantics are intended."
        },
        duration: {
          type: "number",
          description: "Optional non-negative marker duration in seconds."
        },
        expectedMarkerCountBefore: {
          type: "number",
          description: "Optional marker-count guard from prior get_comp_details includeMarkers evidence."
        },
        ...MUTATION_CHECKPOINT_SCHEMA_PROPERTIES
      },
      required: ["time", "comment"]
    }
  },
  {
    name: "add_layer_marker",
    description: "Add a marker to a layer at a given time.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: {
          type: "number",
          description: "Optional 1-based project item index for the target composition. Defaults to active comp."
        },
        compName: {
          type: "string",
          description: "Optional exact composition name to target when compItemIndex is not provided."
        },
        layerIndex: {
          type: "number",
          description: "1-based layer index in the target composition."
        },
        time: {
          type: "number",
          description: "Marker time in seconds. Defaults to the composition current time."
        },
        comment: {
          type: "string",
          description: "Marker comment."
        },
        duration: {
          type: "number",
          description: "Optional marker duration in seconds."
        }
      },
      required: ["layerIndex", "comment"]
    }
  },
  {
    name: "update_layer_marker",
    description: "Update one existing layer marker by explicit marker index or strict target time.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: {
          type: "number",
          description: "Optional 1-based project item index for the target composition. Defaults to active comp."
        },
        compName: {
          type: "string",
          description: "Optional exact composition name to target when compItemIndex is not provided."
        },
        layerIndex: {
          type: "number",
          description: "1-based layer index in the target composition."
        },
        markerIndex: {
          type: "number",
          description: "Optional 1-based marker key index to update. Use this when multiple markers share the same time."
        },
        targetTime: {
          type: "number",
          description: "Optional existing marker time in seconds. Required when markerIndex is omitted."
        },
        targetComment: {
          type: "string",
          description: "Optional existing marker comment guard."
        },
        comment: {
          type: "string",
          description: "Optional replacement marker comment."
        },
        time: {
          type: "number",
          description: "Optional replacement marker time in seconds."
        },
        duration: {
          type: "number",
          description: "Optional replacement marker duration in seconds."
        }
      },
      required: ["layerIndex"]
    }
  },
  {
    name: "delete_layer_marker",
    description: "Delete one existing layer marker by explicit marker index or strict target time.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: {
          type: "number",
          description: "Optional 1-based project item index for the target composition. Defaults to active comp."
        },
        compName: {
          type: "string",
          description: "Optional exact composition name to target when compItemIndex is not provided."
        },
        layerIndex: {
          type: "number",
          description: "1-based layer index in the target composition."
        },
        markerIndex: {
          type: "number",
          description: "Optional 1-based marker key index to delete. Use this when multiple markers share the same time."
        },
        targetTime: {
          type: "number",
          description: "Optional existing marker time in seconds. Required when markerIndex is omitted."
        },
        targetComment: {
          type: "string",
          description: "Optional existing marker comment guard."
        }
      },
      required: ["layerIndex"]
    }
  },
  {
    name: "create_test_comp",
    description: "Create a temporary test composition for script development and open it in the viewer.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Optional comp name. Defaults to Codex Test Comp plus a timestamp."
        },
        width: {
          type: "number",
          description: "Composition width. Defaults to 1920."
        },
        height: {
          type: "number",
          description: "Composition height. Defaults to 1080."
        },
        duration: {
          type: "number",
          description: "Composition duration in seconds. Defaults to 5."
        },
        frameRate: {
          type: "number",
          description: "Composition frame rate. Defaults to 30."
        },
        openInViewer: {
          type: "boolean",
          description: "Whether to open the comp in the viewer. Defaults to true."
        }
      }
    }
  },
  {
    name: "cleanup_test_items",
    description: "Remove project items whose names start with a test prefix. Requires confirm=true.",
    inputSchema: {
      type: "object",
      properties: {
        namePrefix: {
          type: "string",
          description: "Only project items with names starting with this prefix are removed. Defaults to Codex Test."
        },
        maxItems: {
          type: "number",
          description: "Maximum number of items to remove. Defaults to 25."
        },
        confirm: {
          type: "boolean",
          description: "Must be true to remove items."
        }
      },
      required: ["confirm"]
    }
  }
];

async function callTool(name, args) {
  args = args || {};
  const resolveCompScript = `
      function __codexProjectIndexForItem(target) {
        for (var __i = 1; __i <= app.project.numItems; __i++) {
          if (app.project.item(__i) === target) return __i;
        }
        return null;
      }

      function __codexMatchesItemType(item, type) {
        if (!type) return true;
        if (type === "comp") return item instanceof CompItem;
        if (type === "footage") return item instanceof FootageItem;
        if (type === "folder") return item instanceof FolderItem;
        return false;
      }

      function __codexFolderPath(item) {
        var names = [];
        var project = app.project;
        var folder = null;
        try { folder = item.parentFolder; } catch (__parentFolderError) {}
        var guard = 0;
        while (folder && project && folder !== project.rootFolder && guard < 50) {
          names.unshift(folder.name);
          try { folder = folder.parentFolder; } catch (__folderParentError) { folder = null; }
          guard++;
        }
        return names.join("/");
      }

      function __codexFindProjectItems(query, type, exactName, caseSensitive, limit) {
        var matches = [];
        var needle = query || "";
        var normalizedNeedle = caseSensitive ? needle : needle.toLowerCase();
        var max = limit || 25;

        for (var __i = 1; __i <= app.project.numItems; __i++) {
          var item = app.project.item(__i);
          if (!__codexMatchesItemType(item, type)) continue;

          var itemName = item.name || "";
          var haystack = caseSensitive ? itemName : itemName.toLowerCase();
          var matched = exactName ? haystack === normalizedNeedle : haystack.indexOf(normalizedNeedle) !== -1;
          if (!matched) continue;

          var ref = __codexItemReference(item);
          try { ref.folderPath = __codexFolderPath(item); } catch (__folderPathError) {}
          matches.push(ref);
          if (matches.length >= max) break;
        }

        return matches;
      }

      function __codexResolveProjectItem(index, name, type) {
        if (index !== null && index !== undefined) {
          var indexedItem = app.project.item(index);
          if (!indexedItem) throw new Error("Project item not found.");
          if (!__codexMatchesItemType(indexedItem, type)) {
            throw new Error("Project item does not match requested type.");
          }
          return indexedItem;
        }

        if (!name) {
          throw new Error("Provide itemIndex or itemName.");
        }

        var matches = __codexFindProjectItems(name, type, true, true, 25);
        if (matches.length === 0) {
          matches = __codexFindProjectItems(name, type, true, false, 25);
        }
        if (matches.length === 0) {
          throw new Error("No project item matched name: " + name);
        }
        if (matches.length > 1) {
          var names = [];
          for (var __m = 0; __m < matches.length; __m++) {
            names.push("#" + matches[__m].itemIndex + " " + matches[__m].name);
          }
          throw new Error("Project item name is ambiguous: " + name + " (" + names.join(", ") + ")");
        }
        return app.project.item(matches[0].itemIndex);
      }

      function __codexResolveProjectFolder(index, name, allowRoot) {
        if (index !== null && index !== undefined) {
          var indexedFolder = app.project.item(index);
          if (!(indexedFolder instanceof FolderItem)) {
            throw new Error("Project item is not a folder.");
          }
          return indexedFolder;
        }
        if (name) {
          return __codexResolveProjectItem(null, name, "folder");
        }
        if (allowRoot) {
          return app.project.rootFolder;
        }
        throw new Error("Provide folderItemIndex or folderName.");
      }

      function __codexFolderFullPath(folder) {
        if (!folder || folder === app.project.rootFolder) return "";
        var parentPath = __codexFolderPath(folder);
        return parentPath ? parentPath + "/" + folder.name : folder.name;
      }

      function __codexFindChildFolder(parentFolder, folderName) {
        for (var __f = 1; __f <= app.project.numItems; __f++) {
          var item = app.project.item(__f);
          if (!(item instanceof FolderItem)) continue;
          if (item.name !== folderName) continue;
          try {
            if (item.parentFolder === parentFolder) return item;
          } catch (__childFolderParentError) {}
        }
        return null;
      }

      function __codexIsItemInsideFolder(item, folder) {
        if (!item || !folder) return false;
        if (folder === app.project.rootFolder) return item !== app.project.rootFolder;
        var parent = null;
        try { parent = item.parentFolder; } catch (__insideParentError) {}
        var guard = 0;
        while (parent && guard < 50) {
          if (parent === folder) return true;
          if (parent === app.project.rootFolder) return false;
          try { parent = parent.parentFolder; } catch (__insideNextParentError) { parent = null; }
          guard++;
        }
        return false;
      }

      function __codexResolveComp(index, name) {
        var item = null;
        if (index !== null && index !== undefined) {
          item = app.project.item(index);
        } else if (name) {
          item = __codexResolveProjectItem(null, name, "comp");
        } else {
          item = app.project.activeItem;
        }
        if (!(item instanceof CompItem)) {
          throw new Error(index || name ? "Project item is not a composition." : "Active item is not a composition.");
        }
        return item;
      }

      function __codexItemType(item) {
        if (item instanceof CompItem) return "comp";
        if (item instanceof FootageItem) return "footage";
        if (item instanceof FolderItem) return "folder";
        return item && item.typeName ? item.typeName : "unknown";
      }

      function __codexItemReference(item) {
        if (!item) return null;
        var info = {
          itemIndex: __codexProjectIndexForItem(item),
          name: item.name || "",
          type: __codexItemType(item),
          typeName: item.typeName || null
        };
        try { info.label = item.label; } catch (__itemLabelError) {}
        try { info.comment = item.comment || ""; } catch (__itemCommentError) {}
        try { info.folderPath = __codexFolderPath(item); } catch (__itemFolderPathError) {}
        return info;
      }

      function __codexMarkerInfo(markerProp, keyIndex) {
        var info = {
          keyIndex: keyIndex,
          time: null,
          comment: "",
          duration: 0
        };
        try { info.time = markerProp.keyTime(keyIndex); } catch (__markerTimeError) {}
        try {
          var markerValue = markerProp.keyValue(keyIndex);
          try { info.comment = markerValue.comment || ""; } catch (__markerCommentError) {}
          try { info.duration = markerValue.duration || 0; } catch (__markerDurationError) {}
          try { if (markerValue.chapter) info.chapter = markerValue.chapter; } catch (__markerChapterError) {}
          try { if (markerValue.url) info.url = markerValue.url; } catch (__markerUrlError) {}
          try { if (markerValue.frameTarget) info.frameTarget = markerValue.frameTarget; } catch (__markerFrameTargetError) {}
          try { if (markerValue.cuePointName) info.cuePointName = markerValue.cuePointName; } catch (__markerCuePointError) {}
          try { if (markerValue.eventCuePoint !== undefined) info.eventCuePoint = markerValue.eventCuePoint; } catch (__markerEventCueError) {}
          try { if (markerValue.protectedRegion !== undefined) info.protectedRegion = markerValue.protectedRegion; } catch (__markerProtectedError) {}
        } catch (__markerValueError) {}
        return info;
      }

      function __codexLayerMarkers(layer, limit) {
        var summary = {
          count: 0,
          returned: 0,
          truncated: false,
          items: []
        };
        try {
          var markerProp = layer.property("ADBE Marker");
          if (!markerProp) return summary;
          summary.count = markerProp.numKeys;
          var effectiveLimit = limit === undefined || limit === null ? 50 : limit;
          var max = Math.max(0, Math.min(summary.count, effectiveLimit));
          for (var __mk = 1; __mk <= max; __mk++) {
            summary.items.push(__codexMarkerInfo(markerProp, __mk));
          }
          summary.returned = summary.items.length;
          summary.truncated = summary.count > summary.returned;
        } catch (__layerMarkersError) {}
        return summary;
      }

      function __codexCompMarkers(comp, limit) {
        var summary = {
          count: 0,
          returned: 0,
          truncated: false,
          orderedBy: "comp.markerProperty.keyTime",
          items: []
        };
        try {
          var markerProp = comp.markerProperty;
          if (!markerProp) return summary;
          summary.count = markerProp.numKeys;
          var effectiveLimit = limit === undefined || limit === null ? 50 : limit;
          var max = Math.max(0, Math.min(summary.count, effectiveLimit));
          for (var __cmk = 1; __cmk <= max; __cmk++) {
            summary.items.push(__codexMarkerInfo(markerProp, __cmk));
          }
          summary.returned = summary.items.length;
          summary.truncated = summary.count > summary.returned;
        } catch (__compMarkersError) {}
        return summary;
      }

      function __codexBlendingModeName(value) {
        try { if (value === BlendingMode.NORMAL) return "normal"; } catch (__blendNormalNameError) {}
        try { if (value === BlendingMode.DIFFERENCE) return "difference"; } catch (__blendDifferenceNameError) {}
        return String(value);
      }

      function __codexBlendingModeValue(name) {
        var normalized = String(name || "").toLowerCase();
        if (normalized === "normal") return BlendingMode.NORMAL;
        if (normalized === "difference") return BlendingMode.DIFFERENCE;
        throw new Error("Unsupported blendingMode '" + name + "'. Allowed values: normal, difference.");
      }

      function __codexTrackMatteTypeName(value) {
        try { if (value === TrackMatteType.NO_TRACK_MATTE) return "none"; } catch (__trackMatteNoneNameError) {}
        try { if (value === TrackMatteType.ALPHA) return "alpha"; } catch (__trackMatteAlphaNameError) {}
        try { if (value === TrackMatteType.ALPHA_INVERTED) return "alpha_inverted"; } catch (__trackMatteAlphaInvertedNameError) {}
        try { if (value === TrackMatteType.LUMA) return "luma"; } catch (__trackMatteLumaNameError) {}
        try { if (value === TrackMatteType.LUMA_INVERTED) return "luma_inverted"; } catch (__trackMatteLumaInvertedNameError) {}
        return String(value);
      }

      function __codexTrackMatteTypeValue(name) {
        var normalized = String(name || "").toLowerCase();
        if (normalized === "alpha") return TrackMatteType.ALPHA;
        if (normalized === "alpha_inverted") return TrackMatteType.ALPHA_INVERTED;
        if (normalized === "luma") return TrackMatteType.LUMA;
        if (normalized === "luma_inverted") return TrackMatteType.LUMA_INVERTED;
        throw new Error("Unsupported trackMatteType '" + name + "'. Allowed values: alpha, alpha_inverted, luma, luma_inverted.");
      }

      function __codexLayerInfo(layer) {
        var isTextLayer = false;
        var isShapeLayer = false;
        try { isTextLayer = layer instanceof TextLayer; } catch (__textLayerClassError) {}
        if (!isTextLayer) {
          try { isTextLayer = !!layer.property("ADBE Text Properties"); } catch (__textLayerFallbackError) {}
        }
        try { isShapeLayer = layer instanceof ShapeLayer; } catch (__shapeLayerClassError) {}
        if (!isShapeLayer) {
          try { isShapeLayer = layer.matchName === "ADBE Vector Layer" || !!layer.property("ADBE Root Vectors Group"); } catch (__shapeLayerFallbackError) {}
        }
        var info = {
          index: layer.index,
          id: layer.id,
          name: layer.name,
          matchName: layer.matchName,
          textLayer: isTextLayer,
          shapeLayer: isShapeLayer,
          layerKind: isTextLayer ? "text" : (isShapeLayer ? "shape" : null),
          enabled: layer.enabled,
          locked: layer.locked,
          shy: layer.shy,
          solo: layer.solo,
          startTime: layer.startTime,
          inPoint: layer.inPoint,
          outPoint: layer.outPoint
        };

        try { info.label = layer.label; } catch (__labelError) {}
        try { info.comment = layer.comment || ""; } catch (__commentError) {}
        try { info.hasVideo = !!layer.hasVideo; } catch (__hasVideoError) {}
        try { info.hasAudio = !!layer.hasAudio; } catch (__hasAudioError) {}
        try { info.nullLayer = !!layer.nullLayer; } catch (__nullLayerError) {}
        try { info.guideLayer = !!layer.guideLayer; } catch (__guideLayerError) {}
        try { info.adjustmentLayer = !!layer.adjustmentLayer; } catch (__adjustmentLayerError) {}
        try { info.threeDLayer = !!layer.threeDLayer; } catch (__threeDError) {}
        try { info.collapseTransformation = !!layer.collapseTransformation; } catch (__collapseError) {}
        try { info.motionBlur = !!layer.motionBlur; } catch (__motionBlurError) {}
        try {
          info.blendingMode = layer.blendingMode;
          info.blendingModeName = __codexBlendingModeName(layer.blendingMode);
        } catch (__blendError) {}
        try { info.hasTrackMatte = !!layer.hasTrackMatte; } catch (__hasTrackMatteError) {}
        try { info.isTrackMatte = !!layer.isTrackMatte; } catch (__isTrackMatteError) {}
        try {
          info.trackMatteType = layer.trackMatteType;
          info.trackMatteTypeName = __codexTrackMatteTypeName(layer.trackMatteType);
        } catch (__trackMatteTypeError) {}
        try { info.trackMatteLayer = layer.trackMatteLayer ? __codexLayerInfo(layer.trackMatteLayer) : null; } catch (__trackMatteLayerError) {}
        try { info.markerCount = __codexLayerMarkers(layer, 0).count; } catch (__markerCountError) {}
        try { info.parent = layer.parent ? __codexLayerInfo(layer.parent) : null; } catch (__parentError) {}
        try { info.source = layer.source ? __codexItemReference(layer.source) : null; } catch (__sourceError) {}

        return info;
      }

      function __codexResolveLayers(comp, requestedLayerIndices) {
        var layers = [];
        if (requestedLayerIndices && requestedLayerIndices.length) {
          for (var __r = 0; __r < requestedLayerIndices.length; __r++) {
            var requestedLayer = comp.layer(requestedLayerIndices[__r]);
            if (!requestedLayer) throw new Error("Layer not found at index " + requestedLayerIndices[__r] + ".");
            layers.push(requestedLayer);
          }
        } else {
          for (var __s = 0; __s < comp.selectedLayers.length; __s++) {
            layers.push(comp.selectedLayers[__s]);
          }
        }
        if (!layers.length) throw new Error("No target layers. Select layers or pass layerIndices.");
        return layers;
      }

      function __codexLayerTiming(layer) {
        return {
          index: layer.index,
          name: layer.name,
          startTime: layer.startTime,
          inPoint: layer.inPoint,
          outPoint: layer.outPoint,
          duration: layer.outPoint - layer.inPoint
        };
      }

      function __codexRenameValue(currentName, mode, index, total, exactName, prefix, suffix, findText, replaceText, caseSensitive, allowEmptyName) {
        var nextName = currentName || "";
        if (mode === "exact") {
          if (!exactName && !(allowEmptyName && exactName === "")) throw new Error("name is required for exact rename mode.");
          nextName = exactName;
          if (total > 1) {
            if (nextName.indexOf("{index}") !== -1 || nextName.indexOf("{n}") !== -1) {
              nextName = nextName.replace(/\{index\}/g, String(index)).replace(/\{n\}/g, String(index));
            } else {
              nextName = nextName + " " + index;
            }
          }
        } else if (mode === "prefix") {
          if (!prefix) throw new Error("prefix is required for prefix rename mode.");
          nextName = prefix + nextName;
        } else if (mode === "suffix") {
          if (!suffix) throw new Error("suffix is required for suffix rename mode.");
          nextName = nextName + suffix;
        } else if (mode === "findReplace") {
          if (!findText) throw new Error("find is required for findReplace rename mode.");
          var flags = caseSensitive ? "g" : "gi";
          var specials = "\\\\^$*+?.()|{}[]";
          var escaped = "";
          for (var __c = 0; __c < findText.length; __c++) {
            var ch = findText.charAt(__c);
            escaped += specials.indexOf(ch) >= 0 ? "\\\\" + ch : ch;
          }
          nextName = nextName.replace(new RegExp(escaped, flags), replaceText || "");
        } else {
          throw new Error("mode must be one of: exact, prefix, suffix, findReplace.");
        }
        return nextName;
      }

      function __codexLayerSourceSize(layer, comp) {
        var width = null;
        var height = null;
        try {
          if (layer.source) {
            width = layer.source.width || null;
            height = layer.source.height || null;
          }
        } catch (__sourceSizeError) {}
        if ((!width || !height) && layer.sourceRectAtTime) {
          try {
            var rect = layer.sourceRectAtTime(comp.time, false);
            width = rect.width || width;
            height = rect.height || height;
          } catch (__rectSizeError) {}
        }
        if (!width || !height) throw new Error("Could not determine layer source size for " + layer.name + ".");
        return { width: width, height: height };
      }

      function __codexRenderQueueItemIndex(item) {
        var rq = app.project.renderQueue;
        for (var __rq = 1; __rq <= rq.numItems; __rq++) {
          if (rq.item(__rq) === item) return __rq;
        }
        return null;
      }

      function __codexRenderQueueItemInfo(item) {
        var info = {
          index: __codexRenderQueueItemIndex(item),
          status: item.status,
          comp: item.comp ? __codexItemReference(item.comp) : null,
          timeSpanStart: item.timeSpanStart,
          timeSpanDuration: item.timeSpanDuration,
          outputModules: []
        };
        try {
          for (var __om = 1; __om <= item.numOutputModules; __om++) {
            var outputModule = item.outputModule(__om);
            info.outputModules.push({
              index: __om,
              file: outputModule.file ? outputModule.file.fsName : null
            });
          }
        } catch (__outputModuleInfoError) {}
        return info;
      }

      function __codexPointList(points, limit) {
        var list = [];
        if (!points) return list;
        for (var __pl = 0; __pl < points.length && __pl < limit; __pl++) {
          var point = points[__pl];
          list.push([point[0], point[1]]);
        }
        return list;
      }

      function __codexShapeGeometryData(value, limit) {
        try {
          if (!value || value.vertices === undefined || value.inTangents === undefined || value.outTangents === undefined) return null;
          var maxPoints = limit || 80;
          return {
            kind: "Shape",
            closed: value.closed === true,
            vertexCount: value.vertices ? value.vertices.length : 0,
            vertices: __codexPointList(value.vertices, maxPoints),
            inTangents: __codexPointList(value.inTangents, maxPoints),
            outTangents: __codexPointList(value.outTangents, maxPoints),
            truncated: value.vertices && value.vertices.length > maxPoints
          };
        } catch (__shapeGeometryError) {
          return null;
        }
      }

      function __codexValuePreview(prop) {
        var value = prop.value;
        if (value === null || value === undefined) return { kind: "null", value: null };
        if (typeof value === "number" || typeof value === "boolean" || typeof value === "string") {
          return { kind: typeof value, value: value };
        }
        var shapeGeometry = __codexShapeGeometryData(value, 80);
        if (shapeGeometry) return shapeGeometry;
        if (value instanceof Array) {
          var items = [];
          for (var __v = 0; __v < value.length && __v < 20; __v++) {
            items.push(value[__v]);
          }
          return { kind: "array", length: value.length, value: items, truncated: value.length > 20 };
        }
        try {
          if (value.text !== undefined) {
            return {
              kind: "TextDocument",
              text: value.text,
              font: value.font || null,
              fontSize: value.fontSize || null,
              fillColor: value.fillColor || null,
              applyFill: value.applyFill || false
            };
          }
        } catch (__textDocumentError) {}
        try {
          return { kind: "object", preview: String(value) };
        } catch (__stringError) {
          return { kind: "object", preview: "[object]" };
        }
      }

      function __codexValueData(value) {
        if (value === null || value === undefined) return null;
        if (typeof value === "number" || typeof value === "boolean" || typeof value === "string") return value;
        var shapeGeometry = __codexShapeGeometryData(value, 80);
        if (shapeGeometry) return shapeGeometry;
        if (value instanceof Array) {
          var items = [];
          for (var __vd = 0; __vd < value.length && __vd < 20; __vd++) items.push(value[__vd]);
          return items;
        }
        try {
          if (value.text !== undefined) return { text: value.text };
        } catch (__valueDataTextError) {}
        try {
          return String(value);
        } catch (__valueDataStringError) {
          return "[object]";
        }
      }

      function __codexInterpolationName(value) {
        try {
          if (value === KeyframeInterpolationType.LINEAR) return "linear";
          if (value === KeyframeInterpolationType.BEZIER) return "bezier";
          if (value === KeyframeInterpolationType.HOLD) return "hold";
        } catch (__interpNameError) {}
        return String(value);
      }

      function __codexArrayCopy(value) {
        if (!(value instanceof Array)) return null;
        var copy = [];
        for (var __ac = 0; __ac < value.length; __ac++) copy.push(value[__ac]);
        return copy;
      }

      function __codexKeyframeInfo(prop, keyIndex) {
        var info = {
          index: keyIndex,
          time: null,
          value: null
        };
        try { info.time = prop.keyTime(keyIndex); } catch (__keyTimeError) {}
        try { info.value = __codexValueData(prop.keyValue(keyIndex)); } catch (__keyValueError) {}
        try { info.inInterpolation = __codexInterpolationName(prop.keyInInterpolationType(keyIndex)); } catch (__keyInInterpError) {}
        try { info.outInterpolation = __codexInterpolationName(prop.keyOutInterpolationType(keyIndex)); } catch (__keyOutInterpError) {}
        try { info.inSpatialTangent = __codexArrayCopy(prop.keyInSpatialTangent(keyIndex)); } catch (__keyInSpatialError) {}
        try { info.outSpatialTangent = __codexArrayCopy(prop.keyOutSpatialTangent(keyIndex)); } catch (__keyOutSpatialError) {}
        return info;
      }

      function __codexPropertyPath(prop) {
        var path = [];
        var current = prop;
        var guard = 0;
        while (current && !(current instanceof Layer) && guard < 50) {
          path.unshift({
            name: current.name || "",
            matchName: current.matchName || null,
            propertyIndex: current.propertyIndex || null
          });
          try {
            current = current.parentProperty;
          } catch (__parentPropertyError) {
            current = null;
          }
          guard++;
        }
        return path;
      }

      function __codexResolveChildProperty(parent, segment) {
        if (parent === null || parent === undefined) return null;

        if (typeof segment === "number") {
          return parent.property(Math.floor(segment));
        }

        if (typeof segment === "string") {
          return parent.property(segment);
        }

        if (segment && typeof segment === "object") {
          var expectedMatchName = segment.matchName || null;
          var expectedName = segment.name || null;
          var expectedIndex = segment.propertyIndex || segment.index || null;

          if (expectedMatchName || expectedName) {
            try {
              for (var __p = 1; __p <= parent.numProperties; __p++) {
                var candidate = parent.property(__p);
                if (!candidate) continue;
                if (expectedMatchName && candidate.matchName !== expectedMatchName) continue;
                if (expectedName && candidate.name !== expectedName) continue;
                return candidate;
              }
            } catch (__scanError) {}
          }

          if (expectedIndex !== null && expectedIndex !== undefined) {
            return parent.property(Math.floor(Number(expectedIndex)));
          }

          if (expectedMatchName) return parent.property(expectedMatchName);
          if (expectedName) return parent.property(expectedName);
        }

        return null;
      }

      function __codexResolveProperty(root, propertyPath) {
        if (!(propertyPath instanceof Array) || propertyPath.length === 0) {
          throw new Error("propertyPath must be a non-empty array.");
        }

        var current = root;
        for (var __pathIndex = 0; __pathIndex < propertyPath.length; __pathIndex++) {
          current = __codexResolveChildProperty(current, propertyPath[__pathIndex]);
          if (!current) {
            throw new Error("Property path segment not found at index " + __pathIndex + ".");
          }
        }
        return current;
      }

      function __codexApplyTextDocumentPatch(prop, patch) {
        var doc = prop.value;
        if (patch.text !== undefined) doc.text = String(patch.text);
        if (patch.font !== undefined) doc.font = String(patch.font);
        if (patch.fontSize !== undefined) doc.fontSize = Number(patch.fontSize);
        if (patch.fillColor !== undefined) {
          doc.applyFill = true;
          doc.fillColor = patch.fillColor;
        }
        if (patch.applyFill !== undefined) doc.applyFill = !!patch.applyFill;
        if (patch.strokeColor !== undefined) {
          doc.applyStroke = true;
          doc.strokeColor = patch.strokeColor;
        }
        if (patch.applyStroke !== undefined) doc.applyStroke = !!patch.applyStroke;
        if (patch.strokeWidth !== undefined) doc.strokeWidth = Number(patch.strokeWidth);
        if (patch.tracking !== undefined) doc.tracking = Number(patch.tracking);
        if (patch.leading !== undefined) doc.leading = Number(patch.leading);
        return doc;
      }

      function __codexPreparePropertyValue(prop, value) {
        try {
          var currentValue = prop.value;
          if (currentValue && currentValue.text !== undefined && value && typeof value === "object" && !(value instanceof Array)) {
            return __codexApplyTextDocumentPatch(prop, value);
          }
        } catch (__textPatchProbeError) {}
        return value;
      }

      function __codexResolveEffect(layer, effectIndex, effectName, effectMatchName) {
        var effectGroup = layer.property("ADBE Effect Parade");
        if (!effectGroup) throw new Error("Layer has no effect parade.");

        if (effectIndex !== null && effectIndex !== undefined) {
          var indexedEffect = effectGroup.property(Math.floor(Number(effectIndex)));
          if (!indexedEffect) throw new Error("Effect not found at index " + effectIndex + ".");
          return indexedEffect;
        }

        if (!effectName && !effectMatchName) {
          throw new Error("Provide effectIndex, effectName, or effectMatchName.");
        }

        var matches = [];
        for (var __e = 1; __e <= effectGroup.numProperties; __e++) {
          var effect = effectGroup.property(__e);
          if (!effect) continue;
          if (effectMatchName && effect.matchName !== effectMatchName) continue;
          if (effectName && effect.name !== effectName) continue;
          matches.push(effect);
        }

        if (matches.length === 0) {
          throw new Error("No effect matched the requested name or matchName.");
        }
        if (matches.length > 1) {
          var names = [];
          for (var __m = 0; __m < matches.length; __m++) {
            names.push("#" + matches[__m].propertyIndex + " " + matches[__m].name + " (" + matches[__m].matchName + ")");
          }
          throw new Error("Effect selection is ambiguous: " + names.join(", "));
        }
        return matches[0];
      }

      function __codexEffectProperties(effect, layer, includeValues, includeExpressions) {
        var properties = [];
        var shouldIncludeExpressions = includeExpressions !== false;
        try {
          for (var __ep = 1; __ep <= effect.numProperties; __ep++) {
            var prop = effect.property(__ep);
            if (prop) properties.push(__codexPropertyInfo(prop, layer, includeValues, shouldIncludeExpressions));
          }
        } catch (__effectPropertiesError) {}
        return properties;
      }

      function __codexPropertyTree(prop, depth, state, includeValues, includeExpressions) {
        if (!prop || state.count >= state.max) return null;
        state.count++;
        var info = __codexPropertyInfo(prop, null, includeValues, includeExpressions);
        var children = [];
        if (depth > 0) {
          try {
            for (var __pt = 1; __pt <= prop.numProperties && state.count < state.max; __pt++) {
              var child = __codexPropertyTree(prop.property(__pt), depth - 1, state, includeValues, includeExpressions);
              if (child) children.push(child);
            }
          } catch (__propertyTreeChildrenError) {}
        }
        if (children.length) info.children = children;
        return info;
      }

      function __codexResolveEffectProperty(effect, propertyPath, propertyIndex, propertyName, propertyMatchName) {
        if (propertyPath instanceof Array && propertyPath.length > 0) {
          return __codexResolveProperty(effect, propertyPath);
        }

        if (propertyIndex !== null && propertyIndex !== undefined) {
          var indexedProperty = effect.property(Math.floor(Number(propertyIndex)));
          if (!indexedProperty) throw new Error("Effect property not found at index " + propertyIndex + ".");
          return indexedProperty;
        }

        if (!propertyName && !propertyMatchName) {
          throw new Error("Provide propertyPath, propertyIndex, propertyName, or propertyMatchName.");
        }

        var matches = [];
        for (var __p = 1; __p <= effect.numProperties; __p++) {
          var prop = effect.property(__p);
          if (!prop) continue;
          if (propertyMatchName && prop.matchName !== propertyMatchName) continue;
          if (propertyName && prop.name !== propertyName) continue;
          matches.push(prop);
        }

        if (matches.length === 0) {
          throw new Error("No effect property matched the requested name or matchName.");
        }
        if (matches.length > 1) {
          var names = [];
          for (var __pm = 0; __pm < matches.length; __pm++) {
            names.push("#" + matches[__pm].propertyIndex + " " + matches[__pm].name + " (" + matches[__pm].matchName + ")");
          }
          throw new Error("Effect property selection is ambiguous: " + names.join(", "));
        }
        return matches[0];
      }

      function __codexPropertyInfo(prop, layer, includeValue, includeExpression) {
        var info = {
          name: prop.name,
          matchName: prop.matchName || null,
          propertyIndex: prop.propertyIndex || null,
          propertyDepth: prop.propertyDepth || null,
          propertyType: prop.propertyType || null,
          propertyPath: __codexPropertyPath(prop),
          canSetExpression: !!prop.canSetExpression,
          expressionEnabled: false,
          expressionError: "",
          isTimeVarying: false,
          numKeys: 0,
          selectedKeys: [],
          layer: layer ? __codexLayerInfo(layer) : null
        };

        try { info.propertyValueType = prop.propertyValueType; } catch (__valueTypeError) {}
        try { info.isTimeVarying = !!prop.isTimeVarying; } catch (__timeVaryingError) {}
        try { info.numKeys = prop.numKeys || 0; } catch (__numKeysError) {}
        try { info.expressionEnabled = !!prop.expressionEnabled; } catch (__expressionEnabledError) {}
        try { info.expressionError = prop.expressionError || ""; } catch (__expressionErrorError) {}
        try {
          if (prop.enabled !== undefined) info.enabled = !!prop.enabled;
        } catch (__enabledError) {}
        try {
          if (includeExpression && prop.canSetExpression) info.expression = prop.expression || "";
        } catch (__expressionError) {}
        try {
          if (includeValue && prop.propertyValueType !== undefined) info.value = __codexValuePreview(prop);
        } catch (__valueError) {
          info.valueError = String(__valueError);
        }
        try {
          if (prop.selectedKeys) {
            for (var __k = 0; __k < prop.selectedKeys.length; __k++) {
              info.selectedKeys.push(prop.selectedKeys[__k]);
            }
          }
        } catch (__selectedKeysError) {}
        try {
          if (includeValue && info.numKeys > 0) {
            info.keyframes = [];
            var maxKeyframes = Math.min(info.numKeys, 80);
            for (var __ki = 1; __ki <= maxKeyframes; __ki++) {
              info.keyframes.push(__codexKeyframeInfo(prop, __ki));
            }
            info.keyframesTruncated = info.numKeys > maxKeyframes;
          }
        } catch (__keyframeInfoError) {}

        return info;
      }
  `;

  if (name === "get_bridge_status") {
    return toolResult(getBridgeStatus());
  }

  if (name === "list_effect_presets") {
    return toolResult(listEffectPresets(args));
  }

  if (name === "get_command_log") {
    const limit = Math.max(1, Math.min(200, Math.floor(optionalNumber(args, "limit", 50))));
    return toolResult({
      logFile: LOG_FILE,
      events: tailJsonl(LOG_FILE, limit)
    });
  }

  if (name === "get_ai_agent_log") {
    const limit = Math.max(1, Math.min(200, Math.floor(optionalNumber(args, "limit", 50))));
    return toolResult({
      logFile: AI_CHAT_LOG_FILE,
      events: tailJsonl(AI_CHAT_LOG_FILE, limit)
    });
  }

  if (name === "get_project_intent_memory") {
    try {
      return toolResult(readProjectIntentMemory(args || {}));
    } catch (error) {
      return toolResult(error.message || String(error), true);
    }
  }

  if (name === "update_project_intent_memory") {
    try {
      const update = updateProjectIntentMemory(args || {});
      return toolResult(update, !update.ok);
    } catch (error) {
      return toolResult(error.message || String(error), true);
    }
  }

  if (name === "list_ai_agents") {
    try {
      return toolResult(await aiAgents.listAgents(args || {}));
    } catch (error) {
      return toolResult(error.message || String(error), true);
    }
  }

  if (name === "check_ai_agent_readiness") {
    try {
      return toolResult(await aiAgents.checkAgentReadiness(args || {}));
    } catch (error) {
      return toolResult(error.message || String(error), true);
    }
  }

  if (name === "chat_with_ai_agent") {
    try {
      return toolResult(await runAgentChatLogged("mcp-tool", args || {}));
    } catch (error) {
      return toolResult({
        error: error.message || String(error),
        requestId: error.requestId || null,
        readiness: error.readiness || null,
        providerError: error.providerError || null
      }, true);
    }
  }

  if (name === "plan_with_ai_agent") {
    try {
      return toolResult(await runAgentPlanLogged("mcp-tool", args || {}));
    } catch (error) {
      return toolResult({
        error: error.message || String(error),
        requestId: error.requestId || null,
        readiness: error.readiness || null,
        providerError: error.providerError || null
      }, true);
    }
  }

  if (name === "validate_ai_agent_plan") {
    try {
      return toolResult(validateAgentPlanWithRepair((args || {}).plan, (args || {}).requestId || null, null, {
        repairPlan: args && args.repairPlan
      }).validation);
    } catch (error) {
      return toolResult(error.message || String(error), true);
    }
  }

  if (name === "run_ai_agent_plan") {
    try {
      const run = await runValidatedAgentPlan(args || {});
      return toolResult(run, !run.ok);
    } catch (error) {
      return toolResult(error.message || String(error), true);
    }
  }

  if (name === "run_agent_hardcore_session") {
    try {
      const session = await runAgentHardcoreSession("mcp-tool", args || {});
      return toolResult(session, !session.ok);
    } catch (error) {
      return toolResult({
        error: error.message || String(error),
        requestId: error.requestId || null,
        readiness: error.readiness || null,
        providerError: error.providerError || null
      }, true);
    }
  }

  if (name === "start_edit_session") {
    return startEditSession(args || {});
  }

  if (name === "get_edit_session_status") {
    return getEditSessionStatus(args || {});
  }

  if (name === "finish_edit_session") {
    return finishEditSession(args || {});
  }

  if (name === "list_edit_sessions") {
    return listEditSessions(args || {});
  }

  if (name === "backup_project_file") {
    let copied;
    try {
      copied = await copySavedProjectFile(optionalString(args, "label", ""), "backup");
    } catch (error) {
      return toolResult(error.message, true);
    }

    const response = {
      sourceFile: copied.sourceFile,
      backupFile: copied.destinationFile,
      label: copied.label,
      bytes: copied.bytes,
      createdAt: copied.createdAt,
      project: copied.project
    };
    recordEvent("project_backup_created", response);
    return toolResult(response);
  }

  if (name === "checkpoint_project") {
    let copied;
    try {
      copied = await copySavedProjectFile(optionalString(args, "label", ""), "checkpoint");
    } catch (error) {
      return toolResult(error.message, true);
    }

    const response = {
      label: copied.label,
      sourceFile: copied.sourceFile,
      checkpointFile: copied.destinationFile,
      bytes: copied.bytes,
      createdAt: copied.createdAt,
      project: copied.project
    };
    recordEvent("project_checkpoint_created", response);
    return toolResult(response);
  }

  if (name === "list_project_checkpoints") {
    return toolResult({
      backupDir: BACKUP_DIR,
      checkpoints: listProjectCheckpoints(args)
    });
  }

  if (name === "get_project_checkpoint_details") {
    let checkpointFile;
    try {
      checkpointFile = resolveCheckpointFile(args.checkpointFile);
    } catch (error) {
      return toolResult(error.message, true);
    }

    return toolResult({
      backupDir: BACKUP_DIR,
      checkpoint: checkpointDetails(checkpointFile)
    });
  }

  if (name === "delete_project_checkpoint") {
    let confirm;
    try {
      confirm = optionalBoolean(args, "confirm", false);
    } catch (error) {
      return toolResult(error.message, true);
    }
    if (!confirm) return toolResult("confirm must be true to delete a project checkpoint.", true);

    let checkpointFile;
    try {
      checkpointFile = resolveCheckpointFile(args.checkpointFile);
    } catch (error) {
      return toolResult(error.message, true);
    }

    const checkpoint = checkpointDetails(checkpointFile);
    fs.unlinkSync(checkpointFile);
    const response = {
      deleted: true,
      checkpoint
    };
    recordEvent("project_checkpoint_deleted", response);
    return toolResult(response);
  }

  if (name === "restore_project_checkpoint") {
    let confirm;
    try {
      confirm = optionalBoolean(args, "confirm", false);
    } catch (error) {
      return toolResult(error.message, true);
    }
    if (!confirm) return toolResult("confirm must be true to prepare checkpoint restore instructions.", true);

    let checkpointFile;
    try {
      checkpointFile = resolveCheckpointFile(args.checkpointFile);
    } catch (error) {
      return toolResult(error.message, true);
    }

    const stat = fs.statSync(checkpointFile);
    const checkpoint = parseCheckpointFilename(path.basename(checkpointFile));
    let currentProject = null;
    let currentProjectError = null;
    if (Date.now() - lastPanelSeenAt < 15000) {
      try {
        currentProject = await getCurrentProjectSummary();
      } catch (error) {
        currentProjectError = error.message || String(error);
      }
    } else {
      currentProjectError = "After Effects panel is not currently connected.";
    }

    const response = {
      restored: false,
      restoreMode: "manual",
      checkpointFile,
      bytes: stat.size,
      checkpoint: {
        filename: path.basename(checkpointFile),
        label: checkpoint ? checkpoint.label : null,
        projectName: checkpoint ? checkpoint.projectName : null,
        createdAt: checkpoint && checkpoint.createdAt ? checkpoint.createdAt : stat.birthtime.toISOString(),
        modifiedAt: stat.mtime.toISOString()
      },
      currentProject,
      currentProjectError,
      instructions: [
        "This first restore implementation is intentionally non-destructive.",
        "Use File > Open Project in After Effects and choose checkpointFile.",
        "Save the opened checkpoint as a new project file before continuing automation."
      ]
    };
    recordEvent("project_checkpoint_restore_prepared", response);
    return toolResult(response);
  }

  if (name === "ping_ae") {
    if (Date.now() - lastPanelSeenAt > 15000) {
      return toolResult("After Effects panel has not connected yet.", true);
    }

    const result = await runExtendScriptBody(`
      return {
        appName: app.name,
        appVersion: app.version,
        projectItems: app.project ? app.project.numItems : 0
      };
    `);
    return toolResult(result.result);
  }

  if (name === "run_extendscript") {
    const result = await runExtendScriptBody(String(args.script || ""), Number(args.timeoutMs) || COMMAND_TIMEOUT_MS);
    return toolResult(result.result);
  }

  if (name === "run_extendscript_file") {
    const scriptFile = resolveScriptFile(args.filePath);
    const script = fs.readFileSync(scriptFile.resolvedPath, "utf8");
    const startedAt = Date.now();
    try {
      const result = await runExtendScriptBody(script, Number(args.timeoutMs) || COMMAND_TIMEOUT_MS);
      return toolResult({
        filePath: scriptFile.resolvedPath,
        bytes: scriptFile.stat.size,
        durationMs: Date.now() - startedAt,
        result: result.result
      });
    } catch (error) {
      const wrappedLine = error.line || null;
      const fileLine = wrappedLine && wrappedLine > EXTENDSCRIPT_BODY_LINE_OFFSET
        ? wrappedLine - EXTENDSCRIPT_BODY_LINE_OFFSET
        : wrappedLine;
      return toolResult({
        filePath: scriptFile.resolvedPath,
        bytes: scriptFile.stat.size,
        durationMs: Date.now() - startedAt,
        error: error.message || String(error),
        line: fileLine || null,
        wrappedLine: wrappedLine,
        lineContext: getScriptLineContext(script, fileLine, 4)
      }, true);
    }
  }

  if (name === "get_project_info") {
    const result = await runExtendScriptBody(`
      var project = app.project;
      function __codexFramesCountTypeSnapshot(targetProject) {
        var value = null;
        var name = null;
        var startFrame = null;
        try { value = targetProject ? targetProject.framesCountType : null; } catch (__framesCountReadError) {}
        try {
          if (value === FramesCountType.FC_START_0) {
            name = "FC_START_0";
            startFrame = 0;
          } else if (value === FramesCountType.FC_START_1) {
            name = "FC_START_1";
            startFrame = 1;
          } else if (value !== null && value !== undefined) {
            name = String(value);
          }
        } catch (__framesCountNameError) {
          if (value !== null && value !== undefined) name = String(value);
        }
        return {
          value: value === null || value === undefined ? null : String(value),
          name: name,
          startFrame: startFrame
        };
      }
      var framesCount = __codexFramesCountTypeSnapshot(project);
      return {
        file: project && project.file ? project.file.fsName : null,
        bitsPerChannel: project ? project.bitsPerChannel : null,
        numItems: project ? project.numItems : 0,
        activeItemName: project && project.activeItem ? project.activeItem.name : null,
        activeItemType: project && project.activeItem ? project.activeItem.typeName : null,
        framesCountType: framesCount.name,
        framesCountTypeValue: framesCount.value,
        framesCountStartFrame: framesCount.startFrame
      };
    `);
    return toolResult(result.result);
  }

  if (name === "set_project_frames_count_type") {
    const framesCountType = optionalString(args, "framesCountType", "");
    const expectedCurrentFramesCountType = optionalString(args, "expectedCurrentFramesCountType", "");
    const normalizeFramesCountType = (value, fieldName) => {
      const normalized = String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
      if (["fcstart0", "startatzero", "start0", "zero", "0"].includes(normalized)) return "FC_START_0";
      if (["fcstart1", "startatone", "start1", "one", "1"].includes(normalized)) return "FC_START_1";
      throw new Error(`${fieldName} must be FC_START_0/startAtZero or FC_START_1/startAtOne.`);
    };

    let requestedFramesCountType;
    let expectedFramesCountType = "";
    try {
      requestedFramesCountType = normalizeFramesCountType(framesCountType, "framesCountType");
      if (expectedCurrentFramesCountType) {
        expectedFramesCountType = normalizeFramesCountType(expectedCurrentFramesCountType, "expectedCurrentFramesCountType");
      }
    } catch (error) {
      return toolResult(error.message, true);
    }

    const result = await runExtendScriptBody(`
      var project = app.project;
      var requestedFramesCountType = ${aeLiteral(requestedFramesCountType)};
      var expectedFramesCountType = ${aeLiteral(expectedFramesCountType)};

      function __codexFramesCountTypeSnapshot(targetProject) {
        var value = null;
        var name = null;
        var startFrame = null;
        try { value = targetProject ? targetProject.framesCountType : null; } catch (__framesCountReadError) {}
        try {
          if (value === FramesCountType.FC_START_0) {
            name = "FC_START_0";
            startFrame = 0;
          } else if (value === FramesCountType.FC_START_1) {
            name = "FC_START_1";
            startFrame = 1;
          } else if (value !== null && value !== undefined) {
            name = String(value);
          }
        } catch (__framesCountNameError) {
          if (value !== null && value !== undefined) name = String(value);
        }
        return {
          value: value === null || value === undefined ? null : String(value),
          name: name,
          startFrame: startFrame,
          numItems: targetProject ? targetProject.numItems : 0,
          activeItemName: targetProject && targetProject.activeItem ? targetProject.activeItem.name : null,
          activeItemType: targetProject && targetProject.activeItem ? targetProject.activeItem.typeName : null
        };
      }

      function __codexFramesCountTypeValue(name) {
        if (name === "FC_START_0") return FramesCountType.FC_START_0;
        if (name === "FC_START_1") return FramesCountType.FC_START_1;
        throw new Error("Unsupported framesCountType: " + name);
      }

      if (!project) throw new Error("No active project.");
      var before = __codexFramesCountTypeSnapshot(project);
      if (expectedFramesCountType && before.name !== expectedFramesCountType) {
        throw new Error("Project framesCountType guard mismatch. Expected " + expectedFramesCountType + " but found " + before.name + ".");
      }

      app.beginUndoGroup("Codex Set Project Frames Count Type");
      try {
        project.framesCountType = __codexFramesCountTypeValue(requestedFramesCountType);
      } finally {
        app.endUndoGroup();
      }

      var after = __codexFramesCountTypeSnapshot(project);
      return {
        project: {
          framesCountType: after.name,
          framesCountStartFrame: after.startFrame,
          numItems: after.numItems,
          activeItemName: after.activeItemName,
          activeItemType: after.activeItemType
        },
        before: before,
        after: after,
        updates: {
          framesCountType: requestedFramesCountType,
          framesCountStartFrame: requestedFramesCountType === "FC_START_0" ? 0 : 1
        },
        updatedFields: ["framesCountType"],
        postVerification: {
          ok: after.name === requestedFramesCountType,
          framesCountTypeMatches: after.name === requestedFramesCountType,
          projectItemCountUnchanged: before.numItems === after.numItems,
          activeItemUnchanged: before.activeItemName === after.activeItemName && before.activeItemType === after.activeItemType
        }
      };
    `);
    return toolResult(result.result);
  }

  if (name === "get_project_snapshot") {
    const maxItems = Math.max(1, Math.min(2000, Math.floor(optionalNumber(args, "maxItems", 500))));
    const includeComps = optionalBoolean(args, "includeComps", true);
    const includeFootage = optionalBoolean(args, "includeFootage", true);
    const includeFolders = optionalBoolean(args, "includeFolders", true);

    const result = await runExtendScriptBody(`
      ${resolveCompScript}
      var maxItems = ${maxItems};
      var includeComps = ${includeComps ? "true" : "false"};
      var includeFootage = ${includeFootage ? "true" : "false"};
      var includeFolders = ${includeFolders ? "true" : "false"};
      var project = app.project;

      function __codexFolderPath(item) {
        var names = [];
        var folder = null;
        try { folder = item.parentFolder; } catch (__parentFolderError) {}
        var guard = 0;
        while (folder && project && folder !== project.rootFolder && guard < 50) {
          names.unshift(folder.name);
          try { folder = folder.parentFolder; } catch (__folderParentError) { folder = null; }
          guard++;
        }
        return names.join("/");
      }

      var items = [];
      var totalMatched = 0;
      for (var i = 1; project && i <= project.numItems; i++) {
        var item = project.item(i);
        var type = __codexItemType(item);
        if ((type === "comp" && !includeComps) || (type === "footage" && !includeFootage) || (type === "folder" && !includeFolders)) {
          continue;
        }

        totalMatched++;
        if (items.length >= maxItems) continue;

        var info = {
          itemIndex: i,
          name: item.name,
          type: type,
          typeName: item.typeName || null,
          folderPath: __codexFolderPath(item),
          label: null,
          comment: item.comment || ""
        };
        try { info.label = item.label; } catch (__itemLabelError) {}

        if (item instanceof CompItem) {
          info.width = item.width;
          info.height = item.height;
          info.duration = item.duration;
          info.frameRate = item.frameRate;
          info.numLayers = item.numLayers;
          info.displayStartTime = item.displayStartTime;
          try { info.displayStartFrame = item.displayStartFrame; } catch (__displayStartFrameError) {}
        } else if (item instanceof FootageItem) {
          info.width = item.width || null;
          info.height = item.height || null;
          info.duration = item.duration || null;
          info.frameRate = item.frameRate || null;
          info.file = item.file ? item.file.fsName : null;
          info.hasVideo = !!item.hasVideo;
          info.hasAudio = !!item.hasAudio;
          try { info.isStill = !!item.mainSource.isStill; } catch (__stillError) {}
        } else if (item instanceof FolderItem) {
          info.numItems = item.numItems || 0;
        }

        items.push(info);
      }

      return {
        project: {
          file: project && project.file ? project.file.fsName : null,
          numItems: project ? project.numItems : 0,
          activeItem: project && project.activeItem ? __codexItemReference(project.activeItem) : null
        },
        filters: {
          includeComps: includeComps,
          includeFootage: includeFootage,
          includeFolders: includeFolders,
          maxItems: maxItems
        },
        totalMatched: totalMatched,
        returned: items.length,
        truncated: totalMatched > items.length,
        items: items
      };
    `);
    return toolResult(result.result);
  }

  if (name === "find_project_items") {
    const query = optionalString(args, "query", "");
    const type = optionalString(args, "type", "");
    const exactName = optionalBoolean(args, "exactName", false);
    const caseSensitive = optionalBoolean(args, "caseSensitive", false);
    const limit = Math.max(1, Math.min(250, Math.floor(optionalNumber(args, "limit", 25))));

    if (type && !["comp", "footage", "folder"].includes(type)) {
      return toolResult("type must be one of: comp, footage, folder.", true);
    }

    const result = await runExtendScriptBody(`
      ${resolveCompScript}
      return {
        query: ${aeLiteral(query)},
        type: ${aeLiteral(type)},
        exactName: ${exactName ? "true" : "false"},
        caseSensitive: ${caseSensitive ? "true" : "false"},
        matches: __codexFindProjectItems(${aeLiteral(query)}, ${aeLiteral(type)}, ${exactName ? "true" : "false"}, ${caseSensitive ? "true" : "false"}, ${limit})
      };
    `);
    return toolResult(result.result);
  }

  if (name === "list_project_folder_items") {
    const folderItemIndex = optionalPositiveInteger(args, "folderItemIndex");
    const folderName = optionalString(args, "folderName", "");
    const recursive = optionalBoolean(args, "recursive", false);
    const type = optionalString(args, "type", "");
    const limit = Math.max(1, Math.min(2000, Math.floor(optionalNumber(args, "limit", 200))));

    if (type && !["comp", "footage", "folder"].includes(type)) {
      return toolResult("type must be one of: comp, footage, folder.", true);
    }

    const result = await runExtendScriptBody(`
      ${resolveCompScript}
      var folder = __codexResolveProjectFolder(${folderItemIndex === null ? "null" : folderItemIndex}, ${aeLiteral(folderName)}, true);
      var recursive = ${recursive ? "true" : "false"};
      var itemType = ${aeLiteral(type)};
      var limit = ${limit};
      var items = [];
      var totalMatched = 0;

      for (var i = 1; i <= app.project.numItems; i++) {
        var item = app.project.item(i);
        var directChild = false;
        try { directChild = item.parentFolder === folder; } catch (__directChildError) {}
        var matchedFolder = recursive ? __codexIsItemInsideFolder(item, folder) : directChild;
        if (!matchedFolder) continue;
        if (!__codexMatchesItemType(item, itemType)) continue;
        totalMatched++;
        if (items.length >= limit) continue;
        var ref = __codexItemReference(item);
        try { ref.folderPath = __codexFolderPath(item); } catch (__folderPathError) {}
        try { ref.fullPath = item instanceof FolderItem ? __codexFolderFullPath(item) : (ref.folderPath ? ref.folderPath + "/" + ref.name : ref.name); } catch (__fullPathError) {}
        items.push(ref);
      }

      var folderRef = __codexItemReference(folder);
      folderRef.folderPath = __codexFolderFullPath(folder);
      return {
        folder: folderRef,
        recursive: recursive,
        type: itemType || null,
        totalMatched: totalMatched,
        returned: items.length,
        truncated: totalMatched > items.length,
        items: items
      };
    `);
    return toolResult(result.result);
  }

  if (name === "create_comp") {
    const compName = optionalString(args, "name", "").trim();
    const width = Math.floor(optionalNumber(args, "width", 1920));
    const height = Math.floor(optionalNumber(args, "height", 1080));
    const pixelAspect = optionalNumber(args, "pixelAspect", 1);
    const duration = optionalNumber(args, "duration", 5);
    const frameRate = optionalNumber(args, "frameRate", 30);
    const bgColor = optionalNumberArray(args, "bgColor", [0, 0, 0], 3, 3);
    const parentFolderItemIndex = optionalPositiveInteger(args, "parentFolderItemIndex");
    const parentFolderName = optionalString(args, "parentFolderName", "");
    const allowDuplicateName = optionalBoolean(args, "allowDuplicateName", false);
    const openInViewer = optionalBoolean(args, "openInViewer", true);
    const comment = optionalString(args, "comment", "");

    if (!compName) return toolResult("name is required.", true);
    if (width < 4) return toolResult("width must be at least 4 pixels.", true);
    if (height < 4) return toolResult("height must be at least 4 pixels.", true);
    if (pixelAspect <= 0) return toolResult("pixelAspect must be greater than 0.", true);
    if (duration <= 0) return toolResult("duration must be greater than 0.", true);
    if (frameRate <= 0) return toolResult("frameRate must be greater than 0.", true);
    if (bgColor.some((value) => value < 0 || value > 1)) return toolResult("bgColor values must be between 0 and 1.", true);

    const result = await runExtendScriptBody(`
      ${resolveCompScript}
      var compName = ${aeLiteral(compName)};
      var width = ${width};
      var height = ${height};
      var pixelAspect = ${pixelAspect};
      var duration = ${duration};
      var frameRate = ${frameRate};
      var bgColor = ${aeLiteral(bgColor)};
      var parentFolder = __codexResolveProjectFolder(${parentFolderItemIndex === null ? "null" : parentFolderItemIndex}, ${aeLiteral(parentFolderName)}, true);
      var allowDuplicateName = ${allowDuplicateName ? "true" : "false"};
      var openInViewer = ${openInViewer ? "true" : "false"};
      var comment = ${aeLiteral(comment)};

      if (!allowDuplicateName) {
        for (var i = 1; i <= app.project.numItems; i++) {
          var existing = app.project.item(i);
          if (existing instanceof CompItem && existing.name === compName) {
            throw new Error("Composition already exists: " + compName + ". Pass allowDuplicateName:true to create another.");
          }
        }
      }

      app.beginUndoGroup("Codex Create Comp");
      try {
        var comp = app.project.items.addComp(compName, width, height, pixelAspect, duration, frameRate);
        comp.bgColor = bgColor;
        if (parentFolder && parentFolder !== app.project.rootFolder) comp.parentFolder = parentFolder;
        if (comment) {
          try { comp.comment = comment; } catch (__commentError) {}
        } else {
          try { comp.comment = "Created by AE Agent create_comp"; } catch (__defaultCommentError) {}
        }
        if (openInViewer) comp.openInViewer();
        var response = {
          itemIndex: __codexProjectIndexForItem(comp),
          name: comp.name,
          type: "comp",
          width: comp.width,
          height: comp.height,
          pixelAspect: comp.pixelAspect,
          duration: comp.duration,
          frameRate: comp.frameRate,
          bgColor: comp.bgColor,
          numLayers: comp.numLayers,
          folderPath: __codexFolderPath(comp)
        };
        return response;
      } finally {
        app.endUndoGroup();
      }
    `);
    return toolResult(result.result);
  }

  if (name === "create_project_folder") {
    const folderName = optionalString(args, "name", "").trim();
    const parentFolderItemIndex = optionalPositiveInteger(args, "parentFolderItemIndex");
    const parentFolderName = optionalString(args, "parentFolderName", "");
    const allowExisting = optionalBoolean(args, "allowExisting", true);

    if (!folderName) return toolResult("name is required.", true);

    const result = await runExtendScriptBody(`
      ${resolveCompScript}
      var folderName = ${aeLiteral(folderName)};
      var parentFolder = __codexResolveProjectFolder(${parentFolderItemIndex === null ? "null" : parentFolderItemIndex}, ${aeLiteral(parentFolderName)}, true);
      var allowExisting = ${allowExisting ? "true" : "false"};
      var existingFolder = __codexFindChildFolder(parentFolder, folderName);

      if (existingFolder) {
        if (!allowExisting) {
          throw new Error("Folder already exists in target parent: " + folderName + ".");
        }
        var existingRef = __codexItemReference(existingFolder);
        existingRef.folderPath = __codexFolderFullPath(existingFolder);
        return {
          folder: existingRef,
          parentFolder: __codexItemReference(parentFolder),
          existed: true
        };
      }

      app.beginUndoGroup("Codex Create Project Folder");
      try {
        var folder = app.project.items.addFolder(folderName);
        if (parentFolder && parentFolder !== app.project.rootFolder) folder.parentFolder = parentFolder;
        var ref = __codexItemReference(folder);
        ref.folderPath = __codexFolderFullPath(folder);
        return {
          folder: ref,
          parentFolder: __codexItemReference(parentFolder),
          existed: false
        };
      } finally {
        app.endUndoGroup();
      }
    `);
    return toolResult(result.result);
  }

  if (name === "move_project_items_to_folder") {
    const itemIndices = requiredPositiveIntegerList(args, "itemIndices");
    const targetFolderItemIndex = optionalPositiveInteger(args, "targetFolderItemIndex");
    const targetFolderName = optionalString(args, "targetFolderName", "");
    const targetRoot = optionalBoolean(args, "targetRoot", false);
    const includeFolders = optionalBoolean(args, "includeFolders", false);

    if (targetFolderItemIndex === null && !targetFolderName && !targetRoot) {
      return toolResult("Provide targetFolderItemIndex, targetFolderName, or targetRoot:true.", true);
    }
    if (targetRoot && (targetFolderItemIndex !== null || targetFolderName)) {
      return toolResult("targetRoot cannot be combined with targetFolderItemIndex or targetFolderName.", true);
    }

    const result = await runExtendScriptBody(`
      ${resolveCompScript}
      var itemIndices = ${aeLiteral(itemIndices)};
      var targetFolder = ${targetRoot ? "app.project.rootFolder" : `__codexResolveProjectFolder(${targetFolderItemIndex === null ? "null" : targetFolderItemIndex}, ${aeLiteral(targetFolderName)}, false)`};
      var includeFolders = ${includeFolders ? "true" : "false"};
      var moved = [];
      var skipped = [];

      app.beginUndoGroup("Codex Move Project Items To Folder");
      try {
        var itemsToMove = [];
        for (var i = 0; i < itemIndices.length; i++) {
          var item = app.project.item(itemIndices[i]);
          if (!item) throw new Error("Project item not found at index " + itemIndices[i] + ".");
          if (item === targetFolder) throw new Error("Cannot move the target folder into itself.");
          if (item instanceof FolderItem && !includeFolders) {
            throw new Error("Item #" + itemIndices[i] + " is a folder. Pass includeFolders:true to move folders intentionally.");
          }
          if (item instanceof FolderItem && __codexIsItemInsideFolder(targetFolder, item)) {
            throw new Error("Cannot move a folder into itself or one of its descendants: " + item.name + ".");
          }
          for (var seenIndex = 0; seenIndex < itemsToMove.length; seenIndex++) {
            if (itemsToMove[seenIndex].item === item) {
              throw new Error("Duplicate project item target at index " + itemIndices[i] + ": " + item.name + ".");
            }
          }
          itemsToMove.push({ item: item, requestedIndex: itemIndices[i] });
        }

        for (var moveIndex = 0; moveIndex < itemsToMove.length; moveIndex++) {
          var item = itemsToMove[moveIndex].item;

          var previousFolderPath = "";
          try { previousFolderPath = __codexFolderPath(item); } catch (__previousFolderPathError) {}
          var alreadyInTarget = false;
          try { alreadyInTarget = item.parentFolder === targetFolder; } catch (__alreadyInTargetError) {}

          if (alreadyInTarget) {
            var skippedRef = __codexItemReference(item);
            skippedRef.folderPath = previousFolderPath;
            skipped.push(skippedRef);
            continue;
          }

          item.parentFolder = targetFolder;
          var ref = __codexItemReference(item);
          ref.previousFolderPath = previousFolderPath;
          ref.folderPath = __codexFolderPath(item);
          moved.push(ref);
        }

        var targetRef = __codexItemReference(targetFolder);
        targetRef.folderPath = __codexFolderFullPath(targetFolder);
        return {
          targetFolder: targetRef,
          movedCount: moved.length,
          skippedCount: skipped.length,
          moved: moved,
          skipped: skipped
        };
      } finally {
        app.endUndoGroup();
      }
    `);
    return toolResult(result.result);
  }

  if (name === "set_project_item_metadata") {
    const allowedKeys = new Set([
      "itemIndices",
      "expectedItemNames",
      "label",
      "autoCheckpoint",
      "checkpointLabel",
      "idempotencyKey",
      "idempotencyScope",
      "verifyAfter",
      M100_DIRECT_ESCAPE_HATCH_ARG
    ]);
    const unsupportedKeys = Object.keys(args || {}).filter((key) => !allowedKeys.has(key));
    if (unsupportedKeys.length) return toolResult("Unsupported set_project_item_metadata fields: " + unsupportedKeys.join(", "), true);

    let itemIndices;
    try {
      itemIndices = requiredExplicitPositiveIntegerList(args, "itemIndices");
    } catch (error) {
      return toolResult(error.message || String(error), true);
    }

    let expectedItemNames = null;
    if (hasArg(args, "expectedItemNames")) {
      expectedItemNames = args.expectedItemNames;
      if (typeof expectedItemNames === "string" && expectedItemNames.trim().startsWith("[")) {
        expectedItemNames = JSON.parse(expectedItemNames);
      }
      if (!Array.isArray(expectedItemNames)) return toolResult("expectedItemNames must be an array when provided.", true);
      expectedItemNames = expectedItemNames.map((value) => String(value));
      if (expectedItemNames.length !== itemIndices.length) {
        return toolResult("expectedItemNames must have the same length as itemIndices.", true);
      }
    }

    const label = optionalNumber(args, "label", null);
    if (!Number.isInteger(label) || label < 0 || label > 16) return toolResult("label must be an integer from 0 through 16.", true);

    const result = await runExtendScriptBody(`
      ${resolveCompScript}
      var itemIndices = ${aeLiteral(itemIndices)};
      var expectedItemNames = ${expectedItemNames ? aeLiteral(expectedItemNames) : "null"};
      var label = ${label};

      app.beginUndoGroup("Codex Set Project Item Metadata");
      try {
        var changed = [];
        var allMatch = true;
        for (var __pi = 0; __pi < itemIndices.length; __pi++) {
          var requestedIndex = itemIndices[__pi];
          var item = app.project.item(requestedIndex);
          if (!item) throw new Error("Project item not found at index " + requestedIndex + ".");
          if (expectedItemNames && item.name !== expectedItemNames[__pi]) {
            throw new Error("Project item name mismatch at index " + requestedIndex + ". Expected '" + expectedItemNames[__pi] + "' but found '" + item.name + "'.");
          }

          var before = __codexItemReference(item);
          item.label = Number(label);
          var after = __codexItemReference(item);
          var fieldMatches = { label: Number(after.label) === Number(label) };
          if (!fieldMatches.label) allMatch = false;
          changed.push({
            itemIndex: requestedIndex,
            expectedItemName: expectedItemNames ? expectedItemNames[__pi] : null,
            before: before,
            after: after,
            fieldMatches: fieldMatches
          });
        }

        var items = [];
        for (var __changedIndex = 0; __changedIndex < changed.length; __changedIndex++) {
          items.push(changed[__changedIndex].after);
        }
        return {
          requestedItemIndices: itemIndices,
          expectedItemNames: expectedItemNames,
          updatedFields: ["label"],
          updates: { label: label },
          changedCount: changed.length,
          item: items.length === 1 ? items[0] : null,
          items: items,
          changed: changed,
          postVerification: {
            ok: allMatch,
            requestedCount: itemIndices.length,
            changedCount: changed.length,
            updatedFields: ["label"]
          }
        };
      } finally {
        app.endUndoGroup();
      }
    `);
    return toolResult(result.result);
  }

  if (name === "list_comps") {
    const result = await runExtendScriptBody(`
      var comps = [];
      for (var i = 1; i <= app.project.numItems; i++) {
        var item = app.project.item(i);
        if (item instanceof CompItem) {
          comps.push({
            itemIndex: i,
            name: item.name,
            width: item.width,
            height: item.height,
            duration: item.duration,
            frameRate: item.frameRate,
            numLayers: item.numLayers
          });
        }
      }
      return comps;
    `);
    return toolResult(result.result);
  }

  if (name === "list_layers") {
    const index = Number(args.compItemIndex);
    if (!Number.isFinite(index) || index < 1) {
      return toolResult("compItemIndex must be a positive 1-based project item index.", true);
    }

    const result = await runExtendScriptBody(`
      var item = app.project.item(${Math.floor(index)});
      if (!(item instanceof CompItem)) {
        throw new Error("Project item is not a composition.");
      }
      var layers = [];
      for (var i = 1; i <= item.numLayers; i++) {
        var layer = item.layer(i);
        layers.push({
          index: i,
          id: layer.id,
          name: layer.name,
          matchName: layer.matchName,
          enabled: layer.enabled,
          locked: layer.locked,
          shy: layer.shy,
          solo: layer.solo,
          startTime: layer.startTime,
          inPoint: layer.inPoint,
          outPoint: layer.outPoint
        });
      }
      return {
        comp: {
          itemIndex: ${Math.floor(index)},
          name: item.name,
          numLayers: item.numLayers
        },
        layers: layers
      };
    `);
    return toolResult(result.result);
  }

  if (name === "get_comp_details") {
    const compItemIndex = optionalPositiveInteger(args, "compItemIndex");
    const compName = optionalString(args, "compName", "");
    const includeLayers = optionalBoolean(args, "includeLayers", true);
    const layerLimit = Math.max(1, Math.min(1000, Math.floor(optionalNumber(args, "layerLimit", 200))));
    const includeMarkers = optionalBoolean(args, "includeMarkers", false);
    const markerLimit = Math.max(0, Math.min(1000, Math.floor(optionalNumber(args, "markerLimit", 50))));

    const result = await runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${aeLiteral(compName)});
      var includeLayers = ${includeLayers ? "true" : "false"};
      var includeMarkers = ${includeMarkers ? "true" : "false"};
      var layerLimit = ${layerLimit};
      var markerLimit = ${markerLimit};
      var selectedLayerIndices = [];
      for (var s = 0; s < comp.selectedLayers.length; s++) {
        selectedLayerIndices.push(comp.selectedLayers[s].index);
      }
      var displayStartFrame = null;
      var displayStartFrameSupported = false;
      try {
        if (comp.displayStartFrame !== undefined) {
          displayStartFrame = comp.displayStartFrame;
          displayStartFrameSupported = true;
        }
      } catch (__displayStartFrameError) {}

      var layers = [];
      if (includeLayers) {
        for (var i = 1; i <= comp.numLayers && layers.length < layerLimit; i++) {
          layers.push(__codexLayerInfo(comp.layer(i)));
        }
      }

      return {
        itemIndex: __codexProjectIndexForItem(comp),
        name: comp.name,
        type: "comp",
        width: comp.width,
        height: comp.height,
        pixelAspect: comp.pixelAspect,
        duration: comp.duration,
        workAreaStart: comp.workAreaStart,
        workAreaDuration: comp.workAreaDuration,
        frameRate: comp.frameRate,
        displayStartTime: comp.displayStartTime,
        displayStartFrame: displayStartFrame,
        displayStartFrameSupported: displayStartFrameSupported,
        preserveNestedFrameRate: !!comp.preserveNestedFrameRate,
        time: comp.time,
        bgColor: comp.bgColor,
        motionBlur: comp.motionBlur,
        numLayers: comp.numLayers,
        selectedLayerIndices: selectedLayerIndices,
        layersReturned: layers.length,
        layersTruncated: includeLayers && comp.numLayers > layers.length,
        markers: includeMarkers ? __codexCompMarkers(comp, markerLimit) : null,
        layers: layers
      };
    `);
    return toolResult(result.result);
  }

  if (name === "get_layer_details") {
    const compItemIndex = optionalPositiveInteger(args, "compItemIndex");
    const compName = optionalString(args, "compName", "");
    const layerIndex = requiredPositiveInteger(args, "layerIndex");
    const includeProperties = optionalBoolean(args, "includeProperties", false);
    const propertyDepth = Math.max(0, Math.min(5, Math.floor(optionalNumber(args, "propertyDepth", 1))));
    const propertyLimit = Math.max(1, Math.min(1000, Math.floor(optionalNumber(args, "propertyLimit", 120))));
    const includeValues = optionalBoolean(args, "includeValues", false);
    const includeExpressions = optionalBoolean(args, "includeExpressions", true);

    const result = await runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${aeLiteral(compName)});
      var layer = comp.layer(${layerIndex});
      if (!layer) throw new Error("Layer not found.");
      var includeProperties = ${includeProperties ? "true" : "false"};
      var includeValues = ${includeValues ? "true" : "false"};
      var includeExpressions = ${includeExpressions ? "true" : "false"};
      var propertyDepth = ${propertyDepth};
      var propertyLimit = ${propertyLimit};

      function __codexReadProperty(group, matchName) {
        try {
          var prop = group.property(matchName);
          if (!prop) return null;
          return __codexValuePreview(prop);
        } catch (__readPropertyError) {
          return null;
        }
      }

      function __codexPropertyTree(prop, depth, state) {
        if (!prop || state.count >= state.max) return null;
        state.count++;
        var info = __codexPropertyInfo(prop, null, includeValues, includeExpressions);
        var children = [];
        if (depth > 0) {
          try {
            for (var i = 1; i <= prop.numProperties && state.count < state.max; i++) {
              var child = __codexPropertyTree(prop.property(i), depth - 1, state);
              if (child) children.push(child);
            }
          } catch (__childrenError) {}
        }
        if (children.length) info.children = children;
        return info;
      }

      var transform = null;
      try {
        var transformGroup = layer.property("ADBE Transform Group");
        var anchorPointPreview = __codexReadProperty(transformGroup, "ADBE Anchor Point");
        transform = {
          anchorPoint: anchorPointPreview,
          pointOfInterest: __codexReadProperty(transformGroup, "ADBE Point of Interest") || (layer.matchName === "ADBE Camera Layer" ? anchorPointPreview : null),
          position: __codexReadProperty(transformGroup, "ADBE Position"),
          scale: __codexReadProperty(transformGroup, "ADBE Scale"),
          orientation: __codexReadProperty(transformGroup, "ADBE Orientation"),
          rotation: __codexReadProperty(transformGroup, "ADBE Rotate Z"),
          opacity: __codexReadProperty(transformGroup, "ADBE Opacity")
        };
      } catch (__transformError) {}

      var camera = null;
      try {
        var cameraGroup = layer.property("ADBE Camera Options Group");
        if (cameraGroup) {
          camera = {
            zoom: __codexReadProperty(cameraGroup, "ADBE Camera Zoom"),
            depthOfField: __codexReadProperty(cameraGroup, "ADBE Camera Depth of Field"),
            focusDistance: __codexReadProperty(cameraGroup, "ADBE Camera Focus Distance"),
            aperture: __codexReadProperty(cameraGroup, "ADBE Camera Aperture"),
            blurLevel: __codexReadProperty(cameraGroup, "ADBE Camera Blur Level")
          };
        }
      } catch (__cameraError) {}

      var text = null;
      try {
        var textProp = layer.property("ADBE Text Properties").property("ADBE Text Document");
        text = __codexValuePreview(textProp);
      } catch (__textError) {}

      var effects = [];
      try {
        var effectGroup = layer.property("ADBE Effect Parade");
        if (effectGroup) {
          for (var e = 1; e <= effectGroup.numProperties; e++) {
            var effect = effectGroup.property(e);
            effects.push({
              propertyIndex: effect.propertyIndex,
              name: effect.name,
              matchName: effect.matchName,
              enabled: effect.enabled
            });
          }
        }
      } catch (__effectsError) {}

      function __codexMaskModeName(value) {
        try { if (value === MaskMode.ADD) return "add"; } catch (__maskModeAddError) {}
        try { if (value === MaskMode.SUBTRACT) return "subtract"; } catch (__maskModeSubtractError) {}
        try { if (value === MaskMode.INTERSECT) return "intersect"; } catch (__maskModeIntersectError) {}
        try { if (value === MaskMode.LIGHTEN) return "lighten"; } catch (__maskModeLightenError) {}
        try { if (value === MaskMode.DARKEN) return "darken"; } catch (__maskModeDarkenError) {}
        try { if (value === MaskMode.DIFFERENCE) return "difference"; } catch (__maskModeDifferenceError) {}
        try { if (value === MaskMode.NONE) return "none"; } catch (__maskModeNoneError) {}
        return String(value);
      }

      function __codexMaskPointList(points, limit) {
        var list = [];
        if (!points) return list;
        for (var __mp = 0; __mp < points.length && __mp < limit; __mp++) {
          var point = points[__mp];
          list.push([point[0], point[1]]);
        }
        return list;
      }

      function __codexFindChildProperty(group, matchName, fallbackName) {
        if (!group) return null;
        try {
          var direct = group.property(matchName);
          if (direct) return direct;
        } catch (__directPropertyError) {}
        if (fallbackName) {
          try {
            var fallback = group.property(fallbackName);
            if (fallback) return fallback;
          } catch (__fallbackPropertyError) {}
        }
        try {
          for (var __cp = 1; __cp <= group.numProperties; __cp++) {
            var child = group.property(__cp);
            if (child && (child.matchName === matchName || child.name === fallbackName)) return child;
          }
        } catch (__childPropertyError) {}
        return null;
      }

      function __codexMaskShapeInfo(mask) {
        try {
          var shapeProp = __codexFindChildProperty(mask, "ADBE Mask Shape", "Mask Path");
          if (!shapeProp) return null;
          var shape = shapeProp.value;
          if (!shape) return null;
          return {
            closed: shape.closed === true,
            vertexCount: shape.vertices ? shape.vertices.length : 0,
            vertices: __codexMaskPointList(shape.vertices, 50),
            inTangents: __codexMaskPointList(shape.inTangents, 50),
            outTangents: __codexMaskPointList(shape.outTangents, 50),
            truncated: shape.vertices && shape.vertices.length > 50
          };
        } catch (__maskShapeError) {
          return null;
        }
      }

      var masks = [];
      try {
        var maskGroup = layer.property("ADBE Mask Parade");
        if (maskGroup) {
          for (var m = 1; m <= maskGroup.numProperties; m++) {
            var mask = maskGroup.property(m);
            masks.push({
              propertyIndex: mask.propertyIndex,
              name: mask.name,
              matchName: mask.matchName,
              maskMode: __codexMaskModeName(mask.maskMode),
              inverted: mask.inverted,
              shape: __codexMaskShapeInfo(mask),
              opacity: __codexReadProperty(mask, "ADBE Mask Opacity") || __codexReadProperty(mask, "Mask Opacity"),
              feather: __codexReadProperty(mask, "ADBE Mask Feather") || __codexReadProperty(mask, "Mask Feather"),
              expansion: __codexReadProperty(mask, "ADBE Mask Expansion") || __codexReadProperty(mask, "Mask Expansion")
            });
          }
        }
      } catch (__masksError) {}

      var markers = __codexLayerMarkers(layer, 50);

      var propertyTree = [];
      var propertyState = { count: 0, max: propertyLimit };
      if (includeProperties) {
        try {
          for (var p = 1; p <= layer.numProperties && propertyState.count < propertyState.max; p++) {
            var branch = __codexPropertyTree(layer.property(p), propertyDepth, propertyState);
            if (branch) propertyTree.push(branch);
          }
        } catch (__propertyTreeError) {}
      }

      return {
        comp: {
          itemIndex: __codexProjectIndexForItem(comp),
          name: comp.name,
          time: comp.time,
          numLayers: comp.numLayers
        },
        layer: __codexLayerInfo(layer),
        transform: transform,
        camera: camera,
        text: text,
        effects: effects,
        masks: masks,
        markers: markers,
        propertyTree: propertyTree,
        propertyTreeTruncated: propertyState.count >= propertyState.max
      };
    `);
    return toolResult(result.result);
  }

  if (name === "get_layer_essential_properties") {
    const compItemIndex = optionalPositiveInteger(args, "compItemIndex");
    const compName = optionalString(args, "compName", "");
    const layerIndex = requiredPositiveInteger(args, "layerIndex");
    const includeValues = optionalBoolean(args, "includeValues", true);
    const includeExpressions = optionalBoolean(args, "includeExpressions", true);
    const propertyLimit = Math.max(1, Math.min(200, Math.floor(optionalNumber(args, "propertyLimit", 80))));

    const result = await runExtendScriptBody(`
      ${resolveCompScript}

      function __codexEssentialSourceInfo(source) {
        if (!source) return null;
        try {
          if (source instanceof Property) {
            return {
              kind: "property",
              name: source.name || "",
              matchName: source.matchName || null,
              propertyIndex: source.propertyIndex || null,
              propertyPath: __codexPropertyPath(source),
              canSetExpression: !!source.canSetExpression,
              propertyValueType: source.propertyValueType || null,
              unitsText: source.unitsText || ""
            };
          }
        } catch (__sourcePropertyError) {}
        try {
          if (source instanceof AVLayer || source instanceof TextLayer || source instanceof ShapeLayer) {
            return {
              kind: "layer",
              layer: __codexLayerInfo(source)
            };
          }
        } catch (__sourceLayerError) {}
        try {
          return {
            kind: "unknown",
            name: source.name || "",
            matchName: source.matchName || null
          };
        } catch (__unknownSourceError) {
          return {
            kind: "unknown"
          };
        }
      }

      function __codexEssentialPropertyInfo(prop, layer, includeValue, includeExpression) {
        var info = __codexPropertyInfo(prop, layer, includeValue, includeExpression);
        try { info.unitsText = prop.unitsText || ""; } catch (__unitsTextError) {}
        try { info.essentialPropertySource = __codexEssentialSourceInfo(prop.essentialPropertySource); } catch (__essentialSourceError) { info.essentialPropertySource = null; }
        return info;
      }

      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${aeLiteral(compName)});
      var layer = comp.layer(${layerIndex});
      if (!layer) throw new Error("Layer not found.");
      var includeValues = ${includeValues ? "true" : "false"};
      var includeExpressions = ${includeExpressions ? "true" : "false"};
      var propertyLimit = ${propertyLimit};
      var group = null;
      try { group = layer.essentialProperty; } catch (__essentialGroupError) {}
      var properties = [];
      var count = 0;
      if (group) {
        try { count = group.numProperties || 0; } catch (__essentialCountError) { count = 0; }
        for (var __ep = 1; __ep <= count && properties.length < propertyLimit; __ep++) {
          var prop = null;
          try { prop = group.property(__ep); } catch (__essentialPropertyError) {}
          if (prop) properties.push(__codexEssentialPropertyInfo(prop, layer, includeValues, includeExpressions));
        }
      }
      return {
        comp: {
          itemIndex: __codexProjectIndexForItem(comp),
          name: comp.name,
          numLayers: comp.numLayers
        },
        layer: __codexLayerInfo(layer),
        essentialProperties: {
          available: !!group,
          count: count,
          returned: properties.length,
          truncated: count > properties.length,
          properties: properties
        }
      };
    `);
    return toolResult(result.result);
  }

  if (name === "get_essential_graphics_controllers") {
    const compItemIndex = optionalPositiveInteger(args, "compItemIndex");
    const compName = optionalString(args, "compName", "");

    const result = await runExtendScriptBody(`
      ${resolveCompScript}

      function __codexEssentialGraphicsControllers(comp) {
        var controllers = [];
        var count = 0;
        try { count = comp.motionGraphicsTemplateControllerCount || 0; } catch (__countError) { count = 0; }
        for (var __eg = 1; __eg <= count; __eg++) {
          var controllerName = "";
          try { controllerName = comp.getMotionGraphicsTemplateControllerName(__eg) || ""; } catch (__nameError) {}
          controllers.push({
            index: __eg,
            name: controllerName
          });
        }
        return {
          count: count,
          controllers: controllers
        };
      }

      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${aeLiteral(compName)});
      var controllers = __codexEssentialGraphicsControllers(comp);
      var templateName = "";
      try { templateName = comp.motionGraphicsTemplateName || ""; } catch (__templateNameError) {}
      return {
        comp: {
          itemIndex: __codexProjectIndexForItem(comp),
          name: comp.name,
          numLayers: comp.numLayers
        },
        motionGraphicsTemplateName: templateName,
        controllerCount: controllers.count,
        controllers: controllers.controllers
      };
    `);
    return toolResult(result.result);
  }

  if (name === "get_path_geometry") {
    const compItemIndex = optionalPositiveInteger(args, "compItemIndex");
    const compName = optionalString(args, "compName", "");
    const layerIndex = requiredPositiveInteger(args, "layerIndex");
    const targetKind = optionalString(args, "targetKind", "").toLowerCase();
    const expectedLayerName = optionalString(args, "expectedLayerName", "");
    const expectedMaskName = optionalString(args, "expectedMaskName", "");
    const includeKeyframes = optionalBoolean(args, "includeKeyframes", true);
    const keyframeLimit = Math.max(1, Math.min(80, Math.floor(optionalNumber(args, "keyframeLimit", 80))));
    let propertyPath = null;
    let maskIndex = null;

    if (!["shape", "mask"].includes(targetKind)) return toolResult("targetKind must be shape or mask.", true);
    if (targetKind === "shape") {
      try {
        propertyPath = normalizePropertyPathArg(args, "propertyPath");
      } catch (error) {
        return toolResult(error.message || String(error), true);
      }
    } else {
      maskIndex = optionalPositiveInteger(args, "maskIndex");
      if (maskIndex === null) return toolResult("maskIndex is required for targetKind=mask.", true);
    }

    const result = await runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${aeLiteral(compName)});
      var layer = comp.layer(${layerIndex});
      if (!layer) throw new Error("Layer not found.");
      var targetKind = ${aeLiteral(targetKind)};
      var propertyPath = ${propertyPath ? aeLiteral(propertyPath) : "null"};
      var requestedMaskIndex = ${maskIndex === null ? "null" : maskIndex};
      var expectedLayerName = ${aeLiteral(expectedLayerName)};
      var expectedMaskName = ${aeLiteral(expectedMaskName)};
      var includeKeyframes = ${includeKeyframes ? "true" : "false"};
      var keyframeLimit = ${keyframeLimit};

      function __codexFindChildProperty(group, matchName, fallbackName) {
        if (!group) return null;
        try {
          var direct = group.property(matchName);
          if (direct) return direct;
        } catch (__directPropertyError) {}
        if (fallbackName) {
          try {
            var fallback = group.property(fallbackName);
            if (fallback) return fallback;
          } catch (__fallbackPropertyError) {}
        }
        try {
          for (var __cp = 1; __cp <= group.numProperties; __cp++) {
            var child = group.property(__cp);
            if (child && (child.matchName === matchName || child.name === fallbackName)) return child;
          }
        } catch (__childPropertyError) {}
        return null;
      }

      function __codexPathGeometryInfo(prop, owningLayer, includeKeys, limit) {
        var info = __codexPropertyInfo(prop, owningLayer, false, false);
        info.geometry = __codexShapeGeometryData(prop.value, 80);
        if (includeKeys) {
          info.keyframes = [];
          var keyCount = 0;
          try { keyCount = prop.numKeys || 0; } catch (__numKeysError) {}
          var maxKeys = Math.min(keyCount, limit);
          for (var __keyIndex = 1; __keyIndex <= maxKeys; __keyIndex++) {
            info.keyframes.push({
              index: __keyIndex,
              time: prop.keyTime(__keyIndex),
              geometry: __codexShapeGeometryData(prop.keyValue(__keyIndex), 80)
            });
          }
          info.keyframesTruncated = keyCount > maxKeys;
        }
        return info;
      }

      function __codexResolvePathTarget() {
        if (expectedLayerName && layer.name !== expectedLayerName) {
          throw new Error("Layer name mismatch. Expected '" + expectedLayerName + "' but found '" + layer.name + "'.");
        }
        if (targetKind === "shape") {
          var shapeProp = __codexResolveProperty(layer, propertyPath);
          if (!shapeProp || shapeProp.matchName !== "ADBE Vector Shape") {
            throw new Error("propertyPath must resolve to an ADBE Vector Shape path property.");
          }
          return { property: shapeProp, mask: null };
        }
        var maskGroup = layer.property("ADBE Mask Parade");
        if (!maskGroup) throw new Error("Layer does not support masks.");
        if (requestedMaskIndex < 1 || requestedMaskIndex > maskGroup.numProperties) throw new Error("maskIndex is outside the layer mask range.");
        var mask = maskGroup.property(requestedMaskIndex);
        if (!mask) throw new Error("Mask not found at maskIndex " + requestedMaskIndex + ".");
        if (expectedMaskName && mask.name !== expectedMaskName) {
          throw new Error("Mask name mismatch. Expected '" + expectedMaskName + "' but found '" + mask.name + "'.");
        }
        var maskShapeProp = __codexFindChildProperty(mask, "ADBE Mask Shape", "Mask Path");
        if (!maskShapeProp) throw new Error("Mask shape property was not found.");
        return { property: maskShapeProp, mask: mask };
      }

      var target = __codexResolvePathTarget();
      var pathGeometry = __codexPathGeometryInfo(target.property, layer, includeKeyframes, keyframeLimit);
      return {
        comp: { itemIndex: __codexProjectIndexForItem(comp), name: comp.name },
        layer: __codexLayerInfo(layer),
        targetKind: targetKind,
        mask: target.mask ? { propertyIndex: target.mask.propertyIndex, name: target.mask.name, matchName: target.mask.matchName } : null,
        property: pathGeometry,
        pathGeometry: pathGeometry
      };
    `);
    return toolResult(result.result);
  }

  if (name === "export_path_points") {
    try {
      return toolResult(exportPathPointsFile(args || {}));
    } catch (error) {
      return toolResult(error.message || String(error), true);
    }
  }

  if (name === "save_comp_frame_png") {
    try {
      const compItemIndex = optionalPositiveInteger(args, "compItemIndex");
      const compName = optionalString(args, "compName", "");
      const expectedCompName = optionalString(args, "expectedCompName", "");
      const requestedTime = hasArg(args, "time") ? optionalNumber(args, "time", 0) : null;
      const resolutionFactor = optionalResolutionFactor(args, "resolutionFactor") || [1, 1];
      const deleteAfterReadBack = optionalBoolean(args, "deleteAfterReadBack", false);
      const allowOverwrite = optionalBoolean(args, "allowOverwrite", false);
      const output = resolveGeneratedPngExportFile(optionalString(args, "outputFileName", "frame.png"));

      if (requestedTime !== null && requestedTime < 0) {
        return toolResult("time must be greater than or equal to 0 seconds.", true);
      }
      if (fs.existsSync(output.resolvedPath)) {
        if (!allowOverwrite) {
          return toolResult("Generated PNG output already exists. Use a unique outputFileName or allowOverwrite:true.", true);
        }
        fs.unlinkSync(output.resolvedPath);
      }
      fs.mkdirSync(path.dirname(output.resolvedPath), { recursive: true });

      const result = await runExtendScriptBody(`
        ${resolveCompScript}
        var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${aeLiteral(compName)});
        var expectedCompName = ${aeLiteral(expectedCompName)};
        if (expectedCompName && comp.name !== expectedCompName) {
          throw new Error("Composition name mismatch. Expected '" + expectedCompName + "' but found '" + comp.name + "'.");
        }
        if (typeof comp.saveFrameToPng !== "function") {
          throw new Error("CompItem.saveFrameToPng is not available in this After Effects host.");
        }

        var requestedTime = ${requestedTime === null ? "null" : JSON.stringify(requestedTime)};
        var saveTime = requestedTime === null ? comp.time : requestedTime;
        if (saveTime < 0 || saveTime > comp.duration) {
          throw new Error("time must be inside the composition duration.");
        }

        var outputFile = new File(${aeLiteral(output.resolvedPath)});
        var originalResolutionFactor = [comp.resolutionFactor[0], comp.resolutionFactor[1]];
        var targetResolutionFactor = ${aeLiteral(resolutionFactor)};
        var restoredResolutionFactor = null;
        var saved = false;
        try {
          comp.resolutionFactor = targetResolutionFactor;
          comp.saveFrameToPng(saveTime, outputFile);
          saved = outputFile.exists === true;
        } finally {
          comp.resolutionFactor = originalResolutionFactor;
          restoredResolutionFactor = [comp.resolutionFactor[0], comp.resolutionFactor[1]];
        }
        if (!saved) {
          throw new Error("saveFrameToPng did not create the generated PNG file.");
        }

        return {
          comp: {
            itemIndex: __codexProjectIndexForItem(comp),
            name: comp.name,
            width: comp.width,
            height: comp.height,
            duration: comp.duration,
            frameRate: comp.frameRate,
            time: comp.time,
            numLayers: comp.numLayers
          },
          frame: {
            time: saveTime,
            frameNumber: Math.round(saveTime * comp.frameRate)
          },
          resolutionFactor: {
            before: originalResolutionFactor,
            applied: targetResolutionFactor,
            after: restoredResolutionFactor,
            restored: restoredResolutionFactor[0] === originalResolutionFactor[0] && restoredResolutionFactor[1] === originalResolutionFactor[1]
          },
          postVerification: {
            outputFileExists: outputFile.exists === true,
            resolutionFactorRestored: restoredResolutionFactor[0] === originalResolutionFactor[0] && restoredResolutionFactor[1] === originalResolutionFactor[1]
          }
        };
      `);

      if (result && result.ok === false) {
        return toolResult(result.error || "save_comp_frame_png failed.", true);
      }
      if (!fs.existsSync(output.resolvedPath)) {
        return toolResult("Generated PNG output was not found after saveFrameToPng.", true);
      }

      const bytes = fs.readFileSync(output.resolvedPath);
      const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
      const existsBeforeCleanup = fs.existsSync(output.resolvedPath);
      let existsAfter = existsBeforeCleanup;
      if (deleteAfterReadBack) {
        fs.unlinkSync(output.resolvedPath);
        existsAfter = fs.existsSync(output.resolvedPath);
      }

      const payload = result.result || {};
      payload.outputFileName = output.outputFileName;
      payload.outputPath = output.resolvedPath;
      payload.generatedExportDir = GENERATED_EXPORT_DIR;
      payload.file = {
        outputFileName: output.outputFileName,
        outputPath: output.resolvedPath,
        byteLength: bytes.length,
        sha256,
        existsAfter,
        deletedAfterReadBack: deleteAfterReadBack,
        mimeType: "image/png"
      };
      return toolResult(payload);
    } catch (error) {
      return toolResult(error.message || String(error), true);
    }
  }

  if (name === "get_active_comp") {
    const result = await runExtendScriptBody(`
      ${resolveCompScript}
      var comp = app.project.activeItem;
      if (!(comp instanceof CompItem)) {
        throw new Error("Active item is not a composition.");
      }
      var selectedLayers = [];
      for (var i = 0; i < comp.selectedLayers.length; i++) {
        selectedLayers.push(__codexLayerInfo(comp.selectedLayers[i]));
      }
      return {
        itemIndex: __codexProjectIndexForItem(comp),
        name: comp.name,
        width: comp.width,
        height: comp.height,
        duration: comp.duration,
        frameRate: comp.frameRate,
        numLayers: comp.numLayers,
        time: comp.time,
        selectedLayers: selectedLayers
      };
    `);
    return toolResult(result.result);
  }

  if (name === "get_selected_layers") {
    const result = await runExtendScriptBody(`
      ${resolveCompScript}
      var comp = app.project.activeItem;
      if (!(comp instanceof CompItem)) {
        throw new Error("Active item is not a composition.");
      }
      var layers = [];
      for (var i = 0; i < comp.selectedLayers.length; i++) {
        layers.push(__codexLayerInfo(comp.selectedLayers[i]));
      }
      return {
        comp: {
          itemIndex: __codexProjectIndexForItem(comp),
          name: comp.name,
          time: comp.time,
          numLayers: comp.numLayers
        },
        selectedLayers: layers
      };
    `);
    return toolResult(result.result);
  }

  if (name === "set_layer_selection") {
    const compItemIndex = optionalPositiveInteger(args, "compItemIndex");
    const compName = optionalString(args, "compName", "");
    const layerIndices = requiredExplicitPositiveIntegerList(args, "layerIndices");
    const makeActive = optionalBoolean(args, "makeActive", true);

    let expectedLayerNames = null;
    if (hasArg(args, "expectedLayerNames")) {
      expectedLayerNames = args.expectedLayerNames;
      if (typeof expectedLayerNames === "string" && expectedLayerNames.trim().startsWith("[")) {
        expectedLayerNames = JSON.parse(expectedLayerNames);
      }
      if (!Array.isArray(expectedLayerNames)) {
        return toolResult("expectedLayerNames must be an array when provided.", true);
      }
      expectedLayerNames = expectedLayerNames.map((value) => String(value));
      if (expectedLayerNames.length !== layerIndices.length) {
        return toolResult("expectedLayerNames must have the same length as layerIndices.", true);
      }
    }

    const result = await runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${aeLiteral(compName)});
      var requestedLayerIndices = ${aeLiteral(layerIndices)};
      var expectedLayerNames = ${expectedLayerNames ? aeLiteral(expectedLayerNames) : "null"};
      var makeActive = ${makeActive ? "true" : "false"};
      if (makeActive && comp.openInViewer) comp.openInViewer();

      var targetLayers = [];
      for (var __selectionIndex = 0; __selectionIndex < requestedLayerIndices.length; __selectionIndex++) {
        var requestedIndex = requestedLayerIndices[__selectionIndex];
        if (requestedIndex > comp.numLayers) {
          throw new Error("Layer index " + requestedIndex + " is out of range for comp with " + comp.numLayers + " layers.");
        }
        var layer = comp.layer(requestedIndex);
        if (!layer) throw new Error("Layer not found at index " + requestedIndex + ".");
        if (expectedLayerNames && layer.name !== expectedLayerNames[__selectionIndex]) {
          throw new Error("Layer name mismatch at index " + requestedIndex + ". Expected '" + expectedLayerNames[__selectionIndex] + "' but found '" + layer.name + "'.");
        }
        targetLayers.push(layer);
      }

      var selectedBefore = [];
      for (var __beforeIndex = 0; __beforeIndex < comp.selectedLayers.length; __beforeIndex++) {
        selectedBefore.push(__codexLayerInfo(comp.selectedLayers[__beforeIndex]));
      }

      app.beginUndoGroup("Codex Set Layer Selection");
      try {
        for (var __clearIndex = 1; __clearIndex <= comp.numLayers; __clearIndex++) {
          comp.layer(__clearIndex).selected = false;
        }
        for (var __targetIndex = 0; __targetIndex < targetLayers.length; __targetIndex++) {
          targetLayers[__targetIndex].selected = true;
        }
      } finally {
        app.endUndoGroup();
      }

      var selectedAfter = [];
      var selectedIndices = [];
      var selectedNames = [];
      for (var __afterIndex = 0; __afterIndex < comp.selectedLayers.length; __afterIndex++) {
        var selectedLayer = comp.selectedLayers[__afterIndex];
        selectedAfter.push(__codexLayerInfo(selectedLayer));
        selectedIndices.push(selectedLayer.index);
        selectedNames.push(selectedLayer.name);
      }
      var indexMatches = selectedIndices.length === requestedLayerIndices.length;
      for (var __matchIndex = 0; __matchIndex < requestedLayerIndices.length && indexMatches; __matchIndex++) {
        if (selectedIndices[__matchIndex] !== requestedLayerIndices[__matchIndex]) indexMatches = false;
      }
      var nameMatches = true;
      if (expectedLayerNames) {
        nameMatches = selectedNames.length === expectedLayerNames.length;
        for (var __nameIndex = 0; __nameIndex < expectedLayerNames.length && nameMatches; __nameIndex++) {
          if (selectedNames[__nameIndex] !== expectedLayerNames[__nameIndex]) nameMatches = false;
        }
      }

      return {
        comp: {
          itemIndex: __codexProjectIndexForItem(comp),
          name: comp.name,
          time: comp.time,
          numLayers: comp.numLayers
        },
        requestedLayerIndices: requestedLayerIndices,
        expectedLayerNames: expectedLayerNames,
        selectedBefore: selectedBefore,
        selectedLayers: selectedAfter,
        selectedIndices: selectedIndices,
        selectedNames: selectedNames,
        changedCount: selectedAfter.length,
        postVerification: {
          ok: indexMatches && nameMatches,
          requestedCount: requestedLayerIndices.length,
          selectedCount: selectedAfter.length,
          indexMatches: indexMatches,
          nameMatches: nameMatches
        }
      };
    `);
    return toolResult(result.result);
  }

  if (name === "set_layer_parent") {
    const compItemIndex = optionalPositiveInteger(args, "compItemIndex");
    const compName = optionalString(args, "compName", "");
    const layerIndex = requiredPositiveInteger(args, "layerIndex");
    const parentLayerIndex = requiredPositiveInteger(args, "parentLayerIndex");
    const expectedLayerName = optionalString(args, "expectedLayerName", "");
    const expectedParentName = optionalString(args, "expectedParentName", "");

    if (layerIndex === parentLayerIndex) {
      return toolResult("layerIndex and parentLayerIndex must be different.", true);
    }

    const result = await runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${aeLiteral(compName)});
      var layerIndex = ${layerIndex};
      var parentLayerIndex = ${parentLayerIndex};
      var expectedLayerName = ${aeLiteral(expectedLayerName)};
      var expectedParentName = ${aeLiteral(expectedParentName)};

      if (layerIndex > comp.numLayers) throw new Error("Layer index " + layerIndex + " is out of range for comp with " + comp.numLayers + " layers.");
      if (parentLayerIndex > comp.numLayers) throw new Error("Parent layer index " + parentLayerIndex + " is out of range for comp with " + comp.numLayers + " layers.");
      var layer = comp.layer(layerIndex);
      var parentLayer = comp.layer(parentLayerIndex);
      if (!layer) throw new Error("Layer not found at index " + layerIndex + ".");
      if (!parentLayer) throw new Error("Parent layer not found at index " + parentLayerIndex + ".");
      if (layer === parentLayer) throw new Error("Layer cannot be parented to itself.");
      if (layer.locked) throw new Error("Layer is locked.");
      if (expectedLayerName && layer.name !== expectedLayerName) {
        throw new Error("Layer name mismatch at index " + layerIndex + ". Expected '" + expectedLayerName + "' but found '" + layer.name + "'.");
      }
      if (expectedParentName && parentLayer.name !== expectedParentName) {
        throw new Error("Parent layer name mismatch at index " + parentLayerIndex + ". Expected '" + expectedParentName + "' but found '" + parentLayer.name + "'.");
      }

      var beforeParent = null;
      try { beforeParent = layer.parent ? __codexLayerInfo(layer.parent) : null; } catch (__beforeParentError) {}

      app.beginUndoGroup("Codex Set Layer Parent");
      try {
        layer.parent = parentLayer;
      } finally {
        app.endUndoGroup();
      }

      var childAfter = __codexLayerInfo(layer);
      var parentAfter = __codexLayerInfo(parentLayer);
      var parentMatches = childAfter.parent && childAfter.parent.index === parentAfter.index && childAfter.parent.name === parentAfter.name;
      return {
        comp: {
          itemIndex: __codexProjectIndexForItem(comp),
          name: comp.name,
          time: comp.time,
          numLayers: comp.numLayers
        },
        layer: childAfter,
        parent: parentAfter,
        beforeParent: beforeParent,
        requestedLayerIndex: layerIndex,
        requestedParentLayerIndex: parentLayerIndex,
        expectedLayerName: expectedLayerName || null,
        expectedParentName: expectedParentName || null,
        postVerification: {
          ok: parentMatches,
          parentMatches: parentMatches,
          childNameMatches: !expectedLayerName || childAfter.name === expectedLayerName,
          parentNameMatches: !expectedParentName || parentAfter.name === expectedParentName
        }
      };
    `);
    return toolResult(result.result);
  }

  if (name === "set_layer_track_matte") {
    const compItemIndex = optionalPositiveInteger(args, "compItemIndex");
    const compName = optionalString(args, "compName", "");
    const layerIndex = requiredPositiveInteger(args, "layerIndex");
    const matteLayerIndex = requiredPositiveInteger(args, "matteLayerIndex");
    const trackMatteType = optionalString(args, "trackMatteType", "").toLowerCase();
    const expectedLayerName = optionalString(args, "expectedLayerName", "");
    const expectedMatteLayerName = optionalString(args, "expectedMatteLayerName", "");

    const allowedTrackMatteTypes = new Set(["alpha", "alpha_inverted", "luma", "luma_inverted"]);
    if (!allowedTrackMatteTypes.has(trackMatteType)) {
      return toolResult("trackMatteType must be one of: alpha, alpha_inverted, luma, luma_inverted.", true);
    }
    if (layerIndex === matteLayerIndex) {
      return toolResult("layerIndex and matteLayerIndex must be different.", true);
    }

    const result = await runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${aeLiteral(compName)});
      var layerIndex = ${layerIndex};
      var matteLayerIndex = ${matteLayerIndex};
      var trackMatteTypeName = ${aeLiteral(trackMatteType)};
      var expectedLayerName = ${aeLiteral(expectedLayerName)};
      var expectedMatteLayerName = ${aeLiteral(expectedMatteLayerName)};

      if (layerIndex > comp.numLayers) throw new Error("Layer index " + layerIndex + " is out of range for comp with " + comp.numLayers + " layers.");
      if (matteLayerIndex > comp.numLayers) throw new Error("Matte layer index " + matteLayerIndex + " is out of range for comp with " + comp.numLayers + " layers.");
      var layer = comp.layer(layerIndex);
      var matteLayer = comp.layer(matteLayerIndex);
      if (!layer) throw new Error("Layer not found at index " + layerIndex + ".");
      if (!matteLayer) throw new Error("Matte layer not found at index " + matteLayerIndex + ".");
      if (layer === matteLayer) throw new Error("Layer cannot use itself as a track matte.");
      if (layer.locked) throw new Error("Layer is locked.");
      if (expectedLayerName && layer.name !== expectedLayerName) {
        throw new Error("Layer name mismatch at index " + layerIndex + ". Expected '" + expectedLayerName + "' but found '" + layer.name + "'.");
      }
      if (expectedMatteLayerName && matteLayer.name !== expectedMatteLayerName) {
        throw new Error("Matte layer name mismatch at index " + matteLayerIndex + ". Expected '" + expectedMatteLayerName + "' but found '" + matteLayer.name + "'.");
      }

      var before = __codexLayerInfo(layer);
      var matteBefore = __codexLayerInfo(matteLayer);
      var targetType = __codexTrackMatteTypeValue(trackMatteTypeName);

      app.beginUndoGroup("Codex Set Layer Track Matte");
      try {
        if (typeof layer.setTrackMatte === "function") {
          layer.setTrackMatte(matteLayer, targetType);
        } else {
          if (matteLayer.index !== layer.index - 1) {
            throw new Error("This After Effects version requires the matte layer to be immediately above the fill layer for legacy trackMatteType assignment.");
          }
          layer.trackMatteType = targetType;
        }
      } finally {
        app.endUndoGroup();
      }

      var after = __codexLayerInfo(layer);
      var matteAfter = __codexLayerInfo(matteLayer);
      var afterMatteLayer = after.trackMatteLayer || null;
      var matteLayerMatches = afterMatteLayer && afterMatteLayer.index === matteAfter.index && afterMatteLayer.name === matteAfter.name;
      var typeMatches = after.trackMatteTypeName === trackMatteTypeName;
      var hasTrackMatteMatches = after.hasTrackMatte === true;
      var matteRoleMatches = matteAfter.isTrackMatte === true || matteLayerMatches;
      return {
        comp: {
          itemIndex: __codexProjectIndexForItem(comp),
          name: comp.name,
          time: comp.time,
          numLayers: comp.numLayers
        },
        layer: after,
        matteLayer: matteAfter,
        before: before,
        matteBefore: matteBefore,
        requestedLayerIndex: layerIndex,
        requestedMatteLayerIndex: matteLayerIndex,
        requestedTrackMatteType: trackMatteTypeName,
        expectedLayerName: expectedLayerName || null,
        expectedMatteLayerName: expectedMatteLayerName || null,
        postVerification: {
          ok: hasTrackMatteMatches && matteLayerMatches && typeMatches,
          hasTrackMatteMatches: hasTrackMatteMatches,
          matteLayerMatches: matteLayerMatches,
          trackMatteTypeMatches: typeMatches,
          matteRoleMatches: matteRoleMatches,
          layerNameMatches: !expectedLayerName || after.name === expectedLayerName,
          matteLayerNameMatches: !expectedMatteLayerName || matteAfter.name === expectedMatteLayerName
        }
      };
    `);
    return toolResult(result.result);
  }

  if (name === "get_selected_properties") {
    const includeValues = optionalBoolean(args, "includeValues", true);
    const includeExpressions = optionalBoolean(args, "includeExpressions", true);

    const result = await runExtendScriptBody(`
      ${resolveCompScript}
      var comp = app.project.activeItem;
      if (!(comp instanceof CompItem)) {
        throw new Error("Active item is not a composition.");
      }
      var includeValues = ${includeValues ? "true" : "false"};
      var includeExpressions = ${includeExpressions ? "true" : "false"};

      var properties = [];
      try {
        if (comp.selectedProperties) {
          for (var i = 0; i < comp.selectedProperties.length; i++) {
            var prop = comp.selectedProperties[i];
            var ownerLayer = null;
            try {
              var parent = prop;
              while (parent && !(parent instanceof Layer)) {
                parent = parent.parentProperty;
              }
              ownerLayer = parent instanceof Layer ? parent : null;
            } catch (__ownerError) {}
            if (!ownerLayer) {
              try {
                for (var layerIndex = 1; layerIndex <= comp.numLayers && !ownerLayer; layerIndex++) {
                  var candidateLayer = comp.layer(layerIndex);
                  var candidateProps = candidateLayer.selectedProperties || [];
                  for (var candidateIndex = 0; candidateIndex < candidateProps.length; candidateIndex++) {
                    if (candidateProps[candidateIndex] === prop) {
                      ownerLayer = candidateLayer;
                      break;
                    }
                  }
                }
              } catch (__ownerScanError) {}
            }
            if (!ownerLayer && comp.selectedLayers && comp.selectedLayers.length === 1) {
              ownerLayer = comp.selectedLayers[0];
            }
            properties.push(__codexPropertyInfo(prop, ownerLayer, includeValues, includeExpressions));
          }
        }
      } catch (__selectedPropertiesError) {}

      if (properties.length === 0) {
        for (var l = 0; l < comp.selectedLayers.length; l++) {
          var layer = comp.selectedLayers[l];
          var selectedProps = layer.selectedProperties || [];
          for (var p = 0; p < selectedProps.length; p++) {
            properties.push(__codexPropertyInfo(selectedProps[p], layer, includeValues, includeExpressions));
          }
        }
      }

      return {
        comp: {
          itemIndex: __codexProjectIndexForItem(comp),
          name: comp.name,
          time: comp.time
        },
        selectedProperties: properties
      };
    `);
    return toolResult(result.result);
  }

  if (name === "find_comps") {
    const query = optionalString(args, "query", "").toLowerCase();
    const limit = Math.max(1, Math.min(250, Math.floor(optionalNumber(args, "limit", 25))));
    const result = await runExtendScriptBody(`
      var query = ${aeLiteral(query)};
      var limit = ${limit};
      var comps = [];
      for (var i = 1; i <= app.project.numItems; i++) {
        var item = app.project.item(i);
        if (item instanceof CompItem && item.name.toLowerCase().indexOf(query) !== -1) {
          comps.push({
            itemIndex: i,
            name: item.name,
            width: item.width,
            height: item.height,
            duration: item.duration,
            frameRate: item.frameRate,
            numLayers: item.numLayers
          });
          if (comps.length >= limit) break;
        }
      }
      return comps;
    `);
    return toolResult(result.result);
  }

  if (name === "create_text_layer") {
    const compItemIndex = optionalPositiveInteger(args, "compItemIndex");
    const compName = optionalString(args, "compName", "");
    const text = optionalString(args, "text", "");
    if (!text) return toolResult("text is required.", true);

    const layerName = optionalString(args, "name", "");
    const position = optionalNumberArray(args, "position", null, 2, 3);
    const fontSize = optionalNumber(args, "fontSize", null);
    const fillColor = optionalNumberArray(args, "fillColor", null, 3, 3);
    const startTime = optionalNumber(args, "startTime", null);
    const duration = optionalNumber(args, "duration", null);

    if (fontSize !== null && fontSize <= 0) return toolResult("fontSize must be greater than 0.", true);
    if (duration !== null && duration <= 0) return toolResult("duration must be greater than 0.", true);
    if (fillColor && fillColor.some((value) => value < 0 || value > 1)) {
      return toolResult("fillColor values must be between 0 and 1.", true);
    }

    const result = await runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${aeLiteral(compName)});
      var textValue = ${aeLiteral(text)};
      var layerName = ${aeLiteral(layerName)};
      var requestedPosition = ${position ? aeLiteral(position) : "null"};
      var requestedFontSize = ${fontSize === null ? "null" : fontSize};
      var requestedFillColor = ${fillColor ? aeLiteral(fillColor) : "null"};
      var requestedStartTime = ${startTime === null ? "null" : startTime};
      var requestedDuration = ${duration === null ? "null" : duration};

      app.beginUndoGroup("Codex Create Text Layer");
      var layer = comp.layers.addText(textValue);
      if (layerName) layer.name = layerName;

      var textProp = layer.property("ADBE Text Properties").property("ADBE Text Document");
      var textDocument = textProp.value;
      if (requestedFontSize !== null) textDocument.fontSize = requestedFontSize;
      if (requestedFillColor !== null) {
        textDocument.applyFill = true;
        textDocument.fillColor = requestedFillColor;
      }
      textProp.setValue(textDocument);

      var transform = layer.property("ADBE Transform Group");
      var positionProp = transform.property("ADBE Position");
      var finalPosition = requestedPosition || [comp.width / 2, comp.height / 2];
      positionProp.setValue(finalPosition);

      if (requestedStartTime !== null) {
        layer.startTime = requestedStartTime;
        layer.inPoint = requestedStartTime;
      }
      if (requestedDuration !== null) {
        var baseTime = requestedStartTime !== null ? requestedStartTime : layer.inPoint;
        layer.outPoint = Math.min(baseTime + requestedDuration, comp.duration);
      }

      var response = {
        comp: {
          itemIndex: __codexProjectIndexForItem(comp),
          name: comp.name
        },
        layer: __codexLayerInfo(layer),
        text: textValue
      };
      app.endUndoGroup();
      return response;
    `);
    return toolResult(result.result);
  }

  if (name === "create_shapes_from_text") {
    const compItemIndex = optionalPositiveInteger(args, "compItemIndex");
    const compName = optionalString(args, "compName", "");
    const layerIndex = requiredPositiveInteger(args, "layerIndex");
    const expectedLayerName = optionalString(args, "expectedLayerName", "");
    const expectedSourceText = hasArg(args, "expectedSourceText") ? String(args.expectedSourceText) : null;
    const shapeLayerName = optionalString(args, "shapeLayerName", "");
    const lockCreatedShapeLayer = optionalBoolean(args, "lockCreatedShapeLayer", false);
    const makeActive = optionalBoolean(args, "makeActive", true);

    if (compItemIndex === null && !compName) return toolResult("compItemIndex or compName is required for create_shapes_from_text.", true);

    const result = await runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${aeLiteral(compName)});
      var sourceLayerIndex = ${layerIndex};
      var expectedLayerName = ${aeLiteral(expectedLayerName)};
      var expectedSourceText = ${expectedSourceText === null ? "null" : aeLiteral(expectedSourceText)};
      var requestedShapeLayerName = ${aeLiteral(shapeLayerName)};
      var lockCreatedShapeLayer = ${lockCreatedShapeLayer ? "true" : "false"};
      var makeActive = ${makeActive ? "true" : "false"};
      var menuCommandName = "Create Shapes from Text";

      function __codexLayerIdKey(layer) {
        try {
          if (layer && layer.id !== undefined && layer.id !== null) return String(layer.id);
        } catch (__layerIdError) {}
        return null;
      }

      function __codexSelectedLayerRefs(targetComp) {
        var selected = [];
        for (var __s = 0; __s < targetComp.selectedLayers.length; __s++) {
          var item = targetComp.selectedLayers[__s];
          selected.push({ index: item.index, id: __codexLayerIdKey(item), name: item.name });
        }
        return selected;
      }

      function __codexIsTextLayer(layer) {
        if (!layer) return false;
        try { if (layer instanceof TextLayer) return true; } catch (__textLayerClassError) {}
        try { return !!layer.property("ADBE Text Properties").property("ADBE Text Document"); } catch (__textLayerPropError) {}
        return false;
      }

      function __codexIsShapeLayer(layer) {
        if (!layer) return false;
        try { if (layer instanceof ShapeLayer) return true; } catch (__shapeLayerClassError) {}
        try { return layer.matchName === "ADBE Vector Layer" || !!layer.property("ADBE Root Vectors Group"); } catch (__shapeLayerPropError) {}
        return false;
      }

      function __codexSourceTextString(layer) {
        try {
          var textProp = layer.property("ADBE Text Properties").property("ADBE Text Document");
          var doc = textProp.value;
          return doc && doc.text !== undefined && doc.text !== null ? String(doc.text) : "";
        } catch (__sourceTextError) {
          return "";
        }
      }

      function __codexVectorGroupCount(layer) {
        try {
          var root = layer.property("ADBE Root Vectors Group");
          return root ? root.numProperties : 0;
        } catch (__vectorGroupError) {
          return 0;
        }
      }

      function __codexFindLayerById(targetComp, idKey) {
        if (!idKey) return null;
        for (var __l = 1; __l <= targetComp.numLayers; __l++) {
          var candidate = targetComp.layer(__l);
          if (__codexLayerIdKey(candidate) === idKey) return candidate;
        }
        return null;
      }

      var sourceLayer = comp.layer(sourceLayerIndex);
      if (!sourceLayer) throw new Error("Layer not found at index " + sourceLayerIndex + ".");
      if (sourceLayer.locked) throw new Error("Source text layer is locked.");
      if (!__codexIsTextLayer(sourceLayer)) throw new Error("Layer at index " + sourceLayerIndex + " is not a text layer.");
      if (expectedLayerName && sourceLayer.name !== expectedLayerName) {
        throw new Error("Source layer name mismatch. Expected '" + expectedLayerName + "' but found '" + sourceLayer.name + "'.");
      }
      var sourceTextBefore = __codexSourceTextString(sourceLayer);
      if (expectedSourceText !== null && sourceTextBefore !== expectedSourceText) {
        throw new Error("Source Text mismatch. Expected '" + expectedSourceText + "' but found '" + sourceTextBefore + "'.");
      }

      var commandId = app.findMenuCommandId(menuCommandName);
      if (!commandId) {
        throw new Error("AE menu command not available: " + menuCommandName + ".");
      }

      var beforeLayerCount = comp.numLayers;
      var beforeIds = {};
      for (var __before = 1; __before <= comp.numLayers; __before++) {
        var beforeLayer = comp.layer(__before);
        var beforeId = __codexLayerIdKey(beforeLayer);
        if (beforeId) beforeIds[beforeId] = true;
      }
      var sourceLayerId = __codexLayerIdKey(sourceLayer);
      var selectedBefore = __codexSelectedLayerRefs(comp);
      var response = null;

      app.beginUndoGroup("Codex Create Shapes From Text");
      try {
        if (makeActive && comp.openInViewer) comp.openInViewer();
        for (var __clear = 1; __clear <= comp.numLayers; __clear++) {
          comp.layer(__clear).selected = false;
        }
        sourceLayer.selected = true;
        app.executeCommand(commandId);

        var createdLayers = [];
        for (var __after = 1; __after <= comp.numLayers; __after++) {
          var afterLayer = comp.layer(__after);
          var afterId = __codexLayerIdKey(afterLayer);
          if (afterId && !beforeIds[afterId]) createdLayers.push(afterLayer);
        }
        if (!createdLayers.length && comp.numLayers > beforeLayerCount) {
          for (var __delta = 1; __delta <= comp.numLayers - beforeLayerCount; __delta++) {
            createdLayers.push(comp.layer(__delta));
          }
        }

        var createdShapeLayer = null;
        for (var __created = 0; __created < createdLayers.length; __created++) {
          if (__codexIsShapeLayer(createdLayers[__created])) {
            createdShapeLayer = createdLayers[__created];
            break;
          }
        }
        if (!createdShapeLayer) {
          throw new Error("Create Shapes from Text did not produce a detectable shape layer.");
        }
        if (requestedShapeLayerName) createdShapeLayer.name = requestedShapeLayerName;
        if (lockCreatedShapeLayer) createdShapeLayer.locked = true;

        var sourceAfter = __codexFindLayerById(comp, sourceLayerId);
        if (!sourceAfter && expectedLayerName) {
          for (var __sourceSearch = 1; __sourceSearch <= comp.numLayers; __sourceSearch++) {
            var sourceCandidate = comp.layer(__sourceSearch);
            if (sourceCandidate.name === expectedLayerName && __codexIsTextLayer(sourceCandidate)) {
              sourceAfter = sourceCandidate;
              break;
            }
          }
        }
        var selectedAfter = __codexSelectedLayerRefs(comp);
        var outlineGroupCount = __codexVectorGroupCount(createdShapeLayer);

        response = {
          comp: { itemIndex: __codexProjectIndexForItem(comp), name: comp.name, numLayers: comp.numLayers },
          menuCommand: { name: menuCommandName, id: commandId },
          sourceLayerBefore: {
            index: sourceLayerIndex,
            id: sourceLayerId,
            name: expectedLayerName || sourceLayer.name,
            text: sourceTextBefore
          },
          sourceLayerAfter: sourceAfter ? __codexLayerInfo(sourceAfter) : null,
          shapeLayer: __codexLayerInfo(createdShapeLayer),
          outline: { vectorGroupCount: outlineGroupCount },
          selectedBefore: selectedBefore,
          selectedAfter: selectedAfter,
          layerCountBefore: beforeLayerCount,
          layerCountAfter: comp.numLayers,
          createdLayerCount: createdLayers.length,
          postVerification: {
            ok: __codexIsShapeLayer(createdShapeLayer) && outlineGroupCount > 0 && comp.numLayers > beforeLayerCount,
            createdShapeLayer: __codexIsShapeLayer(createdShapeLayer),
            outlineGroupCount: outlineGroupCount,
            layerCountDelta: comp.numLayers - beforeLayerCount,
            sourceTextMatched: expectedSourceText === null || sourceTextBefore === expectedSourceText,
            sourceNameMatched: !expectedLayerName || (sourceAfter && sourceAfter.name === expectedLayerName) || sourceLayer.name === expectedLayerName
          }
        };
      } finally {
        app.endUndoGroup();
      }
      return response;
    `);
    return toolResult(result.result);
  }

  if (name === "import_footage") {
    let resolved;
    try {
      resolved = resolveExistingFile(args.filePath);
    } catch (error) {
      return toolResult(error.message, true);
    }

    const itemName = optionalString(args, "name", "");
    const sequence = optionalBoolean(args, "sequence", false);

    const result = await runExtendScriptBody(`
      ${resolveCompScript}
      var importPath = ${aeLiteral(resolved.resolvedPath)};
      var requestedName = ${aeLiteral(itemName)};
      var importAsSequence = ${sequence ? "true" : "false"};
      var file = new File(importPath);
      if (!file.exists) throw new Error("Footage file does not exist: " + importPath);

      var options = new ImportOptions(file);
      options.sequence = importAsSequence;
      if (!options.canImportAs(ImportAsType.FOOTAGE)) {
        throw new Error("File cannot be imported as footage: " + importPath);
      }
      options.importAs = ImportAsType.FOOTAGE;

      app.beginUndoGroup("Codex Import Footage");
      var item = app.project.importFile(options);
      if (requestedName) item.name = requestedName;

      var response = {
        item: __codexItemReference(item),
        footage: {
          file: item.file ? item.file.fsName : importPath,
          width: item.width || null,
          height: item.height || null,
          duration: item.duration || null,
          frameRate: item.frameRate || null,
          hasAudio: item.hasAudio || false,
          hasVideo: item.hasVideo || false
        },
        sequence: importAsSequence
      };
      app.endUndoGroup();
      return response;
    `);
    return toolResult(result.result);
  }

  if (name === "create_solid_layer") {
    const compItemIndex = optionalPositiveInteger(args, "compItemIndex");
    const compName = optionalString(args, "compName", "");
    const layerName = optionalString(args, "name", "Codex Solid");
    const color = optionalNumberArray(args, "color", [0, 0, 0], 3, 3);
    const width = optionalNumber(args, "width", null);
    const height = optionalNumber(args, "height", null);
    const pixelAspect = optionalNumber(args, "pixelAspect", null);
    const startTime = optionalNumber(args, "startTime", null);
    const duration = optionalNumber(args, "duration", null);
    const insertBeforeLayerIndex = optionalPositiveInteger(args, "insertBeforeLayerIndex");
    const expectedBeforeLayerName = optionalString(args, "expectedBeforeLayerName", "");

    if (color.some((value) => value < 0 || value > 1)) return toolResult("color values must be between 0 and 1.", true);
    if (width !== null && width <= 0) return toolResult("width must be greater than 0.", true);
    if (height !== null && height <= 0) return toolResult("height must be greater than 0.", true);
    if (pixelAspect !== null && pixelAspect <= 0) return toolResult("pixelAspect must be greater than 0.", true);
    if (duration !== null && duration <= 0) return toolResult("duration must be greater than 0.", true);

    const result = await runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${aeLiteral(compName)});
      var layerName = ${aeLiteral(layerName)};
      var color = ${aeLiteral(color)};
      var width = ${width === null ? "comp.width" : width};
      var height = ${height === null ? "comp.height" : height};
      var pixelAspect = ${pixelAspect === null ? "comp.pixelAspect" : pixelAspect};
      var requestedStartTime = ${startTime === null ? "null" : startTime};
      var requestedDuration = ${duration === null ? "comp.duration" : duration};

      app.beginUndoGroup("Codex Create Solid Layer");
      var layer = comp.layers.addSolid(color, layerName, width, height, pixelAspect, requestedDuration);
      if (requestedStartTime !== null) {
        layer.startTime = requestedStartTime;
        layer.inPoint = requestedStartTime;
      }
      if (requestedDuration !== null) {
        var baseTime = requestedStartTime !== null ? requestedStartTime : layer.inPoint;
        layer.outPoint = Math.min(baseTime + requestedDuration, comp.duration);
      }
      var response = {
        comp: {
          itemIndex: __codexProjectIndexForItem(comp),
          name: comp.name
        },
        layer: __codexLayerInfo(layer),
        solid: {
          color: color,
          width: width,
          height: height,
          pixelAspect: pixelAspect
        }
      };
      app.endUndoGroup();
      return response;
    `);
    return toolResult(result.result);
  }

  if (name === "create_null_layer") {
    const compItemIndex = optionalPositiveInteger(args, "compItemIndex");
    const compName = optionalString(args, "compName", "");
    const layerName = optionalString(args, "name", "Codex Null");
    const startTime = optionalNumber(args, "startTime", null);
    const duration = optionalNumber(args, "duration", null);

    if (duration !== null && duration <= 0) return toolResult("duration must be greater than 0.", true);

    const result = await runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${aeLiteral(compName)});
      var layerName = ${aeLiteral(layerName)};
      var requestedStartTime = ${startTime === null ? "null" : startTime};
      var requestedDuration = ${duration === null ? "comp.duration" : duration};

      app.beginUndoGroup("Codex Create Null Layer");
      var layer = comp.layers.addNull(requestedDuration);
      if (layerName) {
        layer.name = layerName;
        try { if (layer.source) layer.source.name = layerName; } catch (__sourceNameError) {}
      }
      if (requestedStartTime !== null) {
        layer.startTime = requestedStartTime;
        layer.inPoint = requestedStartTime;
      }
      if (requestedDuration !== null) {
        var baseTime = requestedStartTime !== null ? requestedStartTime : layer.inPoint;
        layer.outPoint = Math.min(baseTime + requestedDuration, comp.duration);
      }
      var response = {
        comp: {
          itemIndex: __codexProjectIndexForItem(comp),
          name: comp.name
        },
        layer: __codexLayerInfo(layer)
      };
      app.endUndoGroup();
      return response;
    `);
    return toolResult(result.result);
  }

  if (name === "create_adjustment_layer") {
    const compItemIndex = optionalPositiveInteger(args, "compItemIndex");
    const compName = optionalString(args, "compName", "");
    const layerName = optionalString(args, "name", "Codex Adjustment");
    const color = optionalNumberArray(args, "color", [1, 1, 1], 3, 3);
    const width = optionalNumber(args, "width", null);
    const height = optionalNumber(args, "height", null);
    const pixelAspect = optionalNumber(args, "pixelAspect", null);
    const startTime = optionalNumber(args, "startTime", null);
    const duration = optionalNumber(args, "duration", null);

    if (color.some((value) => value < 0 || value > 1)) return toolResult("color values must be between 0 and 1.", true);
    if (width !== null && width <= 0) return toolResult("width must be greater than 0.", true);
    if (height !== null && height <= 0) return toolResult("height must be greater than 0.", true);
    if (pixelAspect !== null && pixelAspect <= 0) return toolResult("pixelAspect must be greater than 0.", true);
    if (duration !== null && duration <= 0) return toolResult("duration must be greater than 0.", true);

    const result = await runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${aeLiteral(compName)});
      var layerName = ${aeLiteral(layerName)};
      var color = ${aeLiteral(color)};
      var width = ${width === null ? "comp.width" : width};
      var height = ${height === null ? "comp.height" : height};
      var pixelAspect = ${pixelAspect === null ? "comp.pixelAspect" : pixelAspect};
      var requestedStartTime = ${startTime === null ? "null" : startTime};
      var requestedDuration = ${duration === null ? "comp.duration" : duration};
      var insertBeforeLayerIndex = ${insertBeforeLayerIndex === null ? "null" : insertBeforeLayerIndex};
      var expectedBeforeLayerName = ${aeLiteral(expectedBeforeLayerName)};
      var beforeLayer = null;
      var beforeLayerBeforeMove = null;
      if (insertBeforeLayerIndex !== null) {
        if (insertBeforeLayerIndex < 1 || insertBeforeLayerIndex > comp.numLayers) {
          throw new Error("insertBeforeLayerIndex does not identify a layer in the target comp.");
        }
        beforeLayer = comp.layer(insertBeforeLayerIndex);
        if (expectedBeforeLayerName && beforeLayer.name !== expectedBeforeLayerName) {
          throw new Error("expectedBeforeLayerName mismatch for insertBeforeLayerIndex.");
        }
        beforeLayerBeforeMove = __codexLayerInfo(beforeLayer);
      }

      app.beginUndoGroup("Codex Create Adjustment Layer");
      var layer = comp.layers.addSolid(color, layerName, width, height, pixelAspect, requestedDuration);
      layer.adjustmentLayer = true;
      if (requestedStartTime !== null) {
        layer.startTime = requestedStartTime;
        layer.inPoint = requestedStartTime;
      }
      if (requestedDuration !== null) {
        var baseTime = requestedStartTime !== null ? requestedStartTime : layer.inPoint;
        layer.outPoint = Math.min(baseTime + requestedDuration, comp.duration);
      }
      if (beforeLayer !== null) {
        layer.moveBefore(beforeLayer);
      }
      var response = {
        comp: {
          itemIndex: __codexProjectIndexForItem(comp),
          name: comp.name
        },
        layer: __codexLayerInfo(layer),
        placement: {
          insertBeforeLayerIndex: insertBeforeLayerIndex,
          expectedBeforeLayerName: expectedBeforeLayerName,
          beforeLayerBeforeMove: beforeLayerBeforeMove,
          beforeLayerAfterMove: beforeLayer !== null ? __codexLayerInfo(beforeLayer) : null,
          immediatelyBefore: beforeLayer !== null ? (layer.index + 1 === beforeLayer.index) : null
        },
        solid: {
          color: color,
          width: width,
          height: height,
          pixelAspect: pixelAspect
        }
      };
      app.endUndoGroup();
      return response;
    `);
    return toolResult(result.result);
  }

  if (name === "create_camera_layer") {
    const compItemIndex = optionalPositiveInteger(args, "compItemIndex");
    const compName = optionalString(args, "compName", "");
    const layerName = optionalString(args, "name", "Codex Camera");
    const pointOfInterest = optionalNumberArray(args, "pointOfInterest", null, 2, 3);
    const position = optionalNumberArray(args, "position", null, 3, 3);
    const zoom = optionalNumber(args, "zoom", null);
    const startTime = optionalNumber(args, "startTime", null);
    const duration = optionalNumber(args, "duration", null);
    const coordinateLimit = 1000000;

    if (pointOfInterest && pointOfInterest.some((value) => Math.abs(value) > coordinateLimit)) {
      return toolResult("pointOfInterest values must be between -1000000 and 1000000.", true);
    }
    if (position && position.some((value) => Math.abs(value) > coordinateLimit)) {
      return toolResult("position values must be between -1000000 and 1000000.", true);
    }
    if (zoom !== null && zoom <= 0) return toolResult("zoom must be greater than 0.", true);
    if (duration !== null && duration <= 0) return toolResult("duration must be greater than 0.", true);

    const result = await runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${aeLiteral(compName)});
      var layerName = ${aeLiteral(layerName)};
      var requestedPointOfInterest = ${pointOfInterest ? aeLiteral(pointOfInterest) : "null"};
      var requestedPosition = ${position ? aeLiteral(position) : "null"};
      var requestedZoom = ${zoom === null ? "null" : zoom};
      var requestedStartTime = ${startTime === null ? "null" : startTime};
      var requestedDuration = ${duration === null ? "null" : duration};

      function __codexCameraPoint3(value) {
        if (!value) return null;
        return value.length >= 3 ? value : [value[0], value[1], 0];
      }

      function __codexReadValue(prop) {
        try {
          if (!prop) return null;
          var value = prop.value;
          if (value instanceof Array) {
            var copy = [];
            for (var __v = 0; __v < value.length; __v++) copy.push(value[__v]);
            return copy;
          }
          return value;
        } catch (__readValueError) {
          return null;
        }
      }

      app.beginUndoGroup("Codex Create Camera Layer");
      var centerPoint = requestedPointOfInterest ? [requestedPointOfInterest[0], requestedPointOfInterest[1]] : [comp.width / 2, comp.height / 2];
      var layer = comp.layers.addCamera(layerName || "Codex Camera", centerPoint);
      if (layerName) layer.name = layerName;

      var transform = layer.property("ADBE Transform Group");
      if (requestedPointOfInterest !== null) {
        var pointProp = transform.property("ADBE Point of Interest") || transform.property("ADBE Anchor Point");
        if (pointProp) pointProp.setValue(__codexCameraPoint3(requestedPointOfInterest));
      }
      if (requestedPosition !== null) transform.property("ADBE Position").setValue(requestedPosition);

      var cameraOptions = layer.property("ADBE Camera Options Group");
      if (requestedZoom !== null && cameraOptions) {
        var zoomProp = cameraOptions.property("ADBE Camera Zoom");
        if (zoomProp) zoomProp.setValue(requestedZoom);
      }
      if (requestedStartTime !== null) {
        layer.startTime = requestedStartTime;
        layer.inPoint = requestedStartTime;
      }
      if (requestedDuration !== null) {
        var baseTime = requestedStartTime !== null ? requestedStartTime : layer.inPoint;
        layer.outPoint = Math.min(baseTime + requestedDuration, comp.duration);
      }
      var response = {
        comp: {
          itemIndex: __codexProjectIndexForItem(comp),
          name: comp.name
        },
        layer: __codexLayerInfo(layer),
        camera: {
          pointOfInterest: transform ? __codexReadValue(transform.property("ADBE Point of Interest") || transform.property("ADBE Anchor Point")) : null,
          position: transform ? __codexReadValue(transform.property("ADBE Position")) : null,
          zoom: cameraOptions ? __codexReadValue(cameraOptions.property("ADBE Camera Zoom")) : null
        }
      };
      app.endUndoGroup();
      return response;
    `);
    return toolResult(result.result);
  }

  if (name === "create_camera_with_controller") {
    const compItemIndex = optionalPositiveInteger(args, "compItemIndex");
    const compName = optionalString(args, "compName", "");
    const cameraName = optionalString(args, "cameraName", "Camera 1");
    const controllerName = optionalString(args, "controllerName", "Camera Controller");
    const pointOfInterest = optionalNumberArray(args, "pointOfInterest", null, 2, 3);
    const cameraPosition = optionalNumberArray(args, "cameraPosition", null, 3, 3);
    const zoom = optionalNumber(args, "zoom", null);
    const startTime = optionalNumber(args, "startTime", null);
    const duration = optionalNumber(args, "duration", null);
    const separateControllerPositionDimensions = optionalBoolean(args, "separateControllerPositionDimensions", true);
    const coordinateLimit = 1000000;

    if (pointOfInterest && pointOfInterest.some((value) => Math.abs(value) > coordinateLimit)) {
      return toolResult("pointOfInterest values must be between -1000000 and 1000000.", true);
    }
    if (cameraPosition && cameraPosition.some((value) => Math.abs(value) > coordinateLimit)) {
      return toolResult("cameraPosition values must be between -1000000 and 1000000.", true);
    }
    if (zoom !== null && zoom <= 0) return toolResult("zoom must be greater than 0.", true);
    if (duration !== null && duration <= 0) return toolResult("duration must be greater than 0.", true);

    const result = await runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${aeLiteral(compName)});
      var cameraName = ${aeLiteral(cameraName)};
      var controllerName = ${aeLiteral(controllerName)};
      var requestedPointOfInterest = ${pointOfInterest ? aeLiteral(pointOfInterest) : "null"};
      var requestedCameraPosition = ${cameraPosition ? aeLiteral(cameraPosition) : "null"};
      var requestedZoom = ${zoom === null ? "null" : zoom};
      var requestedStartTime = ${startTime === null ? "null" : startTime};
      var requestedDuration = ${duration === null ? "comp.duration" : duration};
      var shouldSeparateControllerPosition = ${separateControllerPositionDimensions ? "true" : "false"};

      function __codexCameraPoint3(value) {
        if (!value) return null;
        return value.length >= 3 ? value : [value[0], value[1], 0];
      }

      function __codexReadRawValue(prop) {
        try {
          if (!prop) return null;
          return __codexValueData(prop.value);
        } catch (__readRawValueError) {
          return null;
        }
      }

      function __codexApplyLayerTiming(layer) {
        if (requestedStartTime !== null) {
          layer.startTime = requestedStartTime;
          layer.inPoint = requestedStartTime;
        }
        if (requestedDuration !== null) {
          var baseTime = requestedStartTime !== null ? requestedStartTime : layer.inPoint;
          layer.outPoint = Math.min(baseTime + requestedDuration, comp.duration);
        }
      }

      app.beginUndoGroup("Codex Create Camera With Controller");
      var centerPoint = requestedPointOfInterest ? [requestedPointOfInterest[0], requestedPointOfInterest[1]] : [comp.width / 2, comp.height / 2];
      var cameraLayer = comp.layers.addCamera(cameraName || "Camera 1", centerPoint);
      var controllerLayer = comp.layers.addNull(requestedDuration || comp.duration);
      if (cameraName) cameraLayer.name = cameraName;
      if (controllerName) {
        controllerLayer.name = controllerName;
        try { if (controllerLayer.source) controllerLayer.source.name = controllerName; } catch (__controllerSourceNameError) {}
      }
      controllerLayer.threeDLayer = true;
      cameraLayer.parent = controllerLayer;

      var cameraTransform = cameraLayer.property("ADBE Transform Group");
      var controllerTransform = controllerLayer.property("ADBE Transform Group");
      var cameraPosition = requestedCameraPosition || [0, 0, (comp.width / 0.72) * -1];
      if (requestedPointOfInterest !== null) {
        var pointProp = cameraTransform.property("ADBE Point of Interest") || cameraTransform.property("ADBE Anchor Point");
        if (pointProp) pointProp.setValue(__codexCameraPoint3(requestedPointOfInterest));
      }
      cameraTransform.property("ADBE Position").setValue(cameraPosition);
      if (shouldSeparateControllerPosition && controllerTransform) {
        var controllerPosition = controllerTransform.property("ADBE Position");
        if (controllerPosition) {
          try { controllerPosition.dimensionsSeparated = true; } catch (__separateControllerPositionError) {}
        }
      }
      var cameraOptions = cameraLayer.property("ADBE Camera Options Group");
      if (requestedZoom !== null && cameraOptions) {
        var zoomProp = cameraOptions.property("ADBE Camera Zoom");
        if (zoomProp) zoomProp.setValue(requestedZoom);
      }
      __codexApplyLayerTiming(cameraLayer);
      __codexApplyLayerTiming(controllerLayer);

      var controllerPositionProp = controllerTransform ? controllerTransform.property("ADBE Position") : null;
      var response = {
        comp: { itemIndex: __codexProjectIndexForItem(comp), name: comp.name },
        cameraLayer: __codexLayerInfo(cameraLayer),
        controllerLayer: __codexLayerInfo(controllerLayer),
        camera: {
          pointOfInterest: cameraTransform ? __codexReadRawValue(cameraTransform.property("ADBE Point of Interest") || cameraTransform.property("ADBE Anchor Point")) : null,
          position: cameraTransform ? __codexReadRawValue(cameraTransform.property("ADBE Position")) : null,
          zoom: cameraOptions ? __codexReadRawValue(cameraOptions.property("ADBE Camera Zoom")) : null
        },
        controller: {
          threeDLayer: controllerLayer.threeDLayer === true,
          positionDimensionsSeparated: controllerPositionProp ? controllerPositionProp.dimensionsSeparated === true : false
        }
      };
      app.endUndoGroup();
      return response;
    `);
    return toolResult(result.result);
  }

  if (name === "toggle_onion_skinning") {
    const compItemIndex = optionalPositiveInteger(args, "compItemIndex");
    const compName = optionalString(args, "compName", "");
    const mode = optionalString(args, "mode", "toggle");
    const layerName = optionalString(args, "layerName", "Onion Skin");
    const effectName = optionalString(args, "effectName", "Onion Skin");

    if (!["enable", "disable", "toggle"].includes(mode)) return toolResult("mode must be one of: enable, disable, toggle.", true);

    const result = await runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${aeLiteral(compName)});
      var mode = ${aeLiteral(mode)};
      var layerName = ${aeLiteral(layerName)};
      var effectName = ${aeLiteral(effectName)};
      var token = "*onion-skinning*";

      function __codexFindOnionLayer() {
        for (var __l = 1; __l <= comp.numLayers; __l++) {
          var candidate = comp.layer(__l);
          if (!candidate || candidate.name !== layerName) continue;
          try {
            var parade = candidate.property("ADBE Effect Parade");
            if (parade && (parade.property(effectName) || parade.property("CC Wide Time"))) return candidate;
          } catch (__findEffectError) {}
        }
        return null;
      }

      function __codexDisableOnion() {
        var removed = [];
        var comment = comp.comment || "";
        var parts = comment.split(token);
        comp.comment = parts[0] || "";
        if (parts.length > 1) {
          var id = Number(parts[1]);
          if (id) {
            try {
              var item = app.project.itemByID(id);
              if (item !== null) {
                removed.push(__codexItemReference(item));
                item.remove();
              }
            } catch (__removeSourceError) {}
          }
        }
        var layer = __codexFindOnionLayer();
        if (layer) {
          removed.push(__codexLayerInfo(layer));
          layer.remove();
        }
        return removed;
      }

      app.beginUndoGroup("Codex Toggle Onion Skinning");
      var wasEnabled = String(comp.comment || "").indexOf(token) >= 0 || __codexFindOnionLayer() !== null;
      var shouldEnable = mode === "enable" || (mode === "toggle" && !wasEnabled);
      var response = {
        comp: { itemIndex: __codexProjectIndexForItem(comp), name: comp.name },
        previousEnabled: wasEnabled,
        enabled: false,
        mode: shouldEnable ? "enable" : "disable",
        removed: []
      };

      if (shouldEnable) {
        if (wasEnabled) __codexDisableOnion();
        var layer = comp.layers.addSolid([0, 0, 0], layerName || "Onion Skin", comp.width, comp.height, comp.pixelAspect, comp.duration);
        layer.adjustmentLayer = true;
        try { layer.label = 0; } catch (__labelError) {}
        try { layer.moveToBeginning(); } catch (__moveError) {}
        var sourceId = null;
        try { sourceId = layer.source.id; } catch (__sourceIdError) {}
        comp.comment = String(comp.comment || "") + token + String(sourceId || "");
        var effectGroup = layer.property("ADBE Effect Parade");
        if (!effectGroup) throw new Error("Onion skin layer cannot receive effects.");
        var effect = effectGroup.addProperty("CC Wide Time");
        if (!effect) throw new Error("Could not add CC Wide Time.");
        if (effectName) effect.name = effectName;
        response.enabled = true;
        response.layer = __codexLayerInfo(layer);
        response.effect = __codexPropertyInfo(effect, layer, false, true);
        response.properties = __codexEffectProperties(effect, layer, true, true);
        response.comp.comment = comp.comment || "";
      } else {
        response.removed = __codexDisableOnion();
        response.enabled = false;
        response.comp.comment = comp.comment || "";
      }
      app.endUndoGroup();
      return response;
    `);
    return toolResult(result.result);
  }

  if (name === "add_project_item_to_comp") {
    const compItemIndex = optionalPositiveInteger(args, "compItemIndex");
    const compName = optionalString(args, "compName", "");
    const itemIndex = optionalPositiveInteger(args, "itemIndex");
    const itemName = optionalString(args, "itemName", "");
    const itemType = optionalString(args, "itemType", "");
    const layerName = optionalString(args, "name", "");
    const position = optionalNumberArray(args, "position", null, 2, 3);
    const scale = optionalNumberArray(args, "scale", null, 2, 3);
    const startTime = optionalNumber(args, "startTime", null);
    const duration = optionalNumber(args, "duration", null);

    if (!itemIndex && !itemName) return toolResult("Provide itemIndex or itemName.", true);
    if (itemType && !["comp", "footage"].includes(itemType)) return toolResult("itemType must be one of: comp, footage.", true);
    if (duration !== null && duration <= 0) return toolResult("duration must be greater than 0.", true);

    const result = await runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${aeLiteral(compName)});
      var item = __codexResolveProjectItem(${itemIndex === null ? "null" : itemIndex}, ${aeLiteral(itemName)}, ${aeLiteral(itemType)});
      if (!(item instanceof FootageItem) && !(item instanceof CompItem)) {
        throw new Error("Project item must be footage or a composition.");
      }
      if (item === comp) {
        throw new Error("Cannot add a composition to itself.");
      }
      var layerName = ${aeLiteral(layerName)};
      var positionValue = ${position ? aeLiteral(position) : "null"};
      var scaleValue = ${scale ? aeLiteral(scale) : "null"};
      var requestedStartTime = ${startTime === null ? "null" : startTime};
      var requestedDuration = ${duration === null ? "null" : duration};

      app.beginUndoGroup("Codex Add Project Item To Comp");
      var layer = requestedDuration !== null ? comp.layers.add(item, requestedDuration) : comp.layers.add(item);
      if (layerName) layer.name = layerName;
      if (requestedStartTime !== null) {
        layer.startTime = requestedStartTime;
        layer.inPoint = requestedStartTime;
      }
      if (requestedDuration !== null) {
        var baseTime = requestedStartTime !== null ? requestedStartTime : layer.inPoint;
        layer.outPoint = Math.min(baseTime + requestedDuration, comp.duration);
      }
      var transform = layer.property("ADBE Transform Group");
      if (positionValue !== null) transform.property("ADBE Position").setValue(positionValue);
      if (scaleValue !== null) transform.property("ADBE Scale").setValue(scaleValue);
      var response = {
        comp: {
          itemIndex: __codexProjectIndexForItem(comp),
          name: comp.name
        },
        sourceItem: __codexItemReference(item),
        layer: __codexLayerInfo(layer)
      };
      app.endUndoGroup();
      return response;
    `);
    return toolResult(result.result);
  }

  if (name === "duplicate_comp") {
    const compItemIndex = optionalPositiveInteger(args, "compItemIndex");
    const sourceCompName = optionalString(args, "compName", "");
    const compName = optionalString(args, "name", "");
    const openInViewer = optionalBoolean(args, "openInViewer", true);

    const result = await runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${aeLiteral(sourceCompName)});
      var requestedName = ${aeLiteral(compName)};
      var openInViewer = ${openInViewer ? "true" : "false"};

      app.beginUndoGroup("Codex Duplicate Comp");
      var duplicate = comp.duplicate();
      if (requestedName) duplicate.name = requestedName;
      if (openInViewer) duplicate.openInViewer();
      var response = {
        source: {
          itemIndex: __codexProjectIndexForItem(comp),
          name: comp.name
        },
        duplicate: {
          itemIndex: __codexProjectIndexForItem(duplicate),
          name: duplicate.name,
          width: duplicate.width,
          height: duplicate.height,
          duration: duplicate.duration,
          frameRate: duplicate.frameRate,
          numLayers: duplicate.numLayers
        }
      };
      app.endUndoGroup();
      return response;
    `);
    return toolResult(result.result);
  }

  if (name === "duplicate_layer") {
    const compItemIndex = optionalPositiveInteger(args, "compItemIndex");
    const compName = optionalString(args, "compName", "");
    const layerIndex = requiredPositiveInteger(args, "layerIndex");
    const expectedSourceName = optionalString(args, "sourceName", "");
    const duplicateName = optionalString(args, "name", "");

    const result = await runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${aeLiteral(compName)});
      var sourceLayer = comp.layer(${layerIndex});
      if (!sourceLayer) throw new Error("Layer not found.");
      var expectedSourceName = ${aeLiteral(expectedSourceName)};
      var duplicateName = ${aeLiteral(duplicateName)};
      if (expectedSourceName && sourceLayer.name !== expectedSourceName) {
        throw new Error("Layer name mismatch. Expected '" + expectedSourceName + "' but found '" + sourceLayer.name + "'.");
      }
      if (sourceLayer.locked === true) {
        throw new Error("Layer is locked and cannot be duplicated safely.");
      }

      app.beginUndoGroup("Codex Duplicate Layer");
      var layerCountBefore = comp.numLayers;
      var sourceBefore = __codexLayerInfo(sourceLayer);
      var duplicate = sourceLayer.duplicate();
      if (!duplicate) throw new Error("After Effects did not return a duplicated layer.");
      if (duplicateName) duplicate.name = duplicateName;
      var duplicateInfo = __codexLayerInfo(duplicate);
      var sourceAfter = __codexLayerInfo(sourceLayer);
      var layerCountAfter = comp.numLayers;
      var expectedDuplicateName = duplicateName || duplicateInfo.name;
      var postVerification = {
        ok: layerCountAfter === layerCountBefore + 1 &&
          (!expectedSourceName || sourceBefore.name === expectedSourceName) &&
          (!expectedDuplicateName || duplicateInfo.name === expectedDuplicateName),
        beforeLayerCount: layerCountBefore,
        afterLayerCount: layerCountAfter,
        expectedLayerCountAfter: layerCountBefore + 1,
        layerCountDelta: layerCountAfter - layerCountBefore,
        layerCountMatches: layerCountAfter === layerCountBefore + 1,
        sourceNameMatches: !expectedSourceName || sourceBefore.name === expectedSourceName,
        duplicateNameMatches: !expectedDuplicateName || duplicateInfo.name === expectedDuplicateName
      };
      var response = {
        comp: {
          itemIndex: __codexProjectIndexForItem(comp),
          name: comp.name,
          numLayers: comp.numLayers,
          numLayersBefore: layerCountBefore,
          numLayersAfter: layerCountAfter
        },
        source: sourceBefore,
        sourceAfter: sourceAfter,
        duplicate: duplicateInfo,
        layer: duplicateInfo,
        layerCountBefore: layerCountBefore,
        layerCountAfter: layerCountAfter,
        postVerification: postVerification
      };
      app.endUndoGroup();
      return response;
    `);
    return toolResult(result.result);
  }

  if (name === "duplicate_layers") {
    const compItemIndex = optionalPositiveInteger(args, "compItemIndex");
    const compName = optionalString(args, "compName", "");
    const layerIndices = requiredExplicitPositiveIntegerList(args, "layerIndices");
    const nameSuffix = optionalString(args, "nameSuffix", "");

    let sourceNames = null;
    if (hasArg(args, "sourceNames")) {
      sourceNames = args.sourceNames;
      if (typeof sourceNames === "string" && sourceNames.trim().startsWith("[")) {
        sourceNames = JSON.parse(sourceNames);
      }
      if (!Array.isArray(sourceNames)) {
        return toolResult("sourceNames must be an array when provided.", true);
      }
      sourceNames = sourceNames.map((value) => String(value));
      if (sourceNames.length !== layerIndices.length) {
        return toolResult("sourceNames must have the same length as layerIndices.", true);
      }
    }

    const result = await runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${aeLiteral(compName)});
      var requestedLayerIndices = ${aeLiteral(layerIndices)};
      var expectedSourceNames = ${sourceNames ? aeLiteral(sourceNames) : "null"};
      var nameSuffix = ${aeLiteral(nameSuffix)};
      var layerCountBefore = comp.numLayers;
      var sourceRefs = [];
      var sourceBefore = [];

      for (var __dupIndex = 0; __dupIndex < requestedLayerIndices.length; __dupIndex++) {
        var requestedIndex = requestedLayerIndices[__dupIndex];
        if (requestedIndex > comp.numLayers) {
          throw new Error("Layer index " + requestedIndex + " is out of range for comp with " + comp.numLayers + " layers.");
        }
        var sourceLayer = comp.layer(requestedIndex);
        if (!sourceLayer) throw new Error("Layer not found at index " + requestedIndex + ".");
        if (sourceLayer.locked === true) {
          throw new Error("Layer " + requestedIndex + " is locked and cannot be duplicated safely.");
        }
        if (expectedSourceNames && sourceLayer.name !== expectedSourceNames[__dupIndex]) {
          throw new Error("Layer name mismatch at index " + requestedIndex + ". Expected '" + expectedSourceNames[__dupIndex] + "' but found '" + sourceLayer.name + "'.");
        }
        sourceRefs.push(sourceLayer);
        sourceBefore.push(__codexLayerInfo(sourceLayer));
      }

      var __codexDuplicateLayersUndoOpen = false;
      try {
      app.beginUndoGroup("Codex Duplicate Layers");
      __codexDuplicateLayersUndoOpen = true;
      var pairs = [];
      var duplicates = [];
      for (var __copyIndex = 0; __copyIndex < sourceRefs.length; __copyIndex++) {
        var sourceLayerForCopy = sourceRefs[__copyIndex];
        var duplicate = sourceLayerForCopy.duplicate();
        if (!duplicate) throw new Error("After Effects did not return a duplicated layer for index " + requestedLayerIndices[__copyIndex] + ".");
        if (nameSuffix) duplicate.name = sourceBefore[__copyIndex].name + nameSuffix;
        var duplicateInfo = __codexLayerInfo(duplicate);
        var sourceAfter = __codexLayerInfo(sourceLayerForCopy);
        duplicates.push(duplicateInfo);
        pairs.push({
          requestedLayerIndex: requestedLayerIndices[__copyIndex],
          source: sourceBefore[__copyIndex],
          sourceAfter: sourceAfter,
          duplicate: duplicateInfo
        });
      }
      var layerCountAfter = comp.numLayers;
      var expectedLayerCountAfter = layerCountBefore + requestedLayerIndices.length;
      var sourceNameMatches = true;
      var duplicateNameMatches = true;
      for (var __verifyPairIndex = 0; __verifyPairIndex < pairs.length; __verifyPairIndex++) {
        var pair = pairs[__verifyPairIndex];
        var expectedPairSourceName = expectedSourceNames ? expectedSourceNames[__verifyPairIndex] : sourceBefore[__verifyPairIndex].name;
        var expectedPairDuplicateName = sourceBefore[__verifyPairIndex].name + nameSuffix;
        if (expectedPairSourceName && pair.source.name !== expectedPairSourceName) sourceNameMatches = false;
        if (nameSuffix && pair.duplicate.name !== expectedPairDuplicateName) duplicateNameMatches = false;
      }
      var postVerification = {
        ok: layerCountAfter === expectedLayerCountAfter &&
          pairs.length === requestedLayerIndices.length &&
          sourceNameMatches === true &&
          duplicateNameMatches === true,
        beforeLayerCount: layerCountBefore,
        afterLayerCount: layerCountAfter,
        expectedLayerCountAfter: expectedLayerCountAfter,
        requestedCount: requestedLayerIndices.length,
        duplicateCount: duplicates.length,
        layerCountDelta: layerCountAfter - layerCountBefore,
        layerCountMatches: layerCountAfter === expectedLayerCountAfter,
        pairCountMatches: pairs.length === requestedLayerIndices.length,
        sourceNameMatches: sourceNameMatches,
        duplicateNameMatches: duplicateNameMatches,
        pairNameMatches: sourceNameMatches === true && duplicateNameMatches === true
      };
      var response = {
        comp: {
          itemIndex: __codexProjectIndexForItem(comp),
          name: comp.name,
          numLayersBefore: layerCountBefore,
          numLayersAfter: layerCountAfter
        },
        requestedLayerIndices: requestedLayerIndices,
        layerCountBefore: layerCountBefore,
        layerCountAfter: layerCountAfter,
        duplicateCount: duplicates.length,
        pairs: pairs,
        layers: duplicates,
        postVerification: postVerification
      };
      return response;
      } finally {
        if (__codexDuplicateLayersUndoOpen) {
          app.endUndoGroup();
        }
      }
    `);
    return toolResult(result.result);
  }

  if (name === "delete_layer") {
    const compItemIndex = optionalPositiveInteger(args, "compItemIndex");
    const compName = optionalString(args, "compName", "");
    const layerIndex = requiredPositiveInteger(args, "layerIndex");
    const expectedLayerName = optionalString(args, "expectedLayerName", "").trim();

    if (compItemIndex === null && !compName) return toolResult("compItemIndex or compName is required.", true);
    if (!expectedLayerName) return toolResult("expectedLayerName is required.", true);
    if (hasArg(args, "layerIndices") || hasArg(args, "layerNames") || hasArg(args, "selectedLayersOnly")) {
      return toolResult("delete_layer deletes exactly one explicit layer; bulk or selection-based targets are not allowed.", true);
    }

    const result = await runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${aeLiteral(compName)});
      var requestedLayerIndex = ${layerIndex};
      var expectedLayerName = ${aeLiteral(expectedLayerName)};

      function __codexLayerNameCount(comp, layerName) {
        var count = 0;
        for (var __ln = 1; __ln <= comp.numLayers; __ln++) {
          var layer = comp.layer(__ln);
          if (layer && layer.name === layerName) count++;
        }
        return count;
      }

      if (requestedLayerIndex > comp.numLayers) {
        throw new Error("Layer index " + requestedLayerIndex + " is out of range for comp with " + comp.numLayers + " layers.");
      }
      var layer = comp.layer(requestedLayerIndex);
      if (!layer) throw new Error("Layer not found at index " + requestedLayerIndex + ".");
      if (layer.name !== expectedLayerName) {
        throw new Error("Layer name mismatch. Expected '" + expectedLayerName + "' but found '" + layer.name + "'.");
      }
      if (layer.locked === true) {
        throw new Error("Layer is locked and cannot be deleted safely.");
      }

      var layerCountBefore = comp.numLayers;
      var deletedLayer = __codexLayerInfo(layer);
      var sameNameCountBefore = __codexLayerNameCount(comp, expectedLayerName);
      var deletedLayerId = deletedLayer ? deletedLayer.id : null;
      var __codexDeleteLayerUndoOpen = false;
      try {
        app.beginUndoGroup("Codex Delete Layer");
        __codexDeleteLayerUndoOpen = true;
        layer.remove();
        var layerCountAfter = comp.numLayers;
        var layerAtDeletedIndexAfter = requestedLayerIndex <= comp.numLayers ? __codexLayerInfo(comp.layer(requestedLayerIndex)) : null;
        var sameNameCountAfter = __codexLayerNameCount(comp, expectedLayerName);
        var deletedLayerIdStillPresent = false;
        if (deletedLayerId !== null && deletedLayerId !== undefined) {
          for (var __dl = 1; __dl <= comp.numLayers; __dl++) {
            var currentLayer = comp.layer(__dl);
            if (currentLayer && currentLayer.id === deletedLayerId) deletedLayerIdStillPresent = true;
          }
        }
        var expectedLayerCountAfter = layerCountBefore - 1;
        var postVerification = {
          ok: layerCountAfter === expectedLayerCountAfter &&
            deletedLayerIdStillPresent === false &&
            sameNameCountAfter === Math.max(0, sameNameCountBefore - 1),
          beforeLayerCount: layerCountBefore,
          afterLayerCount: layerCountAfter,
          expectedLayerCountAfter: expectedLayerCountAfter,
          layerCountDelta: layerCountAfter - layerCountBefore,
          layerCountMatches: layerCountAfter === expectedLayerCountAfter,
          deletedLayerId: deletedLayerId,
          deletedLayerIdAbsent: deletedLayerIdStillPresent === false,
          expectedLayerName: expectedLayerName,
          sameNameCountBefore: sameNameCountBefore,
          sameNameCountAfter: sameNameCountAfter,
          sameNameCountDecremented: sameNameCountAfter === Math.max(0, sameNameCountBefore - 1),
          layerAtDeletedIndexAfter: layerAtDeletedIndexAfter,
          deletedLayerNameAbsentAtOriginalIndex: !layerAtDeletedIndexAfter || layerAtDeletedIndexAfter.name !== expectedLayerName
        };
        return {
          comp: {
            itemIndex: __codexProjectIndexForItem(comp),
            name: comp.name,
            numLayersBefore: layerCountBefore,
            numLayersAfter: layerCountAfter
          },
          layerCountBefore: layerCountBefore,
          layerCountAfter: layerCountAfter,
          requestedLayerIndex: requestedLayerIndex,
          expectedLayerName: expectedLayerName,
          deletedLayer: deletedLayer,
          layerAtDeletedIndexAfter: layerAtDeletedIndexAfter,
          postVerification: postVerification
        };
      } finally {
        if (__codexDeleteLayerUndoOpen) {
          app.endUndoGroup();
        }
      }
    `);
    return toolResult(result.result);
  }

  if (name === "deep_duplicate_precomp_sources") {
    const compItemIndex = optionalPositiveInteger(args, "compItemIndex");
    const compName = optionalString(args, "compName", "");
    const layerIndex = optionalPositiveInteger(args, "layerIndex");
    const sourceCompItemIndex = optionalPositiveInteger(args, "sourceCompItemIndex");
    const sourceCompName = optionalString(args, "sourceCompName", "");
    const nameSuffix = optionalString(args, "nameSuffix", " copy");
    const fixExpressions = optionalBoolean(args, "fixExpressions", false);
    const openInViewer = optionalBoolean(args, "openInViewer", false);
    const unavailableFootagePolicy = optionalString(args, "unavailableFootagePolicy", "reuse") === "fail" ? "fail" : "reuse";

    const result = await runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${aeLiteral(compName)});
      var requestedLayerIndex = ${layerIndex === null ? "null" : layerIndex};
      var expectedSourceCompIndex = ${sourceCompItemIndex === null ? "null" : sourceCompItemIndex};
      var expectedSourceCompName = ${aeLiteral(sourceCompName)};
      var nameSuffix = ${aeLiteral(nameSuffix)};
      var fixExpressions = ${fixExpressions ? "true" : "false"};
      var openInViewer = ${openInViewer ? "true" : "false"};
      var unavailableFootagePolicy = ${aeLiteral(unavailableFootagePolicy)};
      var deepDuplicateWarnings = [];
      var duplicatedFootageCount = 0;
      var reusedFootageCount = 0;

      function __codexCompReference(item) {
        var ref = __codexItemReference(item);
        if (!ref || !(item instanceof CompItem)) return ref;
        ref.width = item.width;
        ref.height = item.height;
        ref.duration = item.duration;
        ref.frameRate = item.frameRate;
        ref.numLayers = item.numLayers;
        return ref;
      }

      function __codexDuplicateKey(item) {
        var itemId = null;
        try { itemId = item.id; } catch (__idError) {}
        if (itemId !== null && itemId !== undefined && itemId !== "") return "id:" + itemId;
        return "index:" + __codexProjectIndexForItem(item);
      }

      function __codexFootageFile(item) {
        var file = null;
        try {
          if (item && item.mainSource && item.mainSource.file) file = item.mainSource.file;
        } catch (__mainSourceFileError) {}
        if (!file) {
          try { if (item && item.file) file = item.file; } catch (__itemFileError) {}
        }
        if (!file || !file.exists) return null;
        return file;
      }

      function __codexSourceTypename(item) {
        try {
          if (item && item.mainSource && item.mainSource.typename) return String(item.mainSource.typename);
        } catch (__typenameError) {}
        try {
          if (item && item.mainSource && item.mainSource.constructor && item.mainSource.constructor.name) {
            return String(item.mainSource.constructor.name);
          }
        } catch (__constructorNameError) {}
        try {
          if (item && item.mainSource) {
            var sourceText = String(item.mainSource);
            var match = sourceText.match(/^\\[object\\s+([^\\]]+)\\]$/);
            if (match && match[1]) return String(match[1]);
          }
        } catch (__sourceTextError) {}
        return "";
      }

      function __codexSolidColor(item) {
        try {
          if (item && item.mainSource && item.mainSource.color && item.mainSource.color.length >= 3) {
            return [Number(item.mainSource.color[0]), Number(item.mainSource.color[1]), Number(item.mainSource.color[2])];
          }
        } catch (__solidColorError) {}
        return [0, 0, 0];
      }

      function __codexFootagePixelAspect(item) {
        try {
          if (item && item.pixelAspect) return Number(item.pixelAspect);
        } catch (__pixelAspectError) {}
        return 1;
      }

      function __codexFootageDuration(item) {
        try {
          if (item && item.duration && isFinite(item.duration) && item.duration > 0) return Number(item.duration);
        } catch (__durationError) {}
        return 1;
      }

      function __codexFootageFrameRate(item) {
        try {
          if (item && item.frameRate && isFinite(item.frameRate) && item.frameRate > 0) return Number(item.frameRate);
        } catch (__frameRateError) {}
        return 25;
      }

      function __codexDuplicateSolidFootageItem(item) {
        var width = Math.max(1, Math.round(Number(item.width || 1)));
        var height = Math.max(1, Math.round(Number(item.height || 1)));
        var pixelAspect = __codexFootagePixelAspect(item);
        var duration = __codexFootageDuration(item);
        var tempComp = null;
        var copy = null;
        try {
          tempComp = app.project.items.addComp("__Codex Solid Duplicate Temp", width, height, pixelAspect, duration, __codexFootageFrameRate(item));
          var tempLayer = tempComp.layers.addSolid(__codexSolidColor(item), item.name || "Solid", width, height, pixelAspect, duration);
          copy = tempLayer.source;
          try { tempLayer.remove(); } catch (__solidTempLayerRemoveError) {}
        } finally {
          try { if (tempComp) tempComp.remove(); } catch (__solidTempCompRemoveError) {}
        }
        if (!copy) {
          return __codexReuseUnavailableFootage(item, "Solid footage source cannot be duplicated by this After Effects host");
        }
        try { copy.parentFolder = item.parentFolder; } catch (__solidParentFolderError) {}
        return copy;
      }

      function __codexDuplicatePlaceholderFootageItem(item) {
        var width = Math.max(1, Math.round(Number(item.width || 1)));
        var height = Math.max(1, Math.round(Number(item.height || 1)));
        var frameRate = __codexFootageFrameRate(item);
        var duration = __codexFootageDuration(item);
        var copy = null;
        if (app.project.importPlaceholder) {
          copy = app.project.importPlaceholder(item.name || "Placeholder", width, height, frameRate, duration);
        } else if (app.project.items.addPlaceholder) {
          copy = app.project.items.addPlaceholder(item.name || "Placeholder", width, height, frameRate, duration);
        }
        if (!copy) return null;
        try { copy.parentFolder = item.parentFolder; } catch (__placeholderParentFolderError) {}
        return copy;
      }

      function __codexReuseUnavailableFootage(item, reason) {
        if (unavailableFootagePolicy === "fail") {
          throw new Error(reason + ": " + item.name);
        }
        reusedFootageCount++;
        deepDuplicateWarnings.push(reason + "; reused original footage item: " + item.name);
        return item;
      }

      function __codexCopyFootageInterpretation(sourceItem, copyItem) {
        var source = null;
        var copy = null;
        try { source = sourceItem.mainSource; } catch (__sourceMainError) {}
        try { copy = copyItem.mainSource; } catch (__copyMainError) {}
        if (!source || !copy) return;

        var properties = [
          "alphaMode",
          "premulColor",
          "invertAlpha",
          "conformFrameRate",
          "fieldSeparationType",
          "highQualityFieldSeparation",
          "removePulldown",
          "loop"
        ];
        for (var __p = 0; __p < properties.length; __p++) {
          var property = properties[__p];
          try {
            if (source[property] !== undefined) copy[property] = source[property];
          } catch (__copyInterpretationError) {}
        }
      }

      function __codexDuplicateFootageItem(item) {
        var sourceType = __codexSourceTypename(item);
        var copy = null;

        if (item.duplicate) {
          copy = item.duplicate();
          duplicatedFootageCount++;
          return copy;
        }

        if (sourceType === "SolidSource") {
          copy = __codexDuplicateSolidFootageItem(item);
          duplicatedFootageCount++;
          return copy;
        }

        if (sourceType === "PlaceholderSource") {
          copy = __codexDuplicatePlaceholderFootageItem(item);
          if (copy) {
            duplicatedFootageCount++;
            return copy;
          }
          return __codexReuseUnavailableFootage(item, "Placeholder footage source cannot be duplicated by this After Effects host");
        }

        var file = __codexFootageFile(item);
        if (!file) {
          return __codexReuseUnavailableFootage(item, "Footage item cannot be duplicated or reimported because its source file is unavailable");
        }

        var options = new ImportOptions(file);
        options.sequence = false;
        if (!options.canImportAs(ImportAsType.FOOTAGE)) {
          return __codexReuseUnavailableFootage(item, "Footage file cannot be reimported as footage");
        }
        options.importAs = ImportAsType.FOOTAGE;
        copy = app.project.importFile(options);
        duplicatedFootageCount++;
        __codexCopyFootageInterpretation(item, copy);
        try { copy.parentFolder = item.parentFolder; } catch (__parentFolderError) {}
        return copy;
      }

      function __codexLayerFlags(layer) {
        return {
          adjustmentLayer: (function () { try { return !!layer.adjustmentLayer; } catch (__flagError) { return null; } })(),
          guideLayer: (function () { try { return !!layer.guideLayer; } catch (__guideError) { return null; } })(),
          threeDLayer: (function () { try { return !!layer.threeDLayer; } catch (__threeDError) { return null; } })()
        };
      }

      function __codexRestoreLayerFlags(layer, flags) {
        if (!layer || !flags) return;
        try { if (flags.adjustmentLayer !== null) layer.adjustmentLayer = flags.adjustmentLayer; } catch (__adjustmentRestoreError) {}
        try { if (flags.guideLayer !== null) layer.guideLayer = flags.guideLayer; } catch (__guideRestoreError) {}
        try { if (flags.threeDLayer !== null) layer.threeDLayer = flags.threeDLayer; } catch (__threeDRestoreError) {}
      }

      function __codexResolvePrecompLayer(parentComp, requestedIndex) {
        if (requestedIndex !== null) {
          var explicitLayer = parentComp.layer(requestedIndex);
          if (!explicitLayer) throw new Error("Layer not found at index " + requestedIndex + ".");
          return explicitLayer;
        }
        if (parentComp.selectedLayers.length !== 1) {
          throw new Error("Select exactly one precomp layer or pass layerIndex.");
        }
        return parentComp.selectedLayers[0];
      }

      var selectedLayer = __codexResolvePrecompLayer(comp, requestedLayerIndex);
      if (selectedLayer.locked) throw new Error("Layer is locked: " + selectedLayer.name);
      var sourceComp = selectedLayer.source;
      if (!(sourceComp instanceof CompItem)) {
        throw new Error("Target layer source is not a composition/precomp.");
      }
      if (expectedSourceCompIndex !== null || expectedSourceCompName) {
        var expectedSource = __codexResolveProjectItem(expectedSourceCompIndex, expectedSourceCompName, "comp");
        if (expectedSource !== sourceComp) {
          throw new Error("Selected layer no longer points to the expected source precomp.");
        }
      }

      var duplicatedByKey = {};
      var duplicatedItems = [];
      var duplicatedCopies = [];
      var relinkedLayerCount = 0;

      function __codexDuplicateItemDeep(item) {
        if (!item) return item;
        if (!(item instanceof CompItem) && !(item instanceof FootageItem)) return item;
        var key = __codexDuplicateKey(item);
        if (duplicatedByKey[key]) return duplicatedByKey[key];

        var copy = item instanceof FootageItem ? __codexDuplicateFootageItem(item) : item.duplicate();
        if (copy === item) {
          duplicatedByKey[key] = item;
          return item;
        }
        if (nameSuffix) copy.name = item.name + nameSuffix;
        duplicatedByKey[key] = copy;
        duplicatedCopies.push(copy);
        duplicatedItems.push({
          source: item instanceof CompItem ? __codexCompReference(item) : __codexItemReference(item),
          duplicate: copy instanceof CompItem ? __codexCompReference(copy) : __codexItemReference(copy)
        });

        if (copy instanceof CompItem) {
          for (var __i = 1; __i <= copy.numLayers; __i++) {
            var layer = copy.layer(__i);
            if (!layer) continue;
            var nestedSource = null;
            try { nestedSource = layer.source; } catch (__sourceError) {}
            if (!nestedSource) continue;
            var nestedCopy = __codexDuplicateItemDeep(nestedSource);
            if (nestedCopy && nestedCopy !== nestedSource && layer.replaceSource) {
              var wasLocked = false;
              var layerFlags = __codexLayerFlags(layer);
              try {
                wasLocked = !!layer.locked;
                if (wasLocked) layer.locked = false;
              } catch (__unlockError) {}
              try {
                layer.replaceSource(nestedCopy, fixExpressions);
                __codexRestoreLayerFlags(layer, layerFlags);
                relinkedLayerCount++;
              } finally {
                try { if (wasLocked) layer.locked = true; } catch (__relockError) {}
              }
            }
          }
        }

        return copy;
      }

      app.beginUndoGroup("Codex Deep Duplicate Precomp Sources");
      var response = null;
      try {
        var newComp = __codexDuplicateItemDeep(sourceComp);
        selectedLayer.replaceSource(newComp, fixExpressions);
        selectedLayer.name = newComp.name;
        if (openInViewer && newComp && newComp.openInViewer) newComp.openInViewer();
        response = {
          comp: { itemIndex: __codexProjectIndexForItem(comp), name: comp.name },
          layer: __codexLayerInfo(selectedLayer),
          originalComp: __codexCompReference(sourceComp),
          duplicateComp: __codexCompReference(newComp),
          changedCount: 1,
          duplicatedItemCount: duplicatedItems.length,
          duplicatedFootageCount: duplicatedFootageCount,
          reusedFootageCount: reusedFootageCount,
          relinkedLayerCount: relinkedLayerCount,
          duplicatedItems: duplicatedItems,
          warnings: deepDuplicateWarnings,
          nameSuffix: nameSuffix
        };
      } catch (__deepDuplicateError) {
        try {
          if (selectedLayer && sourceComp && selectedLayer.source !== sourceComp && selectedLayer.replaceSource) {
            selectedLayer.replaceSource(sourceComp, fixExpressions);
          }
        } catch (__restoreLayerSourceError) {}
        for (var __removeIndex = 0; __removeIndex < duplicatedCopies.length; __removeIndex++) {
          try {
            if (duplicatedCopies[__removeIndex] && duplicatedCopies[__removeIndex].remove) {
              duplicatedCopies[__removeIndex].remove();
            }
          } catch (__removeDuplicateError) {}
        }
        throw __deepDuplicateError;
      } finally {
        app.endUndoGroup();
      }
      return response;
    `);
    return toolResult(withDeepDuplicateResultAliases(result.result));
  }

  if (name === "list_effects") {
    const compItemIndex = optionalPositiveInteger(args, "compItemIndex");
    const compName = optionalString(args, "compName", "");
    const layerIndex = requiredPositiveInteger(args, "layerIndex");
    const includeProperties = optionalBoolean(args, "includeProperties", false);
    const includeValues = optionalBoolean(args, "includeValues", false);
    const includeExpressions = optionalBoolean(args, "includeExpressions", true);

    const result = await runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${aeLiteral(compName)});
      var layer = comp.layer(${layerIndex});
      if (!layer) throw new Error("Layer not found.");
      var includeProperties = ${includeProperties ? "true" : "false"};
      var includeValues = ${includeValues ? "true" : "false"};
      var includeExpressions = ${includeExpressions ? "true" : "false"};
      var effectGroup = layer.property("ADBE Effect Parade");
      var effects = [];

      if (effectGroup) {
        for (var __e = 1; __e <= effectGroup.numProperties; __e++) {
          var effect = effectGroup.property(__e);
          if (!effect) continue;
          var info = __codexPropertyInfo(effect, layer, false, includeExpressions);
          if (includeProperties) {
            info.properties = __codexEffectProperties(effect, layer, includeValues, includeExpressions);
          }
          effects.push(info);
        }
      }

      return {
        comp: {
          itemIndex: __codexProjectIndexForItem(comp),
          name: comp.name
        },
        layer: __codexLayerInfo(layer),
        effectCount: effectGroup ? effectGroup.numProperties : 0,
        effects: effects
      };
    `);
    return toolResult(result.result);
  }

  if (name === "get_effect_details") {
    const compItemIndex = optionalPositiveInteger(args, "compItemIndex");
    const compName = optionalString(args, "compName", "");
    const layerIndex = requiredPositiveInteger(args, "layerIndex");
    const effectIndex = optionalPositiveInteger(args, "effectIndex");
    const effectName = optionalString(args, "effectName", "");
    const effectMatchName = optionalString(args, "effectMatchName", "");
    const includeProperties = optionalBoolean(args, "includeProperties", true);
    const propertyDepth = Math.max(0, Math.min(5, Math.floor(optionalNumber(args, "propertyDepth", 1))));
    const propertyLimit = Math.max(1, Math.min(1000, Math.floor(optionalNumber(args, "propertyLimit", 120))));
    const includeValues = optionalBoolean(args, "includeValues", true);
    const includeExpressions = optionalBoolean(args, "includeExpressions", true);

    if (!effectIndex && !effectName && !effectMatchName) {
      return toolResult("Provide effectIndex, effectName, or effectMatchName.", true);
    }

    const result = await runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${aeLiteral(compName)});
      var layer = comp.layer(${layerIndex});
      if (!layer) throw new Error("Layer not found.");
      var effect = __codexResolveEffect(layer, ${effectIndex === null ? "null" : effectIndex}, ${aeLiteral(effectName)}, ${aeLiteral(effectMatchName)});
      var includeProperties = ${includeProperties ? "true" : "false"};
      var includeValues = ${includeValues ? "true" : "false"};
      var includeExpressions = ${includeExpressions ? "true" : "false"};
      var propertyDepth = ${propertyDepth};
      var propertyLimit = ${propertyLimit};
      var properties = [];
      var propertyState = { count: 0, max: propertyLimit };

      if (includeProperties) {
        try {
          for (var __p = 1; __p <= effect.numProperties && propertyState.count < propertyState.max; __p++) {
            var branch = __codexPropertyTree(effect.property(__p), propertyDepth, propertyState, includeValues, includeExpressions);
            if (branch) properties.push(branch);
          }
        } catch (__effectTreeError) {}
      }

      return {
        comp: {
          itemIndex: __codexProjectIndexForItem(comp),
          name: comp.name
        },
        layer: __codexLayerInfo(layer),
        effect: __codexPropertyInfo(effect, layer, false, includeExpressions),
        propertiesReturned: properties.length,
        propertiesTruncated: includeProperties && propertyState.count >= propertyState.max,
        properties: properties
      };
    `);
    return toolResult(result.result);
  }

  if (name === "add_effect") {
    const compItemIndex = optionalPositiveInteger(args, "compItemIndex");
    const compName = optionalString(args, "compName", "");
    const layerIndex = requiredPositiveInteger(args, "layerIndex");
    const effect = optionalString(args, "effect", "");
    const effectName = optionalString(args, "name", "");

    if (!effect) return toolResult("effect is required.", true);

    const result = await runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${aeLiteral(compName)});
      var layer = comp.layer(${layerIndex});
      if (!layer) throw new Error("Layer not found.");
      if (layer.locked) throw new Error("Layer is locked.");

      var effectIdentifier = ${aeLiteral(effect)};
      var requestedName = ${aeLiteral(effectName)};
      var effectGroup = layer.property("ADBE Effect Parade");
      if (!effectGroup) throw new Error("Layer cannot receive effects.");

      app.beginUndoGroup("Codex Add Effect");
      var addedEffect = effectGroup.addProperty(effectIdentifier);
      if (!addedEffect) throw new Error("Could not add effect: " + effectIdentifier);
      if (requestedName) addedEffect.name = requestedName;
      var response = {
        comp: {
          itemIndex: __codexProjectIndexForItem(comp),
          name: comp.name
        },
        layer: __codexLayerInfo(layer),
        effect: __codexPropertyInfo(addedEffect, layer, false, true),
        properties: __codexEffectProperties(addedEffect, layer, true)
      };
      app.endUndoGroup();
      return response;
    `);
    return toolResult(result.result);
  }

  if (name === "set_effect_property") {
    const compItemIndex = optionalPositiveInteger(args, "compItemIndex");
    const compName = optionalString(args, "compName", "");
    const layerIndex = requiredPositiveInteger(args, "layerIndex");
    const effectIndex = optionalPositiveInteger(args, "effectIndex");
    const effectName = optionalString(args, "effectName", "");
    const effectMatchName = optionalString(args, "effectMatchName", "");
    const propertyIndex = optionalPositiveInteger(args, "propertyIndex");
    const propertyName = optionalString(args, "propertyName", "");
    const propertyMatchName = optionalString(args, "propertyMatchName", "");
    const time = optionalNumber(args, "time", null);
    const setAtTime = optionalBoolean(args, "setAtTime", time !== null);

    let propertyPath = null;
    if (Array.isArray(args.propertyPath)) {
      propertyPath = args.propertyPath;
    } else if (typeof args.propertyPath === "string" && args.propertyPath.trim().startsWith("[")) {
      propertyPath = JSON.parse(args.propertyPath);
    } else if (hasArg(args, "propertyPath")) {
      return toolResult("propertyPath must be an array, or a JSON-encoded array string.", true);
    }

    if (!effectIndex && !effectName && !effectMatchName) {
      return toolResult("Provide effectIndex, effectName, or effectMatchName.", true);
    }
    if (!propertyPath && !propertyIndex && !propertyName && !propertyMatchName) {
      return toolResult("Provide propertyPath, propertyIndex, propertyName, or propertyMatchName.", true);
    }
    if (!hasArg(args, "value")) return toolResult("value is required.", true);
    if (setAtTime && time === null) return toolResult("time is required when setAtTime is true.", true);

    const value = args.value;

    const result = await runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${aeLiteral(compName)});
      var layer = comp.layer(${layerIndex});
      if (!layer) throw new Error("Layer not found.");
      if (layer.locked) throw new Error("Layer is locked.");

      var effect = __codexResolveEffect(layer, ${effectIndex === null ? "null" : effectIndex}, ${aeLiteral(effectName)}, ${aeLiteral(effectMatchName)});
      var propertyPath = ${propertyPath ? aeLiteral(propertyPath) : "null"};
      var prop = __codexResolveEffectProperty(effect, propertyPath, ${propertyIndex === null ? "null" : propertyIndex}, ${aeLiteral(propertyName)}, ${aeLiteral(propertyMatchName)});
      var requestedValue = ${aeLiteral(value)};
      var shouldSetAtTime = ${setAtTime ? "true" : "false"};
      var targetTime = ${time === null ? "null" : time};

      app.beginUndoGroup("Codex Set Effect Property");
      var preparedValue = __codexPreparePropertyValue(prop, requestedValue);
      if (shouldSetAtTime) {
        prop.setValueAtTime(targetTime, preparedValue);
      } else {
        prop.setValue(preparedValue);
      }
      var response = {
        comp: {
          itemIndex: __codexProjectIndexForItem(comp),
          name: comp.name
        },
        layer: __codexLayerInfo(layer),
        effect: __codexPropertyInfo(effect, layer, false, true),
        property: __codexPropertyInfo(prop, layer, true, true),
        setAtTime: shouldSetAtTime,
        time: targetTime
      };
      app.endUndoGroup();
      return response;
    `);
    return toolResult(result.result);
  }

  if (name === "set_effect_enabled") {
    const compItemIndex = optionalPositiveInteger(args, "compItemIndex");
    const compName = optionalString(args, "compName", "");
    const layerIndex = requiredPositiveInteger(args, "layerIndex");
    const effectIndex = optionalPositiveInteger(args, "effectIndex");
    const effectName = optionalString(args, "effectName", "");
    const effectMatchName = optionalString(args, "effectMatchName", "");
    const enabled = optionalBoolean(args, "enabled", null);
    const expectedCurrentEnabled = hasArg(args, "expectedCurrentEnabled")
      ? optionalBoolean(args, "expectedCurrentEnabled", null)
      : null;

    if (!effectIndex && !effectName && !effectMatchName) {
      return toolResult("Provide effectIndex, effectName, or effectMatchName.", true);
    }
    if (!hasArg(args, "enabled")) return toolResult("enabled is required.", true);

    const result = await runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${aeLiteral(compName)});
      var layer = comp.layer(${layerIndex});
      if (!layer) throw new Error("Layer not found.");
      if (layer.locked) throw new Error("Layer is locked.");

      var effect = __codexResolveEffect(layer, ${effectIndex === null ? "null" : effectIndex}, ${aeLiteral(effectName)}, ${aeLiteral(effectMatchName)});
      var requestedEnabled = ${enabled ? "true" : "false"};
      var expectedCurrentEnabled = ${expectedCurrentEnabled === null ? "null" : expectedCurrentEnabled ? "true" : "false"};
      var beforeEffect = __codexPropertyInfo(effect, layer, false, true);
      if (beforeEffect.enabled === undefined) {
        try { beforeEffect.enabled = !!effect.enabled; } catch (__effectEnabledReadError) {}
      }
      if (expectedCurrentEnabled !== null && beforeEffect.enabled !== expectedCurrentEnabled) {
        throw new Error("Effect enabled guard mismatch. Expected " + expectedCurrentEnabled + " but found " + beforeEffect.enabled + ".");
      }

      app.beginUndoGroup("Codex Set Effect Enabled");
      try {
        effect.enabled = requestedEnabled;
        var afterEffect = __codexPropertyInfo(effect, layer, false, true);
        if (afterEffect.enabled === undefined) {
          try { afterEffect.enabled = !!effect.enabled; } catch (__effectEnabledAfterReadError) {}
        }
        return {
          comp: {
            itemIndex: __codexProjectIndexForItem(comp),
            name: comp.name
          },
          layer: __codexLayerInfo(layer),
          effect: afterEffect,
          before: {
            effect: beforeEffect
          },
          after: {
            effect: afterEffect
          },
          requestedEnabled: requestedEnabled,
          expectedCurrentEnabled: expectedCurrentEnabled,
          postVerification: {
            ok: afterEffect.enabled === requestedEnabled,
            enabledMatches: afterEffect.enabled === requestedEnabled,
            expectedCurrentMatched: expectedCurrentEnabled === null || beforeEffect.enabled === expectedCurrentEnabled
          }
        };
      } finally {
        app.endUndoGroup();
      }
    `);
    return toolResult(result.result);
  }

  if (name === "set_puppet_pin_type") {
    const compItemIndex = optionalPositiveInteger(args, "compItemIndex");
    const compName = optionalString(args, "compName", "");
    const layerIndex = requiredPositiveInteger(args, "layerIndex");
    const effectIndex = optionalPositiveInteger(args, "effectIndex");
    const effectName = optionalString(args, "effectName", "");
    const effectMatchName = optionalString(args, "effectMatchName", "");
    const expectedPinName = optionalString(args, "expectedPinName", "");
    const pinType = normalizePuppetPinType(args.pinType, "pinType");
    const expectedCurrentPinType = hasArg(args, "expectedCurrentPinType")
      ? normalizePuppetPinType(args.expectedCurrentPinType, "expectedCurrentPinType")
      : null;

    let pinTypePropertyPath = null;
    if (Array.isArray(args.pinTypePropertyPath)) {
      pinTypePropertyPath = args.pinTypePropertyPath;
    } else if (typeof args.pinTypePropertyPath === "string" && args.pinTypePropertyPath.trim().startsWith("[")) {
      pinTypePropertyPath = JSON.parse(args.pinTypePropertyPath);
    } else if (hasArg(args, "pinTypePropertyPath")) {
      return toolResult("pinTypePropertyPath must be an array, or a JSON-encoded array string.", true);
    }

    if (!effectIndex && !effectName && !effectMatchName) {
      return toolResult("Provide effectIndex, effectName, or effectMatchName.", true);
    }
    if (effectMatchName && effectMatchName !== "ADBE FreePin3") {
      return toolResult("set_puppet_pin_type only supports effectMatchName ADBE FreePin3.", true);
    }
    if (!pinTypePropertyPath || !pinTypePropertyPath.length) {
      return toolResult("pinTypePropertyPath is required.", true);
    }

    const result = await runExtendScriptBody(`
      ${resolveCompScript}

      function __codexTryResolveProperty(root, propertyPath) {
        try {
          return __codexResolveProperty(root, propertyPath);
        } catch (__resolveError) {
          return null;
        }
      }

      function __codexPropertyAncestor(prop, expectedMatchName, stopAt) {
        var current = prop;
        var guard = 0;
        while (current && guard < 50) {
          if (current.matchName === expectedMatchName) return current;
          if (stopAt && current === stopAt) break;
          try {
            current = current.parentProperty;
          } catch (__parentError) {
            current = null;
          }
          guard++;
        }
        return null;
      }

      function __codexResolvePuppetPinTypeProperty(layer, effect, propertyPath) {
        var prop = __codexTryResolveProperty(layer, propertyPath);
        if (prop) return prop;

        prop = __codexTryResolveProperty(effect, propertyPath);
        if (prop) return prop;

        if (propertyPath instanceof Array) {
          for (var __offset = 0; __offset < propertyPath.length; __offset++) {
            var suffix = [];
            for (var __segment = __offset; __segment < propertyPath.length; __segment++) {
              suffix.push(propertyPath[__segment]);
            }
            prop = __codexTryResolveProperty(effect, suffix);
            if (prop) return prop;
          }
        }

        throw new Error("Could not resolve pinTypePropertyPath against the layer or ADBE FreePin3 effect.");
      }

      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${aeLiteral(compName)});
      var layer = comp.layer(${layerIndex});
      if (!layer) throw new Error("Layer not found.");
      if (layer.locked) throw new Error("Layer is locked.");

      var effect = __codexResolveEffect(layer, ${effectIndex === null ? "null" : effectIndex}, ${aeLiteral(effectName)}, ${aeLiteral(effectMatchName || "ADBE FreePin3")});
      if (effect.matchName !== "ADBE FreePin3") {
        throw new Error("set_puppet_pin_type only supports ADBE FreePin3 effects.");
      }

      var propertyPath = ${aeLiteral(pinTypePropertyPath)};
      var prop = __codexResolvePuppetPinTypeProperty(layer, effect, propertyPath);
      if (prop.matchName !== "ADBE FreePin3 PosPin Type") {
        throw new Error("pinTypePropertyPath must resolve to ADBE FreePin3 PosPin Type.");
      }

      var pinAtom = __codexPropertyAncestor(prop, "ADBE FreePin3 PosPin Atom", effect);
      if (!pinAtom) {
        throw new Error("ADBE FreePin3 PosPin Type must be under an ADBE FreePin3 PosPin Atom ancestor.");
      }
      var expectedPinName = ${aeLiteral(expectedPinName)};
      if (expectedPinName && pinAtom.name !== expectedPinName) {
        throw new Error("Puppet pin atom name mismatch. Expected " + expectedPinName + " but found " + pinAtom.name + ".");
      }

      var requestedPinType = ${pinType};
      var expectedCurrentPinType = ${expectedCurrentPinType === null ? "null" : expectedCurrentPinType};
      var beforeValue = Number(prop.value);
      if (expectedCurrentPinType !== null && beforeValue !== expectedCurrentPinType) {
        throw new Error("Puppet pin type current value mismatch. Expected " + expectedCurrentPinType + " but found " + beforeValue + ".");
      }

      app.beginUndoGroup("Codex Set Puppet Pin Type");
      prop.setValue(requestedPinType);
      var afterValue = Number(prop.value);
      var response = {
        comp: {
          itemIndex: __codexProjectIndexForItem(comp),
          name: comp.name
        },
        layer: __codexLayerInfo(layer),
        effect: __codexPropertyInfo(effect, layer, false, true),
        pinAtom: __codexPropertyInfo(pinAtom, layer, false, true),
        property: __codexPropertyInfo(prop, layer, true, true),
        pinTypeBefore: beforeValue,
        pinType: requestedPinType,
        pinTypeAfter: afterValue,
        allowedPinTypes: [1, 4],
        propertyPath: __codexPropertyPath(prop)
      };
      app.endUndoGroup();
      return response;
    `);
    return toolResult(result.result);
  }

  if (name === "add_property_to_essential_graphics") {
    const compItemIndex = optionalPositiveInteger(args, "compItemIndex");
    const compName = optionalString(args, "compName", "");
    const layerIndex = requiredPositiveInteger(args, "layerIndex");
    const expectedLayerName = optionalString(args, "expectedLayerName", "");
    const expectedPropertyName = optionalString(args, "expectedPropertyName", "");
    const expectedPropertyMatchName = optionalString(args, "expectedPropertyMatchName", "");
    const expectedControllerCountBefore = optionalNumber(args, "expectedControllerCountBefore", null);
    const controllerName = optionalString(args, "controllerName", "").trim();

    let propertyPath = null;
    if (Array.isArray(args.propertyPath)) {
      propertyPath = args.propertyPath;
    } else if (typeof args.propertyPath === "string" && args.propertyPath.trim().startsWith("[")) {
      propertyPath = JSON.parse(args.propertyPath);
    } else if (hasArg(args, "propertyPath")) {
      return toolResult("propertyPath must be an array, or a JSON-encoded array string.", true);
    }

    if (compItemIndex === null && !compName) return toolResult("compItemIndex or compName is required.", true);
    if (!propertyPath || !propertyPath.length) return toolResult("propertyPath is required.", true);
    if (!controllerName) return toolResult("controllerName is required.", true);
    if (controllerName.length > 80) return toolResult("controllerName must be 80 characters or fewer.", true);
    if (expectedControllerCountBefore !== null && (!Number.isInteger(expectedControllerCountBefore) || expectedControllerCountBefore < 0)) {
      return toolResult("expectedControllerCountBefore must be a non-negative integer.", true);
    }

    const result = await runExtendScriptBody(`
      ${resolveCompScript}

      function __codexEssentialGraphicsControllers(comp) {
        var controllers = [];
        var count = 0;
        try { count = comp.motionGraphicsTemplateControllerCount || 0; } catch (__countError) { count = 0; }
        for (var __eg = 1; __eg <= count; __eg++) {
          var controllerName = "";
          try { controllerName = comp.getMotionGraphicsTemplateControllerName(__eg) || ""; } catch (__nameError) {}
          controllers.push({
            index: __eg,
            name: controllerName
          });
        }
        return {
          count: count,
          controllers: controllers
        };
      }

      function __codexFindController(controllers, name, startIndex) {
        for (var __fc = 0; __fc < controllers.length; __fc++) {
          var controller = controllers[__fc];
          if (controller.index < startIndex) continue;
          if (controller.name === name) return controller;
        }
        return null;
      }

      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${aeLiteral(compName)});
      var layer = comp.layer(${layerIndex});
      if (!layer) throw new Error("Layer not found.");
      if (layer.locked) throw new Error("Layer is locked.");
      var expectedLayerName = ${aeLiteral(expectedLayerName)};
      if (expectedLayerName && layer.name !== expectedLayerName) {
        throw new Error("Layer name mismatch. Expected " + expectedLayerName + " but found " + layer.name + ".");
      }

      var propertyPath = ${aeLiteral(propertyPath)};
      var prop = __codexResolveProperty(layer, propertyPath);
      var expectedPropertyName = ${aeLiteral(expectedPropertyName)};
      var expectedPropertyMatchName = ${aeLiteral(expectedPropertyMatchName)};
      if (expectedPropertyName && prop.name !== expectedPropertyName) {
        throw new Error("Property name mismatch. Expected " + expectedPropertyName + " but found " + prop.name + ".");
      }
      if (expectedPropertyMatchName && prop.matchName !== expectedPropertyMatchName) {
        throw new Error("Property matchName mismatch. Expected " + expectedPropertyMatchName + " but found " + prop.matchName + ".");
      }
      if (typeof prop.canAddToMotionGraphicsTemplate !== "function") {
        throw new Error("Resolved property does not support canAddToMotionGraphicsTemplate.");
      }
      if (typeof prop.addToMotionGraphicsTemplateAs !== "function") {
        throw new Error("Resolved property does not support addToMotionGraphicsTemplateAs.");
      }

      var beforeControllers = __codexEssentialGraphicsControllers(comp);
      var expectedCount = ${expectedControllerCountBefore === null ? "null" : expectedControllerCountBefore};
      if (expectedCount !== null && beforeControllers.count !== expectedCount) {
        throw new Error("Essential Graphics controller count mismatch. Expected " + expectedCount + " but found " + beforeControllers.count + ".");
      }

      var canAdd = false;
      try { canAdd = prop.canAddToMotionGraphicsTemplate(comp) === true; } catch (__canAddError) { throw new Error("canAddToMotionGraphicsTemplate failed: " + __canAddError.message); }
      if (!canAdd) {
        throw new Error("Property cannot be added to the Essential Graphics panel for this composition.");
      }

      var requestedControllerName = ${aeLiteral(controllerName)};
      app.beginUndoGroup("Codex Add Property To Essential Graphics");
      try {
        var added = prop.addToMotionGraphicsTemplateAs(comp, requestedControllerName) === true;
        var afterControllers = __codexEssentialGraphicsControllers(comp);
        var newController = __codexFindController(afterControllers.controllers, requestedControllerName, beforeControllers.count + 1);
        var existingController = newController || __codexFindController(afterControllers.controllers, requestedControllerName, 1);
        return {
          comp: {
            itemIndex: __codexProjectIndexForItem(comp),
            name: comp.name,
            numLayers: comp.numLayers
          },
          layer: __codexLayerInfo(layer),
          property: __codexPropertyInfo(prop, layer, true, true),
          controllerName: requestedControllerName,
          added: added,
          beforeControllers: beforeControllers,
          afterControllers: afterControllers,
          controller: existingController,
          postVerification: {
            ok: added === true && !!existingController && afterControllers.count === beforeControllers.count + 1,
            controllerCountIncremented: afterControllers.count === beforeControllers.count + 1,
            controllerNamePresent: !!existingController,
            canAddBefore: canAdd
          }
        };
      } finally {
        app.endUndoGroup();
      }
    `);
    return toolResult(result.result);
  }

  if (name === "set_property_value") {
    const compItemIndex = optionalPositiveInteger(args, "compItemIndex");
    const compName = optionalString(args, "compName", "");
    const layerIndices = requiredPositiveIntegerList(args, "layerIndex");
    const time = optionalNumber(args, "time", null);
    const setAtTime = optionalBoolean(args, "setAtTime", time !== null);

    let propertyPath;
    if (Array.isArray(args.propertyPath)) {
      propertyPath = args.propertyPath;
    } else if (typeof args.propertyPath === "string" && args.propertyPath.trim().startsWith("[")) {
      propertyPath = JSON.parse(args.propertyPath);
    } else if (typeof args.propertyPath === "string" && args.propertyPath.trim()) {
      propertyPath = args.propertyPath.split(".").map((part) => part.trim()).filter(Boolean);
    } else {
      return toolResult("propertyPath must be an array, a property-name string, or a JSON-encoded array string.", true);
    }

    if (propertyPath.length === 0) return toolResult("propertyPath must not be empty.", true);
    if (!hasArg(args, "value")) return toolResult("value is required.", true);
    if (setAtTime && time === null) return toolResult("time is required when setAtTime is true.", true);

    const value = args.value;

    const result = await runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${aeLiteral(compName)});
      var layerIndices = ${aeLiteral(layerIndices)};
      var propertyPath = ${aeLiteral(propertyPath)};
      var requestedValue = ${aeLiteral(value)};
      var shouldSetAtTime = ${setAtTime ? "true" : "false"};
      var targetTime = ${time === null ? "null" : time};
      var layerAttributeName = propertyPath.length === 1 ? String(propertyPath[0]) : "";
      var layerAttributeSetters = {
        threeDLayer: true,
        collapseTransformation: true,
        motionBlur: true
      };
      var isLayerAttribute = layerAttributeSetters[layerAttributeName] === true;

      app.beginUndoGroup("Codex Set Property Value");
      var layers = [];
      var properties = [];
      for (var __li = 0; __li < layerIndices.length; __li++) {
        var layer = comp.layer(layerIndices[__li]);
        if (!layer) throw new Error("Layer not found at index " + layerIndices[__li] + ".");
        if (layer.locked) throw new Error("Layer is locked: " + layer.name);

        if (isLayerAttribute) {
          if (shouldSetAtTime) throw new Error(layerAttributeName + " cannot be keyframed with setAtTime.");
          if (layerAttributeName === "collapseTransformation") {
            var canSetCollapseTransformation = true;
            try { canSetCollapseTransformation = layer.canSetCollapseTransformation !== false; } catch (__collapseCheckError) {}
            if (!canSetCollapseTransformation) {
              throw new Error("Layer cannot set collapseTransformation. Use a precomp/vector-capable layer and read it back.");
            }
          }
          layer[layerAttributeName] = !!requestedValue;
          layers.push(__codexLayerInfo(layer));
          properties.push({
            name: layerAttributeName,
            matchName: layerAttributeName,
            propertyPath: [{ name: layerAttributeName, matchName: layerAttributeName }],
            value: !!layer[layerAttributeName]
          });
          continue;
        }

        var prop = __codexResolveProperty(layer, propertyPath);
        var preparedValue = __codexPreparePropertyValue(prop, requestedValue);
        if (shouldSetAtTime) {
          prop.setValueAtTime(targetTime, preparedValue);
        } else {
          prop.setValue(preparedValue);
        }
        layers.push(__codexLayerInfo(layer));
        properties.push(__codexPropertyInfo(prop, layer, true, true));
      }
      var response = {
        comp: {
          itemIndex: __codexProjectIndexForItem(comp),
          name: comp.name
        },
        layer: layers.length === 1 ? layers[0] : null,
        layers: layers,
        property: properties.length === 1 ? properties[0] : null,
        properties: properties,
        setAtTime: shouldSetAtTime,
        time: targetTime
      };
      app.endUndoGroup();
      return response;
    `);
    return toolResult(result.result);
  }

  if (name === "set_layer_metadata") {
    const compItemIndex = optionalPositiveInteger(args, "compItemIndex");
    const compName = optionalString(args, "compName", "");
    if (compItemIndex === null && !compName) return toolResult("compItemIndex or compName is required for set_layer_metadata.", true);

    const allowedKeys = new Set([
      "compItemIndex",
      "compName",
      "layerIndices",
      "expectedLayerNames",
      "comment",
      "label",
      "locked",
      "enabled",
      "guideLayer",
      "autoCheckpoint",
      "checkpointLabel",
      "idempotencyKey",
      "idempotencyScope",
      "verifyAfter",
      M100_DIRECT_ESCAPE_HATCH_ARG
    ]);
    const unsupportedKeys = Object.keys(args || {}).filter((key) => !allowedKeys.has(key));
    if (unsupportedKeys.length) return toolResult("Unsupported set_layer_metadata fields: " + unsupportedKeys.join(", "), true);

    let layerIndices;
    try {
      layerIndices = requiredExplicitPositiveIntegerList(args, "layerIndices");
    } catch (error) {
      return toolResult(error.message || String(error), true);
    }

    let expectedLayerNames = null;
    if (hasArg(args, "expectedLayerNames")) {
      expectedLayerNames = args.expectedLayerNames;
      if (typeof expectedLayerNames === "string" && expectedLayerNames.trim().startsWith("[")) {
        expectedLayerNames = JSON.parse(expectedLayerNames);
      }
      if (!Array.isArray(expectedLayerNames)) return toolResult("expectedLayerNames must be an array when provided.", true);
      expectedLayerNames = expectedLayerNames.map((value) => String(value));
      if (expectedLayerNames.length !== layerIndices.length) {
        return toolResult("expectedLayerNames must have the same length as layerIndices.", true);
      }
    }

    const requested = {};
    const hasCommentUpdate = Object.prototype.hasOwnProperty.call(args || {}, "comment") && args.comment !== undefined && args.comment !== null;
    if (hasCommentUpdate) {
      requested.comment = String(args.comment);
      if (requested.comment.length > 500) return toolResult("comment must be 500 characters or fewer.", true);
    }
    if (hasArg(args, "label")) {
      const label = optionalNumber(args, "label", null);
      if (!Number.isInteger(label) || label < 0 || label > 16) return toolResult("label must be an integer from 0 through 16.", true);
      requested.label = label;
    }
    if (hasArg(args, "locked")) {
      requested.locked = optionalBoolean(args, "locked", false);
    }
    if (hasArg(args, "enabled")) {
      requested.enabled = optionalBoolean(args, "enabled", true);
    }
    if (hasArg(args, "guideLayer")) {
      requested.guideLayer = optionalBoolean(args, "guideLayer", false);
    }

    const requestedKeys = Object.keys(requested);
    if (!requestedKeys.length) return toolResult("At least one approved layer metadata update is required: comment, label, locked, enabled, or guideLayer.", true);

    const result = await runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${aeLiteral(compName)});
      var layerIndices = ${aeLiteral(layerIndices)};
      var expectedLayerNames = ${expectedLayerNames ? aeLiteral(expectedLayerNames) : "null"};
      var requested = ${aeLiteral(requested)};
      var requestedKeys = ${aeLiteral(requestedKeys)};

      function __codexMetadataFieldMatches(after, field) {
        if (field === "comment") return String(after.comment || "") === String(requested.comment || "");
        if (field === "label") return Number(after.label) === Number(requested.label);
        if (field === "locked") return after.locked === requested.locked;
        if (field === "enabled") return after.enabled === requested.enabled;
        if (field === "guideLayer") return after.guideLayer === requested.guideLayer;
        return false;
      }

      app.beginUndoGroup("Codex Set Layer Metadata");
      var changed = [];
      var allMatch = true;
      for (var __li = 0; __li < layerIndices.length; __li++) {
        var requestedIndex = layerIndices[__li];
        var layer = comp.layer(requestedIndex);
        if (!layer) throw new Error("Layer not found at index " + requestedIndex + ".");
        if (expectedLayerNames && layer.name !== expectedLayerNames[__li]) {
          throw new Error("Layer name mismatch at index " + requestedIndex + ". Expected '" + expectedLayerNames[__li] + "' but found '" + layer.name + "'.");
        }

        var before = __codexLayerInfo(layer);
        if (before.locked && (requested.comment !== undefined || requested.label !== undefined || requested.enabled !== undefined || requested.guideLayer !== undefined) && requested.locked !== false) {
          throw new Error("Layer is locked: " + layer.name + ". Unlock explicitly before setting comment, label, enabled, or guideLayer.");
        }

        if (requested.locked === false) layer.locked = false;
        if (requested.comment !== undefined) layer.comment = String(requested.comment);
        if (requested.label !== undefined) layer.label = Number(requested.label);
        if (requested.enabled !== undefined) layer.enabled = requested.enabled;
        if (requested.guideLayer !== undefined) layer.guideLayer = requested.guideLayer;
        if (requested.locked === true) layer.locked = true;

        var after = __codexLayerInfo(layer);
        var fieldMatches = {};
        for (var __fieldIndex = 0; __fieldIndex < requestedKeys.length; __fieldIndex++) {
          var field = requestedKeys[__fieldIndex];
          fieldMatches[field] = __codexMetadataFieldMatches(after, field);
          if (!fieldMatches[field]) allMatch = false;
        }
        changed.push({
          layerIndex: requestedIndex,
          expectedLayerName: expectedLayerNames ? expectedLayerNames[__li] : null,
          before: before,
          after: after,
          fieldMatches: fieldMatches
        });
      }

      var layers = [];
      for (var __changedIndex = 0; __changedIndex < changed.length; __changedIndex++) {
        layers.push(changed[__changedIndex].after);
      }
      var response = {
        comp: {
          itemIndex: __codexProjectIndexForItem(comp),
          name: comp.name
        },
        requestedLayerIndices: layerIndices,
        expectedLayerNames: expectedLayerNames,
        updatedFields: requestedKeys,
        updates: requested,
        changedCount: changed.length,
        layer: layers.length === 1 ? layers[0] : null,
        layers: layers,
        changed: changed,
        postVerification: {
          ok: allMatch,
          requestedCount: layerIndices.length,
          changedCount: changed.length,
          updatedFields: requestedKeys
        }
      };
      app.endUndoGroup();
      return response;
    `);
    return toolResult(result.result);
  }

  if (name === "set_layer_blending_mode") {
    const compItemIndex = optionalPositiveInteger(args, "compItemIndex");
    const compName = optionalString(args, "compName", "");
    if (compItemIndex === null && !compName) return toolResult("compItemIndex or compName is required for set_layer_blending_mode.", true);

    const allowedKeys = new Set([
      "compItemIndex",
      "compName",
      "layerIndices",
      "expectedLayerNames",
      "expectedCurrentBlendingModes",
      "blendingMode",
      "autoCheckpoint",
      "checkpointLabel",
      "idempotencyKey",
      "idempotencyScope",
      "verifyAfter",
      M100_DIRECT_ESCAPE_HATCH_ARG
    ]);
    const unsupportedKeys = Object.keys(args || {}).filter((key) => !allowedKeys.has(key));
    if (unsupportedKeys.length) return toolResult("Unsupported set_layer_blending_mode fields: " + unsupportedKeys.join(", "), true);

    let layerIndices;
    try {
      layerIndices = requiredExplicitPositiveIntegerList(args, "layerIndices");
    } catch (error) {
      return toolResult(error.message || String(error), true);
    }

    let expectedLayerNames = null;
    if (hasArg(args, "expectedLayerNames")) {
      expectedLayerNames = args.expectedLayerNames;
      if (typeof expectedLayerNames === "string" && expectedLayerNames.trim().startsWith("[")) {
        expectedLayerNames = JSON.parse(expectedLayerNames);
      }
      if (!Array.isArray(expectedLayerNames)) return toolResult("expectedLayerNames must be an array when provided.", true);
      expectedLayerNames = expectedLayerNames.map((value) => String(value));
      if (expectedLayerNames.length !== layerIndices.length) {
        return toolResult("expectedLayerNames must have the same length as layerIndices.", true);
      }
    }

    let expectedCurrentBlendingModes = null;
    if (hasArg(args, "expectedCurrentBlendingModes")) {
      expectedCurrentBlendingModes = args.expectedCurrentBlendingModes;
      if (typeof expectedCurrentBlendingModes === "string" && expectedCurrentBlendingModes.trim().startsWith("[")) {
        expectedCurrentBlendingModes = JSON.parse(expectedCurrentBlendingModes);
      }
      if (!Array.isArray(expectedCurrentBlendingModes)) return toolResult("expectedCurrentBlendingModes must be an array when provided.", true);
      expectedCurrentBlendingModes = expectedCurrentBlendingModes.map((value) => String(value).trim().toLowerCase());
      if (expectedCurrentBlendingModes.length !== layerIndices.length) {
        return toolResult("expectedCurrentBlendingModes must have the same length as layerIndices.", true);
      }
      const invalidExpectedModes = expectedCurrentBlendingModes.filter((value) => !["normal", "difference"].includes(value));
      if (invalidExpectedModes.length) return toolResult("expectedCurrentBlendingModes only supports normal or difference.", true);
    }

    const blendingMode = optionalString(args, "blendingMode", "").trim().toLowerCase();
    if (!["normal", "difference"].includes(blendingMode)) return toolResult("blendingMode must be normal or difference.", true);

    const result = await runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${aeLiteral(compName)});
      var layerIndices = ${aeLiteral(layerIndices)};
      var expectedLayerNames = ${expectedLayerNames ? aeLiteral(expectedLayerNames) : "null"};
      var expectedCurrentBlendingModes = ${expectedCurrentBlendingModes ? aeLiteral(expectedCurrentBlendingModes) : "null"};
      var targetModeName = ${aeLiteral(blendingMode)};
      var targetMode = __codexBlendingModeValue(targetModeName);

      app.beginUndoGroup("Codex Set Layer Blending Mode");
      var changed = [];
      var allMatch = true;
      for (var __li = 0; __li < layerIndices.length; __li++) {
        var requestedIndex = layerIndices[__li];
        var layer = comp.layer(requestedIndex);
        if (!layer) throw new Error("Layer not found at index " + requestedIndex + ".");
        if (expectedLayerNames && layer.name !== expectedLayerNames[__li]) {
          throw new Error("Layer name mismatch at index " + requestedIndex + ". Expected '" + expectedLayerNames[__li] + "' but found '" + layer.name + "'.");
        }

        var before = __codexLayerInfo(layer);
        var beforeModeName = before.blendingModeName || __codexBlendingModeName(layer.blendingMode);
        if (expectedCurrentBlendingModes && beforeModeName !== expectedCurrentBlendingModes[__li]) {
          throw new Error("Layer blending mode mismatch at index " + requestedIndex + ". Expected '" + expectedCurrentBlendingModes[__li] + "' but found '" + beforeModeName + "'.");
        }
        if (before.locked) throw new Error("Layer is locked: " + layer.name + ". Unlock explicitly before setting blending mode.");

        layer.blendingMode = targetMode;
        var after = __codexLayerInfo(layer);
        var fieldMatches = {
          blendingMode: after.blendingModeName === targetModeName
        };
        if (!fieldMatches.blendingMode) allMatch = false;
        changed.push({
          layerIndex: requestedIndex,
          expectedLayerName: expectedLayerNames ? expectedLayerNames[__li] : null,
          expectedCurrentBlendingMode: expectedCurrentBlendingModes ? expectedCurrentBlendingModes[__li] : null,
          requestedBlendingMode: targetModeName,
          before: before,
          after: after,
          fieldMatches: fieldMatches
        });
      }

      var layers = [];
      for (var __changedIndex = 0; __changedIndex < changed.length; __changedIndex++) {
        layers.push(changed[__changedIndex].after);
      }
      var response = {
        comp: {
          itemIndex: __codexProjectIndexForItem(comp),
          name: comp.name
        },
        requestedLayerIndices: layerIndices,
        expectedLayerNames: expectedLayerNames,
        expectedCurrentBlendingModes: expectedCurrentBlendingModes,
        requestedBlendingMode: targetModeName,
        changedCount: changed.length,
        layer: layers.length === 1 ? layers[0] : null,
        layers: layers,
        changed: changed,
        postVerification: {
          ok: allMatch,
          requestedCount: layerIndices.length,
          changedCount: changed.length,
          requestedBlendingMode: targetModeName
        }
      };
      app.endUndoGroup();
      return response;
    `);
    return toolResult(result.result);
  }

  if (name === "align_layers_to_time") {
    const compItemIndex = optionalPositiveInteger(args, "compItemIndex");
    const compName = optionalString(args, "compName", "");
    const layerIndices = optionalPositiveIntegerList(args, "layerIndices");
    const targetTime = optionalNumber(args, "targetTime", null);
    const align = optionalString(args, "align", "inPoint");

    if (align !== "inPoint" && align !== "startTime") {
      return toolResult("align must be one of: inPoint, startTime.", true);
    }

    const result = await runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${aeLiteral(compName)});
      var requestedLayerIndices = ${layerIndices ? aeLiteral(layerIndices) : "null"};
      var targetTime = ${targetTime === null ? "comp.time" : targetTime};
      var alignMode = ${aeLiteral(align)};

      function __codexLayerTiming(layer) {
        return {
          index: layer.index,
          name: layer.name,
          startTime: layer.startTime,
          inPoint: layer.inPoint,
          outPoint: layer.outPoint,
          duration: layer.outPoint - layer.inPoint
        };
      }

      var layers = [];
      if (requestedLayerIndices && requestedLayerIndices.length) {
        for (var __r = 0; __r < requestedLayerIndices.length; __r++) {
          var requestedLayer = comp.layer(requestedLayerIndices[__r]);
          if (!requestedLayer) throw new Error("Layer not found at index " + requestedLayerIndices[__r] + ".");
          layers.push(requestedLayer);
        }
      } else {
        for (var __s = 0; __s < comp.selectedLayers.length; __s++) {
          layers.push(comp.selectedLayers[__s]);
        }
      }
      if (!layers.length) throw new Error("No target layers. Select layers or pass layerIndices.");

      app.beginUndoGroup("Codex Align Layers To Time");
      var aligned = [];
      for (var __i = 0; __i < layers.length; __i++) {
        var layer = layers[__i];
        if (layer.locked) throw new Error("Layer is locked: " + layer.name);
        var before = __codexLayerTiming(layer);
        if (alignMode === "startTime") {
          layer.startTime = targetTime;
        } else {
          var delta = targetTime - layer.inPoint;
          layer.startTime = layer.startTime + delta;
        }
        aligned.push({
          before: before,
          after: __codexLayerTiming(layer),
          layer: __codexLayerInfo(layer)
        });
      }
      var response = {
        comp: {
          itemIndex: __codexProjectIndexForItem(comp),
          name: comp.name,
          time: comp.time
        },
        targetTime: targetTime,
        align: alignMode,
        changedCount: aligned.length,
        layer: aligned.length === 1 ? aligned[0].layer : null,
        layers: aligned.map(function (item) { return item.layer; }),
        aligned: aligned
      };
      app.endUndoGroup();
      return response;
    `);
    return toolResult(result.result);
  }

  if (name === "set_comp_current_time") {
    const compItemIndex = optionalPositiveInteger(args, "compItemIndex");
    const compName = optionalString(args, "compName", "");
    const hasTime = hasArg(args, "time");
    const hasFrame = hasArg(args, "frame");
    const time = hasTime ? optionalNumber(args, "time", null) : null;
    const frame = hasFrame ? optionalNumber(args, "frame", null) : null;
    const frameRate = hasArg(args, "frameRate") ? optionalNumber(args, "frameRate", null) : null;
    const expectedCurrentTime = hasArg(args, "expectedCurrentTime") ? optionalNumber(args, "expectedCurrentTime", null) : null;
    const clampToDuration = optionalBoolean(args, "clampToDuration", false);
    const openInViewer = optionalBoolean(args, "openInViewer", false);

    if (compItemIndex === null && !compName) return toolResult("compItemIndex or compName is required.", true);
    if (hasTime === hasFrame) return toolResult("Provide exactly one of time or frame.", true);
    if (hasTime && (time === null || !Number.isFinite(time))) return toolResult("time must be a finite number of seconds.", true);
    if (hasFrame && (frame === null || !Number.isFinite(frame) || !Number.isInteger(frame) || frame < 0)) {
      return toolResult("frame must be a finite zero-based integer.", true);
    }
    if (frameRate !== null && (!Number.isFinite(frameRate) || frameRate <= 0)) return toolResult("frameRate must be greater than 0.", true);
    if (expectedCurrentTime !== null && !Number.isFinite(expectedCurrentTime)) return toolResult("expectedCurrentTime must be finite when provided.", true);

    const result = await runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${aeLiteral(compName)});
      var requestedTime = ${hasTime ? time : "null"};
      var requestedFrame = ${hasFrame ? frame : "null"};
      var explicitFrameRate = ${frameRate === null ? "null" : frameRate};
      var expectedCurrentTime = ${expectedCurrentTime === null ? "null" : expectedCurrentTime};
      var clampToDuration = ${clampToDuration ? "true" : "false"};
      var openInViewer = ${openInViewer ? "true" : "false"};

      function __codexFiniteNumber(value) {
        return typeof value === "number" && isFinite(value);
      }

      function __codexCompTimeSnapshot(targetComp) {
        return {
          itemIndex: __codexProjectIndexForItem(targetComp),
          name: targetComp.name,
          time: targetComp.time,
          duration: targetComp.duration,
          frameRate: targetComp.frameRate,
          displayStartTime: targetComp.displayStartTime,
          workAreaStart: targetComp.workAreaStart,
          workAreaDuration: targetComp.workAreaDuration,
          width: targetComp.width,
          height: targetComp.height,
          numLayers: targetComp.numLayers
        };
      }

      var frameRateUsed = null;
      if (requestedFrame !== null) {
        frameRateUsed = explicitFrameRate !== null ? explicitFrameRate : comp.frameRate;
        if (!__codexFiniteNumber(frameRateUsed) || frameRateUsed <= 0) throw new Error("frameRate must be greater than 0 for frame-derived current time.");
        requestedTime = requestedFrame / frameRateUsed;
      }
      if (!__codexFiniteNumber(requestedTime)) throw new Error("Target current time must be finite.");

      var before = __codexCompTimeSnapshot(comp);
      if (expectedCurrentTime !== null && Math.abs(before.time - expectedCurrentTime) > 0.001) {
        throw new Error("Current time guard mismatch. Expected " + expectedCurrentTime + " but found " + before.time + ".");
      }

      var targetTime = requestedTime;
      var clamped = false;
      if (targetTime < 0 || targetTime > comp.duration) {
        if (!clampToDuration) throw new Error("Target current time must be between 0 and composition duration.");
        targetTime = Math.max(0, Math.min(comp.duration, targetTime));
        clamped = true;
      }

      app.beginUndoGroup("Codex Set Comp Current Time");
      try {
        if (openInViewer && comp.openInViewer) comp.openInViewer();
        comp.time = targetTime;
      } finally {
        app.endUndoGroup();
      }

      var after = __codexCompTimeSnapshot(comp);
      var timeMatches = Math.abs(after.time - targetTime) <= 0.001;
      return {
        comp: {
          itemIndex: after.itemIndex,
          name: after.name,
          time: after.time,
          duration: after.duration,
          frameRate: after.frameRate
        },
        requested: {
          time: requestedTime,
          frame: requestedFrame,
          frameRate: frameRateUsed,
          clampToDuration: clampToDuration
        },
        targetTime: targetTime,
        clamped: clamped,
        before: before,
        after: after,
        postVerification: {
          ok: timeMatches,
          timeMatches: timeMatches,
          withinBounds: targetTime >= 0 && targetTime <= after.duration,
          compIdentityMatches: before.itemIndex === after.itemIndex && before.name === after.name,
          structuralFieldsUnchanged:
            before.duration === after.duration &&
            before.frameRate === after.frameRate &&
            before.width === after.width &&
            before.height === after.height &&
            before.numLayers === after.numLayers &&
            before.workAreaStart === after.workAreaStart &&
            before.workAreaDuration === after.workAreaDuration
        }
      };
    `);
    return toolResult(result.result);
  }

  if (name === "set_comp_work_area") {
    const compItemIndex = optionalPositiveInteger(args, "compItemIndex");
    const compName = optionalString(args, "compName", "");
    const start = optionalNumber(args, "start", null);
    const duration = optionalNumber(args, "duration", null);

    if (duration === null || duration <= 0) return toolResult("duration must be greater than 0.", true);
    if (start !== null && start < 0) return toolResult("start must be 0 or greater.", true);

    const result = await runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${aeLiteral(compName)});
      var requestedStart = ${start === null ? "comp.time" : start};
      var requestedDuration = ${duration};
      if (requestedStart < 0) throw new Error("Work-area start must be 0 or greater.");
      if (requestedDuration <= 0) throw new Error("Work-area duration must be greater than 0.");

      app.beginUndoGroup("Codex Set Comp Work Area");
      var before = {
        workAreaStart: comp.workAreaStart,
        workAreaDuration: comp.workAreaDuration
      };
      comp.workAreaStart = requestedStart;
      comp.workAreaDuration = requestedDuration;
      var response = {
        comp: {
          itemIndex: __codexProjectIndexForItem(comp),
          name: comp.name,
          duration: comp.duration
        },
        before: before,
        workAreaStart: comp.workAreaStart,
        workAreaDuration: comp.workAreaDuration
      };
      app.endUndoGroup();
      return response;
    `);
    return toolResult(result.result);
  }

  if (name === "set_comp_properties") {
    const compItemIndex = optionalPositiveInteger(args, "compItemIndex");
    const compName = optionalString(args, "compName", "");
    if (compItemIndex === null && !compName) return toolResult("compItemIndex or compName is required.", true);

    const allowedKeys = new Set([
      "compItemIndex",
      "compName",
      "width",
      "height",
      "pixelAspect",
      "duration",
      "frameRate",
      "bgColor",
      "displayStartTime",
      "displayStartFrame",
      "preserveNestedFrameRate",
      "autoCheckpoint",
      "checkpointLabel",
      "idempotencyKey",
      "idempotencyScope",
      "verifyAfter",
      M100_DIRECT_ESCAPE_HATCH_ARG
    ]);
    const unsupportedKeys = Object.keys(args || {}).filter((key) => !allowedKeys.has(key));
    if (unsupportedKeys.length) return toolResult("Unsupported set_comp_properties fields: " + unsupportedKeys.join(", "), true);

    const requested = {};
    if (hasArg(args, "width")) {
      const width = optionalNumber(args, "width", null);
      if (!Number.isInteger(width) || width < 4) return toolResult("width must be an integer of at least 4.", true);
      requested.width = width;
    }
    if (hasArg(args, "height")) {
      const height = optionalNumber(args, "height", null);
      if (!Number.isInteger(height) || height < 4) return toolResult("height must be an integer of at least 4.", true);
      requested.height = height;
    }
    if (hasArg(args, "pixelAspect")) {
      const pixelAspect = optionalNumber(args, "pixelAspect", null);
      if (pixelAspect <= 0) return toolResult("pixelAspect must be greater than 0.", true);
      requested.pixelAspect = pixelAspect;
    }
    if (hasArg(args, "duration")) {
      const duration = optionalNumber(args, "duration", null);
      if (duration <= 0) return toolResult("duration must be greater than 0.", true);
      requested.duration = duration;
    }
    if (hasArg(args, "frameRate")) {
      const frameRate = optionalNumber(args, "frameRate", null);
      if (frameRate <= 0) return toolResult("frameRate must be greater than 0.", true);
      requested.frameRate = frameRate;
    }
    if (hasArg(args, "displayStartTime")) {
      requested.displayStartTime = optionalNumber(args, "displayStartTime", null);
    }
    if (hasArg(args, "displayStartFrame")) {
      const displayStartFrame = optionalNumber(args, "displayStartFrame", null);
      if (!Number.isInteger(displayStartFrame) || displayStartFrame < 0) return toolResult("displayStartFrame must be a non-negative integer.", true);
      requested.displayStartFrame = displayStartFrame;
    }
    if (hasArg(args, "preserveNestedFrameRate")) {
      requested.preserveNestedFrameRate = optionalBoolean(args, "preserveNestedFrameRate", null);
      if (requested.preserveNestedFrameRate === null) return toolResult("preserveNestedFrameRate must be a boolean.", true);
    }
    if (hasArg(args, "bgColor")) {
      const bgColor = optionalNumberArray(args, "bgColor", null, 3, 3);
      if (bgColor.some((value) => value < 0 || value > 1)) return toolResult("bgColor values must be between 0 and 1.", true);
      requested.bgColor = bgColor;
    }
    const requestedKeys = Object.keys(requested);
    if (!requestedKeys.length) return toolResult("At least one approved comp property update is required.", true);

    const result = await runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${aeLiteral(compName)});
      var requested = ${aeLiteral(requested)};
      var requestedKeys = ${aeLiteral(requestedKeys)};

      function __codexCompProperties(comp) {
        var displayStartFrame = null;
        var displayStartFrameSupported = false;
        try {
          if (comp.displayStartFrame !== undefined) {
            displayStartFrame = comp.displayStartFrame;
            displayStartFrameSupported = true;
          }
        } catch (__displayStartFrameReadError) {}
        return {
          itemIndex: __codexProjectIndexForItem(comp),
          name: comp.name,
          width: comp.width,
          height: comp.height,
          pixelAspect: comp.pixelAspect,
          duration: comp.duration,
          frameRate: comp.frameRate,
          bgColor: comp.bgColor ? [comp.bgColor[0], comp.bgColor[1], comp.bgColor[2]] : null,
          displayStartTime: comp.displayStartTime,
          displayStartFrame: displayStartFrame,
          displayStartFrameSupported: displayStartFrameSupported,
          preserveNestedFrameRate: !!comp.preserveNestedFrameRate,
          numLayers: comp.numLayers
        };
      }

      function __codexNear(a, b) {
        return Math.abs(Number(a) - Number(b)) <= 0.0001;
      }

      function __codexColorNear(a, b) {
        return Math.abs(Number(a) - Number(b)) <= ((0.5 / 255) + 0.000001);
      }

      function __codexColorMatches(actual, expected) {
        if (!actual || !expected || actual.length < 3 || expected.length < 3) return false;
        return __codexColorNear(actual[0], expected[0]) && __codexColorNear(actual[1], expected[1]) && __codexColorNear(actual[2], expected[2]);
      }

      function __codexFieldMatches(after, field, expected) {
        if (field === "bgColor") return __codexColorMatches(after.bgColor, expected);
        if (typeof expected === "boolean") return after[field] === expected;
        return __codexNear(after[field], expected);
      }

      function __codexSetDisplayStartFrame(targetComp, value) {
        var supported = false;
        try { supported = targetComp.displayStartFrame !== undefined; } catch (__displayStartFrameSupportError) {}
        if (!supported) throw new Error("CompItem.displayStartFrame is not supported by this After Effects version.");
        targetComp.displayStartFrame = value;
      }

      app.beginUndoGroup("Codex Set Comp Properties");
      var before = __codexCompProperties(comp);
      if (requested.width !== undefined) comp.width = requested.width;
      if (requested.height !== undefined) comp.height = requested.height;
      if (requested.pixelAspect !== undefined) comp.pixelAspect = requested.pixelAspect;
      if (requested.duration !== undefined) comp.duration = requested.duration;
      if (requested.frameRate !== undefined) comp.frameRate = requested.frameRate;
      if (requested.bgColor !== undefined) comp.bgColor = requested.bgColor;
      if (requested.displayStartTime !== undefined) comp.displayStartTime = requested.displayStartTime;
      if (requested.displayStartFrame !== undefined) __codexSetDisplayStartFrame(comp, requested.displayStartFrame);
      if (requested.preserveNestedFrameRate !== undefined) comp.preserveNestedFrameRate = requested.preserveNestedFrameRate;
      var after = __codexCompProperties(comp);
      var fieldMatches = {};
      var allMatch = true;
      for (var __fieldIndex = 0; __fieldIndex < requestedKeys.length; __fieldIndex++) {
        var field = requestedKeys[__fieldIndex];
        var matches = __codexFieldMatches(after, field, requested[field]);
        fieldMatches[field] = matches;
        if (!matches) allMatch = false;
      }
      var response = {
        comp: after,
        before: before,
        after: after,
        updates: requested,
        updatedFields: requestedKeys,
        postVerification: {
          ok: allMatch,
          updatedFields: requestedKeys,
          fieldMatches: fieldMatches,
          compIdentityMatches: before.itemIndex === after.itemIndex && before.name === after.name,
          layerCountUnchanged: before.numLayers === after.numLayers
        }
      };
      app.endUndoGroup();
      return response;
    `);
    return toolResult(result.result);
  }

  if (name === "refresh_comp_panel") {
    const compItemIndex = optionalPositiveInteger(args, "compItemIndex");
    const compName = optionalString(args, "compName", "");
    const expectedMotionBlur = optionalBoolean(args, "expectedMotionBlur", null);
    if (compItemIndex === null && !compName) return toolResult("compItemIndex or compName is required for refresh_comp_panel.", true);

    const result = await runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${aeLiteral(compName)});
      var expectedMotionBlur = ${expectedMotionBlur === null ? "null" : aeLiteral(expectedMotionBlur)};

      function __codexCompRefreshState(comp) {
        return {
          itemIndex: __codexProjectIndexForItem(comp),
          name: comp.name,
          width: comp.width,
          height: comp.height,
          duration: comp.duration,
          frameRate: comp.frameRate,
          workAreaStart: comp.workAreaStart,
          workAreaDuration: comp.workAreaDuration,
          time: comp.time,
          motionBlur: !!comp.motionBlur,
          numLayers: comp.numLayers
        };
      }

      var before = __codexCompRefreshState(comp);
      if (expectedMotionBlur !== null && before.motionBlur !== expectedMotionBlur) {
        throw new Error("Expected comp.motionBlur " + expectedMotionBlur + " but found " + before.motionBlur + ".");
      }
      app.beginUndoGroup("Codex Refresh Comp Panel");
      comp.motionBlur = !before.motionBlur;
      var transient = __codexCompRefreshState(comp);
      comp.motionBlur = before.motionBlur;
      var after = __codexCompRefreshState(comp);
      var response = {
        comp: after,
        before: before,
        transient: transient,
        after: after,
        refreshMethod: "comp.motionBlur-double-toggle",
        postVerification: {
          ok: before.itemIndex === after.itemIndex &&
            before.name === after.name &&
            before.motionBlur === after.motionBlur &&
            transient.motionBlur !== before.motionBlur &&
            before.numLayers === after.numLayers &&
            before.workAreaStart === after.workAreaStart &&
            before.workAreaDuration === after.workAreaDuration,
          compIdentityMatches: before.itemIndex === after.itemIndex && before.name === after.name,
          motionBlurRestored: before.motionBlur === after.motionBlur,
          transientToggled: transient.motionBlur !== before.motionBlur,
          layerCountUnchanged: before.numLayers === after.numLayers,
          workAreaUnchanged: before.workAreaStart === after.workAreaStart && before.workAreaDuration === after.workAreaDuration
        }
      };
      app.endUndoGroup();
      return response;
    `);
    return toolResult(result.result);
  }

  if (name === "set_layer_time_range") {
    const compItemIndex = optionalPositiveInteger(args, "compItemIndex");
    const compName = optionalString(args, "compName", "");
    const layerIndices = optionalPositiveIntegerList(args, "layerIndices");
    const startTime = optionalNumber(args, "startTime", null);
    const inPoint = optionalNumber(args, "inPoint", null);
    const outPoint = optionalNumber(args, "outPoint", null);
    const duration = optionalNumber(args, "duration", null);

    if (startTime === null && inPoint === null && outPoint === null && duration === null) {
      return toolResult("Provide startTime, inPoint, outPoint, or duration.", true);
    }
    if (duration !== null && duration <= 0) return toolResult("duration must be greater than 0.", true);

    const result = await runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${aeLiteral(compName)});
      var requestedLayerIndices = ${layerIndices ? aeLiteral(layerIndices) : "null"};
      var requestedStartTime = ${startTime === null ? "null" : startTime};
      var requestedInPoint = ${inPoint === null ? "null" : inPoint};
      var requestedOutPoint = ${outPoint === null ? "null" : outPoint};
      var requestedDuration = ${duration === null ? "null" : duration};
      var layers = __codexResolveLayers(comp, requestedLayerIndices);

      app.beginUndoGroup("Codex Set Layer Time Range");
      var changed = [];
      for (var __i = 0; __i < layers.length; __i++) {
        var layer = layers[__i];
        if (layer.locked) throw new Error("Layer is locked: " + layer.name);
        var before = __codexLayerTiming(layer);
        if (requestedStartTime !== null) layer.startTime = requestedStartTime;
        if (requestedInPoint !== null) layer.inPoint = requestedInPoint;
        if (requestedOutPoint !== null) layer.outPoint = requestedOutPoint;
        if (requestedDuration !== null) layer.outPoint = layer.inPoint + requestedDuration;
        if (layer.outPoint <= layer.inPoint) throw new Error("Layer outPoint must be after inPoint: " + layer.name);
        changed.push({
          before: before,
          after: __codexLayerTiming(layer),
          layer: __codexLayerInfo(layer)
        });
      }
      var response = {
        comp: { itemIndex: __codexProjectIndexForItem(comp), name: comp.name, time: comp.time },
        changedCount: changed.length,
        layer: changed.length === 1 ? changed[0].layer : null,
        layers: changed.map(function (item) { return item.layer; }),
        changed: changed
      };
      app.endUndoGroup();
      return response;
    `);
    return toolResult(result.result);
  }

  if (name === "stagger_layers") {
    const compItemIndex = optionalPositiveInteger(args, "compItemIndex");
    const compName = optionalString(args, "compName", "");
    const layerIndices = optionalPositiveIntegerList(args, "layerIndices");
    const startTime = optionalNumber(args, "startTime", null);
    const gap = optionalNumber(args, "gap", 0);
    const overlap = optionalNumber(args, "overlap", 0);
    const order = optionalString(args, "order", "selection");

    if (!["selection", "indexAsc", "indexDesc"].includes(order)) return toolResult("order must be one of: selection, indexAsc, indexDesc.", true);
    if (overlap < 0) return toolResult("overlap must be 0 or greater.", true);

    const result = await runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${aeLiteral(compName)});
      var requestedLayerIndices = ${layerIndices ? aeLiteral(layerIndices) : "null"};
      var sequenceStart = ${startTime === null ? "comp.time" : startTime};
      var gap = ${gap};
      var overlap = ${overlap};
      var order = ${aeLiteral(order)};
      var layers = __codexResolveLayers(comp, requestedLayerIndices);
      if (order === "indexAsc") {
        layers.sort(function (a, b) { return a.index - b.index; });
      } else if (order === "indexDesc") {
        layers.sort(function (a, b) { return b.index - a.index; });
      }

      app.beginUndoGroup("Codex Stagger Layers");
      var cursor = sequenceStart;
      var changed = [];
      for (var __i = 0; __i < layers.length; __i++) {
        var layer = layers[__i];
        if (layer.locked) throw new Error("Layer is locked: " + layer.name);
        var before = __codexLayerTiming(layer);
        var visibleDuration = Math.max(0, layer.outPoint - layer.inPoint);
        var delta = cursor - layer.inPoint;
        layer.startTime = layer.startTime + delta;
        changed.push({
          before: before,
          after: __codexLayerTiming(layer),
          layer: __codexLayerInfo(layer)
        });
        cursor = layer.outPoint + gap - overlap;
      }
      var response = {
        comp: { itemIndex: __codexProjectIndexForItem(comp), name: comp.name, time: comp.time },
        startTime: sequenceStart,
        gap: gap,
        overlap: overlap,
        order: order,
        changedCount: changed.length,
        layers: changed.map(function (item) { return item.layer; }),
        changed: changed
      };
      app.endUndoGroup();
      return response;
    `);
    return toolResult(result.result);
  }

  if (name === "split_layers_at_time") {
    const compItemIndex = optionalPositiveInteger(args, "compItemIndex");
    const compName = optionalString(args, "compName", "");
    const layerIndices = optionalPositiveIntegerList(args, "layerIndices");
    const splitTime = optionalNumber(args, "time", optionalNumber(args, "targetTime", null));

    const result = await runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${aeLiteral(compName)});
      var requestedLayerIndices = ${layerIndices ? aeLiteral(layerIndices) : "null"};
      var splitTime = ${splitTime === null ? "comp.time" : splitTime};
      var layers = __codexResolveLayers(comp, requestedLayerIndices);

      app.beginUndoGroup("Codex Split Layers At Time");
      var split = [];
      for (var __i = 0; __i < layers.length; __i++) {
        var layer = layers[__i];
        if (layer.locked) throw new Error("Layer is locked: " + layer.name);
        if (splitTime <= layer.inPoint || splitTime >= layer.outPoint) {
          throw new Error("Split time must be inside the layer time range: " + layer.name);
        }
        var before = __codexLayerTiming(layer);
        var newLayer = layer.splitLayer(splitTime);
        split.push({
          before: before,
          original: __codexLayerInfo(layer),
          newLayer: __codexLayerInfo(newLayer)
        });
      }
      var response = {
        comp: { itemIndex: __codexProjectIndexForItem(comp), name: comp.name, time: comp.time },
        time: splitTime,
        changedCount: split.length,
        split: split,
        layers: split.map(function (item) { return item.newLayer; })
      };
      app.endUndoGroup();
      return response;
    `);
    return toolResult(result.result);
  }

  if (name === "precompose_layers") {
    const compItemIndex = optionalPositiveInteger(args, "compItemIndex");
    const compName = optionalString(args, "compName", "");
    const layerIndices = requiredPositiveIntegerList(args, "layerIndices");
    const newCompName = optionalString(args, "newCompName", "");
    const moveAllAttributes = optionalBoolean(args, "moveAllAttributes", true);
    const openInViewer = optionalBoolean(args, "openInViewer", true);

    if (!newCompName) return toolResult("newCompName is required.", true);

    const result = await runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${aeLiteral(compName)});
      var layerIndices = ${aeLiteral(layerIndices)};
      var newCompName = ${aeLiteral(newCompName)};
      var moveAllAttributes = ${moveAllAttributes ? "true" : "false"};
      var openInViewer = ${openInViewer ? "true" : "false"};
      for (var __i = 0; __i < layerIndices.length; __i++) {
        var layer = comp.layer(layerIndices[__i]);
        if (!layer) throw new Error("Layer not found at index " + layerIndices[__i] + ".");
        if (layer.locked) throw new Error("Layer is locked: " + layer.name);
      }

      app.beginUndoGroup("Codex Precompose Layers");
      var precomp = comp.layers.precompose(layerIndices, newCompName, moveAllAttributes);
      if (openInViewer && precomp && precomp.openInViewer) precomp.openInViewer();
      var response = {
        sourceComp: { itemIndex: __codexProjectIndexForItem(comp), name: comp.name },
        comp: { itemIndex: __codexProjectIndexForItem(precomp), name: precomp.name, numLayers: precomp.numLayers, duration: precomp.duration },
        layerIndices: layerIndices,
        moveAllAttributes: moveAllAttributes
      };
      app.endUndoGroup();
      return response;
    `);
    return toolResult(result.result);
  }

  if (name === "replace_layer_source") {
    const compItemIndex = optionalPositiveInteger(args, "compItemIndex");
    const compName = optionalString(args, "compName", "");
    const layerIndices = optionalPositiveIntegerList(args, "layerIndices");
    const sourceItemIndex = optionalPositiveInteger(args, "sourceItemIndex");
    const sourceItemName = optionalString(args, "sourceItemName", "");
    const sourceItemType = optionalString(args, "sourceItemType", "");
    const fixExpressions = optionalBoolean(args, "fixExpressions", true);

    if (!sourceItemIndex && !sourceItemName) return toolResult("Provide sourceItemIndex or sourceItemName.", true);
    if (sourceItemType && !["comp", "footage"].includes(sourceItemType)) return toolResult("sourceItemType must be one of: comp, footage.", true);

    const result = await runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${aeLiteral(compName)});
      var layers = __codexResolveLayers(comp, ${layerIndices ? aeLiteral(layerIndices) : "null"});
      var sourceItem = __codexResolveProjectItem(${sourceItemIndex === null ? "null" : sourceItemIndex}, ${aeLiteral(sourceItemName)}, ${aeLiteral(sourceItemType)});
      if (!(sourceItem instanceof FootageItem) && !(sourceItem instanceof CompItem)) {
        throw new Error("Replacement source must be footage or a composition.");
      }
      var fixExpressions = ${fixExpressions ? "true" : "false"};

      app.beginUndoGroup("Codex Replace Layer Source");
      var changed = [];
      for (var __i = 0; __i < layers.length; __i++) {
        var layer = layers[__i];
        if (layer.locked) throw new Error("Layer is locked: " + layer.name);
        var before = __codexLayerInfo(layer);
        if (!layer.replaceSource) throw new Error("Layer source cannot be replaced: " + layer.name);
        layer.replaceSource(sourceItem, fixExpressions);
        changed.push({
          before: before,
          after: __codexLayerInfo(layer)
        });
      }
      var response = {
        comp: { itemIndex: __codexProjectIndexForItem(comp), name: comp.name },
        sourceItem: __codexItemReference(sourceItem),
        changedCount: changed.length,
        layers: changed.map(function (item) { return item.after; }),
        changed: changed
      };
      app.endUndoGroup();
      return response;
    `);
    return toolResult(result.result);
  }

  if (name === "rename_layers") {
    const compItemIndex = optionalPositiveInteger(args, "compItemIndex");
    const compName = optionalString(args, "compName", "");
    const layerIndices = optionalPositiveIntegerList(args, "layerIndices");
    const hasRenameName = Object.prototype.hasOwnProperty.call(args, "name") && args.name !== undefined && args.name !== null;
    const mode = optionalString(args, "mode", hasRenameName ? "exact" : hasArg(args, "prefix") ? "prefix" : hasArg(args, "suffix") ? "suffix" : "findReplace");
    const renameName = hasRenameName ? String(args.name) : "";
    const allowEmptyName = optionalBoolean(args, "allowEmptyName", false);
    const prefix = optionalString(args, "prefix", "");
    const suffix = optionalString(args, "suffix", "");
    const findText = optionalString(args, "find", "");
    const replaceText = optionalString(args, "replace", "");
    const caseSensitive = optionalBoolean(args, "caseSensitive", true);
    let expectedLayerNames = null;
    if (hasArg(args, "expectedLayerNames")) {
      expectedLayerNames = args.expectedLayerNames;
      if (typeof expectedLayerNames === "string" && expectedLayerNames.trim().startsWith("[")) {
        expectedLayerNames = JSON.parse(expectedLayerNames);
      }
      if (!Array.isArray(expectedLayerNames)) return toolResult("expectedLayerNames must be an array when provided.", true);
      expectedLayerNames = expectedLayerNames.map((value) => String(value));
      if (!layerIndices || expectedLayerNames.length !== layerIndices.length) {
        return toolResult("expectedLayerNames must have the same length as layerIndices.", true);
      }
    }

    if (!["exact", "prefix", "suffix", "findReplace"].includes(mode)) return toolResult("mode must be one of: exact, prefix, suffix, findReplace.", true);
    if (allowEmptyName) {
      if (mode !== "exact" || renameName !== "") return toolResult("allowEmptyName is only valid with mode:\"exact\" and name:\"\".", true);
      if (!layerIndices || layerIndices.length !== 1) return toolResult("Empty layer-name reset requires exactly one explicit layer index per rename_layers call.", true);
      if (!expectedLayerNames || expectedLayerNames.length !== 1) return toolResult("Empty layer-name reset requires expectedLayerNames for the target layer.", true);
    }

    const result = await runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${aeLiteral(compName)});
      var layers = __codexResolveLayers(comp, ${layerIndices ? aeLiteral(layerIndices) : "null"});
      var mode = ${aeLiteral(mode)};
      var exactName = ${aeLiteral(renameName)};
      var allowEmptyName = ${allowEmptyName ? "true" : "false"};
      var expectedLayerNames = ${expectedLayerNames ? aeLiteral(expectedLayerNames) : "null"};
      var prefix = ${aeLiteral(prefix)};
      var suffix = ${aeLiteral(suffix)};
      var findText = ${aeLiteral(findText)};
      var replaceText = ${aeLiteral(replaceText)};
      var caseSensitive = ${caseSensitive ? "true" : "false"};

      app.beginUndoGroup("Codex Rename Layers");
      var renamed = [];
      for (var __i = 0; __i < layers.length; __i++) {
        var layer = layers[__i];
        if (layer.locked) throw new Error("Layer is locked: " + layer.name);
        if (expectedLayerNames && layer.name !== expectedLayerNames[__i]) {
          throw new Error("Layer name mismatch at index " + layer.index + ". Expected '" + expectedLayerNames[__i] + "' but found '" + layer.name + "'.");
        }
        var beforeName = layer.name;
        var nextName = __codexRenameValue(beforeName, mode, __i + 1, layers.length, exactName, prefix, suffix, findText, replaceText, caseSensitive, allowEmptyName);
        layer.name = nextName;
        renamed.push({
          index: layer.index,
          before: beforeName,
          after: layer.name,
          layer: __codexLayerInfo(layer)
        });
      }
      var response = {
        comp: { itemIndex: __codexProjectIndexForItem(comp), name: comp.name },
        mode: mode,
        expectedLayerNames: expectedLayerNames,
        allowEmptyName: allowEmptyName,
        changedCount: renamed.length,
        renamed: renamed,
        layers: renamed.map(function (item) { return item.layer; })
      };
      app.endUndoGroup();
      return response;
    `);
    return toolResult(result.result);
  }

  if (name === "rename_project_items") {
    const itemIndices = optionalPositiveIntegerList(args, "itemIndices");
    const query = optionalString(args, "query", "");
    const type = optionalString(args, "type", "");
    const exactName = optionalBoolean(args, "exactName", false);
    const caseSensitive = optionalBoolean(args, "caseSensitive", false);
    const limit = Math.max(1, Math.min(100, Math.floor(optionalNumber(args, "limit", 25))));
    const mode = optionalString(args, "mode", hasArg(args, "name") ? "exact" : hasArg(args, "prefix") ? "prefix" : hasArg(args, "suffix") ? "suffix" : "findReplace");
    const renameName = optionalString(args, "name", "");
    const prefix = optionalString(args, "prefix", "");
    const suffix = optionalString(args, "suffix", "");
    const findText = optionalString(args, "find", "");
    const replaceText = optionalString(args, "replace", "");

    if (type && !["comp", "footage", "folder"].includes(type)) return toolResult("type must be one of: comp, footage, folder.", true);
    if (!itemIndices && !query) return toolResult("Provide itemIndices or query.", true);
    if (!["exact", "prefix", "suffix", "findReplace"].includes(mode)) return toolResult("mode must be one of: exact, prefix, suffix, findReplace.", true);

    const result = await runExtendScriptBody(`
      ${resolveCompScript}
      var requestedItemIndices = ${itemIndices ? aeLiteral(itemIndices) : "null"};
      var query = ${aeLiteral(query)};
      var type = ${aeLiteral(type)};
      var exactName = ${exactName ? "true" : "false"};
      var caseSensitive = ${caseSensitive ? "true" : "false"};
      var limit = ${limit};
      var mode = ${aeLiteral(mode)};
      var exactRenameName = ${aeLiteral(renameName)};
      var prefix = ${aeLiteral(prefix)};
      var suffix = ${aeLiteral(suffix)};
      var findText = ${aeLiteral(findText)};
      var replaceText = ${aeLiteral(replaceText)};
      var refs = [];

      if (requestedItemIndices && requestedItemIndices.length) {
        for (var __ri = 0; __ri < requestedItemIndices.length && refs.length < limit; __ri++) {
          var indexedItem = app.project.item(requestedItemIndices[__ri]);
          if (!indexedItem) throw new Error("Project item not found at index " + requestedItemIndices[__ri] + ".");
          if (!__codexMatchesItemType(indexedItem, type)) throw new Error("Project item does not match requested type: " + indexedItem.name);
          refs.push(__codexItemReference(indexedItem));
        }
      } else {
        refs = __codexFindProjectItems(query, type, exactName, caseSensitive, limit);
      }
      if (!refs.length) throw new Error("No project items matched.");

      app.beginUndoGroup("Codex Rename Project Items");
      var renamed = [];
      for (var __i = 0; __i < refs.length; __i++) {
        var item = app.project.item(refs[__i].itemIndex);
        var beforeName = item.name || "";
        var nextName = __codexRenameValue(beforeName, mode, __i + 1, refs.length, exactRenameName, prefix, suffix, findText, replaceText, caseSensitive);
        item.name = nextName;
        renamed.push({
          itemIndex: __codexProjectIndexForItem(item),
          before: beforeName,
          after: item.name,
          item: __codexItemReference(item)
        });
      }
      var response = {
        mode: mode,
        query: query,
        type: type,
        changedCount: renamed.length,
        renamed: renamed
      };
      app.endUndoGroup();
      return response;
    `);
    return toolResult(result.result);
  }

  if (name === "update_text_layer") {
    const compItemIndex = optionalPositiveInteger(args, "compItemIndex");
    const compName = optionalString(args, "compName", "");
    const layerIndex = requiredPositiveInteger(args, "layerIndex");
    const patch = {};
    for (const key of ["text", "font", "fontSize", "fillColor", "applyFill", "strokeColor", "applyStroke", "strokeWidth", "tracking", "leading"]) {
      if (hasArg(args, key)) patch[key] = args[key];
    }
    if (!Object.keys(patch).length) return toolResult("Provide at least one text field to update.", true);
    if (hasArg(patch, "fontSize") && Number(patch.fontSize) <= 0) return toolResult("fontSize must be greater than 0.", true);
    if (hasArg(patch, "strokeWidth") && Number(patch.strokeWidth) < 0) return toolResult("strokeWidth must be 0 or greater.", true);

    const result = await runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${aeLiteral(compName)});
      var layer = comp.layer(${layerIndex});
      if (!layer) throw new Error("Layer not found.");
      if (layer.locked) throw new Error("Layer is locked.");
      var patch = ${aeLiteral(patch)};
      var textProp = layer.property("ADBE Text Properties").property("ADBE Text Document");
      if (!textProp) throw new Error("Layer does not expose Source Text.");

      app.beginUndoGroup("Codex Update Text Layer");
      var before = __codexValuePreview(textProp);
      var doc = __codexApplyTextDocumentPatch(textProp, patch);
      textProp.setValue(doc);
      var response = {
        comp: { itemIndex: __codexProjectIndexForItem(comp), name: comp.name },
        layer: __codexLayerInfo(layer),
        before: before,
        text: __codexValuePreview(textProp)
      };
      app.endUndoGroup();
      return response;
    `);
    return toolResult(result.result);
  }

  if (name === "create_shape_layer") {
    const compItemIndex = optionalPositiveInteger(args, "compItemIndex");
    const compName = optionalString(args, "compName", "");
    const shape = optionalString(args, "shape", "rectangle");
    const layerName = optionalString(args, "name", "Codex Shape");
    const size = optionalNumberArray(args, "size", null, 2, 2);
    const position = optionalNumberArray(args, "position", null, 2, 3);
    const fillColor = optionalNumberArray(args, "fillColor", [1, 1, 1], 3, 3);
    const strokeColor = optionalNumberArray(args, "strokeColor", null, 3, 3);
    const strokeWidth = optionalNumber(args, "strokeWidth", 0);
    const startTime = optionalNumber(args, "startTime", null);
    const duration = optionalNumber(args, "duration", null);

    if (!["rectangle", "ellipse"].includes(shape)) return toolResult("shape must be one of: rectangle, ellipse.", true);
    if (size && (size[0] <= 0 || size[1] <= 0)) return toolResult("size values must be greater than 0.", true);
    if (fillColor.some((value) => value < 0 || value > 1)) return toolResult("fillColor values must be between 0 and 1.", true);
    if (strokeColor && strokeColor.some((value) => value < 0 || value > 1)) return toolResult("strokeColor values must be between 0 and 1.", true);
    if (strokeWidth < 0) return toolResult("strokeWidth must be 0 or greater.", true);
    if (duration !== null && duration <= 0) return toolResult("duration must be greater than 0.", true);

    const result = await runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${aeLiteral(compName)});
      var shapeType = ${aeLiteral(shape)};
      var layerName = ${aeLiteral(layerName)};
      var requestedSize = ${size ? aeLiteral(size) : "[comp.width / 2, comp.height / 2]"};
      var requestedPosition = ${position ? aeLiteral(position) : "[comp.width / 2, comp.height / 2]"};
      var fillColor = ${aeLiteral(fillColor)};
      var strokeColor = ${strokeColor ? aeLiteral(strokeColor) : "null"};
      var strokeWidth = ${strokeWidth};
      var requestedStartTime = ${startTime === null ? "null" : startTime};
      var requestedDuration = ${duration === null ? "null" : duration};

      app.beginUndoGroup("Codex Create Shape Layer");
      var layer = comp.layers.addShape();
      if (layerName) layer.name = layerName;
      var root = layer.property("ADBE Root Vectors Group");
      var group = root.addProperty("ADBE Vector Group");
      group.name = shapeType === "ellipse" ? "Ellipse" : "Rectangle";
      var contents = group.property("ADBE Vectors Group");
      var shapeProp = contents.addProperty(shapeType === "ellipse" ? "ADBE Vector Shape - Ellipse" : "ADBE Vector Shape - Rect");
      var sizeProp = shapeProp.property(shapeType === "ellipse" ? "ADBE Vector Ellipse Size" : "ADBE Vector Rect Size");
      if (sizeProp) sizeProp.setValue(requestedSize);
      var fill = contents.addProperty("ADBE Vector Graphic - Fill");
      fill.property("ADBE Vector Fill Color").setValue(fillColor);
      if (strokeColor !== null || strokeWidth > 0) {
        var stroke = contents.addProperty("ADBE Vector Graphic - Stroke");
        if (strokeColor !== null) stroke.property("ADBE Vector Stroke Color").setValue(strokeColor);
        stroke.property("ADBE Vector Stroke Width").setValue(strokeWidth);
      }
      var transform = layer.property("ADBE Transform Group");
      transform.property("ADBE Position").setValue(requestedPosition);
      if (requestedStartTime !== null) {
        layer.startTime = requestedStartTime;
        layer.inPoint = requestedStartTime;
      }
      if (requestedDuration !== null) {
        var baseTime = requestedStartTime !== null ? requestedStartTime : layer.inPoint;
        layer.outPoint = Math.min(baseTime + requestedDuration, comp.duration);
      }
      var response = {
        comp: { itemIndex: __codexProjectIndexForItem(comp), name: comp.name },
        layer: __codexLayerInfo(layer),
        shape: { type: shapeType, size: requestedSize, fillColor: fillColor, strokeColor: strokeColor, strokeWidth: strokeWidth }
      };
      app.endUndoGroup();
      return response;
    `);
    return toolResult(result.result);
  }

  if (name === "create_layer_connection_line") {
    const compItemIndex = optionalPositiveInteger(args, "compItemIndex");
    const compName = optionalString(args, "compName", "");
    const fromLayerIndex = requiredPositiveInteger(args, "fromLayerIndex");
    const toLayerIndex = requiredPositiveInteger(args, "toLayerIndex");
    const expectedFromLayerName = optionalString(args, "expectedFromLayerName", "");
    const expectedToLayerName = optionalString(args, "expectedToLayerName", "");
    const layerName = optionalString(args, "name", "Codex Connection Line");
    const pathGroupName = optionalString(args, "pathGroupName", "Connector");
    const strokeColor = optionalNumberArray(args, "strokeColor", [1, 1, 1], 3, 3);
    const strokeWidth = optionalNumber(args, "strokeWidth", 4);
    const startTime = optionalNumber(args, "startTime", null);
    const duration = optionalNumber(args, "duration", null);
    const lockLayer = optionalBoolean(args, "lockLayer", true);

    if (compItemIndex === null && !compName) return toolResult("compItemIndex or compName is required for create_layer_connection_line.", true);
    if (fromLayerIndex === toLayerIndex) return toolResult("fromLayerIndex and toLayerIndex must target two different layers.", true);
    if (strokeColor.some((value) => value < 0 || value > 1)) return toolResult("strokeColor values must be between 0 and 1.", true);
    if (strokeWidth <= 0) return toolResult("strokeWidth must be greater than 0.", true);
    if (duration !== null && duration <= 0) return toolResult("duration must be greater than 0.", true);

    const result = await runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${aeLiteral(compName)});
      var fromLayer = comp.layer(${fromLayerIndex});
      var toLayer = comp.layer(${toLayerIndex});
      if (!fromLayer) throw new Error("fromLayerIndex did not resolve to a layer.");
      if (!toLayer) throw new Error("toLayerIndex did not resolve to a layer.");
      if (fromLayer === toLayer) throw new Error("fromLayerIndex and toLayerIndex must target two different layers.");
      var expectedFromLayerName = ${aeLiteral(expectedFromLayerName)};
      var expectedToLayerName = ${aeLiteral(expectedToLayerName)};
      if (expectedFromLayerName && fromLayer.name !== expectedFromLayerName) {
        throw new Error("fromLayer name mismatch. Expected '" + expectedFromLayerName + "' but found '" + fromLayer.name + "'.");
      }
      if (expectedToLayerName && toLayer.name !== expectedToLayerName) {
        throw new Error("toLayer name mismatch. Expected '" + expectedToLayerName + "' but found '" + toLayer.name + "'.");
      }
      var layerName = ${aeLiteral(layerName)};
      var pathGroupName = ${aeLiteral(pathGroupName)};
      var strokeColor = ${aeLiteral(strokeColor)};
      var strokeWidth = ${strokeWidth};
      var requestedStartTime = ${startTime === null ? "null" : startTime};
      var requestedDuration = ${duration === null ? "null" : duration};
      var lockLayer = ${lockLayer ? "true" : "false"};

      function __codexExpressionString(value) {
        return JSON.stringify(String(value || ""));
      }

      function __codexLayerPosition2D(targetLayer) {
        var transform = targetLayer.property("ADBE Transform Group");
        var positionProp = transform ? transform.property("ADBE Position") : null;
        var position = positionProp ? positionProp.value : [0, 0];
        return [Number(position[0]) || 0, Number(position[1]) || 0];
      }

      function __codexOpenPath(points) {
        var shape = new Shape();
        shape.vertices = points;
        shape.inTangents = [[0, 0], [0, 0]];
        shape.outTangents = [[0, 0], [0, 0]];
        shape.closed = false;
        return shape;
      }

      function __codexPathGeometryInfo(prop, owningLayer) {
        var info = __codexPropertyInfo(prop, owningLayer, true, true);
        info.geometry = __codexShapeGeometryData(prop.value, 80);
        return info;
      }

      app.beginUndoGroup("Codex Create Layer Connection Line");
      var lineLayer = comp.layers.addShape();
      if (layerName) lineLayer.name = layerName;
      var transform = lineLayer.property("ADBE Transform Group");
      if (transform && transform.property("ADBE Position")) transform.property("ADBE Position").setValue([0, 0]);
      if (requestedStartTime !== null) {
        lineLayer.startTime = requestedStartTime;
        lineLayer.inPoint = requestedStartTime;
      }
      if (requestedDuration !== null) {
        var baseTime = requestedStartTime !== null ? requestedStartTime : lineLayer.inPoint;
        lineLayer.outPoint = Math.min(baseTime + requestedDuration, comp.duration);
      }

      var root = lineLayer.property("ADBE Root Vectors Group");
      var group = root.addProperty("ADBE Vector Group");
      group.name = pathGroupName || "Connector";
      var contents = group.property("ADBE Vectors Group");
      var pathGroup = contents.addProperty("ADBE Vector Shape - Group");
      pathGroup.name = "Connector Path";
      var pathProp = pathGroup.property("ADBE Vector Shape");
      if (!pathProp) throw new Error("Could not create connector path property.");
      var stroke = contents.addProperty("ADBE Vector Graphic - Stroke");
      if (!stroke) throw new Error("Could not create connector stroke.");
      stroke.property("ADBE Vector Stroke Color").setValue(strokeColor);
      stroke.property("ADBE Vector Stroke Width").setValue(strokeWidth);

      var initialPoints = [__codexLayerPosition2D(fromLayer), __codexLayerPosition2D(toLayer)];
      pathProp.setValue(__codexOpenPath(initialPoints));
      if (!pathProp.canSetExpression) throw new Error("Connector path property cannot receive expressions.");
      var expression = [
        "var fromLayer = thisComp.layer(" + __codexExpressionString(fromLayer.name) + ");",
        "var toLayer = thisComp.layer(" + __codexExpressionString(toLayer.name) + ");",
        "var fromPoint = thisLayer.fromComp(fromLayer.toComp(fromLayer.transform.anchorPoint));",
        "var toPoint = thisLayer.fromComp(toLayer.toComp(toLayer.transform.anchorPoint));",
        "createPath([[fromPoint[0], fromPoint[1]], [toPoint[0], toPoint[1]]], [[0, 0], [0, 0]], [[0, 0], [0, 0]], false);"
      ].join("\\n");
      pathProp.expression = expression;
      try { pathProp.expressionEnabled = true; } catch (__expressionEnabledError) {}
      if (lockLayer) lineLayer.locked = true;

      var pathInfo = __codexPathGeometryInfo(pathProp, lineLayer);
      var geometry = pathInfo.geometry || {};
      var expressionValue = pathProp.expression || "";
      var expressionError = pathProp.expressionError || "";
      var postVerification = {
        ok: geometry.closed === false &&
          Number(geometry.vertexCount || 0) === 2 &&
          pathProp.expressionEnabled === true &&
          expressionValue === expression &&
          !expressionError &&
          (!lockLayer || lineLayer.locked === true),
        pathOpen: geometry.closed === false,
        vertexCount: Number(geometry.vertexCount || 0),
        expressionEnabled: pathProp.expressionEnabled === true,
        expressionMatches: expressionValue === expression,
        expressionError: expressionError,
        locked: lineLayer.locked === true,
        lockRequested: lockLayer,
        connectorLayerIsTop: lineLayer.index === 1,
        fromLayerNameMatches: !expectedFromLayerName || fromLayer.name === expectedFromLayerName,
        toLayerNameMatches: !expectedToLayerName || toLayer.name === expectedToLayerName
      };
      var response = {
        comp: { itemIndex: __codexProjectIndexForItem(comp), name: comp.name },
        connector: __codexLayerInfo(lineLayer),
        layer: __codexLayerInfo(lineLayer),
        targets: {
          from: __codexLayerInfo(fromLayer),
          to: __codexLayerInfo(toLayer)
        },
        path: pathInfo,
        pathGeometry: pathInfo,
        stroke: {
          color: strokeColor,
          width: strokeWidth
        },
        expression: expressionValue,
        expressionEnabled: pathProp.expressionEnabled === true,
        expressionError: expressionError,
        postVerification: postVerification
      };
      app.endUndoGroup();
      return response;
    `);
    return toolResult(result.result);
  }

  if (name === "create_layer_mask") {
    const compItemIndex = optionalPositiveInteger(args, "compItemIndex");
    const compName = optionalString(args, "compName", "");
    const layerIndex = requiredPositiveInteger(args, "layerIndex");
    const maskName = optionalString(args, "name", "Codex Mask");
    const vertices = requiredPointArray(args, "vertices", 3, 50);
    const maskMode = optionalString(args, "maskMode", "add").toLowerCase();
    const opacity = optionalNumber(args, "opacity", null);
    const feather = optionalNumberArray(args, "feather", null, 2, 2);
    const expansion = optionalNumber(args, "expansion", null);
    const coordinateLimit = 1000000;

    if (maskMode !== "add") return toolResult("maskMode must be add for the first mask safety slice.", true);
    if (vertices.some((point) => Math.abs(point[0]) > coordinateLimit || Math.abs(point[1]) > coordinateLimit)) {
      return toolResult("vertices values must be between -1000000 and 1000000.", true);
    }
    if (opacity !== null && (opacity < 0 || opacity > 100)) return toolResult("opacity must be between 0 and 100.", true);
    if (feather && feather.some((value) => value < 0)) return toolResult("feather values must be 0 or greater.", true);

    const result = await runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${aeLiteral(compName)});
      var layer = comp.layer(${layerIndex});
      if (!layer) throw new Error("Layer not found.");
      var maskName = ${aeLiteral(maskName)};
      var requestedVertices = ${aeLiteral(vertices)};
      var requestedOpacity = ${opacity === null ? "null" : opacity};
      var requestedFeather = ${feather ? aeLiteral(feather) : "null"};
      var requestedExpansion = ${expansion === null ? "null" : expansion};

      function __codexMaskPointList(points, limit) {
        var list = [];
        if (!points) return list;
        for (var __mp = 0; __mp < points.length && __mp < limit; __mp++) {
          var point = points[__mp];
          list.push([point[0], point[1]]);
        }
        return list;
      }

      function __codexZeroTangents(points) {
        var tangents = [];
        for (var __zt = 0; __zt < points.length; __zt++) tangents.push([0, 0]);
        return tangents;
      }

      function __codexFindChildProperty(group, matchName, fallbackName) {
        if (!group) return null;
        try {
          var direct = group.property(matchName);
          if (direct) return direct;
        } catch (__directPropertyError) {}
        if (fallbackName) {
          try {
            var fallback = group.property(fallbackName);
            if (fallback) return fallback;
          } catch (__fallbackPropertyError) {}
        }
        try {
          for (var __cp = 1; __cp <= group.numProperties; __cp++) {
            var child = group.property(__cp);
            if (child && (child.matchName === matchName || child.name === fallbackName)) return child;
          }
        } catch (__childPropertyError) {}
        return null;
      }

      function __codexAddMask(maskGroup) {
        var mask = null;
        try { mask = maskGroup.addProperty("ADBE Mask Atom"); } catch (__addMatchNameError) {}
        if (!mask) {
          try { mask = maskGroup.addProperty("Mask"); } catch (__addDisplayNameError) {}
        }
        if (!mask) throw new Error("Could not create mask atom on layer.");
        return mask;
      }

      function __codexMaskShapeInfo(mask) {
        var shapeProp = __codexFindChildProperty(mask, "ADBE Mask Shape", "Mask Path");
        var shape = shapeProp ? shapeProp.value : null;
        if (!shape) return null;
        return {
          closed: shape.closed === true,
          vertexCount: shape.vertices ? shape.vertices.length : 0,
          vertices: __codexMaskPointList(shape.vertices, 50),
          inTangents: __codexMaskPointList(shape.inTangents, 50),
          outTangents: __codexMaskPointList(shape.outTangents, 50),
          truncated: shape.vertices && shape.vertices.length > 50
        };
      }

      function __codexReadValue(prop) {
        try {
          if (!prop) return null;
          var value = prop.value;
          if (value instanceof Array) {
            var copy = [];
            for (var __rv = 0; __rv < value.length; __rv++) copy.push(value[__rv]);
            return copy;
          }
          return value;
        } catch (__readValueError) {
          return null;
        }
      }

      app.beginUndoGroup("Codex Create Layer Mask");
      var maskGroup = layer.property("ADBE Mask Parade");
      if (!maskGroup) throw new Error("Layer does not support masks.");
      var mask = __codexAddMask(maskGroup);
      if (maskName) mask.name = maskName;
      mask.maskMode = MaskMode.ADD;
      mask.inverted = false;

      var shape = new Shape();
      shape.vertices = requestedVertices;
      shape.inTangents = __codexZeroTangents(requestedVertices);
      shape.outTangents = __codexZeroTangents(requestedVertices);
      shape.closed = true;
      var shapeProperty = __codexFindChildProperty(mask, "ADBE Mask Shape", "Mask Path");
      if (!shapeProperty) throw new Error("Mask shape property was not found.");
      shapeProperty.setValue(shape);

      var opacityProperty = __codexFindChildProperty(mask, "ADBE Mask Opacity", "Mask Opacity");
      var featherProperty = __codexFindChildProperty(mask, "ADBE Mask Feather", "Mask Feather");
      var expansionProperty = __codexFindChildProperty(mask, "ADBE Mask Expansion", "Mask Expansion");
      if (requestedOpacity !== null) {
        if (!opacityProperty) throw new Error("Mask opacity property was not found.");
        opacityProperty.setValue(requestedOpacity);
      }
      if (requestedFeather !== null) {
        if (!featherProperty) throw new Error("Mask feather property was not found.");
        featherProperty.setValue(requestedFeather);
      }
      if (requestedExpansion !== null) {
        if (!expansionProperty) throw new Error("Mask expansion property was not found.");
        expansionProperty.setValue(requestedExpansion);
      }

      var response = {
        comp: { itemIndex: __codexProjectIndexForItem(comp), name: comp.name },
        layer: __codexLayerInfo(layer),
        mask: {
          propertyIndex: mask.propertyIndex,
          name: mask.name,
          matchName: mask.matchName,
          maskMode: "add",
          inverted: mask.inverted,
          shape: __codexMaskShapeInfo(mask),
          opacity: __codexReadValue(opacityProperty),
          feather: __codexReadValue(featherProperty),
          expansion: __codexReadValue(expansionProperty)
        }
      };
      app.endUndoGroup();
      return response;
    `);
    return toolResult(result.result);
  }

  if (name === "set_layer_mask") {
    const compItemIndex = optionalPositiveInteger(args, "compItemIndex");
    const compName = optionalString(args, "compName", "");
    const layerIndex = requiredPositiveInteger(args, "layerIndex");
    const operation = optionalString(args, "operation", "").toLowerCase();
    const maskIndex = optionalPositiveInteger(args, "maskIndex");
    const expectedMaskName = optionalString(args, "expectedMaskName", "");
    const maskName = optionalString(args, "name", "Codex Mask");
    const hasVertices = hasArg(args, "vertices");
    const vertices = hasVertices ? requiredPointArray(args, "vertices", 3, 50) : null;
    const hasMaskMode = hasArg(args, "maskMode");
    const maskMode = hasMaskMode ? optionalString(args, "maskMode", "").toLowerCase() : "";
    const hasInverted = hasArg(args, "inverted");
    const inverted = optionalBoolean(args, "inverted", null);
    const hasOpacity = hasArg(args, "opacity");
    const opacity = optionalNumber(args, "opacity", null);
    const hasFeather = hasArg(args, "feather");
    const feather = optionalNumberArray(args, "feather", null, 2, 2);
    const hasExpansion = hasArg(args, "expansion");
    const expansion = optionalNumber(args, "expansion", null);
    const coordinateLimit = 1000000;
    const allowedMaskModes = new Set(["add", "subtract", "intersect", "lighten", "darken", "difference", "none"]);

    if (compItemIndex === null && !compName) return toolResult("compItemIndex or compName is required for set_layer_mask.", true);
    if (!["create", "update"].includes(operation)) return toolResult("operation must be create or update.", true);
    if (hasArg(args, "delete") || hasArg(args, "remove") || hasArg(args, "maskIndices") || hasArg(args, "roto") || hasArg(args, "rotobrush")) {
      return toolResult("set_layer_mask supports one create/update target only; delete, bulk mask, and roto fields are not allowed.", true);
    }
    if (operation === "create" && !vertices) return toolResult("vertices are required for create.", true);
    if (operation === "update" && maskIndex === null) return toolResult("maskIndex is required for update.", true);
    if (operation === "update" && hasArg(args, "name")) return toolResult("set_layer_mask update mode does not rename masks.", true);
    if (operation === "update" && !hasVertices && !hasMaskMode && !hasInverted && !hasOpacity && !hasFeather && !hasExpansion) {
      return toolResult("At least one bounded mask field is required for update.", true);
    }
    if (maskMode && !allowedMaskModes.has(maskMode)) return toolResult("maskMode must be one of: add, subtract, intersect, lighten, darken, difference, none.", true);
    if (vertices && vertices.some((point) => Math.abs(point[0]) > coordinateLimit || Math.abs(point[1]) > coordinateLimit)) {
      return toolResult("vertices values must be between -1000000 and 1000000.", true);
    }
    if (opacity !== null && (opacity < 0 || opacity > 100)) return toolResult("opacity must be between 0 and 100.", true);
    if (feather && feather.some((value) => value < 0)) return toolResult("feather values must be 0 or greater.", true);

    const effectiveMaskMode = maskMode || (operation === "create" ? "add" : "");

    const result = await runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${aeLiteral(compName)});
      var layer = comp.layer(${layerIndex});
      if (!layer) throw new Error("Layer not found.");
      if (layer.locked) throw new Error("Layer is locked.");
      var operation = ${aeLiteral(operation)};
      var requestedMaskIndex = ${maskIndex === null ? "null" : maskIndex};
      var expectedMaskName = ${aeLiteral(expectedMaskName)};
      var maskName = ${aeLiteral(maskName)};
      var requestedVertices = ${vertices ? aeLiteral(vertices) : "null"};
      var requestedMaskMode = ${effectiveMaskMode ? aeLiteral(effectiveMaskMode) : "null"};
      var requestedInverted = ${inverted === null ? "null" : inverted ? "true" : "false"};
      var requestedOpacity = ${opacity === null ? "null" : opacity};
      var requestedFeather = ${feather ? aeLiteral(feather) : "null"};
      var requestedExpansion = ${expansion === null ? "null" : expansion};

      function __codexMaskPointList(points, limit) {
        var list = [];
        if (!points) return list;
        for (var __mp = 0; __mp < points.length && __mp < limit; __mp++) {
          var point = points[__mp];
          list.push([point[0], point[1]]);
        }
        return list;
      }

      function __codexZeroTangents(points) {
        var tangents = [];
        for (var __zt = 0; __zt < points.length; __zt++) tangents.push([0, 0]);
        return tangents;
      }

      function __codexFindChildProperty(group, matchName, fallbackName) {
        if (!group) return null;
        try {
          var direct = group.property(matchName);
          if (direct) return direct;
        } catch (__directPropertyError) {}
        if (fallbackName) {
          try {
            var fallback = group.property(fallbackName);
            if (fallback) return fallback;
          } catch (__fallbackPropertyError) {}
        }
        try {
          for (var __cp = 1; __cp <= group.numProperties; __cp++) {
            var child = group.property(__cp);
            if (child && (child.matchName === matchName || child.name === fallbackName)) return child;
          }
        } catch (__childPropertyError) {}
        return null;
      }

      function __codexReadValue(prop) {
        try {
          if (!prop) return null;
          var value = prop.value;
          if (value instanceof Array) {
            var copy = [];
            for (var __rv = 0; __rv < value.length; __rv++) copy.push(value[__rv]);
            return copy;
          }
          return value;
        } catch (__readValueError) {
          return null;
        }
      }

      function __codexModeName(value) {
        try {
          if (value === MaskMode.ADD) return "add";
          if (value === MaskMode.SUBTRACT) return "subtract";
          if (value === MaskMode.INTERSECT) return "intersect";
          if (value === MaskMode.LIGHTEN) return "lighten";
          if (value === MaskMode.DARKEN) return "darken";
          if (value === MaskMode.DIFFERENCE) return "difference";
          if (value === MaskMode.NONE) return "none";
        } catch (__modeNameError) {}
        return String(value);
      }

      function __codexModeValue(value) {
        if (value === "add") return MaskMode.ADD;
        if (value === "subtract") return MaskMode.SUBTRACT;
        if (value === "intersect") return MaskMode.INTERSECT;
        if (value === "lighten") return MaskMode.LIGHTEN;
        if (value === "darken") return MaskMode.DARKEN;
        if (value === "difference") return MaskMode.DIFFERENCE;
        if (value === "none") return MaskMode.NONE;
        throw new Error("Unsupported mask mode: " + value);
      }

      function __codexMaskShapeInfo(mask) {
        var shapeProp = __codexFindChildProperty(mask, "ADBE Mask Shape", "Mask Path");
        var shape = shapeProp ? shapeProp.value : null;
        if (!shape) return null;
        return {
          closed: shape.closed === true,
          vertexCount: shape.vertices ? shape.vertices.length : 0,
          vertices: __codexMaskPointList(shape.vertices, 50),
          inTangents: __codexMaskPointList(shape.inTangents, 50),
          outTangents: __codexMaskPointList(shape.outTangents, 50),
          truncated: shape.vertices && shape.vertices.length > 50
        };
      }

      function __codexMaskInfo(mask) {
        if (!mask) return null;
        var opacityProperty = __codexFindChildProperty(mask, "ADBE Mask Opacity", "Mask Opacity");
        var featherProperty = __codexFindChildProperty(mask, "ADBE Mask Feather", "Mask Feather");
        var expansionProperty = __codexFindChildProperty(mask, "ADBE Mask Expansion", "Mask Expansion");
        return {
          propertyIndex: mask.propertyIndex,
          name: mask.name,
          matchName: mask.matchName,
          maskMode: __codexModeName(mask.maskMode),
          inverted: mask.inverted,
          shape: __codexMaskShapeInfo(mask),
          opacity: __codexReadValue(opacityProperty),
          feather: __codexReadValue(featherProperty),
          expansion: __codexReadValue(expansionProperty)
        };
      }

      function __codexMaskSummary(maskGroup) {
        var items = [];
        var count = maskGroup ? maskGroup.numProperties : 0;
        for (var __ms = 1; __ms <= count; __ms++) {
          items.push(__codexMaskInfo(maskGroup.property(__ms)));
        }
        return { count: count, items: items };
      }

      function __codexNear(a, b) {
        return Math.abs(Number(a) - Number(b)) <= 0.0001;
      }

      function __codexArrayNear(a, b) {
        if (!a || !b || a.length !== b.length) return false;
        for (var __an = 0; __an < a.length; __an++) {
          if (!__codexNear(a[__an], b[__an])) return false;
        }
        return true;
      }

      function __codexVerticesMatch(actualShape, expectedVertices) {
        if (!expectedVertices) return true;
        if (!actualShape || !actualShape.vertices || actualShape.vertices.length !== expectedVertices.length) return false;
        for (var __vm = 0; __vm < expectedVertices.length; __vm++) {
          if (!__codexArrayNear(actualShape.vertices[__vm], expectedVertices[__vm])) return false;
        }
        return true;
      }

      app.beginUndoGroup("Codex Set Layer Mask");
      var maskGroup = layer.property("ADBE Mask Parade");
      if (!maskGroup) throw new Error("Layer does not support masks.");
      var beforeMasks = __codexMaskSummary(maskGroup);
      var targetMask = null;
      if (operation === "create") {
        try { targetMask = maskGroup.addProperty("ADBE Mask Atom"); } catch (__addMatchNameError) {}
        if (!targetMask) {
          try { targetMask = maskGroup.addProperty("Mask"); } catch (__addDisplayNameError) {}
        }
        if (!targetMask) throw new Error("Could not create mask atom on layer.");
        if (maskName) targetMask.name = maskName;
      } else {
        if (requestedMaskIndex < 1 || requestedMaskIndex > maskGroup.numProperties) throw new Error("maskIndex is outside the layer mask range.");
        targetMask = maskGroup.property(requestedMaskIndex);
        if (!targetMask) throw new Error("Mask not found at maskIndex " + requestedMaskIndex + ".");
        if (expectedMaskName && targetMask.name !== expectedMaskName) {
          throw new Error("Mask name mismatch. Expected '" + expectedMaskName + "' but found '" + targetMask.name + "'.");
        }
      }
      var beforeMask = operation === "update" ? __codexMaskInfo(targetMask) : null;
      if (requestedMaskMode !== null) targetMask.maskMode = __codexModeValue(requestedMaskMode);
      if (requestedInverted !== null) targetMask.inverted = requestedInverted;
      if (requestedVertices !== null) {
        var shape = new Shape();
        shape.vertices = requestedVertices;
        shape.inTangents = __codexZeroTangents(requestedVertices);
        shape.outTangents = __codexZeroTangents(requestedVertices);
        shape.closed = true;
        var shapeProperty = __codexFindChildProperty(targetMask, "ADBE Mask Shape", "Mask Path");
        if (!shapeProperty) throw new Error("Mask shape property was not found.");
        shapeProperty.setValue(shape);
      }
      var opacityProperty = __codexFindChildProperty(targetMask, "ADBE Mask Opacity", "Mask Opacity");
      var featherProperty = __codexFindChildProperty(targetMask, "ADBE Mask Feather", "Mask Feather");
      var expansionProperty = __codexFindChildProperty(targetMask, "ADBE Mask Expansion", "Mask Expansion");
      if (requestedOpacity !== null) {
        if (!opacityProperty) throw new Error("Mask opacity property was not found.");
        opacityProperty.setValue(requestedOpacity);
      }
      if (requestedFeather !== null) {
        if (!featherProperty) throw new Error("Mask feather property was not found.");
        featherProperty.setValue(requestedFeather);
      }
      if (requestedExpansion !== null) {
        if (!expansionProperty) throw new Error("Mask expansion property was not found.");
        expansionProperty.setValue(requestedExpansion);
      }
      var afterMask = __codexMaskInfo(targetMask);
      var afterMasks = __codexMaskSummary(maskGroup);
      var expectedMaskCountAfter = beforeMasks.count + (operation === "create" ? 1 : 0);
      var postVerification = {
        ok: afterMasks.count === expectedMaskCountAfter &&
          __codexVerticesMatch(afterMask.shape, requestedVertices) &&
          (requestedMaskMode === null || afterMask.maskMode === requestedMaskMode) &&
          (requestedInverted === null || afterMask.inverted === requestedInverted) &&
          (requestedOpacity === null || __codexNear(afterMask.opacity, requestedOpacity)) &&
          (requestedFeather === null || __codexArrayNear(afterMask.feather, requestedFeather)) &&
          (requestedExpansion === null || __codexNear(afterMask.expansion, requestedExpansion)),
        operation: operation,
        beforeMaskCount: beforeMasks.count,
        afterMaskCount: afterMasks.count,
        expectedMaskCountAfter: expectedMaskCountAfter,
        maskCountMatches: afterMasks.count === expectedMaskCountAfter,
        maskIndex: afterMask ? afterMask.propertyIndex : null,
        expectedMaskName: expectedMaskName || (operation === "create" ? maskName : ""),
        expectedMaskNameMatches: expectedMaskName ? afterMask.name === expectedMaskName : true,
        verticesMatch: __codexVerticesMatch(afterMask.shape, requestedVertices),
        maskModeMatches: requestedMaskMode === null || afterMask.maskMode === requestedMaskMode,
        invertedMatches: requestedInverted === null || afterMask.inverted === requestedInverted,
        opacityMatches: requestedOpacity === null || __codexNear(afterMask.opacity, requestedOpacity),
        featherMatches: requestedFeather === null || __codexArrayNear(afterMask.feather, requestedFeather),
        expansionMatches: requestedExpansion === null || __codexNear(afterMask.expansion, requestedExpansion)
      };
      var response = {
        comp: { itemIndex: __codexProjectIndexForItem(comp), name: comp.name },
        layer: __codexLayerInfo(layer),
        operation: operation,
        beforeMasks: beforeMasks,
        afterMasks: afterMasks,
        beforeMask: beforeMask,
        mask: afterMask,
        afterMask: afterMask,
        postVerification: postVerification
      };
      app.endUndoGroup();
      return response;
    `);
    return toolResult(result.result);
  }

  if (name === "set_path_geometry") {
    const compItemIndex = optionalPositiveInteger(args, "compItemIndex");
    const compName = optionalString(args, "compName", "");
    const layerIndex = requiredPositiveInteger(args, "layerIndex");
    const targetKind = optionalString(args, "targetKind", "").toLowerCase();
    const expectedLayerName = optionalString(args, "expectedLayerName", "");
    const expectedMaskName = optionalString(args, "expectedMaskName", "");
    const clearExisting = optionalBoolean(args, "clearExisting", false);
    let propertyPath = null;
    let maskIndex = null;
    let geometry = null;
    let keyframes = null;

    if (compItemIndex === null && !compName) return toolResult("compItemIndex or compName is required for set_path_geometry.", true);
    if (!["shape", "mask"].includes(targetKind)) return toolResult("targetKind must be shape or mask.", true);
    if (targetKind === "shape") {
      try {
        propertyPath = normalizePropertyPathArg(args, "propertyPath");
      } catch (error) {
        return toolResult(error.message || String(error), true);
      }
    } else {
      maskIndex = optionalPositiveInteger(args, "maskIndex");
      if (maskIndex === null) return toolResult("maskIndex is required for targetKind=mask.", true);
    }

    try {
      geometry = optionalPathGeometry(args, "geometry", null) || pathGeometryFromTopLevelArgs(args);
      if (hasArg(args, "keyframes")) keyframes = requiredPathGeometryKeyframes(args, "keyframes");
    } catch (error) {
      return toolResult(error.message || String(error), true);
    }
    if (geometry && keyframes) return toolResult("Provide either geometry or keyframes, not both.", true);
    if (!geometry && !keyframes) return toolResult("geometry or keyframes are required for set_path_geometry.", true);

    const result = await runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${aeLiteral(compName)});
      var layer = comp.layer(${layerIndex});
      if (!layer) throw new Error("Layer not found.");
      if (layer.locked) throw new Error("Layer is locked.");
      var targetKind = ${aeLiteral(targetKind)};
      var propertyPath = ${propertyPath ? aeLiteral(propertyPath) : "null"};
      var requestedMaskIndex = ${maskIndex === null ? "null" : maskIndex};
      var expectedLayerName = ${aeLiteral(expectedLayerName)};
      var expectedMaskName = ${aeLiteral(expectedMaskName)};
      var requestedGeometry = ${geometry ? aeLiteral(geometry) : "null"};
      var requestedKeyframes = ${keyframes ? aeLiteral(keyframes) : "null"};
      var clearExisting = ${clearExisting ? "true" : "false"};

      function __codexFindChildProperty(group, matchName, fallbackName) {
        if (!group) return null;
        try {
          var direct = group.property(matchName);
          if (direct) return direct;
        } catch (__directPropertyError) {}
        if (fallbackName) {
          try {
            var fallback = group.property(fallbackName);
            if (fallback) return fallback;
          } catch (__fallbackPropertyError) {}
        }
        try {
          for (var __cp = 1; __cp <= group.numProperties; __cp++) {
            var child = group.property(__cp);
            if (child && (child.matchName === matchName || child.name === fallbackName)) return child;
          }
        } catch (__childPropertyError) {}
        return null;
      }

      function __codexBuildShapeFromGeometry(data) {
        var shape = new Shape();
        shape.vertices = data.vertices;
        shape.inTangents = data.inTangents;
        shape.outTangents = data.outTangents;
        shape.closed = data.closed === true;
        return shape;
      }

      function __codexPathGeometryInfo(prop, owningLayer, includeKeys, limit) {
        var info = __codexPropertyInfo(prop, owningLayer, false, false);
        info.geometry = __codexShapeGeometryData(prop.value, 80);
        if (includeKeys) {
          info.keyframes = [];
          var keyCount = 0;
          try { keyCount = prop.numKeys || 0; } catch (__numKeysError) {}
          var maxKeys = Math.min(keyCount, limit);
          for (var __keyIndex = 1; __keyIndex <= maxKeys; __keyIndex++) {
            info.keyframes.push({
              index: __keyIndex,
              time: prop.keyTime(__keyIndex),
              geometry: __codexShapeGeometryData(prop.keyValue(__keyIndex), 80)
            });
          }
          info.keyframesTruncated = keyCount > maxKeys;
        }
        return info;
      }

      function __codexNear(a, b) {
        return Math.abs(Number(a) - Number(b)) <= 0.0001;
      }

      function __codexPointListMatches(actual, expected) {
        if (!actual || !expected || actual.length !== expected.length) return false;
        for (var __pm = 0; __pm < expected.length; __pm++) {
          if (!actual[__pm] || !expected[__pm] || actual[__pm].length < 2 || expected[__pm].length < 2) return false;
          if (!__codexNear(actual[__pm][0], expected[__pm][0]) || !__codexNear(actual[__pm][1], expected[__pm][1])) return false;
        }
        return true;
      }

      function __codexGeometryMatches(actual, expected) {
        if (!actual || !expected) return false;
        return actual.closed === expected.closed &&
          actual.vertexCount === expected.vertices.length &&
          __codexPointListMatches(actual.vertices, expected.vertices) &&
          __codexPointListMatches(actual.inTangents, expected.inTangents) &&
          __codexPointListMatches(actual.outTangents, expected.outTangents);
      }

      function __codexKeyframesMatch(prop, expectedKeyframes) {
        if (!expectedKeyframes) return true;
        if (!prop || prop.numKeys < expectedKeyframes.length) return false;
        for (var __ek = 0; __ek < expectedKeyframes.length; __ek++) {
          var expected = expectedKeyframes[__ek];
          var matched = false;
          for (var __pk = 1; __pk <= prop.numKeys && !matched; __pk++) {
            if (__codexNear(prop.keyTime(__pk), expected.time)) {
              matched = __codexGeometryMatches(__codexShapeGeometryData(prop.keyValue(__pk), 80), expected.geometry);
            }
          }
          if (!matched) return false;
        }
        return true;
      }

      function __codexResolvePathTarget() {
        if (expectedLayerName && layer.name !== expectedLayerName) {
          throw new Error("Layer name mismatch. Expected '" + expectedLayerName + "' but found '" + layer.name + "'.");
        }
        if (targetKind === "shape") {
          var shapeProp = __codexResolveProperty(layer, propertyPath);
          if (!shapeProp || shapeProp.matchName !== "ADBE Vector Shape") {
            throw new Error("propertyPath must resolve to an ADBE Vector Shape path property.");
          }
          return { property: shapeProp, mask: null };
        }
        var maskGroup = layer.property("ADBE Mask Parade");
        if (!maskGroup) throw new Error("Layer does not support masks.");
        if (requestedMaskIndex < 1 || requestedMaskIndex > maskGroup.numProperties) throw new Error("maskIndex is outside the layer mask range.");
        var mask = maskGroup.property(requestedMaskIndex);
        if (!mask) throw new Error("Mask not found at maskIndex " + requestedMaskIndex + ".");
        if (expectedMaskName && mask.name !== expectedMaskName) {
          throw new Error("Mask name mismatch. Expected '" + expectedMaskName + "' but found '" + mask.name + "'.");
        }
        var maskShapeProp = __codexFindChildProperty(mask, "ADBE Mask Shape", "Mask Path");
        if (!maskShapeProp) throw new Error("Mask shape property was not found.");
        return { property: maskShapeProp, mask: mask };
      }

      var target = __codexResolvePathTarget();
      var prop = target.property;
      try {
        if (prop.expressionEnabled === true) throw new Error("Path geometry property has an enabled expression; clear or review the expression before geometry mutation.");
      } catch (__expressionProbeError) {
        if (String(__expressionProbeError).indexOf("enabled expression") >= 0) throw __expressionProbeError;
      }
      var before = __codexPathGeometryInfo(prop, layer, true, 80);

      var response = null;
      app.beginUndoGroup("Codex Set Path Geometry");
      try {
        if (requestedKeyframes) {
          if (clearExisting) {
            for (var __removeKey = prop.numKeys; __removeKey >= 1; __removeKey--) prop.removeKey(__removeKey);
          }
          for (var __kf = 0; __kf < requestedKeyframes.length; __kf++) {
            if (requestedKeyframes[__kf].time > comp.duration) {
              throw new Error("keyframes[" + __kf + "].time exceeds comp duration.");
            }
            prop.setValueAtTime(requestedKeyframes[__kf].time, __codexBuildShapeFromGeometry(requestedKeyframes[__kf].geometry));
          }
        } else {
          prop.setValue(__codexBuildShapeFromGeometry(requestedGeometry));
        }
        var after = __codexPathGeometryInfo(prop, layer, true, 80);
        var geometryMatches = requestedGeometry ? __codexGeometryMatches(after.geometry, requestedGeometry) : true;
        var keyframesMatch = requestedKeyframes ? __codexKeyframesMatch(prop, requestedKeyframes) : true;
        var postVerification = {
          ok: geometryMatches && keyframesMatch,
          targetKind: targetKind,
          propertyMatchName: prop.matchName || null,
          geometryMatches: geometryMatches,
          keyframesMatch: keyframesMatch,
          requestedKeyframeCount: requestedKeyframes ? requestedKeyframes.length : 0,
          afterKeyframeCount: after.numKeys || 0,
          clearExisting: clearExisting
        };
        response = {
          comp: { itemIndex: __codexProjectIndexForItem(comp), name: comp.name },
          layer: __codexLayerInfo(layer),
          targetKind: targetKind,
          mask: target.mask ? { propertyIndex: target.mask.propertyIndex, name: target.mask.name, matchName: target.mask.matchName } : null,
          before: before,
          property: after,
          pathGeometry: after,
          geometry: after.geometry,
          postVerification: postVerification
        };
      } finally {
        app.endUndoGroup();
      }
      return response;
    `);
    return toolResult(result.result);
  }

  if (name === "fit_layer_to_comp") {
    const compItemIndex = optionalPositiveInteger(args, "compItemIndex");
    const compName = optionalString(args, "compName", "");
    const layerIndices = optionalPositiveIntegerList(args, "layerIndices");
    const mode = optionalString(args, "mode", "contain");
    const alignX = optionalString(args, "alignX", "center");
    const alignY = optionalString(args, "alignY", "center");

    if (!["contain", "cover", "stretch"].includes(mode)) return toolResult("mode must be one of: contain, cover, stretch.", true);
    if (!["left", "center", "right"].includes(alignX)) return toolResult("alignX must be one of: left, center, right.", true);
    if (!["top", "center", "bottom"].includes(alignY)) return toolResult("alignY must be one of: top, center, bottom.", true);

    const result = await runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${aeLiteral(compName)});
      var layers = __codexResolveLayers(comp, ${layerIndices ? aeLiteral(layerIndices) : "null"});
      var mode = ${aeLiteral(mode)};
      var alignX = ${aeLiteral(alignX)};
      var alignY = ${aeLiteral(alignY)};

      app.beginUndoGroup("Codex Fit Layer To Comp");
      var changed = [];
      for (var __i = 0; __i < layers.length; __i++) {
        var layer = layers[__i];
        if (layer.locked) throw new Error("Layer is locked: " + layer.name);
        var before = __codexLayerInfo(layer);
        var size = __codexLayerSourceSize(layer, comp);
        var scaleX = comp.width / size.width * 100;
        var scaleY = comp.height / size.height * 100;
        if (mode === "contain") {
          var containScale = Math.min(scaleX, scaleY);
          scaleX = containScale;
          scaleY = containScale;
        } else if (mode === "cover") {
          var coverScale = Math.max(scaleX, scaleY);
          scaleX = coverScale;
          scaleY = coverScale;
        }
        var fittedWidth = size.width * scaleX / 100;
        var fittedHeight = size.height * scaleY / 100;
        var x = alignX === "left" ? fittedWidth / 2 : alignX === "right" ? comp.width - fittedWidth / 2 : comp.width / 2;
        var y = alignY === "top" ? fittedHeight / 2 : alignY === "bottom" ? comp.height - fittedHeight / 2 : comp.height / 2;
        var transform = layer.property("ADBE Transform Group");
        transform.property("ADBE Scale").setValue([scaleX, scaleY, 100]);
        transform.property("ADBE Position").setValue([x, y]);
        changed.push({
          before: before,
          after: __codexLayerInfo(layer),
          sourceSize: size,
          scale: [scaleX, scaleY, 100],
          position: [x, y]
        });
      }
      var response = {
        comp: { itemIndex: __codexProjectIndexForItem(comp), name: comp.name, width: comp.width, height: comp.height },
        mode: mode,
        alignX: alignX,
        alignY: alignY,
        changedCount: changed.length,
        layers: changed.map(function (item) { return item.after; }),
        changed: changed
      };
      app.endUndoGroup();
      return response;
    `);
    return toolResult(result.result);
  }

  if (name === "set_property_keyframes") {
    const compItemIndex = optionalPositiveInteger(args, "compItemIndex");
    const compName = optionalString(args, "compName", "");
    const layerIndex = requiredPositiveInteger(args, "layerIndex");
    let propertyPath;
    let keyframes;
    try {
      propertyPath = normalizePropertyPathArg(args, "propertyPath");
      keyframes = requiredKeyframeArray(args, "keyframes");
    } catch (error) {
      return toolResult(error.message, true);
    }
    const clearExisting = optionalBoolean(args, "clearExisting", false);

    const result = await runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${aeLiteral(compName)});
      var layer = comp.layer(${layerIndex});
      if (!layer) throw new Error("Layer not found.");
      if (layer.locked) throw new Error("Layer is locked.");
      var propertyPath = ${aeLiteral(propertyPath)};
      var keyframes = ${aeLiteral(keyframes)};
      var clearExisting = ${clearExisting ? "true" : "false"};
      var prop = __codexResolveProperty(layer, propertyPath);
      if (!prop || !prop.canVaryOverTime) throw new Error("Property cannot be keyframed.");

      app.beginUndoGroup("Codex Set Property Keyframes");
      if (clearExisting) {
        while (prop.numKeys && prop.numKeys > 0) {
          prop.removeKey(prop.numKeys);
        }
      }
      for (var __i = 0; __i < keyframes.length; __i++) {
        var item = keyframes[__i];
        prop.setValueAtTime(item.time, __codexPreparePropertyValue(prop, item.value));
      }
      var response = {
        comp: { itemIndex: __codexProjectIndexForItem(comp), name: comp.name },
        layer: __codexLayerInfo(layer),
        property: __codexPropertyInfo(prop, layer, true, true),
        keyframeCount: keyframes.length,
        clearExisting: clearExisting
      };
      app.endUndoGroup();
      return response;
    `);
    return toolResult(result.result);
  }

  if (name === "fill_in_keyframes") {
    const compItemIndex = optionalPositiveInteger(args, "compItemIndex");
    const compName = optionalString(args, "compName", "");
    const layerIndex = requiredPositiveInteger(args, "layerIndex");
    const startTime = optionalNumber(args, "startTime", null);
    const endTime = optionalNumber(args, "endTime", null);
    const sampleEveryFrames = Math.max(1, Math.floor(optionalNumber(args, "sampleEveryFrames", 1)));
    const removeRedundant = optionalBoolean(args, "removeRedundant", true);
    const clearExpression = optionalBoolean(args, "clearExpression", true);
    let propertyPath;
    try {
      propertyPath = normalizePropertyPathArg(args, "propertyPath");
    } catch (error) {
      return toolResult(error.message, true);
    }

    if (startTime !== null && endTime !== null && endTime < startTime) return toolResult("endTime must be greater than or equal to startTime.", true);

    const result = await runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${aeLiteral(compName)});
      var layer = comp.layer(${layerIndex});
      if (!layer) throw new Error("Layer not found.");
      if (layer.locked) throw new Error("Layer is locked.");
      var propertyPath = ${aeLiteral(propertyPath)};
      var requestedStart = ${startTime === null ? "null" : startTime};
      var requestedEnd = ${endTime === null ? "null" : endTime};
      var sampleEveryFrames = ${sampleEveryFrames};
      var removeRedundant = ${removeRedundant ? "true" : "false"};
      var clearExpression = ${clearExpression ? "true" : "false"};
      var prop = __codexResolveProperty(layer, propertyPath);
      if (!prop || !prop.canVaryOverTime) throw new Error("Property cannot be keyframed.");
      try {
        if (prop.propertyValueType === PropertyValueType.NO_VALUE) throw new Error("Property has no value.");
      } catch (__noValueProbeError) {}

      function __codexValuesEqual(valueA, valueB) {
        var arrayA = valueA instanceof Array ? valueA : [valueA];
        var arrayB = valueB instanceof Array ? valueB : [valueB];
        if (arrayA.length !== arrayB.length) return false;
        for (var __e = 0; __e < arrayA.length; __e++) {
          if (arrayA[__e] !== arrayB[__e]) return false;
        }
        return true;
      }

      function __codexCopyValue(value) {
        if (value instanceof Array) {
          var copy = [];
          for (var __cv = 0; __cv < value.length; __cv++) copy.push(value[__cv]);
          return copy;
        }
        return value;
      }

      var frameDuration = comp.frameDuration || (1 / comp.frameRate);
      var step = frameDuration * sampleEveryFrames;
      var rangeStart = requestedStart !== null ? requestedStart : (prop.numKeys && prop.numKeys > 0 ? prop.keyTime(1) : (comp.workAreaStart || 0));
      var rangeEnd = requestedEnd !== null ? requestedEnd : (prop.numKeys && prop.numKeys > 0 ? prop.keyTime(prop.numKeys) : Math.min(comp.duration, (comp.workAreaStart || 0) + (comp.workAreaDuration || comp.duration)));
      if (rangeEnd < rangeStart) throw new Error("Computed keyframe range is invalid.");

      var samples = [];
      var guard = 0;
      for (var t = rangeStart; t <= rangeEnd + 0.0001 && guard < 2000; t += step) {
        var sampleTime = Math.min(t, rangeEnd);
        samples.push({ time: sampleTime, value: __codexCopyValue(prop.valueAtTime(sampleTime, false)) });
        guard++;
      }
      if (!samples.length || Math.abs(samples[samples.length - 1].time - rangeEnd) > 0.0001) {
        samples.push({ time: rangeEnd, value: __codexCopyValue(prop.valueAtTime(rangeEnd, false)) });
      }

      app.beginUndoGroup("Codex Fill In Keyframes");
      while (prop.numKeys && prop.numKeys > 0) {
        prop.removeKey(prop.numKeys);
      }
      for (var __i = 0; __i < samples.length; __i++) {
        prop.setValueAtTime(samples[__i].time, __codexPreparePropertyValue(prop, samples[__i].value));
      }
      var removed = 0;
      if (removeRedundant && prop.numKeys > 2) {
        for (var __k = prop.numKeys - 1; __k > 1; __k--) {
          var previousValue = prop.keyValue(__k - 1);
          var currentValue = prop.keyValue(__k);
          var nextValue = prop.keyValue(__k + 1);
          if (__codexValuesEqual(previousValue, currentValue) && __codexValuesEqual(currentValue, nextValue)) {
            prop.removeKey(__k);
            removed++;
          }
        }
      }
      for (var __linear = 1; __linear <= prop.numKeys; __linear++) {
        try { prop.setInterpolationTypeAtKey(__linear, KeyframeInterpolationType.LINEAR, KeyframeInterpolationType.LINEAR); } catch (__linearError) {}
      }
      if (clearExpression && prop.canSetExpression) {
        try { prop.expression = ""; } catch (__clearExpressionError) {}
      }
      var response = {
        comp: { itemIndex: __codexProjectIndexForItem(comp), name: comp.name },
        layer: __codexLayerInfo(layer),
        property: __codexPropertyInfo(prop, layer, true, true),
        sampledCount: samples.length,
        removedRedundantCount: removed,
        keyframeCount: prop.numKeys || 0,
        range: { startTime: rangeStart, endTime: rangeEnd, sampleEveryFrames: sampleEveryFrames },
        clearExpression: clearExpression
      };
      app.endUndoGroup();
      return response;
    `);
    return toolResult(result.result);
  }

  if (name === "keyframe_current_value_from_expression") {
    const compItemIndex = optionalPositiveInteger(args, "compItemIndex");
    const compName = optionalString(args, "compName", "");
    const layerIndex = requiredPositiveInteger(args, "layerIndex");
    const time = optionalNumber(args, "time", null);
    const requireExpression = optionalBoolean(args, "requireExpression", true);
    let propertyPath;
    try {
      propertyPath = normalizePropertyPathArg(args, "propertyPath");
    } catch (error) {
      return toolResult(error.message, true);
    }

    const result = await runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${aeLiteral(compName)});
      var layer = comp.layer(${layerIndex});
      if (!layer) throw new Error("Layer not found.");
      if (layer.locked) throw new Error("Layer is locked.");
      var propertyPath = ${aeLiteral(propertyPath)};
      var targetTime = ${time === null ? "comp.time" : time};
      var requireExpression = ${requireExpression ? "true" : "false"};
      var prop = __codexResolveProperty(layer, propertyPath);
      if (!prop || !prop.canVaryOverTime) throw new Error("Property cannot be keyframed.");
      if (requireExpression && (!prop.canSetExpression || !prop.expression)) throw new Error("Property has no expression to evaluate.");

      app.beginUndoGroup("Codex Keyframe Current Value From Expression");
      var currentValue = prop.valueAtTime(targetTime, false);
      prop.setValueAtTime(targetTime, __codexPreparePropertyValue(prop, currentValue));
      var response = {
        comp: { itemIndex: __codexProjectIndexForItem(comp), name: comp.name, time: comp.time },
        layer: __codexLayerInfo(layer),
        property: __codexPropertyInfo(prop, layer, true, true),
        keyframe: { time: targetTime, value: __codexValueData(currentValue) },
        expression: prop.canSetExpression ? prop.expression || "" : ""
      };
      app.endUndoGroup();
      return response;
    `);
    return toolResult(result.result);
  }

  if (name === "apply_keyframe_ease") {
    const compItemIndex = optionalPositiveInteger(args, "compItemIndex");
    const compName = optionalString(args, "compName", "");
    const layerIndex = requiredPositiveInteger(args, "layerIndex");
    const keyIndices = optionalPositiveIntegerList(args, "keyIndices");
    const easeIn = args.easeIn && typeof args.easeIn === "object" && !Array.isArray(args.easeIn) ? args.easeIn : {};
    const easeOut = args.easeOut && typeof args.easeOut === "object" && !Array.isArray(args.easeOut) ? args.easeOut : {};
    const interpolation = optionalString(args, "interpolation", "");
    let propertyPath;
    try {
      propertyPath = normalizePropertyPathArg(args, "propertyPath");
    } catch (error) {
      return toolResult(error.message, true);
    }
    if (interpolation && !["bezier", "linear", "hold"].includes(interpolation)) return toolResult("interpolation must be one of: bezier, linear, hold.", true);

    const result = await runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${aeLiteral(compName)});
      var layer = comp.layer(${layerIndex});
      if (!layer) throw new Error("Layer not found.");
      if (layer.locked) throw new Error("Layer is locked.");
      var propertyPath = ${aeLiteral(propertyPath)};
      var requestedKeyIndices = ${keyIndices ? aeLiteral(keyIndices) : "null"};
      var easeIn = ${aeLiteral(easeIn)};
      var easeOut = ${aeLiteral(easeOut)};
      var interpolation = ${aeLiteral(interpolation)};
      var prop = __codexResolveProperty(layer, propertyPath);
      if (!prop || !prop.numKeys) throw new Error("Property has no keyframes.");
      var keys = [];
      if (requestedKeyIndices && requestedKeyIndices.length) {
        keys = requestedKeyIndices;
      } else {
        try {
          for (var __sk = 0; __sk < prop.selectedKeys.length; __sk++) keys.push(prop.selectedKeys[__sk]);
        } catch (__selectedKeyError) {}
      }
      if (!keys.length) throw new Error("No keyframes selected or provided.");

      function __codexEaseArray(ease, dimensions) {
        var speed = ease.speed !== undefined ? Number(ease.speed) : 0;
        var influence = ease.influence !== undefined ? Number(ease.influence) : 33;
        var values = [];
        for (var __d = 0; __d < dimensions; __d++) {
          values.push(new KeyframeEase(speed, influence));
        }
        return values;
      }

      function __codexTemporalEaseDimensions(prop) {
        try {
          if (prop.propertyValueType === PropertyValueType.TwoD_SPATIAL || prop.propertyValueType === PropertyValueType.ThreeD_SPATIAL) {
            return 1;
          }
        } catch (__spatialEaseTypeError) {}
        var value = null;
        try { value = prop.value; } catch (__valueProbeError) {}
        return value instanceof Array ? Math.max(1, value.length) : 1;
      }

      app.beginUndoGroup("Codex Apply Keyframe Ease");
      var dimensions = __codexTemporalEaseDimensions(prop);
      var easeInValues = __codexEaseArray(easeIn, dimensions);
      var easeOutValues = __codexEaseArray(easeOut, dimensions);
      var changedKeys = [];
      for (var __i = 0; __i < keys.length; __i++) {
        var keyIndex = Math.floor(Number(keys[__i]));
        if (keyIndex < 1 || keyIndex > prop.numKeys) throw new Error("Keyframe index out of range: " + keyIndex);
        if (interpolation) {
          var interpolationType = interpolation === "hold" ? KeyframeInterpolationType.HOLD : interpolation === "linear" ? KeyframeInterpolationType.LINEAR : KeyframeInterpolationType.BEZIER;
          prop.setInterpolationTypeAtKey(keyIndex, interpolationType, interpolationType);
        }
        prop.setTemporalEaseAtKey(keyIndex, easeInValues, easeOutValues);
        changedKeys.push(keyIndex);
      }
      var response = {
        comp: { itemIndex: __codexProjectIndexForItem(comp), name: comp.name },
        layer: __codexLayerInfo(layer),
        property: __codexPropertyInfo(prop, layer, true, true),
        keyIndices: changedKeys,
        interpolation: interpolation || null
      };
      app.endUndoGroup();
      return response;
    `);
    return toolResult(result.result);
  }

  if (name === "set_spatial_in_tangent") {
    const compItemIndex = optionalPositiveInteger(args, "compItemIndex");
    const compName = optionalString(args, "compName", "");
    const layerIndex = requiredPositiveInteger(args, "layerIndex");
    const keyIndexArg = optionalPositiveInteger(args, "keyIndex");
    const factor = optionalNumber(args, "factor", 0.5);
    let propertyPath;
    try {
      propertyPath = hasArg(args, "propertyPath")
        ? normalizePropertyPathArg(args, "propertyPath")
        : ["ADBE Transform Group", "ADBE Position"];
    } catch (error) {
      return toolResult(error.message, true);
    }

    const result = await runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${aeLiteral(compName)});
      var layer = comp.layer(${layerIndex});
      if (!layer) throw new Error("Layer not found.");
      if (layer.locked) throw new Error("Layer is locked.");
      var propertyPath = ${aeLiteral(propertyPath)};
      var requestedKeyIndex = ${keyIndexArg === null ? "null" : keyIndexArg};
      var factor = ${factor};
      var prop = __codexResolveProperty(layer, propertyPath);
      if (!prop || !prop.numKeys) throw new Error("Property has no keyframes.");
      var keyIndex = requestedKeyIndex;
      if (keyIndex === null) {
        try { keyIndex = prop.selectedKeys && prop.selectedKeys.length ? prop.selectedKeys[0] : null; } catch (__selectedKeyError) {}
      }
      if (!keyIndex) throw new Error("Provide keyIndex or select one keyframe.");
      if (keyIndex < 2 || keyIndex > prop.numKeys) throw new Error("keyIndex must target keyframe 2 or later.");
      var currentValue = prop.keyValue(keyIndex);
      var previousValue = prop.keyValue(keyIndex - 1);
      if (!(currentValue instanceof Array) || !(previousValue instanceof Array)) throw new Error("Spatial tangent requires array keyframe values.");
      var inTangent = [];
      for (var __d = 0; __d < currentValue.length; __d++) {
        inTangent.push((previousValue[__d] - currentValue[__d]) * factor);
      }
      var outTangent = null;
      try { outTangent = prop.keyOutSpatialTangent(keyIndex); } catch (__outSpatialError) {}
      if (!(outTangent instanceof Array)) {
        outTangent = [];
        for (var __o = 0; __o < currentValue.length; __o++) outTangent.push(0);
      }

      app.beginUndoGroup("Codex Set Spatial In Tangent");
      prop.setSpatialTangentsAtKey(keyIndex, inTangent, outTangent);
      var response = {
        comp: { itemIndex: __codexProjectIndexForItem(comp), name: comp.name },
        layer: __codexLayerInfo(layer),
        property: __codexPropertyInfo(prop, layer, true, true),
        keyIndex: keyIndex,
        factor: factor,
        inSpatialTangent: __codexArrayCopy(inTangent),
        outSpatialTangent: __codexArrayCopy(outTangent)
      };
      app.endUndoGroup();
      return response;
    `);
    return toolResult(result.result);
  }

  if (name === "set_expression" || name === "clear_expression") {
    const compItemIndex = optionalPositiveInteger(args, "compItemIndex");
    const compName = optionalString(args, "compName", "");
    const layerIndex = requiredPositiveInteger(args, "layerIndex");
    let propertyPath;
    try {
      propertyPath = normalizePropertyPathArg(args, "propertyPath");
    } catch (error) {
      return toolResult(error.message, true);
    }
    const expression = name === "set_expression" ? optionalString(args, "expression", "") : "";
    const enabled = name === "set_expression" ? optionalBoolean(args, "enabled", true) : false;
    if (name === "set_expression" && !expression) return toolResult("expression is required.", true);

    const result = await runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${aeLiteral(compName)});
      var layer = comp.layer(${layerIndex});
      if (!layer) throw new Error("Layer not found.");
      if (layer.locked) throw new Error("Layer is locked.");
      var propertyPath = ${aeLiteral(propertyPath)};
      var expressionValue = ${aeLiteral(expression)};
      var enabledValue = ${enabled ? "true" : "false"};
      var prop = __codexResolveProperty(layer, propertyPath);
      if (!prop || !prop.canSetExpression) throw new Error("Property cannot receive expressions.");

      app.beginUndoGroup(${name === "set_expression" ? aeLiteral("Codex Set Expression") : aeLiteral("Codex Clear Expression")});
      prop.expression = expressionValue;
      try { prop.expressionEnabled = enabledValue; } catch (__expressionEnabledError) {}
      var response = {
        comp: { itemIndex: __codexProjectIndexForItem(comp), name: comp.name },
        layer: __codexLayerInfo(layer),
        property: __codexPropertyInfo(prop, layer, true, true),
        expression: prop.expression || "",
        expressionEnabled: prop.expressionEnabled || false,
        expressionError: prop.expressionError || ""
      };
      app.endUndoGroup();
      return response;
    `);
    return toolResult(result.result);
  }

  if (name === "separate_shape_size_dimensions") {
    const compItemIndex = optionalPositiveInteger(args, "compItemIndex");
    const compName = optionalString(args, "compName", "");
    const layerIndex = requiredPositiveInteger(args, "layerIndex");
    const xSliderName = optionalString(args, "xSliderName", "X Size");
    const ySliderName = optionalString(args, "ySliderName", "Y Size");
    let propertyPath;
    try {
      propertyPath = normalizePropertyPathArg(args, "propertyPath");
    } catch (error) {
      return toolResult(error.message, true);
    }

    const result = await runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${aeLiteral(compName)});
      var layer = comp.layer(${layerIndex});
      if (!layer) throw new Error("Layer not found.");
      if (layer.locked) throw new Error("Layer is locked.");
      var propertyPath = ${aeLiteral(propertyPath)};
      var xSliderName = ${aeLiteral(xSliderName)};
      var ySliderName = ${aeLiteral(ySliderName)};
      var prop = __codexResolveProperty(layer, propertyPath);
      var supported = prop && (prop.matchName === "ADBE Vector Rect Size" || prop.matchName === "ADBE Vector Ellipse Size");
      if (!supported) throw new Error("Property must be ADBE Vector Rect Size or ADBE Vector Ellipse Size.");
      if (!prop.canSetExpression) throw new Error("Size property cannot receive expressions.");
      var currentSize = prop.value;
      if (!(currentSize instanceof Array) || currentSize.length < 2) throw new Error("Size property must be a two-dimensional value.");
      var effectGroup = layer.property("ADBE Effect Parade");
      if (!effectGroup) throw new Error("Layer cannot receive slider controls.");

      function __codexAddSlider(name, value) {
        var group = layer.property("ADBE Effect Parade");
        if (!group) throw new Error("Layer cannot receive slider controls.");
        var slider = group.addProperty("ADBE Slider Control");
        if (!slider) throw new Error("Could not add slider control.");
        slider.name = name;
        var sliderIndex = slider.propertyIndex;
        var sliderName = slider.name;
        var sliderValue = slider.property(1);
        if (sliderValue) sliderValue.setValue(value);
        return { index: sliderIndex, name: sliderName, value: value };
      }

      function __codexSliderByIndex(index) {
        var group = layer.property("ADBE Effect Parade");
        if (!group) return null;
        return group.property(index);
      }

      app.beginUndoGroup("Codex Separate Shape Size Dimensions");
      var xSliderInfo = __codexAddSlider(xSliderName || "X Size", currentSize[0]);
      var ySliderInfo = __codexAddSlider(ySliderName || "Y Size", currentSize[1]);
      prop = __codexResolveProperty(layer, propertyPath);
      if (!prop || !prop.canSetExpression) throw new Error("Size property cannot receive expressions after adding sliders.");
      var expression = [
        "var x = effect(" + JSON.stringify(xSliderInfo.name) + ")(\\"Slider\\").value;",
        "var y = effect(" + JSON.stringify(ySliderInfo.name) + ")(\\"Slider\\").value;",
        "[x, y];"
      ].join("\\n");
      prop.expression = expression;
      try { prop.expressionEnabled = true; } catch (__expressionEnabledError) {}
      var xSlider = __codexSliderByIndex(xSliderInfo.index);
      var ySlider = __codexSliderByIndex(ySliderInfo.index);
      var response = {
        comp: { itemIndex: __codexProjectIndexForItem(comp), name: comp.name },
        layer: __codexLayerInfo(layer),
        property: __codexPropertyInfo(prop, layer, true, true),
        sliders: [
          { name: xSliderInfo.name, effect: xSlider ? __codexPropertyInfo(xSlider, layer, false, true) : null, value: currentSize[0], properties: xSlider ? __codexEffectProperties(xSlider, layer, true, true) : [] },
          { name: ySliderInfo.name, effect: ySlider ? __codexPropertyInfo(ySlider, layer, false, true) : null, value: currentSize[1], properties: ySlider ? __codexEffectProperties(ySlider, layer, true, true) : [] }
        ],
        expression: expression
      };
      app.endUndoGroup();
      return response;
    `);
    return toolResult(result.result);
  }

  if (name === "add_comp_to_render_queue") {
    const compItemIndex = optionalPositiveInteger(args, "compItemIndex");
    const compName = optionalString(args, "compName", "");
    const renderSettingsTemplate = optionalString(args, "renderSettingsTemplate", "");
    const outputModuleTemplate = optionalString(args, "outputModuleTemplate", "");
    const outputPath = optionalString(args, "outputPath", "");
    let resolvedOutputPath = "";
    if (outputPath) {
      try {
        resolvedOutputPath = resolveOutputFilePath(outputPath);
      } catch (error) {
        return toolResult(error.message, true);
      }
    }

    const result = await runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${aeLiteral(compName)});
      var renderSettingsTemplate = ${aeLiteral(renderSettingsTemplate)};
      var outputModuleTemplate = ${aeLiteral(outputModuleTemplate)};
      var outputPath = ${aeLiteral(resolvedOutputPath)};

      app.beginUndoGroup("Codex Add Comp To Render Queue");
      var rqItem = app.project.renderQueue.items.add(comp);
      if (renderSettingsTemplate) rqItem.applyTemplate(renderSettingsTemplate);
      if (outputModuleTemplate || outputPath) {
        var outputModule = rqItem.outputModule(1);
        if (outputModuleTemplate) outputModule.applyTemplate(outputModuleTemplate);
        if (outputPath) outputModule.file = new File(outputPath);
      }
      var response = {
        comp: { itemIndex: __codexProjectIndexForItem(comp), name: comp.name },
        renderQueueItem: __codexRenderQueueItemInfo(rqItem)
      };
      app.endUndoGroup();
      return response;
    `);
    return toolResult(result.result);
  }

  if (name === "set_render_queue_output") {
    const renderQueueItemIndex = requiredPositiveInteger(args, "renderQueueItemIndex");
    const renderSettingsTemplate = optionalString(args, "renderSettingsTemplate", "");
    const outputModuleTemplate = optionalString(args, "outputModuleTemplate", "");
    const outputPath = optionalString(args, "outputPath", "");
    let resolvedOutputPath = "";
    if (!renderSettingsTemplate && !outputModuleTemplate && !outputPath) return toolResult("Provide renderSettingsTemplate, outputModuleTemplate, or outputPath.", true);
    if (outputPath) {
      try {
        resolvedOutputPath = resolveOutputFilePath(outputPath);
      } catch (error) {
        return toolResult(error.message, true);
      }
    }

    const result = await runExtendScriptBody(`
      ${resolveCompScript}
      var renderQueueItemIndex = ${renderQueueItemIndex};
      var renderSettingsTemplate = ${aeLiteral(renderSettingsTemplate)};
      var outputModuleTemplate = ${aeLiteral(outputModuleTemplate)};
      var outputPath = ${aeLiteral(resolvedOutputPath)};
      var rq = app.project.renderQueue;
      var rqItem = rq.item(renderQueueItemIndex);
      if (!rqItem) throw new Error("Render queue item not found.");

      app.beginUndoGroup("Codex Set Render Queue Output");
      if (renderSettingsTemplate) rqItem.applyTemplate(renderSettingsTemplate);
      var outputModule = rqItem.outputModule(1);
      if (outputModuleTemplate) outputModule.applyTemplate(outputModuleTemplate);
      if (outputPath) outputModule.file = new File(outputPath);
      var response = {
        renderQueueItem: __codexRenderQueueItemInfo(rqItem)
      };
      app.endUndoGroup();
      return response;
    `);
    return toolResult(result.result);
  }

  if (name === "get_render_queue_status") {
    const limit = Math.max(1, Math.min(200, Math.floor(optionalNumber(args, "limit", 50))));

    const result = await runExtendScriptBody(`
      ${resolveCompScript}
      var rq = app.project.renderQueue;
      var limit = ${limit};
      var items = [];
      for (var __i = 1; __i <= rq.numItems && items.length < limit; __i++) {
        items.push(__codexRenderQueueItemInfo(rq.item(__i)));
      }
      return {
        totalItems: rq.numItems,
        returned: items.length,
        items: items
      };
    `);
    return toolResult(result.result);
  }

  if (name === "set_layer_transform") {
    const compItemIndex = optionalPositiveInteger(args, "compItemIndex");
    const compName = optionalString(args, "compName", "");
    const layerIndex = requiredPositiveInteger(args, "layerIndex");
    const position = optionalNumberArray(args, "position", null, 2, 3);
    const scale = optionalNumberArray(args, "scale", null, 2, 3);
    const anchorPoint = optionalNumberArray(args, "anchorPoint", null, 2, 3);
    const rotation = optionalNumber(args, "rotation", null);
    const opacity = optionalNumber(args, "opacity", null);

    if (!position && !scale && !anchorPoint && rotation === null && opacity === null) {
      return toolResult("Provide at least one transform value to set.", true);
    }
    if (opacity !== null && (opacity < 0 || opacity > 100)) {
      return toolResult("opacity must be between 0 and 100.", true);
    }

    const result = await runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${aeLiteral(compName)});
      var layer = comp.layer(${layerIndex});
      if (!layer) throw new Error("Layer not found.");
      if (layer.locked) throw new Error("Layer is locked.");

      var positionValue = ${position ? aeLiteral(position) : "null"};
      var scaleValue = ${scale ? aeLiteral(scale) : "null"};
      var anchorPointValue = ${anchorPoint ? aeLiteral(anchorPoint) : "null"};
      var rotationValue = ${rotation === null ? "null" : rotation};
      var opacityValue = ${opacity === null ? "null" : opacity};

      app.beginUndoGroup("Codex Set Layer Transform");
      var transform = layer.property("ADBE Transform Group");
      if (positionValue !== null) transform.property("ADBE Position").setValue(positionValue);
      if (scaleValue !== null) transform.property("ADBE Scale").setValue(scaleValue);
      if (anchorPointValue !== null) transform.property("ADBE Anchor Point").setValue(anchorPointValue);
      if (rotationValue !== null) transform.property("ADBE Rotate Z").setValue(rotationValue);
      if (opacityValue !== null) transform.property("ADBE Opacity").setValue(opacityValue);
      var response = {
        comp: {
          itemIndex: __codexProjectIndexForItem(comp),
          name: comp.name
        },
        layer: __codexLayerInfo(layer),
        transform: {
          position: transform.property("ADBE Position").value,
          scale: transform.property("ADBE Scale").value,
          anchorPoint: transform.property("ADBE Anchor Point").value,
          rotation: transform.property("ADBE Rotate Z").value,
          opacity: transform.property("ADBE Opacity").value
        }
      };
      app.endUndoGroup();
      return response;
    `);
    return toolResult(result.result);
  }

  if (name === "apply_transform_expression") {
    const compItemIndex = optionalPositiveInteger(args, "compItemIndex");
    const compName = optionalString(args, "compName", "");
    const layerIndex = requiredPositiveInteger(args, "layerIndex");
    const property = optionalString(args, "property", "");
    const expression = optionalString(args, "expression", "");
    const enabled = optionalBoolean(args, "enabled", true);
    const propertyMap = {
      position: "ADBE Position",
      scale: "ADBE Scale",
      rotation: "ADBE Rotate Z",
      opacity: "ADBE Opacity",
      anchorPoint: "ADBE Anchor Point"
    };

    if (!propertyMap[property]) {
      return toolResult("property must be one of: position, scale, rotation, opacity, anchorPoint.", true);
    }
    if (!expression) return toolResult("expression is required.", true);

    const result = await runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${aeLiteral(compName)});
      var layer = comp.layer(${layerIndex});
      if (!layer) throw new Error("Layer not found.");
      if (layer.locked) throw new Error("Layer is locked.");

      var propertyName = ${aeLiteral(property)};
      var propertyMatchName = ${aeLiteral(propertyMap[property])};
      var expressionValue = ${aeLiteral(expression)};
      var enabledValue = ${enabled ? "true" : "false"};

      app.beginUndoGroup("Codex Apply Transform Expression");
      var prop = layer.property("ADBE Transform Group").property(propertyMatchName);
      if (!prop || !prop.canSetExpression) {
        throw new Error("Property cannot receive expressions: " + propertyName);
      }
      prop.expression = expressionValue;
      prop.expressionEnabled = enabledValue;
      var response = {
        comp: {
          itemIndex: __codexProjectIndexForItem(comp),
          name: comp.name
        },
        layer: __codexLayerInfo(layer),
        property: propertyName,
        expression: prop.expression,
        expressionEnabled: prop.expressionEnabled,
        expressionError: prop.expressionError || ""
      };
      app.endUndoGroup();
      return response;
    `);
    return toolResult(result.result);
  }

  if (name === "add_comp_marker") {
    const compItemIndex = optionalPositiveInteger(args, "compItemIndex");
    const compName = optionalString(args, "compName", "");
    const time = optionalNumber(args, "time", null);
    const hasExplicitComment = Object.prototype.hasOwnProperty.call(args, "comment") && args.comment !== undefined && args.comment !== null;
    const comment = hasExplicitComment ? String(args.comment) : "";
    const duration = optionalNumber(args, "duration", null);
    const expectedMarkerCountBefore = optionalNumber(args, "expectedMarkerCountBefore", null);

    if (compItemIndex === null && !compName) return toolResult("compItemIndex or compName is required for add_comp_marker.", true);
    if (time === null) return toolResult("time is required.", true);
    if (!hasExplicitComment) return toolResult("comment is required.", true);
    if (time < 0) return toolResult("time must be 0 or greater.", true);
    if (duration !== null && duration < 0) return toolResult("duration must be 0 or greater.", true);
    if (expectedMarkerCountBefore !== null && (!Number.isInteger(expectedMarkerCountBefore) || expectedMarkerCountBefore < 0)) {
      return toolResult("expectedMarkerCountBefore must be a non-negative integer.", true);
    }

    const result = await runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${aeLiteral(compName)});
      var markerTime = ${time};
      var markerComment = ${aeLiteral(comment)};
      var markerDuration = ${duration === null ? "null" : duration};
      var expectedMarkerCountBefore = ${expectedMarkerCountBefore === null ? "null" : expectedMarkerCountBefore};
      if (markerTime > comp.duration) throw new Error("time is outside the composition duration.");
      if (markerDuration !== null && markerTime + markerDuration > comp.duration) throw new Error("marker duration extends outside the composition duration.");
      var markerProp = comp.markerProperty;
      if (!markerProp) throw new Error("Composition markers are unavailable.");
      var beforeMarkers = __codexCompMarkers(comp, 100);
      if (expectedMarkerCountBefore !== null && beforeMarkers.count !== expectedMarkerCountBefore) {
        throw new Error("expectedMarkerCountBefore does not match current composition marker count.");
      }
      for (var __existingCompMarker = 1; __existingCompMarker <= markerProp.numKeys; __existingCompMarker++) {
        if (Math.abs(markerProp.keyTime(__existingCompMarker) - markerTime) <= 0.001) {
          throw new Error("A composition marker already exists at the requested time.");
        }
      }

      app.beginUndoGroup("Codex Add Composition Marker");
      var markerValue = new MarkerValue(markerComment);
      if (markerDuration !== null) markerValue.duration = markerDuration;
      markerProp.setValueAtTime(markerTime, markerValue);
      var markerInfo = null;
      try {
        var markerKeyIndex = markerProp.nearestKeyIndex(markerTime);
        if (markerKeyIndex > 0 && Math.abs(markerProp.keyTime(markerKeyIndex) - markerTime) < 0.001) {
          markerInfo = __codexMarkerInfo(markerProp, markerKeyIndex);
        }
      } catch (__markerReadBackError) {}
      if (!markerInfo) {
        markerInfo = {
          keyIndex: null,
          time: markerTime,
          comment: markerComment,
          duration: markerDuration || 0
        };
      }
      var afterMarkers = __codexCompMarkers(comp, 100);
      var response = {
        comp: {
          itemIndex: __codexProjectIndexForItem(comp),
          name: comp.name,
          duration: comp.duration,
          frameRate: comp.frameRate,
          workAreaStart: comp.workAreaStart,
          workAreaDuration: comp.workAreaDuration
        },
        marker: markerInfo,
        markersBefore: beforeMarkers,
        markers: afterMarkers,
        postVerification: {
          ok: markerInfo !== null && afterMarkers.count === beforeMarkers.count + 1,
          markerCountBefore: beforeMarkers.count,
          markerCountAfter: afterMarkers.count,
          expectedMarkerCountAfter: beforeMarkers.count + 1,
          markerCountIncremented: afterMarkers.count === beforeMarkers.count + 1,
          timeMatches: Math.abs((markerInfo.time || 0) - markerTime) <= 0.001,
          commentMatches: markerInfo.comment === markerComment,
          durationMatches: markerDuration === null || Math.abs((markerInfo.duration || 0) - markerDuration) <= 0.001
        }
      };
      app.endUndoGroup();
      return response;
    `);
    return toolResult(result.result);
  }

  if (name === "add_layer_marker") {
    const compItemIndex = optionalPositiveInteger(args, "compItemIndex");
    const compName = optionalString(args, "compName", "");
    const layerIndex = requiredPositiveInteger(args, "layerIndex");
    const time = optionalNumber(args, "time", null);
    const hasExplicitComment = Object.prototype.hasOwnProperty.call(args, "comment") && args.comment !== undefined && args.comment !== null;
    const comment = hasExplicitComment ? String(args.comment) : "";
    const duration = optionalNumber(args, "duration", null);

    if (!hasExplicitComment) return toolResult("comment is required.", true);
    if (time !== null && time < 0) return toolResult("time must be 0 or greater.", true);
    if (duration !== null && duration < 0) return toolResult("duration must be 0 or greater.", true);

    const result = await runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${aeLiteral(compName)});
      var layer = comp.layer(${layerIndex});
      if (!layer) throw new Error("Layer not found.");
      if (layer.locked) throw new Error("Layer is locked.");
      var markerTime = ${time === null ? "comp.time" : time};
      var markerComment = ${aeLiteral(comment)};
      var markerDuration = ${duration === null ? "null" : duration};

      app.beginUndoGroup("Codex Add Layer Marker");
      var markerValue = new MarkerValue(markerComment);
      if (markerDuration !== null) markerValue.duration = markerDuration;
      var markerProp = layer.property("ADBE Marker");
      markerProp.setValueAtTime(markerTime, markerValue);
      var markerInfo = null;
      try {
        var markerKeyIndex = markerProp.nearestKeyIndex(markerTime);
        if (markerKeyIndex > 0 && Math.abs(markerProp.keyTime(markerKeyIndex) - markerTime) < 0.001) {
          markerInfo = __codexMarkerInfo(markerProp, markerKeyIndex);
        }
      } catch (__markerReadBackError) {}
      if (!markerInfo) {
        markerInfo = {
          keyIndex: null,
          time: markerTime,
          comment: markerComment,
          duration: markerDuration || 0
        };
      }
      var response = {
        comp: {
          itemIndex: __codexProjectIndexForItem(comp),
          name: comp.name
        },
        layer: __codexLayerInfo(layer),
        marker: markerInfo,
        markers: __codexLayerMarkers(layer, 50)
      };
      app.endUndoGroup();
      return response;
    `);
    return toolResult(result.result);
  }

  if (name === "update_layer_marker") {
    const compItemIndex = optionalPositiveInteger(args, "compItemIndex");
    const compName = optionalString(args, "compName", "");
    const layerIndex = requiredPositiveInteger(args, "layerIndex");
    const markerIndex = optionalPositiveInteger(args, "markerIndex");
    const targetTime = optionalNumber(args, "targetTime", null);
    const targetComment = optionalString(args, "targetComment", "");
    const nextComment = optionalString(args, "comment", null);
    const nextTime = optionalNumber(args, "time", null);
    const nextDuration = optionalNumber(args, "duration", null);

    if (markerIndex === null && targetTime === null) return toolResult("markerIndex or targetTime is required.", true);
    if (targetTime !== null && targetTime < 0) return toolResult("targetTime must be 0 or greater.", true);
    if (nextTime !== null && nextTime < 0) return toolResult("time must be 0 or greater.", true);
    if (nextDuration !== null && nextDuration < 0) return toolResult("duration must be 0 or greater.", true);
    if (nextComment === null && nextTime === null && nextDuration === null) return toolResult("At least one of comment, time, or duration is required.", true);

    const result = await runExtendScriptBody(`
      ${resolveCompScript}
      function __codexMarkerComment(markerProp, keyIndex) {
        try {
          var markerValue = markerProp.keyValue(keyIndex);
          return markerValue.comment || "";
        } catch (__commentError) {
          return "";
        }
      }
      function __codexFindMarkerKey(markerProp, markerIndex, targetTime, targetComment) {
        if (!markerProp || markerProp.numKeys < 1) throw new Error("Layer has no markers.");
        if (markerIndex !== null) {
          if (markerIndex < 1 || markerIndex > markerProp.numKeys) throw new Error("markerIndex is outside the layer marker range.");
          if (targetTime !== null && Math.abs(markerProp.keyTime(markerIndex) - targetTime) > 0.001) throw new Error("markerIndex does not match targetTime.");
          if (targetComment && __codexMarkerComment(markerProp, markerIndex) !== targetComment) throw new Error("markerIndex does not match targetComment.");
          return markerIndex;
        }
        var matchIndex = 0;
        for (var __mk = 1; __mk <= markerProp.numKeys; __mk++) {
          if (Math.abs(markerProp.keyTime(__mk) - targetTime) <= 0.001) {
            if (targetComment && __codexMarkerComment(markerProp, __mk) !== targetComment) continue;
            if (matchIndex) throw new Error("More than one marker matched targetTime; provide markerIndex.");
            matchIndex = __mk;
          }
        }
        if (!matchIndex) throw new Error("No marker matched the requested target.");
        return matchIndex;
      }
      function __codexCopyMarkerFields(target, source) {
        try { target.chapter = source.chapter || ""; } catch (__chapterCopyError) {}
        try { target.url = source.url || ""; } catch (__urlCopyError) {}
        try { target.frameTarget = source.frameTarget || ""; } catch (__frameTargetCopyError) {}
        try { target.cuePointName = source.cuePointName || ""; } catch (__cueCopyError) {}
        try { target.eventCuePoint = source.eventCuePoint; } catch (__eventCueCopyError) {}
        try { target.protectedRegion = source.protectedRegion; } catch (__protectedCopyError) {}
      }
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${aeLiteral(compName)});
      var layer = comp.layer(${layerIndex});
      if (!layer) throw new Error("Layer not found.");
      if (layer.locked) throw new Error("Layer is locked.");
      var markerProp = layer.property("ADBE Marker");
      if (!markerProp) throw new Error("Layer markers are unavailable.");
      var requestedMarkerIndex = ${markerIndex === null ? "null" : markerIndex};
      var requestedTargetTime = ${targetTime === null ? "null" : targetTime};
      var requestedTargetComment = ${aeLiteral(targetComment)};
      var replacementComment = ${nextComment === null ? "null" : aeLiteral(nextComment)};
      var replacementTime = ${nextTime === null ? "null" : nextTime};
      var replacementDuration = ${nextDuration === null ? "null" : nextDuration};

      app.beginUndoGroup("Codex Update Layer Marker");
      var keyIndex = __codexFindMarkerKey(markerProp, requestedMarkerIndex, requestedTargetTime, requestedTargetComment);
      var markerBefore = __codexMarkerInfo(markerProp, keyIndex);
      var oldValue = markerProp.keyValue(keyIndex);
      var newComment = replacementComment !== null ? replacementComment : markerBefore.comment;
      var newTime = replacementTime !== null ? replacementTime : markerBefore.time;
      var newDuration = replacementDuration !== null ? replacementDuration : markerBefore.duration;
      if (replacementTime !== null) {
        for (var __existingKey = 1; __existingKey <= markerProp.numKeys; __existingKey++) {
          if (__existingKey !== keyIndex && Math.abs(markerProp.keyTime(__existingKey) - newTime) <= 0.001) {
            throw new Error("Another marker already exists at the requested time.");
          }
        }
      }
      var markerValue = new MarkerValue(newComment);
      markerValue.duration = newDuration || 0;
      __codexCopyMarkerFields(markerValue, oldValue);
      if (Math.abs(newTime - markerBefore.time) <= 0.001) {
        markerProp.setValueAtKey(keyIndex, markerValue);
      } else {
        markerProp.removeKey(keyIndex);
        markerProp.setValueAtTime(newTime, markerValue);
      }
      var updatedKeyIndex = markerProp.nearestKeyIndex(newTime);
      var markerInfo = __codexMarkerInfo(markerProp, updatedKeyIndex);
      var response = {
        comp: {
          itemIndex: __codexProjectIndexForItem(comp),
          name: comp.name
        },
        layer: __codexLayerInfo(layer),
        markerBefore: markerBefore,
        marker: markerInfo,
        markers: __codexLayerMarkers(layer, 50)
      };
      app.endUndoGroup();
      return response;
    `);
    return toolResult(result.result);
  }

  if (name === "delete_layer_marker") {
    const compItemIndex = optionalPositiveInteger(args, "compItemIndex");
    const compName = optionalString(args, "compName", "");
    const layerIndex = requiredPositiveInteger(args, "layerIndex");
    const markerIndex = optionalPositiveInteger(args, "markerIndex");
    const targetTime = optionalNumber(args, "targetTime", null);
    const targetComment = optionalString(args, "targetComment", "");

    if (markerIndex === null && targetTime === null) return toolResult("markerIndex or targetTime is required.", true);
    if (targetTime !== null && targetTime < 0) return toolResult("targetTime must be 0 or greater.", true);

    const result = await runExtendScriptBody(`
      ${resolveCompScript}
      function __codexMarkerComment(markerProp, keyIndex) {
        try {
          var markerValue = markerProp.keyValue(keyIndex);
          return markerValue.comment || "";
        } catch (__commentError) {
          return "";
        }
      }
      function __codexFindMarkerKey(markerProp, markerIndex, targetTime, targetComment) {
        if (!markerProp || markerProp.numKeys < 1) throw new Error("Layer has no markers.");
        if (markerIndex !== null) {
          if (markerIndex < 1 || markerIndex > markerProp.numKeys) throw new Error("markerIndex is outside the layer marker range.");
          if (targetTime !== null && Math.abs(markerProp.keyTime(markerIndex) - targetTime) > 0.001) throw new Error("markerIndex does not match targetTime.");
          if (targetComment && __codexMarkerComment(markerProp, markerIndex) !== targetComment) throw new Error("markerIndex does not match targetComment.");
          return markerIndex;
        }
        var matchIndex = 0;
        for (var __mk = 1; __mk <= markerProp.numKeys; __mk++) {
          if (Math.abs(markerProp.keyTime(__mk) - targetTime) <= 0.001) {
            if (targetComment && __codexMarkerComment(markerProp, __mk) !== targetComment) continue;
            if (matchIndex) throw new Error("More than one marker matched targetTime; provide markerIndex.");
            matchIndex = __mk;
          }
        }
        if (!matchIndex) throw new Error("No marker matched the requested target.");
        return matchIndex;
      }
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${aeLiteral(compName)});
      var layer = comp.layer(${layerIndex});
      if (!layer) throw new Error("Layer not found.");
      if (layer.locked) throw new Error("Layer is locked.");
      var markerProp = layer.property("ADBE Marker");
      if (!markerProp) throw new Error("Layer markers are unavailable.");
      var requestedMarkerIndex = ${markerIndex === null ? "null" : markerIndex};
      var requestedTargetTime = ${targetTime === null ? "null" : targetTime};
      var requestedTargetComment = ${aeLiteral(targetComment)};

      app.beginUndoGroup("Codex Delete Layer Marker");
      var keyIndex = __codexFindMarkerKey(markerProp, requestedMarkerIndex, requestedTargetTime, requestedTargetComment);
      var markerDeleted = __codexMarkerInfo(markerProp, keyIndex);
      markerProp.removeKey(keyIndex);
      var response = {
        comp: {
          itemIndex: __codexProjectIndexForItem(comp),
          name: comp.name
        },
        layer: __codexLayerInfo(layer),
        markerDeleted: markerDeleted,
        markers: __codexLayerMarkers(layer, 50)
      };
      app.endUndoGroup();
      return response;
    `);
    return toolResult(result.result);
  }

  if (name === "create_test_comp") {
    const compName = optionalString(args, "name", `Codex Test Comp ${timestampForFilename(new Date()).replace(/-/g, "_")}`);
    const width = Math.max(4, Math.floor(optionalNumber(args, "width", 1920)));
    const height = Math.max(4, Math.floor(optionalNumber(args, "height", 1080)));
    const duration = optionalNumber(args, "duration", 5);
    const frameRate = optionalNumber(args, "frameRate", 30);
    const openInViewer = optionalBoolean(args, "openInViewer", true);

    if (duration <= 0) return toolResult("duration must be greater than 0.", true);
    if (frameRate <= 0) return toolResult("frameRate must be greater than 0.", true);

    const result = await runExtendScriptBody(`
      ${resolveCompScript}
      var compName = ${aeLiteral(compName)};
      var width = ${width};
      var height = ${height};
      var duration = ${duration};
      var frameRate = ${frameRate};
      var openInViewer = ${openInViewer ? "true" : "false"};

      app.beginUndoGroup("Codex Create Test Comp");
      var comp = app.project.items.addComp(compName, width, height, 1, duration, frameRate);
      try { comp.comment = "Created by AE Agent create_test_comp"; } catch (__commentError) {}
      if (openInViewer) comp.openInViewer();
      var response = {
        itemIndex: __codexProjectIndexForItem(comp),
        name: comp.name,
        width: comp.width,
        height: comp.height,
        duration: comp.duration,
        frameRate: comp.frameRate,
        numLayers: comp.numLayers
      };
      app.endUndoGroup();
      return response;
    `);
    return toolResult(result.result);
  }

  if (name === "cleanup_test_items") {
    const confirm = optionalBoolean(args, "confirm", false);
    if (!confirm) return toolResult("confirm must be true to remove test items.", true);

    const namePrefix = optionalString(args, "namePrefix", "Codex Test");
    const maxItems = Math.max(1, Math.min(250, Math.floor(optionalNumber(args, "maxItems", 25))));
    if (!namePrefix || namePrefix.length < 3) {
      return toolResult("namePrefix must be at least 3 characters.", true);
    }

    const result = await runExtendScriptBody(`
      var namePrefix = ${aeLiteral(namePrefix)};
      var maxItems = ${maxItems};
      var removed = [];

      app.beginUndoGroup("Codex Cleanup Test Items");
      for (var i = app.project.numItems; i >= 1 && removed.length < maxItems; i--) {
        var item = app.project.item(i);
        if (item && item.name && item.name.indexOf(namePrefix) === 0) {
          removed.push({
            itemIndex: i,
            name: item.name,
            typeName: item.typeName || null
          });
          item.remove();
        }
      }
      app.endUndoGroup();

      return {
        namePrefix: namePrefix,
        removed: removed,
        removedCount: removed.length,
        hitLimit: removed.length >= maxItems
      };
    `);
    return toolResult(result.result);
  }

  return toolResult(`Unknown tool: ${name}`, true);
}

async function callToolLogged(source, name, args) {
  const eventId = crypto.randomUUID();
  const startedAt = Date.now();
  const idContext = idempotencyContext(name, args || {});
  recordEvent("tool_call_started", {
    id: eventId,
    source,
    name,
    args,
    idempotency: idContext ? { key: idContext.key, scope: idContext.scope } : null
  });

  try {
    const m100Block = m100DirectToolCallBlock(source, name, args || {});
    if (m100Block) {
      const durationMs = Date.now() - startedAt;
      recordEvent("m100_direct_tool_blocked", {
        id: eventId,
        source,
        name,
        durationMs,
        code: m100Block.code,
        riskLevel: m100Block.riskLevel,
        knownTool: m100Block.knownTool,
        ignoredClientConfirmation: m100Block.ignoredClientConfirmation
      });
      return m100BlockedToolResult(m100Block);
    }

    if (M100_DIRECT_TOOL_SOURCES.has(source) && m100DirectEscapeHatchAllowed(source, args || {})) {
      recordEvent("m100_direct_tool_escape_hatch_used", {
        id: eventId,
        source,
        name,
        policyVersion: M100_RISK_POLICY_VERSION,
        env: M100_DIRECT_ESCAPE_HATCH_ENV
      });
    }

    if (idContext) {
      const existing = idempotencyRecords.get(idContext.recordKey);
      if (existing) {
        if (existing.argsHash !== idContext.argsHash) {
          throw new Error(`idempotencyKey conflict for ${name}: the key was already used with different arguments in scope ${idContext.scope}.`);
        }
        const replayed = replayIdempotencyResult(idContext, existing);
        const durationMs = Date.now() - startedAt;
        recordEvent("tool_call_idempotency_replayed", {
          id: eventId,
          source,
          name,
          durationMs,
          key: idContext.key,
          scope: idContext.scope,
          firstEventId: existing.eventId
        });
        return replayed;
      }
    }

    const checkpoint = await maybeCreateMutationCheckpoint(args || {}, name);
    const result = await callTool(name, args);
    let resultWithCheckpoint = attachMutationMetadataToToolResult(result, name, args || {}, checkpoint);
    resultWithCheckpoint = await attachMutationVerificationToToolResult(resultWithCheckpoint, name, args || {});
    const idempotencyRecord = storeIdempotencyResult(idContext, eventId, resultWithCheckpoint);
    resultWithCheckpoint = attachStoredIdempotencyMetadata(resultWithCheckpoint, idContext, idempotencyRecord);
    const durationMs = Date.now() - startedAt;
    trackEditSessionOperation({
      eventId,
      source,
      name,
      args: args || {},
      ok: !resultWithCheckpoint.isError,
      durationMs,
      result: resultWithCheckpoint
    });
    recordEvent("tool_call_finished", {
      id: eventId,
      source,
      name,
      ok: !resultWithCheckpoint.isError,
      durationMs
    });
    return resultWithCheckpoint;
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    trackEditSessionOperation({
      eventId,
      source,
      name,
      args: args || {},
      ok: false,
      durationMs,
      error: error.message || String(error)
    });
    recordEvent("tool_call_failed", {
      id: eventId,
      source,
      name,
      durationMs,
      error: error.message || String(error),
      line: error.line || null
    });
    throw error;
  }
}

activeEditSession = loadActiveEditSession();
loadAgentSecrets();
loadIdempotencyRecords();
if (activeEditSession) {
  recordEvent("edit_session_restored", {
    session: compactEditSession(activeEditSession)
  });
}

startHttpBridge();
