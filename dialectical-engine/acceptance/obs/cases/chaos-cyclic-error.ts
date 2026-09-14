import { createLocalSpoolChaosCase } from "./chaos-support.js";

export const chaosCyclicErrorCase = createLocalSpoolChaosCase({
  name: "chaos-cyclic-error",
  mode: "cyclic-error",
  minimumSpooled: 1,
});
