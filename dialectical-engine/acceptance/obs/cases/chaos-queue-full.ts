import { createFaultPortGatedChaosCase } from "./chaos-support.js";

export const chaosQueueFullCase = createFaultPortGatedChaosCase("chaos-queue-full");
