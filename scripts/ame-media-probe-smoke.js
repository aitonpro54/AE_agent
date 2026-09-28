"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { validateAmeMedia } = require("../mcp-server/ame-media-probe");
const job = { range: { startSeconds: 0, endSeconds: 60 }, expectedVideoCodec: "h264", expectedContainer: "mp4" };
const metadata = { format: { duration: "60.013", format_name: "mov,mp4,m4a,3gp,3g2,mj2" },
  streams: [{ codec_type: "video", codec_name: "h264" }] };
assert.equal(validateAmeMedia(job, metadata, { status: 0 }).technicalMediaVerified, true);
assert.equal(validateAmeMedia(job, { ...metadata, streams: [{ codec_type: "video", codec_name: "hevc" }] }, { status: 0 }).reason, "video_codec_mismatch");
assert.equal(validateAmeMedia(job, { ...metadata, format: { ...metadata.format, duration: "59.5" } }, { status: 0 }).reason, "duration_mismatch");
assert.equal(validateAmeMedia(job, metadata, { status: 1 }).reason, "decode_failed");
assert.equal(validateAmeMedia({ ...job, expectedVideoCodec: undefined }, metadata, { status: 0 }).reason, "expected_codec_required");
assert.equal(validateAmeMedia({ ...job, expectedContainer: undefined }, metadata, { status: 0 }).reason, "expected_container_required");
assert.equal(validateAmeMedia({ ...job, expectedContainer: "matroska" }, metadata, { status: 0 }).reason, "container_mismatch");
assert.equal(validateAmeMedia({ ...job, maxDurationErrorSeconds: 2 }, metadata, { status: 0 }).reason, "invalid_duration_tolerance");
const available = spawnSync("ffmpeg", ["-version"], { encoding: "utf8", timeout: 5000, windowsHide: true });
let realFixture = false;
if (available.status === 0) {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "ae-agent-ame-media-"));
  try {
    const outputPath = path.join(scratch, "synthetic.mp4");
    const made = spawnSync("ffmpeg", ["-nostdin", "-v", "error", "-f", "lavfi", "-i",
      "color=c=black:s=64x64:r=30", "-t", "1", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-y", outputPath],
    { encoding: "utf8", timeout: 30000, windowsHide: true });
    assert.equal(made.status, 0, made.stderr);
    const fullJob = { schema: "ae-agent-ame-job.v1", jobId: "fixture-job", preset: "H.264",
      outputPath, range: { startSeconds: 0, endSeconds: 1 }, expectedVideoCodec: "h264", expectedContainer: "mp4",
      submittedAt: new Date(Date.now() - 60000).toISOString() };
    const observation = { ...fullJob, status: "done", observedAt: new Date().toISOString() };
    const jobFile = path.join(scratch, "job.json");
    const statusFile = path.join(scratch, "status.json");
    fs.writeFileSync(jobFile, JSON.stringify(fullJob));
    fs.writeFileSync(statusFile, JSON.stringify(observation));
    const checked = spawnSync(process.execPath, [path.join(__dirname, "ame-media-probe.js"),
      "--job", jobFile, "--observation", statusFile], { encoding: "utf8", timeout: 30000, windowsHide: true });
    assert.equal(checked.status, 0, checked.stderr || checked.stdout);
    const result = JSON.parse(checked.stdout);
    assert.equal(result.technicalMediaVerified, true);
    assert.equal(result.completionVerified, false);
    realFixture = true;
  } finally {
    assert.ok(path.resolve(scratch).startsWith(path.resolve(os.tmpdir()) + path.sep));
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}
console.log(JSON.stringify({ ok: true, realFixture,
  checks: "video codec, container, bounded duration and full decode required for technical media proof" }));
