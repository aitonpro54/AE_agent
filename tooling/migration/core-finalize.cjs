"use strict";
// One-time AST extraction, run after core-extract.cjs with --expose-internals.
const fs=require("fs"),path=require("path"),acorn=require("internal/deps/acorn/acorn/dist/acorn");
const root=path.resolve(__dirname,"../.."), read=n=>fs.readFileSync(path.join(root,n),"utf8"),write=(n,s)=>fs.writeFileSync(path.join(root,n),s);
const parse=s=>acorn.parse(s,{ecmaVersion:"latest",locations:true});
const walk=(n,f,p=null)=>{if(!n||typeof n!=="object")return;if(n.type)f(n,p);for(const[k,v]of Object.entries(n)){if(["loc","start","end"].includes(k))continue;if(Array.isArray(v))for(const x of v)walk(x,f,n);else if(v&&typeof v==="object")walk(v,f,n);}};
function edit(s,rows){const unique=rows.filter((x,i,a)=>!a.some((y,j)=>j!==i&&y.start<=x.start&&y.end>=x.end&&(y.start<x.start||y.end>x.end||j<i)));return unique.sort((a,b)=>b.start-a.start).reduce((v,e)=>v.slice(0,e.start)+(e.text||"")+v.slice(e.end),s);}
let s=read("mcp-server/bridge-daemon.js");
const excludedTools=new Set(["search_solutions","get_solution","list_solution_candidates","get_solution_candidate","get_project_intent_memory","update_project_intent_memory","list_ai_agents","check_ai_agent_readiness","chat_with_ai_agent","plan_with_ai_agent","run_agent_hardcore_session","get_ai_agent_log","create_dev_request_bundle","launch_codex_app_for_dev_request"]);
let ast=parse(s),rows=[];
walk(ast,(n,p)=>{
  if(n.type==="Property"&&["aiChatLogFile","hardcoreSessionDir","agentSecretsFile"].includes(n.key.name)){
    let end=n.end;if(s.slice(end).match(/^\s*,/))end+=s.slice(end).match(/^\s*,/)[0].length;rows.push({start:n.start,end});
  }
  if(n.type==="IfStatement" && p?.type==="BlockStatement"){
    const test=s.slice(n.test.start,n.test.end),body=s.slice(n.consequent.start,n.consequent.end);
    // Only exact dispatch-name predicates may remove tool handlers. A mixed
    // toolName risk-policy predicate must retain its supported safety siblings.
    if(/^name\s*===/.test(test)&&[...excludedTools].some(name=>test.includes('"'+name+'"'))||test.includes('"/usage"'))rows.push({start:n.start,end:n.end});
    if(test.includes('"/agents"')&&body.includes('aiAgents'))rows.push({start:n.start,end:n.end});
  }
  if(n.type==="FunctionDeclaration" && ["ownedTrustedServerOnlyResult","aiChatRequestSummary"].includes(n.id.name))rows.push({start:n.start,end:n.end,text:n.id.name==="ownedTrustedServerOnlyResult"?'function ownedTrustedServerOnlyResult(){throw Object.assign(Error("core_library_tools_removed"),{code:"core_library_tools_removed"});}':""});
});
s=edit(s,rows).replace(' || toolName === "run_agent_hardcore_session"',"");
// Tool descriptor removal is based on exact catalog names, not text matching.
ast=parse(s);const tools=ast.body.find(n=>n.declarations?.[0]?.id.name==="tools");
const elements=tools.declarations[0].init.elements.filter(n=>n.type!=="ObjectExpression" || !excludedTools.has(n.properties.find(p=>p.key?.name==="name")?.value?.value));
s=edit(s,[{start:tools.declarations[0].init.start,end:tools.declarations[0].init.end,text:'[\n'+elements.map(n=>s.slice(n.start,n.end)).join(',\n')+'\n]'}]);
write("mcp-server/bridge-daemon.js",s);

