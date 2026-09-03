# PACKET REQ-REV-01 — blind review of the mission requirements and of the packet that produced them (mission `translation`)

Read FIRST, in full: `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/translation/packets/COMMON.md`, then `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/translation/00-intake-H0.md` and `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/translation/V-DECISIONS-PACKET.md`.

## 1. Ticket state
- **board:** `translation` · **ticket:** `t_81e24a2c` · **seat:** REQ-REV-01 · **role:** reviewer (`heartbeat-reviewer`) · **model:** Opus 5 (Claude subagent, V ruling 2026-09-02) · **round:** 1 of max 3
- **session:** record your agent id in your CLAIM comment · **comment cursor at dispatch:** the AUTHOR's ticket `t_7bf7a8a4` carries **6** comments at packet-write (2026-09-02 03:20) — read every one; the ticket is authoritative if the count differs, and a difference is a packet finding
- **the work under review:** seat REQ-01 (Opus 5), ticket `t_7bf7a8a4`, artifacts in §2. You are blind: no other reviewer exists yet; do not read `docs/missions/translation/reviews/` other than your own file.
- **cwd:** you start in `/Users/vladmihaimiron/Documents/DebateAIRO` (git root); the repo root is `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine`. Absolute paths everywhere. This is a documents review: work read-only in the main tree; no worktree.
- **allowed (exhaustive):**
  - `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/translation/reviews/REQ-REV-01.md` (your verdict)
  - `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/translation/agent-reports/REQ-REV-01.md` (self-report)
  - `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/TOOLING-TRAPS.md` (append only)
  - scratch (probe scripts, throwaway output — they may WRITE only here): `/private/tmp/claude-501/-Users-vladmihaimiron-Documents-DebateAIRO/a125c37e-0443-434a-a1f7-64245f9c7b13/scratchpad/req-rev-01/`
  - comments on `t_81e24a2c` (CLAIM, BLOCKED, handoff) and ONE verdict comment on the author's ticket `t_7bf7a8a4` (`--author REQ-REV-01`, `--max-len 80000`)
- **forbidden:** everything else. You never edit the work under review. No git writes. No product code. Read-only across the repo.

