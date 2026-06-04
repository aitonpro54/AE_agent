"use strict";

const fs = require("fs");
const path = require("path");

const { DEFAULT_REPORT_DIR } = require("./agent-scenario-report");
const { safeOutputName } = require("./agent-scenario-fixtures");

const AUDIT_SCHEMA_VERSION = "agent-qa-audit.v1";
const DEFAULT_GENERATED_QA_PREFIXES = [
  "Codex QA 1.2",
  "Codex Test Safe Run",
  "Codex Test Live Typed"
];

function normalizePrefixes(value, fallback) {
  const source = Array.isArray(value)
    ? value
    : String(value || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  const base = source.length ? source : (Array.isArray(fallback) ? fallback : []);
  const seen = new Set();
  const prefixes = [];
  for (const raw of base) {
    const prefix = String(raw || "").trim();
    if (prefix.length < 3 || seen.has(prefix)) continue;
    seen.add(prefix);
    prefixes.push(prefix);
  }
  return prefixes;
}

function safeReadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (_error) {
    return null;
  }
}

function addPrefix(target, value) {
  const prefix = String(value || "").trim();
  if (prefix.length >= 3) target.push(prefix);
}

function addReportPrefixCandidates(target, report) {
  if (!report || typeof report !== "object") return;
  addPrefix(target, report.runPrefix);
  addPrefix(target, report.cleanupPrefix);
  if (report.run) addPrefix(target, report.run.runPrefix);
  if (report.cleanup && report.cleanup.final) addPrefix(target, report.cleanup.final.cleanupPrefix);
  if (report.finalCleanup) addPrefix(target, report.finalCleanup.cleanupPrefix);

  for (const groupName of ["scenarios", "cleanups"]) {
    const group = Array.isArray(report[groupName]) ? report[groupName] : [];
    for (const item of group) addPrefix(target, item && item.cleanupPrefix);
  }

  const cleanupScenarios = report.cleanup && Array.isArray(report.cleanup.scenarios)
    ? report.cleanup.scenarios
    : [];
  for (const item of cleanupScenarios) addPrefix(target, item && item.cleanupPrefix);
}

