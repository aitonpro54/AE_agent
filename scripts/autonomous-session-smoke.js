"use strict";
// The temporary TTL contract was replaced by persistent desiredEnabled.
// Keep the historical group entrypoint and run the stronger current contract.
require("./persistent-autonomy-smoke");
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const panelJs = fs.readFileSync(path.join(__dirname,"../cep-panel/panel.js"),"utf8");
const panelHtml = fs.readFileSync(path.join(__dirname,"../cep-panel/index.html"),"utf8");
assert(panelHtml.includes("Автономная сессия Codex"));
assert(panelHtml.includes("Raw JSX и удаление требуют обычного подтверждения"));
assert(/request\(\s*"POST"\s*,\s*"\/autonomy\/session"\s*,/.test(panelJs), "autonomy toggle posts to the session endpoint");
assert(/"autonomy\.set"\s*:\s*function\([^)]*\)\s*\{\s*if\s*\(context\.submit\(\)\)\s*setAutonomousSessionEnabled\(args\.enabled,\s*done\)/.test(panelJs), "autonomy.set dispatches to the session setter");
assert(/onControl\(\s*autonomousSessionButton\s*,\s*"click"\s*,\s*"autonomy\.set"/.test(panelJs), "autonomy button dispatches the typed set action");
assert(!panelJs.includes('localStorage.setItem("codexAeAutonomous'), "UI cache cannot authorize autonomy");
