"use strict";
// ES3 streaming SHA-256 for the fixed native source producer. The file namespace
// is trusted while this program runs; this is not a hostile-writer file lock.
const MAX_BYTES=64*1024*1024,PROBE_MS=15000;
function hashFile(filePath,deadline,maxBytes){
  var started=new Date().getTime(),f=new File(filePath),opened=false,bytes=0,block=[],used=0,w=[],i,n,chunk,want,result;
  function bad(c){throw Error(c);}
  function clock(){if(new Date().getTime()>=deadline)bad("ame_source_hash_budget");}
  if(typeof deadline!=="number"||!isFinite(deadline)||typeof maxBytes!=="number"||!isFinite(maxBytes)||maxBytes!==Math.floor(maxBytes))bad("ame_source_hash_budget_invalid");
  function stamp(file){if(!file.exists||file.alias||typeof file.length!=="number"||file.length<0||!file.modified)bad("ame_source_hash_file_unavailable");return {bytes:file.length,mtimeSeconds:Math.floor(file.modified.getTime()/1000)};}
  var before=stamp(f);if(before.bytes>maxBytes||maxBytes>67108864||maxBytes<0)bad("ame_source_hash_byte_bound");
  var h=[1779033703,3144134277,1013904242,2773480762,1359893119,2600822924,528734635,1541459225];
  var k=[1116352408,1899447441,3049323471,3921009573,961987163,1508970993,2453635748,2870763221,3624381080,310598401,607225278,1426881987,1925078388,2162078206,2614888103,3248222580,3835390401,4022224774,264347078,604807628,770255983,1249150122,1555081692,1996064986,2554220882,2821834349,2952996808,3210313671,3336571891,3584528711,113926993,338241895,666307205,773529912,1294757372,1396182291,1695183700,1986661051,2177026350,2456956037,2730485921,2820302411,3259730800,3345764771,3516065817,3600352804,4094571909,275423344,430227734,506948616,659060556,883997877,958139571,1322822218,1537002063,1747873779,1955562222,2024104815,2227730452,2361852424,2428436474,2756734187,3204031479,3329325298];
  function compress(){
    var j,a=h[0],b=h[1],c=h[2],d=h[3],e=h[4],ff=h[5],g=h[6],hh=h[7],x,y,t1,t2;
    for(j=0;j<16;j++)w[j]=(block[j*4]<<24)|(block[j*4+1]<<16)|(block[j*4+2]<<8)|block[j*4+3];
    for(j=16;j<64;j++){x=w[j-15];y=w[j-2];w[j]=(w[j-16]+(((x>>>7)|(x<<25))^((x>>>18)|(x<<14))^(x>>>3))+w[j-7]+(((y>>>17)|(y<<15))^((y>>>19)|(y<<13))^(y>>>10)))|0;}
    for(j=0;j<64;j++){
      t1=(hh+(((e>>>6)|(e<<26))^((e>>>11)|(e<<21))^((e>>>25)|(e<<7)))+((e&ff)^((~e)&g))+k[j]+w[j])|0;
      t2=((((a>>>2)|(a<<30))^((a>>>13)|(a<<19))^((a>>>22)|(a<<10)))+((a&b)^(a&c)^(b&c)))|0;
      hh=g;g=ff;ff=e;e=(d+t1)|0;d=c;c=b;b=a;a=(t1+t2)|0;
    }
    h[0]=(h[0]+a)|0;h[1]=(h[1]+b)|0;h[2]=(h[2]+c)|0;h[3]=(h[3]+d)|0;h[4]=(h[4]+e)|0;h[5]=(h[5]+ff)|0;h[6]=(h[6]+g)|0;h[7]=(h[7]+hh)|0;used=0;
  }
  function appendByte(v){block[used++]=v;if(used===64)compress();}
  clock();f.encoding="BINARY";
  try{
    if(f.open("r")!==true)bad("ame_source_hash_open_failed");opened=true;
    while(bytes<before.bytes){clock();want=Math.min(65536,before.bytes-bytes);chunk=f.read(want);if(typeof chunk!=="string"||chunk.length!==want||f.error)bad("ame_source_hash_short_or_failed_read");
      for(i=0;i<chunk.length;i++){n=chunk.charCodeAt(i);if(n>255)bad("ame_source_hash_binary_required");block[used++]=n;if(used===64)compress();}bytes+=chunk.length;
    }
    clock();if(f.read(1)!==""||f.error||f.eof!==true)bad("ame_source_hash_eof_changed");
    var after=stamp(new File(filePath));if(after.bytes!==before.bytes||after.mtimeSeconds!==before.mtimeSeconds||bytes!==before.bytes)bad("ame_source_hash_file_changed");
    // The supported byte bound keeps the length in bits below 2^32.
    appendByte(128);while(used!==56)appendByte(0);for(i=0;i<4;i++)appendByte(0);var bits=bytes*8;appendByte((bits>>>24)&255);appendByte((bits>>>16)&255);appendByte((bits>>>8)&255);appendByte(bits&255);
    var hex="0123456789abcdef",sha="",j;for(i=0;i<8;i++)for(j=7;j>=0;j--)sha+=hex.charAt((h[i]>>>(j*4))&15);clock();
    result={path:String(f.fsName),sha25664:sha,bytes:bytes,mtimeSeconds:before.mtimeSeconds,elapsedMs:new Date().getTime()-started};
  }finally{if(opened&&f.close()!==true)bad("ame_source_hash_close_failed");}
  return result;
}
module.exports={MAX_BYTES,PROBE_MS,hashFile};
