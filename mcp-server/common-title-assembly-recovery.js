"use strict";
// One reviewed assembly only. A current-state attestation never repairs its lost native receipt.
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const records=require("./plan-run-records"),evidence=require("./review-evidence"),contract=require("../cep-panel/panel-action-contract");
const {normalizeProject}=require("./proposal-state");
const SCHEMA="ae-agent-common-title-assembly-recovery.v1",ENVELOPE=SCHEMA+".envelope",CAPSULE="ae-agent-common-title-maintenance-capsule.v1";
const PROFILE="common-title-assembly",READ="common_title_assembly_verify",TTL=120000;
const RUN_ID="c6d0acfb-5c05-4897-80a9-e509ab0a47cf",REQUEST_ID="cb5c3b53-5443-474e-93df-aa8210758886";
const SCRIPT_SHA="9d4bfaeb6dcf9ed0695ee009abb47ccbaf888b2ea775568df5572771e2e22262";
const EXPECTED={actionId:"act_ae09f5e384924b2daa93ed8c28d0f23a",proposalRevision:28,payloadHash:"sha256:8bff0e624fd0d05badff47c2da166483ba219a9e23860246c112e4cb38d4859b",planSha256:"9ed7e2bc88aabd098e9b132a3a94554b6441c545fdbb589ffec058dfe228152d",projectId:"57cdf8871d2b96a6a3b6d1826524be0aa502ffbbcc85a889f04467339494f64c"};
const COMMAND_ID="46c48624-f17d-448b-a546-6abde406295b",SHA=/^[a-f0-9]{64}$/;
const MODULE_SHA=records.digest(fs.readFileSync(__filename));
const hash=v=>records.digest(JSON.stringify(v)),equal=(a,b)=>evidence.canonical(a)===evidence.canonical(b);
const fail=code=>{throw Object.assign(new Error(code),{code});};
const when=s=>typeof s==="string"&&Number.isFinite(Date.parse(s));
function inputs(args){if(!args || Object.keys(args).some(k=>!["runId","originalRequestId"].includes(k)) || args.runId!==RUN_ID || args.originalRequestId!==REQUEST_ID)fail("common_title_client_evidence_or_selector_invalid");}
function recognize(script){
  if(typeof script!=="string" || script.length!==94378 || records.digest(script)!==SCRIPT_SHA)fail("common_title_script_unrecognized");
  const marker="    var baseline = ",start=script.indexOf(marker),end=script.indexOf(";\n    var targetName",start),name=script.match(/    var targetName = ("[^\n]+?");\n/);
  if(start<0 || end<0 || !name || script.indexOf(marker,start+marker.length)!==-1)fail("common_title_baseline_invalid");
  let baseline,targetName;try{baseline=JSON.parse(script.slice(start+marker.length,end));targetName=JSON.parse(name[1]);}catch(_){fail("common_title_baseline_invalid");}
  if(!baseline?.project || baseline.comps?.length!==11 || baseline.queueItems!==0 || targetName!=="TITR_ALL_VARIANTS_20261009" || new Set(baseline.comps.map(c=>c.id)).size!==11 || new Set(baseline.comps.map(c=>c.name)).size!==11 || baseline.comps.some((c,i)=>c.name!=="TITR_"+String(i+1).padStart(2,"0") || c.layers.filter(l=>l.id===c.acceptedId && l.text!==null).length!==1))fail("common_title_baseline_invalid");
  // The recognized finite body has no scheduling, nested eval or external process lane.
  if(/scheduleTask|evalScript|system\.callSystem|\.execute\s*\(|\beval\s*\(/.test(script))fail("common_title_async_body_unsupported");
  return {baseline,targetName,script};
}
function inspectRecord(record){
  const run=record?.run,p=run?.provenance,s=run?.steps?.[1],c=s?.commands?.filter(c=>c.role==="mutation");
  if(record?.schema!=="ae-agent-plan-run-record.v1" || record.runId!==RUN_ID || run?.id!==RUN_ID || run.dryRun!==false || run.confirm!==true || run.allowMutations!==true || run.ok!==false || run.validation?.ok!==true || record.plan?.steps?.length!==3 || run.steps?.length!==2 || record.plan.steps[0].tool!=="checkpoint_project" || record.plan.steps[1].tool!=="run_extendscript" || record.plan.steps[2].tool!=="get_project_info" || run.steps[0].status!=="completed" || s.tool!=="run_extendscript" || s.status!=="failed" || s.errorCode!=="timed_out_after_submit" || !when(run.finishedAt) || !p || Object.keys(EXPECTED).some(k=>p[k]!==EXPECTED[k]) || p.planSha256!==evidence.sha256(record.plan) || p.projectId!==evidence.sha256(normalizeProject(record.project?.file)) || run.m100Action?.confirmedBySurface!=="cep-panel" || run.m100Action?.actionId!==p.actionId || run.m100Action?.payloadHash!==p.payloadHash || run.safety?.allowWithoutCheckpoint!==false || run.safety?.allowRawExtendscript!==true || run.safety?.rawExtendscriptGate?.status!=="approved" || c?.length!==1 || c[0].id!==COMMAND_ID || c[0].executionId!==RUN_ID || c[0].state!=="timed_out_after_submit" || c[0].timedOutFrom!=="submitted" || c[0].ok!==false || c[0].result!==null || !records.ID.test(c[0].leaseId || "") || !c[0].leaseOwner?.panelConnectionId || !c[0].leaseOwner?.panelGeneration || !equal(c[0].history,["queued","leased","submitted","timed_out_after_submit"]))fail("common_title_canonical_run_invalid");
  if(![run.startedAt,run.finishedAt,c[0].createdAt,c[0].leasedAt,c[0].submittedAt,c[0].completedAt].every(when) || !(Date.parse(run.startedAt)<=Date.parse(c[0].createdAt) && Date.parse(c[0].createdAt)<=Date.parse(c[0].leasedAt) && Date.parse(c[0].leasedAt)<=Date.parse(c[0].submittedAt) && Date.parse(c[0].submittedAt)<=Date.parse(c[0].completedAt) && Date.parse(c[0].completedAt)<=Date.parse(run.finishedAt)))fail("common_title_original_command_timestamps_invalid");
  const known=recognize(record.plan.steps[1].args?.script),checkpoint=run.checkpoint;
  if(normalizeProject(known.baseline.project.file)!==normalizeProject(record.project.file) || !checkpoint || !equal(checkpoint,run.steps[0].result && Object.fromEntries(Object.keys(checkpoint).map(k=>[k,run.steps[0].result[k]]))) || normalizeProject(checkpoint.sourceFile)!==normalizeProject(record.project.file) || checkpoint.label!=="titles-common-comp-before-20261009" || checkpoint.bytes!==31213688 || !when(checkpoint.createdAt) || Date.parse(checkpoint.createdAt)>Date.parse(c[0].submittedAt) || s.args.timeoutMs!==60000 || records.digest(s.args.script || "")!==SCRIPT_SHA || run.validation.steps?.[1]?.safeArgs?.script!==record.plan.steps[1].args.script)fail("common_title_checkpoint_or_step_binding_invalid");
  return {...known,command:c[0],runEnvelopeSha256:hash(record)};
}
function validateLinkage(record,local,remote){
  inspectRecord(record);const projected=contract.redactState(record.run);
  for(const r of [local,remote])if(!r || r.requestId!==REQUEST_ID || r.action!=="plan.run" || r.state!=="unknown" || r.phase!=="outcome_unresolved" || r.runId!==RUN_ID || r.replayAllowed!==false || !equal(r.result?.run,projected))fail("common_title_original_projection_conflict");
  if(!SHA.test(local.signature || "") || !equal(local.binding,{panelInstanceId:remote.panelInstanceId,panelLifecycleEpoch:remote.epoch,panelGeneration:remote.generation}) || !equal(local.binding,{panelInstanceId:local.panelInstanceId,panelLifecycleEpoch:local.epoch,panelGeneration:local.generation}))fail("common_title_original_binding_invalid");
  return {originalRequestId:REQUEST_ID,runId:RUN_ID,originalBinding:local.binding,transportIdentityHash:evidence.sha256(local.signature)};
}
function idle(status){if(!status || status.pendingCommands!==0 || status.inflightCommands?.length!==0 || status.activeEditSession || status.projectLifecycle?.blocked || status.projectLifecycle?.pending)fail("common_title_writer_not_idle");}
function validateBarrier(record,retained,status,panel,now=Date.now()){
  const {command,baseline}=inspectRecord(record),c=retained?.command;idle(status);
  if(!c || retained.ok!==true || c.state!=="completed" || c.lifecycleState!=="completed" || retained.lifecycleState!=="completed" || c.timedOutFrom || c.errorCode || retained.error || !records.ID.test(c.id || "") || !records.ID.test(c.executionId || "") || !records.ID.test(c.leaseId || "") || !SHA.test(retained.receiptDigest || "") || !when(c.submittedAt) || !when(c.completedAt) || Date.parse(c.submittedAt)<=Date.parse(command.submittedAt) || Date.parse(c.completedAt)<Date.parse(c.submittedAt) || now-Date.parse(c.completedAt)>TTL || now<Date.parse(c.completedAt) || !equal(c.leaseOwner,command.leaseOwner) || status.lastPanelInfo?.panelConnectionId!==c.leaseOwner.panelConnectionId || status.lastPanelInfo?.panelGeneration!==c.leaseOwner.panelGeneration || panel?.bridgeConnection?.panelConnectionId!==c.leaseOwner.panelConnectionId || panel.panelGeneration!==c.leaseOwner.panelGeneration || panel.nativeControlIdle!==true || normalizeProject(retained.result?.file)!==normalizeProject(baseline.project.file) || retained.result.numItems!==baseline.project.numItems+1 || !Number.isSafeInteger(retained.result.revision))fail("common_title_completed_host_barrier_missing_or_stale");
  return {id:c.id,receiptDigest:retained.receiptDigest,command:c,result:retained.result};
}
function storeFile(root,kind){return path.join(root,"evidence","common-title-assembly-recovery",RUN_ID,kind+".json");}
function write(root,kind,value){
  const file=storeFile(root,kind),json=JSON.stringify(value),wrapper={schema:ENVELOPE,sha256:records.digest(json),value};if(Buffer.byteLength(json)>2*1024*1024)fail("common_title_store_budget");
  fs.mkdirSync(path.dirname(file),{recursive:true});records.containedFile(root,path.dirname(file));if(fs.existsSync(file))records.containedFile(root,file);
  const temp=file+"."+crypto.randomUUID()+".tmp",fd=fs.openSync(temp,"wx",0o600);try{fs.writeFileSync(fd,JSON.stringify(wrapper),"utf8");fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(temp,file);return wrapper;
}
function read(root,kind){try{const file=records.containedFile(root,storeFile(root,kind)),s=fs.statSync(file);if(!s.isFile() || s.nlink!==1 || s.size>2*1024*1024)fail("common_title_store_invalid");const v=JSON.parse(fs.readFileSync(file,"utf8"));if(v.schema!==ENVELOPE || !SHA.test(v.sha256 || "") || hash(v.value)!==v.sha256)fail("common_title_store_invalid");return v;}catch(e){if(e.code==="ENOENT")return null;throw e;}}
function createCapsule({record,local,remote,retained,status,panel,installed,runtime,now=Date.now()}){
  const link=validateLinkage(record,local,remote),barrier=validateBarrier(record,retained,status,panel,now),known=inspectRecord(record);
  if(!installed?.indexPath || !installed.hashes || ["panel-action-contract.js","panel-actions.js","panel.js"].some(k=>!SHA.test(installed.loadedOldScriptHashes?.[k] || "") || installed.loadedOldScriptHashes[k]!==installed.historicalNormalizedHashes?.[k]) || !equal(runtime,record.run.provenance.runtime) || !status.recentEvents?.some(e=>e.runtime?.sourceSha256===runtime.sourceSha256 && e.runtime?.gitCommit===runtime.gitCommit && e.type==="ae_command_result" && e.details?.id===barrier.id && e.details.ok===true && e.details.lifecycleState==="completed"))fail("common_title_old_runtime_unproven");
  const oldPanelBinding={panelInstanceId:panel.panelInstanceId,panelLifecycleEpoch:panel.panelLifecycleEpoch,panelGeneration:panel.panelGeneration};if(!equal(oldPanelBinding,link.originalBinding))fail("common_title_old_panel_binding_changed");
  return {schema:CAPSULE,capsuleId:crypto.randomUUID(),...link,...EXPECTED,runEnvelopeSha256:known.runEnvelopeSha256,scriptSha256:SCRIPT_SHA,barrier,oldPanelBinding,panelConnectionId:barrier.command.leaseOwner.panelConnectionId,nativeControlIdle:true,installed,oldRuntime:runtime,collectorModuleSha256:MODULE_SHA,createdAt:new Date(now).toISOString(),expiresAt:new Date(now+TTL).toISOString(),guardReleased:false,replayAllowed:false};
}
function validateCapsule(capsule,record,local,now=Date.now()){
  const c=capsule?.value,known=inspectRecord(record);validateLinkage(record,local,local);
  if(capsule?.schema!==ENVELOPE || hash(c)!==capsule.sha256 || c.schema!==CAPSULE || c.runEnvelopeSha256!==known.runEnvelopeSha256 || c.runId!==RUN_ID || c.originalRequestId!==REQUEST_ID || c.scriptSha256!==SCRIPT_SHA || c.transportIdentityHash!==evidence.sha256(local.signature) || !equal(c.originalBinding,local.binding) || c.guardReleased!==false || c.replayAllowed!==false || !when(c.createdAt) || !when(c.expiresAt) || Date.parse(c.expiresAt)-Date.parse(c.createdAt)!==TTL || now>=Date.parse(c.expiresAt) || now<Date.parse(c.createdAt) || !equal(c.oldRuntime,record.run.provenance.runtime) || c.collectorModuleSha256!==MODULE_SHA)fail("common_title_capsule_invalid_or_expired");
  if(!equal(c.oldPanelBinding,c.originalBinding))fail("common_title_old_panel_binding_changed");
  validateBarrier(record,{...c.barrier,ok:true,lifecycleState:"completed"},{pendingCommands:0,inflightCommands:[],lastPanelInfo:c.barrier?.command?.leaseOwner},{...c.oldPanelBinding,bridgeConnection:{panelConnectionId:c.panelConnectionId},nativeControlIdle:c.nativeControlIdle},Date.parse(c.createdAt));
  return c;
}
function nativeVerify(baseline,targetName){
  var revision=Number(app.project.revision),common=null,count=0,i,j,source,copy,wanted,sources=[],copies=[],map=[],base=baseline.comps[0],first=null;
  requireValue(app.project && app.project.file && normPath(app.project.file.fsName)===normPath(baseline.project.file),"recovery_project_mismatch");
  requireValue(typeof app.project.revision==="number" && isFinite(revision) && app.project.numItems===baseline.project.numItems+1 && app.project.bitsPerChannel===baseline.project.bitsPerChannel && app.project.renderQueue.numItems===baseline.queueItems && !app.project.renderQueue.rendering,"recovery_project_footprint_mismatch");
  for(i=1;i<=app.project.numItems;i++){var item=app.project.item(i);if(item.name===targetName){requireValue(item instanceof CompItem,"recovery_target_not_comp");common=item;count++;}}
  requireValue(count===1 && common.numLayers===base.numLayers+10,"recovery_unique_common_comp_required");
  var content=[],baseAccepted=null;
  for(i=0;i<baseline.comps.length;i++){
    wanted=baseline.comps[i];source=compById(wanted.id);checkCompBaseline(source,wanted);var accepted=layerById(source,wanted.acceptedId),acceptedExpected=null;
    for(j=0;j<wanted.layers.length;j++)if(wanted.layers[j].id===wanted.acceptedId)acceptedExpected=wanted.layers[j];
    acceptedDocument(accepted,acceptedExpected,wanted.name);copy=null;count=0;
    for(j=1;j<=common.numLayers;j++)if(common.layer(j).name===wanted.name){copy=common.layer(j);count++;}
    requireValue(count===1 && copy.matchName==="ADBE Text Layer" && copy.enabled===(i===0),"recovery_unique_controlled_copy_required:"+wanted.name);
    if(i===0){first=copy.index;baseAccepted=acceptedExpected;}
    requireValue(copy.index===first+i && copy.parent===null && copy.hasTrackMatte && !copy.isTrackMatte && copy.trackMatteType===TrackMatteType.ALPHA,"recovery_controlled_order_or_matte_mismatch:"+wanted.name);
    equal(layerContent(copy,wanted.time),layerContent(accepted,wanted.time),"recovery_current_full_copy_source:"+wanted.name);
    copies.push(copy);sources.push(source);content.push({variantId:wanted.name,sourceCompId:wanted.id,sourceLayerId:wanted.acceptedId,layerId:copy.id,content:digest(canonical(layerContent(copy,wanted.time)))});
  }
  requireValue(first===baseAccepted.state.index,"recovery_controlled_insert_position_mismatch");
  source=sources[0];var left=compState(common),right=compState(source);delete left.id;delete left.name;delete left.numLayers;delete left.time;delete right.id;delete right.name;delete right.numLayers;delete right.time;equal(left,right,"recovery_common_comp_settings");
  for(i=0;i<base.layers.length;i++){wanted=base.layers[i];var index=wanted.state.index+(wanted.state.index>first ? 10 : 0);copy=common.layer(index);source=layerById(sources[0],wanted.id);requireValue(copy.name===source.name && copy.matchName===source.matchName && copy.enabled===source.enabled,"recovery_background_identity_mismatch");map.push({sourceId:source.id,cloneId:copy.id});equal(layerContent(copy,base.time),layerContent(source,base.time),"recovery_current_background_content:"+wanted.id);}
  function mapped(id){if(id===null)return null;var n;for(n=0;n<map.length;n++)if(map[n].sourceId===id)return map[n].cloneId;fail("recovery_background_mapping_missing");}
  var matte=layerById(common,mapped(69912)),adjustment=layerById(common,mapped(69913));
  requireValue(matte.index===2 && !matte.enabled && matte.isTrackMatte && adjustment.index===1 && adjustment.enabled && adjustment.adjustmentLayer,"recovery_shared_background_roles_mismatch");
  for(i=0;i<copies.length;i++)requireValue(copies[i].trackMatteLayer===matte,"recovery_controlled_matte_link_mismatch");
  for(i=0;i<map.length;i++){source=layerById(sources[0],map[i].sourceId);copy=layerById(common,map[i].cloneId);requireValue((copy.parent ? copy.parent.id : null)===mapped(source.parent ? source.parent.id : null) && (copy.trackMatteLayer ? copy.trackMatteLayer.id : null)===mapped(source.trackMatteLayer ? source.trackMatteLayer.id : null) && copy.trackMatteType===source.trackMatteType,"recovery_background_relation_mismatch");}
  requireValue(app.project.revision===revision && normPath(app.project.file.fsName)===normPath(baseline.project.file),"recovery_project_changed_during_read");
  return {schema:"ae-agent-common-title-current-state-native.v1",projectFile:String(app.project.file.fsName),revisionBefore:revision,revisionAfter:Number(app.project.revision),numItems:app.project.numItems,commonCompId:common.id,commonCompName:String(common.name),layerCount:common.numLayers,variants:content,baseCloneMap:map,currentFullCopySourceContentEqual:true,sourceBaselineStateTextEqual:true,historicalFullSourceContentUnchanged:false,mutations:0};
}
function verifierScript(record){
  const known=inspectRecord(record),a=known.script.indexOf("    function fail("),b=known.script.indexOf("    function copyLayer("),helpers=known.script.slice(a,b);
  if(a<0 || b<a || /setValue|setValueAtTime|copyToComp\s*\(|beginUndoGroup|\.duplicate\s*\(/.test(helpers))fail("common_title_verifier_helper_mutation_forbidden");
  const definitions=helpers.replace("        result.preExpressionValue = propertyValue(property.valueAtTime(sampleTime, true), type, path);\n        result.evaluatedValue = propertyValue(property.valueAtTime(sampleTime, false), type, path);","        if (result.numKeys === 0) result.staticPreExpressionValue = propertyValue(property.valueAtTime(0, true), type, path);")
    .replace('propertyTree(layer.property("ADBE Marker"), sampleTime, "markers")];','propertyTree(layer.property("ADBE Marker"), sampleTime, "markers"), propertyTree(layer.property("ADBE Mask Parade"), sampleTime, "masks")];')
    .replace('        requireValue(property, "property_tree_missing:" + path);','        requireValue(property, "property_tree_missing:" + path);\n        recoveryPropertyCount++; requireValue(recoveryPropertyCount <= 50000, "recovery_property_tree_budget");')
    .replace('        result.numKeys = Number(property.numKeys); result.keys = [];','        requireValue(typeof property.numKeys === "number" && property.numKeys >= 0 && property.numKeys === Math.floor(property.numKeys) && property.numKeys <= 5000, "recovery_key_definition_unavailable");\n        recoveryKeyCount += property.numKeys; requireValue(recoveryKeyCount <= 20000, "recovery_key_definition_budget");\n        result.numKeys = Number(property.numKeys); result.keys = [];');
  const keyStart=definitions.indexOf("    function optionalKey("),keyEnd=definitions.indexOf("    function propertyTree(",keyStart);
  const strict=definitions.slice(0,keyStart)+definitions.slice(keyStart,keyEnd).replace(/return \{unavailable: true\};/g,'fail("recovery_key_metadata_unavailable:" + method);')+definitions.slice(keyEnd);
  const body="var recoveryPropertyCount=0,recoveryKeyCount=0;\n"+strict+"\nvar nativeVerify="+nativeVerify.toString()+";return nativeVerify("+JSON.stringify(known.baseline)+","+JSON.stringify(known.targetName)+");";
  return {body,sha256:records.digest(body),baseline:known.baseline};
}
function validateNative(result,record){
  const known=inspectRecord(record);
  if(result?.schema!=="ae-agent-common-title-current-state-native.v1" || normalizeProject(result.projectFile)!==normalizeProject(known.baseline.project.file) || !Number.isSafeInteger(result.revisionBefore) || result.revisionBefore!==result.revisionAfter || result.numItems!==known.baseline.project.numItems+1 || result.commonCompName!==known.targetName || !Number.isSafeInteger(result.commonCompId) || known.baseline.comps.some(c=>c.id===result.commonCompId) || result.layerCount!==19 || result.variants?.length!==11 || new Set(result.variants.map(v=>v.layerId)).size!==11 || result.variants.some((v,i)=>v.variantId!==known.baseline.comps[i].name || v.sourceCompId!==known.baseline.comps[i].id || v.sourceLayerId!==known.baseline.comps[i].acceptedId) || result.currentFullCopySourceContentEqual!==true || result.sourceBaselineStateTextEqual!==true || result.historicalFullSourceContentUnchanged!==false || result.mutations!==0)fail("common_title_native_verification_invalid");
  return result;
}
function adjudicate({record,local,remote,native,runtime,command}){
  const link=validateLinkage(record,local,remote),known=inspectRecord(record),verifier=verifierScript(record);validateNative(native,record);
  if(!command || command.state!=="completed" || command.lifecycleState!=="completed" || command.ok!==true || !records.ID.test(command.id || "") || !records.ID.test(command.executionId || "") || !records.ID.test(command.leaseId || "") || !command.leaseOwner?.panelConnectionId || !command.leaseOwner?.panelGeneration || command.timedOutFrom || !when(command.submittedAt) || !when(command.completedAt) || Date.parse(command.submittedAt)>Date.parse(command.completedAt))fail("common_title_verifier_command_unproven");
  const value={schema:SCHEMA,recoveryId:crypto.randomUUID(),...link,...EXPECTED,originalAction:"plan.run",runEnvelopeSha256:known.runEnvelopeSha256,scriptSha256:SCRIPT_SHA,status:"verified_current_state",native,verifierBodySha256:verifier.sha256,verifierModuleSha256:MODULE_SHA,verifierRuntime:runtime,originalRuntime:record.run.provenance.runtime,verificationCommand:command,limits:{sourceComps:11,commonLayers:19,preMutationFullPropertyTreesPersisted:false,executionReceiptRecovered:false,proof:"current_source_copy_definitions_and_inline_baseline_state_text"},observedAt:new Date().toISOString(),historicalExecutionOutcome:"unknown",historicalFullSourceContentUnchanged:false,originalNativeReceiptRecovered:false,replayAllowed:false,artisticAccepted:false};
  return {schema:ENVELOPE,sha256:hash(value),value};
}
function validateRecovery(envelope,record,local){
  const r=envelope?.value;inspectRecord(record);validateLinkage(record,local,local);
  if(envelope?.schema!==ENVELOPE || hash(r)!==envelope.sha256 || r.schema!==SCHEMA || r.status!=="verified_current_state" || r.runId!==RUN_ID || r.originalRequestId!==REQUEST_ID || r.runEnvelopeSha256!==hash(record) || r.scriptSha256!==SCRIPT_SHA || r.transportIdentityHash!==evidence.sha256(local.signature) || !equal(r.originalBinding,local.binding) || r.historicalExecutionOutcome!=="unknown" || r.originalNativeReceiptRecovered!==false || r.historicalFullSourceContentUnchanged!==false || r.replayAllowed!==false || r.artisticAccepted!==false || r.verifierBodySha256!==verifierScript(record).sha256 || r.verifierModuleSha256!==MODULE_SHA)fail("common_title_recovery_binding_invalid");validateNative(r.native,record);return r;
}
module.exports={SCHEMA,ENVELOPE,CAPSULE,PROFILE,READ,TTL,RUN_ID,REQUEST_ID,SCRIPT_SHA,EXPECTED,inputs,recognize,inspectRecord,validateLinkage,idle,validateBarrier,storeFile,read,write,createCapsule,validateCapsule,verifierScript,validateNative,adjudicate,validateRecovery,hash};
