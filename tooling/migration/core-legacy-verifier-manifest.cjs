"use strict";
// Static read-only source census; does not import or run legacy code.
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto"),{isBuiltin}=require("node:module");
const acorn=require("internal/deps/acorn/acorn/dist/acorn");
const ROOT=path.resolve(__dirname,"../.."),SOURCE="C:/Users/Ant/Documents/Codex/AE_agent";
const entries=["mcp-server/owned-runtime-supervisor.js","mcp-server/owned-runtime-initial-runtime.js","mcp-server/deployment-mode.js","scripts/owned-runtime-control.js"];
function walk(n,visit){if(!n||typeof n!=="object")return;if(/^(FunctionDeclaration|FunctionExpression|ArrowFunctionExpression)$/.test(n.type))return;if(n.type==="CallExpression"&&n.callee?.name==="require"&&n.arguments.length===1&&typeof n.arguments[0].value==="string")visit(n.arguments[0].value);for(const[k,v]of Object.entries(n)){if(k==="start"||k==="end")continue;if(Array.isArray(v))v.forEach(x=>walk(x,visit));else if(v&&typeof v==="object")walk(v,visit);}}
const pending=entries.slice(),files=new Map(),builtins=new Set();
while(pending.length){const name=pending.shift();if(files.has(name))continue;if(files.size>=64)throw Error("verifier_code_budget");const file=path.join(SOURCE,name),bytes=fs.readFileSync(file);files.set(name,{path:name,sha256:crypto.createHash("sha256").update(bytes).digest("hex")});if(name.endsWith(".json"))continue;
  walk(acorn.parse(bytes.toString("utf8"),{ecmaVersion:"latest",allowHashBang:true}),specifier=>{if(isBuiltin(specifier)){builtins.add(specifier.replace(/^node:/,""));return;}if(!specifier.startsWith("."))throw Error("verifier_external_module");const base=path.resolve(path.dirname(file),specifier),target=[base,base+".js",base+".json",path.join(base,"index.js")].find(f=>fs.existsSync(f)&&fs.lstatSync(f).isFile());if(!target)throw Error("verifier_unresolved_module");const relative=path.relative(SOURCE,target).replace(/\\/g,"/");if(!/^(mcp-server|cep-panel)\//.test(relative)&&!["scripts/owned-runtime-control.js","scripts/cep-panel-target.js","package.json"].includes(relative))throw Error("verifier_source_scope");pending.push(relative);});
}
const value={schema:"ae-agent.core-legacy-verifier-code.v1",sourceRoot:SOURCE,entries,modules:[...files.values()].sort((a,b)=>a.path.localeCompare(b.path)),builtins:[...builtins].sort(),authority:false};
fs.writeFileSync(path.join(ROOT,"config/core-legacy-verifier-manifest.json"),JSON.stringify(value,null,2)+"\n");
console.log(JSON.stringify({ok:true,modules:files.size,authority:false,sourceExecuted:false}));
