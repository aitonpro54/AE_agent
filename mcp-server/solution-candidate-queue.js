"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const {
  CANDIDATE_SCHEMA_VERSION,
  DEFAULT_CANDIDATE_DIR,
  validateSolutionCandidateReport
} = require("../scripts/solution-candidate-report");

const MAX_FILES = 2000;
const MAX_FILE_BYTES = 256 * 1024;
const DEFAULT_LIST_LIMIT = 20;
const MAX_LIST_LIMIT = 50;
const DEFAULT_GROUP_LIMIT = 20;
const MAX_GROUP_LIMIT = 50;
const DEFAULT_SCRIPT_LIMIT = 3000;
const MAX_SCRIPT_LIMIT = 6000;
const MAX_GROUP_REFS = 20;
const SAFE_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,219}\.json$/;
const OMITTED_STRUCTURED_KEY_PATTERN = /^(?:__proto__|prototype|constructor)$|(?:authorization|cookie|password|secret|token|api[_-]?key|(?:^|_)(?:path|file|directory|dir)$)/i;

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function lexicalCompare(left, right) {
  return left < right ? -1 : (left > right ? 1 : 0);
}

function integerArg(value, fallback, minimum, maximum, label) {
  const result = value === undefined ? fallback : value;
  if (!Number.isInteger(result) || result < minimum || result > maximum) {
    throw new Error(`${label} must be an integer from ${minimum} to ${maximum}.`);
  }
  return result;
}

function candidateDir(options) {
  const configured = options && options.candidateDir
    ? options.candidateDir
    : (process.env.AE_SOLUTION_CANDIDATE_DIR || DEFAULT_CANDIDATE_DIR);
  if (typeof configured !== "string" || !configured.trim()) {
    throw new Error("Candidate directory is not configured.");
  }
  return path.resolve(configured);
}

function safeCandidateRef(value) {
  if (typeof value !== "string" || !SAFE_REF_PATTERN.test(value) || path.basename(value) !== value) {
    throw new Error("candidateRef must be one candidate JSON basename, not a file path.");
  }
  return value;
}

function isInside(base, target) {
  const relative = path.relative(base, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function resolveExistingCandidateFile(base, ref) {
  const resolved = path.resolve(base, safeCandidateRef(ref));
  if (!isInside(base, resolved)) {
    throw new Error("Candidate reference resolves outside the configured quarantine directory.");
  }
  const stat = fs.lstatSync(resolved);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error("Candidate reference must identify a regular JSON file in quarantine.");
  }
  const realBase = fs.realpathSync(base);
  const realFile = fs.realpathSync(resolved);
  if (!isInside(realBase, realFile)) {
    throw new Error("Candidate reference resolves outside the configured quarantine directory.");
  }
  return { filePath: realFile, stat };
}

function scriptBody(report) {
  const body = report && report.candidate && report.candidate.generatedScript
    ? report.candidate.generatedScript.body
    : null;
  return typeof body === "string" ? body : null;
}

function exactScriptFingerprint(report) {
  const body = scriptBody(report);
  if (body === null) return null;
  return `sha256:${crypto.createHash("sha256").update(body, "utf8").digest("hex")}`;
}

function readCandidateFile(base, ref) {
  const resolved = resolveExistingCandidateFile(base, ref);
  if (resolved.stat.size > MAX_FILE_BYTES) {
    throw new Error("Candidate JSON exceeds the supported file size.");
  }
  const report = JSON.parse(fs.readFileSync(resolved.filePath, "utf8"));
  validateSolutionCandidateReport(report);
  if (report.schemaVersion !== CANDIDATE_SCHEMA_VERSION || !Number.isFinite(Date.parse(report.generatedAt))) {
    throw new Error("Candidate JSON has an unsupported schema or generatedAt value.");
  }
  const body = scriptBody(report);
  if (report.candidate.generatedScript.body !== null && body === null) {
    throw new Error("Candidate generatedScript.body must be a string or null.");
  }
  return {
    ref,
    report,
    fingerprint: exactScriptFingerprint(report),
    scriptChars: body === null ? 0 : body.length
  };
}

function loadCandidateQueue(options) {
  const base = candidateDir(options);
  if (!fs.existsSync(base)) return { base, entries: [], skipped: 0 };
  if (!fs.lstatSync(base).isDirectory()) throw new Error("Configured candidate quarantine is not a directory.");

  const refs = fs.readdirSync(base, { withFileTypes: true })
    .filter((entry) => entry.isFile() && SAFE_REF_PATTERN.test(entry.name))
    .map((entry) => entry.name)
    .sort(lexicalCompare);
  if (refs.length > MAX_FILES) {
    throw new Error(`Candidate quarantine exceeds the supported ${MAX_FILES} JSON files.`);
  }

  const entries = [];
  let skipped = 0;
  refs.forEach((ref) => {
    try {
      entries.push(readCandidateFile(base, ref));
    } catch (_error) {
      skipped += 1;
    }
  });
  entries.sort((left, right) => {
    const byDate = Date.parse(right.report.generatedAt) - Date.parse(left.report.generatedAt);
    return byDate || lexicalCompare(left.ref, right.ref);
  });
  return { base, entries, skipped };
}

function fingerprintCounts(entries) {
  const counts = new Map();
  entries.forEach((entry) => {
    if (entry.fingerprint) counts.set(entry.fingerprint, (counts.get(entry.fingerprint) || 0) + 1);
  });
  return counts;
}

function compactText(value, limit) {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim();
  return text.length <= limit ? text : `${text.slice(0, limit - 3)}...`;
}

function compactStrings(value, maxItems, maxChars) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === "string").slice(0, maxItems).map((item) => compactText(item, maxChars))
    : [];
}

