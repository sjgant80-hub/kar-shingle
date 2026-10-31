---
name: "kar-shingle"
description: "Measures how much word-level text two documents share, using word shingles and MinHash over SHA-256-derived permutations, and returns IDENTICAL, NEAR-DUPLICATE, OVERLAPPING or DISTINCT with a receipt anyone can recompute byte for byte. Use when the user asks whether two texts are duplicates, whether a document was copied, padded or lightly reworded from another, or to de-duplicate generated content before publishing or indexing it. Deterministic Node.js script with no LLM judge and no network."
summary: "Copied, padded or lightly reworded? Word shingles and MinHash give a similarity ratio and a verdict, IDENTICAL, NEAR-DUPLICATE, OVERLAPPING or DISTINCT, with a SHA-256 receipt a third party can recompute. No LLM judge, no network, mutation-tested."
version: "1.0.0"
tags: ["deduplication", "near-duplicate", "minhash", "plagiarism", "content-similarity", "deterministic"]
use_cases: ["Catch a generated article that is a padded copy of an earlier one before it is published", "De-duplicate a batch of scraped or generated documents", "Show a reviewer how much text two submissions share, with a receipt they can recompute"]
docs_url: "https://sjgant80-hub.github.io/kar-shingle/"
---

# Kar-Shingle: how much text do two documents share?

Exact hashing only catches byte-for-byte copies. Kar-Shingle catches disguised ones (a sentence appended, a
word swapped, the case or spacing changed) without a model:

1. Normalise each text: lower case, every run of whitespace collapsed to one space, trimmed.
2. Cut it into word shingles: every distinct run of `k` consecutive words (default `k` = 5).
3. Hash each shingle with SHA-256 (first 32 bits), then for each of `n` permutations (default 64), keep the
   minimum of `(a·h + b) mod 2^32`. The permutation seeds `a` and `b` come from the SHA-256 of fixed public
   strings, so anyone gets the same ones. That is the document's MinHash signature.
4. The similarity is the share of signature slots where the two documents agree (an estimate of the Jaccard
   similarity of their shingle sets).

| Verdict | Meaning |
|---|---|
| `IDENTICAL` | The normalised texts are identical. |
| `NEAR-DUPLICATE` | Similarity at least 0.75: a padded, trimmed or lightly reworded copy. |
| `OVERLAPPING` | Similarity from 0.35 up to 0.75: substantial shared passages. |
| `DISTINCT` | Similarity below 0.35. |
| `INSUFFICIENT-DATA` | One text has fewer than `k` words, so it has no shingles to compare. This is checked first. |

## When to use it

- The user asks whether two texts are duplicates, or whether one was copied or lightly reworded from the other.
- Before publishing or indexing generated content, to catch a near-copy of something already there.
- To de-duplicate a set of documents pairwise.

## How to run it

The script is `scripts/kar-shingle.mjs`: one file, Node.js 20 or newer, no dependencies, no network, and it
writes no files. Run it unchanged and keep the `.mjs` extension.

1. Compare two text files: `node scripts/kar-shingle.mjs a.txt b.txt` (either path can be `-` for stdin).
2. Or pass both texts in one JSON input, from a file or stdin, optionally with `k` (2 to 10) and `n` (4 to 256):

   ```json
   { "a": "first text…", "b": "second text…", "k": 5, "n": 64 }
   ```

   `node scripts/kar-shingle.mjs input.json` or `node scripts/kar-shingle.mjs -`. Values outside the ranges
   are clamped, as on the page. Texts longer than 200,000 characters are cut to their first 200,000.
3. Exit code `0` means a verdict was computed: read `verdict`. `2` means the input could not be used (the
   reason is on stderr).
4. Report the verdict and the similarity (`matches` of `total` signature slots). Say plainly that it measures
   shared wording, not shared meaning. Give the receipt SHA-256 so the result can be re-checked.

## What it prints

`examples/padded-duplicate.json` compares a paragraph with the same paragraph plus one appended sentence.
The report (`examples/padded-duplicate.out.json`, exit code 0):

```json
{
  "tool": "kar-shingle",
  "algorithm": "kar-shingle-minhash-v1",
  "verdict": "NEAR-DUPLICATE",
  "similarity": { "matches": 53, "total": 64, "ratio": 0.828125 },
  "k": 5,
  "n": 64,
  "a": { "shingleCount": 46, "normalizedSha256": "1124cf07…", "signatureSha256": "755ff78f…" },
  "b": { "shingleCount": 58, "normalizedSha256": "1a6496c6…", "signatureSha256": "f5f539d8…" },
  "receipt": { "sha256": "34d83e3db003b4508e55bc1eb0bb3ca8a8735e0b0de594262fcf2124e84e5e3c", "canonical": "{…}" }
}
```

`examples/distinct.json` compares it with an unrelated paragraph: DISTINCT, 0 of 64 slots shared.

## Re-check this skill yourself

Everything here is deterministic: the same two texts with the same `k` and `n` give the same signature, the
same verdict and the same receipt on any machine, and no language model judges anything.

- **A receipt:** `receipt.canonical` is the canonical JSON of the result (keys sorted, no whitespace) and
  `receipt.sha256` is its SHA-256. The four steps above are the whole algorithm; re-implementing them in
  another language gives the same signatures.
- **The self-checks:** `node scripts/kar-shingle.mjs --selftest` runs the six self-checks the live page runs
  on load (a re-submission, a padded copy, a one-word swap, an unrelated text, determinism, a text too short
  to shingle) and exits 0 only if all six pass.
- **The examples:** `node scripts/kar-shingle.mjs examples/padded-duplicate.json` prints exactly the report
  in `examples/padded-duplicate.out.json`.
- **The page:** https://sjgant80-hub.github.io/kar-shingle/ runs the same logic in a browser, and its
  "Verify a receipt" panel re-derives a pasted receipt field by field.
- **The source:** https://github.com/sjgant80-hub/kar-shingle (MIT). The script's KERNEL block is
  byte-identical to the logic of the live page and to `kernel.mjs`; CI fails if they ever differ. The tests
  re-derive the MinHash signature from the steps above with an independent SHA-256.
- **CI on every push:** https://github.com/sjgant80-hub/kar-shingle/actions/workflows/ci.yml runs the tests,
  the byte-identity check, the receipt check, the witness mutation gate and the ZIP build, and prints the
  ZIP's SHA-256.
- **The mutation gate:** witness v0.6 (https://github.com/sjgant80-hub/witness, tag `v0.6`) made
  35 single-operator changes (mutants) to the kernel and the tests caught 33 of them. The other 2 are equivalent mutants: they cannot change behaviour, and each has its measured reason in `witness.baseline.json`. The receipt is
  `receipts/witness.json` in the repository, for kernel SHA-256 `b7e401a44178ea365124810c3642a7e261f6a34863277154dcdd48e7ba22d0d2`. With the repository and
  witness v0.6 side by side, `node gate.mjs --witness ../witness/witness.mjs` re-runs it.

## Where it stops

- It measures shared word sequences, not meaning. A heavy paraphrase can read DISTINCT, and shared
  boilerplate (licences, signatures, templates) can raise the similarity of unrelated documents.
- MinHash is an estimate: with `n` = 64 slots a similarity moves in steps of 1/64. Raise `n` for a finer estimate.
- It compares two texts at a time. To de-duplicate a set, run it on each pair.

---

MIT licence: see `LICENSE`.
