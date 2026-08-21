# PRE-12 · Grok independent peer review

| Field | Value |
|---|---|
| Ticket | `t_a66b0a21` — PRE-12 · DR-110 §12.3 DEFECT third cause (marks 23–24 explicitly OUT of scope) |
| Reviewer | Grok (independent peer lens under DR-101) |
| Variant | Claude-authored ticket; dual reviewers = Codex + Grok |
| Date | 2026-08-07 |
| Verdict | **APPROVED** |
| Scope under review | Surgical edit to `docs/founding/requirements-spec.md` §12.3 Home 2 row **14** (`DEFECT`) *Says* cell only + its dated edit note under the Home-2 table |
| Independence | Did **not** read any Codex verdict, any `reviews/pre-12-codex*` file, or any post-handoff ticket comment after the worker's `READY FOR PEER REVIEW` marker |
| Comments read through | `2026-08-07 09:42` `claude-worker`: `READY FOR PEER REVIEW` (row 14 ONLY) |

---

## Authority read (in order)

1. `.grok/skills/heartbeat-protocol/SKILL.md` — Grok reviewer = independent read-only peer; never reads the other diamond verdict.
2. Ticket body (`hermes kanban show t_a66b0a21`) through the worker handoff `READY FOR PEER REVIEW: … row 14 ONLY` — stopped there for review criteria.
3. **PROG ledger** `docs/missions/2026-08-06-v3-programming/decisions-ledger.md` **DR-110**:
   - **(1)** Marks 23–24 **NOT YET minted** — `UNVERIFIED-CITATION` and `CITATION-RECHECK-FAILED` may not surface until V authorizes §12.3 application.
   - **(2)** **Q-N5 AUTHORIZED**: DEFECT's third cause (Q51 provenance failure reaching COMPONENTS_ONLY) joins mark #14's row via PRE-12 — **scope excludes rows 23–24**.
4. **Founding ledger** `docs/founding/decisions-ledger.md`:
   - **DR-049** (FINAL): SERVE termination — `max_recompose = 2`; COMPONENTS-ONLY + visible DEFECT badge; gate order **R9 → Q53 → conformance → Q51**.
   - **DR-044** (FINAL): Q51 machine gates (locator gate, provenance join, reasoning-only downgrade — **blocking**) + text via serve composition.
5. Spec ground truth (working tree, judged only against pre-existing law):
   - **§12.1a** S-7 / S-9 (state table + fixtures)
   - **§12.2** Q51 blocking gates
   - **S-13** mint law under §12.3
   - **Home-3 row 5** (A-01 / PRE-08) as the authority-markup comparison case

Work product inspected:

- `git diff docs/founding/requirements-spec.md` — **only** the Home-2 row-14 *Says* change and the **2026-08-07** edit note under Home 2 judged. Other dirty hunks (§3.8 / §3.11 / §3.13 PRE-11; Home-3 row-5 A-01/PRE-08) **ignored** per ticket fence.
- Working-tree §12.3 Home 2 rows 1–22 + edit note; Home 3 left unread for substance beyond the A-01 authority-shape comparison.
- Independent grep of `docs/founding/` for `UNVERIFIED-CITATION` / `CITATION-RECHECK-FAILED`.

---

## What changed (row-14 region only)

**BEFORE (Says):**

> composition could not be conformed in two attempts, or the verdict failed its stranger check

**AFTER (Says):**

> composition could not be conformed in two attempts, the verdict failed its stranger check, or a Q51 provenance failure sent the answer to `COMPONENTS_ONLY`

**Raised by** cell: unchanged — `DR-049 · §12.1a`.

**Edit note — 2026-08-07** immediately under Home 2:

- Tag: `RULED(DR-049 · §12.1a S-7/S-9 · §12.2; placement authorized DR-110(2))`
- Blockquotes the superseded two-cause cell
- Grounds the third cause in S-7 / S-9 / §12.2
- Explicit no-mint + no-behaviour-change claim
- Names DR-110(2) placement authority and the rows-23–24 exclusion

---

## Red-team (ticket VERIFYs)

### (1) Third-cause wording vs S-7 — does a Q51 provenance failure actually route to `COMPONENTS_ONLY` and wear `DEFECT`? — **PASS**

S-7 state table (live, pre-existing law):

| State | Next |
|---|---|
| `PROVENANCE` — "Q51 gates run on the text that will ship" | **pass → `SERVE`; fail → `COMPONENTS_ONLY`** |
| `COMPONENTS_ONLY` | → `SERVE_DEGRADED`: verified facts + badges + node graph + **DEFECT badge** |

Chain under test:

1. Q51 gates fail on the text that will ship → `COMPONENTS_ONLY` (**S-7**, exact).
2. Every entry into `COMPONENTS_ONLY` → `SERVE_DEGRADED` **with a visible DEFECT badge** (**S-7**, exact).
3. S-9 independently names **"a Q51 provenance failure"** among the six terminals owed a fixture.
4. §26 SERVE-terminates fixture list repeats a Q51 provenance fail under **DR-049**.
5. S-8 forbids a blocked-and-silent terminal — so §12.2's "blocks serving" locator language cannot mean a silent refuse; it lands on the same degraded path.

The *Says* phrase **"a Q51 provenance failure sent the answer to `COMPONENTS_ONLY`"** claims **exactly** the S-7 `PROVENANCE fail → COMPONENTS_ONLY` edge. It does **not** claim a different badge, invent a new terminal, or assert that every Q51 *behaviour* (including the reasoning-only *downgrade* transform) is a fail. The fixture name S-9 already uses is "Q51 provenance failure"; the row reuses that name.

