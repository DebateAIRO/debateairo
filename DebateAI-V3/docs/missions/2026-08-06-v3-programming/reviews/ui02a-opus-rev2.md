# UI-02a review — Opus 5 lens, rev 2

**Ticket:** `t_d4d7d993` · dual diamond DR-153 · READ-ONLY lens
**Verdict:** `APPROVED` — **no BLOCKING items.** B1 is closed and I verified the
closure at the byte level rather than trusting the claim. Three advisories, all
small; one is about the handoff's wording rather than the code.

Gates were not re-run (orchestrator's independent run stands), and per the
packet I did not re-litigate the scoring — rev1 property-tested it against
2,000,000 doubles. What I did instead: byte-scanned the repaired file, executed
the escape against a raw-NUL construction to prove runtime identity, mutated the
real drawer source seven ways to try to defeat the A3 ratchet, and checked the
five record-only items against the handoff.

---

## BLOCKING

None.

---

## B1 — closed, and behaviour-neutral. Verified independently.

`apps/v2-ui/lib/v3/adapter.ts:628-630`

```ts
/** Collision-safe ledger identity; the source escape evaluates to the original NUL delimiter. */
export function modelLedgerIdentityKey(entry: ModelLedgerIdentity): string {
  return `${entry.model_id}\u0000${entry.model_version}\u0000${entry.provider}`;
}
```

**Source is clean.** Full byte scan of the file: 25,324 bytes, `NUL count: 0`,
zero control bytes other than `\n`/`\t`, and the only non-ASCII bytes in the
whole file are `e2 80 94` (U+2014 em-dash). `file(1)` reports UTF-8 text; plain
`grep -n v3ScorePercentage` returns its 4 hits. The headline table holds.

**Runtime is byte-identical.** I executed the escaped form against a
`String.fromCharCode(0)` construction rather than reading the spec:

```
escaped hex : 6100620063
raw hex     : 6100620063
strict eq   : true      bytes eq : true
codepoints  : [ 97, 0, 98, 0, 99 ]
```

**No printable separator was substituted**, and the guard against that is the
right one. `tests/unit/v2ui-data-layer.test.ts:661` pins
`Buffer.from(key).toString("hex")` to `"6100620063"` — an exact byte pin that
fails for *any* separator change, printable or not. Worth noting for whoever
maintains it: the collision limb at `:663-667` is weaker than it looks — with
`("a b","c","d")` vs `("a","b c","d")` a **space** collides, but `:` and `|` do
not, so that limb alone would pass a colon substitution. The hex assertion is
what carries this test. It is present, so B1 is properly ratcheted; the note
matters only if someone later "simplifies" the test down to the collision case.

**The fix also brought its own ratchet**, which I did not expect and which is
the right shape — `tests/unit/v2ui-pages.test.ts:203-206`:

```ts
expect(adapter).not.toContain("\u0000");   // no raw byte may come back
expect(adapter).toContain("\\u0000");      // and the delimiter may not be deleted
```

Two-sided: it forbids the regression *and* forbids "fixing" a future complaint
by dropping the delimiter. `source()` reads the file with `readFileSync(..., "utf8")`,
so the first assertion sees a raw byte as `U+0000` and fails. This runs in the
enforced root suite (`vitest.config.ts` includes `tests/**/*.test.ts`).

**The rework was slightly larger than the escape** — the inline key expression
was extracted into an exported `modelLedgerIdentityKey`, called at
`adapter.ts:654`. Same template, same call site semantics, and the extraction is
what made the byte pin testable. No objection.

## Did the rework disturb the scoring? No — corroborated without the author's hash.

`v3ScorePercentage` is still at `adapter.ts:306`, and its body is the exact rule
rev1 verified: `Math.round(percentage * 100) / 100`, the two-step trailing-zero
strip, the `rounded / 100 === value` exactness test (the subtle part — this is
what makes `0.145` an unmarked `14.5%` and `0.41000000000000003` an `≈41%`), and
no clamp.

The independent corroboration is the line arithmetic. Everything downstream
moved by **exactly +33 lines**, the size of the inserted `V3NodeScoreDetail`
block at `318-350`:

| symbol | rev1 | rev2 | delta |
|---|---|---|---|
| `v3ScorePercentage` | 306 | 306 | 0 |
| `labeledNumberBadge` | 319 | 352 | +33 |
| `v3ScoreAbsenceCopy` | 336 | 369 | +33 |

A pure insertion after line 317. No edit inside the formatter, and the absence
switch is unchanged (still no `default`, still a declared return type — the
`TS2366` exhaustiveness proof from rev1 still applies verbatim). Neither
`NodeDetailDrawer.tsx` nor the V3 slice of `DebateCanvas.tsx` contains
`toFixed` / `Math.round` / `* 100` / `formatScorePercent`; the canvas ratchet is
satisfied with **0** occurrences of `.base_score.` / `.final_strength.`.

## A1 — closed.

`adapter.ts:465-469` now reads "…with the full labels and replay handles in each
**badge tooltip and claim drawer**." Both named surfaces genuinely render those
values: the badge tooltip through `labeledNumberBadge`'s `title`
(`adapter.ts:352-365`, carrying kind/producer/source/replay), and the claim
drawer through `NodeHonestyDetails` (`NodeDetailDrawer.tsx:362-397`). The dead
pointer at the Honesty drawer is gone.

## A7 — closed.

`tests/unit/v2ui-data-layer.test.ts:272` is now
`expect(badge.title).toContain(v3ScorePercentage(number.value).text)`. No
`value * 100` remains anywhere under `tests/unit/`. The assertion no longer
depends on `0.62 * 100` being exact in IEEE-754.

---

## ADVISORY

### A3-r — the ratchet is real, but the *negative regex* is not the part doing the work; four trivial rewordings defeat it

`tests/unit/v2ui-pages.test.ts:199-201`

First, the good half, and it is the larger half. The formatting decision moved
**out of JSX into executable code**: `v3NodeScoreDetails`
(`adapter.ts:331-349`) is consumed by the drawer at `NodeDetailDrawer.tsx:363`
and pinned behaviourally at `tests/unit/v2ui-data-layer.test.ts:303` with the
original failure value —
`expect(v3NodeScoreDetails(node)[0]!.percentage.text).toBe("≈41%")`. That is a
hard literal pin that fails for the right reason. (The `toEqual` at `:285` is
self-referential — it builds the expectation from `v3ScorePercentage` itself —
so `:303` is the assertion carrying this test. Same shape of note as B1's.)

Now the part you asked me to attack. I mutated the **real** drawer source seven
ways so it renders the recorded double again, and ran both rev2 assertions
against the mutated text:

| mutation of `NodeDetailDrawer.tsx:381` | suite |
|---|---|
| `{v3.base_score.value}` (the rev1 literal) | **RED — caught** |
| `` {`${v3.base_score.value}`} `` | RED — caught (the `${` supplies the `{`) |
| newline-wrapped JSX child | RED — caught |
| `{ v3.base_score.value }` — **one space** | **GREEN — defeated** |
| `{String(v3.base_score.value)}` | **GREEN — defeated** |
| `{v3["base_score"].value}` | **GREEN — defeated** |
| `const { base_score } = v3;` … `{base_score.value}` | **GREEN — defeated** |

Each GREEN row puts `0.41000000000000003` back on the drawer with tsc clean
(a `number` is a legal JSX child), no unused local (`baseScore.percentage.detail`
and `baseScore.producer` are still read, and `noUnusedLocals` is not set in
`apps/v2-ui/tsconfig.json`), and no DOM renderer in the root suite to catch it —
`vitest.config.ts` includes only `tests/**/*.test.ts` and the repo has no
`@testing-library` / `jsdom` / `happy-dom` dependency.

So: the regex **can** fail for the reason its author believed — it is not the
category of assertion this mission has lost revisions to — but it guards a
literal, and a single space defeats it. It closed the drift as *described*; it
does not close the drift as a *class*.

**The complete fix is one line and is available right now at zero cost.** After
the extraction, `NodeDetailDrawer.tsx` contains **zero** occurrences of
`base_score` or `final_strength` (verified by grep). So the drawer can carry the
same evasion-proof ratchet the canvas already carries, on the bare token rather
than the dotted form:

```ts
expect(drawer).not.toContain("base_score");
expect(drawer).not.toContain("final_strength");
```

That catches all four GREEN rows above, including the bracket-access and
destructured variants that a `.base_score.` dotted guard would miss. It passes
against the file as shipped.

Not blocking: the directive asked for the described drift to be closed and it
is, and the structural half of the fix is genuine executable coverage.

### A4-r — the handoff states A4's soft limb and drops its hard one

`docs/missions/.../handoffs/UI-02a-codex-handoff.md:122` records A4 as: the
strip branch "still has source-wiring coverage rather than executing root-Vitest
coverage because its module does not compile under the root program's stricter
options."

That is true, and it is the half that reads as a forced constraint. The half the
packet explicitly asked me to confirm is stated is **not there**: there is
already a behavioural test file for that code, and it can never run.

```
apps/v2-ui/package.json:12   "test": "node scripts/run-node-tests.mjs"
apps/v2-ui/scripts/          does not exist
apps/v2-ui/lib/scoringResponse.test.mjs   31,499 bytes, dated 2026-08-10
```

A reader of the handoff alone concludes "behavioural coverage was impossible
here". The truth is that behavioural coverage was *written* and is dead because
the package's test command points at a missing file — a dead runner that also
means `pnpm --filter v2-ui test` reports a module error rather than zero
coverage. This is its third carry-forward (grok-ui01-rev1 item 5,
grok-ui01-rev2 item 5, rev1 A4). I am not asking for it to be fixed in this
ticket — the directive ruled it out of scope and I agree — only that the
record say what is actually wrong, on a named ticket.

A2, A5, A6 and A8 are recorded accurately at `:121`, `:123`, `:124`, `:125`;
I checked each against the code and found no misstatement. A2 in particular is
correctly narrowed to "exact for the default tree/canvas view".

### A9 — the mission's own rework directive is still binary to `grep`

`docs/missions/2026-08-06-v3-programming/reviews/UI-02a-rework-directive.md:55`

I swept every file under `apps/v2-ui/{lib,components,app}`, `tests/`,
`reviews/` and `handoffs/` for raw NUL bytes. Exactly one file has them — the
document that ordered B1 fixed, which picked up the two bytes when it quoted the
old line. Demonstrated:

```
$ grep -n "model_version" .../UI-02a-rework-directive.md    → exit 1, no output
$ grep -na -c "model_version" .../UI-02a-rework-directive.md → 3
```

This is precisely the propagation rev1 predicted, now observed a second time —
and a third: the first draft of *this* review carried three raw NUL bytes out of
the code blocks above and was itself `data` to `grep` until I stripped them. The
hazard reproduces on contact, every time. It is a mission document, not this
ticket's code, so it does not block — but the
mission's review loop is entirely text search, and a directive that `grep`
skips silently is the same hazard in the paper trail. One escape or a fenced
`<NUL>` placeholder fixes it.

---

## Disposition

`APPROVED`. B1 is genuinely closed: the source carries no raw byte, the runtime
key is byte-identical (`6100620063`, proven by execution, not by reading), no
printable separator was substituted, the collision property is preserved, and
the fix arrived with a two-sided ratchet of its own. The scoring is untouched —
corroborated by unchanged line position and a clean +33 shift below the
insertion, independent of the author's hash. A1 and A7 are closed as claimed.

On the question the packet put hardest: **the A3 ratchet is real but narrow.**
The load-bearing repair is the extraction of `v3NodeScoreDetails` into
behaviourally pinned code, not the regex; the regex catches the literal drift
and four rewordings walk past it. The one-line token guard in A3-r closes the
class and passes as shipped — I would take it in this pass if the orchestrator
wants the hole shut, but I do not hold the ticket for it.
