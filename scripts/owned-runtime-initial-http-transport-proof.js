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
    openHttpListenerFixed:async r=>{guard(r);return role.openHttpListenerFixed();},acceptFixed:(r,c)=>{guard(r);return role.acceptFixed(c);},
    connectionPeer:(r,c)=>{guard(r);return role.connectionPeer(c);},brandHttpStream:(r,c,s)=>{guard(r);role.brandHttpStream(c,s);},
    connectionRead:(r,c)=>{guard(r);return role.connectionRead(c);},connectionWrite:(r,c,b)=>{guard(r);return role.connectionWrite(c,b);},
    connectionEnd:(r,c)=>{guard(r);return role.connectionEnd(c);},connectionClose:async(r,c)=>{guard(r);await role.connectionClose(c);closedConnections.add(c);},
    closeHttpListenerFixed:(r,c)=>{guard(r);return role.closeHttpListenerFixed(c);},
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
    assert(!transportError,"proof_unexpected_transport_error");assert(captures>=6&&terminals===captures,"proof_terminal_callback_count_mismatch");
  }finally{clearTimeout(deadline);if(control)await control.close();for(const socket of sockets)socket.destroy();}
  return {schema:"ae-agent.initial-http-transport-proof.v1",productionAuthority:false,ownLoopback:true,port:PORT,nodeVersion:process.version,
    adapterSourceSha256:sha(source),addonSha256:addonSha.toLowerCase(),cases,capturedRequests:captures,terminalResponses:terminals,transportError:false,cleanupComplete:true,
    injectedCloseFailure:{authority:false,scenarios:2,closeAttemptOnce:true,persistentUnknown:true,newAcceptDenied:true,winsockCleanupAbsent:true,retainedUntilOriginalChildExit:true},ok:cases.every(c=>c.result==="PASS")};
}
main().then(result=>process.stdout.write(JSON.stringify(result)+"\n"),error=>{process.stdout.write(JSON.stringify({schema:"ae-agent.initial-http-transport-proof.v1",productionAuthority:false,ownLoopback:true,ok:false,code:error.code||"proof_failed",...progress})+"\n");process.exitCode=2;});
