"use strict";

// A reset abandons control, never the history or the effects of an old command.
// All paths/selectors below are private. The public operation accepts no input.
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const authority=require("./owned-runtime-authority"),r1=require("./owned-runtime-lifecycle"),ledger=require("./native-fixture-attempt-ledger");
const SCHEMA="ae-agent.product-session-reset.v1",POLICY=SCHEMA+".policy";
const same=(a,b)=>r1.canonical(a)===r1.canonical(b),uuid=v=>ledger.UUID.test(v||"");
function fail(code){throw Object.assign(Error(code),{code});}
function exact(v,keys){authority.exact(v,keys,"owned_product_reset_contract_invalid");}
function authorization(v){exact(v,["source","reference"]);if(v.source!=="explicit_user_chat"||typeof v.reference!=="string"||!v.reference.trim()||v.reference.length>512)fail("owned_product_reset_authorization_required");}
function signed(v,key){const {authentication,...data}=v;return crypto.createHmac("sha256",key).update(r1.canonical(data)).digest("hex");}
function readRow(file){const p=authority.privateFile(file),row=p.value;if(row.schema!==r1.SCHEMA+".envelope"||row.sha256!==r1.hash(row.value))fail("owned_product_reset_record_invalid");return {...p,row,value:row.value};}
function policy(root){const p=authority.privateFile(path.join(authority.base(root),"product-session-reset-policy.json")),v=p.value;exact(v,["schema","enabled","authorization","capability"]);authorization(v.authorization);if(v.schema!==POLICY||v.enabled!==true||v.capability!=="reset_owned_runtime_product_session")fail("owned_product_reset_policy_required");return {...p,policy:v};}
function provision(reference,root=path.resolve(__dirname,"..")){
  if(require("./deployment-mode").deploymentMode()!=="product"||require("./owned-runtime-product-lifecycle").legacyPresent(root))fail("owned_product_reset_product_only");
  const ref={source:"explicit_user_chat",reference};authorization(ref);ledger.ensure(authority.base(root));
  const file=path.join(authority.base(root),"product-session-reset-policy.json"),value={schema:POLICY,enabled:true,authorization:ref,capability:"reset_owned_runtime_product_session"};
  if(fs.existsSync(file)){const p=policy(root);if(!same(p.policy,value))fail("owned_product_reset_policy_already_provisioned");return {ok:true,status:"reset_policy_present"};}
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
  exact(v,["schema","operationId","generation","predecessorGeneration","predecessorCurrentRawSha256","predecessorRegistration","sourceSha256","authorizationRef","lifecycleAuthorizationRef","policyRawSha256","oldEditRawSha256","challenge","createdAt","disposition","authentication"]);
  if(b.schema!==SCHEMA+".binding"||b.generation!==generation||b.intentSha256!==intent.row.sha256||v.schema!==SCHEMA+".intent"||v.generation!==generation||v.operationId!==b.operationId||!uuid(v.predecessorGeneration)||!uuid(v.challenge)||!same(v.disposition,disposition())||v.authentication!==signed(v,keyReader(v.predecessorGeneration)))fail("owned_product_reset_intent_invalid");
  return {binding,intent,value:v,dir:resetDir(root,v.operationId)};
}
function readAnchor(root,generation,readGeneration,keyReader){
  const x=readIntent(root,generation,g=>keyReader(readGeneration(root,g).reservation.value)),p=readRow(path.join(x.dir,"anchor.json")),v=p.value,facts=readGeneration(root,generation),key=keyReader(facts.reservation.value);
  exact(v,["schema","operationId","generation","intentSha256","predecessorGeneration","predecessorRegistration","registration","sourceSha256","createdAt","disposition","authentication"]);
  if(v.schema!==SCHEMA+".anchor"||v.generation!==generation||v.operationId!==x.value.operationId||v.intentSha256!==x.intent.row.sha256||v.predecessorGeneration!==x.value.predecessorGeneration||!same(v.predecessorRegistration,x.value.predecessorRegistration)||!same(v.registration,facts.refs)||v.sourceSha256!==facts.reservation.value.sourceSha256||!same(v.disposition,disposition())||v.authentication!==signed(v,key))fail("owned_product_reset_anchor_invalid");
  if(x.value.oldEditRawSha256!==null){const old=readRow(path.join(x.dir,"old-edit.json")).value;if(old.schema!==SCHEMA+".old-edit"||old.rawSha256!==x.value.oldEditRawSha256||ledger.hash(Buffer.from(old.rawBase64,"base64"))!==old.rawSha256||old.replayAllowed!==false)fail("owned_product_reset_old_edit_archive_invalid");}
  function assertUnchanged(){p.assertUnchanged();x.binding.assertUnchanged();x.intent.assertUnchanged();readAnchor(root,generation,readGeneration,keyReader);}
  return {product:true,reset:true,pins:{productResetAnchorRawSha256:p.rawSha256,initialGeneration:generation},value:v,assertUnchanged};
}
function sessionAnchor(root,generation,readGeneration,keyReader){
  // Locate a root, then supervisor verifies every real exit/succession edge.
  let g=generation;const seen=new Set(),dir=path.join(authority.base(root),"daemon-succession");
  while(uuid(g)&&!seen.has(g)&&seen.size<256){seen.add(g);if(fs.existsSync(bindingFile(root,g)))return readAnchor(root,g,readGeneration,keyReader);const f=path.join(dir,g+".json");if(!fs.existsSync(f))return null;g=readRow(f).value.predecessorGeneration;}
  if(seen.size)fail("owned_product_reset_lineage_invalid");return null;
}
function currentStatus(root,reg,readGeneration,keyReader){
  if(!reg)return null;
  const anchor=sessionAnchor(root,reg.generation,readGeneration,keyReader);
  if(anchor){const state=daemonSession({root,generation:anchor.value.generation,readGeneration,keyReader,retireEdit(){}}),active=state.activation();return {ok:true,status:active?"reset_active":"reset_pending_preflight",operationId:anchor.value.operationId,generation:reg.generation,sessionRootGeneration:anchor.value.generation,daemonLiveness:"not_observed",writeAdmissionReleased:false,...disposition()};}
  const pointer=snapshot(path.join(authority.base(root),"current-daemon.json")),key=r1.hash({predecessorGeneration:reg.generation,predecessorCurrentRawSha256:pointer.sha256}),file=path.join(authority.base(root),"product-session-reset-keys",key+".json");
  if(!fs.existsSync(file))return null;const r=readBack(root,readRow(file).value.operationId);return {ok:true,status:r.status,operationId:r.operationId,generation:r.generation,daemonLiveness:"not_observed",writeAdmissionReleased:false,...disposition()};
}
function readBack(root,id){const dir=resetDir(root,id),rows={};if(fs.existsSync(dir))for(const name of fs.readdirSync(dir)){if(!/^(intent|absence|old-edit|anchor|activation|launch-intent|launch-result|unknown|result)\.json$/.test(name))fail("owned_product_reset_foreign_record");rows[name.slice(0,-5)]=readRow(path.join(dir,name)).row;}return {ok:true,status:rows.activation?"reset_active":rows.anchor?"reset_pending_preflight":"reset_partial_readback_only",operationId:id,generation:rows.intent?.value.generation||null,oldOutcome:"unknown_preserved",oldExitProven:false,replayAllowed:false,rows};}
async function reset(deps){
  const {root,native,current,readGeneration,keyReader,launch,publishCurrent,readSources,readLifecyclePolicy}=deps;
  if(require("./deployment-mode").deploymentMode()!=="product"||require("./owned-runtime-product-lifecycle").legacyPresent(root))fail("owned_product_reset_product_only");
  const p=policy(root),lifecycle=readLifecyclePolicy(),reg=current();if(!reg)fail("owned_product_reset_registered_predecessor_required");
  if(fs.existsSync(bindingFile(root,reg.generation))){const pending=readIntent(root,reg.generation,g=>keyReader(readGeneration(root,g).reservation.value));if(!fs.existsSync(path.join(pending.dir,"activation.json")))return readBack(root,pending.value.operationId);}
  const pointer=snapshot(path.join(authority.base(root),"current-daemon.json")),key=r1.hash({predecessorGeneration:reg.generation,predecessorCurrentRawSha256:pointer.sha256}),keys=path.join(authority.base(root),"product-session-reset-keys"),keyFile=path.join(keys,key+".json");
  if(fs.existsSync(keyFile))return readBack(root,readRow(keyFile).value.operationId);
  const source=readSources(),old=readGeneration(root,reg.generation),edit=snapshot(path.join(root,"logs","edit-session-active.json"));assertLifecycle(root);
  function unchanged(){p.assertUnchanged();readLifecyclePolicy(lifecycle.authorization);pointer.assertUnchanged();edit.assertUnchanged();assertLifecycle(root);if(current()?.generation!==reg.generation||readSources().sourceSha256!==source.sourceSha256)fail("owned_product_reset_baseline_changed");}
  async function absent(){unchanged();const probe=await native.probeOwned(reg.generation);if(probe.state!=="absent"||probe.win32Error!==87||probe.endpointFree!==true)fail("owned_product_reset_"+(["alive_exact","pid_reused","access_denied","unknown","endpoint_occupied"].includes(probe.state)?probe.state:"absence_unproven"));unchanged();return probe;}
  const first=await absent(),id=crypto.randomUUID(),generation=crypto.randomUUID(),bootNonce=crypto.randomUUID(),dir=resetDir(root,id);ledger.ensure(keys);
  r1.writeJournalOnce(keys,key,{schema:SCHEMA+".once",operationId:id,predecessorGeneration:reg.generation,predecessorCurrentRawSha256:pointer.sha256,replayAllowed:false});ledger.ensure(dir);
  const intent={schema:SCHEMA+".intent",operationId:id,generation,predecessorGeneration:reg.generation,predecessorCurrentRawSha256:pointer.sha256,predecessorRegistration:old.refs,sourceSha256:source.sourceSha256,authorizationRef:p.policy.authorization,lifecycleAuthorizationRef:lifecycle.authorization,policyRawSha256:p.rawSha256,oldEditRawSha256:edit.sha256,challenge:crypto.randomUUID(),createdAt:new Date().toISOString(),disposition:disposition(),authentication:""};intent.authentication=signed(intent,keyReader(old.reservation.value));
  const intentRow=r1.writeJournalOnce(dir,"intent",intent);r1.writeJournalOnce(dir,"absence",{schema:SCHEMA+".absence",generation:reg.generation,probe:first,oldExitProven:false,replayAllowed:false});
  if(edit.sha256!==null){edit.assertUnchanged();r1.writeJournalOnce(dir,"old-edit",{schema:SCHEMA+".old-edit",rawSha256:edit.sha256,rawBase64:ledger.readBytes(path.join(root,"logs","edit-session-active.json")).toString("base64"),replayAllowed:false});}
  try{
    unchanged();const reserved=path.dirname(bindingFile(root,generation));ledger.ensure(reserved);r1.writeJournalOnce(reserved,"product-session-reset",{schema:SCHEMA+".binding",operationId:id,generation,intentSha256:intentRow.sha256});
    const op={id,dir,intent:{value:{authorizationRef:lifecycle.authorization,desiredSourceSha256:source.sourceSha256}}};
    const result=await launch(op,reg.generation,{generation,bootNonce,launchKey:key,beforeLaunch:absent});unchanged();
    const after=readGeneration(root,generation),anchor={schema:SCHEMA+".anchor",operationId:id,generation,intentSha256:intentRow.sha256,predecessorGeneration:reg.generation,predecessorRegistration:old.refs,registration:after.refs,sourceSha256:source.sourceSha256,createdAt:new Date().toISOString(),disposition:disposition(),authentication:""};anchor.authentication=signed(anchor,keyReader(after.reservation.value));r1.writeJournalOnce(dir,"anchor",anchor);
    readAnchor(root,generation,readGeneration,keyReader);unchanged();await native.assertHeld();await publishCurrent(generation,pointer.sha256);r1.writeJournalOnce(dir,"result",{ok:true,status:"reset_pending_preflight",generation,registration:result.registration,...disposition()});return {ok:true,status:"reset_pending_preflight",generation,operationId:id,writeAdmissionReleased:false,...disposition()};
  }catch(error){if(!fs.existsSync(path.join(dir,"unknown.json")))r1.writeJournalOnce(dir,"unknown",{schema:SCHEMA+".unknown",code:/^owned_[a-z0-9_]+$/.test(error.code||"")?error.code:"owned_product_reset_unknown",generation,...disposition()});throw error;}
}
function daemonSession({root,generation,readGeneration,keyReader,readLifecycle,readEditHash,retireEdit}={}){
  if(!generation||!fs.existsSync(bindingFile(root,generation)))return null;
  const x=readIntent(root,generation,g=>keyReader(readGeneration(root,g).reservation.value));let challengeActor=null,challengeExpiresAt=0,challengeToken=null;
  function activation(){const grant=policy(root);if(grant.rawSha256!==x.value.policyRawSha256||!same(grant.policy.authorization,x.value.authorizationRef))fail("owned_product_reset_policy_changed");const file=path.join(x.dir,"activation.json");if(!fs.existsSync(file))return null;const p=readRow(file),v=p.value,key=keyReader(readGeneration(root,generation).reservation.value);if(v.schema!==SCHEMA+".activation"||v.generation!==generation||v.intentSha256!==x.intent.row.sha256||!uuid(v.challenge)||v.authentication!==signed(v,key)||!same(v.disposition,disposition()))fail("owned_product_reset_activation_invalid");return v;}
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
    const anchor=readAnchor(root,generation,readGeneration,keyReader);anchor.assertUnchanged();policy(root).assertUnchanged();
    const value={schema:SCHEMA+".activation",generation,intentSha256:x.intent.row.sha256,challenge:challengeToken,actor:a,project,panelControl:pc,activatedAt:new Date().toISOString(),disposition:disposition(),authentication:""};value.authentication=signed(value,keyReader(readGeneration(root,generation).reservation.value));r1.writeJournalOnce(x.dir,"activation",value);retireEdit(x.value.oldEditRawSha256);challengeActor=null;return {ok:true,status:"reset_active",generation,activation:value};
  }
  return Object.freeze({admissionReady,challenge,activate,activation,oldEditRawSha256:x.value.oldEditRawSha256});
}
module.exports={SCHEMA,POLICY,signed,policy,provision,disposition,snapshot,assertLifecycle,readIntent,readAnchor,sessionAnchor,currentStatus,readBack,reset,daemonSession};
if(require.main===module){(async()=>{const [command,...args]=process.argv.slice(2);let result;if(command==="authorize"&&args.length===1)result=provision(args[0]);else if(["status","reset"].includes(command)&&args.length===0){const s=require("./owned-runtime-supervisor").createOwnedRuntimeSupervisor();result=await s[command==="reset"?"resetProductSession":"status"]();}else fail("owned_product_reset_cli_arguments_invalid");process.stdout.write(JSON.stringify(result)+"\n");})().catch(e=>{process.stdout.write(JSON.stringify({ok:false,code:e.code||"owned_product_reset_unknown",replayAllowed:false})+"\n");process.exitCode=1;});}
