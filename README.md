# Kar-Shingle

**Live:** https://sjgant80-hub.github.io/kar-shingle/

Deterministic near-duplicate detection — **no LLM judge**. Paste two documents; Kar-Shingle uses word
shingling + MinHash (SHA-256-derived permutations) to produce a re-derivable similarity verdict —
IDENTICAL / NEAR-DUPLICATE / OVERLAPPING / DISTINCT — plus a canonical receipt hash anyone can recompute
byte-for-byte from the same two texts. It catches disguised duplicates (padded or lightly reworded text)
that exact-hash dedup would miss, and has a built-in independent receipt-verification mode.

One self-contained HTML file — no backend, no network, nothing sent anywhere, runs in your browser.

**Honest limit:** MinHash measures shared word-sequences, not meaning — heavy paraphrase can evade it, and
shared boilerplate can trigger false positives. It answers "how much text is shared," not "is this the
same idea."

Built by **Kar** (karma-didy) on the FallForge estate.

## Use it from an agent

`SKILL.md` makes this repository an agent skill in the open SKILL.md format (Claude Code, Codex CLI, Cursor and
others read it). The agent runs `scripts/kar-shingle.mjs`, one Node.js 20+ file with no dependencies and no network,
and gets the same verdicts and the same receipt hash as this page:

    node scripts/kar-shingle.mjs examples/padded-duplicate.json

`node make-zip.mjs` checks the package against Agensi's published rules and builds `dist/kar-shingle.zip`, the
upload for the Agensi skill marketplace. CI builds the same ZIP on every push and prints its SHA-256.

## Proof

- **One source of truth:** the KERNEL block of `index.html` is the verifier. `node build.mjs` copies it
  byte-for-byte into `kernel.mjs` and into the skill script; CI fails if the three ever differ.
- **Tests:** `npm test` runs the kernel tests, and runs the skill script alone in an empty folder, the way
  Agensi runs it, against the expected outputs in `examples/`.
- **Mutation gate:** witness v0.6 made 35 single-operator mutants of `kernel.mjs` and the tests caught
  33; the other 2 are equivalent mutants, reasons in `witness.baseline.json`. Receipt: `receipts/witness.json` (kernel SHA-256 `b7e401a44178ea36…`).
  CI re-runs the gate on every push: https://github.com/sjgant80-hub/kar-shingle/actions/workflows/ci.yml

Powered by the Konomi architecture, created by Thomas Frumkin. MIT licence (see `LICENSE`).
