import type { ObsAcceptanceCase } from "../index.js";
import { chaosBurstTenfoldCase } from "./chaos-burst-10x.js";
import { chaosCrashDuringFlushCase } from "./chaos-crash-during-flush.js";
import { chaosCyclicErrorCase } from "./chaos-cyclic-error.js";
import { chaosDbDownCase } from "./chaos-db-down.js";
import { chaosDiskFullReadOnlyCase } from "./chaos-disk-full-ro.js";
import { chaosQueueFullCase } from "./chaos-queue-full.js";
import { chaosRecoveryReingestCase } from "./chaos-recovery-reingest.js";
import { chaosRecursiveWriterCase } from "./chaos-recursive-writer.js";
import { chaosRedactorFailureCase } from "./chaos-redactor-failure.js";

export { evaluateChaosObservation } from "./chaos-support.js";
export type { ChaosObservation } from "./chaos-support.js";

export const CHAOS_CASES: readonly ObsAcceptanceCase[] = Object.freeze([
  chaosDbDownCase,
  chaosDiskFullReadOnlyCase,
  chaosQueueFullCase,
  chaosCyclicErrorCase,
  chaosBurstTenfoldCase,
  chaosRedactorFailureCase,
  chaosRecursiveWriterCase,
  chaosCrashDuringFlushCase,
  chaosRecoveryReingestCase,
]);
