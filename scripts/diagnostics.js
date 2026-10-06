#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { buildCheckCatalog, cmd, runSpawned, summarizeResults, writeReport } = require("./reliability-validation-suite");
const records = require("../mcp-server/plan-run-records");
const responses = require("../mcp-server/plan-run-response");

const ROOT = path.resolve(__dirname, "..");
const REPORT_DIR = path.join(ROOT, "logs", "diagnostics");
const SCHEMA = "ae-agent-diagnostics.v1";
const HASH = /^[a-f0-9]{64}$/i;
const JSON_LIMIT = 1024 * 1024;
// Audited file/fixture checks only. The suite's whole `local` category also
// contains daemon checks; neither it nor live/provider scopes are selectable.
const OFFLINE_IDS = new Set([
  "reliability-suite-catalog", "project-intent-memory", "semantic-verification",
  "solution-registry", "solution-candidate-report", "agent-run-report-schema"
]);

function buildOfflineCatalog() {
  return [
    { id: "rules", category: "local", description: "Repository rules and frozen hashes.", timeoutMs: 30000, ...cmd("clean-current-check.js") },
    ...buildCheckCatalog().filter(check => OFFLINE_IDS.has(check.id) && check.category === "local" &&
      !check.internal && !(check.gates || []).length)
  ];
}

function fail(code) { throw Object.assign(new Error(code), { code }); }
function plain(value) { return value && typeof value === "object" && !Array.isArray(value); }
function keys(value, allowed) {
  if (!plain(value) || Object.keys(value).some(key => !allowed.includes(key))) fail("input_fields_invalid");
}
function ids(value) {
  const list = value.split(",");
  if (list.some(id => !id || id !== id.trim()) || new Set(list).size !== list.length) fail("check_ids_invalid");
  return list;
}

function parseArgs(argv) {
  const opts = { checkIds: [], skipIds: [], inputFile: null, logDir: path.join(ROOT, "logs") };
  const seen = new Set();
  for (const arg of argv) {
    const name = arg.split("=", 1)[0];
    if (seen.has(name)) fail("duplicate_option");
    seen.add(name);
    if (arg === "--help" || arg === "-h") opts.help = true;
    else if (arg === "--list") opts.list = true;
    else if (arg.startsWith("--checks=")) opts.checkIds = ids(arg.slice(9));
    else if (arg.startsWith("--skip=")) opts.skipIds = ids(arg.slice(7));
    else if (arg.startsWith("--input=") && arg.slice(8)) opts.inputFile = path.resolve(ROOT, arg.slice(8));
    else if (arg.startsWith("--log-dir=") && arg.slice(10)) opts.logDir = path.resolve(ROOT, arg.slice(10));
    else if (arg.startsWith("--timeout-ms=")) {
      const value = arg.slice(13);
      if (!/^\d+$/.test(value)) fail("timeout_invalid");
      opts.timeoutMs = Number(value);
      if (!Number.isSafeInteger(opts.timeoutMs) || opts.timeoutMs < 1000 || opts.timeoutMs > 3600000) fail("timeout_invalid");
    } else fail("option_unknown");
  }
  const catalogIds = new Set(buildOfflineCatalog().map(check => check.id));
  if (opts.checkIds.some(id => !catalogIds.has(id))) fail("check_not_offline_or_unknown");
  if (opts.skipIds.some(id => !opts.checkIds.includes(id))) fail("skip_not_selected");
  if (!opts.help && !opts.list && !opts.checkIds.length && !opts.inputFile) fail("explicit_selection_required");
  return opts;
}

// Reject both lexical traversal and symlink/junction escapes, including an
// existing parent when the final output directory has not been created yet.
function containedPath(file) {
  const absolute = path.resolve(ROOT, file);
  const relative = path.relative(ROOT, absolute);
  if (relative === ".." || relative.startsWith(".." + path.sep) || path.isAbsolute(relative)) fail("path_containment_violation");
  let ancestor = absolute;
  while (!fs.existsSync(ancestor)) ancestor = path.dirname(ancestor);
  records.containedFile(ROOT, ancestor);
  return absolute;
}

function readBounded(file, limit) {
  const real = records.containedFile(ROOT, containedPath(file));
  const stat = fs.statSync(real);
  if (!stat.isFile() || stat.size > limit) fail("file_budget_exceeded");
  const bytes = fs.readFileSync(real);
  if (bytes.length > limit) fail("file_budget_exceeded");
  return bytes;
}

