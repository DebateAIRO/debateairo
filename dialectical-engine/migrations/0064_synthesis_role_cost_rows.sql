-- W10/3 (`board/W10-call-budget-truthfulness.md` section 3, source audit
-- `audits/token-budget-reasoning.md`) · the schema half of "new sealed rows
-- land via MIGRATION + the deployment-register seeding path" (T16, goal-v4
-- lines 80-96). T16 remains the sole owner of the row/schema/migration shape;
-- this migration only EXTENDS its manifest with the two rows W10 mints.
--
-- The defect these rows close: the SYNTHESIZER borrowed COMPOSER's cost bound
-- and the EVALUATOR borrowed CONFORMANCE's -- two organs T9 retired -- so both
-- carried `deadlineMs` 60_000 while the JUDGE, which answers about a single
-- node, carried 180_000. The synthesizer reads the whole digest and writes the
-- served answer; the evaluator reads digest, label and candidate and must
-- return a reasoned objection. The two hardest calls had the shortest clock,
-- because T9 changed WHO calls and WHAT is asked without minting bounds to
-- match, and the cost envelope still described the retired architecture.
--
-- Family: `synthesisRoles`, on purpose. That family is already read at every
-- deployment's boot (`readSynthesisRoleControls`), so a register that never
-- sealed these rows fails loudly THERE, naming the missing key, instead of at
-- the first served answer.
--
-- Nothing else changes: `register.assert_required_rows` (0050) and the
-- publication trigger (0061) already enforce the manifest, and both seeding
-- paths mint these rows through `buildAlgorithmRegisterRows`, so declared
-- versions 5 (development) and 2 (acceptance) carry them without another
-- INSERT here. `tokenCeiling` deliberately stays 2048: item 1 of the ticket
-- makes a hit visible, and the first approved live run reports
-- `usage.completion_tokens` per attempt, so the ceiling is set from data rather
-- than from an estimate.

INSERT INTO register.required_row (row_key, row_family, source_ref) VALUES
  ('synthesizerCallBound', 'synthesisRoles',
   'algorithm-live-loop-board/W10-call-budget-truthfulness.md#3'),
  ('evaluatorCallBound',   'synthesisRoles',
   'algorithm-live-loop-board/W10-call-budget-truthfulness.md#3')
ON CONFLICT (row_key) DO NOTHING;
