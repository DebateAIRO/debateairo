# Loop report 15 — ACC-01 (DR-126 acceptance harness) — DONE

**Lane:** standing DR-120 loop (Codex codes, Opus+Grok dual diamond). The
mission's longest single ticket: cut 2026-08-09 ~11:40 EEST, closed
2026-08-10 ~11:20 EEST.

**What shipped (acceptance/):** standing embedded-Postgres provisioning;
byte-faithful DR-133/136/138 register seeding with at-seed computed contract
hashes + loud stale-hash conflict stop; the codex-CLI OpenAI-compatible relay
(maker OpenAI, fail-loud, test seams NODE_ENV-fenced); the no-op-dispatcher
acceptance composition root (Hatchet-free, production main.ts untouched); the
one-shot ceremony (--token ownership, documented asker defaults, later
--serve); plus two narrowly authorized production fixes the live gates
exposed: the judge system prompt declaring its schema (S04 class, instance 1)
and DR-137's tier-aware maker floor in critique; and the same-origin web
proxy (app/api/[...path]) that killed the UI's CORS NETWORK_FAILURE.

**Cycle shape:** 3 DB gates (2 genuine catches: over-strict WOK schema vs the
ruled partial shape; risk-provenance vs the core.run equal-tier CHECK) → 2
live ceremonies (JUDGE_SCHEMA_FAILURE → prompt declaration; the honest 64-row
DR-135 refusal that motivated TERM-01) → diamond rev-1 split (Grok approved /
Claude 3 blocking: B1 shipped-rule substitution, B2 silent maker-floor
waiver, B3 synthesized number with borrowed provenance) → V rulings DR-137 +
DR-138 → rev-2 DUAL GREENLIGHT (Claude seat verified at the data layer) →
CORS root-cause (missing same-origin proxy, V2 pattern restored) → rev-3
DUAL GREENLIGHT on the delta (socket-level verification; 6 advisories total
→ POL-01 carry-forwards).

**V rulings minted in this cycle:** DR-134 (day mode), DR-135 (refusing
evaluator; blanket-INACTIVE rejected), DR-136 (convergenceStopDefaults),
DR-137 (mono-model lawful; floor high-stakes only), DR-138 (run total 9).

**Honesty events:** worker refused twice to invent values (convergence
members; run total) — both became V sittings; orchestrator record correction
N2 (overclaimed organ traversal) posted and superseded; N1 (non-self-
contained default question masking composition) found by the Claude seat at
the data layer.

**Ops:** codex sticky session 019fe5bd across 4 resumes + 1 wedge
kill/resume; embedded-PG dylib symlink drops (pnpm) twice; pnpm non-TTY
purge + frozen-lockfile trap on web deps; ~/.hermes writable_roots for
board self-service.

**Tokens (named basis):** Codex session footers ≈ 425k (run 1) + subsequent
resumes; Opus seats (SDK task usage): rev-1 180k, rev-2 178k, rev-3 122k;
Grok sessions per grok logs. Orchestrator excluded.
