"use strict";
// Cooperative, sole-controller transport bookkeeping. Never an AE result or an
// unlock endpoint. Canonical SHA256 is identity consistency, not authentication.
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const contract=require("../cep-panel/panel-action-contract");
const SCHEMA="ae-agent.cep-readonly-orphan.v1",MAX=1024*1024;
const hash=value=>crypto.createHash("sha256").update(typeof value==="string"?value:JSON.stringify(value)).digest("hex");
function fail(code){throw Object.assign(Error(code),{code});}
function filename(root,id,kind){if(!contract.UUID_REGEX.test(id || ""))fail("readonly_orphan_request_invalid");return path.join(root,"readonly-orphan-"+id+"-"+kind+".json");}
function bytes(file){const s=fs.lstatSync(file);if(!s.isFile() || s.isSymbolicLink() || s.nlink!==1 || s.size>MAX)fail("readonly_orphan_file_invalid");return fs.readFileSync(file,"utf8");}
function read(root,id,kind){const file=filename(root,id,kind);if(!fs.existsSync(file))return null;const text=bytes(file);let value;try{value=JSON.parse(text);}catch(_){fail("readonly_orphan_record_corrupt");}return {value,sha256:hash(text)};}
function writeOnce(root,id,kind,value){const file=filename(root,id,kind),text=JSON.stringify(value);if(Buffer.byteLength(text)>MAX)fail("readonly_orphan_record_too_large");let fd;
  try{fd=fs.openSync(file,"wx",0o600);fs.writeFileSync(fd,text);fs.fsyncSync(fd);}catch(error){fail(error.code==="EEXIST"?"readonly_orphan_attempt_no_replay":"readonly_orphan_persistence_failed");}finally{if(fd!==undefined)fs.closeSync(fd);}
  const saved=read(root,id,kind);if(saved.sha256!==hash(text))fail("readonly_orphan_persistence_failed");return saved;
}
function validEnvelope(envelope){const def=contract.getActionDefinition(envelope?.action),check=contract.validateEnvelope(envelope);
  if(!check.ok || envelope.action!=="plan.reconcile" || def.effect!=="bridge_read" || def.confirmationRequired!==false ||
     Object.keys(envelope.args).length!==1 || !contract.UUID_REGEX.test(envelope.args.runId || ""))fail("readonly_orphan_action_not_allowed");return envelope;
}
function capture(root,envelope,source,signature){validEnvelope(envelope);const value={schema:SCHEMA+".intent",requestId:envelope.requestId,action:envelope.action,envelope,signature,source};
  const prior=read(root,envelope.requestId,"intent");if(prior){if(JSON.stringify(prior.value)!==JSON.stringify(value))fail("readonly_orphan_intent_conflict");return prior;}
  return writeOnce(root,envelope.requestId,"intent",value);
}
function intent(context,row){const saved=read(context.root,row.requestId,"intent");if(!saved)fail("readonly_orphan_intent_missing");const v=saved.value;
  validEnvelope(v.envelope);if(v.schema!==SCHEMA+".intent" || v.requestId!==row.requestId || v.action!==row.action ||
    v.signature!==row.signature || context.signature(v.envelope)!==row.signature)fail("readonly_orphan_intent_mismatch");
  if(v.source?.kind==="original-input-file"){
    const text=bytes(v.source.path);if(hash(text)!==v.source.sha256 || JSON.stringify(context.normalize(JSON.parse(text)))!==JSON.stringify(v.envelope))fail("readonly_orphan_input_changed");
    if(v.source.originalReceiptSha256 && hash(bytes(context.receiptFile(row.requestId)))!==v.source.originalReceiptSha256)fail("readonly_orphan_original_receipt_changed");
  }else if(v.source?.kind!=="service-invoke")fail("readonly_orphan_input_source_invalid");
  return saved;
}
function identity(context,row){const current=context.local(row.requestId);if(!current || current.phase==="receipt_storage" || current.action!=="plan.reconcile" ||
    current.signature!==row.signature || current.replayAllowed!==false || !current.binding || !/^(accepted|running|unknown)$/.test(current.state) ||
    !/^(submitted|unknown)$/.test(current.delivery))fail("readonly_orphan_transport_identity_invalid");
  return {receiptSha256:hash(bytes(context.receiptFile(row.requestId))),indexIdentitySha256:hash(context.indexIdentity(row.requestId))};
}
function same(a,b){return JSON.stringify(a)===JSON.stringify(b);}
function sameBinding(a,b){return a && b && a.panelInstanceId===b.panelInstanceId && a.panelLifecycleEpoch===b.panelLifecycleEpoch && a.panelGeneration===b.panelGeneration;}
function validActor(value){return value && typeof value.panelInstanceId==="string" && value.panelInstanceId.length>0 &&
  Number.isInteger(value.panelLifecycleEpoch) && value.panelLifecycleEpoch>=0 && typeof value.panelGeneration==="string" && value.panelGeneration.length>0;}
