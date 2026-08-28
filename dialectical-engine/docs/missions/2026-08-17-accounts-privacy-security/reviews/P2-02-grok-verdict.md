# P2-02 Grok 4.6 verdict

Verdict: **GREENLIGHT**  
P0/P1 findings: **none**

Grok confirmed that the sealed `recoveryPolicy` row matches the authorized
P2-02 shape. T1/T2 preserve the exclusive `<5m`/`<30m` thresholds; T3 and the
last-factor hold seal the ratified 7–14 day and 24–72 hour ranges with
server-pinned selection rather than caller control or invented point estimates.
The 24-hour post-cancel lock, provisional 7/30-day monitoring windows, 30-day
T3 restriction, 5-in-5-minute retry shape, cross-account source ceiling, no
permanent remote lockout, notice fan-out/order/schedule, and restricted
capability sets reconcile with P2-01 and the roadmap.

The review also cleared the integrity boundary:

- one strict policy-version-1 row with typed missing/malformed/duplicate and
  provenance failures;
- boot reads require a sealed version and declared count equal to actual count;
- bootstrap persistence is serialized empty-or-byte/provenance-identical and
  never upgrades a sealed version in place;
- the development seeder includes the row and rejects a runtime principal;
- API boot awaits the reader before Argon2 initialization or listening;
- the Phase-2 implementation status honestly remains `✗`.

## Nonblocking P2 observations

1. Wave-2 §10.7 also names code count/TTL. Saved-code count already lives in
   `mfaPolicy`; a later runtime ticket must seal the 24-hour issued-code ceiling.
2. T3 freeze and last-factor hold intentionally remain ranges. The later
   scheduler must pin an exact server-owned value within each range per attempt.
3. `maximum_active_attempts_per_account: 1` is a fair encoding of P2-01's
   singular in-flight attempt, although the packet's retry summary did not name it.
4. The architecture test does not directly assert `duration_basis`, last-factor
   selection, restoration conditions, or frozen-object identity; strict literal
   parsing still constrains those fields.

## Nonblocking P3 observations

- Bootstrap row-count arithmetic uses a magic `+ 3` for the MFA, session, and
  recovery singleton rows.
- `RECOVERY_POLICY_REGISTER_UNSEALED` is primarily mock-reachable because the
  database has `CHECK (sealed)`; missing version and count drift are the
  production-relevant cases.
- The original review packet cited nonexistent Wave-2 §11.2. The intended
  register authority is §10.7 and restricted capabilities come from §10.3 plus
  P2-01. The packet citation has been corrected after the verdict.

## Residual risk

P2-02 seals a boot-refusal policy row only. It does not freeze accounts, send
notices, classify tiers, schedule delays, complete recovery, or enforce
restricted mode. Later runtime work must pin range values, persist attempts,
and enforce these rules; treating this row as implemented recovery would be a
false close.
