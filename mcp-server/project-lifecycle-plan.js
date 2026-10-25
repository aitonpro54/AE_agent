"use strict";
const path = require("path");
const NAMES = ["save_project_as", "open_project", "create_named_project"];
const tool = Object.freeze({
  name:"build_project_lifecycle_plan",
  description:"Build one manually confirmed project lifecycle proposal from fresh server-native and disk observations. Reopening resets Undo and active context. No project mutation during build.",
  inputSchema:{type:"object",additionalProperties:false,required:["operation","targetProjectFile","checkpointLabel"],
    properties:{operation:{type:"string",enum:NAMES},targetProjectFile:{type:"string"},checkpointLabel:{type:"string",minLength:1,maxLength:160}}}
});
const recoveryTool = Object.freeze({name:"build_project_lifecycle_recovery_plan",
  description:"Read-only full assessment of an already published Save As after unknown final-open delivery. Builds one fresh manual state-only recovery step; never replays Save/Open/New.",
  inputSchema:{type:"object",additionalProperties:false,required:["transitionId"],properties:{transitionId:{type:"string",format:"uuid"}}}});
function validateRecoveryBuilderInput(input) { return require("./project-lifecycle-contract").validateInput("recover_project_lifecycle",input); }
function buildProjectLifecycleRecoveryPlan(input, assessment) {
  const args=validateRecoveryBuilderInput(input),c=require("./project-lifecycle-contract");
  if (!assessment || assessment.pins?.transitionId!==args.transitionId || !assessment.inventory || !assessment.pending) invalid("lifecycle_recovery_assessment_required");
  const native=c.nativeTuple(assessment.inventory.native);
  if (native.dirty || !c.samePath(native.file,assessment.pending.args.targetProjectFile)) invalid("lifecycle_recovery_final_not_open");
  return {ok:true,previewOnly:true,projectMutations:0,nativeMutations:0,reviewedRecoveryScopeRequired:true,
    disclosure:"Записать final/policy proof уже открытой опубликованной копии и закрыть pending barrier. Исходный Save As остаётся failed/unknown-delivery. Undo и несохранённая память не восстанавливаются; source не открывается, stage/partial файлы не удаляются; artistic acceptance не устанавливается. Требуются проверенный точный recovery scope и новое manual CEP подтверждение после exact dry-run; ранее данное разрешение на этот scope сохраняется.",
    assessment:{transitionId:args.transitionId,pins:assessment.pins,finalNative:native,sourceFile:assessment.pending.sourceBefore.path,targetFile:assessment.pending.targetFile.path},
    plan:{summary:`Подтвердить опубликованную копию: ${path.basename(native.file)}.`,risk:"high",targetProject:{file:native.file},steps:[{tool:"recover_project_lifecycle",args}]}};
}
function invalid(code) { throw Object.assign(new Error(code),{code}); }
function validateBuilderInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input) ||
      Object.keys(input).length!==3 || !NAMES.includes(input.operation) ||
      typeof input.targetProjectFile!=="string" || !input.targetProjectFile ||
      typeof input.checkpointLabel!=="string" || !input.checkpointLabel) invalid("invalid_lifecycle_builder_input");
  return input;
}
function buildProjectLifecyclePlan(input, observation, validateLifecycleInput) {
  validateBuilderInput(input);
  if (typeof validateLifecycleInput!=="function") invalid("lifecycle_contract_unavailable");
  const native=observation && observation.native;
  if (!native || native.project!=="named" || native.lifecycleReady!==true ||
      typeof native.file!=="string" || typeof native.dirty!=="boolean" ||
      !Number.isSafeInteger(native.revision) || native.revision<0) invalid("native_lifecycle_not_ready");
  const file=observation.sourceFile;
  if (!file || file.path!==native.file || typeof file.sha256!=="string" || !/^[a-f0-9]{64}$/.test(file.sha256)) invalid("lifecycle_source_file_unverified");
  if (input.operation!=="save_project_as" && native.dirty) invalid("lifecycle_clean_source_required");
  const args={expectedSourceProjectFile:native.file,expectedSourceSavedSha25664:file.sha256,
    expectedSourceRevision:native.revision,expectedSourceDirty:native.dirty,
    targetProjectFile:input.targetProjectFile,checkpointLabel:input.checkpointLabel};
  if (input.operation==="open_project") {
    const target=observation.targetFile;
    if (!target || target.path!==input.targetProjectFile || typeof target.sha256!=="string" || !/^[a-f0-9]{64}$/.test(target.sha256)) invalid("lifecycle_target_file_unverified");
    args.expectedTargetSavedSha25664=target.sha256;
  }
  validateLifecycleInput(input.operation,args);
  const captions={save_project_as:"Сохранить копию",open_project:"Открыть",create_named_project:"Создать пустой проект"};
  return {ok:true,previewOnly:true,projectMutations:0,
    disclosure:"Переход завершится открытием целевого AEP. Undo и активный контекст изменятся. При неизвестном результате операция не повторяется.",
    plan:{summary:`${captions[input.operation]}: ${path.basename(input.targetProjectFile)}.`,risk:"high",
      targetProject:{file:native.file},steps:[{tool:input.operation,args}]}};
}
module.exports={tool,recoveryTool,NAMES,validateBuilderInput,buildProjectLifecyclePlan,validateRecoveryBuilderInput,buildProjectLifecycleRecoveryPlan};
