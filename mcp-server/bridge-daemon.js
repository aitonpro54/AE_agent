#!/usr/bin/env node
"use strict";

const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const SERVER_NAME = "codex-ae-mcp-bridge";
const SERVER_VERSION = "0.5.2";
const PROTOCOL_VERSION = "2025-03-26";
const HOST = "127.0.0.1";
const PORT = Number(process.env.AE_BRIDGE_PORT || 3456);
const TOKEN = process.env.AE_BRIDGE_TOKEN || "codex-ae-local";
const COMMAND_TIMEOUT_MS = Number(process.env.AE_COMMAND_TIMEOUT_MS || 30000);
const PROJECT_ROOT = path.resolve(__dirname, "..");
const LOG_DIR = path.join(PROJECT_ROOT, "logs");
const LOG_FILE = path.join(LOG_DIR, "bridge-events.jsonl");
const BACKUP_DIR = path.join(PROJECT_ROOT, "backups");
const ALLOW_SCRIPT_FILES_OUTSIDE_PROJECT = process.env.AE_ALLOW_SCRIPT_FILES_OUTSIDE_PROJECT === "1";
const STARTED_AT = Date.now();

const pendingCommands = [];
const inflightCommands = new Map();
const completedResults = new Map();
const waitingPanels = [];
const recentEvents = [];

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
    backupDir: BACKUP_DIR,
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
      writeJson(res, 200, { ok: true, tools });
      return;
    }

    if (url.pathname === "/tools" && req.method === "GET") {
      if (!requireToken(req, res, url)) return;
      writeJson(res, 200, { ok: true, tools });
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
      properties: {}
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
    name: "set_layer_transform",
    description: "Set common transform values on a layer: position, scale, rotation, opacity, or anchor point.",
    inputSchema: {
      type: "object",
      properties: {
        compItemIndex: {
          type: "number",
          description: "Optional 1-based project item index for the target composition. Defaults to active comp."
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
  const resolveCompScript = `
      function __codexProjectIndexForItem(target) {
        for (var __i = 1; __i <= app.project.numItems; __i++) {
          if (app.project.item(__i) === target) return __i;
        }
        return null;
      }

      function __codexResolveComp(index) {
        var item = null;
        if (index !== null && index !== undefined) {
          item = app.project.item(index);
        } else {
          item = app.project.activeItem;
        }
        if (!(item instanceof CompItem)) {
          throw new Error(index ? "Project item is not a composition." : "Active item is not a composition.");
        }
        return item;
      }

      function __codexLayerInfo(layer) {
        return {
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
      }

      function __codexPropertyInfo(prop, layer) {
        var info = {
          name: prop.name,
          matchName: prop.matchName || null,
          propertyIndex: prop.propertyIndex || null,
          propertyDepth: prop.propertyDepth || null,
          propertyType: prop.propertyType || null,
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

  if (name === "get_command_log") {
    const limit = Math.max(1, Math.min(200, Math.floor(optionalNumber(args, "limit", 50))));
    return toolResult({
      logFile: LOG_FILE,
      events: tailJsonl(LOG_FILE, limit)
    });
  }

  if (name === "backup_project_file") {
    const label = sanitizeFilenamePart(optionalString(args, "label", ""));
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

    const sourceFile = projectInfo.result.file;
    if (!sourceFile) {
      return toolResult("The current After Effects project has not been saved yet, so there is no .aep file to back up.", true);
    }
    if (!fs.existsSync(sourceFile)) {
      return toolResult(`Project file does not exist on disk: ${sourceFile}`, true);
    }

    ensureDir(BACKUP_DIR);
    const parsed = path.parse(sourceFile);
    const base = sanitizeFilenamePart(parsed.name) || "after-effects-project";
    const suffix = label ? `-${label}` : "";
    const destinationFile = path.join(BACKUP_DIR, `${base}${suffix}-${timestampForFilename(new Date())}${parsed.ext || ".aep"}`);

    fs.copyFileSync(sourceFile, destinationFile, fs.constants.COPYFILE_EXCL);
    const stat = fs.statSync(destinationFile);
    const response = {
      sourceFile,
      backupFile: destinationFile,
      bytes: stat.size,
      createdAt: new Date().toISOString(),
      project: projectInfo.result
    };
    recordEvent("project_backup_created", response);
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
    const result = await runExtendScriptBody(script, Number(args.timeoutMs) || COMMAND_TIMEOUT_MS);
    return toolResult({
      filePath: scriptFile.resolvedPath,
      bytes: scriptFile.stat.size,
      result: result.result
    });
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
    const result = await runExtendScriptBody(`
      ${resolveCompScript}
      var comp = app.project.activeItem;
      if (!(comp instanceof CompItem)) {
        throw new Error("Active item is not a composition.");
      }

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
            properties.push(__codexPropertyInfo(prop, ownerLayer));
          }
        }
      } catch (__selectedPropertiesError) {}

      if (properties.length === 0) {
        for (var l = 0; l < comp.selectedLayers.length; l++) {
          var layer = comp.selectedLayers[l];
          var selectedProps = layer.selectedProperties || [];
          for (var p = 0; p < selectedProps.length; p++) {
            properties.push(__codexPropertyInfo(selectedProps[p], layer));
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
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex});
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

  if (name === "set_layer_transform") {
    const compItemIndex = optionalPositiveInteger(args, "compItemIndex");
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
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex});
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
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex});
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
    const layerIndex = requiredPositiveInteger(args, "layerIndex");
    const time = optionalNumber(args, "time", null);
    const comment = optionalString(args, "comment", "");
    const duration = optionalNumber(args, "duration", null);

    if (!comment) return toolResult("comment is required.", true);
    if (duration !== null && duration < 0) return toolResult("duration must be 0 or greater.", true);

    const result = await runExtendScriptBody(`
      ${resolveCompScript}
      var comp = __codexResolveComp(${compItemIndex === null ? "null" : compItemIndex});
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
  recordEvent("tool_call_started", {
    id: eventId,
    source,
    name,
    args
  });

  try {
    const result = await callTool(name, args);
    recordEvent("tool_call_finished", {
      id: eventId,
      source,
      name,
      ok: !result.isError,
      durationMs: Date.now() - startedAt
    });
    return result;
  } catch (error) {
    recordEvent("tool_call_failed", {
      id: eventId,
      source,
      name,
      durationMs: Date.now() - startedAt,
      error: error.message || String(error),
      line: error.line || null
    });
    throw error;
  }
}

startHttpBridge();
