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
function writeRecord(root, record) {
  const file = fileFor(root, record.runId);
  const json = JSON.stringify(record);
  if (Buffer.byteLength(json) > LIMIT) throw new Error("plan_run_record_budget_exceeded");
  const envelope = JSON.stringify({schema:"ae-agent-plan-run-record-envelope.v1", sha256:digest(json), record:JSON.parse(json)});
  fs.mkdirSync(path.dirname(file), {recursive:true});
  const temporary = file + "." + crypto.randomUUID() + ".tmp";
  try {
    const fd = fs.openSync(temporary, "wx");
    try { fs.writeFileSync(fd, envelope, "utf8"); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(temporary, file);
  } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
  return {file, sha256:digest(json)};
}
function readRecord(root, id) {
  const file = fileFor(root, id);
  try {
    if (fs.statSync(file).size > LIMIT + 1024) throw new Error("record_budget_exceeded");
    const envelope = JSON.parse(fs.readFileSync(file, "utf8"));
    const record = envelope.record;
    if (envelope.schema !== "ae-agent-plan-run-record-envelope.v1" || !record ||
        record.schema !== "ae-agent-plan-run-record.v1" || record.runId !== id ||
        !record.plan || !record.run || digest(JSON.stringify(record)) !== envelope.sha256) throw new Error("record_integrity_failed");
    return record;
  } catch (error) {
    return {schema:"ae-agent-plan-run-record.v1",runId:id,unavailable:true,reasonCode:error.code === "ENOENT" ? "run_record_missing" : "run_record_invalid"};
  }
}
module.exports = {writeRecord, readRecord, fileFor};
