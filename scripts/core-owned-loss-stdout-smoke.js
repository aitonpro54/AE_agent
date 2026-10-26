"use strict";
// Real managed pwsh stdout -> production createPipe; no native factory or AE.
const assert=require('node:assert/strict'),path=require('node:path'),{spawn}=require('node:child_process'),{once}=require('node:events');
const {createPipe}=require('../mcp-server/core-owned-loss-native'),win=require('../mcp-server/owned-runtime-win32');
const activeChildren=new Set();
async function fixture(mode='fixed'){
 const child=spawn(win.POLICY.executable,['-NoLogo','-NoProfile','-NonInteractive','-MTA','-File',path.join(__dirname,'core-owned-loss-stdout-fixture.ps1'),'-WireVariant',mode],{windowsHide:true,stdio:['pipe','pipe','pipe']});
 activeChildren.add(child);child.on('close',()=>activeChildren.delete(child));
 let err='',out='',reads=0,stats,closed=false;const timers=[],changed=new (require('node:events').EventEmitter)();
 child.stdout.on('data',v=>{out+=v;});child.stderr.setEncoding('utf8');child.stderr.on('data',v=>{err+=v;for(const line of err.split(/\r?\n/)){const m=/^fixture-read:(\d+)$/.exec(line);if(m)reads=Math.max(reads,+m[1]);if(line.startsWith('fixture-stats:'))stats=JSON.parse(line.slice(14));}changed.emit('change');});child.on('close',()=>{closed=true;changed.emit('change');});
 const pipe=createPipe(child,{setTimer(fn){const t={fn};timers.push(t);return t;},clearTimer(t){t.cleared=true;}}),exit=once(child,'close');
 async function read(n){const deadline=Date.now()+15000;while(reads<n){assert.equal(closed,false,err);assert.ok(Date.now()<deadline,'managed fixture did not reach input boundary: '+err);await new Promise(resolve=>{const done=()=>{clearTimeout(timer);changed.off('change',done);resolve();},timer=setTimeout(done,100);changed.once('change',done);});}}
 await read(1);let request=0;
 return {pipe,timers,child,read,frames:()=>out.trim()?out.trim().split(/\r?\n/).map(JSON.parse):[],async rpc(op){const value=await pipe.rpc(op);if(op!=='dispose-core-loss')await read(++request+1);return value;},async end(){child.stdin.end();const [code]=await exit;assert.equal(code,0,err);assert.ok(stats,err);return stats;}};
}
async function main(){let checks=0;
 const old=await fixture('old-pipeline'),pending=old.pipe.rpc('acquire-core-loss-owner');await old.read(2);assert.deepEqual(old.frames(),[]);old.timers[0].fn();await assert.rejects(pending,/core_loss_native_timeout_owner_retained/);assert.equal(old.pipe.state(),'pending_owner_retained');assert.deepEqual(await old.end(),{starts:0,disposes:0,writes:0});checks++;
 const empty=await fixture();assert.match((await empty.rpc('acquire-core-loss-owner')).sessionId,/^[a-f0-9-]{36}$/);await empty.rpc('assert-core-loss-pair');assert.equal((await empty.rpc('observe-core-loss')).pairHeld,true);await empty.rpc('release-core-loss-owner');await empty.rpc('dispose-core-loss');assert.equal(empty.frames().length,5);assert.equal((await empty.end()).starts,0);checks++;
 const launch=await fixture();await launch.rpc('acquire-core-loss-owner');const started=await launch.rpc('start-core-loss-once');assert.equal(started.identity.pid,123);assert.equal((await launch.rpc('observe-core-loss')).wait.waitResult,'WAIT_TIMEOUT');await launch.rpc('release-core-loss-owner');await launch.rpc('dispose-core-loss');assert.equal(launch.frames().length,5);const ls=await launch.end();assert.equal(ls.starts,1);assert.equal(ls.disposes,2);assert.equal(ls.writes,3);checks++;
 const observer=await fixture();await observer.rpc('capture-core-loss-observer');assert.equal((await observer.rpc('observe-core-loss')).identityVerified,true);await observer.rpc('acquire-core-loss-observer-pair');await observer.rpc('recheck-core-loss-current');await observer.rpc('finish-core-loss-redirect');await observer.rpc('dispose-core-loss');assert.equal(observer.frames().length,6);assert.equal((await observer.end()).starts,0);checks++;
 for(const held of [false,true]){const f=await fixture();await f.rpc('acquire-core-loss-owner');if(held)await f.rpc('start-core-loss-once');await assert.rejects(()=>f.rpc('unsupported-loss-op'),/owned_core_loss_closed_operation/);if(held){await f.read(4);assert.equal((await f.rpc('observe-core-loss')).identityVerified,true);}const s=await f.end();assert.equal(s.starts,held?1:0);assert.equal(f.frames().length,held?4:2);checks++;}
 console.log(JSON.stringify({ok:true,checks,scope:'actual_loss_dispatch_main_loop_emitters_real_stdout_to_production_createPipe',oldPipelineAckFrames:0,fixedAcquireAckFrames:1,maximumManagedStarts:1,nativeCalls:0,liveProof:false}));
}
main().catch(e=>{for(const child of activeChildren)child.stdin.end();console.error(e.stack);process.exitCode=1;});
