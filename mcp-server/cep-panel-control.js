"use strict";

// Fixed named CEP service. No bootstrap, arbitrary expression, native or provider lane.
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto"),http=require("node:http");
const contract=require("../cep-panel/panel-action-contract");
const bootstrap=require("./ae-agent-panel-bootstrap");
const PROTOCOL_VERSION=contract.PROTOCOL_VERSION, DEFAULT_CDP_PORT=8870, DEFAULT_TIMEOUT_MS=30000;
const DEFAULT_STATE_DIR=path.resolve(__dirname,"../logs/cep-panel-control");
const STORE_VERSION="ae-agent.cep-panel-transport.v1", STATES=/^(accepted|running|completed|error|rejected|unknown)$/;
// Retired identity accepted only from persisted history, never by the callable catalog.
const HISTORICAL_RECEIPT_ACTION="recovery.bootstrap";
const TERMINAL=/^(completed|error|rejected)$/, UUID=contract.UUID_REGEX, MAX_BYTES=1024*1024, MAX_IDENTITIES=1000;
const PANEL_CONTROL_TOOL_NAMES=new Set(["list_panel_actions","get_panel_state","invoke_panel_action","get_panel_action_result"]);
const isPanelControlTool=name=>PANEL_CONTROL_TOOL_NAMES.has(name);
const emptySchema={type:"object",additionalProperties:false,properties:{}};
const invokeSchema={type:"object",additionalProperties:false,required:["requestId","action","args"],properties:{
  protocolVersion:{type:"string",enum:[PROTOCOL_VERSION]},requestId:{type:"string",pattern:UUID.source},
  action:{type:"string",enum:contract.ACTION_CATALOG.map(row=>row.name)},args:{type:"object"},
  expectedState:{type:"object",additionalProperties:false,properties:{panelInstanceId:{type:"string"},panelLifecycleEpoch:{type:"integer",minimum:0},panelGeneration:{type:"string"}}},
  wait:{type:"boolean"},timeoutMs:{type:"integer",minimum:1,maximum:60000}
}};
invokeSchema.oneOf=contract.ACTION_CATALOG.map(def=>({properties:{action:{enum:[def.name]},args:def.schema},required:["action","args"]}));
const panelControlTools=Object.freeze([
  ["list_panel_actions","Read the fixed CEP action catalog and availability.",emptySchema,true],
  ["get_panel_state","Read redacted CEP state; no native connectivity proof.",emptySchema,true],
  ["invoke_panel_action","Invoke a named CEP action with durable request identity and existing panel gates.",invokeSchema,false],
  ["get_panel_action_result","Passively read the same request result; never resend.",{type:"object",additionalProperties:false,required:["requestId"],properties:{requestId:{type:"string",pattern:UUID.source}}},true]
].map(([name,description,inputSchema,readOnlyHint])=>Object.freeze({name,description,inputSchema,annotations:{
  readOnlyHint,destructiveHint:!readOnlyHint,idempotentHint:readOnlyHint,openWorldHint:!readOnlyHint
}})));
function problem(code) {return Object.assign(new Error(code),{code});}
function plain(value) {return !!value && typeof value==="object" && !Array.isArray(value) && [null,Object.prototype].includes(Object.getPrototypeOf(value));}
function exact(value,keys) {
  if(!plain(value) || Object.getOwnPropertySymbols(value).length) throw problem("invalid_arguments");
  for(const key of Object.getOwnPropertyNames(value)) {
    if(!keys.includes(key) || ["__proto__","constructor","prototype"].includes(key)) throw problem("unexpected_argument");
    if(!Object.hasOwn(Object.getOwnPropertyDescriptor(value,key),"value")) throw problem("accessor_forbidden");
  }
}
function timeout(value,fallback=DEFAULT_TIMEOUT_MS) {
  if(value===undefined) return fallback;
  if(!Number.isInteger(value) || value<1 || value>60000) throw problem("invalid_timeout");
  return value;
}
function requestId(value) {if(typeof value!=="string" || !UUID.test(value) || value!==value.toLowerCase()) throw problem("invalid_request_id");return value;}
function validateRawInvokeInput(raw,options={}) {
  exact(raw,["protocolVersion","requestId","action","args","expectedState","timeoutMs","wait"]);exact(options,["timeoutMs","wait"]);
  requestId(raw.requestId);
  const envelope={protocolVersion:raw.protocolVersion===undefined?PROTOCOL_VERSION:raw.protocolVersion,requestId:raw.requestId,action:raw.action,args:raw.args};
  if(Object.hasOwn(raw,"expectedState")) envelope.expectedState=raw.expectedState;
  const checked=contract.validateEnvelope(envelope);if(!checked.ok) throw problem(checked.code);
  for(const input of [raw,options]) {timeout(input.timeoutMs);if(Object.hasOwn(input,"wait") && typeof input.wait!=="boolean") throw problem("invalid_wait");}
  if(raw.wait!==undefined && options.wait!==undefined && raw.wait!==options.wait ||
     raw.timeoutMs!==undefined && options.timeoutMs!==undefined && raw.timeoutMs!==options.timeoutMs) throw problem("conflicting_options");
  return {envelope,wait:raw.wait ?? options.wait ?? false,timeoutMs:timeout(raw.timeoutMs ?? options.timeoutMs)};
}
function computeActionSignature(envelope) {
  const checked=contract.validateEnvelope(envelope);if(!checked.ok) throw problem(checked.code);
  function canonical(value,schema) {
    if(schema && schema.writeOnly) return "[WRITE_ONLY_PRESENT]";
    if(!value || typeof value!=="object") return contract.redactState({value}).value;
    const out={};for(const key of Object.keys(value).sort()) out[key]=canonical(value[key],schema?.properties?.[key]);return out;
  }
  return crypto.createHash("sha256").update(JSON.stringify({action:envelope.action,args:canonical(envelope.args,checked.actionDef.schema),expectedState:envelope.expectedState || {}})).digest("hex");
}
function safeRoot(directory,create=false) {
  const root=path.resolve(directory);let item=root;
  while(true) {
    if(fs.existsSync(item) && fs.lstatSync(item).isSymbolicLink()) throw problem("receipt_path_redirected");
    const parent=path.dirname(item);if(parent===item) break;item=parent;
  }
  if(create) fs.mkdirSync(root,{recursive:true});
  if(fs.existsSync(root) && (!fs.lstatSync(root).isDirectory() || fs.realpathSync(root).toLowerCase()!==root.toLowerCase())) throw problem("receipt_path_redirected");
  return root;
}
function regular(file) {
  const stat=fs.lstatSync(file);
  if(!stat.isFile() || stat.isSymbolicLink() || stat.nlink>1 || stat.size>MAX_BYTES) throw problem("receipt_file_invalid");
  return stat;
}
function boundedRead(file) {regular(file);return fs.readFileSync(file,"utf8");}
function atomicWrite(root,file,value) {
  const serialized=JSON.stringify(value);if(Buffer.byteLength(serialized)>MAX_BYTES)throw problem("receipt_too_large");
  safeRoot(root,true);if(fs.existsSync(file)) regular(file);
  const tmp=path.join(root,"write-"+crypto.randomUUID()+".tmp");let fd;
  try {
    fd=fs.openSync(tmp,"wx",0o600);fs.writeFileSync(fd,serialized,"utf8");fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;
    safeRoot(root);if(fs.existsSync(file)) regular(file);fs.renameSync(tmp,file);
    // Windows has no directory fsync; every file is flushed before atomic rename.
    if(process.platform!=="win32") {const dir=fs.openSync(root,"r");try{fs.fsyncSync(dir);}finally{fs.closeSync(dir);}}
  } finally {if(fd!==undefined) fs.closeSync(fd);if(fs.existsSync(tmp)) fs.unlinkSync(tmp);}
}
function createReceiptPath(directory,id) {requestId(id);return path.join(safeRoot(directory),id+".json");}
function unknown(id,code,identity={}) {return {protocolVersion:PROTOCOL_VERSION,requestId:id,action:identity.action || "unknown",
  signature:identity.signature,state:"unknown",phase:"receipt_storage",code,delivery:"unknown",replayAllowed:false,...(identity.binding?{binding:identity.binding}:{})};}
