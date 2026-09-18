#!/usr/bin/env node
"use strict";

const assert = require("assert");
const vm = require("vm");
const { validateToolInput } = require("../mcp-server/slideshow-tools");
const { buildSlideshowPlan } = require("../mcp-server/slideshow-plan-builder");
const { buildSemanticVerification } = require("../mcp-server/semantic-verification");

const STRUCTURE_SCHEMA = "ae-agent-comp-structure.v1";
const file = "C:\\fixture\\scope-safety.aep";
const prefix = "CODX_SCOPE_";

class LeafProperty {
  constructor(name) { this.name=name; this.matchName=name; this.numProperties=0; this.numKeys=0; this.canSetExpression=false; this.expression=""; }
}
class Group {
  constructor(map={}) { this.map=map; this.list=Object.values(map); this.numProperties=this.list.length; }
  property(key) { return typeof key === "number" ? this.list[key-1] : this.map[key] || null; }
}
class FootageItem {
  constructor(name,duration=4) { this.name=name; this.duration=duration; this.file={fsName:`C:\\fixture\\${name}`}; this.width=320; this.height=180; this.hasAudio=false; this.mainSource={isStill:false}; }
}
class AVLayer {
  constructor(name,source=null) {
    this.name=name; this.source=source; this.numProperties=0; this.startTime=0; this.inPoint=0; this.outPoint=source && source.duration || 4;
    this.stretch=100; this.timeRemapEnabled=false; this.motionBlur=false; this.enabled=true; this.hasAudio=Boolean(source&&source.hasAudio);
    this.audioEnabled=this.hasAudio; this.locked=false; this.comment=""; this.guideLayer=false; this.adjustmentLayer=false; this.threeDLayer=false;
    this.collapseTransformation=false; this.effectGroup=new Group();
  }
  property(key) {
    if (key === "ADBE Effect Parade") return this.effectGroup;
    if (key === "ADBE Text Properties") return null;
    if (key === "ADBE Transform Group") return new Group({"ADBE Opacity":new LeafProperty("ADBE Opacity")});
    return null;
  }
  replaceSource(source) { this.source=source; this.hasAudio=Boolean(source&&source.hasAudio); }
  duplicate() { return this.comp.insertLayer(this.clone(),0); }
  clone() { const copy=new AVLayer(this.name,this.source); for (const key of ["startTime","inPoint","outPoint","stretch","timeRemapEnabled","motionBlur","enabled","hasAudio","audioEnabled","locked","comment","guideLayer","adjustmentLayer","threeDLayer","collapseTransformation"]) copy[key]=this[key]; return copy; }
  copyToComp(comp) { comp.insertLayer(this.clone(),comp.numLayers ? 1 : 0); }
  get index() { return this.comp ? this.comp.layers.indexOf(this)+1 : null; }
}
class ShapeLayer extends AVLayer {}
class CompItem {
  constructor(project,name,duration=4) { this.project=project; this.name=name; this.duration=duration; this.width=1280; this.height=720; this.pixelAspect=1; this.frameRate=30; this.frameDuration=1/30; this.comment=""; this.motionBlur=false; this.shutterAngle=0; const layers=[]; layers.add=(source)=>this.insertLayer(new AVLayer(source.name,source),0); this.layers=layers; }
  get numLayers() { return this.layers.length; }
  layer(index) { return this.layers[index-1]; }
  insertLayer(layer,index) { layer.comp=this; layer.id=this.project.nextLayerId++; this.layers.splice(index,0,layer); return layer; }
  addLayer(layer) { return this.insertLayer(layer,this.layers.length); }
  duplicate() { const copy=this.project.addComp(this.name,this.duration); this.layers.forEach((layer)=>copy.addLayer(layer.clone())); return copy; }
}
class Project {
  constructor(path) { this.file={fsName:path}; this._items=[]; this.nextItemId=1; this.nextLayerId=1000; this.items={addComp:(name,width,height,pixelAspect,duration)=>this.addComp(name,duration)}; }
  get numItems() { return this._items.length; }
  item(index) { return this._items[index-1]; }
  add(item) { item.id=this.nextItemId++; this._items.push(item); return item; }
  addComp(name,duration=4) { return this.add(new CompItem(this,name,duration)); }
  importFile() { throw new Error("unexpected import"); }
}

