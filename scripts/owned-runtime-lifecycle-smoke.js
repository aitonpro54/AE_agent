"use strict";

// Offline authority/one-shot contracts. Invented witnesses are test authority,
// never provisioned into the product profile and never evidence about AE.
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),os=require("node:os"),crypto=require("node:crypto"),{spawnSync}=require("node:child_process");
const core=require("../mcp-server/owned-runtime-lifecycle"),ledger=require("../mcp-server/native-fixture-attempt-ledger"),native=require("../mcp-server/owned-runtime-win32"),cli=require("./owned-runtime-control");
const raw=b=>crypto.createHash("sha256").update(b).digest("hex"),copy=v=>JSON.parse(JSON.stringify(v)),token=()=>crypto.randomBytes(16).toString("hex");
const birth="2026-10-11T07:41:52.9381820Z",filetime=String(BigInt(Date.parse(birth))*10000n+116444736000000000n+1820n);
function identity(pid=8001){return {pid,birthFileTime:filetime,birthUtc:birth,imagePath:"C:\\Synthetic\\fixture.exe",executableSha256:"a".repeat(64)};}
function fixture(opts={}){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"owned-contract-")),runId=crypto.randomUUID(),context={runId,requestId:crypto.randomUUID(),actionId:"act_"+token(),instanceId:crypto.randomUUID(),proposalRevision:2,payloadHash:"sha256:"+"b".repeat(64)};
  const p={schema:core.PROFILE_SCHEMA,profileId:"test-profile",generation:"fixture-generation-1",issuedAt:"2026-10-11T08:00:00.000Z",expiresAt:"2026-10-11T09:00:00.000Z",context,canonicalBindingSha256:core.hash(context),daemon:{identity:identity(9901),startedAt:"2026-10-11T07:42:00.000Z",loadedRuntimeSha256:"c".repeat(64),port:5000,credentialSha256:"d".repeat(64)},protected:[identity(9901),identity(9902)],protectedInventorySha256:"",stages:[],policy:{disposableFixture:true,allowForce:opts.force!==false,gracefulDeadlineMs:30,forceDeadlineMs:30}};
  p.protectedInventorySha256=core.hash(p.protected);
  const record={schema:"ae-agent-plan-run-record.v1",runId,plan:{},run:{id:runId,provenance:{actionId:context.actionId,proposalRevision:context.proposalRevision,payloadHash:context.payloadHash},outcome:"unknown"}},canonicalFile=path.join(root,"logs","evidence","plan-runs",runId+".json"),envelope={schema:"ae-agent-plan-run-record-envelope.v1",sha256:ledger.hash(record),record};
  ledger.ensure(path.dirname(canonicalFile));fs.writeFileSync(canonicalFile,JSON.stringify(envelope));p.canonicalRecord={path:canonicalFile,rawSha256:raw(fs.readFileSync(canonicalFile)),envelopeSha256:envelope.sha256};
  for(const [i,role] of ["capture","stage"].entries()){
    const nonce=token(),stageId=token(),d={nonce,stageId,role,rootPath:path.join(root,".codex-runtime","ame-native-fixtures","probe-"+nonce),pluginPath:path.join(root,"probe.aex"),pluginSha256:"f".repeat(64),executablePath:identity().imagePath,executableSha256:identity().executableSha256};
    ledger.ensure(d.rootPath);const manifest=Buffer.from("immutable synthetic manifest");fs.writeFileSync(path.join(d.rootPath,"launch.manifest"),manifest);
    ledger.reserve(root,d,{runId,record:{actionId:context.actionId,revision:2,payloadHash:context.payloadHash}},manifest);
    const pid=8001+i;ledger.launch(root,d,{pid,createdAt:birth,createdUnixMs:Date.parse(birth),path:d.executablePath});ledger.unknown(root,d,"invented_test_unknown");
    const pins={};for(const kind of ["reservation","launch","manifest","unknown"]){const file=kind==="manifest"?path.join(d.rootPath,"launch.manifest"):ledger.fileFor(root,stageId,kind),bytes=ledger.readBytes(file);pins[kind]={path:file,rawSha256:raw(bytes),valueSha256:kind==="manifest"?null:JSON.parse(bytes).sha256};}
    p.stages.push({stageId,role,identity:identity(pid),descriptor:d,pins});
  }
  let source=JSON.stringify(p),generation=0,state={registered:true,originalDaemonVerified:true,idle:true},signals=false,counts={open:0,close:0,force:0,dispose:0,inspect:0},waits=0;
  const s={command:"close-once",profile:p.profileId,runId,stageId:p.stages[0].stageId};
  const deps={repoRoot:root,journalRoot:path.join(root,"journal"),now:()=>Date.parse("2026-10-11T08:30:00Z"),
    loadTrustedProfile:async()=>{const saved=source,g=generation;return {profile:JSON.parse(saved),profilePath:path.join(root,"private-profile.json"),profileRawSha256:raw(saved),assertUnchanged(){if(source!==saved || generation!==g)throw Object.assign(Error("owned_profile_source_changed"),{code:"owned_profile_source_changed"});}};},
    checkOriginalRegistration:async(profile)=>{if(opts.onAuthority)await opts.onAuthority(f);return {...state,generation:profile.generation,canonicalBindingSha256:profile.canonicalBindingSha256,protectedInventorySha256:profile.protectedInventorySha256};},
    native:{async open(expected,protectedRows){counts.open++;if(opts.openError)throw Error("owned_native_api_refused");native.validateIdentity(expected);assert.equal(protectedRows.some(x=>x.pid===expected.pid),false);if(opts.actualIdentity && core.canonical(opts.actualIdentity)!==core.canonical(expected))throw Error("owned_identity_mismatch");if(opts.onOpen)await opts.onOpen(f);return {async inspect(){counts.inspect++;if(opts.inspectError)throw Error("owned_native_api_refused");if(opts.onInspect)await opts.onInspect(f);return {windows:{count:opts.windows??1,hwnd:(opts.windows??1)===1?"55":null},wait:{signaled:signals,waitResult:signals?"WAIT_OBJECT_0":"WAIT_TIMEOUT",exitCode:signals?(opts.exitCode??0):null}};},async graceful(){counts.close++;if(opts.closeError)throw Error("owned_native_api_refused");if(opts.onGraceful)await opts.onGraceful(f);if(!opts.stubborn)signals=true;return {status:"wm_close_submitted",exitProven:false};},async force(){counts.force++;if(opts.forceUnknown)throw Error("owned_force_transport_unknown");if(!opts.forceTimeout)signals=true;return {status:"termination_submitted",exitProven:false};},async wait(milliseconds){waits++;if(opts.onWait)await opts.onWait(f,milliseconds);return {signaled:signals,waitResult:signals?"WAIT_OBJECT_0":"WAIT_TIMEOUT",exitCode:signals?(opts.exitCode??0):null};},async dispose(){counts.dispose++;}};}}
  };
  const f={root,p,s,deps,counts,get waits(){return waits;},signal(){signals=true;},change(fn){const n=JSON.parse(source);fn(n);source=JSON.stringify(n);generation++;},state,run(command=s.command){return core.createOwnedRuntimeLifecycle(deps).run({...s,command});},cleanup(){const actual=path.resolve(root);assert.ok(actual.startsWith(path.resolve(os.tmpdir())+path.sep));assert.match(path.basename(actual),/^owned-contract-/);fs.rmSync(actual,{recursive:true});}};
  return f;
}
let passed=0;async function check(name,fn){await fn();passed++;}
function credentialCases(){
  const section='[mcp_servers."after-effects".env]',rows='AE_BRIDGE_TOKEN = "synthetic-automation"\nAE_BRIDGE_PANEL_TOKEN = "synthetic-panel"',valid=section+'\n'+rows;
  const ok=(name,text,token="synthetic-automation")=>({name,text,token}),no=(name,text,code="owned_fixed_config_required")=>({name,text,code});
  return [
    ok("fixed section",valid),ok("BOM/comments and CRLF","\uFEFF# comment\r\n"+valid.replace(/\n/g,"\r\n")+'\r\nAE_BRIDGE_HOST = "127.0.0.1" # host\r\nAE_BRIDGE_PORT = "3456"'),
    ok("ignore other section credentials",'[unrelated]\nAE_BRIDGE_TOKEN = "foreign"\n'+valid+'\n[another]\nAE_BRIDGE_TOKEN = "foreign"'),
    ok("JSON/TOML shared basic string escapes",valid.replace('"synthetic-automation"','"synthetic-\\u0061utomation"')),
    ok("fixed logs path",valid+'\nAE_BRIDGE_LOG_DIR = '+JSON.stringify(path.resolve(__dirname,"../logs"))),
    no("missing fixed section",rows),no("foreign section spelling",valid.replace(section,'[mcp_servers.after-effects.env]')),
    no("duplicate section",valid+'\n'+section,"owned_fixed_config_duplicate"),no("duplicate credential",valid+'\nAE_BRIDGE_TOKEN = "other"',"owned_fixed_config_duplicate"),
    no("duplicate noncredential key",valid+'\nAE_BRIDGE_PORT = "3456"\nAE_BRIDGE_PORT = "3456"',"owned_fixed_config_duplicate"),
    no("same automation/panel token",valid.replace('"synthetic-panel"','"synthetic-automation"')),
    no("missing panel token",section+'\nAE_BRIDGE_TOKEN = "synthetic-automation"'),
    no("multiline basic token",valid.replace('"synthetic-automation"','"""synthetic-automation"""')),
    no("literal singlequote token",valid.replace('"synthetic-automation"',"'synthetic-automation'")),
    no("escaped newline token",valid.replace('"synthetic-automation"','"synthetic\\nautomation"')),
    no("raw multiline token",valid.replace('"synthetic-automation"','"synthetic\nautomation"')),
    no("unknown JSON escape",valid.replace('"synthetic-automation"','"synthetic\\/automation"')),
    no("nonstring assignment",valid+'\nAE_BRIDGE_PORT = 3456'),no("malformed assignment",valid+'\nAE_BRIDGE_TOKEN garbage'),
    no("foreign host",valid+'\nAE_BRIDGE_HOST = "localhost"'),no("foreign port",valid+'\nAE_BRIDGE_PORT = "3210"'),
    no("empty host",valid+'\nAE_BRIDGE_HOST = ""'),no("foreign logs path",valid+'\nAE_BRIDGE_LOG_DIR = "C:/foreign/logs"'),
    no("control character",valid+'\nOTHER = "\\u0000"')
  ];
}
async function withFixture(opts,fn){const f=fixture(opts);try{await fn(f);}finally{f.cleanup();}}
async function refused(f,pattern){await assert.rejects(f.run(),pattern);assert.equal(f.counts.force,0);}
function coldCliEntrypoint(reorder=false,command="restart-bridge-once"){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"owned-cli-entry-")),entry=path.resolve(__dirname,"owned-runtime-control.js"),preload=path.join(root,"preload.cjs"),operationId=crypto.randomUUID();
  // Execute the actual main entry in a cold child. The supervisor's synchronous
  // require recreates the circular initialization edge without OS/HTTP effects.
  fs.writeFileSync(preload,`"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),Module=require("node:module");
const entry=${JSON.stringify(entry)},supervisor=${JSON.stringify(path.resolve(__dirname,"../mcp-server/owned-runtime-supervisor.js"))},native=${JSON.stringify(path.resolve(__dirname,"../mcp-server/owned-runtime-win32.js"))};
let blockedEffects=0;function blocked(){blockedEffects++;throw Object.assign(Error("owned_cold_effect_forbidden"),{code:"owned_cold_effect_forbidden"});}
require("node:http").request=blocked;for(const name of ["spawn","spawnSync","exec","execSync","execFile","execFileSync","fork"])require("node:child_process")[name]=blocked;
require.cache[native]={id:native,filename:native,loaded:true,exports:{createWin32Backend:blocked}};
if(${JSON.stringify(reorder)}){const load=Module._extensions[".js"];Module._extensions[".js"]=(m,file)=>{if(file!==entry)return load(m,file);const source=fs.readFileSync(file,"utf8").replace(/\\r\\n/g,"\\n"),exportsLine=source.match(/^module\\.exports=.*$/m)?.[0],mainLine=source.match(/^if\\(require\\.main===module\\).*$/m)?.[0];assert.ok(exportsLine && mainLine);m._compile(source.replace(exportsLine+"\\n"+mainLine,mainLine+"\\n"+exportsLine),file);};}
require.cache[supervisor]={id:supervisor,filename:supervisor,loaded:true,exports:{createOwnedRuntimeSupervisor(){
 const api=require(entry),names=["credential","request","run","parse","loadTrustedProfile","checkOriginalRegistration","statusVerified","credentialFingerprint","parseCredentialConfig","disablePolicy"];
 if(names.some(name=>typeof api[name]!=="function") || typeof api.PROFILE!=="string" || typeof api.PROFILE_FILE!=="string")throw Object.assign(Error("owned_cold_exports_incomplete"),{code:"owned_cold_exports_incomplete"});
 const result=operationId=>({ok:true,status:"cold_exports_ready",operationId:operationId || null,exportCount:names.length,blockedEffects,noNativeEffects:true});
 return {status:()=>result(),ensure:result,restart:result,shutdown:result,readBack:result};
}}};
`);
  try{const env={...process.env};for(const name of Object.keys(env))if(/^AE_BRIDGE_.*TOKEN$|^AE_OWNED_RUNTIME_|^NODE_OPTIONS$/i.test(name))delete env[name];const args=["-r",preload,entry,command,...(command==="status"?[]:["--operation-id",operationId])],result=spawnSync(process.execPath,args,{cwd:path.resolve(__dirname,".."),env,windowsHide:true,encoding:"utf8",timeout:5000,maxBuffer:65536});assert.equal(result.error,undefined);assert.equal(result.signal,null);return {exitCode:result.status,value:JSON.parse(result.stdout.trim()),stderr:result.stderr,operationId};
  }finally{assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));assert.match(path.basename(root),/^owned-cli-entry-/);fs.rmSync(root,{recursive:true});}
}
async function main(){
  await check("cold actual CLI exposes helpers before synchronous supervisor require",async()=>{for(const command of ["status","ensure-bridge","restart-bridge-once","shutdown-bridge-once","read-back"]){const result=coldCliEntrypoint(false,command);assert.equal(result.exitCode,0);assert.equal(result.value.status,"cold_exports_ready");assert.equal(result.value.exportCount,10);assert.equal(result.value.blockedEffects,0);assert.equal(result.value.noNativeEffects,true);assert.equal(result.value.operationId,command==="status"?null:result.operationId);assert.equal(result.stderr,"");}});
  await check("cold entry test detects previous exports-after-main defect",async()=>{const result=coldCliEntrypoint(true);assert.equal(result.exitCode,1);assert.equal(result.value.ok,false);assert.equal(result.value.code,"owned_cold_exports_incomplete");assert.match(result.stderr,/non-existent property 'credential'.*circular dependency/);});
  for(const c of credentialCases())await check("strict credential parser: "+c.name,async()=>{if(c.code)assert.throws(()=>cli.parseCredentialConfig(c.text),e=>e.code===c.code && !e.message.includes("synthetic-automation"));else assert.equal(cli.parseCredentialConfig(c.text),c.token);});
  await check("transport rejects foreign routes before credential read",async()=>{assert.throws(()=>cli.request({},"http://foreign/"),/owned_fixed_route_required/);});
  await check("closed selectors",async()=>{for(const extra of ["pid","path","executable","cmd","disposable","tree"]){assert.throws(()=>core.selector({command:"inspect",profile:"x",runId:crypto.randomUUID(),stageId:token(),[extra]:true}),/owned_selector_invalid/);}assert.throws(()=>cli.parse(["node","cli","close-once","--profile","arbitrary","--run-id",crypto.randomUUID(),"--stage-id",token()]),/fixed_profile/);assert.throws(()=>cli.parse(["node","cli","close-once","--profile-path","x"]),/closed_schema/);});
  await check("unprovisioned fails closed",async()=>{assert.throws(()=>cli.loadTrustedProfile("remote-profile"),/owned_trusted_provision_required/);});
  await check("lossless full birth",async()=>{native.validateIdentity(identity());assert.throws(()=>native.validateIdentity({...identity(),birthUtc:birth.replace("9381820","9380000")}),/not_lossless/);});
  await check("known legacy terminal bootstrap projection only",()=>withFixture({},async f=>{const p=f.p,status={ok:true,startedAt:p.daemon.startedAt,humanGuardRuntime:{pid:p.daemon.identity.pid,startedAt:p.daemon.startedAt,sourceSha256:p.daemon.loadedRuntimeSha256},pendingCommands:0,inflightCommands:[],activeEditSession:null,projectLifecycle:{blocked:false,pending:null},panelBootstrap:{stage:"verified"}};assert.equal(cli.statusVerified(status,p),true);for(const stage of ["running","pending","unknown",undefined])assert.equal(cli.statusVerified({...status,panelBootstrap:{stage}},p),false);assert.equal(cli.statusVerified({...status,panelBootstrap:{stage:"verified",busy:true}},p),false);}));
  await check("invented stage refused",()=>withFixture({},async f=>{f.s.stageId=token();await refused(f,/owned_stage_not_allowed/);}));
  await check("canonical mutation refused",()=>withFixture({},async f=>{f.change(p=>p.context.proposalRevision++);await refused(f,/owned_canonical_binding_invalid/);}));
  await check("foreign run refused",()=>withFixture({},async f=>{f.s.runId=crypto.randomUUID();await refused(f,/owned_canonical_binding_invalid/);}));
  await check("primary target refused",()=>withFixture({},async f=>{f.change(p=>{p.protected.push(p.stages[0].identity);p.protectedInventorySha256=core.hash(p.protected);});await refused(f,/owned_stage_identity_invalid/);}));
  await check("protected inventory hash",()=>withFixture({},async f=>{f.change(p=>p.protected.pop());await refused(f,/protected_inventory/);}));
  await check("launch hash changed",()=>withFixture({},async f=>{fs.appendFileSync(f.p.stages[0].pins.launch.path," ");await refused(f,/owned_witness_changed/);}));
  await check("ledger plainsha cannot fabricate authority",()=>withFixture({},async f=>{const file=f.p.stages[0].pins.launch.path,row=JSON.parse(fs.readFileSync(file));row.value.process.pid=9000;row.sha256=ledger.hash(row.value);fs.writeFileSync(file,JSON.stringify(row));await refused(f,/owned_witness_changed/);}));
  await check("descriptor canonical bind",()=>withFixture({},async f=>{f.change(p=>p.stages[0].descriptor.nonce=token());await refused(f,/fixture_ledger_descriptor_invalid/);}));
  await check("manifest drift",()=>withFixture({},async f=>{fs.appendFileSync(f.p.stages[1].pins.manifest.path,"changed");await refused(f,/owned_witness_changed/);}));
  await check("whole canonical record drift",()=>withFixture({},async f=>{fs.appendFileSync(f.p.canonicalRecord.path," ");await refused(f,/owned_canonical_record_changed/);}));
  await check("PID reuse",()=>withFixture({actualIdentity:identity(8010)},f=>refused(f,/owned_identity_mismatch/)));
  await check("birth reuse",()=>withFixture({actualIdentity:{...identity(),birthFileTime:String(BigInt(filetime)+1n)}},f=>refused(f,/owned_identity_mismatch/)));
  await check("image hash drift",()=>withFixture({actualIdentity:{...identity(),executableSha256:"e".repeat(64)}},f=>refused(f,/owned_identity_mismatch/)));
  await check("registration missing",()=>withFixture({},async f=>{f.state.registered=false;await refused(f,/owned_original_registration_not_verified/);}));
  await check("actor changed",()=>withFixture({},async f=>{f.state.originalDaemonVerified=false;await refused(f,/owned_original_registration_not_verified/);}));
  await check("async lease invalidation",()=>withFixture({onOpen:f=>f.change(p=>p.policy.allowForce=false)},f=>refused(f,/owned_profile_source_changed/)));
  await check("pre effect durable failure consumed",()=>withFixture({},async f=>{f.deps.writeJournal=()=>{throw Error("disk full");};await assert.rejects(f.run(),/disk full/);assert.equal(f.counts.close,0);assert.equal(f.counts.force,0);await assert.rejects(f.run(),/consumed_readback_only/);assert.equal((await f.run("read-back")).consumed,true);}));
  await check("graceful exit and 259",()=>withFixture({exitCode:259},async f=>{const r=await f.run();assert.equal(r.shutdownExitProven,true);assert.equal(r.shutdownProof.exitCode,259);assert.equal(f.counts.close,1);assert.equal(f.counts.force,0);assert.equal(r.originalLaunchRetirementProven,false);assert.equal(r.admissionReleased,false);assert.equal(f.counts.dispose,1);}));
  await check("timeout single force",()=>withFixture({stubborn:true},async f=>{assert.equal((await f.run()).shutdownExitProven,true);assert.equal(f.counts.close,1);assert.equal(f.counts.force,1);await assert.rejects(f.run(),/consumed_readback_only/);assert.equal(f.counts.force,1);}));
  await check("zero windows force only",()=>withFixture({windows:0},async f=>{assert.equal((await f.run()).shutdownExitProven,true);assert.equal(f.counts.close,0);assert.equal(f.counts.force,1);}));
  await check("ambiguous windows availability",()=>withFixture({windows:2,force:false},async f=>{assert.equal((await f.run()).shutdownExitProven,false);assert.equal(f.counts.close,0);assert.equal(f.counts.force,0);}));
  await check("api denial never force",()=>withFixture({closeError:true},async f=>{await refused(f,/owned_native_api_refused/);await assert.rejects(f.run(),/consumed_readback_only/);}));
  await check("enumeration denial never force",()=>withFixture({inspectError:true},f=>refused(f,/owned_native_api_refused/)));
  await check("force UNKNOWN consumed",()=>withFixture({stubborn:true,forceUnknown:true},async f=>{await assert.rejects(f.run(),/owned_force_transport_unknown/);assert.equal(f.counts.force,1);await assert.rejects(f.run(),/consumed_readback_only/);const r=await f.run("read-back");assert.equal(r.shutdownExitProven,false);assert.equal(r.replayAllowed,false);}));
  await check("force wait timeout consumed",()=>withFixture({stubborn:true,forceTimeout:true},async f=>{assert.equal((await f.run()).shutdownExitProven,false);await assert.rejects(f.run(),/consumed_readback_only/);}));
  await check("signaled graceful proof survives revoked authority",()=>withFixture({exitCode:259,onWait:f=>f.change(p=>p.policy.allowForce=false)},async f=>{await refused(f,/owned_profile_source_changed/);const rows=core.readJournal(core.journalDirectory(f.deps.journalRoot,f.s));assert.equal(rows.result.value.shutdownExitProven,true);assert.equal(rows.result.value.shutdownProof.waitResult,"WAIT_OBJECT_0");assert.equal(rows.result.value.shutdownProof.exitCode,259);assert.equal(rows.result.value.followupRefused,true);assert.equal(rows.result.value.intentSha256,rows.intent.sha256);assert.equal(rows.result.value.originalLaunchRetirementProven,false);assert.equal(f.counts.dispose,1);const r=await f.run("read-back");assert.equal(r.shutdownExitProven,true);await assert.rejects(f.run(),/consumed_readback_only/);assert.equal(f.counts.force,0);}));
  await check("signaled wait zero proof survives revoked authority",()=>withFixture({stubborn:true,onWait:(f,ms)=>{if(ms===0){f.signal();f.change(p=>p.policy.allowForce=false);}}},async f=>{await refused(f,/owned_profile_source_changed/);assert.equal(f.waits,2);const r=await f.run("read-back");assert.equal(r.shutdownExitProven,true);assert.equal(r.result.shutdownProof.waitResult,"WAIT_OBJECT_0");assert.equal(r.result.followupRefused,true);assert.equal(f.counts.close,1);assert.equal(f.counts.dispose,1);await assert.rejects(f.run(),/consumed_readback_only/);}));
  await check("post intent inspect proof survives revoked authority",()=>withFixture({onInspect:f=>{if(f.counts.inspect===2){f.signal();f.change(p=>p.policy.allowForce=false);}}},async f=>{await refused(f,/owned_profile_source_changed/);assert.equal(f.counts.close,0);assert.equal(f.counts.dispose,1);const r=await f.run("read-back");assert.equal(r.shutdownExitProven,true);assert.equal(r.result.shutdownProof.waitResult,"WAIT_OBJECT_0");assert.equal(r.result.followupRefused,true);await assert.rejects(f.run(),/consumed_readback_only/);}));
  await check("timeout revoked after native await has no proof or force",()=>withFixture({stubborn:true,onWait:f=>f.change(p=>p.policy.allowForce=false)},async f=>{await refused(f,/owned_profile_source_changed/);assert.equal(f.counts.close,1);assert.equal(f.counts.dispose,1);const r=await f.run("read-back");assert.equal(r.consumed,true);assert.equal(r.shutdownExitProven,false);assert.equal(r.result.shutdownProof,null);await assert.rejects(f.run(),/consumed_readback_only/);assert.equal(f.counts.force,0);}));
  await check("cross factory concurrent exclusive reservation",()=>withFixture({stubborn:true},async f=>{const r=await Promise.allSettled([f.run(),f.run()]);assert.equal(r.filter(x=>x.status==="fulfilled").length,1);assert.equal(f.counts.close,1);assert.equal(f.counts.force,1);}));
  await check("readback stale original daemon",()=>withFixture({},async f=>{await f.run();f.state.originalDaemonVerified=false;const r=await f.run("read-back");assert.equal(r.profileFresh,false);assert.equal(r.shutdownExitProven,true);assert.equal(r.originalLaunchRetirementProven,false);}));
  await check("inspect no journal/effects",()=>withFixture({},async f=>{assert.equal((await f.run("inspect")).status,"owned_shutdown_inspected");assert.equal(f.counts.close,0);assert.equal(f.counts.force,0);assert.equal(fs.existsSync(f.deps.journalRoot),false);}));
  console.log(JSON.stringify({ok:true,scope:"offline owned runtime lifecycle",passed,liveAEProof:false}));
}
if(require.main===module)main().catch(e=>{console.error(e.stack);process.exitCode=1;});
module.exports={fixture,identity,credentialCases};
