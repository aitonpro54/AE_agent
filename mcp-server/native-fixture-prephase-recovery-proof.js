"use strict";
// Fixed, hash-bound classification of one historical server path. It is not
// native completion, boot authentication, endpoint revocation or process exit.
const fs=require("node:fs"),path=require("node:path");
const ledger=require("./native-fixture-attempt-ledger"),records=require("./plan-run-records"),evidence=require("./review-evidence"),abandonment=require("./native-fixture-abandonment");
const {fail,hash,same}=ledger;
const PROFILE=Object.freeze({runId:"5a4ac6eb-7b2e-42ce-8af9-7d03e52c17c5",requestId:"4f06da6d-4b76-40b2-b70b-a77db3e1e9c7",stageId:"3fed0bd18d6bd8d01834bd35ef2c6236",nonce:"e8bae1246dfa7890383e5303b06fb6b2",
  rootPath:"C:\\Users\\Ant\\Documents\\Codex\\AE_agent\\.codex-runtime\\ame-native-fixtures\\probe-e8bae1246dfa7890383e5303b06fb6b2",
  actionId:"act_500947d092694dd2a9c29a2a33bcc1b4",proposalRevision:2,payloadHash:"sha256:54884eebfae67433fcc0503281c650969b1baaf0a1d50efce9824a9421a99749",
  errorCode:"fixture_runner_launch_identity_changed",runtimeSha256:"793480e403334fc7462afbef4fdcd49667b50bdefa5cfe13c3b34386b40a818b",recordSha256:"251f2193ec1baa7357f676791b2e523ae134e4eb450211230e5c7281116af316"});
const SOURCES=Object.freeze({"ame-native-fixture-runner.js":"babacc072526f4bd1e4b90dcfbcc857f8c960f554d9e458671404910fdc07d7a","ame-native-fixture-grant.js":"158f89421154aa1443fdd54e97b8adebf1a1d2ac08f7f21a7893b166b16c69f1",
  "native-fixture-attempt-ledger.js":"2ec14da0d0131584be69ce1e3cfab36fab1d64f0e3b4b72b8fc06e10d63c3c90","review-evidence.js":"c844ddbf1e2c9f537a26bc648ec1e5b025071756185be677fe25f2ae31a2a437",
  "cep-manual-plan-ingress.js":"930a86ef7d4dfe64cf78875419fbdcc84e49afd192e18fda6ec2469a66ce4908","bridge-daemon.js":"bc26df0d1c28ed14c31e72fec4a58c0a718a522ca1115e30285bd7b76958ac93","plan-run-records.js":"422d1240144bc91370bb937328305655ed40c39bde596dc20e2325ca584f89d4"});
