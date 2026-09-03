# CODE-T9C2-REV self-report — blind Opus 5 review seat, ticket t_3c187757

SKILLS LOADED: heartbeat-protocol, heartbeat-reviewer, superpowers:using-superpowers,
superpowers:verification-before-completion

Treated as a murder case. Verdict was PASS with six N-findings; this file is about what
that cost and what should change.

## 1. The single most expensive thing in this cluster: PLAN said `/new?x=1` and nobody ran it

**Cause, not symptom.** The dispatch packet (`CODE-T9C2.md` §2) wrote its OWN hostile-input
table instead of quoting PLAN HOW's. Both tables are eleven-ish rows and both look
exhaustive, so nothing downstream noticed that the substitute dropped three PLAN-named
minimum cases. Two of the three were redundant — I swept every member and proved
`javascript:alert(1)` and `/public/debate/../../etc` hit code paths already pinned by
`http://evil` and `/new/../settings`. The third, `/new?x=1`, was the only case in either
table that exercises the `?`/`#` path-part clause, and it was the one that got dropped.
Consequence: **two independent mutants on a PLAN-verbatim contract clause survive the full
94-test suite** (M8: delete the strip; M9: return `path` instead of `raw`).

**Price:** the clause is behaviourally live — `/new?x=1`, `/new#frag`,
`/settings?tab=security`, `/public/debate/abc-123?from=share` all resolve differently under
the three implementations, and the suite cannot tell them apart. It did not cost a round
this time because I caught it, but the same substitution habit is what generates the
mission's recurring unpinned-site class.

**Upgrade, concretely.** A packet that restates a frozen contract's test table must either
quote it verbatim or carry a line saying which rows it replaced and why. AM8 did exactly
this for `T9-C2-2` — *"supersedes PLAN:94"*, in writing, with the reasoning. The same packet
silently rewrote PLAN's minimum-case list one section later with no such line. **The
practice already exists in this mission; it was applied to the cell and not to the table.**
Make it mechanical: if a packet section paraphrases a frozen artifact, it names the artifact
and the delta, or it quotes.

## 2. Cell T9-C2-5 vanished between PLAN and dispatch, and no artifact records the loss

PLAN carries five T9-C2 cells. ADR-004's Refutation section names `T9-C2-5` explicitly as
the reason the hostile-input table exists. The dispatch packet's §1 charge lists 1..4. AM8
touched `T9-C2-2` and `T9-C4-5/6` and had every reason to notice the fifth cell while
counting CTA sites — it did not. Nothing is wrong with folding `T9-C2-5` into §2's mechanism
(the worker did implement the table), but the fold is undocumented, so a reader
reconciling PLAN against the packet finds a cell with no home and cannot tell whether it was
absorbed or forgotten.

**What repeatedly costs tokens here:** every seat in this mission spends real time
reconstructing the authority chain — frozen PLAN vs dispatch-order amendments vs the packet.
The codex worker's own self-report ends on exactly this line, independently. That is two
seats naming the same tax in the same cluster. **A single `## Supersessions in force` block
at the top of each packet — one row per (frozen text, superseding artifact, reason) — would
have absorbed the T9-C2-2 narrowing, the T9-C2-5 fold, and the table substitution, and would
have cost the orchestrator four lines.**

## 3. What I nearly got wrong

