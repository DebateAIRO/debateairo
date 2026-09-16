# Self-report — REV-S03-p2-security-data-safety · ticket `t_8a000762` · 2026-09-16

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

A case file. Wall-clock for this seat: claim 11:30:38, handoff ~11:52 EEST — about 22 minutes, of which **4 minutes 37 seconds were the two gate re-runs** and the rest was reading and probing. One review pass, no reworks of my own, no dead-end that cost more than one tool call.

---

## 1. The body: how a route that passes every test 500s in production

**Cause, not symptom.** `GET /v1/plan-tiers` refuses the only register row its own publisher writes.
The producer (`apps/runner/src/dev-deployment-register.ts:344-349`) emits
`{kind:"PLAN_TIER_ROSTERS", free, premium}`; the consumer (`apps/api/src/index.ts:1536-1540`) parses
that value with `PlanTierRostersSchema` (`packages/contract/src/index.ts:308-311`), which is
`.strict()` on `{free, premium}` and does not know `kind`. One producer, one consumer, in one slice,
written days apart, disagreeing.

**Why every gate was green.** The F2 seat wrote `tests/unit/api.test.ts:637-671` with a fake pool
returning `value_json: { free: […], premium: […] }` — a row shape **it invented** rather than one it
took from the producer. The render test (`tests/render/tier01-new-plan-tier.test.tsx:95-98`) mocks
`readPlanTiers` with the same invented shape. So the unit test, the render test, the five-suite C4
command, the 17-file integrated run and the orchestrator's own three-times re-verification are all
green over a route that cannot serve a real register. **185 passing tests did not contain one that
connected the producer to the consumer.** That is the murder weapon, and it is not carelessness: it
is a structural gap that no amount of re-running the same suites can close.

**The real lesson, and the upgrade I want.** Every one of those gates asks "does the code do what its
test says". None asks "do the two ends of this seam agree". The cheapest permanent fix is a rule with
teeth:

> **A test that stands in for a producer must CALL the producer.** Where a fixture represents data
> another module in this repository writes, build it by calling that module, not by hand. If calling
> it is too expensive, the fixture carries a comment naming the producing symbol, and an architecture
> test asserts the fixture's key set equals the producer's.

Mechanise it: an audit that finds every `value_json:`/`row_key:` object literal in `tests/**` and
fails unless a producing symbol is named. The class is wider than S03 — it is every register row,
every queue payload, every event envelope. This one cost a full REV pass and a FIX round and will
now cost a second FIX round. Price: **two FIX seats, three review lenses, two REV passes, and it is
still not fixed.** An audit rule costs one afternoon.

**What I nearly got wrong, and it was close.** My first instinct after reading the FIX diff was that
the strict schema plus a fail-closed 500 envelope was a clean PASS for my lens — the smuggling probe
(P4) had just confirmed that nothing operator-only can reach a user, which is exactly what my charge
asked. I had written that sentence in my head. What stopped me was the packet's own phrasing,
*"the handler's read of the sealed deployment"* — the word **sealed** made me ask what the sealed row
actually looks like, rather than what the test says it looks like. I then re-ran pass-1's probe E for
an unrelated reason (the bearer check) and its output printed the real row:
`{"kind":"PLAN_TIER_ROSTERS",…}`. I saw `kind` in my own probe's output **before** I understood it
mattered. If probe E had not been on my charge list, I would have shipped a PASS.

Two upgrades from that near-miss:
- **Always print the real thing next to the asserted thing.** Probe E's value was to dump the
  producer's output verbatim. Cheap, and it is what caught this. Make "dump the producer's real
  output into the log" a standing duty of any probe that touches a seam.
- **The packet's nouns are load-bearing.** "sealed" did more work than any charge sentence. Packets
  should be written knowing a reviewer mines them for exactly that.

---

## 2. What repeatedly cost tokens

**(a) Re-deriving cluster commands that the package already ran.** The C3 nine-suite and §5 17-file
argv lists live in the **pass-1** package's `cluster-map-PLAN-sections-2-and-5.md`, inside a
markdown TABLE CELL, mixed with prose verdicts. I burned a `sed -n '14,24p;70,86p'` and a careful
read to extract two command strings. The p2 package re-states the C4 command in prose but not C3's.
**Upgrade: ship `commands.json` in every review package** — `{cluster, argv[], expected:{files,
tests, failing_titles[]}}` — and have the README render from it. A reviewer then runs commands
instead of parsing tables, and the "number without its command" defect class (pass-1 N5/N3/N6) dies
at the root rather than being re-litigated per pass.

**(b) The package re-verified the §5 run but not C3.** My charge 5 told me to re-run both; the
package's `reverify-d35a9634.txt` covers only §5. So my C3 run is the sole C3 record at the review
head — good that I ran it, but the orchestrator and I did overlapping work on §5 (two runs of a
136-second suite) and zero-overlap work on C3. **Upgrade: the package states, per command, whether it
was re-verified at the review head**, so a lens re-runs the gaps rather than duplicating the
overlaps. That is ~2.5 minutes of wall-clock per lens per pass, times three lenses.

**(c) One genuinely wasted probe cycle, mine.** My first PROBE R built a provider panel from the real
config's slots and got `TypeError: CONFIGURED_PROVIDER_INVALID` four times — the maker strings must
match the catalogue, which I had not read. Cost: one 30-second run plus one edit. **The fix was
already in my hands**: pass-1's promoted probe had a working two-provider panel, and I should have
started from it instead of writing a fresh one. **Upgrade: promoted probes need a "reusable fixtures"
section at the top** naming the helpers a later pass can lift verbatim — mine now has one. Dead end
named so nobody re-derives it: *do not build a `DevelopmentProviderPanel` from `developmentProviderSlots`
with `maker: slot.cli`; the catalogue maker strings are `"OpenAI"`, `"Z.AI"`, etc., and the panel
parser rejects anything else.*

