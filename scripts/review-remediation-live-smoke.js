#!/usr/bin/env node
"use strict";

// Live synthetic-only validation harness. It never embeds or commits the user's
// project path; session state stays under ignored .codex-runtime.
const fs = require("fs");
const http = require("http");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const STATE_DIR = path.join(ROOT, ".codex-runtime", "review-remediation-live");
const STATE_FILE = path.join(STATE_DIR, "session.json");
const FIXTURE_FILE = path.join(STATE_DIR, "CODX_REMEDIATION_LIVE.aep");
const RECOVERY_FILE = path.join(STATE_DIR, "original-in-memory-recovery.aep");
const CDP_PORT = Number(process.env.CEP_PANEL_CDP_PORT || 8870);
const EXTENSION_ID = "com.codex.aemcpbridge";
const BRIDGE_URL = "http://127.0.0.1:3456";
const BRIDGE_TOKEN = process.env.CEP_PANEL_BRIDGE_TOKEN || "codex-ae-local";
const PREFIX = "CODX_REMEDIATION_LIVE_";

function requestJson(method, target, payload) {
  return new Promise((resolve, reject) => {
    const url = new URL(target);
    const body = payload === undefined ? null : JSON.stringify(payload);
    const req = http.request({hostname:url.hostname,port:url.port,path:url.pathname+url.search,method,
      headers:{"content-type":"application/json",...(body?{"content-length":Buffer.byteLength(body)}:{})},timeout:15000}, res => {
      let text=""; res.setEncoding("utf8"); res.on("data",chunk=>text+=chunk);
      res.on("end",()=>{try{resolve(text?JSON.parse(text):{});}catch(error){reject(error);}});
    });
    req.on("error",reject); req.on("timeout",()=>req.destroy(new Error(`Timeout ${method} ${target}`)));
    req.end(body || undefined);
  });
}

async function connectPanel() {
  const pages=await requestJson("GET",`http://127.0.0.1:${CDP_PORT}/json/list`);
  const page=pages.find(item=>String(item.url||"").includes(EXTENSION_ID));
  if(!page||!page.webSocketDebuggerUrl)throw new Error("AE Agent CEP DevTools page unavailable.");
  const ws=new WebSocket(page.webSocketDebuggerUrl);let id=0;const pending=new Map();
  ws.onmessage=event=>{const message=JSON.parse(event.data);if(message.id&&pending.has(message.id)){pending.get(message.id)(message);pending.delete(message.id);}};
  await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
  const send=(method,params)=>new Promise(resolve=>{const callId=++id;pending.set(callId,resolve);ws.send(JSON.stringify({id:callId,method,params:params||{}}));});
  await send("Runtime.enable");
  return {ws,send};
}

