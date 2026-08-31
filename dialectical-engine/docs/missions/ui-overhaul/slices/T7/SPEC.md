# SPEC — T7 Sign in, two-step & fleet

**Version:** v1 (2026-08-31) · **Status:** FROZEN at creation.

**Mission:** `ui-overhaul` · **Design source:** TURN 7.

## Intent

Replace the login shell (copy from design LoginFlow), the two-step
verification screen, and the operator-only fleet stub with TURN 7
Terracotta/Chamber presentation. Ordinary askers never receive fabricated
fleet/worker state.

## Screen inventory

| ID | Screen | Notes |
|---|---|---|
| T7-S1 | Sign in | `Dialectical Engine`; `WELCOME BACK`; `Back to the graph.`; policy line; email; password with rule marks; `Continue` |
| T7-S2 | Two-step verification | `TWO-STEP VERIFICATION`; 6-digit code entry; authenticator hint; `Continue`; `Use a recovery code`; `← Back to sign in` |
| T7-S3 | Fleet (operator-only) | `FLEET` / `Execution state` / `Operator-only view`; unavailable copy for ordinary asker interface |
| T7-S4 | Mode + tokens | Terracotta ↔ Chamber; mission fonts/palette |

## States

1. Email verified / invalid markers on T7-S1.
2. Password rule checklist visible.
3. After password continue → T7-S2 (authenticator or recovery-code path).
4. Recovery-code path may land on T8 recovery replacement gate after success.
5. Fleet: ordinary asker sees unavailable stub; no privileged request issued;
   no fabricated worker state (design copy binding).

## Copy (binding)

- `WELCOME BACK` · `Back to the graph.`
- `Sessions follow a fixed security policy. Every sign-in continues with your authenticator or a recovery code.`
- `TWO-STEP VERIFICATION` · `Enter your authentication code.`
- `Use a recovery code` · `← Back to sign in`
- Fleet: `Deployment state is unavailable in the ordinary asker interface. No privileged request is issued and no worker state is fabricated.`

## Requirements

### R1 — Sign-in shell

T7-S1 shows binding regions/strings and mode toggle.

### R2 — Two-step required continuation

Successful password step continues to authenticator or recovery-code path;
session is not treated as fully signed-in for product routes until two-step
completes (existing policy preserved).

### R3 — Recovery-code alternative

`Use a recovery code` is available from T7-S2; back link returns to sign in.

### R4 — Fleet stub honesty

Ordinary asker fleet view shows the unavailable copy; does not invent worker
rows or issue privileged fleet APIs from that UI.

### R5 — Operator fleet

If an operator surface exists (`apps/ui/app/admin/workers/` or successor), it
may show real execution state to authorized operators only — out of ordinary
asker chrome. ARCH maps the route; this SPEC forbids fabricating state for
askers.

### R6 — Render pins move

`tests/render/**` login / two-step pins move to NEW UI (**ARCH names pins**).

## NON-goals

- Weakening two-step / recovery policy.
- Building a new fleet control plane.
- Password-reset redesign beyond what's in TURN 7 artboards.

## OPEN QUESTIONS

1. **`Back to the graph.` vocabulary (V-DECISION):** same rounds/debates/
   graph language tension as T9 — ship verbatim?
2. **Fleet route ownership (ARCH):** confirm whether TURN 7 fleet artboard
   maps to `admin/workers` only, a settings deep-link, or a dedicated stub
   route — without inventing privileged APIs.

## Acceptance — V manual (browser)

1. Open login logged out. **Expect:** `WELCOME BACK`, email/password, mode
   toggle.
2. Submit valid credentials. **Expect:** two-step screen with 6-digit entry and
   `Use a recovery code`.
3. Use back link. **Expect:** return to sign in.
4. As ordinary asker, open fleet/operator stub if linked. **Expect:**
   unavailable copy; no fake worker list.
5. Complete authenticator continue. **Expect:** reach an authenticated product
   surface (library or prior deep link).

## Acceptance — automated

- Login + two-step render tests assert NEW strings.
- Fleet asker path test asserts unavailable copy and absence of fabricated
  worker rows.
- Pin migration named by ARCH; three-run law.
