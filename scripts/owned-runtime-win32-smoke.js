"use strict";

// REAL hidden Windows fixtures only. No AE/AME discovery, close or launch.
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto"),{spawn}=require("node:child_process");
const core=require("../mcp-server/owned-runtime-lifecycle"),win=require("../mcp-server/owned-runtime-win32"),ledger=require("../mcp-server/native-fixture-attempt-ledger");
const BASE=path.resolve(__dirname,"../.codex-runtime/owned-runtime-maintenance"),token=()=>crypto.randomBytes(16).toString("hex"),raw=b=>crypto.createHash("sha256").update(b).digest("hex");
const results=[];
async function launch(kind,deadlineMs=18000){
  const child=win.spawnFixedHelper(),exited=new Promise(resolve=>child.on("close",code=>resolve(code)));child.stderr.resume();
  const ready=new Promise((resolve,reject)=>{let buffer="";child.stdout.setEncoding("utf8");child.stdout.on("data",chunk=>{buffer+=chunk;const end=buffer.indexOf("\n");if(end<0)return;try{const row=JSON.parse(buffer.slice(0,end).replace(/^\uFEFF/,""));if(row.ok!==true || row.type!=="fixture")throw Error(row.code || "synthetic_fixture_failed");resolve(row.identity);}catch(e){reject(e);}});child.on("error",reject);child.on("close",()=>reject(Error("synthetic_fixture_did_not_start")));});
  child.stdin.end(JSON.stringify({op:"fixture",kind,deadlineMs})+"\n");
  try{const identity=win.validateIdentity(await ready);return {identity,exited};}catch(e){await exited;throw e;}
}
function provision(root,target,sibling){
  const context={runId:crypto.randomUUID(),requestId:crypto.randomUUID(),actionId:"act_"+token(),instanceId:crypto.randomUUID(),proposalRevision:1,payloadHash:"sha256:"+"b".repeat(64)};
  const protectedIdentity={...target,pid:2147483000};
  const p={schema:core.PROFILE_SCHEMA,profileId:"synthetic-fixtures-v1",generation:token(),issuedAt:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+60000).toISOString(),context,canonicalBindingSha256:core.hash(context),daemon:{identity:protectedIdentity,startedAt:new Date().toISOString(),loadedRuntimeSha256:"c".repeat(64),port:1,credentialSha256:"d".repeat(64)},protected:[protectedIdentity],protectedInventorySha256:core.hash([protectedIdentity]),stages:[],policy:{disposableFixture:true,allowForce:true,gracefulDeadlineMs:2000,forceDeadlineMs:4000}};
  p.canonicalRecord={path:path.join(root,"unused-record.json"),rawSha256:"f".repeat(64),envelopeSha256:"f".repeat(64)};
  for(const [i,identity] of [target,sibling].entries()){
    const stageId=token(),nonce=token(),role=i===0?"capture":"stage",descriptor={stageId,nonce,role,rootPath:path.join(root,"unused","probe-"+nonce),pluginPath:path.join(root,"unused.aex"),pluginSha256:"e".repeat(64),executablePath:identity.imagePath,executableSha256:identity.executableSha256},pins={};
    for(const key of ["reservation","launch","manifest","unknown"])pins[key]={path:path.join(root,"unused",key+".json"),rawSha256:"f".repeat(64),valueSha256:key==="manifest"?null:"f".repeat(64)};
    p.stages.push({stageId,role,identity,descriptor,pins});
  }
  const configFile=path.join(root,".codex","config.toml"),configToken="synthetic-automation-"+token();ledger.ensure(path.dirname(configFile));
  fs.writeFileSync(configFile,'[mcp_servers."after-effects".env]\nAE_BRIDGE_TOKEN = '+JSON.stringify(configToken)+'\nAE_BRIDGE_PANEL_TOKEN = "synthetic-panel"\nAE_BRIDGE_HOST = "127.0.0.1"\nAE_BRIDGE_PORT = "3456"\n');p.daemon.credentialSha256=raw(configToken);
  const file=path.join(root,"profiles","fixture.json");ledger.ensure(path.dirname(file));fs.writeFileSync(file,JSON.stringify(p));
  function load(){const bytes=ledger.readBytes(file),stat=fs.lstatSync(file),digest=raw(bytes);return {profile:JSON.parse(bytes),profilePath:file,profileRawSha256:digest,assertUnchanged(){const current=fs.lstatSync(file);if(current.ino!==stat.ino || raw(ledger.readBytes(file))!==digest)throw Error("owned_profile_source_changed");}};}
  const selector={command:"close-once",profile:p.profileId,runId:context.runId,stageId:p.stages[0].stageId};
  const nativeAuthority={profilePath:file,profileRawSha256:raw(fs.readFileSync(file)),generation:p.generation,runId:context.runId,stageId:selector.stageId,expiresAt:p.expiresAt};
  const service=core.createOwnedRuntimeLifecycle({repoRoot:root,journalRoot:path.join(root,"journal"),loadTrustedProfile:load,checkWitnesses(){/* Synthetic witnesses have no production ledger. */},checkOriginalRegistration:async p=>({registered:true,originalDaemonVerified:true,idle:true,generation:p.generation,canonicalBindingSha256:p.canonicalBindingSha256,protectedInventorySha256:p.protectedInventorySha256}),native:win.createWin32Backend()});
  return {p,file,configFile,selector,service,nativeAuthority};
}
async function parserParity(root){
  // Parse only the fixed pinned helper function AST, not the native RPC loop.
  // Inputs are invented credentials; this does not read production config.
  win.verifyPolicy();const file=path.join(root,"credential-parser-smoke.ps1");
  fs.writeFileSync(file,`$ErrorActionPreference='Stop'
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'))
$helper=Join-Path $repo 'scripts/owned-runtime-win32-helper.ps1'
$errors=$null;$tokens=$null;$ast=[Management.Automation.Language.Parser]::ParseFile($helper,[ref]$tokens,[ref]$errors)
if ($errors.Count -ne 0) { throw 'owned_parser_source_invalid' }
$fn=$ast.Find({param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -ceq 'ParseCredentialConfig'},$true)
Invoke-Expression $fn.Extent.Text
$rows=([Console]::In.ReadToEnd() | ConvertFrom-Json -DateKind String);$passed=0
foreach ($row in $rows) {
  $code=$null;$value=$null
  try { $value=ParseCredentialConfig $row.text $repo } catch { $code=$_.Exception.Message }
  if (($null -ne $row.code -and $code -cne $row.code) -or ($null -eq $row.code -and ($null -ne $code -or $value -cne $row.token))) { throw ('owned_parser_case_failed_'+$passed) }
  $passed++
}
@{ok=$true;parserCases=$passed;productionCredentialRead=$false} | ConvertTo-Json -Compress
`);
  const child=spawn(win.POLICY.executable,["-NoLogo","-NoProfile","-NonInteractive","-MTA","-File",file],{windowsHide:true,stdio:["pipe","pipe","pipe"]});
  let output="";child.stdout.setEncoding("utf8");child.stdout.on("data",b=>{output+=b;});child.stderr.resume();
  const exited=new Promise((resolve,reject)=>{child.on("error",reject);child.on("close",code=>code===0?resolve():reject(Error("owned_native_parser_regression")));});
  const cases=require("./owned-runtime-lifecycle-smoke").credentialCases();child.stdin.end(JSON.stringify(cases));await exited;const row=JSON.parse(output.replace(/^\uFEFF/,""));assert.equal(row.ok,true);assert.equal(row.parserCases,cases.length);return row.parserCases;
}
async function main(){
  if(process.platform!=="win32"){console.log(JSON.stringify({ok:true,skipped:"Windows only",liveAEProof:false}));return;}
  win.verifyPolicy();ledger.ensure(BASE);const root=path.join(BASE,"synthetic-"+token());fs.mkdirSync(root);
  const children=[];let keeper,parserCases=0;
  async function check(name,kind,fn,deadlineMs=18000){const target=await launch(kind,deadlineMs);children.push(target);
    // The helper only accepts this exact synthetic root/profile layout.
    const isolated=path.join(BASE,"synthetic-"+token());fs.mkdirSync(isolated);
    try{const f=provision(isolated,target.identity,keeper.identity);await fn(f,target);results.push(name);process.stdout.write(JSON.stringify({case:name,status:"passed"})+"\n");}finally{await target.exited;const resolved=path.resolve(isolated);assert.equal(path.dirname(resolved),BASE);assert.match(path.basename(resolved),/^synthetic-[a-f0-9]{32}$/);ledger.safeDirectory(resolved);fs.rmSync(resolved,{recursive:true});}
  }
  try{
    parserCases=await parserParity(root);process.stdout.write(JSON.stringify({case:"strict native credential parser parity",passed:parserCases})+"\n");
    keeper=await launch("headless",30000);children.push(keeper);
    await check("graceful held-handle exit","graceful",async f=>{const r=await f.service.run(f.selector);assert.equal(r.shutdownExitProven,true);assert.equal(r.forced,false,JSON.stringify(r));assert.equal(r.shutdownProof.waitResult,"WAIT_OBJECT_0");await assert.rejects(f.service.run(f.selector),/consumed_readback_only/);});
    await check("stubborn deadline then one force","stubborn",async f=>{const r=await f.service.run(f.selector);assert.equal(r.shutdownExitProven,true);assert.equal(r.forced,true);assert.equal(r.shutdownProof.exitCode,137);const read=await f.service.run({...f.selector,command:"read-back"});assert.equal(read.shutdownExitProven,true);assert.equal(read.originalLaunchRetirementProven,false);});
    await check("zero-window graceful unavailable then force","headless",async f=>{const r=await f.service.run(f.selector);assert.equal(r.shutdownExitProven,true);assert.equal(r.graceful,"no_owned_top_level_window");assert.equal(r.forced,true);});
    await check("signaled exit code 259","exit259",async f=>{const r=await f.service.run(f.selector);assert.equal(r.shutdownExitProven,true);assert.equal(r.shutdownProof.exitCode,259);});
    await check("protected identity refusal","graceful",async(f,t)=>{await assert.rejects(win.createWin32Backend().open(t.identity,[t.identity],{mode:"close",authority:f.nativeAuthority}),/owned_protected_process/);},3500);
    await check("birth reuse refusal","graceful",async(f,t)=>{const identity={...t.identity,birthFileTime:String(BigInt(t.identity.birthFileTime)+1n),birthUtc:t.identity.birthUtc.replace(/\.(\d{7})Z$/,(_,n)=>"."+String(Number(n)+1).padStart(7,"0")+"Z")};await assert.rejects(win.createWin32Backend().open(identity,[],{mode:"close",authority:f.nativeAuthority}),/owned_identity_mismatch/);},5500);
    await check("native immediate lease revocation","graceful",async(f,t)=>{const h=await win.createWin32Backend().open(t.identity,[],{mode:"close",authority:f.nativeAuthority});try{const observed=await h.inspect();fs.appendFileSync(f.file," ");await assert.rejects(h.graceful(observed.windows.hwnd),/owned_native_api_refused|owned_profile_source_changed/);}finally{await h.dispose();}},6500);
    await check("fixed config credential revocation before graceful","graceful",async(f,t)=>{const h=await win.createWin32Backend().open(t.identity,[],{mode:"close",authority:f.nativeAuthority});try{const observed=await h.inspect();fs.writeFileSync(f.configFile,fs.readFileSync(f.configFile,"utf8").replace('synthetic-automation-','changed-automation-'));await assert.rejects(h.graceful(observed.windows.hwnd),/owned_native_auth_changed/);}finally{await h.dispose();}},6500);
    await check("fixed config parser refusal before force after timeout","stubborn",async(f,t)=>{const h=await win.createWin32Backend().open(t.identity,[],{mode:"close",authority:f.nativeAuthority});try{const observed=await h.inspect();await h.graceful(observed.windows.hwnd);assert.equal((await h.wait(100)).waitResult,"WAIT_TIMEOUT");fs.appendFileSync(f.configFile,'AE_BRIDGE_PANEL_TOKEN = "duplicate"\n');await assert.rejects(h.force(),/owned_fixed_config_duplicate/);}finally{await h.dispose();}},6500);
    await check("inspect handle rejects effect","headless",async(f,t)=>{const h=await win.createWin32Backend().open(t.identity,[],{mode:"inspect",authority:f.nativeAuthority});try{assert.equal((await h.wait(0)).waitResult,"WAIT_TIMEOUT");await assert.rejects(h.force(),/owned_native_effect_contract/);}finally{await h.dispose();}},5000);
    console.log(JSON.stringify({ok:true,scope:"REAL hidden synthetic Win32 processes/windows",passed:results.length,parserCases,cases:results,waitProof:"WAIT_OBJECT_0 from same held process handle",productionAuthority:false,liveAEProof:false}));
  }finally{
    // All children self-expire; no generic kill, process-name or tree cleanup.
    await Promise.all(children.map(c=>c.exited));assert.equal(path.dirname(path.resolve(root)),BASE);assert.match(path.basename(root),/^synthetic-[a-f0-9]{32}$/);ledger.safeDirectory(root);fs.rmSync(root,{recursive:true});
  }
}
if(require.main===module)main().catch(e=>{console.error(e.stack);process.exitCode=1;});
