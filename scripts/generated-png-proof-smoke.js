"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");

const {
  PNG_SIGNATURE,
  DEFAULT_MAX_PNG_BYTES,
  inspectPngBuffer,
  verifyCompletePngBuffer,
  waitForCompletePng
} = require("../mcp-server/generated-png-proof");
const { validateCachedPngReplay, toolResult } = require("../mcp-server/bridge-daemon");

const repoRoot = path.resolve(__dirname, "..");
const evidencePath = path.join(repoRoot, ".codex-runtime", "live-bohemian2016", "png-file-proof-evidence.json");
const exportsDir = path.join(repoRoot, "logs", "generated-exports");
let scratchDir;

function createMinimalPng(width = 10, height = 10, withTrailing = false, nonZeroIend = false, withoutIdat = false) {
  // 8-byte signature
  const sig = PNG_SIGNATURE;

  // IHDR chunk: 4 length + 4 type + 13 data + 4 CRC = 25 bytes
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(8, 8); // bit depth 8
  ihdrData.writeUInt8(2, 9); // color type 2 (truecolor)
  ihdrData.writeUInt8(0, 10); // compression
  ihdrData.writeUInt8(0, 11); // filter
  ihdrData.writeUInt8(0, 12); // interlace 0
  const ihdrChunk = Buffer.alloc(25);
  ihdrChunk.writeUInt32BE(13, 0);
  ihdrChunk.write("IHDR", 4, 4, "ascii");
  ihdrData.copy(ihdrChunk, 8);
  ihdrChunk.writeUInt32BE(0x12345678, 21); // dummy CRC

  // IDAT chunk: 4 length + 4 type + 10 data + 4 CRC = 22 bytes
  const idatChunk = Buffer.alloc(22);
  idatChunk.writeUInt32BE(10, 0);
  idatChunk.write("IDAT", 4, 4, "ascii");
  idatChunk.fill(0xaa, 8, 18);
  idatChunk.writeUInt32BE(0x87654321, 18); // dummy CRC

  // IEND chunk: 4 length + 4 type + (0 or nonZero) data + 4 CRC
  const iendDataLen = nonZeroIend ? 4 : 0;
  const iendChunk = Buffer.alloc(12 + iendDataLen);
  iendChunk.writeUInt32BE(iendDataLen, 0);
  iendChunk.write("IEND", 4, 4, "ascii");
  if (nonZeroIend) iendChunk.fill(0xbb, 8, 12);
  iendChunk.writeUInt32BE(0xae426082, 8 + iendDataLen); // CRC

  const chunks = withoutIdat ? [sig, ihdrChunk, iendChunk] : [sig, ihdrChunk, idatChunk, iendChunk];
  if (withTrailing) {
    chunks.push(Buffer.from([0x00, 0x01, 0x02]));
  }
  return Buffer.concat(chunks);
}

