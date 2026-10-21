#!/usr/bin/env node
"use strict";
// Closed, private one-effect transport. No arbitrary CDP/eval/url selectors.
const causal=require("../mcp-server/panel-lifecycle-causal");
function parse(argv){if(argv.length!==1||!["reload-once","read-back"].includes(argv[0]))causal.fail("panel_causal_upgrade_closed_commands_only");return argv[0];}
async function reloadOnce(permit){
  causal.assertUpgradePermit(permit);
  const endpoint=new URL(permit.target.webSocketDebuggerUrl);
  if(endpoint.protocol!=="ws:"||endpoint.hostname!=="127.0.0.1"||endpoint.port!=="8870"||endpoint.username||endpoint.password||endpoint.search||endpoint.hash||!/^\/devtools\/page\/[^/]+$/.test(endpoint.pathname))causal.fail("panel_causal_upgrade_target_invalid");
  let ws,sent=false,finished=false;
  try{
    ws=new WebSocket(endpoint.href);
    await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error("connect_timeout")),3000);ws.onopen=()=>{clearTimeout(timer);resolve();};ws.onerror=ws.onclose=()=>{clearTimeout(timer);reject(Error("connect_closed"));};});
    // The effect socket is already connected to the pinned target. After this
    // final readonly view there is no sleep, status roundtrip or second effect.
    await permit.finalView();
    if(ws.readyState!==1)throw Error("socket_closed_before_send");
    return await new Promise(resolve=>{
      const done=ack=>{if(finished)return;finished=true;clearTimeout(timer);resolve(ack?"reload_acknowledged_readback_required":"reload_unknown_readback_only");};
      const timer=setTimeout(()=>done(false),5000);
      ws.onmessage=event=>{try{if(typeof event.data!=="string"||event.data.length>65536){done(false);return;}const row=JSON.parse(event.data);if(row.id===1)done(!row.error);}catch(_){done(false);}};
      ws.onerror=ws.onclose=()=>done(false);
      try{permit.beforeSend();sent=true;ws.send(JSON.stringify({id:1,method:"Page.reload",params:{ignoreCache:true}}));}catch(_){done(false);}
    });
  }catch(_){return sent?"reload_unknown_readback_only":"reload_not_sent_readback_only";}
  finally{if(ws){ws.onopen=ws.onmessage=ws.onerror=ws.onclose=null;try{ws.close();}catch(_){}}}
}
async function run(argv){
  const command=parse(argv);
  if(command==="read-back")return causal.upgradeReadBack();
  const permit=await causal.reserveUpgrade(),status=await reloadOnce(permit);permit.record(status);
  try{const observed=await causal.upgradeReadBack();return {...observed,reloadStatus:status};}
  catch(error){return {ok:false,status:"reload_consumed_readback_only",reloadStatus:status,code:/^(panel_causal_|causal_)[a-z0-9_]+$/.test(error.code||"")?error.code:"panel_causal_post_reload_not_observed",adoptionObserved:false,...causal.disposition()};}
}
if(require.main===module)run(process.argv.slice(2)).then(v=>{process.stdout.write(JSON.stringify(v)+"\n");if(v.ok!==true)process.exitCode=1;}).catch(e=>{process.stdout.write(JSON.stringify({ok:false,code:/^(panel_causal_|causal_)[a-z0-9_]+$/.test(e.code||"")?e.code:"panel_causal_upgrade_refused",adoptionObserved:false,...causal.disposition()})+"\n");process.exitCode=1;});
module.exports={parse,run,reloadOnce};
