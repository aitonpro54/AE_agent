"use strict";

const inspector=require("node:inspector"),crypto=require("node:crypto"),{fileURLToPath}=require("node:url");
const native=require("./owned-runtime-initial-native-client");
const http=require("node:http"),FixedWebSocket=globalThis.WebSocket;
const observers=new WeakMap(),has=(value,key)=>Object.hasOwn(value,key);
const slots=Object.freeze({FILE_DEFAULT:"DEFAULT",NODE_DEFAULT:"DEFAULT",NODE_COMPILE_ZERO:"NONE",INTERNAL_THIS:"INTERNAL"});
function fail(code){throw Object.assign(Error(code),{code});}
function hash(bytes){return crypto.createHash("sha256").update(bytes).digest("hex");}
function exactKeys(value,keys){return value!==null&&typeof value==="object"&&!Array.isArray(value)&&Reflect.ownKeys(value).length===keys.length&&keys.every(key=>has(value,key));}
function integer(value){return Number.isSafeInteger(value)&&value>=0;}
function text(value,maximum){return typeof value==="string"&&value.length>0&&value.length<=maximum&&!value.includes("\0");}
function post(session,method,params){return new Promise((resolve,reject)=>session.post(method,params,(error,value)=>error?reject(error):resolve(value)));}
function canonicalUrl(url){
  if(!text(url,32760))fail("owned_initial_loaded_script_url_refused");
  if(/^node:[A-Za-z0-9_/-]+$/.test(url)||url==="evalmachine.<anonymous>")return url;
  const value=url.startsWith("file://")?fileURLToPath(url):url;
  if(!/^(?:[a-z]:[\\/]|\\\\\?\\Volume\{)/i.test(value))fail("owned_initial_loaded_script_locator_refused");
  return value.replaceAll("/","\\").toLowerCase();
}
function aux(value,isDefault){return exactKeys(value,["isDefault"])&&value.isDefault===isDefault;}
function contextSlot(context){
  if(!exactKeys(context,["id","uniqueId","origin","name","auxData"])||!integer(context.id)||context.id===0||!text(context.uniqueId,256)||
    context.origin!==""||typeof context.name!=="string")fail("owned_initial_loaded_context_metadata_refused");
  if(aux(context.auxData,true))return "DEFAULT";
  if(context.name==="internal"&&aux(context.auxData,false))return "INTERNAL";
  fail("owned_initial_loaded_context_category_refused");
}
function validateScript(info,item){
  const required=["scriptId","url","executionContextId","hasSourceURL","isModule","isLiveEdit","scriptLanguage","startLine","startColumn",
    "endLine","endColumn","length","hash","sourceMapURL","embedderName","stackTrace"];
  if(!info||required.some(key=>!has(info,key))||!text(info.scriptId,256)||Buffer.byteLength(info.scriptId,"utf8")>256||info.url!==item.url||!integer(info.executionContextId)||
    info.hasSourceURL!==false||info.isModule!==false||info.isLiveEdit!==false||info.scriptLanguage!=="JavaScript"||info.startLine!==0||info.startColumn!==0||
    info.endLine!==item.endLine||info.endColumn!==item.endColumn||info.length!==item.length||info.hash!==item.compiledSha256||info.sourceMapURL!==""||info.embedderName!==info.url)
    fail("owned_initial_loaded_script_metadata_refused");
  const zero=item.category==="NODE_COMPILE_ZERO";
  if(zero?(info.executionContextId!==0||has(info,"executionContextAuxData")):
    (info.executionContextId===0||!has(info,"executionContextAuxData")||!aux(info.executionContextAuxData,item.contextSlot==="DEFAULT")))
    fail("owned_initial_loaded_script_context_presence_refused");
  const stack=info.stackTrace;
  if(!exactKeys(stack,["callFrames"])||!Array.isArray(stack.callFrames)||stack.callFrames.length!==1)fail("owned_initial_loaded_initial_correlation_refused");
  const frame=stack.callFrames[0];
  if(!exactKeys(frame,["functionName","scriptId","url","lineNumber","columnNumber"])||frame.functionName!=="post"||!text(frame.scriptId,256)||
    frame.url!=="node:inspector"||frame.lineNumber!==138||frame.columnNumber!==21)fail("owned_initial_loaded_initial_correlation_refused");
}
async function bindLoadedNodeFixed(role){
  if(observers.has(role))fail("owned_initial_loaded_observer_once");native.assertCurrent(role);
  const inventory=native.nodeSourceInventory(role);
  if(!exactKeys(inventory,["rows","totalByteLength"])||!Array.isArray(inventory.rows)||!inventory.rows.length||!integer(inventory.totalByteLength)||!inventory.totalByteLength)
    fail("owned_initial_loaded_source_inventory_refused");
  const expected=new Map(),selectors=new Set(),requiredSlots=new Set();let expectedBytes=0;
  for(const item of inventory.rows){
    const key=canonicalUrl(item.url);
    if(expected.has(key)||!integer(item.selector)||item.selector<1||item.selector>65535||selectors.has(item.selector)||!has(slots,item.category)||item.contextSlot!==slots[item.category]||
      !/^[a-f0-9]{64}$/.test(item.compiledSha256)||![item.endLine,item.endColumn,item.length,item.utf8ByteLength].every(integer)||!item.utf8ByteLength||
      item.utf8ByteLength>inventory.totalByteLength-expectedBytes)fail("owned_initial_loaded_source_pin_refused");
    if((item.category.startsWith("NODE_")&&!item.url.startsWith("node:"))||(item.category==="FILE_DEFAULT"&&(item.url.startsWith("node:")||item.url==="evalmachine.<anonymous>"))||
      (item.category==="INTERNAL_THIS"&&(item.url!=="evalmachine.<anonymous>"||item.compiledSha256!==hash(Buffer.from("this"))||item.endLine!==0||item.endColumn!==4||item.length!==4||item.utf8ByteLength!==4)))
      fail("owned_initial_loaded_source_category_refused");
    expectedBytes+=item.utf8ByteLength;expected.set(key,item);selectors.add(item.selector);if(item.contextSlot!=="NONE")requiredSlots.add(item.contextSlot);
  }
  if(expectedBytes!==inventory.totalByteLength||!requiredSlots.has("DEFAULT")||!expected.has("node:inspector")||expected.get("node:inspector").category!=="NODE_DEFAULT")
    fail("owned_initial_loaded_source_sum_refused");
  const session=new inspector.Session(),scripts=new Map(),scriptIds=new Set(),contexts=new Map(),slotContexts=new Map();let unknown=false,generation=0,initializing=true;
  const invalidate=()=>{if(unknown)return;unknown=true;native.invalidateLoadedNodeProof(role);};
  const onParsed=message=>{try{
    const info=message.params,key=canonicalUrl(info.url),item=expected.get(key);
    if(!initializing||!item||scripts.has(key)||scripts.size>=expected.size||scriptIds.has(info.scriptId))fail("owned_initial_loaded_source_generation_unknown");
    validateScript(info,item);scripts.set(key,info);scriptIds.add(info.scriptId);generation++;
  }catch{invalidate();}};
  const onContextCreated=message=>{try{
    const context=message.params?.context,slot=contextSlot(context);
    if(!initializing||!requiredSlots.has(slot)||slotContexts.has(slot)||contexts.has(context.id)||[...contexts.values()].some(row=>row.uniqueId===context.uniqueId))
      fail("owned_initial_loaded_context_generation_unknown");
    contexts.set(context.id,context);slotContexts.set(slot,context);
  }catch{invalidate();}};
  const subscriptions=[["Debugger.scriptParsed",onParsed],["Debugger.scriptFailedToParse",invalidate],["Runtime.executionContextCreated",onContextCreated],
    ["Runtime.executionContextDestroyed",invalidate],["Runtime.executionContextsCleared",invalidate],["Debugger.globalObjectCleared",invalidate]];
  const state={generation:0,closed:false,assert(disposition=false){if(disposition)native.assertOriginalDispositionCurrent(role);else native.assertCurrent(role);if(this.closed||unknown||generation!==this.generation)fail("owned_initial_loaded_source_changed");},close(){
    if(this.closed)return;this.closed=true;invalidate();for(const[event,handler]of subscriptions)session.removeListener(event,handler);session.disconnect();}};
  observers.set(role,state);
  try{
    for(const[event,handler]of subscriptions)session.on(event,handler);session.connect();
    await post(session,"Runtime.enable",{});native.assertCurrent(role);if(unknown)fail("owned_initial_loaded_source_generation_unknown");
    await post(session,"Debugger.enable",{});native.assertCurrent(role);
    if(unknown||scripts.size!==expected.size||slotContexts.size!==requiredSlots.size)fail("owned_initial_loaded_source_closure_incomplete");
    const inspectorId=scripts.get("node:inspector")?.scriptId,records=[];let observedBytes=0;
    for(const[key,item]of expected){
      const info=scripts.get(key);if(!info||info.stackTrace.callFrames[0].scriptId!==inspectorId)fail("owned_initial_loaded_initial_correlation_refused");
      let context;
      if(item.contextSlot!=="NONE"){
        context=slotContexts.get(item.contextSlot);
        if(!context||!contexts.has(info.executionContextId)||context.id!==info.executionContextId)fail("owned_initial_loaded_source_context_refused");
      }
      const result=await post(session,"Debugger.getScriptSource",{scriptId:info.scriptId});native.assertCurrent(role);
      if(unknown||typeof result.scriptSource!=="string")fail("owned_initial_loaded_source_generation_unknown");
      const bytes=Buffer.from(result.scriptSource,"utf8");
      // Node24 compiled CJS bytes include the original BOM/shebang; no stripping.
      if(bytes.length!==item.utf8ByteLength||result.scriptSource.length!==item.length||bytes.length>inventory.totalByteLength-observedBytes||hash(bytes)!==item.compiledSha256)
        fail("owned_initial_loaded_source_bytes_changed");
      observedBytes+=bytes.length;
      const record={selector:item.selector,category:item.category,contextSlot:item.contextSlot,scriptId:info.scriptId,url:info.url,executionContextId:info.executionContextId,
        hasSourceURL:info.hasSourceURL,isModule:info.isModule,isLiveEdit:info.isLiveEdit,scriptLanguage:info.scriptLanguage,startLine:info.startLine,startColumn:info.startColumn,
        endLine:info.endLine,endColumn:info.endColumn,length:info.length,hash:info.hash,sourceMapURL:info.sourceMapURL,embedderName:info.embedderName,stackTrace:info.stackTrace,source:bytes};
      if(context){record.executionContextAuxData=info.executionContextAuxData;record.context=context;}
      records.push(record);
    }
    if(unknown||observedBytes!==inventory.totalByteLength)fail("owned_initial_loaded_source_generation_unknown");
    state.generation=generation;initializing=false;native.bindLoadedNodeProof(role,records);state.assert();
    return Object.freeze({assertCurrent:()=>state.assert(),assertOriginalDispositionCurrent:()=>state.assert(true),close:()=>state.close()});
  }catch(error){state.close();throw error;}
}
function assertLoadedNode(role){const state=observers.get(role);if(!state)fail("owned_initial_loaded_observer_missing");state.assert();}
// This declaration is an exact source row of its own. Challenge arguments are
// separate CDP arguments; no expression/sourceURL/function is caller supplied.
const CEP_STATE_DECLARATION=`function (challenge) {
  var descriptor = Object.getOwnPropertyDescriptor(window, "AEAgentPanelActions");
  if (!descriptor || descriptor.writable || descriptor.configurable || !descriptor.value || !Object.isFrozen(descriptor.value)) throw new Error("owned_cep_frozen_api_required");
  var api = descriptor.value;
  if (typeof api.state !== "function" || typeof api.catalog !== "function") throw new Error("owned_cep_fixed_getters_required");
  var before = api.state(), catalog = api.catalog(), after = api.state();
  return {challenge:challenge,protocolVersion:api.protocolVersion,before:before,catalog:catalog,after:after};
}`;
const cepObservers=new WeakMap();
async function bindLoadedCepFixed(role,target){
  if(cepObservers.has(role))fail("owned_initial_cep_observer_once");native.assertCapturedCurrent(role,target);
  const definition=native.cepSourceInventory(role,target);
  if(!definition||definition.diagnostic!==CEP_STATE_DECLARATION||!Array.isArray(definition.rows)||!definition.rows.length||!integer(definition.totalByteLength)||!definition.totalByteLength||definition.port!==8870)
    fail("owned_initial_cep_inventory_refused");
  const rows=new Map(),diagnostics=definition.rows.filter(row=>row.diagnostic===true);
  if(diagnostics.length!==1||diagnostics[0].compiledSha256!==hash(Buffer.from(CEP_STATE_DECLARATION)))fail("owned_initial_cep_diagnostic_inventory_refused");
  let budget=0;for(const row of definition.rows){if(!integer(row.selector)||!row.selector||rows.has(row.selector)||!integer(row.utf8ByteLength)||!row.utf8ByteLength||!text(row.compiledSha256,64)||budget>definition.totalByteLength-row.utf8ByteLength)fail("owned_initial_cep_inventory_refused");rows.set(row.selector,row);budget+=row.utf8ByteLength;}
  if(budget!==definition.totalByteLength)fail("owned_initial_cep_inventory_refused");
  let closed=false,unknown=false,socket=null,next=0,initializing=true,context=null,frame=null,page=null,pendingDiagnostic=false,diagnosticInfo=null;
  const commands=new Map(),scripts=new Map(),byId=new Set();
  function invalidate(){if(unknown)return;unknown=true;native.invalidateLoadedCepProof(role);for(const command of commands.values()){clearTimeout(command.timer);command.reject(Object.assign(Error("owned_initial_cep_source_unknown"),{code:"owned_initial_cep_source_unknown"}));}commands.clear();}
  function current(){native.assertCapturedCurrent(role,target);if(closed||unknown)fail("owned_initial_cep_source_unknown");}
  function command(method,params={}){current();const id=++next;if(!Number.isSafeInteger(id))fail("owned_initial_cep_command_ordinal_overflow");
    return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{invalidate();reject(Object.assign(Error("owned_initial_cep_command_timeout"),{code:"owned_initial_cep_command_timeout"}));},1000);
      commands.set(id,{resolve,reject,timer});try{socket.send(JSON.stringify({id,method,params}));}catch(error){clearTimeout(timer);commands.delete(id);invalidate();reject(error);}}).then(value=>{current();return value;});}
  const state={assertCurrent:current,close(){if(closed)return;closed=true;for(const item of commands.values()){clearTimeout(item.timer);item.reject(Error("owned_initial_cep_closed"));}commands.clear();if(socket)socket.close();}};
  cepObservers.set(role,state);
  try{
    const pages=await new Promise((resolve,reject)=>{current();let bytes=0;const chunks=[];const request=http.get({host:"127.0.0.1",port:definition.port,path:"/json/list",agent:false},response=>{
      response.on("data",chunk=>{bytes+=chunk.length;if(bytes>262144){request.destroy();reject(Error("owned_initial_cep_target_limit"));return;}chunks.push(chunk);});response.once("error",reject);response.once("end",()=>{try{current();if(!response.complete||response.statusCode!==200)fail("owned_initial_cep_target_reply_refused");resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));}catch(error){reject(error);}});});request.setTimeout(1000,()=>request.destroy(Error("owned_initial_cep_target_timeout")));request.once("error",reject);});
    current();if(!Array.isArray(pages))fail("owned_initial_cep_target_inventory_refused");const matches=pages.filter(item=>item.type==="page"&&item.url===definition.targetUrl);if(matches.length!==1)fail("owned_initial_cep_target_ambiguous");page=matches[0];
    if(!text(page.id,128)||!/^[a-zA-Z0-9_-]+$/.test(page.id)||page.webSocketDebuggerUrl!==`ws://127.0.0.1:${definition.port}/devtools/page/${page.id}`)fail("owned_initial_cep_endpoint_refused");
    socket=new FixedWebSocket(page.webSocketDebuggerUrl);socket.addEventListener("close",invalidate);socket.addEventListener("error",invalidate);
    socket.addEventListener("message",event=>{try{current();if(typeof event.data!=="string"||event.data.length>8*1024*1024)fail("owned_initial_cep_message_limit");const message=JSON.parse(event.data);
      if(has(message,"id")){const item=commands.get(message.id);if(!item)fail("owned_initial_cep_reply_correlation_refused");commands.delete(message.id);clearTimeout(item.timer);message.error?item.reject(Error("owned_initial_cep_method_unsupported")):item.resolve(message.result);return;}
      if(message.method==="Runtime.executionContextCreated"){const value=message.params?.context;if(!initializing||context||!value||!integer(value.id)||!value.id||!text(value.uniqueId,256)||value.origin!==definition.origin||value.auxData?.isDefault!==true||value.auxData.type!=="default"||!text(value.auxData.frameId,128))fail("owned_initial_cep_context_refused");context=value;return;}
      if(["Runtime.executionContextDestroyed","Runtime.executionContextsCleared","Debugger.globalObjectCleared","Debugger.scriptFailedToParse","Inspector.detached"].includes(message.method)){invalidate();return;}
      if(message.method==="Debugger.scriptParsed"){const info=message.params;if(!info||!text(info.scriptId,128)||byId.has(info.scriptId))fail("owned_initial_cep_script_identity_refused");byId.add(info.scriptId);
        const expected=definition.rows.find(row=>!row.diagnostic&&row.url===info.url);
        if(initializing&&expected){if(scripts.has(expected.selector))fail("owned_initial_cep_script_duplicate");scripts.set(expected.selector,info);return;}
        if(!initializing&&pendingDiagnostic&&info.url===diagnostics[0].url&&!diagnosticInfo){diagnosticInfo=info;return;}fail("owned_initial_cep_unknown_compilation");}
    }catch{invalidate();}});
    await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error("owned_initial_cep_connect_timeout")),1000);socket.addEventListener("open",()=>{clearTimeout(timer);resolve();},{once:true});socket.addEventListener("error",()=>{clearTimeout(timer);reject(Error("owned_initial_cep_connect_error"));},{once:true});});current();
    await command("Runtime.enable");await command("Debugger.enable");const tree=await command("Page.getFrameTree");frame=tree?.frameTree;
    if(!context||!frame||frame.childFrames?.length||frame.frame?.url!==definition.targetUrl||frame.frame?.id!==context.auxData.frameId||scripts.size!==definition.rows.length-1)fail("owned_initial_cep_loaded_closure_incomplete");
    initializing=false;
    async function measure(){const records=[];for(const expected of definition.rows){const info=expected.diagnostic?diagnosticInfo:scripts.get(expected.selector);if(!info||info.executionContextId!==context.id||info.url!==expected.url||info.startLine!==expected.startLine||info.startColumn!==expected.startColumn||info.endLine!==expected.endLine||info.endColumn!==expected.endColumn||info.length!==expected.length||info.hasSourceURL!==expected.hasSourceURL||info.isModule!==expected.isModule||info.isLiveEdit!==expected.isLiveEdit||info.sourceMapURL!=="")fail("owned_initial_cep_source_metadata_changed");
        const source=await command("Debugger.getScriptSource",{scriptId:info.scriptId});if(typeof source.scriptSource!=="string")fail("owned_initial_cep_source_unavailable");const bytes=Buffer.from(source.scriptSource,"utf8");if(bytes.length!==expected.utf8ByteLength||source.scriptSource.length!==expected.length||hash(bytes)!==expected.compiledSha256)fail("owned_initial_cep_source_bytes_changed");records.push({selector:expected.selector,scriptId:info.scriptId,url:info.url,executionContextId:info.executionContextId,startLine:info.startLine,startColumn:info.startColumn,endLine:info.endLine,endColumn:info.endColumn,length:info.length,hasSourceURL:info.hasSourceURL,isModule:info.isModule,isLiveEdit:info.isLiveEdit,sourceMapURL:info.sourceMapURL,source:bytes});}return records;}
    return Object.freeze({assertCurrent:current,close:()=>state.close(),async observe(challenge){current();if(!exactKeys(challenge,["ref","purpose","target"])||!NONCE.test(challenge.ref)||!NONCE.test(challenge.target)||![1,2].includes(challenge.purpose)||pendingDiagnostic)fail("owned_initial_cep_exact_challenge_required");
      pendingDiagnostic=true;diagnosticInfo=null;try{const result=await command("Runtime.callFunctionOn",{executionContextId:context.id,functionDeclaration:CEP_STATE_DECLARATION,arguments:[{value:challenge}],returnByValue:true,awaitPromise:false,generatePreview:false,silent:true});
        if(result.exceptionDetails||!result.result||result.result.type!=="object"||!has(result.result,"value"))fail("owned_initial_cep_fixed_getter_failed");const value=result.result.value;if(!value||JSON.stringify(value.challenge)!==JSON.stringify(challenge))fail("owned_initial_cep_challenge_echo_mismatch");
        const records=await measure();current();return Object.freeze({targetId:page.id,frameId:frame.frame.id,contextId:context.id,contextUniqueId:context.uniqueId,contextOrigin:context.origin,records,value});
      }catch(error){invalidate();throw error;}finally{pendingDiagnostic=false;diagnosticInfo=null;}}});
  }catch(error){invalidate();state.close();throw error;}
}
const NONCE=/^[a-f0-9]{32}$/;
async function inspectPreactorTargetFixed(role,preactor){native.assertPreactorCurrent(role,preactor);const fixed=native.preactorObserverDefinition(role,preactor);
  if(!fixed||fixed.port!==8870||typeof fixed.targetUrl!=="string"||!fixed.targetUrl)fail("owned_initial_preactor_definition_required");
  const response=await new Promise((resolve,reject)=>{let settled=false;const done=(error,value)=>{if(settled)return;settled=true;error?reject(error):resolve(value);};
    const request=http.get({host:"127.0.0.1",port:fixed.port,path:"/json/list",agent:false},reply=>{let count=0;const chunks=[];
      reply.on("data",chunk=>{count+=chunk.length;if(count>262144){reply.destroy();done(Object.assign(Error("owned_initial_preactor_inventory_limit"),{code:"owned_initial_preactor_inventory_limit"}));}else chunks.push(chunk);});
      reply.once("error",error=>done(error));reply.once("aborted",()=>done(Object.assign(Error("owned_initial_preactor_inventory_unknown"),{code:"owned_initial_preactor_inventory_unknown"})));
      reply.once("end",()=>{if(!reply.complete||reply.statusCode!==200)return done(Object.assign(Error("owned_initial_preactor_inventory_unknown"),{code:"owned_initial_preactor_inventory_unknown"}));
        try{const rows=JSON.parse(Buffer.concat(chunks).toString("utf8"));if(!Array.isArray(rows)||rows.length>64)fail("owned_initial_preactor_inventory_shape");done(null,rows);}catch(error){done(error);}});});
    request.setTimeout(1000,()=>{request.destroy();done(Object.assign(Error("owned_initial_preactor_inventory_timeout"),{code:"owned_initial_preactor_inventory_timeout"}));});
    request.once("error",error=>{if(error.code==="ECONNREFUSED")done(null,[]);else done(error);});});
  native.assertPreactorCurrent(role,preactor);const targets=response.filter(row=>row&&row.type==="page"&&row.url===fixed.targetUrl);
  if(targets.length>1)fail("owned_initial_preactor_target_ambiguous");return targets.length===1;
}
module.exports=Object.freeze({bindLoadedNodeFixed,assertLoadedNode,bindLoadedCepFixed,inspectPreactorTargetFixed,CEP_STATE_DECLARATION});
