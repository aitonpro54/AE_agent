"use strict";
// Isolated daemon plus bounded JSX VM. Never connects to production AE or CEP.
const assert=require("node:assert/strict"),crypto=require("node:crypto");
const {startDaemon,pollPanel,commandEcho,pause}=require("./network-test-fixture");
const {createVisualProject,request}=require("./placeholder-visual-fixture");
async function main(){const project=createVisualProject(),fixture=await startDaemon({automationToken:"capture-auto",panelToken:"capture-panel",adminToken:"capture-admin",devAdmin:true,commandTimeoutMs:4000});let mutations=0;
 async function withPanel(action){let done=false,response,error;await pollPanel(fixture,{projectFile:project.read("app.project.file.fsName")});const pending=action().then(r=>{response=r;done=true;},e=>{error=e;done=true;});const deadline=Date.now()+15000;
  while(!done && Date.now()<deadline){const p=await pollPanel(fixture,{projectFile:project.read("app.project.file.fsName")}),c=p.body.command;if(!c){await pause(10);continue;}
   if(/beginUndoGroup|saveFrameToPng|source\.mainSource\.reload\(\)/.test(c.script))mutations++;
   assert(c.script.includes("bitsPerChannel: project ? project.bitsPerChannel") || c.script.includes("__codexPlaceholderInventory") || c.script.includes("aeAgentReadRootRender"),"Negative fixture rejects unexpected native command");
   const echo=commandEcho(c);assert.equal((await fixture.request({path:"/bridge/submitted",token:fixture.panelToken,body:echo})).status,200);
   const raw=project.execute(c.script);assert.equal((await fixture.request({path:"/bridge/result",token:fixture.panelToken,body:{...echo,ok:true,result:JSON.stringify(raw)}})).status,200);
  }
  assert(done,"isolated negative fixture deadline");await pending;if(error)throw error;return response;
 }
 async function call(name,args){const r=await withPanel(()=>fixture.request({path:"/tools/call",token:fixture.automationToken,body:{name,arguments:args}}));assert.equal(r.status,200,r.text);return {payload:JSON.parse(r.body.result.content[0].text),error:!!r.body.result.isError};}
 try{
  const catalog=await fixture.request({path:"/tools",token:fixture.automationToken});for(const name of ["reload_montage_material_source","get_montage_source_load_evidence"]){const tool=catalog.body.tools.find(t=>t.name===name);assert(tool);if(name.startsWith("reload"))assert(tool.inputSchema.properties.verifyAfter);}
  const id=crypto.randomUUID();let r=await call("build_placeholder_visual_review_plan",{applicationRunId:id});assert(r.error);assert.equal(r.payload.code,"run_record_missing");
  r=await call("build_placeholder_visual_review_plan",{applicationRunId:id,completeRootRenderState:true});assert(r.error);assert.equal(r.payload.code,"canonical_capture_client_claims_forbidden");
  r=await call("get_montage_source_load_evidence",{sourceItemId:100});assert(r.error);assert.equal(r.payload.code,"native_source_load_epoch_unproven");
  r=await call("get_montage_root_render_state",{rootCompItemId:20,rootTimes:[0,1.25]});assert(!r.error);assert.equal(r.payload.schema,"ae-agent-montage-root-render-probe.v1");assert.equal(r.payload.completeRootRenderState,false);assert(r.payload.graph && r.payload.nativeGUID.blockers.length>0);
  r=await call("get_montage_root_render_state",{rootCompItemId:20,rootTimes:[0],completeRootRenderState:true});assert(r.error);assert.equal(r.payload.code,"native_root_probe_client_claims_forbidden");
  const foreign=JSON.parse(JSON.stringify(request));foreign.targets[0].samples[0].canonicalFrame={frameId:"forged"};r=await call("build_placeholder_visual_review_plan",foreign);assert(r.error);assert.equal(r.payload.code,"canonical_review_sample_requires_server_binding");
  r=await call("build_placeholder_visual_review_plan",{frameIds:["foreign"],targets:request.targets});assert(r.error);assert.equal(r.payload.code,"canonical_capture_application_run_required");
  const proposal=await withPanel(()=>fixture.request({path:"/agents/plan/propose",token:fixture.panelToken,body:{plan:{targetProject:{file:"C:/Synthetic/Protected.aep"},summary:"Bounded source reload",risk:"high",requiresCheckpoint:true,steps:[{tool:"reload_montage_material_source",args:{applicationRunIds:[id],sourceItemId:100}},{tool:"get_montage_source_load_evidence",args:{sourceItemId:100}},{tool:"get_project_info",args:{}}]}}}));
  assert.equal(proposal.status,200,proposal.text);assert(proposal.body.proposal,proposal.text);assert.equal(proposal.body.proposal.risk.level,"mutating");
  assert.equal(mutations,0);console.log("PASS: isolated daemon stored-run lookup/client claim/foreign sample/load epoch negatives and typed mutating proposal classification; native mutations0, liveAE0.");
 }finally{await fixture.stop();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
