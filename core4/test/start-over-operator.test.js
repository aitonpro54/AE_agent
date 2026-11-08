'use strict';
// Official distribution/CLI and real TEMP install data; no runtime startup,
// native AE actions or production state. Historical packages below are DATA.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawnSync}=require('node:child_process');
const{buildPackage,verifyPackage,runtimeBinding}=require('../tools/package-installable'),{buildStandalone,writeStandalone}=require('../tools/package-standalone-installer'),{planInstall,applyInstall,rollback}=require('../tools/install-core4'),{canonical,hash}=require('../protocol/json'),{checkStartOverOperatorSource}=require('../tools/check-boundaries');
const source=path.resolve(__dirname,'..'),id='10000000-0000-4000-8000-000000000001';let ownerPkg,stdioPkg,bundle;
function fixture(t,model='owner'){
  ownerPkg||=buildPackage(source,'readonly',{runtimeModel:'owner'});stdioPkg||=buildPackage(source,'readonly');const directory=fs.mkdtempSync(path.join(os.tmpdir(),'core4-reset-operator-')),args={nodePath:fs.realpathSync(process.execPath),installRoot:path.join(directory,'AEAgentCore4'),extensionsDir:path.join(directory,'extensions'),configPath:path.join(directory,'config.toml'),machineId:os.hostname()};
  const installed=applyInstall(planInstall({...args,pkg:model==='owner'?ownerPkg:stdioPkg})),d=JSON.parse(fs.readFileSync(installed.descriptorPath));
  t.after(()=>{assert.ok(path.resolve(directory)===directory&&directory.startsWith(path.join(os.tmpdir(),'core4-reset-operator-')));fs.rmSync(directory,{recursive:true});});return{directory,args,d,installed};
}
function run(distribution,expected,f,mode,extra=[]){return spawnSync(process.execPath,[path.join(distribution,'tools/standalone-installer.js'),mode,'--expected-distribution-hash',expected,'--expected-current-package-hash',f.d.packageHash,'--installation',f.installed.descriptorPath,'--operation',id,...extra],{encoding:'utf8',windowsHide:true,timeout:15000});}
function bytes(f){return{descriptor:fs.readFileSync(f.installed.descriptorPath),config:fs.readFileSync(f.args.configPath),client:fs.existsSync(path.join(f.d.installRoot,'core-client.json'))?fs.readFileSync(path.join(f.d.installRoot,'core-client.json')):null};}
function legacyPackage(){
  const value=structuredClone(ownerPkg), contractFile='runtime/owner-contract.json', policyFile='runtime/composition-policy.json';
  const read=file=>JSON.parse(Buffer.from(value.files[file],'base64'));
  const replace=(file,body)=>{const encoded=canonical(body);value.files[file]=Buffer.from(encoded).toString('base64');value.release.hashes[file]=hash(encoded);};
  const contract=read(contractFile), policy=read(policyFile), oldFiles=contract.requiredFiles.slice(0,10), removed=contract.requiredFiles.slice(10);
  for(const file of removed){delete value.files[file];delete value.release.hashes[file];}
  replace(contractFile,{...contract,version:3,requiredFiles:oldFiles});
  replace(policyFile,{...policy,files:policy.files.filter(file=>!removed.includes(file))});
  value.packageHash=hash(value.release);
  return verifyPackage(value);
}
test('start-over-operator JSON lookalikes and weakened source bootstrap never reach reset state or a writer',async()=>{
  await assert.rejects(require('../tools/operate-start-over').operate({mode:'start-over-finish',id}),e=>e.code==='start_over_bootstrap_brand');const text=fs.readFileSync(path.join(source,'tools/operate-start-over.js'),'utf8');assert.equal(checkStartOverOperatorSource(text),true);assert.throws(()=>checkStartOverOperatorSource("require('../runtime/start-over-finisher');\n"+text),/unverified_start_over_import/);assert.throws(()=>checkStartOverOperatorSource(text.replace("const options=require('./standalone-installer').assertStartOverBootstrap(capability);",'const options=capability;')),/start_over_operator_verification_layout/);
});
test('start-over-operator official inspect is read-only and missing finish pin refuses before effects',t=>{
  const f=fixture(t);bundle||=buildStandalone(source,'readonly',{runtimeModel:'owner'});const distribution=path.join(f.directory,'distribution');writeStandalone(distribution,bundle);const before=bytes(f),inspected=run(distribution,bundle.distributionHash,f,'start-over-inspect');assert.equal(inspected.status,0,inspected.stderr);const value=JSON.parse(inspected.stdout);assert.equal(value.phase,'running');assert.equal(value.aeAuthority,false);assert.deepEqual(bytes(f),before);
  const denied=run(distribution,bundle.distributionHash,f,'start-over-finish');assert.equal(denied.status,1);assert.match(denied.stderr,/standalone_usage/);assert.deepEqual(bytes(f),before);
});
test('start-over-operator either initiation route requires an explicit confirmation digest before effects',t=>{
  const f=fixture(t);bundle||=buildStandalone(source,'readonly',{runtimeModel:'owner'});
  const distribution=path.join(f.directory,'distribution');writeStandalone(distribution,bundle);
  const before=bytes(f);
  for(const mode of ['start-over-request','start-over-stopped-request']){
    for(const flags of [[],['--confirm-plan-hash','wrong']]){
      const result=run(distribution,bundle.distributionHash,f,mode,flags);
      assert.equal(result.status,1);assert.match(result.stderr,/standalone_usage/);
    }
  }
  assert.deepEqual(bytes(f),before);
});
test('start-over-operator changed distributed helper is rejected before its first import',t=>{
  const f=fixture(t);bundle||=buildStandalone(source,'readonly',{runtimeModel:'owner'});const distribution=path.join(f.directory,'distribution');writeStandalone(distribution,bundle);const marker=path.join(f.directory,'unexpected-import');fs.appendFileSync(path.join(distribution,'tools/operate-start-over.js'),'\nrequire("node:fs").writeFileSync('+JSON.stringify(marker)+',"unexpected");\n');const before=bytes(f),result=run(distribution,bundle.distributionHash,f,'start-over-inspect');assert.equal(result.status,1);assert.match(result.stderr,/standalone_closure_bytes/);assert.equal(fs.existsSync(marker),false);assert.deepEqual(bytes(f),before);
});
test('start-over-operator pending reset blocks planning and a prepared install before credential rotation',t=>{
  const f=fixture(t),plan=planInstall({...f.args,pkg:ownerPkg}),before=bytes(f);fs.writeFileSync(path.join(f.d.stateDir,'runtime-start-over.json'),'malformed-presence-is-a-fence');assert.throws(()=>planInstall({...f.args,pkg:ownerPkg}),/start_over_install_pending/);assert.throws(()=>applyInstall(plan),/start_over_install_pending/);assert.deepEqual(bytes(f),before);assert.equal(fs.existsSync(path.join(f.d.installRoot,'install.lock')),false);
});
test('start-over-operator existing work session refuses stdio/legacy reader and rollback but preserves v4 planning',t=>{
  const f=fixture(t);fs.writeFileSync(path.join(f.d.stateDir,'work-session.json'),'opaque-session-data-for-reader-gate');const before=bytes(f);assert.throws(()=>planInstall({...f.args,pkg:stdioPkg}),/work_session_reader_unsupported/);assert.throws(()=>planInstall({...f.args,pkg:legacyPackage()}),/work_session_reader_unsupported/);assert.doesNotThrow(()=>planInstall({...f.args,pkg:ownerPkg}));assert.deepEqual(bytes(f),before);
  const g=fixture(t,'stdio'),updated=applyInstall(planInstall({...g.args,pkg:ownerPkg}));fs.writeFileSync(path.join(g.d.stateDir,'work-session.json'),'owned-test-session');const snapshot=fs.readFileSync(updated.descriptorPath);assert.throws(()=>rollback(updated.transactionFile),/work_session_reader_unsupported/);assert.deepEqual(fs.readFileSync(updated.descriptorPath),snapshot);
});
test('start-over-operator closed v3 metadata remains readable as data but cannot carry an undeclared reset cluster',t=>{
  fixture(t);const legacy=legacyPackage(),binding=runtimeBinding(legacy.release,f=>Buffer.from(legacy.files[f],'base64'));assert.equal(binding.version,3);assert.equal(binding.requiredFiles.length,10);const file='runtime/work-session.js';legacy.files[file]=ownerPkg.files[file];legacy.release.hashes[file]=ownerPkg.release.hashes[file];legacy.packageHash=hash(legacy.release);assert.throws(()=>verifyPackage(legacy),/owner_contract_schema/);
});
