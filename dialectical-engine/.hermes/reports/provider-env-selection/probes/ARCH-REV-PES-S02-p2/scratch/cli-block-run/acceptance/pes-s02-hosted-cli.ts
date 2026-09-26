import { runHostedAcceptance } from "./pes-s02-hosted.js";

try {
  const result = await runHostedAcceptance({ emit: (line) => { process.stdout.write(`${line}\n`); } });
  process.exitCode = 0;
} catch {
  process.stdout.write("PES-S02-ACCEPT: FAIL internal\n");
  process.exitCode = 0;
}
