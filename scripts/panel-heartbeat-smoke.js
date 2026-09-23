"use strict";
const assert=require("assert");
const {startDaemon,pollPanel,commandEcho,pause}=require("./network-test-fixture");
async function main(){
  const fixture=await startDaemon({automationToken:"heartbeat-automation",panelToken:"heartbeat-panel",commandTimeoutMs:30000});
  const route="/bridge/heartbeat?panelConnectionId=heartbeat&panelGeneration=1";
  const req=(path,body,token=fixture.panelToken)=>fixture.request({path,body,token,timeoutMs:30000});
  try{
    assert.strictEqual((await req(route)).status,409,"heartbeat cannot bootstrap a panel");
    await pollPanel(fixture,{panelConnectionId:"heartbeat",panelGeneration:"1"});
    assert.strictEqual((await req("/autonomy/session",{enabled:true,panelConnectionId:"heartbeat",panelGeneration:"1"})).body.session.active,true);
    const before=(await req("/dev/status")).body.lastPanelSeenAt;
    assert.strictEqual((await req(route,undefined,fixture.automationToken)).status,401);
    assert.strictEqual((await req(route.replace("Generation=1","Generation=2"))).status,409);
    assert.strictEqual((await req("/dev/status")).body.lastPanelSeenAt,before,"invalid heartbeat cannot refresh panel");
    const pending=req("/tools/call",{name:"get_project_info",arguments:{}},fixture.automationToken);
    pending.catch(()=>{});
    let command;
    for(let i=0;i<30&&!command;i++){command=(await pollPanel(fixture,{panelConnectionId:"heartbeat",panelGeneration:"1"})).body.command;if(!command)await pause(10);}
    assert(command);
    assert.strictEqual((await req("/bridge/submitted",commandEcho(command))).status,200);
    for(let i=0;i<4;i++){await pause(4100);const heartbeat=await req(route);assert.strictEqual(heartbeat.body.session.active,true);assert.strictEqual(heartbeat.body.command,undefined);}
    assert.strictEqual((await req("/autonomy/session")).body.session.active,true,"long evalScript keeps readiness with heartbeat");
    assert.strictEqual((await req("/bridge/result",{...commandEcho(command),ok:true,result:'{"ok":true,"result":{"file":"C:/Synthetic/A.aep"}}'})).status,200);
    assert.strictEqual((await pending).status,200);
    console.log(JSON.stringify({ok:true,longCommandMs:16400,heartbeatLeasesCommands:false,invalidHeartbeatRefreshes:false,live:false}));
  }finally{await fixture.stop();}
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});
