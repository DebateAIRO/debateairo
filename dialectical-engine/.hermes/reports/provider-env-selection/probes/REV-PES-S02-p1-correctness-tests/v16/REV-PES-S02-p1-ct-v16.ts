// V-16 probe (head dfef0de94): does runHostedAcceptance impose ANY deadline on DNS? A lookup that never calls back
// must leave the run pending (no UNVERIFIED-by-timeout). A 3 s timer keeps the loop alive and then reports.
const { runHostedAcceptance } = await import(process.env.WORKTREE + "/acceptance/pes-s02-hosted.ts");
let settled = "pending";
const lines: string[] = [];
void runHostedAcceptance({ lookup: (() => undefined) as never, emit: (l: string) => { lines.push(l); } })
  .then((r: { outcome: string }) => { settled = `settled ${r.outcome}`; });
await new Promise((r) => setTimeout(r, 3000));
console.log(`after 3000 ms: ${settled}; lines=${JSON.stringify(lines.map((l) => l.replace(/\/.*$/, "<path>")))}`);
const scratch = lines[0]?.slice("PES-S02 SCRATCH-DIR ".length);
if (scratch) { const { rm } = await import("node:fs/promises"); await rm(scratch, { recursive: true, force: true }); console.log("probe removed its pending run's scratch root"); }
process.exit(0);
