# H1 — Research handoff INTEGRITY verdict (H0-REQUIREMENTS)

**Mission:** 2026-08-21-observability-loop
**Ticket:** REQ-OBS-H1-INTEGRITY
**Reviewer:** Claude Opus QA subagent, acting as the **QA-seat integrity reviewer**
per **V's fleet ruling of 2026-08-21** (wayfinder T01): the Hermes agent is not in
this mission's fleet — it runs Qwen and is slow — so only the Hermes Kanban store
is used and this integrity gate was re-assigned to a QA seat. Verdict path
re-pointed from `reviews/H1-integrity-hermes.md` to this file per the same ruling
(recorded at `docs/missions/2026-08-21-observability-loop/logs/hermes-integrity.log`).
**Executed:** `goal-packets/hermes-integrity.md`, checklist items 1-8, verbatim.
**Date:** 2026-08-21

## Scope discipline

INTEGRITY ONLY. This gate checks **existence, presence, and provenance**. It does
**not** review, score, rank, or compare the substance of any artifact — that
belongs to synthesis and to later gates. Nothing under review was edited; the sole
write of this seat is this file. Where a check surfaced something short of a gap,
it is recorded below as a **non-gating observation**, not repaired and not scored.

---

## 1. Artifact existence and readability

| Seat | Contracted path | Present | Size | Lines | mtime (local) |
|---|---|---|---|---|---|
| opus | `docs/missions/2026-08-21-observability-loop/research/opus-requirements.md` | YES | 141,547 B | 1,440 | 2026-08-21 11:48 |
| grok | `docs/missions/2026-08-21-observability-loop/research/grok-requirements.md` | YES | 59,749 B | 403 | 2026-08-21 11:34 |
| codex | `docs/missions/2026-08-21-observability-loop/research/codex-requirements.md` | YES | 81,704 B | 423 | 2026-08-21 11:38 |

All three readable at the exact contracted path. No path drift, no stub, no
zero-length file.

**Tamper spot-check (codex):** the codex handoff packet asserts artifact SHA-256
`2b63d478df85a6e82aa15fd3168e5500ec38f7692a14c650c709fdbdd3660c2a`. Recomputed on
disk: **identical**. The codex artifact is byte-for-byte what was handed off.
(opus and grok published no digest; no equivalent check is available for them.)

## 2. RQ-id coverage — presence of all 28 ids

Expected set taken from the brief itself
(`docs/missions/2026-08-21-observability-loop/brief.md`, bolded id enumeration):
`A1 A2 A3 A4 A5 B1 B2 B3 B4 B5 B6 C1 C2 C3 C4 D1 D2 D3 D4 D5 D6 D7 E1 E2 E3 E4 E5 E6`
— 28 ids, matching the packet.

Mechanical heading sweep (`^#{2,4} <id>[. ]`) against each artifact:

| Seat | RQ sections found | Missing | Out-of-order |
|---|---|---|---|
| opus | **28 / 28** | none | none |
| grok | **28 / 28** | none | none |
| codex | **28 / 28** | none | none |

All three answer every id, in the brief's order, under the RQ-A..RQ-E parent
headings. Presence only — quality not assessed.

## 3. Citations named (presence, not correctness)

Counted named-evidence tokens: `path:line`, `http(s)://`, explicit `UNVERIFIED`.

| Seat | `path:line` cites | distinct | URLs | explicit UNVERIFIED |
|---|---|---|---|---|
| opus | 398 | 297 | 1 | 15 |
| grok | 112 | 86 | 22 | 8 |
| codex | 129 | 107 | 2 | 17 |

Every seat names citations and every seat uses the explicit `UNVERIFIED` marker
rather than leaving unverifiable claims bare. Correctness of any individual
citation was **not** adjudicated, per the packet.

**Non-gating observation — evidence-free RQ-E sections.** Named-evidence tokens are
not uniform across sections. Sections carrying zero named evidence in the RQ body:
opus `D1, E1, E2`; grok `C4, D6, E1, E2, E4, E5`; codex `B2, C4, D4, D7, E1..E6`.
Spot-checking these shows they are the **Options / Pick / Confidence /
Counter-argument** decision sections the brief asks for under RQ-E, which back-
reference requirement ids that *are* cited upstream (e.g. codex E1 → `R96`, grok
E1 → `R29`, codex E2 → `R145`). They assert no new repo fact, so the packets'
evidence law ("every repo claim cites path:line") is not breached. Whether the
decision sections are *substantively* well-supported is a synthesis judgement and
is deliberately left unmade here.

