import { createLocalSpoolChaosCase } from "./chaos-support.js";

export const chaosDbDownCase = createLocalSpoolChaosCase({
  name: "chaos-db-down",
  mode: "db-down",
  minimumSpooled: 1,
});
