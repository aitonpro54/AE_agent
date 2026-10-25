"use strict";

// A reset abandons control, never the history or the effects of an old command.
// All paths/selectors below are private. The public operation accepts no input.
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const LOADED_PRECONNECT_SOURCE_SHA256=crypto.createHash("sha256").update(fs.readFileSync(__filename)).digest("hex");
const authority=require("./owned-runtime-authority"),r1=require("./owned-runtime-lifecycle"),ledger=require("./native-fixture-attempt-ledger");
const SCHEMA="ae-agent.product-session-reset.v1",POLICY=SCHEMA+".policy";
const FAILED_START=Object.freeze({operationId:"67226724-68f7-4d65-8e53-332ce661c63d",generation:"889f0a88-9a80-48e9-99c4-0d8961d9721f",predecessorGeneration:"deda8ab3-55ab-4178-bbae-41699bf41141"});
const same=(a,b)=>r1.canonical(a)===r1.canonical(b),uuid=v=>ledger.UUID.test(v||"");
function fail(code){throw Object.assign(Error(code),{code});}
function exact(v,keys){authority.exact(v,keys,"owned_product_reset_contract_invalid");}
function authorization(v){exact(v,["source","reference"]);if(v.source!=="explicit_user_chat"||typeof v.reference!=="string"||!v.reference.trim()||v.reference.length>512)fail("owned_product_reset_authorization_required");}
function signed(v,key){const {authentication,...data}=v;return crypto.createHmac("sha256",key).update(r1.canonical(data)).digest("hex");}
function readRow(file){const p=authority.privateFile(file),row=p.value;if(row.schema!==r1.SCHEMA+".envelope"||row.sha256!==r1.hash(row.value))fail("owned_product_reset_record_invalid");return {...p,row,value:row.value};}
function requiredPolicy(file,code){try{return authority.privateFile(file);}catch(error){if(error.code==="ENOENT")fail(code);throw error;}}
function policy(root,generation=null){
  if(require("./owned-runtime-product-lifecycle").legacyPresent(root)){
    if(!uuid(generation))fail("owned_product_reset_current_grant_required");const p=requiredPolicy(path.join(authority.base(root),"product-session-reset-policies",generation+".json"),"owned_product_reset_current_grant_required"),v=p.value,s=require("./owned-runtime-supervisor"),facts=s.registeredGeneration(root,generation);exact(v,["schema","enabled","authorization","capability","generation","currentRawSha256","registration","authentication"]);authorization(v.authorization);
    if(v.schema!==SCHEMA+".generation-policy"||v.enabled!==true||v.capability!=="reset_owned_runtime_product_session"||v.generation!==generation||!ledger.SHA.test(v.currentRawSha256||"")||!same(v.registration,facts.refs)||v.authentication!==signed(v,authority.runtimeControlFor(root).credential({daemon:{port:3456,credentialSha256:facts.reservation.value.credentialSha256}})))fail("owned_product_reset_current_grant_required");return {...p,policy:v};
  }
  const p=requiredPolicy(path.join(authority.base(root),"product-session-reset-policy.json"),"owned_product_reset_policy_required"),v=p.value;exact(v,["schema","enabled","authorization","capability"]);authorization(v.authorization);if(v.schema!==POLICY||v.enabled!==true||v.capability!=="reset_owned_runtime_product_session")fail("owned_product_reset_policy_required");return {...p,policy:v};
}
function legacyResetEligible(root,generation){
  require("./owned-runtime-product-activation").assertConfigurationRoots(root);
  const s=require("./owned-runtime-supervisor"),keyReader=v=>authority.runtimeControlFor(root).credential({daemon:{port:3456,credentialSha256:v.credentialSha256}}),current=s.readDaemonRegistration(root);if(!current||current.generation!==generation)fail("owned_product_reset_product_only");const anchor=sessionAnchor(root,generation,s.registeredGeneration,keyReader);
  if(!anchor?.legacyActivation||!s.readProductStopAuthority(root,generation)||!daemonSession({root,generation:anchor.value.generation,readGeneration:s.registeredGeneration,keyReader,retireEdit(){}}).activation())fail("owned_product_reset_product_only");return current;
}
function provision(reference,root=path.resolve(__dirname,"..")){
  if(require("./deployment-mode").deploymentMode()!=="product")fail("owned_product_reset_product_only");
  const ref={source:"explicit_user_chat",reference};authorization(ref);ledger.ensure(authority.base(root));
  if(require("./owned-runtime-product-lifecycle").legacyPresent(root)){
    const s=require("./owned-runtime-supervisor"),current=s.readDaemonRegistration(root),reg=legacyResetEligible(root,current?.generation),facts=s.registeredGeneration(root,reg.generation),dir=path.join(authority.base(root),"product-session-reset-policies"),file=path.join(dir,reg.generation+".json"),value={schema:SCHEMA+".generation-policy",enabled:true,authorization:ref,capability:"reset_owned_runtime_product_session",generation:reg.generation,currentRawSha256:snapshot(path.join(authority.base(root),"current-daemon.json")).sha256,registration:facts.refs,authentication:""};value.authentication=signed(value,authority.runtimeControlFor(root).credential({daemon:{port:3456,credentialSha256:facts.reservation.value.credentialSha256}}));
    if(ledger.proofExists(file)){const p=policy(root,reg.generation);if(!same(p.value,value))fail("owned_product_reset_policy_already_provisioned");return {ok:true,status:"reset_policy_present"};}ledger.ensure(dir);const fd=fs.openSync(file,"wx",0o600);try{fs.writeFileSync(fd,JSON.stringify(value));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}policy(root,reg.generation);return {ok:true,status:"reset_policy_provisioned"};
  }
  const file=path.join(authority.base(root),"product-session-reset-policy.json"),value={schema:POLICY,enabled:true,authorization:ref,capability:"reset_owned_runtime_product_session"};
  if(ledger.proofExists(file)){const p=policy(root);if(!same(p.policy,value))fail("owned_product_reset_policy_already_provisioned");return {ok:true,status:"reset_policy_present"};}
  const fd=fs.openSync(file,"wx",0o600);try{fs.writeFileSync(fd,JSON.stringify(value));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}policy(root);return {ok:true,status:"reset_policy_provisioned"};
}
function disposition(){return {oldOutcome:"unknown_preserved",oldExitProven:false,oldControlDisposition:"operator_abandoned",oldCapabilitiesValidInNewEpoch:false,oldCommandsReplayAllowed:false,oldEditOwnershipInherited:false,oldExternalEffectsAdjudicated:false,replayAllowed:false};}
function snapshot(file){try{const p=authority.privateFile(file);return {sha256:p.rawSha256,assertUnchanged:p.assertUnchanged};}catch(e){if(e.code!=="ENOENT")throw e;return {sha256:null,assertUnchanged(){try{fs.lstatSync(file);fail("owned_product_reset_baseline_changed");}catch(error){if(error.code!=="ENOENT")throw error;}}};}}
function assertLifecycle(root){const s=require("./project-lifecycle-transition").guardSnapshot({statePath:path.join(process.env.AE_BRIDGE_STATE_DIR||path.join(root,".codex-runtime","project-intent"),"project-intent-state.json")});if(s.pending)fail("owned_product_reset_pending_lifecycle_refused");if(s.problem&&!s.freshMissingStore)fail("owned_product_reset_lifecycle_unreadable");return s;}
function resetDir(root,id){if(!uuid(id))fail("owned_product_reset_selector_invalid");return path.join(authority.base(root),"product-session-resets",id);}
function bindingFile(root,generation){if(!uuid(generation))fail("owned_product_reset_generation_invalid");return path.join(authority.base(root),"daemon-reservations",generation,"product-session-reset.json");}
function readIntent(root,generation,keyReader){
  const binding=readRow(bindingFile(root,generation)),b=binding.value;exact(b,["schema","operationId","generation","intentSha256"]);
  const intent=readRow(path.join(resetDir(root,b.operationId),"intent.json")),v=intent.value;
  const activation=require("./owned-runtime-product-activation"),legacyActivation=b.schema===activation.SCHEMA+".binding",generationReset=b.schema===SCHEMA+".generation-binding";
  exact(v,["schema","operationId","generation","predecessorGeneration","predecessorCurrentRawSha256","predecessorRegistration","sourceSha256","authorizationRef","lifecycleAuthorizationRef","policyRawSha256","oldEditRawSha256","challenge","createdAt","disposition","authentication",...(legacyActivation?["activationKey","reviewDigest"]:[])]);
  if(b.schema!==(generationReset?SCHEMA+".generation-binding":(legacyActivation?activation.SCHEMA:SCHEMA)+".binding")||b.generation!==generation||b.intentSha256!==intent.row.sha256||v.schema!==(legacyActivation?activation.SCHEMA:SCHEMA)+".intent"||v.generation!==generation||v.operationId!==b.operationId||!uuid(v.predecessorGeneration)||!uuid(v.challenge)||!same(v.disposition,disposition())||v.authentication!==signed(v,keyReader(v.predecessorGeneration)))fail("owned_product_reset_intent_invalid");
  return {binding,intent,value:v,dir:resetDir(root,v.operationId)};
}
function readAnchor(root,generation,readGeneration,keyReader,roots=new Set()){return ledger.memoProofRead("product-reset-anchor:"+path.resolve(root)+":"+generation,()=>readAnchorUncached(root,generation,readGeneration,keyReader,roots));}
function readAnchorUncached(root,generation,readGeneration,keyReader,roots=new Set()){
  if(roots.has(generation)||roots.size>=32)fail("owned_product_reset_lineage_invalid");roots.add(generation);
  const x=readIntent(root,generation,g=>keyReader(readGeneration(root,g).reservation.value)),p=readRow(path.join(x.dir,"anchor.json")),v=p.value,facts=readGeneration(root,generation),key=keyReader(facts.reservation.value);
  let legacyActivation=x.value.schema===require("./owned-runtime-product-activation").SCHEMA+".intent";if(legacyActivation)require("./owned-runtime-product-activation").sessionGrant(root,x,readGeneration,keyReader);
  else if(require("./owned-runtime-product-lifecycle").legacyPresent(root)){const previous=sessionAnchor(root,x.value.predecessorGeneration,readGeneration,keyReader,roots);if(!previous?.legacyActivation||!same(x.value.predecessorRegistration,readGeneration(root,x.value.predecessorGeneration).refs))fail("owned_product_reset_activation_origin_required");const grant=policy(root,x.value.predecessorGeneration);if(grant.rawSha256!==x.value.policyRawSha256||grant.policy.currentRawSha256!==x.value.predecessorCurrentRawSha256||!same(grant.policy.authorization,x.value.authorizationRef))fail("owned_product_reset_current_grant_required");legacyActivation=true;}
  exact(v,["schema","operationId","generation","intentSha256","predecessorGeneration","predecessorRegistration","registration","sourceSha256","createdAt","disposition","authentication"]);
  if(v.schema!==SCHEMA+".anchor"||v.generation!==generation||v.operationId!==x.value.operationId||v.intentSha256!==x.intent.row.sha256||v.predecessorGeneration!==x.value.predecessorGeneration||!same(v.predecessorRegistration,x.value.predecessorRegistration)||!same(v.registration,facts.refs)||v.sourceSha256!==facts.reservation.value.sourceSha256||!same(v.disposition,disposition())||v.authentication!==signed(v,key))fail("owned_product_reset_anchor_invalid");
  if(x.value.oldEditRawSha256!==null){const old=readRow(path.join(x.dir,"old-edit.json")).value;if(old.schema!==SCHEMA+".old-edit"||old.rawSha256!==x.value.oldEditRawSha256||ledger.hash(Buffer.from(old.rawBase64,"base64"))!==old.rawSha256||old.replayAllowed!==false)fail("owned_product_reset_old_edit_archive_invalid");}
  function assertUnchanged(){p.assertUnchanged();x.binding.assertUnchanged();x.intent.assertUnchanged();readAnchor(root,generation,readGeneration,keyReader);}
  return {product:true,reset:true,...(legacyActivation?{legacyActivation:true}:{}),pins:{productResetAnchorRawSha256:p.rawSha256,initialGeneration:generation},value:v,assertUnchanged};
}
function sessionAnchor(root,generation,readGeneration,keyReader,roots=new Set()){
  // Locate a root, then supervisor verifies every real exit/succession edge.
  let g=generation;const seen=new Set(),dir=path.join(authority.base(root),"daemon-succession");
  while(uuid(g)&&!seen.has(g)&&seen.size<256){seen.add(g);if(ledger.proofExists(bindingFile(root,g)))return readAnchor(root,g,readGeneration,keyReader,roots);const f=path.join(dir,g+".json");if(!ledger.proofExists(f))return null;g=readRow(f).value.predecessorGeneration;}
  if(seen.size)fail("owned_product_reset_lineage_invalid");return null;
}
function currentStatus(root,reg,readGeneration,keyReader){
  if(!reg)return null;
  const anchor=sessionAnchor(root,reg.generation,readGeneration,keyReader);
  if(anchor){const state=daemonSession({root,generation:anchor.value.generation,readGeneration,keyReader,retireEdit(){}}),active=state.activation();return {ok:true,status:active?"reset_active":"reset_pending_preflight",statusSource:"durable_reset_record",operationId:anchor.value.operationId,generation:reg.generation,sessionRootGeneration:anchor.value.generation,daemonLiveness:"not_observed",liveAdmission:"not_observed",writeAdmissionReleased:false,...disposition()};}
  const pointer=snapshot(path.join(authority.base(root),"current-daemon.json")),key=r1.hash({predecessorGeneration:reg.generation,predecessorCurrentRawSha256:pointer.sha256}),file=path.join(authority.base(root),"product-session-reset-keys",key+".json");
  if(!ledger.proofExists(file))return null;const r=readBack(root,readRow(file).value.operationId);return {ok:true,status:r.status,statusSource:"durable_reset_record",operationId:r.operationId,generation:r.generation,daemonLiveness:"not_observed",liveAdmission:"not_observed",writeAdmissionReleased:false,...disposition()};
}
function readBack(root,id){const dir=resetDir(root,id),rows={};if(ledger.proofExists(dir))for(const name of fs.readdirSync(dir)){if(!/^(intent|absence|old-edit|anchor|activation|launch-intent|launch-result|unknown|result)\.json$/.test(name))fail("owned_product_reset_foreign_record");rows[name.slice(0,-5)]=readRow(path.join(dir,name)).row;}return {ok:true,status:rows.activation?"reset_active":rows.anchor?"reset_pending_preflight":"reset_partial_readback_only",operationId:id,generation:rows.intent?.value.generation||null,oldOutcome:"unknown_preserved",oldExitProven:false,replayAllowed:false,rows};}
async function reset(deps){
  const {root,native,current,readGeneration,keyReader,launch,publishCurrent,readSources,readLifecyclePolicy}=deps;
  if(require("./deployment-mode").deploymentMode()!=="product")fail("owned_product_reset_product_only");
  const lifecycle=readLifecyclePolicy(),reg=current();if(!reg)fail("owned_product_reset_registered_predecessor_required");if(require("./owned-runtime-product-lifecycle").legacyPresent(root))legacyResetEligible(root,reg.generation);const p=policy(root,reg.generation);
  if(ledger.proofExists(bindingFile(root,reg.generation))){const pending=readIntent(root,reg.generation,g=>keyReader(readGeneration(root,g).reservation.value));if(!ledger.proofExists(path.join(pending.dir,"activation.json")))return readBack(root,pending.value.operationId);}
  const pointer=snapshot(path.join(authority.base(root),"current-daemon.json")),key=r1.hash({predecessorGeneration:reg.generation,predecessorCurrentRawSha256:pointer.sha256}),keys=path.join(authority.base(root),"product-session-reset-keys"),keyFile=path.join(keys,key+".json");
  if(ledger.proofExists(keyFile))return readBack(root,readRow(keyFile).value.operationId);
  const source=readSources(),old=readGeneration(root,reg.generation),edit=snapshot(path.join(root,"logs","edit-session-active.json"));assertLifecycle(root);
  if(p.policy.schema===SCHEMA+".generation-policy"&&(p.policy.currentRawSha256!==pointer.sha256||!same(p.policy.registration,old.refs)))fail("owned_product_reset_current_grant_required");
  function unchanged(){p.assertUnchanged();readLifecyclePolicy(lifecycle.authorization);pointer.assertUnchanged();edit.assertUnchanged();assertLifecycle(root);if(current()?.generation!==reg.generation||readSources().sourceSha256!==source.sourceSha256)fail("owned_product_reset_baseline_changed");}
  async function absent(){unchanged();const probe=await native.probeOwned(reg.generation);if(probe.state!=="absent"||probe.win32Error!==87||probe.endpointFree!==true)fail("owned_product_reset_"+(["alive_exact","pid_reused","access_denied","unknown","endpoint_occupied"].includes(probe.state)?probe.state:"absence_unproven"));unchanged();return probe;}
  const first=await absent(),id=crypto.randomUUID(),generation=crypto.randomUUID(),bootNonce=crypto.randomUUID(),dir=resetDir(root,id);ledger.ensure(keys);
  r1.writeJournalOnce(keys,key,{schema:SCHEMA+".once",operationId:id,predecessorGeneration:reg.generation,predecessorCurrentRawSha256:pointer.sha256,replayAllowed:false});
  return startFreshReset(deps,{p,lifecycle,reg,pointer,source,old,edit,unchanged,absent},{first,id,generation,bootNonce,key});
}
async function startFreshReset(deps,baseline,selectors){
  const {root,native,readGeneration,keyReader,launch,publishCurrent}=deps,{p,lifecycle,reg,pointer,source,old,edit,unchanged,absent,activation}=baseline,{first,id,generation,bootNonce,key}=selectors,dir=resetDir(root,id);ledger.ensure(dir);
  const intent={schema:activation?.schema||SCHEMA+".intent",operationId:id,generation,predecessorGeneration:reg.generation,predecessorCurrentRawSha256:pointer.sha256,predecessorRegistration:old.refs,sourceSha256:source.sourceSha256,authorizationRef:p.policy.authorization,lifecycleAuthorizationRef:lifecycle.authorization,policyRawSha256:p.rawSha256,oldEditRawSha256:edit.sha256,challenge:crypto.randomUUID(),createdAt:new Date().toISOString(),disposition:disposition(),...activation?.extra,authentication:""};intent.authentication=signed(intent,keyReader(old.reservation.value));
  const intentRow=r1.writeJournalOnce(dir,"intent",intent);r1.writeJournalOnce(dir,"absence",{schema:SCHEMA+".absence",generation:reg.generation,probe:first,oldExitProven:false,replayAllowed:false});
  if(edit.sha256!==null){edit.assertUnchanged();r1.writeJournalOnce(dir,"old-edit",{schema:SCHEMA+".old-edit",rawSha256:edit.sha256,rawBase64:ledger.readBytes(path.join(root,"logs","edit-session-active.json")).toString("base64"),replayAllowed:false});}
  try{
    unchanged();const reserved=path.dirname(bindingFile(root,generation));ledger.ensure(reserved);r1.writeJournalOnce(reserved,"product-session-reset",{schema:activation?.bindingSchema||(p.policy.schema===SCHEMA+".generation-policy"?SCHEMA+".generation-binding":SCHEMA+".binding"),operationId:id,generation,intentSha256:intentRow.sha256});
    const op={id,dir,intent:{value:{authorizationRef:lifecycle.authorization,desiredSourceSha256:source.sourceSha256}}};
    const result=await launch(op,reg.generation,{generation,bootNonce,launchKey:key,beforeLaunch:absent});unchanged();
    const after=readGeneration(root,generation),anchor={schema:SCHEMA+".anchor",operationId:id,generation,intentSha256:intentRow.sha256,predecessorGeneration:reg.generation,predecessorRegistration:old.refs,registration:after.refs,sourceSha256:source.sourceSha256,createdAt:new Date().toISOString(),disposition:disposition(),authentication:""};anchor.authentication=signed(anchor,keyReader(after.reservation.value));r1.writeJournalOnce(dir,"anchor",anchor);
    readAnchor(root,generation,readGeneration,keyReader);unchanged();await native.assertHeld();await publishCurrent(generation,pointer.sha256);r1.writeJournalOnce(dir,"result",{ok:true,status:"reset_pending_preflight",generation,registration:result.registration,...disposition()});return {ok:true,status:"reset_pending_preflight",generation,operationId:id,writeAdmissionReleased:false,...disposition()};
  }catch(error){if(!ledger.proofExists(path.join(dir,"unknown.json")))r1.writeJournalOnce(dir,"unknown",{schema:SCHEMA+".unknown",code:/^owned_[a-z0-9_]+$/.test(error.code||"")?error.code:"owned_product_reset_unknown",generation,...disposition()});throw error;}
}
// Generic private failed-start selection. Old operation/launch keys stay
// consumed; each new recovery is keyed by the failed operation and exact pins,
// independent of source version. Registered/unknown candidates never launch.
function selectFailedStart(deps){
  const {root,current,readGeneration,keyReader}=deps,reg=current();if(!reg||!uuid(reg.generation))fail("owned_product_reset_registered_predecessor_required");
  let selected=null;
  // A lost publication ACK can leave current pointing to the recovery child.
  // Its signed binding identifies the original recovery, without directory scan.
  if(ledger.proofExists(bindingFile(root,reg.generation))){
    const x=readIntent(root,reg.generation,g=>keyReader(readGeneration(root,g).reservation.value)),file=path.join(authority.base(root),"product-session-reset-recoveries",x.value.operationId,"intent.json");
    if(ledger.proofExists(file)){const row=readRow(file).value;if(row.schema!==SCHEMA+".failed-start-intent"||row.operationId!==x.value.operationId||row.generation!==reg.generation||row.authentication!==signed(row,keyReader(readGeneration(root,x.value.predecessorGeneration).reservation.value)))fail("owned_product_reset_recovery_intent_invalid");selected=row.original;}
  }
  if(!selected){
    const pointer=snapshot(path.join(authority.base(root),"current-daemon.json")),key=r1.hash({predecessorGeneration:reg.generation,predecessorCurrentRawSha256:pointer.sha256}),once=readRow(path.join(authority.base(root),"product-session-reset-keys",key+".json")).value;
    if(once.schema!==SCHEMA+".once"||!uuid(once.operationId)||once.predecessorGeneration!==reg.generation||once.predecessorCurrentRawSha256!==pointer.sha256||once.replayAllowed!==false)fail("owned_product_reset_failed_start_once_invalid");
    const rows=readBack(root,once.operationId).rows,v=rows.intent?.value;
    if(!v||v.operationId!==once.operationId||v.predecessorGeneration!==reg.generation)fail("owned_product_reset_failed_start_binding_invalid");
    selected={operationId:v.operationId,generation:v.generation,predecessorGeneration:v.predecessorGeneration};
  }
  // Follow only a cryptographically verified, never-registered failed leaf.
  // An arbitrary partial/registered/activated child remains read-back only.
  const seen=new Set();
  for(let n=0;n<32;n++){
    if(seen.has(selected.operationId))fail("owned_product_reset_failed_start_cycle");seen.add(selected.operationId);
    const facts=failedStartFacts(deps,selected),paths=recoveryPaths(root,selected,facts.pins);if(!ledger.proofExists(paths.keyFile))return selected;
    const once=readRow(paths.keyFile),readback=recoveryReadBack(deps,facts,once);if(readback.rows.result||!readback.rows.intent)return selected;
    const next={operationId:readback.operationId,generation:readback.generation,predecessorGeneration:selected.predecessorGeneration},rows=readBack(root,next.operationId).rows;
    if(rows.unknown?.value.code!=="owned_supervisor_started_process_exited"||rows.anchor||rows.activation||rows.result||rows["launch-result"])return selected;
    failedStartFacts(deps,next);selected=next;
  }
  fail("owned_product_reset_failed_start_chain_budget");
}
function recoveryPaths(root,original,pins){const legacy=r1.hash(FAILED_START),key=same(original,FAILED_START)&&ledger.proofExists(path.join(authority.base(root),"product-session-reset-recovery-keys",legacy+".json"))?legacy:r1.hash({original,originalPins:pins});return {key,keyFile:path.join(authority.base(root),"product-session-reset-recovery-keys",key+".json"),directory:id=>path.join(authority.base(root),"product-session-reset-recoveries",id)};}
function failedStartFacts(deps,b=selectFailedStart(deps),depth=0){
  if(depth>32||!b||!uuid(b.operationId)||!uuid(b.generation)||!uuid(b.predecessorGeneration))fail("owned_product_reset_failed_start_selector_invalid");
  const {root,readGeneration,keyReader}=deps,old=readGeneration(root,b.predecessorGeneration),x=readIntent(root,b.generation,g=>keyReader(readGeneration(root,g).reservation.value)),v=x.value;
  if(v.operationId!==b.operationId||v.predecessorGeneration!==b.predecessorGeneration||!same(v.predecessorRegistration,old.refs))fail("owned_product_reset_failed_start_binding_invalid");
  const candidate=require("./owned-runtime-supervisor").readCandidate(root,b.generation),c=candidate.candidate.value;
  if(candidate.reservation.value.operationId!==b.operationId||c.sourceSha256!==v.sourceSha256)fail("owned_product_reset_failed_start_binding_invalid");
  const rows=readBack(root,b.operationId).rows,expected=["absence","intent","launch-intent","unknown",...(v.oldEditRawSha256===null?[]:["old-edit"])].sort();
  if(!same(Object.keys(rows).sort(),expected)||!same(rows.unknown.value,{schema:SCHEMA+".unknown",code:"owned_supervisor_started_process_exited",generation:b.generation,...disposition()}))fail("owned_product_reset_failed_start_not_unregistered");
  const launch=rows["launch-intent"].value;
  if(!same(launch,{generation:b.generation,reservationSha256:candidate.reservation.sha256,startupTicketSha256:candidate.ticket.sha256,replayAllowed:false}))fail("owned_product_reset_failed_start_launch_invalid");
  const reservationDir=path.dirname(bindingFile(root,b.generation));
  if(!same(fs.readdirSync(reservationDir).sort(),["native-candidate.json","product-session-reset.json","reservation.json","startup-ticket.json"]))fail("owned_product_reset_failed_start_not_unregistered");
  const oldKey=r1.hash({predecessorGeneration:b.predecessorGeneration,predecessorCurrentRawSha256:v.predecessorCurrentRawSha256}),standardOnce=path.join(authority.base(root),"product-session-reset-keys",oldKey+".json"),once=readRow(standardOnce);let onceFile=standardOnce,recoveryIntentFile=null;
  if(!same(once.value,{schema:SCHEMA+".once",operationId:b.operationId,predecessorGeneration:b.predecessorGeneration,predecessorCurrentRawSha256:v.predecessorCurrentRawSha256,replayAllowed:false})){
    recoveryIntentFile=path.join(authority.base(root),"product-session-reset-recoveries",b.operationId,"intent.json");const i=readRow(recoveryIntentFile).value;
    if(i.schema!==SCHEMA+".failed-start-intent"||i.operationId!==b.operationId||i.generation!==b.generation||i.original?.predecessorGeneration!==b.predecessorGeneration||i.authentication!==signed(i,keyReader(old.reservation.value)))fail("owned_product_reset_failed_start_once_invalid");
    const parent=failedStartFacts(deps,i.original,depth+1);if(!same(i.originalPins,parent.pins))fail("owned_product_reset_failed_start_once_invalid");
    onceFile=recoveryPaths(root,i.original,parent.pins).keyFile;const recoveryOnce=readRow(onceFile).value;
    if(!same(recoveryOnce,{schema:SCHEMA+".failed-start-once",operationId:b.operationId,original:i.original,originalPins:parent.pins,replayAllowed:false}))fail("owned_product_reset_failed_start_once_invalid");
  }
  if(v.oldEditRawSha256!==null){const a=rows["old-edit"].value;if(a.schema!==SCHEMA+".old-edit"||a.rawSha256!==v.oldEditRawSha256||ledger.hash(Buffer.from(a.rawBase64,"base64"))!==a.rawSha256||a.replayAllowed!==false)fail("owned_product_reset_old_edit_archive_invalid");}
  const files={intent:path.join(x.dir,"intent.json"),unknown:path.join(x.dir,"unknown.json"),absence:path.join(x.dir,"absence.json"),launchIntent:path.join(x.dir,"launch-intent.json"),binding:bindingFile(root,b.generation),reservation:path.join(reservationDir,"reservation.json"),ticket:path.join(reservationDir,"startup-ticket.json"),candidate:path.join(reservationDir,"native-candidate.json"),once:onceFile};if(v.oldEditRawSha256!==null)files.oldEdit=path.join(x.dir,"old-edit.json");if(recoveryIntentFile)files.recoveryIntent=recoveryIntentFile;
  const pins=Object.fromEntries(Object.entries(files).map(([name,file])=>[name,snapshot(file).sha256]));
  return {old,x,candidate,pins,original:b};
}
function recoveryReadBack(deps,facts,once){
  const {root,keyReader,readGeneration}=deps,paths=recoveryPaths(root,facts.original,facts.pins),b=facts.original,v=once.value;
  exact(v,["schema","operationId","original","originalPins","replayAllowed"]);
  if(v.schema!==SCHEMA+".failed-start-once"||!uuid(v.operationId)||!same(v.original,b)||!same(v.originalPins,facts.pins)||v.replayAllowed!==false)fail("owned_product_reset_recovery_once_invalid");
  const dir=paths.directory(v.operationId),rows={};if(ledger.proofExists(dir))for(const name of fs.readdirSync(dir)){if(!/^(intent|absence|unknown|result)\.json$/.test(name))fail("owned_product_reset_recovery_foreign_record");rows[name.slice(0,-5)]=readRow(path.join(dir,name)).row;}
  let generation=null;if(rows.intent){const i=rows.intent.value;exact(i,["schema","operationId","generation","original","originalPins","sourceSha256","createdAt","authentication"]);if(i.schema!==SCHEMA+".failed-start-intent"||i.operationId!==v.operationId||!uuid(i.generation)||!same(i.original,b)||!same(i.originalPins,facts.pins)||!ledger.SHA.test(i.sourceSha256||"")||!Number.isFinite(Date.parse(i.createdAt))||i.authentication!==signed(i,keyReader(facts.old.reservation.value)))fail("owned_product_reset_recovery_intent_invalid");generation=i.generation;}
  if(rows.result){if(!rows.intent||!same(rows.result.value,{ok:true,status:"reset_pending_preflight",generation,operationId:v.operationId,writeAdmissionReleased:false,...disposition()}))fail("owned_product_reset_recovery_result_invalid");const anchor=readAnchor(root,generation,readGeneration,keyReader);if(anchor.value.operationId!==v.operationId||anchor.value.sourceSha256!==rows.intent.value.sourceSha256||anchor.value.predecessorGeneration!==b.predecessorGeneration)fail("owned_product_reset_recovery_result_invalid");}
  return {ok:true,status:rows.result?"failed_start_recovered_pending_preflight":"failed_start_recovery_partial_readback_only",operationId:v.operationId,generation,original:b,writeAdmissionReleased:false,...disposition(),nextAction:{kind:rows.result?"complete_physical_product_session_preflight":"observe_exact_candidate_registration_or_failure",automaticReplayAllowed:false},rows};
}
function failedStartStatus(deps){const facts=failedStartFacts(deps),paths=recoveryPaths(deps.root,facts.original,facts.pins),b=facts.original;return ledger.proofExists(paths.keyFile)?recoveryReadBack(deps,facts,readRow(paths.keyFile)):{ok:true,status:"failed_start_recovery_not_attempted",original:b,writeAdmissionReleased:false,...disposition()};}
async function recoverFailedStart(deps){
  const {root,native,current,readGeneration,keyReader,readSources,readLifecyclePolicy}=deps;
  if(require("./deployment-mode").deploymentMode()!=="product")fail("owned_product_reset_product_only");
  const facts=failedStartFacts(deps),b=facts.original,paths=recoveryPaths(root,b,facts.pins);if(ledger.proofExists(paths.keyFile))return recoveryReadBack(deps,facts,readRow(paths.keyFile));
  if(require("./owned-runtime-product-lifecycle").legacyPresent(root))legacyResetEligible(root,b.predecessorGeneration);
  const p=policy(root,b.predecessorGeneration),lifecycle=readLifecyclePolicy(),reg=current(),pointer=snapshot(path.join(authority.base(root),"current-daemon.json")),source=readSources(),edit=snapshot(path.join(root,"logs","edit-session-active.json")),original=facts.x.value;
  if(reg?.generation!==b.predecessorGeneration||pointer.sha256!==original.predecessorCurrentRawSha256||edit.sha256!==original.oldEditRawSha256||p.rawSha256!==original.policyRawSha256||!same(p.policy.authorization,original.authorizationRef)||!same(lifecycle.authorization,original.lifecycleAuthorizationRef))fail("owned_product_reset_recovery_baseline_changed");
  assertLifecycle(root);
  function unchanged(){p.assertUnchanged();readLifecyclePolicy(lifecycle.authorization);pointer.assertUnchanged();edit.assertUnchanged();assertLifecycle(root);if(current()?.generation!==reg.generation||readSources().sourceSha256!==source.sourceSha256||!same(failedStartFacts(deps).pins,facts.pins))fail("owned_product_reset_recovery_baseline_changed");}
  async function absent(){unchanged();const probes=[];for(const generation of [reg.generation,b.generation]){await native.assertHeld();const probe=await native.probeOwned(generation);if(probe.generation!==generation||probe.state!=="absent"||probe.win32Error!==87||probe.endpointFree!==true)fail("owned_product_reset_recovery_absence_unproven");probes.push(probe);unchanged();}return probes;}
  const first=await absent(),id=crypto.randomUUID(),generation=crypto.randomUUID(),bootNonce=crypto.randomUUID(),dir=paths.directory(id);ledger.ensure(path.dirname(paths.keyFile));
  r1.writeJournalOnce(path.dirname(paths.keyFile),paths.key,{schema:SCHEMA+".failed-start-once",operationId:id,original:b,originalPins:facts.pins,replayAllowed:false});ledger.ensure(dir);
  const intent={schema:SCHEMA+".failed-start-intent",operationId:id,generation,original:b,originalPins:facts.pins,sourceSha256:source.sourceSha256,createdAt:new Date().toISOString(),authentication:""};intent.authentication=signed(intent,keyReader(facts.old.reservation.value));r1.writeJournalOnce(dir,"intent",intent);r1.writeJournalOnce(dir,"absence",{oldExitProven:false,probes:first,replayAllowed:false});
  try{const result=await startFreshReset(deps,{p,lifecycle,reg,pointer,source,old:facts.old,edit,unchanged,absent:async()=>{const probes=await absent();return probes[0];}},{first:first[0],id,generation,bootNonce,key:paths.key});r1.writeJournalOnce(dir,"result",{...result,operationId:id});return { ...result,operationId:id,recoveredFailedStart:b,writeAdmissionReleased:false};}
  catch(error){r1.writeJournalOnce(dir,"unknown",{code:/^owned_[a-z0-9_]+$/.test(error.code||"")?error.code:"owned_product_reset_recovery_unknown",generation,replayAllowed:false});throw error;}
}
function daemonSession({root,generation,readGeneration,keyReader,readLifecycle,readEditHash,retireEdit}={}){
  if(!generation||!ledger.proofExists(bindingFile(root,generation)))return null;
  const x=readIntent(root,generation,g=>keyReader(readGeneration(root,g).reservation.value));let challengeActor=null,challengeExpiresAt=0,challengeToken=null;
  function grant(){return x.value.schema===SCHEMA+".intent"?policy(root,x.value.predecessorGeneration):require("./owned-runtime-product-activation").sessionGrant(root,x,readGeneration,keyReader);}
  function activation(){const pGrant=grant();if(pGrant.rawSha256!==x.value.policyRawSha256||!same(pGrant.policy.authorization,x.value.authorizationRef))fail("owned_product_reset_policy_changed");const file=path.join(x.dir,"activation.json");if(!ledger.proofExists(file))return null;const p=readRow(file),v=p.value,key=keyReader(readGeneration(root,generation).reservation.value);if(v.schema!==SCHEMA+".activation"||v.generation!==generation||v.intentSha256!==x.intent.row.sha256||!uuid(v.challenge)||v.authentication!==signed(v,key)||!same(v.disposition,disposition()))fail("owned_product_reset_activation_invalid");return v;}
  function admissionReady(){if(!activation())return false;readAnchor(root,generation,readGeneration,keyReader);retireEdit(x.value.oldEditRawSha256);return true;}
  function challenge(actor,physicalInflight){
    if(admissionReady())return null;if(physicalInflight!==0)fail("owned_product_reset_physical_fence_required");readAnchor(root,generation,readGeneration,keyReader);exact(actor,["panelConnectionId","panelGeneration","panelInstanceId","panelLifecycleEpoch"]);if(!actor.panelConnectionId||!actor.panelGeneration||!actor.panelInstanceId||!Number.isSafeInteger(actor.panelLifecycleEpoch))fail("owned_product_reset_panel_actor_required");
    // A failed/expired READ can advance only the already issued actor by its
    // exact next reset epoch, with an empty durable physical latch. A foreign
    // panel is still refused. No launch or old command is retried here.
    const next=challengeActor&&{...challengeActor,panelGeneration:"reset-"+generation,panelLifecycleEpoch:challengeActor.panelLifecycleEpoch+1};
    if(challengeActor&&!same(challengeActor,actor)&&!same(next,actor))fail("owned_product_reset_competing_panel");
    challengeActor={...actor};challengeToken=crypto.randomUUID();challengeExpiresAt=Date.now()+30000;return {schema:SCHEMA+".challenge",generation,challenge:challengeToken,actor:challengeActor,expiresAt:new Date(challengeExpiresAt).toISOString()};
  }
  function activate(input){
    exact(input,["generation","challenge","previousActor","actor","physicalInflight","panelControl","project"]);exact(input.project,["projectPresent","file","dirty","revision","rendering","challenge"]);exact(input.panelControl,["nativeControlIdle","activeAction","recoveryTransport","actionStorage","oldActionEntries"]);
    if(activation())return {ok:true,status:"reset_active",generation,activation:activation()};
    const a=input.actor,b=input.previousActor,project=input.project;
    const pc=input.panelControl;if(pc.nativeControlIdle!==true||pc.activeAction!==null||pc.recoveryTransport!==null||pc.actionStorage!=="ready"||!Array.isArray(pc.oldActionEntries)||pc.oldActionEntries.length>120||new Set(pc.oldActionEntries.map(e=>e?.requestId)).size!==pc.oldActionEntries.length)fail("owned_product_reset_panel_control_busy");for(const entry of pc.oldActionEntries){exact(entry,["requestId","entrySha256"]);if(!uuid(entry.requestId)||!ledger.SHA.test(entry.entrySha256||""))fail("owned_product_reset_panel_control_busy");}
    if(input.generation!==generation||input.challenge!==challengeToken||!challengeActor||Date.now()>challengeExpiresAt||!same(b,challengeActor)||a?.panelInstanceId!==b.panelInstanceId||a?.panelConnectionId!==b.panelConnectionId||a?.panelLifecycleEpoch!==b.panelLifecycleEpoch+1||a?.panelGeneration!=="reset-"+generation||input.physicalInflight!==0||project.challenge!==challengeToken||project.projectPresent!==true||typeof project.file!=="string"||typeof project.dirty!=="boolean"||!Number.isSafeInteger(project.revision)||project.revision<0||project.rendering!==false)fail("owned_product_reset_physical_fence_required");
    const l=readLifecycle();if(l.pending||l.pendingLifecycle)fail("owned_product_reset_pending_lifecycle_refused");if(readEditHash()!==x.value.oldEditRawSha256)fail("owned_product_reset_edit_ownership_changed");
    const anchor=readAnchor(root,generation,readGeneration,keyReader);anchor.assertUnchanged();grant().assertUnchanged();
    const value={schema:SCHEMA+".activation",generation,intentSha256:x.intent.row.sha256,challenge:challengeToken,actor:a,project,panelControl:pc,activatedAt:new Date().toISOString(),disposition:disposition(),authentication:""};value.authentication=signed(value,keyReader(readGeneration(root,generation).reservation.value));r1.writeJournalOnce(x.dir,"activation",value);retireEdit(x.value.oldEditRawSha256);challengeActor=null;return {ok:true,status:"reset_active",generation,activation:value};
  }
  return Object.freeze({admissionReady,challenge,activate,activation,oldEditRawSha256:x.value.oldEditRawSha256});
}
// Private, memory-branded PRECONNECT control disposition. It permits only the
// existing reset metadata/preflight handler; no old outcome or resource is settled.
const preconnectWitnesses=new WeakMap(),preconnectRuntimeObservations=new WeakMap();
async function readPreconnectRuntime(root){
  const supervisor=require("./owned-runtime-supervisor"),before=supervisor.readDaemonRegistration(root);
  if(!before)fail("owned_product_preconnect_current_runtime_required");
  const profile={daemon:{port:3456,credentialSha256:before.credentialSha256}},client=authority.runtimeControlFor(root),started=Date.now();
  const owned=await client.request(profile,"/runtime/owned/status"),status=await client.request(profile,"/dev/status"),after=supervisor.readDaemonRegistration(root),runtime=status.humanGuardRuntime;
  if(!same(before,after)||owned.ok!==true||owned.owned!==true||owned.generation!==before.generation||owned.draining!==false||owned.closing!==false||owned.shutdownEffectPending!==null||owned.writeAdmission!=="retained_audit_and_fresh_adoption_required"||owned.activeTickets!==0||status.ok!==true||status.startedAt!==before.serviceStartedAt||runtime?.pid!==before.kernelIdentity.pid||runtime.startedAt!==before.serviceStartedAt||runtime.sourceSha256!==before.sourceSha256||status.pendingCommands!==0||!Array.isArray(status.inflightCommands)||status.inflightCommands.length||status.activeEditSession!==null||status.projectLifecycle?.blocked!==false||status.projectLifecycle.pending)fail("owned_product_preconnect_listener_not_current_idle");
  const proof=Object.freeze({scope:"authenticated_pending_product_reset_listener"});preconnectRuntimeObservations.set(proof,{root:path.resolve(root),current:before,started});return proof;
}
function preconnectSnapshot(root,directory,rows,observation){
  return ledger.withFreshProofReadView(()=>{
    if(require("./deployment-mode").deploymentMode()!=="product"||path.resolve(directory)!==path.join(path.resolve(root),"logs","cep-panel-control")||!Array.isArray(rows)||!rows.length||rows.length>120)fail("owned_product_preconnect_scope_required");
    const supervisor=require("./owned-runtime-supervisor"),control=require("./cep-panel-control"),contract=require("../cep-panel/panel-action-contract");
    const keyReader=v=>authority.runtimeControlFor(root).credential({daemon:{port:3456,credentialSha256:v.credentialSha256}}),current=supervisor.readDaemonRegistration(root);
    require("./owned-runtime-product-activation").assertConfigurationRoots(root);
    if(!current||current.sourceSha256!==require("./review-evidence").runtimeIdentity(root).sourceSha256||!supervisor.readProductStopAuthority(root,current.generation))fail("owned_product_preconnect_current_runtime_required");
    const listener=preconnectRuntimeObservations.get(observation?.runtime);
    if(!listener||listener.root!==path.resolve(root)||!same(listener.current,current)||Date.now()<listener.started||Date.now()-listener.started>10000)fail("owned_product_preconnect_listener_observation_required");
    const anchor=sessionAnchor(root,current.generation,supervisor.registeredGeneration,keyReader);
    if(!anchor?.legacyActivation)fail("owned_product_preconnect_activated_origin_required");
    const x=readIntent(root,anchor.value.generation,g=>keyReader(supervisor.registeredGeneration(root,g).reservation.value)),session=g=>daemonSession({root,generation:g,readGeneration:supervisor.registeredGeneration,keyReader,retireEdit(){}});
    if(x.value.schema!==SCHEMA+".intent"||session(anchor.value.generation).activation())fail("owned_product_preconnect_pending_reset_required");
    const previous=sessionAnchor(root,x.value.predecessorGeneration,supervisor.registeredGeneration,keyReader),activated=previous&&session(previous.value.generation)?.activation();
    if(!activated||!same(activated.disposition,disposition())||!Array.isArray(activated.panelControl?.oldActionEntries))fail("owned_product_preconnect_previous_coverage_required");
    const grant=policy(root,x.value.predecessorGeneration),edit=snapshot(path.join(root,"logs","edit-session-active.json"));
    if(edit.sha256!==x.value.oldEditRawSha256)fail("owned_product_preconnect_edit_ownership_changed");assertLifecycle(root);
    const state=observation?.state,actor=state&&{panelInstanceId:state.panelInstanceId,panelLifecycleEpoch:state.panelLifecycleEpoch,panelGeneration:state.panelGeneration};
    if(!state||typeof actor.panelInstanceId!=="string"||!actor.panelInstanceId||!Number.isSafeInteger(actor.panelLifecycleEpoch)||actor.panelLifecycleEpoch<0||typeof actor.panelGeneration!=="string"||!actor.panelGeneration||!state.bridgeConnection?.panelConnectionId||state.assetVersion!==require("../package.json").version||state.connected!==false||state.running!==false||state.pollInFlight!==false||state.nativeBusy!==false||state.physicalInflight!==0||state.activeAction!==null||state.recoveryTransport!==null||state.actionStorage!=="ready"||state.trustedGuardRefresh?.pending||state.causalLookup?.pending||Object.keys(state).some(k=>/LookupPending$/.test(k)&&state[k]!==false))fail("owned_product_preconnect_fresh_idle_required");
    const unresolved=state.unresolvedActions;
    if(!Array.isArray(unresolved)||unresolved.length!==rows.length||new Set(rows.map(r=>r?.requestId)).size!==rows.length||new Set(unresolved.map(r=>r?.requestId)).size!==rows.length||!Array.isArray(observation.remote)||observation.remote.length!==rows.length)fail("owned_product_preconnect_all_unknowns_required");
    const pins=[];
    for(const row of rows){
      const indexed=control.readIndexedReceipt(directory,row?.requestId),local=indexed.row,entry=unresolved.find(r=>r.requestId===local.requestId),remote=observation.remote.find(r=>r?.requestId===local.requestId);
      if(!same(row,local)||local.action!=="bridge.disconnect"||local.state!=="unknown"||local.replayAllowed!==false||local.delivery!=="delivered"||local.runId||!entry||entry.action!==local.action||entry.runId!==null||!ledger.SHA.test(entry.entrySha256||"")||!activated.panelControl.oldActionEntries.some(e=>e.requestId===local.requestId&&e.entrySha256===entry.entrySha256)||!remote||remote.state!=="unknown"||remote.replayAllowed!==false||remote.runId)fail("owned_product_preconnect_unknown_not_covered");
      const fields=["protocolVersion","requestId","action","state","phase","acceptedAt","completedAt","panelInstanceId","epoch","generation","code","message","effect","httpStatus","source"];
      if(!fields.every(k=>same(local[k]??null,remote[k]??null))||!same(local.diagnostic??null,remote.diagnostic??null)||!same(local.result?.diagnostic??null,remote.result?.diagnostic??null)||!same(local.binding,{panelInstanceId:remote.panelInstanceId,panelLifecycleEpoch:remote.epoch,panelGeneration:remote.generation})||actor.panelInstanceId===local.binding.panelInstanceId||actor.panelInstanceId===activated.actor?.panelInstanceId||!same(contract.sanitizeReceipt(remote),remote))fail("owned_product_preconnect_local_panel_link_required");
      pins.push({requestId:local.requestId,receipt:indexed.rawReceiptSha256,index:indexed.rawIndexSha256,identity:indexed.identitySha256,entrySha256:entry.entrySha256});
    }
    const config=path.join(root,".codex","config.toml");
    return {current,anchor:anchor.pins,intent:x.intent.rawSha256,grant:grant.rawSha256,previousActivation:authority.privateFile(path.join(resetDir(root,previous.value.operationId),"activation.json")).rawSha256,config:ledger.proofExists(config)?ledger.hash(ledger.readBytes(config)):null,edit:edit.sha256,pins:pins.sort((a,b)=>a.requestId.localeCompare(b.requestId)),actor,connection:state.bridgeConnection.panelConnectionId,target:ledger.clone(observation.selected)};
  });
}
function createPreconnectControlWitness(root,directory,rows,observation){
  const value=preconnectSnapshot(root,directory,rows,observation),witness=Object.freeze({scope:"pending_product_reset_preconnect_only",replayAllowed:false});
  preconnectWitnesses.set(witness,{root:path.resolve(root),directory:path.resolve(directory),createdAt:Date.now(),value});return witness;
}
function assertPreconnectControlWitness(witness,root,directory,rows,observation){
  const saved=preconnectWitnesses.get(witness);
  if(!saved||saved.root!==path.resolve(root)||saved.directory!==path.resolve(directory)||Date.now()<saved.createdAt||Date.now()-saved.createdAt>30000||!same(saved.value,preconnectSnapshot(root,directory,rows,observation)))fail("owned_product_preconnect_witness_changed");
}
function preconnectControlAudit(witness){
  const saved=preconnectWitnesses.get(witness);if(!saved)fail("owned_product_preconnect_witness_changed");
  return {witnessSha256:r1.hash(saved.value),daemon:{generation:saved.value.current.generation,sourceSha256:saved.value.current.sourceSha256}};
}
function assertLoadedPreconnectSource(){if(ledger.hash(ledger.readBytes(__filename))!==LOADED_PRECONNECT_SOURCE_SHA256)fail("product_reset_client_loaded_source_changed");}
module.exports={SCHEMA,POLICY,FAILED_START,signed,policy,provision,disposition,snapshot,assertLifecycle,readIntent,readAnchor,sessionAnchor,currentStatus,readBack,reset,startFreshReset,failedStartStatus,recoverFailedStart,daemonSession,readPreconnectRuntime,createPreconnectControlWitness,assertPreconnectControlWitness,preconnectControlAudit,assertLoadedPreconnectSource};
if(require.main===module){(async()=>{const [command,...args]=process.argv.slice(2);let result;if(command==="authorize"&&args.length===1)result=provision(args[0]);else if(["status","reset","failed-start-status","recover-failed-start"].includes(command)&&args.length===0){const s=require("./owned-runtime-supervisor").createOwnedRuntimeSupervisor(),method={status:"status",reset:"resetProductSession","failed-start-status":"failedProductSessionStartStatus","recover-failed-start":"recoverFailedProductSessionStart"}[command];result=await s[method]();}else fail("owned_product_reset_cli_arguments_invalid");process.stdout.write(JSON.stringify(result)+"\n");})().catch(e=>{process.stdout.write(JSON.stringify({ok:false,code:e.code||"owned_product_reset_unknown",replayAllowed:false})+"\n");process.exitCode=1;});}
