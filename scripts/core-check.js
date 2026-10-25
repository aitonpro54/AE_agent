"use strict";
const fs=require("fs"),path=require("path"),crypto=require("crypto"),{isBuiltin}=require("module"),{spawnSync}=require("child_process");
const ROOT=path.resolve(__dirname,"..");
function list(dir){return fs.readdirSync(path.join(ROOT,dir),{withFileTypes:true}).flatMap(e=>e.isDirectory()?list(dir+"/"+e.name):[dir+"/"+e.name]);}
function census(){const names=[...list("mcp-server"),...list("scripts"),...list("cep-panel")].filter(n=>/\.(js|cjs|json|ps1|html|css|xml)$/.test(n)),missing=[],external=[],oldImports=[];
for(const name of names.filter(n=>/\.(js|cjs)$/.test(n))){const s=fs.readFileSync(path.join(ROOT,name),"utf8");for(const m of s.matchAll(/\brequire\s*\(\s*["']([^"']+)["']\s*\)/g)){if(m[1].startsWith('.')){const base=path.resolve(ROOT,path.dirname(name),m[1]),found=[base,base+'.js',base+'.json',base+'/index.js'].find(f=>fs.existsSync(f));if(!found)missing.push({name,import:m[1]});else if(!found.startsWith(ROOT+path.sep))oldImports.push({name,import:m[1]});}else if(!isBuiltin(m[1])&&!m[1].startsWith('internal/deps/acorn/'))external.push({name,import:m[1]});}}
return {names,missing,external,oldImports};}
function check(){const c=census();if(c.missing.length||c.external.length||c.oldImports.length)throw Error(JSON.stringify(c));for(const n of c.names.filter(n=>/\.(js|cjs)$/.test(n))){const p=spawnSync(process.execPath,['--check',path.join(ROOT,n)],{encoding:'utf8',windowsHide:true});if(p.status!==0)throw Error(n+'\n'+p.stderr);}console.log(JSON.stringify({ok:true,files:c.names.length,syntax:'pass',missingImports:0,externalDependencies:0,oldRootImports:0}));}
if(require.main===module)check();
module.exports={ROOT,list,census,check};
