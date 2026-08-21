# CLAUDE review — ACC-01 (DR-126 acceptance harness), rev 3 — same-origin proxy delta

Seat: CLAUDE (Opus 5 lens), dual-diamond seat 1 of 2. Independent review; the
grok seat's files were not read. My own `claude-acc01-rev2.md` was re-read to fix
the delta boundary — at rev 2 I verified `web/` was **untouched**, so the entire
`web/` change set is new and is exactly this pass's surface.
Ticket: `t_0dc09131`. Workspace: `/Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3`, branch `dev`.
Scope: **only** the same-origin proxy fix added after the rev-2 greenlight
(ticket comments 330 → 333). Everything greenlit at rev 2 is not re-litigated.

## VERDICT

**APPROVED.** The proxy is a faithful pass-through, not a rewriter: I drove the
compiled route against a **real HTTP server on a real socket** and confirmed
method, path, query, body bytes and `x-user-dev-token` arrive unaltered, that SSE
streams incrementally (first frame at 3 ms while the upstream stayed open), that
upstream error status and body pass through verbatim, and that an unreachable
upstream **throws** rather than synthesising a response. Nothing is fabricated,
nothing is invented, nothing leaks. The client base is same-origin by default and
rejects the cross-origin shapes an operator would actually type. No ACC-01 scope
drift. **No blocking finding.** Five advisories, one of which (A2) is about the
proofs' durability rather than their truth and should be closed before this
merges.

## What I verified myself (not taken from the handoff or the ticket comments)

| Check | Method | Result |
|---|---|---|
| Proxy behaviour tests | `node --test './app/api/[[]...path[]]/route.test.mjs'` (cwd `web/`) | **3/3 pass**, 1.39 s |
| Proxy source tests | `node --test app/api/proxyHeaders.source-test.mjs` | **2/2 pass** |
| S14 + contract suites | `./node_modules/.bin/vitest run tests/unit/s14-ui.test.ts tests/unit/api.test.ts tests/unit/contract.test.ts tests/architecture/s14-contract.test.ts` | **32/32 pass** |
| Full unit + architecture | `./node_modules/.bin/vitest run tests/unit tests/architecture` | **45 files / 270 tests pass**, 6.44 s |
| Web typecheck | `web/node_modules/.bin/tsc --noEmit -p tsconfig.json` | exit 0 |
| Audits | `tsx tools/orphan-audit/src/cli.ts architecture` / `source` | `edgeRowsChecked: 27, violations: []`; `blocking: []` |
| Next production build | `next build` (into a throwaway `NEXT_DIST_DIR`) | compiled, typechecked, `ƒ /api/[...path]` registered **dynamic**; the four static pages still prerender with the module-scope `contractClient` |
| **Independent socket-level probe** | my own harness: compiled `route.ts`, real `node:http` upstream, 14 assertions | all pass — table below |
| Guard bypass probe | `normalizeSameOriginApiPath` driven over 8 config shapes with WHATWG resolution | one hole — see **A1** |
| Delta boundary | `git status --porcelain`, `git diff HEAD -- web/`, mtimes | clean — see *Scope* below |

I reverted the two build side-effects my own `next build` produced
(`web/tsconfig.json` include, `web/next-env.d.ts` reference path). The working
tree is byte-identical to how I found it.

### Socket-level probe results (my harness, not the delta's tests)

