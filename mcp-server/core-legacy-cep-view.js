"use strict";
// Fixed read-only projection of SHARED legacy effects. The explicitly retired
// availability operation is excluded before stat/read/index validation. Its
// presence, bytes, status and index entry never become Core readiness facts.
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const life=require("./owned-runtime-lifecycle"),control=require("./cep-panel-control"),contract=require("../cep-panel/panel-action-contract");
const SOURCE=path.resolve("C:/Users/Ant/Documents/Codex/AE_agent"),SCHEMA="ae-agent.core-legacy-cep-view.v1",EXCLUDED=contract.LEGACY_RESERVED_REQUEST_IDS[0];
const hash=b=>crypto.createHash("sha256").update(typeof b==="string"||Buffer.isBuffer(b)?b:life.canonical(b)).digest("hex"),same=(a,b)=>life.canonical(a)===life.canonical(b);
function fail(code){throw Object.assign(Error(code),{code});}
function plain(file){for(let q=path.resolve(file);;q=path.dirname(q)){if(fs.existsSync(q)&&(fs.lstatSync(q).isSymbolicLink()||fs.realpathSync(q).toLowerCase()!==q.toLowerCase()))fail("core_migration_legacy_cep_alias");if(q===path.dirname(q))break;}}
function identity(s){return Object.fromEntries(["dev","ino","size","mtimeNs","ctimeNs"].map(k=>[k,String(s[k])]));}
function file(file){plain(file);const s=fs.lstatSync(file,{bigint:true});if(!s.isFile()||s.nlink!==1n||s.size>1048576n)fail("core_migration_legacy_cep_file_invalid");const bytes=fs.readFileSync(file);return {bytes,row:{path:file,kind:"file",objectId:identity(s),rawSha256:hash(bytes)}};}
function decode(bytes){try{return JSON.parse(bytes);}catch(_){fail("core_migration_legacy_cep_json_corrupt");}}
function validIdentity(v){if(!v||typeof v!=="object"||Array.isArray(v)||Object.keys(v).some(k=>!["action","signature","binding"].includes(k))||typeof v.action!=="string"||!contract.getStoredActionDefinition(v.action)&&v.action!=="recovery.bootstrap"||!/^([a-f0-9]{64})$/.test(v.signature||""))return false;if(Object.hasOwn(v,"binding")){const b=v.binding;if(!b||typeof b!=="object"||Array.isArray(b)||Object.keys(b).sort().join(",")!=="panelGeneration,panelInstanceId,panelLifecycleEpoch"||typeof b.panelInstanceId!=="string"||!b.panelInstanceId||typeof b.panelGeneration!=="string"||!b.panelGeneration||!Number.isSafeInteger(b.panelLifecycleEpoch)||b.panelLifecycleEpoch<0)return false;}return true;}
function capture(root=SOURCE){
  if(path.resolve(root)!==SOURCE)fail("core_migration_legacy_cep_fixed_root");const directory=path.join(root,"logs/cep-panel-control"),side=path.join(directory,"client-attestation"),files=[],records=[];
  function names(dir,sidecar=false){plain(dir);if(!fs.existsSync(dir))return [];if(!fs.lstatSync(dir).isDirectory())fail("core_migration_legacy_cep_directory_required");const all=fs.readdirSync(dir).filter(n=>n!==EXCLUDED+".json"&&(sidecar||!["identities.json","initialized.json"].includes(n))).sort();if(all.length>1000||all.some(n=>!sidecar&&n==="client-attestation"?false:!contract.UUID_REGEX.test(n.slice(0,-5))||!n.endsWith(".json")))fail("core_migration_legacy_cep_namespace_unrecognized");return all;}
  const rootNames=names(directory),sideNames=rootNames.includes("client-attestation")?names(side,true):[];
  const receipts=rootNames.filter(n=>n!=="client-attestation"),indexFile=path.join(directory,"identities.json");let identities={};
  if(fs.existsSync(indexFile)){const data=decode(file(indexFile).bytes);if(data?.schema!=="ae-agent.cep-panel-transport.v1"||!data.identities||typeof data.identities!=="object"||Array.isArray(data.identities))fail("core_migration_legacy_cep_index_invalid");for(const id of Object.keys(data.identities).sort()){if(id===EXCLUDED)continue;const row=data.identities[id];if(!contract.UUID_REGEX.test(id)||!validIdentity(row))fail("core_migration_legacy_cep_index_invalid");identities[id]=row;}}
  if(!same(Object.keys(identities).sort(),receipts.map(n=>n.slice(0,-5)).sort()))fail("core_migration_legacy_cep_index_projection_mismatch");
  for(const name of receipts){const p=file(path.join(directory,name)),id=name.slice(0,-5),row=decode(p.bytes);control.validateStoredReceipt(row,id,identities[id]);const semantic=control.cutoverReceiptSemantics(row);if(semantic==="protected_outstanding")fail("core_migration_legacy_shared_effect_unresolved");files.push(p.row);records.push(row);}
  for(const name of sideNames){const p=file(path.join(side,name));decode(p.bytes);files.push(p.row);}
  // Only current shared-effect classification is persisted. Terminal archive
  // bytes/index/directory names are not startup facts. Every fresh capture
  // still validates descriptors and rejects a protected outstanding effect.
  const value=classificationContract();
  return {value,files:[],records:[],assertUnchanged(){if(!same(capture(root).value,value))fail("core_migration_legacy_cep_projection_changed");}};
}
const descriptors=[...new Set([...contract.STORED_ACTION_NAMES,"recovery.bootstrap"])].sort().map(action=>{const d=contract.getStoredActionDefinition(action);return {action,effect:d?.effect||null,readOnly:d?.confirmationRequired===false&&(d.effect==="bridge_read"||action==="logs.get"&&d.effect==="local_ui")};});
function classificationContract(){return JSON.parse(JSON.stringify({schema:SCHEMA,sourceRoot:SOURCE,activeSharedEffects:[],descriptorSha256:hash(descriptors),descriptors,legacyOperationsReplayAllowed:false}));}
function validate(value){
 const exact=require("./owned-runtime-authority").exact;exact(value,["schema","sourceRoot","activeSharedEffects","descriptorSha256","descriptors","legacyOperationsReplayAllowed"]);if(value.schema!==SCHEMA||value.sourceRoot!==SOURCE||value.legacyOperationsReplayAllowed!==false||!same(value.activeSharedEffects,[])||value.descriptorSha256!==hash(descriptors)||!same(value.descriptors,descriptors))fail("core_migration_legacy_cep_projection_invalid");return value;
}

module.exports={SCHEMA,EXCLUDED,capture,validate,classificationContract};
