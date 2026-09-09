import { runOactl } from "./commands.js";

const exitCode = await runOactl(process.argv.slice(2), {
  stdout(value) { process.stdout.write(`${value}\n`); },
  stderr(value) { process.stderr.write(`${value}\n`); }
});
process.exitCode = exitCode;