| Probe | Result |
|---|---|
| POST body/query/token to a real socket | upstream saw `POST /v1/asks?mode=live&x=a%20b`, body byte-identical incl. non-ASCII, `content-length` correct, `x-user-dev-token: tok` |
| colon-bearing segment (`run:abc`) | round-trips as `/v1/runs/run%3Aabc/answer` |
| encoded slash inside a segment | `a/b` → `/v1/answers/a%2Fb` — **not** smuggled as a separator |
| path traversal in a segment | `../../admin` → `/v1/answers/..%2F..%2Fadmin` — cannot escape the base path |
| `HEAD` | 200, `body === null`, no hang |
| 204 | passes through with null body, upstream header preserved, nothing invented |
| upstream 500 | status **and** `{"error":"UPSTREAM_EXPLODED"}` verbatim |
| unreachable upstream | **rejects** — no synthesised response (DR-115) |
| SSE | first frame decoded at **3 ms** with the upstream still open |
| upstream `Set-Cookie` ×2 | both preserved, none synthesised |
| base with trailing `/` | normalised, no `//` |
| base with sub-path (`/gw`) | prefix preserved → `/gw/v1/session` |
| empty catch-all | no crash |

## Findings against the five charged questions

**(1) Faithful, streaming-safe, invents nothing, leaks nothing — HOLDS.**
`web/app/api/[...path]/route.ts:44-49` forwards `request.method` and the caller's
own `Headers` minus exactly two transport-owned names (`route.ts:41-42`);
`route.ts:47` forwards the body verbatim for every non-`GET`/`HEAD` method;
`route.ts:32` copies `source.search` raw, so query strings are never re-encoded;
`route.ts:30` encodes **per segment**, which is what makes the traversal and
encoded-slash probes above come out safe. `route.ts:52` returns `response.body`
directly — no `await response.text()`, no buffering — and correctly substitutes
`null` for `HEAD` and the null-body statuses (`route.ts:6`), which is required or
the `Response` constructor throws. No `Access-Control-Allow-*`, no `Set-Cookie`
synthesis, no `Authorization` invention anywhere in the file.

