import { createLocalSpoolChaosCase } from "./chaos-support.js";

export const chaosBurstTenfoldCase = createLocalSpoolChaosCase({
  name: "chaos-burst-10x",
  mode: "burst-10x",
  minimumSpooled: 10,
});
