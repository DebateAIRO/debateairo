# Crisis check — help numbers instead of a debate

V's goal (2026-09-30): "Crisis check before a debate starts: a help-numbers screen instead of a
debate. We need to generate help numbers instead of debates for people who seem to be in a
crisis. We should not condone people to commit self-harm in any way."

Run lightly (V: "if you need heartbeat, use heartbeat… it is at your latitude"): two slices, one
lane each, parallel translator seats, no board.

## S01 — the check and the screen (lane `.worktrees/crisis-check`, branch `feat/crisis-check`, off `origin/dev`)

- **Detector** `packages/contract/src/crisis.ts` + one phrase list per interface language in
  `packages/contract/src/crisis-lexicon/<lang>.ts` (35). Five signals: `intent` ("I want to
  die"), `self-harm` ("I cut myself"), `decision` ("should I kill myself?"), `method`
  ("painless way to die"), `other-person` ("my friend wants to kill herself"). Every list is
  tried on every question, whatever the interface language. Text is normalised (case, accents on
  Latin/Greek/Cyrillic, Arabic/Hebrew vowel marks, apostrophes, spaces) on both sides.
- **API** `POST /v1/asks` refuses a crisis question FIRST — before the consent rule and before
  admission — with `422 CRISIS_SUPPORT_OFFERED` and the edge's `country` (or `null`). No quota
  is spent, nothing is submitted, nothing is stored (the API logger is off).
- **UI** `apps/ui/components/CrisisSupport.tsx`: the home composer and /new run the same check
  before anything else (session check, consent screen) and open the help screen; they also open
  it on the API's 422. The screen: a calm title and lede, a country picker (default: the edge's
  `cf-ipcountry`, else the browser language's region, else the interface language's usual
  country), the country's checked helplines with Call / Text / Chat / Website, the emergency
  number, a link to findahelpline.com, "we did not start a debate and did not keep what you
  wrote", and "Back to my question" (the text is kept, so a misread question can be reworded).
  Esc closes it; the backdrop does not. 18 strings `home.crisisSupport.*` in 35 locales.
- **Helplines** `apps/ui/lib/crisisLineDirectory.ts`, generated from research dated 2026-09-30:
  each number confirmed on the helpline's own page or a government page (URL kept per line);
  unconfirmed candidates left out. Countries with no confirmed line show the emergency number
  and findahelpline.com.
- **Tests** `tests/unit/crisis-check.test.ts` (normalisation + per-language fixtures in
  `tests/unit/crisis-check-fixtures/<lang>.json`: must-trigger and must-pass questions),
  `tests/unit/crisis-check-api.test.ts`, `tests/render/crisis-support.test.tsx`.

## Pre-flight (V, 2026-10-01: "make sure this crisis check is done in the pre-flight") — branch `feat/crisis-preflight`

The crisis check is step 1 of the ask pre-flight, on both sides:

- **API** (`POST /v1/asks`): the check is the first statement of the route. The consent rule,
  the quota, the country rule, the request's own validation and any later pre-flight check of
  the question (the hate-speech check, hate-speech S03) all come after it. A person in crisis
  never meets a refusal or a "check unavailable" message instead of help, and their words go
  to no judge model. A source test in `tests/unit/crisis-check-api.test.ts` fails if anything
  is put in front of it.
- **UI** (home composer, /new): the check runs before the form's own rules too. A crisis
  question too short to be a debate ("我想死", "死にたい", "kys") used to leave Start disabled
  and nothing happened; Start is now enabled for it and opens the help screen.

## S02 — the prompt rule (lane `.worktrees/crisis-s02`, branch `feat/crisis-prompt-rule`, off `slice/hate-speech-s01`)

The one content rule every model reads (hate-speech S01) becomes `debateai.content-rule.v2`:
rule 6 — never encourage, romanticise or instruct suicide or self-harm, while it stays debatable
as law, medicine, public health, history and philosophy; rule 7 — a real person at risk in the
question or material is told, in the question's language, that their life matters, that no
debate can decide this, and where free help is; rule 4's fallback covers rule 6. Sealed prompt
hashes re-pinned; register v4 re-derived. Catches what the phrase list misses.

## Rulings taken on V's behalf (V can overturn any)

