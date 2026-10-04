#!/usr/bin/env node
"use strict";
const assert = require("node:assert/strict");
const builder = require("../mcp-server/text-visual-review-plan");
const {sha256} = require("../mcp-server/review-evidence");
const {normalizeProject} = require("../mcp-server/proposal-state");
const clone = value => JSON.parse(JSON.stringify(value));
const reviewId = "84c0a3b1-1d92-4ae7-9a76-134073fdb281";
const projectFile = "C:/work/text-review-fixture.aep";
const project = {file:projectFile,revision:42,numItems:2,supported:{revision:true}};
const comps = [
  {itemId:20,itemIndex:2,name:"Root Comp",width:1920,height:1080,frameRate:30,duration:10},
  {itemId:10,itemIndex:1,name:"Nested Precomp",width:1280,height:720,frameRate:30,duration:10}
];
function layer(compItemId,layerId,text = "Scaled Text",child = null) {
  const comp = comps.find(c=>c.itemId === compItemId);
  const prop = value => ({kind:Array.isArray(value) ? "array" : "number",value,numKeys:0,expressionEnabled:false,dimensionsSeparated:false});
  const doc = {kind:"TextDocument",text,font:"ArialMT",fontSize:72,justification:"center"};
  return {comp:{itemId:comp.itemId,itemIndex:comp.itemIndex,name:comp.name,time:0},layer:{id:layerId,index:child ? 5 : 2,
    textLayer:child === null,layerKind:child === null ? "text" : null,matchName:child === null ? "ADBE Text Layer" : "ADBE AV Layer",
    threeDLayer:false,collapseTransformation:child === null,
    timeRemapEnabled:false,parent:null,startTime:0,inPoint:0,outPoint:10,stretch:100,
    ...(child === null ? {text:clone(doc),source:null} : {source:{itemId:child,type:"comp",itemIndex:1,name:"Nested Precomp"}})},
    transform:{anchorPoint:prop([40,20,0]),position:prop([640,360,0]),scale:prop([125,85,100]),rotation:prop(0),opacity:prop(100)},
    text:child === null ? doc : null,protectedProperties:child === null ? [{path:[{matchName:"ADBE Text Properties"},{matchName:"ADBE Text Document"}],
      numKeys:0,expressionEnabled:false,value:clone(doc)}] : []};
}
const input = {caseId:"scaled-precomp-text",rootCompItemId:20,textTarget:{compItemId:10,layerId:2},
  route:[{parentCompItemId:20,layerId:5,childCompItemId:10}],frames:[{time:0,phase:"entry"},{time:1,phase:"hold"},{time:2.5,phase:"exit"}],
  checks:["staticSourceText","transformedBounds","phaseCoverage"],expectedText:"Scaled Text"};
const context = {projectFile,observedAt:"2026-10-04T12:00:00.000Z",project,comps,
  textObservation:layer(10,2),routeObservation:layer(20,5,null,10)};
function build(value=input,ctx=context) { return builder.buildTextVisualReviewPlan(value,ctx,reviewId); }

