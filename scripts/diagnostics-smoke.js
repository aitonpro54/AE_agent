"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const diagnostics = require("./diagnostics");
const { runSpawned, summarizeResults } = require("./reliability-validation-suite");
const records = require("../mcp-server/plan-run-records");
const { writeStepEvidence } = require("../mcp-server/review-evidence");

const base = path.join(diagnostics.ROOT, "logs", `diagnostics-fixture-${crypto.randomUUID()}`);
const logDir = path.join(base, "recorded logs");
const reports = [];
let groups = 0;
async function test(label, fn) { await fn(); groups++; console.log(`PASS ${label}`); }
function json(file, value) { fs.writeFileSync(file, JSON.stringify(value), "utf8"); }
function expectCode(fn, code) { assert.throws(fn, error => error.code === code); }
function reference(runId, artifact) { return { runId, stepIndex: 1, sha256: artifact.sha256 }; }
function fixture() {
  const runId = crypto.randomUUID();
  const receipt = { runId, stepIndex: 1, tool: "get_active_comp", actionId: "fixture-action",
    projectId: "fixture-project", proposalRevision: 2, projectRevision: 3,
    observedAt: "2026-10-01T12:00:00.000Z", result: { diagnostic: "FULL_RECEIPT_🎬".repeat(1500) } };
  const artifact = writeStepEvidence(logDir, receipt);
  const record = { schema: "ae-agent-plan-run-record.v1", runId,
    plan: { steps: [{ tool: receipt.tool, args: {} }] },
    run: { id: runId, steps: [{ index: 1, tool: receipt.tool, status: "completed", evidenceArtifact: artifact }],
      provenance: { actionId: receipt.actionId, projectId: receipt.projectId,
        proposalRevision: receipt.proposalRevision, projectRevision: receipt.projectRevision },
      outcome: { execution: { status: "unknown" } } } };
  records.writeRecord(logDir, record);
  return { runId, receipt, artifact, record, entry: reference(runId, artifact) };
}
async function run(opts) {
  const result = await diagnostics.runDiagnostics({ checkIds: [], skipIds: [], logDir, ...opts });
  reports.push(result.reportPath);
  return result;
}
function cli(args) {
  const child = spawnSync(process.execPath, [path.join(__dirname, "diagnostics.js"), ...args],
    { cwd: os.tmpdir(), encoding: "utf8", windowsHide: true, timeout: 30000 });
  assert.ifError(child.error);
  const match = child.stdout.match(/^Report: (.+)$/m);
  if (match) reports.push(match[1].trim());
  return child;
}
function command(code, timeoutMs = 5000) {
  return { id: "fixture", category: "local", command: "node fixture", cmd: process.execPath, args: ["-e", code], timeoutMs };
}