function readInput(file) {
  if (!file) return { receipts: [], hashes: [] };
  const input = JSON.parse(readBounded(file, JSON_LIMIT).toString("utf8").replace(/^\uFEFF/, ""));
  keys(input, ["receipts", "hashes"]);
  for (const key of ["receipts", "hashes"]) {
    if (input[key] !== undefined && (!Array.isArray(input[key]) || input[key].length > 64)) fail("evidence_list_invalid");
  }
  return { receipts: input.receipts || [], hashes: input.hashes || [] };
}

function verifyReceipt(entry, logDir) {
  keys(entry, ["runId", "stepIndex", "sha256"]);
  if (typeof entry.runId !== "string" || !records.ID.test(entry.runId) ||
      !Number.isSafeInteger(entry.stepIndex) || entry.stepIndex < 1 || typeof entry.sha256 !== "string" || !HASH.test(entry.sha256)) fail("receipt_reference_invalid");
  containedPath(logDir);
  const before = responses.getPlanRunEvidence(logDir, { runId: entry.runId, limitChars: 1 });
  const page = responses.getPlanRunEvidence(logDir, { runId: entry.runId, stepIndex: entry.stepIndex, limitChars: responses.MAX_LIMIT_CHARS });
  if (page.sha256 !== entry.sha256.toLowerCase()) fail("receipt_expected_hash_mismatch");
  const file = path.join(logDir, "verification-evidence", entry.runId, `${entry.stepIndex}.json`);
  const bytes = readBounded(file, records.LIMIT);
  if (records.digest(bytes) !== page.sha256) fail("receipt_changed_during_read");
  const receipt = JSON.parse(bytes.toString("utf8"));
  const record = records.readRecord(logDir, entry.runId, { throwOnError: true });
  const after = responses.getPlanRunEvidence(logDir, { runId: entry.runId, limitChars: 1 });
  if (before.sha256 !== after.sha256 || records.digest(JSON.stringify(record)) !== before.sha256) fail("run_record_changed_during_read");
  const step = record.run.steps.find(step => step.index === entry.stepIndex);
  return { file, sha256: page.sha256, artifactId: page.artifactId, recordSha256: before.sha256,
    fresh: false, evidenceKind: "recorded", verification: "integrity_and_binding_only",
    recordedStepStatus: step.status || "unknown", recordedRunOutcome: record.run.outcome || null, receipt };
}

async function verifyHash(entry) {
  keys(entry, ["path", "sha256"]);
  if (typeof entry.path !== "string" || !entry.path || typeof entry.sha256 !== "string" || !HASH.test(entry.sha256)) fail("hash_reference_invalid");
  const file = records.containedFile(ROOT, containedPath(entry.path));
  if (!fs.statSync(file).isFile()) fail("hash_file_invalid");
  const hash = crypto.createHash("sha256");
  let bytes = 0;
  for await (const chunk of fs.createReadStream(file)) { hash.update(chunk); bytes += chunk.length; }
  const actual = hash.digest("hex");
  if (actual !== entry.sha256.toLowerCase()) fail("file_hash_mismatch");
  return { file, sha256: actual, bytes, verification: "current_file_bytes_only" };
}

function resultError(id, category, error) {
  return { id, category, status: "failed", durationMs: 0, errorCode: error.code || "diagnostics_error", error: error.message || String(error) };
}

function saveReport(opts, results, selected = []) {
  const summary = summarizeResults(results);
  summary.skipped = summary.skipped || 0;
  summary["timed-out"] = summary["timed-out"] || 0;
  const report = { schemaVersion: SCHEMA, generatedAt: new Date().toISOString(),
    scope: `offline-${crypto.randomUUID()}`, selectedChecks: selected, inputFile: opts.inputFile || null,
    logDir: opts.logDir || null, completeTaskAcceptance: false, results, summary };
  containedPath(REPORT_DIR);
  const reportPath = writeReport(report, { outputDir: REPORT_DIR });
  return { report, reportPath, exitCode: summary.failed || summary["timed-out"] ? 1 : summary.skipped ? 2 : 0 };
}

