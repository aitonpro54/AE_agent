"use strict";
// Test-only public MCP + authenticated fake panel on the existing isolated
// snapshot. No production endpoints, actual credentials or native factories.
const assert=require("node:assert/strict"),fs=require("fs"),path=require("path"),crypto=require("crypto"),readline=require("readline"),{spawn}=require("child_process");
const api=require("./network-test-fixture"),{createVisualProject}=require("./core-test-visual-project");
const payload=result=>({isError:result.isError===true,value:JSON.parse(result.content[0].text)});
async function createScenarioFixture(options={}){
  const credentials={automationToken:crypto.randomBytes(32).toString("hex"),panelToken:crypto.randomBytes(32).toString("hex")};
  let projectFile;
  const fixture=await api.startDaemon({...credentials,commandTimeoutMs:1500,...options,setupRuntime(runtime){
    projectFile=path.join(runtime,"synthetic-project.aep");fs.writeFileSync(projectFile,"synthetic Core offline project");
    fs.writeFileSync(path.join(runtime,"logs/edit-session-active.json"),JSON.stringify({id:"synthetic-core-session",status:"active",startedAt:new Date().toISOString(),checkpoint:{sourceFile:projectFile},operations:[]}));
  }});
  let model,handler=null,done=false,serial=0,stderr="",commands=0,mutations=0;const pending=new Map();
  function freshModel(){model=createVisualProject();model.change('app.version="24.2.1";app.project.file.fsName='+JSON.stringify(projectFile)+';app.project.revision=42;app.project.dirty=false;');return model;}
  freshModel();
  const env=api.isolatedEnvironment(fixture.runtimeDir,{...credentials,port:fixture.port,commandTimeoutMs:1500});
  const adapter=spawn(process.execPath,[path.join(fixture.launchRoot,"mcp-server/mcp-adapter.js")],{cwd:fixture.launchRoot,env,windowsHide:true,stdio:["pipe","pipe","pipe"]});
  adapter.on("error",error=>{stderr=String(error.message);for(const p of pending.values()){clearTimeout(p.timer);p.reject(error);}pending.clear();});
  adapter.stderr.on("data",b=>{stderr=(stderr+b).slice(-8000);});
  const lines=readline.createInterface({input:adapter.stdout});
  lines.on("line",line=>{const r=JSON.parse(line),p=pending.get(r.id);if(!p)return;pending.delete(r.id);clearTimeout(p.timer);r.error?p.reject(Error(JSON.stringify(r.error))):p.resolve(r.result);});
  function rpc(method,params){return new Promise((resolve,reject)=>{const id=++serial,timer=setTimeout(()=>{pending.delete(id);reject(Error("offline MCP deadline: "+stderr));},12000);pending.set(id,{resolve,reject,timer});adapter.stdin.write(JSON.stringify({jsonrpc:"2.0",id,method,params})+"\n");});}
  const call=(name,args={})=>rpc("tools/call",{name,arguments:args}).then(payload);
  const panel={panelConnectionId:"core-scenario-panel",panelGeneration:"1",projectFile};
  async function panelPost(route,body){return fixture.request({method:"POST",path:route,token:fixture.panelToken,body});}
  async function respond(command){commands++;
    const script=command.script;assert.equal(typeof script,"string");
    const mutating=/app\.beginUndoGroup\(|app\.project\.save\(|\.render\(|saveFrameToPng\(/.test(script);if(mutating)mutations++;
    if(mutating&&!options.allowFakeMutation)throw Error("dry-run fixture received mutation: "+script.slice(-1000));
    const echo=api.commandEcho(command);
    assert.equal((await panelPost("/bridge/submitted",echo)).status,200);
    const override=handler?await handler(command,{model,projectFile,mutating}):undefined;
    if(override===HOLD)return;
    const raw=override===undefined?model.execute(script):{ok:true,result:override};
    assert.equal((await panelPost("/bridge/result",{...echo,ok:true,result:JSON.stringify(raw)})).status,200);
  }
  async function withPanel(action){
    await api.pollPanel(fixture,panel);
    let finished=false,value,error;const work=Promise.resolve().then(action).then(v=>{value=v;finished=true;},e=>{error=e;finished=true;});
    const deadline=Date.now()+15000;
    while(!finished&&Date.now()<deadline){
      const health=await fixture.request({path:"/health",token:fixture.automationToken});
      if(!health.body.pending){await api.pause(10);continue;}
      const next=await api.pollPanel(fixture,panel);if(next.body.command)await respond(next.body.command);
    }
    assert(finished,"bounded fake-panel deadline");await work;if(error)throw error;return value;
  }
  try{await rpc("initialize",{});}catch(error){for(const p of pending.values()){clearTimeout(p.timer);p.reject(error);}pending.clear();lines.close();await api.stopChild(adapter);await fixture.stop();throw error;}
  return {fixture,projectFile,call,rpc,withPanel,panelPost,freshModel,get model(){return model;},set handler(v){handler=v;},counts:()=>({commands,mutations,writes:model.read("writes")}),
    async propose(plan){const r=await withPanel(()=>call("propose_ai_agent_plan",{plan}));assert.equal(r.isError,false,JSON.stringify(r.value));assert(r.value.proposal.actionId);assert.equal(r.value.proposal.confirmation.confirmationToken,undefined);return r.value.proposal;},
    pins(p){return {actionId:p.actionId,payloadHash:p.action.payloadHash,previewHash:p.action.previewHash,riskLevel:p.risk.level,riskPolicyVersion:p.confirmation.riskPolicyVersion};},
    async dry(p,extra={}){return withPanel(()=>call("run_ai_agent_plan",{...this.pins(p),dryRun:true,...extra}));},
    async close(){if(done)return;done=true;for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error("fixture closed"));}pending.clear();lines.close();await api.stopChild(adapter);await fixture.stop();}
  };
}
const HOLD=Symbol("submitted test command with no result");
module.exports={createScenarioFixture,payload,HOLD};
