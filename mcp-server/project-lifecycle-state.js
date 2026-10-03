"use strict";

const getProjectLifecycleStateTool = Object.freeze({
  name: "get_project_lifecycle_state",
  description: "Read native After Effects project lifecycle fields without changing the project.",
  inputSchema: Object.freeze({ type: "object", properties: Object.freeze({}), additionalProperties: false })
});

function nativeReadScript() {
  return ` (function () {\n` +
    `  var result = { appVersion: null, projectPresent: null, file: null, dirty: null, revision: null, supported: { appVersion: false, file: false, dirty: false, revision: false } };\n` +
    `  function read(fn) { try { return fn(); } catch (_) { return undefined; } }\n` +
    `  var appObject = read(function () { return app; });\n` +
    `  if (appObject) {\n` +
    `    var version = read(function () { return appObject.version; });\n` +
    `    if (typeof version === "string" && version.length) { result.appVersion = version; result.supported.appVersion = true; }\n` +
    `    var project; var projectRead = false;\n` +
    `    try { project = appObject.project; projectRead = true; } catch (_) {}\n` +
    `    if (projectRead) result.projectPresent = project !== null && project !== undefined;\n` +
    `    if (projectRead && project) {\n` +
    `      var file = read(function () { return project.file; });\n` +
    `      if (file === null) { result.file = null; result.supported.file = true; }\n` +
    `      else if (file) { var fsName = read(function () { return file.fsName; }); if (typeof fsName === "string") { result.file = fsName; result.supported.file = true; } }\n` +
    `      var dirty = read(function () { return project.dirty; });\n` +
    `      if (typeof dirty === "boolean") { result.dirty = dirty; result.supported.dirty = true; }\n` +
    `      var revision = read(function () { return project.revision; });\n` +
    `      if (typeof revision === "number" && isFinite(revision) && Math.floor(revision) === revision && revision >= 0) { result.revision = revision; result.supported.revision = true; }\n` +
    `    }\n` +
    `  }\n` +
    `  return result;\n` +
    `}());`;
}

function normalizeProjectLifecycleState(runtimeResult, observedAt = new Date().toISOString()) {
  let raw = runtimeResult;
  const seen = new Set();
  let unwraps = 0;
  while (raw && typeof raw === "object" && !Array.isArray(raw) && Object.prototype.hasOwnProperty.call(raw, "result")) {
    if (seen.has(raw) || unwraps >= 4) { raw = null; break; }
    seen.add(raw);
    raw = raw.result;
    unwraps += 1;
  }
  if (typeof raw === "string") {
    try { raw = JSON.parse(raw); } catch (_) { raw = null; }
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || typeof raw.projectPresent !== "boolean") raw = null;
  const supportedInput = raw && raw.supported && typeof raw.supported === "object" && !Array.isArray(raw.supported) ? raw.supported : {};
  const supported = {
    appVersion: !!raw && supportedInput.appVersion === true && typeof raw.appVersion === "string" && raw.appVersion.length > 0,
    file: !!raw && supportedInput.file === true && (raw.file === null || typeof raw.file === "string"),
    dirty: !!raw && supportedInput.dirty === true && typeof raw.dirty === "boolean",
    revision: !!raw && supportedInput.revision === true && Number.isSafeInteger(raw.revision) && raw.revision >= 0
  };
  const projectPresent = raw ? raw.projectPresent : null;
  const file = supported.file ? raw.file : null;
  const project = projectPresent === false ? "absent" : projectPresent !== true || !supported.file ? "unknown"
    : file === null || file === "" ? "unnamed" : "named";
  const lifecycleReady = project === "named" && supported.dirty && supported.revision;
  const reasons = [];
  if (project === "unknown") reasons.push("project_file_unknown");
  else if (project === "absent") reasons.push("project_absent");
  else if (project === "unnamed") reasons.push("project_unnamed");
  if (!supported.dirty) reasons.push("dirty_unknown");
  if (!supported.revision) reasons.push("revision_unknown");
  return {
    observedAt,
    appVersion: supported.appVersion ? raw.appVersion : null,
    projectPresent,
    project,
    file,
    dirty: supported.dirty ? raw.dirty : null,
    revision: supported.revision ? raw.revision : null,
    supported,
    lifecycleReady,
    reasons
  };
}

module.exports = { getProjectLifecycleStateTool, nativeReadScript, normalizeProjectLifecycleState };
