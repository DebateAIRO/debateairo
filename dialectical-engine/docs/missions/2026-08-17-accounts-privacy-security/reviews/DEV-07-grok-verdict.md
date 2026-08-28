# DEV-07 Grok 4.6 verdict

**GREENLIGHT**

Reviewer: Grok 4.6 Build (`grok-4.6-build`)  
Review boundary: frozen DEV-07 repository bytes identified in the review packet  
P0/P1 findings: **none**

## Nonblocking P2 notes

1. `deploy/dev-auth/create-local-certificate.mjs:35-45` uses recursive directory creation and validates the exact TLS leaf, not every ancestor. A newly created ancestor may use the process umask and an ancestor symlink is not rejected. The leaf remains current-user-owned, non-symlink, and mode `0700`; ancestor/root custody remains future `PERSISTENT_PATHS` work.
2. `deploy/dev-auth/create-local-certificate.mjs:76-83` validates that the reusable certificate covers `localhost`, `127.0.0.1`, and `::1`, is current, and matches its private key, but it does not reject extra SANs. The generation invocation at lines 88-92 still requests exactly the intended three names.
3. `deploy/dev-auth/create-local-certificate.mjs:97-100` discards `mkcert` stdout/stderr, so setup failures surface only through the bounded `DEV_TLS_MKCERT_FAILED` or `DEV_TLS_MKCERT_UNAVAILABLE` errors.
4. `apps/ui/server.mjs:9-11` still defaults to port `3000`, while `deploy/dev-auth/tls-front-door.mjs:9-14` defaults to public `3000` and upstream `3001`. The runbook instructs the operator to bind the UI to `127.0.0.1:3001`; DEV-07 does not start the UI or API.
5. `tests/integration/dev-tls-front-door.test.ts:194-260` proves WebSocket upgrade proxying against a fake upstream, not a live Next HMR session. `tests/architecture/dev-tls-front-door.test.ts:28` supplies only a narrow `createServer` source tripwire.

## Nonblocking P3 notes

- `deploy/dev-auth/create-local-certificate.mjs:14` imports the unused `rename` symbol. `mkcert` writes the final paths directly, and invalid or partial pre-existing files are refused rather than repaired at lines 123-127 and 136-141.
- `deploy/dev-auth/tls-front-door.mjs:56-61,115-120` preserves array-valued `Set-Cookie` headers through Node, but the focused proxy test at `tests/integration/dev-tls-front-door.test.ts:162-165` asserts only one cookie.
- `deploy/dev-auth/tls-front-door.mjs:129-147` has no WebSocket idle timeout or additional half-close hygiene beyond destroying the socket on error.

## Trusted-browser boundary

The missing `mkcert -install`, generated-leaf inspection, and live trusted-browser request are a pending owner-approval boundary, not a repository-code defect. The scripts never install trust, and no TLS weakening is present. A passing browser ceremony must not be inferred until the owner explicitly authorizes the persistent workstation trust-store change and the receipt is captured.

## Residual risk

On the reviewed hashes, the front door binds only `127.0.0.1`, accepts only `Host: localhost:<port>`, preserves Host and Origin, removes `Forwarded` and `X-Forwarded-*`, emits no plaintext HTTP response, and leaves Origin, CSRF, and Secure `__Host-` cookie decisions to the API. The UI BFF forwards the lawful Origin and cookies without rewriting Origin. A later `dev:auth:up` ticket still must set the UI to port `3001`, keep Next HMR working through `https://localhost:3000`, and—only after explicit owner approval—install the local CA and prove a real trusted-browser HTTPS receipt.

