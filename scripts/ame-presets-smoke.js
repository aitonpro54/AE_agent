"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { scanPresetRoots, parsePresetXml, selectPreset, MAX_DEPTH, MAX_EPR_BYTES, MAX_XML_NODES } = require("../mcp-server/ame-presets");

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "ae-agent-ame-presets-"));
function epr(name, extra = "") {
  return `<?xml version="1.0" encoding="UTF-8"?><PremiereData Version="3"><PresetName>${name}</PresetName><ExporterName>Encoder &amp; Muxer</ExporterName><ExporterClassID>42</ExporterClassID><ExporterFileType>84</ExporterFileType>${extra}</PremiereData>`;
}
function write(relative, contents) {
  const file = path.join(temp, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents, "utf8");
  return file;
}
try {
  const first = write("user/one.epr", epr("Shared &#x26; title"));
  const second = write("user/nested/two.epr", epr("Shared &#38; title", "<PresetID>second-id</PresetID>"));
  const malformed = write("user/broken.epr", "<PremiereData><PresetName>broken</PremiereData>");
  const unknown = write("user/unknown.epr", epr("&custom;"));
  const dtd = write("user/dtd.epr", "<!DOCTYPE x [<!ENTITY name 'unsafe'>]><PremiereData><PresetName>x</PresetName></PremiereData>");
  const oversized = write("user/oversized.epr", " ".repeat(MAX_EPR_BYTES + 1));
  const nodeHeavy = write("user/node-heavy.epr", "<PremiereData>" + "<X/>".repeat(MAX_XML_NODES + 1) + "</PremiereData>");
  const before = [first, second, malformed, unknown, dtd, oversized, nodeHeavy].map(file => fs.readFileSync(file));

  const parsed = parsePresetXml(epr("A &amp; B &#x1F642; &lt;ok&gt;"));
  assert.equal(parsed.presetName, "A & B 🙂 <ok>");
  assert.equal(parsed.exporterName, "Encoder & Muxer");
  assert.equal(parsed.exporterFileType, "84");
  assert.throws(() => parsePresetXml("<x>&custom;</x>"), /unsupported|unresolved entity/);
  assert.throws(() => parsePresetXml("<!DOCTYPE x><x/>"), /declarations/);
  assert.throws(() => parsePresetXml("<x><y></x>"), /mismatched/);
  assert.throws(() => parsePresetXml("<x>a]]>b</x>"), /invalid character data/);
  assert.throws(() => parsePresetXml("<x>\u0001</x>"), /invalid character data/);

  let symlinkCreated = false;
  const link = path.join(temp, "user", "linked.epr");
  try { fs.symlinkSync(first, link, "file"); symlinkCreated = true; } catch { /* platform policy may forbid symlink creation */ }
  const catalog = scanPresetRoots({ roots: [{ path: path.join(temp, "user"), source: "fixture" }] });
  assert.equal(catalog.source, "file_catalog");
  assert.equal(catalog.nativeAvailability, "not_verified");
  assert.equal(catalog.complete, false, "the catalog must disclose skipped entries");
  assert.equal(catalog.roots[0].status, "scanned_with_errors");
  assert.equal(catalog.presets.length, 2, "invalid XML, oversized files, and symlinks must be omitted");
  const issue = (file, reason) => assert(catalog.issues.some(row => row.path === path.resolve(file) && row.reason === reason), `${reason} should identify exact path ${file}`);
  issue(malformed, "xml_malformed");
  issue(unknown, "xml_entity_invalid");
  issue(dtd, "xml_dtd_forbidden");
  issue(oversized, "preset_size_limit");
  issue(nodeHeavy, "xml_node_limit");
  assert.equal(catalog.presets[0].presetName, "Shared & title");
  assert.equal(catalog.presets[1].presetName, "Shared & title");
  assert.notEqual(catalog.presets[0].presetId, catalog.presets[1].presetId, "duplicate names retain distinct file identities");
  assert.notEqual(catalog.presets[0].canonicalPath, catalog.presets[1].canonicalPath);
  if (symlinkCreated) {
    assert(!catalog.presets.some(item => item.canonicalPath.toLowerCase().includes("linked.epr")));
    issue(link, "symlink_ignored");
  }

  const chosen = selectPreset(catalog, { presetId: catalog.presets[0].presetId, sha256: catalog.presets[0].sha256 });
  assert.equal(chosen.presetId, catalog.presets[0].presetId);
  assert.equal(selectPreset(catalog, { exactPath: chosen.canonicalPath }).sha256, chosen.sha256);
  assert.throws(() => selectPreset(catalog, { presetName: "Shared & title" }), /Select by/);
  assert.throws(() => selectPreset(catalog, { presetId: chosen.presetId, sha256: "0".repeat(64) }), /missing or changed/);
  assert.throws(() => selectPreset(catalog, { exactPath: path.join(temp, "missing.epr") }), /path is missing/);

  const chosenFile = catalog.presets[0].canonicalPath.toLowerCase().endsWith("one.epr") ? first : second;
  fs.writeFileSync(chosenFile, epr("changed"), "utf8");
  const refreshed = scanPresetRoots({ roots: [{ path: path.join(temp, "user"), source: "fixture" }] });
  assert.throws(() => selectPreset(refreshed, { presetId: chosen.presetId, sha256: chosen.sha256 }), /missing or changed/);
  for (const file of [first, second, malformed, unknown, dtd, oversized, nodeHeavy]) {
    const original = before[[first, second, malformed, unknown, dtd, oversized, nodeHeavy].indexOf(file)];
    assert.equal(fs.readFileSync(file, "utf8"), file === chosenFile ? epr("changed") : original.toString("utf8"), "cataloging must never rewrite preset files");
  }

  const missing = scanPresetRoots({ roots: [{ path: path.join(temp, "absent"), source: "optional-fixture" }] });
  assert.equal(missing.complete, false);
  assert.equal(missing.roots[0].status, "unavailable_expected_missing");
  assert.equal(missing.issues[0].reason, "root_missing_expected");
  assert.equal(missing.issues[0].expected, true);
  const relativeRoot = path.relative(process.cwd(), path.join(temp, "user"));
  const relativeCatalog = scanPresetRoots({ roots: [{ path: relativeRoot, source: "relative-fixture" }] });
  assert(relativeCatalog.presets.some(item => item.canonicalPath.toLowerCase().endsWith("two.epr")));

  const deepRoot = path.join(temp, "deep-root");
  let deep = deepRoot;
  const deepParts = [];
  for (let i = 1; i <= MAX_DEPTH + 1; i++) { const name = `level-${i}`; deepParts.push(name); deep = path.join(deep, name); fs.mkdirSync(deep, { recursive: true }); }
  write(path.relative(temp, path.join(deep, "hidden.epr")), epr("too-deep"));
  const depthCatalog = scanPresetRoots({ roots: [{ path: deepRoot, source: "depth-fixture" }] });
  assert.equal(depthCatalog.complete, false);
  assert(depthCatalog.issues.some(row => row.reason === "scan_depth_limit" && row.path === path.join(deepRoot, ...deepParts)));

  let rootLinkCreated = false;
  const rootLink = path.join(temp, "root-alias");
  try { fs.symlinkSync(path.join(temp, "user"), rootLink, "junction"); rootLinkCreated = true; } catch { /* platform policy may forbid symlink creation */ }
  if (rootLinkCreated) {
    const aliasCatalog = scanPresetRoots({ roots: [{ path: rootLink, source: "alias-fixture" }] });
    assert.equal(aliasCatalog.complete, false);
    assert.equal(aliasCatalog.roots[0].status, "rejected_root");
    assert.equal(aliasCatalog.issues[0].reason, "root_symlink_ignored");
  }
  console.log(`ame-presets-smoke: passed; file symlink ${symlinkCreated ? "covered" : "unavailable"}; root alias ${rootLinkCreated ? "covered" : "unavailable"}.`);
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
