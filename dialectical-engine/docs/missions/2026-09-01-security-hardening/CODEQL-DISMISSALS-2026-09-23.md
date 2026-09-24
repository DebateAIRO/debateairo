# CodeQL alerts on PR #8 — the three to dismiss, with reasons (2026-09-23)

**What this is.** CodeQL is GitHub's automatic code scanner. On pull request #8 it
reported "7 high new alerts in code changed by this pull request". This branch fixes
three of the open alerts in code: two were real slowdowns, and the third could never
be triggered but was a small change. Three more are not the problem CodeQL names.
This page explains those three so you can decide, and gives you the exact reason and
comment to paste if you agree. The remaining open alerts were already on `dev` before
this branch and are listed at the end.

**What you do.** Nothing happens without you: the agent never dismisses an alert
(the standing rule you approved on 2026-09-22, recorded in
[GITHUB-SETTINGS-RUNBOOK.md](GITHUB-SETTINGS-RUNBOOK.md), Step 6). For each alert
you agree with: open the repository on GitHub → **Security** → **Code scanning** →
the alert number → **Dismiss alert** → choose the reason in the table → paste the
comment from its section. GitHub allows 280 characters of comment; each text below
fits.

| Alert | What CodeQL says | What is actually there | Reason to choose |
|---|---|---|---|
| #15 | a password is stored with a weak hash | no password; a lookup label for a short-lived memory cache | **False positive** |
| #13 | a check of who you are has no rate limit | true, but the check cannot be guessed and costs one database read | **Won't fix** (recommended) |
| #4 | the MFA code check has no rate limit | it has one, inside the service, where CodeQL cannot see it | **False positive** |

Line numbers below were measured at commit `b942bbbd` (branch
`security/ci-1-codeql`). The flagged lines sit at exactly GitHub's numbers in
`0e4fff4d`, the branch tip this work started from, and none of the files cited for
these three alerts changed after it. To see the open alerts yourself (read-only),
from the repository root:

```bash
gh api 'repos/DebateAIRO/debateairo/code-scanning/alerts?ref=refs/pull/8/merge&state=open&per_page=100' --jq '.[] | [.number, .rule.id, .most_recent_instance.location.path, .most_recent_instance.location.start_line] | @tsv'
```

---

## #15 — "a password is hashed insecurely" (`packages/crypto/src/index.ts`, line 1520)

**In plain words.** When the site writes an audit record ("someone signed in from
this address"), it does not store the visitor's IP address. It stores a scrambled
version made with Argon2id, a deliberately slow and memory-hungry function built for
exactly this. That is expensive, so the server keeps a small memory cache: "I already
scrambled this address a minute ago, here is the result". The line CodeQL flags only
makes the **label** for a cache drawer, like writing a locker number on a tag. The
label is made with a fast function because it is never stored anywhere and is
useless outside the running server. No password goes into it.

**The evidence.**

- The flagged code is `return createHmac("sha256", this.cacheKey).update(canonical, "utf8").digest("hex");`
  inside `AuditContextHasher.locator(normalizedIp)` (lines 1508–1521).
- `canonical` (lines 1509–1519) has exactly nine members: two fixed domain names,
  the normalized IP address, a SHA-256 fingerprint of the salt (line 1504), and the
  five public Argon2id settings (algorithm, memory, iterations, parallelism, length).
- The key, `this.cacheKey`, is 32 random bytes drawn once per running server
  (line 1503). It is never written anywhere, so a label is meaningless outside that
  one process.
- The label is used only as the key of the in-memory map (lines 1549, 1551, 1582).
- The value that **is** stored for the address is Argon2id: a cache miss calls
  `hashAuditContextValue` (line 1139), which refuses settings below 19,456 KiB of
  memory or 2 iterations (`validateAuditKdfParameters`, line 1125) and runs Argon2id
  in the worker pool (line 1147). Passwords go through `hashPassword` (line 1173),
  also Argon2id.
- Only one function calls `locator`: `hashSourceIp` (line 1549). Its five callers,
  in `packages/db/src/` (`identity.ts`, `legacy-claim.ts`, `auth-risk.ts`,
  `recovery.ts`, `sessions.ts`), all pass a source IP address.
- Where the "password" comes from: CodeQL names its source "an access to mfa". That
  is the two-factor service object, `const mfa = new MfaEnrollmentService({ repository: identityRepository, … })`
  (`apps/api/src/main.ts`, line 383), which the routes receive as `options.mfa`.
  CodeQL flagged it for its name. It reaches this class only through object fields:
  the service holds `identityRepository` (main.ts line 384), which was built with the
  audit hasher (main.ts line 265). No two-factor secret, code or password is part of
  `canonical`.

**How to check** (read-only, from the repository root):

```bash
sed -n '1503,1521p' dialectical-engine/packages/crypto/src/index.ts
```

```bash
git grep -n 'hashSourceIp(' -- dialectical-engine/apps dialectical-engine/packages
```

**Reason:** False positive. **Comment to paste:**

> Not a password hash. This HMAC-SHA256, under a random per-process key, only builds an in-memory cache key from the normalized IP, a salt fingerprint and public Argon2id parameters. The stored IP digest is Argon2id. See CODEQL-DISMISSALS-2026-09-23.md (security-hardening docs).

---

## #13 — "performs authorization, but is not rate-limited" (`apps/api/src/index.ts`, line 1536)

**In plain words.** This is not a login form. It is the doorman who runs before every
page and looks at your session cookie, the ticket you got when you signed in. A rate
limit stops someone from trying many guesses quickly. Here guessing is hopeless: the
ticket is a random 256-bit number (78 decimal digits). A billion guesses a second
since the Big Bang would have tried about one in 10^50 of the possible tickets.
Checking a ticket costs the server one database read, the same as serving any page.
So CodeQL's sentence is literally true (nothing counts how often this doorman is
asked), but the danger it points to is not there. That is why the recommended reason
is **Won't fix** ("the observation is correct and we accept it") rather than
**False positive** ("the observation is wrong").

