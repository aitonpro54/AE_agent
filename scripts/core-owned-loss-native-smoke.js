"use strict";
const path=require("node:path"),assert=require("node:assert/strict"),{execFileSync}=require("node:child_process"),win=require("../mcp-server/owned-runtime-win32");
const out=execFileSync(win.POLICY.executable,["-NoLogo","-NoProfile","-NonInteractive","-File",path.join(__dirname,"core-owned-loss-native-smoke.ps1")],{encoding:"utf8",windowsHide:true,timeout:30000,maxBuffer:65536});const result=JSON.parse(out.trim().split(/\r?\n/).at(-1));assert.equal(result.ok,true);assert.equal(result.nativeCalls,0);console.log(JSON.stringify(result));
