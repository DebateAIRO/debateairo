import { createFaultPortGatedChaosCase } from "./chaos-support.js";

export const chaosDiskFullReadOnlyCase = createFaultPortGatedChaosCase("chaos-disk-full-ro");
