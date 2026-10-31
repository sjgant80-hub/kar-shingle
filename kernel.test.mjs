// kernel.test.mjs — Kar-Shingle's kernel (the KERNEL block of index.html, generated into kernel.mjs).
// The MinHash signature is re-derived here from the published spec with Node's own SHA-256, independently of
// the kernel's Web Crypto path; thresholds and edge cases are worked out by hand. witness v0.6 checks every test bites.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  sha256Hex, normalize, shingleSet, MOD32, getPerms, analyzeDoc, similarityOf, verdictOf, canonJSON, buildReceipt,
  SELF, runSelfTest, MAX_CHARS, clampText, clampParams, compareTexts,
} from './kernel.mjs';

const nodeSha = (s) => createHash('sha256').update(s, 'utf8').digest('hex');

// the spec, written out again: shingles → first 32 bits of SHA-256 → min over (a·h + b) mod 2^32 per permutation
function specSignature(norm, k, N) {
  const words = norm.split(' ');
  const shingles = [...new Set(words.slice(0, words.length - k + 1).map((_, i) => words.slice(i, i + k).join(' ')))];
  const base = shingles.map((x) => BigInt('0x' + nodeSha(x).slice(0, 8)));
  const sig = [];
  for (let i = 0; i < N; i++) {
    const a = BigInt('0x' + nodeSha('kar-shingle-perm-a-' + i).slice(0, 8)) | 1n;
    const b = BigInt('0x' + nodeSha('kar-shingle-perm-b-' + i).slice(0, 8));
    sig.push(base.map((h) => (a * h + b) % (1n << 32n)).reduce((m, v) => (v < m ? v : m)));
  }
  return sig;
}

test('sha256Hex agrees with Node\'s SHA-256', async () => {
  assert.equal(await sha256Hex('abc'), nodeSha('abc'));
  assert.equal(await sha256Hex('é'), nodeSha('é'));
});

test('normalize: lower case, whitespace runs collapsed, trimmed', () => {
  assert.equal(normalize('  The  QUICK\n\tfox '), 'the quick fox');
});

test('shingleSet: every distinct run of k words; fewer than k words gives none', () => {
  assert.deepEqual(shingleSet('a b c d e', 5), ['a b c d e']);
  assert.deepEqual(shingleSet('a b c d e f', 5), ['a b c d e', 'b c d e f']);
  assert.deepEqual(shingleSet('a b a b a b', 2), ['a b', 'b a']);
  assert.deepEqual(shingleSet('a b c d', 5), []);
  assert.deepEqual(shingleSet('', 5), []);
});

test('getPerms: odd multipliers from the published seeds, cached per N', async () => {
  assert.equal(MOD32, 4294967296n);
  const p = await getPerms(3);
  assert.equal(p.length, 3);
  assert.equal(p[0].a, BigInt('0x' + nodeSha('kar-shingle-perm-a-0').slice(0, 8)) | 1n);
  assert.equal(p[2].b, BigInt('0x' + nodeSha('kar-shingle-perm-b-2').slice(0, 8)));
  for (const { a } of p) assert.equal(a % 2n, 1n);
  assert.equal(await getPerms(3), p);
});

test('analyzeDoc: the signature is exactly the spec\'s MinHash', async () => {
  const d = await analyzeDoc('  A  b\nc d e f ', 5, 4);
  assert.equal(d.normalized, 'a b c d e f');
  assert.equal(d.normalizedSha256, nodeSha('a b c d e f'));
  assert.equal(d.shingleCount, 2);
  const want = specSignature('a b c d e f', 5, 4);
  assert.deepEqual(d.sig, want);
  assert.equal(d.signatureSha256, nodeSha(want.map((v) => v.toString(16).padStart(8, '0')).join('')));
  const long = await analyzeDoc(SELF.C, 5, 16);
  assert.deepEqual(long.sig, specSignature(normalize(SELF.C), 5, 16));
});

