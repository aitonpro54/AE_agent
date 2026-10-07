#!/usr/bin/env node
"use strict";
const fs=require("node:fs"),path=require("node:path");
const control=require("../mcp-server/cep-panel-control");
const contract=require("../cep-panel/panel-action-contract");
const MAX_INPUT_FILE_SIZE_BYTES=64*1024;
function fail(code) {throw Object.assign(new Error(code),{code});}
function parseCliArgs(argv) {
  const args=argv.slice(2);if(args.some(value=>typeof value!=="string"))fail("invalid_cli_argument");
  const command=args.shift() || "help";
  if(!["help","catalog","state","invoke","result"].includes(command))fail("unknown_command");
  const allowed={help:[],catalog:["--timeout"],state:["--timeout"],invoke:["--input","--wait","--timeout"],result:["--request-id","--timeout"]}[command];
  const options={command},seen=new Set();
  while(args.length) {
    const flag=args.shift();
    if(["--expression","--selector","--url","--token","--script","--eval","--exec"].includes(flag))fail("forbidden_cli_flag");
    if(!allowed.includes(flag) || seen.has(flag))fail("invalid_cli_argument");
    seen.add(flag);
    if(flag==="--wait"){options.wait=true;continue;}
    const value=args.shift();if(!value || value.startsWith("--"))fail("missing_cli_value");
    if(flag==="--input")options.inputFile=value;
    if(flag==="--request-id"){if(!contract.UUID_REGEX.test(value))fail("invalid_request_id");options.requestId=value;}
    if(flag==="--timeout"){
      if(!/^[1-9][0-9]*$/.test(value) || Number(value)>60000)fail("invalid_timeout");
      options.timeoutMs=Number(value);
    }
  }
  if(command==="invoke" && !options.inputFile)fail("missing_input_argument");
  if(command==="result" && !options.requestId)fail("missing_request_id_argument");
  return options;
}
function readInput(file) {
  let fd;
  try {
    const resolved=path.resolve(file),stat=fs.lstatSync(resolved);
    if(!stat.isFile() || stat.isSymbolicLink())fail("input_file_not_regular");
    if(stat.size>MAX_INPUT_FILE_SIZE_BYTES)fail("input_file_too_large");
    fd=fs.openSync(resolved,"r");
    const current=fs.fstatSync(fd);
    if(!current.isFile() || current.dev!==stat.dev || current.ino!==stat.ino)fail("input_file_changed");
    const buffer=Buffer.alloc(MAX_INPUT_FILE_SIZE_BYTES+1);
    const bytes=fs.readSync(fd,buffer,0,buffer.length,0);
    if(bytes>MAX_INPUT_FILE_SIZE_BYTES)fail("input_file_too_large");
    let payload;try{payload=JSON.parse(buffer.subarray(0,bytes).toString("utf8"));}catch(_){fail("input_file_invalid_json");}
    control.validateRawInvokeInput(payload);
    return payload;
  }catch(error){throw Object.assign(new Error(error.code || "input_file_unavailable"),{code:error.code || "input_file_unavailable"});}
  finally{if(fd!==undefined)fs.closeSync(fd);}
}
async function run(argv,serviceFactory=control.createPanelControlService) {
  const options=parseCliArgs(argv);
  if(options.command==="help")return {ok:true,protocolVersion:control.PROTOCOL_VERSION,command:"help",commands:{
    help:"help (offline)",catalog:"catalog [--timeout <ms>]",state:"state [--timeout <ms>]",
    invoke:"invoke --input <json-file> [--wait] [--timeout <ms>]",
    result:"result --request-id <uuid> [--timeout <ms>]"
  },notes:"Fixed loopback CDP 127.0.0.1:8870. Existing panel gates and receipts apply; input UUID is required. No daemon start or panel bootstrap."};
  // Input validation precedes service construction, filesystem receipts and CDP.
  const input=options.command==="invoke"?readInput(options.inputFile):null,service=serviceFactory();
  if(options.command==="catalog")return service.catalog(options.timeoutMs);
  if(options.command==="state")return service.state({},options.timeoutMs);
  if(options.command==="result")return service.getResult(options.requestId,options.timeoutMs);
  const extra={};if(options.wait!==undefined)extra.wait=options.wait;if(options.timeoutMs!==undefined)extra.timeoutMs=options.timeoutMs;
  return service.invoke(input,extra);
}
if(require.main===module) {
  run(process.argv).catch(error=>({ok:false,code:error.code || "cli_failed",error:error.code || "CLI failed."})).then(result=>{
    process.stdout.write(JSON.stringify(contract.redactState(result))+"\n");if(!result.ok)process.exitCode=1;
  });
}
module.exports={parseCliArgs,readInput,run,MAX_INPUT_FILE_SIZE_BYTES};
