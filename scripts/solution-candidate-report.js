"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const CANDIDATE_SCHEMA_VERSION = "solution-candidate-report.v1";
const DEFAULT_CANDIDATE_DIR = path.join(__dirname, "..", "logs", "solution-candidates");
const MAX_TEXT_CHARS = 1200;
const MAX_SCRIPT_CHARS = 12000;
const MAX_ARRAY_ITEMS = 20;
const MAX_PLAN_STEPS = 24;

const SECRET_PATTERNS = [
  {
    label: "OpenAI-style API key",
    pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/g,
    replacement: "[redacted:api-key]"
  },
  {
    label: "provider secret environment variable",
    pattern: /\b(OPENAI_API_KEY|OPENAI_KEY|ANTHROPIC_API_KEY|CLAUDE_API_KEY|GEMINI_API_KEY|GOOGLE_API_KEY|AE_BRIDGE_TOKEN)\b/gi,
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

const DROPPED_KEY_PATTERN = /^(transcript|transcriptTail|rawTranscript|rawLog|logTail|fullProjectScan|projectScan)$/i;
const SECRET_KEY_PATTERN = /(api[_-]?key|secret|token|password|authorization|cookie)/i;
const ALLOWED_PROMOTION_ACTIONS = new Set([
  "keep-in-quarantine",
  "promote-to-recipe",
  "promote-to-typed-tool-candidate",
  "discard"
]);

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
  const redaction = { label, field };
  if (!context.redactions.some((item) => item.label === label && item.field === field)) {
    context.redactions.push(redaction);
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeFilePart(value) {
  return String(value || "solution-candidate")
    .replace(/[^A-Za-z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96) || "solution-candidate";
}

function fileTimestamp(value) {
  return safeFilePart(String(value || new Date().toISOString()).replace(/[:]/g, "-"));
}

function slugId(value) {
  return String(value || "solution-candidate")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "solution-candidate";
}

function numberOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function booleanOrNull(value) {
  return typeof value === "boolean" ? value : null;
}

function truncateText(text, limit, context, field) {
  if (text.length <= limit) {
    return text;
  }
  addWarning(context, `${field} was truncated to ${limit} characters.`);
  return `${text.slice(0, limit)}... [truncated]`;
}

function redactText(value, context, field, limit = MAX_TEXT_CHARS) {
  if (value === null || value === undefined) {
    return null;
  }

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
  if (text === null || text.length === 0) {
    return fallback;
  }
  return text;
}

function safeStringArray(value, context, field, options = {}) {
  const maxItems = options.maxItems || MAX_ARRAY_ITEMS;
  const limit = options.limit || MAX_TEXT_CHARS;
  const source = Array.isArray(value) ? value : (value === null || value === undefined ? [] : [value]);
  if (source.length > maxItems) {
    addWarning(context, `${field} was limited to ${maxItems} item(s).`);
  }
  return source.slice(0, maxItems)
    .map((item, index) => safeString(
      typeof item === "string" ? item : JSON.stringify(sanitizeStructured(item, context, `${field}[${index}]`, 2)),
      context,
      `${field}[${index}]`,
      null,
      limit
    ))
    .filter(Boolean);
}

function sanitizeStructured(value, context, field, depth = 4) {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "string") {
    return safeString(value, context, field);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    if (depth <= 0) {
      addWarning(context, `${field} was omitted because it was too deeply nested.`);
      return [];
    }
    if (value.length > MAX_ARRAY_ITEMS) {
      addWarning(context, `${field} was limited to ${MAX_ARRAY_ITEMS} item(s).`);
    }
    return value.slice(0, MAX_ARRAY_ITEMS).map((item, index) => sanitizeStructured(item, context, `${field}[${index}]`, depth - 1));
  }
  if (!isPlainObject(value)) {
    return safeString(String(value), context, field);
  }
  if (depth <= 0) {
    addWarning(context, `${field} was omitted because it was too deeply nested.`);
    return {};
  }

  const output = {};
  for (const key of Object.keys(value).sort()) {
    if (DROPPED_KEY_PATTERN.test(key)) {
      addWarning(context, `${field}.${key} was omitted from candidate report.`);
      continue;
    }
    if (SECRET_KEY_PATTERN.test(key)) {
      addWarning(context, `${field}.${key} was omitted because the key name is secret-like.`);
      addRedaction(context, "secret-like key", `${field}.${key}`);
      continue;
    }
    output[key] = sanitizeStructured(value[key], context, `${field}.${key}`, depth - 1);
  }
  return output;
}

function pickObject(value) {
  return isPlainObject(value) ? value : {};
}

function compactPlanner(raw, context) {
  const planner = pickObject(raw.planner || raw.provider || raw.agent);
  return {
    label: safeString(planner.label, context, "provenance.planner.label"),
    agent: safeString(planner.agent || planner.id, context, "provenance.planner.agent"),
    model: safeString(planner.model, context, "provenance.planner.model"),
    providerGroup: safeString(planner.providerGroup, context, "provenance.planner.providerGroup"),
    authMode: safeString(planner.authMode, context, "provenance.planner.authMode")
  };
}

function compactProvenance(raw, context, defaultSource) {
  const report = pickObject(raw.agentRunReport || raw.runReport);
  const reportRun = pickObject(report.run);
  const source = pickObject(raw.provenance);

  return {
    source: safeString(source.source || raw.source || defaultSource, context, "provenance.source", "manual-capture"),
    sourceReportSchema: safeString(report.schemaVersion, context, "provenance.sourceReportSchema"),
    sourceReportPath: safeString(source.sourceReportPath || raw.sourceReportPath || report.path, context, "provenance.sourceReportPath"),
    runPrefix: safeString(source.runPrefix || raw.runPrefix || reportRun.runPrefix || report.runPrefix, context, "provenance.runPrefix"),
    scenarioId: safeString(source.scenarioId || raw.scenarioId, context, "provenance.scenarioId"),
    planner: compactPlanner(report.planner ? report : raw, context)
  };
}

function compactPlanStep(step, index, context) {
  const raw = isPlainObject(step) ? step : { summary: step };
  const tool = raw.tool || raw.toolName || raw.name || raw.action;
  const target = raw.targetSummary || raw.affectedTargetSummary || raw.affectedTargets || raw.target || raw.summary;
  return {
    index: numberOrNull(raw.index) || index + 1,
    tool: safeString(tool, context, `generatedPlan.steps[${index}].tool`),
    mutating: booleanOrNull(raw.mutating),
    targetSummary: safeString(target, context, `generatedPlan.steps[${index}].targetSummary`),
    status: safeString(raw.status || raw.state, context, `generatedPlan.steps[${index}].status`),
    safety: sanitizeStructured(raw.safety || raw.requiredSafetyGates || raw.gates || null, context, `generatedPlan.steps[${index}].safety`, 2)
  };
}

function compactGeneratedPlan(raw, context) {
  const source = raw.generatedPlan || raw.toolPlan || raw.plan || {};
  const plan = Array.isArray(source) ? { steps: source } : pickObject(source);
  const steps = Array.isArray(plan.steps) ? plan.steps : [];
  if (steps.length > MAX_PLAN_STEPS) {
    addWarning(context, `generatedPlan.steps was limited to ${MAX_PLAN_STEPS} item(s).`);
  }
  const compactSteps = steps.slice(0, MAX_PLAN_STEPS).map((step, index) => compactPlanStep(step, index, context));
  const explicitMutatingCount = numberOrNull(plan.mutatingStepCount || plan.mutationCount);
  const inferredMutatingCount = compactSteps.filter((step) => step.mutating === true).length;
  return {
    summary: safeString(plan.summary || raw.planSummary, context, "generatedPlan.summary"),
    stepCount: numberOrNull(plan.stepCount) !== null ? plan.stepCount : steps.length,
    mutatingStepCount: explicitMutatingCount !== null ? explicitMutatingCount : inferredMutatingCount,
    steps: compactSteps,
    omittedStepCount: Math.max(0, steps.length - compactSteps.length)
  };
}

function compactGeneratedScript(raw, context) {
  const source = raw.generatedScript || raw.script || raw.extendscript || {};
  const script = isPlainObject(source) ? source : { body: source };
  const body = script.body || script.source || script.code || null;
  const safeBody = body === null || body === undefined
    ? null
    : safeString(body, context, "generatedScript.body", null, MAX_SCRIPT_CHARS);
  return {
    language: safeString(script.language || script.type || (body ? "extendscript" : null), context, "generatedScript.language"),
    summary: safeString(script.summary, context, "generatedScript.summary"),
    included: safeBody !== null,
    body: safeBody,
    omittedReason: safeBody === null ? "No generated script body was provided." : null
  };
}

function compactRunResult(raw, context) {
  const run = pickObject(raw.runResult || raw.executionResult || raw.run);
  const statuses = Array.isArray(run.statuses) ? run.statuses : [];
  return {
    ok: booleanOrNull(run.ok),
    dryRun: booleanOrNull(run.dryRun),
    mutating: booleanOrNull(run.mutating),
    safety: sanitizeStructured(run.safety || null, context, "runResult.safety", 3),
    checkpoint: sanitizeStructured(run.checkpoint || null, context, "runResult.checkpoint", 2),
    statusCount: statuses.length || numberOrNull(run.statusCount),
    errorSummary: safeString(run.errorSummary || run.error || run.message, context, "runResult.errorSummary"),
    outputSummary: safeString(run.outputSummary || run.summary, context, "runResult.outputSummary")
  };
}

function compactVerification(raw, context) {
  const verification = pickObject(raw.verificationReadBack || raw.verification || raw.readBack);
  return {
    summary: safeString(verification.summary || raw.verificationSummary, context, "verificationReadBack.summary"),
    status: safeString(verification.status, context, "verificationReadBack.status"),
    evidence: safeStringArray(verification.evidence || verification.expectedEvidence || raw.verificationEvidence, context, "verificationReadBack.evidence")
  };
}

function compactPromotionAction(raw, context) {
  const source = pickObject(raw.suggestedPromotionAction || raw.promotionAction);
  const rawAction = safeString(source.action, context, "suggestedPromotionAction.action", "keep-in-quarantine");
  const action = ALLOWED_PROMOTION_ACTIONS.has(rawAction) ? rawAction : "keep-in-quarantine";
  if (rawAction !== action) {
    addWarning(context, `suggestedPromotionAction.action was normalized to ${action}.`);
  }
  return {
    action,
    rationale: safeString(source.rationale, context, "suggestedPromotionAction.rationale"),
    nextReviewChecks: safeStringArray(
      source.nextReviewChecks || [
        "Confirm no typed bridge tool already covers the workflow.",
        "Confirm mutation gates, idempotency, and read-back evidence before promotion.",
        "Keep raw ExtendScript file-based and reviewed if no typed tool exists."
      ],
      context,
      "suggestedPromotionAction.nextReviewChecks"
    )
  };
}

function recordRootOmissions(raw, context) {
  for (const key of Object.keys(raw)) {
    if (DROPPED_KEY_PATTERN.test(key)) {
      addWarning(context, `${key} was omitted from candidate report.`);
    } else if (SECRET_KEY_PATTERN.test(key)) {
      addWarning(context, `${key} was omitted because the key name is secret-like.`);
      addRedaction(context, "secret-like key", key);
    }
  }
}

function normalizeSolutionCandidateReport(rawCandidate, options) {
  const opts = options || {};
  const context = createContext();
  const raw = pickObject(rawCandidate);
  const generatedAt = opts.generatedAt || new Date().toISOString();
  const intent = pickObject(raw.intent);
  const title = safeString(raw.title, context, "candidate.title");
  const summary = safeString(intent.summary || raw.intentSummary || raw.userIntent, context, "candidate.intent.summary");
  const candidateId = slugId(raw.id || title || summary || generatedAt);

  recordRootOmissions(raw, context);

  for (const warning of safeStringArray(raw.warnings, context, "warnings")) {
    addWarning(context, warning);
  }

  const report = {
    schemaVersion: CANDIDATE_SCHEMA_VERSION,
    generatedAt,
    source: opts.source || "manual-capture",
    status: "candidate",
    candidate: {
      id: candidateId,
      title: title || candidateId,
      tags: safeStringArray(raw.tags, context, "candidate.tags"),
      intent: {
        summary,
        appliesWhen: safeStringArray(intent.appliesWhen || raw.appliesWhen, context, "candidate.intent.appliesWhen")
      },
      projectAssumptions: safeStringArray(raw.projectAssumptions || raw.targetAssumptions, context, "candidate.projectAssumptions"),
      affectedTargets: safeStringArray(raw.affectedTargets || raw.affectedTargetSummary, context, "candidate.affectedTargets"),
      generatedPlan: compactGeneratedPlan(raw, context),
      generatedScript: compactGeneratedScript(raw, context),
      runResult: compactRunResult(raw, context),
      verificationReadBack: compactVerification(raw, context),
      warnings: [],
      suggestedPromotionAction: compactPromotionAction(raw, context),
      provenance: compactProvenance(raw, context, opts.source || "manual-capture")
    },
    safety: {
      quarantineOnly: true,
      plannerVisible: false,
      promotionRequired: true,
      rawTranscriptStored: false,
      fullProjectScanStored: false,
      redactions: context.redactions
    }
  };

  report.candidate.warnings = context.warnings.slice();
  validateSolutionCandidateReport(report);
  return report;
}

function assertNoDroppedKeys(value, label = "candidate report") {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoDroppedKeys(item, `${label}[${index}]`));
    return;
  }
  if (!isPlainObject(value)) {
    return;
  }
  for (const key of Object.keys(value)) {
    assert(!DROPPED_KEY_PATTERN.test(key), `${label} must not store dropped field: ${key}`);
    assertNoDroppedKeys(value[key], `${label}.${key}`);
  }
}

function assertNoUnsafeReportText(report) {
  const text = JSON.stringify(report);
  assertNoDroppedKeys(report);
  assert(!/\bsk-[A-Za-z0-9_-]{20,}\b/.test(text), "candidate report must not store API key values.");
  assert(!/\b[A-Za-z]:\\[^\s"'`<>|]+/.test(text), "candidate report must not store Windows absolute paths.");
  assert(!/\/(?:Users|home|Volumes)\/[^\s"'`<>|]+/.test(text), "candidate report must not store user absolute paths.");
}

function validateSolutionCandidateReport(report) {
  assert(isPlainObject(report), "candidate report must be an object.");
  assert.strictEqual(report.schemaVersion, CANDIDATE_SCHEMA_VERSION, `schemaVersion must be ${CANDIDATE_SCHEMA_VERSION}.`);
  assert.strictEqual(report.status, "candidate", "candidate report status must stay candidate.");
  assert(isPlainObject(report.candidate), "candidate must be an object.");
  assert.strictEqual(typeof report.candidate.id, "string", "candidate.id must be a string.");
  assert(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(report.candidate.id), "candidate.id must be kebab-case.");
  assert(isPlainObject(report.candidate.intent), "candidate.intent must be an object.");
  assert(isPlainObject(report.candidate.generatedPlan), "candidate.generatedPlan must be an object.");
  assert(isPlainObject(report.candidate.generatedScript), "candidate.generatedScript must be an object.");
  assert(isPlainObject(report.candidate.runResult), "candidate.runResult must be an object.");
  assert(isPlainObject(report.candidate.verificationReadBack), "candidate.verificationReadBack must be an object.");
  assert(isPlainObject(report.candidate.suggestedPromotionAction), "candidate.suggestedPromotionAction must be an object.");
  assert(ALLOWED_PROMOTION_ACTIONS.has(report.candidate.suggestedPromotionAction.action), "suggested promotion action is not allowed.");
  assert(isPlainObject(report.safety), "safety must be an object.");
  assert.strictEqual(report.safety.quarantineOnly, true, "candidate reports must remain quarantine-only.");
  assert.strictEqual(report.safety.plannerVisible, false, "candidate reports must not be planner-visible.");
  assert.strictEqual(report.safety.promotionRequired, true, "candidate reports require explicit promotion.");
  assert.strictEqual(report.safety.rawTranscriptStored, false, "candidate reports must not store raw transcripts.");
  assertNoUnsafeReportText(report);
}

function writeSolutionCandidateReport(rawCandidate, options) {
  const opts = options || {};
  const report = normalizeSolutionCandidateReport(rawCandidate, opts);
  const outputDir = opts.outputDir || process.env.AE_SOLUTION_CANDIDATE_DIR || DEFAULT_CANDIDATE_DIR;
  fs.mkdirSync(outputDir, { recursive: true });
  const fileName = [
    fileTimestamp(report.generatedAt),
    safeFilePart(report.candidate.id)
  ].join("-") + ".json";
  const filePath = path.join(outputDir, fileName);
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2) + "\n", "utf8");
  return {
    report,
    path: filePath,
    relativePath: path.relative(process.cwd(), filePath)
  };
}

function candidateTemplate() {
  return {
    title: "Short candidate title",
    tags: ["timeline", "typed-tool"],
    intent: {
      summary: "What user wanted to accomplish.",
      appliesWhen: ["When this solution is likely to apply."]
    },
    generatedPlan: {
      summary: "Compact plan summary.",
      steps: [
        {
          tool: "get_active_comp",
          mutating: false,
          targetSummary: "Active comp metadata",
          status: "completed"
        }
      ]
    },
    generatedScript: {
      language: "extendscript",
      summary: "Only include small reviewed candidate script text when useful.",
      body: null
    },
    affectedTargets: ["Compact target summary, not a full project scan."],
    runResult: {
      ok: true,
      dryRun: false,
      mutating: false,
      outputSummary: "What happened."
    },
    verificationReadBack: {
      summary: "How the result was read back.",
      evidence: ["Compact evidence line."]
    },
    projectAssumptions: ["No absolute project paths."],
    warnings: [],
    suggestedPromotionAction: {
      action: "keep-in-quarantine",
      rationale: "Needs explicit review before tracked promotion."
    }
  };
}

function parseArgs(argv) {
  const args = {
    input: null,
    outputDir: null,
    generatedAt: null,
    source: null,
    printTemplate: false,
    help: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--print-template") {
      args.printTemplate = true;
    } else if (arg === "--input") {
      args.input = argv[index + 1];
      index += 1;
    } else if (arg === "--output-dir") {
      args.outputDir = argv[index + 1];
      index += 1;
    } else if (arg === "--generated-at") {
      args.generatedAt = argv[index + 1];
      index += 1;
    } else if (arg === "--source") {
      args.source = argv[index + 1];
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function printUsage() {
  console.log([
    "Usage:",
    "  node scripts\\solution-candidate-report.js --print-template",
    "  node scripts\\solution-candidate-report.js --input candidate.json [--output-dir logs\\solution-candidates]",
    "",
    "Candidate reports are local quarantine artifacts. They are not planner-visible and require explicit promotion."
  ].join("\n"));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    return;
  }
  if (args.printTemplate) {
    console.log(JSON.stringify(candidateTemplate(), null, 2));
    return;
  }
  if (!args.input) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const raw = JSON.parse(fs.readFileSync(args.input, "utf8"));
  const artifact = writeSolutionCandidateReport(raw, {
    outputDir: args.outputDir,
    generatedAt: args.generatedAt,
    source: args.source || "manual-capture"
  });
  console.log(JSON.stringify({
    ok: true,
    schemaVersion: artifact.report.schemaVersion,
    candidateId: artifact.report.candidate.id,
    path: artifact.path,
    warnings: artifact.report.candidate.warnings.length,
    redactions: artifact.report.safety.redactions.length
  }, null, 2));
}

if (require.main === module) {
  main();
}

module.exports = {
  CANDIDATE_SCHEMA_VERSION,
  DEFAULT_CANDIDATE_DIR,
  candidateTemplate,
  normalizeSolutionCandidateReport,
  validateSolutionCandidateReport,
  writeSolutionCandidateReport
};
