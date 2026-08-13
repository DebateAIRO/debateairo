# UI-02a rework directive — rev1 → rev2

**Diamond (DR-153):** Grok **APPROVED** (0 blocking). Opus 5 **CHANGES
REQUESTED** (1 blocking, 8 advisory). Both must greenlight.

## First: the scoring work is RIGHT, and was hard-verified

The Opus lens did not merely read it. It executed the shipped
`v3ScorePercentage` against the entire 4-decimal grid and **2,000,000 random
doubles**, and found **zero** violations of every property that matters:
no false "exact" claim, no false `≈`, no two distinct values collapsing to the
same unmarked display, no trailing-zero misrepresentation. It also proved the
absence switch exhaustive by compiling a fourth union member and getting
`TS2366`. It went looking hard — this code had never been reviewed — and found
no defect in the percentage restatement, the typed absence, or the banner's
substantive claim.

**Do not touch any of that.** This rework is small and mostly string-sized.

## BLOCKING — B1: the NUL bytes are still there, and I am not carrying them a third time

`apps/v2-ui/lib/v3/adapter.ts:611`

```ts
const key = `${entry.model_id}\0${entry.model_version}\0${entry.provider}`;
```

Two raw U+0000 bytes are embedded literally. `file` reports the file as `data`,
not text, so **plain `grep` silently skips it**:

```
$ grep -n "v3ScorePercentage" apps/v2-ui/lib/v3/adapter.ts
exit=1                       # no output, no warning
$ grep -c -a "v3ScorePercentage" apps/v2-ui/lib/v3/adapter.ts
2
```

**ORCHESTRATOR'S RULING — this is IN SCOPE, and here is why.** The lens offered
to convert to APPROVED if I ruled it out of scope as inherited. I decline:
adapter.ts is inside this ticket's own diff (the formatter, the absence union
and both banner constants all live in it); the review packet made confirming it
a REQUIRED check; and it has already caused a demonstrably wrong conclusion —
mine, live during this handoff, when I searched this file for the formatter and
concluded it was absent. EXEC-01 rev4 raised it; this revision did not close
it. A third carry is how a defect becomes permanent.

It is worse than a normal silent failure: a repo-wide `grep -rn` still returns
hits from the tracked `.next-dev` bundles, so the search *appears* to succeed
and the reviewer never learns the source file was skipped. The lens also found
that quoting line 611 into its own review file made **that file** binary to
grep until it stripped the bytes — a byte that propagates into every document
quoting it, inside a mission whose entire review loop is text search.

**Fix, exactly:** escape the two bytes —
`` `${entry.model_id}\u0000${entry.model_version}\u0000${entry.provider}` ``.

**Do NOT substitute a printable separator.** The NUL is LOAD-BEARING: it is a
delimiter that cannot occur inside `model_id` / `model_version` / `provider`,
so a space or `:` reintroduces a key-collision ambiguity between `("a b","c")`
and `("a","b c")`. Escaping preserves the exact runtime key — behaviour-neutral
by construction. Prove that: the key must be byte-identical before and after.

## ADVISORY — close A3 and A1 in the same pass; they are string-sized

### A3 — the drawer's guard cannot fail for the obvious drift (close this one)

`tests/unit/v2ui-pages.test.ts:198-205` pins the drawer with
`expect(drawer).toContain("v3ScorePercentage(v3.base_score.value)")`.

**Concrete regression that keeps every gate green:** change
`NodeDetailDrawer.tsx:384` from `{baseScore.text}` to `{v3.base_score.value}`.
Line 363 is untouched so the pinned string still exists; `baseScore.detail` is
still used so there is no unused local; nothing renders the drawer in the root
suite. Result: the drawer shows `0.41000000000000003` again — **the exact RED
this ticket started from** — with tsc clean and 413 tests green.

The canvas does NOT have this hole (`v2ui-pages.test.ts:167-168` forbids
`.base_score.` / `.final_strength.` textually, a proper ratchet). The drawer
cannot use that guard because it legitimately reads those fields. Close it
either with a negative ratchet
(`expect(drawer).not.toMatch(/\{v3\.(base_score|final_strength)\.value\}/)`) or
by moving the two lines into an adapter function the behavioural suite can
execute. Prefer the latter.

### A1 — the banner points the reader at a drawer that has no such section

`apps/v2-ui/lib/v3/adapter.ts:432-436` says the full labels and replay handles
are "in the Honesty drawer". `AnswerHonestyDrawer` has **no per-node section at
all** — `base_score` / `final_strength` are rendered only by
`NodeDetailDrawer.tsx:362-399` and the badge tooltip. Its "Numbers and replay"
section carries `answer.number_slots`, a different set entirely.

Failing case: open a served debate, read the scoring strip, follow it to
`◈ Honesty`, look for a node's replay handle. It is not there.

String edit: name the node/claim drawer and the badge tooltip instead.

### A7 — a test that passes by IEEE-754 luck (cheap, take it)

`tests/unit/v2ui-data-layer.test.ts:270` asserts
``toContain(`${number.value * 100}%`)``. That holds only because
`0.62*100 === 62` exactly. Change the fixture to `0.07`
(`0.07*100 === 7.000000000000001`) and it fails while the render is perfectly
correct. Assert against `v3ScorePercentage(number.value).text`.

## Record, do not fix (out of scope — say so in the handoff)

- **A4:** `apps/v2-ui/package.json:12` declares `"test": "node
  scripts/run-node-tests.mjs"` and **`apps/v2-ui/scripts/` does not exist**, so
  `lib/scoringResponse.test.mjs` can never run. Open since grok-ui01-rev1.
  Record it; it needs its own ticket.
- **A2:** thread/split/map views get no V3 nodes, so "each card carries…" is
  true only in the default tree view. Copy-vs-view mismatch.
- **A5:** `AnswerHonestyDrawer` still prints raw floats for edge strengths and
  number slots, so `0.41000000000000003` can appear there while a card shows
  `41%`. DR-154(4) says "SCORE DISPLAY"; whether it reaches these is V's call.
- **A6:** `v3ScorePercentage(1e-7)` → `≈0%`. Honest (the `≈` distinguishes it
  from a true `0%`), flagged for V's awareness only.
- **A8:** `lib/scoringFormat.ts:8-12` `formatScorePercent` substitutes `0` for
  a non-finite score — the DR-115 anti-pattern sitting one import away. The new
  code correctly avoids it and a test forbids it inside `V3ScoreBadges`.

## Done when

B1 closed with the key proven byte-identical; A3, A1, A7 closed; the
record-only items stated in the handoff; every gate re-run with REAL pasted
output (the orchestrator re-runs all of them and has already caught one
claimed-green gate this mission). Update the handoff in place. Back to `review`
with `REWORK READY FOR HERMES REVIEW — UI-02a rev2`.
