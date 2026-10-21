'use strict';

// Read-only independent decoder for the fixed C++ synthetic fixture exporter.
// No child process, native addon, AE, runtime binding or production factory.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');

const MAX_RGBA = 67108864;
const MAX_PNG = 67200000;
const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const TINY = Buffer.from([255, 0, 0, 0, 0, 255, 0, 64, 0, 0, 255, 128, 255, 255, 255, 255]);
const FIXED = Object.freeze([
  { file: 'exact-2x2.png', width: 2, height: 2, pattern: 'exact-2x2-v1' },
  { file: 'stored-block-boundary.png', width: 8192, height: 2, pattern: 'xy-rgba-v1' },
  { file: 'fhd-pattern.png', width: 1920, height: 1080, pattern: 'xy-rgba-v1' },
  { file: 'maximum-rgba.png', width: 8192, height: 2048, pattern: 'xy-rgba-v1' },
]);

const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i += 1) {
  let c = i;
  for (let bit = 0; bit < 8; bit += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  CRC_TABLE[i] = c >>> 0;
}
function crcUpdate(crc, bytes) {
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 255] ^ (crc >>> 8);
  return crc >>> 0;
}
function crc32(bytes) { return (crcUpdate(0xffffffff, bytes) ^ 0xffffffff) >>> 0; }
function hex32(n) { return n.toString(16).padStart(8, '0'); }
function adler32(bytes) {
  let a = 1; let b = 0;
  for (const byte of bytes) { a = (a + byte) % 65521; b = (b + a) % 65521; }
  return ((b * 65536) + a) >>> 0;
}
function requireThat(value, reason) { if (!value) throw new Error(reason); }
function dimensions(width, height) {
  requireThat(Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0 &&
    width <= 8192 && height <= 8192 && width * height * 4 <= MAX_RGBA, 'bounded RGBA dimensions');
  return { rgbaBytes: width * height * 4, rowBytes: width * 4, scanBytes: height * (width * 4 + 1) };
}
function chunks(png) {
  requireThat(Buffer.isBuffer(png) && png.length >= 57 && png.length <= MAX_PNG, 'bounded PNG size');
  requireThat(png.subarray(0, 8).equals(SIGNATURE), 'PNG signature');
  const found = [];
  let at = 8;
  while (at < png.length) {
    requireThat(at + 12 <= png.length, 'truncated PNG chunk');
    const length = png.readUInt32BE(at);
    requireThat(length <= png.length - at - 12, 'PNG chunk payload bounds');
    const typeBytes = png.subarray(at + 4, at + 8);
    requireThat([...typeBytes].every((b) => (b >= 65 && b <= 90) || (b >= 97 && b <= 122)), 'PNG chunk type bytes');
    const type = typeBytes.toString('ascii');
    const data = png.subarray(at + 8, at + 8 + length);
    requireThat(crc32(png.subarray(at + 4, at + 8 + length)) === png.readUInt32BE(at + 8 + length), 'PNG chunk CRC');
    found.push({ type, data, at, length });
    at += length + 12;
    requireThat(found.length <= 3, 'fixed PNG chunk count');
  }
  requireThat(at === png.length && found.length === 3 && found.map((c) => c.type).join(',') === 'IHDR,IDAT,IEND', 'PNG fixed chunk order');
  requireThat(found[0].length === 13 && found[1].length > 0 && found[2].length === 0, 'PNG fixed chunk sizes');
  return found;
}
function storedBlocks(idat, scanBytes) {
  requireThat(idat.length >= 11 && idat[0] === 0x78 && idat[1] === 0x01, 'fixed zlib header');
  let at = 2; let total = 0; let blocks = 0; let final = false;
  while (!final) {
    requireThat(at + 5 <= idat.length - 4, 'truncated stored DEFLATE header');
    const flag = idat[at];
    requireThat(flag === 0 || flag === 1, 'only byte-aligned stored DEFLATE blocks');
    final = flag === 1;
    const size = idat.readUInt16LE(at + 1);
    const complement = idat.readUInt16LE(at + 3);
    requireThat(size > 0 && (size ^ complement) === 65535, 'stored DEFLATE length complement');
    requireThat(final || size === 65535, 'full nonfinal stored DEFLATE block');
    at += 5;
    requireThat(size <= idat.length - 4 - at && total + size <= scanBytes, 'stored DEFLATE payload bounds');
    total += size; at += size; blocks += 1;
    requireThat(blocks <= Math.ceil(scanBytes / 65535), 'stored DEFLATE block count bound');
  }
  requireThat(total === scanBytes && at === idat.length - 4, 'stored DEFLATE exact end and size');
  return blocks;
}
function expectedPixel(pattern, x, y, width) {
  if (pattern === 'exact-2x2-v1') return TINY.subarray((y * width + x) * 4, (y * width + x + 1) * 4);
  requireThat(pattern === 'xy-rgba-v1', 'fixed synthetic generation pattern');
  return [(x * 17 + y * 3) & 255, (x * 5 + y * 29) & 255, (x ^ y) & 255, (x + y) & 255];
}
function validatePng(png, descriptor) {
  const { width, height, pattern } = descriptor;
  const { rgbaBytes, rowBytes, scanBytes } = dimensions(width, height);
  requireThat(pattern !== 'exact-2x2-v1' || (width === 2 && height === 2), 'exact fixture dimensions');
  const parsed = chunks(png);
  const ihdr = parsed[0].data; const idat = parsed[1].data;
  requireThat(ihdr.readUInt32BE(0) === width && ihdr.readUInt32BE(4) === height, 'IHDR dimensions');
  requireThat(ihdr.subarray(8).equals(Buffer.from([8, 6, 0, 0, 0])), 'IHDR RGBA8 compression/filter/interlace');
  const blocks = storedBlocks(idat, scanBytes);
  const inflated = zlib.inflateSync(idat, { maxOutputLength: scanBytes, info: true });
  requireThat(inflated.buffer.length === scanBytes && inflated.engine.bytesWritten === idat.length, 'inflater exact consumption and scan size');
  const scan = inflated.buffer;
  requireThat(adler32(scan) === idat.readUInt32BE(idat.length - 4), 'independent zlib Adler32');
  const facts = { pixels: width * height, transparent: 0, opaque: 0, partial: 0, foreground: 0, alphaSum: 0, minimum: 255, maximum: 0 };
  let rgbaCrc = 0xffffffff;
  const rgbaHash = crypto.createHash('sha256');
  for (let y = 0; y < height; y += 1) {
    const at = y * (rowBytes + 1);
    requireThat(scan[at] === 0, 'every row uses filter0');
    const row = scan.subarray(at + 1, at + 1 + rowBytes);
    for (let x = 0; x < width; x += 1) {
      const expected = expectedPixel(pattern, x, y, width); const i = x * 4;
      requireThat(row[i] === expected[0] && row[i + 1] === expected[1] && row[i + 2] === expected[2] && row[i + 3] === expected[3], 'exact synthetic RGBA pixel');
      const alpha = row[i + 3];
      facts.alphaSum += alpha; facts.minimum = Math.min(facts.minimum, alpha); facts.maximum = Math.max(facts.maximum, alpha);
      if (alpha === 0) facts.transparent += 1;
      else { facts.foreground += 1; if (alpha === 255) facts.opaque += 1; else facts.partial += 1; }
    }
    rgbaCrc = crcUpdate(rgbaCrc, row); rgbaHash.update(row);
  }
  const result = { file: descriptor.file, width, height, rgbaBytes, pngBytes: png.length, storedBlocks: blocks,
    rgbaCrc32: hex32((rgbaCrc ^ 0xffffffff) >>> 0), pngCrc32: hex32(crc32(png)), alpha: facts,
    rgbaSha256: rgbaHash.digest('hex'), pngSha256: crypto.createHash('sha256').update(png).digest('hex') };
  if (descriptor.rgbaBytes !== undefined) assert.equal(descriptor.rgbaBytes, result.rgbaBytes, 'descriptor RGBA bytes');
  if (descriptor.pngBytes !== undefined) assert.equal(descriptor.pngBytes, result.pngBytes, 'descriptor PNG bytes');
  if (descriptor.rgbaCrc32 !== undefined) assert.equal(descriptor.rgbaCrc32, result.rgbaCrc32, 'descriptor RGBA CRC32');
  if (descriptor.pngCrc32 !== undefined) assert.equal(descriptor.pngCrc32, result.pngCrc32, 'descriptor PNG CRC32');
  if (descriptor.alpha !== undefined) assert.deepEqual(descriptor.alpha, facts, 'descriptor all alpha facts');
  return result;
}
function readRegular(file, maximum) {
  const flags = fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0);
  requireThat(!fs.lstatSync(file).isSymbolicLink(), 'fixture symlink refused');
  const fd = fs.openSync(file, flags);
  try {
    const before = fs.fstatSync(fd);
    requireThat(before.isFile() && before.size > 0 && before.size <= maximum, 'bounded regular fixture file');
    const bytes = Buffer.alloc(before.size);
    let at = 0;
    while (at < bytes.length) {
      const count = fs.readSync(fd, bytes, at, bytes.length - at, at);
      requireThat(count > 0, 'fixture truncated during read'); at += count;
    }
    const after = fs.fstatSync(fd);
    requireThat(before.size === after.size && before.mtimeMs === after.mtimeMs && before.ino === after.ino, 'fixture changed during read');
    return bytes;
  } finally { fs.closeSync(fd); }
}
function verifyManifest(manifestPath) {
  const full = path.resolve(manifestPath);
  requireThat(path.basename(full) === 'fixtures.json', 'fixed manifest filename');
  const manifest = JSON.parse(readRegular(full, 16384).toString('utf8'));
  requireThat(manifest.schema === 'ae-agent.media-foundation-fixtures.v1' && manifest.syntheticOnly === true &&
    manifest.authority === false && manifest.factory === false && manifest.aeCalls === 0, 'synthetic manifest identity and nonauthority');
  requireThat(Array.isArray(manifest.fixtures) && manifest.fixtures.length === FIXED.length, 'fixed finite fixture count');
  assert.deepEqual(manifest.refusals, [{ width: 8192, height: 8192, accepted: false, outputAndFactsUnchanged: true }], 'reported C++ refusal descriptor');
  const results = [];
  for (let i = 0; i < FIXED.length; i += 1) {
    const descriptor = manifest.fixtures[i]; const fixed = FIXED[i];
    for (const key of ['file', 'width', 'height', 'pattern']) assert.equal(descriptor[key], fixed[key], `fixed descriptor ${key}`);
    requireThat(Number.isInteger(descriptor.rgbaBytes) && Number.isInteger(descriptor.pngBytes) &&
      /^[0-9a-f]{8}$/.test(descriptor.rgbaCrc32) && /^[0-9a-f]{8}$/.test(descriptor.pngCrc32) && descriptor.alpha, 'required native output descriptors');
    const result = validatePng(readRegular(path.join(path.dirname(full), fixed.file), MAX_PNG), descriptor);
    if (i === 1) requireThat(result.storedBlocks > 1 && result.rgbaBytes + fixed.height > 65535, '65535 DEFLATE boundary exercised');
    if (i === 3) assert.equal(result.rgbaBytes, MAX_RGBA, 'exact maximum RGBA byte limit exercised');
    results.push(result);
  }
  return { schema: 'ae-agent.media-foundation-validation.v1', syntheticOnly: true, authority: false, factory: false,
    aeCalls: 0, osLoadedPeProof: false, nativeProducerProof: false, renderProof: false, fixtures: results,
    refusalEvidence: 'C++ manifest reports refusal; independent decoder does not execute producer or attest refused allocation' };
}

