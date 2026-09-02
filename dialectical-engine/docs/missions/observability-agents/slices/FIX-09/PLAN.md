# FIX-09 — PLAN (SCAFFOLD — the architecture seat fills steps, clusters and verification commands)

**Slice:** FIX-09 — The listener is alive: a permanent, restart-surviving, LLM-free daemon folds rows into incidents and V can see it breathing
**Gate:** G2 listener · **SPEC:** `slices/FIX-09/SPEC.md` (FROZEN 2026-09-01) · **Requirements:** 13 (`FIX-09-R01` … ) · **File surface / parallel safety:** SPEC §7 (binding; the PLAN may narrow it, never widen it).
Absorbs predecessor tickets: **S17 `t_f6593842`** (policy bundle format/loader + Pg0-a data: tier rules, floor path-glob deny list, EMPTY allowlist, taxonomy pin, severity map, routing table, register seeds; the three deferred slots `zone_manifest_hash`/`hatchet_ingest`/`injection_corpus_hash`; PLUS a new slot `quick_arm` default `OFF` — C1) · **S18 `t_220330f5`** (obs-daemon deterministic core

## Quantifiability law (binding on every step the architecture seat writes)
A stranger can mark every step done or not-done with no judgement call. WRONG: "improve error handling". RIGHT: "requests with a missing id return 400 with a message, and the test asserting this passes". Banned words in any step or acceptance criterion: **improve, better, robust, handle, appropriate**. Each step names its cluster, its acceptance test, and its file surface. Every SPEC requirement is covered by ≥ 1 step; every step traces to ≥ 1 requirement. Executable commands live in labelled fenced blocks, never in table cells (TOOLING-TRAPS: the escaped-pipe family, variants 1–9); acceptance commands use the capture-first idiom (`out=$(…); rc=$?` then an anchored summary match) and are RUN by their author at authoring time against a hostile configuration (missing file, vacuous filter) before they are written down.

## SPEC → PLAN trace — one row per requirement (13 rows; the architecture seat fills the empty cells)

| Requirement | SPEC sentence (abridged — the SPEC text is authoritative) | PLAN step(s) | Cluster | Acceptance test |
|---|---|---|---|---|
| FIX-09-R01 | `tools/obs-listener/policy/**` holds the bundle: format + loader; floor deny list as path globs (security zone… |  |  |  |
| FIX-09-R02 | Bundle hash is reproducible from its inputs by a party who never saw the loader (content pinned via a canonica… |  |  |  |
| FIX-09-R03 | The daemon consumes `obs.occurrence` as `debateai_obs_listener` over `OBS_LISTENER_DATABASE_URL`; startup and … |  |  |  |
| FIX-09-R04 | Incident fold is a deterministic re-derivable projection: one `obs.incident` per `(fingerprint, fingerprint_ve… |  |  |  |
| FIX-09-R05 | The tier gate is deterministic, non-LLM, input-hashed (`obs.policy_decision` rows re-evaluate bit-identically)… |  |  |  |
| FIX-09-R06 | Backlog order is severity-then-age; concurrency is capped; a poison occurrence cannot block the cursor (dead-l… |  |  |  |
| FIX-09-R07 | Zero model calls: `obs.budget_usage` receives no rows from the daemon; the daemon has no model adapter linked … |  |  |  |
| FIX-09-R08 | The watchdog is a separate process as `debateai_obs_watchdog`: verifies the daemon heartbeat, cursor lag, and … |  |  |  |
| FIX-09-R09 | launchd `KeepAlive` plists for daemon and watchdog exist under `tools/obs-listener/launchd/**`, distinct files… |  |  |  |
| FIX-09-R10 | Both processes upsert `obs.component_health` rows (`fixagent-daemon`, `fixagent-watchdog`) each cycle, so V's … |  |  |  |
| FIX-09-R11 | Configuration is a seam: Postgres URLs per role, spool/proof/key paths, CLI binary path, worktree path — V's… |  |  |  |
| FIX-09-R12 | Dispatch arm ABSENT (FIX-12); mutation ABSENT (FIX-13); `quick_arm` OFF (FIX-14).… |  |  |  |
| FIX-09-R13 | A green suite is a milestone; Done is V's veto after §5.… |  |  |  |

## Clusters — the unit of verification (three runs; the WORST run is the verdict; green-green-red is RED)

| Cluster | PLAN steps | Verification command (see fenced block) | File surface |
|---|---|---|---|
| FIX-09-C1 |  | `(architecture seat fills)` |  |
| FIX-09-C2 |  | `(architecture seat fills)` |  |
| FIX-09-C3 |  | `(architecture seat fills)` |  |

(Add cluster rows as needed; the three rows above are template rows, not a cap.)

### Verification commands (one labelled fenced block per cluster — never in a table cell)

```text
FIX-09-C1: (architecture seat fills — capture-first idiom, anchored summary, nonzero pass count, run three times)
FIX-09-C2: (architecture seat fills)
FIX-09-C3: (architecture seat fills)
```

## Standing tests that READ this slice's write surface
(architecture seat lists them with full paths and counts — TOOLING-TRAPS "Disjoint WRITE surfaces do not imply independent EFFECTS"; check EVERY target a loop iterates.)

## V acceptance
SPEC §5, verbatim, run by V personally. Never restated here. A green cluster is a worker milestone; Done is V's veto.
