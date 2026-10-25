"use strict";
// SOURCES only. This retained read lane never calls the title mutation sender.
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const {stableStringify}=require("./m100-protocol");
const SLOT="aeAgentAMESourceReadsV1",MIN_BUDGET_MS=300000,MAX_BUDGET_MS=600000;
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const same=(a,b)=>String(a).replace(/\\/g,"/").toLowerCase()===String(b).replace(/\\/g,"/").toLowerCase();
const hash=v=>crypto.createHash("sha256").update(JSON.stringify(v)).digest("hex");
const pinHash=v=>crypto.createHash("sha256").update(stableStringify(v)).digest("hex");
function fail(code){throw Object.assign(Error(code),{code});}
function parents(dir){const rows=[];for(let p=path.resolve(dir);;p=path.dirname(p)){const s=fs.lstatSync(p);if(!s.isDirectory()||s.isSymbolicLink()||!same(fs.realpathSync(p),p))fail("ame_source_read_directory_alias");rows.push({path:p,device:String(s.dev),inode:String(s.ino)});if(path.dirname(p)===p)return rows;}}
function filePin(file,sha){
  file=path.resolve(file);if(process.platform==="win32"&&/:/.test(file.slice(2)))fail("ame_source_read_file_identity");const directories=parents(path.dirname(file)),before=fs.lstatSync(file);
  if(!before.isFile()||before.isSymbolicLink()||before.nlink!==1||before.ino===0||before.size<1||before.size>1024*1024*1024||!same(fs.realpathSync(file),file))fail("ame_source_read_file_identity");
  const fd=fs.openSync(file,"r"),digest=crypto.createHash("sha256"),buffer=Buffer.alloc(512*1024);let n,bytes=0;
  try{const held=fs.fstatSync(fd);if(held.dev!==before.dev||held.ino!==before.ino)fail("ame_source_read_file_changed");while((n=fs.readSync(fd,buffer,0,buffer.length,null))){bytes+=n;if(bytes>1024*1024*1024)fail("ame_source_read_file_bound");digest.update(buffer.subarray(0,n));}}finally{fs.closeSync(fd);}
  const after=fs.lstatSync(file);if(!after.isFile()||after.isSymbolicLink()||after.nlink!==1||before.dev!==after.dev||before.ino!==after.ino||before.size!==after.size||before.mtimeMs!==after.mtimeMs||before.ctimeMs!==after.ctimeMs||bytes!==after.size||digest.digest("hex")!==sha||!same(fs.realpathSync(file),file)||stableStringify(directories)!==stableStringify(parents(path.dirname(file))))fail("ame_source_read_file_changed");
  return {path:fs.realpathSync(file),sha256:sha,size:after.size,mtimeMs:after.mtimeMs,ctimeMs:after.ctimeMs,device:String(after.dev),inode:String(after.ino),parents:directories};
}
function nativeRead(a){
  function stringify(v){var out=[],i,k,s,c,h;if(v===null||v===undefined)return "null";if(typeof v==="number"||typeof v==="boolean")return String(v);if(typeof v==="string"){s='"';for(i=0;i<v.length;i++){c=v.charCodeAt(i);if(c===34||c===92)s+=String.fromCharCode(92)+v.charAt(i);else if(c<32||c===8232||c===8233){h=c.toString(16);while(h.length<4)h="0"+h;s+=String.fromCharCode(92)+"u"+h;}else s+=v.charAt(i);}return s+'"';}if(Object.prototype.toString.call(v)==="[object Array]"){for(i=0;i<v.length;i++)out.push(stringify(v[i]));return "["+out.join(",")+"]";}for(k in v)if(Object.prototype.hasOwnProperty.call(v,k))out.push(stringify(k)+":"+stringify(v[k]));return "{"+out.join(",")+"}";}
  var out={schema:"ae-agent-ame-title-native.v1",requestNonce:a.requestNonce,operationBinding:a.operationBinding,appSpecifier:String(BridgeTalk.appSpecifier),sessionNonce:$.global.aeAgentAMEProbeSessionNonce||null,observedAt:new Date().getTime(),code:"source_read_error",nativeJobId:null,nativeAssociationVerified:false,sourceGuids:[],sourceReadStartedAt:new Date().getTime(),sourceReadFinishedAt:null};
  function done(code){out.code=code;out.observedAt=new Date().getTime();return stringify(out);}
  if(a.operation!=="sources")return done("sources_only_required");if(out.appSpecifier!==a.targetSpecifier||Object.prototype.hasOwnProperty.call(a,"expectedSessionNonce")&&out.sessionNonce!==a.expectedSessionNonce)return done("target_session_changed");
  function pin(){var f=new File(a.sourcePath);if(!f.exists||f.alias||f.length!==a.sourcePin.size||!f.modified||Math.floor(f.modified.getTime()/1000)!==Math.floor(a.sourcePin.mtimeMs/1000))throw Error("source_native_file_changed");}
  try{pin();if(typeof app.getFrontend!=="function")return done("frontend_unsupported");var frontend=app.getFrontend();if(!frontend||typeof frontend.getDLItemsAtRoot!=="function")return done("dl_items_unsupported");
    var ids=frontend.getDLItemsAtRoot(a.sourcePath),i;out.sourceReadFinishedAt=new Date().getTime();pin();if(String(BridgeTalk.appSpecifier)!==a.targetSpecifier||Object.prototype.hasOwnProperty.call(a,"expectedSessionNonce")&&($.global.aeAgentAMEProbeSessionNonce||null)!==a.expectedSessionNonce)return done("target_session_changed");if(!ids||typeof ids.length!=="number"||ids.length>256)return done("dl_items_read_error");
    for(i=0;i<ids.length;i++){if(typeof ids[i]!=="string"||!ids[i]||ids[i].length>160){out.sourceGuids=[];return done("dl_items_read_error");}out.sourceGuids.push(ids[i]);}out.nativeFilePinsVerified=true;return done("sources_observed");
  }catch(e){out.sourceGuids=[];out.error=String(e.message||e).substring(0,2000);return done("source_read_error");}
}
function nativeSend(a,body){
  var cache=$.global.aeAgentAMESourceReadsV1,key=a.processBinding+":"+a.operationBinding,slot=cache&&cache[key],legacy=$.global.aeAgentAMETitleSendV1,legacyMatch=null;
  function matches(s){return s&&(s.operation==="sources"||s.operation===undefined)&&s.targetSpecifier===a.targetSpecifier&&s.processBinding===a.processBinding&&s.operationBinding===a.operationBinding;}
  if(matches(legacy))legacyMatch=legacy;else if(legacy&&matches(legacy.retainedSourceRead))legacyMatch=legacy.retainedSourceRead;
  function reply(code,selected,control){
    var callback=selected?selected.callback:null,read=selected?{schema:"ae-agent-ame-source-read-binding.v1",originalRequestNonce:selected.requestNonce,processBinding:selected.processBinding,operationBinding:selected.operationBinding,targetSpecifier:selected.targetSpecifier,sourcePath:selected.sourcePath||a.sourcePath,sourceSha25664:selected.sourceSha25664||a.expectedSourceSha25664,sourcePinSha25664:selected.sourcePinSha25664||null,sourceReadBudgetMs:selected.sourceReadBudgetMs||null,submittedAt:selected.submittedAt||null,deadlineAt:selected.deadlineAt||null,legacy:selected===legacyMatch}:null,status=null;
    try{if(typeof BridgeTalk.getStatus==="function")status=String(BridgeTalk.getStatus(a.targetSpecifier));}catch(_){}
    var replyNonce=a.requestNonce;if(!control&&selected)replyNonce=selected.requestNonce;
    return {schema:"ae-agent-ame-title-send.v1",requestNonce:replyNonce,code:code,callback:control?null:callback,responseBody:!control&&selected&&typeof selected.body==="string"?selected.body:null,sourceRead:read,transportDiagnostic:{targetStatus:status,sendAck:selected&&typeof selected.sent==="boolean"?selected.sent:null,sendError:selected&&selected.sendError||null,messageBodyChars:selected&&selected.message&&typeof selected.message.body==="string"?selected.message.body.length:null,callback:callback,sendMode:"async_no_wait",pumpPerformed:false}};
  }
  if(a.operation!=="sources")return reply("sources_only_required",null,false);
  if(slot&&!matches(slot))return reply("source_read_binding_changed",null,false);
  if(a.reconcileRequestNonce){
    // ExtendScript live read disproved this selection as a chained ternary.
    var selected=null;if(slot&&slot.requestNonce===a.reconcileRequestNonce)selected=slot;else if(legacyMatch&&legacyMatch.requestNonce===a.reconcileRequestNonce)selected=legacyMatch;
    return selected?reply(selected.callback||"source_read_pending",selected,false):reply("source_read_request_missing",null,false);
  }
  if(slot||legacyMatch)return reply("source_read_reconcile_required",slot||legacyMatch,true);
  if(typeof BridgeTalk!=="function"||typeof BridgeTalk.isRunning!=="function")return reply("bridgetalk_unsupported",null,false);try{if(!BridgeTalk.isRunning(a.targetSpecifier))return reply("target_not_running",null,false);}catch(_){return reply("target_running_unknown",null,false);}
  if(!cache){cache={};$.global.aeAgentAMESourceReadsV1=cache;}var count=0,k;for(k in cache)if(Object.prototype.hasOwnProperty.call(cache,k))count++;if(count>=64)return reply("source_read_cache_bound",null,false);
  slot={operation:"sources",requestNonce:a.requestNonce,targetSpecifier:a.targetSpecifier,processBinding:a.processBinding,operationBinding:a.operationBinding,sourcePath:a.sourcePath,sourceSha25664:a.expectedSourceSha25664,sourcePinSha25664:a.sourcePinSha25664,sourceReadBudgetMs:a.sourceReadBudgetMs,submittedAt:new Date().getTime(),deadlineAt:new Date().getTime()+a.sourceReadBudgetMs,callback:null,body:null,sent:null,sendError:null};cache[key]=slot;
  try{var message=new BridgeTalk();slot.message=message;message.target=a.targetSpecifier;message.body=body;message.timeout=Math.ceil(a.sourceReadBudgetMs/1000);
    message.onResult=function(r){var text=String(r.body||"");slot.body=text.length<=524288?text:null;slot.callback=text.length<=524288?"result":"response_envelope_oversize";};message.onError=function(r){slot.body=String(r.body||"").substring(0,2000);slot.callback="error";};message.onTimeout=function(){if(slot.callback!=="result"&&slot.callback!=="error"&&slot.callback!=="response_envelope_oversize")slot.callback="timeout";};slot.sent=message.send();
  }catch(e){slot.sendError=String(e.message||e).substring(0,2000);return reply("source_read_send_unknown",slot,false);}
  return reply(slot.callback||"source_read_pending",slot,false);
}
function commandScript(a,codec){
  if(a.operation!=="sources")fail("ame_source_read_sources_only");const body=a.reconcileRequestNonce?"":"("+nativeRead.toString()+")("+codec.argument(a)+");",script="return ("+nativeSend.toString()+")("+codec.argument(a)+","+codec.string(body)+");";
  if(Buffer.byteLength(script,"utf8")>1048576)fail("ame_source_read_command_bound");return script;
}
function normalizeTransport(reply,a,now){
  const read=reply.sourceRead;
  if(!read&&reply.callback==="result")return {resolved:false,code:"source_read_binding_unknown",native:null};
  if(read&&(read.schema!=="ae-agent-ame-source-read-binding.v1"||!UUID.test(read.originalRequestNonce||"")||read.processBinding!==a.processBinding||read.operationBinding!==a.operationBinding||read.targetSpecifier!==a.targetSpecifier||read.sourcePath!==a.sourcePath||read.sourceSha25664!==a.expectedSourceSha25664||!(read.sourcePinSha25664===null&&read.legacy===true||/^[a-f0-9]{64}$/.test(read.sourcePinSha25664||""))))return {resolved:false,code:"source_read_binding_unknown",native:null};
  const extra={sourceRead:read||null,transportDiagnostic:reply.transportDiagnostic||null};
  if(reply.callback!=="result"||typeof reply.responseBody!=="string")return {resolved:["error","response_envelope_oversize"].includes(reply.callback),code:reply.code||"source_read_pending",native:null,...extra};
  if(Buffer.byteLength(reply.responseBody,"utf8")>524288)return {resolved:false,code:"native_response_invalid",native:null,...extra};
  let native;try{native=JSON.parse(reply.responseBody);}catch(_){return {resolved:true,code:"native_response_invalid",native:null,...extra};}
  if(!native||native.schema!=="ae-agent-ame-title-native.v1"||native.requestNonce!==(a.reconcileRequestNonce||a.requestNonce)||native.operationBinding!==a.operationBinding||native.appSpecifier!==a.targetSpecifier||Object.prototype.hasOwnProperty.call(a,"expectedSessionNonce")&&native.sessionNonce!==a.expectedSessionNonce||!Number.isFinite(native.observedAt)||native.observedAt<=0||native.observedAt>now+60000||!Array.isArray(native.sourceGuids)||native.sourceGuids.length>256||native.sourceGuids.some(g=>typeof g!=="string"||!g||g.length>160))return {resolved:false,code:"native_correlation_unknown",native:null,...extra};
  return {resolved:true,code:native.code,native,...extra};
}
function createReader(deps){
  const claims=new Map();
  async function inspect(a){
    const processInfo=await deps.processPin(a),processBinding=deps.binding(a,processInfo);let source=null,currentSourceMatch=true,mismatchReason=null;
    try{source=filePin(a.sourceProjectFile,a.expectedSourceSha25664);}catch(e){if(!a.reconcileRequestNonce)throw e;currentSourceMatch=false;mismatchReason=e.code||"source_unavailable";}
    const sourcePath=source?source.path:path.resolve(a.sourceProjectFile),operationBinding=hash({operation:"sources",sourcePath,sha256:a.expectedSourceSha25664}),key=processBinding+":"+operationBinding,prior=claims.get(key);
    const reconcileArgs=nonce=>({...a,sourceProjectFile:sourcePath,reconcileRequestNonce:nonce});
    if(!a.reconcileRequestNonce&&prior)return deps.result("source_read_reconcile_required",{sourceGuids:[],requestNonce:prior.requestNonce,reconcileArgs:reconcileArgs(prior.requestNonce),pending:!prior.resolved,currentSourceMatch,automaticRetryAllowed:false});
    if(a.reconcileRequestNonce&&prior&&a.reconcileRequestNonce!==prior.requestNonce)return deps.result("source_read_reconcile_nonce_mismatch",{sourceGuids:[],requestNonce:prior.requestNonce,reconcileArgs:reconcileArgs(prior.requestNonce),pending:!prior.resolved,currentSourceMatch,automaticRetryAllowed:false});
    const requestNonce=a.reconcileRequestNonce||crypto.randomUUID();if(!a.reconcileRequestNonce){if(claims.size>=64)fail("ame_source_read_cache_bound");claims.set(key,{requestNonce,resolved:false});}
    await deps.processPin(a,processInfo);
    if(!a.reconcileRequestNonce&&stableStringify(filePin(sourcePath,a.expectedSourceSha25664))!==stableStringify(source))fail("ame_source_read_file_changed");
    const observed=await deps.send({...a,operation:"sources",sourcePath,sourcePin:source,sourcePinSha25664:source?pinHash(source):null,processBinding,operationBinding,requestNonce,minimumObservedAt:0});
    await deps.processPin(a,processInfo);
    let after=null;try{after=filePin(sourcePath,a.expectedSourceSha25664);}catch(e){currentSourceMatch=false;mismatchReason=e.code||"source_unavailable";}
    const read=observed.sourceRead;if(after&&read?.sourcePinSha25664&&pinHash(after)!==read.sourcePinSha25664||after&&source&&pinHash(after)!==pinHash(source)){currentSourceMatch=false;mismatchReason="source_pin_changed";}
    const originalNonce=read?.originalRequestNonce||requestNonce;if(read){claims.set(key,{requestNonce:originalNonce,resolved:observed.resolved});}
    const historical=!currentSourceMatch,complete=observed.code==="sources_observed"&&!!observed.native,pending=!observed.resolved&&["source_read_pending","timeout","source_read_send_unknown","ae_delivery_unknown","transport_unknown"].includes(observed.code);
    return deps.result(historical?"source_read_historical":observed.code,{ok:complete&&!historical,sourceGuids:complete&&!historical?observed.native.sourceGuids:[],pending,readComplete:complete,currentSourceMatch,historical,sourceMismatchReason:mismatchReason,retainedSourceGuids:historical&&complete?observed.native.sourceGuids:[],retainedNative:historical?observed.native:null,process:processInfo,source:source||{path:sourcePath,sha256:a.expectedSourceSha25664},requestNonce:originalNonce,reconciled:!!a.reconcileRequestNonce,reconcileArgs:reconcileArgs(originalNonce),sourceRead:read||null,transportDiagnostic:observed.transportDiagnostic||null,native:historical?null:observed.native||null});
  }
  return Object.freeze({inspect});
}
module.exports={SLOT,MIN_BUDGET_MS,MAX_BUDGET_MS,commandScript,normalizeTransport,createReader};
