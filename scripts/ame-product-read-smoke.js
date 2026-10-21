"use strict";
const assert=require("node:assert/strict"),crypto=require("node:crypto"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const {createProductReadDispatch}=require("../mcp-server/ame-product-read-dispatch"),ame=require("../mcp-server/ame-title-jobs");
(async()=>{
  let product=true,sends=0,checks=0;
  const port=createProductReadDispatch({assertProduct:()=>product,dispatch:async()=>{sends++;return {read:true};}});
  const script=ame.commandScript({operation:"sources",requestNonce:crypto.randomUUID()}),metadata={schema:"ae-agent-ame-title-dispatch.v2",operation:"sources",mutating:false,scriptSha25664:crypto.createHash("sha256").update(script).digest("hex")};
  const cap=port.authorize(metadata);assert.deepEqual(await port.dispatch(cap,script,30000,metadata),{read:true});checks++;
  await assert.rejects(port.dispatch(cap,script,30000,metadata),/capability_required/);checks++;
  const changed=port.authorize(metadata);await assert.rejects(port.dispatch(changed,script+" ",30000,metadata),/script_changed/);checks++;
  for(const value of [{...metadata,mutating:true},{...metadata,operation:"enqueue"},{...metadata,operation:"start"},{...metadata,operation:"unknown"}]){assert.throws(()=>port.authorize(value),/read_only_required/);checks++;}
  const stale=port.authorize(metadata);product=false;await assert.rejects(port.dispatch(stale,script,30000,metadata),/provenance_required/);checks++;
  assert.equal(sends,1);
  const source=fs.readFileSync(path.join(__dirname,"../mcp-server/bridge-daemon.js"),"utf8");
  const start=source.indexOf("if (!dryRun && lifecycleStep && (autonomous || allowWithoutCheckpoint))"),end=source.indexOf("\n  if (lifecycleStep && !options._m100ActionRecord)",start);assert(start>0 && end>start);
  const gate=source.slice(start,end);
  for(const dryRun of [true,false]){const context={dryRun,lifecycleStep:true,autonomous:{},allowWithoutCheckpoint:false,run:{},finishRun:()=>"blocked"};const value=vm.runInNewContext("(function(){"+gate+";return 'continue';})()",context);assert.equal(value,dryRun?"continue":"blocked");if(!dryRun)assert.equal(context.run.errorCode,"lifecycle_manual_only");checks++;}
  assert(source.includes('const dryRun = optionalBoolean(options, "dryRun", true);'),"dryRun stays a strict normalized boolean");
  console.log(JSON.stringify({ok:true,checks,evidence:"actual private read port and lifecycle execution gate; send count1; no live AE/AME effects"}));
})().catch(error=>{console.error(error);process.exitCode=1;});
