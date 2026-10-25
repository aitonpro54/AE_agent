"use strict";
const fs=require("fs"),path=require("path");
const ROOT=path.resolve(__dirname,"../..");
const files=[];
files.push("package.json");
files.push("config/core-legacy-verifier-manifest.json");
const coreProductScripts=new Set(["scripts/core-legacy-control-reader.js","scripts/core-product-migration-control.js"]);
for(const dir of ["mcp-server","scripts","cep-panel"]){
  function walk(d){for(const e of fs.readdirSync(path.join(ROOT,d),{withFileTypes:true})){const n=d+"/"+e.name;if(e.isDirectory())walk(n);else if((!n.startsWith("scripts/core-")||coreProductScripts.has(n))&&!n.endsWith("network-test-fixture.js"))files.push(n);}}
  walk(dir);
}
const name=path.join(ROOT,"mcp-server/review-evidence.js");
let s=fs.readFileSync(name,"utf8");
s=s.replace(/const RUNTIME_FILES = \[[\s\S]*?\n\];/,"const RUNTIME_FILES = "+JSON.stringify(files.sort(),null,2)+";");
fs.writeFileSync(name,s);
let b=fs.readFileSync(path.join(ROOT,"mcp-server/bridge-daemon.js"),"utf8");
b=b.replace(/    if \(\(url.pathname === "\/agents\/log"[\s\S]*?\n    }/,"");
fs.writeFileSync(path.join(ROOT,"mcp-server/bridge-daemon.js"),b);
for(const file of ["core-extract.cjs","core-finalize.cjs"]){const p=path.join(__dirname,file),v=fs.readFileSync(p,"utf8");fs.writeFileSync(p,v.replace('path.resolve(__dirname, "..")','path.resolve(__dirname, "../..")').replace('path.resolve(__dirname,"..")','path.resolve(__dirname,"../..")'));}
console.log(JSON.stringify({runtimeHashFiles:files.length}));
