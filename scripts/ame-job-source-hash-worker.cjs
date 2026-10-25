"use strict";
// Standalone read-only worker: builtins only, no project/runtime imports.
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const SCHEMA="ae-agent-ame-source-hash-worker.v1",MAX_BYTES=67108864,BUDGET_MS=40000;
const BLOCKED_ENV=["NODE_OPTIONS","NODE_PATH","NODE_V8_COVERAGE","NODE_COMPILE_CACHE","NODE_REDIRECT_WARNINGS","NODE_EXTRA_CA_CERTS","NODE_ICU_DATA","NODE_CHANNEL_FD","NODE_CHANNEL_SERIALIZATION_MODE","NODE_UNIQUE_ID","OPENSSL_CONF","OPENSSL_MODULES","SSL_CERT_FILE","SSL_CERT_DIR","ICU_DATA","UV_THREADPOOL_SIZE"];
const sha=v=>crypto.createHash("sha256").update(v).digest("hex"),canonical=v=>JSON.stringify(normalize(v));
function normalize(v){if(Array.isArray(v))return v.map(normalize);if(v&&typeof v==="object")return Object.fromEntries(Object.keys(v).sort().map(k=>[k,normalize(v[k])]));return v;}
function bad(code){throw Object.assign(Error(code),{code});}
function exact(v,keys){if(!v||typeof v!=="object"||Array.isArray(v)||Object.keys(v).length!==keys.length||keys.some(k=>!Object.hasOwn(v,k)))bad("worker_contract_invalid");}
function local(v){if(typeof v!=="string"||!v||v!==v.trim()||v.length>4096||/[\x00-\x1f]/.test(v)||!path.isAbsolute(v)||/^(\\\\|\/\/)/.test(v)||v.replace(/\\/g,"/").split("/").some(p=>p==="."||p==="..")||process.platform==="win32"&&/:/.test(v.slice(2)))bad("worker_local_path_required");return path.resolve(v);}
const same=(a,b)=>String(a).replace(/\\/g,"/").toLowerCase()===String(b).replace(/\\/g,"/").toLowerCase();
async function parents(file){const result=[];for(let p=path.dirname(file);;p=path.dirname(p)){const s=await fs.promises.lstat(p);if(!s.isDirectory()||s.isSymbolicLink()||!same(await fs.promises.realpath(p),p))bad("worker_directory_alias");result.push({path:p,device:String(s.dev),inode:String(s.ino)});if(path.dirname(p)===p)return result;}}
function metadata(s){return {bytes:s.size,mtimeMs:s.mtimeMs,ctimeMs:s.ctimeMs,device:String(s.dev),inode:String(s.ino)};}
function precise(s){return canonical({size:String(s.size),dev:String(s.dev),ino:String(s.ino),nlink:String(s.nlink),mtimeNs:String(s.mtimeNs),ctimeNs:String(s.ctimeNs),birthtimeNs:String(s.birthtimeNs)});}
function regular(s){if(!s.isFile()||s.isSymbolicLink()||s.nlink!==1||s.ino===0)bad("worker_file_identity_invalid");}
async function fileHash(file,limit,clock){
  file=local(file);clock();const directoryPins=await parents(file),before=await fs.promises.lstat(file),beforePrecise=precise(await fs.promises.lstat(file,{bigint:true}));regular(before);
  if(before.size<0||before.size>limit||!same(await fs.promises.realpath(file),file))bad("worker_file_bound_or_alias");
  const handle=await fs.promises.open(file,"r");
  try{
    const held=await handle.stat();regular(held);if(canonical(metadata(held))!==canonical(metadata(before))||precise(await handle.stat({bigint:true}))!==beforePrecise)bad("worker_file_changed");
    const digest=crypto.createHash("sha256"),buffer=Buffer.alloc(65536);let bytes=0;
    while(bytes<before.size){clock();const wanted=Math.min(buffer.length,before.size-bytes),read=await handle.read(buffer,0,wanted,bytes);if(read.bytesRead!==wanted)bad("worker_short_read");digest.update(buffer.subarray(0,read.bytesRead));bytes+=read.bytesRead;}
    clock();if((await handle.read(buffer,0,1,bytes)).bytesRead!==0)bad("worker_eof_changed");
    const afterHeld=await handle.stat(),after=await fs.promises.lstat(file);regular(afterHeld);regular(after);
    if(canonical(metadata(before))!==canonical(metadata(afterHeld))||canonical(metadata(afterHeld))!==canonical(metadata(after))||precise(await handle.stat({bigint:true}))!==beforePrecise||precise(await fs.promises.lstat(file,{bigint:true}))!==beforePrecise||!same(await fs.promises.realpath(file),file)||canonical(directoryPins)!==canonical(await parents(file)))bad("worker_file_changed");
    clock();return {path:file,...metadata(after),sha25664:digest.digest("hex"),parentsSha25664:sha(canonical(directoryPins))};
  }finally{await handle.close();}
}
let request=null,done=false,watchdog=null;
function finish(ok,value){if(done)return;done=true;clearTimeout(watchdog);let exitCode=ok?0:1;const data={schema:SCHEMA,ok,nonce:request?.nonce||null,requestSha25664:request?.requestSha25664||null,...value};let line=JSON.stringify(data).replace(/[\u007f-\uffff]/g,c=>"\\u"+c.charCodeAt(0).toString(16).padStart(4,"0"))+"\n";if(Buffer.byteLength(line)>4096){exitCode=1;line=JSON.stringify({schema:SCHEMA,ok:false,nonce:request?.nonce||null,requestSha25664:request?.requestSha25664||null,code:"worker_stdout_bound"})+"\n";}process.stdout.write(line,()=>process.exit(exitCode));}
(async()=>{
  if(process.argv.length!==3||process.execArgv.length!==0||BLOCKED_ENV.some(k=>process.env[k]!==undefined&&process.env[k]!==""))bad("worker_environment_or_argv_refused");
  const arg=process.argv[2];if(typeof arg!=="string"||arg.length>7900||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(arg))bad("worker_argument_invalid");
  const raw=Buffer.from(arg,"base64");if(raw.toString("base64")!==arg)bad("worker_argument_invalid");request=JSON.parse(raw.toString("utf8"));
  exact(request,["schema","nonce","filePath","deadline","maxBytes","runtime","requestSha25664"]);
  const {requestSha25664,...facts}=request;
  if(canonical(request)!==raw.toString("utf8")||request.schema!==SCHEMA||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(request.nonce||"")||!/^[a-f0-9]{64}$/.test(requestSha25664||"")||sha(canonical(facts))!==requestSha25664||request.maxBytes!==MAX_BYTES||!Number.isSafeInteger(request.deadline))bad("worker_request_binding_invalid");
  const deadline=Math.min(request.deadline,Date.now()+BUDGET_MS),clock=()=>{if(Date.now()>=deadline)bad("worker_deadline");};clock();
  watchdog=setTimeout(()=>finish(false,{code:"worker_deadline"}),Math.max(1,deadline-Date.now()));
  exact(request.runtime,["executable","worker"]);
  if(!same(local(process.execPath),request.runtime.executable?.path)||!same(local(process.argv[1]),request.runtime.worker?.path))bad("worker_runtime_path_changed");
  for(const key of ["executable","worker"]){const pin=request.runtime[key];exact(pin,["path","sha25664","bytes","mtimeMs","ctimeMs","device","inode","parentsSha25664"]);const current=await fileHash(pin.path,key==="executable"?134217728:1048576,clock);if(canonical(current)!==canonical(pin))bad("worker_runtime_pin_changed");}
  const file=await fileHash(request.filePath,MAX_BYTES,clock);clock();const {mtimeMs,ctimeMs,...portable}=file;
  finish(true,{runtimeSha25664:sha(canonical(request.runtime)),...portable,mtimeMsText:String(mtimeMs),ctimeMsText:String(ctimeMs),mtimeSeconds:Math.floor(mtimeMs/1000)});
})().catch(error=>finish(false,{code:typeof error.code==="string"&&/^[a-zA-Z0-9_]+$/.test(error.code)?error.code:"worker_hash_failed"}));
