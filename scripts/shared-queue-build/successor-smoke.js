"use strict";
// Offline wire fixtures, built from the native store/intent layouts. These bytes
// never become installation inputs and no native or product factory is loaded.
const assert = require("node:assert/strict"), crypto = require("node:crypto");
const codec = require("./codec"), profile = require("./profile"), cli = require("./cli"), assembly = require("./assemble");
const { productionDocument, fixturePin, id, hash } = require("./fixtures");
const digest = raw => crypto.createHash("sha256").update(raw).digest();
const domain = (name, raw) => digest(Buffer.concat([Buffer.from(name + "\0", "ascii"), raw]));
const bytes = value => Buffer.from(value, "hex"), same = value => JSON.parse(JSON.stringify(value));
function pinBytes(pin) { const raw = Buffer.alloc(40); bytes(pin.volumeGuidHex).copy(raw); raw.writeBigUInt64LE(BigInt(pin.serial), 16); bytes(pin.fileIdHex).copy(raw, 24); return raw; }
function frame(magic, version, kind, size) { const raw = Buffer.alloc(size); raw.write(magic, "ascii"); raw.writeUInt16LE(version, 8); raw.writeUInt16LE(kind, 10); raw.writeUInt32LE(size, 12); return raw; }
function record(type, scope, lineage, payload, previous) {
  const raw = frame("OWNJRN01", 1, type, 228 + payload.length); scope.copy(raw, 16); bytes(lineage).copy(raw, 48); raw.writeBigUInt64LE(BigInt(type), 96);
  if (type === 2) { previous.copy(raw, 64); previous.copy(raw, 128); raw.writeBigUInt64LE(1n, 104); bytes(id(101)).copy(raw, 112); }
  // Genesis stable key deliberately has NO payload (store_win32.cpp StableKey).
  const kind = Buffer.from([type, 0]), epoch = Buffer.alloc(8);
  digest(type === 1 ? Buffer.concat([kind, scope]) : Buffer.concat([kind, scope, bytes(lineage), epoch, payload])).copy(raw, 160);
  raw.writeUInt32LE(payload.length, 192); payload.copy(raw, 196); digest(raw.subarray(0, -32)).copy(raw, raw.length - 32); return raw;
}
function closedFixture() {
  const document = productionDocument(), root = fixturePin(200).canonicalPath, pin = (n, suffix) => ({ ...fixturePin(n), canonicalPath: root + suffix });
  const repository = pin(200, ""), runtime = pin(201, "\\.codex-runtime\\closed"), lock = pin(202, "\\.codex-runtime\\closed\\.initial-owned-fence.lock"), journal = pin(203, "\\.codex-runtime\\closed\\journal");
  document.enrollment.repository = repository; document.enrollment.runtime = pin(204, "\\.codex-runtime\\successor"); document.definition.setupNamespace = pin(205, "\\.codex-runtime\\successor-setup");
  const installation = id(210), lineage = id(211), sid = document.enrollment.userSid, scopeBytes = Buffer.concat([bytes(installation), ...[repository, runtime, journal, lock].map(pinBytes)]), scope = digest(scopeBytes);
  const installationFile = Buffer.concat([Buffer.from("OWNLINS2"), bytes(installation), bytes(lineage), ...[repository, runtime, lock, journal].map(pinBytes)]);
  const policyFile = Buffer.alloc(83 + Buffer.byteLength(sid, "utf16le")); policyFile.write("OWNLPOL2"); policyFile.writeBigUInt64LE(1n, 8); policyFile.writeUInt16LE(0x07ff, 16); policyFile[18] = 1; policyFile.writeBigUInt64LE(28800000n, 19); policyFile.writeBigUInt64LE(60000n, 27); bytes(hash(212)).copy(policyFile, 35); bytes(lineage).copy(policyFile, 67); Buffer.from(sid, "utf16le").copy(policyFile, 83);
  // Independent nonzero launch/actor/stop IDs, none equal to installation.
  const selectors = Buffer.concat([bytes(id(213)), Buffer.from([2, 0, 2, 0]), bytes(id(214)), Buffer.from([3, 0]), bytes(id(215))]);
  const genesis = record(1, scope, lineage, Buffer.concat([scopeBytes, selectors])), owner = record(2, scope, lineage, bytes(id(101)), genesis.subarray(-32));
  const sealPin = pin(220, "\\.codex-runtime\\closed-setup\\production-artifacts.seal"), installPin = pin(221, "\\.codex-runtime\\closed\\.initial-owned-local.installation"), policyPin = pin(222, "\\.codex-runtime\\closed\\.initial-owned-local.policy");
  // V1 seal: fixed600 + two count-prefixed tables(3 artifacts,1 dependency)
  // + credential pairs144 + transport32 + domain integrity32.
  const seal = frame("OWNLCPA1", 1, 1, 1120); bytes(installation).copy(seal, 16); bytes(lineage).copy(seal, 32); digest(policyFile).copy(seal, 80); seal.writeBigUInt64LE(1n, 112);
  [sealPin, repository, runtime, document.definition.setupNamespace].forEach((p, i) => pinBytes(p).copy(seal, 184 + 40 * i)); domain("lcs.production.sid.v1", Buffer.from(sid, "utf16le")).copy(seal, 344);
  [installPin, policyPin, lock, journal].forEach((p, i) => pinBytes(p).copy(seal, 376 + 40 * i)); digest(installationFile).copy(seal, 536); digest(policyFile).copy(seal, 568);
  seal.writeUInt16LE(3, 600); for (let i = 0; i < 3; i++) seal.writeUInt16LE(i + 1, 604 + i * 76); seal.writeUInt16LE(1, 832); seal.writeUInt16LE(1, 836); domain("lcs.production.artifact-record.v1", seal.subarray(0, -32)).copy(seal, seal.length - 32);
  const file = (pin, raw) => ({ file: { components: ["fixture"], pin, sha256: digest(raw).toString("hex") }, bytes: String(raw.length) });
  const raw = { seal, installationFile, policyFile, records: [genesis, owner] };
  const spec = { installation, lineage, scopeHash: scope.toString("hex"), specificationHash: hash(1), repository, runtime, lock, journal, seal: file(sealPin, seal), installationFile: file(installPin, installationFile), policyFile: file(policyPin, policyFile), records: [file(pin(223, "\\.codex-runtime\\closed\\journal\\00000000000000000001.rec"), genesis), file(pin(224, "\\.codex-runtime\\closed\\journal\\00000000000000000002.rec"), owner)], userSid: sid, operatorAuthorization: document.enrollment.authorizationAudit };
  spec.specificationHash = codec.closedPredecessorSpecificationHash(spec); document.schema = "ae-agent.shared-queue-production-build-inputs.v2"; document.definition.closedPredecessor = spec;
  return { document, spec, raw, pin };
}
function intentFixture(document, spec, pin) {
  const original = { anchor: fixturePin(230), birth: "132000000000000001", nonceHex: id(231) }, creator = { components: ["fixture"], pin: fixturePin(232), sha256: hash(233) };
  const raw = frame("OWNLCSI1", 1, 1, 584), current = document.enrollment, definition = document.definition;
  const rows = [[16, bytes(codec.closedPredecessorStableKey(spec))], [48, bytes(spec.specificationHash)], [80, bytes(spec.installation)], [96, bytes(spec.lineage)], [112, bytes(spec.scopeHash)], [144, bytes(current.installation)], [160, bytes(current.lineage)], [176, pinBytes(current.repository)], [216, pinBytes(current.runtime)], [256, pinBytes(definition.setupNamespace)], [296, bytes(current.policyHash)], [328, bytes(definition.staticCodeHash)], [360, bytes(definition.fixedProfileHash)], [392, bytes(current.authorizationAudit)], [424, pinBytes(creator.pin)], [464, bytes(creator.sha256)], [504, bytes(original.nonceHex)], [520, domain("lcs.production.sid.v1", Buffer.from(current.userSid, "utf16le"))]];
  for (const [offset, value] of rows) value.copy(raw, offset); raw.writeBigUInt64LE(BigInt(original.birth), 496); domain("lcs.production.closed-predecessor-intent.v1", raw.subarray(0, 552)).copy(raw, 552);
  return { original, creator, raw, observation: { directory: false, bytes: "584", sha256: digest(raw).toString("hex"), pin: pin(234, "\\.codex-runtime\\closed\\.initial-owned-successor.intent") } };
}
let groups = 0; function check(name, run) { run(); groups++; console.log("PASS " + name); }
check("native-compatible exact genesis/owner pair accepts independent launch selector", () => {
  const { spec, raw } = closedFixture(); assert.equal(codec.validateClosedPredecessorBytes(spec, raw).records, 2);
});
check("genesis wrong key, zero/duplicate selectors, partial/third record and hashes fail", () => {
  for (const change of [r => r.records[0][160] ^= 1, r => r.records[0].fill(0, 372, 388), r => r.records[0].subarray(372, 388).copy(r.records[0], 392), r => r.records[0].writeUInt16LE(3, 388)]) {
    const { spec, raw } = closedFixture(); change(raw); digest(raw.records[0].subarray(0, -32)).copy(raw.records[0], raw.records[0].length - 32); spec.records[0].file.sha256 = digest(raw.records[0]).toString("hex"); spec.specificationHash = codec.closedPredecessorSpecificationHash(spec); assert.throws(() => codec.validateClosedPredecessorBytes(spec, raw));
  }
  for (const change of [r => r.records[0] = r.records[0].subarray(0, 400), r => r.records.push(Buffer.alloc(244)), r => r.seal[536] ^= 1]) { const { spec, raw } = closedFixture(); change(raw); assert.throws(() => codec.validateClosedPredecessorBytes(spec, raw)); }
});
check("584-byte intent binds every original/current field and observed identity/hash", () => {
  const { document, spec, pin } = closedFixture(), f = intentFixture(document, spec, pin), binding = cli.generationBinding(document, f.original, f.creator, f.observation, f.raw);
  assert.equal(binding.intentSha256, digest(f.raw).toString("hex")); assert.equal(binding.key, codec.closedPredecessorStableKey(spec));
  for (const offset of [0, 8, 10, 12, 16, 48, 80, 96, 112, 144, 160, 176, 216, 256, 296, 328, 360, 392, 424, 464, 496, 504, 520, 552]) {
    const raw = Buffer.from(f.raw); raw[offset] ^= 1;
    if (offset < 552) domain("lcs.production.closed-predecessor-intent.v1", raw.subarray(0, 552)).copy(raw, 552);
    assert.throws(() => cli.generationBinding(document, f.original, f.creator, { ...f.observation, sha256: digest(raw).toString("hex") }, raw));
  }
  for (const observation of [{ ...f.observation, sha256: hash(99) }, { ...f.observation, directory: true }, { ...f.observation, bytes: "583" }, { ...f.observation, pin: fixturePin(235) }]) assert.throws(() => cli.generationBinding(document, f.original, f.creator, observation, f.raw));
  assert.throws(() => cli.generationBinding(document, f.original, f.creator, f.observation, f.raw.subarray(0, 583)));
});
check("v1/v2 schema, final generation and actual binding remain fail closed", () => {
  const v1 = productionDocument(); assert.equal(cli.generationBinding(v1, {}), null); assert(profile.generate(v1, fixturePin(240))["local_session_production_artifact_pins.h"]);
  const { document, spec, pin } = closedFixture(), f = intentFixture(document, spec, pin), binding = cli.generationBinding(document, f.original, f.creator, f.observation, f.raw);
  assert(profile.generate(document)["local_session_installation_pins.h"].includes("p.closedPredecessor="));
  assert(profile.generate(document, f.original.anchor, hash(241), binding)["local_session_production_artifact_pins.h"].includes("p.closedPredecessorBinding="));
  assert.throws(() => profile.generate(document, f.original.anchor), /actual_successor_binding_required/); assert.throws(() => cli.generationBinding(document, f.original), /actual_successor_binding_required/);
  for (const key of ["key", "specificationHash", "intentSha256"]) { const bad = { ...binding, [key]: key === "intentSha256" ? "0".repeat(64) : hash(242) }; assert.throws(() => profile.generate(document, f.original.anchor, hash(241), bad)); }
  assert.throws(() => profile.generate(v1, f.original.anchor, hash(241), binding), /fresh_binding_forbidden/);
  for (const d of [{ ...document, schema: v1.schema }, { ...v1, schema: document.schema }]) assert.throws(() => profile.validate(d), /successor_schema_required/);
  const bad = same(document); bad.definition.closedPredecessor.scopeHash = hash(243); assert.throws(() => profile.validate(bad), /specification_hash_changed/);
});
check("only exact old fence request is transient, ordinary requests remain held", () => {
  const { document, spec } = closedFixture(), requests = cli.requests(document), transient = requests.filter(r => r.transient);
  assert.equal(transient.length, 1); assert.equal(transient[0].locator, spec.lock.canonicalPath); assert.equal(transient[0].directory, false); assert.equal(transient[0].sha256, digest(Buffer.alloc(0)).toString("hex"));
  assert(cli.requests(productionDocument()).every(r => !r.transient));
  const config = { repository: "C:\\fixture\\repo", runtimeDirectory: "C:\\fixture\\repo\\runtime", closedPredecessor: { schema: assembly.CLOSED_PREDECESSOR_SCHEMA, runtimeDirectory: "C:\\fixture\\repo\\old", sealFile: "C:\\fixture\\repo\\old-setup\\production-artifacts.seal" } };
  assert(assembly.closedPredecessorPaths(config).lock.endsWith(".initial-owned-fence.lock")); assert.throws(() => assembly.closedPredecessorPaths({ ...config, closedPredecessor: { ...config.closedPredecessor, schema: "wrong" } }));
});
console.log(JSON.stringify({ ok: true, groups, authority: false, nativeFactories: 0, compilerInvoked: false, liveProof: false }));
