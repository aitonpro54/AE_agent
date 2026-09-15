#!/usr/bin/env node
"use strict";

const fs=require("fs");
const path=require("path");
const zlib=require("zlib");

function crc32(buffer){let crc=0xffffffff;for(const byte of buffer){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return(crc^0xffffffff)>>>0;}
function chunk(type,data){const name=Buffer.from(type,"ascii"),out=Buffer.alloc(12+data.length);out.writeUInt32BE(data.length,0);name.copy(out,4);data.copy(out,8);out.writeUInt32BE(crc32(Buffer.concat([name,data])),8+data.length);return out;}
function png(){const width=96,height=54,row=Buffer.alloc(1+width*4),rows=[];for(let y=0;y<height;y++){row[0]=0;for(let x=0;x<width;x++){const p=1+x*4,on=((x>>3)+(y>>3))%2===0;row[p]=on?33:232;row[p+1]=on?112:196;row[p+2]=on?180:55;row[p+3]=255;}rows.push(Buffer.from(row));}const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(width,0);ihdr.writeUInt32BE(height,4);ihdr[8]=8;ihdr[9]=6;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk("IHDR",ihdr),chunk("IDAT",zlib.deflateSync(Buffer.concat(rows))),chunk("IEND",Buffer.alloc(0))]);}
function wav(){const rate=48000,seconds=1,samples=rate*seconds,data=Buffer.alloc(samples*2);for(let i=0;i<samples;i++)data.writeInt16LE(Math.round(Math.sin(2*Math.PI*440*i/rate)*7000),i*2);const out=Buffer.alloc(44+data.length);out.write("RIFF",0);out.writeUInt32LE(36+data.length,4);out.write("WAVEfmt ",8);out.writeUInt32LE(16,16);out.writeUInt16LE(1,20);out.writeUInt16LE(1,22);out.writeUInt32LE(rate,24);out.writeUInt32LE(rate*2,28);out.writeUInt16LE(2,32);out.writeUInt16LE(16,34);out.write("data",36);out.writeUInt32LE(data.length,40);data.copy(out,44);return out;}
function main(argv){const dir=path.resolve(argv[0]||".codex/slideshow-output/fixture-assets");fs.mkdirSync(dir,{recursive:true});const image=path.join(dir,"generated-checker.png"),audio=path.join(dir,"generated-tone.wav");fs.writeFileSync(image,png());fs.writeFileSync(audio,wav());const manifest={schema:"ae-agent-slideshow-fixture-assets.v1",image,audio};fs.writeFileSync(path.join(dir,"assets.json"),`${JSON.stringify(manifest,null,2)}\n`,"utf8");process.stdout.write(`${JSON.stringify({ok:true,...manifest})}\n`);}
main(process.argv.slice(2));
