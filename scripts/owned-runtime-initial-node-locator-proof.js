"use strict";

// Exercise the private production predicates without loading native code or
// opening an inspector session. An optional sealed-input JSON covers its URLs.
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const source=fs.readFileSync(path.join(__dirname,"../mcp-server/owned-runtime-initial-observers.js"),"utf8");
const context={module:{exports:{}},Buffer,require(name){
  if(name==="./owned-runtime-initial-native-client")return Object.freeze({});
  if(name==="node:inspector")return Object.freeze({Session(){throw Error("offline_inspector_forbidden");}});
  if(name==="node:http")return Object.freeze({});
  if(name==="node:crypto"||name==="node:url")return require(name);
  throw Error("offline_dependency_refused:"+name);
}};
vm.createContext(context);vm.runInContext(source,context,{filename:"owned-runtime-initial-observers.js"});
const canonicalUrl=vm.runInContext("canonicalUrl",context),validateScript=vm.runInContext("validateScript",context);
function refused(operation,code){assert.throws(operation,error=>error.code===code);}

// This exact camelCase builtin was selector 253 of the failing sealed v11
// inventory. Builtin identity stays case-sensitive after grammar admission.
const builtin="node:internal/readline/emitKeypressEvents";
assert.equal(canonicalUrl(builtin),builtin);
assert.equal(canonicalUrl("node:inspector"),"node:inspector");
assert.equal(canonicalUrl("node:internal/deps/Undici/Parser"),"node:internal/deps/Undici/Parser");
assert.equal(canonicalUrl("evalmachine.<anonymous>"),"evalmachine.<anonymous>");
assert.equal(canonicalUrl("C:/Reviewed/Entry.js"),"c:\\reviewed\\entry.js");
assert.equal(canonicalUrl("file:///C:/Reviewed/Entry.js"),"c:\\reviewed\\entry.js");
const volume="\\\\?\\Volume{c3c972fd-0862-442d-9c16-be619b003f4d}\\Reviewed\\Entry.js";
assert.equal(canonicalUrl(volume),volume.toLowerCase());
for(const value of ["NODE:inspector","node:internal/readline/emitKeypressEvents?x","node:internal/Évents","node:internal/emit.js",
  "https://example.test/Entry.js","relative/Entry.js","\\\\server\\share\\Entry.js"])
  refused(()=>canonicalUrl(value),"owned_initial_loaded_script_locator_refused");
refused(()=>canonicalUrl("node:internal\0"),"owned_initial_loaded_script_url_refused");

const digest="a".repeat(64),item={url:builtin,category:"NODE_DEFAULT",contextSlot:"DEFAULT",endLine:0,endColumn:1,length:1,compiledSha256:digest};
const info={scriptId:"253",url:builtin,executionContextId:1,hasSourceURL:false,isModule:false,isLiveEdit:false,scriptLanguage:"JavaScript",
  startLine:0,startColumn:0,endLine:0,endColumn:1,length:1,hash:digest,sourceMapURL:"",embedderName:builtin,executionContextAuxData:{isDefault:true},
  stackTrace:{callFrames:[{functionName:"post",scriptId:"2",url:"node:inspector",lineNumber:138,columnNumber:21}]}};
validateScript(info,item);
refused(()=>validateScript({...info,url:builtin.toLowerCase(),embedderName:builtin.toLowerCase()},item),"owned_initial_loaded_script_metadata_refused");
refused(()=>validateScript({...info,hash:"b".repeat(64)},item),"owned_initial_loaded_script_metadata_refused");
refused(()=>validateScript({...info,executionContextAuxData:{isDefault:false}},item),"owned_initial_loaded_script_context_presence_refused");

let sealedRows=0;
if(process.argv[2]){
  const input=JSON.parse(fs.readFileSync(process.argv[2],"utf8"));
  assert.ok(Array.isArray(input.trustedRead?.nodeSources)&&input.trustedRead.nodeSources.length);
  const seen=new Set();
  for(const row of input.trustedRead.nodeSources){const key=canonicalUrl(row.url);assert.ok(!seen.has(key),"duplicate canonical sealed URL");seen.add(key);sealedRows++;}
  assert.ok(seen.has(builtin),"regression builtin absent from sealed inventory");
}
console.log(JSON.stringify({ok:true,proof:"owned-initial-node-locator",nativeFactories:0,inspectorSessions:0,sealedRows}));
