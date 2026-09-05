import { appendFileSync } from "node:fs";

const [eventPath, prompt] = process.argv.slice(2);
if (eventPath === undefined || prompt === undefined) {
  process.stderr.write("SUPPORT_SWITCH_RECORDER_ARGUMENTS_INVALID\n");
  process.exitCode = 2;
} else {
  try {
    const parsedPrompt = JSON.parse(prompt);
    const messages = Array.isArray(parsedPrompt?.messages) ? parsedPrompt.messages : [];
    const content = messages.find((message) =>
      typeof message?.content === "string"
      && message.content.startsWith("support-switch-nonce:"))?.content;
    if (content === undefined) throw new Error("SUPPORT_SWITCH_NONCE_MISSING");
    const nonce = content.slice("support-switch-nonce:".length);
    if (nonce.length === 0) throw new Error("SUPPORT_SWITCH_NONCE_EMPTY");
    appendFileSync(eventPath, `${JSON.stringify({ nonce, atMs: Date.now(), pid: process.pid })}\n`, {
      encoding: "utf8",
      flag: "a"
    });
    process.stdout.write(JSON.stringify({
      content: `spawn-recorded:${nonce}`,
      model: "fixture:support-switch-spawn-recorder"
    }));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 3;
  }
}
