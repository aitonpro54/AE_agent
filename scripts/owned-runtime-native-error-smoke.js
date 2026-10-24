"use strict";

// Only isolated PowerShell function evaluation and invented exceptions. The
// helper main loop, native process APIs, runtime and applications never run.
const assert=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os"),path=require("node:path"),{spawnSync}=require("node:child_process");
const supervisor=require("../mcp-server/owned-runtime-supervisor"),win=require("../mcp-server/owned-runtime-win32");
async function main(){
  let passed=0;
  const details={operation:"open-owned",kind:"win32",win32Error:87,hresult:-2147467259};
  const error=supervisor.nativeFailure({code:"owned_supervisor_native_refused",nativeError:{...details,message:"private-secret",path:"C:/private"}});
  assert.equal(error.code,"owned_supervisor_native_refused");assert.deepEqual(error.nativeError,details);passed++;
  for(const value of [{...details,operation:"C:/private"},{...details,kind:"private-secret"},{...details,hresult:NaN},{...details,win32Error:-1},{...details,win32Error:"87"}]){assert.equal(supervisor.nativeErrorDetails(value),null);passed++;}
  assert.equal(supervisor.nativeFailure({code:"private-secret"}).message,"owned_supervisor_native_refused");passed++;
  const result=await require("../mcp-server/mcp-adapter").handleOwnedRuntimeTool("ensure_owned_runtime_daemon",{},{async ensure(){throw error;}});
  const reply=JSON.parse(result.content[0].text);assert.equal(result.isError,true);assert.deepEqual(reply.nativeError,details);assert.equal(reply.replayAllowed,false);assert.equal(JSON.stringify(reply).includes("private-secret"),false);passed++;
  if(process.platform!=="win32")throw Error("Windows PowerShell function parity required");
  const parent=path.resolve(os.tmpdir()),root=fs.mkdtempSync(path.join(parent,"owned-native-error-"));
  try{
    const file=path.join(root,"function-only.ps1"),helper=supervisor.POLICY.helper.replace(/'/g,"''");
    fs.writeFileSync(file,`$ErrorActionPreference='Stop'
$errors=$null;$tokens=$null;$ast=[Management.Automation.Language.Parser]::ParseFile('${helper}',[ref]$tokens,[ref]$errors)
if($errors.Count){throw 'offline_helper_parse_failed'}
$fn=$ast.Find({param($n)$n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -ceq 'NativeFailure'},$true)
if(!$fn){throw 'offline_function_missing'};Invoke-Expression $fn.Extent.Text
$rows=@()
$rows+=@(NativeFailure ([ComponentModel.Win32Exception]::new(87)) 'open-owned')
$rows+=@(NativeFailure ([InvalidOperationException]::new('wrapper',[ComponentModel.Win32Exception]::new(5))) 'open-owned')
$rows+=@(NativeFailure ([IO.IOException]::new('private-secret C:/private')) 'private-secret')
$rows+=@(NativeFailure ([InvalidOperationException]::new('owned_supervisor_candidate_authentication')) 'open-owned')
$rows|ConvertTo-Json -Depth 6 -Compress
`,"utf8");
    const child=spawnSync(win.POLICY.executable,["-NoLogo","-NoProfile","-NonInteractive","-File",file],{cwd:root,windowsHide:true,encoding:"utf8",timeout:15000,maxBuffer:65536});
    assert.equal(child.error,undefined);assert.equal(child.status,0,child.stderr);const rows=JSON.parse(child.stdout.replace(/^\uFEFF/,""));assert.equal(rows.length,4);
    for(const [i,code] of [[0,87],[1,5]]){assert.equal(rows[i].code,"owned_supervisor_native_refused");assert.equal(rows[i].nativeError.win32Error,code);assert.equal(rows[i].nativeError.kind,"win32");assert.deepEqual(supervisor.nativeFailure(rows[i]).nativeError,supervisor.nativeErrorDetails(rows[i].nativeError));passed++;}
    assert.equal(rows[2].nativeError.operation,"unknown");assert.equal(rows[2].nativeError.kind,"system");assert.equal(rows[3].code,"owned_supervisor_candidate_authentication");assert.equal(rows[3].nativeError.kind,"contract");assert.equal(JSON.stringify(rows).includes("private-secret"),false);passed+=2;
  }finally{assert.equal(path.dirname(path.resolve(root)),parent);assert.match(path.basename(root),/^owned-native-error-/);fs.rmSync(root,{recursive:true});}
  process.stdout.write(JSON.stringify({ok:true,passed,offline:true,nativeHelperMain:false,liveProof:false})+"\n");
}
if(require.main===module)main().catch(error=>{process.stderr.write(error.stack+"\n");process.exitCode=1;});
module.exports={main};