const LEDGER_FILES=Object.freeze({"owner.json":"b71e35adad3f8358f2acf446d6922c11f48160958eec74eddca6cffc0a62009d","reservation.json":"bd7aed35347769e13394aa4bc277c203fc66d893c6e46aef5fabf7da6059dade","unknown.json":"9999d85f08fd79a65b614ff5b216112702481008a05f11b6b21dde426e9fdc41"});
const NATIVE_FILES=Object.freeze({"launch.manifest":"6683d3d3f9c0782747547722c7597138f01c5fd4b0cc172733ba12fee75270fb","owner.lock":"52514ef9b04d3815e86518079af57e31a1b196d119e54e12106228612c2c8937","signed-boot.json":"db0856a3ec408ab30408512165bda2fef082ad2412b37e22e18f0bc1d4d2dda1"});
const selector=()=>({requestId:PROFILE.requestId,runId:PROFILE.runId});
function select(value) {if(!value || !same(Object.keys(value).sort(),["requestId","runId"]) || value.requestId!==PROFILE.requestId || value.runId!==PROFILE.runId)fail("fixture_prephase_fixed_selector_required");return selector();}
function pinned(file,digest) {if(hash(ledger.readBytes(file))!==digest)fail("fixture_prephase_original_bytes_changed");}
function pinnedDirectory(dir,pins) {ledger.safeDirectory(dir);if(!same(fs.readdirSync(dir).sort(),Object.keys(pins).sort()))fail("fixture_prephase_phase_or_output_or_partial_present");for(const [name,digest] of Object.entries(pins))pinned(path.join(dir,name),digest);}
function original(repoRoot,evidenceRoot) {
  const s=selector(),file=records.fileFor(evidenceRoot,s.runId);pinned(file,"ffc0271d8a36a092fb68ada898905e00e96c243d9b0ed8ce50dc0d5d57306634");
  const envelope=JSON.parse(ledger.readBytes(file)),record=records.readRecord(evidenceRoot,s.runId,{throwOnError:true}),r=record.run,pv=r.provenance;
  if(envelope.sha256!==PROFILE.recordSha256 || record.runId!==PROFILE.runId || r.errorCode!==PROFILE.errorCode || pv.actionId!==PROFILE.actionId || pv.proposalRevision!==PROFILE.proposalRevision || pv.payloadHash!==PROFILE.payloadHash ||
    pv.runtime?.modules?.length!==48 || pv.runtime.sourceSha256!==PROFILE.runtimeSha256 || evidence.sha256(pv.runtime.modules)!==PROFILE.runtimeSha256)fail("fixture_prephase_canonical_binding_invalid");
  const proof=abandonment.canonical(evidenceRoot,s);
  const sourceRoot=path.join(repoRoot,".codex-runtime","ame-runner-recovery-20261011","old-runtime-source");
  for(const [name,digest] of Object.entries(SOURCES)) {pinned(path.join(sourceRoot,name),digest);if(pv.runtime.modules.filter(m=>m.name==="mcp-server/"+name && m.sha256===digest).length!==1)fail("fixture_prephase_original_runtime_binding_invalid");}
  const dir=ledger.directory(repoRoot,PROFILE.stageId),nativeRoot=path.join(repoRoot,".codex-runtime","ame-native-fixtures","probe-"+PROFILE.nonce);
  pinnedDirectory(dir,LEDGER_FILES);pinnedDirectory(nativeRoot,NATIVE_FILES);
  const reservation=ledger.read(ledger.fileFor(repoRoot,PROFILE.stageId,"reservation")),owner=ledger.read(ledger.fileFor(repoRoot,PROFILE.stageId,"owner")),unknown=ledger.read(ledger.fileFor(repoRoot,PROFILE.stageId,"unknown")),d=reservation.value.descriptor;
  if(d.stageId!==PROFILE.stageId || d.nonce!==PROFILE.nonce || d.role!=="capture" || d.rootPath!==PROFILE.rootPath || reservation.value.runId!==PROFILE.runId || reservation.value.actionId!==PROFILE.actionId || reservation.value.proposalRevision!==PROFILE.proposalRevision || reservation.value.payloadHash!==PROFILE.payloadHash ||
    reservation.value.manifestSha256!==NATIVE_FILES["launch.manifest"] || reservation.value.replayAllowed!==false || unknown.value.code!==PROFILE.errorCode || unknown.value.descriptorSha256!==hash(d) || unknown.value.historicalOutcome!=="unknown" || unknown.value.nativeExecutionProven!==false || unknown.value.replayAllowed!==false ||
    !same(owner.value,{schema:"ae-agent.native-fixture-owner.v2",rootPath:d.rootPath,nonce:d.nonce,stageId:d.stageId,role:d.role}))fail("fixture_prephase_reservation_binding_invalid");
  // The accepted seven exact source blobs prove: this error precedes boot
  // acceptance/issuePhase; signing follows CREATE_NEW + fsync of consumption.
  // No unsigned boot, process inventory or lost private key participates.
  return {proof,descriptor:d,checkpoint:record.run.checkpoint,proposalExpiresAt:r.m100Action.proposalExpiresAt,
    binding:{selector:s,stageId:d.stageId,nonce:d.nonce,rootPath:d.rootPath,canonicalRunRecordHash:proof.canonicalRunRecordHash,canonicalRunProjectionHash:proof.canonicalRunProjectionHash,
      reservationSha256:reservation.sha256,ownerSha256:owner.sha256,unknownSha256:unknown.sha256,descriptorSha256:hash(d),runtimeSha256:PROFILE.runtimeSha256,sourceHashes:SOURCES,ledgerFileHashes:LEDGER_FILES,nativeFileHashes:NATIVE_FILES,
      classifier:"approved_hash_bound_prephase_controlflow",phaseAuthorityNeverIssued:true,historicalOutcome:"unknown",nativeExecutionProven:false,replayAllowed:false,processExitProven:false,nativeEndpointInertProven:false}};
}
function originalLinked(value) {
  // Known v2 consumption/owner rows use bare selectors; reservation/recovery
  // rows use a descriptor. Inspect their union independently of run ownership.
  return [value,value?.selector,value?.descriptor,value?.attempt,value?.attempt?.descriptor].some(v=>v && (
    v.runId===PROFILE.runId || v.requestId===PROFILE.requestId || v.stageId===PROFILE.stageId || v.nonce===PROFILE.nonce ||
    typeof v.rootPath==="string" && path.win32.resolve(v.rootPath).toLowerCase()===path.win32.resolve(PROFILE.rootPath).toLowerCase()));
}
function inventory(repoRoot,evidenceRoot) {
  const parent=path.join(repoRoot,".codex-runtime","ame-native-fixtures"),ledgerParent=path.join(repoRoot,".codex-runtime","ame-native-fixture-ledger"),owned=new Map(),rows=[];
  ledger.safeDirectory(ledgerParent);ledger.safeDirectory(parent);
  for(const stageId of fs.readdirSync(ledgerParent)) {
    if(!ledger.TOKEN.test(stageId))fail("fixture_prephase_foreign_ledger");
    const dir=ledger.directory(repoRoot,stageId);ledger.safeDirectory(dir);
    const members=[],files=new Map();
    for(const file of fs.readdirSync(dir)) {
      if(!/^(owner|reservation|launch|unknown|retirement-proof|retirement-audit|recovered|consumed-(create-fixture|snapshot|stage-variants))\.json$/.test(file))fail("fixture_prephase_foreign_ledger");
      const member=ledger.read(path.join(dir,file)),v=member.value;
      if(stageId!==PROFILE.stageId && originalLinked(v))fail("fixture_prephase_second_member");
      files.set(file,member);
      rows.push({stageId,file,sha256:member.sha256});
      if(file==="reservation.json" || file==="recovered.json") {
        if(v.schema!==(file==="reservation.json" ? ledger.SCHEMA+".reservation" : abandonment.SCHEMA+".recovered-attempt") || v.replayAllowed!==false)fail("fixture_prephase_member_invalid");members.push(member);
      }
    }
    if(!members.length)fail("fixture_prephase_orphan_member");
    const row=members[0];if(members.some(m=>!same(m.value.descriptor,row.value.descriptor) || m.value.runId!==row.value.runId))fail("fixture_prephase_member_binding_conflict");
    const d=row.value.descriptor,isOriginal=stageId===PROFILE.stageId;
    if(!d || d.stageId!==stageId || !ledger.TOKEN.test(d.nonce || "") || !["capture","stage"].includes(d.role))fail("fixture_prephase_member_invalid");
    if(row.value.runId===PROFILE.runId && !isOriginal || !isOriginal && (d.nonce===PROFILE.nonce || d.rootPath===PROFILE.rootPath))fail("fixture_prephase_second_member");
    if(!isOriginal)ledger.descriptor(repoRoot,d);
    for(const [file,member] of files)if(file.startsWith("consumed-")) {
      const c=member.value,reserved=files.get("reservation.json")?.value,owner=files.get("owner.json")?.value,operation=file.slice(9,-5),operations=d.role==="capture" ? ["create-fixture","snapshot"] : ["stage-variants"];
      if(!reserved || !same(owner,{schema:"ae-agent.native-fixture-owner.v2",rootPath:d.rootPath,nonce:d.nonce,stageId:d.stageId,role:d.role}) ||
        !same(Object.keys(c).sort(),["schema","actionId","revision","payloadHash","runId","checkpointSha256","stageId","nonce","operation","expectedSha256","status","replayAllowed"].sort()) ||
        c.schema!=="ae-agent.native-fixture-attempt.v2" || c.runId!==reserved.runId || c.actionId!==reserved.actionId || c.revision!==reserved.proposalRevision || c.payloadHash!==reserved.payloadHash ||
        c.stageId!==d.stageId || c.nonce!==d.nonce || c.operation!==operation || !operations.includes(operation) || !ledger.SHA.test(c.checkpointSha256 || "") || !ledger.SHA.test(c.expectedSha256 || "") ||
        c.status!=="consumed_before_grant_publication" || c.replayAllowed!==false)fail("fixture_prephase_consumption_binding_invalid");
    }
    const root=path.join(parent,"probe-"+d.nonce);if(owned.has(root))fail("fixture_prephase_duplicate_member");owned.set(root,row);rows.push({stageId,runId:row.value.runId,sha256:row.sha256});
  }
  const obsDir=path.join(parent,"recovered-observations");
  if(fs.existsSync(obsDir)) {ledger.safeDirectory(obsDir);for(const name of fs.readdirSync(obsDir)) {
    if(/^[a-f0-9-]{36}\.retirement\.json$/i.test(name)) {
      const retired=abandonment.envelope(path.join(obsDir,name),"ae-agent.native-fixture-retirement-proof.v1"),v=retired.value,id=name.slice(0,-16);
      if(originalLinked(v))fail("fixture_prephase_second_member");
      if(!ledger.UUID.test(id) || v.observationId!==id || !fs.existsSync(abandonment.observationFile(repoRoot,id)))fail("fixture_prephase_orphan_member");
      const observed=abandonment.recovered(repoRoot,id,abandonment.selector(v.selector),abandonment.canonical(evidenceRoot,v.selector));
      ledger.validateRetirement(v,observed.process);rows.push({retirementObservationId:id,sha256:retired.sha256});continue;
    }
    if(!/^[a-f0-9-]{36}\.json$/i.test(name))fail("fixture_prephase_foreign_observation");
    const row=abandonment.envelope(path.join(obsDir,name),abandonment.OBSERVATION),v=row.value;
    if(originalLinked(v))fail("fixture_prephase_second_member");
    const proof=abandonment.canonical(evidenceRoot,abandonment.selector(v.selector)),observed=abandonment.recovered(repoRoot,name.slice(0,-5),v.selector,proof),d=observed.descriptor;
    if(!owned.has(d.rootPath))owned.set(d.rootPath,row);
    rows.push({observationId:v.observationId,sha256:row.sha256});
  }}
  for(const name of fs.readdirSync(parent)) {if(name==="recovered-observations")continue;if(!/^probe-[a-f0-9]{32}$/.test(name))fail("fixture_prephase_foreign_native_root");const root=path.join(parent,name);ledger.safeDirectory(root);if(!owned.has(root))fail("fixture_prephase_orphan_member");}
  return rows.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
}
function classify(repoRoot,evidenceRoot) {const value=original(repoRoot,evidenceRoot),union=inventory(repoRoot,evidenceRoot);return {...value,inventorySha256:hash(union)};}
module.exports={PROFILE,SOURCES,selector,select,classify};
