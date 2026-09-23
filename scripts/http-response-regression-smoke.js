"use strict";
const assert = require("assert");
const {writeJson,toolResult} = require("../mcp-server/bridge-daemon");
const {sanitizeAutomationResponse} = require("../mcp-server/http-boundary");
const secret="synthetic-manual-credential";
const proposal={confirmation:{confirmationToken:secret,confirmationTokenHash:"private-hash",surface:"cep-panel"}};
const nested={result:toolResult({m100ActionProposal:proposal,m100Message:{payload:proposal}})};
function serialize(role) {
  let text;
  writeJson({authRole:role,writeHead(){},end(value){text=value;}},200,nested);
  return text;
}
assert(!serialize("automation").includes(secret));
assert(!serialize("automation").includes("private-hash"));
assert(!serialize("admin").includes(secret));
assert(serialize("panel").includes(secret), "manual credential stays available only to panel");
assert.strictEqual(proposal.confirmation.confirmationToken,secret,"serialization must not mutate source proposal");
assert.strictEqual(JSON.parse(sanitizeAutomationResponse(nested).result.content[0].text).m100ActionProposal.confirmation.surface,"cep-panel");
console.log(JSON.stringify({ok:true,NET10:"actual toolResult + writeJson nested confirmation material is role filtered",providerCalls:0}));
