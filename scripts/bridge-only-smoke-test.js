"use strict";

const {startDaemon} = require("./network-test-fixture");

const token = "bridge-only-smoke-test-token";
const panelToken = `${token}-panel`;

async function main() {
  const fixture = await startDaemon({
    automationToken: token,
    panelToken,
    devAdmin: false
  });
  try {
    const health = await fixture.request({path: "/health"});
    if (!health.body.ok || health.body.version !== "3.3.1") {
      throw new Error("Unexpected daemon health response");
    }
    console.log(JSON.stringify({
      ok: true,
      health: health.body,
      logs: fixture.stderr.trim().split(/\n+/).filter(Boolean)
    }, null, 2));
  } finally {
    await fixture.stop();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
