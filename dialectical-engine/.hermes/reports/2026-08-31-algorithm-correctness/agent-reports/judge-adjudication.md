# Judge adjudication — running memo (Fable 5, T3)

## 2026-09-01 · Round 1: lens harvest
Inputs: codex-audit-findings.md (26 verdicts, marker READY FOR PEER REVIEW),
opus-blind-findings.md (P1–P22, M1–M12, D1–D8, X1–X10, FULLY DONE), my own reads.

### A1 · Two-UI disagreement (codex C1 FALSE vs opus P1/D7 + judge Stop-1) — SETTLED
Both are right about their file, wrong to assume one UI. Live UI = apps/ui
(last two UI commits: c00b7f1, 7b3a306; form gates depth 1–5 at apps/ui/app/new/page.tsx:80;
NO steering fields). Legacy UI = web/ (unbounded depth, placebo steering textareas;
in pnpm workspace but stale by commit history). The HTML analyzed web/.
Re-grade C1: PARTLY (true of legacy web/, false of live apps/ui).
V's rulings S1-1/S1-2 SURVIVE with refined targets: the real hole is the CONTRACT
(depth_params is z.record(unknown) — depth not even required, opus D7); legacy web/
form is the placebo-steering carrier. No codex rework round consumed.

### A2 · Inert debate graph (opus M8/X1, codex C17/C20) — CORROBORATED, CONFIRMED
Both lenses + sentinel test tests/unit/dr184-judged-standing.test.ts:85-105 (pins that
NO shipped code writes MEASURED). Judge check of packages/evaluator: its MEASURED_* are
profiling basis literals, not edge magnitudes. Consequence chain verified: null edge
strength → contribution null → skipped → σ(τ,0,0)=τ → final ≡ τ for every node, every run.

### A3 · Unwired multi-judge apparatus (opus X5) — VERIFIED BY JUDGE
runJudgePanel / measureDispersion / applyCorrelatedErrorDiscount / applyDeclaredDisagreement:
zero references in apps/, packages/ (outside s04.ts), web/, acceptance/.
SINGLE_JUDGE_WALKING_SKELETON at s04.ts:322,330, used at runner index.ts:1553-1555,1713-1715.
The HTML missed this entirely. Changes /goal shape: "wire the panel", not "build judges".

### A4 · Q51 terminal branch (opus D3) — VERIFIED BY JUDGE (serve/src/index.ts:529-551 verbatim)
All-REASONING → DOWNGRADED (hypothesis + research plan). Any LOOKED_UP+locator → SERVED.
With no retrieval tool and "never invent sources" prompt, product's normal output is a
hypothesis, not a verdict. Open: opus Q1 (how often models claim LOOKED_UP+locator).

### A5 · Corroborated without extra judge read
- First-configured-provider serving (opus D1 · codex C21) — both cite runner 934-944.
- Verdict binary SUPPORTED/null (opus D2 · codex C26) — serve 662-668, 1007-1012.
- Review outcome ignored for standing (opus D5 · codex C18 PARTLY: evaluator numericizes
  out-of-band agree=1/dispute=0/cannot-assess=null — noted, out of verdict path).
- Risk tier decorative below admission (opus D6 · codex C3 PARTLY) — critique 328-340
  admits ANY nonempty panel; refusal only when zero makers.
- Wiring STALE not broken (codex C6 + judge pre-dispatch finding + opus RUNTIME WIRING):
  main.ts wires everything BUT via dev-only provenance (dev-runner-policy.ts:105-118
  throws on non-dev source refs; no production policy reader exists in tree) and
  claimTimeProbe unwired in prod (acceptance runner strictly richer). S06/DEV-12E lane
  ownership unknown → V ruling S0-2 applies (in /goal only if unowned).
- Strict-and unreachable via today's boot (codex C20 counter: dev policy rejects
  non-accumulate operator) — softens HTML's "roots become unservable" scenario.
- Band basis degenerate (opus M10: exactly one load-bearing serve node → shares are 0/1;
  codex C25 PARTLY: mono-maker cap is one-step-below-candidate, not below-ceiling).
- Sensitivity all-zero by M8, N+1 evaluations of waste (opus M12/X9).
- Composer constraints prompt+conformance, not code (codex C23 PARTLY).
- RAN unreachable / Q51 locator-block unreachable (opus X2/X3; codex C14).
- Value overlay + review catch-up unreachable from product (opus X6/X7).
- SSE one-shot replay (opus X8) — grounded in legacy web/; live apps/ui refreshed per
  codex C26; UI layer = out of algorithm scope either way.

### Open to later stops
- opus Q2 (register calibration values live in DB, register.bootstrap.json unread)
- opus Q4 (deployed PROVIDER_DISCOVERY_TARGETS_JSON panel size)
- opus Q5 (battery/terminal.ts settle paths — 1122 lines unread)

