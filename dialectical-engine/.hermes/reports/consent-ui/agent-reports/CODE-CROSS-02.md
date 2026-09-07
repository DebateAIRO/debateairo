# CODE-CROSS-02 — self-report (case file)

**Seat:** CODE-CROSS-02 (Claude Opus 5, fresh session) · **ticket** `t_cde7254d` · **board** `consent-ui`
**Lane:** `.worktrees/consent-s02/dialectical-engine`, branch `slice/consent-s02`, BASE `bd314084`, porcelain 0 at CLAIM.
**Charge:** the ONE cross-slice fix — `Escape` reaches the most recently OPENED surface (V-20 (b), discharging `CODE-REV-S02-C9` r1 **B1**).
**Round:** 0 of max 3.

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

---

## 1. The cause, in one paragraph

The defect was not a bug in `topmostSurface()`. **It was a coupling nobody owned:** one ordering of the
surface stack expressed twice — by `compareDocumentPosition` for interaction and by `--z-*` for paint —
with no assertion that the two agree, and no test in nine clusters that mounted both slices in one
document. The two rankings agreed inside each slice, so every suite was green; they disagreed only where
the slices met, which is the page the mission ships. **The fix was 14 lines of function body. Finding it
took a blind reviewer building a fixture no packet asked for.** That asymmetry is the whole lesson of this
seat: the cost was never in the repair, it was in the eleven hours before anyone rendered the two slices
together.

## 2. What this seat actually spent time on, priced

| Item | Price | Avoidable? |
|---|---|---|
| Reading (packet, COMMON §10.16–10.53, the C9 verdict, both PLANs, BASELINE, V-20/V-22, ADR-0022, four test files) | ~25 min, ~120k tokens | **No.** Every one of them was load-bearing; the packet's §0 saved a whole re-derivation of the mechanism. |
| Writing the promoted test + watching it go RED | ~12 min | No — this is the job. |
| The product change | **~4 min, 14 lines** | — |
| Discovering the four flipped mechanism pins and rewriting them | ~35 min | **Partly.** The packet said "cases that pin the document-order MECHANISM may be rewritten" but did not say HOW MANY there are or that the nested-pair OUTCOME inverts. One measured sentence in the packet ("four cases flip; the nested pair's outcome inverts by design") would have cut this in half. |
| Three-run verification ×2 shells + gates | ~18 min | No, but see §5.1: three of those six runs were worthless. |
| Chasing my own broken PROPERTY expression | ~6 min | **Yes** — I transcribed `expect 2` from the packet's own known-broken merge arm into my property check. See §4.2. |

**Nothing was re-derived that a previous seat had already measured**, because §0 MEASURED TRUTH existed.
That block is the single highest-leverage thing in this packet and it should be mandatory, not a §10.48
remedy for a past defect.

## 3. What I nearly got wrong

1. **I nearly reported "P6 flips" because the packet said so.** The packet (§0, line 9) says the reviewer's
   control case P6 "FLIPS by design". Measured: **P6's assertions are unchanged and GREEN both at base and
   after** — the card is the last-opened surface in that order too, so the outcome is identical; only its
   TITLE and reason move. Had I transcribed the packet instead of running the case, I would have shipped a
   false claim in a handoff and a reviewer would have had to catch it. **This is §10.42's class one level
   up: a packet must not predict which ASSERTIONS move, only name what to measure.**
2. **I nearly used the packet's export grep as the contract proof.** `git diff … | grep '^[-+]export'`
   printed nothing, as the packet requires — but `TOOLING-TRAPS:2566` (appended by CODE-REV-CROSS-01 while
   I was working) records that this grep cannot distinguish "no signature changed" from "a member was added
   inside a type body". I replaced it with a comment-stripped structural `diff -u` of the whole file, which
   shows **exactly one hunk, the body of the internal `topmostSurface()`**, and nothing else. The packet's
   guard is not wrong, it is blind, and it is still written into `CODE-CROSS-02.md:19`.
3. **I nearly ran three "inline" verification runs that were three more script runs.** `zsh verify.sh`
   prints `BSD grep` in its own header — the ugrep shim is a shell FUNCTION and is not inherited by a child
   shell, its own included. The handoff sentence "measured in both shells" would have been false. Recorded
   in TOOLING-TRAPS; the genuine inline arm is the guard's terms typed into the tool call.

## 4. Findings against the packet, with file:line

The packet was unusually good — §0 is what a MEASURED TRUTH block should look like. Four defects:

1. **`CODE-CROSS-02.md:23` — the named oracle cannot happen.** "Run the reviewer's ORIGINAL fixture …
   P4 RED at BASE, and GREEN after your change, is the oracle." **Measured: the promoted probe is
   `7 passed (7)` at `bd314084`.** The reviewer replaced that assertion with a `console.log` before
   promoting it — their own verdict says so ("it is the assertion my P4 originally carried"). What actually
   discriminates is (a) the probe's diagnostic lines (`P4 03 after ONE Escape: card=false policyBezel=true`
   → `card=true policyBezel=false`) and (b) its **P7, which asserts the DEFECT's aftermath and therefore
   goes RED against the fix** (`1 failed | 6 passed (7)`). A packet naming a probe as an oracle must state
   the expected direction PER CASE.
2. **`CODE-CROSS-02.md:9` — "the reviewer's control case P6 FLIPS by design".** Its assertions do not move
   (§3.1). The packet's own next sentence describes the real change (the reason, not the outcome), so this
   is a wording defect, not a factual one — but it is the sentence a seat transcribes.