function validSnapshot(value){if(!value || value.remoteAbsent!==true || value.controllerIdle!==true || !validActor(value.actor) ||
  !/^[a-f0-9]{64}$/.test(value.targetSha256 || ""))fail("readonly_orphan_panel_not_idle");return value;}
async function snapshots(context,id){const first=validSnapshot(await context.observe(id)),second=validSnapshot(await context.observe(id));
  if(!sameBinding(first.actor,second.actor) || first.targetSha256!==second.targetSha256)fail("readonly_orphan_panel_changed");
  return {...second,observations:{count:2,timestamps:[first.observedAt,second.observedAt]}};
}
function fileId(stat){return {dev:String(stat.dev),ino:String(stat.ino)};}
function heldOwner(context,row){const file=path.join(context.root,"controller.lock"),fd=fs.openSync(file,"r"),stat=fs.fstatSync(fd,{bigint:true});let owner;
  try{if(!stat.isFile() || stat.nlink!==1n || stat.size>BigInt(MAX))fail("readonly_orphan_lock_invalid");owner=JSON.parse(fs.readFileSync(fd,"utf8"));
    if(owner.requestId!==row.requestId || !Number.isInteger(owner.pid) || owner.pid<1 || !contract.UUID_REGEX.test(owner.token || "") || !context.dead(owner.pid))fail("readonly_orphan_owner_not_exited");
    const check=()=>{const current=context.readLock(),live=fs.lstatSync(file,{bigint:true}),held=fs.fstatSync(fd,{bigint:true});
      if(!live.isFile() || live.isSymbolicLink() || live.nlink!==1n || !same(fileId(live),fileId(held)) || !same(fileId(held),fileId(stat)) ||
        !current || current.pid!==owner.pid || current.requestId!==owner.requestId || current.token!==owner.token || !context.dead(owner.pid))fail("readonly_orphan_owner_changed");};
    check();return {fd,file,check,witness:{pid:owner.pid,requestId:owner.requestId,tokenSha256:hash(owner.token),fileIdentity:fileId(stat)}};
  }catch(error){fs.closeSync(fd);throw error;}
}
function effective(row,saved){return {...row,state:"unknown",phase:"readonly_owner_exited",code:"readonly_transport_owner_exited",delivery:"unknown",replayAllowed:false,
  transportDisposition:{schema:SCHEMA,sha256:saved.sha256,historicalOutcome:"unknown",aeExecutionProven:false,projectGuardsReleased:false,replayAllowed:false}};}