// Self-tests use a separate Node zlib compressor; these are verifier tests and
// must never be presented as compiled C++ fixture evidence.
function testChunk(type, data) {
  const header = Buffer.alloc(8); header.writeUInt32BE(data.length); header.write(type, 4, 4, 'ascii');
  const body = Buffer.concat([header.subarray(4), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
  return Buffer.concat([header, data, crc]);
}
function testPng(scan, ihdrOverride, idatOverride) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(2); ihdr.writeUInt32BE(2, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([SIGNATURE, testChunk('IHDR', ihdrOverride || ihdr),
    testChunk('IDAT', idatOverride || zlib.deflateSync(scan, { level: 0 })), testChunk('IEND', Buffer.alloc(0))]);
}
function selfTest() {
  let passed = 0; let negatives = 0;
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926); passed += 1;
  assert.equal(crc32(Buffer.alloc(0)), 0); passed += 1;
  assert.equal(adler32(Buffer.from('Wikipedia')), 0x11e60398); passed += 1;
  assert.equal(adler32(Buffer.alloc(0)), 1); passed += 1;
  const scan = Buffer.concat([Buffer.from([0]), TINY.subarray(0, 8), Buffer.from([0]), TINY.subarray(8)]);
  const png = testPng(scan); const descriptor = FIXED[0];
  const positive = validatePng(png, descriptor);
  assert.deepEqual(positive.alpha, { pixels: 4, transparent: 1, opaque: 1, partial: 2, foreground: 3, alphaSum: 447, minimum: 0, maximum: 255 }); passed += 1;
  const bad = (fn, reason) => { assert.throws(fn, reason); negatives += 1; };
  bad(() => validatePng(png.subarray(0, png.length - 1), descriptor), 'truncated PNG');
  bad(() => validatePng(Buffer.concat([png, Buffer.from([0])]), descriptor), 'trailing PNG byte');
  const signature = Buffer.from(png); signature[0] ^= 1; bad(() => validatePng(signature, descriptor), 'signature');
  const crc = Buffer.from(png); crc[29] ^= 1; bad(() => validatePng(crc, descriptor), 'CRC');
  const length = Buffer.from(png); length.writeUInt32BE(0xffffffff, 8); bad(() => validatePng(length, descriptor), 'chunk length overflow');
  const parsed = chunks(png); const ihdr = Buffer.from(parsed[0].data); ihdr[9] = 2;
  bad(() => validatePng(testPng(scan, ihdr), descriptor), 'RGB unsupported');
  const interlace = Buffer.from(parsed[0].data); interlace[12] = 1;
  bad(() => validatePng(testPng(scan, interlace), descriptor), 'interlace unsupported');
  const wrongWidth = Buffer.from(parsed[0].data); wrongWidth.writeUInt32BE(3, 0);
  bad(() => validatePng(testPng(scan, wrongWidth), descriptor), 'dimensions mismatch');
  const reordered = Buffer.concat([SIGNATURE, testChunk('IDAT', parsed[1].data), testChunk('IHDR', parsed[0].data), testChunk('IEND', Buffer.alloc(0))]);
  bad(() => validatePng(reordered, descriptor), 'chunk order');
  const filter = Buffer.from(scan); filter[0] = 1;
  bad(() => validatePng(testPng(filter), descriptor), 'nonzero filter');
  const pixel = Buffer.from(scan); pixel[1] ^= 1;
  bad(() => validatePng(testPng(pixel), descriptor), 'wrong exact pixel');
  const alpha = Buffer.from(scan); alpha[4] = 1;
  bad(() => validatePng(testPng(alpha), descriptor), 'wrong alpha');
  const adler = Buffer.from(parsed[1].data); adler[adler.length - 1] ^= 1;
  bad(() => validatePng(testPng(scan, undefined, adler), descriptor), 'bad Adler/inflater error');
  const complement = Buffer.from(parsed[1].data); complement[5] ^= 1;
  bad(() => validatePng(testPng(scan, undefined, complement), descriptor), 'bad DEFLATE complement');
  const btype = Buffer.from(parsed[1].data); btype[2] = 3;
  bad(() => validatePng(testPng(scan, undefined, btype), descriptor), 'nonstored DEFLATE');
  bad(() => validatePng(testPng(scan, undefined, Buffer.concat([parsed[1].data, Buffer.from([0])])), descriptor), 'trailing zlib bytes');
  bad(() => validatePng(testPng(scan.subarray(0, scan.length - 1)), descriptor), 'truncated scanlines');
  bad(() => validatePng(testPng(Buffer.concat([scan, Buffer.from([0])])), descriptor), 'inflater output bound');
  bad(() => validatePng(png, { ...descriptor, rgbaCrc32: '00000000' }), 'native checksum mismatch');
  bad(() => validatePng(png, { ...descriptor, alpha: { ...positive.alpha, partial: 1 } }), 'native alpha mismatch');
  bad(() => validatePng(png, { ...descriptor, width: 8192, height: 8192 }), 'RGBA cap');
  bad(() => zlib.inflateSync(zlib.deflateSync(Buffer.alloc(19)), { maxOutputLength: 18 }), 'Node inflater maxOutputLength enforcement');
  return { schema: 'ae-agent.media-foundation-validator-self-test.v1', syntheticOnly: true, compiledCppEvidence: false,
    authority: false, factory: false, aeCalls: 0, positiveChecks: passed, negativeChecks: negatives };
}

if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    let result;
    if (args.length === 1 && args[0] === '--self-test') result = selfTest();
    else if (args.length === 2 && args[0] === '--fixtures') result = verifyManifest(args[1]);
    else throw new Error('Use --self-test or --fixtures <already-created fixtures.json>; this verifier never builds or launches native code.');
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`Media foundation verification failed: ${error.message}\n`); process.exitCode = 1;
  }
}
module.exports = { verifyManifest, validatePng, selfTest };
