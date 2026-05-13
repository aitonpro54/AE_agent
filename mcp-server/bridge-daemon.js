#!/usr/bin/env node
"use strict";

const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const aiAgents = require("./ai-agents");

const SERVER_NAME = "codex-ae-mcp-bridge";
const SERVER_VERSION = "0.26.0";
const PROTOCOL_VERSION = "2025-03-26";
const HOST = "127.0.0.1";
const PORT = Number(process.env.AE_BRIDGE_PORT || 3456);
const TOKEN = process.env.AE_BRIDGE_TOKEN || "codex-ae-local";
const COMMAND_TIMEOUT_MS = Number(process.env.AE_COMMAND_TIMEOUT_MS || 30000);
const PROJECT_ROOT = path.resolve(__dirname, "..");
const LOG_DIR = path.join(PROJECT_ROOT, "logs");
const LOG_FILE = path.join(LOG_DIR, "bridge-events.jsonl");
const AI_CHAT_LOG_FILE = path.join(LOG_DIR, "ai-agent-chats.jsonl");
const EDIT_SESSION_ACTIVE_FILE = path.join(LOG_DIR, "edit-session-active.json");
const EDIT_SESSION_LOG_FILE = path.join(LOG_DIR, "edit-sessions.jsonl");
const IDEMPOTENCY_LOG_FILE = path.join(LOG_DIR, "idempotency-results.jsonl");
const AGENT_SECRETS_FILE = process.env.AE_AGENT_SECRETS_FILE
  ? path.resolve(process.env.AE_AGENT_SECRETS_FILE)
  : path.join(PROJECT_ROOT, ".codex", "agent-secrets.json");
const BACKUP_DIR = path.join(PROJECT_ROOT, "backups");
const CHECKPOINT_SUFFIX = "-checkpoint";
const ALLOW_SCRIPT_FILES_OUTSIDE_PROJECT = process.env.AE_ALLOW_SCRIPT_FILES_OUTSIDE_PROJECT === "1";
const STARTED_AT = Date.now();
const AE_PLAN_SYSTEM_PROMPT = [
  "You are a planning assistant for Codex AE MCP Bridge inside Adobe After Effects.",
  "Return JSON only. Do not use markdown.",
  "Do not claim that you changed the project. You are only drafting a plan.",
  "The user may write in Russian or English. Cyrillic text is valid Russian; translate it internally and never ask for clarification only because text is non-Latin.",
  "Prefer narrow MCP tools over raw ExtendScript.",
  "Every mutating step must include verifyAfter=true and an idempotencyKeyTemplate.",
  "Use checkpoints for broad, destructive, or multi-step project changes.",
  "If the request is ambiguous, produce a clarification step instead of guessing."
].join(" ");
const AE_PLAN_REPAIR_SYSTEM_PROMPT = [
  "You repair malformed JSON for Codex AE MCP Bridge.",
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
let activeEditSession = null;

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
    host: HOST,
    port: PORT,
    uptimeMs: now - STARTED_AT,
    startedAt: new Date(STARTED_AT).toISOString(),
    panelConnected: now - lastPanelSeenAt < 15000,
    lastPanelSeenAt,
    lastPanelInfo,
    pendingCommands: pendingCommands.length,
    inflightCommands: Array.from(inflightCommands.entries()).map(([id, command]) => ({
      id,
      ageMs: now - command.createdAt
    })),
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
  "create_text_layer",
  "import_footage",
  "create_solid_layer",
  "create_null_layer",
  "create_adjustment_layer",
  "add_project_item_to_comp",
  "duplicate_comp",
  "add_effect",
  "set_effect_property",
  "set_property_value",
  "set_layer_transform",
  "apply_transform_expression",
  "add_layer_marker",
  "create_test_comp",
  "cleanup_test_items"
]);

const MUTATION_SUMMARY_TOOL_NAMES = new Set([
  ...MUTATING_TOOL_NAMES,
  "checkpoint_project",
  "delete_project_checkpoint"
]);

