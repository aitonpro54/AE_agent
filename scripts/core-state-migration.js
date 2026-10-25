"use strict";
// Offline preparation only. No publish/apply, runtime grants, native factory,
// network, process control, installed/config writes or project modifications.
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const state=require("../mcp-server/project-state-store"),lifecycle=require("../mcp-server/project-lifecycle-transition"),contract=require("../mcp-server/project-lifecycle-contract");
const SCHEMA="ae-agent.core-state-preparation.v1",UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const CORE_ROOT=path.resolve(__dirname,".."),LEGACY_ROOT=path.resolve(CORE_ROOT,"../AE_agent");
const hash=b=>crypto.createHash("sha256").update(b).digest("hex");
function fail(code){throw Object.assign(Error(code),{code});}
function locations(root){return {root:path.resolve(root),stateDirectory:path.join(root,".codex-runtime","project-intent"),state:path.join(root,".codex-runtime","project-intent","project-intent-state.json"),marker:path.join(root,".codex-runtime","project-intent","project-intent-state.json.lifecycle-initialized.json"),preference:path.join(root,"logs","autonomy-preference.json")};}
function plainAncestors(file){for(let p=path.resolve(file);;p=path.dirname(p)){let s;try{s=fs.lstatSync(p);}catch(e){if(e.code!=="ENOENT")fail("migration_path_unreadable");}if(s&&(s.isSymbolicLink()||fs.realpathSync(p).toLowerCase()!==p.toLowerCase()))fail("migration_redirected_path");if(path.dirname(p)===p)break;}}
function exists(file){try{fs.lstatSync(file);return true;}catch(e){if(e.code==="ENOENT")return false;fail("migration_path_unreadable");}}
function identity(s){return Object.fromEntries(["dev","ino","size","mtimeNs","ctimeNs"].map(k=>[k,String(s[k])]));}
function readPinned(file,maximum=state.MAX_PACKED_STATE_BYTES){
  plainAncestors(file);const before=fs.lstatSync(file,{bigint:true});
  if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1n||before.size>BigInt(maximum))fail("migration_file_ambiguous");
  const bytes=fs.readFileSync(file),id=identity(before),sha256=hash(bytes);
  const assertUnchanged=()=>{plainAncestors(file);const s=fs.lstatSync(file,{bigint:true});if(s.nlink!==1n||JSON.stringify(identity(s))!==JSON.stringify(id)||hash(fs.readFileSync(file))!==sha256)fail("migration_source_changed");};
  assertUnchanged();return {bytes,metadata:{bytes:bytes.length,sha256,identity:id},assertUnchanged};
}
function decode(bytes){const text=bytes.toString("utf8");if(!Buffer.from(text,"utf8").equals(bytes))fail("migration_invalid_utf8");try{return JSON.parse(text);}catch(_){fail("migration_invalid_json");}}
function validatePreference(bytes){
  const v=decode(bytes);if(!v||Object.keys(v).sort().join(",")!=="desiredEnabled,panelConnectionId,panelGeneration,schema"||v.schema!=="ae-agent.autonomy-preference.v2"||typeof v.desiredEnabled!=="boolean")fail("migration_preference_invalid");
  if(v.desiredEnabled && (typeof v.panelConnectionId!=="string"||!v.panelConnectionId||typeof v.panelGeneration!=="string"||!/^\d+$/.test(v.panelGeneration)||!Number.isSafeInteger(Number(v.panelGeneration))||Number(v.panelGeneration)<1))fail("migration_preference_invalid");
  return {schema:v.schema,desiredEnabled:v.desiredEnabled,explicitOff:v.desiredEnabled===false};
}
function assertDefaultStateRoots(root){
  const config=path.join(root,".codex","config.toml");if(!exists(config))return {supported:true,configPresent:false};
  const text=readPinned(config,1024*1024).bytes.toString("utf8");let section=[],lineNumber=0;
  function bad(reason,fieldName=null,code="migration_config_layout_unknown"){throw Object.assign(Error(code),{code,configDiagnostic:{file:config,lineNumber,fieldName,reason}});}
  // Bounded TOML subset: unescaped table/key tokens and single-line scalar env
  // assignments. Inline MCP tables, escaped/dotted LHS and multiline syntax are
  // refused before capture. A selector is never guessed to be another server.
  const token=/^(?:[A-Za-z0-9_-]+|"[^"\\]*"|'[^'\\]*')/;
  function tokenValue(value){return /^['"]/.test(value)?value.slice(1,-1):value;}
  function lexical(raw){let quote=null,escape=false,equal=-1,inline=false,end=raw.length;
    for(let i=0;i<raw.length;i++){const ch=raw[i];if(escape){escape=false;continue;}if(quote==='"'&&ch==='\\'){escape=true;continue;}if(quote){if(ch===quote)quote=null;continue;}if(ch==='"'||ch==="'")quote=ch;else if(ch==="#"){end=i;break;}else if(ch==="="&&equal<0)equal=i;else if(ch==="{")inline=true;}
    if(quote)bad("multiline_or_unterminated_string");return {line:raw.slice(0,end).trim(),equal,inline};
  }
  for(const raw of text.split(/\r?\n/)){
    lineNumber++;const scan=lexical(raw),line=scan.line;if(!line)continue;
    if(line[0]==="["){
      if(!line.endsWith("]")||line.startsWith("[["))bad("unsupported_table_header");let tail=line.slice(1,-1).trim(),parts=[];
      while(tail){const match=token.exec(tail);if(!match)bad("unsupported_table_selector");parts.push(tokenValue(match[0]));tail=tail.slice(match[0].length).trim();if(!tail)break;if(tail[0]!==".")bad("ambiguous_table_selector");tail=tail.slice(1).trim();if(!tail)bad("ambiguous_table_selector");}
      if(!parts.length)bad("empty_table_selector");section=parts;continue;
    }
    const index=line.indexOf("=");if(index<1)bad("unsupported_assignment");const lhs=line.slice(0,index).trim(),match=token.exec(lhs);
    if(!match||match[0]!==lhs)bad("escaped_dotted_or_unsupported_key");const name=tokenValue(lhs),rhs=line.slice(index+1).trim();
    if(scan.inline&&(section[0]==="mcp_servers"||name==="mcp_servers"))bad("inline_mcp_table",name);
    const envTable=section[0]==="mcp_servers"&&section.length===3&&section[2]==="env";
    if(envTable && !/^(?:"(?:[^"\\]|\\.)*"|'[^']*'|true|false|[+-]?[0-9]+(?:\.[0-9]+)?)$/.test(rhs))bad("unsupported_env_scalar",name);
    if(!/^AE_BRIDGE_(STATE_DIR|LOG_DIR)$/i.test(name))continue;
    if(!envTable)bad("state_key_outside_known_env_table",name);
    if(section[1]!=="after-effects")continue; // Proven, unescaped unrelated server.
    if(!["AE_BRIDGE_STATE_DIR","AE_BRIDGE_LOG_DIR"].includes(name))bad("noncanonical_state_key",name);
    let value;try{value=rhs[0]==="'"?rhs.slice(1,-1):JSON.parse(rhs);}catch(_){bad("unsupported_state_value",name);}
    const expected=path.join(root,"logs");
    // STATE_DIR also redirects preference; default layout only in this packet.
    if(name==="AE_BRIDGE_STATE_DIR"||typeof value!=="string"||!path.isAbsolute(value)||path.resolve(value).toLowerCase()!==expected.toLowerCase())bad("nondefault_state_layout",name,"migration_nondefault_state_layout");
  }
  return {supported:true,configPresent:true};
}
function capture(root){
  const p=locations(root);assertDefaultStateRoots(root);
  for(const key of ["state","marker","preference"])if(!exists(p[key]))fail("migration_"+key+"_missing_unknown");
  if(JSON.stringify(fs.readdirSync(p.stateDirectory).sort())!==JSON.stringify([path.basename(p.state),path.basename(p.marker)].sort()))fail("migration_state_namespace_unknown");
  const store=readPinned(p.state),marker=readPinned(p.marker,4096),preference=readPinned(p.preference,8192);
  const facts=lifecycle.guardSnapshot({statePath:p.state,enabled:true});if(facts.problem)fail("migration_"+facts.problem);if(facts.pending)fail("migration_pending_lifecycle");
  const logical=state.loadProjectStateStore({statePath:p.state,enabled:true});if(logical.schema!==lifecycle.V2)fail("migration_v2_required");
  const summary={schema:logical.schema,projects:Object.keys(logical.projectState).length,lifecycleGeneration:logical.lifecycleGeneration,lifecycleReceiptCount:logical.lifecycleReceipts.length,pendingLifecycle:false,
    revisionDigest:contract.hash(Object.entries(logical.projectState).map(([key,v])=>[key,v.revision]).sort((a,b)=>a[0].localeCompare(b[0])))};
  const pref=validatePreference(preference.bytes);store.assertUnchanged();marker.assertUnchanged();preference.assertUnchanged();
  return {paths:p,store,marker,preference,summary,pref,assertUnchanged(){store.assertUnchanged();marker.assertUnchanged();preference.assertUnchanged();}};
}
function writeOnce(file,bytes){const fd=fs.openSync(file,"wx",0o600);try{fs.writeFileSync(fd,bytes);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
function metadata(value){return {state:value.store.metadata,marker:value.marker.metadata,preference:value.preference.metadata,summary:value.summary,autonomy:value.pref};}
function sameContent(a,b){return ["state","marker","preference"].every(k=>a[k].sha256===b[k].sha256&&a[k].bytes===b[k].bytes&&JSON.stringify(a[k].identity)===JSON.stringify(b[k].identity));}
function validatePreparedResult(result,id,intentSha256){
  const keys=["schema","operationId","intentSha256","outputIdentities","createdAt","runtimeProofVerified","replayAllowed"].sort().join(",");
  if(!result||Object.keys(result).sort().join(",")!==keys||result.schema!==SCHEMA+".prepared"||result.operationId!==id||result.intentSha256!==intentSha256||result.runtimeProofVerified!==false||result.replayAllowed!==false||!Number.isFinite(Date.parse(result.createdAt))||!result.outputIdentities||Object.keys(result.outputIdentities).sort().join(",")!=="marker,preference,state")fail("migration_result_binding_invalid");
  for(const value of Object.values(result.outputIdentities))if(!value||Object.keys(value).sort().join(",")!=="ctimeNs,dev,ino,mtimeNs,size"||Object.values(value).some(v=>typeof v!=="string"||!/^\d+$/.test(v)))fail("migration_result_identity_invalid");
  return result;
}
function createPreparer({sourceRoot,destinationRoot,preparationRoot,onBeforeSeal}={}){
  sourceRoot=path.resolve(sourceRoot);destinationRoot=path.resolve(destinationRoot);preparationRoot=path.resolve(preparationRoot);
  if(sourceRoot===destinationRoot||!preparationRoot.startsWith(CORE_ROOT+path.sep)&&sourceRoot===LEGACY_ROOT)fail("migration_root_contract");
  const src=locations(sourceRoot),dst=locations(destinationRoot);
  function directory(id){if(!UUID.test(id||""))fail("migration_operation_id_invalid");return path.join(preparationRoot,id);}
  function readIntent(id){const dir=directory(id),row=decode(readPinned(path.join(dir,"intent.json"),65536).bytes);
    if(row.schema!==SCHEMA+".intent"||row.operationId!==id||row.sourceRoot!==sourceRoot||row.destinationRoot!==destinationRoot||row.replayAllowed!==false||row.runtimeProofVerified!==false)fail("migration_intent_invalid");
    if(row.outputs.state.sha256!==row.source.state.sha256||row.outputs.preference.sha256!==row.source.preference.sha256||row.outputs.marker.sha256!==hash(Buffer.from(JSON.stringify({schema:lifecycle.MARKER,storePathHash:contract.hash(path.resolve(dst.state))})+"\n")))fail("migration_output_binding_invalid");
    return row;
  }
  function readPrepared(id,requireResult=false){const intent=readIntent(id),dir=directory(id),file=path.join(dir,"result.json");if(!exists(file)){if(requireResult)fail("migration_original_result_required");return {intent,result:null};}
    return {intent,result:validatePreparedResult(decode(readPinned(file,65536).bytes),id,hash(fs.readFileSync(path.join(dir,"intent.json"))))};
  }
  function inspectGroup(paths,expected){try{for(const [key,file]of Object.entries(paths)){const r=readPinned(file,key==="marker"?4096:key==="preference"?8192:state.MAX_PACKED_STATE_BYTES);if(r.metadata.sha256!==expected[key].sha256||r.metadata.bytes!==expected[key].bytes||expected[key].identity&&JSON.stringify(r.metadata.identity)!==JSON.stringify(expected[key].identity))return "different";}return "matching";}catch(e){return Object.values(paths).some(exists)?"unknown":"absent";}}
  function status(id){
    const dir=directory(id);if(!exists(dir))return {schema:SCHEMA+".status",operationId:id,status:"not_prepared",replayAllowed:false,runtimeProofVerified:false,readyForStartup:false};
    let intent,result=null;try{({intent,result}=readPrepared(id));}catch(e){return {schema:SCHEMA+".status",operationId:id,status:"preparation_unknown",code:e.code||"migration_preparation_unreadable",replayAllowed:false,runtimeProofVerified:false,readyForStartup:false};}
    let sourceStatus="unchanged";try{if(!sameContent(metadata(capture(sourceRoot)),intent.source))sourceStatus="changed";}catch(e){sourceStatus=e.code||"unreadable";}
    const stage={state:path.join(dir,"project-intent","project-intent-state.json"),marker:path.join(dir,"project-intent","project-intent-state.json.lifecycle-initialized.json"),preference:path.join(dir,"autonomy-preference.json")};
    const expected=intent.outputs,stageState=inspectGroup({state:stage.state,marker:stage.marker},expected),finalState=inspectGroup({state:dst.state,marker:dst.marker},expected),stagePref=inspectGroup({preference:stage.preference},expected),finalPref=inspectGroup({preference:dst.preference},expected);
    const stateBaseline=intent.destinationBaseline?inspectGroup({state:dst.state,marker:dst.marker},intent.destinationBaseline):"absent";
    const prefBaseline=intent.destinationBaseline?inspectGroup({preference:dst.preference},intent.destinationBaseline):"absent";
    const locate=(staged,final,baseline)=>staged==="matching"&&final==="absent"?"staged":staged==="absent"&&final==="matching"?"published":staged==="matching"&&baseline==="matching"?(final==="matching"?"baseline_already_matches":"baseline_requires_backup"):"unknown";
    let stateLocation=locate(stageState,finalState,stateBaseline),preferenceLocation=locate(stagePref,finalPref,prefBaseline);
    if(result){
      // Rename can update ctime. Object ID, bytes and content/mtime stay pinned;
      // source freshness above still compares the complete pre/post identity.
      const actualIds=(files)=>Object.entries(files).every(([key,file])=>{try{const actual=readPinned(file).metadata.identity,expected=result.outputIdentities[key];return ["dev","ino","size","mtimeNs"].every(k=>actual[k]===expected[k]);}catch(_){return false;}});
      if(stateLocation==="staged"||stateLocation==="baseline_requires_backup"||stateLocation==="baseline_already_matches"){if(!actualIds({state:stage.state,marker:stage.marker}))stateLocation="unknown";}else if(stateLocation==="published"&&!actualIds({state:dst.state,marker:dst.marker}))stateLocation="unknown";
      if(preferenceLocation==="staged"||preferenceLocation==="baseline_requires_backup"||preferenceLocation==="baseline_already_matches"){if(!actualIds({preference:stage.preference}))preferenceLocation="unknown";}else if(preferenceLocation==="published"&&!actualIds({preference:dst.preference}))preferenceLocation="unknown";
    }
    for(const folder of [path.join(dir,"project-intent"),dst.stateDirectory])if(exists(folder)&&JSON.stringify(fs.readdirSync(folder).sort())!==JSON.stringify([path.basename(dst.state),path.basename(dst.marker)].sort()))stateLocation="unknown";
    const resultPresent=exists(path.join(dir,"result.json"));
    const unknown=[stateLocation,preferenceLocation].includes("unknown");
    const bothPublished=[stateLocation,preferenceLocation].every(v=>v==="published"||v==="baseline_already_matches");
    return {schema:SCHEMA+".status",operationId:id,status:sourceStatus!=="unchanged"?"source_changed":unknown?"preparation_unknown":bothPublished?"published_requires_runtime_readback":stateLocation==="published"||preferenceLocation==="published"?"publication_incomplete":resultPresent?"prepared_review_required":"prepared_output_reconciled",
      sourceStatus,stateLocation,preferenceLocation,outputKnown:!unknown,originalResultPresent:resultPresent,originalOutputIdentityVerified:!!result&&!unknown,review:metadataProjection(intent),replayAllowed:false,runtimeProofVerified:false,readyForStartup:false,
      blockers:["separate_cutover_approval","fresh_native_exit_and_quiescence_proof","current_unknown_reconciliation","operator_path_and_identity_checks","destination_native_readback_before_admission"]};
  }
  function prepare(id,{destinationBaseline=null}={}){
    const dir=directory(id);if(exists(dir))return status(id);
    const input=capture(sourceRoot);plainAncestors(destinationRoot);assertDefaultStateRoots(destinationRoot);
    if(destinationBaseline){if(!sameContent(metadata(capture(destinationRoot)),destinationBaseline))fail("migration_destination_baseline_changed");}
    else if(exists(dst.stateDirectory)||exists(dst.preference))fail("migration_destination_not_fresh");
    const markerBytes=Buffer.from(JSON.stringify({schema:lifecycle.MARKER,storePathHash:contract.hash(path.resolve(dst.state))})+"\n");
    // Validate without reserialization: all source state/revision/ownership bytes
    // survive. Only the separate path-bound marker is generated for destination.
    state.validateProjectStateStore(state.transformReviewStore(decode(input.store.bytes),false));
    const outputs={state:{bytes:input.store.bytes.length,sha256:hash(input.store.bytes)},marker:{bytes:markerBytes.length,sha256:hash(markerBytes)},preference:{bytes:input.preference.bytes.length,sha256:hash(input.preference.bytes)}};
    const intent={schema:SCHEMA+".intent",operationId:id,sourceRoot,destinationRoot,createdAt:new Date().toISOString(),source:metadata(input),destinationBaseline,outputs,runtimeProofVerified:false,replayAllowed:false};
    input.assertUnchanged();plainAncestors(preparationRoot);fs.mkdirSync(preparationRoot,{recursive:true});fs.mkdirSync(dir);writeOnce(path.join(dir,"intent.json"),Buffer.from(JSON.stringify(intent,null,2)+"\n"));
    const stage=path.join(dir,"project-intent");fs.mkdirSync(stage);writeOnce(path.join(stage,path.basename(dst.state)),input.store.bytes);writeOnce(path.join(stage,path.basename(dst.marker)),markerBytes);writeOnce(path.join(dir,"autonomy-preference.json"),input.preference.bytes);
    if(onBeforeSeal)onBeforeSeal();input.assertUnchanged();
    writeOnce(path.join(dir,"review.json"),Buffer.from(JSON.stringify(metadataProjection(intent),null,2)+"\n"));
    const outputIdentities={state:readPinned(path.join(stage,path.basename(dst.state))).metadata.identity,marker:readPinned(path.join(stage,path.basename(dst.marker)),4096).metadata.identity,preference:readPinned(path.join(dir,"autonomy-preference.json"),8192).metadata.identity};
    writeOnce(path.join(dir,"result.json"),Buffer.from(JSON.stringify({schema:SCHEMA+".prepared",operationId:id,intentSha256:hash(fs.readFileSync(path.join(dir,"intent.json"))),outputIdentities,createdAt:new Date().toISOString(),runtimeProofVerified:false,replayAllowed:false})+"\n"));
    return status(id);
  }
  return Object.freeze({prepare,status,directory,originalPreparation:id=>metadataProjection(readPrepared(id,true).intent)});
}
function metadataProjection(intent){return {schema:SCHEMA+".review",operationId:intent.operationId,sourceRoot:intent.sourceRoot,destinationRoot:intent.destinationRoot,source:intent.source,outputs:intent.outputs,destinationBaseline:intent.destinationBaseline,protectedContentIncluded:false,runtimeProofVerified:false,replayAllowed:false};}
function main(argv){
  const [command,id,...tail]=argv;if(!["prepare","status","prepare-rollback","status-rollback"].includes(command)||!UUID.test(id||""))fail("migration_cli_arguments");
  for(const name of ["AE_BRIDGE_STATE_DIR","AE_BRIDGE_LOG_DIR"])if(process.env[name])fail("migration_runtime_layout_unverified");
  const preparationRoot=path.join(CORE_ROOT,".codex-runtime","core-cutover-preparation"),forward=createPreparer({sourceRoot:LEGACY_ROOT,destinationRoot:CORE_ROOT,preparationRoot});
  if(command==="prepare"&&tail.length===0)return forward.prepare(id);if(command==="status"&&tail.length===0)return forward.status(id);
  if(command==="status-rollback"&&tail.length===0)return createPreparer({sourceRoot:CORE_ROOT,destinationRoot:LEGACY_ROOT,preparationRoot}).status(id);
  if(command==="prepare-rollback"&&tail.length===1&&UUID.test(tail[0])){
    const previous=forward.originalPreparation(tail[0]);
    return createPreparer({sourceRoot:CORE_ROOT,destinationRoot:LEGACY_ROOT,preparationRoot}).prepare(id,{destinationBaseline:previous.source});
  }
  fail("migration_cli_arguments");
}
if(require.main===module){try{process.stdout.write(JSON.stringify(main(process.argv.slice(2)))+"\n");}catch(e){process.stdout.write(JSON.stringify({ok:false,code:e.code||"migration_unknown",...(e.configDiagnostic?{diagnostic:e.configDiagnostic}:{}),runtimeProofVerified:false,readyForStartup:false,replayAllowed:false})+"\n");process.exitCode=1;}}
module.exports={SCHEMA,locations,capture,validatePreference,assertDefaultStateRoots,createPreparer,main};
