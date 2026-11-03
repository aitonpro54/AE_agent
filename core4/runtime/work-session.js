'use strict';
// Private logical work namespace. Neither a session acknowledgement nor its
// initial project baseline grants native AE authority or lifecycle continuity.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {canonical,hash,fail}=require('../protocol/json');
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/,HEX=/^[a-f0-9]{64}$/;
const FIELDS=['dev','ino','size','birthtimeNs','mtimeNs','ctimeNs'],equal=(a,b)=>canonical(a)===canonical(b);
const stamp=s=>Object.fromEntries(FIELDS.map(k=>[k,String(s[k])]));
function exact(v,keys){if(!v||Object.getPrototypeOf(v)!==Object.prototype||!equal(Object.keys(v).sort(),[...keys].sort()))fail('work_session_schema');}
function plain(file,missing=false,directory=false){
  if(!path.isAbsolute(file)||path.resolve(file)!==file)fail('work_session_path');let cursor=path.parse(file).root;const parts=file.slice(cursor.length).split(path.sep).filter(Boolean);
  for(const[i,part]of parts.entries()){cursor=path.join(cursor,part);let s;try{s=fs.lstatSync(cursor,{bigint:true});}catch(e){if(missing&&e.code==='ENOENT')return false;throw e;}if(s.isSymbolicLink()||s.reparsePoint||fs.realpathSync(cursor)!==cursor||(i<parts.length-1||directory?!s.isDirectory():!s.isFile()))fail('work_session_path');}return true;
}
function read(file){
  if(!plain(file,true))return{file,bytes:null,hash:null,stat:null};const before=fs.lstatSync(file,{bigint:true}),fd=fs.openSync(file,'r');let bytes,stat;
  try{const s=fs.fstatSync(fd,{bigint:true});if(!equal(stamp(s),stamp(before))||s.size>131072n)fail('work_session_changed');bytes=Buffer.alloc(Number(s.size));let at=0;while(at<bytes.length){const n=fs.readSync(fd,bytes,at,bytes.length-at,at);if(!n)fail('work_session_changed');at+=n;}if(fs.readSync(fd,Buffer.alloc(1),0,1,at)||!equal(stamp(s),stamp(fs.fstatSync(fd,{bigint:true})))||!plain(file)||!equal(stamp(s),stamp(fs.lstatSync(file,{bigint:true}))))fail('work_session_changed');stat=stamp(s);}finally{fs.closeSync(fd);}return{file,bytes,hash:hash(bytes),stat};
}
function same(a,b){return a.hash===b.hash&&equal(a.stat,b.stat);}
function atomic(file,bytes){
  if(plain(file,true))fail('work_session_destination');plain(path.dirname(file),false,true);const stage=file+'.stage-'+crypto.randomUUID();let fd;
  try{fd=fs.openSync(stage,'wx+');let at=0;while(at<bytes.length){const n=fs.writeSync(fd,bytes,at,bytes.length-at,at);if(!n)fail('work_session_short_write');at+=n;}fs.fsyncSync(fd);const s=stamp(fs.fstatSync(fd,{bigint:true})),candidate=read(stage);if(!candidate.bytes.equals(bytes)||!equal(s,candidate.stat))fail('work_session_changed');fs.linkSync(stage,file);const published=read(file);if(!published.bytes.equals(bytes)||!equal(published.stat,stamp(fs.fstatSync(fd,{bigint:true}))))fail('work_session_changed');fs.unlinkSync(stage);return read(file);}finally{if(fd!==undefined)fs.closeSync(fd);}
}
function createWorkSession(options){
  exact(options,['installation','descriptorPath']);const d=Object.freeze(structuredClone(options.installation)),descriptorPath=options.descriptorPath;
  if(!d||d.machineId!==os.hostname()||descriptorPath!==path.join(d.installRoot,'installation.json')||d.stateDir!==path.join(d.installRoot,'state/production')||!equal(require('./installation').verifyInstallation(descriptorPath),d))fail('work_session_installation');
  const descriptor=read(descriptorPath),currentHash=descriptor.hash,anchors=['origin.json','state/production/origin.json'].map(n=>read(path.join(d.installRoot,n)));
  if(!anchors[0].bytes||!anchors[0].bytes.equals(anchors[1].bytes))fail('work_session_origin');const origin=JSON.parse(anchors[0].bytes);if(origin.installationId!==d.installationId||origin.machineId!==d.machineId)fail('work_session_origin');
  const master=read(path.join(d.stateDir,'work-session.json')),baselinePath=path.join(d.stateDir,'work-session-baseline.json'),keys=new Map([[currentHash,d]]);
  function signer(descriptorHash){
    if(!HEX.test(descriptorHash))fail('work_session_record');if(keys.has(descriptorHash))return keys.get(descriptorHash);
    const resolved=require('./installation-lineage').resolveHistoricalInstallation({descriptorPath,descriptorHash});
    if(!equal(resolved.current,d)||resolved.historical.descriptorHash!==descriptorHash)fail('work_session_lineage');const historical=resolved.historical.descriptor;
    if(historical.installationId!==d.installationId||historical.machineId!==d.machineId||historical.stateDir!==d.stateDir)fail('work_session_lineage');keys.set(descriptorHash,historical);return historical;
  }
  function mac(body){const signed=signer(body.descriptorHash),key=crypto.createHmac('sha256',Buffer.from(signed.panelToken,'hex')).update('ae-core4/start-over-key/v1\0').update(Buffer.from(signed.controlToken,'hex')).digest();return crypto.createHmac('sha256',key).update('ae-core4/start-over-record/v1\0'+canonical(body)).digest('hex');}
  function decode(v,kind,fields){
    if(!v.bytes?.length||!Buffer.from(v.bytes.toString('utf8')).equals(v.bytes))fail('work_session_record');let e;try{e=JSON.parse(v.bytes);}catch{fail('work_session_record');}exact(e,['body','mac']);exact(e.body,['version','kind','installationId','machineId','descriptorHash',...fields]);
    if(e.body.version!==1||e.body.kind!==kind||e.body.installationId!==d.installationId||e.body.machineId!==d.machineId||!HEX.test(e.mac)||!crypto.timingSafeEqual(Buffer.from(mac(e.body),'hex'),Buffer.from(e.mac,'hex'))||!Buffer.from(canonical(e)).equals(v.bytes))fail('work_session_record');return e.body;
  }
  function seal(kind,value){const body={version:1,kind,installationId:d.installationId,machineId:d.machineId,descriptorHash:currentHash,...value};return Buffer.from(canonical({body,mac:mac(body)}));}
  let session=null;
  if(master.bytes){
    session=decode(master,'work-session',['resetId','sessionId','intentHash','baselineRequired']);
    if(!UUID.test(session.resetId)||!UUID.test(session.sessionId)||!HEX.test(session.intentHash)||session.baselineRequired!==true)fail('work_session_record');
    const dir=path.join(d.installRoot,'transactions',session.resetId+'-start-over');plain(dir,false,true);
    const candidate=read(path.join(dir,'session-candidate.json'));if(!same(candidate,master))fail('work_session_alias');
    const completedView=read(path.join(dir,'reset-completed.json')),completed=decode(completedView,'start-over-completed',['id','intentHash','archiveManifestHash','sessionHash','baselineRequired']),enable=decode(read(path.join(dir,'enable-intent.json')),'start-over-enable-intent',['id','intentHash','completedHash']);
    if(completed.descriptorHash!==session.descriptorHash||enable.descriptorHash!==session.descriptorHash||completed.id!==session.resetId||completed.intentHash!==session.intentHash||!HEX.test(completed.archiveManifestHash)||completed.sessionHash!==master.hash||completed.baselineRequired!==true||enable.id!==session.resetId||enable.intentHash!==session.intentHash||enable.completedHash!==completedView.hash)fail('work_session_incomplete');
  }
  function baseline(){
    const v=read(baselinePath);if(!v.bytes)return null;if(!session)fail('work_session_baseline_without_session');
    const b=decode(v,'work-session-baseline',['sessionId','sessionHash','commandId','executorHash','payloadHash','receiverStoreIdentity','observationHash','channelEpoch']);
    if(b.sessionId!==session.sessionId||b.sessionHash!==master.hash||![b.executorHash,b.payloadHash,b.observationHash].every(s=>HEX.test(s))||['commandId','receiverStoreIdentity','channelEpoch'].some(k=>typeof b[k]!=='string'||!b[k]||b[k].length>256))fail('work_session_baseline');return{view:v,body:b};
  }
  baseline();
  function resetPending(){try{fs.lstatSync(path.join(d.stateDir,'runtime-start-over.json'));return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
  function assertFiles(){
    if(!same(read(descriptorPath),descriptor)||!anchors.every(a=>same(read(a.file),a))||!same(read(master.file),master))fail('work_session_changed');
  }
  function status(){
    if(resetPending())return Object.freeze({sessionId:session?.sessionId??null,resetId:session?.resetId??null,mode:session?'work-session':'legacy',baselineRequired:true,resetPending:true,aeAuthority:false});
    assertFiles();return Object.freeze({sessionId:session?.sessionId??null,resetId:session?.resetId??null,mode:session?'work-session':'legacy',baselineRequired:!!session&&!baseline(),resetPending:false,aeAuthority:false});
  }
  function assertCurrent(sessionId){const value=status();if(value.resetPending)fail('work_session_reset_pending');if(sessionId!==value.sessionId)fail('work_session_changed');return value;}
  return Object.freeze({
    status,
    assertCurrent,
    recordProjectBaseline(peer,result){
      const proof=require('../integrations/cep/http-peer').consumeProjectObservation(peer,result);if(!proof)fail('work_session_observation_proof');
      const value=assertCurrent(session?.sessionId??null);if(proof.sessionId!==value.sessionId)fail('work_session_observation_session');
      if(!session)return Object.freeze({recorded:false,legacy:true,aeAuthority:false});if(baseline())return Object.freeze({recorded:false,baselineRequired:false,aeAuthority:false});
      const bytes=seal('work-session-baseline',{sessionId:session.sessionId,sessionHash:master.hash,commandId:proof.commandId,executorHash:proof.executorHash,payloadHash:proof.payloadHash,receiverStoreIdentity:proof.receiverStoreIdentity,observationHash:proof.observationHash,channelEpoch:proof.channelEpoch});
      assertFiles();if(resetPending())fail('work_session_reset_pending');atomic(baselinePath,bytes);assertFiles();if(resetPending())fail('work_session_reset_pending');baseline();
      return Object.freeze({recorded:true,baselineRequired:false,aeAuthority:false});
    }
  });
}
module.exports={createWorkSession};
