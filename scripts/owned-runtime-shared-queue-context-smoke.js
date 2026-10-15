"use strict";
const assert=require("node:assert/strict");
const {createSharedQueueContextGuard}=require("../mcp-server/owned-runtime-initial-shared-queue-context");
async function main(){
  let original=true;
  const guard=createSharedQueueContextGuard({assertOriginal:()=>original});
  const make=()=>({source:"owned-native-shared-queue",autonomous:true,confirm:true,allowWithoutCheckpoint:false,stepCount:1,
    runId:"run",outerArgs:{ownedTitleProgram:{operation:"enqueue",slot:1}},checkpoint:{sourceFile:"original.aep"},
    record:{executionState:"executing",executionId:"run",actionId:"a",revision:1,payloadHash:"p",previewHash:"v",dryRunReceipt:{id:"d"},confirmedAt:"now"}});
  const context=make();assert.throws(()=>guard.assertContext(context));
  await guard.run(context,async()=>{assert.equal(guard.assertContext(context),true);await Promise.resolve();assert.equal(guard.assertContext(context),true);
    assert.throws(()=>guard.assertContext({...context}));context.record.revision++;assert.throws(()=>guard.assertContext(context));context.record.revision--;
    original=false;assert.throws(()=>guard.assertContext(context));original=true;assert.equal(guard.assertContext(context),true);});
  assert.throws(()=>guard.assertContext(context));await assert.rejects(()=>guard.run(context,()=>{}));
  await assert.rejects(()=>guard.run({...make(),autonomous:false},()=>{}));
  await guard.run(make(),async c=>{c.checkpoint.sourceFile="foreign.aep";assert.throws(()=>guard.assertContext(c));});
  const asyncGuard=createSharedQueueContextGuard({assertOriginal:()=>Promise.resolve(true)});await assert.rejects(()=>asyncGuard.run(make(),()=>{}));
  process.stdout.write("owned-runtime shared queue context: PASS (private provenance, async lifetime, pins/revision drift, no manual spoof/replay)\n");
}
main().catch(error=>{process.stderr.write(error.stack+"\n");process.exitCode=1;});