function auditedRetirement(context,row){const saved=read(context.root,row.requestId,"disposition");if(!saved)return null;const v=saved.value,captured=intent(context,row),current=identity(context,row),consumed=read(context.root,row.requestId,"consumed");
  if(v.schema!==SCHEMA || v.requestId!==row.requestId || v.action!=="plan.reconcile" || v.runId!==captured.value.envelope.args.runId ||
    v.signature!==row.signature || v.intentSha256!==captured.sha256 || !consumed || v.consumedSha256!==consumed.sha256 ||
    v.receiptSha256!==current.receiptSha256 || v.indexIdentitySha256!==current.indexIdentitySha256 || v.state!=="unknown" || v.delivery!=="unknown" ||
    v.replayAllowed!==false || v.aeExecutionProven!==false || v.projectGuardsReleased!==false || consumed.value.schema!==SCHEMA+".consumed" ||
    consumed.value.requestId!==row.requestId || consumed.value.status!=="consumed_before_controller_retirement" || consumed.value.replayAllowed!==false ||
    v.witness?.owner?.requestId!==row.requestId || !Number.isInteger(v.witness?.owner?.pid) || v.witness.owner.pid<1 ||
    !/^[a-f0-9]{64}$/.test(v.witness?.owner?.tokenSha256 || "") || !/^\d+$/.test(v.witness?.owner?.fileIdentity?.dev || "") ||
    !/^\d+$/.test(v.witness?.owner?.fileIdentity?.ino || "") || !same(consumed.value.witness,v.witness) ||
    !validActor(v.witness?.actor) || !sameBinding(v.witness.actor,row.binding) || !/^[a-f0-9]{64}$/.test(v.witness?.targetSha256 || "") ||
    v.witness?.observations?.count!==2 || !Array.isArray(v.witness.observations.timestamps) || v.witness.observations.timestamps.length!==2 ||
    v.witness.observations.timestamps.some(t=>typeof t!=="string" || !Number.isFinite(Date.parse(t))) ||
    !context.dead(v.witness?.owner?.pid))fail("readonly_orphan_disposition_invalid");
  const owner=context.readLock();if(owner && owner.requestId===row.requestId)fail("readonly_orphan_retirement_unknown_no_replay");
  return {saved,identity:{...current,intentSha256:captured.sha256,consumedSha256:consumed.sha256,dispositionSha256:saved.sha256}};
}
async function validate(context,row){const original=auditedRetirement(context,row);if(!original)return null;
  // Completed retirement is historical evidence. A legitimate reload can replace
  // its actor/target; only a fresh stable pair from the fixed service reader can
  // supply the current admission binding. Never rewrite the historical chain.
  const observed=await snapshots(context,row.requestId),after=auditedRetirement(context,row);
  if(!after || !same(original.identity,after.identity))fail("readonly_orphan_transport_changed");
  return {saved:original.saved,receipt:effective(row,original.saved),actor:observed.actor,targetSha256:observed.targetSha256};
}
async function retire(context,row){const existing=read(context.root,row.requestId,"disposition");if(existing)return validate(context,row);
  if(read(context.root,row.requestId,"consumed"))fail("readonly_orphan_retirement_unknown_no_replay");
  const captured=intent(context,row),original=identity(context,row),held=heldOwner(context,row);
  try{const observed=await snapshots(context,row.requestId);if(!sameBinding(observed.actor,row.binding))fail("readonly_orphan_historical_actor_changed");
    held.check();if(captured.sha256!==intent(context,row).sha256 || !same(original,identity(context,row)))fail("readonly_orphan_transport_changed");
    const witness={owner:held.witness,actor:observed.actor,targetSha256:observed.targetSha256,observations:observed.observations};
    const consumed=writeOnce(context.root,row.requestId,"consumed",{schema:SCHEMA+".consumed",requestId:row.requestId,status:"consumed_before_controller_retirement",witness,replayAllowed:false});
    const saved=writeOnce(context.root,row.requestId,"disposition",{schema:SCHEMA,requestId:row.requestId,action:row.action,runId:captured.value.envelope.args.runId,signature:row.signature,
      ...original,intentSha256:captured.sha256,consumedSha256:consumed.sha256,witness,state:"unknown",delivery:"unknown",replayAllowed:false,aeExecutionProven:false,projectGuardsReleased:false});
    held.check();if(captured.sha256!==intent(context,row).sha256 || !same(original,identity(context,row)))fail("readonly_orphan_transport_changed");
    // Node lacks delete-by-held-handle. This sync tuple/file-id recheck + unlink
    // is a cooperative sole-controller contract, not hostile-writer isolation.
    fs.unlinkSync(held.file);return {saved,receipt:effective(row,saved),actor:observed.actor,targetSha256:observed.targetSha256};
  }finally{fs.closeSync(held.fd);}
}
module.exports={SCHEMA,hash,filename,read,capture,validate,retire,effective,validEnvelope,bytes};
