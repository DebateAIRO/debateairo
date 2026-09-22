# GUIDE_EDITORIAL — exact eight-record review

- **Ticket:** `t_f959231c`
- **Reviewer:** `/root/baseline`
- **Native reviewer session:** `01a09ef7-e096-7c31-9b35-806840028cf0`
- **Parent thread:** `01a09ef2-30b5-7ee2-b12d-0599616d139a`
- **Reviewed on:** 2026-09-17
- **Product revision:** `5a8d10099178e2913f5e58b4f5e73f1eda13c30a`
- **Verdict:** **REWORK**
- **Owner ratification:** `ratifiedBy=""`, `ratifiedOn=""`

All eight article files, body payloads, model projections, and fallbacks match the author index byte-for-byte. The four workspace/status records are factually fit. The four navigation/settings records need a small bilingual correction before admission: use the actual visible landing label **Transcripts**, and describe **Report a bug** as the public-guide composer primer it currently is. Do not group it with the distinct human escalation and email workflows.

## Record dispositions

| Record | Article / body binding | Model projection binding | Fallback binding | Editorial disposition |
|---|---|---|---|---|
| `app-navigation.en` | `0530c272…` / `378bc3a0…` | `32a43ca4…` | `4264551f…` | **REWORK** — body + projection call the visible **Transcripts** destination “Sample debate”; body also calls Report a bug a separate human-support workflow. Fallback PASS. |
| `app-navigation.ro` | `af6e9b49…` / `8e1a6977…` | `41f0fa90…` | `e6a00272…` | **REWORK** — same bilingual defects. Fallback PASS. |
| `debate-workspace-menus.en` | `dd5673e9…` / `51f5b6a4…` | `7577c504…` | `4028dd08…` | **PASS** — body, projection, fallback. |
| `debate-workspace-menus.ro` | `3cd8b0cd…` / `1e2080d9…` | `e24fe21a…` | `7d0c57c3…` | **PASS** — body, projection, fallback; EN/RO parity retained. |
| `settings-help-menus.en` | `13ad6a9d…` / `f9110cca…` | `71d67c56…` | `d05abced…` | **REWORK** — body, compressed projection, and fallback conflate Report a bug with workflows separate from the public guide. |
| `settings-help-menus.ro` | `eca1fff3…` / `479afedb…` | `3fb9c82c…` | `a671ff9e…` | **REWORK** — same bilingual defect. |
| `support-status-limits.en` | `f5344e3c…` / `22afc752…` | `932f3396…` | `3aafc3b3…` | **PASS** — public Help indicators only; no private status authority. |
| `support-status-limits.ro` | `0ba2909d…` / `48662f4f…` | `05ede101…` | `b14e495d…` | **PASS** — public-only scope and EN/RO parity retained. |

The full exact SHA-256 and byte bindings are in `GUIDE_EDITORIAL-byte-check.log` and the receipt.

## Findings requiring correction

### E1 — visible Transcripts label is lost in two components

`LandingChrome.tsx:33-35` exposes **Method**, **Transcripts**, and **Pricing**. The Transcripts anchor leads to the sample transcript section (`LandingSample.tsx`, `id="transcripts"`), but the two `app-navigation` bodies and projections say the landing page links to “a Sample debate” / “Sample debate”. That is a true description of the destination, but it is not the actual menu label the user must find. The public-menu guide should say **Transcripts (the sample debate/transcript)**, preserving the visible English UI label in both languages. The fallbacks do not make this claim and pass.

### E2 — Report a bug is not currently a separate human workflow

At the reviewed public UI, `Assistant.tsx:821` handles **Report a bug** with `primeComposer("Report a bug in this debate")`; `:823` explicitly says the shortcut opens a public product-guide conversation. By contrast, `:803-808` implements the distinct **Escalate to a human** action and email link.

The `app-navigation` bodies say reporting a bug is a separate human-support workflow. The `settings-help-menus` bodies/fallbacks group bug reporting with human escalation/email as separate from the public guide, and the compressed projections preserve the same misleading grouping. Correct the bilingual class consistently:

- **Report a bug:** primes ordinary public-guide text in the composer; it does not itself create a human case.
- **Escalate to a human:** creates the separate human handoff/case.
- **Email support:** separate mail workflow.

If product behavior later changes, the article can follow the changed source. This review binds the current committed UI.

## Passing facts

- Account and Settings point to signed-in `/settings`; the four Settings section fragments are fixed, same-origin, and signed-in. The content clearly denies Support access to sessions, tokens, account/deletion state, credentials, codes, or account operations.
- Replay, Workspace, Honesty, Export, and the four debate views are accurately described as controls for the debate already open. The prose does not grant Support private inspection or operation authority.
- Service status describes only the public Debate engine, Scoring queue, and Model fleet indicators and explicitly limits freshness/completeness. It makes no consent, owner, selected-debate, run-state, or private-record claim.
- Forgot remains absent/actionless in these records. No substitute destination or credential operation appears.
- Owner fields remain blank. No admission or owner acceptance is inferred.

## Bounded recheck

Return the corrected four records to the original content author. Recheck only their new article/body/projection/fallback hashes and the two claim classes above; retain the four PASS records by exact hash. Manifest admission must wait for a separate PASS and later attestation.

## Limits

This is factual editorial review only. It does not review code correctness/security, manifest admission, actual-model usefulness, runtime behavior, preview behavior, checkpoint readiness, or owner acceptance. No tests, build, model, browser, HTTP, runtime, private-data read, product write, Git write, or heavy lease occurred. Usage: `UNAVAILABLE`.
