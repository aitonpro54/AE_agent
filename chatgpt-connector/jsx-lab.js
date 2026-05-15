"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const {
  writeSolutionCandidateReport
} = require("../scripts/solution-candidate-report");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const JSX_LAB_SCHEMA_VERSION = "jsx-lab-candidate.v1";
const JSX_LAB_CHECK_SCHEMA_VERSION = "jsx-lab-check-report.v1";
const JSX_LAB_RUN_SCHEMA_VERSION = "jsx-lab-run-request.v1";
const JSX_LAB_PROMOTION_SCHEMA_VERSION = "jsx-lab-promotion-hook.v1";
const DEFAULT_CANDIDATE_DIR = path.join(PROJECT_ROOT, "logs", "solution-candidates", "jsx-lab");
const DEFAULT_SOLUTION_CANDIDATE_DIR = path.join(PROJECT_ROOT, "logs", "solution-candidates");
const DEFAULT_MAX_JSX_BYTES = 64 * 1024;
const MAX_TEXT_CHARS = 1200;
const MAX_ARRAY_ITEMS = 16;
const MAX_READ_BACK_CALLS = 4;
const PROMOTION_TARGET_STATUSES = new Set(["recipe", "typed-tool-candidate"]);

const SECRET_PATTERNS = [
  {
    label: "OpenAI-style API key",
    pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/g,
    replacement: "[redacted:api-key]"
  },
  {
    label: "provider secret environment variable",
    pattern: /\b(OPENAI_API_KEY|OPENAI_KEY|ANTHROPIC_API_KEY|CLAUDE_API_KEY|GEMINI_API_KEY|GOOGLE_API_KEY|OPENROUTER_API_KEY|AE_BRIDGE_TOKEN|AE_CHATGPT_CONNECTOR_TOKEN)\b/gi,
    replacement: "[redacted:provider-secret]"
  },
  {
    label: "inline secret assignment",
    pattern: /\b(api[_-]?key|secret|token)\s*[:=]\s*["'][^"']{8,}["']/gi,
    replacement: "[redacted:secret-assignment]"
  }
];

