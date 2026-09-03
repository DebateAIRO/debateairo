import type { ObservationSignal } from "../core/signals.js";
import { signalSchema } from "../core/signals.js";
import type { ObservationJournal } from "../journal/journal.js";
import { appendDigest } from "../notify/digest.js";

export type SignalMirror = Readonly<{
  mirrorSignal(signal: ObservationSignal): Promise<void>;
}>;

export async function persistSignal(input: Readonly<{
  signal: unknown;
  journal: ObservationJournal;
  mirror: SignalMirror;
}>): Promise<Readonly<{ mirrored: boolean }>> {
  const signal = signalSchema.parse(input.signal);
  await input.journal.appendSignal(signal);
  await appendDigest(input.journal.stateDir, signal);
  try {
    await input.mirror.mirrorSignal(signal);
    return Object.freeze({ mirrored: true });
  } catch {
    return Object.freeze({ mirrored: false });
  }
}
