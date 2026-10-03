"use strict";
const assert=require("assert/strict");
const {buildProjectLifecyclePlan,validateBuilderInput}=require("../mcp-server/project-lifecycle-plan");
const {normalizeProjectLifecycleState}=require("../mcp-server/project-lifecycle-state");
const sha="a".repeat(64),source="C:/Synthetic/Source.aep",target="C:/Synthetic/Target.aep";
const observation={native:normalizeProjectLifecycleState({projectPresent:true,file:source,dirty:false,revision:7,
  supported:{file:true,dirty:true,revision:true}}),
  sourceFile:{path:source,sha256:sha},targetFile:{path:target,sha256:sha}};
const input={operation:"open_project",targetProjectFile:target,checkpointLabel:"before-open"};
const seen=[];
const result=buildProjectLifecyclePlan(input,observation,(...args)=>seen.push(args));
assert.equal(result.plan.steps.length,1);
assert.equal(result.plan.targetProject.file,source);
assert.equal(result.plan.steps[0].args.expectedSourceRevision,7);
assert.equal(result.plan.steps[0].args.expectedTargetSavedSha25664,sha);
assert.equal(result.projectMutations,0);
assert.equal(seen[0][0],"open_project");
assert.match(result.disclosure,/Undo/);
for(const bad of [null,[],{...input,phase:"open"},{...input,operation:"render_project"}])
  assert.throws(()=>validateBuilderInput(bad));
for(const native of [{...observation.native,dirty:null},{...observation.native,revision:null},
  {...observation.native,lifecycleReady:false},{...observation.native,project:"unnamed"}])
  assert.throws(()=>buildProjectLifecyclePlan(input,{...observation,native},()=>{}),e=>e.code==="native_lifecycle_not_ready");
assert.throws(()=>buildProjectLifecyclePlan(input,{...observation,native:{...observation.native,dirty:true}},()=>{}),
  e=>e.code==="lifecycle_clean_source_required");
assert.throws(()=>buildProjectLifecyclePlan(input,{...observation,sourceFile:{path:target,sha256:sha}},()=>{}));
assert.throws(()=>buildProjectLifecyclePlan(input,{...observation,targetFile:null},()=>{}));
const save=buildProjectLifecyclePlan({...input,operation:"save_project_as"},
  {...observation,native:{...observation.native,dirty:true}},()=>{});
assert.equal(save.plan.steps[0].args.expectedSourceDirty,true);
console.log("lifecycle plan: PASS; server observations, exact source binding, clean open/create, one terminal action.");
