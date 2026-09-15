#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { buildSlideshowPlan } = require("../mcp-server/slideshow-plan-builder");

function readJson(file) { return JSON.parse(fs.readFileSync(path.resolve(file), "utf8")); }
function sceneNumber(name) { const match=/^Scene (\d+)$/.exec(String(name||"")); if(!match)throw new Error(`Unexpected scene name: ${name}`); return Number(match[1]); }

function main(argv) {
  if(argv.length!==6)throw new Error("Usage: node scripts/slideshow-build-plan.js manifest.json articles.json live-scenes.json live-intro.json final-comp-duration output.json");
  const [manifestFile,articlesFile,scenesFile,introFile,finalCompDurationText,outputFile]=argv;
  const manifest=readJson(manifestFile),articles=readJson(articlesFile),scenes=readJson(scenesFile),intro=readJson(introFile);
  if(!Array.isArray(scenes))throw new Error("live-scenes.json must contain an array.");
  const finalCompDuration=Number(finalCompDurationText);
  if(!Number.isFinite(finalCompDuration)||finalCompDuration<=0)throw new Error("final-comp-duration must be a positive finite number from fresh Final Comp inspection.");
  const inventory={
    finalComp:{itemIndex:intro.comp.itemIndex,name:intro.comp.name,duration:finalCompDuration,numLayers:intro.comp.numLayers,controlLayerName:"CONTROL"},
    scenes:scenes.map((item)=>({scene:sceneNumber(item.name),itemIndex:item.itemIndex,name:item.name,duration:item.duration,numLayers:item.numLayers}))
  };
  const result=buildSlideshowPlan(manifest,articles,inventory),target=path.resolve(outputFile);
  fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.writeFileSync(target,`${JSON.stringify(result,null,2)}\n`,"utf8");
  process.stdout.write(`${JSON.stringify({ok:true,output:target,stages:result.stageCount,maxStepsPerStage:result.maxStepsPerStage})}\n`);
}

try { main(process.argv.slice(2)); } catch (error) { process.stderr.write(`${error.stack||error.message}\n`); process.exitCode=1; }
