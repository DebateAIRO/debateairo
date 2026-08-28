# Development authentication helpers

The standalone data-plane command intentionally leaves successful Compose
dependencies running. Its implementation also exports an owned lifecycle for
the future stack supervisor: that handle remembers only services started by
its invocation and stops them once in reverse order. It never stops reused
PostgreSQL or Hatchet services.

## Bounded auth-stack supervisor

After the one-time CA trust setup, the intended entry point is:

```sh
pnpm dev:auth:up
```

It composes the existing data-plane, Hatchet token, exact API environment, API,
private UI, and trusted TLS steps. It refuses an existing port-3000 listener
before touching Docker, and cleans an owned startup prefix in reverse order.
Its readiness line deliberately ends in `RUNNER_NOT_STARTED`: it does not run
model workers, seed a user, accelerate account erasure, or prove the browser
journey.

The supported local-auth origin is exactly `https://localhost:3000`. The TLS
front door binds `127.0.0.1:3000` and proxies the private UI listener at
`127.0.0.1:3001`. It does not publish the API directly and does not rewrite the
browser's `Host` or `Origin` headers.

## One-time trust setup

Install `mkcert` through the normal package manager for this workstation, then
manually create and trust its local CA:

```sh
mkcert -install
```

That command mutates the workstation trust store and is deliberately never run
by repository scripts. After the manual trust step, generate or validate the
private leaf certificate:

```sh
pnpm dev:auth:generate-tls
```

The leaf certificate covers only `localhost`, `127.0.0.1`, and `::1`. Its
directory is mode `0700`; its certificate and private key are mode `0600` and
are reused only when their custody, validity, names, and key pairing remain
valid. Partial or drifted state is refused rather than repaired.

## Front door

Run the UI privately on `127.0.0.1:3001`, then start:

```sh
pnpm dev:auth:tls-front-door
```

Open only `https://localhost:3000`. Plain `http://localhost:3000` is not a
fallback. Never disable TLS certificate verification, Secure cookies, or the
API's byte-exact Origin check. A browser trust failure means the manual CA setup
above is missing or drifted.

The command refuses every listener already bound to public port `3000`; it
never adopts or stops that process. Before starting, it requires the private
UI's real `/login` identity and exact proxied anonymous session denial. It emits
`DEV_TLS_FRONT_DOOR_READY` only after a normal system-trust HTTPS client (no
custom CA and no verification bypass) verifies those same two paths through
`https://localhost:3000`. A wrong response, trust failure, or readiness timeout
closes only the front door created by this command.