## 2026-09-01 · Round 2: opus goal-review adjudication (all 20 items ACCEPTED)
B1 envelope formula (DR-184-v2 assumes 2 sites/node) → T16 extension + Global DoD
  "envelope WITHIN at terminal" + T3 ceiling assertion.
B2 six quality gates vs S6-4 → T9 gains a per-gate disposition table:
  evaluator-objection (restatement, conformance/citation, post-compose wording) ·
  code-precondition with retry-then-mark (byte budget via summary tightening) ·
  delete-as-obsolete (residual-objections-empty, Q51 locator block). DoD: no non-crash
  path returns COMPONENTS_ONLY, test per legacy gate.
B3 verdict ladder not total/disjoint → ordered ladder UNSUPPORTED → CONTESTED →
  SUPPORTED → default CONTESTED (mid-zone honest middle) + property test over the cube.
B4 live UI vocabulary (endorsed / endorsed_with_caveat / suppressed_no_evidence) never
  references the three states → explicit mapping task in T11 + NEW V confirm-item.
B5 "ALL nodes" vs top-2 digest → lossless-membership digest: every node present,
  byte budget governs summary length, top-2 objections stay as emphasis only.
N1 round-3→CONTESTED was a judge addition → surfaced as its own confirm-item.
N2 T3 DoD → one reduced judgement, panelContractHashes ≥2, dispersion non-null.
N3 resolveLeverage is a stub → cite sensitivityRecords[].leverage; implement-or-delete
  the stub inside T7; O(N²)/round cost priced (bounded by adaptive stopping).
N4 T8 deletion surface + rivalOperator pathway + two receipt fields + migration.
N5 dr184 sentinel retirement: cite S3-1 in-task + dated DECISIONS line in new mission.
N6 T1 single-source: contract exports the 1–5 bound; runner imports; no second literal.
N7 T14a answers BOTH halves (ownership AND proven-broken-with-evidence) before T14b.
N8 T16 physically scheduled directly after T0 (number kept for citation stability).
N9 bootstrap seeds evaluator ≠ synthesizer; identical refs → startup warning + test.
N10 T12 cites serve 559-568 + T10 dependency (240-256 dropped).
N11 filed against MY review packet (lift said two files, §2 listed a third) — F2 class;
  r2 dispatches name the full read set. Codex's packet lifts nothing (it has the
  adjudication in readonly), so N12a's coverage gap is closed by the codex lane.
N12b δ/ε defaults unfalsifiable pre-run → T7 DoD: re-fit from first M≥2 acceptance run.
N12c three line-range drifts fixed (987-996; close 1716; close 2096).
M1 S6-1 added to T9/T10 citations. M2 Non-goals line: dead askContract storage deferred
  to the steering mission. M3 intake rulings get explicit I-1..I-5 labels (appended
  clarification in DECISIONS; the old "S0-4" reference was indeed off by one).

## 2026-09-01 · Round 3: codex goal-review adjudication (all 19 items ACCEPTED, 0 contested)
B1→T11 total ladder + named dispersion quantity + numeric defaults + partition property
test. B2→acyclic order T10→T11→T9; round-3 objection = mark only by default; confirm-item
3 added. B3→lossless-membership digest schema + decisive-node test + loud over-budget
outcome. B4→T15b closes evidence→role decision with V; S6-1 cited. B5→leverage defined
over sensitivityRecords (branch = subtree-root node removal); exact numeric tests.
B6→register mechanism corrected: migration + deployment-register seeding; bootstrap.json
untouched; T16 sole owner, scheduled after T0. B7 (merges opus B1)→new T17 envelope task,
DR-184-v2 formula extended, WITHIN-at-terminal in Global DoD. B8→T16 gains all s04
reducer inputs incl. family map + UNKNOWN-family behavior; T3 needs acceptance receipt.
B9→confirm-item 5 failure policy (degraded-with-mark, never silent). B10→per-gate
disposition table with expected terminal + mark + test per former path. B11→T12 DoD
reworded (structurally-forced 0/1 gone; homogeneous stays 0/1). B12→T15 exact spend
matrix + V approval gate before provider calls. B13→RED discipline corrected in T1/T3
(desired-behavior-fails-first; probes never flipped). B14→T5 ledger single-call
assertion. N1→path + I-2 + S6-1 citations fixed. N2→T0 pins exact commands.
N3→T1 asserts 400 + parseRequest envelope + machine code. N4 (packet review)→r2 packets
carry full typed state incl. risk_tier, self-report paths + verbatim instruction.
MISSING-1 merged with B4. Draft rework: round 1 of 3 (charged to drafter). goal-v2 issued.

