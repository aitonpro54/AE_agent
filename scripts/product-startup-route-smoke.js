"use strict";
// Bounded offline tests: actual modules/VM seams, isolated fake CEP only.
// No production endpoint, installed panel, native addon or AE is touched.
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),os=require("node:os"),vm=require("node:vm");
const {createRequire}=require("node:module"),{AsyncLocalStorage}=require("node:async_hooks");
const {execFileSync}=require("node:child_process");
const deployment=require("../mcp-server/deployment-mode"),serviceApi=require("../mcp-server/owned-runtime-service");
const root=path.resolve(__dirname,".."),cases=[];
async function check(name,fn){await fn();cases.push(name);}
function load(relative,env,stubs={}){
  const filename=path.join(root,relative),module={exports:{}},actual=createRequire(filename);
  const context=vm.createContext({module,exports:module.exports,__dirname:path.dirname(filename),__filename:filename,
    Buffer,URL,Promise,setTimeout,clearTimeout,process:{env,argv:[]},
    require:name=>Object.hasOwn(stubs,name)?stubs[name]:name==="./deployment-mode"?{deploymentMode:()=>deployment.deploymentMode(env,[])}:actual(name)});
  vm.runInContext(fs.readFileSync(filename,"utf8"),context,{filename});return {api:module.exports,context};
}
function retainedService(){return serviceApi.createOwnedRuntimeService({journalRoot:os.tmpdir(),readAdmission:()=>false,readPolicy:()=>({}),readReadiness:()=>({})});}
async function main(){
  await check("product_default_and_explicit_configuration",()=>{
    assert.equal(deployment.deploymentMode({},[]),"product");assert.equal(deployment.deploymentMode({AE_AGENT_DEPLOYMENT_MODE:"product"},[]),"product");
    assert.equal(deployment.deploymentMode({AE_AGENT_DEPLOYMENT_MODE:"initial-owned"},[]),"initial-owned");
    for(const value of ["", "unknown", "initial_owned"])assert.throws(()=>deployment.deploymentMode({AE_AGENT_DEPLOYMENT_MODE:value},[]),{code:"owned_deployment_mode_invalid"});
    assert.throws(()=>deployment.deploymentMode({ae_agent_deployment_mode:"product"},[]),{code:"owned_deployment_mode_invalid"});
    assert.throws(()=>deployment.deploymentMode({AE_AGENT_LOCAL_SESSION_PIPE:"partial"},[]),{code:"owned_deployment_explicit_initial_owned_required"});
  });
  await check("existing_experimental_directory_does_not_select_product_transport",()=>{
    const existingFs={...fs,existsSync:()=>true};
    const native=load("mcp-server/owned-runtime-initial-native-client.js",{}, {"node:fs":existingFs}).api;
    assert.equal(native.selectedFixed(),false);
    const initial=load("mcp-server/owned-runtime-initial-runtime.js",{}, {"./owned-runtime-initial-native-client":{selectedFixed:()=>{throw Error("directory_selection_must_not_run");}}}).api;
    assert.equal(initial.createInitialRuntime(),null);
  });
  await check("product_startup_preserves_existing_lifecycle_unknown_guard",()=>{
    const tmp=fs.mkdtempSync(path.join(os.tmpdir(),"ae-product-startup-"));
    try{const supervisor=require("../mcp-server/owned-runtime-supervisor");assert.equal(supervisor.assertStartupReservation(tmp,{}).managed,false);
      const base=require("../mcp-server/owned-runtime-authority").base(tmp);fs.mkdirSync(base,{recursive:true});fs.writeFileSync(path.join(base,"current-daemon.json"),"unknown");
      assert.throws(()=>supervisor.assertStartupReservation(tmp,{}),{code:"owned_supervisor_unreserved_startup_refused"});
    }finally{fs.rmSync(tmp,{recursive:true,force:true});}
  });
  await check("product_selector_does_not_release_managed_retained_write_admission",()=>{
    const source=fs.readFileSync(path.join(root,"mcp-server/owned-runtime-supervisor.js"),"utf8"),from=source.indexOf("function assertStartupReservation("),to=source.indexOf("function registerCurrentDaemon(",from);
    const reservation={value:{generation:"generation",bootNonce:"boot",command:{argv:[]},sourceSha256:"source"}},context=vm.createContext({
      require:()=>({createInitialRuntime:()=>null,startupMode:()=>false}),uuid:()=>true,readRow:()=>reservation,validateReservation:value=>value,
      validateStartupTicket(){},authority:{loadPolicy:()=>({assertUnchanged(){}})},credential(){},sourceStable(){},same:()=>true,
      fail:code=>{throw Error(code);},Number});
    vm.runInContext(source.slice(from,to),context);
    const startup=context.assertStartupReservation("offline",{generation:"generation",bootNonce:"boot",pid:1,argv:[],sourceSha256:"source"});
    assert.equal(startup.managed,true);assert.equal(startup.requiresRetainedAdoption,true);
  });
  await check("existing_http_host_origin_and_credential_boundary_stays_closed",()=>{
    const boundary=require("../mcp-server/http-boundary").createBoundary({automation:"offline-auto",panel:"offline-panel"});
    for(const headers of [{host:"attacker.invalid"},{host:"127.0.0.1",origin:"https://attacker.invalid"}])assert.throws(()=>boundary.validate({headers}),{status:403});
    assert.equal(boundary.role({headers:{"x-ae-bridge-token":"invalid"}}),null);
    assert.equal(boundary.role({headers:{"x-ae-bridge-token":"offline-panel"}}),"panel");
    assert.equal(boundary.role({headers:{"x-ae-bridge-token":"offline-auto"}}),"automation");
  });
  await check("actual_helper_ast_rejects_config_mode_overlay_before_native_launch",()=>{
    const helper=path.join(root,"scripts/owned-runtime-daemon-helper.ps1").replace(/'/g,"''");
    const ps=`$ErrorActionPreference='Stop';$errors=$null;$tokens=$null;$ast=[Management.Automation.Language.Parser]::ParseFile('${helper}',[ref]$tokens,[ref]$errors);if($errors.Count){throw 'parse_failure'};$fn=$ast.Find({param($n)$n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -ceq 'AssertProductDeployment'},$true);Invoke-Expression $fn.Extent.Text;if((AssertProductDeployment @{}) -cne 'product'){throw 'default_failure'};if((AssertProductDeployment @{AE_AGENT_DEPLOYMENT_MODE='product'}) -cne 'product'){throw 'explicit_failure'};$count=0;foreach($v in @(@{AE_AGENT_DEPLOYMENT_MODE='initial-owned'},@{AE_AGENT_DEPLOYMENT_MODE='unknown'},@{AE_AGENT_DEPLOYMENT_MODE=''},@{ae_agent_deployment_mode='product'},@{AE_AGENT_LOCAL_SESSION_PIPE='partial'},@{AE_AGENT_TRUSTED_READ_TEST='x'})){try{AssertProductDeployment $v;throw 'unexpected_acceptance'}catch{if($_.Exception.Message -cne 'owned_supervisor_deployment_mode_changed'){throw};$count++}};if($count -ne 6){throw 'negative_count'};Write-Output 'helper-mode: PASS (2 positive, 6 failclosed; AST only)'`;
    const output=execFileSync("pwsh",["-NoLogo","-NoProfile","-NonInteractive","-Command",ps],{encoding:"utf8",windowsHide:true,timeout:10000});assert.match(output,/helper-mode: PASS/);
  });
  for(const reason of ["owned_initial_fixed_installation_incomplete","owned_initial_partial_installation","owned_initial_original_unknown_no_replay"]){
    await check("explicit_owned_"+reason+"_has_no_product_fallback",async()=>{
      let factories=0,http=0;const env={AE_AGENT_DEPLOYMENT_MODE:"initial-owned"};
      const initial=load("mcp-server/owned-runtime-initial-runtime.js",env,{
        "./owned-runtime-initial-native-client":{selectedFixed:()=>true,openControllerFixed(){factories++;throw Object.assign(Error(reason),{code:reason,unknown:true});}},
        "node:http":{request(){http++;throw Error("unexpected_product_fallback");}}
      });
      const runtime=initial.api.createInitialRuntime(),args=vm.runInContext("({})",initial.context);
      assert(runtime);await assert.rejects(runtime.ensure(args),{code:reason});await assert.rejects(runtime.ensure(args),/unknown/);
      assert.equal(factories,1);assert.equal(http,0);assert.equal(runtime.status().replayAllowed,false);
    });
  }
  await check("closed_fixture_admission_allows_only_named_bootstrap_project_read",async()=>{
    const service=retainedService();let reads=0;
    assert.throws(()=>service.run("execution",()=>{}),/retained_admission_closed/);
    assert.throws(()=>service.run("bootstrap",()=>{}),/ticket_kind_invalid/);
    await service.runBootstrap(async()=>{
      assert.equal(service.status().activeTickets,1);assert.throws(()=>service.assertExecutionTicket(),/bootstrap_execution_forbidden/);
      assert.throws(()=>service.assertCommandTicket(),/bootstrap_project_read_required/);
      assert.throws(()=>service.run("observation",()=>{}),/bootstrap_scope_required/);
      await service.runBootstrapProjectRead(async()=>{service.assertCommandTicket();reads++;assert.throws(()=>service.assertExecutionTicket(),/bootstrap_execution_forbidden/);});
    });
    assert.equal(reads,1);assert.equal(service.status().activeTickets,0);assert.equal(service.status().writeAdmission,"retained_audit_and_fresh_adoption_required");
    assert.throws(()=>service.runBootstrapProjectRead(()=>{}),/bootstrap_ticket_required/);
    assert.throws(()=>service.run("execution",()=>{}),/retained_admission_closed/);
  });
  await check("daemon_bootstrap_ticket_requires_private_official_marker_and_internal_read",async()=>{
    const service=retainedService(),source=fs.readFileSync(path.join(root,"mcp-server/bridge-daemon.js"),"utf8");
    const from=source.indexOf("function callToolLogged("),to=source.indexOf("async function callToolLoggedImpl(",from);
    const context=vm.createContext({deploymentMode:"product",initialRuntime:null,ownedRuntimeService:service,
      panelBootstrap:{TOOL_NAME:"ensure_ae_agent_panel"},PANEL_BOOTSTRAP_AUTHORITY:Symbol("private"),panelBootstrapReadContext:new AsyncLocalStorage(),
      toolResult:(value,isError)=>({value,isError}),toolByName:()=>({annotations:{readOnlyHint:true}}),MUTATING_TOOL_NAMES:new Set(),
      callToolLoggedImpl:async(_source,name)=>name==="ensure_ae_agent_panel"?vm.runInContext('panelBootstrapReadContext.run({},()=>callToolLogged("panel-bootstrap-read","get_project_info",{}))',context):{projectRead:true}});
    vm.runInContext(source.slice(from,to),context);
    const denied=context.callToolLogged("mcp-adapter","ensure_ae_agent_panel",{},{panelBootstrapAuthority:true});assert.equal(denied.value.reason,"official_mcp_adapter_required");
    const allowed=await vm.runInContext('callToolLogged("mcp-adapter","ensure_ae_agent_panel",{},{panelBootstrapAuthority:PANEL_BOOTSTRAP_AUTHORITY})',context);
    assert.equal(allowed.projectRead,true);assert.equal(service.status().writeAdmission,"retained_audit_and_fresh_adoption_required");
  });
  await check("actual_isolated_http_router_auth_marker_mutation_and_project_read",async()=>{
    const {startDaemon,pollPanel,completeProjectInfoCommand,pause}=require("./network-test-fixture");
    const fixture=await startDaemon({automationToken:"product-route-offline-auto",panelToken:"product-route-offline-panel",commandTimeoutMs:400});
    try{
      const body={name:"ensure_ae_agent_panel",arguments:{timeoutMs:1000}},marker={"x-ae-mcp-adapter":"codex-stdio-v1"};
      for(const test of [
        {status:401}, {token:fixture.panelToken,status:403}, {token:fixture.automationToken,headers:{},status:403},
        {token:fixture.automationToken,headers:{...marker,host:"attacker.invalid"},status:403},
        {token:fixture.automationToken,headers:{...marker,origin:"https://attacker.invalid"},status:403}
      ]){const result=await fixture.request({path:"/mcp/tools/call",body,headers:marker,...test});assert.equal(result.status,test.status);}
      const denied=await fixture.request({path:"/mcp/tools/call",token:fixture.automationToken,headers:marker,body:{name:"create_comp",arguments:{name:"Must Not Exist"}}});
      assert.equal(denied.status,200);assert.match(JSON.stringify(denied.body),/proposal_required/);
      let health=await fixture.request({path:"/health"});assert.equal(health.body.pending,0);assert.equal(health.body.inflight,0);
      await pollPanel(fixture,{projectFile:"C:/Synthetic/Unchanged.aep"});
      const reading=fixture.request({path:"/mcp/tools/call",token:fixture.automationToken,headers:marker,body});
      let command;for(let i=0;i<60;i++){const next=await pollPanel(fixture,{projectFile:"C:/Synthetic/Unchanged.aep"});if(next.body.command){command=next.body.command;break;}await pause(5);}
      assert(command,"actual bootstrap router must queue its fixed project read");await completeProjectInfoCommand(fixture,command);
      const result=await reading;assert.equal(result.status,200);const payload=JSON.parse(result.body.result.content[0].text);assert.equal(payload.status,"already_connected");assert.equal(payload.projectInfo.numItems,1);
      health=await fixture.request({path:"/health"});assert.equal(health.body.pending,0);assert.equal(health.body.inflight,0);
    }finally{await fixture.stop();assert(fixture.child.exitCode!==null || fixture.child.signalCode!==null,"known isolated daemon exit required");assert.equal(fs.existsSync(fixture.runtimeDir),false);}
  });
  process.stdout.write(JSON.stringify({ok:true,cases,offline:true,httpFixture:"actual isolated router and fake CEP read",nativeAddon:false,liveAe:false})+"\n");
}
main().catch(error=>{process.stderr.write(error.stack+"\n");process.exitCode=1;});
