import { runWitnessCommand } from "./support/command.js";

export default Object.freeze({
  verb: "witness",
  async run(args: readonly string[]): Promise<number> {
    return runWitnessCommand(args);
  }
});
