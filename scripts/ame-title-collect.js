#!/usr/bin/env node
"use strict";
// Explicit read-only entry point. The adapter exports readStatus(args); it uses
// the existing authenticated controller, never its own credentials/client.
const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict");
const {createCollector}=require("../mcp-server/ame-title-collector");
async function main(argv=process.argv.slice(2)) {
  const [inputFile,stateDirectory,adapterFile]=argv;
  assert(inputFile&&stateDirectory&&adapterFile,"node scripts/ame-title-collect.js input.json state-directory read-only-adapter.cjs");
  const input=JSON.parse(fs.readFileSync(path.resolve(inputFile),"utf8").replace(/^\uFEFF/,"")),adapter=require(path.resolve(adapterFile));
  assert.equal(typeof adapter.readStatus,"function");
  const collector=createCollector({...input,directory:path.resolve(stateDirectory),call:(_tool,args)=>adapter.readStatus(args)});
  try {
    for(;;) {
      const state=await collector.round();
      process.stdout.write(JSON.stringify({at:new Date().toISOString(),sequence:state.sequence,terminal:state.states.filter(s=>s.terminal).length,blocked:state.states.filter(s=>s.blocked).length,deadline:state.deadline,startCalls:0,enqueueCalls:0})+"\n");
      if(Date.now()>=state.deadline||state.states.every(s=>s.terminal||s.blocked)) {if(state.states.some(s=>!s.terminal))process.exitCode=2;return state;}
      await new Promise(resolve=>setTimeout(resolve,30000));
    }
  } finally {collector.close();}
}
module.exports={main};
if(require.main===module)main().catch(error=>{process.stderr.write(JSON.stringify({code:"collector_stopped_no_mutation_replay",error:error.message})+"\n");process.exitCode=1;});
