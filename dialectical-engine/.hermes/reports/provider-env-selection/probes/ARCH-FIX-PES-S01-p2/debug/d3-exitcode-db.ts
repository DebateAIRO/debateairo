// ARCH-FIX-PES-S01-p2 probe d3b — does `process.exitCode = 1` survive a start/stop of the embedded database?
import { startTestDatabase } from "/Users/vladmihaimiron/Documents/DebateAIRO/dialectical-engine/.worktrees/pes-s01/dialectical-engine/tests/support/testDatabase.js";
const { info, log } = console; console.info = () => undefined; console.log = () => undefined;
const database = await startTestDatabase();
await database.stop();
console.info = info; console.log = log;
process.stdout.write("d3b stopped; set exitCode=1\n");
process.exitCode = 1;
