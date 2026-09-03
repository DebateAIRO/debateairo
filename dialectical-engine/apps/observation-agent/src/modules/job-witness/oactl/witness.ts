import { runWitnessCommand } from "../witness.js";

export default Object.freeze({
  verb: "witness",
  async run(args: readonly string[]): Promise<number> {
    return runWitnessCommand(args);
  }
});