**I nearly filed the query/fragment survivors as an open-redirect finding.** `safeReturnPath`
returns `raw`, not the validated `path`, so `/new?next=//evil.example` and `/#//evil.example`
come back with attacker-controlled tails attached. That reads like a validate-one-thing /
return-another bug, which is a real vulnerability class. It is not one here, and the reason
is worth recording: the shape checks (begins `/`, second char not `/` or `\`, no `\`
anywhere) apply to the WHOLE raw string, not to the path part, so the origin is pinned
independently of the allow-list. I stopped reasoning and measured it — resolved every
accepted output through the real WHATWG parser against a fixed base origin. Zero escapes in
39 hand-built vectors, zero in 29,953 fuzzed ones.

**The measurement was cheaper than the argument, and it is the only reason this finding
didn't ship.** Same lesson the T3-C1 review recorded as "cheaper to mutate than to reason
about" — it generalises to "cheaper to resolve than to reason about" for anything URL-shaped.

**Dead end worth naming so nobody re-derives it:** I spent time on the browser's
TAB/LF/CR-stripping trick (`/<TAB>/evil.example` becomes `//evil.example` after the URL
parser strips whitespace — a genuine bypass against naive validators). It cannot work here,
and the proof is structural rather than empirical: to survive, the path part must be exactly
`/`, `/new`, `/settings` or match the ref regex, so the strippable character would have to
sit at index 1 while index 1 is simultaneously `?` or `#`. Contradiction. **Do not re-run
this class on `safeReturnPath`.** I fuzzed it anyway (V2a–V2f, plus tab/LF/CR in the fuzz
alphabet) because a structural argument I authored is not evidence.

## 4. What worked, and should be copied

- **The worker's navigation-time proof is the best test in the diff.** It sets the URL to
  `?next=%2Fsettings` at render, swaps `window` to `?next=%2Fnew` before completing MFA, and
  asserts `/new`. One test kills both the module-constant mutant and a render-time-read
  mutant, and it discriminates by DISAGREEING with itself across time rather than by
  asserting a value. My M11 confirms it fires. That pattern belongs in the reviewer skill.
- **`git checkout --` + SHA-digest after every single mutant.** Eleven mutations, eleven
  restores, one digest line each; the product-set digest `72bbf4b42ee800d2` never moved. Cost
  ~4 s per mutant and made "byte-clean at verdict" a non-question.
- **The AM6 scoped-subtree convention is load-bearing and now provably so.** My M7 (CTA MOVED
  out of the chrome subtree, still in the document) and M10 (attribute deleted) are both RED.
  Under the pre-AM6 unscoped query both would have been green.

## 5. Where the packet fought ME

1. **`tee /dev/stderr` in the ADR-006 gate.** The codex worker hit this too and used a
   "capture-first equivalent"; I could run it, so our gate invocations were not identical.
   Two seats running two spellings of the canonical gate is exactly the drift ADR-006 exists
   to prevent. **The gate block should ship a sandbox-safe form as the primary spelling**
   (capture to a variable, print, then count) rather than as a documented fallback.
2. **The packet's pre-existing-dirt manifest names one file; the tree carries three.**
   `docs/missions/2026-08-21-docker-hatchet/GPT-ORCH-HANDOFF.md` and
   `ui_designs/DebateAI Design Document.html` are untracked and predate the cluster. Under
   "byte-clean at verdict except manifested dirt", a literal reader must flag them. Generate
   the manifest from `git status --porcelain` at dispatch instead of typing it.
3. **`rg` availability differs across seats.** The worker fell back to Perl for the AM3
   oracle; `rg` worked for me. Same drift as (1), same remedy: the oracle should not assume a
   tool the fleet does not uniformly have.

## 6. Toward the one-prompt machine

- **Ship the fuzz harness, not the finding.** ~90 lines resolves every accepted output
  through the real URL parser and asserts a fixed origin. That is a permanent oracle for any
  redirect-shaped validator this product ever grows, and it is strictly stronger than any
  hand-written rejection table — it needs no list of attacks. A rejection table pins the
  attacks someone thought of; an origin oracle pins the PROPERTY. **`/new?x=1` is unpinned
  today precisely because the contract is expressed as a list of inputs rather than as a
  property.**
- **Make "a mutant per contract clause" the acceptance, not "a mutant per cell."** The
  contract has four clauses; the worker's six mutants map to cells and hit three of them.
  Clause 4's ?/#-split half is the one with no mutant, and it is the one that survives.
  Enumerating clauses is mechanical; enumerating "interesting mutants" is taste.
