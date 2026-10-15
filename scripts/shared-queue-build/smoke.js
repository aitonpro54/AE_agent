"use strict";
// Pure byte/source correspondence. Synthetic pins below are labeled fixtures;
// they are never persisted as installation inputs or passed to native code.
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const c = require("./codec"), p = require("./profile"), collect = require("./collect"), assemble = require("./assemble");
const cli = require("./cli");
let groups = 0; function check(name, run) { run(); groups++; console.log("PASS " + name); }
const id = n => n.toString(16).padStart(32, "0"), hash = n => n.toString(16).padStart(64, "0"), fixturePin = n => ({ volumeGuidHex: id(1), fileIdHex: id(n), serial: "18446744073709551000", canonicalPath: "\\\\?\\Volume{11111111-1111-4111-8111-111111111111}\\fixture-" + n });
const expected = { installation: id(11), lineage: id(12), staticCodeHash: hash(13), policyHash: hash(14), fixedProfileHash: hash(15), setupNamespace: fixturePin(16), creator: { pin: fixturePin(17), sha256: hash(18) }, node: { pin: fixturePin(19), sha256: hash(20) }, userSid: "S-1-5-21-1-2-3-1001", anchorPath: fixturePin(21).canonicalPath, repository: fixturePin(22), runtime: fixturePin(23), generatedBuildInputsHash: hash(24), artifactSetHash: hash(25) };
const rawPrepare = Buffer.concat([c.header("OWNLCP01", 1, 0, 424), Buffer.from(id(26), "hex"), c.u64("132000000000000001"), Buffer.from(expected.installation, "hex"), Buffer.from(expected.lineage, "hex"), Buffer.from(expected.staticCodeHash, "hex"), Buffer.from(expected.policyHash, "hex"), c.pin(fixturePin(21)), c.pin(expected.setupNamespace), c.pin(expected.creator.pin), Buffer.from(expected.creator.sha256, "hex"), Buffer.from(expected.fixedProfileHash, "hex"), c.pin(expected.node.pin), Buffer.from(expected.node.sha256, "hex"), c.domain("lcs.production.sid.v1", Buffer.from(expected.userSid, "utf16le"))]);
let original;
check("prepare424 verifies exact original image source policy node SID and 64-bit pins", () => {
  original = c.prepare(rawPrepare, expected); assert.equal(rawPrepare.length, 424); assert.equal(original.anchor.serial, fixturePin(21).serial); assert.equal(original.birth, "132000000000000001");
  for (const offset of [0, 8, 10, 12, 40, 56, 72, 104, 176, 216, 256, 288, 320, 360, 392]) { const changed = Buffer.from(rawPrepare); changed[offset] ^= 1; assert.throws(() => c.prepare(changed, expected)); }
});
check("seal and final ACK are exact80 bytes with original nonce birth frame SHA", () => {
  for (const [magic, kind] of [["OWNLCPS1", 3], ["OWNLCA01", 2]]) { const ack = c.ack(magic, kind, original, rawPrepare); assert.equal(ack.length, 80); assert(ack.subarray(0, 16).equals(c.header(magic, 1, kind, 80))); assert(ack.subarray(40, 72).equals(c.sha(rawPrepare))); assert.equal(ack.readBigUInt64LE(72), 0n); }
});
check("final752 binds original anchor artifact set M and resulting native pins", () => {
  const raw = Buffer.concat([c.header("OWNLCP02", 2, 1, 752), Buffer.from(original.nonceHex, "hex"), c.u64(original.birth), Buffer.from(expected.installation, "hex"), Buffer.from(expected.lineage, "hex"), Buffer.from(expected.policyHash, "hex"), ...[expected.repository, expected.runtime, fixturePin(30), fixturePin(31), fixturePin(32), fixturePin(33)].map(c.pin), Buffer.from(hash(34), "hex"), Buffer.from(expected.policyHash, "hex"), c.pin(expected.creator.pin), Buffer.from(expected.creator.sha256, "hex"), c.pin(original.anchor), Buffer.from(hash(35), "hex"), Buffer.from(expected.staticCodeHash, "hex"), Buffer.from(expected.generatedBuildInputsHash, "hex"), Buffer.from(expected.artifactSetHash, "hex"), Buffer.from(expected.fixedProfileHash, "hex"), c.pin(expected.setupNamespace), c.domain("lcs.production.sid.v1", Buffer.from(expected.userSid, "utf16le"))]);
  const decoded = c.final(raw, original, expected); assert.equal(raw.length, 752); assert.equal(decoded.installation.fileIdHex, id(30)); assert(decoded.lock.canonicalPath.endsWith(".initial-owned-fence.lock"));
  for (const offset of [0, 8, 10, 12, 16, 32, 40, 56, 72, 104, 144, 408, 448, 480, 552, 584, 616, 648, 680, 720]) { const changed = Buffer.from(raw); changed[offset] ^= 1; assert.throws(() => c.final(changed, original, expected)); }
});
check("normalized header replaces the one own field by binary zeros and rejects encodings", () => {
  const raw = Buffer.from("#pragma once\n" + c.MARKER + "0".repeat(64) + '";\n'); const other = Buffer.from(raw); Buffer.from(hash(42)).copy(other, c.normalizeHeader(raw).start);
  assert(c.normalizeHeader(raw).digest.equals(c.normalizeHeader(other).digest));
  for (const bad of [Buffer.from(raw.toString().replaceAll("\n", "\r\n")), Buffer.concat([Buffer.from([239, 187, 191]), raw]), Buffer.concat([raw, raw]), Buffer.concat([raw, Buffer.from([0])])]) assert.throws(() => c.normalizeHeader(bad));
});
check("M uses exact ordered rows and normalized generated field without a hash cycle", () => {
  const header = Buffer.from(c.MARKER + "0".repeat(64) + '";\n'), rows = [1, 2, 3, 4, 5, 6].map(code => ({ code, file: { pin: fixturePin(50 + code) }, bytes: code === 1 ? header : Buffer.from("fixture-" + code) })), definition = { fixedProfileHash: hash(60), staticCodeHash: hash(61) };
  const first = c.buildManifest(definition, fixturePin(62), rows); Buffer.from(first.generatedBuildInputsHash).copy(header, c.normalizeHeader(header).start);
  const second = c.buildManifest(definition, fixturePin(62), rows); assert(first.bytes.equals(second.bytes)); assert.equal(first.bytes.length, 124 + 76 * 6); assert.equal(first.bytes.subarray(0, 8).toString(), "OWNLBI01");
  assert.throws(() => c.buildManifest(definition, fixturePin(62), [rows[1], rows[0], ...rows.slice(2)]));
});
check("typed C++ pin preserves ulong serial and refuses unknown expression fields", () => {
  const literal = p.objectPin(fixturePin(70)); assert(literal.includes("18446744073709551000ULL")); assert.throws(() => p.objectPin({ ...fixturePin(70), injected: "system()" }));
  assert.throws(() => p.validate({ schema: "fake", enrollment: {}, definition: {}, trustedRead: {}, build: {}, census: {} }));
});
check("launch locator is a reviewed ordinary Windows path; canonical volume pins stay separate", () => {
  assert.equal(p.ordinaryLaunchLocator("C:/Program Files (x86)/Build Tools/MSBuild.exe"), "C:\\Program Files (x86)\\Build Tools\\MSBuild.exe");
  for (const rejected of [fixturePin(80).canonicalPath, "\\\\server\\share\\MSBuild.exe", "MSBuild.exe", "C:MSBuild.exe", "C:\\tools\\..\\other.exe", "C:\\tools\\x\n.exe"]) assert.throws(() => p.ordinaryLaunchLocator(rejected), /ordinary_launch_locator_required/);
  const physical = fixturePin(80), serialized = p.objectPin(physical); assert(serialized.includes("Volume{")); assert.equal(physical.serial, "18446744073709551000");
});
check("startup gate accepts exactly fragmented GO plus EOF before main and rejects all other input", () => {
  const environment = { [cli.STARTUP_ENV]: "1" };
  const driver = fs.readFileSync(path.resolve(__dirname, "../owned-runtime-shared-queue-build.ps1"), "utf8"), go = /ASCII\.GetBytes\("([^"\r\n]+)"\)/.exec(driver);
  assert(go); assert.equal(go[1].replaceAll("`n", "\n"), cli.STARTUP_GO); assert(driver.includes("Environment['" + cli.STARTUP_ENV + "']='1'")); assert(driver.includes("StandardInputEncoding=[Text.UTF8Encoding]::new($false)"));
  function reader(raw, maximum = 1) { const bytes = Buffer.from(raw, "ascii"); let at = 0; return (destination, offset, length) => { const count = Math.min(maximum, length, bytes.length - at); bytes.copy(destination, offset, at, at + count); at += count; return count; }; }
  for (const fragment of [1, 2, 7, 1024]) assert.equal(cli.waitForStartup(environment, reader(cli.STARTUP_GO, fragment)), true);
  for (const bad of ["", cli.STARTUP_GO.slice(0, -1), cli.STARTUP_GO.replace("GO", "NO"), cli.STARTUP_GO.replace("\n", "\r\n"), cli.STARTUP_GO + "x", cli.STARTUP_GO + cli.STARTUP_GO]) assert.throws(() => cli.waitForStartup(environment, reader(bad)), /production_startup_/);
  assert.throws(() => cli.waitForStartup({ [cli.STARTUP_ENV]: "true" }, () => { throw Error("must not read"); }), /exact_startup_handshake_required/);
  assert.equal(cli.waitForStartup({}, () => { throw Error("direct pure entry must not read stdin"); }), false);
});
check("full typed header generator selects the native shared policy without media or caller C++", () => {
  const file = n => ({ components: ["fixture-" + n], pin: fixturePin(n), sha256: hash(n) }), generated = n => ({ ...file(n), sha256: "0".repeat(64) }), late = n => ({ components: ["fixture-" + n], canonicalPath: fixturePin(n).canonicalPath });
  const enrollment = { canonicalVolumeAnchor: "\\\\?\\Volume{11111111-1111-4111-8111-111111111111}\\", repositoryComponents: ["repo"], runtimeComponents: ["repo", "runtime"], repositoryAncestors: [fixturePin(1), fixturePin(2)], runtimeAncestors: [fixturePin(1), fixturePin(2), fixturePin(3)], repository: fixturePin(2), runtime: fixturePin(3), userSid: expected.userSid, installation: id(4), lineage: id(5), launchTarget: id(6), stopTarget: id(7), actorTarget: id(8), authorizationAudit: hash(9), policyHash: hash(10), sourceSetHash: hash(11), policyEpoch: "1", maximumSessionMs: 28800000, maximumLeaseMs: 60000, capabilities: 0x07ff, enabled: true, sourceFiles: [file(12)], node: file(13), controllerImage: file(13), inventories: Array.from({ length: 6 }, (_, i) => ({ components: ["inventory-" + i], absent: true })) };
  const definition = { setupNamespace: fixturePin(14), setupComponents: ["setup"], anchorComponents: ["setup", "anchor"], setupAncestors: [fixturePin(1), fixturePin(2), fixturePin(14)], fixedProfileHash: hash(15), staticCodeHash: hash(11), transportProfileHash: hash(16), artifacts: [1, 2, 3].map(code => ({ code, components: ["artifact-" + code] })), dependencies: Array.from({ length: 10 }, (_, i) => ({ code: i + 1, file: file(20 + i) })), buildInputs: [1, 2, 3, 4, 5, 6].map(code => ({ code, file: code <= 3 ? generated(30 + code) : file(30 + code) })), automationCredential: file(40), panelCredential: file(41), buildInputManifest: generated(42) };
  const execution = { policyHash: hash(43), typedProducerHash: hash(44), restorationLeaf: hash(45), checkpointLeaf: hash(46), cleanCopyLeaf: hash(47), ameTargetSpecifier: "ame-26.0", variants: [1, 2].map(i => ({ variantId: "variant-" + i, rootName: "FIXTURE_EXPECTATION", compName: "FIXTURE_EXPECTATION", workingName: i === 1 ? "titr_all-first-working.aep" : "titr_all-second-working.aep", snapshotName: "snapshot-" + i + ".aep", outputName: "output-" + i + ".mov" })), sourceProject: file(48), ame: file(49), preset: file(50), sourceProjectLocator: "C:\\fixture\\source.aep", snapshotRoot: fixturePin(51), outputRoot: fixturePin(52), manualQueueReservationRoot: fixturePin(53), snapshotLocator: "C:\\fixture\\snapshots", outputLocator: "C:\\fixture\\outputs", ameLocator: "C:\\fixture\\ame.exe", manualQueueReservationLocator: "C:\\fixture\\starts", jobDeadlineMs: 3600000 };
  const trustedRead = { broker: late(54), addon: late(55), adapter: file(56), ae: file(57), cepImages: [file(58)], panelFiles: Array.from({ length: 8 }, (_, i) => file(60 + i)), nodeSources: [{ selector: 1, compiled: hash(70), url: "node:inspector", roles: 3, category: "NodeDefault", contextSlot: "Default", endLine: 0, endColumn: 7, length: 7, utf8ByteLength: 7 }], controllerSourceBytes: 7, daemonSourceBytes: 7, cepSources: [{ selector: 1, url: "", compiled: hash(71), startLine: 0, startColumn: 0, endLine: 0, endColumn: 7, length: 7, utf8ByteLength: 7, diagnostic: true, hasSourceURL: false, isModule: false, isLiveEdit: false }], cepSourceBytes: 7, cdpTargetUrl: "file:///fixture/index.html", cepContextOrigin: "file://", cepDiagnostic: "fixture", panelRoot: fixturePin(72), panelBootstrapRoot: fixturePin(73), transport: file(74), repository: "C:\\fixture\\repo", brokerLocator: "C:\\fixture\\broker.exe", addonLocator: "C:\\fixture\\addon.node", nodeLocator: "C:\\fixture\\node.exe", adapterLocator: "C:\\fixture\\adapter.js", aeLocator: "C:\\fixture\\ae.exe", panelBootstrapLocator: "C:\\fixture\\bootstrap", bridgePort: 3456, cdpPort: 8870, panelBootstrapDescriptor: hash(75), panelBootstrapTemplateHash: hash(76), projectLeaf: hash(77), projectScript: "fixture source only", projectScriptHash: hash(78), execution };
  const document = { schema: "ae-agent.shared-queue-production-build-inputs.v1", enrollment, definition, trustedRead, build: {}, census: {} }, headers = p.generate(document, fixturePin(79));
  assert.equal(Object.keys(headers).length, 3); const actual = headers["local_session_trusted_read_pins.h"];
  assert(actual.includes("ExecutionBudgetProfile::SharedTwoTitleQueue85")); assert(actual.includes("FixedSharedQueueCosts::Poll()")); assert(!actual.includes("p.ffmpeg=")); assert(!actual.includes("p.media="));
  assert.throws(() => p.generate({ ...document, trustedRead: { ...trustedRead, rawCpp: "system()" } }));
  c.normalizeHeader(Buffer.from(headers["local_session_production_artifact_pins.h"]));
});
check("pure programs use original named source generators without AE/native factories", () => {
  const result = collect.purePrograms(path.resolve(__dirname, "../.."), { schema: "ae-agent.owned-read-fixed-program.v1", rootName: "FIXTURE_EXPECTATION", compName: "FIXTURE_EXPECTATION", sourceProjectFile: "C:\\fixture\\source.aep", snapshotProjectFiles: ["C:\\fixture\\first.aep", "C:\\fixture\\second.aep"] });
  assert.equal(result.authority, false); assert.equal(result.nativeFactories, 0); assert(result.projectScript.includes("owned_read_current_pair_absent")); assert.equal(c.sha(Buffer.from(result.projectScript)).toString("hex"), result.projectScriptHash); assert(result.functionRows.some(row => row.name === "ownedTrustedReadProjectScript"));
});
check("transport requires pinned JSON with exact credential and never a JS module", () => {
  const parent = path.resolve(__dirname, "../../.codex-runtime/shared-queue-build-tests"); fs.mkdirSync(parent, { recursive: true }); const scratch = fs.mkdtempSync(path.join(parent, "transport-"));
  const tokenFile = path.join(scratch, "automation.token"), transportFile = path.join(scratch, "transport.json"); fs.writeFileSync(tokenFile, "fixture-token");
  const config = { transportConfigFile: transportFile, automationCredentialFile: tokenFile }, attempt = () => assemble.assemble({ config }, [], "S-1-5-21-fixture");
  try { for (const raw of ['"use strict";secret-not-for-output', JSON.stringify({ automationToken: "other", host: "127.0.0.1", port: 3456 }), JSON.stringify({ automationToken: "fixture-token", panelToken: "extra", host: "127.0.0.1", port: 3456 })]) { fs.writeFileSync(transportFile, raw); assert.throws(attempt, error => /^production_(?:exact_transport_config_required|transport_credential_mismatch)$/.test(error.code)); } }
  finally { assert.equal(path.dirname(scratch), parent); fs.rmSync(scratch, { recursive: true, force: true }); }
});
console.log(JSON.stringify({ ok: true, groups, authority: false, nativeFactories: 0, actualInspector: false, actualCdp: false, compilerInvoked: false, liveProof: false }));