function readIndex(directory,create=false) {
  const root=safeRoot(directory,create),file=path.join(root,"identities.json"),marker=path.join(root,"initialized.json");
  if(!fs.existsSync(root)) return {root,identities:{}};
  if(!fs.existsSync(file)) {
    if(fs.existsSync(marker) || fs.readdirSync(root).some(name=>UUID.test(name.replace(/\.json$/,"")))) throw problem("receipt_index_missing");
    if(create) {atomicWrite(root,marker,{schema:STORE_VERSION});atomicWrite(root,file,{schema:STORE_VERSION,identities:{}});}
    return {root,identities:{}};
  }
  let data;try {data=JSON.parse(boundedRead(file));}catch(_) {throw problem("receipt_index_corrupt");}
  if(!plain(data) || data.schema!==STORE_VERSION || !plain(data.identities) || Object.keys(data.identities).length>MAX_IDENTITIES) throw problem("receipt_index_corrupt");
  for(const [id,row] of Object.entries(data.identities)) {
    requestId(id);if(!plain(row) || typeof row.action!=="string" ||
      !contract.getActionDefinition(row.action) && row.action!==HISTORICAL_RECEIPT_ACTION ||
      typeof row.signature!=="string" || !/^[a-f0-9]{64}$/.test(row.signature) ||
      Object.hasOwn(row,"binding") && !validBinding(row.binding)) throw problem("receipt_index_corrupt");
  }
  for(const name of fs.readdirSync(root)) if(UUID.test(name.replace(/\.json$/,"")) && !data.identities[name.slice(0,-5)]) throw problem("unindexed_receipt");
  return {root,identities:data.identities};
}
function validBinding(value) {return plain(value) && typeof value.panelInstanceId==="string" && value.panelInstanceId.length>0 &&
  Number.isInteger(value.panelLifecycleEpoch) && value.panelLifecycleEpoch>=0 && typeof value.panelGeneration==="string" && value.panelGeneration.length>0;}