- **The three-run-worst-of convention is not earning its cost here.** All three runs are
  identical and the suite takes 2.7 s; the variance this guards against is fixture/clock
  flake, which this suite does not have. `--sequence.shuffle` x3 found more (order
  independence) for the same wall-clock. Consider swapping the repetition for the shuffle on
  fast deterministic suites.

## 7. Honest bounds

jsdom is not a rendering engine: chrome composition, first paint, and real-browser URL
handling remain V's lines. I asserted the browser's TAB/LF/CR strip by modelling it
(`replace(/[\t\n\r]/g, "")`) over the real WHATWG parser, not by driving a browser — the
model matches the URL spec, but it is a model. I did not open `web/`; it is out of contract
per ADR-006 / open-questions Q-02, and its auth twins still carry the old `HOME_PATH`
(filed as N4).

---

# REV2 append — focused re-verify of addenda 1 & 2 (f61d68bc), ticket t_6eed8efc

SKILLS LOADED: heartbeat-protocol, heartbeat-reviewer, superpowers:using-superpowers,
superpowers:verification-before-completion (same session 8239f6c2, carried forward)

VERDICT: ADDENDA SOUND. Four new N-findings, all fail-closed or cosmetic, none blocking.

## 1. The loop closed, and it closed on the thing I said it would

My N1 remedy (ec7c857) kills exactly the two mutants that found it: M8 and M9 both go from
94/94 GREEN at 6aa9f35 to `2 failed | 104 passed` at f61d68bc, and the two failures are the
two new rows by name. My N4 prediction was confirmed by AM9 with a better framing than mine —
I read ADR-004 §Decision and §Wiring as a contradiction and asked which half wins; ARCH found
they name two DIFFERENT links and both are normative. **My framing would have fixed one leg
and left the other unpinned.** Worth recording: I filed the finding correctly and reasoned
about the remedy wrongly, and the adjudicating seat caught it. That is the review loop
working in the direction it is usually not credited for.

## 2. What I got right that is worth generalising

**The narrowing-preserves-the-fuzz claim was checkable, so I checked it instead of accepting
it.** AM9 asserted the uuid tightening "preserves the 29,992-input fuzz result by
construction." True, and I proved it rather than agreeing: 17,553 inputs through BOTH
validators side by side — 0 new accepts, 0 throws, 0 cross-origin escapes, 4,581 flips and
every one inside `/public/debate/`. A monotonicity claim is one loop away from being a
measurement; making the old validator a local function in the harness cost six lines.

**The real risk of a narrowing is not what it stops accepting, it is what it stops accepting
THAT IT SHOULD.** Nobody's cell asked for this, and it is the only way this addendum could
have broken production: 2,266 refs through the contract's real `z.uuid()` and through
`safeReturnPath` — **0 in the dangerous direction**. That probe is the one I would keep.

## 3. The new findings, and the pattern connecting them

**N8** — T9-C2-6's `only-when-present` clause is unpinned on the LoginFlow leg. A mutant that
always emits `/sign-up?next=` survives 106/106. SignUpFlow's mirror control exists (added in
the original round); LoginFlow's was not added when the leg was.
**N9** — T9-C2-7's accept-case alarms on edits to `returnPath.ts`, not on a change to the
contract's `public_ref` type, which is the direction AM9's changelog names.

**These are the same defect as N1, one round later, and that is the finding above the
findings.** All three are a stated contract clause with no mutant behind it. N1 was
`/new?x=1`; N8 is `only-when-present`; N9 is `alarms if public_ref stops being a uuid`. Each
time, the positive half got a test and the qualifying half did not. **A clause with a
qualifier — "only when", "unchanged", "if X ever" — needs a test per qualifier, and the
qualifier is the half that gets dropped.** Cheap mechanical rule: when a cell's WHAT contains
"only", "unless", "still", or "if ever", count the clauses and count the test rows, and make
the counts match before writing any code.

## 4. Cost and what I would change

