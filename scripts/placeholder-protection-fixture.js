"use strict";
// Только синтетический объектный проект в отдельном VM; не AE/CEP executor.
const vm = require("node:vm");
function createProject() {
  const context = vm.createContext({ console });
  vm.runInContext(`
    function CompItem(id,name) { this.id=id;this.name=name;this.duration=10;this.frameRate=25;this.time=0;this._layers=[];this.selectedLayers=[];this.selectedProperties=[]; }
    Object.defineProperty(CompItem.prototype,"numLayers",{get:function(){return this._layers.length;}});
    CompItem.prototype.layer=function(index){return this._layers[index-1];};
    CompItem.prototype.add=function(layer){this._layers.push(layer);layer.index=this._layers.length;layer.containingComp=this;return layer;};
    function FootageItem(id,name,file){this.id=id;this.name=name;this.file={fsName:file};this.typeName="Footage";this.duration=10;this.width=1920;this.height=1080;this.frameRate=25;this.pixelAspect=1;this.footageMissing=false;this.hasVideo=true;this.hasAudio=false;this.mainSource={isStill:false};}
    function FolderItem() {}
    function Property(name,value,index,parent){this.matchName=name;this.name=name;this.value=value;this.propertyIndex=index;this.parentProperty=parent;this.numKeys=0;this.expressionEnabled=false;this.dimensionsSeparated=false;this.isSeparationFollower=false;this.propertyValueType=1;this.canSetExpression=true;this.expression="";this.expressionError="";}
    Property.prototype.setValue=function(value){if(this.fail)throw new Error("synthetic setter failure");this.value=value;writes++;};
    Property.prototype.propertyGroup=function(){return this.parentProperty;};
    function Group(name,index,parent){this.matchName=name;this.name=name;this.propertyIndex=index;this.parentProperty=parent;this.children=[];}
    Group.prototype.property=function(value){if(typeof value==="number")return this.children[value-1];return this.children.filter(function(p){return p.matchName===value;})[0]||null;};
    Group.prototype.add=function(name,value){var p=new Property(name,value,this.children.length+1,this);this.children.push(p);return p;};
    Group.prototype.propertyGroup=function(){return this.parentProperty;};
    Object.defineProperty(Group.prototype,"numProperties",{get:function(){return this.children.length;}});
    function AVLayer(id,name,source){this.id=id;this.name=name;this.source=source;this.enabled=true;this.locked=false;this.startTime=0;this.inPoint=0;this.outPoint=4;this.stretch=100;this.timeRemapEnabled=false;this.matchName="ADBE AV Layer";this.groups=[];
      var g=new Group("ADBE Transform Group",1,this);this.groups.push(g);g.add("ADBE Anchor Point",[960,540]);g.add("ADBE Position",[960,540]);g.add("ADBE Scale",[100,100]);g.add("ADBE Rotate Z",0);g.add("ADBE Opacity",100);
      var e=new Group("ADBE Effect Parade",2,this);var custom=new Group("Custom Effect",1,e);e.children.push(custom);custom.add("Custom Value",7);this.groups.push(e);}
    AVLayer.prototype.property=function(value){if(typeof value==="number")return this.groups[value-1];return this.groups.filter(function(p){return p.matchName===value;})[0]||null;};
    AVLayer.prototype.replaceSource=function(source){this.source=source;writes++;};
    Object.defineProperty(AVLayer.prototype,"numProperties",{get:function(){return this.groups.length;}});
    var a=new FootageItem(100,"Performer A","C:/Synthetic/a.mp4"), b=new FootageItem(101,"Performer B","C:/Synthetic/b.mp4");
    var child=new CompItem(10,"Placeholder"), root=new CompItem(20,"Root");
    var target=child.add(new AVLayer(11,"Selected placeholder",a));var other=child.add(new AVLayer(12,"Other placeholder",b));other.inPoint=4;other.outPoint=8;other.startTime=4;
    var route=root.add(new AVLayer(21,"Nested",child));route.outPoint=10;
    var items=[child,root,a,b];var undo=[];var writes=0;
    var app={project:{file:{fsName:"C:/Synthetic/Protected.aep"},activeItem:child,bitsPerChannel:8,item:function(index){return items[index-1];}},beginUndoGroup:function(name){undo.push("begin");},endUndoGroup:function(){undo.push("end");}};
    Object.defineProperty(app.project,"numItems",{get:function(){return items.length;}});
    child.selectedLayers=[target];
    var Layer=AVLayer, TextLayer=function(){}, ShapeLayer=function(){}, PropertyValueType={SHAPE:99,TEXT_DOCUMENT:98};
  `, context);
  return {
    context,
    change: code => vm.runInContext(code, context),
    read: code => JSON.parse(vm.runInContext(`JSON.stringify(${code})`, context)),
    execute(script) { return JSON.parse(vm.runInContext(script, context, { timeout: 2500 })); }
  };
}
module.exports = { createProject };
