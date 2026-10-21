#!/usr/bin/env node
"use strict";
const activation=require("../mcp-server/owned-runtime-product-activation");
function fail(){throw Object.assign(Error("owned_activation_cli_arguments_invalid"),{code:"owned_activation_cli_arguments_invalid"});}
async function run(argv=process.argv.slice(2)){
  const [command,...a]=argv;
  if(command==="dry-run"&&a.length===0)return activation.dryRun();
  if(command==="status"&&a.length===0)return activation.status();
  if(command==="authorize"&&a.length===4&&a[0]==="--review-digest"&&a[2]==="--authorization-reference")return activation.authorize(a[1],a[3]);
  if(command==="apply"&&a.length===0)return require("../mcp-server/owned-runtime-supervisor").createOwnedRuntimeSupervisor().activateProductRuntime();
  fail();
}
if(require.main===module)run().then(r=>process.stdout.write(JSON.stringify(r)+"\n"),e=>{process.stdout.write(JSON.stringify({ok:false,code:/^owned_[a-z0-9_]+$/.test(e.code||"")?e.code:"owned_activation_inspection_refused",replayAllowed:false})+"\n");process.exitCode=1;});
module.exports={run};
