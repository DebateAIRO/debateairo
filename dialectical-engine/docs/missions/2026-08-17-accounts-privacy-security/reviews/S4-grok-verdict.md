# S4 Grok 4.6 final-review receipt

- Verdict: **GROK S4 CHANGES REQUESTED**
- Review: `grok-4.6-s4-final`
- Candidate: `00d8f88bfc7315e885837515937da4e1fe19f311`
- Packet SHA-256: `c47275e793729d5808e49fce69ad3b00ee5dd09cb002c378db42bc4c13c54fb4`
- Started: `2026-08-23T07:37:57Z`
- Ended: `2026-08-23T07:51:59Z`
- Custody before/after: clean, unstaged, unchanged at the candidate SHA
- Canonical visible log: `logs/S4-grok-final-review-visible.log`

## Blocking findings

1. **High:** family-consumed sibling verification credentials all become MFA
   enrolment bearers. Designate only the presented token hash, require exact
   bearer equality in every enrolment query, and clear it on activation.
2. **Medium:** MFA transaction locks invert S3's ruled order. Acquire channel,
   user, credential, then factor sequentially and prove verify/enrol overlap
   cannot produce `40P01` or HTTP 500.
3. **Medium:** recovery generation enqueues ten credential-lane Argon2 jobs at
   once. Hash sequentially or with concurrency no greater than worker count 2,
   with queue-occupancy and registration-coexistence evidence.
4. **Medium:** the UI asks users to paste the mailed bearer and never consumes
   `/verify-email?token=`. Read the query token once, POST verify-email, remove
   it with `replaceState`, and continue enrolment without persistence or
   third-party requests.

The complete reviewer reasoning, inspected non-blocking surfaces, evidence
table, and raw custody status are retained in the canonical visible log named
above. This receipt is intentionally a faithful index, not a reinterpretation.

## Rework 1 re-review receipt

- Verdict: **GROK S4 REWORK1 CHANGES REQUESTED**
- Review: `grok-4.6-s4-rework1-final`
- Candidate: `6eedfa9890081647b3264641ee77d929580b6acc`
- Packet SHA-256: `ff0d3772285f07d261e44d35227cce9ef0e0e4fb7f98277efc1a85edb12b8f37`
- Started: `2026-08-23T08:20:01Z`
- Ended: `2026-08-23T08:30:36Z`
- Raw status: `0`
- Custody before/after: clean, unstaged, unchanged at the candidate SHA
- Canonical visible log: `logs/S4-rework1-grok-final-review-visible.log`

Prior findings 1–3 were independently closed. The sole remaining **High**
finding is that the real mailer emits `/verify-email?token=...`, while only the
`/enroll-mfa` page mounted the one-shot query-bearer consumer. With no
`apps/ui/app/verify-email/page.tsx`, the mailed link reached a 404 and left the
bearer in the browser URL. The smallest requested correction is a compatible
`/verify-email` page alias plus a test starting from the actual mailed URL.
