# FIX-06 — Browser client surface: a client-side fault reaches the store without free text ever leaving the browser

**FROZEN at creation — 2026-09-01, seat REQ-FIX (Fable 5.1). No agent edits this file. Scope changes are a new SPEC version ratified by V.**
Gate: **G1 capture** · **DISPATCH HELD**: (a) after FIX-04 merges (same file `apps/api/src/index.ts`), and (b) after V rules contested row F-7 — `apps/ui` carries 111 uncommitted `ui-overhaul` entries in the main tree; spine v3.4.0 item 6 says shared-file fear does not serialize slices, but this is a collision with another MISSION's uncommitted work, so V decides the order.
Absorbs predecessor tickets: **S09 `t_3c54fdeb`** (client seam + hardened `POST /v1/obs/client-report`) · **S15** (D20 — `apps/ui/lib/observability/README.md` amendment, OBS-R136). §K row 12 stands: `ui_client` occurrences are report-and-count only, structurally ineligible for every fix path.
D-criteria evidenced: **D1** (browser surface), **D5** (no free text leaves the browser).
Seam obligations: none of O-1..O-4. R-E4 (no `asker_id`/`session_id`), R-E6-10 (`apps/ui` is the live surface) bind.

## 1. Intent
The UI has no error boundary files (`apps/ui/app/{global-error,error}.tsx` absent) and no reporting seam; ~16 call sites swallow errors locally. FIX-06 adds ONE seam — boundary lifecycle, `window.onerror`, `unhandledrejection` — a reporter that sends only closed enumerations, and a server endpoint that rejects anything else, mounted strictly after the zone-route-mount block.

## 2. Requirements
- **FIX-06-R01** `apps/ui/app/global-error.tsx` and `apps/ui/app/error.tsx` exist and report through one reporter in `apps/ui/lib/obs/**`; `ScoringErrorBoundary.tsx` is rewired to the same reporter.
- **FIX-06-R02** The reporter sends `{ code, component, route_template, kind, build_ref? }` where each field is a member of a server-served closed enumeration; it never sends `message`, stack text, URL text, or user identifiers.
- **FIX-06-R03** `POST /v1/obs/client-report` accepts only members of the server-side enumerations (unrecognized ⇒ rejected, not stored), assigns `build_ref` from the served bundle (client value ignored), stores `source = 'ui_client'`, `runtime = 'ui-client'`, `capture_point = 'client'`.
- **FIX-06-R04** The mount is inserted STRICTLY AFTER the closing brace of the `if (options.registration !== undefined)` block; the block is byte-identical before and after (ZI-2), and no test touches zone-file metadata (Batch-8).
- **FIX-06-R05** Rate limiting is keyed on a transient network-origin hash (in-memory salt rotated on restart, never persisted); rate-limited rejections increment a counted client-drop class in `obs.capture_gap` — never silent.
- **FIX-06-R06** `ui_client` rows are excluded by construction from fingerprint maturity, tier eligibility, and every fix path (asserted at FIX-09/FIX-12 against `source`).
- **FIX-06-R07** `apps/ui/lib/observability/README.md` gains one paragraph: the developer JSONL diagnostics stay file-only and never DB-persisted; obs is a separate V-ordered class; neither imports the other's transport.
- **FIX-06-R08** A green suite is a milestone; Done is V's veto after §5.

## 3. States
Client fault: `CAUGHT(boundary | onerror | unhandledrejection)` → `ENUMERATED` → `POSTED` → `ACCEPTED(row)` | `REJECTED(unknown member, no row)` | `RATE_LIMITED(gap row)`.

## 4. Copy and vocabulary
"client report" · "closed enumeration" · "served bundle build ref". Never "error message" client-side in anything transmitted.

## 5. Acceptance — V runs this personally (dev stack up; FIX-01, FIX-04 merged)
1. Open `https://localhost:3000` in a browser, signed in; open the browser devtools Network panel.
2. Cause a real client fault in unmodified product code — the ARCH seat names the site with `path:line` evidence in PLAN.md (candidate, UNVERIFIED by REQ-FIX: a debate page whose run is erased while the page is open); V performs it → the error boundary renders; one `POST /v1/obs/client-report` appears in the Network panel with status `202`/`204`.
3. Inspect that request's body in devtools → only the enumerated keys, no `message`, no stack text, no URL text.
4. `docker exec debateai-v3-postgres-1 psql -U debateai -d debateai -At -c "SELECT runtime, capture_point, source, code, build_ref FROM obs.occurrence WHERE source='ui_client' ORDER BY occ_seq DESC LIMIT 1"` → `ui-client|client|ui_client|<enumerated code>|<server build ref>`.
5. `curl -sk https://localhost:3000/v1/obs/client-report -X POST -H 'content-type: application/json' -d '{"code":"NOT_A_MEMBER","component":"x","route_template":"/y","kind":"z"}' -w '\n%{http_code}\n'` → `400`; the occurrence count is unchanged.
6. `for i in $(seq 1 200); do curl -sk -o /dev/null https://localhost:3000/v1/obs/client-report -X POST -H 'content-type: application/json' -d '<a valid body from step 3>'; done` → later requests return `429`; `SELECT gap_class, lost_count FROM obs.capture_gap ORDER BY opened_at DESC LIMIT 1` → a client-drop class with `lost_count ≥ 1`.
7. `git diff <base>..<tip> -- apps/api/src/index.ts | grep -c 'options.registration !== undefined'` → `0`.
V vetoes Done only after steps 1–7 match.

## 6. Out of scope
Any fix path for client errors (§K row 12) · the API error boundary (FIX-04) · UI redesign work (`ui-overhaul` mission) · sign-in/sign-up/MFA/verify-email/settings flows (zone).

## 7. File surface (single-writer) and parallel safety
Allowed: `apps/ui/app/global-error.tsx`, `apps/ui/app/error.tsx` (new) · `apps/ui/lib/obs/**` (new) · `apps/ui/components/ScoringErrorBoundary.tsx` · `apps/api/src/obs-client-report.ts` (new) · `apps/api/src/index.ts` region `obs-client-report-mount` (one mount line after the registration block) · `apps/ui/lib/observability/README.md` · tests `tests/integration/fix06-*.test.ts`, `tests/render/fix06-*.test.tsx`.
Read-only: `packages/obs-capture/src/registry/**` (served enumerations) · `packages/obs-capture/install/ui-client.ts` · `tests/support/zone-boundary.ts`.
Forbidden: the zone-route-mount region · the `error-boundary` and `obs-context-hook` regions (FIX-04) · every zone file · any other `apps/ui` file (ui-overhaul's surface).
Parallel-safe with: FIX-01, FIX-02, FIX-03, FIX-05, FIX-07+, FIX-16 (files). Must NOT run concurrently with **FIX-04**. Cross-mission collision with `ui-overhaul` on `apps/ui/**` — V's call (F-7).
