#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { buildSlideshowPlan } = require("../mcp-server/slideshow-plan-builder");

function readJson(file) { return JSON.parse(fs.readFileSync(path.resolve(file), "utf8")); }
function main(argv) {
  if(argv.length!==4)throw new Error("Usage: node scripts/slideshow-build-plan.js manifest.json articles.json inventory.json output.json");
  const [manifestFile,articlesFile,inventoryFile,outputFile]=argv;
  const manifest=readJson(manifestFile),articles=readJson(articlesFile),inventory=readJson(inventoryFile);
  const result=buildSlideshowPlan(manifest,articles,inventory),target=path.resolve(outputFile);
  fs.mkdirSync(path.dirname(target),{recursive:true});
  fs.writeFileSync(target,`${JSON.stringify(result,null,2)}\n`,"utf8");
  process.stdout.write(`${JSON.stringify({ok:true,output:target,stages:result.stageCount,maxStepsPerStage:result.maxStepsPerStage})}\n`);
}

try { main(process.argv.slice(2)); } catch (error) { process.stderr.write(`${error.stack||error.message}\n`); process.exitCode=1; }
