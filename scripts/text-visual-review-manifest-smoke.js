#!/usr/bin/env node
"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const os=require("node:os");
const {sha256}=require("../mcp-server/review-evidence");
const records=require("../mcp-server/plan-run-records");
const {createManifest,validateTextReviewPlanShape}=require("../mcp-server/comp-visual-review-manifest");
const {buildCompVisualReviewPlan}=require("../mcp-server/comp-visual-review-plan");
const {png}=require("./placeholder-visual-fixture");
const f=require("./text-visual-review-plan-smoke");
const runId="aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",fontRunId="11111111-2222-4333-8444-555555555555";
async function main() {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),"ae-text-integrity-"));
  const options={exportRoot:path.join(root,"exports"),logDir:path.join(root,"logs")};
  fs.mkdirSync(options.exportRoot); fs.mkdirSync(options.logDir);
  let negatives=0;
  try {
    const makeRecord=(input=f.input,context=f.context)=>{
      const built=f.build(input,context),plan=built.plan,buffer=png(1920,1080),hash=sha256(buffer);
      const steps=plan.steps.map((s,i)=>{
        let result;
        if(s.tool==="get_project_info") result=f.clone(f.project);
        if(s.tool==="get_comp_details") result=f.clone(f.comps.find(c=>c.itemId === s.args.compItemId));
        if(s.tool==="get_layer_details") result=f.clone(s.args.layerId === 2 ? context.textObservation : context.routeObservation);
        if(s.tool==="save_comp_frame_png") {
          const filePath=path.join(options.exportRoot,s.args.outputFileName);
          fs.writeFileSync(filePath,buffer); // Synthetic PNG integrity only, no AE or glyph rendering.
          result={comp:f.clone(f.comps[0]),frame:{time:s.args.time,frameNumber:Math.round(s.args.time*30)},
            resolutionFactor:{restored:true,before:[1,1],after:[1,1],applied:[1,1]},
            file:{outputFileName:s.args.outputFileName,outputPath:filePath,sha256:hash,width:1920,height:1080,
              byteLength:buffer.length,pngComplete:true,existsAfter:true,deletedAfterReadBack:false}};
        }
        return {...f.clone(s),index:i+1,status:"completed",result};
      });
      return {schema:"ae-agent-plan-run-record.v1",runId,project:{file:f.projectFile},plan,
        run:{id:runId,dryRun:false,ok:true,failedCount:0,finishedAt:"2026-10-04T12:01:00.000Z",
          provenance:{planSha256:sha256(plan),projectId:plan.textReview.observation.project.projectId},steps}};
    };
    const base=makeRecord();
    assert.equal(validateTextReviewPlanShape(base.plan.steps,base.plan.textReview).finalStepIndex,10);
    const golden=await createManifest(base,options);
    assert.equal(golden.status,"complete");
    assert.equal(golden.textEvidenceStatus,"verified");
    assert.equal(golden.planSha256,sha256(base.plan));
    for(const key of ["currentProjectStateVerified","canonicalFreshness","artisticAccepted","visibleBoundsVerified","fontRenderingVerified"]) assert.equal(golden[key],false);
    assert.equal(golden.historicalCapture,true);
    for(const binding of golden.frameBindings) {
      assert.equal(binding.runId,runId); assert.equal(binding.planSha256,sha256(base.plan));
      assert.equal(binding.rootCompItemId,20); assert.equal(binding.stepIndex,3+binding.ordinal);
    }
    const badShape = mutate => {const record=f.clone(base);mutate(record);assert.throws(()=>validateTextReviewPlanShape(record.plan.steps,record.plan.textReview));negatives++;};
    badShape(r=>{r.plan.steps.splice(9,0,{tool:"delete_layer",args:{compItemId:20,layerId:5}});
      r.plan.textReview.declarations.finalProjectInfoStepIndex++;});
    badShape(r=>{r.plan.steps.splice(3,0,{tool:"get_project_info",args:{}});r.plan.textReview.declarations.finalProjectInfoStepIndex++;});
    badShape(r=>{r.plan.steps[6].args.protectedProperties=[];});
    badShape(r=>{r.plan.steps[1].args.font="hidden";});
    badShape(r=>{r.plan.textReview.rootCompItemId=10;});
    badShape(r=>{r.plan.textReview.frames[0].time=1;});
    badShape(r=>{r.plan.textReview.frames[0].frameNumber=300;});
    badShape(r=>{r.plan.textReview.declarations.exportStepIndices.reverse();});
    badShape(r=>{r.plan.textReview.route.push(f.clone(r.plan.textReview.route[0]));});
    badShape(r=>{r.plan.textReview.fontRequest={runId:fontRunId,stepIndex:99,requestedFont:"fake"};});
    badShape(r=>{r.plan.textReview.observation.text.matchName="ADBE AV Layer";});
    badShape(r=>{delete r.plan.textReview.observation.text.matchName;}); // Historical v1 shape cannot invent native identity.
    badShape(r=>{r.plan.textReview.observation.route.collapseTransformation=true;});
    const negative=async(mutate)=>{
      const r=f.clone(base);mutate(r);
      const manifest=await createManifest(r,options);
      assert.notEqual(manifest.status,"complete");assert.equal(manifest.ok,false);negatives++;
    };
    for(const mutate of [
      r=>{r.run.steps.push(f.clone(r.run.steps[1]));},
      r=>{r.run.steps[1].tool="get_comp_details";},r=>{r.run.steps[1].args.layerId=99;},
      r=>{r.run.steps[1].result.comp.itemId=99;},r=>{r.run.steps[1].result.layer.id=99;},
      r=>{r.run.steps[1].result.layer.textLayer=false;r.run.steps[1].result.layer.name=f.input.expectedText;},
      r=>{r.run.steps[1].result.layer.matchName="ADBE AV Layer";},
      r=>{r.run.steps[1].result.layer.source={itemId:10,type:"comp"};},
      r=>{r.run.steps[6].result.layer.collapseTransformation=false;},
      r=>{r.run.steps[1].result.text=null;delete r.run.steps[1].result.layer.text;},
      r=>{r.run.steps[1].result.protectedProperties=[];},r=>{r.run.steps[6].result.protectedProperties=[];},
      r=>{r.run.steps[1].result.protectedProperties[0].numKeys=8;},
      r=>{r.run.steps[6].result.protectedProperties[0].expressionEnabled=true;},
      r=>{r.run.steps[6].result.protectedProperties[0].path.reverse();},
      r=>{r.run.steps[6].result.text.font="foreign";r.run.steps[6].result.layer.text.font="foreign";},
      r=>{r.run.steps[6].result.text.fontSize=100;r.run.steps[6].result.layer.text.fontSize=100;},
      r=>{r.run.steps[6].result.text.justification="left";r.run.steps[6].result.layer.text.justification="left";},
      r=>{r.run.steps[7].result.layer.source.itemId=99;},r=>{r.run.steps[2].result.layer.threeDLayer=true;},
      r=>{r.run.steps[7].result.layer.timeRemapEnabled=true;},r=>{r.run.steps[7].result.layer.collapseTransformation=true;},
      r=>{r.run.steps[7].result.layer.startTime=1.2;},
      r=>{r.run.steps[7].result.transform.scale.value=[40,40,100];},
      r=>{r.run.steps[9].result.revision=99;},r=>{r.run.steps[0].result.revision=99;},
      r=>{delete r.run.steps[9].result.supported;},r=>{r.run.steps[9].status="failed";},
      r=>{r.run.provenance.planSha256="f".repeat(64);},r=>{r.run.provenance.projectId="foreign";},
      r=>{r.project.file="C:/foreign.aep";},r=>{r.run.steps[3].result.frame.frameNumber=300;},
      r=>{r.run.steps[3].args.time=1;},r=>{r.run.steps[3].result.comp.frameRate=24;},
      r=>{r.run.steps[8].result.width=100;},
      r=>{r.run.steps.splice(6,1);},r=>{r.run.steps.push({index:99,tool:"delete_layer",args:{},status:"completed",result:{}});}
    ]) await negative(mutate);
    const accents={...f.clone(f.input),caseId:"accents-descenders",expectedText:"ÁÉÍÓÚ ЙЁ\ragjpqy"};
    const accentContext=f.clone(f.context);accentContext.textObservation=f.layer(10,2,accents.expectedText);
    const accent=makeRecord(accents,accentContext);assert.equal((await createManifest(accent,options)).ok,true);
    accent.run.steps[6].result.text.text="ÁÉÍÓÚ ЙЁ\nagjpqy";accent.run.steps[6].result.layer.text.text=accent.run.steps[6].result.text.text;
    assert.equal((await createManifest(accent,options)).ok,false);negatives++;
    accent.run.steps[6].result.text.text="AÉÍÓÚ ЙЁ\ragjpqy";accent.run.steps[6].result.layer.text.text=accent.run.steps[6].result.text.text;
    assert.equal((await createManifest(accent,options)).ok,false);negatives++;
    accent.run.steps[6].result.text.text="A\u0301ÉÍÓÚ ЙЁ\ragjpqy";accent.run.steps[6].result.layer.text.text=accent.run.steps[6].result.text.text;
    assert.equal((await createManifest(accent,options)).ok,false);negatives++;

    // Dynamic values may be compared only at the same observed comp.time.
    const dynamicContext=f.clone(f.context);dynamicContext.textObservation.transform.position.numKeys=2;
    const dynamic=makeRecord(f.input,dynamicContext);
    dynamic.run.steps[6].result.comp.time=1;
    dynamic.run.steps[6].result.transform.position.value=[700,400,0];
    assert.equal((await createManifest(dynamic,options)).ok,true);
    dynamic.run.steps[6].result.comp.time=0;
    assert.equal((await createManifest(dynamic,options)).ok,false);negatives++;

    const fontInput={...f.clone(f.input),caseId:"font-difference",checks:["staticSourceText","fontDifference"],fontRequest:{runId:fontRunId,stepIndex:2}};
    const fontRecord=makeRecord(fontInput);
    let fm=await createManifest(fontRecord,options);
    assert.equal(fm.status,"incomplete");assert.equal(fm.fontObservation.status,"blocked");
    function priorRecord() {
      const target=f.context.textObservation;
      const plan={targetProject:{file:f.projectFile},steps:[
        {tool:"get_layer_details",args:{compItemId:10,layerId:2}},
        {tool:"update_text_layer",args:{compItemIndex:1,compName:"Nested Precomp",layerIndex:2,font:"RequestedFont-Bold"}}
      ]};
      return {schema:"ae-agent-plan-run-record.v1",runId:fontRunId,project:{file:f.projectFile},plan,
        run:{id:fontRunId,dryRun:false,ok:true,finishedAt:"2026-10-04T11:00:00Z",
          provenance:{schema:"ae-agent-run-provenance.v1",projectId:fontRecord.plan.textReview.observation.project.projectId,planSha256:sha256(plan)},
          steps:[{index:1,...f.clone(plan.steps[0]),status:"completed",result:f.clone(target)},
            {index:2,...f.clone(plan.steps[1]),status:"completed",isError:false,mutationResultIsError:false,
              mutationResult:{comp:{itemIndex:1,name:"Nested Precomp"},layer:{id:2},text:{kind:"TextDocument",font:"ArialMT"}},
              result:{comp:{itemIndex:1,name:"Nested Precomp"},layer:{id:2}}}]}};
    }
    const prior=priorRecord();records.writeRecord(options.logDir,prior);
    fm=await createManifest(fontRecord,options);assert.equal(fm.ok,true);assert.equal(fm.fontObservation.requestedFont,"RequestedFont-Bold");
    assert.equal(fm.fontObservation.storedFontMatchesRequest,false);assert.equal(fm.fontObservation.fontRenderingVerified,false);
    function normalizedPriorRecord() {
      const r=priorRecord(),id="text-live-font-baseline-fixture-01",index=2,step=r.run.steps[index-1];
      const args=f.clone(r.plan.steps[index-1].args);
      step.args={...f.clone(args),verifyAfter:true,idempotencyKey:`ae-plan-${id}-step-${index}-update_text_layer`,idempotencyScope:`ae-plan:${id}`};
      r.run.validation={ok:true,validationId:id,steps:[
        {index:1,tool:"get_layer_details",valid:true,executable:true,mutatesProject:false,requiresRuntimeBinding:false,
          args:f.clone(r.plan.steps[0].args),safeArgs:f.clone(r.plan.steps[0].args)},
        {index,tool:"update_text_layer",valid:true,executable:true,mutatesProject:true,requiresRuntimeBinding:false,
          args,safeArgs:f.clone(step.args),autofixes:["verifyAfter=true","idempotencyKey","idempotencyScope"]}
      ]};
      // A completed font receipt is independent of unresolved verification on another step.
      r.run.ok=false;r.run.errorCode="verification_required";r.run.outcome={status:"verification_required"};
      return r;
    }
    const normalized=normalizedPriorRecord();records.writeRecord(options.logDir,normalized);
    const normalizedBefore=fs.readFileSync(records.fileFor(options.logDir,fontRunId),"utf8");
    fm=await createManifest(fontRecord,options);
    assert.equal(fm.ok,true);assert.equal(fm.fontObservation.status,"recorded");
    assert.equal(fm.fontObservation.requestedFont,"RequestedFont-Bold");assert.equal(fm.fontRenderingVerified,false);
    assert.equal(fs.readFileSync(records.fileFor(options.logDir,fontRunId),"utf8"),normalizedBefore);
    assert.equal(records.readRecord(options.logDir,fontRunId).run.ok,false);
    assert.equal(records.readRecord(options.logDir,fontRunId).run.errorCode,"verification_required");
    const safetyRow=r=>r.run.validation.steps[1];
    for(const mutate of [
      r=>{delete r.run.validation;},r=>{r.run.validation.ok=false;},r=>{delete r.run.validation.validationId;},
      r=>{r.run.validation.validationId="foreign";},r=>{r.run.provenance.schema="caller_declared";},
      r=>{r.run.validation.steps=[];},r=>{r.run.validation.steps.push(f.clone(safetyRow(r)));},
      r=>{safetyRow(r).index=1;},r=>{safetyRow(r).tool="set_layer_transform";},
      r=>{safetyRow(r).valid=false;},r=>{safetyRow(r).executable=false;},
      r=>{safetyRow(r).mutatesProject=false;},r=>{safetyRow(r).requiresRuntimeBinding=true;},
      r=>{delete safetyRow(r).args;},r=>{safetyRow(r).args.font="ForeignFont";},
      r=>{safetyRow(r).safeArgs.font="ForeignFont";},
      r=>{r.run.steps[1].args.font="ForeignFont";safetyRow(r).safeArgs.font="ForeignFont";},
      r=>{r.run.steps[1].args.layerIndex=99;safetyRow(r).safeArgs.layerIndex=99;},
      r=>{r.run.steps[1].args.compName="Foreign Comp";safetyRow(r).safeArgs.compName="Foreign Comp";},
      r=>{r.run.steps[1].args.fontSize=90;safetyRow(r).safeArgs.fontSize=90;},
      r=>{r.run.steps[1].args.verifyAfter=false;safetyRow(r).safeArgs.verifyAfter=false;},
      r=>{r.run.steps[1].args.idempotencyKey="custom-override";safetyRow(r).safeArgs.idempotencyKey="custom-override";},
      r=>{r.run.steps[1].args.idempotencyScope="custom-override";safetyRow(r).safeArgs.idempotencyScope="custom-override";},
      r=>{delete r.run.steps[1].args.idempotencyScope;delete safetyRow(r).safeArgs.idempotencyScope;},
      r=>{r.plan.steps[1].args.compName="Foreign Comp";r.run.steps[1].args.compName="Foreign Comp";
        safetyRow(r).args.compName="Foreign Comp";safetyRow(r).safeArgs.compName="Foreign Comp";r.run.provenance.planSha256=sha256(r.plan);},
      r=>{r.run.steps[1].mutationResult.layer.id=99;},r=>{r.run.steps[1].status="unknown";},
      r=>{r.run.steps[1].mutationResultIsError=true;},r=>{r.run.provenance.planSha256="0".repeat(64);}
    ]) {
      const r=normalizedPriorRecord();mutate(r);records.writeRecord(options.logDir,r);
      fm=await createManifest(fontRecord,options);assert.equal(fm.status,"incomplete");assert.equal(fm.fontObservation.status,"blocked");negatives++;
    }
    for(const mutate of [
      r=>{r.project.file="C:/foreign.aep";},r=>{r.run.provenance.planSha256="0".repeat(64);},
      r=>{r.run.steps[1].args.layerIndex=99;},r=>{r.run.steps[1].mutationResult.layer.id=99;},
      r=>{r.run.steps[1].status="unknown";},r=>{r.run.steps[1].index=99;},
      r=>{r.run.steps[0].result.comp.itemId=99;},r=>{r.plan.steps[1].args.font="Other";},
      r=>{r.run.steps[0].args.layerId=99;},r=>{delete r.run.steps[1].mutationResult;},
      r=>{r.run.steps.push(f.clone(r.run.steps[1]));},r=>{r.run.dryRun=true;},
      r=>{r.run.steps[1].status="failed";r.run.steps[1].mutationResultIsError=true;r.run.steps[1].mutationResult={code:"generic_failure",ok:false};}
    ]) {
      const r=priorRecord();mutate(r);records.writeRecord(options.logDir,r);
      fm=await createManifest(fontRecord,options);assert.equal(fm.status,"incomplete");assert.equal(fm.fontObservation.status,"blocked");negatives++;
    }
    const rejected=priorRecord(),failedStep=rejected.run.steps[1];
    failedStep.status="failed";failedStep.preMutationRejected=true;failedStep.mutationResultIsError=true;
    failedStep.mutationResult={ok:false,code:"native_rejected_unavailable_font"};
    records.writeRecord(options.logDir,rejected);
    fm=await createManifest(fontRecord,options);assert.equal(fm.status,"incomplete");assert.equal(fm.textEvidenceStatus,"font_request_rejected");

    // The ordinary legacy manifest keeps its established contract and result.
    const legacyBuilt=buildCompVisualReviewPlan({targets:[{compItemId:20,times:[0]}]},f.context,f.reviewId);
    const legacy={...f.clone(base),plan:legacyBuilt.plan,run:{...f.clone(base.run),steps:[base.run.steps[0],base.run.steps[3],base.run.steps[8],base.run.steps[9]].map((s,i)=>({...f.clone(s),index:i+1}))}};
    const lm=await createManifest(legacy,options);assert.equal(lm.ok,true);assert.equal(lm.textEvidenceStatus,undefined);
    console.log(JSON.stringify({ok:true,suite:"text-visual-review-manifest-smoke",negatives,
      checks:"closed all-step shape; real native TextDocument/protected paths; pre/post IDs/font/timing/route/revision; canonical run/step/frame; durable font exact step/target; legacy",
      fixture:"synthetic PNG integrity only",live:false,visibleBoundsVerified:false,fontRenderingVerified:false}));
  } finally {
    const resolved=path.resolve(root),tmp=path.resolve(os.tmpdir());
    assert.ok(resolved.startsWith(tmp+path.sep));fs.rmSync(resolved,{recursive:true,force:true});
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