function validateStored(row,id,identity) {
  if(!plain(row) || row.protocolVersion!==PROTOCOL_VERSION || row.requestId!==id || row.action!==identity.action ||
     row.signature!==identity.signature || !STATES.test(row.state) || row.replayAllowed!==false ||
     !["not_submitted","submitted","delivered","unknown"].includes(row.delivery) || row.binding && !validBinding(row.binding) ||
     JSON.stringify(row.binding)!==JSON.stringify(identity.binding)) throw problem("receipt_corrupt");
}
function loadDurableReceipt(directory,id) {
  requestId(id);let index;try{index=readIndex(directory);}catch(error){return unknown(id,error.code || "receipt_index_corrupt");}
  const identity=index.identities[id],file=createReceiptPath(directory,id);if(!identity) return null;
  if(!fs.existsSync(file)) return unknown(id,"receipt_record_missing",identity);
  try {const row=JSON.parse(boundedRead(file));validateStored(row,id,identity);return row;}catch(_) {return unknown(id,"receipt_corrupt",identity);}
}
function saveDurableReceipt(directory,row) {
  requestId(row?.requestId);const index=readIndex(directory,true),id=row.requestId;
  if(!contract.getActionDefinition(row.action) || !/^[a-f0-9]{64}$/.test(row.signature || "")) throw problem("receipt_identity_invalid");
  const previous=index.identities[id];
  if(previous && (previous.action!==row.action || previous.signature!==row.signature)) throw problem("receipt_identity_conflict");
  if(!previous && Object.keys(index.identities).length>=MAX_IDENTITIES) throw problem("receipt_capacity_exceeded");
  const identity={action:row.action,signature:row.signature,...(row.binding?{binding:row.binding}:{})};validateStored(row,id,identity);
  const stored={...contract.sanitizeReceipt(row),signature:row.signature};
  // Reserve identity first: a missing record after a crash is unknown, never absent.
  atomicWrite(index.root,path.join(index.root,"identities.json"),{schema:STORE_VERSION,identities:{...index.identities,[id]:identity}});
  atomicWrite(index.root,createReceiptPath(index.root,id),stored);
}
function readLock(directory) {
  const file=path.join(safeRoot(directory),"controller.lock");if(!fs.existsSync(file)) return null;
  try {const row=JSON.parse(boundedRead(file));if(!plain(row) || !Number.isInteger(row.pid) || row.pid<1 || !UUID.test(row.requestId || "") || !UUID.test(row.token || "")) throw problem("transport_lock_corrupt");return row;}
  catch(_) {throw problem("transport_lock_corrupt");}
}
function acquireControllerLock(directory,id) {
  requestId(id);const root=safeRoot(directory,true),file=path.join(root,"controller.lock"),owner={pid:process.pid,requestId:id,token:crypto.randomUUID()};let fd;
  try {fd=fs.openSync(file,"wx",0o600);fs.writeFileSync(fd,JSON.stringify(owner));fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;}
  catch(error) {if(fd!==undefined) fs.closeSync(fd);throw problem(error.code==="EEXIST"?"transport_busy":"transport_lock_failed");}
  return {owner,release() {const current=readLock(root);if(current && current.token===owner.token && current.pid===owner.pid && current.requestId===id) fs.unlinkSync(file);}};
}
function deadProcess(pid) {try{process.kill(pid,0);return false;}catch(error){return error.code==="ESRCH";}}
function remoteReceipt(value,id,expected={}) {
  if(!plain(value) || value.protocolVersion!==PROTOCOL_VERSION || value.requestId!==id || !contract.getActionDefinition(value.action) ||
     !STATES.test(value.state) || value.replayAllowed!==false || typeof value.phase!=="string" ||
     typeof value.panelInstanceId!=="string" || !Number.isInteger(value.epoch) || value.epoch<0 || typeof value.generation!=="string" ||
     expected.action && value.action!==expected.action) throw problem("remote_receipt_identity_mismatch");
  const binding=expected.binding;
  if(binding && (value.panelInstanceId!==binding.panelInstanceId || value.epoch!==binding.panelLifecycleEpoch || value.generation!==binding.panelGeneration)) throw problem("remote_receipt_binding_mismatch");
  return contract.sanitizeReceipt(value);
}
function remoteState(value) {
  if(!plain(value) || value.protocolVersion!==PROTOCOL_VERSION || !validBinding(value)) throw problem("panel_state_invalid");return contract.redactState(value);
}
function remoteCatalog(value) {
  if(!Array.isArray(value) || value.length!==contract.ACTION_CATALOG.length || new Set(value.map(row=>row?.name)).size!==value.length) throw problem("panel_catalog_invalid");
  for(const row of value) {const def=contract.getActionDefinition(row?.name);if(!def || row.effect!==def.effect || JSON.stringify(row.schema)!==JSON.stringify(def.schema) ||
    !plain(row.availability) || typeof row.availability.available!=="boolean" || !Array.isArray(row.availability.reasonCodes)) throw problem("panel_catalog_invalid");}
  return contract.redactState(value);
}
function fetchCdpTargets(port=DEFAULT_CDP_PORT,timeoutMs=2000) {
  return new Promise((resolve,reject)=>{
    let ended=false;const finish=(error,value)=>{if(ended)return;ended=true;clearTimeout(timer);error?reject(problem(error.code || "cdp_unavailable")):resolve(value);};
    const req=http.get({host:"127.0.0.1",port,path:"/json/list"},res=>{
      let bytes=0,chunks=[];res.on("data",chunk=>{bytes+=chunk.length;if(bytes>256*1024){req.destroy(problem("cdp_inventory_too_large"));return;}chunks.push(chunk);});
      res.on("error",error=>finish(error));
      res.on("end",()=>{try{if(res.statusCode!==200)throw problem("cdp_unavailable");const rows=JSON.parse(Buffer.concat(chunks).toString("utf8"));if(!Array.isArray(rows))throw problem("cdp_inventory_invalid");finish(null,rows);}catch(error){finish(error);}});
    });
    const timer=setTimeout(()=>req.destroy(problem("cdp_timeout")),timeout(timeoutMs,2000));req.on("error",error=>finish(error));
  });
}
function evaluateViaWebSocket(wsUrl,expression,timeoutMs,WebSocketCtor=global.WebSocket) {
  if(typeof WebSocketCtor!=="function") return Promise.reject(problem("cdp_runtime_unsupported"));
  return new Promise((resolve,reject)=>{
    let socket,settled=false;
    const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);if(socket){socket.onopen=socket.onclose=socket.onmessage=socket.onerror=null;try{socket.close();}catch(_){}}error?reject(error):resolve(value);};
    const timer=setTimeout(()=>finish(problem("cdp_timeout")),timeout(timeoutMs));
    try {
      socket=new WebSocketCtor(wsUrl);
      socket.onopen=()=>{try{socket.send(JSON.stringify({id:1,method:"Runtime.evaluate",params:{expression,returnByValue:true,awaitPromise:false}}));}catch(_){finish(problem("cdp_send_failed"));}};
      socket.onclose=()=>finish(problem("cdp_socket_closed"));socket.onerror=()=>finish(problem("cdp_transport_error"));
      socket.onmessage=event=>{try {
        if(typeof event.data!=="string" || Buffer.byteLength(event.data)>MAX_BYTES)throw problem("cdp_response_invalid");
        const msg=JSON.parse(event.data);if(msg.id!==1)return;
        if(msg.error || msg.result?.exceptionDetails)throw problem("cdp_evaluate_exception");
        if(!msg.result?.result || !Object.hasOwn(msg.result.result,"value"))throw problem("cdp_response_malformed");
        finish(null,msg.result.result.value);
      }catch(error){finish(problem(error.code || "cdp_response_invalid"));}};
    }catch(_){finish(problem("cdp_connect_failed"));}
  });
}
function fixedExpression(method,args,binding) {
  if(!["catalog","state","invoke","getResult"].includes(method)) throw problem("method_forbidden");
  const guard=binding ? "var current=api.state();if(current.panelInstanceId!=="+JSON.stringify(binding.panelInstanceId)+
    "||current.panelLifecycleEpoch!=="+JSON.stringify(binding.panelLifecycleEpoch)+"||current.panelGeneration!=="+JSON.stringify(binding.panelGeneration)+")return {ok:false,code:\"panel_binding_changed\"};":"";
  return "(function(){var api=window.AEAgentPanelActions;if(!api||api.protocolVersion!=="+JSON.stringify(PROTOCOL_VERSION)+
    "||typeof api."+method+"!==\"function\")return {ok:false,code:\"panel_actions_unavailable\"};"+guard+
    "return {ok:true,value:api."+method+"("+(args===undefined?"":JSON.stringify(args))+")};})()";
}
function responseError(error,receipt) {return {ok:false,protocolVersion:PROTOCOL_VERSION,code:error.code || "panel_control_failed",
  error:error.code || "Panel control failed.",...(receipt?{receipt:contract.sanitizeReceipt(receipt)}:{})};}
