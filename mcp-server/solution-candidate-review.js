"use strict";

const assert = require("assert");
const vm = require("vm");
const { loadCandidateQueue } = require("./solution-candidate-queue");

const REVIEW_SCHEMA = "solution-candidate-review-proposal.v1";
const CRITERIA = ["syntax", "safety", "isolatedReproduction", "readBack"];
const MAX_GROUP = 20;

function text(value, label) {
  assert(typeof value === "string" && value.trim() && value.length <= 2000, `${label}: expected bounded nonempty text.`);
}

function object(value, keys, label) {
  assert(value && Object.getPrototypeOf(value) === Object.prototype, `${label}: expected plain object.`);
  assert(Object.keys(value).every((key) => keys.includes(key)), `${label}: unknown field.`);
}

function strings(value, label) {
  assert(Array.isArray(value) && value.length > 0 && value.length <= 20, `${label}: expected 1–20 entries.`);
  value.forEach((item) => text(item, label));
}

// Review instructions are data. No source, expressions, commands or fixtures are executed.
function validateProposal(proposal, registry) {
  object(proposal, ["id", "kind", "summary", "parameters", "comparisons", "algorithm", "criteria"], "proposal");
  assert(typeof proposal.id === "string" && /^[a-z][a-z0-9-]{0,100}$/.test(proposal.id), "proposal.id: invalid id.");
  assert(["typed-tool", "deterministic-builder"].includes(proposal.kind), "proposal.kind: unsupported kind.");
  text(proposal.summary, "proposal.summary");
  strings(proposal.algorithm, "proposal.algorithm");
  assert(Array.isArray(proposal.parameters) && proposal.parameters.length > 0 && proposal.parameters.length <= 20, "parameters: expected 1–20 entries.");
  const names = new Set();
  proposal.parameters.forEach((parameter) => {
    object(parameter, ["name", "type", "sourceAnchor", "constraints"], "parameter");
    assert(typeof parameter.name === "string" && /^[a-z][a-zA-Z0-9]{0,60}$/.test(parameter.name) && !names.has(parameter.name), "parameter.name: invalid or duplicate.");
    names.add(parameter.name);
    assert(["string", "number", "integer", "boolean", "array", "object"].includes(parameter.type), "parameter.type: unsupported type.");
    text(parameter.sourceAnchor, "parameter.sourceAnchor");
    strings(parameter.constraints, "parameter.constraints");
  });
  assert(registry && registry.schema === "ae-solution-registry.v1" && Array.isArray(registry.solutions), "Reviewed registry required.");
  assert(Array.isArray(proposal.comparisons) && proposal.comparisons.length > 0 && proposal.comparisons.length <= 8, "comparisons: expected 1–8 reviewed solutions.");
  proposal.comparisons.forEach((comparison) => {
    object(comparison, ["solutionId", "tools", "coverage", "gap"], "comparison");
    const matches = registry.solutions.filter((entry) => entry.id === comparison.solutionId && ["recipe", "tool", "typed-tool-candidate"].includes(entry.status));
    assert(matches.length === 1, "comparison: reviewed solution missing or ambiguous.");
    strings(comparison.tools, "comparison.tools");
    assert(comparison.tools.every((name) => !/^run_extendscript/.test(name) && matches[0].execution.preferredTools.includes(name)), "comparison: tool absent from reviewed recipe or raw JSX.");
    text(comparison.coverage, "comparison.coverage");
    text(comparison.gap, "comparison.gap");
  });
  object(proposal.criteria, CRITERIA, "criteria");
  CRITERIA.forEach((key) => strings(proposal.criteria[key], `criteria.${key}`));
}

function inspectSyntax(body) {
  try {
    // Compile only. V8 parsing does not certify ExtendScript/ES3 or AE host semantics.
    // run_extendscript accepts a function body, including top-level return.
    new vm.Script(`(function () {\n${body}\n});`, { filename: "quarantined-candidate.jsx" });
    return { status: "parse-only-pass", engine: "node-v8", grammar: "function-body", aeCompatibility: "unverified", executed: false };
  } catch (_error) {
    return { status: "blocked", engine: "node-v8", grammar: "function-body", aeCompatibility: "unverified", executed: false };
  }
}

