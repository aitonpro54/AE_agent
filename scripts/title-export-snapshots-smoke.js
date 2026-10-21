"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm"),crypto=require("node:crypto");
const exportsTool=require("../mcp-server/title-export-snapshots"),variants=require("../mcp-server/native-render-variant"),m100=require("../mcp-server/m100-protocol"),semantic=require("../mcp-server/semantic-verification");
const root=path.resolve(__dirname,"../.codex-runtime/title-export-snapshots-smoke",crypto.randomUUID());fs.mkdirSync(root,{recursive:true});
let checks=0;
function nativePrimitiveIdentityRegression(){
  const source=exportsTool.nativeSnapshotDifference.toString();
  assert.doesNotMatch(source,/\ba\s*===?\s*b\b/,"Native primitive identity must not depend on direct equality");
  const compare=vm.runInNewContext("("+source+")");
  const file=String.raw`C:\Проекты 21\Папка (Титры)\titr_all.aep`;
  const text='Титр "01"\\literal\\n\r\n\t\0\b\f\u2028\u2029\ud800\udc00\ud800';
  const baseline={projectFile:file,controlled:[{name:"TITR_01",enabled:true,text},{name:"TITR_02",enabled:false,text:""}],revision:7,frameDuration:1/30,queue:[],empty:null};
  assert.equal(compare(baseline,JSON.parse(JSON.stringify(baseline))),null);checks++;
  for(const [value,field] of [[file,"projectFile"],[text,"text"]]){
    for(let i=0;i<value.length;i++){
      const changed=value.slice(0,i)+String.fromCharCode(value.charCodeAt(i)^1)+value.slice(i+1);
      const difference=compare({[field]:value},{[field]:changed});
      assert.equal(difference.path,"snapshot."+field);assert.equal(difference.firstDifference,i);
    }
    for(const changed of [value+"x",value.slice(1),value.toLowerCase(),value.replace(/\\/g,"/")]){
      if(changed!==value)assert.notEqual(compare({[field]:value},{[field]:changed}),null);
    }
  }
  for(const value of [new String(file),null,7])assert.notEqual(compare({projectFile:file},{projectFile:value}),null);
  checks++;
  const scalars=[null,true,false,0,1,1.25,"","true","false","0","1","null"];
  for(let i=0;i<scalars.length;i++)for(let j=0;j<scalars.length;j++){
    const difference=compare({value:scalars[i]},{value:scalars[j]});
    if(i===j)assert.equal(difference,null);else assert.equal(difference.path,"snapshot.value");
  }
  assert.equal(compare(-0,0),null);
  for(const invalid of [undefined,NaN,Infinity,-Infinity,()=>{},new Boolean(true),new Number(7),new Date(0)])assert.notEqual(compare(invalid,invalid),null);
  checks++;
  for(const [actual,expected] of [[[],{}],[[1],{0:1}],[[true],[false]],[[null],[]],[{a:1},{a:1,b:2}],[{a:1},{b:1}],[{a:null},{a:{}}],[[undefined],[undefined]]])assert.notEqual(compare(actual,expected),null);
  for(const value of [[],{},[true,false,null,0,""],{a:[{b:false}],c:{},d:[]}])assert.equal(compare(value,JSON.parse(JSON.stringify(value))),null);
  checks++;
}
function fixture(mode="ok"){
  const dir=path.join(root,mode);fs.mkdirSync(dir);const source=path.join(dir,"source.aep"),checkpoint=path.join(dir,"checkpoint.aep");fs.writeFileSync(source,"original saved AEP");fs.copyFileSync(source,checkpoint);
  class TextLayer{constructor(id,name,enabled){Object.assign(this,{id,name,enabled,locked:false});}}
  const layers=[new TextLayer(11,"TITR_01",true),new TextLayer(12,"TITR_02",false)],comp={id:1,numLayers:2,layer:i=>layers[i-1],dynamicLinkGUID:"00000001-0000-0000-0000-000000000000"};
  function File(file){this.fsName=file;}
  Object.defineProperties(File.prototype,{exists:{get(){return fs.existsSync(this.fsName);}},alias:{get(){return false;}},length:{get(){return fs.statSync(this.fsName).size;}},modified:{get(){return new Date(Math.floor(fs.statSync(this.fsName).mtimeMs/1000)*1000+(mode==="native-time-drift"?1000:0));}}});
  const counts={saves:0,opens:0,undo:0},project={file:new File(source),dirty:false,revision:7,numItems:1,item:()=>comp};
  let now=Date.now();const DateMock=class extends Date{constructor(...a){super(...(a.length?a:[now]));}};
  const app={project,beginUndoGroup(){counts.undo++;},endUndoGroup(){},open(file){counts.opens++;project.file=file;project.dirty=false;project.revision++;layers[0].enabled=true;layers[1].enabled=false;if(mode==="late-open")now+=130000;}};
  project.save=file=>{counts.saves++;if(mode==="save2-fails" && counts.saves===2){project.dirty=true;throw Error("save_failure");}fs.writeFileSync(file.fsName,"native saved "+layers.map(l=>l.enabled));project.file=file;project.dirty=false;project.revision++;
    if(mode==="source-drift" && counts.saves===1)fs.appendFileSync(source,"changed");if(mode==="deadline" && counts.saves===1)now+=130000;if(mode==="guid" && counts.saves===1)comp.dynamicLinkGUID="";
    if(mode==="saved-dirty-type")project.dirty="false";if(mode==="saved-enabled-drift")layers[counts.saves-1].enabled=false;if(mode==="saved-enabled-type")layers[counts.saves-1].enabled=1;};
  let snapshotReads=0;const snapshot=()=>({projectFile:project.file.fsName,revision:project.revision,frameDuration:mode==="native-number-drift"&&++snapshotReads>2?1/24:1/30,controlled:layers.map(l=>({id:l.id,index:l.id-10,name:l.name,enabled:l.enabled,text:l.name})),graph:[{id:1,layers:layers.map(l=>({id:l.id,enabled:l.enabled,name:l.name}))}],queue:[]});
  const wire=s=>mode==="numeric-wire"?JSON.parse(JSON.stringify(s,(k,v)=>typeof v==="number"?Number(v.toPrecision(13)):v)):s;
  const nativeString=v=>typeof v==="number"&&mode==="numeric-wire"?String(Number(v.toPrecision(13))):String(v);
  const baseline=wire(snapshot()),args={expectedProjectFile:source,expectedSourceSha25664:exportsTool.fileRecord(source).sha25664,expectedRevision:7,expectedStateHash:variants.digest(baseline),compItemId:1,variants:layers.map((l,i)=>({layerId:l.id,name:l.name,snapshotFileName:`titr_0${i+1}_ame_product_20261015.aep`}))};
  const evidence=[];let authorized=true;
  const executor=exportsTool.createExecutor({assertRunner:()=>assert(authorized,"runner revoked"),persist:v=>evidence.push(JSON.parse(JSON.stringify(v))),readNative:async script=>{
    if(script.includes("var baseline=")){const start=script.indexOf("var baseline=")+"var baseline=".length,baseline=JSON.parse(script.slice(start,script.indexOf(";return",start)));const difference=vm.runInNewContext(`(${exportsTool.nativeSnapshotDifference.toString()})(actual,baseline)`,{actual:snapshot(),baseline,String:nativeString});return {result:{difference,dirty:project.dirty}};}
    return {result:{snapshot:wire(snapshot()),dirty:project.dirty}};
  },writeNative:async script=>{
    const start=script.lastIndexOf("return nativeExport(")+"return nativeExport(".length,params=JSON.parse("["+script.slice(start,-2)+"]");
    const nativeSnapshotDifference=vm.runInNewContext(`(${exportsTool.nativeSnapshotDifference.toString()})`,{String:nativeString});
    const result=vm.runInNewContext(`(${exportsTool.nativeExport.toString()})(...params)`,{params,nativeSnapshot:snapshot,nativeSnapshotDifference,app,File,TextLayer,Date:DateMock,String:nativeString});return {result:JSON.parse(JSON.stringify(result))};
  }});
  const payload={plan:{steps:[{tool:exportsTool.TOOL,args}]}},record={payload,payloadHash:m100.sha256Payload(payload),project:{expectedFile:source},proposalExpiresAt:new Date(Date.now()+300000).toISOString(),dryRunCompletedAt:new Date().toISOString()};
  record.dryRunReceipt={payloadHash:record.payloadHash,contractVersion:"v1",stepCount:1,projectFile:source};
  const context={record,args,runId:"run",contractVersion:"v1",stepCount:1,checkpoint:{sourceFile:source,checkpointFile:checkpoint}};
  const cap=executor.authorize(context);
  return {executor,args,cap,evidence,counts,context,project,checkpoint,source,run:()=>executor.execute(args,cap),revoke:()=>{authorized=false;}};
}
(async()=>{
  nativePrimitiveIdentityRegression();
  const good=fixture();const result=await good.run();assert.equal(result.ok,true);assert.equal(exportsTool.verifyResult(result,good.args).ok,true);assert.deepEqual(good.counts,{saves:2,opens:1,undo:1});assert.equal(fs.readFileSync(good.source,"utf8"),"original saved AEP");assert.equal(good.evidence.at(-1).phase,"verified");checks++;
  const selector={sourcePath:result.snapshots[0].path,sourceSha25664:result.snapshots[0].sha25664,sourceGuid:result.snapshots[0].native.guid};
  assert.equal(good.executor.assertSavedSource(selector),true);checks++;
  assert.throws(()=>good.executor.assertSavedSource({...selector,sourceGuid:"forged"}),/binding_required/);checks++;
  assert.throws(()=>good.executor.assertSavedSource({...selector,sourceSha25664:"0".repeat(64)}),/binding_required/);checks++;
  await assert.rejects(good.run(),/runner_required/);checks++;
  const late=fixture("late-open");assert.equal((await late.run()).ok,true);assert.deepEqual(late.counts,{saves:2,opens:1,undo:1});checks++;
  const nativeTime=fixture("native-time-drift"),nativeTimeResult=await nativeTime.run();assert.equal(nativeTimeResult.ok,false);assert.equal(nativeTimeResult.code,"title_export_native_file_changed");assert.equal(nativeTimeResult.evidence.phase,"preflight");assert.equal(nativeTime.counts.saves,0);checks++;
  const numeric=fixture("numeric-wire");assert.equal((await numeric.run()).ok,true);assert.equal(numeric.counts.saves,2);checks++;
  const numberDrift=fixture("native-number-drift");await assert.rejects(numberDrift.run(),/title_export_native_baseline_changed.*snapshot.frameDuration/);assert.equal(numberDrift.counts.saves,0);assert.equal(numberDrift.evidence.length,0);checks++;
  const fresh=good.executor.preflight(good.args);await assert.rejects(fresh,/target_exists_no_replay/);checks++;
  for(const mode of ["save2-fails","source-drift","deadline","guid"]){const f=fixture(mode),r=await f.run();assert.equal(r.ok,false);assert.equal(f.counts.opens,0);assert.equal(f.counts.saves,mode==="save2-fails"?2:1);assert.equal(fs.existsSync(path.join(path.dirname(f.source),f.args.variants[0].snapshotFileName)),true);await assert.rejects(f.run(),/runner_required/);checks++;}
  for(const [mode,code] of [["saved-dirty-type","title_export_save_readback_failed"],["saved-enabled-drift","title_export_variant_flags"],["saved-enabled-type","title_export_variant_flags"]]){const f=fixture(mode),r=await f.run();assert.equal(r.ok,false);assert.equal(r.code,code);assert.deepEqual(f.counts,{saves:1,opens:0,undo:0});assert.equal(r.automaticRetryAllowed,false);checks++;}
  const dirty=fixture("dirty");dirty.project.dirty=true;await assert.rejects(dirty.run(),/source_baseline_changed/);assert.equal(dirty.counts.saves,0);checks++;
  const stale=fixture("revision");stale.project.revision++;await assert.rejects(stale.run(),/source_baseline_changed/);checks++;
  const cp=fixture("checkpoint");fs.appendFileSync(cp.checkpoint,"foreign");await assert.rejects(cp.run(),/checkpoint_changed/);assert.equal(cp.counts.saves,0);checks++;
  const revoked=fixture("revoked");revoked.revoke();await assert.rejects(revoked.run(),/runner revoked/);checks++;
  const target=fixture("foreign");fs.writeFileSync(path.join(path.dirname(target.source),target.args.variants[1].snapshotFileName),"foreign");await assert.rejects(target.run(),/target_exists_no_replay/);assert.equal(target.counts.saves,0);checks++;
  for(const patch of [{variants:[{...good.args.variants[0],snapshotFileName:"../foreign.aep"},good.args.variants[1]]},{script:"app.project.save()"}]){assert.throws(()=>exportsTool.validateInput({...good.args,...patch}),/invalid_input|exact_pair_required/);checks++;}
  const bad=JSON.parse(JSON.stringify(result));bad.snapshots[1].native.flags[0].enabled=true;assert.throws(()=>exportsTool.verifyResult(bad,good.args),/result_unverified/);checks++;
  const run={id:"run",ok:true,provenance:{actionId:"act"},steps:[{index:1,tool:exportsTool.TOOL,args:good.args,status:"completed",mutatesProject:true,result:{...result,authorization:{runId:"run",proposalId:"act"},verification:exportsTool.verifyResult(result,good.args)}}]};
  run.steps[0].independentReadBack=[{index:2,tool:"get_project_info",args:{},status:"completed",result:{file:good.source,dirty:false},source:"server_typed_readback",observedAt:new Date().toISOString()}];
  const verification=semantic.buildSemanticVerification({steps:[{tool:exportsTool.TOOL,args:good.args}]},run);assert.equal(verification.status,"passed",JSON.stringify(verification));checks++;
  console.log(JSON.stringify({ok:true,checks,evidence:"actual executor/file reservations/native fixed program; mocked AE saves, no live effects",root}));
})().catch(e=>{console.error(e);process.exitCode=1;});
