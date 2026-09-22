# EDITFIX1 evidence

- Ticket: `t_1bb89697`
- Author session: `/root/requirements`
- Branch: `codex/support-conversation-cp1`
- Input revision: `1d84592c0d639dfebaea4ac3aa9cb0711555e251`
- Scoped commit: `bebbfa65217c24908cb60db4c40194304ff8d080`
- Editorial input: `docs/missions/support-conversation-20260914/reviews/EDITORIAL-p1.md`
- Finding mapping: B1 corrected in `support-cases.en.md` and `.ro.md`; N1 corrected in `account-access.en.md` and `.ro.md`.

## Correction evidence

B1 now states both observed visitor-facing targets: the server case receipt says 48 hours, while the Support panel says replies arrive within one working day on weekdays. Both languages direct the visitor to rely on the case receipt until the copy is aligned. The CP3-owned UI wording was not changed.

N1 now describes the required second verification step and its two observed choices: an authenticator code or a saved unused recovery code. Both languages continue to tell visitors never to place those values in Support.

All four files retain `ratified_by: ""` and `ratified_on: ""`. No review or owner-ratification record was created. The prior KB receipt's other 29 draft/cluster hashes were recomputed and matched 29/29. `packages/support-kb/src/catalog.ts` remained byte-identical to the KB receipt, so its measured canonical digest remains `24784328a4bb8d4e5205b3036dd369268180df792243db1c296a0a7ed2a0f9fe` pending separate exact-byte editorial review.

No product test was added or rerun for these prose-only corrections. A direct TypeScript digest helper could not run inside the sandbox because `tsx` attempted a local IPC listener and received `EPERM`; the catalog source-byte match and prior independently measured digest provide the bounded digest evidence without consuming the shared heavy lease.

## Limitations

These corrected bytes remain unreviewed drafts until the separate editorial reviewer approves their exact hashes and emits real attestation. The owner-confirmed Forgot password destination remains unresolved. This receipt is not checkpoint acceptance.
