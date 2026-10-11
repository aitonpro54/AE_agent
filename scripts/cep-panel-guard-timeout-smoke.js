"use strict";
// Production request/control code with fake XHR, CDP readers and clock only.
// No HTTP, CEP, AE, child process, reload or provider activity.
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),os=require("node:os"),vm=require("node:vm"),crypto=require("node:crypto");
const contract=require("../cep-panel/panel-action-contract"),control=require("../mcp-server/cep-panel-control"),cli=require("./cep-panel-control"),bootstrap=require("../mcp-server/ae-agent-panel-bootstrap");
const source=fs.readFileSync(path.join(__dirname,"../cep-panel/panel.js"),"utf8"),start=source.indexOf("  function isFixedGuardLookup("),end=source.indexOf("  function refreshAppTitle()",start);
assert(start>=0 && end>start);
const ROOT=fs.mkdtempSync(path.join(os.tmpdir(),"cep-guard-timeout-")),checks=[],clone=v=>JSON.parse(JSON.stringify(v));
const nativePath=(requestId=crypto.randomUUID(),runId=crypto.randomUUID())=>"/ame/native-fixture-abandonment/lookup?requestId="+requestId+"&runId="+runId;
const routes=["/human-guard-settlement/lookup","/ame/fixture-ui-disposition/lookup",nativePath(),nativePath(),nativePath(),"/ame/native-fixture-prephase-recovery/lookup"];
function network(clock={now:0}) {
  const requests=[];
  function Xhr(){this.headers={};this.open=(method,url)=>{this.method=method;this.url=url;};this.setRequestHeader=(k,v)=>{this.headers[k]=v;};
    this.send=body=>{this.body=body;this.startedAt=clock.now;requests.push(this);};
    this.respond=()=>{this.readyState=4;this.status=200;this.responseText="{\"ok\":true}";this.onreadystatechange();};}
  const context=vm.createContext({window:{AEAgentPanelContract:contract},XMLHttpRequest:Xhr,bridgeHostAvailable:()=>true,getBaseUrl:()=>"http://127.0.0.1:8777",getToken:()=>"offline-panel-token",
    panelLifecycleEpoch:1,panelConnectionGeneration:1,makeBridgeOfflineError:()=>Object.assign(Error("offline timeout"),{status:0}),Error,JSON});
  vm.runInContext(source.slice(start,end),context);
  return {context,requests,request:(method,route,body,done)=>context.request(method,route,body,done)};
}
async function test(name,fn){await fn();checks.push(name);}
function fixture(name,{delay=59000}={}) {
  const directory=path.join(ROOT,name),clock={now:1000000},net=network(clock),installed={indexPath:path.join(ROOT,"CEP","extensions",bootstrap.TARGET.bundleId,"index.html"),hashes:{source:"offline"}},
    target={type:"page",url:require("node:url").pathToFileURL(installed.indexPath).href,webSocketDebuggerUrl:"ws://127.0.0.1:8870/devtools/page/offline"};
  const actor={panelInstanceId:"offline-panel",panelLifecycleEpoch:1,panelGeneration:"fixture"},budgets=[],expressions=[];
  let pending=false,result=null,sequence=0,guardIndex=0;
  function next(){net.request("GET",routes[guardIndex],null,error=>{if(error){pending=false;result={sequence,ok:false};return;}guardIndex++;if(guardIndex===routes.length){pending=false;result={sequence,ok:true};}else next();});}
  const api={protocolVersion:contract.PROTOCOL_VERSION,state:()=>({protocolVersion:contract.PROTOCOL_VERSION,...actor,actionStorage:"ready",activeAction:null,recoveryTransport:null,trustedGuardRefresh:{pending,sequence,result}}),
    refreshTrustedGuards(){assert.equal(arguments.length,0);pending=true;sequence++;guardIndex=0;next();return {accepted:true,sequence};}};
  const service=control.createPanelControlService({stateDir:directory,inspectInstalledTarget:()=>clone(installed),fetchCdpTargets:async(_port,budget)=>{budgets.push(budget);return [clone(target)];},
    evaluateViaCdp:async(_url,expression,budget)=>{budgets.push(budget);expressions.push(expression);
      if(pending && expression.includes("value:api.state(")){const xhr=net.requests[net.requests.length-1],wait=Math.max(0,delay-(clock.now-xhr.startedAt));clock.now+=Math.min(wait,budget);
        if(clock.now-xhr.startedAt>=xhr.timeout)xhr.ontimeout();else if(clock.now-xhr.startedAt>=delay)xhr.respond();}
      return clone(vm.runInNewContext(expression,{window:{AEAgentPanelActions:api}}));}});
  return {service,directory,clock,net,budgets,expressions,actor,get sequence(){return sequence;}};
}
async function withClock(f,fn){const now=Date.now;try{Date.now=()=>f.clock.now;return await fn();}finally{Date.now=now;}}
async function main(){
  for(const route of routes)await test("exact guard GET timeout60s: "+route,async()=>{const net=network();let result,calls=0;net.request("GET",route,null,(error,response)=>{result={error,response};calls++;});const xhr=net.requests[0];assert.equal(xhr.timeout,60000);assert.equal(xhr.body,null);assert.equal(xhr.headers["x-ae-bridge-token"],"offline-panel-token");xhr.respond();xhr.ontimeout();assert.equal(calls,1);assert.equal(result.error,null);assert.equal(result.response.ok,true);});
  const native=routes[2];
  for(const route of ["/human-guard-settlement/lookup?extra=1","/human-guard-settlement/lookup/","/ame/fixture-ui-disposition/lookup-extra","/ame/native-fixture-prephase-recovery/lookup?extra=1",native+"&extra=1",native.replace("requestId=","other="),native.replace(/runId=.*/,"runId=not-uuid"),native.replace("&runId=","#runId="),"/ame/native-fixture-abandonment/lookup","/health","/ame/native-fixture-prephase-recovery/maintenance-read-back"])
    await test("other GET keeps10s: "+route,async()=>{const net=network();net.request("GET",route,null,()=>{});assert.equal(net.requests[0].timeout,10000);});
  for(const route of [routes[0],routes[1],native,routes[5]])await test("guard POST keeps10s: "+route,async()=>{const net=network();net.request("POST",route,null,()=>{});assert.equal(net.requests[0].timeout,10000);});
  for(const [method,route,body,expected] of [["GET","/usage/refresh",null,15000],["POST","/agents/chat",{},120000],["GET","/agents/plan/current",null,120000],["POST","/agents/hardcore",{},120000],["POST","/tools/call",{name:"reconcile_plan_run"},120000],["GET",routes[0],{},10000]])
    await test("existing timeout unchanged: "+route+" "+method,async()=>{const net=network();net.request(method,route,body,()=>{});assert.equal(net.requests[0].timeout,expected);});
  await test("guard timeout and lifecycle interruption still fail closed once",async()=>{const net=network();let error,calls=0;net.request("GET",routes[0],null,e=>{error=e;calls++;});net.requests[0].ontimeout();net.requests[0].respond();assert.equal(calls,1);assert(error);assert.equal(error.isUnknown,false);
    const other=network();other.request("GET",routes[0],null,e=>{error=e;});other.context.panelLifecycleEpoch++;other.requests[0].respond();assert.equal(error.code,"lifecycle_interrupted");assert.equal(error.rejected,true);});
  await test("six sequential59s production GETs finish inside default420s with every CDP call<=60s",async()=>{const f=fixture("aggregate");const answer=await withClock(f,()=>f.service.refreshTrustedGuards());assert.equal(answer.ok,true,JSON.stringify(answer));assert.equal(answer.replayAllowed,false);assert.equal(f.sequence,1);assert.equal(f.clock.now-1000000,6*59000);assert.deepEqual(f.net.requests.map(r=>r.url.replace("http://127.0.0.1:8777","")),routes);assert(f.net.requests.every(r=>r.timeout===60000));assert(f.budgets.every(b=>b>0 && b<=60000));assert.equal(f.expressions.filter(e=>e.includes("value:api.refreshTrustedGuards(")).length,1);assert.equal(f.expressions.filter(e=>e.includes("api.invoke(")).length,0);assert(!fs.existsSync(path.join(f.directory,"controller.lock")));});
  await test("explicit short aggregate budget expires with one refresh send and no replay",async()=>{const f=fixture("short");const answer=await withClock(f,()=>f.service.refreshTrustedGuards({},60000));assert.equal(answer.code,"trusted_guard_refresh_timeout_no_replay");assert.equal(f.sequence,1);assert(f.budgets.every(b=>b>0 && b<=60000));assert(!fs.existsSync(path.join(f.directory,"controller.lock")));});
  await test("XHR60s timeout fails refresh without guard success or extra request",async()=>{const f=fixture("xhr-timeout",{delay:60000});const answer=await withClock(f,()=>f.service.refreshTrustedGuards());assert.equal(answer.code,"trusted_guard_refresh_changed_or_failed");assert.equal(f.sequence,1);assert.equal(f.net.requests.length,1);assert(!fs.existsSync(path.join(f.directory,"controller.lock")));});
  await test("extended budget validation is exclusive to fixed refresh and CLI",async()=>{assert.equal(control.TRUSTED_GUARD_REFRESH_TIMEOUT_MS,420000);const f=fixture("invalid");for(const value of [0,-1,420001,NaN,Infinity,"420000",null])assert.equal((await f.service.refreshTrustedGuards({},value)).code,"invalid_timeout");assert.equal(f.expressions.length,0);assert.equal(fs.existsSync(f.directory),false);
    assert.equal(cli.parseCliArgs(["node","cli","refresh-guards","--timeout","420000"]).timeoutMs,420000);assert.throws(()=>cli.parseCliArgs(["node","cli","refresh-guards","--timeout","420001"]),/invalid_timeout/);
    for(const command of ["catalog","state","result","invoke"])assert.throws(()=>cli.parseCliArgs(["node","cli",command,"--timeout","60001"]),/invalid_timeout/);
    assert.throws(()=>control.validateRawInvokeInput({requestId:crypto.randomUUID(),action:"ui.sidebar.set",args:{collapsed:true},timeoutMs:60001}),/invalid_timeout/);
    assert.equal((await f.service.state({},60001)).code,"invalid_timeout");assert.equal((await f.service.catalog(60001)).code,"invalid_timeout");assert.equal(f.expressions.length,0);
    let called=0;await cli.run(["node","cli","refresh-guards","--timeout","420000"],()=>({refreshTrustedGuards:async(args,budget)=>{assert.deepEqual(args,{});assert.equal(budget,420000);called++;return {ok:true};}}));assert.equal(called,1);});
  console.log(JSON.stringify({ok:true,checks:checks.length,names:checks,scope:"offline production request/service + fake XHR/CDP/clock; no HTTP/CEP/AE/process/reload/providers"}));
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;}).finally(()=>{assert.equal(path.dirname(ROOT),path.resolve(os.tmpdir()));assert(path.basename(ROOT).startsWith("cep-guard-timeout-"));fs.rmSync(ROOT,{recursive:true,force:true});});
