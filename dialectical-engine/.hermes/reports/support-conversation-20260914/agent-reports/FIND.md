# FIND self-report — support-conversation-20260914

## Case finding

The owner-confirmed Forgot password feature is not connected to the auth UI or route catalog in the assigned source revision, and the currently running target UI mirrors that checkout. The underlying recovery-start API is present, but it is an operation, not a safe user destination. The missing fact is therefore an integration destination: the canonical URL/path or the exact UI opener in the owner-referenced target.

## Cause and price

- **Cause:** source and target-app identity diverge from the owner's product knowledge. The source deliberately excludes `forgot` copy from both auth-parity tests while still carrying `startRecovery`, so source-only inference cannot recover a canonical destination.
- **Price:** one investigation pass; 12 bounded refs searched; 3 target surfaces inspected; 0 credential/reset submissions; 0 tests/builds/services started. Harness token usage and exact task elapsed time were not exposed, so both are **UNAVAILABLE** rather than estimated.
- **Repeated token cost:** older research already established the unresolved destination, but the packet still required a repeat bounded source/history/runtime check. The useful new evidence is the exact current revision, live target DOM, and supported-stack conflict map.

## What should improve

1. Intake should require the owner to name externally existing destinations as a typed route/control record: `intent`, `label`, `origin`, `path-or-opener`, `audience`, and `credential-boundary`.
2. Auth navigation should have one generated manifest consumed by UI tests, support knowledge, and route assertions. A backend method such as `startRecovery` must never be treated as proof of a user destination.
3. The supported preview launcher needs a documented port namespace or a first-class `--port-base` option. The current launcher fixes public/UI/API/provider ports and cannot coexist with the already-running target stack.
4. Runtime inspection receipts should persist route/link inventories automatically. That would make a later investigation a comparison instead of another manual browser pass.

## Near misses and dead ends

- I nearly treated saved MFA recovery codes as password recovery. The packet and owner instruction correctly forbid that substitution.
- I nearly treated `ContractClient.startRecovery()` as the missing flow. It submits an email to an API and provides no verified page/opener; doing so would violate the destination contract.
- Broad worktree search was a dead end and was stopped. The bounded auth refs and current target were enough to prove that the destination remains unknown in this revision.
- The public front door was documented as `https://localhost:3000`, but there is no current listener there. Bypassing TLS or submitting through the private UI would not verify the intended account flow.

## Packet clarity

The packet was precise about the security boundary and the need to ask early. It was unclear what “target app” meant when the supported public origin was down but the private UI remained live. I treated the running private UI as read-only evidence only and did not call it a supported public auth destination.