function cleanStructured(value, depth) {
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return compactText(value, 500);
  if (depth <= 0) return Array.isArray(value) ? [] : {};
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => cleanStructured(item, depth - 1));
  if (!isPlainObject(value)) return null;
  const output = {};
  Object.keys(value).sort().slice(0, 40).forEach((key) => {
    if (!OMITTED_STRUCTURED_KEY_PATTERN.test(key)) output[key] = cleanStructured(value[key], depth - 1);
  });
  return output;
}

function summaryFor(entry, repeatCount) {
  const candidate = entry.report.candidate;
  return {
    candidateRef: entry.ref,
    id: candidate.id,
    title: compactText(candidate.title, 240),
    generatedAt: entry.report.generatedAt,
    source: compactText(entry.report.source, 120),
    tags: compactStrings(candidate.tags, 12, 80),
    intentSummary: compactText(candidate.intent.summary, 360),
    runOk: candidate.runResult.ok,
    suggestedPromotionAction: candidate.suggestedPromotionAction.action,
    scriptIncluded: candidate.generatedScript.included === true && entry.scriptChars > 0,
    scriptChars: entry.scriptChars,
    exactFingerprint: entry.fingerprint,
    repeatCount: entry.fingerprint ? repeatCount : 1,
    quarantineOnly: true,
    plannerVisible: false
  };
}

function repeatedGroups(entries, counts) {
  const groups = new Map();
  entries.forEach((entry) => {
    if (!entry.fingerprint || counts.get(entry.fingerprint) < 2) return;
    if (!groups.has(entry.fingerprint)) groups.set(entry.fingerprint, []);
    groups.get(entry.fingerprint).push(entry.ref);
  });
  return Array.from(groups.entries()).map(([fingerprint, refs]) => ({
    exactFingerprint: fingerprint,
    repeatCount: counts.get(fingerprint),
    candidateRefs: refs.slice(0, MAX_GROUP_REFS),
    refsTruncated: refs.length > MAX_GROUP_REFS
  })).sort((left, right) => right.repeatCount - left.repeatCount || lexicalCompare(left.exactFingerprint, right.exactFingerprint));
}

