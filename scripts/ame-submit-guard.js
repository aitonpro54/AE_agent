"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { inspectSubmissionIntent, reserveSubmissionIntent } = require("../mcp-server/ame-submit-guard");

function option(name) {
  const at = process.argv.indexOf(name);
  return at >= 0 ? process.argv[at + 1] : null;
}

function main() {
  const action = process.argv[2];
  const intentFile = option("--intent");
  const stateDir = option("--state-dir") || path.join(__dirname, "..", ".codex-runtime", "ame-submit-guard");
  if (!["inspect", "reserve"].includes(action) || !intentFile || !path.isAbsolute(intentFile) || !path.isAbsolute(stateDir)) {
    throw new Error("Usage: node scripts/ame-submit-guard.js inspect|reserve --intent ABSOLUTE_JSON [--state-dir ABSOLUTE_DIR]");
  }
  const stat = fs.statSync(intentFile);
  if (!stat.isFile() || stat.size > 16 * 1024) throw new Error("Invalid intent file");
  const intent = JSON.parse(fs.readFileSync(intentFile, "utf8"));
  const result = action === "reserve" ? reserveSubmissionIntent(intent, stateDir) : inspectSubmissionIntent(intent, stateDir);
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exitCode = result.ok && !result.blocked ? 0 : result.blocked ? 2 : 1;
}

try { main(); } catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