**(d) `merge-delta-commits.txt` sent me to verify a sixth file with no delta.** The orchestrator ran
`git log --no-merges -- <file>` over a file that has zero change in `cd043907..d35a9634` and printed
its history under a "merge delta authorship" heading with an empty `()` numstat. I spent two tool
calls proving the negative. This file was added by a FREEZE *correction* — the correction introduced
the defect it was correcting for. **Upgrade: derive the section list from the same `--numstat` that
produces the diffstat.** A file with no delta cannot then acquire an authorship section.

---

## 3. Where THIS packet fought me, exactly

1. **The freeze range is prose, not a pair.** The packet demands "a CONCRETE `<previous>..<latest>`
   pair stamped at write time — never a pointer" and then, in the same bullet, writes
   `d35a9634..the freeze commit that carries this packet and the package (stamped in the DISPATCHED
   comment)`. Three different commits answer to that description (`d1de4ee3`, then `bd516cfd`, then
   `e56063c5` as the freezes moved). The rule is right; the packet broke its own rule in the sentence
   that states it. I filed it (N10a) and left the mission-tree diff UNVERIFIED. **Upgrade: packet-check
   should reject a freeze-range field that does not match `[0-9a-f]{7,40}\.\.[0-9a-f]{7,40}`.** This is
   a one-line regex and it would have caught it before dispatch.
2. **`comment cursor at dispatch: 1`, then two more comments were appended.** The packet was frozen,
   then the orchestrator added FREEZE CORRECTION and FREEZE to the ticket, leaving the packet's cursor
   stale at 1 while the truth was 3. Harmless because I read all three, but the cursor is supposed to
   be how a seat knows it has read everything. **Upgrade: the cursor belongs in the DISPATCHED comment
   (which can be the last one), not in the packet body.**
3. **Bullet 10 of §1 is one sentence of ~450 words** containing the inputs list, the freeze-range
   rule, the TOOLING-TRAPS pathspec warning and the "seats' CODE is the package diff" clarification.
   I read it three times. The reading floor (law 3.8) exists to stop packets making seats read more;
   a single unbroken 450-word bullet is the same cost in a different shape. **Upgrade: packet-check
   should cap a bullet at ~80 words and force sub-bullets.**

What the packet got **right** and should be copied: the per-lens numbered charge list, each ending in
"answer each or write UNVERIFIED". Charge 2's word *sealed* and charge 3's instruction to *"build the
worst value the file loader lets through"* are what produced both findings. That phrasing —
**adversarial, constructive, and naming the bound to exceed** — is worth templating for every lens.

---

## 4. How to make the coding more efficient

- **Validate at the narrowest waist, once.** N8 exists because the `model` bound is enforced in
  *relays* — three of them, one forgotten — instead of in `config/models.yaml`'s grammar, which every
  transport passes through. `shape.ts` already enforces a pattern on `key:` and a URL grammar on
  `base_url:`; `model:` got `length > 0`. One line in one file would have closed all three relays and
  every relay added later. **Rule: when a value crosses from configuration into an argv, an env var
  or SQL, its pattern belongs at the parse boundary, not at each use.**
- **Ban the hand-written cross-module fixture** (§1). It is the same disease as N8 seen from the test
  side: the truth is duplicated instead of derived.
- **Make "fail-closed" and "works" separate assertions.** B1's deepest trap is that the security
  property and the product property point in opposite directions here, and the one-character repair
  (`.strict()` → `.passthrough()`) satisfies the product and destroys the security. I wrote the gate
  into the probe README: the FIX is correct only when PROBE R turns green **and** P4's smuggling case
  stays red. **Upgrade: any REWORK whose obvious repair is a security regression must hand the FIX
  seat that paired test explicitly**, because the FIX seat is measured on turning red green and will
  take the shortest path there.

---

## 5. Toward the one-prompt machine

Three changes, in the order I would make them:

1. **`commands.json` per review package, and packages generated from one manifest.** Every number in
   a README, every cluster row and every re-verification log is then derived from the same object.
   Three of my four package/packet findings across two passes (p1 N6, p2 N10, N10a) are the same
   root: the record is written by hand in more than one place and the copies drift. This is the
   single highest-yield mechanisation left in the loop.
2. **A seam audit in `pnpm lint`.** Producer/consumer pairs (register rows first — there are a dozen)
   get a generated round-trip test. B1 dies at commit time, not at REV pass 2 of 3. Every future
   register row inherits the protection for free.
3. **Probes as first-class, versioned, and cheap to lift.** The promoted-probe directory is already
   the highest-value artefact this fleet produces — pass-1's probe E is literally what cracked this
   pass — but each pass rewrites its neighbours' fixtures. Give the mission one
   `tests/support/probe-kit.ts` with the panels, pools, sessions and capture scripts every lens keeps
   re-deriving, and a probe becomes ten lines of property instead of eighty lines of scaffolding.
   That converts reviewer time from setup into refutation, which is the only part a model is
   uniquely good at.

**The honest summary for V:** the loop worked — a blind lens with an adversarial charge found, in one
pass and twenty-two minutes, a defect that two FIX seats, three review lenses and 185 green tests had
walked past. What it should not have needed is a human-written charge pointing at the right noun. The
three upgrades above move that catch from *lucky phrasing in a packet* to *a rule the machine
enforces*, which is the difference between a fleet that finds bugs and a fleet you can fire once.