function listSolutionCandidates(args, options) {
  const input = args || {};
  const offset = integerArg(input.offset, 0, 0, MAX_FILES, "offset");
  const limit = integerArg(input.limit, DEFAULT_LIST_LIMIT, 1, MAX_LIST_LIMIT, "limit");
  const groupLimit = integerArg(input.groupLimit, DEFAULT_GROUP_LIMIT, 0, MAX_GROUP_LIMIT, "groupLimit");
  const queue = loadCandidateQueue(options);
  if (offset > queue.entries.length) throw new Error("offset exceeds the valid candidate count.");
  const counts = fingerprintCounts(queue.entries);
  const allGroups = repeatedGroups(queue.entries, counts);
  const page = queue.entries.slice(offset, offset + limit);
  return {
    ok: true,
    mode: "local-quarantine-review",
    quarantine: { quarantineOnly: true, plannerVisible: false, promotionRequired: true, readOnly: true },
    total: queue.entries.length,
    skipped: queue.skipped,
    latest: queue.entries.length ? summaryFor(queue.entries[0], counts.get(queue.entries[0].fingerprint) || 1) : null,
    candidates: page.map((entry) => summaryFor(entry, counts.get(entry.fingerprint) || 1)),
    page: {
      offset,
      count: page.length,
      nextOffset: offset + page.length < queue.entries.length ? offset + page.length : null,
      truncated: offset + page.length < queue.entries.length
    },
    exactFingerprintGroupTotal: allGroups.length,
    exactFingerprintGroups: allGroups.slice(0, groupLimit),
    fingerprintGroupsTruncated: allGroups.length > groupLimit,
    next: "Review candidates only. This queue does not expose candidates to planning and does not promote or execute JSX."
  };
}

function cleanedReport(report) {
  const candidate = report.candidate;
  const plan = candidate.generatedPlan;
  const script = candidate.generatedScript;
  return {
    schemaVersion: CANDIDATE_SCHEMA_VERSION,
    generatedAt: report.generatedAt,
    source: compactText(report.source, 120),
    status: "candidate",
    candidate: {
      id: candidate.id,
      title: compactText(candidate.title, 240),
      tags: compactStrings(candidate.tags, 20, 120),
      intent: {
        summary: compactText(candidate.intent.summary, 1200),
        appliesWhen: compactStrings(candidate.intent.appliesWhen, 20, 1200)
      },
      projectAssumptions: compactStrings(candidate.projectAssumptions, 20, 1200),
      affectedTargets: compactStrings(candidate.affectedTargets, 20, 1200),
      generatedPlan: {
        summary: compactText(plan.summary, 1200),
        stepCount: plan.stepCount,
        mutatingStepCount: plan.mutatingStepCount,
        steps: cleanStructured(plan.steps, 4),
        omittedStepCount: plan.omittedStepCount
      },
      generatedScript: {
        language: compactText(script.language, 80),
        summary: compactText(script.summary, 1200),
        included: script.included === true,
        omittedReason: compactText(script.omittedReason, 240)
      },
      runResult: {
        ok: candidate.runResult.ok,
        dryRun: candidate.runResult.dryRun,
        mutating: candidate.runResult.mutating,
        safety: cleanStructured(candidate.runResult.safety, 4),
        checkpoint: cleanStructured(candidate.runResult.checkpoint, 3),
        statusCount: candidate.runResult.statusCount,
        errorSummary: compactText(candidate.runResult.errorSummary, 1200),
        outputSummary: compactText(candidate.runResult.outputSummary, 1200)
      },
      verificationReadBack: {
        summary: compactText(candidate.verificationReadBack.summary, 1200),
        status: compactText(candidate.verificationReadBack.status, 120),
        evidence: compactStrings(candidate.verificationReadBack.evidence, 20, 1200)
      },
      warnings: compactStrings(candidate.warnings, 30, 1200),
      suggestedPromotionAction: {
        action: candidate.suggestedPromotionAction.action,
        rationale: compactText(candidate.suggestedPromotionAction.rationale, 1200),
        nextReviewChecks: compactStrings(candidate.suggestedPromotionAction.nextReviewChecks, 20, 1200)
      },
      provenance: {
        source: compactText(candidate.provenance.source, 120),
        sourceReportSchema: compactText(candidate.provenance.sourceReportSchema, 120),
        runPrefix: compactText(candidate.provenance.runPrefix, 240),
        scenarioId: compactText(candidate.provenance.scenarioId, 160),
        planner: cleanStructured(candidate.provenance.planner, 2)
      }
    },
    safety: {
      quarantineOnly: true,
      plannerVisible: false,
      promotionRequired: true,
      rawTranscriptStored: false,
      fullProjectScanStored: false,
      redactions: cleanStructured(report.safety.redactions, 3)
    }
  };
}

