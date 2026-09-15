# Self-report — REV-S01-p1-security-data-safety · mission `debate-tiers` · ticket `t_660e86e5`

The question this answers, verbatim from V:

> treat it like a murder case. I want to get a nice report on what can be done better. What we must upgrade. what repeatedly costed us tokens. how we can make the coding more efficient. How can we turn this into a one prompt machine even better.

Seat: REV(S01) lens security/data-safety, pass 1 of 3. Detached worktree
`/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/rev-s01-p1-security/dialectical-engine`
at `f6c147cc`, 0 dirty at start and 0 dirty at exit. Wall clock 03:42 → 04:05 EEST (~23 min).

---

## 1. The body on the floor: I found no S01 defect, and that is the finding

Five refutation attempts against the slice's own code all **failed**:

| Attempt | Result | Cost |
|---|---|---|
| Malformed / type-confused / homoglyph / oversized `plan_tier` at the contract (21 shapes) | all refused | 4 min |
| Same 15 shapes at the **real Fastify route** with a submit spy | all 400 `MALFORMED_REQUEST`, submit never called | 5 min |
| `__proto__` on the wire → pollution or a forwarded key | key dropped, no pollution, nothing on the wire | 6 min (dead end) |
| Mutant A: delete the `PLAN_TIERS_SET` guard (`apps/ui/lib/api.ts:375-376`) | caught — `tier01-ask-wire` 3/0 → 2/1, `CLUSTER_RED` | 3 min |
| Mutant B: add `attacker-model-9` to the Premium roster | caught by **two** suites — `tier01-roster` 1→0, render 21→20 | 2 min |

**CAUSE of the good result, worth copying:** the SPEC did the security thinking *before* the code.
R7 (`SPEC-v2.md:71-95`) derived the provenance change with its own grep evidence and its own measured
blast radius; R13 (`:126-137`) pinned the optional-member typing *and said why the required member is
rejected*; R14 (`:138-142`) named the exact status codes. A reviewer attacking that has almost nothing
to find, because the requirement already answered the questions a reviewer asks. **This is the
one-prompt lever: pay for derivation at REQ, not for archaeology at REV.**

## 2. What I nearly got wrong — three times

1. **I nearly reported a prototype-pollution vulnerability.** `AskRequestSchema.safeParse` returns
   `success: true` for a body carrying `__proto__`, despite `.strict()`. I had the finding half-written.
   Probe B killed it: the key is dropped from the output, `Object.prototype` is untouched, nothing
   reaches the wire — and a bare `z.object({a}).strict()` behaves identically, so it is zod's, not
   S01's. **Rule that saved me: before writing a finding, write the test that proves the EXPLOIT, not
   the anomaly.** An anomaly is not an exploit.
2. **I nearly reported the 500-on-large-body and the 400 schema disclosure as S01's.** Probe D dated
   both: `question_line`, `decision_scope` and `tier_provenance_ref` — all base-era fields — reproduce
   the 500 identically, and `risk_tier`/`composition_budget_tier` disclose their enums identically.
   Neither is in S01's diff. **Cost of NOT dating them: two false blocking findings and a rework round.**
3. **I nearly reported "the Free lock falls to devtools" as a lock defect.** A control experiment
   saved me: under **Premium**, with the slider legitimately enabled, my keyboard gesture *also* failed
   to move it — so the instrument was broken, not the lock. And the six segment pills genuinely resist
   attribute-stripping, because React suppresses mouse events using the VDOM props, not the DOM
   attribute. Without the control I would have written a finding that a rework seat could not reproduce.

## 3. DEAD ENDS — do not re-derive these

- **`__proto__` vs `.strict()`** — benign, zod-wide, no wire exposure. Settled; see probe B.
- **The 400 body "leaks the schema"** — pre-existing, field-agnostic, and it never echoes the submitted
  value (I checked with a marker string). Not worth a second look.
- **Driving a `<input type=range>` through the harness browser pane's key events** — it does not work
  even on an enabled slider. Use the native value setter + `input`/`change` dispatch, or don't claim
  the keyboard path at all.
- **`/library` for `LibraryComposer`** — it does not exist; the composer is on `/` (`app/page.tsx:83`)
  and renders only when `sessionConfirmed`, which a stub `GET /v1/session` does not satisfy. Settle
  that path at unit level (probe E1) instead of fighting the auth. **Cost of my detour: ~4 min, 2 mounts.**

## 4. What repeatedly cost tokens — ranked, with the fix

1. **Running a probe outside `tests/**` (biggest single cost, ~5 min + 2 failed runs).** The repo's
   `vitest.config.ts` restricts `include` to `tests/**`, so `pnpm exec vitest run <abs path>` answers
   `No test files found`. A review seat is *forbidden* to write into `tests/`, so every REV lens will
   hit this wall and each will re-derive the same workaround. **UPGRADE: ship a
   `.claude/skills/heartbeat-reviewer/scripts/vitest.probe.config.ts` and one line in the packet —
   "your probes run with `-c <that file>`; symlink `node_modules` into your probe dir". My working
   config is promoted at `.hermes/reports/debate-tiers/probes/REV-S01-p1-security--vitest.probe.config.ts`.**
   This is a per-lens, per-mission tax paid forever until someone writes those 25 lines.
2. **The self-serve stub-API + UI-server recipe (~6 min).** `dev-stack.md` was genuinely good — the
   best packet artifact I read — but every lens still hand-writes the same stub. **UPGRADE: promote my
   `stub-api.mjs` into the orchestrator's scripts dir and have `dev-stack.md` name it.** It is 40 lines
   and it logs the wire body verbatim, which is exactly what SPEC steps 11-12 need.
