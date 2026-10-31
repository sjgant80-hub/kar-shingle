// cli.mjs — Kar-Shingle on the command line. build.mjs bundles this with the KERNEL block of index.html into
// scripts/kar-shingle.mjs, the single file the Agensi skill runs. It estimates how much word-level text two
// documents share (word shingles + MinHash over SHA-256-derived permutations) and gives a verdict plus a
// receipt anyone can recompute. Exit 0 = a verdict was computed (read "verdict") · 1 = a self-check failed ·
// 2 = the input could not be used.
import { readFileSync } from 'node:fs';
import { compareTexts, clampParams, runSelfTest } from './kernel.mjs';

const USAGE = `usage: node kar-shingle.mjs <a.txt> <b.txt>      compare two text files at K=5, N=64 (either may be - for stdin)
       node kar-shingle.mjs <input.json | ->         input: {"a": "text", "b": "text", "k": 5, "n": 64}  (k, n optional)
       node kar-shingle.mjs --selftest               run the page's built-in self-checks
output: a JSON report on stdout with verdict IDENTICAL, NEAR-DUPLICATE, OVERLAPPING, DISTINCT or INSUFFICIENT-DATA.
exit 0 = a verdict was computed, 2 = bad input`;

class InputError extends Error {}
const fail = (msg) => { throw new InputError(msg); };

function readText(path) {
  try { return readFileSync(path === '-' ? 0 : path, 'utf8'); }
  catch (e) { return fail(`cannot read ${path === '-' ? 'stdin' : path}: ${e.code || e.message}`); }
}

async function shingle(textA, textB, kIn, nIn) {
  const { k, N } = clampParams(kIn, nIn);
  const { a, b, sim, verdict, bundle } = await compareTexts(textA, textB, k, N);
  const side = (d) => ({ shingleCount: d.shingleCount, normalizedSha256: d.normalizedSha256, signatureSha256: d.signatureSha256 });
  return {
    tool: 'kar-shingle',
    algorithm: bundle.receipt.algorithm,
    verdict,
    similarity: sim ? { matches: sim.matches, total: sim.total, ratio: sim.ratio } : null,
    k,
    n: N,
    a: side(a),
    b: side(b),
    receipt: { sha256: bundle.hash, canonical: bundle.canon },
  };
}

async function main(args) {
  if (args.length === 1 && args[0] === '--selftest') {
    const r = await runSelfTest();
    const selftest = r.rows.map((x) => ({ name: x.label, ok: x.pass, detail: x.detail }));
    const passed = selftest.filter((t) => t.ok).length;
    process.stdout.write(JSON.stringify({ tool: 'kar-shingle', selftest, passed, total: selftest.length }, null, 2) + '\n');
    return r.pass ? 0 : 1;
  }
  let report;
  if (args.length === 2) {
    if (args[0] === '-' && args[1] === '-') fail('only one of the two documents can come from stdin');
    report = await shingle(readText(args[0]), readText(args[1]));
  } else if (args.length === 1 && args[0] !== '-h' && args[0] !== '--help') {
    let input;
    try { input = JSON.parse(readText(args[0])); } catch (e) { if (e instanceof InputError) throw e; fail(`the input is not valid JSON (${e.message})`); }
    if (!input || typeof input !== 'object' || typeof input.a !== 'string' || typeof input.b !== 'string') {
      fail('a single input must be an object with "a" and "b" (the two texts), and optionally "k" and "n"');
    }
    report = await shingle(input.a, input.b, input.k, input.n);
  } else {
    process.stderr.write(USAGE + '\n');
    return 2;
  }
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  return 0;
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (e) {
  process.stderr.write(`kar-shingle: ${e instanceof InputError ? e.message : 'internal error: ' + (e && e.message)}\n`);
  process.exitCode = e instanceof InputError ? 2 : 3;
}
