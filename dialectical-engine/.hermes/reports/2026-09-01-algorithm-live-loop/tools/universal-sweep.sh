#!/usr/bin/env bash
# universal-sweep.sh — D67 ADDENDUM (2026-09-06): after ANY per-item retraction in a record, list every universal claim in that record
# so the author checks which of them stood on the retracted premise. The W5 records seat retired a causal clearance in round 2 and left
# the document's concluding "no unexplained failing test names" standing on it; codex found it in round 3 (R2-B1). This grep, run after
# round 1, surfaces that sentence at once. It lists; it does not judge. Usage: tools/universal-sweep.sh <record.md> [more...]
for f in "$@"; do
  echo "== $f"
  grep -inE '\b(all|every|each|none|nothing|no (unexplained|regression|other|further)|always|never|exactly|nothing else|in every|for every)\b' "$f" | cut -c1-160
done