This pass cost ~15 minutes and found two unpinned clauses, one of which (N9) the changelog
states as a safety property that does not hold as stated. **The recurring tax is that every
addendum re-litigates the whole gate battery** — row-4 x3, canonical gate, oracle, storage
guards, tree check — to verify a 4-file change where only 2 product lines moved. That is
right for a security surface and I would not cut it, but it should be ONE script in the repo
that a packet names, not seven commands each seat re-types from three different ADRs. I typed
them twice now, from ADR-006 and ADR-001 respectively, and the codex worker typed a third
variant because `tsx -e` could not open its IPC pipe under its sandbox. **Three seats, three
spellings of the same gate, in one cluster.** Ship `scripts/t9-gates.sh`.

Second: my first pass reported the fuzz as "29,953 inputs" and this one as 17,553 — different
alphabets, different anchor sets, not comparable. **A fuzz count is not a metric unless the
harness is fixed.** If the harness ships (§6 of the first report), pin its input set so the
number means something across rounds.

## 5. Honest bounds, REV2

Focused re-verify only: I did not re-run the T9-C2 chrome cells, the full mutant matrix from
the first pass, or my own anonymous-render probe — the chrome files are byte-identical to
6aa9f35 (SHA-checked) so the first pass still stands for them. `z.uuid()` was exercised
through the real zod 4.4.3 the contract resolves, but I did not check whether any OTHER
producer of `public_ref` bypasses the schema. jsdom bounds unchanged from the first report.

---

# REV3 append — re-verdict on addendum 3 (3a637d35), ticket t_00a05b8e, epoch=19

SKILLS LOADED: heartbeat-protocol, heartbeat-reviewer, superpowers:using-superpowers,
superpowers:verification-before-completion (same session 8239f6c2)

VERDICT: ADDENDUM SOUND. One N-finding, on a boundary statement's precision, with no
safety consequence.

## 1. I was wrong about N9, and the departure is the most valuable thing in this round

My REV2 remedy was `expect(z.uuid().safeParse(REF).success).toBe(true)`. AM11 rejected the
form and measured why: it imports `z` from zod, not the schema from the contract, so it
exercises zod's uuid validator against a hardcoded uuid — **a tautology**. I tried to refute
the departure by constructing a drift the shipped row misses and mine catches. **I ran seven
and found none.** My form was GREEN under every one, including the two that matter:

| Drift on `PublicDebateSummarySchema.shape.public_ref` | SHIPPED | MINE |
|---|---|---|
| D1 `z.literal("slug-ref")` | RED | GREEN |
| D3 ULID regex (format switch) | RED | GREEN |
| D6 `z.number()` | RED | GREEN |
| D2 `z.string()` / D5 uuid-or-slug / D7 hex superset | GREEN | GREEN |
| D4 `z.uuid().refine(v => v.startsWith("3f"))` | GREEN | GREEN |

The shipped row strictly dominates: everything mine could catch, it catches, and it catches
three classes more. **A remedy I proposed as a reviewer was worse than the one the
implementing side wrote, and it took an ARCH seat measuring it to find that out.**

**The generalisable error, because it is not really about zod.** I wrote a test whose subject
I named correctly ("agreement with the contract") but whose *binding* pointed at a library
constant instead of at the artifact under contract. **Neither the name nor a reading of the
line reveals it — only executing it under drift does.** That is the same failure mode I have
now filed three times against other people's work (N1, N8, N9): a clause that reads as pinned
and is not. I did it in the remedy for the finding where I named the pattern. The rule I
proposed in REV2 — count qualifiers, count rows — would not have caught this one. **The rule
that would: a test asserting that X agrees with Y must be run with Y broken.** If it stays
green, it is not testing agreement. That is one line and it belongs beside "RED before GREEN"
in the worker contract, because it is the same law applied to the oracle rather than to
the code.

## 2. What I checked that nobody asked for, and why it changed my finding

