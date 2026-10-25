"use strict";

// One-time migration tooling. Never imported by the Core product runtime.
// Run with node --expose-internals; Acorn is Node's bundled parser, not a dependency.
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const acorn = require("internal/deps/acorn/acorn/dist/acorn");
const root = path.resolve(__dirname, "../.."), source = path.resolve(process.argv[2] || "");
if (!process.argv[2] || source === root) throw Error("explicit distinct source required");
const allowlist = JSON.parse(fs.readFileSync(path.join(source,"config/ae-agent-core-allowlist.json"),"utf8"));
const hash = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const write = (name, bytes) => { const file=path.join(root,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes); };
const origins=[];
for (const row of [...allowlist.sourcePaths,...allowlist.additionalPaths]) {
  if (origins.some(x=>x.path===row.path) || row.path==="package.json") continue;
  const bytes=fs.readFileSync(path.join(source,row.path)); write(row.path,bytes);
  origins.push({path:row.path,sourceSha256:hash(bytes),action:row.action});
}
write("config/source-provenance.json",JSON.stringify({schema:"ae-agent.core-provenance.v1",sourceCommit:allowlist.sourceCommit,checkpoint:allowlist.checkpoint,sourceRoot:allowlist.sourceRoot,paths:origins},null,2)+"\n");
const read = name => fs.readFileSync(path.join(root,name),"utf8");
const parse = text => acorn.parse(text,{ecmaVersion:"latest",locations:true});
const edits=(text,rows)=>rows.sort((a,b)=>b.start-a.start).reduce((s,e)=>s.slice(0,e.start)+(e.text||"")+s.slice(e.end),text);
const walk=(node,fn,parent=null)=>{if(!node||typeof node!=="object")return; if(node.type)fn(node,parent);for(const [k,v]of Object.entries(node)){if(["loc","start","end"].includes(k))continue;if(Array.isArray(v))for(const x of v)walk(x,fn,node);else if(v&&typeof v==="object")walk(v,fn,node);}};

