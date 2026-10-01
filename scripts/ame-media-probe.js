"use strict";

const fs = require("node:fs");
const { spawnSync } = require("node:child_process");
const { evaluateAmePassiveStatus } = require("../mcp-server/ame-passive-status");
const { validateAmeMedia } = require("../mcp-server/ame-media-probe");

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
const run = (program, args, timeout) => spawnSync(program, args, {
  encoding: "utf8", timeout, maxBuffer: 1024 * 1024, windowsHide: true
});

function main(args) {
  if (args.length !== 4 || args[0] !== "--job" || args[2] !== "--observation") {
    throw new Error("Usage: report:ame-media -- --job JOB.json --observation AME-DONE.json");
  }
  const job = readJson(args[1]);
  const observation = readJson(args[3]);
  let file = { exists: false };
  if (job && typeof job.outputPath === "string") {
    try {
      const stat = fs.statSync(job.outputPath);
      if (stat.isFile()) file = { exists: true, bytes: stat.size, modifiedAt: stat.mtime.toISOString() };
    } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  const passive = evaluateAmePassiveStatus(job, observation, file, null);
  if (!passive.ok || passive.state !== "needs_media_probe") {
    const result = { ...passive, technicalMediaVerified: false, completionVerified: false };
    process.stdout.write(`${JSON.stringify(result)}\n`);
    process.exitCode = 2;
    return;
  }
  const probed = run("ffprobe", ["-v", "error", "-show_entries", "format=duration,format_name:stream=codec_type,codec_name",
    "-of", "json", job.outputPath], 30000);
  if (probed.error || probed.status !== 0) {
    process.stdout.write(`${JSON.stringify({ ...passive, technicalMediaVerified: false,
      completionVerified: false, reason: probed.error ? "ffprobe_unavailable_or_timeout" : "ffprobe_failed" })}\n`);
    process.exitCode = 2;
    return;
  }
  let metadata;
  try { metadata = JSON.parse(probed.stdout); }
  catch (_error) { metadata = null; }
  const precheck = validateAmeMedia(job, metadata, { status: 0 });
  if (!precheck.technicalMediaVerified) {
    process.stdout.write(`${JSON.stringify({ ...passive, ...precheck, completionVerified: false })}\n`);
    process.exitCode = 2;
    return;
  }
  const decoded = run("ffmpeg", ["-nostdin", "-v", "error", "-xerror", "-i", job.outputPath,
    "-map", "0:v:0", "-map", "0:a?", "-f", "null", "-"], 120000);
  const result = validateAmeMedia(job, metadata, decoded);
  process.stdout.write(`${JSON.stringify({ ...passive, ...result, completionVerified: false })}\n`);
  if (!result.technicalMediaVerified) process.exitCode = 2;
}

if (require.main === module) {
  try { main(process.argv.slice(2)); }
  catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}

module.exports = { main };