**The evidence.**

- The flagged range (line 1536 to 1606) is `api.addHook("preHandler", …)`, the
  hook that runs before every route handler. It calls
  `options.sessions.authenticate(sessionToken, sourceFor(request))`. For
  `GET /v1/account/erasure` only, a failed check makes one more attempt with
  `authenticateErasureStatus`.
- A cookie that is not exactly 43 characters of `A–Z a–z 0–9 _ -`
  (`TOKEN_PATTERN`, `apps/api/src/sessions.ts` line 33) is refused by
  `safeTokenHash` (line 129) before any hashing or database read.
  `authenticate` (line 259) then returns no session: a protected route answers
  401, and a public page is served as to a signed-out visitor.
- A well-formed cookie costs two SHA-256 digests (a plain SHA-256 of the token, and
  an HMAC-SHA256 of the browser's user-agent) and one call of
  `identity.authenticate_session_t9`
  (`migrations/0040_account_erasure.sql`, line 3007). That call looks the session
  up by `token_hash`, a UNIQUE column (`migrations/0036_sessions.sql`, line 20), and
  returns at once when there is no row (line 3025).
- The token is 32 random bytes (`token_bytes: z.literal(32)`,
  `packages/register/src/session-policy.ts` line 10). That is 2^256 possible values,
  so no request rate makes guessing possible.
- No password, one-time code, recovery code or Argon2 work happens in this hook. The
  checks a rate limit exists for are limited where they run:
  - login: `requireRateBudget` (sessions.ts line 311) comes before `verifyPassword`
    (line 325), and line 406 comes before the second factor;
  - e-mail verification: `limiter.consume` (`apps/api/src/registration.ts` line 1552)
    comes before `consumeVerification` (line 1573);
  - two-factor: `rateLimit` comes before every read (`apps/api/src/mfa.ts`
    lines 200, 258, 316, 361);
  - account recovery and new asks: `admitOrRefuse` (`apps/api/src/index.ts`
    lines 1994 and 2088).
- What is true in the alert: nothing counts how often this hook runs. The API has no
  application-wide per-address request limit. Every limit it has belongs to a
  specific check: the ones listed above, the admission budgets and the daily cost
  envelope. The UI's edge server (`apps/ui/server.mjs`) has none either. A flood of
  made-up cookies therefore costs one indexed read each, the same as a flood against
  any page. Absorbing raw request volume is a job for whatever sits in front of the
  API when it is hosted, not for this hook.
- If you would rather fix than accept: a per-address budget for failed session checks,
  charged in this hook, needs a new sealed admission row. That is a separate package,
  not part of this wave.
- Not covered by the 2026-09-22 ruling. That ruling (runbook Step 6, and V-2 item 5
  in [V-DECISIONS-PACKET.md](V-DECISIONS-PACKET.md)) names #2, #3 and #4. #13 first
  appeared on 2026-09-23, so it needs your own decision.

**How to check** (read-only, from the repository root):

```bash
sed -n '1536,1606p' dialectical-engine/apps/api/src/index.ts
```

```bash
sed -n '3021,3026p' dialectical-engine/migrations/0040_account_erasure.sql
```

**Reason:** Won't fix (recommended). **Comment to paste:**

> Session-cookie check, not a credential check. Malformed cookie: refused before any hash or database read. Well-formed: two SHA-256 digests and one unique-index read of a 256-bit token. Password and code checks are rate-limited where they run. See CODEQL-DISMISSALS-2026-09-23.md

---

## #4 — "performs authorization, but is not rate-limited" (`apps/api/src/index.ts`, line 2016)

**In plain words.** This is the page that checks the six-digit code from an
authenticator app. It **is** rate-limited: the limit lives one step further in, inside
the two-factor service, and CodeQL only recognises limits written with a few
well-known add-on packages. It is like a bank counter where the guard stands behind
the door instead of in front of it. The guard is there; the camera outside just
cannot see him.

**The evidence.**

- The flagged range (line 2016 to 2024) is the handler of
  `POST /v1/auth/mfa/totp/verify`. It reads `enrollment_token` and `code` and calls
  `options.mfa!.verifyTotp(…)` (line 2020).
- `MfaEnrollmentService.verifyTotp` (`apps/api/src/mfa.ts` line 251) calls
  `this.rateLimit(tokenHash, source, now)` on line 258. That is before its first
  database read (line 259) and before the code is compared.
- `rateLimit` asks `MfaVerificationLimiter` (line 51). The limiter checks a
  per-address budget across all accounts first, then a per-enrollment budget. Both
  work in fixed windows with a temporary lock, and when its table is full it refuses
  new keys rather than admitting them. A refusal throws `MFA_RATE_LIMITED`.
- Already ruled 2026-09-22 together with #2 (login) and #3 (e-mail verification).
  Runbook Step 6 dismisses all three with one shared comment. The comment below is
  specific to this route, for use if you dismiss #4 on its own. Either text is true.

**How to check** (read-only, from the repository root):

```bash
sed -n '251,259p' dialectical-engine/apps/api/src/mfa.ts
```

**Reason:** False positive. **Comment to paste:**

> Rate-limited in process: MfaEnrollmentService.verifyTotp (apps/api/src/mfa.ts) calls rateLimit (MfaVerificationLimiter: per-source and per-enrollment budgets, fail-closed at capacity) before it reads the enrollment or checks the code. CodeQL does not see in-process limiters.

---

## The rest of the open alerts

| Alert | Where | Status |
|---|---|---|
| #8 | `packages/register/src/register-publication.ts` line 84: removing trailing zeros from a number | **Fixed in code**, commit `ec1bc9b4`. A number with 100,000 zeros followed by a 1 took 2.8 s to read; now under 2 ms. |
| #7 | `packages/judgement/src/s04.ts` line 162: reading a model's reply wrapped in a code fence | **Fixed in code**, commit `96e03388`. A reply of a fence and 100,000 blank lines took 4.6 s; now under 1 ms. The rewrite reads replies exactly as before: compared with the old pattern on 3,668,421 test strings, 177,156 of them in the committed test. |
| #6 | `packages/crypto/src/argon2-worker-pool.ts` line 451: removing padding from a salt | **Fixed in code**, commit `b942bbbd`. It was never slow, because the input is always our own output with at most two padding characters; the change was small, so it was made anyway. |
| #2, #3 | `apps/api/src/index.ts` lines 1699 (login) and 1966 (e-mail verification) | Ruled 2026-09-22, still open: runbook Step 6 dismisses them on your go. Re-checked at `b942bbbd`: the limits still come before the checks (sessions.ts 311 before 325, registration.ts 1552 before 1573). |
| the fourteen below | outside this pull request's changes | Already on `dev` before this branch. No action proposed here. |

The three fixed alerts close by themselves when CodeQL next analyses the pushed
branch. That cannot be seen before a push.

The fourteen alerts that were already on `dev`, one line each (read in the code on
2026-09-23; none is in this pull request's diff):

| Alert | Rule and place | Does it look real? |
|---|---|---|
| #5 | slow pattern, `packages/battery/decision/src/index.ts` line 75 | No. The step before it turns every run of other characters into a single underscore, so the pattern never meets two underscores in a row. |
| #9, #10 | page text re-read as HTML, line 316 of the two identical copies of the original design document: `docs/missions/ui-overhaul/design/design-document-original.html`, and `ui_designs/DebateAI Design Document.html` at the repository root, outside `dialectical-engine/` | No. It is a static design file that re-reads its own bundled content, and nothing in `apps/` or `packages/` serves it. |
| #16–#23 | messages to another window without a fixed origin, lines 160, 187, 201, 340 of the same two design files | No. They send the file's own bundled pages. The origin is the page's own for web pages, and a wildcard only when opened from disk or a sandbox. |
| #14 | redirect from a user-supplied value, `apps/ui/components/LoginFlow.tsx` line 36 | No. The value passes through `safeReturnPath` (`apps/ui/lib/returnPath.ts`), which allows only `/`, `/new`, `/settings` and `/public/debate/` followed by a debate id, all on this site, and sends everything else to the home page. |
| #12 | unsafe code construction, `tests/architecture/obs-l2-s05-boot-capture.test.ts` line 122 | No. It is a test that builds a tiny loader from a fixed test constant. |
| #11 | double unescaping, `docs/missions/2026-08-17-accounts-privacy-security/logs/T1-rework9-rework6-static-fixture.mjs` line 31 | The pattern is a real mistake: it decodes `&amp;` first, so `&amp;lt;` would become `<`. But it sits in an archived evidence script that only reads files it wrote itself. Not shipped, no outside input. |