No more is claimed than the state machine rules. A provenance failure does **not** wear some other condition mark — the only badge this path attaches is DEFECT, via `COMPONENTS_ONLY` → `SERVE_DEGRADED`.

**Probe defeated:** "Does 'sent to COMPONENTS_ONLY' understate the badge?" No — the row *is* the DEFECT row; COMPONENTS_ONLY is the intermediate state that *always* carries DEFECT. The edit note states the full chain.

### (2) Raised-by stays `DR-049 · §12.1a` — honest, or does the third cause need dual authority like Home-3 row 5? — **PASS (keep DR-049)**

**Home-3 row 5 shape (comparison):** a *new table membership* for a route whose **semantic authority is DR-037** and whose **placement** was authorized by **DR-099 / A-01**. Raised-by therefore carries both:

`Q10 · §5.2 · **authority: DR-037** …; **placed here by DR-099 / amendment A-01**`

**PRE-12 shape (this edit):** not a new membership. Mark #14 `DEFECT` already exists under DR-049. The third cause is already inside DR-049's own state machine (S-7 `PROVENANCE` fail edge; S-9 fixture). DR-110(2) is **placement authorization** ("joins mark #14's row"), not a competing semantic authority for the mark or the cause.

| Cause | Semantic home | Badge law |
|---|---|---|
| two conformance failures | DR-049 S-7 | COMPONENTS_ONLY → DEFECT |
| verdict stranger (R9) fail | DR-049 / S-4a (DR-057 completes under DR-049's terminal) | components-only + DEFECT |
| Q51 provenance failure | DR-049 S-7 (+ DR-044 supplies what the Q51 gates *are*) | COMPONENTS_ONLY → DEFECT |

DR-044 is correctly cited in the **edit note** for the blocking-gate inventory; it does not re-home the DEFECT mark. Keeping Raised-by at `DR-049 · §12.1a` for all three causes is **honest**. Placement authority DR-110(2) lives in the dated note — the A-01 pattern of *authority vs placement* split — without forcing a Home-3-style dual cell on an *already-placed* mark whose authority never moved.

### (3) THE FENCE — `UNVERIFIED-CITATION` / `CITATION-RECHECK-FAILED` zero hits in founding (DR-110(1)) — **PASS**

Independent checks:

```text
grep UNVERIFIED-CITATION|CITATION-RECHECK-FAILED|CITATION-WITHDRAWN docs/founding/
→ No matches (exit 1)

Home 2 membership still ends at row 22 `MISSING-NUMBER`
→ No row 23, no row 24

PRE-12 edit region (row 14 Says + Home-2 edit note)
→ Neither draft mark name appears
```

DR-110(1) NOT YET is intact. Scope exclusion of rows 23–24 is observed in the product of the edit, not only asserted in the note.

### (4) No-mint claim — placing a cause under an existing mark is not a state mint under S-13 — **PASS**

**S-13** (`RULED(DR-051)`): a new **typed state** may not be minted without placement in this table; this table is the only mint site; an unplaced state is a specification defect.

What PRE-12 does:

- Does **not** add a new Home-2 row
- Does **not** rename or re-home mark #14
- Expands the **Says** (cause catalogue) of an **already-minted** mark whose wear-paths were already ruled in §12.1a

A *cause* in the Says column is not a typed state. The typed state is `DEFECT`. Documenting a third already-ruled trigger for when that mark is worn is catalogue completion under S-13, not minting. Parallel: A-01 *placed* an already-ruled Home-3 member without minting; PRE-12 does not even place a new member — it only completes the cause list for a member that was already home.

The note's claim — *"This edit mints no new typed state and changes no behaviour — it places an already-ruled cause under S-13, on DR-049's authority"* — is therefore correct. DR-110(2) authorizes the *writing* of that cause into the row; it does not mint.

---

## Scope / surgical-discipline checks

| Check | Result |
|---|---|
| Only row 14 *Says* + Home-2 edit note authored under this ticket | **PASS** — judged region matches ticket AFTER verbatim |
| Raised-by unchanged | **PASS** |
| Rows 15–22 byte-stable in this hunk | **PASS** (row 22 still terminates the table) |
| Other dirty hunks in the same file (PRE-11 §3.x; PRE-08 Home-3 row 5) | **Out of scope** — not judged, not used as evidence for or against PRE-12 |
| A-01/PRE-08 house shape (blockquote superseded text + dated RULED note + no-mint sentence) | **Met** |
| DR-110(2) quote in note matches PROG ledger | **PASS** (sense-identical; ledger: *"DEFECT's third cause (Q51 provenance failure reaching COMPONENTS_ONLY) joins mark #14's row"*) |

---

## Findings

**Blocking findings:** none.

**Non-blocking observations (not CHANGES REQUESTED):**

1. The edit note cites all three Q51 §12.2 gates (join / locator / reasoning-only) as *blocking* support. That is true under DR-044 / §12.2. A pedantic reader might wonder whether the *reasoning-only downgrade* (a transform) is itself a `PROVENANCE fail → COMPONENTS_ONLY` edge. The **Says** cell does not make that claim — it uses S-9's fixture name "Q51 provenance failure" — so this is not a defect of the row. No action required under PRE-12's scope.
2. Home-3 row 5's dual-authority cell remains the right shape *for new memberships with split authority*; PRE-12 correctly did not copy that shape onto an already-home mark.

---

## Verdict

All four red-team probes pass. The third cause claims exactly S-7's `PROVENANCE fail → COMPONENTS_ONLY` path and correctly wears DEFECT (not some other badge); Raised-by stays honestly at DR-049 with DR-110(2) as placement authorization in the note; the DR-110(1) fence is clean (zero founding hits; table still ends at 22); and expanding Says under an existing mark is not an S-13 mint.

**GROK REVIEW: APPROVED**
