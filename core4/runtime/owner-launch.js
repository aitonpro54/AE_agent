'use strict';
// Trusted full-installation restart only. The thin client keeps its separate
// control-only bootstrap and never imports/reads this full-role context.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const{canonical,fail}=require('../protocol/json');
async function launchInstalledOwner(options){
  if(!options||Object.getPrototypeOf(options)!==Object.prototype||Object.keys(options).sort().join(',')!=='descriptorPath,installation')fail('owner_restart_options');
  const d=Object.freeze(structuredClone(options.installation)),descriptorPath=options.descriptorPath;
  if(canonical(require('./installation').verifyInstallation(descriptorPath))!==canonical(d)||fs.realpathSync(path.resolve(__dirname,'..'))!==d.releaseDir)fail('owner_restart_installation');
  const bytes=fs.readFileSync(descriptorPath),entry=path.join(d.releaseDir,'runtime/owner-entry.js');
  const env=Object.create(null);
  for(const key of ['PATH','HOMEDRIVE','HOMEPATH','LOGONSERVER','SYSTEMDRIVE','USERDOMAIN','USERNAME','USERPROFILE','NODE_V8_COVERAGE'])env[key]='';
  for(const key of ['SystemRoot','WINDIR','TEMP','TMP']){const value=process.env[key];if(typeof value==='string'&&path.isAbsolute(value)&&!value.includes('\0'))env[key]=value;}
  await new Promise(resolve=>setImmediate(resolve));
  if(!fs.readFileSync(descriptorPath).equals(bytes))fail('owner_restart_installation');
  return new Promise((resolve,reject)=>{
    let child;try{child=spawn(d.nodePath,[entry,'--installation',descriptorPath],{shell:false,windowsHide:true,detached:true,stdio:'ignore',cwd:d.releaseDir,env});}
    catch{reject(Object.assign(Error('owner_restart_failed'),{code:'owner_restart_failed'}));return;}
    child.once('error',()=>reject(Object.assign(Error('owner_restart_failed'),{code:'owner_restart_failed'})));
    child.once('spawn',()=>{try{child.unref();resolve(Object.freeze({launched:true,pid:child.pid,packageHash:d.packageHash}));}catch{reject(Object.assign(Error('owner_restart_failed'),{code:'owner_restart_failed'}));}});
  });
}
module.exports={launchInstalledOwner};
