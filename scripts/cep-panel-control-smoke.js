"use strict";
// Actual production CEP service in VM; fake CDP/WS and isolated loopback HTTP/stdio.
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),os=require("node:os"),crypto=require("node:crypto"),vm=require("node:vm"),http=require("node:http");
const {spawn,spawnSync}=require("node:child_process");
const control=require("../mcp-server/cep-panel-control"),contract=require("../cep-panel/panel-action-contract");
const {createPanelEnvironment}=require("./cep-plan-refresh-smoke"),bootstrap=require("../mcp-server/ae-agent-panel-bootstrap");
const {runtimeIdentity}=require("../mcp-server/review-evidence"),network=require("./network-test-fixture");
const root=fs.mkdtempSync(path.join(os.tmpdir(),"cep-control-smoke-")),cases=[];
const source=fs.readFileSync(path.resolve(__dirname,"../cep-panel/panel.js"),"utf8"),protocolVersion=control.PROTOCOL_VERSION;
const clone=value=>JSON.parse(JSON.stringify(value));
const input=(action="ui.sidebar.set",args={collapsed:true})=>({protocolVersion,requestId:crypto.randomUUID(),action,args});
async function test(name,fn){await fn();cases.push(name);}
function fixture(name,extra={}) {
  const env=createPanelEnvironment(source),directory=path.join(root,name),indexPath=path.join(root,"CEP","extensions",bootstrap.TARGET.bundleId,"index.html");
  const installed={indexPath,hashes:{source:"fixture"}},page={type:"page",url:require("node:url").pathToFileURL(indexPath).href,webSocketDebuggerUrl:"ws://127.0.0.1:8870/devtools/page/fake"};
  let sends=0,reads=0;const expressions=[];
  const service=control.createPanelControlService({stateDir:directory,inspectInstalledTarget:()=>installed,
    fetchCdpTargets:async()=>[page],evaluateViaCdp:async(_url,expression)=>{
      expressions.push(expression);if(expression.includes("api.invoke("))sends++;else reads++;
      return clone(vm.runInContext(expression,env.context));
    },...extra});
  return {env,directory,installed,page,service,expressions,sends:()=>sends,reads:()=>reads};
}
async function main() {
  await test("strict validation precedes paths/writes/CDP, no ignored options/accessors/coercion",async()=>{
    const f=fixture("strict"),good=input();
    const invalid=[
      {...good,requestId:"../../escape"}, {...good,requestId:good.requestId.toUpperCase()}, {...good,protocolVersion:"other"}, {...good,args:null},
      {...good,args:{collapsed:"true"}}, {...good,ignored:true}, {...good,wait:"true"},
      {...good,timeoutMs:"12"}, {...good,expectedState:null}, {...good,expectedState:{panelGeneration:1}},
      {...good,expectedState:{panelInstanceId:"x",token:"secret"}},
      Object.assign(Object.create({foreign:true}),good),
      JSON.parse(JSON.stringify(good).replace('"args":{','"args":{"__proto__":{},'))
    ];
    let access=0;const getter={...good};Object.defineProperty(getter,"requestId",{get(){access++;return good.requestId;}});invalid.push(getter);
    for(const value of invalid){const result=await f.service.invoke(value);assert.equal(result.ok,false);}
    for(const options of [{ignore:true},{wait:1},{timeoutMs:0},{timeoutMs:NaN}])assert.equal((await f.service.invoke(good,options)).ok,false);
    assert.equal(access,0);assert.equal(fs.existsSync(f.directory),false);assert.equal(f.sends()+f.reads(),0);
    assert.equal((await f.service.handleTool("get_panel_action_result",{requestId:good.requestId,extra:true})).ok,false);
    assert.equal((await f.service.state({extra:true})).ok,false);
    assert.throws(()=>control.createPanelControlService({cdpPort:19999}),/fixed_cdp_port_required/);
  });
  await test("actual VM fixed catalog/state/handler receipts and SHA256 duplicate identity",async()=>{
    const f=fixture("actual"),e=input("ui.diagnostics.set",{open:true});
    const catalog=await f.service.catalog();assert.equal(catalog.ok,true,JSON.stringify(catalog));assert.equal(catalog.actions.length,48);
    const state=(await f.service.state()).state;assert.equal(state.panelInstanceId,f.env.api.state().panelInstanceId);
    const first=await f.service.invoke(e);assert.equal(first.ok,true);assert.equal(first.receipt.requestId,e.requestId);assert.equal(first.receipt.state,"completed");
    assert.equal(first.receipt.result.open,true);assert.equal(fs.existsSync(path.join(f.directory,e.requestId+".json")),true);
    assert.equal((await f.service.invoke(e)).replayed,false);assert.equal(f.sends(),1);
    assert.equal((await f.service.invoke({...e,args:{open:false}})).code,"duplicate_request_id_conflict");assert.equal(f.sends(),1);
    const read=await f.service.getResult(e.requestId);assert.equal(read.ok,true);assert.equal(read.receipt.requestId,e.requestId);assert.equal(read.receipt.result.open,true);
    const stored=JSON.parse(fs.readFileSync(path.join(f.directory,e.requestId+".json"),"utf8"));assert.match(stored.signature,/^[a-f0-9]{64}$/);
    assert.equal(stored.signature,control.computeActionSignature(e));assert.equal(first.receipt.signature,undefined);
    assert(f.expressions.every(expression=>!expression.includes("querySelector") && !expression.includes("eval(")));
  });
  await test("write-only credentials and prompt never persist or echo",async()=>{
    const f=fixture("redaction"),secret="private-key-value-98463";
    const e=input("bridge.configure",{panelToken:secret});assert.equal((await f.service.invoke(e)).ok,true);
    const text=fs.readdirSync(f.directory).map(name=>fs.readFileSync(path.join(f.directory,name),"utf8")).join("\n");
    assert.equal(text.includes(secret),false);
    assert.equal((await f.service.invoke({...e,args:{panelToken:"a different secret"}})).replayed,false);assert.equal(f.sends(),1,"Unknown secret equality cannot permit replay");
    const prompt=input("chat.prompt.set",{prompt:"ordinary text must not persist in transport signature"});
    assert.equal((await f.service.invoke(prompt)).ok,true);
    assert.equal(fs.readFileSync(path.join(f.directory,prompt.requestId+".json"),"utf8").includes(prompt.args.prompt),false);
  });
  await test("corrupt and selectively missing durable records are unknown, never absent or replayed",async()=>{
    for(const mode of ["corrupt","missing","index","missing-index"]) {
      const f=fixture("broken-"+mode),e=input();assert.equal((await f.service.invoke(e)).ok,true);
      const file=path.join(f.directory,e.requestId+".json"),idx=path.join(f.directory,"identities.json");
      if(mode==="corrupt")fs.writeFileSync(file,"{bad");
      if(mode==="missing")fs.unlinkSync(file);
      if(mode==="index")fs.writeFileSync(idx,"{bad");
      if(mode==="missing-index")fs.unlinkSync(idx);
      const restored=fixture("broken-"+mode),result=await restored.service.invoke(e);
      assert.equal(result.ok,false);assert.equal(result.receipt.state,"unknown");assert.equal(restored.sends(),0);
      assert.equal((await restored.service.invoke(input())).ok,false,"New UUID cannot evade missing/corrupt durable evidence");
    }
  });
  await test("fresh exact binding, protocol/identity/state validation and changed target fail closed",async()=>{
    const wrong=fixture("wrong-expected"),state=(await wrong.service.state()).state;
    assert.equal((await wrong.service.invoke({...input(),expectedState:{panelInstanceId:"another"}})).code,"expected_state_mismatch");assert.equal(wrong.sends(),0);
    for(const [field,value] of [["requestId",crypto.randomUUID()],["action","ui.diagnostics.set"],["protocolVersion","fake"],
      ["panelInstanceId","foreign"],["epoch",77],["generation","foreign"],["state","banana"],["replayAllowed",true]]) {
      let f;f=fixture("foreign-"+field,{evaluateViaCdp:async(_url,expr)=>{
        const result=clone(vm.runInContext(expr,f.env.context));if(expr.includes("api.invoke(")) result.value[field]=value;return result;
      }});
      const e=input(),result=await f.service.invoke(e);assert.equal(result.ok,false,field);assert.equal(result.receipt.state,"unknown",field);
      const count=f.expressions.length;await f.service.invoke(e);assert.equal(f.expressions.length,count);
    }
    for(const shape of [null,{}, {ok:true}, {ok:true,value:null}]) {
      let f;f=fixture("shape-"+crypto.randomUUID(),{evaluateViaCdp:async(_url,expr)=>expr.includes("api.invoke(")?shape:clone(vm.runInContext(expr,f.env.context))});
      assert.equal((await f.service.invoke(input())).receipt.state,"unknown");
    }
    let identity=0;const target=fixture("changed-target",{inspectInstalledTarget:()=>({indexPath:path.join(root,"CEP","extensions",bootstrap.TARGET.bundleId,"index.html"),hashes:{source:++identity<2?"a":"b"}})});
    assert.equal((await target.service.invoke(input())).code,"panel_target_changed");assert.equal(target.sends(),0);
  });
  await test("post-send close/timeout is unknown; passive result validates historical original binding",async()=>{
    let f;f=fixture("unknown",{evaluateViaCdp:async(_url,expr)=>{
      if(expr.includes("api.invoke(")){vm.runInContext(expr,f.env.context);throw Object.assign(Error("private failure"),{code:"cdp_socket_closed"});}
      return clone(vm.runInContext(expr,f.env.context));
    }});
    const e=input(),failed=await f.service.invoke(e);assert.equal(failed.receipt.state,"unknown");assert.equal(failed.ok,false);
    assert.equal((await f.service.invoke(e)).receipt.state,"unknown");assert.equal((await f.service.invoke(input())).code,"transport_reconciliation_required");
    const read=await f.service.getResult(e.requestId);assert.equal(read.receipt.state,"completed");assert.equal(read.receipt.requestId,e.requestId);
    const historical=f.env.api.getResult(e.requestId),newPanel=fixture("unknown");
    const recovered=control.createPanelControlService({stateDir:f.directory,inspectInstalledTarget:()=>f.installed,fetchCdpTargets:async()=>[f.page],
      evaluateViaCdp:async(_url,expr)=>expr.includes("api.getResult(")?{ok:true,value:historical}:clone(vm.runInContext(expr,newPanel.env.context))});
    assert.equal((await recovered.getResult(e.requestId)).receipt.panelInstanceId,historical.panelInstanceId,"A historical receipt keeps its original binding after reload");
  });
  await test("passive timeout permits effects; mutating timeout and corrupt passive identity still block",async()=>{
    let passive;passive=fixture("passive-timeout",{evaluateViaCdp:async(_url,expr)=>{
      const value=clone(vm.runInContext(expr,passive.env.context));
      if(expr.includes("api.invoke(") && expr.includes('"action":"logs.get"'))throw Object.assign(Error(),{code:"cdp_timeout"});
      return value;
    }});
    const read=await passive.service.invoke(input("logs.get",{}));assert.equal(read.receipt.state,"unknown");
    assert.equal((await passive.service.invoke(input())).ok,true,"Known passive read uncertainty is not an effect lock");
    let mutation;mutation=fixture("mutation-timeout",{evaluateViaCdp:async(_url,expr)=>{
      const value=clone(vm.runInContext(expr,mutation.env.context));
      if(expr.includes("api.invoke("))throw Object.assign(Error(),{code:"cdp_timeout"});
      return value;
    }});
    assert.equal((await mutation.service.invoke(input())).receipt.state,"unknown");
    assert.equal((await mutation.service.invoke(input("ui.diagnostics.set",{open:true}))).code,"transport_reconciliation_required");
    const corrupt=fixture("passive-corrupt"),e=input("logs.get",{});assert.equal((await corrupt.service.invoke(e)).ok,true);
    fs.writeFileSync(path.join(corrupt.directory,e.requestId+".json"),"{bad");
    assert.equal((await corrupt.service.invoke(input())).code,"transport_reconciliation_required","Corrupt passive identity is still fail closed");
  });
  await test("persistence failure before send fails closed; after effect returns unknown without replay",async()=>{
    let writes=0;const before=fixture("persist-before",{persistReceipt(){throw Error("private storage error");}});
    const first=await before.service.invoke(input());assert.equal(first.ok,false);assert.equal(first.receipt.state,"rejected");
    assert.equal(first.receipt.delivery,"not_submitted");assert.equal(before.sends(),0);
    const f=fixture("persist-after",{persistReceipt(directory,row){writes++;if(writes>=3)throw Error("write after effect");control.saveDurableReceipt(directory,row);}});
    const e=input(),value=await f.service.invoke(e);assert.equal(value.ok,false);assert.equal(value.receipt.state,"unknown");assert.equal(value.receipt.replayAllowed,false);
    assert.equal(f.sends(),1);assert.equal((await f.service.invoke(e)).replayed,false);assert.equal(f.sends(),1);
  });
  await test("independent process controllers share atomic lock; no live/orphan owner takeover",async()=>{
    const directory=path.join(root,"cross-process"),id=crypto.randomUUID();
    const child=spawn(process.execPath,["-e",
      "const c=require("+JSON.stringify(path.resolve(__dirname,"../mcp-server/cep-panel-control.js"))+");const claim=c.acquireControllerLock(process.argv[1],process.argv[2]);process.stdout.write('ready\\n');process.stdin.on('data',()=>{claim.release();process.exit(0);});",
      directory,id],{stdio:["pipe","pipe","pipe"],windowsHide:true});
    try {
      await new Promise((resolve,reject)=>{child.stdout.once("data",resolve);child.once("error",reject);child.once("exit",code=>reject(Error("lock child exited "+code)));});
      assert.throws(()=>control.acquireControllerLock(directory,crypto.randomUUID()),/transport_busy/);
      const owner=JSON.parse(fs.readFileSync(path.join(directory,"controller.lock"),"utf8"));assert.equal(owner.pid,child.pid);
      const peer=fixture("cross-process");assert.equal((await peer.service.invoke(input())).code,"transport_busy");assert.equal(peer.sends()+peer.reads(),0);
    }finally {child.stdin.write("release");await new Promise(resolve=>child.once("exit",resolve));}
    const claim=control.acquireControllerLock(directory,crypto.randomUUID());claim.release();
    fs.writeFileSync(path.join(directory,"controller.lock"),JSON.stringify({pid:2147483647,requestId:id,token:crypto.randomUUID()}));
    assert.throws(()=>control.acquireControllerLock(directory,crypto.randomUUID()),/transport_busy/);
  });
  await test("strict CLI flags/bounds/no secret parser echo, help offline, input retained",async()=>{
    const cli=path.resolve(__dirname,"cep-panel-control.js");
    const launch=args=>spawnSync(process.execPath,[cli,...args],{encoding:"utf8",windowsHide:true,env:{...process.env,NODE_ENV:"test",CEP_PANEL_CDP_PORT:"19999",CEP_PANEL_CONTROL_TEST_PORT:"19999"}});
    assert.equal(JSON.parse(launch(["help"]).stdout).command,"help");
    for(const flag of ["--expression","--selector","--url","--token","--script"])assert.equal(JSON.parse(launch(["catalog",flag]).stdout).code,"forbidden_cli_flag");
    for(const args of [["catalog","--port","19999"],["help","--timeout","1"],["catalog","--timeout","1","--timeout","2"],
      ["catalog","extra"],["state","--input","anything"],["catalog","--timeout","1e3"],["result","--request-id","bad"]])assert.equal(launch(args).status,1);
    const file=path.join(root,"private-input.json");fs.writeFileSync(file,'{"key":"never-echo-this-secret",');
    const invalid=launch(["invoke","--input",file]);assert.equal(invalid.status,1);assert.equal(invalid.stdout.includes("never-echo"),false);assert(fs.existsSync(file));
    fs.writeFileSync(file,JSON.stringify({action:"ui.sidebar.set",args:{collapsed:true}}));
    assert.equal(JSON.parse(launch(["invoke","--input",file]).stdout).code,"invalid_request_id");
    fs.writeFileSync(file,"x".repeat(65537));assert.equal(JSON.parse(launch(["invoke","--input",file]).stdout).code,"input_file_too_large");
  });
  await test("installed exact assets and target boundaries, no fallback",async()=>{
    const installedRoot=path.join(root,"CEP","extensions"),copyRoot=path.join(installedRoot,bootstrap.TARGET.bundleId),sourceRoot=path.resolve(__dirname,"../cep-panel");
    fs.mkdirSync(installedRoot,{recursive:true});fs.cpSync(sourceRoot,copyRoot,{recursive:true});
    const actual=bootstrap.inspectInstalledTarget([installedRoot],sourceRoot);
    assert(actual.hashes["panel-action-contract.js"]);assert(actual.hashes["panel-actions.js"]);
    const url=require("node:url").pathToFileURL(actual.indexPath).href;
    for(const ws of ["ws://foreign:8870/devtools/page/a","ws://127.0.0.1:19999/devtools/page/a","ws://user:secret@127.0.0.1:8870/devtools/page/a","ws://127.0.0.1:8870/devtools/page/a?q=1"])
      assert.throws(()=>bootstrap.exactCdpTarget([{type:"page",url,webSocketDebuggerUrl:ws}],actual));
    assert.throws(()=>bootstrap.exactCdpTarget([1,2].map(i=>({type:"page",url,webSocketDebuggerUrl:"ws://127.0.0.1:8870/devtools/page/"+i})),actual));
    fs.appendFileSync(path.join(copyRoot,"panel-actions.js"),"\n// changed");
    assert.throws(()=>bootstrap.inspectInstalledTarget([installedRoot],sourceRoot),{code:"installed_panel_source_mismatch"});
    const runtime=runtimeIdentity(path.resolve(__dirname,".."));assert(runtime.modules.some(row=>row.name==="mcp-server/cep-panel-control.js"));assert(runtime.modules.some(row=>row.name==="cep-panel/panel-action-contract.js"));
  });
  await test("fixed CDP frames, deadline and socket close settle exactly once",async()=>{
    for(const mode of ["ok","close","timeout","exception","invalid"]) {
      let closed=0,sends=0;
      class FakeSocket {
        constructor(){queueMicrotask(()=>this.onopen?.());}
        send(text){sends++;const body=JSON.parse(text);assert.equal(body.method,"Runtime.evaluate");assert.equal(body.params.awaitPromise,false);
          if(mode==="close")queueMicrotask(()=>this.onclose?.());
          if(mode==="ok")queueMicrotask(()=>this.onmessage?.({data:JSON.stringify({id:1,result:{result:{value:{ok:true}}}})}));
          if(mode==="exception")queueMicrotask(()=>this.onmessage?.({data:JSON.stringify({id:1,result:{exceptionDetails:{text:"private secret"}}})}));
          if(mode==="invalid")queueMicrotask(()=>this.onmessage?.({data:"bad"}));
        }
        close(){closed++;}
      }
      const result=await control.evaluateViaWebSocket("ws://127.0.0.1:8870/devtools/page/fake","fixed",20,FakeSocket).then(value=>value,error=>({code:error.code}));
      assert.equal(sends,1);assert.equal(closed,1);if(mode==="ok")assert.equal(result.ok,true);else assert(result.code);
    }
    const server=http.createServer((_req,res)=>res.end(JSON.stringify([])));await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
    try {assert.deepEqual(await control.fetchCdpTargets(server.address().port,100),[]);}finally{await new Promise(resolve=>server.close(resolve));}
  });
  await test("actual source/role boundary and stdio-discoverable tools on isolated daemon",async()=>{
    const daemon=require("../mcp-server/bridge-daemon");
    for(const source of ["direct-tools-call","dev-admin","connector","mcp-adapter"]) {
      const result=await daemon.callToolLogged(source,"invoke_panel_action",input());
      assert.equal(JSON.parse(result.content[0].text).reason,"official_mcp_adapter_required");
    }
    assert.equal(JSON.parse((await daemon.callTool("invoke_panel_action",input())).content[0].text).reason,"official_mcp_adapter_required");
    for(const tool of control.panelControlTools){assert(daemon.exposedTools().some(row=>row.name===tool.name));assert.equal(tool.inputSchema.additionalProperties,false);}
    assert.equal(control.panelControlTools.find(row=>row.name==="invoke_panel_action").annotations.destructiveHint,true);
    const f=await network.startDaemon({automationToken:"fixture-auto",panelToken:"fixture-panel",adminToken:"fixture-admin",devAdmin:true});
    try {
      const body={name:"invoke_panel_action",arguments:{requestId:"invalid",action:"ui.sidebar.set",args:{collapsed:true}}};
      assert.equal((await f.request({path:"/mcp/tools/call",token:"fixture-auto",body})).status,403);
      assert.equal((await f.request({path:"/mcp/tools/call",token:"fixture-panel",headers:{"x-ae-mcp-adapter":"codex-stdio-v1"},body})).status,403);
      const official=await f.request({path:"/mcp/tools/call",token:"fixture-auto",headers:{"x-ae-mcp-adapter":"codex-stdio-v1"},body});
      assert.equal(official.status,200);assert.equal(JSON.parse(official.body.result.content[0].text).code,"invalid_request_id");
      const direct=await f.request({path:"/tools/call",token:"fixture-panel",body});
      assert.equal(JSON.parse(direct.body.result.content[0].text).reason,"official_mcp_adapter_required");
    } finally {await f.stop();}
  });
  console.log(JSON.stringify({ok:true,testCases:cases.length,scenarios:cases,scope:"offline VM/fake CDP + isolated ephemeral HTTP/child-process; no live CEP/AE/providers"}));
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;}).finally(()=>{
  assert.equal(path.dirname(root),path.resolve(os.tmpdir()));assert(path.basename(root).startsWith("cep-control-smoke-"));fs.rmSync(root,{recursive:true,force:true});
});