## 2026-09-01 · Round 4: opus r2 adjudication (all ACCEPTED)
B1(r2) mono/degraded runs outside the label cube → T11 gains a pre-step arm:
  margin or disagreement ABSENT → CONTESTED + mark LABEL-BASIS-INCOMPLETE; property test
  extended to the absent arms; mono-maker acceptance asserts the label. NEW confirm-item:
  a single-model run can never print SUPPORTED (judge rec: yes — a solo voice is
  contested by construction; V decides).
N1(r2) envelope exhaustion named as 4th crash-class member in T9 (fires post
  protected-core, no prose, resource death not quality) + T17 cross-ref (T17 = ceiling
  big enough; T9 = what happens if still hit) + per-path test.
N2(r2) T17's ledger assertion moved wholly into T17; delegation sentence dropped.
N12a(3) run-level claim frame (codex C11, verified by opus): every child claim-typed
  from the ORIGINAL question; τ composition row follows the root frame. Never surfaced
  at a walkthrough stop (judge coverage miss, owned). Becomes load-bearing once τ drives
  edges/margins/labels. → NEW confirm-item with judge rec: PARK in Non-goals this
  mission (defensible one-debate-one-frame design; misfit = coefficient mis-weighting,
  tempered by cross-maker panel; revisit with live calibration data), small task only if
  V insists.
N12a(2) T6 gains one line: evaluator profiler (evaluator/src/index.ts:2476-2480) is a
  second consumer of review outcomes — do not tidy the vocabulary.
Note: opus T4 self-report not yet on disk at harvest time (agent may still be writing
  it — packet orders self-report before final message); verify at completion notice.

## 2026-09-01 · Round 5: codex r2 adjudication (all 4 ACCEPTED) → goal-v3
B1(cx-r2) T0 pinned the WRONG entry (main.ts = server bootstrap; ceremony =
  run-acceptance.ts, verified against acceptance/README.md) → exact command + note in T0.
B2(cx-r2) mono projection undefined (converges with opus B1(r2); codex adds the
  divergence table: absent-as-no-op yields SUPPORTED) → T11 step-0 ABSENT arm.
B3(cx-r2) v2's "request contains the digest only" would starve the evaluator of the
  candidate statement → per-role recorded request schemas; fresh-context re-defined as
  absence of transcript/history, never of needed artifacts.
N1(cx-r2) ticket/packet mirror still invalid (canonical not updated; risk_tier
  "standard" outside the spine enum low|medium|high — engine ask-tier vocabulary
  conflated with spine vocabulary, orchestrator error; §3 instruction paraphrased) →
  T4/T5 canonical states regenerated (risk_tier medium + routing reason), r3 packets
  mirror byte-for-byte, verbatim instruction carried. F2 addendum class.
Draft rework: round 2 of 3 (v3). r3 = verification-only round, scoped to the seven edits.

## 2026-09-01 · Round 6: opus r3 — APPROVE · routed N1(r3) ACCEPTED
N1(r3): T9's DoD tests "former gate paths" only — the envelope crash class it now owns
has no obligation; and the envelope terminal's protectedCoreVerified guard keys on R9
PASS (runner:2255,2260,2387,2392; serve:380-382), which T9 re-routes out of gate-hood —
an exhausted-envelope run with failed restatement could bypass the terminal and serve
over budget. DISPOSITION (drafter, per the reviewer's routing authority): envelope
terminal fires on HARD_STOP whenever no served statement exists yet, independent of
restatement status; the R9-coupled guard is KNOWINGLY retired (its purpose dissolves
when R9 stops being a gate); T9 DoD extended to one test per enumerated crash class
asserting terminal + mark + the retired-guard behavior. APPLICATION DEFERRED until
codex r3 files — no mid-review mutation of the artifact under its cursor.

## 2026-09-01 · Round 7: codex r3 adjudication (both ACCEPTED) → goal-v4 (final lawful round)
B1(cx-r3) risk_tier medium violates the spine's immutable high floor for SCORING
  SEMANTICS (verified verbatim, spine:1176-1199) → both review tickets `high` with the
  floor cited; packet regenerated; byte-equality re-check requested. Orchestrator error
  class: second vocabulary conflation this mission (F2 addendum).
B2(cx-r3) v3 schemas never fed the evaluator objection back to the retry synthesizer —
  the loop could converge only by accident (codex's three-run probe:
  written_retry_changed=false) → initial/retry schemas split; retry carries the prior
  objection VERBATIM + prior-candidate ref; round-2-objection recorded-request
  assertion added to T9 DoD.
Also applied in v4: opus's routed N1(r3) clause (crash-class tests + knowing retirement
  of the protectedCoreVerified guard, disposition: envelope terminal fires on HARD_STOP
  whenever no served statement exists).
Round accounting: v4 = draft rework round 3 of 3. Codex r4 = verification only; any
CHANGES residue → V DECISIONS PACKET. Opus not re-dispatched (its routing: "no
re-review needed"); its approval stands on v3 + the routed clause applied as instructed.
