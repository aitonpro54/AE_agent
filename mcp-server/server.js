#!/usr/bin/env node
"use strict";

const http = require("http");
const readline = require("readline");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const SERVER_NAME = "codex-ae-mcp-bridge";
const SERVER_VERSION = "0.3.0";
const PROTOCOL_VERSION = "2025-03-26";
const HOST = "127.0.0.1";
const PORT = Number(process.env.AE_BRIDGE_PORT || 3456);
const TOKEN = process.env.AE_BRIDGE_TOKEN || crypto.randomBytes(18).toString("hex");
const COMMAND_TIMEOUT_MS = Number(process.env.AE_COMMAND_TIMEOUT_MS || 30000);
const BRIDGE_ONLY = process.argv.includes("--bridge-only") || process.env.AE_BRIDGE_ONLY === "1";
const PROJECT_ROOT = path.resolve(__dirname, "..");
const LOG_DIR = path.join(PROJECT_ROOT, "logs");
const LOG_FILE = path.join(LOG_DIR, "bridge-events.jsonl");
const BACKUP_DIR = path.join(PROJECT_ROOT, "backups");
const STARTED_AT = Date.now();

const pendingCommands = [];
const inflightCommands = new Map();
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
    waitingPanels: waitingPanels.length,
    logFile: LOG_FILE,
    backupDir: BACKUP_DIR,
    recentEvents: recentEvents.slice(-25)
  };
}

function sendRpc(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function ok(id, result) {
  sendRpc({ jsonrpc: "2.0", id, result });
}

function err(id, code, message, data) {
  const error = { code, message };
  if (data !== undefined) error.data = data;
  sendRpc({ jsonrpc: "2.0", id, error });
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

function drainWaitingPanels() {
  while (waitingPanels.length && pendingCommands.length) {
    const waiter = waitingPanels.shift();
    const command = pendingCommands.shift();
    clearTimeout(waiter.timer);
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
  return `(function () {
  try {
    var __result = (function () {
${body}
    })();
    if (__result === undefined) {
      return JSON.stringify({ ok: true, result: null });
    }
    return JSON.stringify({ ok: true, result: __result });
  } catch (__error) {
    return JSON.stringify({
      ok: false,
      error: String(__error),
      line: __error && __error.line ? __error.line : null
    });
  }
}())`;
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

      const timer = setTimeout(() => {
        const index = waitingPanels.findIndex((waiter) => waiter.res === res);
        if (index >= 0) waitingPanels.splice(index, 1);
        writeJson(res, 200, { ok: true, command: null });
      }, 15000);

      waitingPanels.push({ res, timer });
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

async function handleRpc(message) {
  if (!message || message.jsonrpc !== "2.0") return;
  const id = message.id;

  try {
    if (message.method === "initialize") {
      ok(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {
          tools: {}
        },
        serverInfo: {
          name: SERVER_NAME,
          version: SERVER_VERSION
        }
      });
      return;
    }

    if (message.method === "tools/list") {
      ok(id, { tools });
      return;
    }

    if (message.method === "tools/call") {
      const params = message.params || {};
      const result = await callToolLogged("mcp", params.name, params.arguments || {});
      ok(id, result);
      return;
    }

    if (message.method === "notifications/initialized" || id === undefined || id === null) {
      return;
    }

    err(id, -32601, `Method not found: ${message.method}`);
  } catch (error) {
    err(id, -32000, error.message || String(error), {
      stack: error.stack,
      line: error.line || null
    });
  }
}

function startStdioMcp() {
  const rl = readline.createInterface({
    input: process.stdin,
    crlfDelay: Infinity
  });

  rl.on("line", (line) => {
    if (!line.trim()) return;
    let message;
    try {
      message = JSON.parse(line);
    } catch (parseError) {
      log(`Bad JSON-RPC message: ${parseError.message}`);
      return;
    }

    if (Array.isArray(message)) {
      for (const item of message) {
        handleRpc(item);
      }
      return;
    }

    handleRpc(message);
  });

  rl.on("close", () => {
    log("stdin closed");
    process.exit(0);
  });
}

startHttpBridge();
if (BRIDGE_ONLY) {
  log("Bridge-only mode enabled; stdio MCP transport is disabled.");
} else {
  startStdioMcp();
}
