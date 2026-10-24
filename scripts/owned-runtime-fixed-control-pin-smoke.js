"use strict";

// Actual authority/control modules, source reads and in-process sentinels only.
// No config read, native factory, HTTP request, CLI, daemon or AE operation.
const assert=require("node:assert/strict"),path=require("node:path"),os=require("node:os"),fs=require("node:fs");
const childProcess=require("node:child_process"),effects={nativeFactories:0,httpRequests:0,processStarts:0},originalSpawn=childProcess.spawn;
childProcess.spawn=()=>{effects.processStarts++;throw Error("offline_process_start_forbidden");};
const ledger=require("../mcp-server/native-fixture-attempt-ledger");
const authority=require("../mcp-server/owned-runtime-authority");
const native=require("../mcp-server/owned-runtime-win32"),http=require("node:http");
const root=path.resolve("C:/Users/Ant/Documents/Codex/AE_agent"),controlPath=path.join(root,"scripts","owned-runtime-control.js");
const expected="0a4d820bc89ed7d7212e7bcbdfc79d7b4cda1b91deaa453fae187014d2162acb";
const cases=[],originalRead=ledger.readBytes,originalNative=native.createWin32Backend,originalHttp=http.request,originalFileRead=fs.readFileSync;
const originalAutomation=process.env.AE_BRIDGE_TOKEN,originalPanel=process.env.AE_BRIDGE_PANEL_TOKEN;
function check(name,fn){fn();cases.push(name);}
try{
  native.createWin32Backend=()=>{effects.nativeFactories++;throw Error("offline_native_factory_forbidden");};
  http.request=()=>{effects.httpRequests++;throw Error("offline_http_forbidden");};
  const reviewed=originalRead(controlPath);let control;
  check("actual_runtime_root_accepts_reviewed_exact_raw_bytes",()=>{
    assert.equal(ledger.hash(reviewed),expected);
    control=authority.runtimeControlFor(root);
    assert.equal(control,require(controlPath));assert.equal(typeof control.credential,"function");assert.equal(typeof control.request,"function");
  });
  for(const [name,tampered] of [["content",Buffer.concat([reviewed,Buffer.from("\n// offline tamper")])],["raw_line_endings",Buffer.from(reviewed.toString("utf8").replace(/\n/g,"\r\n"))]]){
    check(name+"_tamper_rejected_even_after_module_is_cached",()=>{
      let reads=0;ledger.readBytes=file=>{assert.equal(path.resolve(file),controlPath);reads++;return tampered;};
      try{assert.throws(()=>authority.runtimeControlFor(root),{code:"owned_runtime_fixed_control_source_changed"});assert.equal(reads,1);}
      finally{ledger.readBytes=originalRead;}
    });
  }
  check("foreign_root_cannot_redirect_fixed_control_module",()=>{
    ledger.readBytes=()=>{throw Error("unexpected_caller_root_read");};
    try{assert.equal(authority.runtimeControlFor(path.join(os.tmpdir(),"untrusted-control-root")),control);}
    finally{ledger.readBytes=originalRead;}
  });
  check("fixed_reader_parser_has_no_environment_credential_fallback",()=>{
    process.env.AE_BRIDGE_TOKEN="offline-ambient-automation";process.env.AE_BRIDGE_PANEL_TOKEN="offline-ambient-panel";
    assert.throws(()=>control.parseCredentialConfig(""),{code:"owned_fixed_config_required"});
    const fake='[mcp_servers."after-effects".env]\nAE_BRIDGE_TOKEN = "offline-explicit-automation"\nAE_BRIDGE_PANEL_TOKEN = "offline-explicit-panel"\n';
    assert.equal(control.parseCredentialConfig(fake),"offline-explicit-automation");
  });
  check("actual_win32_policy_accepts_reviewed_helper_and_fixed_executable",()=>{
    assert.equal(native.POLICY.helperSha256,"945ef885a9c8eecbc2ddf3076cc4762d2a4789b64c3153f12abee8c7f5236ed4");
    assert.equal(ledger.hash(originalRead(native.POLICY.helper)),native.POLICY.helperSha256);native.verifyPolicy();
  });
  check("actual_win32_policy_rejects_helper_raw_byte_tamper",()=>{
    const helper=originalRead(native.POLICY.helper),tampered=Buffer.from(helper);tampered[0]^=1;let intercepted=0;
    fs.readFileSync=(file,...args)=>{if(path.resolve(String(file))===path.resolve(native.POLICY.helper)){intercepted++;return tampered;}return originalFileRead(file,...args);};
    try{assert.throws(()=>native.verifyPolicy(),{code:"owned_native_source_pin_changed"});assert.equal(intercepted,1);}
    finally{fs.readFileSync=originalFileRead;}
  });
  check("actual_supervisor_policy_matches_transitive_helper_bytes",()=>{
    const supervisor=require("../mcp-server/owned-runtime-supervisor");
    assert.equal(supervisor.verifyNodePolicy(),true);
    assert.equal(ledger.hash(originalRead(supervisor.POLICY.helper)),supervisor.POLICY.helperSha256);
  });
  assert.deepEqual(effects,{nativeFactories:0,httpRequests:0,processStarts:0});
  assert.equal(ledger.hash(originalRead(controlPath)),expected);
  process.stdout.write(JSON.stringify({ok:true,cases,scope:"offline actual module",rawSourceSha256:expected,...effects,cliRuns:0,configReads:0,liveAe:false})+"\n");
}finally{
  ledger.readBytes=originalRead;native.createWin32Backend=originalNative;http.request=originalHttp;fs.readFileSync=originalFileRead;childProcess.spawn=originalSpawn;
  for(const [key,value] of [["AE_BRIDGE_TOKEN",originalAutomation],["AE_BRIDGE_PANEL_TOKEN",originalPanel]]){if(value===undefined)delete process.env[key];else process.env[key]=value;}
}
