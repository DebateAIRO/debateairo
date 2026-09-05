import { homedir } from "node:os";
import { ObservationError } from "../../../core/errors.js";
import { fixedStateDirectory } from "../../../oactl/core/state.js";
import { writeAcknowledgement } from "../acknowledgements.js";

export default Object.freeze({
  verb: "ack",
  async run(args: readonly string[]): Promise<number> {
    if (args.length !== 1) throw new ObservationError("OBSERVATION_ARGUMENTS_INVALID");
    await writeAcknowledgement({ stateDir: fixedStateDirectory(homedir()), signalId: args[0]! });
    return 0;
  }
});
