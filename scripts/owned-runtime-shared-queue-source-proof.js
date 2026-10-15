"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const root=path.resolve(__dirname,".."),read=file=>fs.readFileSync(path.join(root,file),"utf8");
const base="native/owned-runtime-local-session/",broker=read(base+"owned_shared_queue_broker.inc"),native=read(base+"owned_shared_queue_native.inc"),policy=read(base+"trusted_execution.cpp"),budget=read(base+"trusted_execution_budget.h"),protocol=read(base+"phase_protocol.cpp");
for(const text of [broker,native])for(const forbidden of ["ObserveJobTerminal","ObserveMedia","AcceptOriginalTerminalAndReserveMedia","ffmpeg","ffprobe","runBatch"] )assert.equal(text.includes(forbidden),false,forbidden);
for(const marker of ["SharedQueueQuiescent","sharedQueue->ioSettled","sharedQueue->terminalMask==sharedEnqueueMask","ConfirmOriginalRequestIoSnapshot","trusted_shared_own_terminal_event_not_factual"])assert.ok((broker+native).includes(marker),marker);
assert.ok(native.includes('completion.Field("sourceFilePath").Text()!=own->sourcePath_'));assert.ok(native.includes('completion.Field("outputFilePath").Text()!=own->outputPath_'));assert.ok(native.includes('completion.Field("result").kind==capture::Json::Kind::Null'));
assert.ok(policy.includes("queue&&(!detail::Zero(mediaProducerHash)||!detail::Zero(pngEncoderHash)"));assert.ok(policy.includes("kSharedQueueMaximumPolls"));
for(const name of ["BindSharedQueue","BeginSharedQueuePoll","ObserveSharedQueuePoll","ReadSharedQueueState","AcknowledgeSharedQueueIo"])assert.ok(protocol.includes("{Verb::"+name+","),name);
const body=budget.slice(budget.indexOf("struct FixedSharedQueueCosts"));assert.ok(body.includes("{85,160,192,32,2,16}"));
// One START, two own read-backs + native terminals, ten pair polls; retain the
// original fixed source preparation/READ ceiling and lifecycle reserve.
const sum=(a,b)=>a.map((x,i)=>x+b[i]);let total=[1,32,64,32,0,0];for(const x of [[37,26,26,0,0,0],[35,42,42,0,0,0],[1,2,2,0,0,0]])total=sum(total,x);
for(let slot=0;slot<2;slot++)for(const x of [[1,1,1,0,0,0],[1,2,2,0,0,0],[1,2,2,0,0,0],[1,3,3,0,1,0],[1,2,2,0,0,0]])total=sum(total,x);
total=sum(total,[1,2,2,0,0,0]);for(let i=0;i<10;i++)total=sum(total,[0,2,2,0,0,0]);total=sum(total,[0,16,16,0,0,16]);assert.deepEqual(total,[85,160,192,32,2,16]);
process.stdout.write("owned-runtime shared queue source: PASS (closed native leaves, factual own pair, IO barrier, finite budget; no native execution)\n");
