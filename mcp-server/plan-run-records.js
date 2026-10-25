"use strict";
// Ordinary runner evidence lives beside existing step artifacts. It is never an execution authority.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const LIMIT = 16 * 1024 * 1024;
// Descriptive evidence only. No runtime/admission code may use this as authority.
const CONTEXT_SCHEMA = "ae-agent.record-context.v1";
const LIFETIMES = Object.freeze({user_work:"work_context",development:"product_change",technical_check:"ephemeral_check"});
function recordContext(input, binding) {
  const value = input === undefined ? {purpose:"user_work",contextId:binding.runId,resources:[]} : input;
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(k=>!["purpose","contextId","resources"].includes(k)) ||
      !Object.hasOwn(LIFETIMES,value.purpose) || typeof value.contextId!=="string" || !value.contextId || value.contextId.length>256 ||
      !Array.isArray(value.resources) || value.resources.length>64 || value.resources.some(r=>!r || typeof r!=="object" || Array.isArray(r) ||
        Object.keys(r).sort().join(",")!=="identity,kind" || !["project","output","job","native_process"].includes(r.kind) || typeof r.identity!=="string" || !r.identity || r.identity.length>4096)) {
    throw Object.assign(new Error("record_context_invalid"),{code:"record_context_invalid"});
  }
  return {schema:CONTEXT_SCHEMA,purpose:value.purpose,lifetime:LIFETIMES[value.purpose],contextId:value.contextId,
    project:{file:binding.projectFile || null},resources:JSON.parse(JSON.stringify(value.resources))};
}
function contextClassification(record) {
  // Historical records stay unclassified; cwd, IDs and old outcomes are not purpose evidence.
  if (!record || !Object.hasOwn(record,"recordContext")) return {purpose:"unclassified",lifetime:"unclassified"};
  const c=record.recordContext;
  if (!c || c.schema!==CONTEXT_SCHEMA || Object.keys(c).sort().join(",")!=="contextId,lifetime,project,purpose,resources,schema" ||
      !c.project || Object.keys(c.project).join(",")!=="file" || c.project.file!==null && typeof c.project.file!=="string") throw new Error("record_context_invalid");
  const expected=recordContext({purpose:c.purpose,contextId:c.contextId,resources:c.resources},{runId:record.runId,projectFile:c.project.file});
  if (expected.lifetime!==c.lifetime || c.project.file!==(record.project && record.project.file || null)) throw new Error("record_context_invalid");
  return expected;
}
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
  contextClassification(record);
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
    contextClassification(record);
    return record;
  } catch (error) {
    if (options && options.throwOnError) {
      const code = error.code === "path_containment_violation" ? error.code : error.code === "ENOENT" ? "run_record_missing" : (error.message === "record_integrity_failed" ? "record_integrity_failed" : (error.message === "record_budget_exceeded" ? "record_budget_exceeded" : "run_record_invalid"));
      throw Object.assign(new Error(code), {code});
    }
    return {schema:"ae-agent-plan-run-record.v1",runId:id,unavailable:true,reasonCode:error.code === "ENOENT" ? "run_record_missing" : "run_record_invalid"};
  }
}
module.exports = {writeRecord, readRecord, fileFor, digest, ID, LIMIT, containedFile, recordContext, contextClassification};