function owned(comp,rootName) { comp.comment=`AE_AGENT_SLIDESHOW:${prefix}:${rootName}`; return comp; }
function legacyOwned(comp) { comp.comment=`AE_AGENT_SLIDESHOW:${prefix}:`; return comp; }
function context(project) { return {app:{project,beginUndoGroup(){},endUndoGroup(){}},CompItem,FootageItem,AVLayer,ShapeLayer,PropertyValueType:{MARKER:99,CUSTOM_VALUE:98,NO_VALUE:97},File:function File(path){this.fsName=path;this.exists=true;},ImportOptions:function ImportOptions(value){this.value=value;},ParagraphJustification:{CENTER_JUSTIFY:1}}; }
function run(prepared,project) { return vm.runInNewContext(`(function(){${prepared.script}})()`,context(project),{timeout:2000}); }
function itemIndex(project,item) { return project._items.indexOf(item)+1; }
function layerSnapshot(layer) {
  return {
    layerId:layer.id,
    name:layer.name,
    sourceType:layer.source instanceof CompItem ? "comp" : layer.source instanceof FootageItem ? "footage" : "none",
    sourceItemId:layer.source ? layer.source.id : null,
    sourceName:layer.source ? layer.source.name : null,
    startTime:layer.startTime,
    inPoint:layer.inPoint,
    outPoint:layer.outPoint,
    stretch:layer.stretch,
    enabled:layer.enabled,
    audioEnabled:layer.hasAudio ? layer.audioEnabled : false,
    timeRemapEnabled:layer.timeRemapEnabled,
    guideLayer:layer.guideLayer,
    adjustmentLayer:layer.adjustmentLayer,
    threeDLayer:layer.threeDLayer,
    collapseTransformation:layer.collapseTransformation
  };
}
function fingerprint(project,comp) {
  return {itemIndex:itemIndex(project,comp),itemId:comp.id,name:comp.name,duration:comp.duration,numLayers:comp.numLayers,structureSchema:STRUCTURE_SCHEMA,layers:comp.layers.map(layerSnapshot)};
}
function extendArgs(root,protectedSourceFingerprints=[]) {
  return {expectedProjectFile:file,generatedPrefix:prefix,expectedRootCompName:root.name,targetDuration:6,introDuration:2,protectedSourceFingerprints};
}
function audit(project,root,sourceFingerprints) {
  return run(validateToolInput("audit_slideshow_generated",{expectedProjectFile:file,generatedPrefix:prefix,expectedRootCompName:root.name,expectedDuration:root.duration,sourceFingerprints}),project);
}
function reorder(comp) { const first=comp.layers.shift(); comp.layers.push(first); }
function sourceFixture() {
  const project=new Project(file),a=project.add(new FootageItem("a.mov")),b=project.add(new FootageItem("b.mov")),c=project.add(new FootageItem("c.mov")),source=project.addComp("Scene 1",4);
  source.addLayer(new AVLayer("Top",a)); source.addLayer(new AVLayer("Bottom",b));
  return {project,a,b,c,source};
}

const cases=[];

// 1. A valid mutation stays inside one exact owner tree and preserves a protected source snapshot.
{
  const {project,source}=sourceFixture(),baseline=fingerprint(project,source),root=owned(project.addComp(`${prefix}E01_ROOT`,4),`${prefix}E01_ROOT`),child=owned(project.addComp(`${prefix}E01_CHILD`,4),root.name);
  root.addLayer(new AVLayer("child",child));
  run(validateToolInput("extend_slideshow_cloned_tree",extendArgs(root,[baseline])),project);
  const result=audit(project,root,[baseline]);
  assert.strictEqual(root.duration,6); assert.strictEqual(child.duration,6); assert.strictEqual(result.sourceFingerprints[0].unchanged,true);
  cases.push("owned-tree-preserves-protected-structure");
}

// 2. A different owner with the same prefix is rejected before even the authorized root is written.
{
  const project=new Project(file),root=owned(project.addComp(`${prefix}ROOT`,4),`${prefix}ROOT`),other=owned(project.addComp(`${prefix}OTHER`,4),`${prefix}OTHER`);
  root.addLayer(new AVLayer("wrong owner",other));
  const readable=audit(project,root,[]); assert.strictEqual(readable.ok,true); assert(readable.details.externalDependencies.some((row)=>row.name===other.name&&row.reason==="different_owner"));
  assert.throws(()=>run(validateToolInput("extend_slideshow_cloned_tree",extendArgs(root)),project),/mutation_scope_owner_mismatch/);
  assert.strictEqual(root.duration,4); assert.strictEqual(other.duration,4);
  cases.push("foreign-owner-preflight-before-first-write");
}