## 2. Artifacts under review (absolute paths)
1. **The packet that dispatched the author — review it FIRST** (`heartbeat-reviewer` §1): `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/translation/packets/REQ-01.md` and `COMMON.md` beside it. Check every quoted constant against reality (tree state `4f764037`, ticket ids, paths, line numbers of the four `ModeToggle` sites, the cookie-filter lines, the baseline numbers), the `allowed` list against the deliverables demanded, and that every path resolves. The author already filed seven packet defects in its self-report §5 — verify each (a defect the author invented is a finding against the author; a real one is a finding against the ORCHESTRATOR's packet) and find the ones it missed.
2. `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/translation/INSTRUCTIONS.md` (the compass; ≤100 lines; pointers, never content)
3. `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/translation/requirements/translation.md` (R01–R56, the language table, the slice cut, the oracles O1–O6, rows T-1…T-8)
4. `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/translation/requirements/census.md` and `census.json` (1371 rows claimed)
5. `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/translation/requirements/glossary.md`
6. `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/translation/slices/{I01…I11,LANG-TEMPLATE,L-*}/{SPEC,PLAN,PROGRESS,DECISIONS}.md` (28 directories, 112 files claimed)
7. The author's handoff comment on `t_7bf7a8a4` and its self-report `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/translation/agent-reports/REQ-01.md`.
8. V's verbatim goal and the "done" reading (H0) — the requirements must satisfy V's words: every V-2 language shown, the menu on every route at all times and effective, the app's own words translated.

## 3. Probes — build your own, never nod at the author's (`heartbeat-reviewer` §2)
P1 **Stranger test:** every SPEC acceptance step of I01, I05, I10, I11 and LANG-TEMPLATE in full, and a seeded random sample of 3 further I-slices and 3 L-slices (state seed and command) — can V, with no context, run it in a browser against the dev stack and observe the stated result? List every step that fails (file:line).
P2 **Banned words:** `grep -nE 'improve|better|robust|handle|appropriate'` over every artifact — every hit inside a requirement or acceptance criterion is a finding; hits inside the law statement that forbids them are not.
P3 **Trace equality, re-counted by YOUR script:** per slice, requirement rows in SPEC vs trace rows in the PLAN scaffold; per requirement ≥1 row; every `R`-id cited by a slice exists in `translation.md`; every R01–R56 is cited by ≥1 slice.
P4 **Contradiction hunt:** within `translation.md`; between SPECs (two slices that cannot both hold); against H0's C1–C10 dispositions; against V's verbatim goal; against COMMON §3 (DR-179, DR-188, privacy, the accounts-zone rule, the T9 gate). Quote both sides of each.
P5 **Citation audit:** 12 `path:line` citations chosen by a seeded random draw over `translation.md` and the SPECs (state the method) — verify each against the file; a fabricated citation is a B-finding.
P6 **Census re-measurement:** pick 6 string-bearing files by seeded random draw from `census.json`, count their translatable strings yourself by reading the source (state your own rule first, then compare to the census's rule in `census.md`), and report per file: census count, your count, every disagreement with line numbers. Then check the partition claim mechanically: every file in `census.json` appears in exactly one SPEC's owned-files list, every owned path exists on disk, sum equals 1371.
P7 **Vertical-slice law:** each slice has a beginning and an end V can exercise; I01 is the smallest complete end-to-end proof; the wave schedule in `INSTRUCTIONS.md` respects write-concurrency (no two slices scheduled in the same wave touch the same file — including the I01 mount edits into files other slices extract later, which the author flagged); the L-slices cannot start before the English catalogs are frozen.
P8 **Freeze and format law:** SPEC frozen header; PLAN is a SCAFFOLD (no implementation steps written by the requirements seat — steps belong to ARCH-01); PROGRESS is an empty skeleton; DECISIONS is append-only and seeded with the dispositions that bind the slice; the exact output-skeleton headings of the REQ-01 packet §4 are present in `translation.md`; INSTRUCTIONS.md is ≤100 lines and contains no content that lives elsewhere.
P9 **Languages:** for every code in the table, run `new Intl.PluralRules(code).resolvedOptions().pluralCategories` and `new Intl.Locale(code).textInfo?.direction ?? '(unavailable)'` with `node -e` from the repo root and compare to the table; a mismatch is a B-finding. The register decision per language must be stated with a reason.
P10 **Oracles O1–O6:** each criterion is mechanically checkable by a stranger; none leans on a base-RED test file (`logs/orchestrator-ledger.md` lists them); O1's coverage list matches the owned-files partition; O5's route enumeration matches `find apps/ui/app -name page.tsx` (run it; quote the count).
P11 **Author's `SKILLS LOADED`** vs the requirements floor (`superpowers:brainstorming`): the orchestrator verified all five listed skills by body phrase in the transcript (5/5) — you judge the LINE and the author's stated substance-compliance with brainstorming's interactive gate (self-report §5 item 6); say whether routing open choices to rows T-1…T-8 satisfies the floor in substance.
P12 **Self-report bar** (COMMON §5): cause not symptom, priced, near-misses, dead ends, packet ambiguities named — anodyne = finding.
P13 **Contested rows T-1…T-8:** each has options, pick, confidence, strongest counter, and asks nothing DECISIONS/H0/V-1…V-8 already answers; each is readable by someone who knows nothing of the codebase.

## 4. Verdict — `reviews/REQ-REV-01.md` (exact headings)
```
# REQ-REV-01 — verdict on the translation requirements (round 1)
SKILLS LOADED: ...
## Verdict: PASS | REWORK | BLOCKED
## Packet review (P-findings against the orchestrator's packet — REQ-01.md and COMMON.md)
## Blocking findings B1…       (file:line · failure scenario as concrete input → wrong outcome · evidence)
## Non-blocking findings N1…   (same shape; each one becomes a same-day ticket)
## What I verified and how      (probe · parameters · output verbatim)
## What I did NOT verify
## Predictions                  (what I expect ARCH-01 and the first coding seat to trip on)
## comments read through: <n>
```
Post the whole verdict as ONE comment on `t_7bf7a8a4` (`--max-len 80000`), and a one-line pointer on `t_81e24a2c`. Never "pass with concerns" — concerns are N-findings. A REWORK names, per finding, the exact file and the exact change that would close it.

## 5. Handoff and stop
Self-report first (COMMON §5), then `READY FOR PEER REVIEW` on `t_81e24a2c` opening with `SKILLS LOADED`. Stop. COMMON §6 applies; `BLOCKED` if an artifact under review is missing — name it.
