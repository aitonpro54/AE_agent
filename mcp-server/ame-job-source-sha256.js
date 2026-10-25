"use strict";
// Private fixed Node worker contract; no caller executable, script or argv.
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto"),{stableStringify}=require("./m100-protocol");
const MAX_BYTES=67108864,PROBE_MS=40000,MAX_COMMAND=7900,SCHEMA="ae-agent-ame-source-hash-worker.v1",WORKER=path.resolve(__dirname,"../scripts/ame-job-source-hash-worker.cjs");
const BLOCKED_ENV=["NODE_OPTIONS","NODE_PATH","NODE_V8_COVERAGE","NODE_COMPILE_CACHE","NODE_REDIRECT_WARNINGS","NODE_EXTRA_CA_CERTS","NODE_ICU_DATA","NODE_CHANNEL_FD","NODE_CHANNEL_SERIALIZATION_MODE","NODE_UNIQUE_ID","OPENSSL_CONF","OPENSSL_MODULES","SSL_CERT_FILE","SSL_CERT_DIR","ICU_DATA","UV_THREADPOOL_SIZE"];
const digest=v=>crypto.createHash("sha256").update(stableStringify(v)).digest("hex");
function fail(code){throw Object.assign(Error(code),{code});}
function core(pin){const {parents,...p}=pin;return {...p,parentsSha25664:digest(parents)};}
function precise(file){const s=fs.lstatSync(file,{bigint:true});return {mtimeNs:String(s.mtimeNs),ctimeNs:String(s.ctimeNs),birthtimeNs:String(s.birthtimeNs)};}
function captureRuntime(fileRecord){const supervisor=require("./owned-runtime-supervisor");supervisor.verifyNodePolicy();const executable=fileRecord(path.resolve(supervisor.POLICY.executable)),worker=fileRecord(WORKER);if(executable.sha25664!==supervisor.POLICY.executableSha256||worker.bytes>1048576)fail("ame_source_hash_runtime_changed");const runtime={executable,worker};return {runtime,precise:{executable:precise(executable.path),worker:precise(worker.path)},core:{executable:core(executable),worker:core(worker)},sha25664:digest({executable:core(executable),worker:core(worker)})};}
function assertRuntime(r,unchanged,full=false){
  if(!r||r.sha25664!==digest(r.core)||stableStringify(r.core)!==stableStringify({executable:core(r.runtime.executable),worker:core(r.runtime.worker)})||path.resolve(r.runtime.worker.path)!==WORKER)fail("ame_source_hash_runtime_changed");
  for(const key of ["executable","worker"]){const pin=r.runtime[key],s=fs.lstatSync(pin.path,{bigint:true});if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1n||String(s.dev)!==pin.device||String(s.ino)!==pin.inode||s.size!==BigInt(pin.bytes)||fs.realpathSync(pin.path).toLowerCase()!==pin.path.toLowerCase()||stableStringify(precise(pin.path))!==stableStringify(r.precise[key]))fail("ame_source_hash_runtime_changed");
    for(const dir of pin.parents){const st=fs.lstatSync(dir.path);if(!st.isDirectory()||st.isSymbolicLink()||String(st.dev)!==dir.device||String(st.ino)!==dir.inode||fs.realpathSync(dir.path).toLowerCase()!==dir.path.toLowerCase())fail("ame_source_hash_runtime_changed");}if(full)unchanged(pin);
  }return true;
}
function commandLength(runtime,argument){return runtime.executable.path.length+runtime.worker.path.length+argument.length+6;}
function buildRequest(r,filePath,deadline){const facts={schema:SCHEMA,nonce:crypto.randomUUID(),filePath,deadline,maxBytes:MAX_BYTES,runtime:r.core},requestSha25664=digest(facts),wire={...facts,requestSha25664},argument=Buffer.from(stableStringify(wire),"utf8").toString("base64");if(commandLength(r.core,argument)>MAX_COMMAND)fail("ame_source_hash_argument_bound");return {argument,nonce:facts.nonce,filePath,deadline,maxBytes:MAX_BYTES,requestSha25664,runtimeSha25664:r.sha25664,runtime:r.core};}
function assertRequest(q,r,filePath,deadline){if(!q||q.filePath!==filePath||q.deadline!==deadline||q.maxBytes!==MAX_BYTES||q.runtimeSha25664!==r.sha25664||stableStringify(q.runtime)!==stableStringify(r.core)||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(q.nonce||"")||typeof q.argument!=="string"||commandLength(r.core,q.argument)>MAX_COMMAND)fail("ame_source_hash_request_changed");const wire={schema:SCHEMA,nonce:q.nonce,filePath,deadline,maxBytes:MAX_BYTES,runtime:r.core,requestSha25664:q.requestSha25664},{requestSha25664,...facts}=wire;if(requestSha25664!==digest(facts)||Buffer.from(stableStringify(wire),"utf8").toString("base64")!==q.argument)fail("ame_source_hash_request_changed");return true;}
function sameFile(reply,pin){return reply&&reply.sha25664===pin.sha25664&&reply.bytes===pin.bytes&&reply.path===pin.path&&reply.mtimeMsText===String(pin.mtimeMs)&&reply.ctimeMsText===String(pin.ctimeMs)&&reply.device===pin.device&&reply.inode===pin.inode&&reply.parentsSha25664===digest(pin.parents);}
// ES3 helpers. The trusted runtime namespace is not a hostile-writer kernel lock.
function nativeRuntimeCheck(runtime){
  function bad(c){throw Error(c);}var keys=["executable","worker"],i,p,f;
  if(typeof $==="undefined"||typeof $.getenv!=="function")bad("ame_source_hash_environment_unavailable");
  var blocked=["NODE_OPTIONS","NODE_PATH","NODE_V8_COVERAGE","NODE_COMPILE_CACHE","NODE_REDIRECT_WARNINGS","NODE_EXTRA_CA_CERTS","NODE_ICU_DATA","NODE_CHANNEL_FD","NODE_CHANNEL_SERIALIZATION_MODE","NODE_UNIQUE_ID","OPENSSL_CONF","OPENSSL_MODULES","SSL_CERT_FILE","SSL_CERT_DIR","ICU_DATA","UV_THREADPOOL_SIZE"],value;
  for(i=0;i<blocked.length;i++){value=$.getenv(blocked[i]);if(value!==null&&value!=="")bad("ame_source_hash_environment_refused");}
  for(i=0;i<keys.length;i++){p=runtime&&runtime[keys[i]];if(!p||typeof p.path!=="string"||!/^[A-Za-z]:[\\/]/.test(p.path)||/["%&|<>^!`$\x00-\x1f]/.test(p.path))bad("ame_source_hash_runtime_path_refused");f=new File(p.path);if(!f.exists||f.alias||f.length!==p.bytes||!f.modified||Math.floor(f.modified.getTime()/1000)!==Math.floor(p.mtimeMs/1000))bad("ame_source_hash_runtime_stat_changed");}
}
function nativeHash(q){
  var started=new Date().getTime(),text,at=0,result={},seen={},key,value,i,c,token;
  function bad(code){throw Error(code);}
  function white(){while(at<text.length&&/[ \t\r\n]/.test(text.charAt(at)))at++;}
  function string(){var out="",s,n,escape;if(text.charAt(at++)!=='"')bad("ame_source_hash_stdout_invalid");while(at<text.length){s=text.charAt(at++);if(s==='"')return out;if(s==='\\'){escape=text.charAt(at++);if(escape==='u'){s=text.substr(at,4);if(!/^[a-fA-F0-9]{4}$/.test(s))bad("ame_source_hash_stdout_invalid");out+=String.fromCharCode(parseInt(s,16));at+=4;}else{n='"\\/bfnrt'.indexOf(escape);if(n<0)bad("ame_source_hash_stdout_invalid");out+='"\\/\b\f\n\r\t'.charAt(n);}}else{if(s.charCodeAt(0)<32)bad("ame_source_hash_stdout_invalid");out+=s;}}bad("ame_source_hash_stdout_invalid");}
  if(!q||!q.runtime||!q.runtime.executable||!q.runtime.worker||typeof q.argument!=="string"||q.runtime.executable.path.length+q.runtime.worker.path.length+q.argument.length+6>7900||!/^[A-Za-z0-9+/]+={0,2}$/.test(q.argument)||new Date().getTime()>=q.deadline)bad("ame_source_hash_request_invalid_or_expired");
  if(typeof $==="undefined"||typeof $.getenv!=="function")bad("ame_source_hash_environment_unavailable");
  var blocked=["NODE_OPTIONS","NODE_PATH","NODE_V8_COVERAGE","NODE_COMPILE_CACHE","NODE_REDIRECT_WARNINGS","NODE_EXTRA_CA_CERTS","NODE_ICU_DATA","NODE_CHANNEL_FD","NODE_CHANNEL_SERIALIZATION_MODE","NODE_UNIQUE_ID","OPENSSL_CONF","OPENSSL_MODULES","SSL_CERT_FILE","SSL_CERT_DIR","ICU_DATA","UV_THREADPOOL_SIZE"];
  for(i=0;i<blocked.length;i++){value=$.getenv(blocked[i]);if(value!==null&&value!=="")bad("ame_source_hash_environment_refused");}
  sourceRuntimeCheck(q.runtime);
  if(typeof system==="undefined"||typeof system.callSystem!=="function")bad("ame_source_hash_system_unavailable");
  // Fixed executable/script and one base64 operand. No hard-kill guarantee.
  text=system.callSystem('"'+q.runtime.executable.path+'" "'+q.runtime.worker.path+'" '+q.argument);
  if(typeof text!=="string"||text.length>4096||/[^\x00-\x7f]/.test(text))bad("ame_source_hash_stdout_bound_or_encoding");
  white();if(text.charAt(at++)!=="{")bad("ame_source_hash_stdout_invalid");white();
  while(text.charAt(at)!=="}"){
    key=string();if(key==="__proto__"||key==="constructor"||key==="prototype"||seen["_"+key])bad("ame_source_hash_stdout_invalid");seen["_"+key]=true;white();if(text.charAt(at++)!==":")bad("ame_source_hash_stdout_invalid");white();c=text.charAt(at);
    if(c==='"')value=string();else{token=text.substring(at).match(/^(?:true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/);if(!token)bad("ame_source_hash_stdout_invalid");token=token[0];at+=token.length;value=token==="true"?true:token==="false"?false:token==="null"?null:Number(token);if(typeof value==="number"&&!isFinite(value))bad("ame_source_hash_stdout_invalid");}result[key]=value;white();if(text.charAt(at)==="}")break;if(text.charAt(at++)!==",")bad("ame_source_hash_stdout_invalid");white();if(text.charAt(at)==="}")bad("ame_source_hash_stdout_invalid");
  }
  if(text.charAt(at++)!=="}")bad("ame_source_hash_stdout_invalid");white();if(at!==text.length)bad("ame_source_hash_stdout_invalid");
  if(result.schema!=="ae-agent-ame-source-hash-worker.v1"||result.nonce!==q.nonce||result.requestSha25664!==q.requestSha25664)bad("ame_source_hash_response_binding_changed");if(result.ok!==true)bad("ame_source_hash_worker_refused");
  var required=["schema","ok","nonce","requestSha25664","runtimeSha25664","path","sha25664","bytes","mtimeMsText","ctimeMsText","device","inode","parentsSha25664","mtimeSeconds"],count=0,k;
  for(k in result)if(Object.prototype.hasOwnProperty.call(result,k))count++;if(count!==required.length)bad("ame_source_hash_stdout_invalid");for(i=0;i<required.length;i++)if(!Object.prototype.hasOwnProperty.call(result,required[i]))bad("ame_source_hash_stdout_invalid");
  if(result.runtimeSha25664!==q.runtimeSha25664||result.path!==q.filePath||!/^[a-f0-9]{64}$/.test(result.sha25664)||!/^[a-f0-9]{64}$/.test(result.parentsSha25664)||typeof result.bytes!=="number"||result.bytes<0||result.bytes>67108864||result.bytes!==Math.floor(result.bytes)||typeof result.mtimeMsText!=="string"||typeof result.ctimeMsText!=="string"||typeof result.device!=="string"||typeof result.inode!=="string"||typeof result.mtimeSeconds!=="number")bad("ame_source_hash_response_binding_changed");
  sourceRuntimeCheck(q.runtime);result.elapsedMs=new Date().getTime()-started;if(new Date().getTime()>=q.deadline||result.elapsedMs>40000)bad("ame_source_hash_budget");return result;
}
module.exports={MAX_BYTES,PROBE_MS,MAX_COMMAND,SCHEMA,WORKER,BLOCKED_ENV,captureRuntime,assertRuntime,buildRequest,assertRequest,sameFile,nativeRuntimeCheck,nativeHash};