// 3. External dependencies are read-only; ambiguous same-prefix legacy provenance fails closed.
{
  const project=new Project(file),root=owned(project.addComp(`${prefix}EXTERNAL_ROOT`,4),`${prefix}EXTERNAL_ROOT`),external=project.addComp("Shared external",4);
  root.addLayer(new AVLayer("shared read-only",external));
  const before=audit(project,root,[]); assert.strictEqual(before.ok,true); assert(before.details.externalDependencies.some((row)=>row.name===external.name));
  run(validateToolInput("extend_slideshow_cloned_tree",extendArgs(root)),project);
  assert.strictEqual(root.duration,6); assert.strictEqual(external.duration,4);
  const legacy=legacyOwned(project.addComp(`${prefix}LEGACY`,4)),legacyRoot=owned(project.addComp(`${prefix}LEGACY_ROOT`,4),`${prefix}LEGACY_ROOT`); legacyRoot.addLayer(new AVLayer("legacy",legacy));
  const legacyRead=audit(project,legacyRoot,[]); assert.strictEqual(legacyRead.ok,true); assert(legacyRead.details.externalDependencies.some((row)=>row.name===legacy.name&&row.reason==="ambiguous_provenance"));
  assert.throws(()=>run(validateToolInput("extend_slideshow_cloned_tree",extendArgs(legacyRoot)),project),/mutation_scope_provenance_ambiguous/);
  assert.strictEqual(legacyRoot.duration,4); assert.strictEqual(legacy.duration,4);
  cases.push("external-read-only-and-legacy-fails-closed");
}

// 4. Source replacement and layer reordering are independently detected with unchanged aggregates.
{
  const first=sourceFixture(),baseline=fingerprint(first.project,first.source); first.source.layer(1).replaceSource(first.c); const replaced=audit(first.project,owned(first.project.addComp(`${prefix}AUDIT_REPLACE`,4),`${prefix}AUDIT_REPLACE`),[baseline]);
  assert.strictEqual(replaced.sourceFingerprints[0].unchanged,false); assert.strictEqual(replaced.sourceFingerprints[0].reason,"structural_mismatch");
  const second=sourceFixture(),orderBaseline=fingerprint(second.project,second.source); reorder(second.source); const reordered=audit(second.project,owned(second.project.addComp(`${prefix}AUDIT_ORDER`,4),`${prefix}AUDIT_ORDER`),[orderBaseline]);
  assert.strictEqual(reordered.sourceFingerprints[0].unchanged,false); assert.strictEqual(reordered.sourceFingerprints[0].reason,"structural_mismatch");
  cases.push("source-replacement-and-order-detected");
}

// 5. Unchanged reads are deterministic; a legacy aggregate fingerprint never passes as unchanged.
{
  const {project,source}=sourceFixture(),baseline=fingerprint(project,source),root=owned(project.addComp(`${prefix}READ_ROOT`,4),`${prefix}READ_ROOT`),first=audit(project,root,[baseline]),second=audit(project,root,[baseline]);
  assert.strictEqual(first.sourceFingerprints[0].actual.digest,second.sourceFingerprints[0].actual.digest); assert.strictEqual(second.sourceFingerprints[0].unchanged,true);
  const legacy=audit(project,root,[{itemIndex:itemIndex(project,source),itemId:source.id,name:source.name,duration:source.duration,numLayers:source.numLayers}]);
  assert.strictEqual(legacy.ok,false); assert.strictEqual(legacy.sourceFingerprints[0].unchanged,false); assert.strictEqual(legacy.sourceFingerprints[0].reason,"structural_baseline_missing");
  cases.push("deterministic-read-and-missing-baseline-safe-failure");
}

// 6. The accepted incoming revision B becomes the baseline; no operation restores older revision A.
{
  const {project,source,c}=sourceFixture(),revisionA=fingerprint(project,source); source.layer(1).replaceSource(c); reorder(source); const revisionB=fingerprint(project,source),root=owned(project.addComp(`${prefix}ACCEPTED_B`,4),`${prefix}ACCEPTED_B`);
  run(validateToolInput("extend_slideshow_cloned_tree",extendArgs(root,[revisionB])),project); const result=audit(project,root,[revisionB]);
  assert.strictEqual(result.sourceFingerprints[0].unchanged,true); assert.notDeepStrictEqual(revisionA.layers,revisionB.layers); assert.deepStrictEqual(fingerprint(project,source).layers,revisionB.layers);
  cases.push("accepted-incoming-revision-is-baseline");
}

