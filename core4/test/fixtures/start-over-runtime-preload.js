'use strict';
// Isolated TEMP syscall fixture, never shipped. Canonical3457 is represented
// by a real ephemeral listener; native Node identity stays real, AE is synthetic.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),Module=require('node:module'),cp=require('node:child_process');
const at=process.argv.indexOf('--installation'),descriptor=at>=0&&process.argv[at+1];
if(!descriptor||!path.isAbsolute(descriptor))throw Error('fixture_descriptor');
const d=JSON.parse(fs.readFileSync(descriptor)),directory=path.dirname(d.installRoot),config=JSON.parse(fs.readFileSync(path.join(directory,'reset-fixture.json')));
if(directory!==config.directory||d.installRoot!==path.join(directory,'AEAgentCore4')||!directory.startsWith(path.join(os.tmpdir(),'core4-reset-runtime-')))throw Error('fixture_scope');
const stop=path.join(directory,'fixture-stop'),events=path.join(directory,'fixture-events.ndjson');
const watcher=setInterval(()=>{if(fs.existsSync(stop))process.exit(97);},25);watcher.unref();
const originalLoad=Module._load,originalSpawn=cp.spawn,originalListen=http.Server.prototype.listen,originalAddress=http.Server.prototype.address,originalEmit=http.Server.prototype.emit,originalRename=fs.renameSync;let serial=0;
cp.spawn=function(executable,args,options){
  if(executable===d.nodePath&&args[0]===path.join(d.releaseDir,'runtime/owner-entry.js')&&args[1]==='--installation'&&args[2]===descriptor){
    if(options.windowsHide!==true||options.detached!==true||options.stdio!=='ignore'||options.shell!==false||options.env.NODE_OPTIONS!==undefined)throw Error('fixture_restart_contract');
    return originalSpawn(executable,['--require',__filename,...args],options);
  }
  return originalSpawn(executable,args,options);
};
Module._load=function(request,parent,isMain){
  const result=originalLoad.call(this,request,parent,isMain),filename=Module._resolveFilename(request,parent,isMain);
  if(filename!==path.join(d.releaseDir,'runtime/start-over-process.js'))return result;
  return{...result,async observeStartOverInventory(){return{version:1,machineId:d.machineId,observedAt:new Date().toISOString(),processes:[]};},async observeStartOverStop(options){const observed=structuredClone(await result.observeStartOverStop(options));observed.inventory.processes=[];return observed;}};
};
http.Server.prototype.listen=function(...args){
  const selected=typeof args[0]==='number'?args[0]===3457:args[0]?.port===3457;
  if(!selected)return originalListen.apply(this,args);
  args[0]=typeof args[0]==='number'?0:{...args[0],port:0};const cb=args.at(-1),server=this,number=++serial;
  args[args.length-1]=function(){const address=originalAddress.call(server),event={pid:process.pid,port:address.port,serial:number};fs.appendFileSync(events,JSON.stringify(event)+'\n');
    void require('../../runtime/windows-owner-process').observeOwnerProcess(process.pid).then(native=>{fs.appendFileSync(events,JSON.stringify({...event,birthTicks:native.birthTicks})+'\n');});
    cb();
  };return originalListen.apply(this,args);
};
http.Server.prototype.address=function(){const a=originalAddress.call(this);return a&&typeof a==='object'&&a.address==='127.0.0.1'?{...a,port:3457}:a;};
http.Server.prototype.emit=function(event,...args){if(event==='request'){const a=originalAddress.call(this),req=args[0];if(a&&req.headers.host==='127.0.0.1:'+a.port)req.headers.host='127.0.0.1:3457';}return originalEmit.call(this,event,...args);};
fs.renameSync=function(from,to){const result=originalRename(from,to);
  if(config.crashAfterArchive&&from===path.join(d.stateDir,'receiver')&&path.dirname(to).startsWith(path.join(d.installRoot,'transactions')+path.sep)&&path.basename(to)==='archive-receiver'&&!fs.existsSync(path.join(directory,'fixture-crash-spent'))){fs.writeFileSync(path.join(directory,'fixture-crash-spent'),'spent',{flag:'wx'});process.exit(73);}return result;
};
