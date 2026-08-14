const prompt = process.argv.at(-1) ?? "";

if (prompt.includes("FAIL_CLI")) {
  process.stderr.write("intentional fake CLI failure\n");
  process.exitCode = 17;
} else if (prompt.includes("TIMEOUT_CLI")) {
  setTimeout(() => process.stdout.write("late output\n"), 250);
} else {
  const content = JSON.stringify({ prompt, arguments: process.argv.slice(2) });
  process.stdout.write(`${JSON.stringify({
    type: "thread.started",
    thread_id: "01a000e7-3ea0-7f91-b166-7104741ef333"
  })}\n`);
  process.stdout.write(`${JSON.stringify({ type: "turn.started" })}\n`);
  process.stdout.write(`${JSON.stringify({
    type: "item.completed",
    item: { type: "agent_message", text: content }
  })}\n`);
  process.stdout.write(`${JSON.stringify({
    type: "turn.completed",
    usage: {
      input_tokens: 15490,
      cached_input_tokens: 0,
      cache_write_input_tokens: 0,
      output_tokens: 5,
      reasoning_output_tokens: 0
    }
  })}\n`);
}
