"use strict";
// Actual guard/bootstrap/panel in offline VM: synthetic CSInterface and timers.
const assert = require("assert/strict"), fs = require("fs"), path = require("path"), vm = require("vm"), crypto = require("crypto");
const guardModule = require("../cep-panel/native-probe-startup-guard");
const {createPanelEnvironment} = require("./cep-plan-refresh-smoke");
const panelSource = fs.readFileSync(path.join(__dirname,"../cep-panel/panel.js"),"utf8");
const html = fs.readFileSync(path.join(__dirname,"../cep-panel/index.html"),"utf8");
const normal = guardModule.CONTRACT+":normal", probe = guardModule.CONTRACT+":native-probe";
let checks = 0;
function initialStorage() {
  return new Map([["codexAeBridgeUrl","http://127.0.0.1:8777"],["codexAeBridgeToken","synthetic-shared-private"],
    ["codexAeBridgeAutoConnect","1"],["codexAeSidebarCollapsed","1"],["unrelated-preference","keep"]]);
}
function untouched(env,before) {
  assert.deepEqual([...env.storageStore],[...before]);
  assert.equal(env.storageWrites.length,0,"Ни preferences, ни shared receipts не записываются");
  assert.equal(env.requestHistory.length,0,"Нет HTTP запросов, Connect и lease polling");
  assert.deepEqual(env.loadedAssets,[],"Receipt runtime и panel отложены до host read");
  assert.equal(env.api,undefined,"Programmatic bridge.connect недоступен до startup admission");
  assert.equal(env.planOps,undefined,"Recovery/poll handlers не загружены");
  assert.equal(env.elements.get("connectButton").disabled,true);
  env.elements.get("connectButton").click();
  env.executeDirectPanel();
  assert.equal(env.requestHistory.length,0,"Early click/direct panel load не обходят guard");
  assert.equal(env.storageWrites.length,0);
  checks++;
}
assert(html.includes('src="./native-probe-startup-guard.js?v='));
assert(!html.includes('src="./panel-actions.js?v=') && !html.includes('src="./panel.js?v='),"Bootstrap must not eagerly load storage-writing modules");
// Execute the fixed host script itself; any present value, including malformed
// markers, refuses the host. Environment content never appears in the response.
for (const [root,nonce,expected] of [["","",normal],[undefined,undefined,normal],[null,null,normal],
  ["C:/secret-probe","secret-nonce",probe],["C:/probe","",probe],["","bad-nonce",probe],[" ","",probe],[42,{},probe]]) {
  const reads=[];
  const response=vm.runInNewContext(guardModule.HOST_ENV_SCRIPT,{$:{getenv:key=>{reads.push(key);return key.endsWith("ROOT")?root:nonce;}}});
  assert.equal(response,expected);assert.deepEqual(reads,["AE_AGENT_NATIVE_PROBE_ROOT","AE_AGENT_NATIVE_PROBE_NONCE"]);
  assert(!response.includes("secret"));checks++;
}
assert.equal(vm.runInNewContext(guardModule.HOST_ENV_SCRIPT,{$:{getenv:()=>{throw Error("host read failure");}}}),guardModule.CONTRACT+":read-error");
for (const response of [probe,guardModule.CONTRACT+":read-error","EvalScript error.","",null,"malformed"] ) {
  const store=initialStorage(),before=new Map(store),env=createPanelEnvironment(panelSource,{storageStore:store,holdHostEnvironmentRead:true});
  untouched(env,before);
  assert.equal(env.window.AEAgentHostStartupGuard.snapshot().status,"pending");
  env.completeHostEnvironmentRead(response);
  assert.equal(env.window.AEAgentHostStartupGuard.snapshot().status,"blocked");
  assert.equal(env.window.AEAgentHostStartupGuard.isAllowed(),false);
  untouched(env,before);
  env.completeHostEnvironmentRead(normal);
  untouched(env,before); // Late/repeated responses cannot revive a refused host.
  assert(!env.elements.get("status").textContent.includes("synthetic-shared-private"));
}
{
  const store=initialStorage(),before=new Map(store),env=createPanelEnvironment(panelSource,{storageStore:store,hostEnvironmentThrows:true});
  assert.equal(env.window.AEAgentHostStartupGuard.snapshot().code,"host_environment_read_failed");untouched(env,before);
}
{
  const store=initialStorage(),before=new Map(store),env=createPanelEnvironment(panelSource,{storageStore:store,holdHostEnvironmentRead:true});
  assert(env.runTimer(timer=>timer.delay===5000));
  assert.equal(env.window.AEAgentHostStartupGuard.snapshot().code,"host_environment_timeout");
  env.completeHostEnvironmentRead(normal);untouched(env,before);
}
{
  const store=initialStorage(),before=new Map(store),env=createPanelEnvironment(panelSource,{storageStore:store,holdHostEnvironmentRead:true});
  untouched(env,before);
  env.completeHostEnvironmentRead(normal);
  assert.equal(env.window.AEAgentHostStartupGuard.isAllowed(),true);
  assert(Object.isFrozen(env.window.AEAgentHostStartupGuard));
  assert.deepEqual(env.loadedAssets,["panel-actions.js","panel.js"]);
  assert(env.api && env.planOps,"Normal callback resumes baseline panel initialization");
  assert.equal(env.storageStore.get("codexAeBridgeToken"),before.get("codexAeBridgeToken"));
  assert.equal(env.storageStore.get("codexAeBridgeAutoConnect"),"1");
  assert.equal(env.storageStore.get("unrelated-preference"),"keep");
  assert.equal(env.elements.get("connectButton").disabled,false);
  const lookup=env.inFlightRequests.find(req=>req.path==="/human-guard-settlement/lookup");
  assert(lookup,"Normal startup retains trusted settlement lookup");
  lookup.respond(200,{ok:true,settlement:null});
  const result=env.invoke({protocolVersion:env.api.protocolVersion,requestId:crypto.randomUUID(),action:"bridge.connect",args:{}});
  assert.equal(result.state,"running");
  assert(env.requestHistory.some(req=>req.path==="/tools/call"),"Programmatic normal Connect retains fresh idle guard");
  checks++;
}
console.log(JSON.stringify({ok:true,live:false,checks,probeNetworkRequests:0,probeStorageWrites:0,
  cases:["current-host-env","pending-before-callback","normal-startup","both-or-one-marker","malformed-marker","read-error","timeout","late-callback","early-manual-connect","direct-panel-load","storage-preserved"]}));
