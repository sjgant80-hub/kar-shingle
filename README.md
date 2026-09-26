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
