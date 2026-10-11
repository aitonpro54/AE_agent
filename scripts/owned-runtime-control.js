#!/usr/bin/env node
"use strict";

const fs=require("node:fs"),path=require("node:path"),http=require("node:http"),crypto=require("node:crypto");
const ledger=require("../mcp-server/native-fixture-attempt-ledger"),lifecycle=require("../mcp-server/owned-runtime-lifecycle"),{createWin32Backend}=require("../mcp-server/owned-runtime-win32");
const ROOT=path.resolve(__dirname,".."),BASE=path.join(ROOT,".codex-runtime","owned-runtime-maintenance"),PROFILE="migration-fixture-children-v1";
const PROFILE_FILE=path.join(BASE,"profiles",PROFILE+".json");
const CREDENTIAL_FILE=path.join(ROOT,".codex","config.toml"),HOST="127.0.0.1",PORT=3456;
const rawHash=b=>crypto.createHash("sha256").update(b).digest("hex");
function fail(code){throw Object.assign(Error(code),{code});}
function parse(argv){
  const a=argv.slice(2),command=a.shift();if(!command || command==="help" && !a.length)return {command:"help"};
  if(!["inspect","close-once","read-back"].includes(command) || a.length!==6)fail("owned_cli_closed_schema_required");
  const v={command};for(let i=0;i<a.length;i+=2){const key={"--profile":"profile","--run-id":"runId","--stage-id":"stageId"}[a[i]];if(!key || v[key]!==undefined)fail("owned_cli_closed_schema_required");v[key]=a[i+1];}
  if(v.profile!==PROFILE)fail("owned_cli_fixed_profile_required");return lifecycle.selector(v);
}
function loadTrustedProfile(profile){
  if(profile!==PROFILE || !fs.existsSync(PROFILE_FILE))fail("owned_trusted_provision_required");
  const stat=fs.lstatSync(PROFILE_FILE,{bigint:true}),bytes=ledger.readBytes(PROFILE_FILE),digest=rawHash(bytes),p=lifecycle.freeze(JSON.parse(bytes));
  function assertUnchanged(){const latest=ledger.readBytes(PROFILE_FILE),current=fs.lstatSync(PROFILE_FILE,{bigint:true});if(current.dev!==stat.dev || current.ino!==stat.ino || current.size!==stat.size || current.mtimeNs!==stat.mtimeNs || rawHash(latest)!==digest)fail("owned_profile_source_changed");}
  assertUnchanged();return {profile:p,profilePath:PROFILE_FILE,profileRawSha256:digest,assertUnchanged};
}
function parseCredentialConfig(text){
  // A deliberately limited TOML basic-string subset; never ignore malformed
  // assignments inside the selected section or silently choose a duplicate.
  if(typeof text!=="string" || Buffer.byteLength(text)>1024*1024 || text.includes("\0"))fail("owned_fixed_config_required");
  let selected=false,sections=0;const values=Object.create(null);
  for(const line of text.replace(/^\uFEFF/,"").split(/\r?\n/)){
    if(/^\s*\[/.test(line)){selected=line.trim()==='[mcp_servers."after-effects".env]';if(selected && ++sections!==1)fail("owned_fixed_config_duplicate");continue;}
    if(!selected || /^\s*(?:#.*)?$/.test(line))continue;
    const m=/^\s*([A-Z][A-Z0-9_]*)\s*=\s*("(?:[^"\\\r\n]|\\["\\bfnrt]|\\u[0-9a-fA-F]{4})*")\s*(?:#.*)?$/.exec(line);
    if(!m)fail("owned_fixed_config_required");if(Object.hasOwn(values,m[1]))fail("owned_fixed_config_duplicate");
    try{values[m[1]]=JSON.parse(m[2]);}catch(_){fail("owned_fixed_config_required");}
    if(/[\u0000-\u001f\u007f]/.test(values[m[1]]))fail("owned_fixed_config_required");
  }
  if(sections!==1 || !/^[!-~]+$/.test(values.AE_BRIDGE_TOKEN || "") || !/^[!-~]+$/.test(values.AE_BRIDGE_PANEL_TOKEN || "") || values.AE_BRIDGE_TOKEN===values.AE_BRIDGE_PANEL_TOKEN || Object.hasOwn(values,"AE_BRIDGE_HOST") && values.AE_BRIDGE_HOST!==HOST || Object.hasOwn(values,"AE_BRIDGE_PORT") && values.AE_BRIDGE_PORT!==String(PORT) || Object.hasOwn(values,"AE_BRIDGE_LOG_DIR") && path.resolve(values.AE_BRIDGE_LOG_DIR)!==path.join(ROOT,"logs"))fail("owned_fixed_config_required");
  return values.AE_BRIDGE_TOKEN;
}
function fixedCredential(){
  // No environment/CLI/global configuration fallback. Bounded errors never
  // include TOML contents, credentials or a parser's source excerpt.
  try{return parseCredentialConfig(ledger.readBytes(CREDENTIAL_FILE).toString("utf8"));}catch(e){fail(/^owned_fixed_config_(required|duplicate)$/.test(e.code || "")?e.code:"owned_fixed_config_unavailable");}
}
function credentialFingerprint(){return rawHash(fixedCredential());}
function credential(p){const token=fixedCredential();if(p?.daemon?.port!==PORT || rawHash(token)!==p.daemon.credentialSha256)fail("owned_fixed_credential_changed");return token;}
function request(p,route,body){if(typeof route!=="string" || !/^\/[a-zA-Z0-9/_-]+$/.test(route))fail("owned_fixed_route_required");const token=credential(p);return new Promise((resolve,reject)=>{
  const bytes=body===undefined?null:Buffer.from(JSON.stringify(body));
  const req=http.request({host:HOST,port:PORT,path:route,method:bytes?"POST":"GET",headers:{"x-ae-bridge-token":token,...(bytes?{"content-type":"application/json","content-length":bytes.length}:{})}},res=>{
    let size=0;const chunks=[];res.on("data",b=>{size+=b.length;if(size>2*1024*1024){req.destroy(Error("owned_auth_response_budget"));return;}chunks.push(b);});
    res.on("end",()=>{try{const value=JSON.parse(Buffer.concat(chunks));if(res.statusCode!==200 || value.ok!==true)fail("owned_authenticated_daemon_refused");resolve(value);}catch(_){reject(Object.assign(Error("owned_authenticated_daemon_refused"),{code:"owned_authenticated_daemon_refused"}));}});
  });req.setTimeout(3000,()=>req.destroy(Error("owned_original_daemon_unavailable")));req.on("error",()=>reject(Object.assign(Error("owned_original_daemon_unavailable"),{code:"owned_original_daemon_unavailable"})));if(bytes)req.write(bytes);req.end();
});}
function bootstrapIdle(v){if(!v || Object.hasOwn(v,"stage") && v.stage!=="verified")return false;return v.busy===false || !Object.hasOwn(v,"busy") && v.stage==="verified";}
function statusVerified(v,p){return v?.ok===true && v.startedAt===p.daemon.startedAt && v.humanGuardRuntime?.pid===p.daemon.identity.pid && v.humanGuardRuntime.startedAt===p.daemon.startedAt && v.humanGuardRuntime.sourceSha256===p.daemon.loadedRuntimeSha256 && v.pendingCommands===0 && Array.isArray(v.inflightCommands) && !v.inflightCommands.length && v.activeEditSession===null && v.projectLifecycle?.blocked===false && !v.projectLifecycle.pending && bootstrapIdle(v.panelBootstrap);}
function attemptValue(v){const result=v?.result,texts=result?.content?.filter(c=>c.type==="text");if(result?.isError || !texts || texts.length!==1)fail("owned_original_registration_refused");try{return JSON.parse(texts[0].text);}catch(_){fail("owned_original_registration_refused");}}
async function checkOriginalRegistration(p){
  const before=await request(p,"/dev/status");if(!statusVerified(before,p))fail("owned_original_daemon_status_changed");
  for(const w of p.stages){
    const row=attemptValue(await request(p,"/tools/call",{name:"inspect_native_fixture_attempt",arguments:{stageId:w.stageId}}));
    if(row.schema!=="ae-agent.native-fixture-attempt-readback.v1" || row.stageId!==w.stageId || row.verificationScope!=="current_private_issuer_and_durable_ledger" || row.reservation?.sha256!==w.pins.reservation.valueSha256 || row.launch?.sha256!==w.pins.launch.valueSha256 || row.unknown?.sha256!==w.pins.unknown.valueSha256 || row.historicalOutcome!=="unknown" || row.nativeExecutionProven!==false || row.replayAllowed!==false)fail("owned_original_registration_refused");
  }
  const after=await request(p,"/dev/status");if(!statusVerified(after,p))fail("owned_original_daemon_status_changed");
  return {registered:true,originalDaemonVerified:true,idle:true,generation:p.generation,canonicalBindingSha256:p.canonicalBindingSha256,protectedInventorySha256:p.protectedInventorySha256};
}
async function run(argv){const s=parse(argv);if(s.command==="help")return {ok:true,commands:["inspect","close-once","read-back"],profile:PROFILE,required:["--profile","--run-id","--stage-id"],trustedProvisionRequired:true,...lifecycle.OUTCOME};
  return lifecycle.createOwnedRuntimeLifecycle({repoRoot:ROOT,journalRoot:path.join(BASE,"journal"),loadTrustedProfile,checkOriginalRegistration,native:createWin32Backend()}).run(s);
}
if(require.main===module)run(process.argv).then(v=>process.stdout.write(JSON.stringify(v)+"\n")).catch(e=>{process.stdout.write(JSON.stringify({ok:false,code:/^owned_[a-z0-9_]+$/.test(e.code || "")?e.code:"owned_runtime_control_refused",...lifecycle.OUTCOME})+"\n");process.exitCode=1;});
module.exports={run,parse,loadTrustedProfile,checkOriginalRegistration,statusVerified,credential,credentialFingerprint,request,parseCredentialConfig,PROFILE,PROFILE_FILE};
