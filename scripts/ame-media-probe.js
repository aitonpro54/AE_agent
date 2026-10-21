"use strict";

const fs = require("node:fs");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { evaluateAmePassiveStatus } = require("../mcp-server/ame-passive-status");
const { validateAmeMedia, validateAmeMetadata } = require("../mcp-server/ame-media-probe");
const { inspectDxvPacketHeader, inspectRgbaFrame } = require("../mcp-server/dxv-media-evidence");

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
const run = (program, args, timeout, binary = false, maxBuffer = 16 * 1024 * 1024) => spawnSync(program, args, {
  encoding: binary ? null : "utf8", timeout, maxBuffer, windowsHide: true
});

function hashFile(file) {
  const hash = crypto.createHash("sha256"), fd = fs.openSync(file, "r"), block = Buffer.alloc(1024 * 1024);
  try { let bytes; while ((bytes = fs.readSync(fd, block, 0, block.length, null))) hash.update(block.subarray(0, bytes)); }
  finally { fs.closeSync(fd); }
  return hash.digest("hex");
}

function inspectPackets(file, packets) {
  if (!Array.isArray(packets) || !packets.length) return { supported: false, reason: "dxv_packets_missing" };
  const fd = fs.openSync(file, "r"), fileBytes = fs.fstatSync(fd).size;
  const modes = new Map(); let alphaChannel = true, priorPacketEnd = 0;
  try {
    for (let index = 0; index < packets.length; index++) {
      const position = Number(packets[index].pos), bytes = Number(packets[index].size);
      if (!Number.isSafeInteger(position) || position < 0 || !Number.isSafeInteger(bytes) || bytes < 13
        || bytes > fileBytes - position || position < priorPacketEnd) return { supported: false, reason: "dxv_packet_location_invalid", index };
      priorPacketEnd = position + bytes;
      const header = Buffer.alloc(12), read = fs.readSync(fd, header, 0, 12, position);
      const inspected = inspectDxvPacketHeader(header.subarray(0, read), bytes);
      if (!inspected.supported) return { ...inspected, packetIndex: index };
      alphaChannel = alphaChannel && inspected.alphaChannel;
      const key = `${inspected.versionMajor}.${inspected.versionMinor}/${inspected.textureMode}/${inspected.rawCopyByte}/${inspected.unknownHeaderByte}`;
      const prior = modes.get(key);
      if (prior) prior.packetCount++;
      else modes.set(key, { versionMajor: inspected.versionMajor, versionMinor: inspected.versionMinor,
        textureMode: inspected.textureMode, alphaChannel: inspected.alphaChannel, rawCopyByte: inspected.rawCopyByte,
        unknownHeaderByte: inspected.unknownHeaderByte,
        firstHeaderHex: inspected.headerHex, packetCount: 1 });
    }
  } finally { fs.closeSync(fd); }
  return { supported: true, reason: null, allPacketsInspected: true, packetCount: packets.length,
    modes: [...modes.values()], alphaChannel, highQualityVerified: false, highQualityMapping: "UNVERIFIED" };
}

