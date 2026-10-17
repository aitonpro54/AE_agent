"use strict";
const path=require("node:path"),recovery=require("../mcp-server/owned-runtime-initial-recovery");
const ROOT=path.resolve(__dirname,"..");
async function run(args){
  if(args.length===3 && args[0]==="prepare" && args[1]==="--authorization-reference")return recovery.prepare(ROOT,args[2]);
  if(args.length===1 && args[0]==="inspect"){const cap=recovery.load(ROOT);return {ok:true,status:"initial_recovery_inspected_no_effect",generation:cap.value.generation,operationId:cap.value.operationId,replayAllowed:false};}
  if(args.length===1 && args[0]==="recover-once")return require("../mcp-server/owned-runtime-supervisor").createOwnedRuntimeSupervisor().recoverInitialStartup();
  throw Object.assign(Error("owned_initial_closed_cli_schema"),{code:"owned_initial_closed_cli_schema"});
}
module.exports={run};
if(require.main===module)run(process.argv.slice(2)).then(v=>process.stdout.write(JSON.stringify(v)+"\n")).catch(e=>{process.stdout.write(JSON.stringify({ok:false,code:/^owned_[a-z0-9_]+$/.test(e.code || "")?e.code:"owned_initial_recovery_unknown",replayAllowed:false})+"\n");process.exitCode=1;});
