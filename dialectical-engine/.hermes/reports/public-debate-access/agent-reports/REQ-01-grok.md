# REQ-01 self-report — Grok requirements seat (murder case)

Ticket `t_5c7a1e7f` · mission `public-debate-access` · 2026-08-29.

## What was delivered

- `docs/missions/public-debate-access/INSTRUCTIONS.md` — **62 lines** (cap 100).
- Four frozen SPECs + PLAN skeletons + empty PROGRESS + seeded DECISIONS:
  S01 envelope/publish · S02 public READ parity · S03 Your/Public nav ·
  S04 anonymous-exposure review.
- Board handoff posted on `t_5c7a1e7f` at `READY FOR PEER REVIEW`.

## Cause findings (priced)

### C1 — INTAKE saved a full re-measure pass
**Cause:** Prior missions burned tokens re-deriving live stack facts the Router
already probed. This packet forced INTAKE-first and forbade re-derivation.
**Price avoided:** ~20–40 min of live curl/UI probing + risk of contradicting
Router numbers (published total=1, anonymous 200s).
**Upgrade:** Keep INTAKE as a hard packet dependency on every REQUIREMENTS
dispatch. Make "re-derive INTAKE" an explicit defect against the seat.

### C2 — zsh / tooling traps nearly repeated
**Cause:** Packet §1 item 4 + TOOLING-TRAPS call out the Router's 3-probe zsh
word-split failure. This seat read the traps file before shell work.
**Price avoided:** ~3 false hypotheses / ~10 min (Router's measured cost).
**Upgrade:** Packet existence-guard on TOOLING-TRAPS is correct; keep it.

### C3 — "Full parity" vs security narrowing is the mission's landmine
**Cause:** V criterion 3 reverses the security mission's answer-only public
page, while architecture tests still forbid public inspection/ledger/events
and identity carriers. Owner honesty/export currently **depend** on ledger
digest (`apps/ui/lib/v3/answerExport.ts`); owner scoring loads authenticated
side channels.
**Near miss:** Specifying "same export as owner" without the label-honesty
rule would have forced a public ledger endpoint and picked a fight with S8.
**Price if missed:** full Architecture rework round (~1 day) + security
regression.
**Upgrade:** Router's READ-vs-mutation assumption belongs in the packet
(it was). Add one sentence: "owner export's ledger gate is not the public
export contract."

### C4 — Already-published ciphertext cannot grow a tree by schema alone
**Cause:** Frozen encrypted snapshots. Blast radius = 1 debate. Silent
optional-field back-compat ≠ product parity for that debate.
**Near miss:** Freezing "all public debates have trees" without a legacy
policy would strand Architecture between 404, lying UI, and inventing data.
**Price if missed:** V escalation mid-programming.
**Upgrade:** INTAKE already flagged it; SPEC R4 forbids silent outcomes and
defers HOW. Good. Put the confirm row on V DECISIONS PACKET before coding
if Architecture wants migrate-by-default.

### C5 — Brainstorming HARD-GATE vs non-interactive seat
**Cause:** `superpowers:brainstorming` requires human approval before
implementation. This seat produces requirements artifacts under a frozen
packet with V's Done criteria already ruled — no interactive V.
`ask_user_question` returned no user.
**Price:** ~2 min dead-end tool call.
**Upgrade:** Requirements packets should say explicitly: "V's brief +
criterion rulings in this packet ARE the brainstorming approval gate;
do not block on interactive ask." Or provide a board comment template for
design ratification when V is async.

### C6 — Decorrelation debt is real
**Cause:** Packet §9 — Architecture and SPEC reviewer are both Claude;
Router is Claude; Grok authors SPEC and also holds QA later (§2.1 stops
self-review of SPEC, but same-model Architecture↔Reviewer is prompt-only
decorrelation).
**Upgrade:** Prefer a non-Claude SPEC reviewer when Grok authored SPEC, or
force the reviewer packet to include an INTAKE-contradiction hunt checklist
that does not appear in the Router's proposed cut.

## What repeatedly costs tokens (this seat)

1. **Reading owner UI to bound "READ affordance"** — necessary; ~15 min.
   Dead end avoided: treating Challenge / investigation-record / memory-unlink
   as READ because they sit next to Honesty in the chrome.
2. **Confirming `PublicDebateSchema` vs `AnswerSchema` field gap** — necessary;
   one targeted read beat a repo wander.
3. **Looking for prior INSTRUCTIONS.md format precedent** — mostly waste;
   none existed under the new heartbeat-requirements shape. **Dead end:**
   do not search old missions for compass format; the skill IS the format.

## Packet defects (against the Router — wanted)

1. **No absolute path to the V DECISIONS PACKET confirm row** for the
   READ-vs-mutation assumption. Seat could not verify the row exists without
   hunting. Cost: low, but UNVERIFIED on "confirm row filed."
2. **Slice proposal said "anonymous-exposure review" without saying whether
   it is a code slice or a QA-only slice.** Resolved as S04 verification
   slice with a mission-close gate; Architecture may still quarrel.
3. **`web/` twin** appears in architecture tests but INTAKE says serving tree
   is `apps/ui`. Packet never says whether lockstep is in scope. Specs defer
   to Architecture; a one-liner in INTAKE would have removed the ambiguity.
4. **Claim workspace** (`~/.hermes/kanban/.../t_5c7a1e7f`) vs packet
   `allowed` paths under the repo — seat wrote to the repo (correct per
   packet). A confused seat could write SPECs into the scratch workspace.
   **Upgrade:** packet should say "claim workspace is scratch; mission docs
   live in repo allowed paths."

## Efficiency toward a one-prompt machine

- Keep INTAKE + TOOLING-TRAPS + absolute packet paths (this dispatch did).
- Add a **SPEC freeze checklist** appendix to the requirements skill:
  line-cap check · forbidden-words grep · SPEC↔PLAN heading coverage ·
  DECISIONS seed of every V ruling named in the packet · open HOW items
  explicitly deferred.
- Pre-create empty `slices/` and `agent-reports/` in Router intake so the
  seat does not mkdir.
- For this mission shape (UI parity reversing a security narrowing), ship a
  **parity inventory template** (control → READ/MUTATION → data source →
  public-safe?) so Architecture does not rediscover export-ledger coupling.

## Comments read through

ROUTER DISPATCH 2026-08-29T07:46Z · WORKER CLAIM (this seat).

## Rework round 1 — REV01-N2 / t_68386dd8

**Defect:** S02 SPEC v1 R6 and PLAN Architecture note framed scoring diagnostics
as a live owner-only authenticated load needing "public-safe projection vs
endpoint." That sent Architecture to design plumbing for data the owner UI
never receives.

**Evidence re-verified this seat:**
- `apps/ui/lib/api.ts`: `getDebateScoring` → `Promise.resolve(scoringUnavailable(id))`
  with DR-115 comment ("V3 has no per-node scoring resource").
- `grep -rn scoring apps/api/src/*.ts` → zero matches.

**Cause:** I inferred "live authenticated scoring" from owner UI chrome
(`DebatePageClient` scoring panels / diagnostics button) and from the Router's
READ-affordance list naming "scoring diagnostics," without tracing the load
function to its implementation. A UI surface that *looks* like a data panel
was treated as proof of a backend. The export/ledger coupling was probed; the
scoring stub was not.

**What would have caught it at spec time:** a mandatory "data source" column
on every READ affordance in the parity inventory (control → READ/MUTATION →
**exact loader symbol** → network or stub). Opening `getDebateScoring` once
would have collapsed R6 to typed-absence parity before freeze.

**Fix (scope unchanged):** archived `SPEC-v1.md`; issued `SPEC.md` v2 with
corrected R6; corrected PLAN Architecture note + S02-C4 + Boundaries;
appended DECISIONS citing `t_68386dd8`. Did not touch S01/S03/S04/INSTRUCTIONS
or product code.
