#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { prepareToolScript } = require("../mcp-server/bridge-daemon");
const { createProject } = require("./placeholder-protection-fixture");
const text = require("../mcp-server/text-visual-review-plan");
const { validateTextReviewPlanShape } = require("../mcp-server/comp-visual-review-manifest");
const fixture = require("./text-visual-review-plan-smoke");
const { sha256 } = require("../mcp-server/review-evidence");

async function main() {
  const project = createProject(); // Object-only VM: no AE, HTTP daemon or PNG/file export.
  project.change(`
    var timing = {stretch:150,remap:false,throwStretch:false,throwRemap:false};
    var timingReads = {stretch:0,remap:0,setters:0};
    TextLayer.prototype.property = AVLayer.prototype.property;
    Object.defineProperty(TextLayer.prototype,"numProperties",{get:function(){return this.groups.length;}});
    Object.setPrototypeOf(target,TextLayer.prototype);
    target.matchName="ADBE Text Layer";target.source=null;target.threeDLayer=false;
    target.parent=null;target.collapseTransformation=true;target.startTime=1.2;target.inPoint=1.2;target.outPoint=14.4;
    var ParagraphJustification={LEFT_JUSTIFY:1,CENTER_JUSTIFY:2,RIGHT_JUSTIFY:3};
    var textGroup=new Group("ADBE Text Properties",3,target);
    textGroup.add("ADBE Text Document",{text:"Scaled Text",font:"ArialMT",fontSize:72,justification:2});
    target.groups.push(textGroup);
    Object.defineProperty(target,"stretch",{configurable:true,get:function(){
      timingReads.stretch++;if(timing.throwStretch)throw new Error("native stretch unavailable");return timing.stretch;
    },set:function(){timingReads.setters++;throw new Error("Unexpected timing write");}});
    Object.defineProperty(target,"timeRemapEnabled",{configurable:true,get:function(){
      timingReads.remap++;if(timing.throwRemap)throw new Error("native remap unavailable");return timing.remap;
    },set:function(){timingReads.setters++;throw new Error("Unexpected timing write");}});
  `);
  assert.deepEqual(project.read("({text:target instanceof TextLayer,av:target instanceof AVLayer})"), {text:true,av:false});

  const reads = [
    {tool:"get_layer_details",args:{compItemId:10,layerId:11,protectedProperties:[["ADBE Text Properties","ADBE Text Document"]]},layer:value=>value.layer},
    {tool:"get_comp_details",args:{compItemId:10},layer:value=>value.layers.find(layer=>layer.id === 11)},
    {tool:"get_property_value",args:{compItemId:10,layerId:11,propertyPath:["ADBE Transform Group","ADBE Position"]},layer:value=>value.layer}
  ];
  for (const read of reads) {
    const prepared = await prepareToolScript(read.tool,read.args);
    assert.equal(typeof prepared.script,"string");
    assert(prepared.script.includes("function __codexLayerInfo(layer)"));
    assert(!/\blayer\.(?:stretch|timeRemapEnabled)\s*=/.test(prepared.script), "Read script must contain no timing setter");
    read.script = prepared.script;
  }

  let nativeCases = 0, builderRejects = 0, manifestRejects = 0;
  function observe(setup,expectedStretch,expectedRemap,selectedReads = reads) {
    project.change("timing.throwStretch=false;timing.throwRemap=false;timing.stretch=150;timing.remap=false;"+setup);
    let details;
    for (const read of selectedReads) {
      const raw = project.execute(read.script);
      assert.equal(raw.ok,true,JSON.stringify(raw));
      const result = raw.result, observed = read.layer(result);
      assert(observed,`${read.tool} must observe target layer`);
      assert.equal(observed.stretch,expectedStretch,read.tool+" native stretch");
      assert.equal(observed.timeRemapEnabled,expectedRemap,read.tool+" native remap");
      assert.equal(observed.startTime,1.2);assert.equal(observed.inPoint,1.2);assert.equal(observed.outPoint,14.4);
      if (read.tool === "get_layer_details") details = result;
      nativeCases++;
    }
    assert.equal(project.read("timingReads.setters"),0);
    assert.equal(project.read("writes"),0);
    assert.deepEqual(project.read("undo"),[]);
    return details;
  }
  const positive = observe("",150,false);
  for (const stretch of [100,150,-150,0]) observe(`timing.stretch=${stretch};`,stretch,false);
  observe("timing.remap=true;",150,true);
  const unavailable = [];
  for (const expression of ["NaN","Infinity","-Infinity","null","undefined",'"150"',"false"]) {
    unavailable.push(observe(`timing.stretch=${expression};`,null,false));
  }
  unavailable.push(observe("timing.throwStretch=true;",null,false));
  for (const expression of ["null","undefined","0",'"false"']) {
    unavailable.push(observe(`timing.remap=${expression};`,150,null));
  }
  unavailable.push(observe("timing.throwRemap=true;",150,null));

  // Existing builder and persisted-plan validator must retain unknown rather than authorize it.
  const context = fixture.clone(fixture.context);
  context.textObservation = positive;
  context.textObservation.comp.name = fixture.comps[1].name;
  const input = {...fixture.clone(fixture.input),textTarget:{compItemId:10,layerId:11}};
  const built = text.buildTextVisualReviewPlan(input,context,fixture.reviewId);
  assert.equal(built.plan.textReview.observation.text.stretch,150);
  validateTextReviewPlanShape(built.plan.steps,built.plan.textReview);
  for (const observation of unavailable) {
    const unknown = fixture.clone(context);
    unknown.textObservation.layer.stretch = observation.layer.stretch;
    unknown.textObservation.layer.timeRemapEnabled = observation.layer.timeRemapEnabled;
    assert.throws(()=>text.buildTextVisualReviewPlan(input,unknown,fixture.reviewId),error=>
      error.code === (observation.layer.timeRemapEnabled === null ? "unsupported_layer_route" : "unsupported_layer_timing"));
    builderRejects++;
    const stored = fixture.clone(built.plan.textReview);
    stored.observation.text.stretch = observation.layer.stretch;
    stored.observation.text.timeRemapEnabled = observation.layer.timeRemapEnabled;
    assert.throws(()=>validateTextReviewPlanShape(built.plan.steps,stored),error=>error.code === "non_builder_plan");
    manifestRejects++;
  }
  for (const key of ["stretch","timeRemapEnabled"]) {
    const unknownRoute = fixture.clone(context);unknownRoute.routeObservation.layer[key]=null;
    assert.throws(()=>text.buildTextVisualReviewPlan(input,unknownRoute,fixture.reviewId));builderRejects++;
    const stored = fixture.clone(built.plan.textReview);stored.observation.route[key]=null;
    assert.throws(()=>validateTextReviewPlanShape(built.plan.steps,stored));manifestRejects++;
  }

  const plainReads = reads.map(read=>({...read}));
  plainReads[0].script = (await prepareToolScript("get_layer_details",{compItemId:10,layerId:11})).script;
  project.change(`
    target.groups=target.groups.filter(function(group){return group.matchName!=="ADBE Text Properties";});
    Object.setPrototypeOf(target,AVLayer.prototype);target.matchName="ADBE AV Layer";target.source=a;
  `);
  assert.equal(project.read("target instanceof AVLayer"),true);
  for (const stretch of [100,150,-150]) observe(`timing.stretch=${stretch};`,stretch,false,plainReads);

  // Camera/base-layer properties may be absent or unavailable; neither proves 100/false.
  project.change(`
    function CameraLayer(){};CameraLayer.prototype.property=TextLayer.prototype.property;
    Object.defineProperty(CameraLayer.prototype,"numProperties",{get:function(){return this.groups.length;}});
    Object.setPrototypeOf(target,CameraLayer.prototype);target.matchName="ADBE Camera Layer";target.source=null;
  `);
  assert.deepEqual(project.read("({camera:target instanceof CameraLayer,av:target instanceof AVLayer,textProperty:target.property('ADBE Text Properties')})"),
    {camera:true,av:false,textProperty:null});
  observe("timing.stretch=undefined;timing.remap=undefined;",null,null,plainReads);
  observe("timing.throwStretch=true;timing.throwRemap=true;",null,null,plainReads);
  project.change("delete target.stretch;delete target.timeRemapEnabled;");
  for (const read of plainReads) {
    const raw = project.execute(read.script);assert.equal(raw.ok,true,JSON.stringify(raw));
    const observed=read.layer(raw.result);
    assert.equal(observed.stretch,null);assert.equal(observed.timeRemapEnabled,null);nativeCases++;
  }
  assert.equal(project.read("timingReads.setters"),0);assert.equal(project.read("writes"),0);
  assert.deepEqual(project.read("undo"),[]);
  console.log(JSON.stringify({ok:true,suite:"native-layer-timing-smoke",nativeCases,builderRejects,manifestRejects,
    textLayerInstance:true,avLayerInstance:false,timingSetters:0,projectWrites:0,live:false,
    scripts:reads.map(read=>({tool:read.tool,sha256:sha256(read.script)}))}));
}

if (require.main === module) main().catch(error=>{console.error(error);process.exitCode=1;});
