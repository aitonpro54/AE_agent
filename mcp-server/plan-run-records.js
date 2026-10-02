"use strict";
// Ordinary runner evidence lives beside existing step artifacts. It is never an execution authority.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const LIMIT = 16 * 1024 * 1024;
function fileFor(root, id) {
  if (!ID.test(String(id || ""))) throw Object.assign(new Error("plan_run_id_invalid"), {code:"plan_run_id_invalid"});
  return path.join(root, "evidence", "plan-runs", id + ".json");
}
function digest(text) { return crypto.createHash("sha256").update(text).digest("hex"); }
function containedFile(root, file) {
  const trusted = fs.realpathSync(root);
  const resolved = fs.realpathSync(file);
  const relative = path.relative(trusted, resolved);
  if (relative === ".." || relative.startsWith(".." + path.sep) || path.isAbsolute(relative)) {
    throw Object.assign(new Error("path_containment_violation"), {code:"path_containment_violation"});
  }
  return resolved;
}
function writeRecord(root, record) {
  const file = fileFor(root, record.runId);
  const json = JSON.stringify(record);
  if (Buffer.byteLength(json) > LIMIT) throw new Error("plan_run_record_budget_exceeded");
  const envelope = JSON.stringify({schema:"ae-agent-plan-run-record-envelope.v1", sha256:digest(json), record:JSON.parse(json)});
  fs.mkdirSync(path.dirname(file), {recursive:true});
  containedFile(root, path.dirname(file));
  if (fs.existsSync(file)) containedFile(root, file);
  const temporary = file + "." + crypto.randomUUID() + ".tmp";
  try {
    const fd = fs.openSync(temporary, "wx");
    try { fs.writeFileSync(fd, envelope, "utf8"); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(temporary, file);
  } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
  return {file, sha256:digest(json)};
}
function readRecord(root, id, options = {}) {
  const file = fileFor(root, id);
  try {
    const realFile = containedFile(root, file);
    if (!fs.statSync(realFile).isFile() || fs.statSync(realFile).size > LIMIT + 1024) throw new Error("record_budget_exceeded");
    const envelope = JSON.parse(fs.readFileSync(realFile, "utf8"));
    const record = envelope.record;
    if (envelope.schema !== "ae-agent-plan-run-record-envelope.v1" || !record ||
        record.schema !== "ae-agent-plan-run-record.v1" || record.runId !== id ||
        !record.plan || !record.run || record.run.id !== id || digest(JSON.stringify(record)) !== envelope.sha256) throw new Error("record_integrity_failed");
    return record;
  } catch (error) {
    if (options && options.throwOnError) {
      const code = error.code === "path_containment_violation" ? error.code : error.code === "ENOENT" ? "run_record_missing" : (error.message === "record_integrity_failed" ? "record_integrity_failed" : (error.message === "record_budget_exceeded" ? "record_budget_exceeded" : "run_record_invalid"));
      throw Object.assign(new Error(code), {code});
    }
    return {schema:"ae-agent-plan-run-record.v1",runId:id,unavailable:true,reasonCode:error.code === "ENOENT" ? "run_record_missing" : "run_record_invalid"};
  }
}
module.exports = {writeRecord, readRecord, fileFor, digest, ID, LIMIT, containedFile};
