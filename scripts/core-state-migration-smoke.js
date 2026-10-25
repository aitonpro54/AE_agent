"use strict";
// All resources are synthetic and contained in this Core's ignored test root.
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const migration=require("./core-state-migration"),memory=require("../mcp-server/project-state-store"),lifecycle=require("../mcp-server/project-lifecycle-transition"),c=require("../mcp-server/project-lifecycle-contract"),{createAutonomousSessionManager}=require("../mcp-server/autonomous-session");
const ROOT=path.resolve(__dirname,".."),parent=path.join(ROOT,".codex-runtime","core-state-migration-smoke"),base=path.join(parent,crypto.randomUUID());
fs.mkdirSync(base,{recursive:true});let caseId=0;
function fixture({enabled=false}={}){
  const dir=path.join(base,String(++caseId)),source=path.join(dir,"legacy"),destination=path.join(dir,"core"),preparationRoot=path.join(dir,"prepared");
  for(const p of [source,destination])fs.mkdirSync(p,{recursive:true});const p=migration.locations(source);fs.mkdirSync(p.stateDirectory,{recursive:true});fs.mkdirSync(path.dirname(p.preference),{recursive:true});
  const projectFile=memory.canonicalSavedProject("C:/synthetic-fixture/project.aep"),projectKey=memory.projectStateKey(projectFile);
  const state={schema:lifecycle.V2,projectState:{[projectKey]:{projectFile,projectKey,revision:7,acceptedPlaceholders:[],groupMappings:[],constraints:null,reviewArtifacts:{},inheritedOwnership:[],sourceLoadEpochs:{}}},lifecycleGeneration:0,pendingLifecycle:null,lifecycleReceipts:[]};
  fs.writeFileSync(p.state,JSON.stringify(state,null,2)+"\r\n");fs.writeFileSync(p.marker,JSON.stringify({schema:lifecycle.MARKER,storePathHash:c.hash(path.resolve(p.state))})+"\n");
  fs.writeFileSync(p.preference,JSON.stringify({schema:"ae-agent.autonomy-preference.v2",desiredEnabled:enabled,panelConnectionId:"synthetic-panel",panelGeneration:"1"})+"\n");
  return {source,destination,preparationRoot,p,state,projectKey,id:crypto.randomUUID(),preparer:migration.createPreparer({sourceRoot:source,destinationRoot:destination,preparationRoot})};
}
function mutateState(f,change){const p=migration.locations(f);const data=JSON.parse(fs.readFileSync(p.state));change(data);fs.writeFileSync(p.state,JSON.stringify(data,null,2)+"\n");}
function publishFixture(f,preparer=f.preparer,id=f.id,destination=f.destination,{stateOnly=false}={}){
  // This test-owned filesystem move represents the separately approved operator
  // algorithm. There is deliberately no corresponding public product apply API.
  const dir=preparer.directory(id),p=migration.locations(destination);fs.mkdirSync(path.dirname(p.stateDirectory),{recursive:true});fs.mkdirSync(path.dirname(p.preference),{recursive:true});
  fs.renameSync(path.join(dir,"project-intent"),p.stateDirectory);if(!stateOnly)fs.renameSync(path.join(dir,"autonomy-preference.json"),p.preference);
}
function offAcrossRestart(file){for(let n=0;n<2;n++){const panel={panelConnectionId:"synthetic-new-panel",panelGeneration:String(10+n),seenAt:Date.now()};const session=createAutonomousSessionManager({statePath:file,panelState:()=>panel});session.observePanel(panel);assert.equal(session.publicStatus().desiredEnabled,false);assert.equal(session.publicStatus().active,false);assert.equal(session.authorization(),null);}}
try{
  const f=fixture(),raw=fs.readFileSync(f.p.state),originalMarker=fs.readFileSync(f.p.marker);const prepared=f.preparer.prepare(f.id);
  assert.equal(prepared.status,"prepared_review_required");assert.equal(prepared.runtimeProofVerified,false);assert.equal(prepared.readyForStartup,false);assert.equal(prepared.review.protectedContentIncluded,false);
  const dir=f.preparer.directory(f.id);assert(fs.readFileSync(path.join(dir,"project-intent","project-intent-state.json")).equals(raw));assert(fs.readFileSync(f.p.marker).equals(originalMarker));assert(!fs.existsSync(migration.locations(f.destination).state));
  const rebound=JSON.parse(fs.readFileSync(path.join(dir,"project-intent",path.basename(f.p.marker))));assert.equal(rebound.storePathHash,c.hash(path.resolve(migration.locations(f.destination).state)));
  publishFixture(f,undefined,undefined,undefined,{stateOnly:true});assert.equal(f.preparer.status(f.id).status,"publication_incomplete");
  fs.renameSync(path.join(dir,"autonomy-preference.json"),migration.locations(f.destination).preference);assert.equal(f.preparer.status(f.id).status,"published_requires_runtime_readback");
  const destination=migration.locations(f.destination);assert(fs.readFileSync(destination.state).equals(raw));assert.equal(lifecycle.guardSnapshot({statePath:destination.state,enabled:true}).problem,null);assert.equal(memory.loadProjectStateStore({statePath:destination.state,enabled:true}).projectState[f.projectKey].revision,7);offAcrossRestart(destination.preference);
  assert.equal(f.preparer.prepare(f.id).status,"published_requires_runtime_readback");assert(!fs.existsSync(path.join(dir,"project-intent")));assert(!Object.hasOwn(f.preparer,"apply"));

  for(const key of ["state","marker","preference"]){const x=fixture();fs.unlinkSync(x.p[key]);assert.throws(()=>x.preparer.prepare(x.id),/missing_unknown/);assert(!fs.existsSync(x.preparer.directory(x.id)));}
  for(const key of ["state","marker","preference"]){const x=fixture();fs.writeFileSync(x.p[key],"{corrupt");assert.throws(()=>x.preparer.prepare(x.id));assert(!fs.existsSync(x.preparer.directory(x.id)));}
  const oldMarker=fixture();fs.writeFileSync(oldMarker.p.marker,JSON.stringify({schema:lifecycle.MARKER,storePathHash:"0".repeat(64)}));assert.throws(()=>oldMarker.preparer.prepare(oldMarker.id),/marker_corrupt/);
  const pending=fixture();mutateState(pending.source,s=>{s.pendingLifecycle={status:"unknown",possibleDelivery:true};});assert.throws(()=>pending.preparer.prepare(pending.id));
  const existing=fixture();fs.mkdirSync(migration.locations(existing.destination).stateDirectory,{recursive:true});assert.throws(()=>existing.preparer.prepare(existing.id),/destination_not_fresh/);
  const linked=fixture();fs.linkSync(linked.p.state,path.join(linked.source,"linked-state"));assert.throws(()=>linked.preparer.prepare(linked.id),/file_ambiguous/);
  const redirected=fixture(),real=redirected.p.stateDirectory+"-original";fs.renameSync(redirected.p.stateDirectory,real);fs.symlinkSync(real,redirected.p.stateDirectory,"junction");assert.throws(()=>redirected.preparer.prepare(redirected.id),/redirected_path/);
  const prefSchema=fixture();fs.writeFileSync(prefSchema.p.preference,JSON.stringify({schema:"legacy",desiredEnabled:false}));assert.throws(()=>prefSchema.preparer.prepare(prefSchema.id),/preference_invalid/);
  const override=fixture();fs.mkdirSync(path.join(override.source,".codex"));fs.writeFileSync(path.join(override.source,".codex","config.toml"),'[mcp_servers."after-effects".env]\nAE_BRIDGE_STATE_DIR = "C:/unknown"\n');assert.throws(()=>override.preparer.prepare(override.id),/nondefault_state_layout/);
  for(const text of [
    '[mcp_servers."after-effects".env] # valid table comment\nAE_BRIDGE_STATE_DIR = "C:/unknown"\n',
    "[mcp_servers.'after-effects'.env]\nAE_BRIDGE_STATE_DIR = 'C:/unknown'\n",
    '[mcp_servers."after\\u002deffects".env]\nAE_BRIDGE_STATE_DIR = "C:/unknown"\n',
    '[mcp_servers."after\\U0000002deffects".env]\nAE_BRIDGE_STATE_DIR = "C:/unknown"\n',
    '[mcp_servers."after\\u002deffects".env]\n"\\U00000041E_BRIDGE_STATE_DIR" = "C:/unknown"\n',
    '[mcp_servers."after-effects"]\nenv = { AE_BRIDGE_STATE_DIR = "C:/unknown" }\n',
    'mcp_servers = { "after-effects" = { env = { AE_BRIDGE_STATE_DIR = "C:/unknown" } } }\n',
    '[mcp_servers]\n"after\\u002deffects" = { env = { "AE_BRIDGE_STAT\\u0045_DIR" = "C:/unknown" } }\n',
    '[mcp_servers]\n"after\\u002deffects".env."AE_BRIDGE_STAT\\u0045_DIR" = "C:/unknown"\n',
    '[mcp_servers."after-effects".env]\nae_bridge_state_dir = "C:/unknown"\n',
    '[mcp_servers."after-effects".env]\n"AE_BRIDGE_\\u0053TATE_DIR" = "C:/unknown"\n'
  ]){const x=fixture();fs.mkdirSync(path.join(x.source,".codex"));fs.writeFileSync(path.join(x.source,".codex","config.toml"),text);assert.throws(()=>x.preparer.prepare(x.id),e=>{assert(/^migration_(?:nondefault_state_layout|config_layout_unknown)$/.test(e.code));assert.deepEqual(Object.keys(e.configDiagnostic).sort(),["fieldName","file","lineNumber","reason"]);assert(!JSON.stringify(e.configDiagnostic).includes("C:/unknown"));return true;});assert(!fs.existsSync(x.preparer.directory(x.id)));}
  const otherEnv=fixture();fs.mkdirSync(path.join(otherEnv.source,".codex"));fs.writeFileSync(path.join(otherEnv.source,".codex","config.toml"),'[mcp_servers."unrelated".env]\nAE_BRIDGE_STATE_DIR = "C:/other-service"\n[mcp_servers."after-effects".env] # supported\n# AE_BRIDGE_STATE_DIR is not configured here\n');assert.equal(otherEnv.preparer.prepare(otherEnv.id).status,"prepared_review_required");

  const unknown=fixture();unknown.preparer.prepare(unknown.id);const unknownDir=unknown.preparer.directory(unknown.id),preparedFile=path.join(unknownDir,"project-intent","project-intent-state.json"),before=fs.statSync(preparedFile,{bigint:true}).mtimeNs;fs.unlinkSync(path.join(unknownDir,"result.json"));assert.equal(unknown.preparer.status(unknown.id).status,"prepared_output_reconciled");assert.equal(unknown.preparer.prepare(unknown.id).status,"prepared_output_reconciled");assert.equal(fs.statSync(preparedFile,{bigint:true}).mtimeNs,before);assert(!fs.existsSync(path.join(unknownDir,"result.json")));
  fs.writeFileSync(path.join(unknownDir,"project-intent","unexpected"),"unknown");assert.equal(unknown.preparer.status(unknown.id).status,"preparation_unknown");
  const drift=fixture();const drifting=migration.createPreparer({sourceRoot:drift.source,destinationRoot:drift.destination,preparationRoot:drift.preparationRoot,onBeforeSeal:()=>fs.appendFileSync(drift.p.state," ")});assert.throws(()=>drifting.prepare(drift.id),/source_changed/);assert.equal(drifting.prepare(drift.id).status,"source_changed");
  const identityDrift=fixture();identityDrift.preparer.prepare(identityDrift.id);const sameBytes=fs.readFileSync(identityDrift.p.state);fs.unlinkSync(identityDrift.p.state);fs.writeFileSync(identityDrift.p.state,sameBytes);assert.equal(identityDrift.preparer.status(identityDrift.id).status,"source_changed");
  const corruptedOutput=fixture();corruptedOutput.preparer.prepare(corruptedOutput.id);fs.appendFileSync(path.join(corruptedOutput.preparer.directory(corruptedOutput.id),"project-intent","project-intent-state.json")," ");assert.equal(corruptedOutput.preparer.status(corruptedOutput.id).status,"preparation_unknown");
  const outputIdentity=fixture();outputIdentity.preparer.prepare(outputIdentity.id);const outputFile=path.join(outputIdentity.preparer.directory(outputIdentity.id),"project-intent","project-intent-state.json"),outputBytes=fs.readFileSync(outputFile);fs.unlinkSync(outputFile);fs.writeFileSync(outputFile,outputBytes);assert.equal(outputIdentity.preparer.status(outputIdentity.id).status,"preparation_unknown");
  const resultBinding=fixture();resultBinding.preparer.prepare(resultBinding.id);fs.appendFileSync(path.join(resultBinding.preparer.directory(resultBinding.id),"intent.json")," ");assert.equal(resultBinding.preparer.status(resultBinding.id).status,"preparation_unknown");
  for(const change of [r=>{delete r.outputIdentities;},r=>{r.replayAllowed=true;},r=>{r.runtimeProofVerified=true;},r=>{r.unreviewed=true;},r=>{r.outputIdentities.state={};}]){const x=fixture();x.preparer.prepare(x.id);const resultFile=path.join(x.preparer.directory(x.id),"result.json"),r=JSON.parse(fs.readFileSync(resultFile));change(r);fs.writeFileSync(resultFile,JSON.stringify(r));assert.equal(x.preparer.status(x.id).status,"preparation_unknown");assert.throws(()=>x.preparer.originalPreparation(x.id),/migration_result_/);}

  // Rollback carries current Core revisions/OFF; it never restores old ON or
  // old protected resources merely because the code/config is being rolled back.
  const rollback=fixture({enabled:true});rollback.preparer.prepare(rollback.id);const forwardIntent=JSON.parse(fs.readFileSync(path.join(rollback.preparer.directory(rollback.id),"intent.json")));publishFixture(rollback);
  mutateState(rollback.destination,s=>{s.projectState[rollback.projectKey].revision=8;});const corePref=migration.locations(rollback.destination).preference;fs.writeFileSync(corePref,JSON.stringify({schema:"ae-agent.autonomy-preference.v2",desiredEnabled:false,panelConnectionId:"synthetic-panel",panelGeneration:"2"})+"\n");
  const reverse=migration.createPreparer({sourceRoot:rollback.destination,destinationRoot:rollback.source,preparationRoot:rollback.preparationRoot}),reverseId=crypto.randomUUID(),reversePrepared=reverse.prepare(reverseId,{destinationBaseline:forwardIntent.source});assert.equal(reversePrepared.preferenceLocation,"baseline_requires_backup");
  const backup=path.join(reverse.directory(reverseId),"rollback-backup");fs.mkdirSync(backup);fs.renameSync(rollback.p.stateDirectory,path.join(backup,"project-intent"));fs.renameSync(rollback.p.preference,path.join(backup,"autonomy-preference.json"));publishFixture(rollback,reverse,reverseId,rollback.source);
  assert.equal(reverse.status(reverseId).status,"published_requires_runtime_readback");assert.equal(memory.loadProjectStateStore({statePath:rollback.p.state,enabled:true}).projectState[rollback.projectKey].revision,8);offAcrossRestart(rollback.p.preference);
  assert.throws(()=>reverse.prepare(crypto.randomUUID(),{destinationBaseline:forwardIntent.source}),/destination_baseline_changed/);
  console.log(JSON.stringify({ok:true,scope:"synthetic offline state/pref fixtures only",byteExactState:true,pathMarkerRebind:true,offConnectRestartRollback:true,unknownNoReplay:true,partialPublishReadback:true,redirectAndHardlinkDenied:true,runtimeProofVerified:false,actualSourceCopied:false,actualPublication:false}));
}finally{
  const resolved=path.resolve(base);if(!resolved.startsWith(path.resolve(parent)+path.sep))throw Error("fixture cleanup escaped owned root");fs.rmSync(resolved,{recursive:true,force:true});
}
