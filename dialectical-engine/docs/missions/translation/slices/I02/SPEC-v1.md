# I02 — Auth screens · SPEC

**FROZEN at creation, 2026-09-02, by REQ-01. No seat edits this file — a scope change is a new SPEC version ratified by V and superseding this one on the record.**

Mission: `translation` · slice `I02` · catalog namespace `auth` · census **117** translatable strings · mission requirements: `docs/missions/translation/requirements/translation.md`

## Intent

Move the auth surface's copy into the `auth` catalog — sign-in with its two-phase MFA, sign-up, e-mail verification and authenticator enrolment — changing nothing but text. This is the security zone: the words move, the behaviour does not.

## Requirements

Each traces to a mission requirement in `requirements/translation.md` §Q3. `UNVERIFIED` is a valid, respected answer to any of them.

| Id | Requirement | Traces to |
|---|---|---|
| `I02-R01` | Every one of the 117 strings this slice owns, listed per file in `requirements/census.md`, is read from `locales/<code>/auth.json` and no longer appears as a literal in the owned files. | R23, R25 |
| `I02-R02` | `locales/en/auth.json` is created by this slice, is valid JSON, has no empty value, and no key exists in it that no owned file reads. | R25, R28 |
| `I02-R03` | Every untranslatable token in the owned files stays a literal: brand marks, maker names, model identifiers, glyphs and keyboard shortcut names, as listed in R31. | R31, R32 |
| `I02-R04` | Rendering each owned file in English after extraction produces HTML byte-identical to the baseline captured from this slice's base commit with the same fixtures, and the baseline was committed before the first extraction edit. | R34, R35 |
| `I02-R05` | Whitespace is preserved: every `{" "}` separator and every leading or trailing space of a JSX text node in the owned files renders identically before and after. | R35 |
| `I02-R06` | The hardcoded-string scanner reports **0** user-visible literals in the owned files, counting only files this slice owns. | R23 |
| `I02-R07` | A sentence whose grammar runs through an inline element becomes one key with the element as a placeholder, not two fragment keys. | R23 |
| `I02-R08` | No plural, date or number handling changes in this slice; those sites keep their current behaviour until slice I11. | R38, R39 |
| `I02-R09` | Every standing test that reads one of this slice's owned files from disk and asserts an English phrase against its source text is re-pointed at the catalog or at rendered output inside this slice. | R52 |
| `I02-R10` | No test file listed as base-RED at `4f764037` is used as evidence for this slice. | R53 |
| `I02-R11` | Only text changes in the owned files: no control flow, validation, request, cookie, storage, redirect or security attribute is altered, and the diff touches only string positions and their imports. | R51 |
| `I02-R12` | The six English copy regexes in `apps/ui/components/authRoutes.source-test.mjs` over `LoginFlow.tsx` — `authenticator or a recovery code`, `Enter your authentication code\.`, `6-digit authentication code`, `Use a recovery code`, `Enter a recovery code\.`, `Back to sign in` — are re-pointed at `locales/en/auth.json` or at rendered output, and `pnpm --filter dialectical-engine-v2ui test` passes. | R52 |
| `I02-R13` | `components/AuthShell.tsx` and the three route files that carry no strings are unchanged except for imports, and every string they render still arrives as a prop from its caller. | R23 |
| `I02-R14` | The sentence at `components/LoginFlow.tsx:144` (`No account yet? <Link>Create one</Link>`) and at `components/SignUpFlow.tsx:194` (`Already have one? <Link>Log in</Link>`) each becomes one key with the link as a placeholder. | R23 |

## States

- Each owned screen renders in English identically to before.
- With another language active, every label, hint, validation message and error on those screens is in that language.

## Copy and vocabulary

Every term this slice renders that appears in `requirements/glossary.md` uses that file's wording. New English copy is not written here: this slice moves existing words, it does not reword them — the English identity requirement makes any rewording a failure.

Untranslatable tokens that must survive this slice as literals: the brand marks `Dialectical Engine`, `DebateAI`, `dezbatere.ro`; the maker names `OpenAI`, `Anthropic`, `Google`; model identifiers matching `gpt-*`, `claude-*`, `gemini-*`; the glyphs `☀ ☾ → ← ↻ ◫ ◈ ⊗ ◆ ✓ ✗ · ⚙`; keyboard shortcut names.

## Acceptance — V runs these in a browser

The dev stack is `https://localhost:3000`. A green test suite is a worker milestone, never acceptance.

| # | Step | Expected observation |
|---|---|---|
| 1 | Open `https://localhost:3000/sign-up` and choose **Deutsch** from the language menu. | The heading, the eyebrow, the lede and every field label render in German. The brand mark still reads `Dialectical Engine`. |
| 2 | Submit the form with an empty password. | The validation messages render in German. |
| 3 | Complete sign-up and follow the flow to `/verify-email` and then `/enroll-mfa`. | Each step's instructions, the recovery-code warning and the button labels are in German. |
| 4 | Go to `/login` and enter a wrong authentication code. | The error message is in German and the form still refuses the code. |
| 5 | Enter the correct code and sign in. | Sign-in succeeds and lands on the same route it landed on before this slice. |
| 6 | Switch the language menu back to **English** on `/login`. | Every word on the screen reads exactly as it did before this mission — same wording, same punctuation, same spacing. |

## Out of scope

- Any change to the login, MFA, recovery or session mechanism.
- The settings and erasure screens (slice I03).
- Dates and plurals (slice I11).

## Owned files — exhaustive

Every file below is written by this slice and by no concurrent slice. Files with zero translatable strings are owned so that an import change has a single owner.

| File | Census strings |
|---|---|
| `apps/ui/app/login/page.tsx` | 0 |
| `apps/ui/app/sign-up/page.tsx` | 0 |
| `apps/ui/app/verify-email/page.tsx` | 0 |
| `apps/ui/app/enroll-mfa/page.tsx` | 37 |
| `apps/ui/components/LoginFlow.tsx` | 47 |
| `apps/ui/components/SignUpFlow.tsx` | 29 |
| `apps/ui/components/AuthShell.tsx` | 0 |
| `apps/ui/components/AuthGate.tsx` | 3 |
| `apps/ui/lib/mfaEnrollment.ts` | 1 |
| `apps/ui/lib/totpQr.ts` | 0 |
| **Total** | **117** |

