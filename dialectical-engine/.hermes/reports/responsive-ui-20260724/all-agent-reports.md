# All-Agent Reports — responsive-ui-20260724 (per loop, agents' own words)

18 self-reports filed. Below: each seat's own account, grouped by loop, with
"what fought me" preserved verbatim-in-substance. Raw files:
`.hermes/reports/responsive-ui-20260724/agent-reports/`.

**Coverage gap, stated up front:** the self-report law was added mid-mission
(2026-07-26, after the parallel block was underway). Seats that finished
before it have no report: Codex S2, S1b, S4, S5, S6 and the integration node;
Grok G3 plan-reviewer and G5 slicer; Hermes's S1a/S2/S1b gates and its S4
product-truth lens; Claude's H6A checker. Their findings live in the verdict
chain, but not in their own voice. **These can still be collected — every
session is resumable.**

---

## ARCHITECTURE loop (Claude + Grok)

### C2 planner (Claude) — 4 review rounds
**Went well:** "the file:line evidence discipline paid for itself every round —
reviewers could verify instead of argue." Zero contested findings across four
rounds because it re-verified every reviewer claim before reacting.
**What fought it (self-owned):** "my round-0 audit had a self-inflicted blind
spot — my find matched only *.tsx/*.ts/*.css, missed 43 .mjs test files, and I
built the entire TDD strategy on 'zero test infrastructure.'" Same class of
error: designed the fit clamp "without doing the arithmetic my own audit had
already written down."
**What fought it (process):** "the mid-flight pinch flip was the expensive part
— round 1 and 2 both spent effort on a contract that a single crisp
requirements question at H0 would have settled." Also: "the misclick-then-void
detour shows the V-question surface needs answers to be confirmable, not
one-tap."
**Would change:** binary intake rulings on any requirement that changes an
acceptance gate; a "negatives audit" appendix (every "X does not exist" claim
with the command that proved it); gesture contracts planned at
event-ownership level from draft 1; collision arithmetic at the narrowest cell
up front.

### C4 consolidator (Claude)
**Went well:** clean r4 input; grep fidelity passes written from the upstream
doc, not from its own output.
**What fought it:** "Rework scars are not just tags — they are prose tense."
Deciding scar vs. load-bearing honesty was the real work (it kept refuted-path
statements "because implementers need to know what NOT to try"). Found the
`--token-dock-clearance` 58px-vs-114px contradiction that **three review rounds
looked past** — "neither reviewer flagged it because each value is locally
coherent." Section renumbering risked silent cross-reference defects; a 25k
Read cap truncated the plan mid-table and "the truncation banner saved me, not
my own diligence."
**Would change:** give C4 a machine-checkable must-survive manifest from the
verdicts; make prose-vs-variable contradictions an explicit C2 exit check;
specify what to do when a contradiction has no clear later-verdict winner
(its answer: CLAUDE BLOCKED).

### Grok — architecture conformance pass (closure)
Verified sizer×scale, gestureOwner, native passive:false, pointer-intent
matrix, 3-mode fitPolicy, collision vars defined once, import-only hub,
viewportFit cover. Negative greps clean (no sticky-ancestor transform, no
portals, no state libraries). **Verdict: SATISFIED, zero drift items.**

---

## PROGRAMMING loop (Codex)

### S1a — CSS partition (the saga lane)
**Went well:** byte-identical proof (67,946 bytes; identical build asset
hashes); "honest failure reporting mattered: when the required suite exposed
the scoring-specification mismatch, I stopped instead of changing forbidden
scoring files or presenting the run as green."
**What fought it:** "the first environment lacked the Windows sandbox setup
executable, so apparently successful orchestration could not create the
approved worktree, branch, edits, or commit… this made my earlier completion
claim look fabricated." On the retraction: "That fabrication suspicion was
understandable from the missing artifacts, but later environment evidence
explained the failure and the orchestrator correctly retracted it rather than
preserving a false accusation." Then: stdin transport failure (packet may never
have arrived), partial node_modules, pnpm rejecting Sharp's build script, an
out-of-contract `pnpm-workspace.yaml` the scope audit caught, Windows CRLF
breaking the byte-identity proof until `git cat-file --filters`.
**Would change:** "a mandatory lane preflight receipt — sandbox executable
present, .git writable, Hermes DB writable, approved worktree visible, correct
branch, and a real test comment round-trip"; make completion "mechanically
impossible without printing git worktree list, clean lane status, commit SHA,
and successful ticket-comment receipt."

### S3 — debate chrome (3 rework rounds, most-hit lane)
**Went well:** stopped on unexplained v3 residue "instead of adopting or
destroying another worker's files"; the rewritten contract failed for the
intended reasons; the heavy semaphore prevented sibling collisions.
**What fought it:** "the killed v3 fan-out left plausible S3 files with no
trustworthy continuity or ownership record"; DebatePageClient's many regex
consumers; **"the first lane pass satisfied the specified phone widths but
missed the 568x320 short-landscape height constraint"**; header + scoring
summary + dock clearance "combined to collapse the selected view to 7–9px";
900-second claim leases expiring during multi-engine gates; the compaction-law
dispute that "temporarily rejected valid work because transport type had not
been recorded up front."
**Would change:** "add a standard short-landscape viewport row to the
responsive acceptance matrix **before any lane begins**"; centralize geometry
and pointer hit-test assertions instead of discovering them at S8; record
transport classification in the initial claim; one repo helper wrapping
heavy-lock acquire/release/evidence.

### S7 — overlays
**Went well:** precise contract; isolated test root; browser geometry made
clipping concrete; approved collision variables sufficed without touching
their owner file.
**What fought it:** ESM CSS loader failing under Playwright's CommonJS
transform; "the shell policy rejected the prescribed recursive semaphore
cleanup"; "the 15-minute Hermes claim lease expired during serialized gates,
which returned the card to ready."
**Would change:** a blessed exit-code-preserving semaphore helper; claim TTLs
set from the expected gate budget or auto-renewed; a shared CSS-loading
fixture; "persist a top-chrome collision variable so toast placement does not
couple to S3's 104px minimum by literal" — **this is precisely the coupling
that later produced defect F-05.**

### S8 — evidence closure (the QA lane)
Ran 32 projects across Chromium/Firefox/WebKit widths, short-heights, device
profiles; all five routes, AuthGate states, lifecycle, views, zoom, scoring,
overlays, collision union, text breaks, safe-area structure. 31+5 screenshots,
traces retained. Routed every defect to its owning slice (F-01→S6, F-02→S3,
F-03→S4, F-04→S5) and **marked every real-device row BLOCKED-ESCALATED rather
than approximating it.** Final: 199/199 applicable cells; "S8's lane diff
contains no product-code edits."

---

## QA loop (Hermes + Grok)

### Hermes gates — S3, S5, S6, S7, S4-merge, fix-gates
Every gate re-ran the suites itself rather than trusting worker claims;
every one recorded lock acquisition and verified release; none edited product
files. Highlights in its own words:
- **S3 gate (the one it failed):** product diff green, but "no CODEX
  COMPACTION CHECKPOINT exists between READY FOR PEER REVIEW and Grok peer
  review… the Grok review transport is undeclared." (Resolved by the
  EXEC-EXEMPT transport ruling — now spine law.)
- **S4 diamond merge:** live re-verification of its own finding — "after
  settlement, every sticky ancestor computed transform was none… canvas
  scrollTop 0→140 while sticky top stayed fixed (delta 0px)… entrance
  animation still visibly ran, then cleared." Servers killed, ports verified
  down.
- **What fought it, twice:** "the ticket lived on the debateai-responsive-ui
  board, not the default board, so initial lookup failed" — and an unrelated
  Next.js multi-lockfile warning adding noise to every run.
- **Would change:** "put the authoritative board slug directly in every gate
  launch packet"; "standardize a checked-in gate wrapper that acquires the
  semaphore, records exit codes, and guarantees release"; keep the explicit
  no-promotion reminder "because parallel-parent fan-in is easy to mishandle
  during a green streak."

### Grok peer reviews — S3, S6, S7
Each verified contract scope by exact path list, checked collision variables
were consumed-not-redefined, and re-ran suites independently.
- **S3 peer** flagged its own process error honestly: "a concurrent heavy.lock
  reappeared… Peer briefly force-removed it while verifying release — process
  error if that lock belonged to another lane… Subsequent peers should only
  rmdir locks they created."
- **Recurring ask across all three:** "peer procedure should mandate an
  independent RED replay on the parent commit… that would harden theater
  detection" — i.e. reviewers want to re-prove the RED themselves, not accept
  the worker's narrative.
- **S7 peer:** "locating the mission heavy.lock path took archaeology through
  prior peer session logs" → put the absolute lock path in every packet. Also
  independently recommended pinning toast to a chrome token instead of the
  literal 104px (**same latent defect S7's worker named; nobody acted before
  F-05 hit**).

### Grok S4 lens — correctness/tests
Attacked the whole gesture architecture; approved with four non-blocking
residuals recorded for future rework: missing `releasePointerCapture` on
gesturestart, no focal-scroll assertion for WebKit+touches, canvas aria-label
gap, "didPan sticky until next click."

### Claude S4 lens — security/data-safety
"Blob-hash comparison made the forbidden-file check trivial and conclusive."
Proved RED wasn't fabricated three independent ways (structural imports,
mtimes, byte-diff against archived v3 residue).
**What fought it:** "the stale-residue question is not answerable from git
alone since the residue was never tracked… If that archive had been deleted
instead of kept, the 'not reused' claim would have been unverifiable."
**Would change:** "mandate that BLOCKED resolutions land on the board even when
V resolves them verbally"; ask high-tier workers to commit REDs separately
from GREEN.

---

## Cross-cutting patterns (what the agents agree on)

1. **Short-height was everyone's blind spot.** S3: add short-landscape rows
   "before any lane begins." Three separate defects (F-02, F-04, F-05) lived
   at 568×320.
2. **Two agents predicted F-05 and nobody acted.** S7's worker and S7's peer
   both said "pin toast to a collision token, not S3's literal 104px." The
   defect that later cost a whole extra round was written down in advance —
   **the harness has no mechanism to promote a non-blocking residual into a
   tracked risk.**
3. **Reviewers want to re-prove RED themselves** (all three Grok peers) —
   currently they accept the worker's RED narrative on medium tier.
4. **Infrastructure ergonomics cost real time repeatedly:** heavy-lock path
   discovery, board-slug discovery, claim-lease expiry during long gates,
   PowerShell/pnpm log noise, no shared gate wrapper.
5. **Honest blocking worked everywhere it mattered** — dirty worktrees, wrong
   session, done ticket, forbidden files, unverifiable evidence.
