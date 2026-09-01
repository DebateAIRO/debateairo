# CODE-T9C2 — Wave 2, cluster T9-C2: landing chrome labels, CTAs, stub nav, return path

You are a fresh codex coding seat for mission `ui-overhaul` (board `ui-overhaul`, ticket
t_3c187757, authority marker on the ticket). Wave 1 is merged-ready: anonymous `/` renders the
landing skeleton (LandingChrome currently holds ONLY the ModeToggle mount), signed-in `/`
keeps the library, and the landing pins are scoped to `[data-landing-section]` subtrees.

## 0. Read order (paths relative to the workspace root, your cwd)
1. This packet, fully.
2. `docs/missions/ui-overhaul/architecture/dispatch-order.md` — row 4 (your writes + verify
   command), §"Landing query convention (AM6/charge 3)", §"T9-C1 stub rule".
3. `docs/missions/ui-overhaul/slices/T9/SPEC.md` — R4, R5 + the S1/S2 rows.
4. `docs/missions/ui-overhaul/slices/T9/PLAN.md` — the whole T9-C2 section (cells
   T9-C2-1..4 + HOW, including the FULL `safeReturnPath` contract — implement it verbatim).
5. `docs/missions/ui-overhaul/architecture/ADR-004-auth-return-path.md` — the `next`
   parameter contract (root-relative only; CTA `/login?next=%2Fnew`; sign-up forwards it;
   never through MFA enrolment).
6. `ADR-002` (JSX import law; the LandingChrome mount you must PRESERVE), `ADR-001` (colour
   law + oracle), `ADR-006` (fail-loud canonical gate from the workspace root).
7. `.hermes/TOOLING-TRAPS.md`.

Skills floor: heartbeat-protocol + heartbeat-worker (repo copies), superpowers:
test-driven-development, verification-before-completion, systematic-debugging,
receiving-code-review. Open every board write with `SKILLS LOADED: <list>`. Post a CLAIM
comment before coding.