function aeLiteral(value) {
  return JSON.stringify(value)
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function hasArg(args, name) {
  return Object.prototype.hasOwnProperty.call(args, name) && args[name] !== undefined && args[name] !== null && args[name] !== "";
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

function optionalPositiveInteger(args, name) {
  if (!hasArg(args, name)) return null;
  return requiredPositiveInteger(args, name);
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
  for (const key of ["compItemIndex", "compName", "layerIndex", "itemIndex", "itemName", "effect", "effectIndex", "effectName", "effectMatchName", "property", "propertyPath", "name", "namePrefix"]) {
    if (hasArg(args || {}, key)) request[key] = args[key];
  }
  if (Object.keys(request).length) target.request = request;

  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    if (payload.comp) target.comp = payload.comp;
    if (payload.layer) target.layer = payload.layer;
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
      if (toolName === "create_test_comp" && !target.compName) target.compName = payloadName;
    }
    if (!target.compItemIndex && payload.item && hasArg(payload.item, "itemIndex")) {
      target.compItemIndex = Number(payload.item.itemIndex) || null;
    }
    if (!target.compName && payload.item && payload.item.name) target.compName = payload.item.name;
    if (!target.itemIndex && payload.item && hasArg(payload.item, "itemIndex")) {
      target.itemIndex = Number(payload.item.itemIndex) || null;
    }
    if (!target.itemName && payload.item && payload.item.name) target.itemName = payload.item.name;
  }

  const rawArgs = args || {};
  if (!target.compItemIndex && hasArg(rawArgs, "compItemIndex")) target.compItemIndex = Number(rawArgs.compItemIndex) || null;
  if (!target.compName && hasArg(rawArgs, "compName")) target.compName = String(rawArgs.compName || "");
  if (!target.layerIndex && hasArg(rawArgs, "layerIndex")) target.layerIndex = Number(rawArgs.layerIndex) || null;
  if (!target.layerName && hasArg(rawArgs, "layerName")) target.layerName = String(rawArgs.layerName || "");
  if (hasArg(rawArgs, "name")) {
    const argName = String(rawArgs.name || "");
    if (toolName === "create_test_comp") {
      if (!target.compName) target.compName = argName;
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

      function __codexLayerInfo(layer) {
        if (!layer) return null;
        var transform = layer.property("ADBE Transform Group");
        var textGroup = null;
        var sourceText = null;
        try { textGroup = layer.property("ADBE Text Properties"); } catch (__textGroupError) {}
        if (textGroup) {
          try { sourceText = textGroup.property("ADBE Text Document").value; } catch (__sourceTextError) {}
        }
        return {
          index: layer.index,
          id: layer.id || null,
          name: layer.name || "",
          matchName: layer.matchName || null,
          enabled: !!layer.enabled,
          locked: !!layer.locked,
          startTime: layer.startTime,
          inPoint: layer.inPoint,
          outPoint: layer.outPoint,
          transform: transform ? {
            position: __codexValue(transform.property("ADBE Position")),
            scale: __codexValue(transform.property("ADBE Scale")),
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
      if (body.length > 5 * 1024 * 1024) {
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

function retainCommandResult(id, payload, command) {
  completedResults.set(id, {
    id,
    ok: Boolean(payload.ok),
    result: payload.result,
    error: payload.error || null,
    createdAt: command.createdAt,
    completedAt: Date.now()
  });

  while (completedResults.size > 200) {
    const oldestId = completedResults.keys().next().value;
    completedResults.delete(oldestId);
  }
}

function removeWaitingPanel(waiter) {
  const index = waitingPanels.indexOf(waiter);
  if (index >= 0) waitingPanels.splice(index, 1);
  clearTimeout(waiter.timer);
}

function drainWaitingPanels() {
  while (waitingPanels.length && pendingCommands.length) {
    const waiter = waitingPanels.shift();
    clearTimeout(waiter.timer);

    if (waiter.done || waiter.res.destroyed || waiter.res.writableEnded) {
      continue;
    }

    const command = pendingCommands.shift();
    waiter.done = true;
    writeJson(waiter.res, 200, { ok: true, command });
  }
}

function enqueueAeCommand(script, timeoutMs) {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    const timeout = setTimeout(() => {
      inflightCommands.delete(id);
      reject(new Error(`After Effects command timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    inflightCommands.set(id, { resolve, reject, timeout, createdAt: Date.now(), script });
    pendingCommands.push({ id, script });
    recordEvent("ae_command_queued", {
      id,
      timeoutMs,
      script
    });
    drainWaitingPanels();
  });
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
  const raw = await enqueueAeCommand(wrapExtendScriptBody(body), timeoutMs || COMMAND_TIMEOUT_MS);
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (parseError) {
    return { ok: true, result: raw, raw: true };
  }
  if (!parsed.ok) {
    const error = new Error(parsed.error || "After Effects script failed");
    error.line = parsed.line;
    throw error;
  }
  return parsed;
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
  const args = step.args || step.arguments || {};
  return args && typeof args === "object" && !Array.isArray(args) ? { ...args } : {};
}

function requiredSchemaFields(tool) {
  const required = tool && tool.inputSchema && Array.isArray(tool.inputSchema.required)
    ? tool.inputSchema.required
    : [];
  return required.filter(Boolean);
}

function validateAgentPlanObject(plan, requestId) {
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
    const mutating = toolName ? MUTATING_TOOL_NAMES.has(toolName) : false;
    const safeArgs = planStepArgs(step);
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
      stepWarnings.push(`Unknown MCP tool: ${toolName}`);
    } else {
      executableCount += 1;
      for (const field of requiredSchemaFields(tool)) {
        if (hasArg(safeArgs, field)) continue;
        if (hasArg(resultBindings, field)) {
          boundRequired.push(field);
        } else {
          missingRequired.push(field);
        }
      }
      if (missingRequired.length) {
        stepWarnings.push(`Missing required fields: ${missingRequired.join(", ")}`);
      }
      if (boundRequired.length) {
        stepWarnings.push(`Requires runtime binding for: ${boundRequired.join(", ")}`);
      }
    }

    if (mutating) {
      mutatingCount += 1;
      if (safeArgs.verifyAfter !== true) {
        safeArgs.verifyAfter = true;
        autofixes.push("verifyAfter=true");
      }
      if (!safeArgs.idempotencyKey) {
        safeArgs.idempotencyKey = `ae-plan-${validationId}-step-${index + 1}-${toolName}`;
        autofixes.push("idempotencyKey");
      }
      if (!safeArgs.idempotencyScope) {
        safeArgs.idempotencyScope = `ae-plan:${validationId}`;
        autofixes.push("idempotencyScope");
      }
      if (toolName === "run_extendscript" || toolName === "run_extendscript_file") {
        stepWarnings.push("Raw ExtendScript is allowed only as an escape hatch; prefer a narrow MCP tool.");
      }
    }

    validatedSteps.push({
      index: index + 1,
      title: step.title || step.intent || toolName,
      tool: toolName,
      valid: Boolean(tool) && missingRequired.length === 0,
      executable: Boolean(tool) && missingRequired.length === 0 && boundRequired.length === 0,
      requiresRuntimeBinding: boundRequired.length > 0,
      mutatesProject: mutating,
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
    warnings.push("Multiple mutating steps planned; a checkpoint is recommended before execution.");
  }
  if (unknownToolCount) {
    warnings.push(`${unknownToolCount} planned step(s) reference unknown MCP tools.`);
  }
  if (!steps.length && !sourcePlan.clarifyingQuestion) {
    warnings.push("Plan has no steps and no clarifying question.");
  }

  const invalidSteps = validatedSteps.filter((step) => !step.valid && step.tool);
  return {
    ok: invalidSteps.length === 0 && unknownToolCount === 0,
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
    || /^step-\d+-result(?:\.|$)/.test(expression);
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
      payload.compItemIndex,
      payload.itemIndex,
      valueAtPath(payload, "comp.itemIndex"),
      valueAtPath(payload, "verification.comp.itemIndex"),
      valueAtPath(payload, "mutation.target.item.itemIndex")
    ]);
  }
  if (targetField === "compName") {
    return firstPresent([
      payload.compName,
      payload.name,
      valueAtPath(payload, "comp.name"),
      valueAtPath(payload, "verification.comp.name"),
      valueAtPath(payload, "mutation.target.item.name")
    ]);
  }
  if (targetField === "itemIndex") {
    return firstPresent([
      payload.itemIndex,
      valueAtPath(payload, "item.itemIndex"),
      valueAtPath(payload, "mutation.target.item.itemIndex")
    ]);
  }
  if (targetField === "itemName" || targetField === "name") {
    return firstPresent([
      payload.itemName,
      payload.name,
      valueAtPath(payload, "item.name"),
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

function resolvePlanBinding(binding, executedSteps, targetField) {
  const expression = String(binding || "").trim();
  const match = /^steps\.(\d+)\.(.+)$/.exec(expression);
  if (match) {
    const index = Number(match[1]) - 1;
    const rest = match[2].replace(/^result\./, "");
    const step = executedSteps[index];
    return step ? valueAtPath(step.payload, rest) : undefined;
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

function applyPlanRuntimeBindings(step, executedSteps) {
  const args = { ...(step.safeArgs || {}) };
  const bindings = step.resultBindings || {};
  const tool = toolByName(step.tool);
  const schemaProperties = tool && tool.inputSchema && tool.inputSchema.properties && typeof tool.inputSchema.properties === "object"
    ? tool.inputSchema.properties
    : null;
  const unresolved = [];
  for (const field of Object.keys(args)) {
    if (!isPlanBindingExpression(args[field])) continue;
    const value = resolvePlanBinding(args[field], executedSteps, field);
    if (value === undefined || value === null || value === "") {
      unresolved.push(field);
    } else {
      args[field] = value;
    }
  }
  for (const field of Object.keys(bindings)) {
    if (hasArg(args, field) && args[field] !== null && args[field] !== undefined && args[field] !== "") {
      continue;
    }
    if (schemaProperties && !hasArg(schemaProperties, field)) {
      continue;
    }
    const value = resolvePlanBinding(bindings[field], executedSteps, field);
    if (value === undefined || value === null || value === "") {
      unresolved.push(field);
    } else {
      args[field] = value;
    }
  }
  return { args, unresolved };
}

const PLANNING_TOOL_NAMES = [
  "get_bridge_status",
  "ping_ae",
  "get_project_snapshot",
  "get_project_info",
  "get_active_comp",
  "list_comps",
  "list_layers",
  "get_comp_details",
  "get_layer_details",
  "get_selected_layers",
  "get_selected_properties",
  "find_project_items",
  "find_comps",
  "list_effect_presets",
  "list_effects",
  "get_effect_details",
  "checkpoint_project",
  "create_text_layer",
  "import_footage",
  "create_solid_layer",
  "create_null_layer",
  "create_adjustment_layer",
  "add_project_item_to_comp",
  "duplicate_comp",
  "add_effect",
  "set_effect_property",
  "set_property_value",
  "set_layer_transform",
  "apply_transform_expression",
  "add_layer_marker",
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

async function runValidatedAgentPlan(options) {
  options = options || {};
  const plan = options.plan;
  const validation = validateAgentPlanObject(plan, options.requestId || null);
  const dryRun = optionalBoolean(options, "dryRun", true);
  const confirm = optionalBoolean(options, "confirm", false);
  const allowMutations = optionalBoolean(options, "allowMutations", false);
  const autoEditSession = optionalBoolean(options, "autoEditSession", false);
  const allowRuntimeBindings = optionalBoolean(options, "allowRuntimeBindings", true);
  const allowWithoutCheckpoint = optionalBoolean(options, "allowWithoutCheckpoint", false);
  const allowRawExtendscript = optionalBoolean(options, "allowRawExtendscript", false);
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

  function finishRun() {
    run.finishedAt = new Date().toISOString();
    if (typeof run.ok !== "boolean") {
      run.ok = run.failedCount === 0 && !run.steps.some((step) => step.status === "blocked");
    }
    return run;
  }

  if (!validation.ok) {
    run.ok = false;
    run.error = "Plan validation failed.";
    return finishRun();
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
        item.reason = `Runtime bindings will resolve during run: ${bound.unresolved.join(", ")}`;
        item.unresolved = bound.unresolved;
        run.steps.push(item);
        continue;
      }
      item.status = "blocked";
      item.reason = `Unresolved runtime bindings: ${bound.unresolved.join(", ")}`;
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

function buildAePlanPrompt(args) {
  const userPrompt = optionalString(args || {}, "prompt", optionalString(args || {}, "message", "")).trim();
  if (!userPrompt) throw new Error("prompt or message is required for AE Plan mode.");

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
    "Treat Russian/Cyrillic user text as a normal request. If a Russian phrase is ambiguous, infer cautiously from the After Effects context before asking for clarification.",
    optionalBoolean(args || {}, "promptOptimization", false) ? "Prompt Optimization is enabled: clarify the user's intent internally, choose conservative AE defaults, and do not expand the requested scope." : "",
    "Use get_bridge_status or ping_ae for bridge health checks. Use get_project_snapshot, get_active_comp, get_comp_details, and get_layer_details before choosing project targets.",
    "For any project-changing request, plan inspection steps first, then the narrow mutating step(s), then verification/readback steps.",
    "You do not need to add a checkpoint_project step for every mutation because the plan runner can create a protected edit session, but set requiresCheckpoint=true for broad, destructive, or multi-step project changes.",
    "When a creation tool can set a property directly, include that property in the creation tool args instead of adding a later step that needs an unknown layerIndex.",
    "If a later step depends on a previous tool result, set dependsOnStep and resultBindings instead of inventing indices.",
    "Use mutating tools only as planned steps; do not execute them. Use run_extendscript only when no narrower tool fits."
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
      runLogFile: AI_CHAT_LOG_FILE
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
  appendAiChatEvent("plan_started", {
    requestId,
    source,
    ...aiChatRequestSummary(args || {})
  });

  try {
    const planPrompt = buildAePlanPrompt(args || {});
    const result = await aiAgents.chatWithAgent({
      ...(args || {}),
      messages: undefined,
      prompt: planPrompt,
      system: optionalString(args || {}, "system", AE_PLAN_SYSTEM_PROMPT),
      temperature: hasArg(args || {}, "temperature") ? args.temperature : 0.2,
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
    const validation = parsed.ok ? validateAgentPlanObject(parsed.plan, requestId) : null;
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
      stepCount: parsed.plan && Array.isArray(parsed.plan.steps) ? parsed.plan.steps.length : 0,
      validationOk: validation ? validation.ok : false,
      mutatingCount: validation ? validation.mutatingCount : 0,
      logFile: AI_CHAT_LOG_FILE
    };
    appendAiChatEvent("plan_finished", metadata);
    return {
      ...result,
      mode: "ae-plan",
      requestId,
      startedAt,
      finishedAt: metadata.finishedAt,
      durationMs: metadata.durationMs,
      runLogFile: AI_CHAT_LOG_FILE,
      planParseOk: parsed.ok,
      planRepaired: repaired,
      planRepairModel: repairModel,
      plan: parsed.plan || null,
      planValidation: validation,
      planRepairError: repairError,
      planParseError: parsed.error || null
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
        lastPanelInfo: status.lastPanelInfo
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
        writeJson(res, 500, {
          ok: false,
          error: error.message || String(error)
        });
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
        writeJson(res, 500, {
          ok: false,
          error: error.message || String(error)
        });
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
        writeJson(res, 400, {
          ok: false,
          error: error.message || String(error)
        });
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
        writeJson(res, 400, {
          ok: false,
          error: error.message || String(error),
          codexStatus: error.status || null
        });
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
        writeJson(res, 500, {
          ok: false,
          error: error.message || String(error),
          requestId: error.requestId || null,
          readiness: error.readiness || null
        });
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
        writeJson(res, 500, {
          ok: false,
          error: error.message || String(error),
          requestId: error.requestId || null,
          readiness: error.readiness || null
        });
      }
      return;
    }

    if ((url.pathname === "/agents/plan/validate" || url.pathname === "/dev/agents/plan/validate") && req.method === "POST") {
      if (!requireToken(req, res, url)) return;
      try {
        const body = await readJsonBody(req);
        const plan = body.plan || body;
        writeJson(res, 200, {
          ok: true,
          validation: validateAgentPlanObject(plan, body.requestId || body.validationId || null)
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
          run
        });
      } catch (error) {
        writeJson(res, 400, {
          ok: false,
          error: error.message || String(error)
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
        const result = await callToolLogged("mcp-adapter", name, args);
        writeJson(res, 200, {
          ok: true,
          tool: name,
          result
        });
      } catch (error) {
        writeJson(res, 500, {
          ok: false,
          error: error.message || String(error),
          line: error.line || null
        });
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
          ok: false,
          tool: name,
          error: error.message || String(error),
          line: error.line || null
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
        writeJson(res, 500, {
          ok: false,
          error: error.message || String(error),
          line: error.line || null
        });
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
        at: lastPanelSeenAt
      };
      if (pendingCommands.length || Date.now() - lastPanelPollLoggedAt > 60000) {
        lastPanelPollLoggedAt = Date.now();
        recordEvent("panel_poll", {
          pendingCommands: pendingCommands.length,
          userAgent: lastPanelInfo.userAgent
        });
      }

      if (pendingCommands.length) {
        const command = pendingCommands.shift();
        writeJson(res, 200, { ok: true, command });
        return;
      }

      writeJson(res, 200, { ok: true, command: null });
      return;
    }

    if (url.pathname === "/bridge/result" && req.method === "POST") {
      if (!requireToken(req, res, url)) return;
      const body = await readBody(req);
      const payload = body ? JSON.parse(body) : {};
      const command = inflightCommands.get(payload.id);

      if (!command) {
        writeJson(res, 404, { ok: false, error: "Unknown command id" });
        return;
      }

      clearTimeout(command.timeout);
      inflightCommands.delete(payload.id);
      retainCommandResult(payload.id, payload, command);

      if (payload.ok) {
        command.resolve(payload.result);
        recordEvent("ae_command_result", {
          id: payload.id,
          ok: true,
          ageMs: Date.now() - command.createdAt
        });
      } else {
        command.reject(new Error(payload.error || "After Effects command failed"));
        recordEvent("ae_command_result", {
          id: payload.id,
          ok: false,
          ageMs: Date.now() - command.createdAt,
          error: payload.error || "After Effects command failed"
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
    name: "list_ai_agents",
    description: "List configured OpenAI API, OpenAI CLI, OpenRouter, Ollama, and custom AI agents available through the bridge.",
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
          description: "Agent id from list_ai_agents, such as openai-cli, openai-api, openrouter, ollama-local, or ollama-cloud."
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
    description: "Send a chat prompt to a configured OpenAI API, OpenAI CLI, OpenRouter, Ollama, or custom AI agent.",
    inputSchema: {
      type: "object",
      properties: {
        agentId: {
          type: "string",
          description: "Agent id from list_ai_agents, such as openai-cli, openai-api, openrouter, ollama-local, or ollama-cloud."
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
          description: "Optional maximum response tokens for OpenAI-compatible providers."
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
          description: "Agent id from list_ai_agents, such as openai-cli, openai-api, openrouter, ollama-local, or ollama-cloud."
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
    description: "Dry-run or execute a validated AE MCP plan. Real execution requires confirm:true; mutating plans also require allowMutations:true.",
    inputSchema: {
      type: "object",
      properties: {
        plan: {
          type: "object",
          description: "Plan object returned by plan_with_ai_agent."
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
        maxSteps: {
          type: "number",
          description: "Maximum steps to consider. Defaults to 20."
        }
      },
      required: ["plan"]
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
        includeLayers: {
          type: "boolean",
          description: "Whether to include layer summaries. Defaults to true."
        },
        layerLimit: {
          type: "number",
          description: "Maximum number of layers to include. Defaults to 200, maximum 1000."
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
          type: "number",
          description: "1-based layer index in the target composition."
        },
        propertyPath: {
          type: "array",
          description: "Property path from the layer. Segments can be names, numeric indexes, or objects with matchName/name/propertyIndex.",
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
        return {
          itemIndex: __codexProjectIndexForItem(item),
          name: item.name || "",
          type: __codexItemType(item),
          typeName: item.typeName || null
        };
      }

      function __codexLayerInfo(layer) {
        var info = {
          index: layer.index,
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
        };

        try { info.label = layer.label; } catch (__labelError) {}
        try { info.hasVideo = !!layer.hasVideo; } catch (__hasVideoError) {}
        try { info.hasAudio = !!layer.hasAudio; } catch (__hasAudioError) {}
        try { info.nullLayer = !!layer.nullLayer; } catch (__nullLayerError) {}
        try { info.guideLayer = !!layer.guideLayer; } catch (__guideLayerError) {}
        try { info.adjustmentLayer = !!layer.adjustmentLayer; } catch (__adjustmentLayerError) {}
        try { info.threeDLayer = !!layer.threeDLayer; } catch (__threeDError) {}
        try { info.blendingMode = layer.blendingMode; } catch (__blendError) {}
        try { info.parent = layer.parent ? __codexLayerInfo(layer.parent) : null; } catch (__parentError) {}
        try { info.source = layer.source ? __codexItemReference(layer.source) : null; } catch (__sourceError) {}

        return info;
      }

      function __codexValuePreview(prop) {
        var value = prop.value;
        if (value === null || value === undefined) return { kind: "null", value: null };
        if (typeof value === "number" || typeof value === "boolean" || typeof value === "string") {
          return { kind: typeof value, value: value };
        }
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
        readiness: error.readiness || null
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
        readiness: error.readiness || null
      }, true);
    }
  }

  if (name === "validate_ai_agent_plan") {
    try {
      return toolResult(validateAgentPlanObject((args || {}).plan, (args || {}).requestId || null));
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
      return {
        file: project && project.file ? project.file.fsName : null,
        bitsPerChannel: project ? project.bitsPerChannel : null,
        numItems: project ? project.numItems : 0,
        activeItemName: project && project.activeItem ? project.activeItem.name : null,
        activeItemType: project && project.activeItem ? project.activeItem.typeName : null
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
          comment: item.comment || ""
        };

        if (item instanceof CompItem) {
          info.width = item.width;
          info.height = item.height;
          info.duration = item.duration;
          info.frameRate = item.frameRate;
          info.numLayers = item.numLayers;
          info.displayStartTime = item.displayStartTime;
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
    const includeLayers = optionalBoolean(args, "includeLayers", true);
    const layerLimit = Math.max(1, Math.min(1000, Math.floor(optionalNumber(args, "layerLimit", 200))));

    const result = await runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex});
      var includeLayers = ${includeLayers ? "true" : "false"};
      var layerLimit = ${layerLimit};
      var selectedLayerIndices = [];
      for (var s = 0; s < comp.selectedLayers.length; s++) {
        selectedLayerIndices.push(comp.selectedLayers[s].index);
      }

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
        frameRate: comp.frameRate,
        displayStartTime: comp.displayStartTime,
        time: comp.time,
        bgColor: comp.bgColor,
        numLayers: comp.numLayers,
        selectedLayerIndices: selectedLayerIndices,
        layersReturned: layers.length,
        layersTruncated: includeLayers && comp.numLayers > layers.length,
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
        transform = {
          anchorPoint: __codexReadProperty(transformGroup, "ADBE Anchor Point"),
          position: __codexReadProperty(transformGroup, "ADBE Position"),
          scale: __codexReadProperty(transformGroup, "ADBE Scale"),
          rotation: __codexReadProperty(transformGroup, "ADBE Rotate Z"),
          opacity: __codexReadProperty(transformGroup, "ADBE Opacity")
        };
      } catch (__transformError) {}

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
              maskMode: mask.maskMode,
              inverted: mask.inverted
            });
          }
        }
      } catch (__masksError) {}

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
        text: text,
        effects: effects,
        masks: masks,
        propertyTree: propertyTree,
        propertyTreeTruncated: propertyState.count >= propertyState.max
      };
    `);
    return toolResult(result.result);
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

  if (name === "set_property_value") {
    const compItemIndex = optionalPositiveInteger(args, "compItemIndex");
    const compName = optionalString(args, "compName", "");
    const layerIndex = requiredPositiveInteger(args, "layerIndex");
    const time = optionalNumber(args, "time", null);
    const setAtTime = optionalBoolean(args, "setAtTime", time !== null);

    let propertyPath;
    if (Array.isArray(args.propertyPath)) {
      propertyPath = args.propertyPath;
    } else if (typeof args.propertyPath === "string" && args.propertyPath.trim().startsWith("[")) {
      propertyPath = JSON.parse(args.propertyPath);
    } else {
      return toolResult("propertyPath must be an array, or a JSON-encoded array string.", true);
    }

    if (propertyPath.length === 0) return toolResult("propertyPath must not be empty.", true);
    if (!hasArg(args, "value")) return toolResult("value is required.", true);
    if (setAtTime && time === null) return toolResult("time is required when setAtTime is true.", true);

    const value = args.value;

    const result = await runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex}, ${aeLiteral(compName)});
      var layer = comp.layer(${layerIndex});
      if (!layer) throw new Error("Layer not found.");
      if (layer.locked) throw new Error("Layer is locked.");

      var propertyPath = ${aeLiteral(propertyPath)};
      var requestedValue = ${aeLiteral(value)};
      var shouldSetAtTime = ${setAtTime ? "true" : "false"};
      var targetTime = ${time === null ? "null" : time};
      var prop = __codexResolveProperty(layer, propertyPath);

      app.beginUndoGroup("Codex Set Property Value");
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
        property: __codexPropertyInfo(prop, layer, true, true),
        setAtTime: shouldSetAtTime,
        time: targetTime
      };
      app.endUndoGroup();
      return response;
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

  if (name === "add_layer_marker") {
    const compItemIndex = optionalPositiveInteger(args, "compItemIndex");
    const compName = optionalString(args, "compName", "");
    const layerIndex = requiredPositiveInteger(args, "layerIndex");
    const time = optionalNumber(args, "time", null);
    const comment = optionalString(args, "comment", "");
    const duration = optionalNumber(args, "duration", null);

    if (!comment) return toolResult("comment is required.", true);
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
      layer.property("ADBE Marker").setValueAtTime(markerTime, markerValue);
      var response = {
        comp: {
          itemIndex: __codexProjectIndexForItem(comp),
          name: comp.name
        },
        layer: __codexLayerInfo(layer),
        marker: {
          time: markerTime,
          comment: markerComment,
          duration: markerDuration || 0
        }
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
      try { comp.comment = "Created by Codex AE MCP Bridge create_test_comp"; } catch (__commentError) {}
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
