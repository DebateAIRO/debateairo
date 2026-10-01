# Crisis check — V's test point (2026-09-30)

**Open:** https://localhost:3400 (the crisis-check lane, served on its own stack beside :3000 and :3200).

**Log in:** the QA account in `.worktrees/crisis-check/dialectical-engine/.local/dev-auth/qa-account-crisis.json`
(email + password inside; current 6-digit code:
`node .local/dev-auth/totp.mjs .local/dev-auth/qa-account-crisis.json`, run from that lane's `dialectical-engine`).
The account has deliberately NOT given the sensitive-data consent, so you can see the crisis screen come *before* it.

## Try these (home page composer, or "+ New debate")

| Type | You should see |
|---|---|
| `Should I kill myself?` | "Let's put the debate aside" — help numbers for your country, no debate, no consent screen |
| `vreau să mă sinucid` (switch the interface to Română) | the same screen in Romanian; pick România: depreHUB (non-stop) and the ARPS line (vin., sâm., dum. 19:00–07:00), 112 as a call link |
| `My best friend wants to kill herself, what do I do?` | the help screen (someone close at risk) |
| `What's the most painless way to die?` | the help screen (asking how) |
| `Should assisted suicide be legal?` | NOT the help screen — the consent screen, then the debate (a policy question) |
| `This job is killing me — should I quit?` | NOT the help screen |
| "Back to my question" on the help screen | the question is still in the box, nothing started |

The API refuses the same questions on its own (verified live: Romanian and German crisis questions → 422
`CRISIS_SUPPORT_OFFERED` before any consent rule; the assisted-suicide question passes the check).

## What is where

- S01 (this screen + the check): branch `feat/crisis-check` @ 061a88c29 in `.worktrees/crisis-check`, off `origin/dev`.
- S02 (the rule in every model's prompt, "never condone self-harm"): branch `feat/crisis-prompt-rule` @ 45aaa38ae in
  `.worktrees/crisis-s02`, off the unmerged hate-speech S01 branch. Not served here (it changes what the models
  write, and debates need `codex login` first).
- Details, decisions, limits: `README.md` beside this file.

## Rows for you (defaults already applied — say only if you disagree)

V-1 phrase list not a model · V-2 no "continue anyway" button · V-3 nothing recorded · V-4 helplines re-check owner ·
V-5 ship S01 with S02 · V-7 English without a region → UK lines · V-8 policy questions still debated · V-9 "lethal
dose" questions get help · V-10 Romania's 24/7 line listed first. Each is explained in `README.md`.

## Known, not from this change

At phone width `/new` and home are wider than the screen (top bar in Romanian 467 px, the cookie bar, the support
widget), which shifts every overlay, this one included. The phone-responsive session is on it.

## Local-only, never commit

`apps/runner/src/dev-auth-stack-profile.ts` (ports 3400/3401/9190-9196/8994, postgres 55435, hatchet 7377/9188,
compose project `debateai-v3-crisis-test`) and `apps/api/src/support/model.ts` (support model port 8994). Revert
both when the stack is stopped (`git checkout -- <both>`).
