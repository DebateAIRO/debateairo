# P4-10 Grok 4.6 verdict

Review session: `01a03cc7-dc14-7170-9b0a-31f437766e2d`

Verdict: **GREENLIGHT**

> P4-10 is complete with no bounded-scope P0/P1 issue.
>
> Live relays mint a fresh `Bearer` + 32-byte base64url credential and keep only the SHA-256 digest on the request path. `/v1/chat/completions` rejects missing, wrong, duplicate, body/custom-header, and cross-relay credentials with `401 { error: "UNAUTHORIZED" }` before `readBody` or spawn. Comparison is 32-byte `timingSafeEqual`. Trusted callers thread `authorizationHeader` only as `Authorization`. Independent probe of those cases passed, including child argv/env isolation and discovery header-only transport.

Local evidence supplied to the reviewer:

- focused relay/discovery group: `39/39`;
- root `pnpm run typecheck`: exit 0;
- `git diff --check`: exit 0;
- non-vacuous pre-fix RED: missing credential returned 200 and spawned the child;
- final GREEN: missing/wrong/alternate/cross-relay credentials return 401 with zero spawn, while the relay-specific credential succeeds.
