"use strict";
// Actual disabled historical entrypoints; none may reach credential/native work.
const assert=require("node:assert/strict"),repair=require("../mcp-server/core-runtime-repair");
async function main(){assert.throws(()=>repair.authorizeExactStop(),/historical_not_armable/);assert.throws(()=>repair.createTransition(),/historical_not_armable/);await assert.rejects(()=>repair.createExecutor(),/historical_not_armable/);console.log(JSON.stringify({ok:true,checks:3,scope:"historical_stop_case_not_armable",nativeCalls:0,actualGrantCreated:false,liveProof:false}));}
main().catch(e=>{console.error(e.stack);process.exitCode=1;});
