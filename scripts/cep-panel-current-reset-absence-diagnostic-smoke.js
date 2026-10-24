"use strict";
// Compile/projection and injected transport only. No OpenProcess or live tool.
const assert=require("node:assert/strict"),path=require("node:path"),crypto=require("node:crypto"),{spawnSync}=require("node:child_process"),cli=require("./cep-panel-current-reset-absence-diagnostic"),win=require("../mcp-server/owned-runtime-win32");
async function main(){
 let effects=0;await assert.rejects(cli.run(["node","cli","--pid","1"],{readInput(){effects++;}}),/closed_cli/);assert.equal(effects,0);
 const helper=path.join(__dirname,"cep-panel-current-reset-absence-diagnostic.ps1");
 for(const mode of ["-CompileOnly","-ProjectionOnly"]){const r=spawnSync(win.POLICY.executable,["-NoLogo","-NoProfile","-NonInteractive","-File",helper,mode],{windowsHide:true,encoding:"utf8",timeout:15000,maxBuffer:65536});assert.equal(r.error,undefined);assert.equal(r.status,0,r.stderr);const v=JSON.parse(r.stdout.replace(/^\uFEFF/,""));assert.equal(v.readOnly,true);assert.equal(v.adoptionAllowed,false);assert.equal(v.nativeQueries,0);if(mode==="-ProjectionOnly")for(const row of v.projections){assert(row.exceptions.some(e=>e.type==="System.ComponentModel.Win32Exception"&&e.nativeErrorCode===row.expectedCode));assert(row.exceptions.every(e=>!Object.hasOwn(e,"message")));}}
 const request={schema:cli.SCHEMA,operationId:"offline",generation:"offline",expected:[{pid:1},{pid:2}]},bytes=Buffer.from(JSON.stringify(request)),inputSha256=crypto.createHash("sha256").update(bytes).digest("hex"),bound={a:{key:"offline-secret"},request,bytes,inputSha256,failedGraph:[]};
 const value={...request,status:"diagnostic_observed",readOnly:true,adoptionAllowed:false,inputSha256,firstFailureIndex:0,rows:request.expected.map(expected=>({expected,state:"open_failed",observation:{openSucceeded:false,openWin32Error:5},exceptions:[]}))};
 const good=await cli.run(["node","cli"],{readInput:()=>bound,probe:async()=>({raw:JSON.stringify(value),exitCode:0,budget:false}),persist:false});assert.equal(good.ok,true);assert.equal(good.firstFailure.openWin32Error,5);assert.equal(good.adoptionAllowed,false);assert.equal(JSON.stringify(good).includes("offline-secret"),false);
 const wrong=await cli.run(["node","cli"],{readInput:()=>bound,probe:async()=>({raw:JSON.stringify({...value,inputSha256:"wrong"}),exitCode:1,budget:false}),persist:false});assert.equal(wrong.ok,false);assert(wrong.record.rawStdout.includes("wrong"));assert.equal(wrong.adoptionAllowed,false);
 const over=await cli.run(["node","cli"],{readInput:()=>bound,probe:async()=>({raw:"bounded-prefix",exitCode:1,budget:true}),persist:false});assert.equal(over.validation,"diagnostic_response_budget");assert.equal(over.record.rawStdout,"bounded-prefix");
 process.stdout.write(JSON.stringify({ok:true,checks:6,nativeQueries:0,controlEffects:0,liveAe:false})+"\n");
}
if(require.main===module)main().catch(error=>{process.stderr.write(error.stack+"\n");process.exitCode=1;});module.exports={main};