function responseReceipt(row) {return {ok:!["unknown","error","rejected"].includes(row.state),protocolVersion:PROTOCOL_VERSION,
  receipt:contract.sanitizeReceipt(row),replayed:false};}
const PASSIVE_ACTIONS=new Set(["logs.get","chat.sessions.list","chat.transcript.get","plan.current","autonomy.refresh","placeholder.refresh","connector.refresh"]);
function createPanelControlService(options={}) {
  // Private Node fixture seams; none are accepted by CLI/MCP or environment settings.
  exact(options,["stateDir","cdpPort","inspectInstalledTarget","fetchCdpTargets","evaluateViaCdp","WebSocket","persistReceipt"]);
  if(options.cdpPort!==undefined && options.cdpPort!==DEFAULT_CDP_PORT) throw problem("fixed_cdp_port_required");
  const directory=path.resolve(options.stateDir || DEFAULT_STATE_DIR);
  const inspect=options.inspectInstalledTarget || bootstrap.inspectInstalledTarget,fetchTargets=options.fetchCdpTargets || fetchCdpTargets;
  const evaluate=options.evaluateViaCdp || evaluateViaWebSocket,persist=options.persistReceipt || saveDurableReceipt;
  async function resolveTarget(budget) {
    const installed=inspect(),pages=await fetchTargets(DEFAULT_CDP_PORT,budget),target=bootstrap.exactCdpTarget(pages,installed);
    if(!target)throw problem("cdp_target_missing");return {installed,target};
  }
  async function methodAt(target,method,args,budget,binding) {
    const value=await evaluate(target.webSocketDebuggerUrl,fixedExpression(method,args,binding),budget,options.WebSocket);
    if(!plain(value) || value.ok!==true || !Object.hasOwn(value,"value")) throw problem("panel_response_invalid");return value.value;
  }
  async function read(method,args,budget) {const {target}=await resolveTarget(budget);return methodAt(target,method,args,budget);}
  async function catalog(timeoutMs=5000) {try {const budget=timeout(timeoutMs,5000);return {ok:true,protocolVersion:PROTOCOL_VERSION,
    actions:remoteCatalog(await read("catalog",undefined,budget))};}catch(error){return responseError(error);}}
  async function state(args={},timeoutMs=5000) {try {exact(args,[]);const budget=timeout(timeoutMs,5000);return {ok:true,
    state:remoteState(await read("state",args,budget))};}catch(error){return responseError(error);}}
  async function getResult(id,timeoutMs=5000) {
    let local;
    try {
      requestId(id);const budget=timeout(timeoutMs,5000);local=loadDurableReceipt(directory,id);
      if(local && !local.signature) return responseError(problem(local.code),local);
      const remote=await read("getResult",id,budget);
      if(remote===null) return local?responseReceipt(local):responseError(problem("receipt_not_found"));
      const verified=remoteReceipt(remote,id,local || {});
      if(local) {
        const updated={...local,...verified,signature:local.signature,delivery:"delivered"};let lock;
        try {
          const owner=readLock(directory);
          if(owner && owner.requestId===id && deadProcess(owner.pid) && TERMINAL.test(verified.state)) {
            // Exact request terminal evidence retires an orphan; never take over a live owner.
            persist(directory,updated);
            if(readLock(directory)?.token===owner.token && deadProcess(owner.pid)) fs.unlinkSync(path.join(directory,"controller.lock"));
          } else {lock=acquireControllerLock(directory,id);persist(directory,updated);}
        }catch(error){if(error.code!=="transport_busy")return responseError(problem("receipt_persistence_failed"),
          {...updated,state:"unknown",delivery:"unknown",code:"receipt_persistence_failed"});}
        finally{if(lock)lock.release();}
        return responseReceipt(updated);
      }
      return responseReceipt(verified);
    }catch(error){return local?responseError(error,local):responseError(error);}
  }
  async function waitForResult(id,timeoutMs=DEFAULT_TIMEOUT_MS) {
    try {
      requestId(id);const budget=timeout(timeoutMs),deadline=Date.now()+budget;let latest;
      do {const value=await getResult(id,Math.max(1,Math.min(2000,deadline-Date.now())));latest=value.receipt || latest;
        if(!value.ok && value.code)return value;
        if(latest && /^(completed|error|rejected|unknown)$/.test(latest.state))return responseReceipt(latest);
        if(Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,Math.min(200,deadline-Date.now())));
      }while(Date.now()<deadline);
      return responseError(problem("wait_timeout"),latest);
    }catch(error){return responseError(error);}
  }
  async function invoke(raw,callOptions={}) {
    let input,record,claim,sent=false;
    try {
      input=validateRawInvokeInput(raw,callOptions);const envelope=input.envelope,id=envelope.requestId;
      for(const field of contract.getActionDefinition(envelope.action).writeOnly || []) contract.rememberSecret(envelope.args[field]);
      const signature=computeActionSignature(envelope);
      const existing=loadDurableReceipt(directory,id);
      if(existing) {
        if(!existing.signature)return responseError(problem(existing.code),existing);
        if(existing.action!==envelope.action || existing.signature!==signature)return responseError(problem("duplicate_request_id_conflict"),existing);
        return responseReceipt(existing);
      }
      claim=acquireControllerLock(directory,id);
      const index=readIndex(directory,true),second=loadDurableReceipt(directory,id);
      if(second)return second.signature===signature?responseReceipt(second):responseError(problem("duplicate_request_id_conflict"),second);
      const unresolved=[];
      for(const previous of Object.keys(index.identities)) {
        const prior=loadDurableReceipt(directory,previous);
        const storageUnproven=prior && (prior.phase==="receipt_storage" || /^(receipt_|unindexed_)/.test(prior.code || ""));
        if(!prior || /^(accepted|running|unknown)$/.test(prior.state) &&
           (storageUnproven || !PASSIVE_ACTIONS.has(prior.action))) unresolved.push(prior);
      }
      if(unresolved.length && !PASSIVE_ACTIONS.has(envelope.action) && envelope.action!=="connector.emergencyDisable" &&
          !(envelope.action==="plan.reconcile" && unresolved.some(prior=>prior?.runId===envelope.args.runId))) throw problem("transport_reconciliation_required");
      record={protocolVersion:PROTOCOL_VERSION,requestId:id,action:envelope.action,signature,state:"accepted",phase:"admission",
        delivery:"not_submitted",acceptedAt:new Date().toISOString(),replayAllowed:false};persist(directory,record);
      const deadline=Date.now()+input.timeoutMs,budget=()=>{const left=deadline-Date.now();if(left<1)throw problem("cdp_timeout");return left;};
      const selected=await resolveTarget(budget()),current=remoteState(await methodAt(selected.target,"state",{},budget()));
      const binding={panelInstanceId:current.panelInstanceId,panelLifecycleEpoch:current.panelLifecycleEpoch,panelGeneration:current.panelGeneration};
      if(envelope.expectedState && Object.keys(envelope.expectedState).some(key=>envelope.expectedState[key]!==binding[key]))throw problem("expected_state_mismatch");
      const bound={...envelope,expectedState:binding},checked=await resolveTarget(budget());
      if(JSON.stringify(checked.installed)!==JSON.stringify(selected.installed) || checked.target.url!==selected.target.url ||
         checked.target.webSocketDebuggerUrl!==selected.target.webSocketDebuggerUrl)throw problem("panel_target_changed");
      record.binding=binding;record.panelInstanceId=binding.panelInstanceId;record.epoch=binding.panelLifecycleEpoch;record.generation=binding.panelGeneration;
      record.state="running";record.phase="submitted";record.delivery="submitted";persist(directory,record);sent=true;
      const value=await methodAt(checked.target,"invoke",bound,budget(),binding),verified=remoteReceipt(value,id,{action:envelope.action,binding});
      record={...record,...verified,signature,delivery:"delivered"};persist(directory,record);
    }catch(error) {
      if(record) {
        record={...record,state:sent?"unknown":"rejected",phase:sent?"delivery_unknown":"admission",code:error.code || "receipt_persistence_failed",
          delivery:sent?"unknown":"not_submitted",completedAt:new Date().toISOString(),replayAllowed:false};
        try{persist(directory,record);}catch(_){record.state=sent?"unknown":"rejected";record.phase="receipt_storage";
          record.code="receipt_persistence_failed";record.delivery=sent?"unknown":"not_submitted";}
      }
      return responseError(error,record);
    }finally {if(claim){try{claim.release();}catch(_){/* Existing lock remains fail closed. */}}}
    return input.wait ? waitForResult(record.requestId,input.timeoutMs) : responseReceipt(record);
  }
  async function handleTool(name,args={}) {
    try {
      if(name==="list_panel_actions"){exact(args,[]);return catalog();}
      if(name==="get_panel_state")return state(args);
      if(name==="invoke_panel_action")return invoke(args);
      if(name==="get_panel_action_result"){exact(args,["requestId"]);requestId(args.requestId);return getResult(args.requestId);}
      throw problem("unknown_tool");
    }catch(error){return responseError(error);}
  }
  return Object.freeze({catalog,state,invoke,getResult,waitForResult,handleTool});
}
module.exports={PROTOCOL_VERSION,DEFAULT_CDP_PORT,DEFAULT_STATE_DIR,PANEL_CONTROL_TOOL_NAMES,isPanelControlTool,panelControlTools,
  listPanelActionsTool:panelControlTools[0],getPanelStateTool:panelControlTools[1],invokePanelActionTool:panelControlTools[2],getPanelActionResultTool:panelControlTools[3],
  computeActionSignature,validateRawInvokeInput,fetchCdpTargets,evaluateViaWebSocket,createReceiptPath,loadDurableReceipt,saveDurableReceipt,acquireControllerLock,createPanelControlService};
