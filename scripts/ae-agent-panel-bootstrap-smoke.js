"use strict";
// Offline only: native subprocess/CDP dependencies are replaced, HTTP uses an isolated fake panel.
const assert=require("assert/strict"),fs=require("fs"),path=require("path"),os=require("os"),vm=require("vm"),crypto=require("crypto");
const {spawn,execFile}=require("child_process");
const b=require("../mcp-server/ae-agent-panel-bootstrap");
const {startDaemon,pollPanel,completeProjectInfoCommand,pause}=require("./network-test-fixture");
const sourceRoot=path.resolve(__dirname,"..","cep-panel");
const AE={pid:11,executable:"C:\\Adobe\\Support Files\\AfterFX.exe",createdAt:"2026-10-06T00:00:00Z"};
let cases=0;
function test(name,run) {run();cases++;}
async function asyncTest(name,run) {await run();cases++;}
function executeJsx(script,options={}) {
  const receipts=[], commands=[],lookups=[]; let exists=false;
  function File(p){this.path=p;Object.defineProperty(this,"exists",{get:()=>exists});this.open=()=>options.writable!==false;this.write=s=>{exists=true;const row=JSON.parse(s);receipts.push(row);if(options.write) options.write(p,s);return true;};this.close=()=>{};}
  let tick=options.at===undefined ? Date.now() : options.at;
  function Clock(){this.getTime=()=>{const t=tick;tick+=options.tick || 0;return t;};}
  const app={findMenuCommandId:title=>{lookups.push(title);return options.id===undefined ? 17 : options.id;},executeCommand:id=>{commands.push(id);if(options.throwExecute) throw Error("unknown");}};
  Object.defineProperty(app,"project",{get:()=>{throw Error("Project access forbidden");}});
  if(options.unsupported) delete app.executeCommand;
  vm.runInNewContext(script,{File,app,Date:Clock,Math,Error},{timeout:1000});
  return {receipts,commands,lookups};
}
function harness(root,overrides={}) {
  const stateDir=path.join(root,crypto.randomUUID());let clock=Date.now(),spawned=0,reloaded=0,reads=0,discoveries=0;
  let status={panelConnected:false,pendingCommands:0,inflightCommands:[],projectLifecycle:{blocked:false,pending:null,problem:null},lastPanelInfo:{panelConnectionId:"fixed-panel",panelGeneration:"1"}};
  const target={...b.TARGET,root:path.join(root,"Adobe","CEP","extensions",b.TARGET.bundleId),indexPath:path.join(root,"Adobe","CEP","extensions",b.TARGET.bundleId,"index.html"),hashes:{manifest:"fixed"}};
  const deps={stateDir,getStatus:()=>status,now:()=>clock,pause:async ms=>{clock+=ms;},
    discoverAE:async()=>{discoveries++;return [AE];},inspectInstalled:()=>target,assertNoCollision:()=>{},discoverCdp:async()=>[],
    readProject:async()=>{reads++;return {file:"C:/Synthetic/Unchanged.aep",numItems:427};},
    dispatchNative:async(ae,scriptPath)=>{spawned++;const script=fs.readFileSync(scriptPath,"utf8");const r=executeJsx(script,{at:clock,write:(p,s)=>fs.writeFileSync(p,s)});assert.deepEqual(r.commands,[17]);status={...status,panelConnected:true};return {cliPid:99};},
    reconnectCdp:async(t,ms,before)=>{await before();reloaded++;status={...status,panelConnected:true};},...overrides};
  return {service:b.createPanelBootstrapService(deps),deps,target,setStatus:v=>{status={...status,...v};},advance:ms=>{clock+=ms;},counts:()=>({spawned,reloaded,reads,discoveries}),dir:stateDir};
}
async function unitTests(root) {
  test("absent",()=>assert.throws(()=>b.selectRunningAE([]),{code:"ae_not_running"}));
  test("ambiguous hwnd0",()=>assert.throws(()=>b.selectRunningAE([AE,{...AE,pid:12,mainWindowHandle:0,commandLine:"AfterFX.exe -m"}]),{code:"ae_instance_ambiguous"}));
  test("unproven executable",()=>assert.throws(()=>b.selectRunningAE([{...AE,executable:"AfterFX.exe"}]),{code:"ae_process_identity_unproven"}));
  for(const key of ["script","jsx","path","executable","commandId","extensionId","probeOnly","confirm"]) test("reject "+key,()=>assert.throws(()=>b.validateInput({[key]:"arbitrary"}),{code:"invalid_bootstrap_arguments"}));
  for(const timeoutMs of [0,30001,1.5,"100",null]) test("timeout type",()=>assert.throws(()=>b.validateInput({timeoutMs}),{code:"invalid_bootstrap_timeout"}));
  for(const properties of [{pendingCommands:1},{inflightCommands:[{state:"unknown"}]},{projectLifecycle:{blocked:true,pending:null}},{projectLifecycle:{blocked:false,pending:{status:"unknown"}}},{projectLifecycle:null},{planExecutionState:"confirmed"},{planExecutionState:"executing"}]) await asyncTest("idle guard",async()=>{const h=harness(root);h.setStatus(properties);const r=await h.service.ensure({timeoutMs:100});assert.equal(r.status,"failure");assert.equal(h.counts().spawned+h.counts().reloaded+h.counts().reads,0);});
  await asyncTest("absent native",async()=>{const h=harness(root,{discoverAE:async()=>[]});assert.equal((await h.service.ensure({timeoutMs:100})).reason,"ae_not_running");});
  await asyncTest("already connected no discovery/native/reload",async()=>{const h=harness(root);h.setStatus({panelConnected:true,activeEditSession:{id:"manual"}});const r=await h.service.ensure({timeoutMs:100});assert.equal(r.status,"already_connected");assert.equal(r.projectInfo.numItems,427);assert.deepEqual(h.counts(),{spawned:0,reloaded:0,reads:1,discoveries:0});});
  await asyncTest("opened exact fixed JSX",async()=>{const h=harness(root);const r=await h.service.ensure({timeoutMs:100});assert.equal(r.status,"opened",JSON.stringify(r));assert.equal(h.counts().spawned,1);assert.equal(h.service.snapshot().ack.state,"executed");assert.equal((await h.service.ensure({timeoutMs:100})).status,"already_connected");assert.equal(h.counts().spawned,1);});
  await asyncTest("unknown restart prevents repeat",async()=>{let dispatched=0;const h=harness(root,{dispatchNative:async()=>{dispatched++;return {cliPid:99};}});let r=await h.service.ensure({timeoutMs:10});assert.equal(r.reason,"bootstrap_timeout");r=await b.createPanelBootstrapService(h.deps).ensure({timeoutMs:10});assert.equal(r.reason,"bootstrap_submitted_unknown");assert.equal(dispatched,1);});
  await asyncTest("expired receipt reconciles without replay",async()=>{const h=harness(root,{dispatchNative:async(ae,p)=>{executeJsx(fs.readFileSync(p,"utf8"),{at:Date.now()+10000,write:(f,s)=>fs.writeFileSync(f,s)});return {};}});const r=await h.service.ensure({timeoutMs:10});assert.equal(r.reason,"native_expired");assert.equal(h.service.snapshot().stage,"not_executed");});
  await asyncTest("project read timeout durable",async()=>{let readCount=0;const h=harness(root,{readProject:()=>{readCount++;return new Promise(()=>{});}});h.setStatus({panelConnected:true});assert.equal((await h.service.ensure({timeoutMs:10})).reason,"project_read_timeout");assert.equal((await b.createPanelBootstrapService(h.deps).ensure({timeoutMs:10})).reason,"project_read_unknown");assert.equal(readCount,1);});
  await asyncTest("expired read budget never persists false unknown",async()=>{let calls=0;const h=harness(root,{now:()=>++calls===1 ? 0 : 20});h.setStatus({panelConnected:true});assert.equal((await h.service.ensure({timeoutMs:10})).reason,"bootstrap_timeout");assert.equal(h.counts().reads,0);assert.equal(h.service.snapshot(),null);assert.equal((await h.service.ensure({timeoutMs:100})).status,"already_connected");assert.equal(h.counts().reads,1);});
  await asyncTest("known read before_delivery allows fresh retry",async()=>{let calls=0;const h=harness(root,{readProject:async()=>{if(++calls===1)throw Object.assign(Error("not delivered"),{code:"known_no_delivery",phase:"before_delivery"});return {file:null,numItems:0};}});h.setStatus({panelConnected:true});assert.equal((await h.service.ensure({timeoutMs:100})).reason,"known_no_delivery");assert.equal(h.service.snapshot().stage,"project_read_not_delivered");assert.equal((await b.createPanelBootstrapService(h.deps).ensure({timeoutMs:100})).status,"already_connected");assert.equal(calls,2);});
  await asyncTest("expired_before_delivery lifecycle permits fresh read",async()=>{let calls=0;const h=harness(root,{readProject:async()=>{if(++calls===1)throw Object.assign(Error("not delivered"),{code:"expired_before_delivery",lifecycleState:"expired_before_delivery"});return {file:null,numItems:0};}});h.setStatus({panelConnected:true});assert.equal((await h.service.ensure({timeoutMs:100})).reason,"expired_before_delivery");assert.equal(h.service.snapshot().stage,"project_read_not_delivered");assert.equal((await b.createPanelBootstrapService(h.deps).ensure({timeoutMs:100})).status,"already_connected");assert.equal(calls,2);});
  await asyncTest("serialization",async()=>{let finish;const h=harness(root,{readProject:()=>new Promise(r=>{finish=r;})});h.setStatus({panelConnected:true});const first=h.service.ensure({timeoutMs:200});await pause(1);assert.equal((await h.service.ensure({timeoutMs:100})).reason,"bootstrap_busy");finish({file:null,numItems:0});assert.equal((await first).status,"already_connected");});
  await asyncTest("identity changed before spawn",async()=>{let n=0;const h=harness(root,{discoverAE:async()=>[{...AE,pid:++n===1 ? 11 : 12}]});assert.equal((await h.service.ensure({timeoutMs:100})).reason,"ae_process_identity_changed");assert.equal(h.counts().spawned,0);assert.equal(h.service.snapshot().stage,"not_executed");});
  await asyncTest("busy immediately before spawn",async()=>{let n=0,h;h=harness(root,{discoverAE:async()=>{if(++n===2)h.setStatus({inflightCommands:[{state:"unknown"}]});return [AE];}});assert.equal((await h.service.ensure({timeoutMs:100})).reason,"bridge_commands_unfinished");assert.equal(h.counts().spawned,0);});
  await asyncTest("installed changed before spawn",async()=>{let n=0,h;h=harness(root,{inspectInstalled:()=>({...h.target,hashes:{manifest:++n===1 ? "fixed" : "changed"}})});assert.equal((await h.service.ensure({timeoutMs:100})).reason,"installed_panel_changed");assert.equal(h.counts().spawned,0);});
  await asyncTest("connected read connection changed",async()=>{let h;h=harness(root,{readProject:async()=>{h.setStatus({lastPanelInfo:{panelConnectionId:"different",panelGeneration:"2"}});return {file:null,numItems:0};}});h.setStatus({panelConnected:true});assert.equal((await h.service.ensure({timeoutMs:100})).reason,"panel_connection_changed");assert.equal(h.service.snapshot().stage,"project_read_unknown");});
  await asyncTest("corrupt durable record blocks dispatch",async()=>{const h=harness(root);fs.mkdirSync(h.dir);fs.writeFileSync(path.join(h.dir,"attempt.json"),"bad json");assert.equal((await h.service.ensure({timeoutMs:100})).reason,"bootstrap_record_corrupt");assert.equal(h.counts().spawned,0);});
  await asyncTest("reconnected exact CDP no native",async()=>{const h=harness(root);const url=require("url").pathToFileURL(h.target.indexPath).href;h.deps.discoverCdp=async()=>[{type:"page",url,webSocketDebuggerUrl:"ws://127.0.0.1:8870/devtools/page/fixed"}];const r=await b.createPanelBootstrapService(h.deps).ensure({timeoutMs:100});assert.equal(r.status,"reconnected",JSON.stringify(r));assert.equal(h.counts().spawned,0);assert.equal(h.counts().reloaded,1);});
  await asyncTest("CDP unknown no replay",async()=>{const h=harness(root);h.deps.discoverCdp=async()=>[{type:"page",url:require("url").pathToFileURL(h.target.indexPath).href,webSocketDebuggerUrl:"ws://127.0.0.1:8870/devtools/page/fixed"}];let reloads=0;h.deps.reconnectCdp=async(t,ms,before)=>{await before();reloads++;throw Object.assign(Error(),{code:"cdp_reload_unknown"});};assert.equal((await b.createPanelBootstrapService(h.deps).ensure({timeoutMs:100})).reason,"cdp_reload_unknown");assert.equal((await b.createPanelBootstrapService(h.deps).ensure({timeoutMs:100})).reason,"bootstrap_submitted_unknown");assert.equal(reloads,1);});
  const roots=path.join(root,"installed","Adobe","CEP","extensions");fs.mkdirSync(roots,{recursive:true});
  test("missing installed",()=>assert.throws(()=>b.inspectInstalledTarget([roots],sourceRoot),{code:"installed_panel_missing"}));
  const copy=path.join(roots,b.TARGET.bundleId);fs.cpSync(sourceRoot,copy,{recursive:true});
  test("actual manifest and asset equality",()=>assert.equal(b.inspectInstalledTarget([roots],sourceRoot).extensionId,b.TARGET.extensionId));
  fs.cpSync(sourceRoot,path.join(roots,"duplicate"),{recursive:true});
  test("duplicate installed IDs",()=>assert.throws(()=>b.inspectInstalledTarget([roots],sourceRoot),{code:"installed_panel_ambiguous"}));
  fs.rmSync(path.join(roots,"duplicate"),{recursive:true});
  fs.mkdirSync(path.join(roots,"third-party","CSXS"),{recursive:true});fs.writeFileSync(path.join(roots,"third-party","CSXS","manifest.xml"),"<Menu>AE Agent 3.3.1</Menu>");
  test("menu duplicate owner",()=>assert.throws(()=>b.inspectInstalledTarget([roots],sourceRoot),{code:"installed_panel_ambiguous"}));
  fs.rmSync(path.join(roots,"third-party"),{recursive:true});fs.appendFileSync(path.join(copy,"panel.js"),"\n// stale");
  test("stale installed asset",()=>assert.throws(()=>b.inspectInstalledTarget([roots],sourceRoot),{code:"installed_panel_source_mismatch"}));
  const pins={requestId:crypto.randomUUID(),deadline:Date.now()+1000,ackPath:path.join(root,"fixed.ack.json")};
  for(const [name,options,state] of [["expired",{at:pins.deadline},"expired"],["unsupported",{unsupported:true},"unsupported_api"],["id0",{id:0},"command_unavailable"],["idstring",{id:"17"},"command_unavailable"],["expired immediately before execute",{at:pins.deadline-1,tick:1},"expired"]]) test(name,()=>{const r=executeJsx(b.generateBootstrapJsx(pins),options);assert.equal(r.receipts.at(-1).state,state);assert.equal(r.commands.length,0);assert(r.lookups.every(x=>x===b.TARGET.menu));});
  test("fixed command no project access",()=>{const r=executeJsx(b.generateBootstrapJsx(pins));assert.deepEqual(r.lookups,[b.TARGET.menu]);assert.deepEqual(r.commands,[17]);assert.equal(r.receipts.at(-1).state,"executed");});
  test("probe has no execute",()=>{const r=executeJsx(b.generateBootstrapJsx({...pins,probeOnly:true}));assert.equal(r.receipts.at(-1).state,"capability_available");assert.equal(r.commands.length,0);});
  test("ack write failure prevents execute without unhandled modal",()=>{const r=executeJsx(b.generateBootstrapJsx(pins),{writable:false});assert.equal(r.commands.length,0);assert.equal(r.receipts.length,0);});
  test("execute throwing remains unknown",()=>{const r=executeJsx(b.generateBootstrapJsx(pins),{throwExecute:true});assert.deepEqual(r.commands,[17]);assert.equal(r.receipts.at(-1).state,"execution_unknown");});
  const target={indexPath:path.join(root,"Adobe","CEP","extensions",b.TARGET.bundleId,"index.html")},url=require("url").pathToFileURL(target.indexPath).href;
  test("CDP remote host rejected",()=>assert.throws(()=>b.exactCdpTarget([{type:"page",url,webSocketDebuggerUrl:"ws://attacker.invalid:8870/devtools/page/one"}],target),{code:"cdp_endpoint_untrusted"}));
  test("CDP ambiguity",()=>assert.throws(()=>b.exactCdpTarget([1,2].map(i=>({type:"page",url,webSocketDebuggerUrl:"ws://127.0.0.1:8870/devtools/page/"+i})),target),{code:"cdp_target_ambiguous"}));
  for(const shape of ["duplicate","invalid_ws","remote_ws","invalid_inventory"]) await asyncTest("CDP validation never native fallback "+shape,async()=>{
    const h=harness(root),url=require("url").pathToFileURL(h.target.indexPath).href;
    h.deps.discoverCdp=async()=>shape==="invalid_inventory" ? {} : (shape==="duplicate" ? [1,2] : [1]).map(i=>({type:"page",url,webSocketDebuggerUrl:shape==="invalid_ws" ? "bad" : shape==="remote_ws" ? "ws://evil.invalid:8870/devtools/page/1" : "ws://127.0.0.1:8870/devtools/page/"+i}));
    const r=await b.createPanelBootstrapService(h.deps).ensure({timeoutMs:100});assert.equal(r.status,"failure");assert.match(r.reason,/^cdp_/);assert.equal(h.counts().spawned+h.counts().reloaded+h.counts().reads,0);
  });
}
async function networkTests() {
  const f=await startDaemon({automationToken:"bootstrap-offline-auto",panelToken:"bootstrap-offline-panel",commandTimeoutMs:300});let adapter;
  try {
    const catalog=await f.request({path:"/tools",token:f.automationToken});const tool=catalog.body.tools.find(t=>t.name===b.TOOL_NAME);assert(tool);assert.equal(tool.annotations.readOnlyHint,false);assert.equal(tool.inputSchema.additionalProperties,false);cases++;
    const body={name:b.TOOL_NAME,arguments:{timeoutMs:100}};
    assert.equal((await f.request({path:"/mcp/tools/call",body})).status,401);cases++;
    assert.equal((await f.request({path:"/mcp/tools/call",token:f.panelToken,headers:{"x-ae-mcp-adapter":"codex-stdio-v1"},body})).status,403);cases++;
    assert.equal((await f.request({path:"/mcp/tools/call",token:f.automationToken,body})).status,403);cases++;
    const direct=await f.request({path:"/tools/call",token:f.automationToken,body});assert.equal(JSON.parse(direct.body.result.content[0].text).reason,"official_mcp_adapter_required");cases++;
    const invalid=await f.request({path:"/mcp/tools/call",token:f.automationToken,headers:{"x-ae-mcp-adapter":"codex-stdio-v1"},body:{name:b.TOOL_NAME,arguments:{jsx:"forbidden"}}});assert.equal(JSON.parse(invalid.body.result.content[0].text).reason,"invalid_bootstrap_arguments");cases++;
    // Genuine adapter protocol -> real daemon handler -> isolated fake CEP native read.
    const env={...process.env,AE_BRIDGE_PORT:String(f.port),AE_BRIDGE_HOST:"127.0.0.1",AE_BRIDGE_TOKEN:f.automationToken,AE_DAEMON_AUTO_START:"0"};
    adapter=spawn(process.execPath,[path.resolve(__dirname,"..","mcp-server","mcp-adapter.js")],{env,stdio:["pipe","pipe","pipe"],windowsHide:true});
    let output="";const responses=new Map();adapter.stdout.on("data",chunk=>{output+=chunk;let i;while((i=output.indexOf("\n"))>=0){const line=output.slice(0,i);output=output.slice(i+1);try{const r=JSON.parse(line);responses.set(r.id,r);}catch(_){}}});adapter.stderr.resume();
    const rpc=async(id,method,params)=>{adapter.stdin.write(JSON.stringify({jsonrpc:"2.0",id,method,params})+"\n");for(let i=0;i<150;i++){if(responses.has(id))return responses.get(id);await pause(10);}throw Error("adapter timeout");};
    const list=await rpc(1,"tools/list",{});assert(list.result.tools.some(t=>t.name===b.TOOL_NAME));cases++;
    await pollPanel(f,{projectFile:"C:/Synthetic/Unchanged.aep"});
    const reading=rpc(2,"tools/call",{name:b.TOOL_NAME,arguments:{timeoutMs:1000}});
    let command;
    for(let i=0;i<60;i++){const next=await pollPanel(f,{projectFile:"C:/Synthetic/Unchanged.aep"});if(next.body.command){command=next.body.command;break;}await pause(5);}
    assert(command,"ensure must dispatch the ordinary native project read");
    const concurrent=await f.request({path:"/mcp/tools/call",token:f.automationToken,headers:{"x-ae-mcp-adapter":"codex-stdio-v1"},body:{name:"get_project_info",arguments:{}}});
    assert.equal(concurrent.status,500);assert(JSON.stringify(concurrent.body).includes("panel_bootstrap_busy"));cases++;
    await completeProjectInfoCommand(f,command);
    const r=await reading;const result=JSON.parse(r.result.content[0].text);assert.equal(result.status,"already_connected",JSON.stringify(r));assert.equal(result.projectInfo.numItems,1);assert.equal(result.projectInfo.file,"C:\\Synthetic\\NetworkBoundary.aep");cases++;
    const state=JSON.parse(fs.readFileSync(path.join(f.runtimeDir,"state","ae-agent-panel-bootstrap","attempt.json"),"utf8"));assert.equal(state.delivery,"none");assert.equal(state.stage,"verified");cases++;
    assert.equal(state.projectReadCommand.id,command.id);assert.equal(state.projectReadCommand.executionId,command.executionId);cases++;
    const files=fs.readdirSync(path.join(f.runtimeDir,"state","ae-agent-panel-bootstrap"));assert(!files.some(x=>x.endsWith(".jsx")));cases++;
    const childEnv={...env,AE_BRIDGE_LOG_DIR:path.join(f.runtimeDir,"offline-module","logs"),AE_BRIDGE_STATE_DIR:path.join(f.runtimeDir,"offline-module","state"),AE_BRIDGE_SETTINGS_DIR:path.join(f.runtimeDir,"offline-module","settings"),AE_AGENT_SECRETS_FILE:path.join(f.runtimeDir,"offline-module","secrets.json"),AE_BRIDGE_BACKUP_DIR:path.join(f.runtimeDir,"offline-module","backups")};
    const childScript=`const p=require('./mcp-server/proposal-state');const original=p.createProposalState;let captured;p.createProposalState=()=>{captured=original();captured.register({actionId:'offline',executionState:'confirmed',proposalExpiresAt:'2000-01-01T00:00:00Z',payload:{plan:{targetProject:{file:'C:/Synthetic/Unchanged.aep'}}}});return captured;};const daemon=require('./mcp-server/bridge-daemon');(async()=>{const rows=[];for(const state of ['confirmed','executing']){captured.current.executionState=state;rows.push(JSON.parse((await daemon.callTool('ensure_ae_agent_panel',{timeoutMs:100})).content[0].text));}process.stdout.write(JSON.stringify(rows));})().catch(e=>{console.error(e);process.exitCode=1;});`;
    const rows=await new Promise((resolve,reject)=>execFile(process.execPath,["-e",childScript],{cwd:path.resolve(__dirname,".."),env:childEnv,windowsHide:true,timeout:5000,maxBuffer:128*1024},(error,out)=>{if(error)reject(error);else{try{resolve(JSON.parse(out));}catch(e){reject(e);}}}));
    for(const row of rows){assert.equal(row.reason,"bridge_plan_unfinished",JSON.stringify(row));assert.equal(row.stage,"preflight");cases++;}
  } finally {if(adapter) {adapter.stdin.end();adapter.kill();await new Promise(r=>adapter.once("exit",r));}await f.stop();}
}
async function main() {const root=fs.mkdtempSync(path.join(os.tmpdir(),"ae-panel-bootstrap-offline-"));try {await unitTests(root);await networkTests();console.log(`ae-agent panel bootstrap: PASS (${cases} bounded offline/VM/isolated MCP cases; no live AE/CDP).`);}finally {fs.rmSync(root,{recursive:true,force:true});}}
main().catch(error=>{console.error(error);process.exitCode=1;});
