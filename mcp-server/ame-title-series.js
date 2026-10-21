"use strict";
// Private lifetime of one bounded enqueue series. Saved JSON is evidence only:
// a reloaded session cannot acquire this process-local ownership brand.
const crypto = require("node:crypto");
const pending = require("./ame-title-pending");
const hash = value => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const samePath = (a, b) => String(a || "").replace(/\\/g, "/").toLowerCase() === String(b || "").replace(/\\/g, "/").toLowerCase();
function fail(code) { throw Object.assign(Error(code), { code }); }
function select(plan) {
  const steps = plan?.steps;
  if (!Array.isArray(steps) || steps.length !== 1 || steps[0].tool !== "enqueue_ame_title_variant") return null;
  const a = require("./ame-title-jobs").validateInput(steps[0].tool, steps[0].args);
  return a.pendingGroupSize === undefined ? null : a;
}
function common(a, actor) {
  if (!actor || !actor.instanceId || !actor.panelConnectionId || !actor.panelGeneration || !Number.isSafeInteger(actor.lifecycleEpoch) || !actor.sessionHash) fail("ame_title_series_current_actor_required");
  return { groupId: a.pendingGroupId, size: a.pendingGroupSize, source: a.sourceProjectFile, sourceSha25664: a.expectedSourceSha25664,
    target: a.targetSpecifier, process: a.expectedProcess, session: a.expectedSessionNonce, presetId: a.presetId, presetSha25664: a.presetSha25664,
    pauseRequestId: a.pauseRequestId || null, actor };
}
function createSeries(deps = {}) {
  const now = deps.now || Date.now, owned = new WeakMap(), closed = new Set();
  function assert(session, a, actor) {
    const row = session && owned.get(session);
    if (!row || session.status !== "active" || session.id !== row.sessionId || session.ameTitleSeries?.binding !== row.binding ||
        hash(common(a, actor)) !== row.binding || !samePath(session.checkpoint?.sourceFile, a.sourceProjectFile)) fail("ame_title_series_ownership_or_pins_changed");
    if (now() < row.createdAt || now() >= row.deadline || row.sealed) fail("ame_title_series_expired_or_closed");
    return row;
  }
  function preflight(session, plan, actor) {
    const a = select(plan);
    if (session?.ameTitleSeries) { if (!a) fail("ame_title_series_foreign_plan"); assert(session, a, actor); }
    else if (a && session) fail("ame_title_series_foreign_edit_session");
    if (a && closed.has(a.pendingGroupId)) fail("ame_title_series_closed_no_replay");
    if (a) common(a, actor);
    return a;
  }
  function begin(session, a, actor) {
    if (!session || session.ameTitleSeries || owned.has(session) || closed.has(a.pendingGroupId) || !samePath(session.checkpoint?.sourceFile, a.sourceProjectFile)) fail("ame_title_series_owned_checkpoint_required");
    const createdAt = now(), binding = hash(common(a, actor));
    const row = { sessionId: session.id, groupId: a.pendingGroupId, size: a.pendingGroupSize, binding, createdAt, deadline: createdAt + pending.GROUP_BUDGET_MS, members: [], sealed: false };
    owned.set(session, row); session.ameTitleSeries = { schema: "ae-agent-ame-title-series.v1", binding, groupId: row.groupId, size: row.size, createdAt, deadline: row.deadline };
    return session.ameTitleSeries;
  }
  function reserve(session, a, actor, runId) {
    const row = assert(session, a, actor);
    if (row.members.length >= row.size || row.members.some(m => m.batchId === a.batchId || m.sourceGuid === a.sourceGuid || m.outputFileName === a.outputFileName || m.runId === runId)) fail("ame_title_series_member_reused_or_bound");
    row.members.push({ batchId: a.batchId, sourceGuid: a.sourceGuid, outputFileName: a.outputFileName, runId, argsHash: hash(a) });
    return { groupId: row.groupId, sessionId: row.sessionId, member: row.members.length, size: row.size, deadline: row.deadline };
  }
  function assertDispatch(session, a, actor, runId) {
    const row = assert(session, a, actor), member = row.members.find(m => m.runId === runId);
    if (!member || member.argsHash !== hash(a)) fail("ame_title_series_dispatch_not_reserved");
    return true;
  }
  function finish(session, a, runId, dispatched) {
    const row = session && owned.get(session);
    // Never close an unowned/reloaded/replaced session, even on an error.
    if (!row || row.sessionId !== session.id || row.groupId !== a.pendingGroupId) return { close: false, owned: false };
    const member = row.members.find(m => m.runId === runId);
    const close = !dispatched || !member || row.members.length >= row.size || now() >= row.deadline;
    if (close) { row.sealed = true; closed.add(row.groupId); }
    return { close, owned: true, groupId: row.groupId, memberCount: row.members.length, size: row.size };
  }
  return { preflight, begin, reserve, assertDispatch, finish };
}
function validateManifest(manifest) {
  const assert=require("node:assert/strict"),sha=/^[a-f0-9]{64}$/;
  assert(manifest?.pin && sha.test(manifest.pin.processBinding) && sha.test(manifest.pin.presetIdentity),"fresh_manifest_process_and_preset_pins_required");
  return manifest;
}
function buildSeriesPlans(manifest, options = {}) {
  validateManifest(manifest);
  const assert = require("node:assert/strict"), jobs = require("./ame-title-jobs"), entries = manifest.entries;
  assert(Array.isArray(entries) && entries.length >= 1 && entries.length <= pending.MAX_GROUP_ITEMS);
  const pendingGroupId = options.pendingGroupId || crypto.randomUUID(), ids = new Set(), outputs = new Set();
  return entries.map((entry,index) => {
    assert(!ids.has(entry.sourceGuid) && !outputs.has(entry.outputFileName));ids.add(entry.sourceGuid);outputs.add(entry.outputFileName);
    const args = jobs.validateInput(jobs.ENQUEUE, {targetSpecifier:manifest.targetSpecifier,expectedProcess:manifest.expectedProcess,expectedSessionNonce:manifest.expectedSessionNonce,
      timeoutMs:10000,batchId:crypto.randomUUID(),sourceProjectFile:manifest.source.path,expectedSourceSha25664:manifest.source.sha25664,sourceGuid:entry.sourceGuid,
      presetId:manifest.presetId,presetSha25664:manifest.presetSha25664,outputFileName:entry.outputFileName,range:entry.range,queueMode:"shared_queue_v1",enqueueTransport:pending.MODE,pendingGroupId,pendingGroupSize:entries.length});
    return {...entry,number:entry.number || String(index+1).padStart(2,"0"),plan:{summary:"Ограниченная серия AME: enqueue once; START=0.",targetProject:{file:manifest.source.path},requiresCheckpoint:true,steps:[{tool:jobs.ENQUEUE,args,mutatesProject:true}]}};
  });
}
async function produceSeries({directory,items,manifest,call}) {
  const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict");
  validateManifest(manifest);
  assert(path.isAbsolute(directory) && typeof call === "function" && Array.isArray(items) && items.length >= 1 && items.length <= pending.MAX_GROUP_ITEMS);
  const selected=items.map(item=>select(item.plan));assert(selected.every(Boolean));const group=selected[0].pendingGroupId;
  const sourceGuids=new Set(),outputNames=new Set(),batchIds=new Set();
  for(const a of selected) {
    assert.equal(a.pendingGroupSize,items.length);assert.equal(a.pendingGroupId,group);assert.equal(a.targetSpecifier,manifest.targetSpecifier);assert.deepEqual(a.expectedProcess,manifest.expectedProcess);assert.equal(a.expectedSessionNonce,manifest.expectedSessionNonce);
    assert(samePath(a.sourceProjectFile,manifest.source?.path));assert.equal(a.expectedSourceSha25664,manifest.source.sha25664);assert.equal(a.presetId,manifest.presetId);assert.equal(a.presetSha25664,manifest.presetSha25664);
    assert(!sourceGuids.has(a.sourceGuid)&&!outputNames.has(a.outputFileName.toLowerCase())&&!batchIds.has(a.batchId));sourceGuids.add(a.sourceGuid);outputNames.add(a.outputFileName.toLowerCase());batchIds.add(a.batchId);
  }
  fs.mkdirSync(directory,{recursive:true});assert(samePath(fs.realpathSync(directory),directory) && !fs.lstatSync(directory).isSymbolicLink());
  function save(name,value) {const file=path.join(directory,name),fd=fs.openSync(file,"wx");try {fs.writeFileSync(fd,JSON.stringify(value)+"\n");fs.fsyncSync(fd);}finally {fs.closeSync(fd);}return file;}
  // This marker intentionally survives errors/crashes. Producer recovery never
  // retries a proposal/run/enqueue; only the read-only collector is resumable.
  save("producer.once.json",{schema:"ae-agent-ame-title-producer-once.v1",group,items,manifest,createdAt:new Date().toISOString(),automaticResumeAllowed:false});
  let sequence=0,checkpoint=null,sessionId=null,lease=null;const entries=[];
  async function invoke(tool,args) {const stem=String(++sequence).padStart(3,"0");save(stem+"-intent.json",{tool,args,automaticReplayAllowed:false});const response=await call(tool,args);save(stem+"-result.json",response);assert.notEqual(response?.isError,true);return response?.value===undefined?response:response.value;}
  for(let i=0;i<items.length;i++) {
    const item=items[i],v=await invoke("propose_ai_agent_plan",{plan:item.plan,requestId:crypto.randomUUID()}),p=v.proposal;
    assert.equal(v.ok,true);assert.equal(v.validation?.ok,true);assert.equal(v.validation.stepCount,1);assert.equal(p?.serverCreated,true);assert.deepEqual(v.plan,item.plan);
    const pins={actionId:p.actionId,payloadRef:p.action.payloadRef,payloadHash:p.action.payloadHash,previewHash:p.action.previewHash,riskLevel:p.risk.level,riskPolicyVersion:p.confirmation.riskPolicyVersion};
    const dry=await invoke("run_ai_agent_plan",{...pins,requestId:crypto.randomUUID(),dryRun:true,responseView:"summary",maxSteps:1});assert.equal(dry.ok,true);assert.equal(dry.dryRun,true);
    const value=await invoke("run_ai_agent_plan",{...pins,requestId:crypto.randomUUID(),dryRun:false,responseView:"full",maxSteps:1,confirm:true,allowMutations:true,autoEditSession:true}),run=value.run||value;
    assert(pending.isPendingRun(run),"exact_pending_dispatch_required_no_replay");const payload=run.steps[0].result||run.steps[0].mutationResult,r=payload.pendingReceipt,cp=run.editSession?.checkpoint||run.checkpoint;
    assert(cp?.checkpointFile && samePath(cp.sourceFile,selected[i].sourceProjectFile));
    if(checkpoint) {assert.equal(cp.checkpointFile,checkpoint);assert.equal(run.editSession.id,sessionId);}else {checkpoint=cp.checkpointFile;sessionId=run.editSession.id;}
    const currentLease={group:r.pendingGroupId,common:r.groupCommonBinding,createdAt:r.groupCreatedAt,deadline:r.groupDeadline,budgetMs:r.budgetMs};if(lease)assert.deepEqual(currentLease,lease);else lease=currentLease;
    assert.equal(r.pendingGroupId,group);assert.equal(r.groupDeadline,r.groupCreatedAt+pending.GROUP_BUDGET_MS);
    const entry={number:item.number,batchId:payload.batchId,jobId:payload.jobId,requestNonce:payload.requestNonce,operationBinding:r.operationBinding,processBinding:r.processBinding,outputPath:payload.outputPath,pendingReceipt:r,statusArgs:payload.statusArgs};entries.push(entry);save("member-"+String(i+1).padStart(2,"0")+".json",entry);
  }
  const produced={schema:"ae-agent-ame-title-series-produced.v1",entries,items,manifest,checkpointFile:checkpoint,editSessionId:sessionId,reservedLease:lease,startCalls:0,ownAcceptanceClaimed:false,completionVerified:false,mediaVerified:false};save("produced.json",produced);return produced;
}
module.exports = { select, createSeries, buildSeriesPlans, produceSeries };
