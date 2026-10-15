"use strict";
// Actual adapter/authority sources in a VM. Native/runtime/HTTP entry points are
// offline sentinels; importing this test never imports the production adapter.
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm"),crypto=require("node:crypto"),{EventEmitter}=require("node:events");
const root=path.resolve(__dirname,".."),adapterFile=path.join(root,"mcp-server/mcp-adapter.js");
const authorityNames=["owned-runtime-authority","native-fixture-attempt-ledger","owned-runtime-lifecycle","owned-runtime-win32"];
const authorityFiles=new Set(authorityNames.map(name=>path.join(root,"mcp-server",name+".js")));
function fixture(){
  const cache=new Map(),loads=[],replies=[],stdin=new EventEmitter(),stdout=new EventEmitter(),handlers={},effects=[];
  stdout.write=raw=>replies.push(JSON.parse(raw));
  let factory=0,facades=0;
  const forbidden=name=>(..._args)=>{effects.push(name);throw Error("offline_effect_forbidden:"+name);};
  const noFs=new Proxy(Object.create(null),{get:(_target,key)=>forbidden("fs."+String(key))});
  const state=()=>({ok:factory===1,status:factory?"ORIGINAL_TARGET_HELD":"CLOSED",replayAllowed:false});
  const runtime={tools:[],readStatus:async()=>state(),
    async ensure(){assertAuthorityLoaded();assert.equal(loads.filter(file=>authorityFiles.has(file)).length,4);factory++;assert.equal(factory,1);return state();},
    restart:forbidden("restart"),shutdown:forbidden("shutdown"),revoke:async()=>state(),callTool:forbidden("ordinary_tool")};
  function assertAuthorityLoaded(){for(const file of authorityFiles)assert(cache.has(file),"authority closure must precede native factory: "+path.basename(file));}
  const stubs={
    "./deployment-mode":{deploymentMode:()=>"initial-owned"},
    http:{request:forbidden("http")},readline:{createInterface(){return {on(name,callback){handlers[name]=callback;return this;}};}},
    "./text-layout-policy":{TEXT_LAYOUT_POLICY:"offline"},"./tool-error-response":{decorateToolResult:forbidden("decorate"),sanitizeHttpFailure:forbidden("sanitize")},
    "./cep-panel-control":{isPanelControlTool:()=>false},"./production-usage-tools":{productionUsageTools:[],isProductionUsageTool:()=>false,handleProductionUsageTool:forbidden("usage")},
    "./owned-runtime-initial-source-census":{requested:()=>false},
    "./owned-runtime-initial-runtime":{createInitialRuntime(){facades++;assertAuthorityLoaded();return runtime;}}
  };
  function load(file){
    if(cache.has(file))return cache.get(file).exports;
    const module={exports:{}};cache.set(file,module);loads.push(file);
    const context=vm.createContext({module,exports:module.exports,__filename:file,__dirname:path.dirname(file),Buffer,URL,AbortController,
      process:{env:{AE_DAEMON_AUTO_START:"0"},stdin,stdout,stderr:{write(){}},exit:forbidden("exit")},
      require(name){
        if(file===adapterFile&&Object.hasOwn(stubs,name))return stubs[name];
        if(name==="node:fs")return noFs;
        if(name==="node:path")return path;
        if(name==="node:crypto")return crypto;
        if(name==="node:child_process")return {spawn:forbidden("spawn")};
        if(name.startsWith(".")){const child=path.resolve(path.dirname(file),name+".js");assert(authorityFiles.has(child),"unreviewed local import: "+name);return load(child);}
        throw Error("unreviewed import: "+name);
      }});
    new vm.Script(fs.readFileSync(file,"utf8"),{filename:file}).runInContext(context,{timeout:2000});return module.exports;
  }
  const adapter=load(adapterFile);
  return {adapter,loads,replies,effects,assertAuthorityLoaded,get factory(){return factory;},get facades(){return facades;}};
}
async function main(){
  const f=fixture();f.assertAuthorityLoaded();assert.equal(f.factory,0);assert.equal(f.facades,1);assert.deepEqual(f.effects,[]);
  const preload=f.loads.slice();f.adapter.startStdioMcp();
  await f.adapter.handleRpc({jsonrpc:"2.0",id:1,method:"initialize"});
  await f.adapter.handleRpc({jsonrpc:"2.0",id:2,method:"tools/list"});
  await f.adapter.handleRpc({jsonrpc:"2.0",id:3,method:"tools/call",params:{name:"get_owned_runtime_status",arguments:{}}});
  assert.equal(f.factory,0);assert.equal(f.replies.length,3);assert(f.replies.every(reply=>!reply.error));assert.deepEqual(f.loads,preload);assert.deepEqual(f.effects,[]);
  await assert.rejects(f.adapter.handleOwnedRuntimeTool("ensure_owned_runtime_daemon",{callerGrant:true}),/owned_adapter_arguments_forbidden/);
  assert.equal(f.factory,0);assert.deepEqual(f.loads,preload);
  await f.adapter.handleRpc({jsonrpc:"2.0",id:4,method:"tools/call",params:{name:"ensure_owned_runtime_daemon",arguments:{}}});
  assert.equal(f.factory,1);assert(!f.replies[3].error);assert.equal(JSON.parse(f.replies[3].result.content[0].text).status,"ORIGINAL_TARGET_HELD");
  assert.deepEqual(f.loads,preload,"first ensure must not first-load authority modules");assert.deepEqual(f.effects,[]);
  return {ok:true,groups:4,authorityModulesPreloaded:4,actualNativeFactories:0,actualHttp:false,actualProcessLaunches:0,actualAe:false};
}
main().then(value=>process.stdout.write(JSON.stringify(value)+"\n"),error=>{process.stderr.write(error.stack+"\n");process.exitCode=1;});
