#!/usr/bin/env node
"use strict";

const fs=require("fs");
const path=require("path");
const {createMcpClient,executeTypedStage}=require("./autonomous-plan-client");

async function main(){if(process.argv.length!==3)throw new Error("Usage: node scripts/slideshow-run-stages.js plan.json");const file=path.resolve(process.argv[2]),bundle=JSON.parse(fs.readFileSync(file,"utf8"));if(!bundle||!Array.isArray(bundle.stages)||!bundle.stages.length)throw new Error("Plan bundle has no stages.");const client=createMcpClient(),results=[];try{for(let i=0;i<bundle.stages.length;i+=1){const stage=bundle.stages[i];process.stdout.write(`${JSON.stringify({phase:"stage_start",index:i+1,name:stage.name,steps:stage.steps.length})}\n`);const result=await executeTypedStage(client,stage,(event)=>process.stdout.write(`${JSON.stringify({stage:stage.name,...event})}\n`));results.push({name:stage.name,ok:result.ok,semanticVerification:result.semanticVerification});}process.stdout.write(`${JSON.stringify({ok:true,file,stages:results})}\n`);}finally{client.close();}}

main().catch((error)=>{process.stderr.write(`${JSON.stringify({ok:false,error:error.message,result:error.result||null})}\n`);process.exitCode=1;});
