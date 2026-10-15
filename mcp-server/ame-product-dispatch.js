"use strict";
const crypto=require("node:crypto");
const {stableStringify}=require("./m100-protocol");
const jobs=require("./ame-title-jobs");
function fail(code){throw Object.assign(Error(code),{code});}
// Adapter for the existing runner and AME executor; no public grants or ledger.
function createProductDispatch({assertProduct,assertContext,assertSavedSource,dispatch}) {
  const preparations=new WeakMap(),caps=new WeakMap();
  function current(context){if(assertProduct()!==true)fail("ame_product_provenance_required");assertContext(context);}
  function prepare(selector,context,operation){
    current(context);
    const name=operation==="enqueue"?jobs.ENQUEUE:jobs.START;
    if(selector?.schema!=="ae-agent-ame-title-reservation-selector.v1" || selector.operation!==operation ||
       selector.argsHash!==jobs.operationArgsHash(name,context.args))fail("ame_product_selector_changed");
    if(operation==="enqueue" && (typeof assertSavedSource!=="function" || assertSavedSource(selector)!==true))fail("ame_product_saved_source_required");
    const cap=Object.freeze({});preparations.set(cap,{context,selector:stableStringify(selector),processBinding:selector.processBinding,operation,guarded:false,used:false});return cap;
  }
  function assertPreparation(cap,selector,context){
    current(context);const row=preparations.get(cap);
    if(!row || row.context!==context || row.selector!==stableStringify(selector))fail("ame_product_preparation_required");
    if(row.operation==="enqueue")assertSavedSource(selector);
    row.guarded=true;return true;
  }
  function validate(metadata,context,preparation){
    current(context);const row=preparations.get(preparation);
    if(!metadata || metadata.schema!=="ae-agent-ame-title-dispatch.v2" || metadata.mutating!==true ||
       !row || !row.guarded || row.used || row.context!==context || row.operation!==metadata.operation || row.processBinding!==metadata.processBinding ||
       metadata.batchId!==context.args.batchId || metadata.targetSpecifier!==context.args.targetSpecifier ||
       stableStringify(metadata.expectedProcess)!==stableStringify(context.args.expectedProcess) ||
       !/^[a-f0-9]{64}$/.test(metadata.scriptSha25664 || ""))fail("ame_product_dispatch_binding_changed");
  }
  function authorize(metadata,context,preparation){validate(metadata,context,preparation);const cap=Object.freeze({});caps.set(cap,{context,preparation,metadata:stableStringify(metadata),used:false});return cap;}
  function assertAuthorization(cap,metadata,context){
    const row=caps.get(cap);if(!row || row.used || row.context!==context || row.metadata!==stableStringify(metadata))fail("ame_product_dispatch_capability_required");
    validate(metadata,context,row.preparation);return true;
  }
  async function send(cap,script,timeout,metadata,context){
    assertAuthorization(cap,metadata,context);
    if(crypto.createHash("sha256").update(script).digest("hex")!==metadata.scriptSha25664)fail("ame_product_dispatch_script_changed");
    const row=caps.get(cap);row.used=true;preparations.get(row.preparation).used=true;return dispatch(script,timeout,metadata);
  }
  function usesSavedSource(cap,context){const row=preparations.get(cap);if(!row || row.context!==context || row.operation!=="enqueue")fail("ame_product_preparation_required");assertPreparation(cap,JSON.parse(row.selector),context);return true;}
  return Object.freeze({prepareEnqueue:(s,c)=>prepare(s,c,"enqueue"),prepareStart:(s,c)=>prepare(s,c,"start"),assertPreparation,authorize,assertAuthorization,dispatch:send,usesSavedSource});
}
module.exports={createProductDispatch};
