"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm"),{EventEmitter}=require("node:events");
let requests=0,starts=0;
const fakeHttp={request(options,callback){
  requests++;assert.equal(options.path,"/health");assert.equal(options.timeout,5000);
  const request=new EventEmitter();let timer,reply;
  request.write=()=>{};request.destroy=error=>{clearTimeout(timer);clearTimeout(reply);request.emit("error",error);};
  request.end=()=>{timer=setTimeout(()=>request.emit("timeout"),options.timeout);reply=setTimeout(()=>{clearTimeout(timer);const response=new EventEmitter();response.statusCode=200;response.setEncoding=()=>{};callback(response);response.emit("data",JSON.stringify({ok:true,server:"delayed-healthy"}));response.emit("end");},1600);};
  return request;
}};
const mocks={http:fakeHttp,"./text-layout-policy":{TEXT_LAYOUT_POLICY:""},"./tool-error-response":{decorateToolResult:v=>v,sanitizeHttpFailure:v=>v},"./cep-panel-control":{isPanelControlTool:()=>false},"./production-usage-tools":{productionUsageTools:[],isProductionUsageTool:()=>false},"./owned-runtime-initial-source-census":{requested:()=>false},"./owned-runtime-authority":{},"./deployment-mode":{deploymentMode:()=>"product"},"./owned-runtime-initial-runtime":{createInitialRuntime:()=>null},"./owned-runtime-supervisor":{createOwnedRuntimeSupervisor:()=>({ensure:async()=>{starts++;throw Error("must not launch for delayed healthy endpoint");}})}};
const moduleMock={exports:{}},filename=path.resolve(__dirname,"../mcp-server/mcp-adapter.js");
vm.runInNewContext(fs.readFileSync(filename,"utf8"),{require:id=>mocks[id]||require(id),module:moduleMock,exports:moduleMock.exports,process:{env:{},stderr:{write(){}},stdout:{write(){}}},__dirname:path.dirname(filename),Buffer,console,AbortController,Map,Set,Object,JSON});
(async()=>{const [first,second]=await Promise.all([moduleMock.exports.ensureDaemonRunning(),moduleMock.exports.ensureDaemonRunning()]);assert.equal(first.server,"delayed-healthy");assert.equal(second.server,"delayed-healthy");assert.equal(requests,1);assert.equal(starts,0);console.log("PASS: official adapter admits 1600ms healthy response within bounded 5000ms; concurrent ensure shares read, daemon starts0");})().catch(e=>{console.error(e);process.exitCode=1;});
