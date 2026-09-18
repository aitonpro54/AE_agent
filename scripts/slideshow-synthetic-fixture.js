"use strict";

const projectPath="C:\\fixture\\synthetic-slideshow.aep";
const order=[1,2,5,4,7,6,9,8,10,3];
const events=order.map((scene,index)=>({id:String(index+1).padStart(2,"0"),scene,start:index*5,duration:5,title:`SYNTHETIC TITLE ${index+1}`,titleWrap:24,hero:index%3===0?"both":index%3===1?"suhanov":"kurnikov",images:index===0?[{leaf:"Image 01",items:[{path:"C:\\fixture\\generated.mp4",start:0,duration:5,sourceIn:0,audio:true}]}]:[],audioOnly:index===0?[{path:"C:\\fixture\\generated.mp4",start:0,duration:5,sourceIn:0,audio:true},{path:"C:\\fixture\\voice.wav",start:0,duration:5,sourceIn:0,audio:true}]:[],captions:index===0?["SYNTHETIC CAPTION"]:[]}));
const manifest={schema: "ae-agent-slideshow.v2",templateContract:require("../mcp-server/slideshow-manifest").TEMPLATE_CONTRACT,action:"build",projectPath,duration:50,frameRate:30,width:1280,height:720,pixelAspect:1,prefix:"CODX_133_",masterName:"CODX_133_MASTER",finalComp:{name:"Final Comp",itemIndex:101},introDuration:2,audioRouting:"master-only",events};
const articles={suhanov:["Synthetic Suhanov article paragraph ".repeat(20)],kurnikov:["Synthetic Kurnikov article paragraph ".repeat(20)],both:["Synthetic combined article paragraph ".repeat(20)]};
const structureSchema="ae-agent-comp-structure.v1";
function layer(layerId,name,outPoint){return{layerId,name,sourceType:"none",sourceItemId:null,sourceName:null,startTime:0,inPoint:0,outPoint,stretch:100,enabled:true,audioEnabled:false,timeRemapEnabled:false,guideLayer:false,adjustmentLayer:false,threeDLayer:false,collapseTransformation:false};}
function layers(firstId,count,duration,names=[]){return Array.from({length:count},(_,index)=>layer(firstId+index,names[index]||`Layer ${index+1}`,duration));}
const inventory={finalComp:{itemIndex:101,itemId:1001,name:"Final Comp",duration:50.25,numLayers:21,structureSchema,layers:layers(10000,21,50.25,["CONTROL","COLOR"]),controlLayers:{CONTROL:{sourceLayerName:"CONTROL",effectCount:2},COLOR:{sourceLayerName:"COLOR",effectCount:7}}},scenes:order.map((scene)=>({scene,itemIndex:200+scene,itemId:2000+scene,name:`Scene ${scene}`,duration:4,numLayers:4,structureSchema,layers:layers(20000+scene*10,4,4),introEffectCount:scene===1?0:4,mainEffectCount:0}))};

module.exports={manifest,articles,inventory};