async function testRealEvidenceFiles() {
  if (!process.argv.includes("--local-evidence")) return { status: "skipped", reason: "Optional native history requires --local-evidence; portable tests always run." };
  if (!fs.existsSync(evidencePath)) return { status: "skipped", reason: "No local evidence JSON." };
  const evidence = JSON.parse(fs.readFileSync(evidencePath, "utf8"));
  assert(Array.isArray(evidence.mismatches), "Mismatches array must exist");
  const receiptPath = path.join(path.dirname(evidencePath), evidence.receipt);
  if (!fs.existsSync(receiptPath) || evidence.mismatches.some(row => !fs.existsSync(row.path))) return { status: "skipped", reason: "Local receipt/PNG history is incomplete." };
  const receipt = JSON.parse(fs.readFileSync(receiptPath, "utf8"));
  const files = receipt.steps.filter(step => step.tool === "save_comp_frame_png").map(step => step.result.file);
  if (files.some(file => !fs.existsSync(file.outputPath))) return { status: "skipped", reason: "Some captured local PNGs are unavailable." };
  for (const file of files) assert.strictEqual(verifyCompletePngBuffer(fs.readFileSync(file.outputPath)).ok, true);

  // Test the 7 prefix mismatches from evidence
  for (const mismatch of evidence.mismatches) {
    const fullPath = mismatch.path;
    assert(fs.existsSync(fullPath), `Exported file must exist: ${fullPath}`);
    const actualBytes = fs.readFileSync(fullPath);

    // 1. Full actual file must be accepted
    const fullProof = verifyCompletePngBuffer(actualBytes);
    assert.strictEqual(fullProof.ok, true, `Full file must be accepted: ${mismatch.outputFileName}`);
    assert.strictEqual(fullProof.pngComplete, true);
    assert.strictEqual(fullProof.byteLength, actualBytes.length);
    assert.strictEqual(fullProof.sha256, mismatch.actualSha256);
    assert(fullProof.width > 0 && fullProof.height > 0);

    // 2. Historical reported prefix must be rejected
    const prefixBytes = actualBytes.subarray(0, mismatch.reportedBytes);
    const prefixHash = crypto.createHash("sha256").update(prefixBytes).digest("hex");
    assert.strictEqual(prefixHash, mismatch.reportedSha256, "Prefix hash must match reported SHA");

    const prefixProof = verifyCompletePngBuffer(prefixBytes);
    assert.strictEqual(prefixProof.ok, false, `Prefix must be rejected: ${mismatch.outputFileName}`);
    assert(
      ["truncated_chunk_data", "missing_terminal_iend", "truncated_chunk_header"].includes(prefixProof.reason),
      `Prefix failure reason must be safe chunk bound or missing IEND, got: ${prefixProof.reason}`
    );
  }
  return { status: "passed", actualFiles: files.length, historicalPrefixesRejected: evidence.mismatches.length, historicalReceiptsPromoted: false };
}

function testSyntheticEdgeCases() {
  // Empty buffer
  assert.strictEqual(verifyCompletePngBuffer(Buffer.alloc(0)).ok, false);

  // Buffer under 45 bytes
  assert.strictEqual(verifyCompletePngBuffer(Buffer.alloc(20)).ok, false);

  // Invalid signature
  const badSig = Buffer.alloc(50);
  assert.strictEqual(verifyCompletePngBuffer(badSig).ok, false);

  // Signature only
  assert.strictEqual(verifyCompletePngBuffer(Buffer.from(PNG_SIGNATURE)).ok, false);

  // First chunk not IHDR
  const notIhdr = Buffer.concat([PNG_SIGNATURE, Buffer.alloc(40)]);
  assert.strictEqual(verifyCompletePngBuffer(notIhdr).ok, false);

  // Valid minimal PNG
  const validMinimal = createMinimalPng(640, 360);
  const validProof = verifyCompletePngBuffer(validMinimal);
  assert.strictEqual(validProof.ok, true);
  assert.strictEqual(validProof.width, 640);
  assert.strictEqual(validProof.height, 360);
  assert.strictEqual(validProof.pngComplete, true);
  assert.strictEqual(validProof.byteLength, validMinimal.length);
  assert.strictEqual(validProof.sha256, crypto.createHash("sha256").update(validMinimal).digest("hex"));

  // IEND not at end (trailing bytes)
  const trailingPng = createMinimalPng(640, 360, true);
  const trailingProof = verifyCompletePngBuffer(trailingPng);
  assert.strictEqual(trailingProof.ok, false);
  assert.strictEqual(trailingProof.reason, "trailing_bytes_after_iend");

  // Non-zero length IEND
  const nonZeroIendPng = createMinimalPng(640, 360, false, true);
  const nonZeroProof = verifyCompletePngBuffer(nonZeroIendPng);
  assert.strictEqual(nonZeroProof.ok, false);
  assert.strictEqual(nonZeroProof.reason, "invalid_iend_length");

  // Missing IDAT before IEND
  const noIdatPng = createMinimalPng(640, 360, false, false, true);
  const noIdatProof = verifyCompletePngBuffer(noIdatPng);
  assert.strictEqual(noIdatProof.ok, false);
  assert.strictEqual(noIdatProof.reason, "missing_idat_chunk");

  // Buffer oversize cap
  const oversizeProof = verifyCompletePngBuffer(validMinimal, { maxBytes: 30 });
  assert.strictEqual(oversizeProof.ok, false);
  assert.strictEqual(oversizeProof.reason, "buffer_oversize");
  const prefix = validMinimal.subarray(0, -12);
  assert(prefix.length > 0);
  assert.notStrictEqual(crypto.createHash("sha256").update(prefix).digest("hex"), validProof.sha256);
  assert.strictEqual(verifyCompletePngBuffer(prefix).reason, "missing_terminal_iend", "Nonempty hashed prefix is never completion proof");
  assert.strictEqual(validProof.buffer, validMinimal, "Hash, bytes and dimensions use the same accepted Buffer");
  const hugeChunk = Buffer.from(validMinimal); hugeChunk.writeUInt32BE(0x7fffffff, 33);
  assert.strictEqual(verifyCompletePngBuffer(hugeChunk).reason, "invalid_chunk_length");
  assert.strictEqual(verifyCompletePngBuffer(createMinimalPng(0, 360)).reason, "invalid_ihdr_dimensions");
}

