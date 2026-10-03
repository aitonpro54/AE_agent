"use strict";
const assert=require("assert/strict"),fs=require("fs");
const crypto=require("crypto");
const t=require("../mcp-server/project-lifecycle-transition"),m=require("../mcp-server/project-intent-memory");
const {fixture}=require("./project-lifecycle-fixture");
async function main() {
  for(const enabled of [true,false]) {
    const f=fixture();
    try {
      f.setNativeHook(data=>{if(data.when==="after" && data.facts.phase==="save_stage")throw new Error("injected interruption");});
      await assert.rejects(f.service.execute("save_project_as",f.args(),f.context));
      const store=f.storage.load();assert(store.pendingLifecycle && store.pendingLifecycle.status==="unknown");
      store.schema=m.PROJECT_STATE_SCHEMA;
      assert.throws(()=>m.validateProjectStateStore(store),/lifecycle_schema_downgrade/);
      assert.throws(()=>t.validateV2Store(store),/lifecycle_schema_downgrade/);
      fs.writeFileSync(f.statePath,JSON.stringify(store));
      const restarted=t.createLifecycleStorage({statePath:f.statePath,enabled});
      assert.throws(()=>restarted.assertMutationAllowed(),e=>e.code==="lifecycle_store_corrupt");
      assert.equal(restarted.pendingProjection().blocked,true);
    } finally {f.dispose();}
  }
  const f=fixture({enabled:false});
  try {
    assert.doesNotThrow(()=>f.storage.assertMutationAllowed());
    const genuine=f.storage.load();assert.equal(genuine.schema,m.PROJECT_STATE_SCHEMA);
    assert.doesNotThrow(()=>m.validateProjectStateStore(genuine));
    for(const key of ["pendingLifecycle","lifecycleGeneration","lifecycleReceipts"]) {
      const bad={...genuine,[key]:key==="pendingLifecycle"?null:key==="lifecycleGeneration"?0:[]};
      assert.throws(()=>m.validateProjectStateStore(bad),/lifecycle_schema_downgrade/);
      fs.writeFileSync(f.statePath,JSON.stringify(bad));
      assert(t.guardSnapshot({statePath:f.statePath,enabled:false}).problem);
      assert.throws(()=>f.storage.assertMutationAllowed());
      fs.writeFileSync(f.statePath,JSON.stringify(genuine));
    }
    assert.doesNotThrow(()=>f.storage.assertMutationAllowed());
  } finally {f.dispose();}
  const state={inheritedOwnership:[{owner:crypto.randomUUID(),itemIds:[2],sourceKey:"a".repeat(64),transitionId:crypto.randomUUID(),proofValidity:"invalid"}]};
  for(const tool of ["run_extendscript","run_extendscript_file","unknown_mutator"]) {
    const checked=m.checkInheritedOwnershipSteps({state,steps:[{tool,args:{expectedCompItemId:999,script:"app.project.item(2).name='changed'"}}]});
    assert.equal(checked.ok,false,"A decoy ID must not make a raw/unknown footprint safe");
  }
  assert.equal(m.checkInheritedOwnershipSteps({state,steps:[{tool:"set_layer_transform",args:{expectedCompItemId:999}}]}).ok,true);
  assert.equal(m.checkInheritedOwnershipSteps({state,steps:[{tool:"set_layer_transform",args:{expectedCompItemId:2}}]}).ok,false);
  assert.equal(m.checkInheritedOwnershipSteps({state,steps:[{tool:"save_current_named_project",args:{}}]}).ok,true,"Named persistence does not mutate item ownership; its own manual file gates still apply");
  console.log("lifecycle review regressions: PASS; unknown pending survives V1 downgrade, ON/OFF and absent marker fail closed, genuine V1 preserved.");
}
main().catch(e=>{console.error(e);process.exitCode=1;});
