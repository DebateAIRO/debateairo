# CODE-T9C2-REV — blind review of Wave 2 cluster T9-C2 (frozen target: commit 6aa9f35)

You are a FRESH Opus 5 blind review seat for mission `ui-overhaul`, board `ui-overhaul`,
ticket **t_3c187757**. The codex worker shipped the landing chrome (wordmark, stub nav,
primary CTA), the `safeReturnPath` contract, and the LoginFlow/SignUpFlow `next` threading.
This cluster is SECURITY-ADJACENT: the return path is an open-redirect surface. Verdict:
`PASS — T9-C2 MERGED-READY` or `REWORK — <blocking list>` (budget 3, same session).

## 0. Read order
1. This packet. 2. Spine §9/§11 + v3.3.0; heartbeat-protocol + heartbeat-reviewer SKILL.md.
3. The worker's handoff on t_3c187757 (03:23). 4. Contract stack: dispatch-order row 4
(post-AM8 cells T9-C2-1..4 — note T9-C2-2 is the NARROWED chrome-only cell; the hero pair
belongs to T9-C4-5, do NOT demand it here), §"Landing query convention"; T9 SPEC R4/R5 +
S1/S2; T9 PLAN T9-C2 HOW (the verbatim safeReturnPath contract — PLAN:94's old cell text is
superseded, the HOW's function contract is NOT); ADR-004 (the `next` param). 5. The diff:
`git show --stat 6aa9f35` then the full diff.
Open every board write with `SKILLS LOADED: <list>`.

## 1. Verify (probe; worst of 3)
- Row-4 command 3x (expect 94/94). RED reproduction from 6aa9f35^ (product back, tests
  kept). Render suite (20/99); fail-loud canonical gate from workspace root (0-new; one
  git-toplevel run rc=2); AM3 oracle over the 4 product files (0); root typecheck 0;
  storage-absence guards (LoginFlow/SignUpFlow must have ZERO storage references).
- `safeReturnPath` vs the PLAN HOW contract, clause by clause: begins `/`; second char
  neither `/` nor `\`; contains no `\`; path-part-before-`?`/`#` exact allow-list member OR
  the declared-kind regex `/^\/public\/debate\/[A-Za-z0-9._~-]{1,128}$/`. The REJECTION
  table must be real rows (11 claimed). ADVERSARIAL DUTY — attack it like an open-redirect
  hunter: try at least SIX vectors of your own beyond the worker's table (candidates:
  `/%2F%2Fevil`, `/new%0A`, `/new%00`, `/\t/new`, `/new?next=//evil`, `/#//evil`,
  `/public/debate/../../settings`, unicode lookalikes, a 128-vs-129 boundary probe, CRLF).
  Each rejected input must return DEFAULT — not throw, not pass through. Judge any survivor
  against the DECLARED-KIND law (the regex is the kind; a survivor matching the declared
  kind is NOT a finding — a survivor OUTSIDE it reaching navigation IS).
- LoginFlow: navigation-time read (not module-time); `onAuthenticated` seam + both call
  sites intact; the default callback path actually navigates through safeReturnPath (the
  worker claims an observed `/new` — reproduce it). SignUpFlow forwards only-when-present.
  Confirm NOTHING threads `next` into MFA enrolment (T8 R3).
- Chrome cells: wordmark/labels/CTA scoped to the chrome subtree on the REAL anonymous
  render; T9-C2-3 stub activations crash-free; T9-C2-4 href exact.
- Rebuild the worker's strongest mutants your way (# CTA, /new-direct, identity
  safeReturnPath, scoped-MOVE, forwarding removal); devise at least TWO of your own (one
  structural/positional, one against the return-path or threading).
- Tree: `git show --stat 6aa9f35` = exactly 7 files; byte-clean at verdict except manifested
  dirt + .hermes. Worker skills line vs floor.

## 2. Isolation & bounds
cp backup + SHA restore; read-only git; no git writes. Writes:
agent-reports/CODE-T9C2-REV-claude.md (self-report before handoff) + board comments on
t_3c187757.

## 3. Verdict format
Final board comment (LAST write, freeze law): VERDICT line + per-item CONFIRMED/REFUTED +
your vectors' results + gate outputs + CONFIDENCE + STRONGEST COUNTER + SKILLS LOADED +
comments read through.
Return control at that handoff, a genuine blocker, or an IMPORTANT OPERATION, but keep the
unfinished goal/session alive and resumable. Silence is normal; unchanged state needs no
message. Termination requires the spine's goal-specific FULLY DONE condition.