async function main() {
  fs.mkdirSync(logDir, { recursive: true });
  try {
    await test("explicit offline selection and strict options", () => {
      for (const id of ["all", "local", "repo-smoke", "bridge-only", "live-cep-inspect", "provider-readiness-matrix", "provider-contract", "external-openai-cli-chat"]) {
        expectCode(() => diagnostics.parseArgs([`--checks=${id}`]), "check_not_offline_or_unknown");
      }
      expectCode(() => diagnostics.parseArgs([]), "explicit_selection_required");
      expectCode(() => diagnostics.parseArgs(["--checks=rules,rules"]), "check_ids_invalid");
      expectCode(() => diagnostics.parseArgs(["--checks=rules", "--skip=solution-registry"]), "skip_not_selected");
      expectCode(() => diagnostics.parseArgs(["--checks=rules", "--allow-external-provider"]), "option_unknown");
      for (const value of ["0", "999", "Infinity", "1.5", "3600001", ""]) expectCode(() => diagnostics.parseArgs(["--checks=rules", `--timeout-ms=${value}`]), "timeout_invalid");
      assert(diagnostics.buildOfflineCatalog().every(check => check.cmd === process.execPath && !check.internal && !(check.gates || []).length));
    });
    await test("full Unicode output stays in report; legacy helper keeps tails", async () => {
      const code = "process.stdout.write('HEAD_🎬' + 'x'.repeat(10000) + '_END');process.stderr.write('ERROR_HEAD_' + 'y'.repeat(5000));";
      const full = await runSpawned(command(code), { captureOutput: true });
      assert.equal(full.status, "passed");
      assert(full.stdout.startsWith("HEAD_🎬"));
      assert(full.stdout.endsWith("_END"));
      assert(full.stderr.startsWith("ERROR_HEAD_"));
      assert.equal(full.stdoutTail.length, 2000);
      const legacy = await runSpawned(command(code));
      assert(!Object.hasOwn(legacy, "stdout"));
      assert.equal(legacy.stdoutTail, full.stdoutTail);
      const text = diagnostics.formatSummary({ report: { results: [full], summary: { passed: 1, failed: 0, skipped: 0, "timed-out": 0 } }, reportPath: "fixture.json", exitCode: 0 });
      assert(!text.includes("HEAD_"));
    });
    await test("process failure remains separate from timeout", async () => {
      const failed = await runSpawned(command("process.stderr.write('fixture failed');process.exit(3)"), { captureOutput: true, timeoutStatus: "timed-out" });
      assert.equal(failed.status, "failed");
      assert.equal(failed.exitCode, 3);
      assert.equal(failed.timedOut, false);
      const text = diagnostics.formatSummary({ report: { results: [failed], summary: { passed: 0, failed: 1, skipped: 0, "timed-out": 0 } }, reportPath: "fixture.json", exitCode: 1 });
      assert(text.includes("fixture failed"));
    });
    await test("timeout cannot pass even with zero exit; ignored SIGTERM is bounded", async () => {
      const code = "process.stdout.write('started');process.on('SIGTERM',()=>process.exit(0));setInterval(()=>{},100);";
      const timed = await runSpawned(command(code, 1000), { captureOutput: true, timeoutStatus: "timed-out" });
      assert.equal(timed.status, "timed-out");
      assert.equal(timed.timedOut, true);
      assert.equal(timed.stdout, "started");
      const stuck = await runSpawned(command("process.on('SIGTERM',()=>{});setInterval(()=>{},100)", 1000), { timeoutStatus: "timed-out" });
      assert.equal(stuck.status, "timed-out");
      assert(stuck.durationMs < 5000);
      const summary = { ...summarizeResults([timed, stuck]), skipped: 0 };
      const text = diagnostics.formatSummary({ report: { results: [timed, stuck], summary }, reportPath: "fixture.json", exitCode: 1 });
      assert(text.includes("passed=0, failed=0, skipped=0, timed-out=2"));
      assert(text.includes("TIMED-OUT fixture"));
    });
    await test("receipt integrity and full payload do not promote unknown run outcome", () => {
      const f = fixture();
      const observed = diagnostics.verifyReceipt(f.entry, logDir);
      assert.equal(observed.sha256, f.artifact.sha256);
      assert.equal(observed.receipt.result.diagnostic, f.receipt.result.diagnostic);
      assert.equal(observed.recordedRunOutcome.execution.status, "unknown");
      assert.equal(observed.verification, "integrity_and_binding_only");
      assert.equal(observed.fresh, false);
      expectCode(() => diagnostics.verifyReceipt({ ...f.entry, sha256: "0".repeat(64) }, logDir), "receipt_expected_hash_mismatch");
      fs.appendFileSync(f.artifact.artifactFile, " ");
      expectCode(() => diagnostics.verifyReceipt(f.entry, logDir), "evidence_hash_mismatch");
    });
    await test("receipt identity and provenance reject tampering even with matching hashes", () => {
      for (const change of [{ runId: crypto.randomUUID() }, { stepIndex: 2 }, { tool: "other" },
        { actionId: "other" }, { projectId: "other" }, { proposalRevision: 99 }, { projectRevision: 99 }]) {
        const f = fixture();
        const body = JSON.stringify({ schema: "ae-agent-step-evidence.v1", ...f.receipt, ...change });
        fs.writeFileSync(f.artifact.artifactFile, body);
        f.record.run.steps[0].evidenceArtifact.sha256 = records.digest(body);
        records.writeRecord(logDir, f.record);
        expectCode(() => diagnostics.verifyReceipt(reference(f.runId, f.record.run.steps[0].evidenceArtifact), logDir), "step_evidence_binding_mismatch");
      }
      const f = fixture();
      fs.unlinkSync(f.artifact.artifactFile);
      expectCode(() => diagnostics.verifyReceipt(f.entry, logDir), "step_evidence_missing");
      json(records.fileFor(logDir, f.runId), { schema: "corrupt" });
      expectCode(() => diagnostics.verifyReceipt(f.entry, logDir), "record_integrity_failed");
    });
    await test("receipt and canonical record changes during full read are rejected", () => {
      for (const target of ["receipt", "record"]) {
        const f = fixture(), original = fs.readFileSync;
        let changed = false;
        try {
          fs.readFileSync = function(file, ...args) {
            if (!changed && String(file) === f.artifact.artifactFile && args.length === 0) {
              changed = true;
              if (target === "receipt") fs.appendFileSync(file, " ");
              else { f.record.run.outcome.execution.status = "failed"; records.writeRecord(logDir, f.record); }
            }
            return original.call(this, file, ...args);
          };
          expectCode(() => diagnostics.verifyReceipt(f.entry, logDir), target === "receipt" ? "receipt_changed_during_read" : "run_record_changed_during_read");
          assert(changed);
        } finally { fs.readFileSync = original; }
      }
    });
    await test("hashes compare raw bytes, including CRLF and spaced Unicode paths", async () => {
      const file = path.join(base, "данные с пробелом.txt"), bytes = Buffer.from("first\r\nsecond🎬\r\n");
      fs.writeFileSync(file, bytes);
      const entry = { path: path.relative(diagnostics.ROOT, file), sha256: records.digest(bytes).toUpperCase() };
      const result = await diagnostics.verifyHash(entry);
      assert.equal(result.bytes, bytes.length);
      assert.equal(result.sha256, records.digest(bytes));
      fs.writeFileSync(file, bytes.toString().replace(/\r\n/g, "\n"));
      await assert.rejects(diagnostics.verifyHash(entry), error => error.code === "file_hash_mismatch");
    });
    await test("path traversal and real symlink/junction escape are rejected", async () => {
      await assert.rejects(diagnostics.verifyHash({ path: "../escape", sha256: "a".repeat(64) }), error => error.code === "path_containment_violation");
      const outside = fs.mkdtempSync(path.join(os.tmpdir(), "ae-diagnostics-outside-"));
      const link = path.join(base, "outside-link");
      try {
        fs.writeFileSync(path.join(outside, "bytes.txt"), "outside");
        fs.symlinkSync(outside, link, process.platform === "win32" ? "junction" : "dir");
        await assert.rejects(diagnostics.verifyHash({ path: path.join(link, "bytes.txt"), sha256: records.digest("outside") }), error => error.code === "path_containment_violation");
      } finally { fs.rmSync(link, { force: true, recursive: true }); fs.rmSync(outside, { recursive: true, force: true }); }
    });
    await test("one run aggregates checks, receipts, hashes and distinct skips", async () => {
      const f = fixture(), file = path.join(base, "aggregate input.json");
      json(file, { receipts: [f.entry, { ...f.entry, sha256: "0".repeat(64) }],
        hashes: [{ path: f.artifact.artifactFile, sha256: f.artifact.sha256 }, { path: "../escape", sha256: "a".repeat(64) }] });
      const result = await run({ checkIds: ["reliability-suite-catalog", "rules"], skipIds: ["rules"], inputFile: file });
      assert.equal(result.exitCode, 1);
      assert.equal(result.report.summary.passed, 3);
      assert.equal(result.report.summary.failed, 2);
      assert.equal(result.report.summary.skipped, 1);
      assert.equal(result.report.summary["timed-out"], 0);
      assert.equal(result.report.completeTaskAcceptance, false);
      const disk = JSON.parse(fs.readFileSync(result.reportPath, "utf8"));
      assert.deepEqual(disk, result.report);
      assert(disk.results[0].stdout.includes('"ok": true'));
      assert(disk.results[2].evidence.receipt.result.diagnostic.length > 12000);
      const text = diagnostics.formatSummary(result);
      assert.equal(text.split("\n").length, 5);
      assert(!text.includes("FULL_RECEIPT_"));
      assert(text.includes("SKIPPED rules"));
      assert(text.includes("receipt_expected_hash_mismatch"));
    });
    await test("CLI works outside cwd, reports invalid input and never silently defaults", () => {
      const failed = cli([]);
      assert.equal(failed.status, 1);
      assert(failed.stdout.includes("explicit_selection_required"));
      assert.equal(failed.stderr, "");
      const skipped = cli(["--checks=rules", "--skip=rules"]);
      assert.equal(skipped.status, 2);
      assert(skipped.stdout.includes("passed=0, failed=0, skipped=1, timed-out=0"));
      const file = path.join(base, "bom input.json");
      fs.writeFileSync(file, '\uFEFF{"hashes":[]}');
      const empty = cli([`--input=${file}`]);
      assert.equal(empty.status, 1);
      assert(empty.stdout.includes("explicit_selection_required"));
      json(file, { hashes: [], command: "forbidden" });
      assert(cli([`--input=${file}`]).stdout.includes("input_fields_invalid"));
      fs.writeFileSync(file, "{broken");
      const malformed = cli([`--input=${file}`]);
      assert.equal(malformed.status, 1);
      assert(malformed.stdout.includes("Report:"));
      const list = cli(["--list"]);
      assert.equal(list.status, 0);
      assert(list.stdout.includes("rules:"));
      assert(!list.stdout.includes("live-cep"));
    });
    console.log(`Diagnostics smoke: ${groups} groups passed (offline).`);
  } finally {
    for (const report of reports) fs.rmSync(report, { force: true });
    fs.rmSync(base, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