// Preserve original adapter cancellation/auth/owned-runtime path, remove only
// redundant local analytics and instructions requiring excluded subsystems.
let adapter=read("mcp-server/mcp-adapter.js"),aa=parse(adapter),ar=[];
walk(aa,(n,p)=>{if(n.type==="VariableDeclaration"&&adapter.slice(n.start,n.end).includes('require("./production-usage-tools")'))ar.push({start:n.start,end:n.end});
if(n.type==="IfStatement"&&adapter.slice(n.test.start,n.test.end).includes("isProductionUsageTool"))ar.push({start:n.start,end:n.end});});
adapter=edit(adapter,ar).replace("[...productionUsageTools,...ownedRuntimeTools]","[...ownedRuntimeTools]");
adapter=adapter.replace(/"For AE tasks, use search_solutions[^\n]+/,JSON.stringify("Inspect explicit AE targets through typed tools. Use the fixed deterministic build_solution_plan builders when applicable, then propose_ai_agent_plan and a fresh dry-run. The trusted CEP Autonomous Codex session permits only proposal-backed typed mutation. Raw JSX, destructive operations and save retain protected manual confirmation. Reconcile get_current_ai_agent_plan and UNKNOWN outcomes before further work; never replay an unknown mutation. At most two eligible setter corrections may use parentActionId after fresh inspection and read-back. Token accounting is provided by the separate external Codeburn MCP. Panel functions use list_panel_actions, get_panel_state, invoke_panel_action, and get_panel_action_result.")+",");
write("mcp-server/mcp-adapter.js",adapter);

// Keep production canonical-root pins active for this product root. The fixed
// control source remains byte-identical, so its SHA authority is retained.
for(const name of ["mcp-server/owned-runtime-authority.js","mcp-server/owned-runtime-supervisor.js","mcp-server/cep-panel-control.js"]){write(name,read(name).replaceAll('C:/Users/Ant/Documents/Codex/AE_agent','C:/Users/Ant/Documents/Codex/AE_Agent_Core'));}

// Lexical scope analysis for extraction: every external binding is explicit.
function references(node){
  const scopes=new WeakMap(),bindings=new WeakSet(),all=[];
  const make=(parent,isFunction=false)=>({parent,isFunction,names:new Set()});const base=make(null,true);
  const bind=(n,scope)=>{if(!n)return;if(n.type==="Identifier"){scope.names.add(n.name);bindings.add(n);return;}if(n.type==="AssignmentPattern"){bind(n.left,scope);return;}if(n.type==="RestElement"){bind(n.argument,scope);return;}if(n.type==="ArrayPattern"){n.elements.forEach(v=>bind(v,scope));return;}if(n.type==="ObjectPattern")n.properties.forEach(v=>bind(v.value||v.argument,scope));};
  function visit(n,scope,parent){if(!n||!n.type)return;
    if(n.type==="FunctionDeclaration"){bind(n.id,scope);scope=make(scope,true);n.params.forEach(v=>bind(v,scope));}
    else if(["FunctionExpression","ArrowFunctionExpression"].includes(n.type)){scope=make(scope,true);bind(n.id,scope);n.params.forEach(v=>bind(v,scope));}
    else if(n.type==="BlockStatement"||n.type==="CatchClause"||["ForStatement","ForOfStatement","ForInStatement"].includes(n.type)){scope=make(scope);if(n.type==="CatchClause")bind(n.param,scope);}
    scopes.set(n,scope);all.push([n,parent]);
    if(n.type==="VariableDeclaration"){let dest=scope;if(n.kind==="var")while(!dest.isFunction)dest=dest.parent;n.declarations.forEach(d=>bind(d.id,dest));}
    if(n.type==="ClassDeclaration")bind(n.id,scope);
    for(const[k,v]of Object.entries(n)){if(["loc","start","end"].includes(k))continue;if(Array.isArray(v))for(const x of v)visit(x,scope,n);else if(v&&typeof v==="object")visit(v,scope,n);}
  }
  visit(node,base,null);const external=[];
  for(const[n,p]of all){if(n.type!=="Identifier"||bindings.has(n))continue;
    if(p?.type==="MemberExpression"&&p.property===n&&!p.computed||p?.type==="Property"&&p.key===n&&!p.computed||["MethodDefinition","PropertyDefinition"].includes(p?.type)&&p.key===n&&!p.computed||["BreakStatement","ContinueStatement","LabeledStatement"].includes(p?.type))continue;
    let scope=scopes.get(n),found=false;while(scope){if(scope.names.has(n.name)){found=true;break;}scope=scope.parent;}if(!found)external.push({node:n,parent:p});
  }return external;
}
const globals=new Set(["Object","Array","JSON","String","Number","Boolean","Math","Date","Map","Set","WeakMap","WeakSet","Promise","Buffer","Error","TypeError","RegExp","URL","URLSearchParams","AbortController","Infinity","NaN","undefined","process","console","require","module","__dirname","__filename","setTimeout","clearTimeout","setInterval","clearInterval","parseInt","parseFloat","isFinite"]);
// Catalog is data construction only, and receives imported domain schemas.
s=read("mcp-server/bridge-daemon.js");ast=parse(s);const catalog=ast.body.find(n=>n.declarations?.[0]?.id.name==="tools");
const deps=[...new Set(references(catalog).map(r=>r.node.name).filter(n=>!globals.has(n)))].sort();
write("mcp-server/core-tool-catalog.js",'"use strict";\n// Typed schema construction only; grants and executor brands stay in runtime.\nfunction createToolCatalog({'+deps.join(',')+'}){\n'+s.slice(catalog.start,catalog.end)+'\nreturn tools;\n}\nmodule.exports=Object.freeze({createToolCatalog});\n');
s=edit(s,[{start:catalog.start,end:catalog.end,text:'const tools=require("./core-tool-catalog").createToolCatalog({'+deps.join(',')+'});'}]);

// Typed dispatch receives only its measured read-only port interface. Mutable
// authority brands/WeakMaps/ALS stay in bridge-daemon.js and are never exported.
ast=parse(s);const dispatch=ast.body.find(n=>n.type==="FunctionDeclaration"&&n.id.name==="callTool");
const refs=references(dispatch).filter(r=>!globals.has(r.node.name)),names=[...new Set(refs.map(r=>r.node.name))].sort();
let body=s.slice(dispatch.start,dispatch.end),rewrite=[];
for(const r of refs){const n=r.node;rewrite.push({start:n.start-dispatch.start,end:n.end-dispatch.start,text:r.parent?.type==="Property"&&r.parent.shorthand?n.name+':ports.'+n.name:'ports.'+n.name});}
body=edit(body,rewrite);
write("mcp-server/core-tool-dispatch.js",'"use strict";\n/** Typed tool dispatch. Ports expose live runtime bindings; no token/capability constructor. */\nfunction createToolDispatch(ports){\n'+body+'\nreturn callTool;\n}\nmodule.exports=Object.freeze({createToolDispatch});\n');
// Initialise after all authority objects, before ordinary module exports/main.
s=edit(s,[{start:dispatch.start,end:dispatch.end,text:'// Typed implementation lives in core-tool-dispatch.js. The guarded wrapper remains here.\nlet coreToolDispatch;\nfunction callTool(name,args,executionContext){return coreToolDispatch(name,args,executionContext);}'}]);
const at=s.indexOf('module.exports = {');
s=s.slice(0,at)+'const coreDispatchPorts=Object.freeze({\n'+names.map(n=>'get '+n+'(){return '+n+';}').join(',\n')+'\n});\ncoreToolDispatch=require("./core-tool-dispatch").createToolDispatch(coreDispatchPorts);\n\n'+s.slice(at);
write("mcp-server/bridge-daemon.js",s);
write("config/core-module-boundaries.json",JSON.stringify({schema:"ae-agent.core-modules.v1",catalog:{file:"mcp-server/core-tool-catalog.js",inputs:deps},dispatch:{file:"mcp-server/core-tool-dispatch.js",liveReadOnlyPorts:names},execution:{file:"mcp-server/bridge-daemon.js",responsibility:"private brands, ALS, proposal/risk/dryrun/runner/ownership/idempotency/readback and guarded HTTP ingress"},state:{file:"mcp-server/project-state-store.js",responsibility:"persisted protection, ownership, review and lifecycle state"}},null,2)+"\n");
console.log(JSON.stringify({catalogInputs:deps.length,dispatchPorts:names.length,daemonLines:s.split('\n').length}));
