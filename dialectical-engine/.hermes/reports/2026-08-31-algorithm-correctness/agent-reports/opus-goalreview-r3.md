GOAL REVIEW r3 — opus · APPROVE · comments read through: goal-v3-2026-09-01

# OPUS GOAL REVIEW r3

Verification-only round, scoped per packet §2 to the four v3 edits that answer my r2 items, plus a
regression check on the three codex edits. Draft: `goal-prompt.md` @ `goal-v3-2026-09-01`. Tree: my
pinned worktree @ dev`1c9578a`. Round 3 of the ≤3 lawful rework rounds (DECISIONS.md intake ruling
5) — see the routing note under VERDICT.

## VERDICT

**APPROVE** — 0 unresolved, 0 blocking, 1 non-blocking (N1(r3), a one-line DoD gap inside a v3
edit's own newly-declared ownership).

All four of my r2 items are resolved, three of them completely. I am approving rather than
returning because this is the last lawful rework round and N1(r3) is closable by adding one DoD
clause to T9 — no re-review needed. Per reviewer contract §4, it is routed rather than held: apply
the clause on the way to V, or carry it as a V DECISIONS PACKET row. It should not open a round 4.

### Verification 1 — T11 step-0 ABSENT arm · RESOLVED, complete

The ladder now opens with the absent-input arm (v3 T11, step 0) before step 1, catching both
operands I showed were undefined: `margin ABSENT (single root: no runner-up exists)` and
`disagreement ABSENT`, the latter cited to `s04.ts:270-271` — the exact
`FEWER_THAN_TWO_PARSEABLE_JUDGEMENTS` guard I raised, correctly quoted. Both reaching paths are
named (mono-maker skeleton and `PANEL-DEGRADED-SINGLE-VOICE`), the outcome is
`CONTESTED + LABEL-BASIS-INCOMPLETE`, and confirm-item 6 carries the product-level consequence to V
in one sentence a non-engineer can rule on ("a solo voice can never print SUPPORTED, no matter how
confident").

I re-checked totality and disjointness over the full runtime domain with step 0 in front: steps are
`else`-chained so exactly one fires; step 4 is a true catch-all; and `winner` cannot itself be
absent, because a run with no servable root throws `NO_SERVABLE_MAKER_POSITION_AFTER_REVIEW`
(`apps/runner/src/index.ts:1993-1998`) and never reaches labelling. The DoD closes the loophole I
flagged — it now requires the property test to cover "the (winner, margin, disagreement) cube PLUS
the absent-margin and absent-dispersion arms (ABSENT/null are runtime values, not NaN)" and pins the
mono-maker acceptance run to assert its label and mark. That parenthetical is the part that matters:
it is what stops a builder from satisfying the DoD with NaN guards alone.

### Verification 2 — T9 crash set gains envelope exhaustion · RESOLVED (see N1(r3))

The enumerated set is now "transport death, no-artifact, digest-cannot-exist, and envelope
exhaustion after protected-core verification (ENVELOPE_EXHAUSTED — a resource death with no prose,
not a quality judgement; T17 owns keeping the ceiling big enough, T9 owns what happens if it is
still hit)". The rationale is stated, the crash-vs-quality distinction is drawn correctly, and the
T17/T9 ownership split is explicit. This is exactly the naming fix I asked for.

### Verification 3 — T17 ledger assertion self-contained · RESOLVED, complete

The delegation sentence is gone. T17's DoD now reads "...covers the observed attempt count of the
flagship M≥2 run — panel attempts included, asserted HERE from the same ledger". I confirmed the
other half: T3's DoD is unchanged and carries no phantom envelope obligation, so the assertion
exists in exactly one place.

### Verification 4 — confirm-items 6 & 7 + Non-goals claim-frame line · RESOLVED, complete

Confirm-item 7 states the claim-frame item accurately, cites `apps/runner/src/index.ts:1633` — which
I verified in my own tree in r2 — attributes it to both lenses, states the today-inert /
tomorrow-load-bearing asymmetry correctly, and offers V both dispositions with a recommendation.
The Non-goals line ("per-node claim-type classification (the run-level frame is deliberate this
mission — confirm-item 7)") closes the gap where the item previously lived nowhere.

### Regression check on the three codex edits — clean

- **T0 ceremony command.** Verified in my tree: `acceptance/run-acceptance.ts` exists and parses
  `--service-credential` (`:28`, `:71-75`), validating it against `/^[A-Za-z0-9_-]{43}$/` — which
  matches v3's `<43-char credential>` exactly. The correction is right, and the "`acceptance/main.ts`
  is the SERVER BOOTSTRAP, not the ceremony" note does not disturb my citations of that file:
  T14 still cites `acceptance/main.ts:519` for `claimTimeProbe` supply, which remains correct as a
  statement about the file's contents. No regression.
- **T9 per-role request schemas.** This repairs an over-tight assertion I had endorsed. My r1 review
  praised v1's "the synthesizer request contains digest only" as the best-specified DoD in the
  document; taken literally it would have starved the evaluator, which needs the candidate statement
  and the prior objection on retries. v3's split — synthesizer = instructions + digest + code
  label/numbers; evaluator = the same plus the candidate statement — with the assertion restated as
  "NO debate transcript or provider history beyond those named artifacts — never the absence of
  artifacts a role needs" is strictly better than what I asked for. Correction accepted against my
  own r1 item.
- **T6 second-consumer note.** Matches my N12a(2) recommendation, and the citation
  (`packages/evaluator/src/index.ts:2476-2480`) is the one I verified in r2. No regression.

## FINDINGS

### N1(r3) — NON-BLOCKING · T9 is given ownership of the envelope-hit path but no DoD for it, and that path's guard keys on a gate T9 reclassifies

**WHAT.** Edit (2) assigns ownership: "T9 owns what happens if it is still hit." T9's DoD, however,
requires "one test per **former gate path**" — and the envelope is not a former gate path, it is a
newly enumerated crash class. So the clause that creates the ownership creates no obligation under
it.

That matters more than a missing test usually would, because the envelope terminal is guarded by the
R9 restatement result, which T9 simultaneously converts from a hard gate into an evaluator-objection
criterion. Verified in my tree: the runner takes the envelope terminal only when
`initialEnvelopeDecision.kind === "HARD_STOP" && servedRoot.restatementStatus === "PASS"`
(`apps/runner/src/index.ts:2260`, same condition again at `:2387` and `:2392`), passing
`protectedCoreVerified: servedRoot.restatementStatus === "PASS"` (`:2255`); and
`createEnvelopeExhaustedResult` throws `PROTECTED_CORE_NOT_VERIFIED` — "R9 must pass; it cannot be
skipped by the envelope" — when that is false (`packages/serve/src/index.ts:380-382`). Those guards
were written when R9 was a hard serve-chain gate. Once T9 re-routes R9 (v3 T9,
"R9 restatement (serve:452-455) → evaluator-objection criterion"), a run with a failing restatement
no longer stops at R9 — so on an exhausted envelope it now bypasses the envelope terminal entirely
and proceeds to synthesis, serving prose while over budget. That is a behaviour change nothing
currently asserts either way.

**WHERE.** T9 (enumerated crash set + DoD), interacting with T9's own R9 re-routing line.

**WHY.** Not a v3 regression in the code sense — the interaction was created by v2's gate re-routing,
which I asked for in r1 B2. It becomes reportable now because v3's edit is what places this path
inside T9's declared ownership, and an ownership statement with no DoD is the gap the edit itself
introduces. I am filing it once, here, rather than re-litigating v2.

**SUGGESTED FIX (one clause).** Extend T9's DoD from "one test per former gate path" to
"...and one test per enumerated crash class, including envelope exhaustion — asserting the terminal,
the mark, and the behaviour when R9 restatement has NOT passed under an exhausted envelope (state
which of: serve with mark, or envelope terminal)". If the answer is "serve with mark", say so in the
gate-disposition list next to the R9 line so the `protectedCoreVerified` guard is knowingly
retired rather than left keyed to a gate that no longer exists.

**ROUTING.** Round 3 is the last lawful rework round. This does not warrant reopening review: the
drafter can apply the clause directly, or V can take it as a DECISIONS PACKET row. Either way it
should be on a ticket before the build mission decomposes T9 — that task now owns four crash classes
and tests three.
