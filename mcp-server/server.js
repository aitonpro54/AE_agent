#!/usr/bin/env node
"use strict";

const wantsDaemon = process.argv.includes("--bridge-only")
  || process.argv.includes("--daemon")
  || process.env.AE_BRIDGE_ONLY === "1";

if (wantsDaemon) {
  require("./bridge-daemon");
} else {
  require("./mcp-adapter");
}
