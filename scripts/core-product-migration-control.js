#!/usr/bin/env node
"use strict";
// Root-owned persistent controller. Closed verbs only; no caller proof, PID,
// root, grant, force, repair or register-replay inputs.
const readline=require("node:readline"),migration=require("../mcp-server/core-product-migration");
function emit(value){process.stdout.write(JSON.stringify(value)+"\n");}
function diagnostic(error){return {ok:false,code:/^(core_migration_|owned_)[a-z0-9_]+$/.test(error.code||"")?error.code:"core_migration_control_refused",replayAllowed:false};}
async function control(){
  const prepared=migration.readBack(),context=await migration.acquireMigrationController(prepared.operationId);let released=false;
  emit({ok:true,status:"actual_pair_controller_ready",operationId:context.operationId,generation:context.generation,ownerPid:process.pid,commands:["preflight","start-once","prestart-resume-preflight","start-prestart-resume-once","observe","release"],spawnAttempted:false});
  const input=readline.createInterface({input:process.stdin,terminal:false});
  process.on("SIGINT",()=>emit({ok:false,status:"owner_interrupt_observation_only",code:"core_migration_use_release_after_factual_exit",replayAllowed:false}));
  for await(const line of input){try{if(line==="preflight"){await migration.verifyBeforeSpawn(context);emit({ok:true,status:"fresh_private_preflight_passed",spawnAttempted:false});}
    else if(line==="prestart-resume-preflight"){await migration.verifyPrestartResumeBeforeSpawn(context);emit({ok:true,status:"fresh_private_prestart_resume_preflight_passed",spawnAttempted:false});}
    else if(line==="start-prestart-resume-once")emit(await migration.startPrestartResumeOnce(context));
    else if(line==="start-once")emit(await migration.startGenesis(context));
    else if(line==="observe")emit(await migration.observe(context));
    else if(line==="release"){emit(await migration.releaseController(context));released=true;input.close();break;}
    else emit({ok:false,code:"core_migration_control_closed_verb_required",replayAllowed:false});
  }catch(error){emit(diagnostic(error));}}
  if(released)return;
  try{emit(await migration.releaseController(context));return;}catch(error){emit({...diagnostic(error),status:"input_closed_owner_retained"});}
  // EOF cannot drop a live target's actual pair/HANDLE. Observation remains on
  // this same native pipe; it never retries launch/POST/seal/current metadata.
  for(;;){await new Promise(resolve=>setTimeout(resolve,5000));try{const observed=await migration.observe(context);emit(observed);if(observed.observation?.wait?.signaled===true){emit(await migration.releaseController(context));break;}}catch(error){emit({...diagnostic(error),status:"lost_unknown_external_prerequisite"});break;}}
}
async function main(argv){if(argv.length!==1||!["inspect","authorize-current-review","prepare-genesis","authorize-prestart-disposition","read-back","control"].includes(argv[0]))throw Object.assign(Error("core_migration_cli_closed_schema"),{code:"core_migration_cli_closed_schema"});const verb=argv[0];if(verb==="control")return control();emit(verb==="inspect"?migration.inspect():verb==="authorize-current-review"?migration.authorizeCurrentReview():verb==="prepare-genesis"?migration.prepareGenesis():verb==="authorize-prestart-disposition"?migration.authorizePrestartDisposition():migration.readBack());}
if(require.main===module)main(process.argv.slice(2)).catch(error=>{emit(diagnostic(error));process.exitCode=1;});
module.exports={main};