3. **Two cited ranges are off, both measured:** `modalSemantics.ts:129-150` for `topmostSurface()`
   (`:129-152` — the range excludes `return top;` and the closing brace) and
   `consent-policy-link.test.tsx:203-218` described as "comment-only" (the comment ends at `:207`;
   `:208-219` is executable code, including the arrangement assertion itself). COMMON §10.24 requires every
   `path:a-b` to be produced by a `grep -n` at packet-write time.
4. **The allowed list's line restriction is narrower than the finding's CLASS (§2.2).** The false claim
   "the mechanism is document order" has **four** members in the tree; the packet named one. I fixed three
   (`consent-policy-link.test.tsx` header `:20-22`, its `:203-207` comment, and its assertion MESSAGE at
   `:218`, whose operands I did not touch) and **could not fix the fourth**:
   `apps/ui/components/consent/CookieConsent.tsx:191-198` — *"DOM ORDER IS LOAD-BEARING, and this is the
   whole of it … resolves which of two unrelated open surfaces is topmost by DOCUMENT POSITION —
   `CONTAINED_BY || FOLLOWING` — and not by the order they opened in"* — which is now false and sits in a
   file this packet forbids. **It needs a ticket.**

## 5. What to upgrade — the one-prompt machine

**5.1 The two-shell rule is being satisfied by ritual, not by measurement.** §10.16 asks for a `.sh` under
`/bin/bash` AND an inline run, to catch the ugrep/BSD-grep split. But "inline" is not defined operationally,
and the natural reading (`zsh script.sh`) reproduces the bash arm exactly — same interpreter class, same
BSD grep. **Six runs, one shell tested.** Make the rule concrete: *capture the output once, then run each
guard term as a literal tool-call command, with one known-GOOD and one known-BAD input per term.* That is
four lines of handoff and it is the only form that can fail.

**5.2 Integration clusters need a STANDING file, not a per-mission remedy.** COMMON §10.53 was written the
morning of this fix, in response to this fix. Make it structural: **every mission with more than one lane
owns `tests/render/<mission>-cross-slice.test.tsx` from its FIRST cluster**, mounting every slice's surfaces
in the app's real composition order, even when it asserts almost nothing at the start. B1 survived nine
clusters and two blind reviews because the file did not exist; it died in twenty minutes once it did.

**5.3 A packet that changes a shared mechanism must enumerate the pins that will flip, by NAME, measured.**
Mine did not, and the honest work was: apply the change, read the four names out of the failure list, then
decide one at a time whether each was a MECHANISM pin (rewrite) or an OUTCOME pin (regression, stop). That
is the right procedure and it should be written INTO the packet as a numbered step with the expected count
left blank for the seat to fill — not left for the seat to invent under a rule ("every OUTCOME assertion
stays") whose two halves need judgement to separate.

**5.4 The consequence a ruling creates must be pinned, not just implemented.** V-20 (b) inverts one real
behaviour: for a pair mounted in a SINGLE commit, React's child-first effect order means the OUTER surface
now answers `Escape`. No surface in this product has that shape, but that is a fact about today, not a law.
I pinned it as an explicit case with the consequence spelled out in its comment, added the reachable
counterpart (inner opens in a LATER commit → inner wins), and named it in the ADR and in DECISIONS.
**A ruling that silently inverts a behaviour and leaves no test naming the inversion is how the next B1 is
born** — that is exactly how this one was: the ADR said "topmost is derived from the DOM, never from the
order the surfaces registered in", and nothing tested what happened when the DOM and the paint disagreed.

**5.5 Cheapest structural win available right now:** a repo-wide check that every `role="dialog"` surface's
`--z-*` rank agrees with the order the Esc stack would pick. It is the assertion whose absence IS B1's
class, and neither slice owns it. Ticket it against `A11Y-OVERLAYS` (`t_8962842f`), which will inherit
seven more surfaces with the same gap.

## 6. Dead ends — do not re-derive

- **Ranking by `--z-*`.** Considered and rejected before writing a line: it duplicates the `globals.css`
  ladder in TypeScript, needs computed-style reads that jsdom does not supply for `var()` chains, and gives
  the SAME answer as open order for every reachable pair. The reviewer's own ADVISORY listed it first; it is
  more code for no additional discrimination.
- **Re-arranging the nested-pair test cases so their outcomes survive.** Tempting (it keeps every title and
  assertion) and dishonest: it hides the one behaviour the ruling inverts. I did both instead — flipped the
  mounted-together case with the consequence in its comment, and ADDED the later-commit case that keeps the
  original outcome. Test count rose by one; measured, not predicted (COMMON §10.42).
- **Deleting the conformant-`compareDocumentPosition` shim case outright.** Allowed by the packet, and it
  would have cost a test. The shim existed only to make a `compareDocumentPosition` behaviour observable and
  that call is gone, but the OUTCOME it pinned still matters, so the case was rewritten shim-free into a
  strictly stronger form: TWO detached entries, which pins that the walk keeps going rather than stepping
  over one entry. The old case could not express that at all.
- **`git checkout -- <path>` for mutant restores.** Never used (COMMON §10.44): the lane held uncommitted
  work the whole time. `cp` snapshot → `cp` restore → `diff -q` → `git status --porcelain`, printed after
  every one of the four restores (porcelain 5 each time, `diff -q` clean each time).

## 7. Evidence index (scratch, `CODE-CROSS-02-r0/`)

`sixteen.base.out` (185/185 at `bd314084`) · `cross-slice.RED-at-base.out` (the binding RED frame) ·
`oracle.at-base.out` / `oracle.after-fix.out` (the promoted probe, both directions) ·
`mut.{M1,M2,M3,N1}.out` · `verify.bash.run{1,2,3}.out` · `verify.zsh.run{1,2,3}.out` ·
`c9-base-counts.txt` (the ten `run_c9` files at base, counted from the base verbose run: 109).