function collectReportPrefixes(options) {
  const opts = options || {};
  const reportDir = opts.reportDir || process.env.AE_AGENT_RUN_REPORT_DIR || DEFAULT_REPORT_DIR;
  const limit = Math.max(1, Math.min(50, Math.floor(Number(opts.limit || 10))));
  if (!reportDir || !fs.existsSync(reportDir)) return [];

  const entries = fs.readdirSync(reportDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".json"))
    .map((entry) => {
      const filePath = path.join(reportDir, entry.name);
      const stat = fs.statSync(filePath);
      return { filePath, mtimeMs: stat.mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, limit);

  const prefixes = [];
  for (const entry of entries) {
    addReportPrefixCandidates(prefixes, safeReadJson(entry.filePath));
  }
  return normalizePrefixes(prefixes, []);
}

function collectAuditPrefixes(options) {
  const opts = options || {};
  const basePrefixes = normalizePrefixes(opts.prefixes, DEFAULT_GENERATED_QA_PREFIXES);
  if (opts.includeReportPrefixes === false) return basePrefixes;
  return normalizePrefixes(
    basePrefixes.concat(collectReportPrefixes({
      reportDir: opts.reportDir,
      limit: opts.reportLimit
    })),
    basePrefixes
  );
}

function startsWithPrefix(value, prefix) {
  return String(value || "").indexOf(prefix) === 0;
}

function compactProjectItem(item) {
  return {
    itemIndex: item && typeof item.itemIndex === "number" ? item.itemIndex : null,
    name: item && item.name ? item.name : null,
    type: item && item.type ? item.type : null,
    typeName: item && item.typeName ? item.typeName : null,
    folderPath: item && item.folderPath ? item.folderPath : null
  };
}

function auditProjectSearchResults(prefixes, projectSearchResults, detailLimit) {
  const byPrefix = [];
  let leftoverCount = 0;
  const results = Array.isArray(projectSearchResults) ? projectSearchResults : [];
  const limit = Math.max(0, Math.floor(Number(detailLimit || 0)));

  for (const prefix of prefixes) {
    const entry = results.find((item) => item && item.prefix === prefix) || { prefix };
    const rawMatches = entry.result && Array.isArray(entry.result.matches) ? entry.result.matches : [];
    const allMatches = rawMatches
      .filter((item) => startsWithPrefix(item && item.name, prefix))
      .map(compactProjectItem);
    leftoverCount += allMatches.length;
    byPrefix.push({
      prefix,
      ok: !entry.error,
      error: entry.error || null,
      queryReturned: rawMatches.length,
      matchedCount: allMatches.length,
      returned: limit ? Math.min(limit, allMatches.length) : 0,
      truncated: limit ? allMatches.length > limit : allMatches.length > 0,
      matches: limit ? allMatches.slice(0, limit) : []
    });
  }

  return {
    ok: byPrefix.every((entry) => entry.ok),
    leftoverCount,
    byPrefix
  };
}

function outputFilesForRenderQueueItem(item) {
  return (item && Array.isArray(item.outputModules) ? item.outputModules : [])
    .map((outputModule) => outputModule && outputModule.file ? String(outputModule.file) : "")
    .filter(Boolean);
}

function renderQueueMatchReasons(item, prefix) {
  const reasons = [];
  const safePrefix = safeOutputName(prefix);
  const compName = item && item.comp && item.comp.name ? String(item.comp.name) : "";
  const outputFiles = outputFilesForRenderQueueItem(item);

  if (startsWithPrefix(compName, prefix)) reasons.push("compNamePrefix");
  if (outputFiles.some((file) => file.indexOf(prefix) >= 0)) reasons.push("outputPathPrefix");
  if (safePrefix && safePrefix !== prefix && outputFiles.some((file) => file.indexOf(safePrefix) >= 0)) {
    reasons.push("outputPathSafePrefix");
  }
  return reasons;
}

function compactRenderQueueItem(item, matchReasons) {
  return {
    index: item && typeof item.index === "number" ? item.index : null,
    status: item && item.status !== undefined ? item.status : null,
    compName: item && item.comp && item.comp.name ? item.comp.name : null,
    compItemIndex: item && item.comp && typeof item.comp.itemIndex === "number" ? item.comp.itemIndex : null,
    outputFiles: outputFilesForRenderQueueItem(item),
    matchReasons: Array.isArray(matchReasons) ? matchReasons.slice() : []
  };
}

function auditRenderQueue(prefixes, renderQueue, error, detailLimit) {
  if (error) {
    return {
      ok: false,
      error,
      totalItems: null,
      leftoverCount: null,
      byPrefix: []
    };
  }

  const items = renderQueue && Array.isArray(renderQueue.items) ? renderQueue.items : [];
  const limit = Math.max(0, Math.floor(Number(detailLimit || 0)));
  const uniqueMatches = new Set();
  const byPrefix = prefixes.map((prefix) => {
    const matches = [];
    for (const item of items) {
      const reasons = renderQueueMatchReasons(item, prefix);
      if (!reasons.length) continue;
      const index = item && typeof item.index === "number" ? item.index : matches.length + 1;
      uniqueMatches.add(index);
      matches.push(compactRenderQueueItem(item, reasons));
    }
    return {
      prefix,
      matchedCount: matches.length,
      returned: limit ? Math.min(limit, matches.length) : 0,
      truncated: limit ? matches.length > limit : matches.length > 0,
      matches: limit ? matches.slice(0, limit) : []
    };
  });

  return {
    ok: true,
    error: null,
    totalItems: renderQueue && typeof renderQueue.totalItems === "number" ? renderQueue.totalItems : items.length,
    returned: renderQueue && typeof renderQueue.returned === "number" ? renderQueue.returned : items.length,
    leftoverCount: uniqueMatches.size,
    byPrefix
  };
}

function valueContainsAnyPrefix(value, prefixes) {
  const text = String(value || "");
  if (!text) return false;
  return prefixes.some((prefix) => {
    const safePrefix = safeOutputName(prefix);
    return text.indexOf(prefix) >= 0 || (safePrefix && text.indexOf(safePrefix) >= 0);
  });
}

function objectContainsAnyPrefix(value, prefixes, depth) {
  if (!value || depth > 4) return false;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return valueContainsAnyPrefix(value, prefixes);
  }
  if (Array.isArray(value)) return value.some((item) => objectContainsAnyPrefix(item, prefixes, depth + 1));
  if (typeof value === "object") {
    return Object.keys(value).some((key) => objectContainsAnyPrefix(value[key], prefixes, depth + 1));
  }
  return false;
}

