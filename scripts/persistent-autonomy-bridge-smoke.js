"use strict";
const assert = require("assert");
const {startDaemon, pollPanel, commandEcho, pause} = require("./network-test-fixture");
const options = {automationToken:"persistent-auto-fixture",panelToken:"persistent-panel-fixture",devAdmin:false,commandTimeoutMs:4000};
async function main() {
  let fixture = await startDaemon(options);
  const request = (route, body, token) => fixture.request({path:route,body,token:token || options.panelToken});
  try {
    let status = await request("/autonomy/session");
    assert.strictEqual(status.body.session.desiredEnabled,false);
    await pollPanel(fixture,{panelConnectionId:"persistent-panel",panelGeneration:"1"});
    assert.strictEqual((await request("/autonomy/session")).body.session.active,true,"new preference enables on first panel poll");
    await pollPanel(fixture,{panelConnectionId:"persistent-panel",panelGeneration:"2"});
    assert.strictEqual((await request("/autonomy/session")).body.session.active,true,"reload reconnect without enable");
    assert.strictEqual((await pollPanel(fixture,{panelConnectionId:"stranger",panelGeneration:"3"})).status,409);
    assert.strictEqual((await pollPanel(fixture,{panelConnectionId:"persistent-panel",panelGeneration:"1"})).status,409);
    const pending = request("/tools/call",{name:"get_project_info",arguments:{}},options.automationToken).catch(()=>({connectionLost:true}));
    let command;
    for(let i=0;i<50&&!command;i++){command=(await pollPanel(fixture,{panelConnectionId:"persistent-panel",panelGeneration:"2"})).body.command; if(!command)await pause(10);}
    assert(command);
    assert.strictEqual((await request("/bridge/submitted",commandEcho(command))).status,200);
    await pollPanel(fixture,{panelConnectionId:"persistent-panel",panelGeneration:"3"});
    assert.strictEqual((await pollPanel(fixture,{panelConnectionId:"persistent-panel",panelGeneration:"3"})).body.command,null,"submitted never replay on reload");
    const runtimeDir=fixture.runtimeDir;
    await fixture.stop(false); await pending;
    fixture=await startDaemon({...options,runtimeDir});
    status=await request("/autonomy/session");
    assert.strictEqual(status.body.session.desiredEnabled,true);
    assert.strictEqual(status.body.session.connectionReady,false,"restart waits for trusted panel");
    assert.strictEqual((await pollPanel(fixture,{panelConnectionId:"persistent-panel",panelGeneration:"4"})).body.command,null,"restart does not replay submitted");
    assert.strictEqual((await request("/autonomy/session")).body.session.active,true);
    assert.strictEqual((await request("/bridge/result",{...commandEcho(command),ok:true,result:'{"ok":true,"result":{}}'})).status,404,"old execution cannot revive after restart");
    const off=await request("/autonomy/session",{enabled:false,panelConnectionId:"persistent-panel",panelGeneration:"4"});
    assert.strictEqual(off.body.session.desiredEnabled,false);
    await fixture.stop(false);
    fixture=await startDaemon({...options,runtimeDir});
    assert.strictEqual((await request("/autonomy/session")).body.session.desiredEnabled,false);
    console.log(JSON.stringify({ok:true,cases:["AUT02","AUT03","AUT04","AUT08","AUT10","AUT15","AUT16"],actualDaemonRestart:true,live:false}));
  } finally {await fixture.stop();}
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});
