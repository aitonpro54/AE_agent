"use strict";

// Windows kernel contract for one disposable, naturally exiting test child.
// Uses the runner's actual C# definition; no AE/AME, grants, fixture roots or UI.
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),Module=require("node:module");
const {execFile}=require("node:child_process"),ledger=require("../mcp-server/native-fixture-attempt-ledger");
const source=path.resolve(__dirname,"../mcp-server/ame-native-fixture-runner.js");
const harness=new Module(source,module);harness.filename=source;harness.paths=Module._nodeModulePaths(path.dirname(source));
harness._compile(fs.readFileSync(source,"utf8")+"\nmodule.exports={KERNEL_PROCESS_SETUP};",source);
const setup=harness.exports.KERNEL_PROCESS_SETUP;
const executable=path.join(process.env.SystemRoot || "C:\\Windows","System32","WindowsPowerShell","v1.0","powershell.exe");
const childCommand=Buffer.from("Start-Sleep -Milliseconds 2000; exit 259","utf16le").toString("base64");
const script=["$ErrorActionPreference='Stop'",setup,
  "$p=Start-Process -FilePath $env:AE_AGENT_KERNEL_HARNESS_POWERSHELL -ArgumentList @('-NoProfile','-NonInteractive','-EncodedCommand','"+childCommand+"') -WindowStyle Hidden -PassThru",
  "try {$h=$p.Handle; $opened=[DateTimeOffset]::UtcNow; $identity=[FixtureKernelProcess]::ReadIdentity($h); $verified=[DateTimeOffset]::UtcNow",
  "if([FixtureKernelProcess]::WaitForSingleObject($h,0) -ne 258){throw 'owned_child_not_alive'}",
  "$aliveRejected=$false; try{[FixtureKernelProcess]::ReadExitCode($h) | Out-Null}catch{$aliveRejected=$true}; if(!$aliveRejected){throw 'alive_handle_accepted'}",
  "if([FixtureKernelProcess]::WaitForSingleObject($h,10000) -ne 0){throw 'owned_child_exit_unknown'}",
  "$code=[FixtureKernelProcess]::ReadExitCode($h); if($code -ne 259){throw 'owned_child_terminal_code_changed'}",
  "@{process=$identity;aliveHandleRejected=$aliveRejected;proof=@{kind='held_process_handle_signaled';handleOpenedAt=$opened.ToString('o');identityVerifiedAt=$verified.ToString('o');observedAt=[DateTimeOffset]::UtcNow.ToString('o');waitResult='WAIT_OBJECT_0';exitCode=$code}} | ConvertTo-Json -Depth 4 -Compress",
  "}finally{$p.Dispose()}"].join(";\n");
async function main() {
  assert.equal(process.platform,"win32","own-child kernel smoke requires Windows");
  const out=await new Promise((resolve,reject)=>execFile(executable,["-NoProfile","-NonInteractive","-Command",script],
    {windowsHide:true,timeout:15000,maxBuffer:16384,encoding:"utf8",env:{...process.env,AE_AGENT_KERNEL_HARNESS_POWERSHELL:executable}},
    (error,stdout)=>error ? reject(Error("kernel_harness_failed")) : resolve(stdout)));
  const observed=JSON.parse(out.replace(/^\uFEFF/,"").trim()),p=observed.process;
  assert.equal(p.path.toLowerCase(),executable.toLowerCase());assert.equal(observed.aliveHandleRejected,true);
  const ticks=BigInt(p.createdFileTime)-116444736000000000n,ms=Number(ticks/10000n);
  const exact=new Date(ms).toISOString().slice(0,-5)+"."+(ticks%10000000n).toString().padStart(7,"0")+"Z";
  assert.equal(p.createdUnixMs,ms);assert.equal(p.createdAt,exact);
  const proof={schema:"ae-agent.native-fixture-retirement-proof.v1",process:p,proof:observed.proof,nativeExecutionProven:false};
  ledger.validateRetirement(proof,p);assert.equal(proof.proof.exitCode,259);
  const unsignaled={...proof,proof:{...proof.proof,waitResult:"WAIT_TIMEOUT"}};
  assert.throws(()=>ledger.validateRetirement(unsignaled,p),/positive_exit_proof_required/);
  const reused={...p,createdAt:exact.replace(/(\d)Z$/,(_,last)=>((Number(last)+1)%10)+"Z")};
  assert.throws(()=>ledger.validateRetirement(proof,reused),/positive_exit_proof_required/);
  process.stdout.write(JSON.stringify({status:"passed",scope:"own_windows_harness_child",aeAmeAccess:false,
    full100nsLossless:true,aliveHandleRejected:true,signaledHeldHandle:true,terminalExitCode:259,retirementAdmissionReleased:false})+"\n");
}
main().catch(error=>{process.stderr.write(JSON.stringify({status:"failed",scope:"own_windows_harness_child",error:error.stack})+"\n");process.exitCode=1;});
