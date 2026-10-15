"use strict";
const fs = require("node:fs"), path = require("node:path"), codec = require("./codec"), profile = require("./profile"), collect = require("./collect"), assembly = require("./assemble");
const json = file => JSON.parse(fs.readFileSync(file, "utf8")), save = (file, value) => fs.writeFileSync(file, JSON.stringify(value) + "\n", { flag: "wx" });
function input(file, expected) { const raw = fs.readFileSync(file); if (codec.sha(raw).toString("hex") !== expected.toLowerCase()) codec.fail("production_input_document_digest_changed"); const d = profile.validate(JSON.parse(raw)); for (const receipt of Object.values(d.census)) if (receipt && typeof receipt === "object" && receipt.path && codec.sha(fs.readFileSync(receipt.path)).toString("hex") !== receipt.sha256) codec.fail("production_census_document_changed"); return d; }
function writeSame(file, raw) { const fd = fs.openSync(file, "r+"); try { fs.ftruncateSync(fd, 0); fs.writeFileSync(fd, raw); fs.fsyncSync(fd); } finally { fs.closeSync(fd); } }
function anchorPath(d) { return d.enrollment.repository.canonicalPath + "\\" + d.definition.anchorComponents.join("\\"); }
function expected(d, creator) { return { ...d.definition, ...d.enrollment, creator, anchorPath: anchorPath(d) }; }
function requests(d) {
  const generated = new Set(d.definition.buildInputs.filter(row => row.code <= 3).map(row => row.file.pin.canonicalPath).concat(d.definition.buildInputManifest.pin.canonicalPath)), rows = new Map();
  function visit(value, parent = null) { if (!value || typeof value !== "object") return;
    if (value.volumeGuidHex && value.fileIdHex && value.canonicalPath) { const directory = !parent || !Object.hasOwn(parent, "sha256"); const row = { locator: value.canonicalPath, pin: value, directory, sha256: directory || generated.has(value.canonicalPath) ? null : parent.sha256, generated: generated.has(value.canonicalPath) }; const prior = rows.get(value.canonicalPath); if (prior && JSON.stringify(prior) !== JSON.stringify(row)) codec.fail("production_conflicting_expected_object"); rows.set(value.canonicalPath, row); return; }
    for (const item of Object.values(value)) visit(item, value);
  } visit(d); return [...rows.values()];
}
async function main(args) {
  const [operation, ...a] = args;
  if (operation === "collection-plan") { save(a[1], assembly.plan(json(a[0]))); return; }
  if (operation === "assemble") { save(a[3], assembly.assemble(json(a[0]), json(a[1]), a[2])); return; }
  if (operation === "merge-census") { save(a[2], collect.mergeCensus(json(a[0]), json(a[1]))); return; }
  if (operation === "pure-programs") { save(a[2], collect.purePrograms(a[0], json(a[1]))); return; }
  if (operation === "cep-census") { save(a[1], await collect.cepSources(a[0])); return; }
  const d = input(a[0], a[1]);
  if (operation === "validate") { for (const file of d.build.sourceFiles) if (codec.sha(fs.readFileSync(file.pin.canonicalPath)).toString("hex") !== file.sha256) codec.fail("production_frozen_source_changed"); save(a[2], { schema: "ae-agent.shared-queue-build-validation.v1", inputSha256: a[1], authority: false, sourceFiles: d.build.sourceFiles.length, nodeSourceRows: d.trustedRead.nodeSources.length, buildInputs: d.definition.buildInputs.length, automaticRuntimeLaunch: false }); return; }
  if (operation === "pin-requests") { save(a[2], requests(d)); return; }
  if (operation === "generate-setup") { for (const [name, text] of Object.entries(profile.generate(d))) writeSame(path.join(d.build.pinsDirectory, name), Buffer.from(text)); return; }
  if (operation === "prepare") { const raw = fs.readFileSync(a[3]), parsed = codec.prepare(raw, expected(d, json(a[2]))); if (parsed.birth !== a[4]) codec.fail("production_original_process_birth_changed"); save(a[5], parsed); return; }
  if (operation === "generate-final") {
    const original = json(a[2]); for (const [name, text] of Object.entries(profile.generate(d, original.anchor))) writeSame(path.join(d.build.pinsDirectory, name), Buffer.from(text));
    const rows = d.definition.buildInputs.map(row => ({ ...row, bytes: fs.readFileSync(row.file.pin.canonicalPath) })); for (const row of rows) if (row.code >= 4 && codec.sha(row.bytes).toString("hex") !== row.file.sha256) codec.fail("production_build_input_changed");
    const manifest = codec.buildManifest(d.definition, original.anchor, rows), file = path.join(d.build.pinsDirectory, "local_session_production_artifact_pins.h"), raw = fs.readFileSync(file), field = codec.normalizeHeader(raw); Buffer.from(manifest.generatedBuildInputsHash).copy(raw, field.start); writeSame(file, raw);
    const finalRows = d.definition.buildInputs.map(row => ({ ...row, bytes: fs.readFileSync(row.file.pin.canonicalPath) })), recomputed = codec.buildManifest(d.definition, original.anchor, finalRows); if (!manifest.bytes.equals(recomputed.bytes)) codec.fail("production_M_commitment_cycle");
    writeSame(d.definition.buildInputManifest.pin.canonicalPath, manifest.bytes); save(a[3], { generatedBuildInputsHash: manifest.generatedBuildInputsHash, manifestSha256: codec.sha(manifest.bytes).toString("hex"), generatedHeaders: Object.keys(profile.generate(d, original.anchor)).map(name => ({ path: path.join(d.build.pinsDirectory, name), sha256: codec.sha(fs.readFileSync(path.join(d.build.pinsDirectory, name))).toString("hex") })) }); return;
  }
  if (operation === "seal-request") { const original = json(a[2]); fs.writeFileSync(a[4], codec.ack("OWNLCPS1", 3, original, fs.readFileSync(a[3])), { flag: "wx" }); return; }
  if (operation === "verify-final") {
    const original = json(a[2]), generated = json(a[3]), artifacts = json(a[4]), creator = artifacts.find(row => row.code === 3)?.file;
    if (!creator) codec.fail("production_original_creator_artifact_required");
    const result = codec.final(fs.readFileSync(a[5]), original, { ...expected(d, creator), generatedBuildInputsHash: generated.generatedBuildInputsHash, artifactSetHash: codec.artifactSet(artifacts) });
    if (codec.sha(fs.readFileSync(anchorPath(d))).toString("hex") !== result.anchorSha256 || result.policySha256 !== d.enrollment.policyHash) codec.fail("production_actual_seal_bytes_changed");
    save(a[6], result); fs.writeFileSync(a[7], codec.ack("OWNLCA01", 2, original, fs.readFileSync(a[5])), { flag: "wx" }); return;
  }
  codec.fail("production_unknown_build_operation");
}
if (require.main === module) main(process.argv.slice(2)).catch(error => { const value = error.code || error.message; process.stderr.write(JSON.stringify({ ok: false, code: typeof value === "string" && /^[a-zA-Z0-9_]+$/.test(value) ? value : "production_build_exception", authority: false }) + "\n"); process.exitCode = 1; });
module.exports = { main, requests };
