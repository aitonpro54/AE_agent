"use strict";

// Durable server bookkeeping is outside the native claim directory. These files
// are evidence and replay barriers, never native execution authority or secrets.
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const SCHEMA = "ae-agent.native-fixture-attempt-ledger.v1", SHA = /^[a-f0-9]{64}$/, TOKEN = /^[a-f0-9]{32}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
function fail(code) { throw Object.assign(Error(code), {code}); }
function hash(value) { return crypto.createHash("sha256").update(Buffer.isBuffer(value) || typeof value === "string" ? value : JSON.stringify(value)).digest("hex"); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function same(a,b) { return JSON.stringify(a) === JSON.stringify(b); }
function safeDirectory(dir) {
  for (let p=path.resolve(dir); ; p=path.dirname(p)) {
    const s=fs.lstatSync(p);
    if (!s.isDirectory() || s.isSymbolicLink() || fs.realpathSync(p).toLowerCase()!==p.toLowerCase()) fail("fixture_ledger_directory_identity");
    if (path.dirname(p)===p) break;
  }
}
function ensure(dir) { if (!fs.existsSync(dir)) { ensure(path.dirname(dir)); fs.mkdirSync(dir); } safeDirectory(dir); }
function readBytes(file) {
  safeDirectory(path.dirname(file)); const a=fs.lstatSync(file);
  if (!a.isFile() || a.isSymbolicLink() || a.nlink!==1 || a.size>16*1024*1024 || fs.realpathSync(file).toLowerCase()!==path.resolve(file).toLowerCase()) fail("fixture_ledger_file_identity");
  const bytes=fs.readFileSync(file), b=fs.lstatSync(file);
  if (a.dev!==b.dev || a.ino!==b.ino || a.size!==b.size || a.mtimeMs!==b.mtimeMs || bytes.length!==b.size) fail("fixture_ledger_file_changed"); return bytes;
}
function writeOnce(file,value,metadata={}) {
  ensure(path.dirname(file)); const row={schema:SCHEMA+".envelope",sha256:hash(value),value:clone(value),...metadata};
  const fd=fs.openSync(file,"wx",0o600);
  try {fs.writeFileSync(fd,JSON.stringify(row));fs.fsyncSync(fd);} finally {fs.closeSync(fd);} return row;
}
function read(file) {
  if (!fs.existsSync(file)) return null;
  const row=JSON.parse(readBytes(file));
  if (row.schema!==SCHEMA+".envelope" || !SHA.test(row.sha256 || "") || hash(row.value)!==row.sha256) fail("fixture_ledger_envelope_corrupt"); return row;
}
function directory(repoRoot,stageId) {
  if (!TOKEN.test(stageId || "")) fail("fixture_ledger_selector_invalid");
  return path.join(repoRoot,".codex-runtime","ame-native-fixture-ledger",stageId);
}
function fileFor(repoRoot,stageId,kind) {
  if (!/^(owner|reservation|launch|unknown|retirement-proof|retirement-audit|recovered|consumed-(create-fixture|snapshot|stage-variants))$/.test(kind)) fail("fixture_ledger_kind_invalid");
  return path.join(directory(repoRoot,stageId),kind+".json");
}
function descriptor(repoRoot,d) {
  if (!d || !TOKEN.test(d.nonce || "") || !TOKEN.test(d.stageId || "") || !["capture","stage"].includes(d.role) ||
      d.rootPath!==path.join(repoRoot,".codex-runtime","ame-native-fixtures","probe-"+d.nonce) ||
      !SHA.test(d.pluginSha256 || "") || !SHA.test(d.executableSha256 || "") || typeof d.pluginPath!=="string" || typeof d.executablePath!=="string") fail("fixture_ledger_descriptor_invalid");
  safeDirectory(d.rootPath); return clone(d);
}
function processIdentity(p,d) {
  if (!p || !Number.isSafeInteger(p.pid) || p.pid<1 || !Number.isSafeInteger(p.createdUnixMs) || p.createdUnixMs<1 ||
      typeof p.createdAt!=="string" || Date.parse(p.createdAt)!==p.createdUnixMs || typeof p.path!=="string" || p.path.toLowerCase()!==d.executablePath.toLowerCase()) fail("fixture_ledger_process_identity_invalid");
  return {pid:p.pid,createdUnixMs:p.createdUnixMs,createdAt:birthIdentity(p.createdAt),path:p.path};
}
function birthIdentity(value) {
  if(typeof value!=="string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{1,7}(Z|\+00:00)$/.test(value))fail("fixture_ledger_birth_identity_invalid");
  return value.replace(/\+00:00$/,"Z").replace(/\.(\d+)Z$/,(m,d)=>"."+d.padEnd(7,"0")+"Z");
}
function sameProcess(a,b) {return a && b && a.pid===b.pid && a.createdUnixMs===b.createdUnixMs && birthIdentity(a.createdAt)===birthIdentity(b.createdAt) && String(a.path).toLowerCase()===String(b.path).toLowerCase();}
function reserve(repoRoot,d,context,manifestBytes) {
  d=descriptor(repoRoot,d); if (!UUID.test(context.runId || "") || !context.record?.actionId || !Number.isSafeInteger(context.record.revision)) fail("fixture_ledger_context_invalid");
  const owner={schema:"ae-agent.native-fixture-owner.v2",rootPath:d.rootPath,nonce:d.nonce,stageId:d.stageId,role:d.role};
  const existing=read(fileFor(repoRoot,d.stageId,"owner"));
  if (!existing) writeOnce(fileFor(repoRoot,d.stageId,"owner"),owner); else if (!same(existing.value,owner)) fail("fixture_ledger_owner_changed");
  return writeOnce(fileFor(repoRoot,d.stageId,"reservation"),{schema:SCHEMA+".reservation",descriptor:d,runId:context.runId,
    actionId:context.record.actionId,proposalRevision:context.record.revision,payloadHash:context.record.payloadHash || null,
    manifestSha256:hash(manifestBytes),reservedAt:new Date().toISOString(),status:"reserved_before_launch",replayAllowed:false});
}
function launch(repoRoot,d,p) {
  const r=read(fileFor(repoRoot,d.stageId,"reservation")); if (!r || !same(r.value.descriptor,d)) fail("fixture_ledger_reservation_required");
  return writeOnce(fileFor(repoRoot,d.stageId,"launch"),{schema:SCHEMA+".launch",reservationSha256:r.sha256,descriptorSha256:hash(d),
    process:processIdentity(p,d),observedAt:new Date().toISOString(),producer:"trusted_server_launch_identity",replayAllowed:false});
}
function unknown(repoRoot,d,code) {
  const file=fileFor(repoRoot,d.stageId,"unknown"); if (fs.existsSync(file)) return read(file);
  return writeOnce(file,{schema:SCHEMA+".unknown",descriptorSha256:hash(d),code:String(code || "fixture_unknown").slice(0,200),historicalOutcome:"unknown",nativeExecutionProven:false,replayAllowed:false});
}
function validateRetirement(proof,expected) {
  const p=proof?.process, w=proof?.proof;
  if (proof?.schema!=="ae-agent.native-fixture-retirement-proof.v1" || !sameProcess(p,expected) || w?.kind!=="held_process_handle_signaled" ||
      w.waitResult!=="WAIT_OBJECT_0" || !Number.isInteger(w.exitCode) || !Number.isFinite(Date.parse(w.handleOpenedAt)) ||
      !Number.isFinite(Date.parse(w.identityVerifiedAt)) || !Number.isFinite(Date.parse(w.observedAt)) || Date.parse(w.handleOpenedAt)<p.createdUnixMs ||
      Date.parse(w.identityVerifiedAt)<Date.parse(w.handleOpenedAt) || Date.parse(w.observedAt)<Date.parse(w.identityVerifiedAt) || proof.nativeExecutionProven!==false) fail("fixture_retirement_positive_exit_proof_required");
  return clone(proof);
}
function auditRetirement(repoRoot,d,process,proof,authority) {
  validateRetirement(proof,process);
  if (!authority || !SHA.test(authority.dispositionSha256 || "") || !SHA.test(authority.auditSha256 || "") || !SHA.test(authority.observationSha256 || "")) fail("fixture_retirement_audited_abandonment_required");
  return writeOnce(fileFor(repoRoot,d.stageId,"retirement-audit"),{schema:SCHEMA+".retirement-audit",descriptor:d,process,proof,authority,
    retiredAt:new Date().toISOString(),historicalOutcome:"unknown",nativeExecutionProven:false,replayAllowed:false});
}
// The complete set is derived from durable server records, including roots that
// have vanished. Observation UUIDs supplied by a caller never define this set.
function attemptInventory(repoRoot,context) {
  const parent=path.join(repoRoot,".codex-runtime","ame-native-fixture-ledger"),observations=path.join(repoRoot,".codex-runtime","ame-native-fixtures","recovered-observations"),entries=new Map();
  if(!UUID.test(context.runId || "") || typeof context.actionId!=="string" || !Number.isInteger(context.proposalRevision))fail("fixture_inventory_context_invalid");
  if(fs.existsSync(parent)) {
    safeDirectory(parent);
    for(const id of fs.readdirSync(parent)) {
      if(!TOKEN.test(id))fail("fixture_ledger_foreign_entry");
      const reservation=read(fileFor(repoRoot,id,"reservation")),recovered=read(fileFor(repoRoot,id,"recovered"));
      if(reservation?.value.runId!==context.runId && recovered?.value.runId!==context.runId)continue;
      if(!reservation) {
        if(read(fileFor(repoRoot,id,"launch")) || read(fileFor(repoRoot,id,"unknown")))fail("fixture_inventory_orphan_launch");
        continue; // Observations below must prove the legacy layout.
      }
      const r=reservation.value,d=descriptor(repoRoot,r.descriptor),owner=read(fileFor(repoRoot,id,"owner")),launch=read(fileFor(repoRoot,id,"launch")),unknown=read(fileFor(repoRoot,id,"unknown"));
      if(r.schema!==SCHEMA+".reservation" || d.stageId!==id || r.actionId!==context.actionId || r.proposalRevision!==context.proposalRevision || r.payloadHash!==(context.payloadHash || null) || r.replayAllowed!==false ||
        !owner || !same(owner.value,{schema:"ae-agent.native-fixture-owner.v2",rootPath:d.rootPath,nonce:d.nonce,stageId:d.stageId,role:d.role}) ||
        !launch || launch.value.schema!==SCHEMA+".launch" || launch.value.reservationSha256!==reservation.sha256 || launch.value.descriptorSha256!==hash(d) || launch.value.producer!=="trusted_server_launch_identity" || launch.value.replayAllowed!==false ||
        !unknown || unknown.value.schema!==SCHEMA+".unknown" || unknown.value.descriptorSha256!==hash(d) || unknown.value.historicalOutcome!=="unknown" || unknown.value.nativeExecutionProven!==false || unknown.value.replayAllowed!==false ||
        hash(readBytes(path.join(d.rootPath,"launch.manifest")))!==r.manifestSha256)fail("fixture_inventory_durable_binding_invalid");
      const process=processIdentity(launch.value.process,d);
      entries.set(id,{descriptor:d,process,reservationSha256:reservation.sha256,launchSha256:launch.sha256,unknownSha256:unknown.sha256,manifestSha256:r.manifestSha256});
    }
  }
  if(fs.existsSync(observations)) {
    safeDirectory(observations);
    for(const name of fs.readdirSync(observations)) {
      if(/^[a-f0-9-]{36}\.retirement\.json$/i.test(name))continue;
      if(!/^[a-f0-9-]{36}\.json$/i.test(name))fail("fixture_ledger_foreign_observation");
      const row=JSON.parse(readBytes(path.join(observations,name))),v=row.value;
      if(row.schema!=="ae-agent.native-fixture-recovered-observation.v1.envelope" || hash(v)!==row.sha256)fail("fixture_ledger_observation_corrupt");
      if(v?.selector?.runId!==context.runId)continue;
      if(v.action?.actionId!==context.actionId || v.action.proposalRevision!==context.proposalRevision)fail("fixture_inventory_observation_action_mismatch");
      const d=descriptor(repoRoot,v.attempt?.descriptor),process=processIdentity(v.attempt?.process,d),found=entries.get(d.stageId);
      // The historical layout participates in the union too. It cannot hide a
      // third member, and cannot be used as a modern grouped launch receipt.
      if(!found) {
        const files=v.files || v.attempt.files;
        if(!files || !same(Object.keys(files).sort(),["launch.manifest","server-launch-attempt.json","server-owner.json"]) || !same(fs.readdirSync(d.rootPath).sort(),Object.keys(files).sort()))fail("fixture_inventory_observation_launch_missing");
        for(const [name,digest] of Object.entries(files))if(!SHA.test(digest) || hash(readBytes(path.join(d.rootPath,name)))!==digest)fail("fixture_inventory_historical_file_changed");
        const owner=JSON.parse(readBytes(path.join(d.rootPath,"server-owner.json"))),launch=JSON.parse(readBytes(path.join(d.rootPath,"server-launch-attempt.json")));
        if(owner.schema!=="ae-agent.native-fixture-owner.v2" || owner.rootPath!==d.rootPath || owner.stageId!==d.stageId || owner.nonce!==d.nonce || owner.role!==d.role || launch.runId!==context.runId || launch.stageId!==d.stageId ||
          launch.nonce!==d.nonce || launch.role!==d.role || launch.pluginSha256!==d.pluginSha256 || launch.executableSha256!==d.executableSha256 || launch.replayAllowed!==false)fail("fixture_inventory_historical_owner_invalid");
        entries.set(d.stageId,{descriptor:d,process,legacyLayout:true,manifestSha256:files["launch.manifest"],ownerSha256:files["server-owner.json"],launchAttemptSha256:files["server-launch-attempt.json"]});continue;
      }
      if(!same(found.descriptor,d) || !sameProcess(found.process,process) || v.attempt.retainedUnknown!==true ||
        v.attempt.reservationSha256 && v.attempt.reservationSha256!==found.reservationSha256 || v.attempt.launchSha256 && v.attempt.launchSha256!==found.launchSha256)fail("fixture_inventory_observation_binding_invalid");
    }
  }
  const result=[...entries.values()].sort((a,b)=>a.descriptor.role.localeCompare(b.descriptor.role));
  if(result.length && (result.length>2 || result[0].descriptor.role!=="capture" || result.length===2 && result[1].descriptor.role!=="stage"))fail("fixture_inventory_fixture_roles_invalid");
  return result;
}
function validRetirement(repoRoot,d) {
  const row=read(fileFor(repoRoot,d.stageId,"retirement-audit")); if (!row) return false;
  const v=row.value;
  if (v.schema!==SCHEMA+".retirement-audit" || !same(v.descriptor,d) || v.historicalOutcome!=="unknown" || v.nativeExecutionProven!==false || v.replayAllowed!==false ||
      !SHA.test(v.authority?.dispositionSha256 || "") || !SHA.test(v.authority?.auditSha256 || "") || !SHA.test(v.authority?.observationSha256 || "")) fail("fixture_retirement_audit_invalid");
  validateRetirement(v.proof,v.process);
  // The replay barrier opens only while the complete immutable audit chain is
  // readable. A retirement sidecar alone or a partial abandonment cannot open it.
  const authority=v.authority,values={};
  for(const [key,digest] of [["dispositionPath",authority.dispositionSha256],["auditPath",authority.auditSha256],["observationPath",authority.observationSha256]]) {
    const file=authority[key];
    if(typeof file!=="string" || !path.resolve(file).toLowerCase().startsWith(path.resolve(repoRoot).toLowerCase()+path.sep))fail("fixture_retirement_authority_path_invalid");
    const signed=JSON.parse(readBytes(file));if(signed.sha256!==digest || hash(signed.value)!==digest)fail("fixture_retirement_authority_changed");values[key]=signed;
  }
  const disposition=values.dispositionPath,audit=values.auditPath,obs=values.observationPath;
  if(disposition.value.schema!=="ae-agent.native-fixture-abandonment.v1" || disposition.auditSha256!==audit.sha256 || audit.value.dispositionSha256!==disposition.sha256 ||
    audit.value.confirmation!==true || audit.value.schema!=="ae-agent.native-fixture-abandonment.v1.audit" || obs.value.schema!=="ae-agent.native-fixture-recovered-observation.v1" ||
    !same(obs.value.attempt?.descriptor,d) || !sameProcess(obs.value.attempt?.process,v.process) || !same(disposition.value.selector,obs.value.selector))fail("fixture_retirement_authority_invalid");
  const historicalFiles=obs.value.files || obs.value.attempt.files;
  if(historicalFiles)for(const [name,digest] of Object.entries(historicalFiles)) {
    if(!["server-owner.json","server-launch-attempt.json","launch.manifest"].includes(name) || hash(readBytes(path.join(d.rootPath,name)))!==digest)fail("fixture_retirement_historical_root_changed");
  }
  else {const reservation=read(fileFor(repoRoot,d.stageId,"reservation"));if(!reservation || hash(readBytes(path.join(d.rootPath,"launch.manifest")))!==reservation.value.manifestSha256)fail("fixture_retirement_manifest_changed");}
  const base=path.dirname(authority.dispositionPath),id=disposition.value.selector.requestId;
  const consumption=JSON.parse(readBytes(path.join(base,id+".consumption.json"))),capture=JSON.parse(readBytes(path.join(base,disposition.value.captureId+".capture.json")));
  if(disposition.consumptionSha256!==consumption.sha256 || hash(consumption.value)!==consumption.sha256 || audit.value.consumptionSha256!==consumption.sha256 ||
    capture.sha256!==disposition.value.captureSha256 || hash(capture.value)!==capture.sha256 || !same(capture.value.observed,audit.value.observed))fail("fixture_retirement_partial_audit");
  if(authority.groupRetirementPath) {
    if(typeof authority.groupRetirementPath!=="string" || !path.resolve(authority.groupRetirementPath).toLowerCase().startsWith(path.resolve(repoRoot).toLowerCase()+path.sep))fail("fixture_retirement_authority_path_invalid");
    if(authority.groupRetirementPath!==path.join(base,id+".group-retirement.json"))fail("fixture_retirement_authority_path_invalid");
    if(!fs.existsSync(authority.groupRetirementPath))return false;
    const group=JSON.parse(readBytes(authority.groupRetirementPath)),g=group.value,observed=capture.value.observed,expected=observed.attemptGroup;
    if(group.schema!=="ae-agent.native-fixture-abandonment.v1.envelope" || hash(g)!==group.sha256 || g.schema!=="ae-agent.native-fixture-abandonment-attempt-group.v1.retirement" ||
      !expected || g.inventorySha256!==expected.inventorySha256 || authority.groupInventorySha256!==expected.inventorySha256 || g.dispositionSha256!==disposition.sha256 || g.auditSha256!==audit.sha256 ||
      g.historicalOutcome!=="unknown" || g.nativeExecutionProven!==false || g.replayAllowed!==false || !same(g.selector,disposition.value.selector) || !Array.isArray(g.members) || g.members.length!==2 || !same(g.members.map(m=>m.stageId),expected.inventory.map(e=>e.descriptor.stageId)) ||
      !same(attemptInventory(repoRoot,expected.context),expected.inventory))fail("fixture_retirement_group_invalid");
    for(const member of g.members) {
      const retired=read(fileFor(repoRoot,member.stageId,"retirement-audit")),e=expected.inventory.find(e=>e.descriptor.stageId===member.stageId),o=observed.attempts.find(o=>o.descriptor.stageId===member.stageId);
      if(!retired || retired.value.schema!==SCHEMA+".retirement-audit" || retired.sha256!==member.retirementAuditSha256 || !same(retired.value.descriptor,e.descriptor) || !sameProcess(retired.value.process,e.process) ||
        retired.value.authority.groupRetirementPath!==authority.groupRetirementPath || retired.value.authority.groupInventorySha256!==g.inventorySha256 || retired.value.authority.dispositionSha256!==disposition.sha256 ||
        retired.value.authority.dispositionPath!==authority.dispositionPath || retired.value.authority.auditPath!==authority.auditPath ||
        retired.value.authority.auditSha256!==audit.sha256 || retired.value.authority.observationSha256!==o.observationSha256 || retired.value.authority.observationPath!==path.join(repoRoot,".codex-runtime","ame-native-fixtures","recovered-observations",o.observationId+".json") ||
        retired.value.historicalOutcome!=="unknown" || retired.value.nativeExecutionProven!==false || retired.value.replayAllowed!==false || member.observationId!==o.observationId || member.observationSha256!==o.observationSha256)fail("fixture_retirement_group_partial");
      const observation=JSON.parse(readBytes(retired.value.authority.observationPath));
      if(observation.schema!=="ae-agent.native-fixture-recovered-observation.v1.envelope" || observation.sha256!==o.observationSha256 || hash(observation.value)!==o.observationSha256 || !same(observation.value.attempt?.descriptor,e.descriptor) || !sameProcess(observation.value.attempt?.process,e.process))fail("fixture_retirement_group_observation_changed");
      validateRetirement(retired.value.proof,e.process);
    }
  } else if(capture.value.observed.attemptGroup)fail("fixture_retirement_group_required");
  return true;
}
function completionFile(repoRoot,runId) {if(!UUID.test(runId || ""))fail("fixture_completion_selector_invalid");return path.join(repoRoot,".codex-runtime","ame-native-fixture-completions",runId+".json");}
function complete(repoRoot,runId,children,outputs) {
  if(children.length!==2 || !same(children.map(c=>c.descriptor.role),["capture","stage"]))fail("fixture_completion_two_terminal_children_required");
  const entries=children.map(c=> {
    const d=c.descriptor,r=read(fileFor(repoRoot,d.stageId,"reservation")),l=read(fileFor(repoRoot,d.stageId,"launch"));
    if(!c.terminal || !r || !l || r.value.runId!==runId || read(fileFor(repoRoot,d.stageId,"unknown")))fail("fixture_completion_terminal_receipts_required");
    if(hash(readBytes(path.join(d.rootPath,"launch.manifest")))!==r.value.manifestSha256)fail("fixture_completion_manifest_changed");
    const receiptName=d.role==="capture" ? "signed-snapshot.json" : "signed-variants.json";
    const operations=d.role==="capture" ? ["create-fixture","snapshot"] : ["stage-variants"],consumptionHashes={};
    for(const operation of operations){const consumed=read(fileFor(repoRoot,d.stageId,"consumed-"+operation));if(!consumed || consumed.value.runId!==runId || consumed.value.status!=="consumed_before_grant_publication")fail("fixture_completion_consumption_required");consumptionHashes[operation]=consumed.sha256;}
    return {descriptor:d,reservationSha256:r.sha256,launchSha256:l.sha256,process:l.value.process,receiptName,receiptSha256:hash(readBytes(path.join(d.rootPath,receiptName))),consumptionHashes};
  });
  for(const output of outputs)if(hash(readBytes(output.path))!==output.sha256)fail("fixture_completion_output_changed");
  return writeOnce(completionFile(repoRoot,runId),{schema:SCHEMA+".completion",runId,producer:"trusted_private_issuer_verified_terminal_receipts",entries,outputs,
    endpointInert:true,processExited:false,replayAllowed:false});
}
function validCompletion(repoRoot,d,reservation) {
  const row=read(completionFile(repoRoot,reservation.value.runId));if(!row)return false;
  const v=row.value;
  if(v.schema!==SCHEMA+".completion" || v.runId!==reservation.value.runId || v.producer!=="trusted_private_issuer_verified_terminal_receipts" || v.endpointInert!==true || v.processExited!==false || v.replayAllowed!==false ||
    !Array.isArray(v.entries) || v.entries.length!==2 || !same(v.entries.map(e=>e.descriptor?.role),["capture","stage"]) || !Array.isArray(v.outputs) || v.outputs.length!==2)fail("fixture_completion_invalid");
  if(!v.entries.some(e=>same(e.descriptor,d)))fail("fixture_completion_descriptor_mismatch");
  for(const e of v.entries) {
    const r=read(fileFor(repoRoot,e.descriptor.stageId,"reservation")),l=read(fileFor(repoRoot,e.descriptor.stageId,"launch"));
    if(!r || !l || r.sha256!==e.reservationSha256 || l.sha256!==e.launchSha256 || r.value.runId!==v.runId || !same(r.value.descriptor,e.descriptor) || !sameProcess(l.value.process,e.process) ||
      read(fileFor(repoRoot,e.descriptor.stageId,"unknown")) || e.receiptName!==(e.descriptor.role==="capture" ? "signed-snapshot.json" : "signed-variants.json") ||
      hash(readBytes(path.join(e.descriptor.rootPath,"launch.manifest")))!==r.value.manifestSha256 ||
      hash(readBytes(path.join(e.descriptor.rootPath,e.receiptName)))!==e.receiptSha256)fail("fixture_completion_receipt_or_launch_changed");
    const operations=e.descriptor.role==="capture" ? ["create-fixture","snapshot"] : ["stage-variants"];
    if(!same(Object.keys(e.consumptionHashes || {}).sort(),operations.slice().sort()))fail("fixture_completion_consumption_invalid");
    for(const operation of operations) {
      const consumed=read(fileFor(repoRoot,e.descriptor.stageId,"consumed-"+operation)),c=consumed?.value;
      if(!consumed || consumed.sha256!==e.consumptionHashes[operation] || c.schema!=="ae-agent.native-fixture-attempt.v2" || c.runId!==v.runId || c.status!=="consumed_before_grant_publication" ||
        c.actionId!==r.value.actionId || c.revision!==r.value.proposalRevision || c.payloadHash!==r.value.payloadHash || c.stageId!==e.descriptor.stageId || c.nonce!==e.descriptor.nonce || c.operation!==operation || c.replayAllowed!==false)fail("fixture_completion_consumption_invalid");
    }
  }
  for(const output of v.outputs)if(typeof output.path!=="string" || !output.path.startsWith(v.entries[1].descriptor.rootPath+path.sep) || hash(readBytes(output.path))!==output.sha256)fail("fixture_completion_output_changed");
  return true;
}
function outstanding(repoRoot,permittedRunId=null) {
  const parent=path.join(repoRoot,".codex-runtime","ame-native-fixtures"),ledgerParent=path.join(repoRoot,".codex-runtime","ame-native-fixture-ledger");
  const roots=new Set(),entries=new Map(),blocked=[];
  if(fs.existsSync(ledgerParent)) {
    safeDirectory(ledgerParent);
    for(const id of fs.readdirSync(ledgerParent)) {
      if(!TOKEN.test(id))fail("fixture_ledger_foreign_entry");
      const r=read(fileFor(repoRoot,id,"reservation")) || read(fileFor(repoRoot,id,"recovered"));
      if(!r)continue;
      const d=descriptor(repoRoot,r.value.descriptor);if(d.stageId!==id || entries.has(d.rootPath))fail("fixture_ledger_duplicate_root");
      entries.set(d.rootPath,r);roots.add(d.rootPath);
    }
  }
  if(fs.existsSync(parent)) {
    safeDirectory(parent);
    for(const name of fs.readdirSync(parent)) {
      if(name==="recovered-observations") {
        const observations=path.join(parent,name);safeDirectory(observations);
        for(const file of fs.readdirSync(observations)) {
          if(/^[a-f0-9-]{36}\.retirement\.json$/i.test(file))continue;
          if(!/^[a-f0-9-]{36}\.json$/i.test(file))fail("fixture_ledger_foreign_observation");
          const row=JSON.parse(readBytes(path.join(observations,file)));
          if(row.schema!=="ae-agent.native-fixture-recovered-observation.v1.envelope" || hash(row.value)!==row.sha256)fail("fixture_ledger_observation_corrupt");
          roots.add(descriptor(repoRoot,row.value.attempt?.descriptor).rootPath);
        }
      } else {if(!/^probe-[a-f0-9]{32}$/.test(name))fail("fixture_ledger_foreign_native_root");const file=path.join(parent,name);safeDirectory(file);roots.add(file);}
    }
  }
  for(const rootPath of roots) {
    const found=entries.get(rootPath);
    if (!found) {blocked.push({rootPath,reason:"unreconciled_historical_root"});continue;}
    const d=descriptor(repoRoot,found.value.descriptor);
    if (validRetirement(repoRoot,d)) continue;
    if(found.value.schema===SCHEMA+".reservation" && validCompletion(repoRoot,d,found))continue;
    if (permittedRunId && found.value.runId===permittedRunId && !read(fileFor(repoRoot,d.stageId,"unknown"))) continue;
    blocked.push({rootPath,stageId:d.stageId,runId:found.value.runId,reason:"exact_child_retirement_audit_required"});
  }
  return blocked;
}
function assertAdmission(repoRoot,permittedRunId=null) { if (outstanding(repoRoot,permittedRunId).length) fail("fixture_runner_unretired_attempt_no_replay"); }
module.exports={SCHEMA,SHA,TOKEN,UUID,hash,clone,same,fail,safeDirectory,ensure,readBytes,read,writeOnce,directory,fileFor,descriptor,processIdentity,birthIdentity,sameProcess,reserve,launch,unknown,validateRetirement,auditRetirement,validRetirement,attemptInventory,completionFile,complete,validCompletion,outstanding,assertAdmission};
