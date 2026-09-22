"use strict";
// Bounded M7 evidence helper. No providers and no implicit AE mutations.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const cp = require("child_process");
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, ".codex-runtime", "m7-synthetic-live-20260922");
function hash(buffer) { return crypto.createHash("sha256").update(buffer).digest("hex"); }
function save(name, value) {
  fs.mkdirSync(OUT, {recursive:true});
  fs.writeFileSync(path.join(OUT,name), JSON.stringify(value,null,2)+"\n");
  return value;
}
async function panel(action) {
  const pages = await (await fetch("http://127.0.0.1:8870/json/list")).json();
  const targets = pages.filter(p=>String(p.url).includes("/com.codex.aemcpbridge/index.html"));
  if(targets.length!==1) throw Error("Expected exactly one AE Agent panel");
  const ws = new WebSocket(targets[0].webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
  let seq=0;const pending=new Map();
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}};
  const send=(method,params={})=>Promise.race([new Promise(resolve=>{const id=++seq;pending.set(id,resolve);ws.send(JSON.stringify({id,method,params}));}),new Promise((_,reject)=>{const t=setTimeout(()=>reject(Error("CDP timeout; no retry")),15000);t.unref();})]);
  const evaluate=async expression=>{const r=await send("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});if(r.error||r.result.exceptionDetails)throw Error("CDP evaluation failed");return r.result.result.value;};
  try { return await action({send,evaluate}); } finally { ws.close(); }
}
async function main() {
  const mode=process.argv[2];
  if(mode==="baseline") {
    for(const dir of ["projects","checkpoints","evidence","runtime-backup"]) fs.mkdirSync(path.join(OUT,dir),{recursive:true});
    const git=args=>cp.execFileSync("git",args,{cwd:ROOT,maxBuffer:32*1024*1024});
    const diff=git(["diff","--binary"]);
    fs.writeFileSync(path.join(OUT,"initial-dirty.patch"),diff);
    const files=git(["ls-files","-m","-o","--exclude-standard","-z"]).toString().split("\0").filter(Boolean);
    console.log(JSON.stringify(save("baseline.json",{at:new Date().toISOString(),head:git(["rev-parse","HEAD"]).toString().trim(),status:git(["status","--short"]).toString(),diffSha256:hash(diff),files:files.filter(f=>fs.statSync(path.join(ROOT,f)).isFile()).map(file=>({file,sha256:hash(fs.readFileSync(path.join(ROOT,file)))}))}),null,2));
  } else if(mode==="state") {
    const state=await panel(({evaluate})=>evaluate(`(function(){var ids=['status','badge','bridgeHelp','autonomousSessionStatus','planRunStatus','usageStatusList'];var o={title:document.title,fields:{},tokenPresent:!!document.getElementById('bridgeToken').value};ids.forEach(function(id){var e=document.getElementById(id);o.fields[id]=e?e.innerText:null;});return o;})()`));
    console.log(JSON.stringify(save("evidence/panel-state-"+Date.now()+".json",state),null,2));
  } else if(mode==="ae-preflight") {
    // Typed bridge is disconnected: narrow read-only CSInterface inspection gap.
    const source="(function(){var p=app.project;return JSON.stringify({aeVersion:app.version,hasFile:!!(p&&p.file),dirty:p?!!p.dirty:null,numItems:p?p.numItems:0,syntheticNamed:!!(p&&p.file&&/^CODX_M7_SYNTH_/.test(p.file.name))});})()";
    const state=await panel(({evaluate})=>evaluate("new Promise(function(resolve){new CSInterface().evalScript("+JSON.stringify(source)+",function(v){resolve(v);});})"));
    console.log(JSON.stringify(save("evidence/ae-preflight.json",JSON.parse(state)),null,2));
  } else if(mode==="offline") {
    const commands=[
      ["--check","scripts/m7-synthetic-live.cjs"],
      ["scripts/clean-current-check.js"],
      ["scripts/frozen-intake-guard.js"],
      ["scripts/property-identity-smoke.js"],
      ["scripts/run-boundary-smoke.js"],
      ["scripts/persistent-autonomy-smoke.js"],
      ["scripts/persistent-autonomy-bridge-smoke.js"],
      ["scripts/autonomy-revocation-smoke.js"],
      ["scripts/panel-heartbeat-smoke.js"],
      ["scripts/hardcore-authority-smoke.js"],
      ["scripts/usage-panel-smoke.js"]
    ];
    const results=[];
    for(const args of commands) {
      const started=Date.now();
      const r=cp.spawnSync(process.execPath,args,{cwd:ROOT,encoding:"utf8",timeout:90000,maxBuffer:4*1024*1024,windowsHide:true});
      const record={command:"node "+args.join(" "),exit:r.status,signal:r.signal,error:r.error?r.error.message:null,seconds:(Date.now()-started)/1000,stdout:r.stdout,stderr:r.stderr};
      results.push(record);save("evidence/offline.json",results);
      console.log(JSON.stringify({command:record.command,exit:record.exit,error:record.error,seconds:record.seconds}));
    }
    if(results.some(r=>r.exit!==0))process.exitCode=1;
  } else throw Error("Allowed modes: baseline, state, ae-preflight, offline");
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
