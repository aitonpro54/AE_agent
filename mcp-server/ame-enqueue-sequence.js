"use strict";
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const jobs = require("./ame-title-jobs"), running = require("./ame-running"), protocol = require("./m100-protocol");
const sharedQueue = require("./ame-shared-queue-grant");
const PREPARE = "prepare_ame_title_enqueue", CONTINUE = "continue_ame_title_enqueue", SCHEMA = "ae-agent-ame-enqueue-sequence.v1";
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const hash = value => crypto.createHash("sha256").update(protocol.stableStringify(value)).digest("hex");
function fail(code) { throw Object.assign(Error(code), { code }); }
function object(value, keys) { if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(k => !keys.includes(k))) fail("ame_enqueue_sequence_invalid_input"); }
function validateInput(name, raw) {
  object(raw, name === PREPARE ? ["stageId", "targetProjectFile", "enqueue", "ensure"] : ["stageId", "ensureRunId"]);
  if (!UUID.test(raw.stageId || "")) fail("ame_enqueue_sequence_stage_id_required");
  if (name === CONTINUE) { if (!UUID.test(raw.ensureRunId || "")) fail("ame_enqueue_sequence_run_id_required"); return { stageId: raw.stageId, ensureRunId: raw.ensureRunId }; }
  if (name !== PREPARE || !path.isAbsolute(raw.targetProjectFile || "") || path.extname(raw.targetProjectFile).toLowerCase() !== ".aep") fail("ame_enqueue_sequence_project_required");
  // Validate through the production enqueue parser, while denying caller pins.
  object(raw.enqueue, ["sourceProjectFile", "expectedSourceSha25664", "batchId", "sourceGuid", "presetId", "presetSha25664", "outputFileName", "range", "queueMode", "timeoutMs", "enqueueTransport"]);
  const parsed = jobs.validateInput(jobs.ENQUEUE, { ...raw.enqueue, queueMode: raw.enqueue.queueMode === undefined ? sharedQueue.MODE : raw.enqueue.queueMode, targetSpecifier: "ame-1.0", expectedProcess: { pid: 1, startedAt: "2000-01-01T00:00:00.000Z" } });
  delete parsed.targetSpecifier; delete parsed.expectedProcess;
  const ensure = running.validateInput(raw.ensure || {});
  // Keep exactly the executable public input; normalized null optionals are not tool arguments.
  const publicEnsure = Object.fromEntries(Object.entries(ensure).filter(([, value]) => value !== null));
  return { stageId: raw.stageId, targetProjectFile: raw.targetProjectFile, enqueue: parsed, ensure: publicEnsure };
}
function plan(file, tool, args) { return { targetProject: { file }, steps: [{ tool, args: { ...args, verifyAfter: true } }] }; }
function write(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); const fd = fs.openSync(file, "wx"); try { fs.writeFileSync(fd, JSON.stringify(value)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); } }
function createSequence(deps) {
  if (!path.isAbsolute(deps.stateDir || "") || ["readRunRecord", "inspectProcesses", "inspectTransport"].some(k => typeof deps[k] !== "function")) fail("ame_enqueue_sequence_dependencies_required");
  const now = deps.now || Date.now, fileFor = id => path.join(deps.stateDir, id + ".json");
  function load(id) { const envelope = JSON.parse(fs.readFileSync(fileFor(id), "utf8")); if (envelope.schema !== SCHEMA || envelope.sha256 !== hash(envelope.intent)) fail("ame_enqueue_sequence_intent_changed"); return envelope.intent; }
  async function execute(name, raw) {
    const a = validateInput(name, raw);
    if (name === PREPARE) {
      const intent = { ...a, preparedAt: new Date(now()).toISOString() };
      try { write(fileFor(a.stageId), { schema: SCHEMA, sha256: hash(intent), intent }); }
      catch (error) { if (error.code !== "EEXIST") throw error; const prior = load(a.stageId); if (hash({ ...prior, preparedAt: null }) !== hash({ ...intent, preparedAt: null })) fail("ame_enqueue_sequence_stage_reused"); }
      const stored = load(a.stageId);
      return { schema: SCHEMA, ok: true, stageId: a.stageId, phase: "ensure_requires_proposal", executionAuthority: false,
        plan: plan(stored.targetProjectFile, running.TOOL_NAME, stored.ensure), nextTool: CONTINUE,
        nextArgs: { stageId: a.stageId }, requiredRunId: "completed independently verified ensure run" };
    }
    const intent = load(a.stageId), record = deps.readRunRecord(a.ensureRunId), run = record?.run, step = run?.steps?.[0];
    const wanted = plan(intent.targetProjectFile, running.TOOL_NAME, intent.ensure);
    if (!record || record.unavailable || record.runId !== a.ensureRunId || run?.id !== a.ensureRunId || run.dryRun !== false || run.ok !== true || run.semanticVerification?.status !== "passed" || run.semanticVerification?.ok !== true || run.semanticVerification?.unverifiedMutationCount !== 0 ||
        run.steps?.length !== 1 || step?.tool !== running.TOOL_NAME || step.status !== "completed" || hash(running.validateInput(step.args || {})) !== hash(running.validateInput(intent.ensure)) ||
        hash(running.validateInput(record.plan?.steps?.[0]?.args || {})) !== hash(running.validateInput(intent.ensure)) || record.plan?.steps?.length !== 1 || record.plan.steps[0].tool !== running.TOOL_NAME ||
        record.plan?.targetProject?.file !== wanted.targetProject.file || !Number.isFinite(Date.parse(run.startedAt)) || Date.parse(run.startedAt) < Date.parse(intent.preparedAt) || !Number.isFinite(Date.parse(run.finishedAt)) || typeof run.provenance?.actionId !== "string" || !run.provenance.actionId) fail("ame_enqueue_sequence_verified_ensure_required");
    const payload = step.result, verification = payload?.verification, reads = step.independentReadBack;
    if (payload?.authorization?.runId !== run.id || payload.authorization.proposalId !== run.provenance?.actionId || verification?.ok !== true || verification.scope !== "ame_process_and_read_transport_only" ||
        !Array.isArray(reads) || reads.length !== 1 || reads[0].tool !== "inspect_ame_transport" || reads[0].source !== "server_typed_readback" || reads[0].status !== "completed" ||
        hash(reads[0].args) !== hash(running.inspectionArgs(payload)) || !running.verifyReadBack(payload, reads[0].result, verification.before, verification.after)) fail("ame_enqueue_sequence_independent_readback_required");
    // Server records are evidence, never dispatch rights. Fresh pin and another
    // ordinary proposal/dry-run are still mandatory after continuation.
    const before = await deps.inspectProcesses(), read = await deps.inspectTransport(running.inspectionArgs(payload)), after = await deps.inspectProcesses();
    if (!running.verifyReadBack(payload, read, before, after) || read.ame?.sessionNonce !== payload.sessionNonce) fail("ame_enqueue_sequence_readiness_changed");
    const args = jobs.validateInput(jobs.ENQUEUE, { ...intent.enqueue, targetSpecifier: payload.installation.targetSpecifier,
      expectedProcess: { pid: payload.process.pid, startedAt: payload.process.startedAt }, expectedSessionNonce: payload.sessionNonce });
    // Persist the first exact continuation. A later different ensure/process may
    // not turn the same stage into a different enqueue intent.
    const continuation = { ensureRunId: a.ensureRunId, args }, continuationFile = fileFor(a.stageId) + ".ready";
    try { write(continuationFile, continuation); }
    catch (error) { if (error.code !== "EEXIST") throw error; if (hash(JSON.parse(fs.readFileSync(continuationFile, "utf8"))) !== hash(continuation)) fail("ame_enqueue_sequence_continuation_changed"); }
    return { schema: SCHEMA, ok: true, stageId: a.stageId, phase: "enqueue_requires_proposal", executionAuthority: false,
      plan: plan(intent.targetProjectFile, jobs.ENQUEUE, args), startupRunId: a.ensureRunId, nativeAssociationVerified: false, mediaVerified: false };
  }
  return { execute };
}
const enqueueFields = { ...jobs.tools.find(t => t.name === jobs.ENQUEUE).inputSchema.properties };
for (const key of ["targetSpecifier", "expectedProcess", "expectedSessionNonce"]) delete enqueueFields[key];
const tools = [
  { name: PREPARE, description: "Prepare one immutable title enqueue sequence. Returns an isolated ensure_ame_running plan; propose/dry-run/execute it, then call continue with its actual runId. No app launch or enqueue occurs here.", inputSchema: { type: "object", additionalProperties: false, required: ["stageId", "targetProjectFile", "enqueue"], properties: { stageId: { type: "string", pattern: UUID.source }, targetProjectFile: { type: "string" }, ensure: running.tool.inputSchema, enqueue: { type: "object", additionalProperties: false, properties: enqueueFields, required: ["sourceProjectFile", "expectedSourceSha25664", "batchId", "sourceGuid", "presetId", "presetSha25664", "outputFileName", "range"] } } } },
  { name: CONTINUE, description: "Continue a saved enqueue stage from an actual server-stored successful ensure run and independent transport readback. Fresh exact process/session readiness returns the existing one-step enqueue plan for separate proposal/dry-run/authorization. Refused or UNKNOWN ensure never submits or relaunches.", inputSchema: { type: "object", additionalProperties: false, required: ["stageId", "ensureRunId"], properties: { stageId: { type: "string", pattern: UUID.source }, ensureRunId: { type: "string", pattern: UUID.source } } } }
].map(t => ({ ...t, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: false, openWorldHint: false } }));
module.exports = { PREPARE, CONTINUE, SCHEMA, tools, validateInput, createSequence };
