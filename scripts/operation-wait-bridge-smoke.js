"use strict";
const assert = require("assert/strict");
const {startDaemon, pollPanel} = require("./network-test-fixture");
async function main() {
  const fixture = await startDaemon({automationToken:"wait-auto",panelToken:"wait-panel",commandTimeoutMs:2000});
  const call = async (name,args) => {
    const response = await fixture.request({path:"/mcp/tools/call",token:fixture.automationToken,
      headers:{"x-ae-mcp-adapter":"codex-stdio-v1"},body:{name,arguments:args}});
    assert.equal(response.status,200,response.text);
    assert(response.body.result,response.text);
    return {error:response.body.result.isError,data:JSON.parse(response.body.result.content[0].text)};
  };
  try {
    const catalog = await fixture.request({path:"/tools",token:fixture.automationToken});
    for(const name of ["wait_for_bridge_state","wait_for_plan_state"])
      assert(catalog.body.tools.some(t=>t.name===name));
    const disconnected = await call("wait_for_bridge_state",{targetState:"connected",waitMs:0});
    assert.equal(disconnected.error,false,JSON.stringify(disconnected.data));
    assert.equal(disconnected.data.panelConnected,false);
    assert.equal(disconnected.data.timedOut,true);
    await pollPanel(fixture,{projectFile:"C:/Synthetic/Unchanged.aep"});
    const connected = await call("wait_for_bridge_state",{targetState:"connected_and_idle",waitMs:0});
    assert.equal(connected.error,false);
    assert.equal(connected.data.panelConnected,true);
    assert.equal(connected.data.idle,true);
    assert.equal(connected.data.timedOut,false);
    const invalid = await call("wait_for_bridge_state",{waitMs:"10"});
    assert.equal(invalid.error,true);
    assert.equal(invalid.data.code,"invalid_wait_ms");
    const absent = await call("wait_for_plan_state",{actionId:"wait-uncreated",instanceId:"wait-instance",revision:1,waitMs:0});
    assert.equal(absent.data.status,"absent");
    assert.equal(absent.data.lastRun,null);
    assert(!("proposal" in absent.data) && !("plan" in absent.data));
    const health = await call("get_bridge_status",{});
    assert.equal(health.data.pendingCommands,0);
    assert.equal(health.data.inflightCommands.length,0);
    const panel = await pollPanel(fixture,{projectFile:"C:/Synthetic/Unchanged.aep"});
    assert(!panel.body.command,"Passive waits must not enqueue native commands");
    console.log("operation-wait bridge: PASS; read-only MCP surface, auth, strict input, no native commands.");
  } finally { await fixture.stop(); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
