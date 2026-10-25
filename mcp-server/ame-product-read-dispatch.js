"use strict";
const crypto=require("node:crypto");
const {stableStringify}=require("./m100-protocol");
const READS=new Set(["sources","status","queue","shared_status"]);
function fail(code){throw Object.assign(Error(code),{code});}
// Private adapter for the existing typed AME executor. It issues no write rights.
function createProductReadDispatch({assertProduct,dispatch}){
  const caps=new WeakMap();
  function current(){if(assertProduct()!==true)fail("ame_product_provenance_required");}
  function assertRead(metadata){
    current();
    if(!metadata || metadata.schema!=="ae-agent-ame-title-dispatch.v2" || metadata.mutating!==false || !READS.has(metadata.operation) || !/^[a-f0-9]{64}$/.test(metadata.scriptSha25664 || ""))fail("ame_product_read_only_required");
  }
  function authorize(metadata,context){
    assertRead(metadata);const cap=Object.freeze({});caps.set(cap,{metadata:stableStringify(metadata),context,used:false});return cap;
  }
  function assertAuthorization(cap,metadata,context){
    const row=caps.get(cap);if(!row || row.used || row.context!==context || row.metadata!==stableStringify(metadata))fail("ame_product_read_capability_required");assertRead(metadata);return true;
  }
  async function send(cap,script,timeout,metadata,context){
    assertAuthorization(cap,metadata,context);
    if(crypto.createHash("sha256").update(script).digest("hex")!==metadata.scriptSha25664)fail("ame_product_read_script_changed");
    caps.get(cap).used=true;
    return dispatch(script,timeout,metadata);
  }
  return Object.freeze({authorize,assertAuthorization,dispatch:send});
}
module.exports={createProductReadDispatch};
