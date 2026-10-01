"use strict";
const fs=require("fs"),zlib=require("zlib");
const {createProject}=require("./placeholder-protection-fixture");
function png(width,height){
 const crc=bytes=>{let value=0xffffffff;for(const byte of bytes){value^=byte;for(let i=0;i<8;i++)value=value>>>1 ^ (value&1 ? 0xedb88320 : 0);}return (value^0xffffffff)>>>0;};
 function chunk(type,data){const name=Buffer.from(type),length=Buffer.alloc(4),sum=Buffer.alloc(4);length.writeUInt32BE(data.length);sum.writeUInt32BE(crc(Buffer.concat([name,data])));return Buffer.concat([length,name,data,sum]);}
 const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk("IHDR",header),chunk("IDAT",zlib.deflateSync(Buffer.alloc((width*4+1)*height))),chunk("IEND",Buffer.alloc(0))]);
}
function createVisualProject(){
 const project=createProject();project.context.writePng=(file,width,height)=>fs.writeFileSync(file,png(width,height));
 project.change(`
 var nextItemId=500,nextLayerId=5000;
 child.width=root.width=320;child.height=root.height=180;child.pixelAspect=root.pixelAspect=1;child.comment=root.comment="";
 for(var i=0;i<items.length;i++)if(items[i] instanceof CompItem)items[i].resolutionFactor=[2,2];
 function makeStatic(layer){layer.threeDLayer=false;layer.parent=null;layer.collapseTransformation=(layer.matchName==="ADBE Text Layer" || layer.groups.some(function(g){return g.matchName==="ADBE Text Properties";})) ? true : false;layer.groups.push(new Group("ADBE Mask Parade",3,layer));}
 makeStatic(target);makeStatic(other);makeStatic(route);
 function refresh(comp){for(var i=0;i<comp._layers.length;i++){comp._layers[i].index=i+1;comp._layers[i].containingComp=comp;}}
 CompItem.prototype.__insert=function(layer){makeStatic(layer);this._layers.unshift(layer);refresh(this);return layer;};
 Object.defineProperty(CompItem.prototype,"layers",{get:function(){var comp=this;return {add:function(source){return comp.__insert(new AVLayer(nextLayerId++,source.name,source));},addText:function(text){var layer=new AVLayer(nextLayerId++,text,null);layer.matchName="ADBE Text Layer";var group=new Group("ADBE Text Properties",4,layer);group.add("ADBE Text Document",{text:text,fontSize:20});layer.groups.push(group);return comp.__insert(layer);}};}});
 app.project.items={addComp:function(name,width,height,pixelAspect,duration,frameRate){var comp=new CompItem(nextItemId++,name);comp.width=width;comp.height=height;comp.pixelAspect=pixelAspect;comp.duration=duration;comp.frameRate=frameRate;comp.comment="";comp.resolutionFactor=[2,2];items.push(comp);if(failComment)Object.defineProperty(comp,"comment",{get:function(){return "";},set:function(){}});return comp;}};
 Object.defineProperty(CompItem.prototype,"usedIn",{get:function(){var source=this;return items.filter(function(item){return item instanceof CompItem && item._layers.some(function(layer){return layer.source===source;});});}});
 CompItem.prototype.remove=function(){if(this.failRemove)throw new Error("synthetic remove failure");items.splice(items.indexOf(this),1);};
 CompItem.prototype.saveFrameToPng=function(time,file){if(failRender)throw new Error("synthetic render failure");writePng(file.fsName,this.width,this.height);file.exists=true;};
 function File(file){this.fsName=file;this.exists=false;}
 var failComment=false,failRender=false;
 `);
 project.body=body=>project.execute(`JSON.stringify((function(){${body}})())`);
 return project;
}
const request={targets:[{rootCompItemId:20,target:{compItemId:10,layerId:11},samples:[{rootTime:0.2,targetTime:0.2,sourceTime:0.2,roles:["first"]},{rootTime:1.96,targetTime:1.96,sourceTime:1.96,roles:["middle"]},{rootTime:3.96,targetTime:3.96,sourceTime:3.96,roles:["last"]}],viewKinds:["target_comp"]}]};
module.exports={createVisualProject,request,png};
