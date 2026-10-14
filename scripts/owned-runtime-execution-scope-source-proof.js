"use strict";
// Generates the exact production byte codec for a parent-run isolated C++
// scope test. This script never compiles/runs native code or opens authority.
const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict"),crypto=require("node:crypto");
const root=path.resolve(__dirname,".."),source=fs.readFileSync(path.join(root,"native/owned-runtime-local-session/enrollment_win32.cpp"),"utf8");
const lines=["void PutU16(","void PutU32(","void PutU64(","void PutPin("].map(start=>{const begin=source.indexOf(start),end=source.indexOf("\n",begin);assert(begin>=0&&end>begin);const line=source.slice(begin,end).trim();assert(line.endsWith("}"));return line;});
assert(lines[3].includes("Put(b,p.volumeGuid);PutU64(b,p.serial);Put(b,p.fileId);"));
const header="#pragma once\n// Exact codec statements captured from enrollment_win32.cpp.\nnamespace local_session::detail {\nnamespace {template<class T>void Put(std::vector<unsigned char>& bytes,const T& value){bytes.insert(bytes.end(),value.begin(),value.end());}}\n"+lines.join("\n")+"\n}\n";
const option=process.argv.indexOf("--header");if(option>=0){const destination=path.resolve(process.argv[option+1]||"");assert(destination!==root);fs.writeFileSync(destination,header,"utf8");}
const scope=fs.readFileSync(path.join(root,"native/owned-runtime-local-session/trusted_execution.cpp"),"utf8");assert(scope.includes("detail::PutPin(bytes,policy.snapshotRoot)"));
assert(scope.includes("static_cast<std::uint16_t>(policy.rangeMode)")&&scope.includes("static_cast<std::uint16_t>(policy.sampleMode)"));
process.stdout.write(JSON.stringify({schema:"ae-agent.execution-scope-codec-fixture.v1",ok:true,sourceCodecSha256:crypto.createHash("sha256").update(lines.join("\n")).digest("hex"),headerSha256:crypto.createHash("sha256").update(header).digest("hex"),nativeTestCount:15,nativeTestsRun:false,compilerRun:false,authority:false,effects:0})+"\n");
