"use strict";
const assert=require("assert"),fs=require("fs"),os=require("os"),path=require("path"),http=require("http"),crypto=require("crypto"),{spawn}=require("child_process");
const {withProjectPanel,isProjectInfo}=require("./fake-project-panel");
const {TOOL_NAME}=require("../mcp-server/project-save");
const root=path.resolve(__dirname,".."),runtime=fs.mkdtempSync(path.join(os.tmpdir(),"ae-save-plan-"));
const file=path.join(runtime,"synthetic-project.aep"),before=Buffer.from("synthetic before typed save");fs.writeFileSync(file,before);
fs.writeFileSync(path.join(runtime,"edit-session-active.json"),JSON.stringify({id:"synthetic-save-session",status:"active",startedAt:new Date().toISOString(),checkpoint:{sourceFile:file},operations:[]}));
const port=39000+Math.floor(Math.random()*10000),token="synthetic-save-plan-token";
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function request(route,payload){return new Promise((resolve,reject)=>{const req=http.request({hostname:"127.0.0.1",port,path:route,method:payload?"POST":"GET",headers:{"content-type":"application/json","x-ae-bridge-token":token},timeout:10000},res=>{let text="";res.on("data",chunk=>text+=chunk);res.on("end",()=>{try{resolve(JSON.parse(text));}catch(error){reject(error);}});});req.on("error",reject);req.on("timeout",()=>req.destroy(new Error("isolated save timeout: "+route)));req.end(payload?JSON.stringify(payload):undefined);});}
async function main(){
 const daemon=spawn(process.execPath,[path.join(root,"mcp-server/bridge-daemon.js")],{env:{...process.env,AE_BRIDGE_PORT:String(port),AE_BRIDGE_TOKEN:token,AE_BRIDGE_LOG_DIR:runtime,AE_DAEMON_AUTO_START:"0"},windowsHide:true,stdio:["ignore","ignore","pipe"]});
 let stderr="";daemon.stderr.on("data",chunk=>stderr+=chunk);
 try{
  let ready=false;for(let i=0;i<60;i++){try{ready=(await request("/health")).ok;if(ready)break;}catch(_){}await pause(100);}assert(ready,stderr);
  const args={expectedProjectFile:file,expectedSavedFileSha25664:crypto.createHash("sha256").update(before).digest("hex"),checkpointLabel:"synthetic-save-contract"};
  const plan={summary:"Persist the current named synthetic project",targetProject:{file},risk:"high",requiresCheckpoint:true,steps:[{tool:TOOL_NAME,args,mutatesProject:true},{tool:"get_project_info",args:{}}]};
  const validated=await request("/agents/plan/validate",{plan,repairPlan:false});
  assert.strictEqual(validated.validation.ok,true,JSON.stringify(validated));
  assert.strictEqual(validated.validation.steps[0].safeArgs.idempotencyKey,undefined);
  for(const extra of [{verifyAfter:false},{idempotencyKey:"replay"},{destination:file},{autoCheckpoint:false}]){
   const invalid=await request("/agents/plan/validate",{plan:{...plan,steps:[{tool:TOOL_NAME,args:{...args,...extra}}]},repairPlan:false});assert.strictEqual(invalid.validation.ok,false);
  }
  const direct=await request("/tools/call",{name:TOOL_NAME,arguments:args});assert(direct.result&&direct.result.isError,JSON.stringify(direct));assert.strictEqual(JSON.parse(direct.result.content[0].text).code,"proposal_required");
  const {proposal}=await withProjectPanel(port,token,()=>request("/agents/plan/propose",{plan}),"save-fixture",file);
  assert(proposal);assert.strictEqual(proposal.risk.level,"destructive","Autonomous typed lease must not authorize overwrite save");
  const noDry=await withProjectPanel(port,token,()=>request("/agents/plan/run",{actionId:proposal.actionId,payloadHash:proposal.action.payloadHash,previewHash:proposal.action.previewHash,riskLevel:proposal.risk.level,riskPolicyVersion:proposal.confirmation.riskPolicyVersion,confirmationToken:proposal.confirmation.confirmationToken,confirmedBySurface:proposal.confirmation.surface,dryRun:false,confirm:true,allowMutations:true}),"save-fixture",file);
  assert.strictEqual(noDry.run.errorCode,"project_save_dry_run_required");
  const bypass=await withProjectPanel(port,token,()=>request("/agents/plan/run",{actionId:proposal.actionId,dryRun:true,allowWithoutCheckpoint:true}),"save-fixture",file);
  assert.strictEqual(bypass.run.errorCode,"project_save_checkpoint_bypass_forbidden");
  const dry=await withProjectPanel(port,token,()=>request("/agents/plan/run",{actionId:proposal.actionId,dryRun:true}),"save-fixture",file);
  assert(dry.run.ok,JSON.stringify(dry));assert.strictEqual(dry.run.executedCount,0);
  const unconfirmed=await withProjectPanel(port,token,()=>request("/agents/plan/run",{actionId:proposal.actionId,dryRun:false,confirm:false,allowMutations:true}),"save-fixture",file);assert(!unconfirmed.ok||unconfirmed.run&&unconfirmed.run.ok===false);
  let finished=false,saves=0;
  const running=request("/agents/plan/run",{actionId:proposal.actionId,payloadHash:proposal.action.payloadHash,previewHash:proposal.action.previewHash,riskLevel:proposal.risk.level,riskPolicyVersion:proposal.confirmation.riskPolicyVersion,confirmationToken:proposal.confirmation.confirmationToken,confirmedBySurface:proposal.confirmation.surface,dryRun:false,confirm:true,allowMutations:true}).finally(()=>finished=true);running.catch(()=>{});
  while(!finished){const health=await request("/health");if(!health.pending){await pause(10);continue;}const {command}=await request("/bridge/next");if(!command)continue;let result;
   if(isProjectInfo(command))result={file};
   else if(command.script.includes("app.project.save();")){saves++;fs.writeFileSync(file,"synthetic persisted memory");result={projectFile:file,saved:true};}
   else if(command.script.includes("projectFile:String(app.project.file.fsName)"))result={projectFile:file};
   else throw new Error("Unexpected fake-panel save command");
   await request("/bridge/result",{id:command.id,ok:true,result:JSON.stringify({ok:true,result})});
  }
  const result=await running;assert(result.run&&result.run.ok,JSON.stringify(result));assert.strictEqual(saves,1);
  assert.strictEqual(result.run.semanticVerification.status,"passed");assert.strictEqual(result.run.outcome.acceptance.status,"not_requested");
  const receipt=result.run.steps[0].result.saveReceipt;assert.strictEqual(receipt.reopenVerification,"pending");assert.notStrictEqual(receipt.checkpoint.checkpointFile,file);
  const replay=await withProjectPanel(port,token,()=>request("/agents/plan/run",{actionId:proposal.actionId,dryRun:false,confirm:true,allowMutations:true}),"save-fixture",file);assert(replay.ok===false||replay.run&&replay.run.ok===false);assert.strictEqual(saves,1);
  const badRun=JSON.parse(JSON.stringify(result.run));badRun.steps[0].result.saveReceipt={saved:true};
  assert.strictEqual(require("../mcp-server/semantic-verification").buildSemanticVerification(plan,badRun).status,"needs_review");
  console.log(JSON.stringify({ok:true,aeCommands:0,fakeSaveCommands:saves,dryRunExecuted:0,manualDestructiveOnly:true,receiptSemanticProof:true,replayBlocked:true,reopen:"pending"}));
 }finally{daemon.kill();}
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});