function inspectSafety(body) {
  const patterns = {
    "dynamic-execution": /\b(?:eval|Function|require)\s*\(|\$\s*\.\s*evalFile\s*\(/,
    "external-io": /\b(?:File|Folder|Socket)\s*\(|\b(?:system\s*\.\s*callSystem|app\s*\.\s*scheduleTask)\s*\(/,
    "project-write": /\bapp\s*\.\s*project\s*\.\s*(?:save\w*|close|importFile)\s*\(/,
    "destructive-operation": /\.\s*remove\s*\(/,
    "preprocessor": /^\s*#/m
  };
  return {
    status: "manual-review-required",
    findings: Object.keys(patterns).filter((key) => patterns[key].test(body)),
    limitation: "Лексические сигналы не доказывают безопасность; aliases, computed calls и AE side effects требуют ручного review."
  };
}

function reduceCandidateReview(input, options = {}) {
  object(input, ["candidateRef", "expectedFingerprint", "proposal"], "review input");
  assert(typeof input.candidateRef === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,219}\.json$/.test(input.candidateRef), "candidateRef: safe basename required.");
  assert(typeof input.expectedFingerprint === "string" && /^sha256:[a-f0-9]{64}$/.test(input.expectedFingerprint), "expectedFingerprint: SHA-256 required.");
  validateProposal(input.proposal, options.registry);
  const queue = loadCandidateQueue(options);
  const selected = queue.entries.find((entry) => entry.ref === input.candidateRef);
  assert(selected && selected.fingerprint === input.expectedFingerprint, "Candidate missing or fingerprint changed; repeat discovery and review.");
  const entries = queue.entries.filter((entry) => entry.fingerprint === selected.fingerprint);
  const body = selected.report.candidate.generatedScript.body;
  const blockers = [];
  if (entries.length < 2) blockers.push("exact-repeat-required");
  if (entries.length > MAX_GROUP) blockers.push("group-exceeds-review-bound");
  if (queue.skipped) blockers.push("queue-has-unreadable-candidates");
  if (!body || entries.some(({ report }) => {
    const candidate = report.candidate;
    return !candidate.generatedScript.included || candidate.warnings.some((warning) => /generatedScript|truncat|redact/i.test(warning)) ||
      JSON.stringify(report.safety.redactions).includes("generatedScript") || /\[(?:redacted|truncated)/i.test(candidate.generatedScript.body);
  })) blockers.push("source-incomplete-or-redacted");
  if (entries.some(({ report }) => report.candidate.runResult.ok !== true || report.candidate.runResult.dryRun !== false)) blockers.push("unsuccessful-or-dry-run-member");

  const syntax = inspectSyntax(body || "");
  if (syntax.status === "blocked") blockers.push("syntax-needs-review");
  const safety = inspectSafety(body || "");
  if (safety.findings.length) blockers.push("raw-source-safety-findings");
  const parameters = input.proposal.parameters.map((parameter) => {
    const start = (body || "").indexOf(parameter.sourceAnchor);
    const ambiguous = start >= 0 && body.indexOf(parameter.sourceAnchor, start + 1) >= 0;
    if (start < 0 || ambiguous) blockers.push(`parameter-anchor:${parameter.name}`);
    return { ...parameter, extraction: { method: "reviewed-source-anchor", status: start >= 0 && !ambiguous ? "matched" : "blocked", start, end: start < 0 ? null : start + parameter.sourceAnchor.length } };
  });
  return {
    schemaVersion: REVIEW_SCHEMA,
    status: blockers.length ? "blocked" : "proposal-prepared",
    quarantine: { quarantineOnly: true, plannerVisible: false, promotionRequired: true },
    source: { candidateRef: input.candidateRef, exactFingerprint: selected.fingerprint, repeatCount: entries.length,
      candidateRefs: entries.slice(0, MAX_GROUP).map((entry) => entry.ref), refsTruncated: entries.length > MAX_GROUP,
      fingerprintScope: "stored-sanitized-JSX", skipped: queue.skipped },
    checks: { syntax, safety, criteria: Object.fromEntries(CRITERIA.map((key) => [key, { status: "pending-review", criteria: input.proposal.criteria[key] }])) },
    blockers,
    proposal: { ...JSON.parse(JSON.stringify(input.proposal)), parameters },
    promotion: { decision: "not-requested", explicitReview: false, registryWritten: false,
      next: "Отдельное review реализации и доказательств всех criteria; затем явное promotion. Этот proposal не является execution plan или promotion review." }
  };
}

module.exports = { REVIEW_SCHEMA, reduceCandidateReview };
