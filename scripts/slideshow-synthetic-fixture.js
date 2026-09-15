"use strict";

const projectPath="C:\\fixture\\synthetic-slideshow.aep";
const order=[1,2,5,4,7,6,9,8,10,3];
const events=order.map((scene,index)=>({id:String(index+1).padStart(2,"0"),scene,start:index*5,duration:5,title:`SYNTHETIC TITLE ${index+1}`,titleWrap:24,hero:index%3===0?"both":index%3===1?"suhanov":"kurnikov",images:index===0?[{leaf:"Image 01",items:[{path:"C:\\fixture\\generated.png",start:0,duration:5,sourceIn:0,audio:false}]}]:[],audioOnly:[],captions:index===0?["SYNTHETIC CAPTION"]:[]}));
const manifest={schema:"ae-agent-slideshow.v1",action:"build",projectPath,duration:50,frameRate:30,width:1280,height:720,pixelAspect:1,prefix:"CODX_133_",masterName:"CODX_133_MASTER",finalComp:{name:"Final Comp",itemIndex:101},introDuration:2,events};
const articles={suhanov:["Synthetic Suhanov article paragraph ".repeat(20)],kurnikov:["Synthetic Kurnikov article paragraph ".repeat(20)],both:["Synthetic combined article paragraph ".repeat(20)]};
const inventory={finalComp:{itemIndex:101,name:"Final Comp",duration:50.25,numLayers:21,controlLayerName:"CONTROL"},scenes:order.map((scene)=>({scene,itemIndex:200+scene,name:`Scene ${scene}`,duration:4,numLayers:4}))};

module.exports={manifest,articles,inventory};
