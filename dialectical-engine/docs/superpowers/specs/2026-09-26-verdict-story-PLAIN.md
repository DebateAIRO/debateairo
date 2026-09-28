# The verdict story: what was built (plain summary)

For the owner. Written 28 September 2026, at the end of the work on branch `feature/2026-09-26-verdict-story`.
The full design is `2026-09-26-verdict-story-design.md` in this folder; its §14 holds your look-gate
answers, and §14.4.9 records what was built differently from the design, and why.

## In one paragraph

Every finished debate now comes with a story. An AI writes it in plain words, in the language of the
question, and a second AI checks it before anyone sees it. You see it on your debate page, a short
version appears on the public page, and a full report can be downloaded as a PDF. Separately, the
engine's money rule changed: a debate never ends without an answer because it ran out of money or
grew too big. The story never changes the verdict. It only explains it.

## What a person now sees

### The story strip on your debate page

- Under the AI notice there is a new strip, **"The story of this debate"**. You can fold it away
  with "Hide" and open it again with "Show".
- While the story is being written it says "Writing the full story of this debate…". This usually
  takes a few minutes, and the page updates by itself. Meanwhile the debate's usual answer is
  shown, so there is always something to read.
- The story leads with the answer, in human words:
  - **"Clear answer"**: one position came out strong and clearly ahead.
  - **"Close call"**: no position was clearly ahead. For example, two were nearly level, the AIs
    that weighed the leader disagreed, the leader was only middling, or there was too little to
    compare.
  - **"Best guess, weak evidence"**: even the best position is weak.
- Then come the positions the debate explored, each marked "Held up", "Partly held", "Fell" or
  "Set aside", and "What would change the answer".
- Sometimes a box titled **"Worth knowing"** adds a remark the storyteller thinks you should
  have, for example that a figure is from last year. It never changes the answer.
- If the checker was not fully satisfied, a gentle line says "Parts of this summary could not be
  fully double-checked."
- No scores, thresholds, point codes or engine words appear anywhere in the text a person reads.
  This was your look-gate rule, and tests check it in every language.
- **The language offer.** Suppose the question is in Romanian and you browse in English. The page
  then asks: "This debate is in Romanian (Română). Show the page in Romanian?", with
  "Switch to Romanian" and "No, thanks". Either way, the story strip and the PDF stay in the
  question's language. "No, thanks" is remembered for the rest of the browser session. (This
  works with the new flagless language switcher from `dev`.)

### The public page

- A published debate shows the **short story**: the headline, the summary, the positions and what
  would change the answer. It shows no point numbers (those only make sense next to the PDF's list).
- If the checker was not fully satisfied, the public page shows the same gentle line as your page:
  "Parts of this summary could not be fully double-checked." The checker's own words never appear
  there.
- A debate published before its story was ready keeps its old summary until you publish it again.

### The full report (PDF)

- The **"Download full report (PDF)"** button sits at the top of the story strip, on your own page
  only.
- The report has five parts: "In short", "The full story", "Why this answer" (the two or three
  reasons that decided it), "The points of the debate" (every point, numbered, so a mention like
  [P3] in the story can be looked up), and "About this report".
- It prints in **34 of the 35 languages**, with the right fonts for Cyrillic, Greek, Hebrew
  (right to left), Hindi, Chinese, Japanese and Korean.
- **Arabic waits for you.** The PDF library we use misplaces the dots of Arabic letters: for
  example "جوابنا" came out as "حوابنا". So for an Arabic question the button is hidden and the
  page says "The full report isn't available in this language yet." Your options:
  - (a) patch the PDF library ourselves and prove it with images;
  - (b) wait for the library's authors to fix it;
  - (c) use another PDF engine for Arabic only;
  - (d) keep Arabic hidden. This is how it stands today.

### Always an answer (the "floor")

- If no AI model could write the answer at all (the money ran out after every cheaper model was
  tried, the debate was too big, or a technical fault), the page no longer says "Components-only".
- Instead it shows the label in human words, then **"Our best answer:"**, then the debate's
  strongest position in its own words. The public page does the same.
- If that answer rests on less than usual (for example only one position existed), a line says
  "We had less to compare than usual for this answer."
- The honesty drawer still tells the true story underneath, for example "The page shows the
  debate's strongest position as the answer."
- A floor answer gets its story too, once its record is saved. If saving the record fails, there
  is no story, so the page never tells an answer it cannot show.
- Only a real technical failure (a run that crashed) has no answer. The page then shows `dev`'s
  failure line with the engine's raw reason, for example "Debate generation failed:
  RUNNER_EXECUTION_FAILED:RUN_CEILING_BELOW_FIRST_CALL". It is not a plain message yet (see the
  owner note "A failed debate still shows the engine's raw reason" below).

