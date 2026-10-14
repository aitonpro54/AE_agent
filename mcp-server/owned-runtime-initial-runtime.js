"use strict";

// Routing selects this branch only. Original native objects, measured sources
// and the sealed policy determine every admission; constructors remain pure.
const native = require("./owned-runtime-initial-native-client");
const sourceCensus = require("./owned-runtime-initial-source-census");
// Identical pure preloads precede either role's loaded-source snapshot. Neither
// import connects, listens, loads the addon, or constructs native authority.
const fixedObservers = require("./owned-runtime-initial-observers");
const fixedTitlePlan = require("./owned-runtime-initial-title-plan"); // pure shared pre-C1 closure
const fixedUiBaseline = require("./owned-runtime-ui-baseline"); // same self-contained ES3 closure in both roles
const http = require("node:http");
const SCHEMA = "ae-agent.owned-runtime-initial-runtime.v1";
const ORIGIN = "initial_owned";
const LOCATOR_KEYS = Object.freeze([
  "AE_AGENT_LOCAL_SESSION_PIPE", "AE_AGENT_LOCAL_SESSION_NONCE",
  "AE_AGENT_LOCAL_SESSION_GENERATION", "AE_AGENT_LOCAL_SESSION_BOOT"
]);
const instances = new WeakSet();
const NONCE = /^[0-9a-f]{32}$/;
const PIPE = /^\\\\\.\\pipe\\AEAgent\.LocalSession\.[0-9a-f]{64}\.daemon\.[0-9a-f]{32}$/;
const BASIC_READ_TOOLS=Object.freeze(["ensure_ae_agent_panel","get_bridge_status","get_project_info"]);
const LIBRARY_TOOLS=Object.freeze(["search_solutions","get_solution"]);
const INSPECTION_TOOLS=Object.freeze(["get_comp_details","get_layer_details","inspect_title_variants","inspect_ame_title_sources","inspect_ame_title_queue_manifest"]);
const AME_INSPECTION_TOOLS=Object.freeze(["inspect_ame_title_sources","inspect_ame_title_queue_manifest"]);
const BUILD_TOOLS=Object.freeze(["build_solution_plan"]);
const PROPOSAL_TOOLS=Object.freeze(["propose_ai_agent_plan"]);
const DRY_RUN_TOOLS=Object.freeze(["run_ai_agent_plan"]);
const FIXED_OPERATION_LEAVES=Object.freeze({checkpoint:14,clean_copy:15,stage:5,enqueue:6,start:7,restore:8});
// Pure finite intent validation. Execute still needs the original native READ,
// own retained proposal/dry-run and authenticated manual D46 consumer. This
// function constructs no cap and cannot enable an absent producer/route.
function fixedTitlePlanIntent(name,args){
  if(!args||typeof args!=="object"||Array.isArray(args))fail("owned_initial_fixed_intent_arguments");
  const operation=args.ownedTitleOperation,slot=args.variantSlot,leaf=FIXED_OPERATION_LEAVES[operation];
  if(!Object.hasOwn(FIXED_OPERATION_LEAVES,operation)||!Number.isInteger(slot)||(operation==="checkpoint"?slot!==0:![1,2].includes(slot)))fail("owned_initial_fixed_intent_selector");
  const keys=Object.keys(args).sort().join(",");
  if(name==="propose_ai_agent_plan"){if(keys!=="ownedTitleOperation,variantSlot")fail("owned_initial_fixed_proposal_shape");return Object.freeze({kind:5,slot,leaf});}
  if(name!=="run_ai_agent_plan")fail("owned_initial_fixed_intent_tool");
  for(const key of ["actionId","payloadRef","payloadHash","previewHash","riskLevel","riskPolicyVersion"])if(typeof args[key]!=="string"||!args[key])fail("owned_initial_fixed_intent_envelope");
  if(args.riskLevel!=="mutating")fail("owned_initial_fixed_intent_risk");
  if(args.dryRun===true){if(keys!=="actionId,dryRun,ownedTitleOperation,payloadHash,payloadRef,previewHash,riskLevel,riskPolicyVersion,variantSlot")fail("owned_initial_fixed_dry_shape");return Object.freeze({kind:5,slot,leaf});}
  if(keys!=="actionId,ownedTitleOperation,ownedTitleProgram,payloadHash,payloadRef,previewHash,riskLevel,riskPolicyVersion,variantSlot")fail("owned_initial_fixed_execute_shape");
  const program=args.ownedTitleProgram;
  if(!program||typeof program!=="object"||Array.isArray(program)||Object.keys(program).sort().join(",")!=="facts,manifestSha25664,operation,schema,slot"||
      program.schema!=="ae-agent.owned-runtime-fixed-title-operation.v1"||program.operation!==operation||program.slot!==slot||!/^[0-9a-f]{64}$/.test(program.manifestSha25664))fail("owned_initial_fixed_execute_program");
  // Only a data shape here. Own native Manifest/current M100 body equality is
  // required later; serializing a valid table never manufactures that join.
  const table=fixedTitlePlan.buildFixedTitlePlan(program.facts);fixedTitlePlan.selectFixedTitleOperation(table,{operation,slot});
  return Object.freeze({kind:6,slot,leaf});
}
function freezeDefinition(value){for(const child of Object.values(value))if(child&&typeof child==="object")freezeDefinition(child);return Object.freeze(value);}
const positive={type:"integer",minimum:1},text={type:"string"},flag={type:"boolean"};
// This initial surface is finite and read-only. Executable plans, manual AME
// start and write leaves acquire separate native producer joins later.
const INITIAL_TOOL_PROPERTIES=freezeDefinition({
  search_solutions:{query:text,limit:{type:"integer",minimum:1,maximum:8}},
  get_solution:{id:text,offset:{type:"integer",minimum:0},limit:{type:"integer",minimum:500,maximum:12000},toolNames:{type:"array",maxItems:4,items:text}},
  get_comp_details:{compItemId:positive,compItemIndex:positive,compName:text,includeLayers:flag,layerLimit:{type:"integer",minimum:1,maximum:1000},includeMarkers:flag,markerLimit:{type:"integer",minimum:0,maximum:1000},includeDynamicLinkGUID:flag},
  get_layer_details:{compItemId:positive,compItemIndex:positive,compName:text,layerId:positive,layerIndex:positive,responseView:{type:"string",enum:["full"]},includeProperties:flag,propertyDepth:{type:"integer",minimum:0,maximum:5},propertyLimit:{type:"integer",minimum:1,maximum:1000},includeValues:flag,includeExpressions:flag},
  inspect_title_variants:{expectedProjectFile:text,rootCompItemId:positive,variantCompItemId:positive,controlledLayerIds:{type:"array",minItems:1,maxItems:64,items:positive},variants:{type:"array",minItems:1,maxItems:64,items:{type:"object"}},attemptId:text}
  ,build_solution_plan:{solutionId:{type:"string",enum:["owned-runtime-two-title-fixed-v1"]}},
  inspect_ame_title_sources:{variantSlot:{type:"integer",minimum:1,maximum:2}},inspect_ame_title_queue_manifest:{variantSlot:{type:"integer",minimum:1,maximum:2}},
  propose_ai_agent_plan:{ownedTitleOperation:{type:"string",enum:Object.keys(FIXED_OPERATION_LEAVES)},variantSlot:{type:"integer",minimum:0,maximum:2}},
  run_ai_agent_plan:{actionId:text,payloadRef:text,payloadHash:text,previewHash:text,riskLevel:{type:"string",enum:["mutating"]},riskPolicyVersion:text,
    ownedTitleOperation:{type:"string",enum:Object.keys(FIXED_OPERATION_LEAVES)},variantSlot:{type:"integer",minimum:0,maximum:2},dryRun:{type:"boolean",enum:[true]},ownedTitleProgram:{type:"object"}}
});
function canonicalBody(name,args){let nodes=0,textBytes=0;
  function value(input,depth){if(++nodes>4096||depth>12)fail("owned_initial_input_json_bound");
    if(typeof input==="string"){textBytes+=Buffer.byteLength(input,"utf8");if(textBytes>1048576)fail("owned_initial_input_json_bound");return input;}
    if(input===null||typeof input==="boolean")return input;
    if(typeof input==="number"&&Number.isFinite(input))return input;
    if(!input||typeof input!=="object"||!(Array.isArray(input)?Object.getPrototypeOf(input)===Array.prototype:[Object.prototype,null].includes(Object.getPrototypeOf(input))))fail("owned_initial_plain_input_required");
    const descriptors=Object.getOwnPropertyDescriptors(input),keys=Reflect.ownKeys(descriptors);
    if(keys.some(key=>typeof key!=="string"||key!=="length"&&(!Object.hasOwn(descriptors[key],"value")||!descriptors[key].enumerable)))fail("owned_initial_input_accessor_or_symbol_refused");
    if(Array.isArray(input)){if(input.length>4096||keys.length!==input.length+1)fail("owned_initial_sparse_or_extended_array_refused");return Array.from({length:input.length},(_,i)=>value(descriptors[String(i)].value,depth+1));}
    const result=Object.create(null);for(const key of keys.sort()){textBytes+=Buffer.byteLength(key,"utf8");if(textBytes>1048576)fail("owned_initial_input_json_bound");result[key]=value(descriptors[key].value,depth+1);}return result;
  }
  const copied=value(args,0);if(!copied||Array.isArray(copied)||typeof copied!=="object")fail("owned_initial_tool_arguments_object_required");
  const bytes=Buffer.from(JSON.stringify({args:copied,name}),"utf8");if(bytes.length>1048576)fail("owned_initial_input_json_bound");return bytes;
}
function fail(code) { throw Object.assign(Error(code), { code }); }
function empty(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value)) || Reflect.ownKeys(value).length) {
    fail("owned_initial_arguments_empty_required");
  }
}

