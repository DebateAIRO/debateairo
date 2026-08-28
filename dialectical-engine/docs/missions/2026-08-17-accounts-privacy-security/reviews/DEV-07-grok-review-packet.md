# DEV-07 Grok 4.6 review packet

Verdict requested: `GREENLIGHT` or `BLOCK`, with only concrete P0/P1 product,
security, or evidence defects blocking. The workstation trust ceremony is
explicitly pending owner approval; review the repository implementation now,
but do not infer trusted-browser evidence that is not present.

## Ticket

**DEV-07 · Add a trusted local HTTPS front door**

Add a development-only TLS proxy/certificate workflow serving the byte-exact
`PUBLIC_APP_URL=https://localhost:3000` and proxying the private UI/API path
without weakening Secure `__Host-` cookies or strict Origin enforcement.

## Review boundary

Review these paths and their direct runtime dependencies only:

- `deploy/dev-auth/create-local-certificate.mjs`
- `deploy/dev-auth/tls-front-door.mjs`
- `deploy/dev-auth/README.md`
- `tests/integration/dev-tls-front-door.test.ts`
- `tests/architecture/dev-tls-front-door.test.ts`
- the two `dev:auth:*tls*` scripts in `package.json`
- `docs/missions/2026-08-17-accounts-privacy-security/DEV-01-local-auth-topology.md`
- the bootable-stack row in `docs/missions/2026-08-17-accounts-privacy-security/IMPLEMENTATION-STATUS.md`
- read-only proxy/origin dependencies: `apps/ui/server.mjs`,
  `apps/ui/app/api/[...path]/route.ts`, and the relevant Origin/cookie setup in
  `apps/api/src/index.ts`

The user-requested retrospective ledger is process evidence and is not part of
the product verdict.

## Intended security and behavior invariants

1. Certificate generation invokes `mkcert` directly, never `mkcert -install`,
   for exactly `localhost`, `127.0.0.1`, and `::1`.
2. The exact TLS leaf directory is current-user-owned, non-symlink mode `0700`;
   both leaf files are current-user-owned, non-symlink regular files mode
   `0600`. Partial or drifted custody is refused rather than repaired.
3. Existing certificates are reused only after date, exact-SAN, and private-key
   pairing validation. Failed generation removes both partial outputs.
4. The front door binds only `127.0.0.1`; defaults are public TLS port `3000`
   and private UI port `3001`.
5. Only the exact `Host: localhost:<public port>` is proxied. Host and Origin
   are preserved byte-for-byte; untrusted `Forwarded` and `X-Forwarded-*`
   headers are removed rather than trusted or fabricated.
6. The API remains responsible for its byte-exact Origin/CSRF decision. A plain
   HTTP Origin therefore stays HTTP and receives no Secure session cookie.
7. TLS response status/headers/body and multiple `Set-Cookie` values are
   preserved. The private Next development WebSocket upgrade remains usable.
8. Plain HTTP to the TLS port receives no HTTP response. The implementation has
   no plaintext listener, insecure fallback, trust bypass, or OS trust-store
   mutation.
9. Manual `mkcert -install` is documented as a one-time owner action, not run by
   application scripts. Missing trust is a loud setup boundary.
10. This ticket does not claim the full `dev:auth:up` orchestrator, start the
    API/UI/database, or prove an end-to-end account journey.

## Reproduce-first and mutation evidence

- Before implementation: both test files failed. The integration file could
  not import either missing executable; architecture tests failed because the
  source/runbook did not exist. No existing test regressed.
- First implementation gate: `2/4` passed. The TLS listener was denied by the
  sandbox (`EPERM`, environment-only), and the runbook's negative warning
  contained the exact insecure environment-variable literal forbidden by its
  source assertion. The identical host-permitted rerun passed after wording was
  made behavior-honest.
- Origin-rewrite mutant: replacing the incoming HTTP Origin with the trusted
  HTTPS Origin made the fake API return `200` plus a Secure `__Host-` cookie
  instead of `403`. The exact assertion failed; production source was restored
  byte-for-byte and the focused gate returned `5/5` GREEN.

## Final repository evidence on review bytes

- Focused DEV-07: `2` files / `5` tests GREEN.
- Affected DEV-01 through DEV-07: `12` files / `33` tests GREEN in `13.46s`.
- Root `pnpm typecheck`: GREEN.
- `pnpm lint`: GREEN (`28` architecture edges, zero violations; source blockers
  empty).
- `git diff --check`: GREEN.

## Custody hashes

- certificate generator — `c6254c6517f372f13193b5b9b98c4769605779c5044d7836cf6938365a83750f`
- TLS front door — `0013a34fd3793125101d7c4f88f308a5803e94c5d158bcbf8ad720b7515d4bd4`
- runbook — `bb34e9553de7b2fabd6c7096644b2965f386d8010f1dc4c9d31cd6aa2fb17ce1`
- integration test — `5fb83c70c0db66f94e7dd898fdd6871b77886dcaadd875100772fd583d0169ba`
- architecture test — `16c93f3751617e5072e1c425c738e14a24709c75631f20c47c471242e2518baf`
- `package.json` — `2e2eaf0f60005738081d98b40a7f3c47fdc1b9b9e3f15dfdd684896f8f22541e`
- topology Markdown — `5db13ce125b4415fd43256cd05d749fcfe718c9eeb2fefbd45cb11a926b7daf9`
- implementation status — `61a11873977a2180c41f7ea7b525c0640123e6557734f13abb81629ca7377eb0`

## Explicit pending boundary

- Homebrew `mkcert` is installed. The approval boundary rejected
  `mkcert -install` because a persistent CA in the macOS trust store is a
  system-wide security change that the owner has not yet explicitly approved.
- Therefore there is no claimed trusted in-app-browser certificate receipt yet.
  No self-signed click-through, browser certificate bypass, or TLS weakening was
  used as a substitute.
- Final DEV-07 closure requires owner approval, the documented trust action,
  generated-leaf inspection, a real HTTPS browser request, then reconciliation
  of any review finding against those final bytes.

## Review result

Grok 4.6 returned **GREENLIGHT** on the frozen repository bytes with no P0/P1
findings. The complete nonblocking P2/P3 notes and residual-risk statement are
preserved in `reviews/DEV-07-grok-verdict.md`. The trusted-browser workstation
ceremony remains pending explicit owner approval and was correctly classified
as a separate external-state boundary rather than a repository-code defect.
