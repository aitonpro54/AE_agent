"use strict";
// Source-derived stdio/continuation checks only. No addon, pipe, process or AE.
const fs=require("fs"),path=require("path"),vm=require("vm"),assert=require("assert"),crypto=require("crypto"),{EventEmitter}=require("events");
const root=path.resolve(__dirname,"..");
const source=name=>fs.readFileSync(path.join(root,name),"utf8");
let passed=0;
function check(condition,label){assert.ok(condition,label);passed++;}
function between(text,first,last){const a=text.indexOf(first),b=text.indexOf(last,a+first.length);assert.ok(a>=0&&b>a,"source boundary missing");return text.slice(a,b);}
async function main(){
  const adapter=source("mcp-server/mcp-adapter.js"),runtime=source("mcp-server/owned-runtime-initial-runtime.js");
  const errors=[],calls=[];let release;
  const box={AbortController,Map,Number,initialRuntime:{},err:(...values)=>errors.push(values),handleRpcBound:async(message,original)=>{
    calls.push({message,original});if(original)return new Promise(resolve=>{release=resolve;});
  }};
  vm.createContext(box);vm.runInContext(between(adapter,"const originalRpcRequests=new Map();","async function handleOwnedRuntimeTool"),box);
  const first=box.handleRpc({jsonrpc:"2.0",id:7,method:"tools/call"});await Promise.resolve();
  check(calls.length===1&&!calls[0].original.controller.signal.aborted,"original request retained");
  await box.handleRpc({jsonrpc:"2.0",method:"notifications/cancelled",params:{requestId:"7"}});
  check(!calls[0].original.controller.signal.aborted,"foreign primitive ID cannot cancel");
  await box.handleRpc({jsonrpc:"2.0",id:7,method:"tools/call"});check(errors.length===1&&calls.length===1,"duplicate request cannot replace original");
  await box.handleRpc({jsonrpc:"2.0",id:99,method:"notifications/cancelled",params:{requestId:7}});
  check(!calls[0].original.controller.signal.aborted,"notification with response ID refused");
  await box.handleRpc({jsonrpc:"2.0",method:"notifications/cancelled",params:{requestId:7,foreign:true}});
  check(!calls[0].original.controller.signal.aborted,"extra cancellation operand refused");
  await box.handleRpc({jsonrpc:"2.0",method:"notifications/cancelled",params:{requestId:7}});
  check(calls[0].original.controller.signal.aborted,"exact MCP cancellation reaches original signal");release();await first;
  await box.handleRpc({jsonrpc:"2.0",method:"notifications/cancelled",params:{requestId:7}});check(calls.length===1,"late cancelled request does not recreate work");
  const second=box.handleRpc({jsonrpc:"2.0",id:"own",method:"tools/call"});await Promise.resolve();box.cancelOriginalRpcRequests();check(calls[1].original.controller.signal.aborted,"EOF cancels retained original request");release();await second;

  const continuation=between(runtime,"  const completionStarts=new Map();","  const tools=");
  function controller(){let resolve,reject;const operations=[];const b={Map,Promise,Object,Error,unknown:false,role:{},fail:code=>{throw Object.assign(Error(code),{code});},
    canonicalBody:(name,args)=>Buffer.from(JSON.stringify({args,name})),exchange:async(name,args,read,call,signal)=>{check(call.own&&signal,"own completion call and request signal passed");operations.push("HTTP");return "own-result";},
    assertIngress:()=>operations.push("guard"),native:{armOriginalCompletionWaitFixed:()=>operations.push("arm"),beginCompletionFixed:async()=>{operations.push("C3/C5");return {own:true};},
      waitOriginalCompletionNoticeFixed:()=>new Promise((yes,no)=>{resolve=yes;reject=no;}),
      cancelOriginalCompletionWaitFixed:(role,slot)=>{operations.push(`cancel:${slot}`);reject(Object.assign(Error("cancel"),{unknown:true}));}}};
    vm.createContext(b);vm.runInContext(continuation,b);return {b,operations,ready:()=>resolve({operation:67}),closed:()=>reject(Error("closed"))};
  }
  const c=controller(),signal=new AbortController();c.b.retainOriginalStart(1,{});
  check(c.operations.join(",")==="arm","only own START continuation arms wait");
  const result=c.b.completionResult("get_ame_title_job_status",{variantSlot:1},signal.signal).catch(error=>error);
  await Promise.resolve();check(!c.operations.includes("guard"),"no C3/C5 before native notice");
  const duplicate=await c.b.completionResult("get_ame_title_job_status",{variantSlot:1},signal.signal).catch(error=>error);
  check(duplicate.code==="owned_initial_completion_original_start_required","new-object second official intent refused");
  signal.abort();const cancelled=await result;check(cancelled.message==="cancel"&&c.operations.includes("cancel:1"),"exact request signal cancels original native wait");
  check(!c.operations.includes("guard")&&c.b.unknown,"cancel prevents dispatch and retains unknown");
  const early=controller();early.b.retainOriginalStart(2,{});early.ready();await Promise.resolve();
  const value=await early.b.completionResult("get_ame_title_job_status",{variantSlot:2},new AbortController().signal).catch(error=>error);
  check(value==="own-result"&&early.operations.indexOf("guard")<early.operations.indexOf("C3/C5")&&early.operations.indexOf("C3/C5")<early.operations.indexOf("HTTP"),"early notice retained; one guarded official read");
  for(const args of [{variantSlot:0},{variantSlot:"1"},{variantSlot:1,hash:"x"},{variantSlot:3}]){
    const e=await early.b.completionResult("get_ame_title_job_status",args,new AbortController().signal).catch(error=>error);check(e.code==="owned_initial_completion_exact_selector","strict completion selector");
  }
  const native=source("native/owned-runtime-local-session/local_session_native_client.cpp");
  const wait=between(native,"phase::Frame NativeClient::WaitOriginalCompletionNoticeFixed(","std::shared_ptr<Capability> NativeClient::BeginServerOnlyFixed");
  check(wait.includes("WaitForMultipleObjects(3,handles")&&wait.includes("CancelIoEx(data_->pipe.Get(),&io->state)")&&wait.includes("GetOverlappedResult"),"original bounded cancellation settlement sites");
  const cancel=between(native,"void NativeClient::CancelOriginalCompletionWaitFixed(","phase::Frame NativeClient::WaitOriginalCompletionNoticeFixed(");
  check(!cancel.includes("lock(data_->serial)")&&cancel.includes("completionCancelSerial"),"cancellation never waits for sleeping reader serial");
  check(wait.includes("unsettled.push_back(std::move(io))")&&wait.includes("failedCloseHandles.push_back(exact)"),"unsettled/failed close originals retained");
  check(!wait.includes("CreateThread")&&!wait.includes("CreateProcess")&&!wait.includes("Exchange("),"wait creates no pump/process/public poll");
  const broker=source("native/owned-runtime-local-session/local_session_win32.cpp"),sha=bytes=>crypto.createHash("sha256").update(bytes).digest("hex").toUpperCase();
  const golden=["B9BAE7CC48E76B99AB8749219FE49EDF7F1272D6AA921D31F937412B3CB5C267","4C3ED0B55B6FBE9CCB351516F89B113D8AA7362E44FA3127F735CE7D150071BD"];
  const literals=text=>[...text.matchAll(/constexpr char (?:first|second)\[\]=("(?:\\.|[^"\\])*");/g)].map(match=>JSON.parse(match[1]));
  const nativeLiterals=literals(between(native,"Bytes NativeClient::OriginalCompletionProjectionFixed(","std::shared_ptr<Capability> NativeClient::VerifyCompletionToolFixed("));
  const brokerLiterals=literals(between(broker,"static Bytes CompletionProjection(","Digest CompletionFinishBinding("));
  check(nativeLiterals.length===2&&brokerLiterals.length===2,"both peers source-own exactly two literals");
  for(let i=0;i<2;i++){check(nativeLiterals[i]===brokerLiterals[i]&&Buffer.byteLength(nativeLiterals[i])===356&&sha(nativeLiterals[i])===golden[i],"exact projection356 and golden hash");}
  const finish=between(native,"Bytes NativeClient::FinishOriginalCompletionFixed(","void NativeClient::CompleteOriginalCompletionResponseFixed(");
  const domain=finish.match(/constexpr char domain\[\]="([^"]+)"/)[1];check(finish.includes("domain+sizeof(domain)"),"finish domain includes exactly source NUL");
  // Execute the actual fixed field order from the producer, with independent
  // contract golden vectors; changing order/aliasing a hash changes these.
  const fields=[...finish.matchAll(/Put\(fields,([^;]+)\);|detail::PutU64\(fields,([^;]+)\);/g)].map(match=>({operand:match[1]||match[2],integer:!!match[2]}));
  const fixture={"Fixed<32>(handler.frame_.payload.data()+40)":Buffer.alloc(32,0x11),call:Buffer.alloc(16,0x22),"job->grantHash_":Buffer.alloc(32,0x33),"job->finalPoll_":7n,"job->terminalRef_":Buffer.alloc(16,0x44),"job->terminalReceipt_":Buffer.alloc(32,0x55),"job->terminalResultHash_":Buffer.alloc(32,0x66),hash:Buffer.from(golden[0],"hex"),"job->session_":Buffer.alloc(16,0x77),"EmbeddedProfile().execution.policyHash":Buffer.alloc(32,0x88)};
  const encode=values=>Buffer.concat([Buffer.from(domain+"\0"),...fields.map(field=>{const value=values[field.operand];assert.notStrictEqual(value,undefined,"unaccounted actual finish operand");if(!field.integer)return value;const bytes=Buffer.alloc(8);bytes.writeBigUInt64LE(value);return bytes;})]);
  const baseline=encode(fixture);check(baseline.length===301&&sha(baseline)==="5F84D9455F15A7D2E23D50FEE872FD1EA3E057DCAD597DEF99A9034C4EAE6A90","actual finish preimage golden");
  const changes={call:"53A7042042712BB290D6E2AEE25206565F41FE1F670D4E80AB05C40931AA75AB","job->grantHash_":"791968799D51011B3FE33C0D750F0B0FFAED96E174BE1966BA8D55450286A453","job->terminalRef_":"E59C9FA78D6A4470ED2D020FDA3FBF07078DE5EFF44BCE18CEA6717C5ABB1FB1","job->terminalReceipt_":"ACCE51F5C104FA9BFC72DF0A23DDD9FC95F8D802BC7BB4B3E48C3377EDA3F1C1","job->terminalResultHash_":"1ECE95A0BED74E1B3B351BC5A2AC95D5E8A98EC801208CEFED2E30CE14AAC256"};
  for(const [key,expected] of Object.entries(changes)){const changed={...fixture,[key]:Buffer.from(fixture[key])};changed[key][0]++;check(sha(encode(changed))===expected&&sha(encode(changed))!==golden[0],"same projection binds changed original lineage");}
  const membership=broker.match(/if\((TrustedHash\("lcp2\.production\.original-poll-factual-receipt\.v1",opening\)[\s\S]*?)\)Refuse\("trusted_completion_publication_factual_membership"/)[1];
  const predicate=vm.runInNewContext(`(request,opening,ownReceipt)=>(${membership.replace(/job->terminalReceipt/g,"ownReceipt").replace(/detail::Zero/g,"Zero")})`,{
    TrustedHash:(domain,bytes)=>sha(Buffer.concat([Buffer.from(domain+"\0"),bytes])),TrustedField:(request,at)=>request.subarray(at,at+32).toString("hex").toUpperCase(),Zero:value=>/^0+$/.test(value),TrustedNumber:(request,at)=>Number(request.readBigUInt64LE(at))});
  const opening=Buffer.alloc(272,0x31);opening.writeBigUInt64LE(700n,264);const packet=Buffer.alloc(324);opening.copy(packet,52);const receipt=sha(Buffer.concat([Buffer.from("lcp2.production.original-poll-factual-receipt.v1\0"),opening]));
  check(!predicate(packet,opening,receipt),"actual broker opening membership positive");
  for(const at of [0,32,64,96,128,160,192,232,264]){const altered=Buffer.from(opening);altered[at]^=1;const changed=Buffer.from(packet);altered.copy(changed,52);check(predicate(changed,altered,receipt),"each retained opening field rejects changed receipt membership");}
  check(predicate(packet,opening,"F".repeat(64)),"foreign accepted receipt refused");
  const http=source("mcp-server/owned-runtime-initial-http-transport.js"),hook=between(http,"function bindOriginalCompletionResponse(","function closeFixedServer(");
  async function barrier(options={}){const socket=new EventEmitter(),req={socket},role={},handler={},requests=new Map(),streams=new Map(),failures=[],work=[],completed=[];
    let settle;const terminal=options.pending?new Promise(resolve=>{settle=resolve;}):Promise.resolve();const socketState={role,serverState:{},closePromise:options.closedUnknown?Promise.reject(Error("close unknown")):Promise.resolve(),closeConfirmed:true};void socketState.closePromise.catch(()=>{});
    const item={role,authenticated:{},socketState,finished:false,terminalPromise:terminal,terminal:!options.pending};requests.set(req,item);streams.set(socket,socketState);
    const b={requests,streams,fail:code=>{throw Error(code);},observe:(state,promise)=>{work.push(promise);return promise;},retainFailure:(state,error)=>failures.push(error),native:{completeOriginalCompletionResponseFixed:async(r,h)=>completed.push({r,h})}};
    vm.createContext(b);vm.runInContext(hook,b);if(options.foreignReq){assert.throws(()=>b.bindOriginalCompletionResponse(role,{socket},handler));check(completed.length===0,"foreign request cannot bind barrier");return;}
    b.bindOriginalCompletionResponse(role,req,handler);item.finished=true;if(options.foreignSocket)req.socket=new EventEmitter();socket.emit("close");await Promise.resolve();
    if(options.pending){check(completed.length===0,"pending terminal cannot release barrier");item.terminal=true;settle();}
    await Promise.allSettled(work);await Promise.resolve();check(options.closedUnknown||options.foreignSocket?completed.length===0&&failures.length===1:completed.length===1&&completed[0].h===handler,"same original terminal+socket cleanup only");
  }
  await barrier();await barrier({pending:true});await barrier({closedUnknown:true});await barrier({foreignReq:true});await barrier({foreignSocket:true});
  const begin=between(native,"std::shared_ptr<Capability> NativeClient::BeginCompletionFixed(","phase::Frame NativeClient::PublishOwnCompletionReadyFixed(");
  check(begin.indexOf("start->officialSpent=true")<begin.indexOf("Exchange(phase::Verb::Status")&&begin.match(/Exchange\(phase::Verb::Status/g).length===1,"irreversible once C3 preflight");
  check(finish.includes("handler.spent_=true")&&finish.indexOf("handler.spent_=true")<finish.indexOf("Exchange(phase::Verb::Complete"),"Finish latches before D20 send");
  check(!finish.includes("NativeDispatchCommit")&&!finish.includes("Own(CapKind::Terminal")&&!finish.includes("BindCommand"),"official Finish creates no Note/cap/dispatch");
  const notice=between(native,"void NativeClient::RetainOriginalCompletionNoticeLocked(","void NativeClient::ArmOriginalCompletionWaitFixed(");
  const noticeCondition=notice.match(/if\((!start\|\|[\s\S]*?)\)\{data_->unknown=true;Refuse\("trusted_completion_notice_original_join_unknown"/)[1]
    .replace(/Fixed<16>\(notice\.payload\.data\(\)\+4\)/g,"read(notice,4,16)").replace(/Fixed<16>\(start->call->frame_\.payload\.data\(\)\)/g,"read(start.call,0,16)")
    .replace(/Fixed<32>\(notice\.payload\.data\(\)\+20\)/g,"read(notice,20,32)").replace(/start->/g,"start.");
  const noticeReject=vm.runInNewContext(`(start,notice)=>(${noticeCondition})`,{read:(bytes,at,n)=>bytes.subarray(at,at+n).toString("hex")});
  const ownCall=Buffer.alloc(16,0x71),ownSelector=Buffer.alloc(32,0x81),ownNotice=Buffer.alloc(52);ownCall.copy(ownNotice,4);ownSelector.copy(ownNotice,20);
  const ownStart={noticed:false,call:ownCall,selector:ownSelector.toString("hex")};check(!noticeReject(ownStart,ownNotice),"actual native notice own START/selector positive");
  check(noticeReject({...ownStart,noticed:true},ownNotice),"duplicate retained notice rejected");check(noticeReject(null,ownNotice),"notice without own START rejected");check(noticeReject({...ownStart,call:null},ownNotice),"foreign/missing original call rejected");
  for(const offset of [4,20]){const changed=Buffer.from(ownNotice);changed[offset]^=1;check(noticeReject(ownStart,changed),"foreign notice START/hash refused");}
  const bridge=source("mcp-server/bridge-daemon.js");
  async function publicationRace(failed){let settle,reject;const publication=new Promise((yes,no)=>{settle=yes;reject=no;}),events=[],role={},flight={unknown:false,publicationPromise:publication,published:false},res=new EventEmitter(),req={};
    const b={JSON,Object,Array,Promise,Error,ameTitleJobs:{INSPECT:"inspect_ame_title_sources",QUEUE_MANIFEST:"inspect_ame_title_queue_manifest"},
      trustedExact:(value,keys)=>value&&Object.keys(value).sort().join(",")===keys.slice().sort().join(","),trustedFail:(code,unknown)=>{throw Object.assign(Error(code),{unknown});},
      trustedReadDaemon:{role,pumpWork:null,activeTool:null,completionFlights:[flight,null]},trustedCurrent:()=>events.push("guard"),
      trustedHttp:{retainAuthenticatedRequest:async()=>{events.push("retain");return {};},bindOriginalCompletionResponse:()=>events.push("barrier")},
      trustedNative:{verifyCompletionToolFixed:async()=>{events.push("verify");return {};},finishOriginalCompletionFixed:async()=>{events.push("finish");return nativeLiterals[0];}},
      writeJson:(response,status,value)=>{check(status===200&&value.result.content[0].text===nativeLiterals[0],"exact original HTTP projection text");events.push("HTTP");}};
    vm.createContext(b);vm.runInContext(between(bridge,"async function trustedTool(","function trustedDispositionTick("),b);
    const result=b.trustedTool(req,res,Buffer.from('{"args":{"variantSlot":1},"name":"get_ame_title_job_status"}')).catch(error=>error);
    await Promise.resolve();check(!events.includes("retain")&&!events.includes("verify"),"Tool18 waits short publication callback before Native D40 owner use");
    if(failed)reject(Object.assign(Error("publication unknown"),{unknown:true}));else{flight.published=true;settle();}
    const error=await result;check(failed?error.message==="publication unknown"&&!events.includes("verify"):events.indexOf("verify")<events.indexOf("finish")&&events.indexOf("finish")<events.indexOf("barrier")&&events.includes("HTTP"),"publication failure closes / ACK callback permits one result read");
  }
  await publicationRace(false);await publicationRace(true);
  async function producerResponseRace(options={}){
    const events=[],failures=[],observed=[],role={},terminal={},job={},socket=new EventEmitter(),req={socket,method:"POST",url:"/bridge/result"},res=new EventEmitter(),server=new EventEmitter();
    const requests=new Map(),streams=new Map(),state={role,closed:false,pending:new Set(),connections:new Set()},socketState={role,connection:{},serverState:state,requests:new Set(),closeConfirmed:false};
    state.connections.add(socketState);streams.set(socket,socketState);let ownerPending=false,releaseTerminal,releaseClose,releasePublish;
    const terminalDone=new Promise(resolve=>{releaseTerminal=resolve;}),closeDone=new Promise((resolve,reject)=>{releaseClose=options.closeUnknown?()=>reject(Error("original close unknown")):resolve;}),publishDone=new Promise(resolve=>{releasePublish=resolve;});
    res.statusCode=200;res.write=()=>true;res.end=()=>{events.push("write");if(!options.lost)res.emit("finish");};
    const flight={slot:1,originalJob:job},b={Promise,Buffer,MAX_RESPONSE:1048576,server,state,role,streams,requests,
      fail:code=>{throw Error(code);},cleanupPending:()=>false,retainFailure:(own,error)=>failures.push(error),observe:(own,promise)=>{observed.push(promise);void promise.catch(error=>failures.push(error));return promise;},
      native:{readRevokedKnown:()=>false,completeAuthenticatedResponse:async()=>{if(ownerPending)throw Error("trusted_node_original_reader_or_operation_busy");events.push("terminal");await terminalDone;},
        connectionClose:async()=>{if(ownerPending)throw Error("trusted_node_original_reader_or_operation_busy");events.push("close");await closeDone;},failAuthenticatedResponse:async()=>{events.push("lost");}},
      trustedReadDaemon:{role,ameJobs:[job,null],completionFlights:[flight,null],completionTerminals:[terminal,null],completionResultCleanups:[null,null]},
      trustedFail:(code,unknown)=>{throw Object.assign(Error(code),{unknown});},trustedCurrent:()=>{if(ownerPending)throw Error("trusted_node_original_reader_or_operation_busy");},
      trustedNative:{publishOwnCompletionReadyFixed:async(r,cap)=>{check(r===role&&cap===terminal,"producer publishes same own terminal");ownerPending=true;events.push("publish");await publishDone;ownerPending=false;}}
    };
    vm.createContext(b);
    vm.runInContext(between(http,"function completeUnfinished(","function runtime("),b);
    vm.runInContext(between(http,"  server.prependListener(\"request\",","  const accept=async"),b);
    vm.runInContext(between(http,"function waitOriginalCompletionProducerResponse(","function bindOriginalCompletionResponse("),b);
    vm.runInContext(between(bridge,"async function trustedPublishOriginalCompletion(","async function trustedProject("),b);
    server.emit("request",req,res);const item=requests.get(req);item.authenticated={own:true};
    assert.throws(()=>b.waitOriginalCompletionProducerResponse(role,{socket,method:"POST",url:"/bridge/result"}));check(!events.includes("publish"),"foreign producer req cannot join cleanup");
    const cleanup=b.waitOriginalCompletionProducerResponse(role,req);b.trustedReadDaemon.completionResultCleanups[0]={terminal,promise:cleanup};
    assert.throws(()=>b.waitOriginalCompletionProducerResponse(role,req));check(!events.includes("publish"),"producer lifecycle binding is once");
    // Reproduce the old state.resolve continuation immediately after writeJson.
    res.end(Buffer.from('{"ok":true}'));const result=b.trustedPublishOriginalCompletion(flight).catch(error=>error);
    await Promise.resolve();await Promise.resolve();check(!events.includes("publish")&&!ownerPending,"publication does not overlap original finish/terminal callback");
    const close=b.closeOriginalConnection(socketState);void close.catch(()=>{});
    if(!options.lost){check(events.includes("terminal")&&!events.includes("close"),"existing close awaits pending original terminal");releaseTerminal();
      for(let turn=0;turn<8;++turn)await Promise.resolve();check(events.includes("close")&&!events.includes("publish"),"pending original socket close blocks publication");
    }else releaseTerminal();
    releaseClose();await Promise.allSettled([close]);
    check(!events.includes("publish"),"known close promise alone does not invent socket close observation");
    if(options.foreignSocket)req.socket=new EventEmitter();socket.emit("close");
    for(let turn=0;turn<8;++turn)await Promise.resolve();
    if(options.lost||options.closeUnknown||options.foreignSocket){const error=await result;check(error instanceof Error||typeof error.message==="string","lost/foreign/unknown producer cleanup rejects");check(!events.includes("publish")&&!ownerPending,"bad producer cleanup emits no readiness/publication");}
    else{check(events.join(",")==="write,terminal,close,publish"&&ownerPending,"publisher starts only after same original terminal and native close settle");releasePublish();await result;check(flight.published&&!ownerPending,"delayed publisher callback completes without native busy refusal");}
    const duplicate=await b.trustedPublishOriginalCompletion(flight).catch(error=>error);check(duplicate.message==="owned_initial_original_completion_publication_join","no replay after successful or lost producer cleanup");
    check(events.filter(value=>value==="terminal").length===(options.lost?0:1)&&events.filter(value=>value==="close").length===1,"only existing once terminal/close operations used");
    check(!failures.some(error=>error.message==="trusted_node_original_reader_or_operation_busy"),"common native pending gate remains intact and never bypassed");
    await Promise.allSettled(observed);
  }
  await producerResponseRace();await producerResponseRace({lost:true});await producerResponseRace({closeUnknown:true});await producerResponseRace({foreignSocket:true});
  const current=between(broker,"bool CompletionCurrent(","std::array<std::uint8_t,586> CompletionBinding(");
  check(current.includes("requirePublished&&(!job.published||!job.terminalResultHashKnown")&&broker.includes("job->terminalResultHashKnown=true"),"C3 readiness cannot precede verified own opening");
  check(current.includes("hashes[static_cast<std::size_t>(note.sequence-1)]!=note.recordHash")&&current.includes("cas.sequence>=job.reservationSequence"),"historical seven Note prefix retained when fresh floor advances");
  check(native.includes("data_->completionStarts[candidate-1]")&&native.includes("start->call==originalStart")&&native.includes("!originalStart->spent_"),"arm binds exact originally issued/spent START object");
  console.log(JSON.stringify({ok:true,sourceVmChecks:passed,cpp:false,os:false,addon:false,effects:0}));
}
main().catch(error=>{console.error(error.stack||error);process.exitCode=1;});