**Non-gating observation — URL asymmetry.** Only the grok launch prompt carried a
live-search law; opus's and codex's packets require `path:line` + `UNVERIFIED`
only. The 1-URL / 2-URL counts for opus and codex are therefore contract-conformant,
not a shortfall.

## 4. Self-reports filed

| Seat | Path | Present | Lines |
|---|---|---|---|
| opus | `.hermes/reports/2026-08-21-observability-loop/agent-reports/opus.md` | YES | 61 |
| grok | `.hermes/reports/2026-08-21-observability-loop/agent-reports/grok.md` | YES | 18 |
| codex | `.hermes/reports/2026-08-21-observability-loop/agent-reports/codex.md` | YES | 16 |

All three filed at the contracted path, all three non-trivial, all three carrying
the required went-well / fought-me / would-change shape.

## 5. Handoff-marker evidence

Matched the colon-suffixed `READY FOR HERMES STAGE REVIEW:` form and classified
every occurrence as prompt echo vs. genuine emission.

**grok — `logs/grok.log`:** 1 occurrence of the marker, colon form, at line 2
(terminating grok's narration stream), followed by the complete 19-line handoff
packet at lines 3-21. Zero prompt echo in this log (the launcher prompt is not
teed into it). → **1 genuine emission, 0 echo.**

**codex — `logs/codex.log`:** 6 total occurrences of the marker string, 3 in the
colon form. Classification:
- line 15 — launch `/goal` prompt echo (non-colon: "emit the READY FOR HERMES STAGE REVIEW packet")
- line 83 — goal-packet body echo, the `## Handoff marker` template block (colon form, but template)
- line 14524 — `grep` tool output over `docs/missions/2026-08-17-mfa-recovery-requirements/logs/run-grok.sh:9` (another mission's launcher; echo)
- line 14636 — `grep` tool output over this mission's `logs/run-grok.sh:9` (echo)
- line 24503 — **genuine emission**, speaker-labelled `codex`, full packet
- line 24965 — **genuine emission**, same packet re-rendered after `tokens used 248,469` in the exec summary

→ **2 genuine emissions beyond prompt echo** (one final packet, surfaced inline and
again in the run summary).

**opus — `logs/opus-handoff.txt`:** durable record filed by the orchestrator, SDK
transport, no PTY, as the packet anticipates. Contains the colon-form marker and
the complete packet (mission/step, owner session, artifact path, upstream
artifacts, checks/evidence, assumptions/risks, comments-read-through), plus an
orchestrator-verified addendum. → **1 durable record present.**

All three seats' handoff evidence is on disk and distinguishable from prompt echo.

## 6. Blindness

Two independent checks per seat: (a) does the artifact claim independence, and
(b) does the artifact reference a sibling seat's artifact content.

**Independence claims.** opus artifact line 3: "Seat: claude-opus, **blind seat 1
of 3**, REQUIREMENTS loop". grok self-report final line: "Blindness held: I did not
open sibling `research/*-requirements.md`." codex self-report line 3 and handoff
packet: "did not inspect other research-seat artifacts" / "no other research-seat
output was read".

**Cross-seat content leakage — artifact level.** Sibling requirement-id prefix
matrix (a leak of sibling content would show as a foreign `OBS-*-R` id):

| Artifact | `OBS-OPUS-R` | `OBS-GROK-R` | `OBS-CODEX-R` |
|---|---|---|---|
| opus | 75 (own) | **0** | **0** |
| grok | **0** | 38 (own) | **0** |
| codex | **0** | **0** | 153 (own) |

Sibling artifact path references (`(opus\|grok\|codex)-requirements.md` excluding
self): **zero in all three artifacts.**

Every residual `opus`/`grok`/`codex` string in the three artifacts was resolved by
hand and is one of: (i) a CLI-relay / lawful-runtime reference under DR-179
(`acceptance/grok-relay.ts`, "Codex CLI", "Grok Build"), (ii) the upstream
`LOAD-01-codex.log` trail from mission 2026-08-06-v3-programming, or (iii) the
seat's own `OBS-<SEAT>-R` id prefix. **No sibling artifact content appears in any
artifact.**

**Cross-seat leakage — log level.** `logs/grok.log`: zero references to
`opus-requirements` or `codex-requirements`. `logs/codex.log`: 48 filename hits,
resolved to full paths — 27 + 17 belong to the **prior, unrelated** mission
`2026-08-17-mfa-recovery-requirements` (ordinary repo content, not a sibling of
this mission), and the remaining 4 are path *mentions inside* this mission's
`logs/run-grok.sh:9` and `goal-packets/grok.md:{15,36,66}` surfaced by codex's own
repo grep. **Zero grep-result lines are sourced from this mission's
`grok-requirements.md` or `opus-requirements.md`.** Independent corroboration on
timing: `opus-requirements.md` (11:48) did not exist while codex was running
(exited 11:40).

**Non-gating observation — codex incidental packet exposure.** Codex's repo-wide
grep incidentally surfaced 4 lines of the sibling **goal packet and launcher**
(paths and the handoff template), not sibling artifact content. Nothing from that
exposure propagated into codex's artifact (see the zero-leak matrix above). Under
this gate's stated standard — "artifact claims independence and contains no
reference to a sibling seat's artifact content" — this is not a gap. Recorded so
the synthesis seat can weigh it if it wishes.

**Non-gating observation — opus evidence class.** Opus ran as an SDK subagent with
no PTY, so no tool-call log exists for it. Its blindness rests on the artifact's own
declaration, the absence of any sibling reference in the artifact, and the
`upstream artifacts used` enumeration in `logs/opus-handoff.txt` (brief, intake,
own packet, repo working tree, protocol docs, two other-mission logs, one other-
mission AMENDMENTS file — **no sibling artifact**). This is declaration-plus-absence
evidence rather than log evidence. It satisfies the check as written; the
difference in evidence class is named here rather than smoothed over.

## 7. File-contract sweep

**`research/` — exactly the expected files, nothing else:**
`codex-requirements.md`, `grok-requirements.md`, `opus-requirements.md`. (No
synthesis artifact present, which is correct for this stage; per wayfinder T02, V
authorised synthesis to launch in parallel with this backfilled verdict.)

**`agent-reports/` — exactly the expected files, nothing else:**
`codex.md`, `grok.md`, `opus.md`.

**No seat wrote code, schemas, or config into the repo.** Mtime sweep across the
whole `dialectical-engine/` tree for the seat window (2026-08-21 11:15-11:56 local,
covering all three seats end-to-end), restricted to
`*.ts|tsx|js|jsx|mjs|cjs|sql|json|yaml|yml|toml|.env*`, returned exactly one file:
`docs/missions/2026-08-17-accounts-privacy-security/logs/S3d-final-opus-claude-review-result.json`
— a **different mission's** review-result log, not this mission's seats and not
code/schema/config. **Zero writes under `apps/**`, `packages/**`, `migrations/**`,
`tools/**`, `web/**`, `tests/**`, `acceptance/**`.** The unrestricted window sweep
shows this mission's seats touched only their two contracted paths each; every other
in-window file belongs to the orchestrator (logs, launchers, watchdog, packets,
brief) or to the concurrent `2026-08-21-docker-hatchet` mission.

## 8. Seat session ids

| Seat | Session id | Source |
|---|---|---|
| codex | `01a0236a-e053-7ce3-9831-845c106a10c0` | `logs/codex.log:24505` handoff packet **and** `agent-reports/codex.md:2` — matches the id named in the integrity packet |
| grok | `01a0236a-e284-7250-a5df-bdbef67e6d7b` | `logs/grok.log:4` handoff packet |
| opus | `SDK-subagent (opus blind seat)` — no CLI session id | `logs/opus-handoff.txt` (SDK transport, no PTY; expected per the packet) |

---

## Verdict

```
RESEARCH HANDOFF INTEGRITY: opus = PASS
RESEARCH HANDOFF INTEGRITY: grok = PASS
RESEARCH HANDOFF INTEGRITY: codex = PASS
```

```
HERMES STAGE REVIEW PASS: H0-REQUIREMENTS handoff integrity (all three seats)
```

Gates cleared: artifact existence at contracted paths (3/3), full 28-id RQ coverage
(3/3), named citations with explicit UNVERIFIED discipline (3/3), self-reports filed
(3/3), handoff-marker evidence distinguishable from prompt echo (3/3), blindness
with zero cross-seat artifact content (3/3), file contract exact with no code /
schema / config written (clean), session ids recorded (3/3). Three non-gating
observations are recorded above under items 3 and 6; none is a gap, and per the
packet no gap was repaired by this seat.
