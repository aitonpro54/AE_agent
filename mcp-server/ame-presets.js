"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const os = require("os");
const { TextDecoder } = require("util");

const SOURCE = "file_catalog";
const MAX_DEPTH = 6;
const MAX_DIRECTORIES = 4000;
const MAX_PRESETS = 8000;
const MAX_EPR_BYTES = 2 * 1024 * 1024;
const MAX_XML_NODES = 100000;
const WINDOWS = process.platform === "win32";
const DEFAULT_ROOTS = WINDOWS ? [
  { source: "user", path: path.join(process.env.USERPROFILE || os.homedir(), "Documents", "Adobe", "Adobe Media Encoder", "26.0", "Presets") },
  { source: "system", path: "C:\\Program Files\\Adobe\\Adobe Media Encoder 2026\\Settings\\EncoderPresets" }
] : [];

const listInputSchema = Object.freeze({ type: "object", properties: {}, additionalProperties: false });
const listAmePresetsTool = Object.freeze({
  name: "list_ame_presets",
  description: "List existing AME .epr preset files from bounded user and installed preset roots. Read-only file catalog; does not connect to AME or alter its queue. Select a result by presetId plus sha256 or by exactPath.",
  inputSchema: listInputSchema
});

function fail(message, code = "preset_xml_invalid") {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function decodeXmlText(text) {
  if (/&(?!(?:amp|lt|gt|quot|apos|#(?:x[0-9a-fA-F]+|[0-9]+));)/.test(text)) fail("Preset XML contains an unterminated or unsupported entity.", "xml_entity_invalid");
  return text.replace(/&([^;]+);/g, (_, entity) => {
    if (entity === "amp") return "&";
    if (entity === "lt") return "<";
    if (entity === "gt") return ">";
    if (entity === "quot") return '"';
    if (entity === "apos") return "'";
    const numeric = /^#(?:x([0-9a-fA-F]+)|([0-9]+))$/.exec(entity);
    if (!numeric) fail("Preset XML contains an unsupported or unresolved entity.", "xml_entity_invalid");
    const point = Number.parseInt(numeric[1] || numeric[2], numeric[1] ? 16 : 10);
    if (!Number.isSafeInteger(point) || point < 1 || point > 0x10ffff || (point >= 0xd800 && point <= 0xdfff) || (point < 0x20 && ![9, 10, 13].includes(point))) {
      fail("Preset XML contains an invalid numeric entity.", "xml_entity_invalid");
    }
    return String.fromCodePoint(point);
  });
}

function parsePresetXml(xml) {
  if (typeof xml !== "string" || !xml.length) fail("Preset XML is empty.", "xml_empty");
  if (xml.length > MAX_EPR_BYTES) fail("Preset XML exceeds the supported size.", "xml_size_limit");
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml)) fail("Preset XML declarations and DTD entities are forbidden.", "xml_dtd_forbidden");
  if (/<!\[CDATA\[/i.test(xml)) fail("Preset XML CDATA is not supported.", "xml_construct_unsupported");
  let input = xml.replace(/^\uFEFF/, "");
  input = input.replace(/^\s*<\?xml\s+version\s*=\s*(['"])1\.[01]\1(?:\s+encoding\s*=\s*(['"])[A-Za-z][A-Za-z0-9._-]*\2)?\s*\?>/, "");
  if (input.includes("<?") || input.includes("?>")) fail("Preset XML contains an unsupported processing instruction.", "xml_construct_unsupported");

  const stack = [];
  const topLevel = Object.create(null);
  const seenScalarTags = new Set();
  const tagPattern = /<!--[\s\S]*?-->|<[^>]*>|[^<]+/g;
  let match, position = 0, nodes = 0, rootCount = 0;
  while ((match = tagPattern.exec(input))) {
    if (match.index !== position) fail("Preset XML is malformed.");
    position = tagPattern.lastIndex;
    const token = match[0];
    if (++nodes > MAX_XML_NODES) fail("Preset XML exceeds the parser node limit.", "xml_node_limit");
    if (token.startsWith("<!--")) {
      if (token.slice(4, -3).includes("--")) fail("Preset XML contains an invalid comment.", "xml_malformed");
      continue;
    }
    if (!token.startsWith("<")) {
      if (token.includes("]]>") || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(token)) fail("Preset XML contains invalid character data.", "xml_malformed");
      if (!stack.length && token.trim()) fail("Preset XML has text outside the document element.", "xml_malformed");
      decodeXmlText(token);
      if (stack.length === 2 && stack[1].capture) stack[1].text += token;
      continue;
    }
    if (/^<\//.test(token)) {
      const closing = /^<\/([A-Za-z_][\w.:-]*)\s*>$/.exec(token);
      if (!closing || !stack.length || stack[stack.length - 1].name !== closing[1]) fail("Preset XML has mismatched closing tags.", "xml_malformed");
      const entry = stack.pop();
      if (entry.capture) topLevel[entry.name] = (topLevel[entry.name] || []).concat([decodeXmlText(entry.text).trim()]);
      continue;
    }
    const open = /^<([A-Za-z_][\w.:-]*)(?:\s+[^<>]*?)?\s*(\/?)>$/.exec(token);
    if (!open) fail("Preset XML has an invalid element or attribute list.", "xml_malformed");
    const tag = open[1];
    const attrs = token.slice(tag.length + 1, token.length - (open[2] ? 2 : 1));
    if (attrs && !/^\s*(?:[A-Za-z_][\w.:-]*\s*=\s*(?:"[^"<>]*"|'[^'<>]*')\s*)*$/.test(attrs)) fail("Preset XML has malformed attributes.", "xml_malformed");
    if (attrs) {
      const attrPattern = /(?:^|\s)[A-Za-z_][\w.:-]*\s*=\s*("([^"<>]*)"|'([^'<>]*)')/g;
      let attr;
      while ((attr = attrPattern.exec(attrs))) decodeXmlText(attr[2] === undefined ? attr[3] : attr[2]);
    }
    if (!stack.length) {
      rootCount++;
      if (rootCount !== 1 || open[2]) fail("Preset XML must have one non-empty document element.", "xml_malformed");
    }
    const capture = stack.length === 1 && ["PresetName", "PresetID", "ExporterName", "ExporterClassID", "ExporterFileType"].includes(tag);
    if (stack.length && stack[stack.length - 1].capture) fail(`Preset XML field ${stack[stack.length - 1].name} must be scalar text.`, "xml_malformed");
    if (capture && seenScalarTags.has(tag)) fail(`Preset XML has duplicate ${tag} fields.`, "xml_duplicate_scalar");
    if (capture) seenScalarTags.add(tag);
    const entry = { name: tag, capture, text: "" };
    if (open[2]) {
      if (capture) topLevel[tag] = (topLevel[tag] || []).concat([""]);
    } else stack.push(entry);
  }
  if (position !== input.length || stack.length || rootCount !== 1) fail("Preset XML is incomplete or malformed.", "xml_malformed");
  const first = key => topLevel[key] && topLevel[key].length === 1 ? topLevel[key][0] : undefined;
  const fields = {};
  const name = first("PresetName");
  if (name) fields.presetName = name;
  for (const [tag, key] of [["PresetID", "embeddedPresetId"], ["ExporterName", "exporterName"], ["ExporterClassID", "exporterClassId"], ["ExporterFileType", "exporterFileType"]]) {
    const value = first(tag);
    if (value) fields[key] = value;
  }
  return fields;
}

function sha256(buffer) { return crypto.createHash("sha256").update(buffer).digest("hex"); }
function canonicalPath(filePath) {
  const real = fs.realpathSync.native ? fs.realpathSync.native(filePath) : fs.realpathSync(filePath);
  return WINDOWS ? real.replace(/\\/g, "/") : real;
}
function inside(root, candidate) {
  const rel = path.relative(root, candidate);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}
function presetId(canonical, digest) {
  return "amep_" + sha256(Buffer.from(`${canonical}\0${digest}`, "utf8")).slice(0, 40);
}

function scanPresetRoots(options = {}) {
  const roots = options.roots === undefined ? DEFAULT_ROOTS : options.roots;
  if (!Array.isArray(roots) || roots.length > 8) fail("roots must contain at most eight bounded catalog roots.");
  const entries = [];
  const rootResults = [];
  const issues = [];
  let dirsSeen = 0;
  let stopReason = null;
  const issue = (rootEntry, result, itemPath, reason, extra = {}) => {
    const row = { path: itemPath, source: rootEntry.source, reason, ...extra };
    issues.push(row);
    if (result) result.issueCount++;
  };
  for (const rootEntry of roots) {
    if (!rootEntry || typeof rootEntry.path !== "string" || typeof rootEntry.source !== "string") fail("Each root requires a path and source label.");
    const result = { source: rootEntry.source, path: path.resolve(rootEntry.path), status: "unavailable", presetCount: 0, issueCount: 0 };
    rootResults.push(result);
    if (stopReason) {
      result.status = "not_scanned_limit";
      issue(rootEntry, result, result.path, stopReason);
      continue;
    }
    let rootStat;
    try { rootStat = fs.lstatSync(result.path); }
    catch (error) {
      issue(rootEntry, result, result.path, error.code === "ENOENT" ? "root_missing_expected" : "root_stat_failed", { expected: error.code === "ENOENT" });
      result.status = error.code === "ENOENT" ? "unavailable_expected_missing" : "scanned_with_errors";
      continue;
    }
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
      issue(rootEntry, result, result.path, rootStat.isSymbolicLink() ? "root_symlink_ignored" : "root_not_directory");
      result.status = "rejected_root";
      continue;
    }
    let rootReal;
    try { rootReal = canonicalPath(result.path); }
    catch { issue(rootEntry, result, result.path, "root_resolve_failed"); result.status = "scanned_with_errors"; continue; }
    const pending = [{ diskPath: result.path, depth: 0 }];
    while (pending.length && !stopReason) {
      const current = pending.pop();
      dirsSeen++;
      if (dirsSeen > MAX_DIRECTORIES) {
        stopReason = "directory_count_limit";
        issue(rootEntry, result, current.diskPath, stopReason);
        break;
      }
      let children;
      try { children = fs.readdirSync(current.diskPath, { withFileTypes: true }); }
      catch { issue(rootEntry, result, current.diskPath, "directory_read_failed"); continue; }
      for (const child of children) {
        const full = path.join(current.diskPath, child.name);
        let stats;
        try { stats = fs.lstatSync(full); }
        catch { issue(rootEntry, result, full, "entry_stat_failed"); continue; }
        if (stats.isSymbolicLink()) { issue(rootEntry, result, full, "symlink_ignored"); continue; }
        if (stats.isDirectory()) {
          if (current.depth < MAX_DEPTH) {
            try {
              const realDir = canonicalPath(full);
              if (inside(rootReal, realDir)) pending.push({ diskPath: full, depth: current.depth + 1 });
              else issue(rootEntry, result, full, "directory_outside_root");
            } catch { issue(rootEntry, result, full, "directory_resolve_failed"); }
          } else {
            issue(rootEntry, result, full, "scan_depth_limit");
          }
          continue;
        }
        if (!stats.isFile() || path.extname(child.name).toLowerCase() !== ".epr") continue;
        if (stats.size < 1) { issue(rootEntry, result, full, "preset_empty"); continue; }
        if (stats.size > MAX_EPR_BYTES) { issue(rootEntry, result, full, "preset_size_limit"); continue; }
        if (entries.length >= MAX_PRESETS) {
          stopReason = "preset_count_limit";
          issue(rootEntry, result, full, stopReason);
          break;
        }
        let realFile, bytes, after, afterReal;
        try {
          realFile = canonicalPath(full);
          if (!inside(rootReal, realFile)) { issue(rootEntry, result, full, "file_outside_root"); continue; }
          bytes = fs.readFileSync(full);
          after = fs.lstatSync(full);
          afterReal = canonicalPath(full);
        } catch { issue(rootEntry, result, full, "preset_read_failed"); continue; }
        if (!after.isFile() || after.isSymbolicLink() || afterReal !== realFile || bytes.length !== stats.size || after.size !== stats.size || after.mtimeMs !== stats.mtimeMs) {
          issue(rootEntry, result, full, after.isSymbolicLink() ? "symlink_ignored" : "preset_changed_during_read");
          continue;
        }
        let fields;
        try { fields = parsePresetXml(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
        catch (error) { issue(rootEntry, result, full, error.code || "preset_xml_invalid"); continue; }
        const digest = sha256(bytes);
        const pathIdentity = WINDOWS ? realFile.toLowerCase() : realFile;
        const item = {
          presetId: presetId(pathIdentity, digest),
          canonicalPath: realFile,
          sha256: digest,
          sizeBytes: bytes.length,
          mtimeMs: after.mtimeMs,
          source: rootEntry.source,
          ...fields
        };
        entries.push(item);
        result.presetCount++;
      }
    }
    result.status = result.issueCount ? "scanned_with_errors" : "scanned";
  }
  entries.sort((a, b) => a.canonicalPath.localeCompare(b.canonicalPath));
  return { ok: true, source: SOURCE, nativeAvailability: "not_verified", complete: issues.length === 0,
    roots: rootResults, presets: entries, count: entries.length, issues };
}

function selectPreset(catalog, selector) {
  if (!catalog || !Array.isArray(catalog.presets) || !selector || typeof selector !== "object") fail("A catalog and precise preset selector are required.");
  let matches;
  if (Object.prototype.hasOwnProperty.call(selector, "presetId") || Object.prototype.hasOwnProperty.call(selector, "sha256")) {
    if (typeof selector.presetId !== "string" || typeof selector.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(selector.sha256)) fail("Select by both presetId and a lowercase SHA-256 digest.");
    matches = catalog.presets.filter(item => item.presetId === selector.presetId && item.sha256 === selector.sha256);
    if (matches.length !== 1) fail(matches.length ? "Preset identity is ambiguous." : "Preset identity is missing or changed; refresh the file catalog.");
  } else if (Object.prototype.hasOwnProperty.call(selector, "exactPath")) {
    if (typeof selector.exactPath !== "string" || !selector.exactPath.trim()) fail("exactPath must be a non-empty canonical file path.");
    const wanted = WINDOWS ? selector.exactPath.replace(/\\/g, "/").toLowerCase() : selector.exactPath;
    matches = catalog.presets.filter(item => (WINDOWS ? item.canonicalPath.toLowerCase() : item.canonicalPath) === wanted);
    if (matches.length !== 1) fail(matches.length ? "Exact path selector is ambiguous." : "Preset path is missing; refresh the file catalog.");
  } else fail("Select by presetId plus sha256 or by exactPath.");
  return matches[0];
}

function listAmePresets(args = {}) {
  if (!args || typeof args !== "object" || Array.isArray(args) || Object.keys(args).length) fail("list_ame_presets accepts no arguments.");
  return scanPresetRoots();
}

module.exports = { SOURCE, MAX_DEPTH, MAX_DIRECTORIES, MAX_PRESETS, MAX_EPR_BYTES, DEFAULT_ROOTS,
  MAX_XML_NODES, listAmePresetsTool, listInputSchema, listAmePresets, scanPresetRoots, parsePresetXml, selectPreset };