function getSolutionCandidate(args, options) {
  const input = args || {};
  const ref = safeCandidateRef(input.candidateRef);
  const offset = integerArg(input.offset, 0, 0, 12000, "offset");
  const limit = integerArg(input.limit, DEFAULT_SCRIPT_LIMIT, 1, MAX_SCRIPT_LIMIT, "limit");
  const queue = loadCandidateQueue(options);
  const entry = queue.entries.find((candidate) => candidate.ref === ref);
  if (!entry) throw new Error("Valid quarantined solution candidate was not found.");
  const body = scriptBody(entry.report) || "";
  if (offset > body.length) throw new Error("offset exceeds generated script length.");
  const counts = fingerprintCounts(queue.entries);
  const end = Math.min(body.length, offset + limit);
  return {
    ok: true,
    mode: "local-quarantine-review",
    candidateRef: entry.ref,
    exactFingerprint: entry.fingerprint,
    repeatCount: entry.fingerprint ? counts.get(entry.fingerprint) : 1,
    report: cleanedReport(entry.report),
    generatedScript: {
      body: body.slice(offset, end),
      offset,
      totalChars: body.length,
      nextOffset: end < body.length ? end : null,
      truncated: end < body.length
    },
    quarantine: { quarantineOnly: true, plannerVisible: false, promotionRequired: true, readOnly: true },
    next: "Review this quarantine artifact only. Promotion remains an explicit separate workflow."
  };
}

const solutionCandidateQueueTools = [
  {
    name: "list_solution_candidates",
    description: "List compact quarantined JSX candidate metadata and deterministic exact-script repeat groups. Local read-only review lookup; excludes script bodies and never makes candidates planner-visible.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        offset: { type: "integer", minimum: 0, maximum: MAX_FILES, default: 0 },
        limit: { type: "integer", minimum: 1, maximum: MAX_LIST_LIMIT, default: DEFAULT_LIST_LIMIT },
        groupLimit: { type: "integer", minimum: 0, maximum: MAX_GROUP_LIMIT, default: DEFAULT_GROUP_LIMIT }
      }
    }
  },
  {
    name: "get_solution_candidate",
    description: "Read one cleaned quarantined candidate report by safe basename and one bounded page of generated JSX. Local read-only review lookup; no execution, promotion, or planner visibility.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        candidateRef: { type: "string", pattern: "^[A-Za-z0-9][A-Za-z0-9._-]{0,219}\\.json$", description: "Opaque candidate reference returned by list_solution_candidates; paths are rejected." },
        offset: { type: "integer", minimum: 0, maximum: 12000, default: 0 },
        limit: { type: "integer", minimum: 1, maximum: MAX_SCRIPT_LIMIT, default: DEFAULT_SCRIPT_LIMIT }
      },
      required: ["candidateRef"]
    }
  }
];

module.exports = {
  MAX_FILE_BYTES,
  MAX_FILES,
  getSolutionCandidate,
  listSolutionCandidates,
  solutionCandidateQueueTools
};