const ABSOLUTE_PATH_PATTERNS = [
  {
    label: "Windows drive path",
    pattern: /\b[A-Za-z]:\\[^\s"'`<>|]+/g,
    replacement: "[redacted:absolute-path]"
  },
  {
    label: "Windows UNC path",
    pattern: /\\\\[^\\\s"'`<>|]+\\[^\s"'`<>|]+/g,
    replacement: "[redacted:absolute-path]"
  },
  {
    label: "Unix user path",
    pattern: /\/(?:Users|home|Volumes)\/[^\s"'`<>|]+/g,
    replacement: "[redacted:absolute-path]"
  }
];

const DENYLIST_CHECKS = [
  {
    code: "external_include",
    severity: "error",
    message: "External include/evalFile access is blocked for JSX Lab candidates.",
    pattern: /^\s*(#\s*include\b|@\s*include\b)|\$\s*\.\s*evalFile\s*\(/im
  },
  {
    code: "dynamic_eval",
    severity: "error",
    message: "Dynamic eval is blocked for JSX Lab candidates.",
    pattern: /\beval\s*\(/i
  },
  {
    code: "function_constructor",
    severity: "error",
    message: "Dynamic Function construction is blocked for JSX Lab candidates.",
    pattern: /\bnew\s+Function\b|\bFunction\s*\(/i
  },
  {
    code: "system_call",
    severity: "error",
    message: "Shell/system calls are blocked for JSX Lab candidates.",
    pattern: /\bsystem\s*\.\s*callSystem\s*\(/i
  },
  {
    code: "project_save_or_close",
    severity: "error",
    message: "Project save/close operations are blocked at candidate-check stage.",
    pattern: /\bapp\s*\.\s*project\s*\.\s*(save|saveWithDialog|close)\s*\(/i
  },
  {
    code: "app_quit",
    severity: "error",
    message: "Application quit is blocked for JSX Lab candidates.",
    pattern: /\bapp\s*\.\s*quit\s*\(/i
  },
  {
    code: "file_or_folder_remove",
    severity: "error",
    message: "File/folder removal is blocked for JSX Lab candidates.",
    pattern: /\b(?:File|Folder)\s*\([^)]*\)\s*\.\s*remove\s*\(/i
  },
  {
    code: "network_or_external_object",
    severity: "error",
    message: "Network sockets and ExternalObject loading are blocked for JSX Lab candidates.",
    pattern: /\b(?:Socket|ExternalObject)\b/i
  },
  {
    code: "bridge_talk",
    severity: "warning",
    message: "BridgeTalk usage needs manual review before any future run gate.",
    pattern: /\bBridgeTalk\b/i
  },
  {
    code: "file_or_folder_access",
    severity: "warning",
    message: "File/Folder access needs manual review before any future run gate.",
    pattern: /\b(?:File|Folder)\s*\(/i
  },
  {
    code: "undo_group_missing",
    severity: "warning",
    message: "Mutating JSX candidates should include app.beginUndoGroup/app.endUndoGroup before promotion.",
    pattern: /\b(app\s*\.\s*project|layers?\s*\.|property\s*\(|setValue\s*\(|remove\s*\(|add\w*\s*\()/i,
    missingPattern: /\bapp\s*\.\s*beginUndoGroup\s*\(/i
  }
];

function createContext() {
  return {
    warnings: [],
    redactions: []
  };
}

function addUnique(list, value) {
  const text = String(value || "").trim();
  if (text && !list.includes(text)) {
    list.push(text);
  }
}

function addWarning(context, value) {
  addUnique(context.warnings, value);
}

function addRedaction(context, label, field) {
  if (!context.redactions.some((item) => item.label === label && item.field === field)) {
    context.redactions.push({ label, field });
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeFilePart(value) {
  return String(value || "jsx-candidate")
    .replace(/[^A-Za-z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "jsx-candidate";
}

function slugId(value) {
  return String(value || "jsx-candidate")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "jsx-candidate";
}

function fileTimestamp(value) {
  return safeFilePart(String(value || new Date().toISOString()).replace(/[:]/g, "-"));
}

function repoRelative(filePath) {
  const relative = path.relative(PROJECT_ROOT, filePath);
  if (relative && !relative.startsWith("..") && !path.isAbsolute(relative)) {
    return relative.split(path.sep).join("/");
  }
  return path.basename(filePath);
}

function isInsideDirectory(baseDir, filePath) {
  const relative = path.relative(baseDir, filePath);
  return relative === "" || Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function candidateRelative(config, filePath) {
  if (isInsideDirectory(PROJECT_ROOT, filePath)) {
    return repoRelative(filePath);
  }
  const candidateDir = candidateDirFromConfig(config || {});
  if (isInsideDirectory(candidateDir, filePath)) {
    return path.relative(candidateDir, filePath).split(path.sep).join("/");
  }
  return path.basename(filePath);
}

function truncateText(text, limit, context, field) {
  if (text.length <= limit) return text;
  addWarning(context, `${field} was truncated to ${limit} characters.`);
  return `${text.slice(0, limit)}... [truncated]`;
}

function redactText(value, context, field, limit = MAX_TEXT_CHARS) {
  if (value === null || value === undefined) return null;

  let text = String(value);
  for (const item of SECRET_PATTERNS.concat(ABSOLUTE_PATH_PATTERNS)) {
    if (item.pattern.test(text)) {
      item.pattern.lastIndex = 0;
      text = text.replace(item.pattern, item.replacement);
      addRedaction(context, item.label, field);
      addWarning(context, `${field} contained ${item.label}; value was redacted.`);
    } else {
      item.pattern.lastIndex = 0;
    }
  }
  return truncateText(text.trim(), limit, context, field);
}

function safeString(value, context, field, fallback = null, limit = MAX_TEXT_CHARS) {
  const text = redactText(value, context, field, limit);
  return text === null || text.length === 0 ? fallback : text;
}

function safeStringArray(value, context, field) {
  const source = Array.isArray(value) ? value : (value === null || value === undefined ? [] : [value]);
  if (source.length > MAX_ARRAY_ITEMS) {
    addWarning(context, `${field} was limited to ${MAX_ARRAY_ITEMS} item(s).`);
  }
  return source.slice(0, MAX_ARRAY_ITEMS)
    .map((item, index) => safeString(item, context, `${field}[${index}]`))
    .filter(Boolean);
}

function sha256(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function candidateDirFromConfig(config) {
  return path.resolve(config.candidateDir || DEFAULT_CANDIDATE_DIR);
}

function solutionCandidateDirFromConfig(config) {
  return path.resolve(config.solutionCandidateDir || DEFAULT_SOLUTION_CANDIDATE_DIR);
}

function resolveInsideCandidateDir(config, relativePath) {
  const candidateDir = candidateDirFromConfig(config);
  const input = String(relativePath || "");
  if (!input || path.isAbsolute(input)) {
    throw new Error("Candidate paths must be relative quarantine paths.");
  }

  const projectResolved = path.resolve(PROJECT_ROOT, input);
  if (isInsideDirectory(candidateDir, projectResolved)) {
    return projectResolved;
  }

  const candidateResolved = path.resolve(candidateDir, input);
  if (isInsideDirectory(candidateDir, candidateResolved)) {
    return candidateResolved;
  }

  throw new Error("Candidate path is outside the JSX Lab quarantine.");
}

function uniqueStrings(values) {
  const output = [];
  for (const value of values || []) {
    const text = String(value || "").trim();
    if (text && !output.includes(text)) output.push(text);
  }
  return output;
}

function requireBoolean(raw, field) {
  if (!raw || raw[field] !== true) {
    throw new Error(`run_extendscript_candidate requires ${field}:true.`);
  }
}

function requireString(raw, field) {
  const text = String(raw && raw[field] !== undefined ? raw[field] : "").trim();
  if (!text) {
    throw new Error(`run_extendscript_candidate requires ${field}.`);
  }
  return text;
}

function normalizeTimeoutMs(value) {
  const timeoutMs = Math.floor(Number(value || 0));
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return 30000;
  return Math.max(1000, Math.min(120000, timeoutMs));
}

function normalizeReadBackToolCalls(raw) {
  const source = Array.isArray(raw.readBackToolCalls) ? raw.readBackToolCalls : [];
  if (source.length > MAX_READ_BACK_CALLS) {
    throw new Error(`run_extendscript_candidate allows at most ${MAX_READ_BACK_CALLS} read-back tool call(s).`);
  }
  return source.map((item, index) => {
    const call = isPlainObject(item) ? item : {};
    const name = String(call.name || call.tool || "").trim();
    if (!name) {
      throw new Error(`readBackToolCalls[${index}].name is required.`);
    }
    return {
      name,
      arguments: isPlainObject(call.arguments) ? call.arguments : (isPlainObject(call.args) ? call.args : {})
    };
  });
}

function rawJsxFromArgs(args) {
  const source = isPlainObject(args) ? (args.jsx || args.extendscript || args.source || args.code) : "";
  return String(source || "");
}

function normalizeCandidate(args, config, generatedAt) {
  const context = createContext();
  const raw = isPlainObject(args) ? args : {};
  const source = rawJsxFromArgs(raw);
  const sizeBytes = Buffer.byteLength(source, "utf8");
  const title = safeString(raw.title, context, "candidate.title", "JSX Lab candidate");
  const intentSummary = safeString(raw.intentSummary || raw.summary || raw.userIntent, context, "candidate.intentSummary", "Unspecified JSX Lab candidate intent.");
  const candidateId = slugId(raw.id || title || intentSummary || generatedAt);
  const stamp = fileTimestamp(generatedAt);
  const fileBase = `${stamp}-${safeFilePart(candidateId)}`;
  const candidateDir = candidateDirFromConfig(config);
  const jsxPath = path.join(candidateDir, `${fileBase}.jsx`);
  const metadataPath = path.join(candidateDir, `${fileBase}.json`);

  if (!source.trim()) {
    throw new Error("propose_extendscript_candidate requires non-empty JSX source.");
  }

  return {
    context,
    source,
    metadata: {
      schemaVersion: JSX_LAB_SCHEMA_VERSION,
      generatedAt,
      source: "chatgpt-connector",
      status: "candidate",
      candidate: {
        id: candidateId,
        title,
        intentSummary,
        tags: safeStringArray(raw.tags, context, "candidate.tags"),
        appliesWhen: safeStringArray(raw.appliesWhen, context, "candidate.appliesWhen"),
        expectedOutcome: safeString(raw.expectedOutcome || raw.outcome, context, "candidate.expectedOutcome"),
        riskNotes: safeString(raw.riskNotes || raw.risks, context, "candidate.riskNotes"),
        jsxFile: candidateRelative(config, jsxPath),
        jsxSha256: sha256(source),
        jsxSizeBytes: sizeBytes,
        jsxLineCount: source.split(/\r\n|\r|\n/).length
      },
      safety: {
        quarantineOnly: true,
        plannerVisible: false,
        executionAllowed: false,
        requiresStaticCheck: true,
        rawJsxStoredSeparately: true,
        rawJsxReturnedToConnector: false,
        directRunExtendscriptExposed: false,
        bridgeCalled: false,
        aeMutated: false,
        pathsAreRelative: true,
        redactions: context.redactions
      },
      warnings: context.warnings
    },
    paths: {
      candidateDir,
      jsxPath,
      metadataPath
    }
  };
}

function proposeExtendscriptCandidate(config, args, options) {
  const generatedAt = (options && options.generatedAt) || new Date().toISOString();
  const normalized = normalizeCandidate(args, config || {}, generatedAt);

  fs.mkdirSync(normalized.paths.candidateDir, { recursive: true });
  fs.writeFileSync(normalized.paths.jsxPath, normalized.source, "utf8");
  fs.writeFileSync(normalized.paths.metadataPath, JSON.stringify(normalized.metadata, null, 2) + "\n", "utf8");

  return {
    schemaVersion: normalized.metadata.schemaVersion,
    candidateId: normalized.metadata.candidate.id,
    status: "candidate-saved",
    metadataPath: candidateRelative(config || {}, normalized.paths.metadataPath),
    jsxPath: candidateRelative(config || {}, normalized.paths.jsxPath),
    jsxSizeBytes: normalized.metadata.candidate.jsxSizeBytes,
    jsxSha256: normalized.metadata.candidate.jsxSha256,
    nextTool: "check_extendscript_candidate",
    safety: normalized.metadata.safety,
    warnings: normalized.metadata.warnings
  };
}

function stripExtendScriptDirectives(source) {
  return source.split(/\r\n|\r|\n/).map((line) => {
    if (/^\s*#\s*(target|targetengine)\b/i.test(line)) return "";
    return line;
  }).join("\n");
}

function linePreview(source, index, context, field) {
  const lines = source.split(/\r\n|\r|\n/);
  const line = lines[Math.max(0, index)];
  return safeString(line, context, field, "", 240);
}

function findingFromMatch(check, source, match, context) {
  const before = source.slice(0, match.index);
  const lineNumber = before.split(/\r\n|\r|\n/).length;
  return {
    code: check.code,
    severity: check.severity,
    message: check.message,
    line: lineNumber,
    preview: linePreview(source, lineNumber - 1, context, `findings.${check.code}.preview`)
  };
}

function runStaticChecks(source, config) {
  const context = createContext();
  const findings = [];
  const maxBytes = Number(config.maxCandidateJsxBytes || DEFAULT_MAX_JSX_BYTES);
  const sizeBytes = Buffer.byteLength(source, "utf8");

  if (sizeBytes > maxBytes) {
    findings.push({
      code: "size_limit_exceeded",
      severity: "error",
      message: `JSX source is ${sizeBytes} bytes; limit is ${maxBytes} bytes.`,
      line: null,
      preview: ""
    });
  }

  if (/\0/.test(source)) {
    findings.push({
      code: "nul_byte",
      severity: "error",
      message: "JSX source contains a NUL byte.",
      line: null,
      preview: ""
    });
  }

  try {
    // Node parses normal JavaScript well enough for an offline preflight. ExtendScript
    // directives such as #target are stripped before this check and handled separately.
    new Function(stripExtendScriptDirectives(source));
  } catch (error) {
    findings.push({
      code: "syntax_error",
      severity: "error",
      message: safeString(error.message || String(error), context, "syntaxError.message", "Syntax error."),
      line: null,
      preview: ""
    });
  }

  for (const check of DENYLIST_CHECKS) {
    check.pattern.lastIndex = 0;
    const match = check.pattern.exec(source);
    check.pattern.lastIndex = 0;
    if (!match) continue;
    if (check.missingPattern && check.missingPattern.test(source)) {
      check.missingPattern.lastIndex = 0;
      continue;
    }
    if (check.missingPattern) check.missingPattern.lastIndex = 0;
    findings.push(findingFromMatch(check, source, match, context));
  }

  const errorCount = findings.filter((item) => item.severity === "error").length;
  const warningCount = findings.filter((item) => item.severity === "warning").length;
  const status = errorCount > 0 ? "rejected" : (warningCount > 0 ? "needs-review" : "accepted");

  return {
    status,
    acceptedForFutureRunGate: status === "accepted",
    summary: {
      sizeBytes,
      maxBytes,
      lineCount: source.split(/\r\n|\r|\n/).length,
      errorCount,
      warningCount
    },
    findings,
    redactions: context.redactions,
    warnings: context.warnings
  };
}

function loadCandidateMetadata(config, args) {
  const metadataPath = resolveInsideCandidateDir(config, args.metadataPath);
  const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
  if (!metadata || metadata.schemaVersion !== JSX_LAB_SCHEMA_VERSION) {
    throw new Error(`Candidate metadata must use schema ${JSX_LAB_SCHEMA_VERSION}.`);
  }
  const jsxPath = resolveInsideCandidateDir(config, metadata.candidate && metadata.candidate.jsxFile);
  return { metadata, metadataPath, jsxPath };
}

function checkExtendscriptCandidate(config, args) {
  const raw = isPlainObject(args) ? args : {};
  if (!raw.metadataPath) {
    throw new Error("check_extendscript_candidate requires metadataPath from propose_extendscript_candidate.");
  }

  const loaded = loadCandidateMetadata(config || {}, raw);
  const source = fs.readFileSync(loaded.jsxPath, "utf8");
  const hash = sha256(source);
  const hashMatches = hash === loaded.metadata.candidate.jsxSha256;
  const staticCheck = runStaticChecks(source, config || {});
  const findings = staticCheck.findings.slice();

  if (!hashMatches) {
    findings.unshift({
      code: "candidate_hash_mismatch",
      severity: "error",
      message: "Saved JSX file hash does not match candidate metadata.",
      line: null,
      preview: ""
    });
  }

  const errorCount = findings.filter((item) => item.severity === "error").length;
  const warningCount = findings.filter((item) => item.severity === "warning").length;
  const status = errorCount > 0 ? "rejected" : (warningCount > 0 ? "needs-review" : "accepted");

  return {
    schemaVersion: JSX_LAB_CHECK_SCHEMA_VERSION,
    checkedAt: new Date().toISOString(),
    candidateId: loaded.metadata.candidate.id,
    status,
    acceptedForFutureRunGate: status === "accepted",
    metadataPath: candidateRelative(config || {}, loaded.metadataPath),
    jsxPath: candidateRelative(config || {}, loaded.jsxPath),
    jsxSha256: hash,
    summary: {
      sizeBytes: staticCheck.summary.sizeBytes,
      maxBytes: staticCheck.summary.maxBytes,
      lineCount: staticCheck.summary.lineCount,
      errorCount,
      warningCount
    },
    findings,
    safety: {
      staticOnly: true,
      executed: false,
      bridgeCalled: false,
      aeMutated: false,
      directRunExtendscriptExposed: false,
      rawJsxReturnedToConnector: false
    },
    warnings: staticCheck.warnings,
    redactions: staticCheck.redactions
  };
}

function loadCheckedCandidateForRun(config, args) {
  const raw = isPlainObject(args) ? args : {};
  if (!raw.metadataPath) {
    throw new Error("run_extendscript_candidate requires metadataPath from propose_extendscript_candidate.");
  }

  const loaded = loadCandidateMetadata(config || {}, raw);
  const source = fs.readFileSync(loaded.jsxPath, "utf8");
  const checkReport = checkExtendscriptCandidate(config || {}, raw);
  if (checkReport.status !== "accepted") {
    throw new Error(`run_extendscript_candidate requires an accepted static check; current status is ${checkReport.status}.`);
  }
  return {
    metadata: loaded.metadata,
    metadataPath: loaded.metadataPath,
    jsxPath: loaded.jsxPath,
    source,
    checkReport
  };
}

function prepareExtendscriptCandidateRun(config, args) {
  const raw = isPlainObject(args) ? args : {};
  const dryRun = raw.dryRun !== false;
  requireBoolean(raw, "confirm");
  requireBoolean(raw, "allowMutations");
  requireBoolean(raw, "autoEditSession");

  const loaded = loadCheckedCandidateForRun(config || {}, raw);
  const expectedHash = requireString(raw, "confirmedJsxSha256");
  if (expectedHash !== loaded.checkReport.jsxSha256) {
    throw new Error("confirmedJsxSha256 must match the saved candidate hash from check_extendscript_candidate.");
  }

  const expectedGeneratedPrefix = requireString(raw, "expectedGeneratedPrefix");
  if (expectedGeneratedPrefix.length < 4) {
    throw new Error("expectedGeneratedPrefix must be at least 4 characters.");
  }
  if (loaded.source.indexOf(expectedGeneratedPrefix) < 0) {
    throw new Error("expectedGeneratedPrefix must appear in the saved JSX source.");
  }

  const readBackToolCalls = normalizeReadBackToolCalls(raw);
  if (!dryRun && readBackToolCalls.length === 0) {
    throw new Error("run_extendscript_candidate requires at least one readBackToolCalls entry for a real run.");
  }

  const candidateId = loaded.metadata.candidate.id;
  const shortHash = loaded.checkReport.jsxSha256.slice(0, 16);
  const requestId = String(raw.requestId || `jsx-lab-${candidateId}-${shortHash}`).trim();
  const timeoutMs = normalizeTimeoutMs(raw.timeoutMs);
  const filePath = candidateRelative(config || {}, loaded.jsxPath);
  const plan = {
    summary: `Run checked JSX Lab candidate ${candidateId} from local quarantine.`,
    risk: "high",
    requiresCheckpoint: true,
    steps: [
      {
        title: "Run checked JSX Lab candidate",
        tool: "run_extendscript_file",
        args: {
          filePath,
          timeoutMs,
          idempotencyKey: `jsx-lab-${candidateId}-${shortHash}`,
          idempotencyScope: "chatgpt-connector-jsx-lab",
          verifyAfter: true
        }
      }
    ]
  };

  return {
    schemaVersion: JSX_LAB_RUN_SCHEMA_VERSION,
    candidateId,
    dryRun,
    requestId,
    planRunPayload: {
      plan,
      requestId,
      dryRun,
      confirm: true,
      allowMutations: true,
      autoEditSession: true,
      allowRawExtendscript: true,
      maxSteps: 1
    },
    readBackToolCalls,
    staticCheck: loaded.checkReport,
    paths: {
      metadataPath: candidateRelative(config || {}, loaded.metadataPath),
      jsxPath: filePath
    },
    safety: {
      explicitConfirmation: true,
      savedCandidateOnly: true,
      acceptedStaticCheckRequired: true,
      denylistEnforced: true,
      confirmedHashRequired: true,
      generatedPrefixRequired: true,
      expectedGeneratedPrefix,
      bridgePlanRunnerRequired: true,
      checkpointEditSessionRequired: true,
      readBackRequired: !dryRun,
      rawJsxReturnedToConnector: false,
      directRunExtendscriptExposed: false
    }
  };
}

function promotionActionForTargetStatus(targetStatus) {
  if (targetStatus === "typed-tool-candidate") return "promote-to-typed-tool-candidate";
  return "promote-to-recipe";
}

function prepareSolutionCandidateReportInput(metadata, checkReport, raw) {
  const candidate = metadata.candidate || {};
  const targetStatus = String(raw.targetStatus || "recipe").trim();
  if (!PROMOTION_TARGET_STATUSES.has(targetStatus)) {
    throw new Error("promote_solution_candidate only prepares recipe or typed-tool-candidate review hooks; direct candidate-to-tool promotion is not allowed.");
  }

  return {
    id: candidate.id,
    title: candidate.title,
    tags: uniqueStrings((candidate.tags || []).concat(["jsx-lab", targetStatus])),
    intent: {
      summary: candidate.intentSummary,
      appliesWhen: candidate.appliesWhen || []
    },
    generatedPlan: {
      summary: "Reviewed JSX Lab candidate may be promoted only through Solution Library review.",
      steps: [
        {
          tool: "run_extendscript_file",
          mutating: true,
          targetSummary: raw.affectedTargetSummary || candidate.expectedOutcome || candidate.intentSummary,
          status: "candidate"
        }
      ]
    },
    generatedScript: {
      language: "extendscript",
      summary: candidate.riskNotes || "Raw JSX is stored separately in JSX Lab quarantine and is not embedded in this promotion hook.",
      body: null
    },
    affectedTargets: raw.affectedTargets || [candidate.expectedOutcome || candidate.intentSummary],
    runResult: raw.runResult || {
      ok: null,
      dryRun: null,
      mutating: true,
      safety: {
        staticCheckStatus: checkReport.status,
        jsxSha256: checkReport.jsxSha256
      },
      outputSummary: raw.runSummary || "No tracked promotion is written by the connector."
    },
    verificationReadBack: {
      summary: raw.verificationSummary || "Promotion review must include successful read-back evidence from bridge inspection tools.",
      evidence: raw.verificationEvidence || []
    },
    projectAssumptions: raw.projectAssumptions || [],
    warnings: (metadata.warnings || []).concat(checkReport.warnings || []),
    suggestedPromotionAction: {
      action: promotionActionForTargetStatus(targetStatus),
      rationale: raw.promotionRationale || "Connector prepared a quarantine-only promotion hook for explicit human review.",
      nextReviewChecks: [
        "Confirm no existing typed bridge tool already covers this workflow.",
        "Confirm the candidate ran through checkpoint/edit-session protection and read-back verification before tracked promotion.",
        "Promote to typed-tool-candidate before implementing a durable tool; do not promote directly from candidate to tool."
      ]
    },
    provenance: {
      source: "chatgpt-connector-jsx-lab",
      sourceReportPath: checkReport.metadataPath,
      planner: {
        label: "ChatGPT Connector JSX Lab",
        providerGroup: "chatgpt-connector"
      }
    }
  };
}

function promoteSolutionCandidateHook(config, args, options) {
  const raw = isPlainObject(args) ? args : {};
  if (!raw.metadataPath) {
    throw new Error("promote_solution_candidate requires metadataPath from propose_extendscript_candidate.");
  }
  const loaded = loadCandidateMetadata(config || {}, raw);
  const checkReport = checkExtendscriptCandidate(config || {}, raw);
  if (checkReport.status === "rejected") {
    throw new Error("promote_solution_candidate requires a candidate that is not rejected by static checks.");
  }

  const reportInput = prepareSolutionCandidateReportInput(loaded.metadata, checkReport, raw);
  const artifact = writeSolutionCandidateReport(reportInput, {
    outputDir: solutionCandidateDirFromConfig(config || {}),
    generatedAt: options && options.generatedAt,
    source: "chatgpt-connector-jsx-lab"
  });
  const relativePath = repoRelative(artifact.path);

  return {
    schemaVersion: JSX_LAB_PROMOTION_SCHEMA_VERSION,
    status: "promotion-hook-created",
    candidateId: loaded.metadata.candidate.id,
    targetStatus: reportInput.suggestedPromotionAction.action === "promote-to-typed-tool-candidate"
      ? "typed-tool-candidate"
      : "recipe",
    solutionCandidateReportPath: relativePath,
    lifecycle: {
      current: "candidate",
      allowedNext: ["recipe", "typed-tool-candidate"],
      laterStages: ["tool"],
      rule: "candidate -> recipe -> typed-tool-candidate -> tool; direct candidate-to-tool promotion is blocked."
    },
    nextReviewCommand: `node scripts\\solution-promotion-helper.js --candidate ${relativePath} --review <review.json>`,
    safety: {
      quarantineOnly: true,
      writesTrackedRegistry: false,
      plannerVisible: false,
      rawJsxEmbedded: false,
      explicitPromotionReviewRequired: true
    },
    warnings: artifact.report.candidate.warnings
  };
}

module.exports = {
  DEFAULT_CANDIDATE_DIR,
  DEFAULT_MAX_JSX_BYTES,
  DEFAULT_SOLUTION_CANDIDATE_DIR,
  JSX_LAB_CHECK_SCHEMA_VERSION,
  JSX_LAB_PROMOTION_SCHEMA_VERSION,
  JSX_LAB_RUN_SCHEMA_VERSION,
  JSX_LAB_SCHEMA_VERSION,
  checkExtendscriptCandidate,
  loadCheckedCandidateForRun,
  prepareExtendscriptCandidateRun,
  promoteSolutionCandidateHook,
  proposeExtendscriptCandidate,
  repoRelative,
  runStaticChecks
};
