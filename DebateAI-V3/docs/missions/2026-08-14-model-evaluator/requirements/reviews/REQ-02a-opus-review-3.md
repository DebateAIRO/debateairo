# REQ-02a — Claude Opus peer review of `requirements/Requirements.md` (round 3, final)

Reviewer: Claude Opus reviewer instance **A**. Prior rounds: `REQ-02a-opus-review-1.md`
(REWORK, B1–B5), `REQ-02a-opus-review-2.md` (REWORK, B1–B5 resolved, new C1).
Artifact re-read at **606 lines** (was 603 at round 2). Scope of this round, per the
coordinator: verify the C1 fix is genuine and complete, and confirm no collateral change
broke anything previously passed.

**Verdict: PASS.** C1 is resolved with the exact differential test I prescribed, the
mechanism facts it cites are accurate, and — as verified below — the constraint closes the
*whole* enrollment surface rather than the one symptom I named. The diff is narrow
(FR-0.6 + one open question + one document-control line); nothing I previously passed
moved.

---

## 1. The diff is narrow (collateral check)

I re-read all 606 lines against the round-2 text rather than trusting the changelog. The
mission directory is untracked in git, so this was a full-text comparison, not a `git diff`.

Changes, complete list:

| Location | Change |
|---|---|
| FR-0.6 item (1), line 82 | Appended purpose-separation clause naming the mechanism and why it matters |
| FR-0.6 AC5, line 92 | **New** — the panel-isolation criterion + QA differential test + escalation clause |
| FR-0.6 Traceability, line 94 | Ruling 11 added; citations added for `configuredProviderSet`, `resolveDiscoveredPanel`, `selectDifferentMakerReviewer`, `0022` |
| Open question 12, line 561 | **New** — FR-0.6 build ownership / ticket routing (reviewer B's NB2-2) |
| Document control, line 605 | **New** — round-2 rework line |

Everything else is byte-identical to the round-2 text: FR-0.1–0.5, FR-0.7, sections 1
through 10, Boundaries (both tables and the accepted-risk clause), Open questions 1–11,
and both traceability matrices. **No regression** in any area I passed at round 2 — in
particular the B1 (Q59 table separation), B2 (FR-3.0/3.5), B3 (FR-8.0), and B4 (FR-1.3)
resolutions are untouched, including the falsifiable ACs that carried them (FR-3.1 AC4,
FR-3.2 AC3/AC4, FR-1.3 AC2, FR-8.1 AC5).

## 2. C1 — resolved, and more completely than I could confirm at round 2

### 2a. The criterion matches the prescription

My round-2 prescription and FR-0.6 AC5, clause by clause:

| Prescribed | Present in AC5 |
|---|---|
| MUST NOT enter the panel-discovery configured-provider set | Yes, named explicitly (`configuredProviderSet`) |
| MUST NOT appear in `core.run.discovered_panel` | Yes |
| MUST NOT be selected as an authoring or reviewing maker for product runs | Yes |
| MUST NOT change `agent_count` or the structural-ceiling basis | Yes, `agent_count` and `envelopeBasis` (panel-size input) both named |
| QA test: identical panel membership and `agent_count`, configured-and-healthy vs absent | Yes, verbatim in substance — a **differential** test against an otherwise identical control run |
| If the shared register is genuinely the only mechanism, escalate as an FR-8.0-class change rather than enrolling by default | Yes, as a parenthetical routing clause |

The behavioral clauses are stated **mechanism-agnostically** ("MUST NOT be selected as an
authoring or reviewing maker for product runs"), which is the right shape: it binds the
outcome, not one code path, so a future wiring route cannot satisfy the letter while
breaking the intent.

### 2b. The mechanism facts added to FR-0.6(1) are accurate

Re-verified each against the source, not against my own round-2 notes:

- "flat list of `{ providerRef, adapterKind, maker }` with **no purpose/role field**
  (`packages/critique` `readDeploymentMakerCapability`)" — correct; the entry validator
  accepts exactly those three string fields and rejects anything incomplete
  (`packages/critique/src/index.ts:245-292`).
- "`resolveDiscoveredPanel` probes exactly those provider refs into live panel members" —
  correct (`apps/api/src/main.ts:43-56`, `probes.readLatest(configuredProviders.map(...))`).
- "`agent_count = jsonb_array_length(discovered_panel)` (`migrations/0022`)" — correct
  (`0022_dr181_discovery.sql:24-33`).
- "`selectDifferentMakerReviewer` draws reviewers from configured makers" — correct in
  substance (`apps/runner/src/index.ts:114-126`), with a nuance in the evaluator's favour;
  see 2c.

### 2c. The fix is stronger than the document claims (verified this round)

At round 2 I flagged reviewer selection as a *second* exposure and could not confirm
whether it was independently reachable. I chased it down this round:

- The runner's `#configuredMakers` is built from injected settings — `providerRef`/`maker`,
  `critique`, and `additionalMakers` (`apps/runner/src/index.ts:657-665`) — i.e. a wiring
  route that does not pass through the register row.
- But the array actually handed to `selectDifferentMakerReviewer`
  (`apps/runner/src/index.ts:1359`) is the **local** `configuredMakers` assembled at
  claim time by iterating `run.discoveredPanel` and keeping only members that are both
  configured and healthy (`:833-887`).

So a maker that never enters `discovered_panel` can neither author a root nor be drawn as
a reviewer. **Panel discovery is the single choke point**, which means AC5's first clause
closes the entire surface — authoring, reviewing, `agent_count`, and the envelope basis —
not merely the symptom I named. The document's phrasing ("draws reviewers from configured
makers") slightly understates this; the reality makes the constraint tighter, not looser,
so it is a wording simplification rather than an error.

### 2d. Open question 12 (reviewer B's NB2-2) is well-formed

FR-0.6 creates in-scope build work with no charted wayfinder ticket. OQ12 routes the
choice (new ticket vs fold into ticket 02) to the orchestrator and — the part that
matters — instructs workers not to invent ticket numbers **and not to skip the
panel-isolation constraint while waiting**. That prevents the fix from being lost in the
gap between requirements and ticketing, which is exactly where a constraint like AC5
would otherwise evaporate.

---

## 3. Residual non-blocking notes

None of these blocks the stage; recording them so architecture inherits them.

1. **Maker-string naming not added.** My round-2 note suggested naming the maker identity
   the evaluator's local family would carry, since every different-maker guard compares on
   it (`selectDifferentMakerReviewer`, migration 0019's trigger, FR-0.7 AC2). AC5 makes
   this less urgent — the model never enters the panel, so the guards never see it — but
   architecture should still pin the string when it stands up FR-0.6 rather than letting
   it collide with an existing `maker:` value.
2. **The ticket matrix pre-empts OQ12.** The ticket table already lists FR-0.6 under
   ticket 02 ("Module skeleton + boundary + switch"), while OQ12 says the orchestrator
   decides between folding into 02 and opening a new ticket. Harmless, but the matrix
   should say "02 (pending OQ12)" or the open question should acknowledge 02 as the
   provisional home.
3. **FR-0.1's wording is still data-scoped.** It binds "evaluator-derived **data**"; C1 was
   a configuration-shaped influence, now caught by FR-0.6 AC5 where the risk lives.
   Generalizing FR-0.1 to cover configuration-shaped influence would be belt-and-braces;
   I do not consider it required, and would rather see the specific, testable AC than a
   broadened invariant nobody can execute.
4. **Round-2 nits persist and remain non-blocking:** FR-1.3's "SHALL ... (preferred
   default)" modality; FR-1.3 AC3's circular parenthetical; the cross-schema REFERENCES
   grant implied by FR-3.0's settlement link (ticket 02's boundary contract covers grants
   per FR-10.1 AC1).

---

## 4. Axis summary (final)

| Axis | Result |
|---|---|
| 1. Ruling fidelity | **Pass** — all 11 rulings expanded; rulings 4 and 8 carry their collisions openly; ruling 11's dark-launch is a hard requirement, now with a configuration-shaped leak closed. |
| 2. Testability | **Pass** — the previously unexecutable ACs are executable; AC5 adds a differential test a QA agent can run directly against the V3 stack. |
| 3. Foundation fit | **Pass** — every schema and code claim I checked across three rounds is now accurate and correctly cited; the last unguarded side effect is guarded. |
| 4. Boundary hygiene | **Pass** — Out-of-scope and deferral tables unchanged and still faithful; nothing smuggled in by the round-2 fix. |
| 5. Stranger test | **Pass** — header definitions, per-FR citations, 12 routed open questions. |

Three-round tally from this seat: round 1 — 5 blocking, 6 non-blocking; round 2 — all 5
resolved, all 6 closed, 1 new blocking; round 3 — that one resolved, 4 non-blocking notes
carried forward. Nothing outstanding blocks Hermes stage review from my seat.

---

REVIEW VERDICT: PASS