let daemon=read("mcp-server/bridge-daemon.js");
// Whole top-level definitions are removed, never source line slices mid-function.
const excludeRanges=[[7391,8440],[8449,8480],[9312,9698],[7035,7249],[507,526],[902,912],[953,1012]];
const removedNames=new Set(["aiAgents","buildPlannerContext","solutionDiscovery","solutionCandidateQueue","reuseTelemetry","createNativeUsageStore","createCodeburnUsageAdapter","createUsageService","productionUsageTools","buildSolutionHintsForPrompt","buildRawExtendscriptFallbackCandidateInput","writeSolutionCandidateReport","validateRegistry","buildProjectIntentMemoryForPrompt","AI_CHAT_LOG_FILE","NATIVE_JOURNAL_FILE","nativeUsageStore","codeburnUsageAdapter","usageService","HARDCORE_SESSIONS_DIR","AGENT_SECRETS_FILE","DEV_REQUESTS_DIR"]);
let ast=parse(daemon), changes=[];
for(const node of ast.body){
  const names=[]; if(node.type==="VariableDeclaration")for(const d of node.declarations)walk(d.id,x=>{if(x.type==="Identifier")names.push(x.name);});
  if(excludeRanges.some(([a,b])=>node.loc.start.line>=a&&node.loc.end.line<=b) || names.some(n=>removedNames.has(n)))changes.push({start:node.start,end:node.end});
}
// Delete excluded HTTP routes, startup secret load and removed feature handler branches.
const forbidden=/\b(aiAgents|usageService|solutionDiscovery|solutionCandidateQueue|runAgentChatLogged|runAgentPlanLogged|runAgentHardcoreSession|createDevRequestBundle|launchCodexAppForDevRequest|readProjectIntentMemory|updateProjectIntentMemory|isProductionUsageTool|handleProductionUsageTool|captureRawExtendscriptFallbackCandidate|loadAgentSecrets)\b/;
walk(ast,(node,parent)=>{
  if(node.type==="IfStatement" && parent?.type==="BlockStatement" && forbidden.test(daemon.slice(node.start,node.end))){
    // Only the innermost branch owning the feature, never its containing server callback.
    const test=daemon.slice(node.test.start,node.test.end),body=daemon.slice(node.consequent.start,node.consequent.end);
    if((node.loc.start.line>=8705 && node.loc.end.line<=8728) || forbidden.test(test) || /url\.pathname/.test(test)&&(/\/usage|\/agents\/key|\/agents\/setup|\/agents\/log|\/agents\/chat|\/agents\/plan["']|\/agents\/hardcore|\/agents\/dev-request|\/agents\/codex|\/dev\/agents|=== ["']\/agents["']/.test(test) || forbidden.test(body)&&!test.includes("/agents/plan/")) || /name\s*===/.test(test)&&forbidden.test(body)&&!test.includes('build_solution_plan'))changes.push({start:node.start,end:node.end});
  }
  if(node.type==="ExpressionStatement" && /^(loadAgentSecrets\(|try \{)/.test(daemon.slice(node.start,node.end)) && forbidden.test(daemon.slice(node.start,node.end)))changes.push({start:node.start,end:node.end});
});
// Coalesce nested removals before rewriting offsets.
changes=changes.filter((x,i,a)=>!a.some((y,j)=>j!==i&&y.start<=x.start&&y.end>=x.end&&(y.start<x.start||y.end>x.end||j<i)));
daemon=edits(daemon,changes);
daemon=daemon.replace('require("./project-intent-memory")','require("./project-state-store")');
daemon=daemon.replace(/\s*aiAgents: aiAgents\.agentSummary\(\),/g,"");
daemon=daemon.replace(/\s*\.\.\.productionUsageTools,|\s*\.\.\.solutionCandidateQueue\.solutionCandidateQueueTools,/g,"");
daemon=daemon.replace('...solutionDiscovery.discoveryTools,','...require("./core-plan-catalog").planTools,');
daemon=daemon.replace('solutionDiscovery.knownSolution(args.solutionId, tools);','require("./core-plan-catalog").assertSupportedBuilder(args.solutionId);');
daemon=daemon.replace(/\s*let eligibleSolutionIds = \[\];\s*try \{ eligibleSolutionIds = solutionDiscovery\.reviewedIds\(\); \} catch \(_registryError\) \{\}\s*run\.solutionReuse = reuseTelemetry\.summarizeRun\(run, prepared\.plan, eligibleSolutionIds\);/g,"");
daemon=daemon.replace('...run.solutionReuse, ',"");

write("mcp-server/bridge-daemon.js",daemon);

// Retain descriptors as data; discovery/registry is deliberately absent.
const discovery=fs.readFileSync(path.join(source,"mcp-server/solution-discovery.js"),"utf8"), da=parse(discovery);
const array=da.body.find(n=>n.declarations?.[0]?.id.name==="discoveryTools").declarations[0].init;
const retained=array.elements.filter(n=>["get_current_ai_agent_plan","build_solution_plan","propose_ai_agent_plan"].includes(n.properties.find(p=>p.key.name==="name").value.value));
let descriptors=retained.map(n=>discovery.slice(n.start,n.end)).join(",\n");
descriptors=descriptors.replace(/using the solution-specific contract returned by get_solution/g,"using a fixed supported builder contract").replace(/ per the supported builder input contract returned by get_solution/g," per the supported deterministic builder input contract");
write("mcp-server/core-plan-catalog.js",'"use strict";\nconst planTools = [\n'+descriptors+'\n];\nconst SUPPORTED_BUILDERS=Object.freeze([...require("./solution-plan-builder").SUPPORTED_SOLUTION_IDS || [],"guarded-project-lifecycle","published-save-as-state-only-recovery","comp-visual-review-plan","text-visual-review-plan","montage-pipeline-plan"]);\nfunction assertSupportedBuilder(id){if(typeof id!=="string"||!SUPPORTED_BUILDERS.includes(id))throw Object.assign(Error("Unsupported Core plan builder"),{code:"unsupported_core_plan_builder"});return id;}\nmodule.exports=Object.freeze({planTools,SUPPORTED_BUILDERS,assertSupportedBuilder});\n');

const state=fs.readFileSync(path.join(source,"mcp-server/project-intent-memory.js"),"utf8");
const stateStart=state.indexOf('const PROJECT_STATE_SCHEMA =');
const stateEnd=state.lastIndexOf('module.exports =');
write("mcp-server/project-state-store.js",'"use strict";\nconst fs=require("fs"),path=require("path"),crypto=require("crypto"),zlib=require("node:zlib"),placeholderProtection=require("./placeholder-protection");\nconst REPO_ROOT=path.resolve(__dirname,"../..");\nfunction isPlainObject(value){return value!==null&&typeof value==="object"&&!Array.isArray(value);}\n'+state.slice(stateStart,stateEnd)+'\nmodule.exports={PROJECT_STATE_SCHEMA,canonicalSavedProject,projectStateKey,projectStatePath,validateProjectStateStore,loadProjectStateStore,readProjectState,createProjectStateController,PACKED_REVIEW_SCHEMA,MAX_PACKED_STATE_BYTES,MAX_REVIEW_LOGICAL_BYTES,MAX_STATE_LOGICAL_BYTES,packCanonicalReview,unpackCanonicalReview,transformReviewStore,serializeProjectStateStore,atomicProjectStateWrite,checkInheritedOwnershipSteps,assertInheritedRegistration};\n');
fs.unlinkSync(path.join(root,"mcp-server/project-intent-memory.js"));
// All retained literal consumers must use the state/protection implementation.
for(const name of fs.readdirSync(path.join(root,"mcp-server"))){if(!name.endsWith(".js"))continue;const file="mcp-server/"+name;write(file,read(file).replaceAll('require("./project-intent-memory")','require("./project-state-store")'));}
console.log(JSON.stringify({copied:origins.length,destination:root}));