async function protocol() {
  const path=require("node:path"),cp=require("node:child_process"),readline=require("node:readline");
  const spawn=cp.spawn;
  // The fixture scrubs CODEBURN env. Reinstate only its OWN child's journal,
  // never the shared analytics path, including when run outside the group runner.
  cp.spawn=(executable,args,options)=>{
    const env={...options.env};
    if (!args.some(arg=>/mcp-server[\\/](bridge-daemon|mcp-adapter)\.js$/.test(arg))) throw new Error("unexpected_test_child");
    const runtime=path.dirname(env.AE_BRIDGE_LOG_DIR);
    env.CODEBURN_NATIVE_JOURNAL=path.join(runtime,"logs","text-native-isolated.jsonl");
    env.CODEX_HOME=path.join(runtime,"missing-codex-home");
    return spawn(executable,args,{...options,env});
  };
  const {startDaemon,pollPanel,commandEcho,pause,isolatedEnvironment,stopChild}=require("./network-test-fixture");
  const {createVisualProject}=require("./placeholder-visual-fixture");
  let fixture,adapter,lines;
  const pending=new Map();
  try {
    const projectVM=createVisualProject(); // No native filesystem, no AE, no exports.
    projectVM.change(`
      app.project.revision=42;app.project.dirty=false;app.version="24.2.1";
      root.width=1920;root.height=1080;child.width=1280;child.height=720;
      root.frameRate=child.frameRate=30;
      var ParagraphJustification={LEFT_JUSTIFY:1,CENTER_JUSTIFY:2,RIGHT_JUSTIFY:3};
      var textGroup=new Group("ADBE Text Properties",4,target);
      var pointDocument={text:"Scaled Text",font:"ArialMT",fontSize:72,justification:2};
      var boxGetterReads=0,sourceValueReads=0,sourceValueThrows=false;
      Object.defineProperty(pointDocument,"boxTextSize",{enumerable:true,get:function(){boxGetterReads++;throw new Error("Text document not of Box document type");}});
      var sourceTextProperty=textGroup.add("ADBE Text Document",pointDocument);
      Object.defineProperty(sourceTextProperty,"value",{configurable:true,get:function(){sourceValueReads++;if(sourceValueThrows)throw new Error("native Source Text value unavailable");return pointDocument;}});
      target.groups.push(textGroup);target.source=null;target.matchName="ADBE Text Layer";target.collapseTransformation=true;
      TextLayer.prototype=Object.create(AVLayer.prototype);Object.setPrototypeOf(target,TextLayer.prototype);
    `);
    fixture=await startDaemon({automationToken:"text-auto",panelToken:"text-panel",commandTimeoutMs:4000});
    const env=isolatedEnvironment(fixture.runtimeDir,{port:fixture.port,automationToken:fixture.automationToken,panelToken:fixture.panelToken});
    adapter=cp.spawn(process.execPath,[path.resolve(__dirname,"../mcp-server/mcp-adapter.js")],
      {env,windowsHide:true,stdio:["pipe","pipe","pipe"]});
    let stderr="";adapter.stderr.on("data",chunk=>{stderr=(stderr+chunk).slice(-4000);});
    lines=readline.createInterface({input:adapter.stdout});
    lines.on("line",line=>{
      const message=JSON.parse(line),p=pending.get(message.id);if(!p)return;
      pending.delete(message.id);clearTimeout(p.timer);
      message.error ? p.reject(new Error(message.error.message)) : p.resolve(message.result);
    });
    let id=0,nativeReads=0,lastNativeScript;
    const rpc=(method,params)=>new Promise((resolve,reject)=>{
      const requestId=++id,timer=setTimeout(()=>{pending.delete(requestId);reject(new Error("isolated MCP timeout: "+stderr));},12000);
      pending.set(requestId,{resolve,reject,timer});adapter.stdin.write(JSON.stringify({jsonrpc:"2.0",id:requestId,method,params})+"\n");
    });
    async function call(name,args,afterRead) {
      let done=false,result,error;
      await pollPanel(fixture,{projectFile:"C:/Synthetic/Protected.aep"});
      const request=rpc("tools/call",{name,arguments:args}).then(value=>{result=value;done=true;},e=>{error=e;done=true;});
      const deadline=Date.now()+14000;
      while(!done && Date.now()<deadline) {
        const next=await pollPanel(fixture,{projectFile:"C:/Synthetic/Protected.aep"}),command=next.body.command;
        if(!command){await pause(10);continue;}
        assert(!command.script.includes("comp.saveFrameToPng("),"build must never export");
        const echo=commandEcho(command);
        assert.equal((await fixture.request({path:"/bridge/submitted",token:fixture.panelToken,body:echo})).status,200);
        lastNativeScript=command.script;
        const raw=projectVM.execute(command.script);nativeReads++;
        if(afterRead)afterRead(raw);
        assert.equal((await fixture.request({path:"/bridge/result",token:fixture.panelToken,body:{...echo,ok:true,result:JSON.stringify(raw)}})).status,200);
      }
      assert(done,"isolated MCP deadline");await request;if(error)throw error;
      return {isError:Boolean(result.isError),value:JSON.parse(result.content[0].text)};
    }
    await rpc("initialize",{});
    const catalog=await rpc("tools/list",{});
    assert(catalog.tools.some(t=>t.name === "build_solution_plan"));
    const solution=await call("get_solution",{id:"text-visual-review-plan"});
    assert.equal(solution.isError,false);assert.deepEqual(solution.value.planBuilder,builder.getTextVisualReviewBuilderContract());
    const protocolInput={...clone(input),textTarget:{compItemId:10,layerId:11},route:[{parentCompItemId:20,layerId:21,childCompItemId:10}]};
    const sourceTextArgs={compItemId:10,layerId:11,protectedProperties:[["ADBE Text Properties","ADBE Text Document"]]};
    const nativeText=await call("get_layer_details",sourceTextArgs);
    assert.equal(nativeText.isError,false,JSON.stringify(nativeText));
    assert.equal(nativeText.value.layer.matchName,"ADBE Text Layer");assert.equal(nativeText.value.layer.textLayer,true);
    assert.equal(nativeText.value.layer.collapseTransformation,true);assert.equal(nativeText.value.layer.source,null);
    const sourceRow=nativeText.value.protectedProperties[0];
    assert.deepEqual(sourceRow.value,nativeText.value.text);assert.equal(sourceRow.value.kind,"TextDocument");
    assert.equal(sourceRow.numKeys,0);assert.equal(sourceRow.expressionEnabled,false);
    assert.equal(Object.hasOwn(sourceRow.value,"boxTextSize"),false);assert(projectVM.read("sourceValueReads")>0);
    assert.equal(projectVM.read("boxGetterReads"),0);
    // Reproduce the original fault with the actual native wrapper and raw host value.
    const rawScript=lastNativeScript.replace("value:protectedValue","value:__phReadValue(protectedProperty)");
    assert.notEqual(rawScript,lastNativeScript);
    const rawFailure=projectVM.execute(rawScript);
    assert.equal(rawFailure.ok,false);assert.match(rawFailure.error,/Text document not of Box document type/);
    assert.equal(projectVM.read("boxGetterReads"),1);projectVM.change("boxGetterReads=0;");
    const otherPath=await call("get_layer_details",{...sourceTextArgs,protectedProperties:[...sourceTextArgs.protectedProperties,
      ["ADBE Effect Parade","Custom Effect","Custom Value"]]});
    assert.equal(otherPath.isError,false);assert.equal(otherPath.value.protectedProperties[1].value,7);
    projectVM.change("sourceValueThrows=true;");
    const valueFailure=await call("get_layer_details",sourceTextArgs);
    assert.equal(valueFailure.isError,true);assert.match(valueFailure.value.error,/native Source Text value unavailable/);
    projectVM.change('sourceValueThrows=false;var originalPointDocument=pointDocument;pointDocument={kind:"TextDocument",font:"ArialMT",fontSize:72,justification:2};');
    const declaredKind=await call("get_layer_details",sourceTextArgs);
    assert.equal(declaredKind.isError,true);assert.match(declaredKind.value.error,/protected_source_text_unavailable/);
    projectVM.change("pointDocument=originalPointDocument;");
    const before=nativeReads;
    const invalid=await call("build_solution_plan",{solutionId:"text-visual-review-plan",inputs:{...protocolInput,checks:{staticSourceText:true}}});
    assert.equal(invalid.isError,true);assert.equal(nativeReads,before);
    const built=await call("build_solution_plan",{solutionId:"text-visual-review-plan",inputs:protocolInput});
    assert.equal(built.isError,false,JSON.stringify(built));assert.equal(built.value.ok,true,JSON.stringify(built));
    assert.equal(built.value.plan.steps.length,10);assert.equal(nativeReads-before,6);
    assert.equal(built.value.plan.textReview.observation.text.collapseTransformation,true);
    projectVM.change("route.collapseTransformation=true;");
    const collapsedRoute=await call("build_solution_plan",{solutionId:"text-visual-review-plan",inputs:protocolInput});
    assert.equal(collapsedRoute.isError,true);assert.match(collapsedRoute.value.error,/unsupported_layer_route/);
    projectVM.change("route.collapseTransformation=false;sourceTextProperty.numKeys=2;");
    const animatedSource=await call("build_solution_plan",{solutionId:"text-visual-review-plan",inputs:protocolInput});
    assert.equal(animatedSource.isError,true);assert.match(animatedSource.value.error,/static_source_text_unproven/);
    projectVM.change("sourceTextProperty.numKeys=0;pointDocument.text="+JSON.stringify(builder.DETERMINISTIC_CASES["accents-descenders"].expectedText)+";");
    const accentInput={...clone(protocolInput),caseId:"accents-descenders",expectedText:builder.DETERMINISTIC_CASES["accents-descenders"].expectedText};
    const nativeAccents=await call("build_solution_plan",{solutionId:"text-visual-review-plan",inputs:accentInput});
    assert.equal(nativeAccents.isError,false,JSON.stringify(nativeAccents));
    assert.equal(nativeAccents.value.plan.textReview.expectedText,"ÁÉÍÓÚ ЙЁ\ragjpqy");
    const beforeLF=nativeReads;
    const accentLF=await call("build_solution_plan",{solutionId:"text-visual-review-plan",inputs:{...accentInput,expectedText:"ÁÉÍÓÚ ЙЁ\nagjpqy"}});
    assert.equal(accentLF.isError,true);assert.equal(nativeReads,beforeLF);
    projectVM.change("pointDocument.text="+JSON.stringify("ÁÉÍÓÚ ЙЁ\nagjpqy")+";");
    const observedLF=await call("build_solution_plan",{solutionId:"text-visual-review-plan",inputs:accentInput});
    assert.equal(observedLF.isError,true);assert.match(observedLF.value.error,/text_observation_incomplete/);
    projectVM.change('pointDocument.text="Scaled Text";');
    let changed=false;
    const drift=await call("build_solution_plan",{solutionId:"text-visual-review-plan",inputs:protocolInput},raw=>{
      if(raw.result?.protectedProperties && !changed){changed=true;projectVM.change("app.project.revision=99;");}
    });
    assert.equal(drift.isError,true);assert.match(drift.value.error,/stale_project/);
    assert.equal(projectVM.read("writes"),0);
    assert.equal(projectVM.read("boxGetterReads"),0);
    return {mcpDispatch:true,nativeVMReadOnly:true,nativeReads,projectWrites:0,pointTextBoxGetterReads:0,
      rawHostSerializationFaultReproduced:true,sourceValueFailurePreserved:true,otherProtectedValuePreserved:true,exactNativeCR:true};
  } finally {
    for(const p of pending.values()){clearTimeout(p.timer);p.reject(new Error("isolated fixture closed"));}
    if(lines)lines.close();
    if(adapter)await stopChild(adapter);
    if(fixture)await fixture.stop();
    cp.spawn=spawn;
  }
}