One precision for the record, so a later reader does not over-claim: the
`assert.deepEqual([...forwardedHeaders.keys()].sort(), ["content-type",
"x-user-dev-token"])` at `route.test.mjs:78` is a claim about what the route hands
to `fetch`, **not** about the wire. On the wire my probe observed undici adding
its own `accept`, `accept-encoding`, `accept-language`, `user-agent`,
`sec-fetch-mode`, `connection`, and re-setting `host` to the upstream target.
That is correct proxy behaviour (the browser's `host` must not survive), none of
it is auth-bearing, and none of it is invented by the route. The "invents no
headers" claim holds at the layer the route governs.

**(2) Same-origin by default, cross-origin rejected loudly — HOLDS, with A1.**
`web/lib/api.ts:3` defaults to `"/api"`; `web/lib/api.ts:5-11` throws
`NEXT_PUBLIC_API_BASE_MUST_BE_SAME_ORIGIN_PATH` and, because `contractClient` is
constructed at module scope (`api.ts:26`), a bad value fails at import, not
silently at first request. I confirmed the throw fires for `http://evil.test`,
`//evil.test`, `""` and whitespace. `web/lib/serverApi.ts:6` correctly drops the
`NEXT_PUBLIC_API_BASE` fallback so the SSR path can no longer inherit a
browser-shaped base — that removal is the right half of this fix and is easy to
overlook.

**(3) Tests are real — YES.** They pass in my sandbox, and they are
behaviour-coupled, not shape-coupled: `route.test.mjs:72-82` pins the exact target
URL, the exact forwarded header set, the exact body bytes and the upstream status;
`route.test.mjs:98-108` proves non-buffering with a 250 ms race against an
open stream, which a buffering implementation cannot win; `route.test.mjs:111-123`
proves the loud-missing-env path with a `fetch` that throws if it is reached at
all. `tests/unit/s14-ui.test.ts:198` proves the client actually emits
`/api/v1/session` with the token attached. See **A2/A3** for where they *live*.

**(4) No scope drift — CLEAN for ACC-01.** `git diff HEAD -- web/` is
`lib/api.ts` (+26/-2), `lib/serverApi.ts` (+1/-1), plus `app/api/**` and
`.env.local` untracked. Two other `web/` files are dirty —
`web/lib/v3Presentation.ts` and `web/components/DebateWorkspaceDrawer.tsx` — and
they are **not** ACC-01: both render `OWED-CHECK-UNEXECUTED` /
`condition_mark_records`, i.e. DR-139(4), and their mtimes (19:09) sit an hour
after the proxy fix (17:55). Same for `tests/integration/database.test.ts`, whose
new describe is literally titled "TERM-01 micro-round". Those belong to the
TERM-01 review, not to mine, and I have not judged them here.

**(5) DR-115 — HOLDS, proven twice.** The route has no fallback body, no default
payload, no demo path. Upstream 500 → 500 with the upstream's own bytes; upstream
unreachable → the handler rejects, Next answers 500, and the generated client maps
that to a typed `SERVER_FAILURE` (`packages/contract/src/client.ts:43-49,69`).
Missing config throws `DIALECTICAL_API_BASE_REQUIRED` (`route.ts:11`) before
`fetch` is ever called — the delta's own test enforces that ordering. Nothing in
this delta can hand the UI a fabricated success.

## Findings

### BLOCKING

None.

### ADVISORY

**A1 — the same-origin guard has a backslash hole.**
`web/lib/api.ts:7` tests `startsWith("/")` / `startsWith("//")`, but the WHATWG
URL parser treats `\` as `/` for special schemes. I confirmed empirically:

```
NEXT_PUBLIC_API_BASE="/\evil.test"  →  guard ACCEPTS
new URL("/\evil.test/v1/session", "http://localhost:3000")
  →  http://evil.test/v1/session      # cross-origin, token attached
```

This is **not** an exploitable path today: `NEXT_PUBLIC_API_BASE` is
operator-supplied build-time config, not attacker input. But rejecting
cross-origin values is this function's entire job, and it has a hole in it. The
robust form is an origin round-trip rather than a prefix test — e.g. reject unless
`new URL(normalized + "/", "http://check.invalid").origin === "http://check.invalid"`
— or simply refuse any value containing `\`. Note also that the throw is currently
exercised by **no test at all**: `NEXT_PUBLIC_API_BASE_MUST_BE_SAME_ORIGIN_PATH`
appears exactly once in the repo, at its own definition. A guard with no red side
is a guard nobody will notice deleting. (`/api/../..` is likewise accepted and
resolves to `http://localhost:3000/v1/session` — same-origin, so harmless; it
would simply 404. Same fix covers it.)

**A2 — the proxy's behavioural proofs sit outside every enforced gate, and the
natural way to run them is a silent green.**
`vitest.config.ts:5` includes `tests/**/*.test.ts` only, so neither
`web/app/api/[...path]/route.test.mjs` nor `web/app/api/proxyHeaders.source-test.mjs`
is reached by `pnpm test`, and no package script invokes `node --test` at all.
Worse, the obvious invocation is a trap — node's own glob reads `[...]` as a
character class:

```
$ cd web && node --test 'app/api/[...path]/route.test.mjs'
1..0
# tests 0 / # pass 0 / # fail 0
EXIT=0            # green, having executed nothing
```

The path must be escaped (`'./app/api/[[]...path[]]/route.test.mjs'`) to run at
all — that is how I got the real 3/3. So the strongest evidence in this delta is
one bracket away from evaporating without anyone noticing. There is mission
precedent for suites outside the default include (`acceptance/*.test.ts`, greenlit
at rev 2), but those are invoked by a named config; these are invoked by nothing.
Smallest close: a `test:web` script with the escaped path (or a glob-free
directory argument), wired wherever `acceptance` is wired.

