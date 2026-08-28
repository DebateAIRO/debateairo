# WEB-04 Grok 4.6 review packet

## Review scope

Review only Kanban card `t_f992a1c8`, **WEB-04 · Enforce auth-front-door parity across both Next apps**.

Ticket-owned files:

- `scripts/assert-auth-front-door-routes.mjs`
- `scripts/assert-auth-front-door-routes.d.mts`
- `tests/architecture/auth-front-door-parity.test.ts`
- build-script changes in `apps/ui/package.json` and `web/package.json`
- the gate-name update in `apps/ui/components/authRoutes.source-test.mjs`

WEB-01–03 product files are read-only facts for the source-parity test; this card adds no product behavior. Ignore unrelated dirty-tree files and do not edit.

## Required outcome

- One shared executable gate owns the exact ordered route inventory `/login`, `/sign-up`, `/verify-email`, `/enroll-mfa`.
- Both Next package production builds invoke that same gate after `next build`.
- The gate requires each route in both `server/app-paths-manifest.json` and `routes-manifest.json` static routes, and requires the referenced compiled server file to exist.
- A missing route must fail non-vacuously.
- A source invariant pins both apps to the same supported login, signup/resend, verify alias, and MFA-enrolment shapes while rejecting invented OAuth, reset/remember, bearer/storage, provider/API-key, and terms surfaces.
- No runtime behavior, API, authentication state, visual copy, or deployment policy changes.

## Implementation summary

`scripts/assert-auth-front-door-routes.mjs` exports the frozen four-route tuple and `assertProductionAuthRoutes(appRoot,appName)`. It parses the actual post-build app-path and static-route manifests, asserts each route and compiled file, and returns the exact tuple. Its CLI accepts the package root/name and emits one machine-readable receipt. The adjacent `.d.mts` preserves the exact tuple and function types for repository tests.

`apps/ui` now ends its build with `node ../../scripts/assert-auth-front-door-routes.mjs . apps-ui`; `web` uses `node ../scripts/assert-auth-front-door-routes.mjs . web`. The architecture test fabricates complete and missing-route production manifests, proving the latter rejects, then inspects both applications for exact supported state-machine sentinels and unsupported-affordance absence.

## RED / GREEN

- RED: architecture suite failed module resolution because the shared gate did not exist.
- GREEN: parity architecture `2/2`; the missing `/enroll-mfa` mutant rejects with `/enroll-mfa is absent`.
- GREEN: adjacent WEB-01–03 rendered behavior and parity command `14/14`.
- GREEN: existing `apps/ui` auth source suite `14/14` after pointing its build-gate assertion at the shared script.
- Initial root typecheck caught the executable `.mjs` lacking a declaration and then the test helper inheriting an overly narrow tuple type. The exact `.d.mts` and explicit `readonly string[]` fixture parameter repaired only those test types.
- GREEN: final root `pnpm typecheck`.
- GREEN: `git diff --check`.
- GREEN: real `apps/ui` optimized build ends with `AUTH_PRODUCTION_ROUTES_VERIFIED=apps-ui:/login,/sign-up,/verify-email,/enroll-mfa`.
- GREEN: real `web` optimized build ends with `AUTH_PRODUCTION_ROUTES_VERIFIED=web:/login,/sign-up,/verify-email,/enroll-mfa`.

SHA-256:

- gate: `f838a7b994332e2232687181cc62f63c8a7a53d864ea96c9bb69d6b87a37ab38`
- declaration: `022f99aa9f1710413328cbfd6db67f122aa5b34f801809d49b150d023f081463`
- architecture test: `e51f06d5a6402bcea77099fe0fd3cf178be0ffffab21420083b5041042bc5478`
- `apps/ui/package.json`: `6ad70994cc44657ac224234c1280e1e4b70bc6c4b381acb96175774c92603ea0`
- `web/package.json`: `8fcc5a442e2faa1130dc282b2b2a0eae9ca4670ba4c74f24ad9666e1c4052570`
- existing source test: `40fd0d1bcfade541e4de4db36915ef1926a04a6ab6400b8e3995d6375aceb2cf`

## Deliberate limits

This gate proves source and optimized-build parity only. It does not start either application, create an auth account, deliver mail, or claim the absent local HTTPS/database/API stack is operational.

## Requested verdict

Return exactly one of:

- `GREENLIGHT` if WEB-04 is a non-vacuous shared build/source drift gate with no P0/P1 manifest, invocation, path-resolution, false-positive, false-completion, or artifact-honesty issue; or
- `BLOCK` with concrete file/line evidence, the violated invariant, and the smallest repair.