async function main() {
  const built = build();
  assert.equal(built.plan.steps.length,10);
  assert.deepEqual(built.plan.steps.map(s=>s.tool),["get_project_info","get_layer_details","get_layer_details",
    "save_comp_frame_png","save_comp_frame_png","save_comp_frame_png","get_layer_details","get_layer_details","get_comp_details","get_project_info"]);
  assert.equal(built.plan.textReview.declarations.finalProjectInfoStepIndex,10);
  assert.deepEqual(built.plan.textReview.declarations.postReadCompStepIndices,[9]);
  assert.equal(built.plan.textReview.observation.project.projectId,sha256(normalizeProject(projectFile)));
  assert.equal(built.projectMutations,0);
  assert.equal(built.plan.textReview.observation.text.collapseTransformation,true);
  assert.equal(built.plan.textReview.observation.text.matchName,"ADBE Text Layer");
  const before = clone({input,context}); build(); assert.deepEqual({input,context},before);

  for (const caseId of Object.keys(builder.DETERMINISTIC_CASES)) {
    const value = {...clone(input),caseId};
    if (caseId === "accents-descenders") value.expectedText=builder.DETERMINISTIC_CASES[caseId].expectedText;
    if (caseId === "font-difference") value.fontRequest={runId:"11111111-2222-4333-8444-555555555555",stepIndex:2};
    const ctx=clone(context); ctx.textObservation=layer(10,2,value.expectedText);
    assert.equal(build(value,ctx).plan.textReview.caseId,caseId);
  }
  const direct={...clone(input),textTarget:{compItemId:20,layerId:2},route:[]};
  assert.equal(build(direct,{...context,textObservation:layer(20,2),routeObservation:null}).plan.steps.length,8);
  const rejects = (value,ctx=context,code) => assert.throws(()=>build(value,ctx),e=>!code || e.code === code);
  for (const mutate of [
    v=>{v.checks={staticSourceText:true};},v=>{delete v.frames[0].phase;},v=>{v.frames.push({time:3,phase:"exit"});},
    v=>{v.frames[0].phase="unknown";},v=>{v.fontRequest={runId:reviewId,stepIndex:2,requestedFont:"injected"};},
    v=>{v.route[0].childCompItemId=99;},v=>{v.textTarget.layerId=0;},v=>{v.bounds=[0,0,1,1];},
    v=>{v.frames[1]=clone(v.frames[0]);},v=>{v.checks=[];}
  ]) {
    const value=clone(input); mutate(value); rejects(value);
    let calls=0;
    await assert.rejects(()=>builder.observeTextVisualReviewPlan(value,async()=>{calls++;return {};},reviewId));
    assert.equal(calls,0,"invalid input must issue zero observations");
  }
  const arrayCase={...clone(input),caseId:["scaled-precomp-text"]};
  rejects(arrayCase,context,"invalid_case_id");
  let arrayCaseReads=0;
  await assert.rejects(()=>builder.observeTextVisualReviewPlan(arrayCase,async()=>{arrayCaseReads++;return {};},reviewId),e=>e.code === "invalid_case_id");
  assert.equal(arrayCaseReads,0,"non-string caseId must issue zero observations");
  rejects({...input,frames:[{time:0.01,phase:"hold"}]},context,"time_off_frame_grid");
  rejects({...input,frames:[{time:10,phase:"hold"}]},context,"time_outside_comp");
  for (const mutate of [
    c=>{c.textObservation.comp.itemId=99;},c=>{c.textObservation.layer.id=999;},
    c=>{c.textObservation.layer.textLayer=false;},c=>{c.textObservation.text.kind="object";},
    c=>{c.textObservation.layer.matchName="ADBE AV Layer";},c=>{c.textObservation.layer.source={itemId:10,type:"comp"};},
    c=>{c.textObservation.layer.layerKind="shape";},c=>{c.textObservation.layer.collapseTransformation=null;},
    c=>{c.textObservation.protectedProperties[0].numKeys=8;},c=>{c.textObservation.protectedProperties[0].expressionEnabled=true;},
    c=>{c.textObservation.protectedProperties[0].path.reverse();},c=>{c.routeObservation.layer.source.itemId=99;},
    c=>{c.routeObservation.layer.threeDLayer=true;},c=>{c.routeObservation.layer.collapseTransformation=true;},
    c=>{c.textObservation.layer.timeRemapEnabled=true;},
    c=>{delete c.project.supported;},c=>{c.textObservation.layer.parent={id:8};}
  ]) { const ctx=clone(context); mutate(ctx); rejects(input,ctx); }
  const noRasterFlag=clone(context);noRasterFlag.textObservation.layer.collapseTransformation=false;
  assert.equal(build(input,noRasterFlag).plan.textReview.observation.text.collapseTransformation,false);

  const reads=[];
  const read=async(tool,args)=>{
    reads.push({tool,args:clone(args)});
    if (tool === "get_project_info") return clone(project);
    if (tool === "get_comp_details") return clone(comps.find(c=>c.itemId === args.compItemId));
    return clone(args.layerId === 2 ? context.textObservation : context.routeObservation);
  };
  const observed=await builder.observeTextVisualReviewPlan(input,read,reviewId);
  assert.equal(observed.plan.steps.length,10);
  assert.deepEqual(reads.map(r=>r.tool),["get_project_info","get_comp_details","get_comp_details","get_layer_details","get_layer_details","get_project_info"]);
  assert.deepEqual(reads.at(-3).args.protectedProperties,[["ADBE Text Properties","ADBE Text Document"]]);
  let projects=0;
  await assert.rejects(()=>builder.observeTextVisualReviewPlan(input,async(tool,args)=>tool === "get_project_info"
    ? {...project,revision:++projects === 2 ? 99 : 42} : read(tool,args),reviewId),e=>e.code === "stale_project");
  const discovery=require("../mcp-server/solution-discovery");
  const names=["build_solution_plan","get_comp_visual_review_manifest","get_project_info","get_layer_details","save_comp_frame_png"];
  const discovered=discovery.getSolution({id:"text-visual-review-plan"},names.map(name=>({name})));
  assert.deepEqual(discovered.planBuilder,builder.getTextVisualReviewBuilderContract());
  assert.equal(discovered.planBuilder.inputSchema.properties.frames.maxItems,3);
  assert.deepEqual(discovered.planBuilder.inputSchema.properties.fontRequest.required,["runId","stepIndex"]);
  const transport=await protocol();
  console.log(JSON.stringify({ok:true,suite:"text-visual-review-plan-smoke",cases:4,steps:10,transport,
    checks:"real preview shapes; strict invalid zero-read inputs; target/route/static proof; fresh revision; existing builder wrapper; discovery contract",
    live:false,projectMutations:0,glyphRenderingVerified:false}));
}
module.exports={clone,reviewId,projectFile,project,comps,layer,input,context,build};
if(require.main === module) main().catch(error=>{console.error(error);process.exitCode=1;});
