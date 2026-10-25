"use strict";

// Private product provenance and a single known repair receipt. This module
// observes signed records; it cannot terminate, launch, grant or infer an exit.
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const authority=require("./owned-runtime-authority"),r1=require("./owned-runtime-lifecycle"),ledger=require("./native-fixture-attempt-ledger"),win=require("./owned-runtime-win32");
const SCHEMA="ae-agent.owned-runtime-product-lifecycle.v1",REPAIR="ae-agent.owned-runtime-product-repair-retirement.v1",INTENT="ae-agent.owned-runtime-product-repair-intent.v1";
const MIGRATION_DIR=".codex-runtime/product-start-activation-20261015",THREAD="01a13fa7-d879-7373-a9e1-4d17746b9b44",REPLY="Да, перейти к обычному запуску";
const same=(a,b)=>r1.canonical(a)===r1.canonical(b),sha=v=>ledger.SHA.test(v||""),uuid=v=>ledger.UUID.test(v||"");
function fail(code="owned_product_provenance_invalid"){throw Object.assign(Error(code),{code});}
function exact(v,keys){authority.exact(v,keys,"owned_product_contract_invalid");}
function signed(v,key){const {authentication,...data}=v;return crypto.createHmac("sha256",key).update(r1.canonical(data)).digest("hex");}
function envelope(file){const pin=authority.privateFile(file),row=pin.value;if(row.schema!==r1.SCHEMA+".envelope"||row.sha256!==r1.hash(row.value))fail();return {...pin,row,value:row.value};}
function legacyPresent(root){return [path.join(authority.base(root),"retained-authority.json"),path.join(authority.base(root),"profiles","bridge-daemon-migration-v1.json"),path.join(root,"logs","evidence","native-fixture-retained-maintenance","capture.json")].some(p=>ledger.proofExists(p));}
function productPolicy(root,reference){const p=authority.loadPolicy(root,"owned_daemon_lifecycle",reference);if(!same(p.policy.acceptedServerCoverage,["owned_daemon_lifecycle"]))fail("owned_product_policy_scope_required");return p;}
function migration(root,value=null){
  const pin=authority.privateFile(path.join(root,MIGRATION_DIR,"result.json")),v=pin.value;
  if(v.ok!==true||v.mode!=="applied"||v.applyRun!==true||v.authority!==false||v.oldExitProven!==false||v.replayAllowed!==false||v.daemonLaunched!==false||v.head!=="f92e3b01ef3e6c7008298880577e1a2543b2c334"||v.foreignPreserved!==7||v.journalsPreserved!==3)fail("owned_product_migration_evidence_required");
  const expected={threadId:THREAD,userReply:REPLY,activationResultRawSha256:pin.rawSha256};if(value!==null){exact(value,Object.keys(expected));if(!same(value,expected))fail("owned_product_migration_evidence_changed");}return {value:expected,pin};
}
function firstRegistration(root,generation,readGeneration){
  const facts=readGeneration(root,generation),v=facts.reservation.value,dir=path.join(authority.base(root),"supervisor-operations",v.operationId),intent=envelope(path.join(dir,"intent.json")),result=envelope(path.join(dir,"result.json"));
  if(ledger.proofExists(path.join(dir,"unknown.json"))||intent.value.targetGeneration!==null||intent.value.command!=="ensure"||intent.value.operationId!==v.operationId||intent.value.desiredSourceSha256!==v.sourceSha256||!same(intent.value.authorizationRef,v.authorizationRef)||result.value.ok!==true||result.value.status!=="owned_daemon_registered_admission_closed"||result.value.generation!==generation||result.value.replayAllowed!==false||result.value.writeAdmissionReleased!==false||result.value.registration?.sourceSha256!==v.sourceSha256||!same(result.value.registration?.kernelIdentity,facts.candidate.value.kernelIdentity))fail("owned_product_first_registration_required");
  return facts;
}
function readAnchor(root,readGeneration,keyReader){
  const core=require("./core-product-migration");if(core.hasOrigin(root))return core.readGenesis(root,readGeneration,keyReader);
  if(legacyPresent(root))fail("owned_product_legacy_anchor_present");const pin=envelope(path.join(authority.base(root),"product-genesis.json")),v=pin.value;
  exact(v,["schema","generation","registration","sourceSha256","authorizationRef","policyRawSha256","migration","createdAt","replayAllowed","authentication"]);
  if(v.schema!==SCHEMA+".genesis"||!uuid(v.generation)||!sha(v.policyRawSha256)||!Number.isFinite(Date.parse(v.createdAt))||v.replayAllowed!==false)fail();
  const facts=firstRegistration(root,v.generation,readGeneration),policy=productPolicy(root,v.authorizationRef),m=migration(root,v.migration),key=keyReader(facts.reservation.value);
  if(!same(v.registration,facts.refs)||v.sourceSha256!==facts.candidate.value.sourceSha256||!same(v.authorizationRef,facts.reservation.value.authorizationRef)||v.authentication!==signed(v,key)||!sha(v.authentication))fail();
  function assertUnchanged(){pin.assertUnchanged();policy.assertUnchanged();m.pin.assertUnchanged();readAnchor(root,readGeneration,keyReader);}
  return {product:true,pins:{productGenesisRawSha256:pin.rawSha256,initialGeneration:v.generation},value:v,assertUnchanged};
}
function ensureAnchor(root,generation,readGeneration,keyReader){
  const core=require("./core-product-migration");if(core.hasOrigin(root))return core.readGenesis(root,readGeneration,keyReader);
  const file=path.join(authority.base(root),"product-genesis.json");if(ledger.proofExists(file))return readAnchor(root,readGeneration,keyReader);
  if(legacyPresent(root))fail("owned_product_legacy_anchor_present");const facts=firstRegistration(root,generation,readGeneration),policy=productPolicy(root,facts.reservation.value.authorizationRef),m=migration(root);
  const value={schema:SCHEMA+".genesis",generation,registration:facts.refs,sourceSha256:facts.candidate.value.sourceSha256,authorizationRef:facts.reservation.value.authorizationRef,policyRawSha256:policy.rawSha256,migration:m.value,createdAt:new Date().toISOString(),replayAllowed:false,authentication:"0".repeat(64)};value.authentication=signed(value,keyReader(facts.reservation.value));policy.assertUnchanged();m.pin.assertUnchanged();r1.writeJournalOnce(authority.base(root),"product-genesis",value);return readAnchor(root,readGeneration,keyReader);
}
function quiescence(v){exact(v,["pendingCommands","inflightCommands","activeEditSession","activeTickets","writeAdmission","neverAdmitted","lifecycleDisposition"]);if(v.pendingCommands!==0||v.inflightCommands!==0||v.activeEditSession!==null||v.activeTickets!==0||v.writeAdmission!=="retained_audit_and_fresh_adoption_required"||v.neverAdmitted!==true||v.lifecycleDisposition!=="fresh_missing_no_work")fail("owned_product_repair_quiescence_required");}
function validateSnapshot(root,pin,facts){
  const s=pin.value,c=facts.candidate.value,dir=path.join(root,MIGRATION_DIR,"known-product-before-repair"),names=["reservation.json","startup-ticket.json","native-candidate.json","registration.json","current-daemon.json","lifetime-events.jsonl"];
  if(s.generation!==c.generation||s.sourceSha256!==c.sourceSha256||!Array.isArray(s.pins)||s.pins.some(p=>typeof p.name!=="string"||!p.name.startsWith("source/"))||!same(s.pins.map(p=>({...p,name:p.name.slice(7)})),facts.reservation.value.sourcePins)||!same(s.registration?.kernelIdentity,c.kernelIdentity)||!same(s.registration?.argv,c.argv)||s.aeCommandsDelivered!==0||s.writeAdmissionReleased!==false||s.replayAllowed!==false||s.oldExperimentalOutcome!=="unknown_preserved"||!Array.isArray(s.metadata)||!same(s.metadata.map(p=>p.name).sort(),names.slice().sort()))fail("owned_product_repair_snapshot_invalid");
  const pins=[...s.pins,...s.metadata].map(p=>{exact(p,["name","sha256"]);if(!sha(p.sha256)||path.isAbsolute(p.name)||p.name.includes("\\")||p.name.split("/").some(n=>!n||n==="."||n===".."))fail();const file=path.join(dir,p.name);
    const bytes=ledger.readBytes(file);if(ledger.hash(bytes)!==p.sha256)fail("owned_product_repair_snapshot_changed");return {file,sha256:p.sha256};});
  for(const name of names.slice(0,4)){const meta=s.metadata.find(p=>p.name===name);if(ledger.hash(ledger.readBytes(path.join(authority.base(root),"daemon-reservations",c.generation,name)))!==meta.sha256)fail("owned_product_repair_durable_chain_changed");}
  return ()=>{pin.assertUnchanged();for(const p of pins)if(ledger.hash(ledger.readBytes(p.file))!==p.sha256)fail("owned_product_repair_snapshot_changed");};
}
function readRepairIntent(root,generation,readGeneration){
  if(legacyPresent(root))fail("owned_product_legacy_anchor_present");const dir=path.join(authority.base(root),"product-repair-retirements"),pin=authority.privateFile(path.join(dir,generation+".intent.json")),v=pin.value;
  exact(v,["schema","operationId","generation","registration","identity","argv","sourceSha256","authorizationRef","migration","quiescence","snapshotRawSha256","handleOpenedAt","createdAt","replayAllowed"]);
  const facts=firstRegistration(root,generation,readGeneration),m=migration(root,v.migration),policy=productPolicy(root,v.authorizationRef),snapshot=authority.privateFile(path.join(root,MIGRATION_DIR,"known-product-before-repair","snapshot.json"));
  win.validateIdentity(v.identity);quiescence(v.quiescence);const snapshotUnchanged=validateSnapshot(root,snapshot,facts);
  if(v.schema!==INTENT||!uuid(v.operationId)||v.generation!==generation||!same(v.registration,facts.refs)||!same(v.identity,facts.candidate.value.kernelIdentity)||!same(v.argv,facts.candidate.value.argv)||v.sourceSha256!==facts.candidate.value.sourceSha256||!same(v.authorizationRef,facts.reservation.value.authorizationRef)||v.snapshotRawSha256!==snapshot.rawSha256||!Number.isFinite(Date.parse(v.handleOpenedAt))||!Number.isFinite(Date.parse(v.createdAt))||Date.parse(v.handleOpenedAt)<Date.parse(v.identity.birthUtc)||Date.parse(v.createdAt)<Date.parse(v.handleOpenedAt)||v.replayAllowed!==false)fail("owned_product_repair_intent_invalid");
  return {pin,value:v,facts,assertUnchanged(){pin.assertUnchanged();m.pin.assertUnchanged();policy.assertUnchanged();snapshotUnchanged();}};
}
function readRepair(root,generation,readGeneration,keyReader){
  const file=path.join(authority.base(root),"product-repair-retirements",generation+".json"),intentFile=path.join(authority.base(root),"product-repair-retirements",generation+".intent.json");
  if(!ledger.proofExists(file)){if(ledger.proofExists(intentFile))fail("owned_product_repair_unknown_no_replay");return null;}
  const pin=envelope(file),v=pin.value,intent=readRepairIntent(root,generation,readGeneration),i=intent.value;
  exact(v,["schema","kind","operationId","generation","registration","identity","argv","sourceSha256","authorizationRef","migration","intentRawSha256","quiescence","proof","graceful","replayAllowed","authentication"]);
  exact(v.proof,["waitResult","exitCode","identity","handleOpenedAt","observedAt"]);quiescence(v.quiescence);
  if(v.schema!==REPAIR||v.kind!=="never_admitted_product_repair"||v.operationId!==i.operationId||v.generation!==generation||!same(v.registration,i.registration)||!same(v.identity,i.identity)||!same(v.argv,i.argv)||v.sourceSha256!==i.sourceSha256||!same(v.authorizationRef,i.authorizationRef)||!same(v.migration,i.migration)||v.intentRawSha256!==intent.pin.rawSha256||!same(v.quiescence,i.quiescence)||v.graceful!==false||v.replayAllowed!==false||!r1.exitProof({signaled:true,...v.proof})||!same(v.proof.identity,i.identity)||v.proof.handleOpenedAt!==i.handleOpenedAt||!Number.isFinite(Date.parse(v.proof.observedAt))||Date.parse(v.proof.observedAt)<Date.parse(i.createdAt)||!sha(v.authentication)||v.authentication!==signed(v,keyReader(intent.facts.reservation.value)))fail("owned_product_repair_exit_invalid");
  return {row:pin.row,operationId:v.operationId,intent:i,proof:v.proof,graceful:false,source:{intentSha256:null,exitResultSha256:null,drainAckSha256:null,shutdownAckSha256:null,priorShutdownReceiptSha256:null,productRepairReceiptSha256:pin.row.sha256},assertUnchanged(){pin.assertUnchanged();intent.assertUnchanged();readRepair(root,generation,readGeneration,keyReader);}};
}
module.exports={SCHEMA,REPAIR,INTENT,MIGRATION_DIR,THREAD,REPLY,signed,legacyPresent,productPolicy,migration,firstRegistration,readAnchor,ensureAnchor,readRepairIntent,readRepair};
