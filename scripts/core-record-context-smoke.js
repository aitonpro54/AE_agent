"use strict";
// Existing record store on an isolated owned directory; no product runtime.
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto"),assert=require("node:assert/strict"),records=require("../mcp-server/plan-run-records");
const parent=path.resolve(__dirname,"../.codex-runtime/record-context-smoke"),root=path.join(parent,crypto.randomUUID()),id=crypto.randomUUID();let checks=0;
fs.mkdirSync(root,{recursive:true});
const base={schema:"ae-agent-plan-run-record.v1",runId:id,project:{file:"C:/work/titles.aep"},plan:{steps:[{tool:"set_property_value",args:{}}]},run:{id,outcome:{mutation:{status:"unknown"}}}};
try{
 records.writeRecord(root,base);const legacy=records.readRecord(root,id,{throwOnError:true});assert.deepEqual(legacy,base);assert.deepEqual(records.contextClassification(legacy),{purpose:"unclassified",lifetime:"unclassified"});checks++;
 for(const purpose of ["user_work","development","technical_check"]){const record={...base,recordContext:records.recordContext({purpose,contextId:"explicit-context",resources:[{kind:"project",identity:base.project.file}]},{runId:id,projectFile:base.project.file})};records.writeRecord(root,record);const read=records.readRecord(root,id,{throwOnError:true});assert.equal(read.recordContext.purpose,purpose);assert.equal(read.recordContext.project.file,base.project.file);assert.equal(read.run.outcome.mutation.status,"unknown");assert.deepEqual(read.plan,base.plan);checks++;}
 assert.equal(records.recordContext(undefined,{runId:id,projectFile:base.project.file}).purpose,"user_work");checks++;
 assert.throws(()=>records.recordContext({purpose:"user_work",contextId:"x",resources:[],allowMutations:true},{runId:id}));assert.throws(()=>records.recordContext({purpose:"unclassified",contextId:"x",resources:[]},{runId:id}));checks++;
 // No gate/consumer reads the metadata. The persistence seam only adds evidence.
 const bridge=fs.readFileSync(path.join(__dirname,"../mcp-server/bridge-daemon.js"),"utf8");assert.equal((bridge.match(/options\.recordContext/g)||[]).length,1);assert(!/if\s*\([^\n]*recordContext/.test(bridge));checks++;
 console.log(JSON.stringify({ok:true,checks,legacyUnclassified:true,newOrdinaryDefault:"user_work",purposeAuthority:false,unknownUnchanged:true,liveProof:false}));
}finally{if(!root.startsWith(parent+path.sep))throw Error("cleanup_containment");fs.rmSync(root,{recursive:true,force:true});}
