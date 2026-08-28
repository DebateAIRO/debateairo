# P2-01 Grok 4.6 verdict

Verdict: **GREENLIGHT**  
P0/P1 findings: **none**

Grok reviewed the frozen design/schema boundary read-only with `grok-4.6` and
confirmed that T0–T3 with restricted T3 completion is consistent with the
authoritative Phase-2 roadmap. The later mission architecture overrides the
research ladder's earlier T3-full/T4-restricted sketch: Wave 2 already applies
capability degradation to weak recovery, M23 requires a restricted
weakly-proved account, and T4 remains outside this ticket because human-review,
permanent-lockout, and automated-adjudication policy is still unratified.

The verdict also confirmed that:

- T0 creates no recovery attempt;
- runtime, migrations, policy rows, and the classifier remain outside P2-01;
- the Phase-2 implementation row must remain `✗`;
- the unrelated S9 architecture scanner failure is a harness-isolation defect,
  not a P2-01 product defect and not a GREEN suite.

## Nonblocking P2 observations

1. Contested-claim handling is currently a scope rule rather than an explicit
   transition; later runtime work must not silently reuse the T3 `FROZEN` state
   as adjudication.
2. The focused architecture test does not execute a general JSON-Schema
   instance validator. It pins the closed root/top-level inventory and selected
   semantics, but some instance extras or dropped transitions would escape it.
3. T1/T2 elapsed-time keys are not named in transition guards, and T3 due-time
   versus attempt expiry needs an explicit priority rule.
4. Tightening a tier has no named notification effect.
5. A later classifier must not assign T3 when a valid saved recovery code is
   present.
6. Surviving-session capabilities during the T3 freeze are not yet named.
7. Heightened-monitoring durations are effects rather than pinned policy values.
8. Research decision D3 still needs human product-experience acknowledgement;
   this ticket does not supply that acknowledgement.

## Nonblocking P3 observations

- The schema does not bind each proof-method ID to its family.
- Transitions have neither a maximum count nor a unique-ID constraint.
- Cancellation should say the **exact** original notification capability.
- The bypass name `SAME_METHOD_COUNTS_TWICE` is narrower than the actual
  family-independence rule.
- The review packet referenced neighboring P2 ticket text without reproducing
  it; Grok instead reconciled against Wave 3 and the implementation status.

## Residual risk

P2-01 is a ratified, closed design-time contract only. There is still no
attempt persistence, tier classifier, freeze/cancel endpoint, delay scheduler,
session-revocation/new-factor completion flow, restricted-mode enforcement, or
sealed `recoveryPolicy` register. Those remain later Phase-2 tickets. Granting
T3 full access, automating T4, reopening terminal attempts, or treating this
JSON as runtime evidence would violate the reviewed contract.
