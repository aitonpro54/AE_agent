"use strict";
const fs=require("fs"),path=require("path");
const {packageReviewEvidence,canonical}=require("../mcp-server/review-evidence");

function writePackage(input,destination,options={}) {
  const target=path.resolve(destination);
  // A fresh directory is mandatory: this tool cannot rewrite a historical package.
  if(fs.existsSync(target))throw new Error("evidence_destination_already_exists");
  const packed=packageReviewEvidence(input,options);
  fs.mkdirSync(target,{recursive:false});
  for(const [name,value] of Object.entries(packed.files))fs.writeFileSync(path.join(target,name),canonical(value),{encoding:"utf8",flag:"wx"});
  fs.writeFileSync(path.join(target,"manifest.json"),canonical(packed.manifest),{encoding:"utf8",flag:"wx"});
  return packed.manifest;
}
if(require.main===module){
  const [inputPath,destination]=process.argv.slice(2);
  if(!inputPath||!destination)throw new Error("Usage: node scripts/package-review-evidence.js <explicit-input.json> <new-output-directory>");
  const input=JSON.parse(fs.readFileSync(inputPath,"utf8"));
  console.log(JSON.stringify(writePackage(input,destination),null,2));
}
module.exports={writePackage};