### A friendly daily-limit message

- When today's money for new debates is used up, a person trying to start one reads:
  **"We've reached today's limit for new debates. Please try again tomorrow."** It is in all 35
  languages, and it appears on the "new debate" page. The box on the home page is wired to show it
  too, but see the owner note about that box below.
- The hourly limit per person now reads: "There have been too many requests in a short time.
  Please wait a little, then try again."
- Neither message says "coordinator", "rate-limiting", a sum of money or an hour.

## What changed in the engine's money rule

Your rule: no debate ends without a verdict unless something is technically broken. Money and size
are never the reason.

- **Money is set aside for the answer.** A debate may spend 70% of its money while it is argued. The
  last 30% is kept for writing the answer. Writing the answer may go up to 20% over the debate's
  limit. Example: with a debate limit of $0.25, arguing may use $0.175, and the whole debate may
  reach $0.30.
- **A stop while arguing no longer skips the answer.** When the debate hits its limit (money, the
  number of calls, or a vendor that does not report what it charged), it stops arguing and writes
  the answer from what it has.
- **A cheaper model, if needed.** If the planned model cannot be paid, the same request goes to a
  cheaper model the debate is allowed to use. The checker then prefers a different model from the
  writer. If the cheaper model's draft or check is unusable, the round already written and checked
  is kept; in the first round, the floor answers. It never turns into a failed debate. The cheaper
  model is mentioned only in "About this report" (for example "A lower-cost AI model wrote this
  answer, to stay within the debate's budget.") and in your own records. It never appears in the
  verdict text.
- **A finished round is kept.** If a later round of answer-writing fails, the best round that was
  already written and checked is kept, instead of throwing it all away.
- **Big debates fit.** A debate of about 195 points used to be too large for the answer-writer and
  always ended without an answer. Now the engine shortens what it sends. As a last resort it keeps
  the positions and the most important points, and counts the rest. The report then says "The
  debate was very large, so the answer was written from its most important points."
- **The story has its own small budget:** $0.05 per story, plus a 20% margin, so $0.06. If that
  is not enough, it also tries a cheaper model. If even that fails, the page simply shows the answer
  without a story.
- **Your records.** For every answer, the engine keeps a note of the model that was planned, the
  one that actually wrote and checked it, what cut it short, and whether the floor was used. You
  can read it on the server with one command: `pnpm ops:serve-disclosure`, explained in
  `deploy/vps/README.md`.

### What the operator must do

1. **Publish the reserve and the margin.** The 30% and 20% are only examples in the server kit.
   On the hosted site they take effect when the next hosted register version (the sealed settings
   file) carries them: `serve_reserve_basis_points` 3000 and `serve_overrun_basis_points` 2000, or
   your own values. Until then they count as 0, and no money is kept for the answer. The go-live
   checklist has this as line 12.
2. **Deploy everything together.** The first money step (M1, the reserve) must never go live
   without the second (M2, "a stop while arguing still answers"). With the reserve alone, a debate
   would stop at 70% of its money and still end without an answer. This branch ships them as one.
   Do not publish the two values on a server running older code.
3. **The website and the API ship together.** The public list of debates now carries the floor
   label, and the old website insists on the exact old shape of that list. An old website in front
   of the new API would fail to show the list. (The new website reads an old API's list fine.)
   The runner goes first: it must never be older than the API. To roll back, the API goes first.
   The exact order is in `deploy/vps/README.md`, "Upgrading to the verdict-story release, and
   rolling it back".
4. **The day must hold one full debate plus its story.** With today's values that is
   $0.30 + $0.06 = $0.36. A daily limit below that is refused when you publish, and neither
   service will start.

## What is provisional

- **The story's budget:** $0.05 per story plus 20%. It is written into the code, not into your
  settings file, so changing it means a code change and a new publish. The first real runs will
  show the right number.
- **The reserve and the margin:** 30% and 20%. They are guesses until paid runs are measured.
- **The debate and day limits** ($0.25 per debate and $2 per day) are still the deliberately low
  temporary values for your first paid run. Every charge is now recorded as spent either while
  arguing or while writing the answer, so the first paid runs will show both amounts separately.
  The real limits are set from those measurements.
- **The site waits up to 40 minutes** for a story, then shows the answer without one.
- **The story shapes** (general, health, money decision, legal, factual, personal choice) are a first
  version. They are text files in `story-shapes/` that you can change. Every story records which
  version of the files wrote it.
- **The wordings.** For each new sentence, three wordings were written and the plainest one ships.
  You can pick another later (see the last section).

## Things you should know (owner notes)

- **The old "verdict banner".** It is a feature from `dev` behind a switch that is off today. It
  still says "The run did not settle this either way", and it does not know about the floor. If it
  is ever switched on, it needs rewording first.
- **Engine words on the public page.** Around the story, the public page's row of figures still
  shows "Judge coverage" and "Dialectical support". Your no-engine-words rule was applied to the
  story, not to that older row.
- **The verdict depends on tiny rounding.** The engine compares raw decimal numbers. So two
  positions scored 0.20 and 0.15 (exactly 0.05 apart) do not count as a tie, but 0.30 and 0.25
  do, because the computer stores those numbers slightly differently. Whether the engine should
  round before it compares is your call. It touches a sealed rule.
- **No limit on PDF downloads at once.** A signed-in owner can ask for many PDFs in a row, and each
  one takes real work on the server. A cap belongs in the hosting hardening. (The date in the file
  name is in UTC.)
- **The review catch-up has fewer calls.** An operator-only job re-checks points after the answer.
  It now counts as "arguing", so it cannot use the calls set aside for the answer: up to 18 fewer.
- **The translations need native speakers.** All 35 languages were translated by AI, offline.
  Worth a native check:
  - the sample stories in the eight non-Latin scripts;
  - rare accent-mark positions in pointed Hebrew and some uncommon Hindi letter clusters, which can
    still sit slightly off in the PDF;
  - one Maltese template;
  - a Hindi and cross-language term for "shared crux";
  - a mix of formal and informal address in Italian and Finnish;
  - the rewritten Arabic "less to compare" line.
- **The home page's box never starts a debate itself.** This is older `dev` behaviour, found
  here. Its request lacks the risk tier (how careful the debate should be), so the browser refuses
  it before sending anything, and the person is always passed on to the "new debate" page, which
  works and shows the daily-limit message. The box was given the same message, but it can only
  show once the box sends a complete request.
- **"Wait a little" can mean up to an hour.** The hourly limit message says "wait a little", but
  the wait can last up to an hour.
- **A small engine gap from before.** The judges' disagreement lowers a point's certainty in the
  records, but not the confidence shown for the answer.
- **A failed debate still shows the engine's raw reason.** When a debate fails for a technical
  reason, the page shows `dev`'s line "Debate generation failed: {reason}", and the reason is the
  engine's own code, for example "RUNNER_EXECUTION_FAILED:RUN_CEILING_BELOW_FIRST_CALL". That is
  not plain language, and it breaks your no-engine-words rule. Turning each failure reason into a
  plain line in all 35 languages is a follow-up. The new code `RUN_CEILING_BELOW_FIRST_CALL`
  (the debate's money for arguing cannot pay for even its first call) shows up through this same
  line.
- **A question for you: the planned model's own unusable answer.** If the planned model (not a
  cheaper stand-in) writes an unusable draft or check even after its retries, the debate still
  fails, as before. For a cheaper stand-in the engine now keeps the checked round or uses the
  floor instead. Whether the planned model should be treated the same way is your call.

## Wordings you can choose from later

Unless marked otherwise, the first wording of each is the one shipped.

- **Lead-in to the floor answer:** "Our best answer:" / "Our answer:" / "What we would go with:"
- **Thin basis:** "This answer rests on less evidence than usual." / "Fewer points of view than
  usual went into this answer." / "We had less to compare than usual for this answer." (The third
  ships: it is the most exact.)
- **Lower-cost writer:** "A lower-cost AI model wrote this answer, to stay within the debate's
  budget." / "To stay within the debate's budget, this answer was written by a lower-cost AI
  model." / "This answer was written by a less expensive AI model, so the debate stayed within its
  budget."
- **Floor, money:** "No AI model could write the full answer within the debate's budget, so this
  answer is the debate's strongest position." / "The debate's budget did not stretch to a full
  written answer, so the answer shown is the position that came out strongest." / the design's
  own "…so this answer is the debate's leading position."

## Not built yet (follow-ups)

- Rewriting a story that was lost because the runner stopped halfway through it.
- A way for you to edit the story shapes safely: sealed versions and a rules check, and later tuning
  by the evaluator.
- A PDF for public readers, clickable point references on the site, and a "write the story again"
  button.
- A web page for your records. Today the records are read with the server command above.
- A plain message for a failed debate, in place of the engine's raw reason.
