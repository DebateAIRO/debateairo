# PACKET LANG-REV-__CODE__ — blind review of the __NATIVE__ (`__CODE__`) catalog, mission `translation`

Read FIRST, in full: `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/planning/translation/packets/COMMON.md` · `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/translation/INSTRUCTIONS.md` · the slice `SPEC.md`, `PLAN.md`, `DECISIONS.md` under `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/translation/slices/__SLICE__/` · the glossary and the translator's guide named there.

## 1. Ticket state
- **board:** `translation` · **ticket:** `__TICKET__` · **seat:** LANG-REV-__CODE__ · **role:** reviewer (`heartbeat-reviewer`) · **model:** Opus 5 (Claude subagent, V ruling 2026-09-02) · **round:** __ROUND__ of max 3
- **the work under review:** seat LANG-__CODE__, ticket `__WORK_TICKET__`, commit `__COMMIT__` on branch `__BRANCH__`; its dispatching packet `__WORK_PACKET__` (review it FIRST)
- **your lane (detached at `__COMMIT__`; cwd for EVERY command — you start in the git root):** `__REV_LANE__`
- **allowed (exhaustive):** `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/docs/missions/translation/reviews/LANG-REV-__CODE__.md` (main tree) · `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/reports/translation/agent-reports/LANG-REV-__CODE__.md` (main tree) · scratch under `__REV_LANE__/.review-scratch/` (delete before handoff; `git status --porcelain` empty) · `/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.hermes/TOOLING-TRAPS.md` (append) · comments on `__TICKET__` and ONE verdict comment on `__WORK_TICKET__` (`--author LANG-REV-__CODE__`)
- **forbidden:** editing the catalog under review · any git write beyond fully reverted in-lane probes · other languages · the main tree except the paths above · sibling tickets.

## 2. Probes — you are the second native reader; refute the claim "this catalog is complete, faithful and fluent"
- Parity ×3 and the render/leak command ×3 from PLAN.md, yourself, in your lane. A crash is BROKEN, not RED.
- **Fidelity sample:** draw 40 keys with a seeded random pick (state the seed and the command), read English and `__CODE__` side by side, rate each faithful / drifted / wrong, quote every drifted or wrong one.
- **Fluency read:** render the login, library, new-debate, debate and settings routes in `__CODE__` and read them as a native user; every sentence that reads as translated-from-English is a finding with the better wording.
- **Glossary adherence:** every glossary term's `__NATIVE__` value appears where the English term appears (grep both sides); inconsistencies are findings.
- **Mechanics:** placeholders, rich-text tags, plural categories (`__PLURAL_CATEGORIES__`), typography rules from the guide, values over 1.6× English length in buttons/menus, the identical-to-English list (each entry justified), untranslatable tokens verbatim.
- Packet review: constants (key count, namespace count, base commit) against the artifact; allowed vs deliverables; the author's `SKILLS LOADED` vs the floor; the self-report bar.

## 3. Verdict — `reviews/LANG-REV-__CODE__.md`
`SKILLS LOADED` · `Verdict: PASS | REWORK | BLOCKED` · packet findings · B1… (wrong meaning, missing key, broken placeholder/plural/tag, leaked English) · N1… (fluency, glossary drift, typography, length) — each with file, key, the English, the `__CODE__` value, the better value, and the evidence · what I verified and how · what I did NOT verify · predictions · `comments read through`. ONE comment on `__WORK_TICKET__`; pointer on `__TICKET__`. Round 3 REWORK → V row. Self-report first. Stop.