function checkpointReasons(checkpoint, prefixes) {
  const reasons = [];
  const label = String(checkpoint && checkpoint.label || "");
  const filename = String(checkpoint && checkpoint.filename || "");
  const checkpointFile = String(checkpoint && checkpoint.checkpointFile || "");
  if (startsWithPrefix(label, "session-ai-plan-")) reasons.push("autoEditSessionCheckpoint");
  if (filename.indexOf("-checkpoint-session-ai-plan-") >= 0) reasons.push("autoEditSessionFilename");
  if (valueContainsAnyPrefix(label, prefixes) || valueContainsAnyPrefix(filename, prefixes) || valueContainsAnyPrefix(checkpointFile, prefixes)) {
    reasons.push("generatedPrefix");
  }
  return Array.from(new Set(reasons));
}

function compactCheckpoint(checkpoint, reasons) {
  return {
    filename: checkpoint && checkpoint.filename ? checkpoint.filename : null,
    label: checkpoint && checkpoint.label ? checkpoint.label : null,
    projectName: checkpoint && checkpoint.projectName ? checkpoint.projectName : null,
    checkpointFile: checkpoint && checkpoint.checkpointFile ? checkpoint.checkpointFile : null,
    bytes: checkpoint && typeof checkpoint.bytes === "number" ? checkpoint.bytes : null,
    createdAt: checkpoint && checkpoint.createdAt ? checkpoint.createdAt : null,
    modifiedAt: checkpoint && checkpoint.modifiedAt ? checkpoint.modifiedAt : null,
    matchReasons: reasons
  };
}

function auditCheckpoints(prefixes, checkpointPayload, error, detailLimit) {
  if (error) {
    return {
      ok: false,
      error,
      backupDir: null,
      totalCheckpoints: null,
      matchedCount: null,
      matched: []
    };
  }

  const checkpoints = checkpointPayload && Array.isArray(checkpointPayload.checkpoints)
    ? checkpointPayload.checkpoints
    : [];
  const limit = Math.max(0, Math.floor(Number(detailLimit || 0)));
  const matched = [];
  for (const checkpoint of checkpoints) {
    const reasons = checkpointReasons(checkpoint, prefixes);
    if (reasons.length) matched.push(compactCheckpoint(checkpoint, reasons));
  }
  return {
    ok: true,
    error: null,
    backupDir: checkpointPayload && checkpointPayload.backupDir ? checkpointPayload.backupDir : null,
    totalCheckpoints: checkpoints.length,
    matchedCount: matched.length,
    returned: limit ? Math.min(limit, matched.length) : 0,
    truncated: limit ? matched.length > limit : matched.length > 0,
    matched: limit ? matched.slice(0, limit) : []
  };
}

function editSessionReasons(session, prefixes) {
  const reasons = [];
  const label = String(session && session.label || "");
  if (startsWithPrefix(label, "ai-plan-")) reasons.push("autoEditSession");
  if (session && session.status === "active") reasons.push("active");
  if (objectContainsAnyPrefix(session && session.latestOperation, prefixes, 0)) reasons.push("latestOperationGeneratedPrefix");
  return Array.from(new Set(reasons));
}

function compactEditSession(session, reasons) {
  return {
    id: session && session.id ? session.id : null,
    label: session && session.label ? session.label : null,
    status: session && session.status ? session.status : null,
    startedAt: session && session.startedAt ? session.startedAt : null,
    updatedAt: session && session.updatedAt ? session.updatedAt : null,
    finishedAt: session && session.finishedAt ? session.finishedAt : null,
    outcome: session && session.outcome ? session.outcome : null,
    operationCount: session && typeof session.operationCount === "number" ? session.operationCount : null,
    latestOperation: session && session.latestOperation ? {
      tool: session.latestOperation.tool || null,
      ok: typeof session.latestOperation.ok === "boolean" ? session.latestOperation.ok : null,
      target: session.latestOperation.target || null
    } : null,
    checkpoint: session && session.checkpoint ? session.checkpoint : null,
    matchReasons: reasons
  };
}