test('analyzeDoc: too few words gives no signature, not a throw', async () => {
  assert.deepEqual(await analyzeDoc('too few words', 5, 8),
    { shingleCount: 0, normalized: 'too few words', normalizedSha256: nodeSha('too few words'), sig: null, signatureSha256: null });
});

test('similarityOf: the share of equal signature slots; null when either side has no signature', () => {
  assert.deepEqual(similarityOf([1n, 2n, 3n, 4n], [1n, 9n, 3n, 9n]), { matches: 2, total: 4, ratio: 0.5 });
  assert.equal(similarityOf(null, [1n]), null);
  assert.equal(similarityOf([1n], null), null);
});

test('verdictOf: thresholds 0.75 and 0.35 are inclusive; identical text and missing data come first', () => {
  const doc = (count, hash) => ({ shingleCount: count, normalizedSha256: hash });
  const at = (ratio) => verdictOf(doc(5, 'x'), doc(5, 'y'), { ratio });
  assert.equal(at(0.75), 'NEAR-DUPLICATE');
  assert.equal(at(0.7499), 'OVERLAPPING');
  assert.equal(at(0.35), 'OVERLAPPING');
  assert.equal(at(0.3499), 'DISTINCT');
  assert.equal(verdictOf(doc(5, 'x'), doc(5, 'x'), { ratio: 0 }), 'IDENTICAL');
  assert.equal(verdictOf(doc(0, 'x'), doc(5, 'y'), null), 'INSUFFICIENT-DATA');
  assert.equal(verdictOf(doc(5, 'x'), doc(0, 'y'), null), 'INSUFFICIENT-DATA');
});

test('canonJSON: keys sorted at every depth, arrays in order, primitives as JSON', () => {
  assert.equal(canonJSON({ b: 1, a: [2, { d: null, c: 'x' }] }), '{"a":[2,{"c":"x","d":null}],"b":1}');
  assert.equal(canonJSON(null), 'null');
  assert.equal(canonJSON(5), '5');
});

test('buildReceipt: the receipt fields, its canonical JSON and its hash', async () => {
  const A = { shingleCount: 2, normalizedSha256: 'na', signatureSha256: 'sa' };
  const B = { shingleCount: 3, normalizedSha256: 'nb', signatureSha256: 'sb' };
  const r = await buildReceipt(5, 4, A, B, { matches: 1, total: 4, ratio: 0.25 }, 'DISTINCT');
  assert.equal(r.canon, '{"algorithm":"kar-shingle-minhash-v1","docA":{"normalizedSha256":"na","shingleCount":2,"signatureSha256":"sa"},' +
    '"docB":{"normalizedSha256":"nb","shingleCount":3,"signatureSha256":"sb"},"k":5,"n":4,"similarityMatches":1,"similarityTotal":4,"verdict":"DISTINCT"}');
  assert.equal(r.hash, nodeSha(r.canon));
  const none = await buildReceipt(5, 4, A, B, null, 'INSUFFICIENT-DATA');
  assert.equal(none.receipt.similarityMatches, null);
  assert.equal(none.receipt.similarityTotal, null);
});

test('clampText and clampParams: the page\'s limits', () => {
  assert.equal(MAX_CHARS, 200000);
  assert.equal(clampText('x'.repeat(200001)).length, 200000);
  assert.equal(clampText('short'), 'short');
  assert.deepEqual(clampParams('7', '32'), { k: 7, N: 32 });
  assert.deepEqual(clampParams(undefined, undefined), { k: 5, N: 64 });
  assert.deepEqual(clampParams(1, 1000), { k: 2, N: 256 });
  assert.deepEqual(clampParams(99, 1), { k: 10, N: 4 });
});

test('compareTexts: a padded copy is a NEAR-DUPLICATE, an unrelated text DISTINCT, a copy IDENTICAL', async () => {
  const padded = await compareTexts(SELF.A, SELF.B, 5, 64);
  assert.equal(padded.verdict, 'NEAR-DUPLICATE');
  assert.ok(padded.sim.ratio >= 0.75 && padded.sim.ratio < 1);
  assert.equal((await compareTexts(SELF.A, SELF.C, 5, 64)).verdict, 'DISTINCT');
  const same = await compareTexts(SELF.A, '  ' + SELF.A.toUpperCase() + '\n', 5, 64);
  assert.equal(same.verdict, 'IDENTICAL');
  assert.equal(same.bundle.hash, nodeSha(same.bundle.canon));
});