3. **The stub died silently mid-run** and the next mount bounced to `/login` through `AuthGate`, which
   looked like a product defect for ~90 seconds. **UPGRADE: the recipe should say "re-check your stub
   with `curl` before every mount; a 502 through `/api/[...path]` presents as an auth redirect, not as
   an error."** That single sentence would have saved the misread.
4. **Reading 1,581 diff lines was unnecessary.** What I actually needed was five production files
   (`plan-tiers.ts`, `contract/src/index.ts:118`, `api.ts:357-402`, `defaults.tsx:65-82`,
   `page.tsx` diff). **UPGRADE: the review package should carry a `diff-production-only.patch`
   alongside the full one** — tests are 1,000 of those 1,101 added lines, and a lens that probes rather
   than reads does not need them.

## 5. Where THIS packet was unclear — exactly

- **`SPEC-v2.md:232-268` is over-range by two lines.** §2 ends at `:266`; `:268` is the `## 3. Out of
  scope` heading. Trivial, but the packet's own contract is "at the lines they name", so a wrong range
  is a defect (P1 in my verdict). `packet-check` should assert every cited range ends inside its section.
- **The `no-touch` list has no baseline, so it is unfalsifiable.** The packet forbids touching `:3000`,
  `:8790`, `127.0.0.1:55432` and `.local/**`, but gives no measurement of those at seat start. At exit
  `:3000` has no listener; I can prove I killed only my own two pids (53355 on 8796, 44631 on 8797,
  both printed by port before the kill) and that I never navigated to or acted on the `seed` tab — but
  I **cannot prove by measurement** that `:3000` was up when I arrived, because nothing told me to
  measure it. **UPGRADE: the packet should carry a one-line `lsof` baseline of every protected port,
  and require the seat to re-print it at exit.** A prohibition you cannot audit protects nobody.
- **"one mount of every surface this slice shares with another slice or with the app shell" names no
  surfaces.** I had to derive the list (the `/new` shell, the mode toggle, `LibraryComposer`'s
  `createDebate`). Two of my three mounts were spent *finding* the surface. **UPGRADE: GATE(S) should
  compute the shared-surface list mechanically — it already computes the cluster map — and name it.**
- **The lens boundary is ambiguous where it matters most.** My packet says "Your lens is
  security-data-safety (correctness/tests · security/data-safety · product-truth)" — the parenthetical
  reads as *my* scope on first pass, and it is actually the roster of all three lenses. The one finding
  I care most about (N3, the model roster as a data-routing claim) sits on the seam between my lens and
  product-truth. **UPGRADE: state the lens as one phrase, and add "where a finding straddles two
  lenses, report it in yours and say so" — which is what I did, but I had to invent the rule.**

## 6. How to make this more of a one-prompt machine

- **Mutation testing should be a named duty, not my improvisation.** Two mutants took five minutes and
  produced the strongest evidence in my verdict — that the security guard and the roster are genuinely
  pinned. "Probe, never read" tells a reviewer to distrust green; **mutation is the cheapest mechanical
  way to obey it.** Put "delete the guard your lens is about; the cluster must go RED" in the reviewer
  contract with the backup-and-`cp`-restore recipe (a review seat cannot `git checkout`).
- **The three-run re-verification should be scripted once, not retyped per lens.** I rebuilt the four
  cluster commands by hand from `cluster-map-PLAN-section-4.md`, including the two C5-restated pairs
  (`21:0`, `8:0`) that live in the README's prose rather than in the table. That is a transcription
  error waiting to happen, three times over, in parallel. **UPGRADE: GATE(S) should emit a runnable
  `rerun-clusters.sh` with the restated pairs already substituted.** Mine is promoted; it took 12
  cluster runs in 4 minutes and found nothing the orchestrator had not already found — which is the
  point: it should be free.
- **Findings that are conformance-correct but still wrong need a first-class tier.** My three real
  findings (N1 the unenforced Free contract, N2 the provenance naming the wrong plan, N3 the roster as
  a data-routing claim) are all *correct implementations of a frozen SPEC*. The reviewer vocabulary
  (B blocking / N non-blocking) forces me to file them as N, where they read as minor — when N1 and N3
  are the two things that could actually hurt a user. **UPGRADE: add a `V-ROW` tier that is neither
  blocking nor minor: "the code is right, the requirement is wrong, V must rule before the next slice
  builds on it."** I wrote all three as `V-ROW: NEW` blocks in DECISIONS.md per COMMON §4, but the
  verdict grammar still flattens them.

## 7. Prices

| Item | Wall clock | Notes |
|---|---|---|
| Packet + COMMON + 4 skills | ~3 min | reading floor held; no over-reading |
| Oracle + SPEC + diff + prod files | ~4 min | should have been ~2 with a production-only diff |
| 12 cluster runs (4 clusters × 3) | ~4 min, background | 12/12 `CLUSTER_GREEN`, 0 dirty |
| 5 probe files, 76 assertions | ~9 min | 3 assertions of mine refuted by the product, all dated |
| 2 mutants + restore | ~5 min | both caught; worktree byte-clean |
| Browser: 8 mounts, both modes, 3 wire captures | ~7 min | 2 mounts wasted on the `/library` dead end |
| Writing | ~5 min | |

Retries: 2 (vitest include wall; stub death). Passes: 1. No rework triggered by me.
