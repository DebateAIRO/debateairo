# CODE-REV-CROSS-03 r2 — MEASURED FIRST (written BEFORE any author claim was opened, COMMON §10.52)

Worktree `.worktrees/rev-cross-03-r2/dialectical-engine` @ `4cc0f4b6`, `git status --porcelain` = 0
at CLAIM, after every mutant and at this moment. `pnpm run generate:contract` exit 0.

NOT YET OPENED at the time of writing: `t_ed4c5e73` (any comment), the author's self-report,
`S02/DECISIONS.md:217-219`, `TOOLING-TRAPS.md:2816-2880`, `BASELINE-CLAIMED.md`.
OPENED, because the packet's own read-FIRST list ordered it: the review package
`CROSS-03-r2.diff` — which CONTAINS ADR-0022:211-257 verbatim, the range the same list says to
skip (packet finding P2 below).

## 1. B1 — DISCHARGED

Shipped predicate, `apps/ui/components/consent/modalSemantics.ts:210`:

    if (container === topContainer || !topContainer.contains(container)) continue;

One sentence: **a lower entry replaces the incumbent only when its container is a STRICT
descendant of the incumbent's — `Node.contains` AND not the same node.**

r1 probe `code-rev-cross-03-r1-reflexive-contains.probe.test.tsx`, md5
`8c8e33921e4450abee53b8dd1f0f978d` (byte-identical to the promoted file), run BYTE-UNTOUCHED
through my own scratchpad `--config`, THREE runs, identical:

    === RUN 1/2/3 exit=0 HEAD=4cc0f4b6 ===
     Test Files  1 passed (1)
          Tests  6 passed (6)
    P3 RESULT firstClose=0 secondClose=1
    P4 RESULT closed=["c"]
    P6 RESULT closed=["inner"]

Mutant M1 (identity term removed, `cp` snapshot / `cp` restore / `diff -q`):

    M1-IDENTITY-TERM-REMOVED | exit=1 | CAUGHT | plant-landed=True restore-ok=True
       Test Files  1 failed (1)
       Tests  2 failed | 4 passed (6)
       FAIL ... > P3 THE QUESTION — two surfaces SHARING one container node: which onClose runs?
       FAIL ... > P4 THE QUESTION, three deep — three surfaces sharing ONE container node

