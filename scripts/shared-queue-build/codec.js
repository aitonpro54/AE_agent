"use strict";
const crypto = require("node:crypto");
const sha = bytes => crypto.createHash("sha256").update(bytes).digest();
const domain = (name, bytes) => sha(Buffer.concat([Buffer.from(name + "\0", "ascii"), bytes]));
function fail(code) { throw Object.assign(Error(code), { code }); }
function hex(value, length, zero = false) { if (typeof value !== "string" || !new RegExp("^[a-f0-9]{" + length * 2 + "}$").test(value) || !zero && /^0+$/.test(value)) fail("production_exact_hex_required"); return Buffer.from(value, "hex"); }
function u16(n) { if (!Number.isInteger(n) || n < 0 || n > 65535) fail("production_u16_required"); const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; }
function u32(n) { if (!Number.isSafeInteger(n) || n < 0 || n > 0xffffffff) fail("production_u32_required"); const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; }
function u64(n) { if (!/^(?:0|[1-9][0-9]*)$/.test(String(n))) fail("production_u64_required"); const v = BigInt(n); if (v > 0xffffffffffffffffn) fail("production_u64_required"); const b = Buffer.alloc(8); b.writeBigUInt64LE(v); return b; }
function pin(value) { return Buffer.concat([hex(value.volumeGuidHex, 16), u64(value.serial), hex(value.fileIdHex, 16)]); }
function header(magic, version, kind, length) { if (magic.length !== 8) fail("production_magic_required"); return Buffer.concat([Buffer.from(magic, "ascii"), u16(version), u16(kind), u32(length)]); }
function checkHeader(raw, magic, version, kind, length) { if (!Buffer.isBuffer(raw) || raw.length !== length || !raw.subarray(0, 16).equals(header(magic, version, kind, length))) fail("production_frame_header_refused"); }
function same(actual, expected, code) { if (!Buffer.from(actual).equals(Buffer.from(expected))) fail(code); }
function parsePin(raw, at, canonicalPath) { return { volumeGuidHex: raw.subarray(at, at + 16).toString("hex"), serial: raw.readBigUInt64LE(at + 16).toString(), fileIdHex: raw.subarray(at + 24, at + 40).toString("hex"), canonicalPath }; }
function prepare(raw, expected) {
  checkHeader(raw, "OWNLCP01", 1, 0, 424);
  const result = { nonceHex: raw.subarray(16, 32).toString("hex"), birth: raw.readBigUInt64LE(32).toString(), anchor: parsePin(raw, 136, expected.anchorPath), frameSha256: sha(raw).toString("hex") };
  hex(result.nonceHex, 16); if (BigInt(result.birth) === 0n) fail("production_creator_birth_required");
  for (const [at, bytes, code] of [[40, hex(expected.installation, 16), "production_prepare_installation_changed"], [56, hex(expected.lineage, 16), "production_prepare_lineage_changed"], [72, hex(expected.staticCodeHash, 32), "production_prepare_source_changed"], [104, hex(expected.policyHash, 32), "production_prepare_policy_changed"], [176, pin(expected.setupNamespace), "production_prepare_setup_changed"], [216, pin(expected.creator.pin), "production_prepare_creator_pin_changed"], [256, hex(expected.creator.sha256, 32), "production_prepare_creator_bytes_changed"], [288, hex(expected.fixedProfileHash, 32), "production_prepare_fixed_profile_changed"], [320, pin(expected.node.pin), "production_prepare_node_pin_changed"], [360, hex(expected.node.sha256, 32), "production_prepare_node_bytes_changed"], [392, domain("lcs.production.sid.v1", Buffer.from(expected.userSid, "utf16le")), "production_prepare_sid_changed"]]) same(raw.subarray(at, at + bytes.length), bytes, code);
  pin(result.anchor); return result;
}
function ack(magic, kind, original, frame) { const result = Buffer.concat([header(magic, 1, kind, 80), hex(original.nonceHex, 16), u64(original.birth), sha(frame), u64(0)]); if (result.length !== 80) fail("production_ack_size"); return result; }
function final(raw, original, expected) {
  checkHeader(raw, "OWNLCP02", 2, 1, 752);
  for (const [at, bytes, code] of [[16, hex(original.nonceHex, 16), "production_final_nonce_changed"], [32, u64(original.birth), "production_final_birth_changed"], [40, hex(expected.installation, 16), "production_final_installation_changed"], [56, hex(expected.lineage, 16), "production_final_lineage_changed"], [72, hex(expected.policyHash, 32), "production_final_policy_changed"], [104, pin(expected.repository), "production_final_repository_changed"], [144, pin(expected.runtime), "production_final_runtime_changed"], [408, pin(expected.creator.pin), "production_final_creator_changed"], [448, hex(expected.creator.sha256, 32), "production_final_creator_bytes_changed"], [480, pin(original.anchor), "production_final_anchor_changed"], [552, hex(expected.staticCodeHash, 32), "production_final_source_changed"], [584, hex(expected.generatedBuildInputsHash, 32), "production_final_M_changed"], [616, hex(expected.artifactSetHash, 32), "production_final_artifacts_changed"], [648, hex(expected.fixedProfileHash, 32), "production_final_fixed_profile_changed"], [680, pin(expected.setupNamespace), "production_final_setup_changed"], [720, domain("lcs.production.sid.v1", Buffer.from(expected.userSid, "utf16le")), "production_final_sid_changed"]]) same(raw.subarray(at, at + bytes.length), bytes, code);
  return { installation: parsePin(raw, 184, expected.runtime.canonicalPath + "\\.initial-owned-local.installation"), policy: parsePin(raw, 224, expected.runtime.canonicalPath + "\\.initial-owned-local.policy"), lock: parsePin(raw, 264, expected.runtime.canonicalPath + "\\.initial-owned-fence.lock"), journal: parsePin(raw, 304, expected.runtime.canonicalPath + "\\journal"), installationSha256: raw.subarray(344, 376).toString("hex"), policySha256: raw.subarray(376, 408).toString("hex"), anchorSha256: raw.subarray(520, 552).toString("hex"), frameSha256: sha(raw).toString("hex") };
}
const MARKER = "// LCS_GENERATED_BUILD_INPUTS_SHA256_V1\ninline constexpr char kExpectedGeneratedBuildInputsHashHex[65] = \"";
function normalizeHeader(raw) {
  const text = raw.toString("utf8"), at = text.indexOf(MARKER);
  if (text.includes("\r") || raw.includes(0) || raw.subarray(0, 3).equals(Buffer.from([239, 187, 191])) || at < 0 || text.indexOf(MARKER, at + 1) !== -1 || at && text[at - 1] !== "\n") fail("production_header_normalization_refused");
  const start = Buffer.byteLength(text.slice(0, at + MARKER.length), "utf8"); if (!/^[a-f0-9]{64}";\n/.test(raw.subarray(start).toString("utf8"))) fail("production_header_field_refused");
  const logical = Buffer.from(raw); logical.fill(0, start, start + 64);
  return { digest: domain("lcs.production.generated-header-normalized.v1", Buffer.concat([u32(raw.length), logical])), start };
}
function buildManifest(definition, anchor, rows) {
  if (!Array.isArray(rows) || rows.length < 6 || rows.length > 1024) fail("production_M_rows_required");
  const body = [header("OWNLBI01", 1, 1, 124 + 76 * rows.length), hex(definition.fixedProfileHash, 32), hex(definition.staticCodeHash, 32), pin(anchor), u16(rows.length), u16(0)]; let previous = 0;
  for (const row of rows) { if (row.code <= previous) fail("production_M_order_required"); previous = row.code; body.push(u16(row.code), u16(0), pin(row.file.pin), row.code === 1 ? normalizeHeader(row.bytes).digest : sha(row.bytes)); }
  const bytes = Buffer.concat(body); return { bytes, generatedBuildInputsHash: domain("lcs.production.generated-build-inputs.logical.v1", bytes).toString("hex") };
}
function artifactSet(artifacts) { const bytes = [u16(artifacts.length), u16(0)]; for (const a of artifacts) bytes.push(u16(a.code), u16(0), pin(a.file.pin), hex(a.file.sha256, 32)); return domain("lcs.production.artifact-set.v1", Buffer.concat(bytes)).toString("hex"); }
module.exports = { sha, domain, fail, hex, u16, u32, u64, pin, header, prepare, ack, final, parsePin, MARKER, normalizeHeader, buildManifest, artifactSet };
