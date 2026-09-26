// Imports the hosted acceptance module (the CLI's only import) WITHOUT running it; reports beforeExit/exit listeners.
const w = process.env.WORKTREE;
const before = { beforeExit: process.listenerCount("beforeExit"), exit: process.listenerCount("exit") };
await import(w + "/acceptance/pes-s02-hosted.ts");
const after = { beforeExit: process.listenerCount("beforeExit"), exit: process.listenerCount("exit") };
console.log("LISTENERS before", JSON.stringify(before), "after", JSON.stringify(after));
const cjs = Object.keys((await import("node:module")).createRequire(import.meta.url).cache);
console.log("CJS-CACHE", cjs.length, cjs.filter((k) => /embedded-postgres|async-exit-hook|standing-db|[\\/]pg[\\/]/.test(k)).join(","));
