"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm"),http=require("node:http");
const source=fs.readFileSync(path.join(__dirname,"../mcp-server/bridge-daemon.js"),"utf8"),begin=source.indexOf("function closeOwnedRuntimeHttpServer(){"),end=source.indexOf("\n}",begin)+2;
assert(begin>=0 && end>begin);
(async()=>{
  let accepted;
  const pending=new Promise(resolve=>{accepted=resolve;}),server=http.createServer(()=>accepted());
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  const request=http.get({host:"127.0.0.1",port:server.address().port,path:"/idle-poll"});request.on("error",()=>{});
  await pending;
  const closed=new Promise(resolve=>server.once("close",resolve));
  const close=vm.runInNewContext("("+source.slice(begin,end)+")",{ownedRuntimeHttpServer:server});
  close();
  let timer;try{await Promise.race([closed,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error("idle socket prevented shutdown")),1000);})]);}finally{clearTimeout(timer);request.destroy();server.closeAllConnections();server.close();}
  assert.equal(server.listening,false);
  console.log(JSON.stringify({ok:true,checks:1,evidence:"actual production close function with a real local HTTP long poll; no AE or daemon process"}));
})().catch(error=>{console.error(error);process.exitCode=1;});
