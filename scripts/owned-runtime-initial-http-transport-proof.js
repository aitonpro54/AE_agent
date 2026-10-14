"use strict";
// Sole-controller driver only. This file is never imported by product startup.
// It exercises the frozen production transport bytes with a separately compiled
// original-self-owner fixture addon. It creates no production enrollment/C1.
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm"),crypto=require("node:crypto");
const http=require("node:http"),net=require("node:net");
const {createBoundary,readJsonObject}=require("../mcp-server/http-boundary");
const MAX_MS=45000,PORT=23456;
const progress={cases:[],capturedRequests:0,terminalResponses:0,transportErrorCode:null,lastResponse:null};
function sha(bytes){return crypto.createHash("sha256").update(bytes).digest("hex");}
function assert(condition,code){if(!condition)throw Object.assign(Error(code),{code});}
function delay(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
async function main(){
  assert(process.platform==="win32"&&process.arch==="x64"&&process.version==="v24.19.0"&&Number(process.versions.napi)>=8,"proof_runtime_refused");
  assert(!process.env.NODE_OPTIONS&&!process.env.NODE_PATH&&!process.execArgv.length,"proof_preload_refused");
  const [addonPath,addonSha,sourceSha]=process.argv.slice(2);assert(addonPath&&/^[a-f0-9]{64}$/i.test(addonSha||"")&&/^[a-f0-9]{64}$/i.test(sourceSha||"")&&process.argv.length===5,"proof_fixed_invocation_required");
  const addonFile=path.resolve(addonPath);assert(fs.lstatSync(addonFile).isFile()&&!fs.lstatSync(addonFile).isSymbolicLink()&&sha(fs.readFileSync(addonFile))===addonSha.toLowerCase(),"proof_addon_pin_refused");
  const sourceFile=path.resolve(__dirname,"../mcp-server/owned-runtime-initial-http-transport.js"),source=fs.readFileSync(sourceFile);assert(sha(source)===sourceSha.toLowerCase(),"proof_adapter_source_pin_refused");
  const addon=require(addonFile);assert(addon.productionAuthority===false&&typeof addon.openFixedProofTransport==="function","proof_addon_surface_refused");
  const role=addon.openFixedProofTransport(),requestCaps=new Set(),closedConnections=new Set(),sockets=new Set(),cases=progress.cases;let captures=0,terminals=0,transportError=null;
  const guard=r=>{assert(r===role,"proof_original_role_required");role.assertCurrent();};
  const bridge={assertCurrent:guard,
    readRevokedKnown:r=>{assert(r===role,"proof_original_role_required");return role.readRevokedKnown();},
    openHttpListenerFixed:async r=>{guard(r);return role.openHttpListenerFixed();},acceptFixed:(r,c)=>{guard(r);return role.acceptFixed(c);},
    connectionPeer:(r,c)=>{guard(r);return role.connectionPeer(c);},brandHttpStream:(r,c,s)=>{guard(r);role.brandHttpStream(c,s);},
    connectionRead:(r,c)=>{guard(r);return role.connectionRead(c);},connectionWrite:(r,c,b)=>{guard(r);return role.connectionWrite(c,b);},
    connectionEnd:(r,c)=>{assert(r===role,"proof_original_role_required");return role.connectionEnd(c);},connectionClose:async(r,c)=>{assert(r===role,"proof_original_role_required");await role.connectionClose(c);closedConnections.add(c);},
    closeHttpListenerFixed:(r,c)=>{assert(r===role,"proof_original_role_required");return role.closeHttpListenerFixed(c);},
    retainAuthenticatedRequest:async(r,c,req)=>{guard(r);const cap=role.retainAuthenticatedRequest(c,req);assert(!requestCaps.has(cap),"proof_request_cap_reused");requestCaps.add(cap);captures++;progress.capturedRequests=captures;return cap;},
    completeAuthenticatedResponse:async(r,c,status,bytes)=>{guard(r);role.completeAuthenticatedResponse(c,status,bytes);terminals++;progress.terminalResponses=terminals;},
    failAuthenticatedResponse:async()=>{throw Object.assign(Error("proof_lost_response"),{code:"proof_lost_response"});}};
  const module={exports:{}};vm.runInNewContext(source.toString("utf8"),{module,exports:module.exports,Buffer,process,setTimeout,clearTimeout,
    require:name=>name==="./owned-runtime-initial-native-client"?bridge:require(name)}, {filename:sourceFile,timeout:1000});const transport=module.exports;
  const boundary=createBoundary({automation:"proof-automation",panel:"proof-panel",hosts:["127.0.0.1"],origins:["file://"]});
  const server=http.createServer({headersTimeout:300,requestTimeout:500,keepAliveTimeout:100,connectionsCheckingInterval:50,highWaterMark:1024},async(req,res)=>{
    try{boundary.validate(req);if(boundary.role(req)!=="automation"){req.resume();res.writeHead(403);res.end("denied");return;}
      if(req.method!=="POST"||req.url!=="/proof"){req.resume();res.writeHead(404);res.end("missing");return;}
      const body=await readJsonObject(req,4096);assert(Object.keys(body).every(k=>["name","args"].includes(k))&&typeof body.name==="string"&&body.args&&typeof body.args==="object"&&!Array.isArray(body.args),"proof_schema_refused");
      const cap=await transport.retainAuthenticatedRequest(role,req,body);assert(transport.requestCapability(role,req)===cap,"proof_actual_request_brand_missing");
      res.writeHead(200,{"content-type":"application/json"});const bytes=Buffer.from(JSON.stringify({ok:true,name:body.name,payload:body.name==="large"?"x".repeat(262144):""}));
      // Real HTTP response chunks pass through native partial-write and writable
      // backpressure callbacks, rather than acknowledging a no-op socket write.
      for(let at=0;at<bytes.length;at+=257){if(!res.write(bytes.subarray(at,at+257)))await new Promise((resolve,reject)=>{res.once("drain",resolve);res.once("error",reject);});}res.end();
    }catch(error){if(!res.headersSent){res.writeHead(error.status||400);res.end("refused");}else res.destroy(error);}});
  server.on("error",error=>{transportError=error;progress.transportErrorCode=error.code||"proof_transport_error";});
  const deadline=setTimeout(()=>{for(const socket of sockets)socket.destroy();if(control)void control.close().catch(()=>{});process.stderr.write("proof_deadline\n");process.exitCode=2;},MAX_MS);deadline.unref();
  let control;
  const run=async(name,fn)=>{try{await fn();cases.push({name,result:"PASS"});}catch(error){cases.push({name,result:"FAIL",code:error.code||"assertion_failed"});throw error;}};
  async function exchange(parts,{timeout=3500,pauseMs=0,end=true}={}){
    const done=deferred(),socket=net.connect(PORT,"127.0.0.1");sockets.add(socket);let bytes=Buffer.alloc(0),closed=false;
    const timer=setTimeout(()=>{socket.destroy();done.reject(Object.assign(Error("proof_exchange_timeout"),{code:"proof_exchange_timeout"}));},timeout);
    socket.on("error",error=>{if(!closed)done.reject(error);});socket.on("data",chunk=>{bytes=Buffer.concat([bytes,chunk]);});socket.once("close",()=>{closed=true;clearTimeout(timer);sockets.delete(socket);
      const statuses=[...bytes.toString("ascii").matchAll(/HTTP\/1\.1 ([0-9]{3}) /g)].map(m=>Number(m[1]));progress.lastResponse={status:statuses.at(-1)||null,statusCount:statuses.length,bytes:bytes.length};done.resolve(bytes);});
    socket.once("connect",()=>{void(async()=>{try{if(pauseMs){socket.pause();setTimeout(()=>socket.resume(),pauseMs);}for(const part of parts){socket.write(part.bytes??part);if(part.delay)await delay(part.delay);}if(end)socket.end();}catch(error){socket.destroy();done.reject(error);}})();});
    return done.promise;
  }
  function request(name,options={}){const body=JSON.stringify({name,args:{}});return `POST /proof HTTP/1.1\r\nHost: 127.0.0.1:${PORT}\r\nX-AE-Bridge-Token: ${options.token||"proof-automation"}\r\n${options.connection||"Connection: close\r\n"}Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`;}
  try{
    await run("fixed_cleanup_faults_once_and_winsock_balance",async()=>{assert(role.cleanupFaultsFixed()===true,"proof_cleanup_faults_failed");let duplicate=false;try{role.cleanupFaultsFixed();}catch{duplicate=true;}assert(duplicate,"proof_cleanup_fault_replay_accepted");});
    control=await transport.bindFixedServer(role,server);assert(!server.listening&&!server._handle&&server.address()===null,"proof_fake_node_listener_state");
    await run("auth_and_host_origin_reject",async()=>{assert((await exchange([request("denied",{token:"invalid"})])).includes(Buffer.from("403")),"proof_auth_reject_failed");const wrong=request("bad").replace(`Host: 127.0.0.1:${PORT}`,"Host: foreign.invalid");assert((await exchange([wrong])).includes(Buffer.from("403")),"proof_host_reject_failed");const origin=request("bad").replace("Content-Length:","Origin: https://foreign.invalid\r\nContent-Length:");assert((await exchange([origin])).includes(Buffer.from("403")),"proof_origin_reject_failed");});
    await run("header_body_fragmentation",async()=>{const raw=request("fragment");const result=await exchange([{bytes:raw.slice(0,7),delay:10},{bytes:raw.slice(7,31),delay:10},{bytes:raw.slice(31,-5),delay:10},raw.slice(-5)]);assert(result.includes(Buffer.from('"name":"fragment"')),"proof_fragment_result_missing");});
    await run("chunked_and_body_limit",async()=>{const body=JSON.stringify({name:"chunked",args:{}}),first=body.slice(0,9),second=body.slice(9);const raw=`POST /proof HTTP/1.1\r\nHost: 127.0.0.1:${PORT}\r\nX-AE-Bridge-Token: proof-automation\r\nConnection: close\r\nTransfer-Encoding: chunked\r\n\r\n${first.length.toString(16)}\r\n${first}\r\n${second.length.toString(16)}\r\n${second}\r\n0\r\n\r\n`;assert((await exchange([raw])).includes(Buffer.from('"name":"chunked"')),"proof_chunked_missing");const huge="x".repeat(4097),over=`POST /proof HTTP/1.1\r\nHost: 127.0.0.1:${PORT}\r\nX-AE-Bridge-Token: proof-automation\r\nConnection: close\r\nContent-Length: ${huge.length}\r\n\r\n${huge}`;assert((await exchange([over])).includes(Buffer.from("413")),"proof_body_limit_failed");});
    await run("keepalive_pipeline_distinct_request_caps",async()=>{const before=captures;const result=await exchange([request("first",{connection:"Connection: keep-alive\r\n"})+request("second")]);assert((result.toString().match(/HTTP\/1\.1 200/g)||[]).length===2&&captures===before+2,"proof_pipeline_caps_failed");});
    await run("response_backpressure_partial_write",async()=>{const result=await exchange([request("large")],{pauseMs:100,timeout:5000});assert(result.includes(Buffer.from('"name":"large"'))&&result.length>262144,"proof_large_response_truncated");});
    await run("header_and_request_timeout",async()=>{const header=await exchange(["POST /proof HTTP/1.1\r\nHost: 127.0.0.1:23456\r\n"],{end:false});assert(header.includes(Buffer.from("408")),"proof_header_timeout_missing");const body=await exchange(["POST /proof HTTP/1.1\r\nHost: 127.0.0.1:23456\r\nX-AE-Bridge-Token: proof-automation\r\nContent-Length: 100\r\n\r\n{"],{end:false});assert(body.includes(Buffer.from("408")),"proof_request_timeout_missing");});
    await run("keepalive_timeout",async()=>{const result=await exchange([request("idle",{connection:"Connection: keep-alive\r\n"})],{end:false});assert(result.includes(Buffer.from('"name":"idle"')),"proof_keepalive_result_missing");});
    await run("sequential_closed_connections_with_retained_request_caps",async()=>{const before=captures;for(let i=0;i<70;i++){const response=await exchange([request(`sequential-${i}`)]);assert(response.includes(Buffer.from(`"name":"sequential-${i}"`)),"proof_closed_connection_budget_failed");}
      assert(captures===before+70&&requestCaps.size===captures,"proof_request_retention_missing");await delay(30);assert(closedConnections.size>64,"proof_sequential_close_missing");
      for(const cap of closedConnections){let denied=false;try{role.connectionPeer(cap);}catch{denied=true;}assert(denied,"proof_closed_cap_reaccepted");}});
    await run("foreign_cap_stream_request_and_duplicate_refusal",async()=>{let refused=0;for(const fn of [()=>role.connectionPeer({}),()=>role.brandHttpStream({},{}),()=>transport.requestCapability(role,{socket:{}}),()=>transport.retainAuthenticatedRequest(role,{socket:{}},{})]){try{await fn();}catch{refused++;}}assert(refused===4,"proof_foreign_surface_accepted");for(const cap of requestCaps){let duplicate=false;try{role.completeAuthenticatedResponse(cap,200,Buffer.alloc(0));}catch{duplicate=true;}assert(duplicate,"proof_duplicate_result_accepted");}});
    await run("eof_error_parser_cleanup",async()=>{await exchange(["GET /unfinished HTTP/1.1\r\n"],{end:true});const malformed=await exchange(["not-http\r\n\r\n"]);assert(malformed.includes(Buffer.from("400")),"proof_parser_error_missing");});
    await run("close_cleanup",async()=>{await control.close();control=null;assert(server.listenerCount("request")>=1&&!server.listening&&sockets.size===0,"proof_close_cleanup_failed");});
    await run("fixed_injected_close_failure_retained_unknown",async()=>{assert(role.closeFailureFaultsFixed()===true,"proof_close_failure_failed");let duplicate=false;try{role.closeFailureFaultsFixed();}catch{duplicate=true;}assert(duplicate,"proof_close_failure_replay_accepted");});
    await run("fixed_original_cleanup_revoke_boundaries_and_negatives",async()=>{assert(role.revokeFaultsFixed()===true,"proof_revoke_faults_failed");let duplicate=false;try{role.revokeFaultsFixed();}catch{duplicate=true;}assert(duplicate,"proof_revoke_fault_replay_accepted");});
    await run("fixed_idle_write_accounting_and_confirmed_close",async()=>{assert(role.idleWriteFaultsFixed()===true,"proof_idle_write_faults_failed");let duplicate=false;try{role.idleWriteFaultsFixed();}catch{duplicate=true;}assert(duplicate,"proof_idle_write_fault_replay_accepted");});
    assert(!transportError,"proof_unexpected_transport_error");assert(captures>=6&&terminals===captures,"proof_terminal_callback_count_mismatch");
  }finally{clearTimeout(deadline);if(control)await control.close();for(const socket of sockets)socket.destroy();}
  return {schema:"ae-agent.initial-http-transport-proof.v1",productionAuthority:false,ownLoopback:true,port:PORT,nodeVersion:process.version,
    adapterSourceSha256:sha(source),addonSha256:addonSha.toLowerCase(),cases,capturedRequests:captures,terminalResponses:terminals,transportError:false,cleanupComplete:true,
    injectedCloseFailure:{authority:false,scenarios:2,closeAttemptOnce:true,persistentUnknown:true,newAcceptDenied:true,winsockCleanupAbsent:true,retainedUntilOriginalChildExit:true},
    originalCleanupFixture:{authority:false,scenarios:15,originalSocketIo:true,predicate:"fixed isolated owner model",
      productionB33OrBrokerFloorProved:false,cases:["idle_revoke","before_accept","after_accept","before_recv","after_recv","before_send","after_send",
        "no_b33","pending_finalizer_no_b33","revoked_finalizer","source_negative","clock_negative","generation_negative","foreign_owner_negative","end_unknown_no_replay"]},
    idleWriteFixture:{authority:false,scenarios:7,originalSocketIo:true,napiFailureInjection:false,productionIdleRequestOrB33Proved:false,
      cases:["idle_and_closing_unconfirmed","queued_blocks_close","executed_unreconciled_blocks_close","unknown_reservation_retained",
        "failed_close_unconfirmed","late_callback_unknown_denied","ordinal_overflow_no_send"]},
    ok:cases.every(c=>c.result==="PASS")};
}
// Explicit pure source mode. Uses simulated native outcomes and event objects;
// it neither loads an addon nor opens a listener/socket/process/native factory.
async function sourceStaticProof(){
  const {EventEmitter}=require("node:events");
  const root=path.resolve(__dirname,".."),sourceFile=path.join(root,"mcp-server/owned-runtime-initial-http-transport.js");
  const source=fs.readFileSync(sourceFile,"utf8"),cpp=fs.readFileSync(path.join(root,"native/owned-runtime-local-session/local_session_http_transport.cpp"),"utf8"),
    napi=fs.readFileSync(path.join(root,"native/owned-runtime-local-session/local_session_http_node_api.cpp"),"utf8");
  const staticCases=[];
  for(const file of ["local_session_http_transport.h","local_session_http_transport.cpp","local_session_http_node_api.h","local_session_http_node_api.cpp","local_session_http_transport_proof.cpp"]){
    const code=fs.readFileSync(path.join(root,"native/owned-runtime-local-session",file),"utf8").replace(/\/\*[\s\S]*?\*\//g,"").replace(/\/\/[^\n]*/g,"").replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g,"");
    const stack=[];for(const ch of code){if("{([".includes(ch))stack.push(ch);else if("})]".includes(ch))assert(stack.pop()==={"}":"{",")":"(","]":"["}[ch],"source_cpp_delimiter_"+file);}assert(!stack.length,"source_cpp_delimiter_tail_"+file);
  }
  const asyncBody=napi.slice(napi.indexOf("napi_value Async("),napi.indexOf("napi_value Dispatch("));
  assert(asyncBody.indexOf("ReserveWriteWork")>=0&&asyncBody.indexOf("ReserveWriteWork")<asyncBody.indexOf("napi_queue_async_work"),"source_write_reserve_after_queue");
  const executeBody=napi.slice(napi.indexOf("void Execute("),napi.indexOf("void Complete("));assert(!executeBody.includes("ReconcileWriteWork"),"source_write_early_execute_release");
  const completeBody=napi.slice(napi.indexOf("void Complete("),napi.indexOf("napi_value Async("));
  assert(completeBody.indexOf("ReconcileWriteWork")>completeBody.indexOf("napi_resolve_deferred")&&completeBody.indexOf("ReconcileWriteWork")>completeBody.indexOf("napi_delete_async_work"),"source_write_early_completion_release");
  const sendBody=cpp.slice(cpp.indexOf("void AcceptedConnection::Write("),cpp.indexOf("void AcceptedConnection::End("));
  assert(sendBody.indexOf("BeginPayloadWriteAttempt()")<sendBody.indexOf("const int count=send("),"source_ordinal_after_send");
  const closeBody=cpp.slice(cpp.indexOf("void AcceptedConnection::CloseOnce("),cpp.indexOf("FixedHttpListener::FixedHttpListener("));
  assert(closeBody.indexOf("closeConfirmed_.store(true,std::memory_order_release)")>closeBody.indexOf("CloseAccepted(Exact(socket_))"),"source_close_confirmed_early");
  assert(!source.includes("Promise.allSettled"),"source_ignored_barrier_rejections");
  staticCases.push({name:"reserve_queue_execute_completion_ordinal_confirmed_order",result:"PASS"});
  const modes=["idle_success","no_b33_close_pending","no_b33_producer_pending","producer_failure_retained","close_failure_retained","normal_fail_retained","normal_complete_failure_retained"];
  for(const mode of modes){
    const role=Object.freeze({}),connection=Object.freeze({}),requestCap=Object.freeze({}),accepted=deferred();let acceptCount=0,socket=null;
    let revoked=false,b33=mode!=="no_b33_close_pending"&&mode!=="no_b33_producer_pending",closedEvents=0,closeCalls=0,closeEffects=0,cleanupCalls=0,cleanupEffects=0,normalFail=0;
    const failed=Object.assign(Error("source_fixture_terminal_unknown"),{code:"source_fixture_terminal_unknown",unknown:true});
    const parser={setupConnectionsTracking(){},httpServerPreClose(){},_connectionListener(original){socket=original;socket.on("error",()=>{});}};
    const nativeFixture={assertCurrent:r=>assert(r===role&&!revoked,"source_fixture_normal_guard"),readRevokedKnown:r=>{assert(r===role,"source_fixture_role");return revoked;},
      openHttpListenerFixed:async()=>Object.freeze({}),acceptFixed:()=>++acceptCount===1?Promise.resolve(connection):accepted.promise,
      brandHttpStream:(r,c)=>assert(r===role&&c===connection,"source_fixture_brand"),connectionPeer:()=>({localAddress:"127.0.0.1",remoteAddress:"127.0.0.1",localPort:23456,remotePort:1}),
      connectionRead:async()=>{throw Object.assign(Error("unused"),{code:"source_fixture_unexpected_read"});},connectionWrite:async()=>{throw Error("source_fixture_unexpected_write");},connectionEnd:async()=>{},
      connectionClose:async(r,c)=>{assert(r===role&&c===connection,"source_fixture_original_close");closeCalls++;
        if(mode==="close_failure_retained")throw failed;
        if(mode==="no_b33_close_pending"&&!b33)throw Object.assign(Error("pending"),{code:"trusted_original_close_cleanup_pending",unknown:false});
        closeEffects++;if(mode==="no_b33_producer_pending")revoked=true;},closeHttpListenerFixed:async()=>{},
      retainAuthenticatedRequest:async(r,c)=>{assert(r===role&&c===connection,"source_fixture_original_request");return requestCap;},
      completeAuthenticatedResponse:async()=>{if(mode==="normal_complete_failure_retained")throw failed;},
      failAuthenticatedResponse:async()=>{normalFail++;},
      completeOriginalIdleRequestCleanup:async(r,cap)=>{assert(r===role&&cap===requestCap&&closeEffects===1,"source_fixture_cleanup_before_confirmed_original_close");cleanupCalls++;
        if(!b33)throw Object.assign(Error("pending"),{code:"trusted_original_idle_cleanup_pending",unknown:false});
        if(mode==="producer_failure_retained")throw failed;cleanupEffects++;}};
    const sandboxModule={exports:{}};vm.runInNewContext(source,{module:sandboxModule,exports:sandboxModule.exports,Buffer,
      process:{version:"v24.19.0",platform:"win32",arch:"x64"},setTimeout,clearTimeout,
      require:name=>name==="./owned-runtime-initial-native-client"?nativeFixture:name==="node:_http_server"?parser:require(name)}, {filename:sourceFile,timeout:1000});
    const server=new EventEmitter();server.listening=false;server._handle=null;server.on("connection",parser._connectionListener);server.on("error",()=>{});server.on("close",()=>closedEvents++);
    const control=await sandboxModule.exports.bindFixedServer(role,server);for(let i=0;i<8&&!socket;i++)await Promise.resolve();assert(socket,"source_fixture_original_stream_missing");
    const req=new EventEmitter();Object.assign(req,{socket,complete:true,aborted:false,method:"GET",url:"/bridge/next?projectFile=x&panelConnectionId=y&panelGeneration=z&panelInstanceId=w&panelLifecycleEpoch=v"});
    const res=new EventEmitter();res.statusCode=200;res.write=()=>true;res.end=()=>{};server.emit("request",req,res);
    assert(await sandboxModule.exports.retainAuthenticatedRequest(role,req,Buffer.alloc(0))===requestCap,"source_fixture_request_cap_missing");
    if(mode==="normal_complete_failure_retained"){res.emit("finish");for(let i=0;i<4;i++)await Promise.resolve();}
    if(!["normal_fail_retained","normal_complete_failure_retained","no_b33_producer_pending"].includes(mode))revoked=true;
    const first=control.close();accepted.reject(Object.assign(Error("timeout"),{code:"trusted_socket_timeout",unknown:false}));
    let error=null;try{await first;}catch(value){error=value;}
    if(mode==="no_b33_close_pending"||mode==="no_b33_producer_pending"){
      assert(error&&error.code===(mode==="no_b33_close_pending"?"trusted_original_close_cleanup_pending":"trusted_original_idle_cleanup_pending")&&closeEffects===(mode==="no_b33_close_pending"?0:1)&&cleanupEffects===0&&closedEvents===0,"source_fixture_pending_effect_or_success");
      b33=true;await control.close();assert(closeEffects===1&&cleanupEffects===1&&normalFail===0&&closedEvents===1,"source_fixture_exact_pending_not_resumed");
      if(mode==="no_b33_producer_pending")assert(closeCalls===1,"source_fixture_confirmed_close_replayed");
    }else if(mode==="idle_success")assert(!error&&closeEffects===1&&cleanupCalls===1&&cleanupEffects===1&&normalFail===0&&closedEvents===1,"source_fixture_idle_order");
    else{assert(error&&closedEvents===0&&cleanupEffects===0,"source_fixture_terminal_failure_ignored");
      let replayError=null;try{await control.close();}catch(value){replayError=value;}assert(replayError===error&&cleanupCalls===(mode==="producer_failure_retained"?1:0)&&closeCalls<2,"source_fixture_failure_replayed_or_lost");
      if(mode==="normal_fail_retained")assert(normalFail===1&&cleanupCalls===0,"source_fixture_normal_fail_loosened");}
    staticCases.push({name:"adapter_"+mode,result:"PASS"});
  }
  return {schema:"ae-agent.initial-http-transport-source-proof.v1",productionAuthority:false,nativeExecuted:false,
    addonLoaded:false,networkIo:false,profileSimulated:true,adapterSourceSha256:sha(Buffer.from(source)),cases:staticCases,ok:true};
}
const sourceOnly=process.argv.length===3&&process.argv[2]==="--source-static";
(sourceOnly?sourceStaticProof():main()).then(result=>process.stdout.write(JSON.stringify(result)+"\n"),error=>{process.stdout.write(JSON.stringify({schema:sourceOnly?"ae-agent.initial-http-transport-source-proof.v1":"ae-agent.initial-http-transport-proof.v1",productionAuthority:false,ownLoopback:!sourceOnly,...(sourceOnly?{nativeExecuted:false,addonLoaded:false,networkIo:false}:{}),ok:false,code:error.code||"proof_failed",...progress})+"\n");process.exitCode=2;});
