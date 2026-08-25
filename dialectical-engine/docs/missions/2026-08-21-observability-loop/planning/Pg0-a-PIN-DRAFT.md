# Pg0-a — G0-COMPLETE pin set (DRAFT for V ratification)

Assembled by Claude-Router from the APPROVED `FinalPlan.md` so V **ratifies
values, not a blank page**. Every line below traces to an approved source; the
Router authored no new policy. Card: `t_192aaea9`. Blocks S02 (`t_8e040ec2`)
and S17 (`t_f6593842`).

**Dual custody (E6-02):** this pin requires V **plus one named second
custodian**. V has not yet named the delegate — that is the one genuinely open
item here.

---

## 1. Tier rules  (source: FinalPlan §D.4 / R-E1, R-E2, R-BIGGER)

| Tier | Rule |
|---|---|
| **QUICK** | ≤1 production file + 1 test file · ~20 production-line cap (~50 with tests) · subsystem allowlist **empty by default** · RED→GREEN on a clean base SHA · auto-merged PR into `dev`, never `main` · merge-only, no deploy/restart · one revertible commit · one active mutation per repo and per fingerprint · notification on every landing. Dormant until G5. |
| | **RT-30 constraint:** the QUICK RED test must derive from an existing human-owned invariant (an acceptance assertion, contract schema, or catalog-declared property) — never freely authored. A new test asserting behaviour untraceable to a human-owned invariant is a deterministic ESCALATE. |
| **PR-FIX / approval-first (R-BIGGER)** | Everything above QUICK: record → read-only diagnosis → structured FixProposal (validated ids/codes only, no raw text, no LLM prose) → notification to V with an approval handle **regardless of severity** → on approval, coded → PR into `dev`, human merge. |
| **ESCALATE** | Report only. Every floor-list path below, unconditionally. |

## 2. Floor path/glob deny list  (source: FinalPlan §D.4, RT-29 — enumerated, not categorical)

ESCALATE regardless of line count: the security-zone manifest paths ·
`migrations/**` · `packages/crypto/**` · scoring arithmetic + served-number
writers (E6-11 set) · spend/budget config · **any dependency or manifest
declaration** (`package.json`, `pnpm-lock.yaml`, workspace files) · **any
register/bootstrap seed data file** · **any compose/env/CI/deploy file**
(`compose.dev.yaml`, `deploy/**`, env loaders, root scripts) · **anything under
`tools/`** (includes the CI gate and the listener itself) · protocol/spine docs
· board state · the obs policy bundle, zone manifest, chain/proof key paths, and
obs' own code (OBS-R104 self-modification set).

**"Production file" (enumerative):** matches
`apps/*/src/**`, `packages/**/src/**` (WIDENED by V 2026-08-22 — the original `packages/*/src/**` missed nested workspace packages such as `packages/battery/decision/src/index.ts`, leaving it unclassified for QUICK eligibility: a fix-authority hole), `apps/ui/{app,components,lib}/**`
**minus** the deny list above.

## 3. QUICK allowlist  (source: E6-03, V-ruled)

**EMPTY.** Fails closed. Grows only by dual-custody re-pin with an evidence
packet.

## 4. Taxonomy — closed vocabulary  (source: FinalPlan §A, OBS-R007/R012, FID-02/04, RT-09)

`PROCESS_DEATH` · `HTTP_FAILURE` · `JOB_FAILURE` · `PROVIDER_EXHAUSTED` ·
`DB_FAILURE` · `PARSE_SCHEMA_FAILURE` · `STALL_DETECTED` · `SILENT_NOOP` ·
`SUSPICIOUS_SUCCESS` (subclasses `empty_output`, `missing_required_fields`,
`missing_artifact_chain`) · `CLIENT_FAILURE` · `CAPTURE_SELF` ·
`ORIGIN_UNKNOWN`.

Extension is a human re-pin, never runtime.

## 5. Severity map  (source: FinalPlan §A, RT-41)

Ordered obs-owned ladder: **`INFO < DEGRADED < SEVERE < FATAL`**.
`CONDITION_MARKS` stays an unordered kernel vocabulary that obs neither extends
nor orders; the observed mark rides the separate non-ordering `condition_mark`
column. The code/mark → ladder mapping is a deterministic table in the bundle.

Note: `obs.severeThreshold` (seed `≥ SEVERE`) governs **urgency class and
routing only — never whether V is asked.** Every above-QUICK proposal notifies.

## 6. Routing table  (source: FinalPlan §F)

Owner routing for notifications, per the approved §F table. Channel selection
itself is the R-E6-09 recommendation and lands with S23.

## 7. Code-registry seed — SUPERSEDED 2026-08-22

> **This section was CIRCULAR and is REPLACED IN FULL by §7-R of
> `S02-registry-pin-correction.md`.** It asked V to "ratify the procedure and
> the resulting hash" — but the hash did not exist until the implementation
> produced it, which would have made the implementation certify its own pin.
> The S02 seat caught it and blocked rather than inventing a payload. The
> replacement derives the seed from the frozen tree at `29f370e`; V ratified
> SET A = 276, sha256 `65ba47df9659ea2b2bb4cc75051bb00bcea528367c5ccf7d1f99ceffc3736451`.
> Router-verified: all five hashes reproduced independently before ratification.

### Original text (superseded, kept for the record)


**Ratify the PROCEDURE and the resulting hash, not 173 hand-read codes.** The
registry is generated from the tree's statically-literal error codes, each with
**typed template parameters** (ids, registry codes, closed-enum members, bounded
integers — no string parameter may carry unvalidated input). S02 reproduces the
pinned hash; a mismatch is a red G0 acceptance.

## 8. Register seed rows with `source_ref`  (source: FinalPlan §A)

The named bounds are pinned as register rows with provenance; **their numeric
values are calibrated at G1, not now** — they remain V's per §K row 1. Two are
explicitly seedless and keep G5 closed until V rates them:
`obs.blastRadiusMaxReachable` and `obs.canaryWindowMs`.

---

## DELIBERATELY NOT PINNED HERE  (H5-04 adjudication (b) — pinning any of these now is forbidden)

| Slot | Re-pin gate |
|---|---|
| `zone_manifest_hash` | **RP-1**, at G1, after L2 |
| `hatchet_ingest` flag | **RP-2**, at SPIKE-D1 exit (G2 entry) |
| `injection_corpus_hash` | **RP-3**, at G3 entry |

S17 ships all three as declared-but-UNSET fields, each carrying its re-pin gate
id, so an unset slot is **visible rather than assumed**.

---

## What V is being asked

1. **Ratify sections 1–8** as the G0-COMPLETE pin set (all trace to the
   approved FinalPlan; nothing here is new policy).
2. ~~**Name the second custodian** for dual custody (E6-02).~~ **STRUCK
   2026-08-22** — void under V's single-custodian amendment (Batch 5). Exactly
   one custodian exists; the S17 drill is corrected to assert the one-token
   property instead.