function auditEditSessions(prefixes, sessionPayload, error, detailLimit) {
  if (error) {
    return {
      ok: false,
      error,
      active: null,
      sessionsLogFile: null,
      matchedCount: null,
      matched: []
    };
  }

  const sessions = sessionPayload && Array.isArray(sessionPayload.sessions) ? sessionPayload.sessions : [];
  const limit = Math.max(0, Math.floor(Number(detailLimit || 0)));
  const matched = [];
  for (const session of sessions) {
    const reasons = editSessionReasons(session, prefixes);
    if (reasons.length) matched.push(compactEditSession(session, reasons));
  }
  return {
    ok: true,
    error: null,
    active: sessionPayload ? Boolean(sessionPayload.active) : false,
    activeEditSession: sessionPayload && sessionPayload.activeEditSession ? sessionPayload.activeEditSession : null,
    sessionsLogFile: sessionPayload && sessionPayload.sessionsLogFile ? sessionPayload.sessionsLogFile : null,
    matchedCount: matched.length,
    returned: limit ? Math.min(limit, matched.length) : 0,
    truncated: limit ? matched.length > limit : matched.length > 0,
    matched: limit ? matched.slice(0, limit) : []
  };
}

function buildAgentQaAuditReport(input) {
  const raw = input || {};
  const prefixes = normalizePrefixes(raw.prefixes, DEFAULT_GENERATED_QA_PREFIXES);
  const detailLimit = Math.max(0, Math.min(200, Math.floor(Number(
    raw.detailLimit === undefined ? 20 : raw.detailLimit
  ))));
  const projectItems = auditProjectSearchResults(prefixes, raw.projectSearchResults, detailLimit);
  const renderQueue = auditRenderQueue(prefixes, raw.renderQueue, raw.renderQueueError || null, detailLimit);
  const checkpoints = auditCheckpoints(prefixes, raw.checkpoints, raw.checkpointsError || null, detailLimit);
  const editSessions = auditEditSessions(prefixes, raw.editSessions, raw.editSessionsError || null, detailLimit);
  const toolErrors = [
    raw.healthError,
    raw.projectInfoError,
    renderQueue.error,
    checkpoints.error,
    editSessions.error
  ].filter(Boolean);

  const summary = {
    projectItemLeftovers: projectItems.leftoverCount,
    renderQueueLeftovers: renderQueue.leftoverCount,
    checkpointRecords: checkpoints.matchedCount,
    editSessionRecords: editSessions.matchedCount,
    activeEditSession: editSessions.active === true,
    toolErrors: toolErrors.length,
    detailLimit,
    needsReview: projectItems.leftoverCount > 0 ||
      Number(renderQueue.leftoverCount || 0) > 0 ||
      Number(checkpoints.matchedCount || 0) > 0 ||
      Number(editSessions.matchedCount || 0) > 0 ||
      editSessions.active === true ||
      toolErrors.length > 0
  };

  return {
    schemaVersion: AUDIT_SCHEMA_VERSION,
    generatedAt: raw.generatedAt || new Date().toISOString(),
    readOnly: true,
    prefixes,
    bridge: {
      url: raw.bridgeUrl || null,
      health: raw.health || null,
      healthError: raw.healthError || null
    },
    project: {
      info: raw.projectInfo || null,
      error: raw.projectInfoError || null
    },
    projectItems,
    renderQueue,
    checkpoints,
    editSessions,
    summary
  };
}

module.exports = {
  AUDIT_SCHEMA_VERSION,
  DEFAULT_GENERATED_QA_PREFIXES,
  buildAgentQaAuditReport,
  collectAuditPrefixes,
  collectReportPrefixes,
  normalizePrefixes
};
