'use strict';

// Independent arbitrary-precision fixture oracle and source review packet.
// Never compiles/launches native code or grants runtime authority.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const PAIRS = Object.freeze([
  ['4038000000000000', '3fa5555555555555', 24, 1],
  ['4039000000000000', '3fa47ae147ae147b', 25, 1],
  ['403e000000000000', '3fa1111111111111', 30, 1],
  ['4049000000000000', '3f947ae147ae147b', 50, 1],
  ['404e000000000000', '3f91111111111111', 60, 1],
  ['4037f9dcb5112287', '3fa55acb6f46508e', 24000, 1001],
  ['403df853e2556b28', '3fa1156f8c384072', 30000, 1001],
  ['404df853e2556b28', '3f91156f8c384072', 60000, 1001],
  ['403df853e2556b27', '3fa1156f8c384072', 30000, 1001],
  ['404df853e2556b27', '3f91156f8c384072', 60000, 1001],
]);
const ROOT = path.resolve(__dirname, '..');
const HEADER = 'native/owned-runtime-local-session/owned_observed_timing.h';
const PROOF = 'native/owned-runtime-local-session/owned_observed_timing_proof_main.cpp';
const SCRIPT = 'scripts/owned-observed-timing-source-proof.js';
const MASK52 = (1n << 52n) - 1n;
const SIGN = 1n << 63n;
function hex(bits) { return bits.toString(16).padStart(16, '0'); }
function bits(text) { return BigInt(`0x${text}`); }
function dyadic(value) {
  const exp = Number((value >> 52n) & 2047n);
  assert.ok(exp > 0 && exp < 2047 && (value & SIGN) === 0n, 'positive normal dyadic input');
  return { mantissa: (value & MASK52) + (1n << 52n), power: exp - 1023 - 52 };
}
function canonicalProductBits(duration, factor) {
  assert.ok(Number.isInteger(factor) && Math.abs(factor) <= 0xffffffff, 'bounded integer oracle factor');
  const d = dyadic(duration);
  const negative = factor < 0;
  const exact = d.mantissa * BigInt(Math.abs(factor));
  if (exact === 0n) return 0n;
  const length = exact.toString(2).length;
  let exponent = d.power + length - 1;
  let significand;
  if (length <= 53) significand = exact << BigInt(53 - length);
  else {
    const divisor = 1n << BigInt(length - 53);
    significand = exact / divisor;
    const remainder = exact % divisor;
    const twiceRemainder = remainder * 2n;
    if (twiceRemainder > divisor || (twiceRemainder === divisor && (significand % 2n) === 1n)) significand += 1n;
    if (significand === (1n << 53n)) { significand /= 2n; exponent += 1; }
  }
  assert.ok(exponent >= -1022 && exponent <= 1023, 'normal finite oracle output');
  return (negative ? SIGN : 0n) | (BigInt(exponent + 1023) << 52n) | (significand & MASK52);
}
function verifyRoundingCell(duration, factor, candidate) {
  // Separate rational midpoint test: the exact product lies in candidate's
  // predecessor/successor rounding cell, with even ownership at both ties.
  assert.ok(factor > 0 && (candidate & SIGN) === 0n);
  const d = dyadic(duration); const c = dyadic(candidate);
  const predecessor = dyadic(candidate - 1n); const successor = dyadic(candidate + 1n);
  const power = Math.min(d.power, c.power, predecessor.power, successor.power);
  const scaled = (value) => value.mantissa << BigInt(value.power - power);
  const twiceExact = (d.mantissa * BigInt(factor) << BigInt(d.power - power)) * 2n;
  const lower = scaled(predecessor) + scaled(c); const upper = scaled(c) + scaled(successor);
  const even = (candidate & 1n) === 0n;
  assert.ok(twiceExact > lower || (even && twiceExact === lower), 'lower RN-even rounding cell');
  assert.ok(twiceExact < upper || (even && twiceExact === upper), 'upper RN-even rounding cell');
}
function fixtures() {
  const positives = [];
  const outside = [];
  for (const [rate, duration, numerator, denominator] of PAIRS) {
    for (const [n, start, getter] of [[4, 17, true], [8191, -17, true], [5, 123, false]]) {
      positives.push({ rate, duration, durationBits: hex(canonicalProductBits(bits(duration), n)),
        startBits: hex(getter ? canonicalProductBits(bits(duration), start) : 0n), n, numerator, denominator, start, getter });
    }
    outside.push({ rate, duration, below: hex(canonicalProductBits(bits(duration), 3)), above: hex(canonicalProductBits(bits(duration), 8192)) });
  }
  return { positives, outside };
}
function formatCppFixtures() {
  const data = fixtures();
  const positive = data.positives.map((f) => `    {0x${f.rate}ULL,0x${f.duration}ULL,0x${f.durationBits}ULL,0x${f.startBits}ULL,${f.n},${f.numerator},${f.denominator},${f.start},${f.getter}},`).join('\n');
  const outside = data.outside.map((f) => `    {0x${f.rate}ULL,0x${f.duration}ULL,0x${f.below}ULL,0x${f.above}ULL},`).join('\n');
  return `${positive}\n// OUTSIDE\n${outside}\n`;
}
function proof() {
  let roundingCellChecks = 0;
  let uniquenessChecks = 0;
  let negativeChecks = 0;
  assert.equal(hex(canonicalProductBits(0x3ff0000000000001n, 3)), '4008000000000002', 'odd midpoint rounds upward to even');
  assert.equal(hex(canonicalProductBits(0x3ff0000000000003n, 3)), '4008000000000004', 'even midpoint rounds downward');
  assert.equal(hex(canonicalProductBits(0x3ff0000000000000n, 0)), '0000000000000000', 'canonical zero');
  const header = fs.readFileSync(path.join(ROOT, HEADER), 'utf8');
  const nativeProof = fs.readFileSync(path.join(ROOT, PROOF), 'utf8');
  const actualPairs = [...header.matchAll(/\{0x([0-9a-f]{16})ULL,0x([0-9a-f]{16})ULL,(\d+),(\d+)\}/g)]
    .map((m) => [m[1], m[2], Number(m[3]), Number(m[4])]);
  assert.deepEqual(actualPairs, PAIRS, 'exact approved source pair table');
  assert.equal(new Set(actualPairs.map(([r, d]) => `${r}/${d}`)).size, 10, 'no duplicate exact bit-pair keys');
  const reciprocalAlternates = actualPairs.filter(([, d], i) => actualPairs.slice(0, i).some(([, earlier]) => earlier === d));
  assert.deepEqual(reciprocalAlternates, [PAIRS[8], PAIRS[9]], 'exactly two reviewed reciprocal FPS variants');
  assert.match(header, /kMinimumObservedRootFramesV1 = 4;/);
  assert.match(header, /kMaximumObservedRootFramesV1 = 8191;/);
  const generated = fixtures();
  const positiveBlock = nativeProof.split('// ORACLE_POSITIVE_BEGIN')[1]?.split('// ORACLE_POSITIVE_END')[0];
  assert.ok(positiveBlock, 'fixed native positive fixture block');
  const actualPositive = [...positiveBlock.matchAll(/\{0x([0-9a-f]{16})ULL,0x([0-9a-f]{16})ULL,0x([0-9a-f]{16})ULL,0x([0-9a-f]{16})ULL,(\d+),(\d+),(\d+),(-?\d+),(true|false)\}/g)]
    .map((m) => ({ rate: m[1], duration: m[2], durationBits: m[3], startBits: m[4], n: Number(m[5]), numerator: Number(m[6]), denominator: Number(m[7]), start: Number(m[8]), getter: m[9] === 'true' }));
  assert.deepEqual(actualPositive, generated.positives, 'native positive literals versus independent BigInt oracle');
  const outsideBlock = nativeProof.split('// ORACLE_OUTSIDE_BEGIN')[1]?.split('// ORACLE_OUTSIDE_END')[0];
  assert.ok(outsideBlock, 'fixed native outside fixture block');
  const actualOutside = [...outsideBlock.matchAll(/\{0x([0-9a-f]{16})ULL,0x([0-9a-f]{16})ULL,0x([0-9a-f]{16})ULL,0x([0-9a-f]{16})ULL\}/g)]
    .map((m) => ({ rate: m[1], duration: m[2], below: m[3], above: m[4] }));
  assert.deepEqual(actualOutside, generated.outside, 'native N3/N8192 literals versus oracle');
  for (const [rate, duration] of PAIRS) {
    const durationBits = bits(duration); const values = new Set(); let last = -1n;
    for (let n = 4; n <= 8191; n += 1) {
      const canonical = canonicalProductBits(durationBits, n);
      verifyRoundingCell(durationBits, n, canonical); roundingCellChecks += 1;
      assert.ok(canonical > last && !values.has(canonical.toString()), 'strictly increasing unique bounded canonical duration');
      values.add(canonical.toString()); last = canonical; uniquenessChecks += 1;
    }
    assert.ok(!values.has(canonicalProductBits(durationBits, 3).toString())); negativeChecks += 1;
    assert.ok(!values.has(canonicalProductBits(durationBits, 8192).toString())); negativeChecks += 1;
    assert.ok(!PAIRS.some(([r, d]) => bits(r) === bits(rate) + 2n && d === duration)); negativeChecks += 1;
    assert.ok(!PAIRS.some(([r, d]) => r === rate && bits(d) === durationBits + 1n)); negativeChecks += 1;
    assert.ok(!PAIRS.some(([r, d]) => r === rate && bits(d) === durationBits - 1n)); negativeChecks += 1;
    const index = PAIRS.findIndex(([r]) => r === rate);
    assert.equal(PAIRS.some(([r, d]) => bits(r) === bits(rate) + 1n && d === duration), index === 8 || index === 9); negativeChecks += 1;
    assert.equal(PAIRS.some(([r, d]) => bits(r) === bits(rate) - 1n && d === duration), index === 6 || index === 7); negativeChecks += 1;
    assert.ok(!values.has((canonicalProductBits(durationBits, 4) + 1n).toString())); negativeChecks += 1;
    for (const start of [17, -17, 2147483647, -2147483648]) {
      const positive = canonicalProductBits(durationBits, Math.abs(start));
      verifyRoundingCell(durationBits, Math.abs(start), positive); roundingCellChecks += 1;
      assert.equal(canonicalProductBits(durationBits, start), positive | (start < 0 ? SIGN : 0n));
    }
  }
  const sourceManifest = [HEADER, PROOF, SCRIPT].map((file) => ({ file, sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, file))).digest('hex') }));
  return { schema: 'ae-agent.owned-observed-timing-source-proof.v1', configuredRole: 'ae_implementer', configuredEffort: 'high', effectiveModelEffort: 'unknown',
    sourceOnly: true, compiledCppEvidence: false, runtimeAuthority: false, approvedPairs: actualPairs.length,
    positiveLiteralFixtures: actualPositive.length, outsideLiteralFixtures: actualOutside.length,
    oracleRoundingCellChecks: roundingCellChecks, oracleUniquenessChecks: uniquenessChecks, oracleNegativeChecks: negativeChecks,
    sourceManifest, reviewRequest: 'Review portable two-limb multiplication, RN-even carry/ties, exact pair whitelist, unique N4..8191, optional signed32 start evidence and fail-closed output. Native compilation, parser/schema observations, C1 ordering and root identity are outside this source-only proof.' };
}
if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    if (args.length === 1 && args[0] === '--cpp-fixtures') process.stdout.write(formatCppFixtures());
    else if (!args.length || (args.length === 1 && args[0] === '--source-proof')) process.stdout.write(`${JSON.stringify(proof())}\n`);
    else throw new Error('Use --source-proof or --cpp-fixtures; no build/runtime operation is supported.');
  } catch (error) { process.stderr.write(`Observed timing source proof failed: ${error.message}\n`); process.exitCode = 1; }
}
module.exports = { canonicalProductBits, verifyRoundingCell, fixtures, proof };
