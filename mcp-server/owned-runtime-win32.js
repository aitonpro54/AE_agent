"use strict";

const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto"),{spawn}=require("node:child_process");
const {readBytes,safeDirectory}=require("./native-fixture-attempt-ledger");
const POLICY=Object.freeze({
  executable:"C:/Users/Ant/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/powershell/pwsh.exe",
  executableSha256:"362a356ce7f0940ec74f73a8fc2c990a2cc24a38a11c90bbd8eca947110ad139",
  helper:path.resolve(__dirname,"../scripts/owned-runtime-win32-helper.ps1"),
  helperSha256:"945ef885a9c8eecbc2ddf3076cc4762d2a4789b64c3153f12abee8c7f5236ed4"
});
const hash=b=>crypto.createHash("sha256").update(b).digest("hex");
function fail(code) {throw Object.assign(Error(code),{code});}
function validateIdentity(p) {
  if(!p || Object.keys(p).sort().join(",")!=="birthFileTime,birthUtc,executableSha256,imagePath,pid" || !Number.isSafeInteger(p.pid) || p.pid<1 || p.pid>2147483647 ||
    typeof p.birthFileTime!=="string" || !/^[0-9]{17,19}$/.test(p.birthFileTime) || typeof p.birthUtc!=="string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{7}Z$/.test(p.birthUtc) ||
    typeof p.imagePath!=="string" || !path.win32.isAbsolute(p.imagePath) || p.imagePath.includes("\0") || !/^[a-f0-9]{64}$/.test(p.executableSha256 || ""))fail("owned_process_identity_invalid");
  const ticks=BigInt(p.birthFileTime)-116444736000000000n,ms=ticks/10000n,fraction=String((ticks%10000000n+10000000n)%10000000n).padStart(7,"0");
  if(ticks<0n || new Date(Number(ms)).toISOString().replace(/\.\d{3}Z$/,"."+fraction+"Z")!==p.birthUtc)fail("owned_process_birth_not_lossless");
  return Object.freeze({...p});
}
function verifyPolicy() {
  if(process.platform!=="win32")fail("owned_runtime_windows_only");
  for(const [file,pin] of [[POLICY.executable,POLICY.executableSha256],[POLICY.helper,POLICY.helperSha256]]) {
    safeDirectory(path.dirname(file));if(hash(readBytes(file))!==pin)fail("owned_native_source_pin_changed");
  }
}
function spawnFixedHelper() {
  verifyPolicy();
  const env={...process.env};for(const key of Object.keys(env))if(/^(AE_BRIDGE_.*TOKEN|AE_BRIDGE_DEV_ADMIN|AE_M100_ALLOW_DIRECT_TOOL_EXECUTION)$/i.test(key))delete env[key];
  return spawn(POLICY.executable,["-NoLogo","-NoProfile","-NonInteractive","-MTA","-File",POLICY.helper],{windowsHide:true,env,stdio:["pipe","pipe","pipe"]});
}
function createWin32Backend() {
  return Object.freeze({async open(expected,protectedProcesses,{mode="inspect",authority}={}) {
    expected=validateIdentity(expected);
    if(!["inspect","close"].includes(mode) || !Array.isArray(protectedProcesses) || !authority || Object.keys(authority).sort().join(",")!=="expiresAt,generation,profilePath,profileRawSha256,runId,stageId" || typeof authority.profilePath!=="string" || !/^[a-f0-9]{64}$/.test(authority.profileRawSha256 || ""))fail("owned_native_open_contract");
    protectedProcesses=protectedProcesses.map(validateIdentity);
    if(protectedProcesses.some(p=>p.pid===expected.pid))fail("owned_protected_process");
    const child=spawnFixedHelper();let buffer="",pending=null,dead=false,disposing=false;
    child.stdout.setEncoding("utf8");child.stdout.on("data",chunk=>{
      buffer+=chunk;if(buffer.length>65536){dead=true;if(pending)pending.reject(Error("owned_native_response_budget"));child.stdin.end();return;}
      let newline;while((newline=buffer.indexOf("\n"))>=0){const line=buffer.slice(0,newline).replace(/^\uFEFF/,"").trim();buffer=buffer.slice(newline+1);if(!line)continue;
        const p=pending;pending=null;if(!p){dead=true;child.stdin.end();continue;}
        try{const row=JSON.parse(line);if(row?.ok!==true)throw Object.assign(Error(/^owned_[a-z0-9_]+$/.test(row?.code || "")?row.code:"owned_native_api_refused"),{code:row?.code});p.resolve(row);}catch(e){dead=true;child.stdin.end();p.reject(e);}
      }
    });
    // Native stderr may contain private image paths. Only bounded codes escape.
    child.stderr.resume();child.on("error",()=>{dead=true;if(pending){pending.reject(Error("owned_native_helper_failed"));pending=null;}});
    const exited=new Promise(resolve=>child.on("close",()=>{dead=true;if(pending){pending.reject(Error("owned_native_transport_unknown"));pending=null;}resolve();}));
    async function rpc(row) {
      if(dead || pending || disposing && row.op!=="dispose")fail("owned_native_session_unavailable");
      const result=new Promise((resolve,reject)=>{pending={resolve,reject};});
      const timer=setTimeout(()=>{dead=true;if(pending){pending.reject(Error("owned_native_transport_unknown"));pending=null;}child.stdin.end();},(row.milliseconds || 0)+20000);
      try{child.stdin.write(JSON.stringify(row)+"\n");return await result;}finally{clearTimeout(timer);}
    }
    try {
      const opened=await rpc({op:"open",identity:expected,protected:protectedProcesses,mode,authority});
      const observed=validateIdentity(opened.identity);
      if(Object.keys(expected).some(k=>k==="imagePath"?observed[k].toLowerCase()!==expected[k].toLowerCase():observed[k]!==expected[k]))fail("owned_native_open_identity_mismatch");
      return Object.freeze({identity:expected,initialWait:opened.wait,
        async inspect(){return rpc({op:"inspect"});},
        async graceful(hwnd){if(mode!=="close" || typeof hwnd!=="string" || !/^-?\d+$/.test(hwnd))fail("owned_native_effect_contract");return rpc({op:"graceful",hwnd});},
        async force(){if(mode!=="close")fail("owned_native_effect_contract");return rpc({op:"force"});},
        async wait(milliseconds){if(!Number.isInteger(milliseconds) || milliseconds<0 || milliseconds>30000)fail("owned_native_wait_budget");return (await rpc({op:"wait",milliseconds})).wait;},
        async dispose(){if(disposing)return;disposing=true;try{if(!dead)await rpc({op:"dispose"});}catch(_){/* No mutation, EOF releases handles. */}finally{child.stdin.end();await exited;}}
      });
    }catch(e){child.stdin.end();await exited;throw e;}
  }});
}
module.exports={createWin32Backend,validateIdentity,POLICY,verifyPolicy,spawnFixedHelper};
