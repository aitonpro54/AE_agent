"use strict";
const assert=require("node:assert/strict"),crypto=require("node:crypto"),vm=require("node:vm"),acorn=require("internal/deps/acorn/acorn/dist/acorn");
const hashing=require("../mcp-server/ame-job-source-sha256");let checks=0;
function fixture(buffer,options={}){
  const calls={opens:0,closes:0,reads:0,maxRead:0},modified=1700000000000;let clock=0;
  function File(file){this.fsName=file;this.offset=0;this.exists=true;this.alias=false;this.length=options.length===undefined?buffer.length:options.length;this.modified=new Date(modified+(options.changed&&calls.reads?1000:0));this.error="";this.eof=false;}
  File.prototype.open=function(mode){assert.equal(this.encoding,"BINARY");assert.equal(mode,"r");calls.opens++;return !options.openFailure;};
  File.prototype.read=function(size){calls.reads++;calls.maxRead=Math.max(calls.maxRead,size);if(options.readFailure){this.error="io failure";return "";}if(options.binaryFailure)return "\u0100".repeat(size);
    if(options.eofFailure&&this.offset===buffer.length)return "x";
    const end=Math.min(buffer.length,this.offset+size),bytes=buffer.subarray(this.offset,end);this.offset=end;this.eof=end===buffer.length&&bytes.length<size;const text=bytes.toString("latin1");return options.short&&text.length?text.slice(0,-1):text;};
  File.prototype.close=function(){calls.closes++;return !options.closeFailure;};
  class Clock extends Date{constructor(){super(clock);clock+=options.clockStep||0;}}
  const hash=vm.runInNewContext("("+hashing.hashFile.toString()+")",{File,Date:options.clockStep?Clock:Date});
  return {calls,run:()=>hash("owned.aep",options.clockStep?5:Date.now()+15000,hashing.MAX_BYTES)};
}
function positive(bytes,expected){const f=fixture(bytes),r=f.run();assert.equal(r.sha25664,expected||crypto.createHash("sha256").update(bytes).digest("hex"));assert.equal(r.bytes,bytes.length);assert.equal(f.calls.opens,1);assert.equal(f.calls.closes,1);assert(f.calls.maxRead<=65536);checks++;}
acorn.parse("("+hashing.hashFile.toString()+");",{ecmaVersion:3,allowReserved:"never"});checks++;
positive(Buffer.alloc(0),"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
positive(Buffer.from("abc"),"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
positive(Buffer.alloc(1000000,97),"cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0");
for(const n of [0,1,2,55,56,63,64,65,119,120,127,128,129,65535,65536,65537,131071,131072,131073,2*1024*1024+13]){const b=Buffer.alloc(n);for(let i=0;i<n;i++)b[i]=i&255;positive(b);}
for(const [options,code,closed]of [[{short:true},/short_or_failed_read/,1],[{readFailure:true},/short_or_failed_read/,1],[{eofFailure:true},/eof_changed/,1],[{changed:true},/file_changed/,1],[{binaryFailure:true},/binary_required/,1],[{openFailure:true},/open_failed/,0],[{closeFailure:true},/close_failed/,1],[{clockStep:1},/hash_budget/,1],[{length:hashing.MAX_BYTES+1},/byte_bound/,0]]){const f=fixture(Buffer.alloc(131073,255),options);assert.throws(f.run,code);assert.equal(f.calls.closes,closed);checks++;}
console.log(JSON.stringify({ok:true,checks,maxBytes:hashing.MAX_BYTES,probeBudgetMs:hashing.PROBE_MS,evidence:"actual fixed ES3 SHA-256; standard vectors, binary 00..FF, padding/chunk boundaries, multi-MB vs Node crypto, EOF/error/budget/close paths; no AE runtime performance claim"}));
