## 2. Acceptance — V runs these, in a browser, on the real dev stack

Precondition: the MAIN https stack on `:3000` serves the merge candidate, and V is signed in.
Run steps 1–12 once in **Terracotta** (light) and once in **Chamber** — switch with the `☾` / `☀`
button in the top bar (`apps/ui/components/ModeToggle.tsx:32-43`, `aria-label` "Switch to Chamber
mode" / "Switch to Terracotta mode"). Every step is pass/fail by looking; UNVERIFIED is a legal
answer to any of them.

1. Open `/new`. A Free/Premium control is visible ABOVE the question box, and one of the two reads as
   chosen.
2. The chosen one is **Free**. (If V ruled otherwise at the mock gate, the expected state is the one
   `DONE.md` records, and this step follows `DONE.md`.)
3. The Free option names `gpt-5.6-luna` and `claude-sonnet-5`. The Premium option names
   `gpt-5.6-sol`, `claude-opus-5` and `grok-4.6`.
4. With Free chosen: Risk tier reads **Standard**, Composition budget tier reads **Low**, Tree depth
   reads **2**, and both steering boxes are empty.
5. Still in Free, try to change each of them — click `Casual`, click `High`, drag the depth slider,
   click into each steering box and type. Nothing moves, and nothing is typed.
6. Click `⚙ OPTIONS`. The panel opens in Free. Try each control inside it — the dropdowns will not
   open and the three sliders will not move.
7. Click into the question box and type a claim of more than six characters. The text appears.
   `Start run` becomes available.
8. Choose **Premium**. Every gauge from steps 4–6 becomes usable: set Risk tier to `High stakes`, set
   Composition budget tier to `High`, drag Tree depth to `4`, type one line into each steering box,
   and change one `⚙ OPTIONS` control.
9. Choose **Free** again. The gauges return to the step-4 values and lock again; the question text is
   still there, unchanged.
10. Choose **Premium** again. The gauges are usable again and show what step 9 left on screen — the
    step-8 values are NOT silently restored.
11. With **Free** chosen and a question typed, open the browser devtools Network tab, press
    `Start run`, and read the request body of `POST /v1/asks`: it carries `"plan_tier":"free"`, and
    the response is `202`.
12. Repeat step 11 with **Premium**: the body carries `"plan_tier":"premium"` and the response is
    `202`. (What the run then does with the tier — which models argue — is S02's acceptance, not
    this one. Until S02 lands, both tiers run the same fleet, and that is correct here.)

## 3. Out of scope for S01