async function testDiskWaitingAndStability() {
  fs.mkdirSync(scratchDir, { recursive: true });
  const testFile = path.join(scratchDir, "smoke_frame.png");
  const validBuffer = createMinimalPng(1920, 1080);
  const timers = [];

  try {
    // 1. Timeout on non-existent file
    const timeoutProof = await waitForCompletePng(path.join(scratchDir, "non_existent.png"), {
      timeoutMs: 100,
      intervalMs: 20
    });
    assert.strictEqual(timeoutProof.ok, false);
    assert.strictEqual(timeoutProof.reason, "timeout");

    // 2. Path escape guard
    const escapedProof = await waitForCompletePng(path.join(repoRoot, "package.json"), {
      exportDir: exportsDir,
      timeoutMs: 100
    });
    assert.strictEqual(escapedProof.ok, false);
    assert(escapedProof.reason === "path_escape" || escapedProof.reason === "invalid_extension");

    // 3. Staged append: empty -> prefix -> full complete file
    if (fs.existsSync(testFile)) fs.unlinkSync(testFile);
    fs.writeFileSync(testFile, Buffer.alloc(0)); // empty

    const waitPromise = waitForCompletePng(testFile, {
      timeoutMs: 1000,
      intervalMs: 25,
      stabilityIntervalMs: 30,
      exportDir: exportsDir
    });

    // Write partial prefix after 50ms
    timers.push(setTimeout(() => {
      fs.writeFileSync(testFile, validBuffer.subarray(0, -12));
    }, 50));

    // Complete the file after 120ms
    timers.push(setTimeout(() => {
      fs.writeFileSync(testFile, validBuffer);
    }, 120));

    const stagedResult = await waitPromise;
    assert.strictEqual(stagedResult.ok, true, "Staged write must resolve to complete snapshot");
    assert.strictEqual(stagedResult.pngComplete, true);
    assert.strictEqual(stagedResult.byteLength, validBuffer.length);
    assert.strictEqual(stagedResult.sha256, crypto.createHash("sha256").update(validBuffer).digest("hex"));
    assert.strictEqual(stagedResult.width, 1920);
    assert.strictEqual(stagedResult.height, 1080);
    assert(stagedResult.buffer.equals(validBuffer), "Buffer must match exact complete buffer");

    // 4. Stale file guard (minMtimeMs after existing file)
    const staleResult = await waitForCompletePng(testFile, {
      timeoutMs: 100,
      intervalMs: 20,
      minMtimeMs: Date.now() + 10000 // future timestamp
    });
    assert.strictEqual(staleResult.ok, false);
    assert.strictEqual(staleResult.reason, "timeout");
    assert.strictEqual((await waitForCompletePng(testFile, { maxBytes: 30 })).reason, "file_oversize");
    fs.writeFileSync(testFile, validBuffer.subarray(0, -12));
    const incomplete = await waitForCompletePng(testFile, { timeoutMs: 60, intervalMs: 10 });
    assert.strictEqual(incomplete.ok, false);
    assert.strictEqual(incomplete.lastFailureReason, "missing_terminal_iend");
    fs.writeFileSync(testFile, validBuffer);
    timers.push(setTimeout(() => fs.appendFileSync(testFile, Buffer.from([1])), 15));
    const lateAppend = await waitForCompletePng(testFile, { timeoutMs: 180, intervalMs: 10, stabilityIntervalMs: 70 });
    assert.strictEqual(lateAppend.ok, false, "Late append cannot yield trusted completion");
    assert(["late_append_during_stability", "trailing_bytes_after_iend"].includes(lateAppend.lastFailureReason));
  } finally {
    timers.forEach(clearTimeout);
    if (fs.existsSync(testFile)) fs.unlinkSync(testFile);
  }
}

