const prompt = process.argv.at(-1) ?? "";

if (prompt.includes("FAIL_CLI")) {
  process.stderr.write("intentional fake CLI failure\n");
  process.exitCode = 17;
} else if (prompt.includes("TIMEOUT_CLI")) {
  setTimeout(() => process.stdout.write("late output\n"), 250);
} else {
  const modelArgument = process.argv.find((argument) => argument.startsWith("model=")) ?? null;
  process.stdout.write(`${prompt}\n${JSON.stringify({ prompt, modelArgument })}\n`);
}