async function runDiagnostics(opts) {
  const results = [];
  const catalog = buildOfflineCatalog();
  const selected = [];
  try {
    if (!Array.isArray(opts.checkIds) || opts.checkIds.some(id => !catalog.some(check => check.id === id))) fail("check_not_offline_or_unknown");
    if (new Set(opts.checkIds).size !== opts.checkIds.length) fail("check_ids_invalid");
    if (!Array.isArray(opts.skipIds) || opts.skipIds.some(id => !opts.checkIds.includes(id))) fail("skip_not_selected");
    if (opts.timeoutMs !== undefined && (!Number.isSafeInteger(opts.timeoutMs) || opts.timeoutMs < 1000 || opts.timeoutMs > 3600000)) fail("timeout_invalid");
    const input = readInput(opts.inputFile);
    if (!opts.checkIds.length && !input.receipts.length && !input.hashes.length) fail("explicit_selection_required");
    for (const id of opts.checkIds) {
      const check = { ...catalog.find(check => check.id === id) };
      if (opts.timeoutMs !== undefined) check.timeoutMs = opts.timeoutMs;
      selected.push(check);
      if (opts.skipIds.includes(id) || !fs.existsSync(path.resolve(ROOT, check.args[0]))) {
        results.push({ id, category: check.category, status: "skipped", durationMs: 0,
          error: opts.skipIds.includes(id) ? "Explicitly skipped with --skip." : "Check script is missing." });
        continue;
      }
      results.push(await runSpawned(check, { captureOutput: true, timeoutStatus: "timed-out" }));
    }
    for (const [category, entries, verify] of [
      ["receipts", input.receipts, entry => verifyReceipt(entry, opts.logDir)],
      ["hashes", input.hashes, verifyHash]
    ]) {
      for (const [index, entry] of entries.entries()) {
        const id = `${category}:${index + 1}`, started = Date.now();
        try {
          const evidence = await verify(entry);
          results.push({ id, category, status: "passed", durationMs: Date.now() - started, reference: entry, evidence });
        } catch (error) {
          results.push({ ...resultError(id, category, error), durationMs: Date.now() - started, reference: entry });
        }
      }
    }
  } catch (error) { results.push(resultError("input", "diagnostics", error)); }
  return saveReport(opts, results, selected);
}

function compactText(value, limit = 240) {
  return String(value || "").replace(/[\r\n\t\x00-\x1f\x7f]+/g, " ").slice(0, limit);
}

function formatSummary({ report, reportPath, exitCode }) {
  const s = report.summary;
  const lines = [`Diagnostics ${exitCode ? "INCOMPLETE" : "PASS"}: passed=${s.passed}, failed=${s.failed}, skipped=${s.skipped}, timed-out=${s["timed-out"]}.`];
  for (const result of report.results) {
    if (result.status === "passed") continue;
    const reason = result.error || result.errorCode || (result.exitCode !== null && result.exitCode !== undefined ? `exit=${result.exitCode}` : result.signal || "Check failed.");
    const output = result.status === "failed" ? result.stderr || result.stderrTail || result.stdout || result.stdoutTail : "";
    lines.push(`${result.status.toUpperCase()} ${compactText(result.id)}: ${compactText(reason)}${output ? " — " + compactText(output) : ""}`);
  }
  lines.push(`Report: ${reportPath}`);
  return lines.join("\n");
}

async function main(argv) {
  let result;
  try {
    const opts = parseArgs(argv);
    if (opts.help) {
      console.log("Usage: node scripts/diagnostics.js --checks=id,id [--input=file.json] [--skip=id] [--timeout-ms=1000] [--log-dir=logs]\nUse --list for offline check IDs. Paths resolve from the repository root; reports go to logs/diagnostics/.");
      return;
    }
    if (opts.list) { console.log(buildOfflineCatalog().map(check => `${check.id}: ${check.description}`).join("\n")); return; }
    result = await runDiagnostics(opts);
  } catch (error) {
    result = saveReport({}, [resultError("input", "diagnostics", error)]);
  }
  console.log(formatSummary(result));
  process.exitCode = result.exitCode;
}

if (require.main === module) main(process.argv.slice(2)).catch(error => {
  console.error(`FAILED report: ${compactText(error.message)}. Report could not be saved.`);
  process.exitCode = 1;
});

module.exports = { ROOT, REPORT_DIR, SCHEMA, buildOfflineCatalog, parseArgs, verifyReceipt, verifyHash, runDiagnostics, formatSummary };