The packet asked whether the narrowing/widening boundary claim is accurate. The honest answer
needed a class the claim does not name. D3 and D6 are neither narrowings nor widenings of
`z.uuid()` — they are *incomparable* — and both are DETECTED. So the statement is wrong in
two directions at once: it overstates (D4, a genuine narrowing, is missed) and understates
(the format-switch class, which contains the most realistic real drift — a uuid→ULID or
uuid→slug migration — is caught and unclaimed).

**Then the severity question, which is where I nearly filed too high.** I had "the boundary
claim is inaccurate" written as a two-part finding before I asked whether the inaccuracy can
hurt anyone. It cannot: a fixture-preserving narrowing yields a *subset* of uuids, and
`safeReturnPath`'s kind accepts all uuids, so no real ref is ever refused. The missed class is
provably harmless. **The finding survives as precision, not coverage** — and it dropped from a
possible REWORK to a low N on that one question. Asking "can this hurt anyone" before
assigning a tier is worth more than any amount of additional probing.

## 3. Cheap moves that paid

- **The shared-fixture check nobody specified.** `ACCEPTED_PUBLIC_REF` is one const feeding
  both the accept-case and the agreement row. I mutated it to `"abc-123"` and both rows went
  RED — so the fixture cannot rot into a non-uuid while looking aligned. One mutant, and it
  retires a whole class of future doubt about the pair.
- **M19 over M17.** M17 (the mutant that survived at f61d68bc) proves the row exists. **M19 —
  make the absent-case default `"/sign-up?next="` — proves the row is EXACT**, because a
  `startsWith`/`contains` pin would pass it. The packet asked for exactness; only M19 answers
  it. When a packet says "exactly", the mutant is the value that satisfies the sloppy version.
- **M20/M21 as a pair for N11.** Broadening to 1,300 chars fires the renamed row; broadening
  to 1,128 does not. Together they show precisely what the row now pins and what it never
  pinned — which is the evidence a rename needs, and neither run alone provides.
- **Byte-identity as an argument.** `returnPath.ts` is SHA-identical to the artifact I fuzzed
  in REV2, so 17,553 inputs and 2,266 contract-valid refs carry forward without re-running.
  Cheaper than re-measuring and strictly sounder than assuming.

## 4. Where this round cost more than it should have

**Three shell-quoting failures burned two full drift cycles.** `$` and `/` inside a
regex literal passed through zsh double-quotes into a perl `s{}{}` — D3 and D5 silently
wrote truncated garbage into `packages/contract/src/index.ts`, vitest errored, and my grep
matched nothing, so the run reported *blank* rather than failing loudly. **A mutation harness
that can corrupt a file and report nothing is the same defect class as a gate that prints 0
when the compiler never started** (ADR-006 §"Why step 2 exists"). Fixed by passing the
replacement through the environment (`DRIFT="..." perl -pe '...$ENV{DRIFT}...'`), which has no
quoting layers at all. **That form should be the house style for every mutation script in
this fleet** — I have now written mutants in three rounds and this is the first spelling that
cannot silently mangle its target.

**The 8 pre-existing failures in `tests/unit` cost a verification cycle to clear.** They are
unrelated (`load01`, `obs-l2-s04`, `pro01`, `s6`, `v2ui-node-runner`, `xrev01`) and I proved
they predate the addendum by re-running with its two files reverted. But no artifact in this
mission records them as a known-red baseline, so every seat that runs a `tests/unit` sweep
pays for that proof again. **Publish the red baseline the way ADR-006 publishes its two
compile diagnostics** — a named list, with the same discrimination requirement.

## 5. Honest bounds, REV3

Test-only addendum, so I did not re-run the chrome cells, the origin-oracle fuzz, or the
contract-divergence probe — `returnPath.ts` and `LoginFlow.tsx` are byte-identical to the
artifacts REV2 covered (SHA-checked), so those results stand unchanged. My drift experiments
mutated `packages/contract/src/index.ts` and restored it byte-exactly each time (digest
`b15a9217cb421da9`, verified after all seven). I did not test drift in `src/client.ts` or in
any other producer of `public_ref`. jsdom bounds unchanged from the first report.