test('runSelfTest: the page\'s six checks all pass on the real kernel (details pinned)', async () => {
  const r = await runSelfTest();
  assert.equal(r.pass, true);
  assert.deepEqual(r.rows.map((x) => [x.pass, x.detail]), [
    [true, 'verdict=IDENTICAL ratio=1'], [true, 'verdict=NEAR-DUPLICATE ratio=0.828'], [true, 'verdict=NEAR-DUPLICATE ratio=0.797'],
    [true, 'verdict=DISTINCT ratio=0.000'], [true, 'sigHash match=true'], [true, 'shingleCount=0'],
  ]);
});

test('runSelfTest: each check fails on a faulty implementation (the self-test can fail)', async () => {
  const real = { analyzeDoc, similarityOf, verdictOf };
  // identical texts whose similarity is reported below 1
  const lowSim = await runSelfTest({ ...real, similarityOf: (x, y) => ({ ...similarityOf(x, y), ratio: Math.min(similarityOf(x, y).ratio, 0.99) }) });
  assert.equal(lowSim.pass, false);
  assert.equal(lowSim.rows[0].pass, false);
  // a signature that changes between two runs of the same text
  let calls = 0;
  const unstable = await runSelfTest({ ...real, analyzeDoc: async (t, k, n) => { const d = await analyzeDoc(t, k, n); calls++; return calls === 2 ? { ...d, signatureSha256: 'x' } : d; } });
  assert.equal(unstable.rows[4].pass, false);
  assert.equal(unstable.rows[4].detail, 'sigHash match=false');
  // a verdict function that never says DISTINCT
  const noDistinct = await runSelfTest({ ...real, verdictOf: (a, b, s) => (verdictOf(a, b, s) === 'DISTINCT' ? 'OVERLAPPING' : verdictOf(a, b, s)) });
  assert.deepEqual(noDistinct.rows.map((x) => x.pass), [true, true, true, false, true, true]);
  // an analysis that never runs out of words
  const neverShort = await runSelfTest({ ...real, analyzeDoc: async (t, k, n) => ({ ...(await analyzeDoc(t + ' pad pad pad pad pad', k, n)) }) });
  assert.equal(neverShort.rows[5].pass, false);
  // padded and word-swapped copies no longer caught
  const blind = await runSelfTest({ ...real, verdictOf: (a, b, s) => (verdictOf(a, b, s) === 'NEAR-DUPLICATE' ? 'OVERLAPPING' : verdictOf(a, b, s)) });
  assert.deepEqual(blind.rows.map((x) => x.pass), [true, false, false, true, true, true]);
  // a broken environment is reported as a failed row, with the error's message
  const broken = await runSelfTest({ ...real, analyzeDoc: async () => { throw new TypeError('no digest'); } });
  assert.deepEqual(broken, { pass: false, rows: [{ label: 'Self-test threw an unexpected error', pass: false, detail: 'no digest' }] });
  const thrownString = await runSelfTest({ ...real, analyzeDoc: async () => { throw 'plain'; } });   // eslint-disable-line no-throw-literal
  assert.equal(thrownString.rows[0].detail, 'plain');
});

test('compareTexts never throws: a text that is not a string counts as empty', async () => {
  const r = await compareTexts(undefined, { length: 3 }, 5, 8);
  assert.equal(r.verdict, 'INSUFFICIENT-DATA');
  assert.equal(r.a.normalizedSha256, nodeSha(''));
  assert.equal(r.b.normalized, '');
  const half = await compareTexts(SELF.A, 42, 5, 8);
  assert.equal(half.a.shingleCount > 0, true);
  assert.equal(half.b.shingleCount, 0);
  assert.equal((await compareTexts(SELF.A, SELF.A, 5, 8)).verdict, 'IDENTICAL');
});
