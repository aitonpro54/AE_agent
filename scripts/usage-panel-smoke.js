"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "cep-panel", "index.html"), "utf8");
const panel = fs.readFileSync(path.join(root, "cep-panel", "panel.js"), "utf8");

assert(html.includes('id="usageRefreshButton"'), "Usage UI needs an explicit manual refresh button.");
assert(html.includes('id="usageStatusList"'), "Usage UI needs a bounded status list.");
assert(html.includes("Native bridge calls and CodeBurn aggregates stay separate"));
assert(html.includes("Quota is not a dollar estimate"));
assert(panel.includes('request("GET", "/usage"'), "Panel should load cached/native usage without invoking CodeBurn.");
assert(panel.includes('request("POST", "/usage/refresh"'), "Panel should invoke CodeBurn only on manual refresh.");
assert(panel.includes('usageRefreshButton.addEventListener("click", refreshUsage)'), "CodeBurn refresh must be user initiated.");
assert(!/setInterval\s*\(\s*refreshUsage/.test(panel), "Usage refresh must not scan on an interval.");
assert(panel.includes("no model × project inference"), "UI must state the real aggregate granularity.");
assert(panel.includes("estimate, not subscription billing"), "API-equivalent dollars must be secondary and labelled.");

console.log(JSON.stringify({ ok: true, checked: ["USG07", "USG11", "USG12", "USG15", "USG17"] }, null, 2));