// Pure classification only. No locator, policy or receipt is exposed in status.
// Absence of every reserved initial locator preserves the existing default.
function inspectLocatorEnvironment(env) {
  const keys = Object.keys(env).filter(key => /^AE_AGENT_LOCAL_SESSION_/i.test(key));
  if (!keys.length) return Object.freeze({ requested: false, code: null });
  let code = "owned_initial_native_protocol_unavailable";
  if (Object.keys(env).some(key => /^AE_OWNED_RUNTIME_/i.test(key))) code = "owned_initial_mixed_origin_refused";
  else if (keys.some(key => !LOCATOR_KEYS.includes(key))) code = "owned_initial_locator_invalid";
  else if (LOCATOR_KEYS.some(key => !Object.hasOwn(env, key))) code = "owned_initial_locator_incomplete";
  else if (typeof env[LOCATOR_KEYS[0]] !== "string" || !PIPE.test(env[LOCATOR_KEYS[0]]) || LOCATOR_KEYS.slice(1).some(key =>
    typeof env[key] !== "string" || !NONCE.test(env[key])) ||
    env[LOCATOR_KEYS[0]].slice(-32) !== env.AE_AGENT_LOCAL_SESSION_NONCE) code = "owned_initial_locator_invalid";
  return Object.freeze({ requested: true, code });
}