**A3 — what *is* gated is grep-on-source, and it reads a machine-local env file.**
`tests/architecture/s14-contract.test.ts:19-29` asserts that `route.ts` contains
the strings `"DIALECTICAL_API_BASE_REQUIRED"` and `"response.body"` and that
`api.ts` contains `'"/api"'`. String matching cannot distinguish a working proxy
from a commented-out one. It also `readFile`s `web/.env.local` and requires
`NEXT_PUBLIC_API_BASE=/api` in it. `.env.local` happens not to be gitignored right
now (`git check-ignore` exits 1), so this passes — but it is a file whose name is
a near-universal convention for "machine-local, do not commit", it is still
untracked, and the moment anyone adds the conventional ignore entry, or a dev
points their local upstream elsewhere, the architecture suite goes red with an
ENOENT for reasons that have nothing to do with the code. Coupled with A2 this is
the real exposure: the durable gate proves spelling, and the gate that proves
behaviour is not durable. Prefer asserting the behaviour (A2) and, if the env
default must be pinned, pin it in a tracked `.env.example` or in the client
default that already exists at `api.ts:3`.

**A4 — `proxyFetch`'s `Request` branch silently discards method, headers and body.**
`web/lib/api.ts:19-22` extracts the URL from a `Request` input and then forwards
only `init`. I confirmed the consequence directly: a
`new Request(url, {method:"POST", body})` becomes a bodyless, tokenless GET, with
no error. It is dead code today — the generated client always passes a `URL` plus
a separate `init` (`packages/contract/src/client.ts:65,106`) — so nothing is
broken now. But it is a silent-wrongness trap of exactly the kind this mission
legislates against: the failure mode is a request that quietly loses its
credentials and its payload. Either forward faithfully
(`fetchImplementation(new Request(rewritten, input))`) or throw on `Request` input.

**A5 — the proxy forwards the browser `cookie` header upstream; inert today,
load-bearing the day auth changes.**
My probe confirmed `cookie: debateai:user-dev-token=tok` reaches the upstream on
the wire. This is faithful pass-through, not invention, and it is harmless right
now because `apps/api` authenticates **only** on the `x-user-dev-token` header
(`apps/api/src/index.ts:83` and the twelve sibling routes) and never reads a
cookie; `SameSite=Lax` (`web/lib/api.ts:38`) additionally keeps that cookie off
cross-site subresource requests. Worth recording because the proxy itself performs
no origin check: if the API ever learns cookie auth, `/api/**` becomes an
ambient-credential relay in the same commit, with nothing in this file to stop it.
No change requested now — a note for whoever touches `resolveSession`.

## Residual risk I am not calling a defect

End-to-end SSE through a **live** Next server on a **real** run is still unproven.
My streaming evidence comes from driving the exported handler directly, and the
orchestrator's browser proof (comment 333) covered `/v1/session` and
`/v1/deployment` — both plain JSON. Nothing suggests a problem: `response.body`
passthrough is the correct shape, the route builds as dynamic (`ƒ`), and the
generated client's incremental reader is separately tested
(`tests/unit/s14-ui.test.ts`, "parses SSE incrementally"). But the first real
proof of a live event stream through this proxy will arrive with the live-settle
gate after TERM-01, and it should be *looked for* there rather than assumed.

## Why this is an approval

The rev-2 greenlight was held open for one reason: the UI could not reach the API
from a browser. This delta fixes that at the right layer. It does not paper over
the CORS preflight with an invented `Access-Control-Allow-Origin` — which would
have been the fast, wrong fix and a header-invention finding — it removes the
cross-origin request entirely, and it moves the upstream base to a server-only
variable so the browser bundle can no longer even name the acceptance port. The
per-segment `encodeURIComponent` is a small choice that quietly buys traversal and
separator-smuggling safety, which I checked rather than assumed. And the two
DR-115-relevant paths — upstream error, upstream absent — both fail loudly and
typed, which I checked against a real socket rather than a stubbed `fetch`.

The advisories are all one kind of thing: the code is right, and the *proof that
it stays right* is thinner than the code deserves. A2 and A3 together are worth
closing before merge; A1 and A4 are cheap and belong in the same touch.

CLAUDE REVIEW: APPROVED — ACC-01 (rev 3)
