"use strict";

// Own Node process only: no AE module load, pipe open or issuer provision.
const assert = require("node:assert/strict");
const path = require("node:path");
const adapter = require(path.resolve(process.argv[2]));
assert.deepEqual(Object.keys(adapter).sort(), ["exchange", "selfIdentity", "sign"]);
assert.throws(() => adapter.sign("schema=invalid\n"), /issuer_pin_missing_or_invalid/);
assert.throws(() => adapter.exchange("", ""), /signed_frame_limit/);
assert.throws(() => adapter.exchange("one"), /adapter_argument_count_invalid/);
const self = JSON.parse(adapter.selfIdentity());
assert.equal(self.pid, process.pid);
assert.match(self.birth100ns, /^[1-9][0-9]+$/);
assert.match(self.imageSha256, /^[a-f0-9]{64}$/);
process.stdout.write(JSON.stringify({
  status: "passed", checks: 7, nodeAddonLoaded: true, hostLoaded: false,
  issuerProvisioned: false, ipcExchangeAttempted: false,
  scope: "owned Node N-API ABI, self identity and early refusals only",
}) + "\n");