Both directions match the packet's constants exactly (`6 passed (6)` at HEAD, `2 failed | 4
passed (6)` with the term removed).

## 2. The CLASS — every member measured

| member | at 4cc0f4b6 | verdict |
|---|---|---|
| `modalSemantics.ts:210` predicate | `container === topContainer \|\| !topContainer.contains(container)` | STRICT |
| helper doc comment `:150-162` | "a STRICT DESCENDANT of the incumbent's … AND the two are not the SAME node"; "With the identity term, every replacement IS strictly deeper" | corrected |
| pass-2 comment `:208-209` | "STRICT descendant: `Node.contains` is reflexive…" | corrected |
| pass-1 null comment `:195-196` | "nothing can be a strict descendant of it" | corrected |
| `CookieConsent.tsx:197-200` | "one surface's container is a STRICT DESCENDANT of the other's — two surfaces holding the SAME container node are not nested either way" | corrected |
| ADR-0022 `:211-257` correction addendum | strict; THREE named; later-commit case green either way | corrected (see §3) |
| `S02/DECISIONS.md` rows | DEFERRED to the appendix step by the packet's read-FIRST clause | see appendix |

Stale-wording sweep over the tracked tree (`grep -rn` over `apps docs tests`):
`descendant-or-self` → **0** hits anywhere. `Pinned by four` → **2** hits, both lawful:
`ADR-0022:191` is the superseded (b′) addendum (ADR law: never edit earlier text) and
`ADR-0022:241` is the correction quoting it in order to correct it.
A THIRD "four cases" at `ADR-0022:119` belongs to the **focus-return** addendum, a different
decision — see N1 below.

## 3. N1 — the ADR's pin count, verified by the mutant that establishes it

Mutant M2 (the whole (b′) pass-2 loop disabled) against
`consent-modal-semantics.test.tsx` + `consent-cross-slice.test.tsx`:

    M2-NO-TIEBREAK | exit=1 | CAUGHT | plant-landed=True restore-ok=True
       Test Files  1 failed | 1 passed (2)
       Tests  3 failed | 32 passed (35)
       FAIL ... > delivers one Escape to the nested INNER surface of a pair mounted in ONE commit
       FAIL ... > delivers one Escape to exactly one of three surfaces, and it is the innermost
       FAIL ... > traps Tab in the same surface Escape reaches, for the same nested pair

EXACTLY THREE, and they are byte-for-byte the three the ADR correction names. The fourth
("a nested inner surface that opened in a LATER commit") is NOT in the red list — green either
way, exactly as the correction says. N1 discharged.

## 4. N2 — kept, with a proof; the proof is CORRECT

`modalSemantics.ts:207` keeps `container === null || !container.isConnected`, and `:200-207`
carries the unreachability proof. Checked against the NEW predicate (the proof had to be
re-derived, because the line it defers to changed): pass 2 runs only while `topContainer !==
null`; pass 1 selected a `null`-or-connected container, so a non-null `topContainer` is
connected; every inclusive descendant of a connected element is connected; therefore a
disconnected `container` is neither `=== topContainer` (which is connected) nor contained by it,
so line `:210` `continue`s anyway. The proof holds under the strict predicate.

Mutant M3 (the `!container.isConnected` disjunct removed):

    M3-N2-DISJUNCT-REMOVED | exit=0 | SURVIVED | plant-landed=True restore-ok=True
       Test Files  2 passed (2)
       Tests  35 passed (35)

Unchanged from r1's M6 — consistent with unreachability, and the comment says so.

## 5. The two new cases — base-RED replayed, and the deeper one is not a duplicate

HEAD's test file against **4ef2f7d3's helper** (`git show` + `cp` swap, restored by `cp`):

    === BASE-RED REPLAY exit=1 ===
     Test Files  1 failed (1)
          Tests  2 failed | 26 passed (28)
     FAIL ... > delivers one Escape to the LAST-OPENED of two surfaces that SHARE one container node
     FAIL ... > delivers one Escape to the LAST-OPENED of three surfaces that SHARE one container node
       -> the surface opened LAST answers Escape: expected "vi.fn()" to be called 1 times, but got 0 times
       -> exactly one onClose runs, and it is the last-opened surface: expected [ 'a' ] to deeply equal [ 'c' ]

Both cases RED at the base helper. The three-sharer frame is `['a']` — the EARLIEST-registered —
which is the r1 measurement reproduced independently.

Mutant M4 (identity term removed) against the SHIPPED suite: `2 failed | 33 passed (35)`, the
two new cases and nothing else.

Mutant M5b — the identity guard applied ONLY on the first pass-2 iteration (the exact fix the
test comment claims only the three-sharer case can red):

    exit=1   Tests  1 failed | 27 passed (28)
     FAIL ... > delivers one Escape to the LAST-OPENED of three surfaces that SHARE one container node

The pair case stays green; only the three-sharer case reds. **The test file's claim is measured
and correct — the deeper case is not a duplicate.**
(Note against myself: my first attempt at M5 changed only an unused local and was a NO-OP that
printed `SURVIVED`; TOOLING-TRAPS `:1682`/`:1520`. Re-planted properly above.)

## 6. RULING on the declined `Tab` assertion — the author is RIGHT, and it is now measured

`trapTab` (`modalSemantics.ts:119-136`) uses the entry for exactly one thing:
`focusableWithin(entry.read().containerRef.current)` at `:120`. Nothing else in the Tab path
reads the entry.

My own probe (`code-rev-cross-03-r2-tab-discrimination.probe.test.tsx`, written from the CLAIM,
MODELS/DOES NOT MODEL header included) walks EVERY starting position — each control, a control
outside the surface, and no focus at all — forwards and backwards, for a shared-container pair
whose two surfaces are given DIFFERENT `initialFocusRef` targets:

    T1 TAB TRANSCRIPT (shared container)
    start=close-first shift=false -> close-second
    start=close-first shift=true -> close-second
    start=close-second shift=false -> close-first
    start=close-second shift=true -> close-first
    start=outside shift=false -> close-first
    start=outside shift=true -> close-second
    start=nothing shift=false -> close-first
    start=nothing shift=true -> close-second

Run again with the identity term removed: `diff` of the two transcripts is **EMPTY**. A `Tab`
assertion on a shared-container pair cannot discriminate the tiebreak in either direction.
Control T2 (a genuinely NESTED pair, where the candidate lists differ) behaves differently
(`Tab from close-inner -> close-inner`), which is the shape the shipped nested-pair Tab case
pins and which M2 reds.

**The case body's note is accurate as written.** The packet's order at
`CODE-CROSS-03-REWORK-R1.md:21` ("→ the last-opened answers `Escape` **and traps Tab**") is the
defect, not the author's refusal (packet finding P1).

## 7. Nothing else moved

* `git diff --name-only 4ef2f7d3..HEAD` → **4** files, exactly the four in the packet's stat;
  `--stat` = **230 insertions(+), 9 deletions(-)**; ONE commit `4cc0f4b6`.
* Blob-hash equality (`git rev-parse <rev>:<path>`, which fails LOUDLY on a wrong path):
  `consent-cross-slice.test.tsx`, `consent-card.test.tsx`, `consent-guards.test.tsx`,
  `consent-policy-link.test.tsx`, `CookiePreferencesCard.tsx`, `CookieBar.tsx`,
  `PrivacyPolicyModal.tsx`, `apps/ui/app/globals.css` — all **SAME**.
  `globals.css` untouched, so the block discipline is unchanged by construction.
* No-touch surfaces: the full `--name-only` list (no pathspec, then grepped — TRAPS `:1580`)
  contains no `apps/api`, `packages/`, `migrations/`, `tools/`, `apps/runner`, `apps/scheduler`,
  `tests/integration`, `BASELINE.md`, `PROGRESS.md` path.
* Registration request: `git diff 4ef2f7d3..HEAD | grep -E 'register\(|adult_affirmed|privacy_accepted'`
  → **zero hits**.
* Semantics suite, `it()`-block structural diff (md5 per case): base **26**, head **28**;
  **2 ADDED, 0 REMOVED, 0 CHANGED-IN-PLACE, 26 of 26 pre-existing cases BYTE-IDENTICAL**.
  Prologue delta: one `useEffect` import + the new `SharedContainerSurface` helper. Nothing else.
* Exported contract: declaration emit for both revisions (`--ignoreConfig`, TRAPS `:2616`; the
  `TS2307` on `react` is expected and harmless) — `diff base-out/modalSemantics.d.ts
  head-out/modalSemantics.d.ts` is **EMPTY**. Same five members, `ModalSurface` body identical.
* Commit trailer is the harness's (COMMON §10.63) — not a finding.

## 8. Gates — ×3 from a `.sh` under `/bin/bash`, all three runs BYTE-IDENTICAL (md5 `8a3cb6fc98ae5fa71b52e71732ebf847`), commit `4cc0f4b6`

    ### lane=…/.worktrees/rev-cross-03-r2/dialectical-engine  HEAD=4cc0f4b6  dirty=0
    ### grep: grep (BSD grep, GNU compatible) 2.6.0-FreeBSD
    S01-C6 verdict=0   summary:      Tests  14 passed (14)  files: Test Files  1 passed (1)   S02-files: ref resolved 0, commits in 4cc0f4b6…..HEAD touching them: 0, working-tree diff: 'none'   tsc ran: 1 exit 1, outside the pin: 0
    S01-C7 verdict=0   summary:      Tests  76 passed (76)  files: Test Files  6 passed (6)   hit-list: 1 (pinned: 1)  t9 failures: 2  S01 css blocks: 1   tsc ran: 1 exit 1, outside the pin: 0
     Test Files  1 failed (1)
          Tests  2 failed | 7 passed (9)
     FAIL  tests/unit/t9-mode-tokens.test.ts > T9-C3 … > renders one accessible toggle that reads the document mode, flips it, and persists it
     FAIL  tests/unit/t9-mode-tokens.test.ts > T9-C3 … > leaves no mode-inert colour literal in the four Wave-0 product files
        HIT +   "…/apps/ui/app/globals.css:6116:background: color-mix(in srgb, #0a0806 32%, transparent);",
    S02-C9 | vt=0 guard=0 VERDICT=0 |       Tests  114 passed (114) |  Test Files  10 passed (10)
    S02-C9 | mergeArms: --scrim:=1 (expect 2)  S02markers=1 (expect 2)
    run_c9 VERDICT=1
    SET exit=0
     Test Files  17 passed (17)
          Tests  197 passed (197)
    PAIR | vt=0 guard=0 VERDICT=0 |       Tests  35 passed (35) |  Test Files  2 passed (2)
    GUARDS | vt=0 guard=0 VERDICT=0 |       Tests  32 passed (32) |  Test Files  3 passed (3)
    apps/ui tsc exit=0  diagnostics=0
    ### final dirty=0

Deltas: consent SET **195 → 197** (the two new `it()`s, measured not predicted);
`run_c9` vitest half **112 → 114**; the pair **33 → 35** (so the work packet's "35/35 or 34/34"
resolves to **35/35**, because both new cases are new `it()`s — COMMON §10.42/§10.138);
everything else at pin. `run_c9`'s overall `VERDICT=1` is entirely its two known-false merge
arms (`t_4f97ca86`) and is unchanged by this commit, which touches no CSS.

INLINE arm (the guard's own terms typed into the tool call, where `grep` is `ugrep 7.8.4` —
TRAPS `:2587`; `zsh script.sh` is NOT the inline arm):

    term1 (anchored Tests N passed) -> 0   GOOD -> 0   BAD zero-count -> 1   BAD title-pollution -> 1
    term2 (summary contains 'failed') -> 1 (absent)    fires on a failing summary -> 0
    term3 (Test Files 2 passed (2))  -> 0   GOOD -> 0   BAD "1 passed (1)" -> 1
    t9 hit-list term                 -> GOOD 1, BAD 0

Every term satisfiable in both directions; the two shells agree. `gates.sh` carries no
glyph-placeholder idiom and no non-ASCII byte outside comments.
