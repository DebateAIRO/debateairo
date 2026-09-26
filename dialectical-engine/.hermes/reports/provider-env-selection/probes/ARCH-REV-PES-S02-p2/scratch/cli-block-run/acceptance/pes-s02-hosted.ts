export async function runHostedAcceptance(deps: { emit(line: string): void }): Promise<{ outcome: "PASS" | "FAIL" | "UNVERIFIED" }> {
  const o = process.env.PROBE_OUTCOME;
  if (o === "THROW") throw new Error("/secret/path/custody.d must never print");
  deps.emit("PES-S02 SCRATCH-DIR /tmp/pes-s02-x");
  const verdict = o === "PASS" ? "PES-S02-ACCEPT: PASS" : o === "FAIL" ? "PES-S02-ACCEPT: FAIL admitted" : "PES-S02-ACCEPT: UNVERIFIED dns ENOTFOUND";
  deps.emit(verdict);
  return { outcome: o as "PASS" | "FAIL" | "UNVERIFIED" };
}
