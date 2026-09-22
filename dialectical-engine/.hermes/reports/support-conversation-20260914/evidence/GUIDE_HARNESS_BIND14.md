# GUIDE_HARNESS_BIND14 — full readiness and zero-request route classification

## Result

- Ticket/session: `t_f14d341e` / `/root/preview`
- Revision: `152eed4da1cd3e66b74d8301159ba76427552409` (clean)
- Verdict: `PASS_BOUNDED_FULL_READINESS_AND_ROUTE_GUARD`
- Controls: 127/127, retaining all 120 BIND13 purposes and adding seven bounded discriminators
- Ordered-eight digest: `ba72808c15fe611c1999e440c206cb41d637d064884dde856a82ee7865f6f0d6`
- Traffic: none; no browser, runtime, HTTP, Support, model, status, or capacity operation ran
- Supplemental scope: `GUIDE_HARNESS_BIND14-scope-clarification.md`, SHA-256 `8ec1a8e89fd5ad8793d348093c8edb5b93cdeb32ebe9ba66839aba69299ce407`

## Established cause and correction

The old full-page predicate depended on a React-private `__reactProps$` field. BIND14 now proves hydration by toggling the public mode control once and restoring it. It does not probe hydration by changing Support language. It requires two visible EN/RO controls, one active locale, one visible composer, one visible mode toggle and `/help`, then changes locale only when the requested locale differs. Product semantics return immediately for the same locale and reset only the session on a real locale change while retaining transcript messages. The nonempty same-locale fixture remains unchanged; all five capture groups retain their original fresh/language-reset/storage-reset boundaries and exact five-session plan. The reviewed compact one-click contract is unchanged.

The old `otherSupport` classifier combined all remaining Support paths. Help mounts `OwnCaseLookup`, which automatically requests `GET /api/v1/support/cases`. Under the frozen clarification, BIND14 isolates only that known blocked operation as `pageCaseListRead`; it stays aborted and is never called public data. Every method mismatch, token read, consent, escalation, rating, or unknown Support route remains `otherSupport` and fails. The historical three aggregate attempts cannot be assigned to exact URLs because BIND13 did not retain them.

The exact 54-row matrix, FINAL9 inventory, 34-suite receipt, source/action/outcome/API-DOM proofs, privacy rules, pacing, sessions, capacity, navigation, and Forgot actionless state are unchanged. Adapter negatives remain 3/3 with no import or successful row.

## Next gate

REVIEW13 must assess this inert correction. Then the documented one-shot zero-Support probe writes new PROBE2 output and directly preserves its Node status. Only a successful five-transition result can unblock a later fresh-capacity 54-row capture. No product defect, readiness, acceptance, or checkpoint claim is made.