function createInitialRuntime() {
  if (arguments.length) fail("owned_initial_private_factory_arguments_forbidden");
  const selected = inspectLocatorEnvironment(process.env);
  const census=sourceCensus.requested();
  if (!selected.requested && !native.selectedFixed() && !census) return null;
  const fixed = !selected.requested && native.selectedFixed() && !census;
  let revoked=false,unknown=false,role=null,observer=null,opened=false,ensured=false,read=null,serial=Promise.resolve(),bootPromise=null;
  const tools=Object.freeze([...BASIC_READ_TOOLS,...LIBRARY_TOOLS,...INSPECTION_TOOLS,...BUILD_TOOLS,...PROPOSAL_TOOLS,...DRY_RUN_TOOLS].map(name=>freezeDefinition({name,
    description:name==="ensure_ae_agent_panel"?"Open the fixed installed AE Agent panel and verify its native project read.":LIBRARY_TOOLS.includes(name)?"Read the local reviewed solution library within the original native call.":"Read current native AE facts within the original owned local session.",
    inputSchema:{type:"object",additionalProperties:false,properties:INITIAL_TOOL_PROPERTIES[name]||{}},annotations:{readOnlyHint:name!=="ensure_ae_agent_panel",destructiveHint:false,idempotentHint:false,openWorldHint:false}})));
  function status() {
    return Object.freeze({ ok: !!role&&!unknown&&!revoked, schema: SCHEMA, origin: ORIGIN,
      authorityMode: "local_controller_session", genuineChatIdentity: false,
      status: revoked?"REVOKED":unknown?"UNKNOWN":ensured?"ORIGINAL_TARGET_HELD":opened?"SESSION_OPEN":"CLOSED",
      code:revoked?"owned_initial_controller_closed":unknown?"owned_initial_original_unknown":fixed?"owned_initial_original_admission_required":selected.code,
      owned:!!role, available:ensured&&!unknown&&!revoked, productionAuthority:ensured&&!unknown&&!revoked,
      writeAdmission: "closed", executionEntitled: false, replayAllowed: false });
  }
  function assertRoute() {if (!fixed||revoked||unknown) fail(status().code);}
  function assertIngress() {assertRoute();if (!role||!observer||!opened) fail("owned_initial_original_runtime_unbound");observer.assertCurrent();native.assertCurrent(role);}
  function assertTool(name,args) {assertIngress();if (!tools.some(tool=>tool.name===name)) fail("owned_initial_exact_tool_refused");
    if(BASIC_READ_TOOLS.includes(name)){empty(args);return;}
    const copied=JSON.parse(canonicalBody(name,args).toString("utf8")),properties=INITIAL_TOOL_PROPERTIES[name];
    if(Object.keys(copied.args).some(key=>!Object.hasOwn(properties,key)))fail("owned_initial_tool_argument_field_refused");
    if(BUILD_TOOLS.includes(name)&&copied.args.solutionId!=="owned-runtime-two-title-fixed-v1")fail("owned_initial_exact_finite_build_required");
    if(PROPOSAL_TOOLS.includes(name)||DRY_RUN_TOOLS.includes(name)){const intent=fixedTitlePlanIntent(name,copied.args);
      if(intent.kind!==5&&![14,15].includes(intent.leaf))fail("owned_initial_fixed_execute_producer_unbound");}
    if(name==="get_layer_details"&&copied.args.responseView!==undefined&&copied.args.responseView!=="full")fail("owned_initial_readonly_full_result_required");
    if(AME_INSPECTION_TOOLS.includes(name)&&(Object.keys(copied.args).join(",")!=="variantSlot"||![1,2].includes(copied.args.variantSlot)))fail("owned_initial_ame_exact_inspection_slot");
  }
  function ordered(operation) {const work=serial.then(()=>{assertRoute();return operation();});serial=work.catch(error=>{if (error.unknown) unknown=true;});return work;}
  async function bootController() {
    assertRoute();if (bootPromise) return bootPromise;
    // Called only by explicit ensure, after official stdin lifecycle listeners
    // are installed. Status/tools-list/module import never invoke this factory.
    bootPromise=(async()=>{role=native.openControllerFixed();observer=await fixedObservers.bindLoadedNodeFixed(role);
      observer.assertCurrent();native.assertCurrent(role);await native.open(role);observer.assertCurrent();native.assertCurrent(role);opened=true;})();
    try {await bootPromise;}catch(error){unknown=true;throw error;}
  }
  async function readStatus(args) {empty(args);if (!role||revoked||unknown) return status();return ordered(async()=>{const actual=await native.status(role);assertIngress();return Object.freeze({...status(),state:actual.state});});}
  async function ensure(args) {empty(args);return ordered(async()=>{await bootController();if (ensured) return status();
    // Native Ensure consumes one launch and owns the returned original HANDLE.
    // A failure is retained; this promise cannot create a replacement root.
    const actual=await native.ensure(role);assertIngress();ensured=true;
    for(let attempt=0;attempt<30;attempt++){const state=await native.status(role);assertIngress();if(state.state===4||state.state===5)return Object.freeze({...status(),operation:actual.operation});
      if(state.state!==3)throw Object.assign(Error("owned_initial_original_daemon_unknown"),{unknown:true});
      await new Promise(resolve=>setTimeout(resolve,1000));assertIngress();}
    throw Object.assign(Error("owned_initial_original_daemon_registration_timeout"),{unknown:true});});}
  function transport() {assertIngress();let value;try {value=JSON.parse(native.fixedTransport(role).toString("utf8"));}catch {fail("owned_initial_fixed_transport_refused");}
    if (!value||Object.keys(value).sort().join(",")!=="automationToken,host,port"||value.host!=="127.0.0.1"||value.port!==3456||
        typeof value.automationToken!=="string"||!value.automationToken||value.automationToken.length>4096||/[\r\n\0]/.test(value.automationToken)) fail("owned_initial_fixed_transport_refused");return value;}
  async function exchange(name,args,authorization) {
    assertTool(name,args);if (!ensured) fail("owned_initial_original_daemon_absent");const body=canonicalBody(name,args);
    const scoped=PROPOSAL_TOOLS.includes(name)||DRY_RUN_TOOLS.includes(name);
    const scopedIntent=scoped?fixedTitlePlanIntent(name,args):null;
    const call=LIBRARY_TOOLS.includes(name)?await native.beginServerOnlyFixed(role,name,body):INSPECTION_TOOLS.includes(name)||BUILD_TOOLS.includes(name)||scoped?
      await native.beginExecutionFixed(role,authorization,Object.freeze({name,kind:scoped?scopedIntent.kind:5,slot:scoped?scopedIntent.slot:AME_INSPECTION_TOOLS.includes(name)?args.variantSlot:0,leaf:scoped?scopedIntent.leaf:4,canonicalBody:body})):
      name==="ensure_ae_agent_panel"?await native.beginPanel(role):await native.beginRead(role,name,authorization);
    assertIngress();native.assertCurrent(role,call);const locator=native.locator(role,call),target=transport();
    // Everything is synchronous between the last guard and this one request.
    // No retry/reconnect, caller host/port/token, or retained-origin fallback.
    assertIngress();const response=await new Promise((resolve,reject)=>{let settled=false;const done=(error,value)=>{if(settled)return;settled=true;error?reject(error):resolve(value);};
      const request=http.request({host:target.host,port:target.port,path:"/mcp/tools/call",method:"POST",agent:false,
        headers:{"content-type":"application/json","content-length":body.length,"x-ae-bridge-token":target.automationToken,
          "x-ae-mcp-adapter":"codex-stdio-v1","x-ae-initial-call":locator.toString("hex")}},reply=>{const chunks=[];let bytes=0;
        reply.on("data",chunk=>{bytes+=chunk.length;if(bytes>4*1024*1024){reply.destroy();done(Object.assign(Error("owned_initial_response_limit"),{unknown:true}));return;}chunks.push(chunk);});
        reply.once("aborted",()=>done(Object.assign(Error("owned_initial_response_unknown"),{unknown:true})));reply.once("error",error=>done(Object.assign(error,{unknown:true})));
        reply.once("end",()=>{if(!reply.complete||reply.statusCode!==200){done(Object.assign(Error("owned_initial_response_unknown"),{unknown:true}));return;}
          try {done(null,JSON.parse(Buffer.concat(chunks).toString("utf8")));}catch {done(Object.assign(Error("owned_initial_response_invalid"),{unknown:true}));}});});
      request.setTimeout(30000,()=>{request.destroy();done(Object.assign(Error("owned_initial_response_timeout_unknown"),{unknown:true}));});
      request.once("error",error=>done(Object.assign(error,{unknown:true})));request.end(body);});
    assertIngress();if (!response||response.ok!==true||!response.result||typeof response.result!=="object"||response.result.isError===true)
      fail("owned_initial_terminal_result_refused");return response.result;
  }
  async function renew() {const bracket=await native.beginBracket(role);assertIngress();
    const first=await exchange("get_bridge_status",{},bracket);assertIngress();const project=await exchange("get_project_info",{},bracket);assertIngress();
    const last=await exchange("get_bridge_status",{},bracket);assertIngress();read=await native.adoptBracket(role,bracket);assertIngress();
    return {first,project,last};}
  async function callTool(name,args) {return ordered(async()=>{assertTool(name,args);
    if(name==="ensure_ae_agent_panel"){const result=await exchange(name,args,null);const bracket=await renew();return Object.freeze({...result,project:bracket.project});}
    if(LIBRARY_TOOLS.includes(name))return exchange(name,args,null);
    if(!read) await renew();try{return await exchange(name,args,read);}catch(error){
      if(error.unknown||error.code!=="trusted_read_revalidation_required"||INSPECTION_TOOLS.includes(name)||BUILD_TOOLS.includes(name)||PROPOSAL_TOOLS.includes(name)||DRY_RUN_TOOLS.includes(name)) throw error;
      // A rejected expired READ has no external effect and keeps its row out of
      // the ledger. Renewal uses the same lifetime and never recreates a root.
      await renew();return exchange(name,args,read);}});}
  async function startDaemonFixed(){assertRoute();if(role||bootPromise) fail("owned_initial_original_daemon_bind_once");
    role=native.bindOriginalDaemonFixed();observer=await fixedObservers.bindLoadedNodeFixed(role);observer.assertCurrent();native.assertCurrent(role);
    opened=true;ensured=true;return status();}
  function daemonRole() {assertIngress();return role;}
  async function restart(args) {empty(args);fail("owned_initial_restart_spent_no_replay");}
  async function revoke() {if(revoked)return status();revoked=true;if(role)await native.revoke(role);return status();}
  async function shutdown(args) {empty(args);return revoke();}
  const runtime=Object.freeze({status,readStatus,ensure,restart,shutdown,revoke,tools,callTool,startDaemonFixed,daemonRole,
    assertStartup:assertRoute,assertIngress,assertTool,
    // Typed command/delivery bindings are private daemon producer methods.
    assertCommand:assertIngress,assertDispatch:assertIngress,
    readiness:()=>Object.freeze({ready:!!read&&!unknown&&!revoked,productionAuthority:!!read&&!unknown&&!revoked,status:status().status})});
  instances.add(runtime);
  return runtime;
}
function assertInitialRuntime(runtime) {
  if (!instances.has(runtime)) fail("owned_initial_private_runtime_required");
  return runtime;
}
module.exports = { SCHEMA, ORIGIN, LOCATOR_KEYS, inspectLocatorEnvironment, createInitialRuntime, assertInitialRuntime };
