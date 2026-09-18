"use strict";

const fs = require("fs");
const path = require("path");
const { reduceCandidateReview } = require("../mcp-server/solution-candidate-review");

// Read-only CLI: writes only JSON to stdout, never candidate/registry files.
function main(argv) {
  if (argv.length !== 1 || argv[0] === "--help") {
    console.log("Usage: node scripts/solution-candidate-review.js <review-input.json>\nAE_SOLUTION_CANDIDATE_DIR selects local quarantine. Output is a proposal, not promotion approval.");
    return argv[0] === "--help" ? 0 : 1;
  }
  const file = path.resolve(argv[0]);
  if (fs.statSync(file).size > 64000) throw new Error("Review input exceeds 64000 bytes.");
  const input = JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
  const registry = JSON.parse(fs.readFileSync(path.join(__dirname, "../registry/solutions.json"), "utf8"));
  const result = reduceCandidateReview(input, { registry });
  console.log(JSON.stringify(result, null, 2));
  return result.status === "blocked" ? 2 : 0;
}

if (require.main === module) {
  try { process.exitCode = main(process.argv.slice(2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}

module.exports = { main };
