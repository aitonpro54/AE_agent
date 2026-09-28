"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { evaluateAmePassiveStatus } = require("../mcp-server/ame-passive-status");

const now = Date.parse("2026-09-28T11:00:00.000Z");
const job = { schema: "ae-agent-ame-job.v1", jobId: "AME-42", preset: "H.264 20 Mbps",
  outputPath: path.resolve("local", "render.mp4"), range: { startSeconds: 0, endSeconds: 60 },
  submittedAt: "2026-09-28T10:00:00.000Z" };
const file = { exists: true, bytes: 1000, modifiedAt: "2026-09-28T10:59:00.000Z" };
const previous = { job, file: { exists: true, bytes: 500, modifiedAt: "2026-09-28T10:55:00.000Z" },
  checkedAt: "2026-09-28T10:55:00.000Z" };
const observation = { ...job, status: "running", observedAt: "2026-09-28T10:58:00.000Z" };
assert.equal(evaluateAmePassiveStatus(job, null, file, previous, now).state, "output_growing");
assert.equal(evaluateAmePassiveStatus(job, observation, file, previous, now).state, "running");
assert.equal(evaluateAmePassiveStatus(job, { ...observation, status: "done" }, file, previous, now).state, "needs_media_probe");
assert.equal(evaluateAmePassiveStatus(job, { ...observation, status: "done" }, null, previous, now).state, "needs_review");
assert.equal(evaluateAmePassiveStatus(job, { ...observation, jobId: "other" }, file, previous, now).reason, "ame_observation_mismatch");
assert.equal(evaluateAmePassiveStatus(job, null, file, { ...previous, job: { ...job, preset: "other" } }, now).reason, "previous_snapshot_mismatch");
assert.equal(evaluateAmePassiveStatus({ ...job, range: { startSeconds: 60, endSeconds: 0 } }, null, file, null, now).reason, "invalid_job_contract");
assert.equal(evaluateAmePassiveStatus(job, null, file, previous, now).completionVerified, false);
assert.equal(evaluateAmePassiveStatus(job, null, { ...file, bytes: 100 }, previous, now).state, "needs_review");
assert.equal(evaluateAmePassiveStatus(job, null, { ...file, modifiedAt: "2026-09-28T09:00:00.000Z" }, previous, now).reason, "stale_output_file");
assert.equal(evaluateAmePassiveStatus(job, { ...observation, observedAt: "2026-09-28T10:01:00.000Z" }, file, null, now).state, "unknown");
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "ae-agent-ame-passive-"));
try {
  const localJob = { ...job, outputPath: path.join(scratch, "render.mp4"), submittedAt: "2020-01-01T00:00:00.000Z" };
  const jobFile = path.join(scratch, "job.json");
  fs.writeFileSync(jobFile, JSON.stringify(localJob));
  fs.writeFileSync(localJob.outputPath, Buffer.alloc(64));
  const run = spawnSync(process.execPath, [path.join(__dirname, "ame-passive-status.js"), "--job", jobFile], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  const result = JSON.parse(run.stdout);
  assert.equal(result.state, "unknown");
  assert.equal(result.file.bytes, 64);
  assert.equal(result.completionVerified, false);
} finally {
  const tempRoot = path.resolve(os.tmpdir()) + path.sep;
  assert.ok(path.resolve(scratch).startsWith(tempRoot));
  fs.rmSync(scratch, { recursive: true, force: true });
}
console.log(JSON.stringify({ ok: true, checks: "bound AME job/status/file snapshots; growth and reported done never claim completion" }));