// 7. If state changes after plan/baseline preparation, execution rejects it before mutation.
{
  const {project,source,c}=sourceFixture(),planned=fingerprint(project,source),root=owned(project.addComp(`${prefix}STALE_PLAN`,4),`${prefix}STALE_PLAN`); source.layer(1).replaceSource(c);
  assert.throws(()=>run(validateToolInput("extend_slideshow_cloned_tree",extendArgs(root,[planned])),project),/protected_source_baseline_stale/); assert.strictEqual(root.duration,4);
  cases.push("stale-plan-rejected-before-write");
}

// The production builder must preserve complete baseline evidence in preflights and audits.
{
  const {project,source}=sourceFixture(),scene=fingerprint(project,source),final=project.addComp("Final Comp",10); final.addLayer(new AVLayer("CONTROL",null)); final.addLayer(new AVLayer("COLOR",null)); const finalFingerprint={...fingerprint(project,final),controlLayers:{CONTROL:{sourceLayerName:"CONTROL",effectCount:0},COLOR:{sourceLayerName:"COLOR",effectCount:0}}};
  const manifest={schema:"ae-agent-slideshow.v2",projectPath:file,duration:8,frameRate:30,width:1280,height:720,pixelAspect:1,prefix,masterName:`${prefix}MASTER`,finalComp:{name:"Final Comp"},introDuration:2,audioRouting:"master-only",events:[{id:"01",scene:1,start:0,duration:8,title:"Fixture",hero:"both",images:[],audioOnly:[],captions:[]}]};
  const articles={suhanov:["Text"],kurnikov:["Text"],both:["Text"]};
  const inventory={finalComp:finalFingerprint,scenes:[{...scene,scene:1,introEffectCount:0,mainEffectCount:0}]},plan=buildSlideshowPlan(manifest,articles,inventory),incomplete=JSON.parse(JSON.stringify(inventory)); delete incomplete.scenes[0].layers;
  assert.throws(()=>buildSlideshowPlan(manifest,articles,incomplete),/layers must be an array/);
  const steps=plan.stages.flatMap((stage)=>stage.steps),clone=steps.find((step)=>step.tool==="clone_slideshow_event_tree"),sceneAudit=steps.find((step)=>step.tool==="audit_slideshow_generated"&&step.args.expectedRootCompName===`${prefix}E01_ROOT`);
  assert.deepStrictEqual(clone.args.protectedSourceFingerprints[0].layers,scene.layers); assert.deepStrictEqual(sceneAudit.args.sourceFingerprints[0].layers,scene.layers); assert.strictEqual(sceneAudit.args.sourceFingerprints[0].itemId,scene.itemId);
  cases.push("builder-preserves-structural-evidence");
}

// The real semantic verifier must reject compact evidence that omits required structure proof.
{
  const protectedSourceFingerprints=[{itemId:1,name:"Scene 1",duration:4,numLayers:1,structureSchema:STRUCTURE_SCHEMA,layers:[]}],args={expectedRootCompName:`${prefix}VERIFY`,targetDuration:6,introDuration:2,protectedSourceFingerprints};
  const auditResult={ok:true,root:{name:args.expectedRootCompName,duration:6},issues:[],stats:{keyMetadataTotal:0},details:{keyMetadata:[],keyMetadataTruncated:false},sourceFingerprints:[{unchanged:true}]};
  const steps=[{index:1,tool:"audit_slideshow_generated",status:"completed",result:{...auditResult,root:{...auditResult.root,duration:4}}},{index:2,tool:"extend_slideshow_cloned_tree",args,mutatesProject:true,status:"completed",result:{ok:true}},{index:3,tool:"audit_slideshow_generated",status:"completed",result:auditResult}];
  const verification=buildSemanticVerification({summary:"scope safety",steps},{ok:true,dryRun:false,steps}); assert.strictEqual(verification.status,"needs_review");
  cases.push("semantic-verifier-requires-structural-proof");
}

process.stdout.write(`${JSON.stringify({ok:true,schema:STRUCTURE_SCHEMA,cases})}\n`);
