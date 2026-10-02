"use strict";

const fs = require("node:fs");
const path = require("node:path");
const completion = require("../mcp-server/ae-task-completion");

function main(argv) {
  if (argv.length !== 1 || typeof argv[0] !== "string") throw Object.assign(new Error("Usage: node scripts/ae-task-completion.js <input.json>"),{code:"completion_input_file_required"});
  const inputFile = path.resolve(argv[0]);
  if (!fs.statSync(inputFile).isFile() || fs.statSync(inputFile).size > completion.JSON_LIMIT) throw Object.assign(new Error("completion_input_budget_exceeded"),{code:"completion_input_budget_exceeded"});
  const input = JSON.parse(fs.readFileSync(inputFile,"utf8"));
  const options = completion.loadConfiguredOptions(path.resolve(__dirname,".."));
  return completion.buildTaskCompletion(input,options);
}
if (require.main === module) {
  try {
    const result = main(process.argv.slice(2));
    process.stdout.write(JSON.stringify(result) + "\n");
    process.exitCode = result.isError ? 1 : 0;
  } catch (error) {
    process.stdout.write(JSON.stringify({schema:completion.SCHEMA,isError:true,errorCode:error.code || "completion_input_invalid",error:String(error.message).slice(0,240)}) + "\n");
    process.exitCode = 1;
  }
}
module.exports = {main};
