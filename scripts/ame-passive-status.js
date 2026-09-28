"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { evaluateAmePassiveStatus } = require("../mcp-server/ame-passive-status");

function option(args, name) {
  const index = args.indexOf(name);
  if (index < 0) return null;
  if (index + 1 >= args.length || args[index + 1].startsWith("--")) throw new Error(`${name} requires a file path.`);
  return args[index + 1];
}

function readJson(file) { return file ? JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "")) : null; }

function fileEvidence(outputPath) {
  try {
    const stat = fs.statSync(outputPath);
    return stat.isFile() ? { exists: true, bytes: stat.size, modifiedAt: stat.mtime.toISOString() } : { exists: false };
  } catch (error) {
    if (error.code === "ENOENT") return { exists: false };
    throw error;
  }
}

function main(args) {
  const allowed = new Set(["--job", "--observation", "--previous"]);
  if (args.length % 2 !== 0 || args.some((arg, index) => index % 2 === 0 && !allowed.has(arg))
    || new Set(args.filter((_arg, index) => index % 2 === 0)).size !== args.length / 2) {
    throw new Error("Use each of --job, --observation and --previous at most once with a file path.");
  }
  const jobFile = option(args, "--job");
  if (!jobFile) throw new Error("Usage: report:ame-output -- --job JOB.json [--observation AME.json] [--previous SNAPSHOT.json]");
  const job = readJson(jobFile);
  const observation = readJson(option(args, "--observation"));
  const previous = readJson(option(args, "--previous"));
  const file = job && typeof job.outputPath === "string" && path.isAbsolute(job.outputPath)
    ? fileEvidence(job.outputPath) : null;
  const result = evaluateAmePassiveStatus(job, observation, file, previous);
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (!result.ok) process.exitCode = 2;
}

if (require.main === module) {
  try { main(process.argv.slice(2)); }
  catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}

module.exports = { main };
