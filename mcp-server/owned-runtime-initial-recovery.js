"use strict";

// Private, explicitly provisioned NEW initial startup. This never settles an old
// effect, produces an exit proof, adopts retained fixtures, or changes AE grants.
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const authority=require("./owned-runtime-authority"),r1=require("./owned-runtime-lifecycle"),ledger=require("./native-fixture-attempt-ledger"),evidence=require("./review-evidence");
const SCHEMA="ae-agent.owned-runtime-initial-recovery.v1",TTL=600000;
const same=(a,b)=>r1.canonical(a)===r1.canonical(b),fail=code=>{throw Object.assign(Error(code),{code});};
function file(root){return path.join(authority.base(root),"initial-recovery-authority.json");}
function raw(fileName){return authority.privateFile(fileName);}
function sign(value,key){const {authentication,...unsigned}=value;return crypto.createHmac("sha256",key).update(r1.canonical(unsigned)).digest("hex");}
function keyFor(root,fingerprint){return authority.runtimeControlFor(root).credential({daemon:{port:3456,credentialSha256:fingerprint}});}
function pin(root,name){const absolute=path.join(root,...name.split("/"));return {name,sha256:ledger.hash(ledger.readBytes(absolute))};}
function originalFacts(root){
  const supervisor=require("./owned-runtime-supervisor"),base=authority.base(root),dir=path.join(base,"daemon-reservations");
  ledger.safeDirectory(dir);const generations=fs.readdirSync(dir);if(generations.length!==1 || !ledger.UUID.test(generations[0]))fail("owned_initial_single_original_required");
  const generation=generations[0],chain=supervisor.readCandidate(root,generation),operationId=chain.reservation.value.operationId,back=supervisor.readSupervisor(root,operationId),names=Object.keys(back.rows || {}).sort();
  if(!same(names,["intent","launch-intent"]) || back.rows.intent.value.command!=="ensure" || back.rows.intent.value.targetGeneration!==null || back.rows["launch-intent"].value.generation!==generation || Date.now()<Date.parse(chain.ticket.value.expiresAt))fail("owned_initial_abandoned_initial_required");
  const intent=back.rows.intent.value,launch=back.rows["launch-intent"].value,reservationValue=chain.reservation.value;
  authority.exact(intent,["schema","operationId","command","targetGeneration","desiredSourceSha256","authorizationRef","createdAt","replayAllowed"]);authority.exact(launch,["generation","reservationSha256","startupTicketSha256","replayAllowed"]);
  if(intent.schema!==supervisor.SCHEMA+".intent" || intent.operationId!==operationId || intent.desiredSourceSha256!==reservationValue.sourceSha256 || !same(intent.authorizationRef,reservationValue.authorizationRef) || !Number.isFinite(Date.parse(intent.createdAt)) || intent.replayAllowed!==false || launch.reservationSha256!==chain.reservation.sha256 || launch.startupTicketSha256!==chain.ticket.sha256 || launch.replayAllowed!==false)fail("owned_initial_original_chain_invalid");
  if(!same(fs.readdirSync(path.join(dir,generation)).sort(),["native-candidate.json","registration.json","reservation.json","startup-ticket.json"]))fail("owned_initial_original_namespace_changed");
  const registration=supervisor.loadCurrentDaemonRegistration(root,{generation,bootNonce:chain.candidate.value.bootNonce,pid:chain.candidate.value.kernelIdentity.pid,argv:chain.candidate.value.argv,sourceSha256:chain.candidate.value.sourceSha256});
  const opKey=r1.hash({command:"restart",targetGeneration:null,desiredSourceSha256:chain.reservation.value.sourceSha256}),launchKey=r1.hash({predecessorGeneration:null,desiredSourceSha256:chain.reservation.value.sourceSha256});
  const opKeyRow=JSON.parse(ledger.readBytes(path.join(base,"supervisor-operation-keys",opKey+".json"))),launchKeyRow=JSON.parse(ledger.readBytes(path.join(base,"daemon-launch-keys",launchKey+".json")));
  authority.exact(opKeyRow,["schema","sha256","value"]);authority.exact(opKeyRow.value,["schema","key","operationId","replayAllowed"]);authority.exact(launchKeyRow,["schema","generation","operationId","key","replayAllowed"]);
  if(opKeyRow.schema!==r1.SCHEMA+".envelope" || opKeyRow.sha256!==r1.hash(opKeyRow.value) || opKeyRow.value.schema!==supervisor.SCHEMA+".operation-key" || opKeyRow.value.key!==opKey || opKeyRow.value.operationId!==operationId || opKeyRow.value.replayAllowed!==false || launchKeyRow.schema!==supervisor.SCHEMA+".launch-key" || launchKeyRow.key!==launchKey || launchKeyRow.operationId!==operationId || launchKeyRow.generation!==generation || launchKeyRow.replayAllowed!==false)fail("owned_initial_original_keys_invalid");
  const prefix=".codex-runtime/owned-runtime-maintenance/",files=[...names.map(n=>prefix+"supervisor-operations/"+operationId+"/"+n+".json"),...fs.readdirSync(path.join(dir,generation)).map(n=>prefix+"daemon-reservations/"+generation+"/"+n),prefix+"supervisor-operation-keys/"+opKey+".json",prefix+"daemon-launch-keys/"+launchKey+".json"].sort().map(name=>pin(root,name));
  return {operationId,generation,kernelIdentity:registration.kernelIdentity,ticketExpiresAt:chain.ticket.value.expiresAt,files};
}
function assertNoRetainedRuntime(root){
  const base=authority.base(root);for(const name of ["retained-authority.json","prepared-successor.json","profiles","fixture-profiles","fixture-cleanup-jobs","daemon-succession","daemon-verified-shutdown","historical-sources"])if(fs.existsSync(path.join(base,name)))fail("owned_initial_active_retained_authority_present");
  if(fs.existsSync(path.join(root,"logs","cep-panel-control","owned")))fail("owned_initial_owned_transport_present");
}
function history(root){
  const files=[];for(const name of [".codex-runtime/ame-native-fixture-ledger","logs/evidence/native-fixture-retained","logs/evidence/native-fixture-retained-maintenance"]){const start=path.join(root,...name.split("/"));if(!fs.existsSync(start))continue;
    function walk(dir,depth){ledger.safeDirectory(dir);if(depth>6 || files.length>4096)fail("owned_initial_history_budget");for(const n of fs.readdirSync(dir).sort()){const p=path.join(dir,n),s=fs.lstatSync(p);if(s.isSymbolicLink())fail("owned_initial_history_identity");if(s.isDirectory())walk(p,depth+1);else if(s.isFile())files.push(pin(root,path.relative(root,p).replace(/\\/g,"/")));else fail("owned_initial_history_identity");}}walk(start,0);
  }return files.sort((a,b)=>a.name.localeCompare(b.name));
}
function prepare(root,authorizationReference){
  if(typeof authorizationReference!=="string" || !/^[a-f0-9-]{36}:initial-startup-recovery-20261017$/.test(authorizationReference))fail("owned_initial_current_chat_authorization_required");
  const base=authority.base(root);if(fs.existsSync(file(root)) || fs.existsSync(path.join(base,"current-daemon.json")))fail("owned_initial_provision_consumed");assertNoRetainedRuntime(root);
  const policy=authority.loadPolicy(root,"owned_daemon_lifecycle"),original=originalFacts(root),source=evidence.runtimeIdentity(root),fingerprint=authority.runtimeControlFor(root).credentialFingerprint(),now=Date.now();
  const value={schema:SCHEMA+".authority",mode:"ordinary_initial_after_abandoned_startup",authorizationRef:{source:"explicit_user_chat",reference:authorizationReference},resetAnchor:"1206e57f6dcc5823ffb7ea5dc0ce69d7360b9a51",policyRawSha256:policy.rawSha256,configRawSha256:ledger.hash(ledger.readBytes(path.join(root,".codex","config.toml"))),credentialSha256:fingerprint,original,history:history(root),generation:crypto.randomUUID(),operationId:crypto.randomUUID(),bootNonce:crypto.randomUUID(),sourceSha256:source.sourceSha256,sourcePins:source.modules,issuedAt:new Date(now).toISOString(),expiresAt:new Date(now+TTL).toISOString(),historicalOutcome:"unknown",historicalExitProven:false,retainedAdmissionGranted:false,replayAllowed:false,authentication:"0".repeat(64)};
  value.authentication=sign(value,keyFor(root,fingerprint));policy.assertUnchanged();r1.writeJournalOnce(base,"initial-recovery-authority",value);return {ok:true,status:"initial_recovery_provisioned_no_effect",generation:value.generation,operationId:value.operationId,replayAllowed:false};
}
function load(root,{fresh=false,checkHistory=true}={}){
  const p=raw(file(root)),v=p.value.value;if(p.value.schema!==r1.SCHEMA+".envelope" || p.value.sha256!==r1.hash(v))fail("owned_initial_authority_envelope_invalid");
  authority.exact(v,["schema","mode","authorizationRef","resetAnchor","policyRawSha256","configRawSha256","credentialSha256","original","history","generation","operationId","bootNonce","sourceSha256","sourcePins","issuedAt","expiresAt","historicalOutcome","historicalExitProven","retainedAdmissionGranted","replayAllowed","authentication"]);
  authority.exact(v.authorizationRef,["source","reference"]);if(v.authorizationRef.source!=="explicit_user_chat" || !/^[a-f0-9-]{36}:initial-startup-recovery-20261017$/.test(v.authorizationRef.reference || ""))fail("owned_initial_current_chat_authorization_required");for(const id of [v.generation,v.operationId,v.bootNonce,v.original?.generation,v.original?.operationId])if(!ledger.UUID.test(id || ""))fail("owned_initial_authority_selector_invalid");
  if(v.schema!==SCHEMA+".authority" || v.mode!=="ordinary_initial_after_abandoned_startup" || v.resetAnchor!=="1206e57f6dcc5823ffb7ea5dc0ce69d7360b9a51" || v.historicalOutcome!=="unknown" || v.historicalExitProven!==false || v.retainedAdmissionGranted!==false || v.replayAllowed!==false || Date.parse(v.expiresAt)-Date.parse(v.issuedAt)!==TTL || fresh && (Date.now()<Date.parse(v.issuedAt) || Date.now()>=Date.parse(v.expiresAt)))fail("owned_initial_authority_invalid_or_expired");
  if(v.authentication!==sign(v,keyFor(root,v.credentialSha256)))fail("owned_initial_authority_authentication_invalid");
  const policy=authority.loadPolicy(root,"owned_daemon_lifecycle");if(policy.rawSha256!==v.policyRawSha256 || ledger.hash(ledger.readBytes(path.join(root,".codex","config.toml")))!==v.configRawSha256)fail("owned_initial_policy_or_config_changed");
  const source=evidence.runtimeIdentity(root);if(source.sourceSha256!==v.sourceSha256 || !same(source.modules,v.sourcePins))fail("owned_initial_source_changed");
  const pins=v.original.files.map(item=>{authority.exact(item,["name","sha256"]);if(!item.name.startsWith(".codex-runtime/owned-runtime-maintenance/") || item.name.includes("..") || pin(root,item.name).sha256!==item.sha256)fail("owned_initial_original_evidence_changed");return item;});
  if(pins.length!==8 || Date.now()<Date.parse(v.original.ticketExpiresAt))fail("owned_initial_original_evidence_invalid");assertNoRetainedRuntime(root);if(checkHistory && !same(history(root),v.history))fail("owned_initial_historical_inventory_changed");
  function assertUnchanged(){p.assertUnchanged();policy.assertUnchanged();if(ledger.hash(ledger.readBytes(path.join(root,".codex","config.toml")))!==v.configRawSha256 || evidence.runtimeIdentity(root).sourceSha256!==v.sourceSha256)fail("owned_initial_authority_changed");for(const item of pins)if(pin(root,item.name).sha256!==item.sha256)fail("owned_initial_original_evidence_changed");assertNoRetainedRuntime(root);}
  assertUnchanged();return {value:v,rawSha256:p.rawSha256,policy:policy.policy,assertUnchanged};
}
function startupMode(root,generation){if(!fs.existsSync(file(root)))return false;const cap=load(root,{fresh:true});return cap.value.generation===generation;}
function admissionReady(root,{generation,loadedSourceSha256,connectionReady}={}){
  try{if(connectionReady!==true)return false;const cap=load(root),v=cap.value;if(v.generation!==generation || v.sourceSha256!==loadedSourceSha256)return false;
    const supervisor=require("./owned-runtime-supervisor"),reg=supervisor.readDaemonRegistration(root),back=supervisor.readSupervisor(root,v.operationId),rows=back.rows,result=rows?.result?.value,completed=rows?.["initial-recovery-completed"]?.value,key=JSON.parse(ledger.readBytes(path.join(authority.base(root),"initial-recovery-keys",v.original.generation+".json")));
    if(!reg)return false;const {credentialSha256,...registration}=reg;
    return !rows?.unknown && reg.generation===generation && reg.sourceSha256===loadedSourceSha256 && result?.ok===true && result.status==="owned_daemon_registered_admission_closed" && result.generation===generation && same(result.registration,registration) && result.replayAllowed===false && completed?.schema===SCHEMA+".completed" && completed.generation===generation && completed.authorityRawSha256===cap.rawSha256 && completed.resultSha256===rows.result.sha256 && completed.replayAllowed===false && key.value?.authorityRawSha256===cap.rawSha256 && key.value.operationId===v.operationId;
  }catch(_){return false;}
}
function reserve(root){const cap=load(root,{fresh:true}),v=cap.value,dir=path.join(authority.base(root),"initial-recovery-keys");ledger.ensure(dir);const target=path.join(dir,v.original.generation+".json");
  if(fs.existsSync(target))return {consumed:true,cap};r1.writeJournalOnce(dir,v.original.generation,{schema:SCHEMA+".generation-key",generation:v.original.generation,successorGeneration:v.generation,operationId:v.operationId,authorityRawSha256:cap.rawSha256,replayAllowed:false});return {consumed:false,cap};}
function publishOnce(root,generation){const supervisor=require("./owned-runtime-supervisor"),base=authority.base(root),registration=JSON.parse(ledger.readBytes(path.join(base,"daemon-reservations",generation,"registration.json"))),value={schema:supervisor.SCHEMA+".current",generation,registrationSha256:registration.sha256};r1.writeJournalOnce(base,"current-daemon",value);return supervisor.readDaemonRegistration(root);}
function ordinaryCutover(){return {rows:[],assertUnchanged(){}};}
module.exports={SCHEMA,TTL,file,prepare,load,reserve,startupMode,admissionReady,publishOnce,ordinaryCutover,originalFacts,history,sign};
