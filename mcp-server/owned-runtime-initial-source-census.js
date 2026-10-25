"use strict";

// Both fixed production entries preload this collector. Its output is passive
// discovery data and is never accepted by a native authority constructor.
const inspector=require("node:inspector"),crypto=require("node:crypto");
const LIMIT_ROWS=1024,LIMIT_BYTES=16*1024*1024;
function requested(){return process.argv.length===3&&process.argv[2]==="--trusted-read-source-census";}
function fail(code){throw Object.assign(Error(code),{code});}
function post(session,method,params){return new Promise((resolve,reject)=>session.post(method,params,(error,value)=>error?reject(error):resolve(value)));}
async function collectFixed(role){
  if(!requested()||!["controller","daemon"].includes(role))fail("owned_initial_passive_census_entry_required");
  const session=new inspector.Session(),scripts=new Map(),contexts=new Map(),signals={destroyed:0,contextsCleared:0,globalCleared:0,failed:0};
  let collecting=true,generation=0,late=0,invalid=false,total=0;
  const parsed=message=>{const row=message.params;if(!collecting){late++;invalid=true;return;}
    if(!row||typeof row.scriptId!=="string"||scripts.has(row.scriptId)||scripts.size>=LIMIT_ROWS){invalid=true;return;}
    scripts.set(row.scriptId,row);generation++;};
  const created=message=>{const row=message.params?.context;if(!collecting||!row||contexts.has(row.id)){invalid=true;return;}contexts.set(row.id,row);};
  const changed=key=>()=>{signals[key]++;invalid=true;};
  const handlers=[["Debugger.scriptParsed",parsed],["Runtime.executionContextCreated",created],["Runtime.executionContextDestroyed",changed("destroyed")],
    ["Runtime.executionContextsCleared",changed("contextsCleared")],["Debugger.globalObjectCleared",changed("globalCleared")],["Debugger.scriptFailedToParse",changed("failed")]];
  try{
    for(const[event,handler]of handlers)session.on(event,handler);session.connect();
    await post(session,"Runtime.enable",{});await post(session,"Debugger.enable",{});
    collecting=false;const fence=generation,rows=[],moduleFence=Object.keys(require.cache).sort();
    if(invalid||!scripts.size)fail("owned_initial_passive_census_snapshot_refused");
    for(const metadata of scripts.values()){
      const reply=await post(session,"Debugger.getScriptSource",{scriptId:metadata.scriptId});
      if(invalid||generation!==fence||typeof reply.scriptSource!=="string")fail("owned_initial_passive_census_changed");
      const bytes=Buffer.from(reply.scriptSource,"utf8");if(bytes.length>LIMIT_BYTES-total)fail("owned_initial_passive_census_bytes_limit");total+=bytes.length;
      rows.push({metadata,utf8ByteLength:bytes.length,sha256:crypto.createHash("sha256").update(bytes).digest("hex"),sourceUtf8:reply.scriptSource});
    }
    const currentModules=Object.keys(require.cache).sort();
    if(invalid||late||generation!==fence||JSON.stringify(currentModules)!==JSON.stringify(moduleFence))fail("owned_initial_passive_census_changed");
    return {schema:"ae-agent.owned-initial-passive-source-census.v1",role,authority:false,nativeFactories:0,addonLoaded:false,
      runtimeVersion:process.version,loadedModules:moduleFence.map(filename=>({filename,loaded:require.cache[filename].loaded===true})),
      rows,contexts:[...contexts.values()],rowCount:rows.length,totalByteLength:total,late,signals,
      snapshotComplete:true,productionInventoryAdmitted:false};
  }finally{for(const[event,handler]of handlers)session.removeListener(event,handler);session.disconnect();}
}
module.exports=Object.freeze({requested,collectFixed});
