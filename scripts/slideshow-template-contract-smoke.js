"use strict";
const assert=require("assert"),{buildSlideshowPlan}=require("../mcp-server/slideshow-plan-builder"),{validateToolInput}=require("../mcp-server/slideshow-tools");
const fixture=require("./slideshow-synthetic-fixture");
const contract={id:"ae-agent-newspaper-template.v1",extensionPolicy:"translate-outro-tile-1x",expressionPolicy:"literal-comp-calls"};
const manifest={...fixture.manifest,templateContract:contract};
assert.strictEqual(buildSlideshowPlan(manifest,fixture.articles,fixture.inventory).manifest.templateContract.id,contract.id);
for(const templateContract of [undefined,{...contract,id:"other-template"},{...contract,extensionPolicy:"freeze-tail-without-key-moves"},{...contract,expressionPolicy:"dynamic-references"}]){
 const invalid={...manifest,templateContract};if(templateContract===undefined)delete invalid.templateContract;
 assert.throws(()=>buildSlideshowPlan(invalid,fixture.articles,fixture.inventory),/templateContract|template contract/);
}
assert.throws(()=>buildSlideshowPlan({...manifest,finalComp:{name:"Different Final"}},fixture.articles,fixture.inventory),/Final Comp/);
const {Project,AVLayer,LeafProperty,owned,runPrepared}=require("./slideshow-vm-fixture");
const file="C:\\synthetic\\template-contract.aep",prefix="CODX_TEMPLATE_";
let writes=0;
function textLayer(name,text){
 const layer=new AVLayer(name),original=layer.property.bind(layer),property={value:{text,fontSize:30},numKeys:0,expressionEnabled:false,setValue(value){writes++;this.value=value;}};
 const anchor=new LeafProperty("Anchor",[],{value:[0,0]});
 layer.sourceRectAtTime=()=>({left:0,top:0,width:100,height:30});
 layer.property=(key)=>key==="ADBE Text Properties"?{property:()=>property}:key==="ADBE Transform Group"?{property:key=>key==="ADBE Anchor Point"?anchor:original("ADBE Transform Group").property(key)}:original(key);
 return layer;
}
function setup(withTitle){const project=new Project(file),root=owned(project.addComp(`${prefix}ROOT`,1280,720,1,4,30),prefix,`${prefix}ROOT`);root.addLayer(textLayer("Body","Synthetic text ".repeat(30)));
 if(withTitle){const title=owned(project.addComp(`${prefix}Text 01`,320,180,1,4,30),prefix,root.name);title.name=`${prefix}EV__Text 01`;title.addLayer(textLayer("Title","Old title"));root.addLayer(new AVLayer("Title comp",title));}
 return{project,root};}
const args={expectedProjectFile:file,generatedPrefix:prefix,expectedRootCompName:`${prefix}ROOT`,sceneNumber:1,titleCompName:"Text 01",hero:"both",title:"Synthetic title",titleWrap:24,articleChunks:["Synthetic article text ".repeat(30)]};
const unsupported=setup(false);assert.throws(()=>runPrepared(validateToolInput("apply_slideshow_event_text",args),unsupported.project),/title_comp|template_title/);assert.strictEqual(writes,0,"Unsupported template must fail before body text writes");
const supported=setup(true),result=runPrepared(validateToolInput("apply_slideshow_event_text",args),supported.project);assert(result.ok);assert(writes>0);
console.log(JSON.stringify({ok:true,specializedPreset:true,unsupportedVariantsRejected:true,failBeforeWrite:true,liveAeCalled:false}));
