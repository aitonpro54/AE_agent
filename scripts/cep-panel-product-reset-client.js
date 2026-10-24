#!/usr/bin/env node
"use strict";
// Fixed pending-reset bridge.connect only. Never starts/reloads a server/panel.
const control=require("../mcp-server/cep-panel-control");
const fs=require("node:fs"),crypto=require("node:crypto"),loadedSha256=crypto.createHash("sha256").update(fs.readFileSync(__filename)).digest("hex");
function assertLoadedSource(){if(crypto.createHash("sha256").update(fs.readFileSync(__filename)).digest("hex")!==loadedSha256)throw Object.assign(Error("product_reset_client_loaded_source_changed"),{code:"product_reset_client_loaded_source_changed"});}
function parse(args){
  if(args.length===1&&args[0]==="attest")return {command:"attest"};
  if(args.length===3&&["state","diagnose"].includes(args[0])&&args[1]==="--client-sha256")return {command:args[0],clientSha256:args[2]};
  if(args.length===5&&["connect","result"].includes(args[0])&&args[1]==="--request-id"&&args[3]==="--client-sha256"&&/^[a-f0-9-]{36}$/.test(args[2]))return {command:args[0],requestId:args[2],clientSha256:args[4]};
  throw Object.assign(Error("product_reset_client_arguments_invalid"),{code:"product_reset_client_arguments_invalid"});
}
async function run(args){
  assertLoadedSource();
  const input=parse(args);if(input.command==="attest")return {ok:true,client:control.productResetClientAttestation(),replayAllowed:false};
  const client=control.createProductResetMaintenanceClient(input.clientSha256);
  if(input.command==="state")return client.state();
  if(input.command==="diagnose")return client.diagnose();
  if(input.command==="result"&&input.requestId)return client.getResult(input.requestId);
  if(input.command==="connect")return client.connect(input.requestId);
  throw Object.assign(Error("product_reset_client_arguments_invalid"),{code:"product_reset_client_arguments_invalid"});
}
module.exports={parse,run,assertLoadedSource};
if(require.main===module)run(process.argv.slice(2)).then(value=>{process.stdout.write(JSON.stringify(value)+"\n");if(value.ok!==true)process.exitCode=1;}).catch(error=>{process.stdout.write(JSON.stringify({ok:false,code:/^[a-z0-9_]+$/.test(error.code||"")?error.code:"product_reset_client_refused",replayAllowed:false})+"\n");process.exitCode=1;});
