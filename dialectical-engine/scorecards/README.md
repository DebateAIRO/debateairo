# Model scorecards

`current.json` in this folder is the public model scorecard the engine reads in **local mode**
(spec `docs/superpowers/specs/2026-09-26-model-scorecard-and-picker-design.md` §2.8). It is one
version behind the website's.

- It is **absent until the owners approve the first scorecard**. While it is absent, every ask
  keeps the plan rosters (`PLAN_TIER_ROSTERS`), exactly as before scorecards existed.
- The file may be at most **64 KiB** (65,536 bytes), and so may the scorecard as the register stores it. That is the
  same limit the hosted site publishes under, so one file is accepted or refused the same way in both modes.
- A file that fails validation is **refused, never half-applied**. The API prints
  `MODEL_SCORECARD state=REFUSED reason=…` when it starts and also keeps the plan rosters.
- The **hosted site never reads this file**. It reads the sealed `modelScorecard` register row,
  published with `pnpm register:publish-hosted --scorecard <file>` (`deploy/vps/register/README.md`).
- Every change to this file is a new approved scorecard with a higher `scorecardVersion`, committed
  on its own. Because it changes how every local ask chooses its models, that commit runs the
  acceptance, render and integration suites.