function probeMediaFile(job, options = {}) {
  const ffprobe = options.ffprobe || "ffprobe", ffmpeg = options.ffmpeg || "ffmpeg", runner = options.run || run;
  const before = fs.statSync(job.outputPath);
  const evidence = { mediaSha256: hashFile(job.outputPath), mediaStable: false, evidenceKind: "file_decode",
    productionAuthority: false, nativeProvenanceVerified: false,
    textIdentityVerified: false };
  const probed = runner(ffprobe, ["-v", "error", "-count_frames", "-show_entries",
    "format=duration,format_name:stream=index,codec_type,codec_name,width,height,pix_fmt,color_space,avg_frame_rate,r_frame_rate,nb_frames,nb_read_frames,duration",
    "-of", "json", job.outputPath], 30000);
  if (probed.error || probed.status !== 0) return { technicalMediaVerified: false,
    reason: probed.error ? "ffprobe_unavailable_or_timeout" : "ffprobe_failed", mediaEvidence: evidence };
  let metadata;
  try { metadata = JSON.parse(probed.stdout); } catch (_error) { metadata = null; }
  const precheck = validateAmeMetadata(job, metadata);
  if (!precheck.technicalMediaVerified) return { ...precheck, mediaEvidence: evidence };
  const video = metadata.streams.find(stream => stream.codec_type === "video");
  evidence.metadata = metadata;
  const version = runner(ffmpeg, ["-version"], 5000);
  evidence.decoder = { program: ffmpeg, version: String(version.stdout || "").split(/\r?\n/)[0] || null };
  if (video.codec_name === "dxv") {
    const packets = runner(ffprobe, ["-v", "error", "-select_streams", "v:0", "-show_packets",
      "-show_entries", "packet=pos,size", "-of", "json", job.outputPath], 30000);
    let indexed;
    try { indexed = packets.status === 0 && !packets.error ? JSON.parse(packets.stdout) : null; } catch (_error) { indexed = null; }
    evidence.dxv = indexed ? inspectPackets(job.outputPath, indexed.packets)
      : { supported: false, reason: "dxv_packet_probe_failed" };
    const debug = runner(ffmpeg, ["-nostdin", "-v", "debug", "-xerror", "-i", job.outputPath,
      "-map", "0:v:0", "-frames:v", "1", "-f", "null", "-"], 30000);
    evidence.decoder.firstFrameExitCode = debug.status;
    evidence.decoder.dxvMessages = String(debug.stderr || "").split(/\r?\n/)
      .filter(line => /compression with .* texture \(version|Unsupported header|Incomplete or invalid file/.test(line)).slice(0, 8);
  }
  const decoded = runner(ffmpeg, ["-nostdin", "-v", "error", "-xerror", "-i", job.outputPath,
    "-map", "0:v:0", "-map", "0:a?", "-fps_mode", "passthrough", "-progress", "pipe:1", "-f", "null", "-"], 120000);
  const counts = [...String(decoded.stdout || "").matchAll(/^frame=(\d+)\s*$/gm)];
  evidence.fullDecode = { exitCode: decoded.status, error: decoded.error ? String(decoded.error.message) : null,
    stderr: String(decoded.stderr || "").slice(0, 8192),
    decodedFrames: counts.length ? Number(counts[counts.length - 1][1]) : null,
    progressEnd: /^progress=end\s*$/m.test(String(decoded.stdout || "")) };
  if (decoded.status === 0 && !decoded.error && (job.requireAlpha || video.codec_name === "dxv")) {
    const count = Number(video.nb_read_frames), frameBytes = Number(video.width) * Number(video.height) * 4;
    const indices = job.alphaFrameIndices === undefined
      ? [...new Set([0.25, 0.5, 0.75].map(fraction => Math.min(count - 1, Math.floor(count * fraction))))]
      : job.alphaFrameIndices;
    if (!Number.isSafeInteger(count) || count < 1 || !Array.isArray(indices) || indices.length < 1 || indices.length > 8
      || new Set(indices).size !== indices.length || indices.some(i => !Number.isSafeInteger(i) || i < 0 || i >= count)
      || !Number.isSafeInteger(frameBytes) || frameBytes < 4 || frameBytes * indices.length > 64 * 1024 * 1024) {
      evidence.alphaFrames = []; evidence.alphaProbeReason = "invalid_or_oversize_alpha_sample";
    } else {
      const selected = [...indices].sort((a, b) => a - b);
      // DXV YG10 reports YCgCo; swscale cannot negotiate that matrix in FFmpeg 9.
      // zscale converts it explicitly through planar RGBA, retaining alpha.
      const rgbaFilter = video.codec_name === "dxv" && video.color_space === "ycgco"
        ? "zscale=matrixin=ycgco:matrix=gbr,format=gbrap,format=rgba" : "format=rgba";
      evidence.alphaColorConversion = rgbaFilter;
      const samples = runner(ffmpeg, ["-nostdin", "-v", "error", "-xerror", "-i", job.outputPath,
        "-map", "0:v:0", "-vf", `select=${selected.map(i => `eq(n\\,${i})`).join("+")},${rgbaFilter}`,
        "-fps_mode", "passthrough", "-frames:v", String(selected.length), "-f", "rawvideo", "pipe:1"],
      120000, true, frameBytes * selected.length + 1024 * 1024);
      evidence.alphaFrames = samples.status === 0 && !samples.error && Buffer.isBuffer(samples.stdout)
        && samples.stdout.length === frameBytes * selected.length
        ? selected.map((index, i) => inspectRgbaFrame(samples.stdout.subarray(i * frameBytes, (i + 1) * frameBytes),
          Number(video.width), Number(video.height), index)) : [];
      evidence.alphaProbeReason = evidence.alphaFrames.length ? null : "alpha_frame_decode_failed";
    }
  }
  const after = fs.statSync(job.outputPath), finalHash = hashFile(job.outputPath);
  evidence.mediaStable = before.size === after.size && before.mtimeMs === after.mtimeMs && before.dev === after.dev
    && before.ino === after.ino && before.birthtimeMs === after.birthtimeMs && evidence.mediaSha256 === finalHash;
  if (!evidence.mediaStable) return { ...precheck, technicalMediaVerified: false, reason: "media_changed_during_probe", mediaEvidence: evidence };
  if (video.codec_name === "dxv" && decoded.status === 0 && evidence.fullDecode.decodedFrames !== Number(video.nb_read_frames)) {
    return { ...precheck, technicalMediaVerified: false, reason: "full_decode_frame_count_mismatch", mediaEvidence: evidence };
  }
  if (video.codec_name === "dxv" && evidence.dxv.supported && evidence.dxv.packetCount !== Number(video.nb_read_frames)) {
    return { ...precheck, technicalMediaVerified: false, reason: "dxv_packet_frame_count_mismatch", mediaEvidence: evidence };
  }
  return validateAmeMedia(job, metadata, decoded, evidence);
}

function main(args) {
  const values = {}, flags = new Set();
  for (let i = 0; i < args.length; i++) {
    const name = args[i];
    if (["--require-alpha", "--require-dxv3", "--require-dxv-hq"].includes(name)) flags.add(name);
    else if (["--job", "--observation", "--ffmpeg", "--ffprobe"].includes(name) && args[i + 1]) values[name] = args[++i];
    else throw new Error("Usage: report:ame-media -- --job JOB.json --observation AME-DONE.json [--ffmpeg PATH --ffprobe PATH] [--require-alpha --require-dxv3 --require-dxv-hq]");
  }
  if (!values["--job"] || !values["--observation"]) throw new Error("--job and --observation required");
  const job = readJson(values["--job"]);
  const observation = readJson(values["--observation"]);
  if (flags.has("--require-alpha")) job.requireAlpha = true;
  if (flags.has("--require-dxv3")) job.requireDxv3 = true;
  if (flags.has("--require-dxv-hq")) job.requireDxvHighQuality = true;
  let file = { exists: false };
  if (job && typeof job.outputPath === "string") {
    try {
      const stat = fs.statSync(job.outputPath);
      if (stat.isFile()) file = { exists: true, bytes: stat.size, modifiedAt: stat.mtime.toISOString() };
    } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  const passive = evaluateAmePassiveStatus(job, observation, file, null);
  if (!passive.ok || passive.state !== "needs_media_probe") {
    const result = { ...passive, technicalMediaVerified: false, completionVerified: false };
    process.stdout.write(`${JSON.stringify(result)}\n`);
    process.exitCode = 2;
    return;
  }
  const result = probeMediaFile(job, { ffmpeg: values["--ffmpeg"], ffprobe: values["--ffprobe"] });
  process.stdout.write(`${JSON.stringify({ ...passive, ...result, completionVerified: false })}\n`);
  if (!result.technicalMediaVerified) process.exitCode = 2;
}

if (require.main === module) {
  try { main(process.argv.slice(2)); }
  catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}

module.exports = { main, probeMediaFile, inspectPackets, hashFile };
