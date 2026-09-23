"use strict";
const crypto = require("crypto");
function failure(message, status = 400) { const error = new Error(message); error.status = status; return error; }
function equal(a, b) {
  return Boolean(a && b && Buffer.byteLength(a) === Buffer.byteLength(b) && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b)));
}
function createBoundary(config) {
  const credentials = { automation: config.automation || "", panel: config.panel || "", admin: config.adminEnabled ? config.admin || "" : "" };
  const enabled = Object.values(credentials).filter(Boolean);
  if (new Set(enabled).size !== enabled.length) throw failure("Enabled bridge credentials must be distinct.");
  if (config.adminEnabled && !credentials.admin) throw failure("Dev admin requires a separate admin credential.");
  const hosts = new Set(config.hosts || ["127.0.0.1", "localhost", "[::1]"]);
  const origins = new Set(config.origins || []);
  function role(req) {
    const token = req.headers["x-ae-bridge-token"];
    if (typeof token !== "string") return null;
    return Object.keys(credentials).find((key) => equal(token, credentials[key])) || null;
  }
  function validate(req) {
    const host = req.headers.host;
    if (typeof host !== "string" || /[\s/@\\]/.test(host)) throw failure("Host denied.", 403);
    let hostname;
    try { hostname = new URL(`http://${host}`).hostname; } catch (_) { throw failure("Host denied.", 403); }
    if (!hosts.has(hostname)) throw failure("Host denied.", 403);
    if (req.headers.origin !== undefined) {
      const origin = req.headers.origin;
      let allowed = origins.has(origin) || origin === "null" || origin === "file://";
      if (!allowed) {
        try { const parsed = new URL(origin); allowed = ["http:", "https:"].includes(parsed.protocol) && hosts.has(parsed.hostname); } catch (_) {}
      }
      if (!allowed) throw failure("Origin denied.", 403);
    }
  }
  return { role, validate };
}
function readJsonObject(req, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let bytes = 0, settled = false;
    const chunks = [];
    const finish = (error, result) => { if (settled) return; settled = true; error ? reject(error) : resolve(result); };
    req.on("data", (chunk) => {
      if (settled) return;
      bytes += Buffer.byteLength(chunk);
      if (bytes > limit) { chunks.length = 0; finish(failure("JSON body too large.", 413)); return; }
      chunks.push(Buffer.from(chunk));
    });
    req.on("aborted", () => finish(failure("Request aborted.")));
    req.on("error", () => finish(failure("Request stream failed.")));
    req.on("end", () => {
      if (settled) return;
      try {
        const value = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
        if (!value || typeof value !== "object" || Array.isArray(value)) throw failure("JSON body must be an object.");
        if (value.arguments !== undefined && (!value.arguments || typeof value.arguments !== "object" || Array.isArray(value.arguments))) throw failure("arguments must be an object.");
        if (value.name !== undefined && typeof value.name !== "string") throw failure("name must be a string.");
        for (const key of ["enabled", "dryRun", "confirm", "allowMutations", "includeQuota"]) {
          if (value[key] !== undefined && typeof value[key] !== "boolean") throw failure(`${key} must be boolean.`);
        }
        for (const key of ["id", "executionId", "leaseId", "panelConnectionId", "panelGeneration", "actionId", "confirmationToken"]) {
          if (value[key] !== undefined && typeof value[key] !== "string") throw failure(`${key} must be a string.`);
        }
        if (value.plan !== undefined && (!value.plan || typeof value.plan !== "object" || Array.isArray(value.plan))) throw failure("plan must be an object.");
        finish(null, value);
      } catch (error) { finish(failure(error.status ? error.message : "Invalid JSON body.")); }
    });
  });
}
function sanitizeAutomationResponse(value, key = "", depth = 0) {
  if (depth > 64) throw failure("Response nesting exceeds safe limit.");
  if (typeof value === "string" && key === "text") {
    let parsed;
    try { parsed = JSON.parse(value); } catch (_) { return value; }
    if (parsed && typeof parsed === "object") return JSON.stringify(sanitizeAutomationResponse(parsed, "", depth + 1));
  }
  if (Array.isArray(value)) return value.map(item=>sanitizeAutomationResponse(item,"",depth+1));
  if (value && typeof value === "object") {
    const result = {};
    for (const name of Object.keys(value)) {
      if (name === "confirmationToken" || name === "confirmationTokenHash") continue;
      result[name] = sanitizeAutomationResponse(value[name],name,depth+1);
    }
    return result;
  }
  return value;
}
module.exports = { createBoundary, readJsonObject, sanitizeAutomationResponse };
