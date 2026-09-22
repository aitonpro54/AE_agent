"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const MANIFEST = "config/frozen-intake-manifest.json";
const LOCK = "config/frozen-intake-manifest.sha256";
const ROOTS = ["orchestrator", "scripts/full-intake-runtime-cleanup.js", "scripts/sdk-generic-repo-full-intake-smoke.js", "scripts/sdk-generic-repo-importer-command-smoke.js", "scripts/sdk-generic-repo-queue-supervisor-smoke.js"];
const EXCEPTIONS = ["orchestrator/bounded-process-result.cjs"];
function hash(content) {
  return crypto.createHash("sha256").update(content.toString("utf8").replace(/\r\n/g, "\n")).digest("hex");
}
function inventory(root) {
  const result = {};
  function walk(relative) {
    if (EXCEPTIONS.includes(relative)) return;
    const absolute = path.join(root, relative);
    if (!fs.existsSync(absolute)) return;
    const stat = fs.lstatSync(absolute);
    if (stat.isSymbolicLink()) throw new Error(`Frozen symlink denied: ${relative}`);
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(absolute).sort()) walk(`${relative}/${name}`);
    } else result[relative] = hash(fs.readFileSync(absolute));
  }
  ROOTS.forEach(walk);
  return result;
}
function verify(root = path.resolve(__dirname, "..")) {
  const text = fs.readFileSync(path.join(root, MANIFEST));
  if (hash(text) !== fs.readFileSync(path.join(root, LOCK), "utf8").trim()) throw new Error("Frozen manifest lock mismatch; reviewed thaw required.");
  const manifest = JSON.parse(text);
  if (manifest.schema !== "ae-agent.frozen-intake.v1" || JSON.stringify(manifest.roots) !== JSON.stringify(ROOTS) || JSON.stringify(manifest.exceptions) !== JSON.stringify(EXCEPTIONS)) throw new Error("Frozen boundary schema/scope mismatch.");
  const actual = inventory(root);
  const changed = [...new Set([...Object.keys(manifest.files), ...Object.keys(actual)])].filter((name) => manifest.files[name] !== actual[name]);
  if (changed.length) throw new Error(`Frozen integrity mismatch: ${changed.join(", ")}`);
  return { ok: true, files: Object.keys(actual).length, normalization: "UTF-8 CRLF to LF" };
}
if (require.main === module) {
  if (process.argv.length > 2) throw new Error("Guard is read-only; no baseline update arguments are supported.");
  console.log(JSON.stringify(verify()));
}
module.exports = { verify, inventory, hash, ROOTS, EXCEPTIONS, MANIFEST, LOCK };