async function evaluate(send, expression) {
  const response=await send("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});
  if(response.error||response.result&&response.result.exceptionDetails)throw new Error(JSON.stringify(response.error||response.result.exceptionDetails));
  return response.result&&response.result.result?response.result.result.value:null;
}

async function evalAe(source) {
  const {ws,send}=await connectPanel();
  try {
    const expression=`new Promise(function(resolve){new CSInterface().evalScript(${JSON.stringify(source)},function(value){resolve(value);});})`;
    const value=await evaluate(send,expression);
    if(typeof value!=="string")throw new Error("Unexpected evalScript result.");
    if(value.startsWith("EvalScript error."))throw new Error(value);
    return JSON.parse(value);
  } finally {ws.close();}
}

async function bridgeTool(name,args) {
  const response=await requestJson("POST",`${BRIDGE_URL}/tools/call?token=${encodeURIComponent(BRIDGE_TOKEN)}`,{name,arguments:args||{}});
  const result=response&&response.result;
  if(!response.ok||!result||result.isError){const text=result&&result.content&&result.content[0]&&result.content[0].text;throw new Error(text||response.error||`${name} failed`);}
  return JSON.parse(result.content[0].text);
}

function projectStateScript() {
  return `(function(){var p=app.project;return JSON.stringify({file:p&&p.file?String(p.file.fsName):null,dirty:p?!!p.dirty:null,numItems:p?p.numItems:0,activeItem:p&&p.activeItem?p.activeItem.name:null});})()`;
}

function writeSilentWav(file) {
  const rate=48000,seconds=2,samples=rate*seconds,dataBytes=samples*2,buffer=Buffer.alloc(44+dataBytes);
  buffer.write("RIFF",0);buffer.writeUInt32LE(36+dataBytes,4);buffer.write("WAVEfmt ",8);buffer.writeUInt32LE(16,16);
  buffer.writeUInt16LE(1,20);buffer.writeUInt16LE(1,22);buffer.writeUInt32LE(rate,24);buffer.writeUInt32LE(rate*2,28);
  buffer.writeUInt16LE(2,32);buffer.writeUInt16LE(16,34);buffer.write("data",36);buffer.writeUInt32LE(dataBytes,40);
  fs.writeFileSync(file,buffer);
}

function setupFixtureScript(fixtureFile,wavFile) {
  return `(function(){
    function owned(c,root,source){c.comment="AE_AGENT_SLIDESHOW:${PREFIX}:"+root+(source?"|SOURCE:"+encodeURIComponent(source):"");return c;}
    function itemIndex(target){for(var i=1;i<=app.project.numItems;i++)if(app.project.item(i)===target)return i;return null;}
    if(app.project&&app.project.dirty)throw new Error("project_must_be_clean_before_fixture_switch");
    app.newProject();var p=app.project;
    var master=owned(p.items.addComp("${PREFIX}MASTER",1280,720,1,10,30),"${PREFIX}MASTER",null);
    var source=p.items.addComp("Synthetic Source",640,360,1,4,30);
    var sourceSolid=source.layers.addSolid([.2,.4,.8],"Source Pixels",640,360,1,4);sourceSolid.audioEnabled=false;
    var finalComp=p.items.addComp("Final Comp",1280,720,1,10,30);
    var pairIntro=finalComp.layers.add(source);pairIntro.name="Synthetic Source";pairIntro.startTime=0;pairIntro.inPoint=0;pairIntro.outPoint=2;
    var pairMain=finalComp.layers.add(source);pairMain.name="Synthetic Source";pairMain.startTime=0;pairMain.inPoint=2;pairMain.outPoint=4;
    var child=owned(p.items.addComp("${PREFIX}CHILD",640,360,1,4,30),"${PREFIX}ROOT","Original Child");
    var root=owned(p.items.addComp("${PREFIX}ROOT",1280,720,1,4,30),"${PREFIX}ROOT","Original Root");
    var animated=root.layers.addSolid([1,.2,.1],"Animated",200,200,1,4);var pos=animated.property("ADBE Transform Group").property("ADBE Position");
    pos.setValueAtTime(1,[100,100]);pos.setValueAtTime(3.5,[500,300]);
    var expressionLayer=child.layers.addSolid([.3,.3,.3],"Expression",100,100,1,4);expressionLayer.property("ADBE Transform Group").property("ADBE Opacity").expression='comp("Final Comp").layer(1).transform.opacity + comp("Original Child").layer(1).transform.opacity';
    var childLayer=root.layers.add(child);childLayer.name="Owned Child";
    var external=p.items.addComp("Synthetic Shared External",320,180,1,4,30);external.layers.addSolid([.1,.1,.1],"External",320,180,1,4);var extLayer=root.layers.add(external);extLayer.name="Read Only External";
    var foreign=owned(p.items.addComp("${PREFIX}FOREIGN",320,180,1,4,30),"${PREFIX}FOREIGN","Foreign Original");foreign.layers.addSolid([.8,.8,.1],"Foreign",320,180,1,4);
    var foreignRoot=owned(p.items.addComp("${PREFIX}FOREIGN_ROOT",640,360,1,4,30),"${PREFIX}FOREIGN_ROOT","Foreign Root");foreignRoot.layers.add(foreign);
    var contaminated=owned(p.items.addComp("${PREFIX}CONTAMINATED",640,360,1,4,30),"${PREFIX}CONTAMINATED","Contaminated Root");contaminated.layers.add(foreign);
    var title=owned(p.items.addComp("${PREFIX}EV__Text 01",640,180,1,4,30),"${PREFIX}TEXT_ROOT","Text 01");var titleLayer=title.layers.addText("Old title");titleLayer.name="Title";
    var textRoot=owned(p.items.addComp("${PREFIX}TEXT_ROOT",1280,720,1,4,30),"${PREFIX}TEXT_ROOT","Text Root");textRoot.layers.add(title);var body=textRoot.layers.addText("Synthetic body paragraph repeated for live template validation. Synthetic body paragraph repeated for live template validation. Synthetic body paragraph repeated for live template validation.");body.name="Body";
    var audioFile=new File(${JSON.stringify(wavFile)});var audio=p.importFile(new ImportOptions(audioFile));
    var audioLeaf=owned(p.items.addComp("${PREFIX}AUDIO_LEAF",320,180,1,2,30),"${PREFIX}AUDIO_ROOT","Audio Leaf");audioLeaf.layers.add(audio);
    var audioRoot=owned(p.items.addComp("${PREFIX}AUDIO_ROOT",320,180,1,4,30),"${PREFIX}AUDIO_ROOT","Audio Root");var a1=audioRoot.layers.add(audioLeaf);a1.startTime=0;a1.inPoint=0;a1.outPoint=2;var a2=audioRoot.layers.add(audioLeaf);a2.startTime=2;a2.inPoint=2;a2.outPoint=4;
    p.save(new File(${JSON.stringify(fixtureFile)}));root.openInViewer();
    return JSON.stringify({fixtureFile:String(p.file.fsName),prefix:"${PREFIX}",items:{master:itemIndex(master),source:itemIndex(source),finalComp:itemIndex(finalComp),child:itemIndex(child),root:itemIndex(root),external:itemIndex(external),foreign:itemIndex(foreign),foreignRoot:itemIndex(foreignRoot),contaminated:itemIndex(contaminated),textRoot:itemIndex(textRoot),title:itemIndex(title),audioRoot:itemIndex(audioRoot),audioLeaf:itemIndex(audioLeaf)},ids:{master:master.id,source:source.id,root:root.id,child:child.id,foreign:foreign.id,contaminated:contaminated.id,audioRoot:audioRoot.id},layers:{animated:animated.id,expression:expressionLayer.id,child:childLayer.id,external:extLayer.id,audio1:a1.id,audio2:a2.id}});
  })()`;
}

async function inspect() { console.log(JSON.stringify(await evalAe(projectStateScript()),null,2)); }

async function setup() {
  fs.mkdirSync(STATE_DIR,{recursive:true});
  const current=await evalAe(projectStateScript());
  if(!current.file)throw new Error("Current project must be named before live fixture setup.");
  const checkpoint=await bridgeTool("checkpoint_project",{label:"before-remediation-live-fixture"});
  let restoreFile=current.file;
  if(current.dirty){
    const saved=await evalAe(`(function(){app.project.save(new File(${JSON.stringify(RECOVERY_FILE)}));return JSON.stringify({file:String(app.project.file.fsName),dirty:!!app.project.dirty});})()`);
    restoreFile=saved.file;
  }
  const wavFile=path.join(STATE_DIR,"synthetic-silence-48k.wav");writeSilentWav(wavFile);
  const session={schema:"ae-agent-remediation-live-session.v1",createdAt:new Date().toISOString(),originalFile:current.file,originalDirty:current.dirty,restoreFile,checkpoint,fixtureFile:FIXTURE_FILE,wavFile};
  fs.writeFileSync(STATE_FILE,JSON.stringify(session,null,2));
  const fixture=await evalAe(setupFixtureScript(FIXTURE_FILE,wavFile));
  session.fixture=fixture;fs.writeFileSync(STATE_FILE,JSON.stringify(session,null,2));
  console.log(JSON.stringify({ok:true,originalDirty:current.dirty,recoveryCreated:restoreFile!==current.file,fixture},null,2));
}

async function restore() {
  const session=JSON.parse(fs.readFileSync(STATE_FILE,"utf8"));
  const result=await evalAe(`(function(){var f=new File(${JSON.stringify(session.restoreFile)});if(!f.exists)throw new Error("restore_file_missing");var current=app.project&&app.project.file?String(app.project.file.fsName):null;if(current!==${JSON.stringify(FIXTURE_FILE)})throw new Error("restore_refuses_unexpected_current_project");app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);app.open(f);return JSON.stringify({file:String(app.project.file.fsName),dirty:!!app.project.dirty,numItems:app.project.numItems});})()`);
  session.restoredAt=new Date().toISOString();session.restored=result;fs.writeFileSync(STATE_FILE,JSON.stringify(session,null,2));
  console.log(JSON.stringify({ok:true,restored:result,recoveryWasUsed:session.restoreFile!==session.originalFile},null,2));
}

async function patchFixture() {
  const result=await evalAe(`(function(){var found=null,master=null,finalComp=null;for(var i=1;i<=app.project.numItems;i++){var item=app.project.item(i);if(item instanceof CompItem&&item.name==="Original Child")found=item;if(item instanceof CompItem&&item.name==="${PREFIX}MASTER")master=item;if(item instanceof CompItem&&item.name==="Final Comp")finalComp=item;}if(!found)found=app.project.items.addComp("Original Child",640,360,1,4,30);if(found.numLayers===0)found.layers.addSolid([.2,.2,.2],"Original",100,100,1,4);if(!master)throw new Error("fixture_master_missing");if(master.numLayers===0)master.layers.addSolid([.1,.1,.1],"Master Anchor",100,100,1,10);if(!finalComp||finalComp.numLayers!==2)throw new Error("fixture_final_pair_missing");var early=finalComp.layer(1).inPoint<=finalComp.layer(2).inPoint?finalComp.layer(1):finalComp.layer(2),late=early===finalComp.layer(1)?finalComp.layer(2):finalComp.layer(1);early.startTime=0;early.inPoint=0;early.outPoint=1.5;late.startTime=0;late.inPoint=1.5;late.outPoint=4;return JSON.stringify({originalChild:{name:found.name,itemId:found.id,numLayers:found.numLayers},master:{name:master.name,itemId:master.id,numLayers:master.numLayers},finalPair:[{layerId:early.id,inPoint:early.inPoint,outPoint:early.outPoint},{layerId:late.id,inPoint:late.inPoint,outPoint:late.outPoint}],dirty:!!app.project.dirty});})()`);
  console.log(JSON.stringify({ok:true,result}));
}

async function reopenFixture() {
  const result=await evalAe(`(function(){var f=new File(${JSON.stringify(FIXTURE_FILE)});if(!f.exists)throw new Error("fixture_missing");var current=app.project&&app.project.file?String(app.project.file.fsName):null;if(current!==${JSON.stringify(FIXTURE_FILE)})throw new Error("reopen_refuses_unexpected_current_project");app.project.close(CloseOptions.DO_NOT_SAVE_CHANGES);app.open(f);return JSON.stringify({file:String(app.project.file.fsName),dirty:!!app.project.dirty,numItems:app.project.numItems});})()`);
  console.log(JSON.stringify({ok:true,result}));
}

async function mutateProtectedSource() {
  const result=await evalAe(`(function(){var source=null;for(var i=1;i<=app.project.numItems;i++){var item=app.project.item(i);if(item instanceof CompItem&&item.name==="Synthetic Source")source=item;}if(!source||source.numLayers!==1)throw new Error("fixture_source_missing_or_ambiguous");var layer=source.layer(1);layer.enabled=false;return JSON.stringify({itemIndex:(function(){for(var j=1;j<=app.project.numItems;j++)if(app.project.item(j)===source)return j;return null;})(),itemId:source.id,name:source.name,duration:source.duration,numLayers:source.numLayers,layer:{layerId:layer.id,name:layer.name,enabled:layer.enabled,inPoint:layer.inPoint,outPoint:layer.outPoint},dirty:!!app.project.dirty});})()`);
  console.log(JSON.stringify({ok:true,result},null,2));
}

async function addAudioDuplicateFixture() {
  const result=await evalAe(`(function(){var audio=null,leaf=null,root=null;for(var i=1;i<=app.project.numItems;i++){var item=app.project.item(i);if(item instanceof FootageItem&&item.name==="synthetic-silence-48k.wav")audio=item;if(item instanceof CompItem&&item.name==="${PREFIX}AUDIO_DUP_LEAF")leaf=item;if(item instanceof CompItem&&item.name==="${PREFIX}AUDIO_DUP_ROOT")root=item;}if(!audio)throw new Error("fixture_audio_footage_missing");if(!leaf){leaf=app.project.items.addComp("${PREFIX}AUDIO_DUP_LEAF",320,180,1,2,30);leaf.comment="AE_AGENT_SLIDESHOW:${PREFIX}:${PREFIX}AUDIO_DUP_ROOT|SOURCE:Audio%20Duplicate%20Leaf";leaf.layers.add(audio);}if(!root){root=app.project.items.addComp("${PREFIX}AUDIO_DUP_ROOT",320,180,1,2,30);root.comment="AE_AGENT_SLIDESHOW:${PREFIX}:${PREFIX}AUDIO_DUP_ROOT|SOURCE:Audio%20Duplicate";var first=root.layers.add(leaf);first.startTime=0;first.inPoint=0;first.outPoint=2;var second=root.layers.add(leaf);second.startTime=0;second.inPoint=0;second.outPoint=2;}var index=null;for(var j=1;j<=app.project.numItems;j++)if(app.project.item(j)===root)index=j;return JSON.stringify({itemIndex:index,itemId:root.id,name:root.name,duration:root.duration,numLayers:root.numLayers,leafItemId:leaf.id,layers:[{layerId:root.layer(1).id,audioEnabled:root.layer(1).audioEnabled,inPoint:root.layer(1).inPoint,outPoint:root.layer(1).outPoint},{layerId:root.layer(2).id,audioEnabled:root.layer(2).audioEnabled,inPoint:root.layer(2).inPoint,outPoint:root.layer(2).outPoint}],dirty:!!app.project.dirty});})()`);
  console.log(JSON.stringify({ok:true,result},null,2));
}

async function preparePositiveAudioPair() {
  const result=await evalAe(`(function(){var finalComp=null,audioRoot=null;for(var i=1;i<=app.project.numItems;i++){var item=app.project.item(i);if(item instanceof CompItem&&item.name==="Final Comp")finalComp=item;if(item instanceof CompItem&&item.name==="${PREFIX}AUDIO_ROOT")audioRoot=item;}if(!finalComp||finalComp.numLayers!==2||!audioRoot)throw new Error("fixture_positive_audio_pair_missing");var early=finalComp.layer(1).inPoint<=finalComp.layer(2).inPoint?finalComp.layer(1):finalComp.layer(2),late=early===finalComp.layer(1)?finalComp.layer(2):finalComp.layer(1);early.replaceSource(audioRoot,false);late.replaceSource(audioRoot,false);early.name=audioRoot.name;late.name=audioRoot.name;early.startTime=0;early.inPoint=0;early.outPoint=1.5;late.startTime=0;late.inPoint=1.5;late.outPoint=4;return JSON.stringify({finalCompItemId:finalComp.id,sourceItemId:audioRoot.id,sourceName:audioRoot.name,layers:[{layerId:early.id,inPoint:early.inPoint,outPoint:early.outPoint,hasAudio:early.hasAudio,audioEnabled:early.audioEnabled},{layerId:late.id,inPoint:late.inPoint,outPoint:late.outPoint,hasAudio:late.hasAudio,audioEnabled:late.audioEnabled}],dirty:!!app.project.dirty});})()`);
  console.log(JSON.stringify({ok:true,result},null,2));
}

async function addUnsupportedTitleSlot() {
  const result=await evalAe(`(function(){var title=null;for(var i=1;i<=app.project.numItems;i++){var item=app.project.item(i);if(item instanceof CompItem&&item.name==="${PREFIX}EV__Text 01")title=item;}if(!title)throw new Error("fixture_title_comp_missing");var duplicate=title.layers.addText("Unsupported second title slot");duplicate.name="Second Title";return JSON.stringify({compItemId:title.id,numLayers:title.numLayers,duplicateLayerId:duplicate.id,dirty:!!app.project.dirty});})()`);
  console.log(JSON.stringify({ok:true,result},null,2));
}

async function setAutonomy(enabled) {
  const {ws,send}=await connectPanel();
  try {
    const current=await requestJson("GET",`${BRIDGE_URL}/autonomy/session?token=${encodeURIComponent(BRIDGE_TOKEN)}`);
    const active=Boolean(current&&current.session&&current.session.active);
    if(active!==enabled)await evaluate(send,`document.getElementById("autonomousSessionButton").click();true`);
    const deadline=Date.now()+10000;let state=null;
    do{await new Promise(resolve=>setTimeout(resolve,250));state=await requestJson("GET",`${BRIDGE_URL}/autonomy/session?token=${encodeURIComponent(BRIDGE_TOKEN)}`);}while(Boolean(state&&state.session&&state.session.active)!==enabled&&Date.now()<deadline);
    if(Boolean(state&&state.session&&state.session.active)!==enabled)throw new Error("Autonomous session state did not change.");
    console.log(JSON.stringify({ok:true,active:enabled,expiresAt:state.session.expiresAt||null}));
  } finally {ws.close();}
}

async function adoptPlan(actionId, revision) {
  if(!actionId||!Number.isInteger(Number(revision)))throw new Error("adopt-plan requires actionId and integer revision");
  const status=await bridgeTool("get_bridge_status",{}),panel=status.lastPanelInfo||{};
  if(!status.panelConnected||!panel.panelConnectionId||!panel.panelGeneration)throw new Error("connected panel identity unavailable");
  const {ws,send}=await connectPanel();let chatSession;
  try{chatSession=await evaluate(send,`(function(){var select=document.getElementById("chatHistorySelect");return select&&select.value?select.value:"";})()`);}finally{ws.close();}
  if(!chatSession)throw new Error("active panel chat session unavailable");
  const confirmationSessionId=panel.panelConnectionId+":"+chatSession;
  const response=await requestJson("POST",`${BRIDGE_URL}/agents/plan/adopt?token=${encodeURIComponent(BRIDGE_TOKEN)}`,{actionId,revision:Number(revision),panelConnectionId:panel.panelConnectionId,panelGeneration:String(panel.panelGeneration),confirmationSessionId});
  if(!response.ok||!response.proposal)throw new Error(response.message||response.error||response.errorCode||"plan adoption failed");
  console.log(JSON.stringify({ok:true,proposal:response.proposal,confirmationSessionId,revision:response.revision},null,2));
}

async function runConfirmedPlan() {
  const requestFile=path.join(STATE_DIR,"confirmed-plan-run.json");
  const body=JSON.parse(fs.readFileSync(requestFile,"utf8"));
  const response=await requestJson("POST",`${BRIDGE_URL}/agents/plan/run?token=${encodeURIComponent(BRIDGE_TOKEN)}`,body);
  console.log(JSON.stringify(response,null,2));
  if(!response.ok||!response.run||response.run.ok!==true)process.exitCode=1;
}

async function main(){const command=process.argv[2]||"inspect";if(command==="inspect")return inspect();if(command==="setup")return setup();if(command==="patch-fixture")return patchFixture();if(command==="reopen-fixture")return reopenFixture();if(command==="mutate-source")return mutateProtectedSource();if(command==="add-audio-duplicate")return addAudioDuplicateFixture();if(command==="prepare-positive-audio-pair")return preparePositiveAudioPair();if(command==="add-unsupported-title-slot")return addUnsupportedTitleSlot();if(command==="adopt-plan")return adoptPlan(process.argv[3],Number(process.argv[4]));if(command==="run-confirmed-plan")return runConfirmedPlan();if(command==="restore")return restore();if(command==="enable-autonomy")return setAutonomy(true);if(command==="disable-autonomy")return setAutonomy(false);throw new Error(`Unknown command ${command}`);}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});
