"use strict";
// Bounded read-only localization of generic receiver delivery vs the DL read.
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const jobs=require("./ame-title-jobs"),{sameProcess}=require("./ame-running"),{stableStringify}=require("./m100-protocol");
const TOOL="inspect_ame_source_probe",SCHEMA="ae-agent-ame-source-probe.v1",UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const hash=v=>crypto.createHash("sha256").update(stableStringify(v)).digest("hex"),same=(a,b)=>String(a).replace(/\\/g,"/").toLowerCase()===String(b).replace(/\\/g,"/").toLowerCase();
function fail(code){throw Object.assign(Error(code),{code});}
function validateInput(raw){
  const allowed=["probeId","mode","sourceProjectFile","expectedSourceSha25664","targetSpecifier","expectedProcess","expectedSessionNonce","timeoutMs"];
  if(!raw||typeof raw!=="object"||Array.isArray(raw)||Object.keys(raw).some(k=>!allowed.includes(k))||!UUID.test(raw.probeId||"")||!["begin","receiver","dl","status"].includes(raw.mode)||typeof raw.expectedSessionNonce!=="string"||!raw.expectedSessionNonce)fail("ame_source_probe_invalid_input");
  const a={probeId:raw.probeId,mode:raw.mode,...jobs.validateInput(jobs.INSPECT,Object.fromEntries(Object.entries(raw).filter(([k])=>!["probeId","mode"].includes(k))))};
  if(process.platform==="win32"&&/:/.test(a.sourceProjectFile.slice(2)))fail("ame_source_probe_source_alias");return a;
}
function filePin(file,sha){
  const parents=[];for(let p=path.dirname(file);;p=path.dirname(p)){const s=fs.lstatSync(p);if(!s.isDirectory()||s.isSymbolicLink()||!same(fs.realpathSync(p),p))fail("ame_source_probe_source_alias");parents.push([p,String(s.dev),String(s.ino)]);if(path.dirname(p)===p)break;}
  const before=fs.lstatSync(file);if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1||before.ino===0||before.size<1||before.size>1024*1024*1024||!same(fs.realpathSync(file),path.resolve(file)))fail("ame_source_probe_source_identity");
  const digest=crypto.createHash("sha256"),fd=fs.openSync(file,"r"),buffer=Buffer.alloc(512*1024);let bytes=0,n;
  try{const held=fs.fstatSync(fd);if(held.dev!==before.dev||held.ino!==before.ino)fail("ame_source_probe_source_changed");while((n=fs.readSync(fd,buffer,0,buffer.length,null))){bytes+=n;if(bytes>1024*1024*1024)fail("ame_source_probe_source_bound");digest.update(buffer.subarray(0,n));}}finally{fs.closeSync(fd);}
  const after=fs.lstatSync(file);if(!after.isFile()||after.isSymbolicLink()||after.nlink!==1||before.dev!==after.dev||before.ino!==after.ino||before.size!==after.size||before.mtimeMs!==after.mtimeMs||before.ctimeMs!==after.ctimeMs||bytes!==after.size||digest.digest("hex")!==sha||!same(fs.realpathSync(file),path.resolve(file)))fail("ame_source_probe_source_changed");
  for(const [p,dev,ino]of parents){const s=fs.lstatSync(p);if(!s.isDirectory()||s.isSymbolicLink()||String(s.dev)!==dev||String(s.ino)!==ino||!same(fs.realpathSync(p),p))fail("ame_source_probe_source_alias");}
  return {path:path.resolve(file),bytes:after.size,mtimeMs:after.mtimeMs,ctimeMs:after.ctimeMs,device:String(after.dev),inode:String(after.ino),sha25664:sha,parents};
}
// Fixed ES3 receiver. Only its own bounded diagnostic slot is written.
function nativeProbe(a){
  function stringify(v){var out=[],i,k,s,c,h;if(v===null||v===undefined)return "null";if(typeof v==="boolean"||typeof v==="number")return String(v);if(typeof v==="string"){s='"';for(i=0;i<v.length;i++){c=v.charCodeAt(i);if(c===34||c===92)s+=String.fromCharCode(92)+v.charAt(i);else if(c<32||c===8232||c===8233){h=c.toString(16);while(h.length<4)h="0"+h;s+=String.fromCharCode(92)+"u"+h;}else s+=v.charAt(i);}return s+'"';}if(Object.prototype.toString.call(v)==="[object Array]"){for(i=0;i<v.length;i++)out.push(stringify(v[i]));return "["+out.join(",")+"]";}for(k in v)if(Object.prototype.hasOwnProperty.call(v,k))out.push(stringify(k)+":"+stringify(v[k]));return "{"+out.join(",")+"}";}
  var all=$.global.aeAgentAMESourceProbeV1,row=all&&all[a.probeId],reply={schema:"ae-agent-ame-source-probe-native.v1",probeId:a.probeId,requestNonce:a.requestNonce,binding:a.binding,mode:a.mode,appSpecifier:String(BridgeTalk.appSpecifier),sessionNonce:$.global.aeAgentAMEProbeSessionNonce,observedAt:new Date().getTime(),code:"probe_observed",phase:null,genericReceived:false,dlIssued:false,sourceGuids:[],error:null};
  function done(code){reply.code=code;if(row){reply.phase=row.phase;reply.genericReceived=row.genericReceived;reply.dlIssued=row.dlIssued;reply.sourceGuids=row.sourceGuids;reply.error=row.error;reply.dlStartedAt=row.dlStartedAt;reply.dlFinishedAt=row.dlFinishedAt;}return stringify(reply);}
  if(reply.appSpecifier!==a.targetSpecifier||reply.sessionNonce!==a.expectedSessionNonce)return done("target_session_changed");
  if(a.mode==="begin"){
    if(row)return done(row.binding===a.binding?"probe_already_registered":"probe_binding_changed");
    if(!all){all={};$.global.aeAgentAMESourceProbeV1=all;}var count=0,k;for(k in all)if(Object.prototype.hasOwnProperty.call(all,k))count++;if(count>=16)return done("probe_slot_bound");
    row={binding:a.binding,phase:"registered",genericReceived:false,dlIssued:false,sourceGuids:[],error:null,dlStartedAt:null,dlFinishedAt:null};all[a.probeId]=row;return done("probe_observed");
  }
  if(!row||row.binding!==a.binding)return done("probe_binding_missing_or_changed");
  if(a.mode==="status")return done("probe_observed");
  if(a.mode==="receiver"){if(row.genericReceived)return done("probe_receiver_no_replay");row.genericReceived=true;row.phase="generic_receiver_compiled";return done("probe_observed");}
  if(a.mode!=="dl"||!row.genericReceived||row.dlIssued)return done("probe_dl_no_replay");
  // Set once before even frontend/file inspection. No later callback/retry can
  // issue another DL read for this probe, including after a native exception.
  row.dlIssued=true;row.phase="dl_preflight";
  try{
    var f=new File(a.file.path);if(!f.exists||f.alias||f.length!==a.file.bytes||!f.modified||Math.floor(f.modified.getTime()/1000)!==Math.floor(a.file.mtimeMs/1000))throw Error("probe_native_source_changed");
    if(typeof app.getFrontend!=="function")throw Error("frontend_unsupported");row.phase="before_get_frontend";var frontend=app.getFrontend();if(!frontend||typeof frontend.getDLItemsAtRoot!=="function")throw Error("dl_items_unsupported");
    row.phase="before_get_dl";row.dlStartedAt=new Date().getTime();var ids=frontend.getDLItemsAtRoot(a.file.path),i;
    row.phase="after_get_dl";row.dlFinishedAt=new Date().getTime();if(!ids||typeof ids.length!=="number"||ids.length>256)throw Error("dl_items_read_error");
    for(i=0;i<ids.length;i++){if(typeof ids[i]!=="string"||!ids[i]||ids[i].length>160)throw Error("dl_items_read_error");row.sourceGuids.push(ids[i]);}
    return done("probe_observed");
  }catch(e){row.error=String(e.message||e).substring(0,2000);row.phase="dl_error";return done("probe_observed");}
}
// Separate sender slots: the original title sender is never read/reset/replaced.
// Each non-status stage retains ONE request; a repeat only reads its callback.
// Never synchronously wait in AE: the DL read may need AE/DL reentry.
function nativeSend(a,body){
  var all=$.global.aeAgentAMESourceProbeSendV1;if(!all){all={};$.global.aeAgentAMESourceProbeSendV1=all;}var key=a.probeId+":"+a.mode,slot=all[key];
  function result(code){var status=null;try{if(typeof BridgeTalk.getStatus==="function")status=String(BridgeTalk.getStatus(a.targetSpecifier));}catch(_){}return {schema:"ae-agent-ame-source-probe-send.v1",requestNonce:slot?slot.requestNonce:a.requestNonce,code:code,callback:slot?slot.callback:null,responseBody:slot?slot.body:null,sent:slot?slot.sent:null,error:slot?slot.error:null,targetStatus:status,messageBodyChars:slot?slot.chars:body.length,sendMode:"async_no_wait",pumpPerformed:false};}
  if(slot){if(slot.binding!==a.binding)return result("probe_sender_binding_changed");if(slot.requestNonce===a.requestNonce)return result(slot.callback||"unknown");if(a.mode!=="status"||slot.callback!=="result"&&slot.callback!=="error")return result("probe_sender_no_replay");}
  if(typeof BridgeTalk!=="function"||typeof BridgeTalk.isRunning!=="function")return result("bridgetalk_unsupported");try{if(!BridgeTalk.isRunning(a.targetSpecifier))return result("target_not_running");}catch(_){return result("target_running_unknown");}
  slot={requestNonce:a.requestNonce,binding:a.binding,callback:null,body:null,sent:null,error:null,chars:body.length};all[key]=slot;
  var message=new BridgeTalk();slot.message=message;message.target=a.targetSpecifier;message.body=body;message.timeout=Math.ceil(a.timeoutMs/1000);
  message.onResult=function(r){var text=String(r.body||"");slot.body=text.length<=65536?text:null;slot.callback=text.length<=65536?"result":"oversize";};message.onError=function(r){slot.error=String(r.body||"").substring(0,2000);slot.callback="error";};message.onTimeout=function(){slot.callback="timeout";};
  try{slot.sent=message.send();}catch(e){slot.error=String(e.message||e).substring(0,2000);return result("send_unknown");}return result(slot.callback||"unknown");
}
function commandScript(a){const body=(a.mode==="receiver"?"("+jobs.nativeReceiverSource()+");\n":"")+"("+nativeProbe.toString()+")("+jobs.fixedDataExpression(a)+");";return "return ("+nativeSend.toString()+")("+jobs.fixedDataExpression(a)+","+jobs.fixedStringExpression(body)+");";}
function createProbe(deps){
  const rows=new Map();let busy=false;
  if(!deps||["inspectProcesses","readNative","assertReady"].some(k=>typeof deps[k]!=="function"))fail("ame_source_probe_dependencies_required");
  function ready(){const v=deps.assertReady();if(v===false||v&&typeof v.then==="function"){if(v&&typeof v.catch==="function")v.catch(()=>{});fail("ame_source_probe_idle_required");}}
  async function processPin(a,wanted){const rows=await deps.inspectProcesses();if(!Array.isArray(rows)||rows.length!==1||!sameProcess(rows[0],rows[0])||rows[0].pid!==a.expectedProcess.pid||Date.parse(rows[0].startedAt)!==Date.parse(a.expectedProcess.startedAt)||wanted&&!sameProcess(rows[0],wanted))fail("ame_source_probe_process_changed");return rows[0];}
  async function execute(raw){
    if(busy)fail("ame_source_probe_busy");busy=true;
    try{const a=validateInput(raw),{mode,...identity}=a;ready();const process=await processPin(a),pin=filePin(a.sourceProjectFile,a.expectedSourceSha25664),binding=hash({identity,process,pin});let row=rows.get(a.probeId);
      if(!row){if(mode!=="begin")fail("ame_source_probe_begin_required");if(rows.size>=16)fail("ame_source_probe_bound");row={binding,pin,process,stages:{},beginVerified:false,genericVerified:false};rows.set(a.probeId,row);}
      if(row.binding!==binding)fail("ame_source_probe_binding_changed");if(mode==="receiver"&&!row.beginVerified)fail("ame_source_probe_begin_evidence_required");if(mode==="dl"&&!row.genericVerified)fail("ame_source_probe_receiver_evidence_required");
      let stage=row.stages[mode];if(!stage||mode==="status"&&stage.resolved){stage={nonce:crypto.randomUUID(),startedAt:Date.now(),resolved:false};row.stages[mode]=stage;}
      ready();await processPin(a,row.process);if(stableStringify(filePin(a.sourceProjectFile,a.expectedSourceSha25664))!==stableStringify(row.pin))fail("ame_source_probe_source_changed");ready();
      const input={...a,requestNonce:stage.nonce,binding:row.binding,file:{path:row.pin.path,bytes:row.pin.bytes,mtimeMs:row.pin.mtimeMs}},r=await deps.readNative(commandScript(input)),sent=r?.result??r;
      ready();await processPin(a,row.process);if(stableStringify(filePin(a.sourceProjectFile,a.expectedSourceSha25664))!==stableStringify(row.pin))fail("ame_source_probe_source_changed");
      const base={schema:SCHEMA,probeId:a.probeId,mode,requestNonce:stage.nonce,ok:false,code:sent?.code||"ae_delivery_unknown",executionAuthority:false,diagnosticGuidAuthority:false,queueMutationPerformed:false,automaticRetryAllowed:false,transport:sent||null,phase:null};
      if(!sent||sent.schema!=="ae-agent-ame-source-probe-send.v1"||sent.requestNonce!==stage.nonce)return {...base,code:"probe_sender_correlation_unknown"};
      if(sent.callback!=="result"||typeof sent.responseBody!=="string")return base;
      let native;try{native=JSON.parse(sent.responseBody);}catch(_){return {...base,code:"probe_response_invalid"};}
      if(native.schema!=="ae-agent-ame-source-probe-native.v1"||native.probeId!==a.probeId||native.mode!==mode||native.requestNonce!==stage.nonce||native.binding!==row.binding||native.appSpecifier!==a.targetSpecifier||native.sessionNonce!==a.expectedSessionNonce||!Number.isFinite(native.observedAt)||native.observedAt<stage.startedAt||native.observedAt>Date.now()+60000)return {...base,code:"probe_native_correlation_unknown"};
      stage.resolved=true;if(native.code==="probe_observed"&&typeof native.phase==="string")row.beginVerified=true;if(native.code==="probe_observed"&&native.genericReceived===true)row.genericVerified=true;
      return {...base,ok:native.code==="probe_observed"&&(mode!=="receiver"||native.phase==="generic_receiver_compiled")&&(mode!=="dl"||native.phase==="after_get_dl"),code:native.code,phase:native.phase,native};
    }finally{busy=false;}
  }
  return Object.freeze({execute});
}
const fields={...jobs.tools.find(t=>t.name===jobs.INSPECT).inputSchema.properties};delete fields.reconcileRequestNonce;
const tool={name:TOOL,description:"Bounded readonly localization with asynchronous BridgeTalk send(), no pump/wait in AE: begin registers a probe; receiver compiles the existing generic AME receiver without invoking it; dl uses one tiny marked getDLItemsAtRoot call; status only reads retained phase. Exact process/session/source pins. Repeat the SAME mode/arguments after releasing AE to read its retained callback; status alone starts a fresh read after the previous valid callback was returned. Never replay DL or alter the original UNKNOWN title sender. Returned GUIDs grant no enqueue authority. No launch, save, queue mutation or START.",inputSchema:{type:"object",additionalProperties:false,properties:{...fields,probeId:{type:"string",pattern:UUID.source},mode:{type:"string",enum:["begin","receiver","dl","status"]}},required:["probeId","mode","sourceProjectFile","expectedSourceSha25664","targetSpecifier","expectedProcess","expectedSessionNonce"]},annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:false,openWorldHint:false}};
module.exports={TOOL,SCHEMA,tool,validateInput,commandScript,createProbe};