## 1. The charge (cells verbatim from frozen PLAN; RED first on each)
- **T9-C2-1 (R4):** labels `Method`, `Transcripts`, `Pricing` in the landing document.
- **T9-C2-2 (R5, AM8-narrowed — supersedes PLAN:94):** the CHROME primary CTA is present:
  on the real anonymous `/` render, `[data-landing-section="chrome"]` contains the exact
  string `Start a debate`. `Read a scored transcript` is NOT asserted by you — it ships in
  the hero (T9-C4's file; cell T9-C4-5 now owns the pair). Your CTA's auth-entry href stays
  T9-C2-4's cell.
- **T9-C2-3 (R4):** clicking each stub anchor does not hard-crash: document still has the
  `DebateAI` wordmark, no uncaught error boundary.
- **T9-C2-4 (R5):** logged-out `Start a debate` enters AUTH with a return path resolving to
  New debate: CTA is `/login?next=%2Fnew` per ADR-004; mutant `href="#"` alone = RED.
- **Convention (AM6/AM7 law):** every PRESENCE assertion scopes to its owning
  `[data-landing-section]` subtree — for YOUR cells that subtree is `"chrome"` only.
  ABSENCE stays document-wide. An acceptance must name the real artifact: render the REAL
  anonymous `/` (the established route helper), never a hand-built document.

## 2. The mechanism (PLAN HOW — implement, do not redesign)
- `apps/ui/components/landing/LandingChrome.tsx`: MODIFY the Wave-1 skeleton (do NOT
  recreate). Wordmark `DebateAI` in `--font-display`; stub anchors `<a href="#method">`,
  `<a href="#transcripts">`, `<a href="#pricing">`; primary CTA per ADR-004; PRESERVE
  `<ModeToggle />` and the `data-landing-section="chrome"` attribute — T9-C1-3's pin and the
  suppression trio both read them.
- `apps/ui/lib/returnPath.ts`: CREATE with the PLAN-verbatim exports
  (`RETURN_PATH_ALLOW_LIST = ["/new", "/", "/settings"]`, `DEFAULT_RETURN_PATH =
  "/#start-a-debate"`, `safeReturnPath(raw)`), implementing exactly the stated shape rules:
  returns DEFAULT unless raw begins `/`, second char neither `/` nor `\`, contains no `\`,
  and its path part (before any `?`/`#`) is an exact allow-list member or matches
  `/^\/public\/debate\/[A-Za-z0-9._~-]{1,128}$/`. (Mission law from PDA: id parameters use
  DECLARED KINDS — the regex IS the declared kind; do not "improve" it.)
- `apps/ui/components/LoginFlow.tsx`: replace the module constant `HOME_PATH` with a
  navigation-time read inside `navigateHome`:
  `window.location.assign(safeReturnPath(new URLSearchParams(window.location.search).get("next")))`.
  **KEEP the `onAuthenticated` prop and its default** — `web-auth-login` and
  `auth-flow-integration` inject their own callback (verified present at lines 21/24/67/132;
  removing the seam breaks both).
- `apps/ui/components/SignUpFlow.tsx`: the `Already have one? Log in` link (line ~62)
  forwards the CURRENT `next` value (only when present; no `next` → plain `/login`).
- Do NOT thread `next` through MFA enrolment (T8 R3: a deep link must not survive an
  incomplete security ceremony) — and W.I.P. security features remain out of scope.
- `tests/unit/t9-return-path.test.ts`: CREATE — the safeReturnPath contract table: each
  allow-list member accepted; `/public/debate/<valid-ref>` accepted; REJECTED cases each
  returning DEFAULT: `//evil.example`, `/\evil`, `\evil`, `http://evil`, `/newx`,
  `/new/../settings` (path part not exact member), `/public/debate/` (empty ref), a 129-char
  ref, `null`, `undefined`, `""`. Every rejected case is a REAL test row, not a comment.
- `tests/render/t9-landing.test.tsx`: your cells go INSIDE the existing
  `T9-C2 chrome labels & CTAs` describe placeholder — do not touch the T9-C1 or T9-C4
  blocks.
- `tests/render/auth-flow-integration.test.tsx`: extend ONLY as needed to pin the
  LoginFlow/SignUpFlow `next` behavior through the existing seams (state every change).
- JSX law applies to any new TSX.

## 3. Refutation duty (each reproduced, then reverted, SHA-256 proofs)
1. CTA `href="#"` (auth entry removed) → T9-C2-4 RED.
2. CTA `/new` direct (skipping auth) → RED (the cell requires AUTH entry with return).
3. `safeReturnPath` returns its input unmodified (PLAN's own named surviving mutant) → the
   rejected-case table goes RED en masse.
4. One label MOVED out of the chrome subtree (e.g. `Pricing` rendered in the hero stub'
   area) → the scoped T9-C2-1 assertion RED. (Placement law: MOVE, not edit.)
5. `next` forwarding removed from SignUpFlow → its pin RED.
6. One NEIGHBOR control (benign: reorder the three stub anchors) → GREEN.

## 4. Acceptance at handoff (worst of three on vitest)
1. Row-4 verify command verbatim, 3x:
   `pnpm exec vitest run tests/architecture/auth-front-door-parity.test.ts tests/architecture/s8-publication-contract.test.ts tests/render/auth-flow-integration.test.tsx tests/render/t9-landing.test.tsx tests/unit/pda-s03-keyboard-accessibility.test.ts tests/unit/t9-return-path.test.ts tests/unit/v2ui-pages.test.ts`
   (Orchestrator pre-verified the six standing files at 6 passed / 73 tests.)
2. ADR-006 fail-loud canonical gate from the workspace root: 0-new over the two named
   baselines. 3. AM3 range-pair oracle over your product files: residual 0. 4.
   `pnpm exec vitest run tests/render` green. 5. Root typecheck 0. 6. Storage-absence
   guards green (your LoginFlow/SignUpFlow edits MUST NOT add storage references —
   auth-front-door-parity forbids them in exactly those files; if it goes red, fix your
   code, never the test). 7. Mutant table per §3.

## 5. File contract (writes — exactly these)
`apps/ui/components/landing/LandingChrome.tsx` · `apps/ui/lib/returnPath.ts` ·
`apps/ui/components/LoginFlow.tsx` · `apps/ui/components/SignUpFlow.tsx` ·
`tests/unit/t9-return-path.test.ts` · `tests/render/t9-landing.test.tsx` ·
`tests/render/auth-flow-integration.test.tsx` ·
`.hermes/reports/ui-overhaul/agent-reports/CODE-T9C2-codex.md` (self-report before FULLY
DONE) · board comments on t_3c187757. NO git commands.
Pre-existing-dirt manifest (not yours): `web/app/public/debate/[id]/page.tsx`.

## 6. Handoff
Final board comment on t_3c187757 (LAST write — freeze law): `READY FOR PEER REVIEW` +
per-cell RED→GREEN + §4 outputs + mutant table + `SKILLS LOADED:` + `comments read
through:`. Rework rounds: max 3, same session.
Return control at that handoff, a genuine blocker, or an IMPORTANT OPERATION, but keep the
unfinished goal/session alive and resumable. Silence is normal; unchanged state needs no
message. Termination requires the spine's goal-specific FULLY DONE condition.
