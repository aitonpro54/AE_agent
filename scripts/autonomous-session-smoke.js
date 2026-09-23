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
assert(panelJs.includes('request("POST", "/autonomy/session"'));
assert(panelJs.includes('autonomousSessionButton.addEventListener("click", toggleAutonomousSession)'));
assert(!panelJs.includes('localStorage.setItem("codexAeAutonomous'), "UI cache cannot authorize autonomy");
