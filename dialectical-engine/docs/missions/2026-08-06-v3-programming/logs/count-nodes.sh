#!/bin/zsh
# V's node census: level-by-level count for the newest debate (read-only)
cd /Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3 || exit 1
./node_modules/.bin/tsx --eval "
import { createRequire } from 'node:module';
const require = createRequire('/Users/vladmihaimiron/Documents/DebateAIRO/DebateAI-V3/package.json');
const pg = require('pg');
(async () => {
  const c = new pg.Client({host:'127.0.0.1',port:55432,user:'debateai',password:'debateai-acceptance-local',database:'debateai_acceptance'});
  await c.connect();
  const run = await c.query('SELECT run_id, question_line FROM core.run ORDER BY created_at_seq DESC LIMIT 1');
  const R = run.rows[0].run_id;
  console.log('DEBATE:', run.rows[0].question_line);
  const h = await c.query('SELECT depth, count(*) AS n FROM core.node WHERE run_id=\$1 GROUP BY depth ORDER BY depth', [R]);
  let total = 0;
  for (const x of h.rows) { total += Number(x.n); console.log('  level', Number(x.depth)+2, '(engine L'+x.depth+'):', x.n, 'nodes'); }
  console.log('  TOTAL:', total, 'nodes (plus your question card on top)');
  await c.end();
})();
"
