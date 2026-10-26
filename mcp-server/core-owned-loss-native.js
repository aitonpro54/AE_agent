"use strict";
// Transport UNKNOWN never closes stdin: a late Start reply may already own
// the only retained process HANDLE. Only supported disposal closes this pipe.
const path=require("node:path"),{spawn}=require("node:child_process"),ledger=require("./native-fixture-attempt-ledger"),loss=require("./core-owned-loss"),supervisor=require("./owned-runtime-supervisor"),win=require("./owned-runtime-win32");
function createPipe(child,{setTimer=setTimeout,clearTimer=clearTimeout}={}){
 let pending=null,buffer="",dead=false,uncertain=false,unframed=false;child.stderr.resume();
 const failure=code=>Object.assign(Error(code),{code});
 function unknown(code){uncertain=true;if(pending&&!pending.timedOut){pending.timedOut=true;pending.reject(failure(code));}}
 child.stdin.on?.("error",()=>unknown("core_loss_native_write_unknown_owner_retained"));
 const exited=new Promise(resolve=>{child.on("error",()=>{dead=true;pending?.reject(failure("core_loss_native_failed"));resolve();});child.on("close",()=>{dead=true;pending?.reject(failure("core_loss_native_lost_unknown"));resolve();});});
 child.stdout.setEncoding("utf8");child.stdout.on("data",chunk=>{
  if(unframed)return;buffer+=chunk;if(buffer.length>524288){unknown("core_loss_native_budget_owner_retained");unframed=true;child.stdout.pause();return;}
  let end;while((end=buffer.indexOf("\n"))>=0){const line=buffer.slice(0,end).replace(/^\uFEFF/,"");buffer=buffer.slice(end+1);const p=pending;
   try{const v=JSON.parse(line);if(!v||typeof v!=="object"||Array.isArray(v))throw failure("core_loss_native_frame_unknown_owner_retained");if(!p)throw failure("core_loss_native_unsolicited_owner_retained");pending=null;if(p.timedOut)continue;if(v.ok!==true){p.reject(failure(v.code||"core_loss_native_refused"));continue;}p.resolve(v);}
   catch(_){unknown("core_loss_native_frame_unknown_owner_retained");unframed=true;child.stdout.pause();return;}
  }
 });
 async function rpc(op){
  if(dead)throw failure("core_loss_native_lost_unknown");if(unframed||pending)throw failure("core_loss_native_pending_readback_only");
  if(uncertain&&!['observe-core-loss','assert-core-loss-pair'].includes(op))throw failure("core_loss_native_unknown_readback_only");
  const answer=new Promise((resolve,reject)=>{pending={resolve,reject,timedOut:false};}),timer=setTimer(()=>unknown("core_loss_native_timeout_owner_retained"),20000);
  try{try{child.stdin.write(JSON.stringify({op})+"\n");}catch(_){unknown("core_loss_native_write_unknown_owner_retained");}return await answer;}catch(error){uncertain=true;throw error;}finally{clearTimer(timer);}
 }
 return {rpc,state:()=>dead?"lost_unknown":unframed?"unframed_owner_retained":pending?.timedOut?"pending_owner_retained":uncertain?"unknown_readback_only":"same_native_session",async close(){await rpc("dispose-core-loss");child.stdin.end();await exited;}};
}
async function acquire(mode){
 if(!["owner","observer"].includes(mode)||path.resolve(__dirname,"..")!==loss.TARGET)throw Error("core_loss_production_root_required");
 win.verifyPolicy();supervisor.verifyNodePolicy();if(ledger.hash(ledger.readBytes(supervisor.POLICY.helper))!==supervisor.POLICY.helperSha256)throw Error("core_loss_native_helper_changed");
 const child=spawn(win.POLICY.executable,["-NoLogo","-NoProfile","-NonInteractive","-MTA","-File",supervisor.POLICY.helper],{windowsHide:true,env:require("./core-product-migration").minimalReaderEnvironment(),stdio:["pipe","pipe","pipe"]}),pipe=createPipe(child);
 const opened=await pipe.rpc(mode==="owner"?"acquire-core-loss-owner":"capture-core-loss-observer");if(!ledger.UUID.test(opened.sessionId||""))throw Error("core_loss_native_session_invalid");
 return Object.freeze({sessionId:opened.sessionId,state:pipe.state,assertPair:()=>pipe.rpc("assert-core-loss-pair"),preflight:()=>pipe.rpc("preflight-core-loss"),start:()=>pipe.rpc("start-core-loss-once"),publish:()=>pipe.rpc("publish-core-loss-current"),observe:()=>pipe.rpc("observe-core-loss"),releaseOwner:()=>pipe.rpc("release-core-loss-owner"),acquirePair:()=>pipe.rpc("acquire-core-loss-observer-pair"),survive:()=>pipe.rpc("prove-core-loss-survival"),recheckCurrent:()=>pipe.rpc("recheck-core-loss-current"),finishRedirect:()=>pipe.rpc("finish-core-loss-redirect"),dispose:pipe.close});
}
module.exports={acquire,createPipe};
