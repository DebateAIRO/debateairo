import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const argumentList = process.argv.slice(2);
const promptIndex = argumentList.indexOf("-z");
const prompt = promptIndex >= 0 ? argumentList[promptIndex + 1] ?? "" : "";

if (process.env.HERMES_HOME) {
  mkdirSync(process.env.HERMES_HOME, { recursive: true });
  writeFileSync(join(process.env.HERMES_HOME, "session.sqlite"), "fake transcript");
}

if (process.env.FAKE_HERMES_FAIL === "1") {
  process.exitCode = 17;
} else if (prompt.includes("acceptance transport handshake")) {
  process.stdout.write(`${process.env.FAKE_HERMES_BAD_HANDSHAKE === "1" ? "NOT_OK" : "OK"}\n`);
} else {
  process.stdout.write(`${JSON.stringify({
    prompt,
    argumentList,
    environment: process.env
  })}\n`);
}
