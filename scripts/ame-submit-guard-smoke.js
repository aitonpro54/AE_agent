"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { inspectSubmissionIntent, reserveSubmissionIntent } = require("../mcp-server/ame-submit-guard");

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "ae-agent-ame-guard-"));
const stateDir = path.join(scratch, "state");
const intent = { schema: "ae-agent-ame-submit-intent.v1", sourcePath: path.join(scratch, "source.aep"),
  sourceIdentity: "comp-guid-1", preset: "H.264 20 Mbps", outputPath: path.join(scratch, "output.mp4"),
  range: { startSeconds: 0, endSeconds: 60 } };

function runCli(action, file) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(__dirname, "ame-submit-guard.js"), action,
      "--intent", file, "--state-dir", stateDir], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (part) => { stdout += part; });
    child.stderr.on("data", (part) => { stderr += part; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, result: stdout ? JSON.parse(stdout) : null, stderr }));
  });
}

async function main() {
  try {
    assert.deepEqual(inspectSubmissionIntent(intent, stateDir), { ok: true, blocked: false, reason: "unreserved" });
    assert.equal(reserveSubmissionIntent({ ...intent, range: { startSeconds: 60, endSeconds: 0 } }, stateDir).reason, "invalid_intent_or_state_dir");
    const first = reserveSubmissionIntent(intent, stateDir);
    assert.equal(first.reason, "reserved_unknown_outcome");
    assert.equal(inspectSubmissionIntent(intent, stateDir).reason, "duplicate_submit_blocked");
    assert.equal(reserveSubmissionIntent({ ...intent, outputPath: intent.outputPath.toUpperCase() }, stateDir).reason, "duplicate_submit_blocked");
    assert.equal(reserveSubmissionIntent({ ...intent, preset: "Another preset" }, stateDir).reason, "destination_reserved_different_intent");
    const recordFile = path.join(stateDir, fs.readdirSync(stateDir)[0]);
    const record = JSON.parse(fs.readFileSync(recordFile, "utf8"));
    assert.equal(record.state, "unknown_outcome");
    assert.equal(Object.hasOwn(record, "jobId"), false);
    assert.equal(record.attemptId, first.attemptId);
    fs.writeFileSync(recordFile, "{broken", "utf8");
    assert.equal(reserveSubmissionIntent(intent, stateDir).reason, "unreadable_reservation");
    const raceIntent = { ...intent, outputPath: path.join(scratch, "race.mp4") };
    const intentFile = path.join(scratch, "intent.json");
    fs.writeFileSync(intentFile, JSON.stringify(raceIntent));
    const results = await Promise.all([runCli("reserve", intentFile), runCli("reserve", intentFile)]);
    assert.deepEqual(results.map((row) => row.code).sort(), [0, 2]);
    assert.equal(results.find((row) => row.code === 0).result.reason, "reserved_unknown_outcome");
    assert.equal(results.find((row) => row.code === 2).result.reason, "duplicate_submit_blocked");
    const afterRestart = await runCli("inspect", intentFile);
    assert.equal(afterRestart.code, 2);
    assert.equal(afterRestart.result.reason, "duplicate_submit_blocked");
    console.log(JSON.stringify({ ok: true, checks: "atomic reservation, path collision, corrupt record fail closed, cross-process unknown persistence; no AME submit" }));
  } finally {
    const tempRoot = path.resolve(os.tmpdir()) + path.sep;
    assert.ok(path.resolve(scratch).startsWith(tempRoot));
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