function testCachedPngReplay() {
  fs.mkdirSync(scratchDir, { recursive: true });
  const testFile = path.join(scratchDir, "replay_frame.png");
  const validBuffer = createMinimalPng(640, 360);
  fs.writeFileSync(testFile, validBuffer);

  try {
    const validRecord = {
      result: toolResult({
          outputPath: testFile,
          file: {
            outputFileName: "replay_frame.png",
            outputPath: testFile,
            byteLength: validBuffer.length,
            width: 640,
            height: 360,
            sha256: crypto.createHash("sha256").update(validBuffer).digest("hex"),
            pngComplete: true
          }
        })
    };

    // 1. Cached valid PNG matches disk file
    const validCheck = validateCachedPngReplay(validRecord, { exportDir: scratchDir });
    assert.strictEqual(validCheck.ok, true);
    assert.strictEqual(validCheck.hasCompletion, true);

    // 2. Same-size modified PNG
    const modifiedBuffer = Buffer.from(validBuffer);
    modifiedBuffer[42] ^= 1; // IDAT data; keep the envelope and length valid.
    fs.writeFileSync(testFile, modifiedBuffer);
    const modifiedCheck = validateCachedPngReplay(validRecord, { exportDir: scratchDir });
    assert.strictEqual(modifiedCheck.ok, false);
    assert.strictEqual(modifiedCheck.reason, "sha256_mismatch");

    // 3. Appended PNG
    const appendedBuffer = Buffer.concat([validBuffer, Buffer.from([0x01, 0x02, 0x03])]);
    fs.writeFileSync(testFile, appendedBuffer);
    const appendedCheck = validateCachedPngReplay(validRecord, { exportDir: scratchDir });
    assert.strictEqual(appendedCheck.ok, false);
    assert(appendedCheck.reason === "byte_length_mismatch" || appendedCheck.reason.startsWith("invalid_png"));

    // 4. Truncated PNG
    const truncatedBuffer = validBuffer.subarray(0, validBuffer.length - 10);
    fs.writeFileSync(testFile, truncatedBuffer);
    const truncatedCheck = validateCachedPngReplay(validRecord, { exportDir: scratchDir });
    assert.strictEqual(truncatedCheck.ok, false);
    assert(truncatedCheck.reason === "byte_length_mismatch" || truncatedCheck.reason.startsWith("invalid_png"));

    // 5. Missing PNG
    if (fs.existsSync(testFile)) fs.unlinkSync(testFile);
    const missingCheck = validateCachedPngReplay(validRecord, { exportDir: scratchDir });
    assert.strictEqual(missingCheck.ok, false);
    assert.strictEqual(missingCheck.reason, "file_not_found");

    // 6. Foreign path
    const foreignRecord = {
      result: toolResult({
          outputPath: "C:\\foreign\\escape\\frame.png",
          file: {
            outputFileName: "frame.png",
            outputPath: "C:\\foreign\\escape\\frame.png",
            byteLength: validBuffer.length,
            width: 640,
            height: 360,
            sha256: crypto.createHash("sha256").update(validBuffer).digest("hex"),
            pngComplete: true
          }
        })
    };
    const foreignCheck = validateCachedPngReplay(foreignRecord, { exportDir: scratchDir });
    assert.strictEqual(foreignCheck.ok, false);
    assert.strictEqual(foreignCheck.reason, "foreign_path");

    // 7. Unchanged historical receipt without completion
    const historicalRecord = {
      result: toolResult({
          outputPath: testFile,
          file: {
            outputFileName: "replay_frame.png",
            outputPath: testFile,
            byteLength: 100,
            sha256: "somehash"
          }
        })
    };
    const histCheck = validateCachedPngReplay(historicalRecord, { exportDir: scratchDir });
    assert.strictEqual(histCheck.ok, true);
    assert.strictEqual(histCheck.hasCompletion, false);
    const historicalBefore = JSON.stringify(historicalRecord);
    validateCachedPngReplay(historicalRecord, { exportDir: scratchDir });
    assert.strictEqual(JSON.stringify(historicalRecord), historicalBefore, "Historical receipt is never rewritten/promoted");

    fs.writeFileSync(testFile, validBuffer);
    const payload = JSON.parse(validRecord.result.content[0].text);
    const wrongDimensions = { result: toolResult({ ...payload, file: { ...payload.file, width: 641 } }) };
    assert.strictEqual(validateCachedPngReplay(wrongDimensions, { exportDir: scratchDir }).reason, "dimensions_mismatch");
    for (const byteLength of [0, -1, Infinity, DEFAULT_MAX_PNG_BYTES + 1]) {
      const invalid = { result: toolResult({ ...payload, file: { ...payload.file, byteLength } }) };
      assert.strictEqual(validateCachedPngReplay(invalid, { exportDir: scratchDir }).reason, "invalid_cached_file_proof");
    }
    // Deterministic FS races exercise the production validator. Only synchronous
    // filesystem methods vary; no new production injection route or AE call.
    const originalStat = fs.statSync, originalRead = fs.readFileSync, originalRealpath = fs.realpathSync;
    const canonicalFile = originalRealpath(testFile), canonicalRoot = originalRealpath(scratchDir);
    const normalizePath = name => process.platform === "win32" ? path.resolve(name).toLowerCase() : path.resolve(name);
    const isFixturePath = name => normalizePath(name) === normalizePath(canonicalFile);
    // Keep actual canonical paths, but avoid implementation-dependent stat calls
    // inside realpath affecting the simulated before/after stat sequence.
    const fixtureRealpath = (name, ...args) => isFixturePath(name) ? canonicalFile
      : normalizePath(name) === normalizePath(canonicalRoot) ? canonicalRoot : originalRealpath(name, ...args);
    const stat = originalStat(testFile);
    let reads = 0;
    try {
      fs.realpathSync = fixtureRealpath;
      fs.statSync = name => isFixturePath(name)
        ? Object.assign(Object.create(stat), { size: DEFAULT_MAX_PNG_BYTES + 1 }) : originalStat(name);
      fs.readFileSync = (...args) => { reads++; return originalRead(...args); };
      assert.strictEqual(validateCachedPngReplay(validRecord, { exportDir: scratchDir }).reason, "file_oversize");
      assert.strictEqual(reads, 0, "Current size cap is checked before reading bytes");
    } finally { fs.statSync = originalStat; fs.readFileSync = originalRead; fs.realpathSync = originalRealpath; }
    for (const [field, changedAt, reason] of [["mtimeMs", 2, "concurrent_modification"], ["size", 2, "concurrent_modification"],
      ["ino", 2, "concurrent_modification"], ["ctimeMs", 3, "concurrent_modification_during_proof"]]) {
      let count = 0;
      try {
        fs.realpathSync = fixtureRealpath;
        const different = field === "ino" ? (stat.ino === 0 ? 1 : 0) : stat[field] + 1;
        assert.notStrictEqual(different, stat[field], "Fixture must actually change the snapshot value; inode +1 may round away");
        fs.statSync = name => {
          if (!isFixturePath(name)) return originalStat(name);
          count++;
          return count >= changedAt ? Object.assign(Object.create(stat), { [field]: different }) : stat;
        };
        assert.strictEqual(validateCachedPngReplay(validRecord, { exportDir: scratchDir }).reason, reason, `Snapshot ${field} change at stat ${changedAt}`);
      } finally { fs.statSync = originalStat; fs.realpathSync = originalRealpath; }
    }
  } finally {
    if (fs.existsSync(testFile)) fs.unlinkSync(testFile);
  }
}