| Row | Question | Default taken | Why |
|---|---|---|---|
| V-1 | Phrase list or AI model to detect a crisis? | Phrase list (deterministic, instant, offline, same in browser and server); the prompt rule is the backstop | A model call on every question adds seconds and a failure mode; if it fails open a crisis slips, if it fails closed nobody can debate |
| V-2 | "Continue anyway" button on the screen? | None — a false alarm is fixed by rewording | A bypass one click away from "should I kill myself" is the debate V ruled out |
| V-3 | Count or record screen showings? | Nothing recorded, not even a counter | "We did not keep what you wrote" must be literally true |
| V-4 | Which helplines, and who re-checks them? | Only numbers confirmed on 2026-09-30; hours shown as the helpline publishes them (English); re-check owner open | A wrong number is dangerous; numbers change |
| V-5 | S02 edits the unmerged hate-speech rule | Ship crisis S01 together with hate-speech S01 + crisis S02, not alone | The phrase list misses paraphrases; rule 7 is their backstop. Any database that already sealed register v4 with hate-speech S01's hashes (the hs-test stack) refuses the new ones and needs a fresh volume |
| V-6 | Support chat | Unchanged (it already refuses self-harm with REFUSE_SAFETY) | Out of this goal; could show the same numbers later |
| V-7 | English with no region in the browser | Great Britain's lines first; the picker changes it | EU-first product; one default had to be picked |
| V-8 | Policy questions ("Should assisted suicide be legal?") | Still debated, under rules 6–7 | They are legitimate debates; the rule stops any side from condoning |
| V-9 | "Lethal dose of …" questions | Offer help (all languages) | Often asked by a person planning an overdose; a medical asker rewords |
| V-10 | Romania's order | depreHUB (24/7, anxiety/depression) above the ARPS suicide line (Fri–Sun nights only) | A line that answers now beats a better-matched line that is closed |

## Known limits (from the translator seats and the helpline research)

- **What the phrase check deliberately lets through** (too often ordinary talk): "I can't take it any more" on its own in
  most languages (de "ich kann nicht mehr", fr "je n'en peux plus", es "ya no puedo más", sv "jag orkar inte mer",
  he "אני לא יכול יותר"); a bare "Is life worth living?"; ro "mă omor" alone ("mă omor după ciocolată"); ru
  "выпилиться" (leaving a chat); a relative's past suicide (bereavement); transliterated Cyrillic. Rule 7 of S02 is the
  backstop for these.
- **False alarms accepted** (the person rewords): everyday hyperbole with a first-person "kill myself" (ro "mă
  sinucid", pl "zabiję się", es "me pego un tiro", he "בא לי להתאבד"); "lethal dose of …" medical questions; "I cut
  myself" said of an accident; third-person present "wants to kill himself" in literary questions; vi "co nen tu tu
  khong" typed with no accents at all.
- **Accent-exact phrases**: Vietnamese tự tử / tự vẫn use `accents: "keep"` (folded they equal từ từ "slowly" / tư vấn
  "advice"); Turkish ölürüm/asmak are matched only in context or with accents typed.
- **Native review wanted**: Maltese (the seat's own flag), then Irish.
- **Helplines**: 56 countries, 87 lines. No confirmed crisis line for Turkey and Peru (emergency number only); Egypt,
  Morocco and the Philippines are not listed (official pages unreachable or no national line). Bulgaria has only the
  children's line 116 111. Romania: depreHUB 0374 456 420 (24/7, anxiety/depression) first, the ARPS suicide line
  0800 801 200 runs only Fri–Sun 19:00–07:00; no confirmed Romanian operator for 116 123. Ukraine's Lifeline 7333 is
  paused. Several lines are regional (Bogotá 106, Buenos Aires 135, Abu Dhabi 800-SAKINA). Hours shown only where
  the confirming page published them; "Open 24/7" only where it said so.

## Review round 1 (independent Opus reviewer, verdict REWORK) — all findings addressed

1. CI: manifest refreshed (41 files); weekday arrays renamed to `"mon"…"sun"` (the depth oracle read `[1,2,3,4,5]` as a
   second depth domain).
2. 21/50 realistic phrasings missed → 16 English and 5 Romanian patterns added; every miss is now a fixture.
3. Event-loop stall → the API checks only questions within the 8 KB limit; the patterns are compiled at API start
   (`warmCrisisCheck`) and in the browser in 8 ms idle slices. Warm, 8 KB of any script checks in ≤ 50 ms.
4–5. Rules 6–7 rewritten (S02 commit 45aaa38ae): rule 6 no longer bans the pro side of assisted-dying law; rule 7
   targets the first free-text field, precedes rule 4's sentence, and leaves enum-only forms alone.
6. "Open 24/7" re-checked for all 67 lines: 65 confirmed on an official page (`hours-evidence-2026-09-30.json`);
   Malta 1579 and Portugal 1411 now show no hours.
7. "take my life in a new direction" and similar no longer trip; "lethal dose" kept on purpose (V-9).
8. Zero-width characters, soft hyphens and word joiners are removed; Cyrillic look-alike letters and digits inside
   Latin words ("k1ll") are folded; "my self" is accepted. Letter-spaced text ("k i l l") is not handled.
9–10. Phone numbers are isolated left-to-right in Arabic and Hebrew; the emergency number is a call link.
12. Esc, backdrop and initial-focus behaviour now tested.
