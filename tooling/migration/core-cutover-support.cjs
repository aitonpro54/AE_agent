"use strict";
// Static provenance for reviewed nonliteral launcher build inputs; no runtime.
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const root=path.resolve(__dirname,"../.."),file=path.join(root,"config/source-provenance.json"),value=JSON.parse(fs.readFileSync(file,"utf8"));
for(const name of ["scripts/build-windows-mcp-launcher.ps1","scripts/windows-mcp-launcher.cs"]){
  const source=fs.readFileSync(path.join(value.sourceRoot,name)),target=fs.readFileSync(path.join(root,name));if(!source.equals(target))throw Error("launcher source bytes differ: "+name);
  if(!value.paths.some(p=>p.path===name))value.paths.push({path:name,sourceSha256:crypto.createHash("sha256").update(source).digest("hex"),action:"copy-cutover-support"});
}
fs.writeFileSync(file,JSON.stringify(value,null,2)+"\n");
console.log(JSON.stringify({ok:true,launcherSources:2,sourceUnchanged:true,actualStateCopied:false}));