function pngStep(outputPath) {
  const file = { outputFileName: path.basename(outputPath), outputPath, byteLength: 67, sha256: "a".repeat(64),
    width: 640, height: 360, pngComplete: true, existsAfter: true, deletedAfterReadBack: false, mimeType: "image/png" };
  const res = { before: [1, 1], applied: [1, 1], after: [1, 1], restored: true };
  return { index: 1, tool: "save_comp_frame_png", status: "completed",
    args: { compName: "Proof comp", time: 0, outputFileName: file.outputFileName },
    result: { comp: { name: "Proof comp", itemIndex: 1, itemId: 10 }, frame: { time: 0 }, resolutionFactor: res, file,
      verification: { ok: true, target: { tool: "save_comp_frame_png", outputFileName: file.outputFileName, outputPath }, file: { ...file }, resolutionFactor: res } } };
}

function testConfiguredBridgeRoot() {
  const bridgePath = path.join(repoRoot, "mcp-server", "bridge-daemon.js");
  const source = `const path=require('node:path');
    const {buildServerSemanticVerification}=require(${JSON.stringify(bridgePath)});
    const step=(${pngStep.toString()})(path.join(process.env.PROOF_EXPECTED_ROOT,'root.png'));
    const run={ok:true,steps:[step]};
    const positive=buildServerSemanticVerification({steps:run.steps},run);
    const wrong=JSON.parse(JSON.stringify(run));
    wrong.steps[0].result.file.outputPath=path.join(process.cwd(),'root.png');
    wrong.steps[0].result.verification.target.outputPath=wrong.steps[0].result.file.outputPath;
    const negative=buildServerSemanticVerification({steps:wrong.steps},wrong);
    console.log(JSON.stringify({positive:positive.status,negative:negative.status,scope:positive.verificationScope,acceptance:positive.acceptance}));`;
  for (const directOverride of [false, true]) {
    const customLogs = path.join(scratchDir, "configured-logs");
    const expectedRoot = directOverride ? path.join(scratchDir, "configured-png") : path.join(customLogs, "generated-exports");
    const env = { ...process.env, AE_BRIDGE_LOG_DIR: customLogs,
      AE_AGENT_LOG_DIR: path.join(scratchDir, "unrelated-agent-logs"), PROOF_EXPECTED_ROOT: expectedRoot };
    if (directOverride) env.AE_AGENT_GENERATED_EXPORT_DIR = expectedRoot;
    else delete env.AE_AGENT_GENERATED_EXPORT_DIR;
    const result = spawnSync(process.execPath, ["-e", source], { cwd: scratchDir, env, encoding: "utf8", timeout: 10000, maxBuffer: 1024 * 1024 });
    assert.strictEqual(result.status, 0, result.stderr);
    assert.deepStrictEqual(JSON.parse(result.stdout.trim()), { positive: "passed", negative: "needs_review", scope: "generated_png_file_proof_only", acceptance: "not_established" });
  }
}

async function main() {
  console.log("Running generated PNG proof smoke tests...");
  fs.mkdirSync(exportsDir, { recursive: true });
  scratchDir = fs.mkdtempSync(path.join(exportsDir, ".smoke-png-"));
  try {
    const localEvidence = await testRealEvidenceFiles();

    testSyntheticEdgeCases();
    console.log("  PASS: Synthetic corruptions, trailing bytes, and safe chunk bounds fail closed.");

    await testDiskWaitingAndStability();
    console.log("  PASS: Disk waiting, staged append, stability interval, and path escape verified.");

    testCachedPngReplay();
    console.log("  PASS: Cached PNG replay validates current disk snapshot without re-export.");
    testConfiguredBridgeRoot();
    console.log("  PASS: Actual bridge root binding with custom log/export root and other cwd.");

    console.log(JSON.stringify({
      ok: true,
      suite: "generated-png-proof-smoke",
      localEvidence,
      syntheticChecksPassed: true,
      cachedPngReplayPassed: true
    }, null, 2));
  } finally {
    const relative = path.relative(exportsDir, scratchDir);
    assert(relative && !relative.startsWith("..") && !path.isAbsolute(relative), "Cleanup stays within generated export scratch");
    fs.rmSync(scratchDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error("Generated PNG proof smoke FAILED:", err);
  process.exit(1);
});
