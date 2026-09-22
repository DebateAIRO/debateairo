import type { PromptFramePresence } from "./prompt-frame.js";

/**
 * V-11 ADDENDUM, LAYER 5 — TRIPWIRES.
 *
 * Two instruments, and the owner's ruling is explicit about what they are:
 * SIGNALS recorded on the run, never gates. Nothing here refuses a call,
 * rejects an answer or changes a verdict. A flagged step is a step someone can
 * look at; layers 6-8 (measured resistance, swap checks, a human look) are the
 * later decisions that would act on them.
 *
 *  · THE CANARY. The frame plants a fresh per-call marker in the system message
 *    and tells the model never to repeat it. A model that echoes it has let the
 *    fenced material speak for it — the cheapest structural evidence there is
 *    that the compartments were crossed. The boundary marker itself is watched
 *    the same way.
 *
 *  · THE INSTRUCTION-LIKE SCAN. A light pattern scan over the INCOMING material
 *    in English and Romanian. It is deliberately shallow: it is a flag on the
 *    step, so a false positive costs a look and a false negative costs nothing
 *    that the compartments were not already carrying.
 *
 * CONSTRAINT 6 IS THE HARD RULE HERE. A signal carries a typed code, the
 * code-owned field NAME and a capped COUNT. It never carries the material, the
 * answer, an excerpt, a normalised form, an offset into the text or the canary
 * itself — anything from which the text could be reconstructed or recognised.
 */

export const PROMPT_TRIPWIRE_SIGNALS = [
  /** The answer repeated the per-call canary the system message forbade. */
  "PROMPT_CANARY_ECHOED",
  /** The answer reproduced the boundary marker that delimits the material. */
  "PROMPT_FENCE_ECHOED",
  /** Incoming material reads like an instruction rather than like evidence. */
  "PROMPT_MATERIAL_INSTRUCTION_LIKE"
] as const;

export type PromptTripwireSignalCode = typeof PROMPT_TRIPWIRE_SIGNALS[number];

export interface PromptTripwireSignal {
  readonly signal: PromptTripwireSignalCode;
  /** The step's sealed contract id. Engine vocabulary, never model text. */
  readonly contractId: string;
  /** The code-owned material field, or `null` when the signal is about the answer. */
  readonly field: string | null;
  /** Capped count of matches. A flood must not become a side channel. */
  readonly hits: number;
}

/** A count above this says "many"; the exact number is not worth a channel. */
const HITS_CAP = 16;

/**
 * Instruction-like phrasing, English and Romanian, with and without diacritics
 * (Romanian text routinely arrives stripped of them, and an attacker would
 * strip them on purpose). Every pattern is anchored on a VERB OF COMMAND or on
 * a frame-forgery token, so ordinary debate prose — which argues rather than
 * orders — does not match.
 *
 * This list is a signal's sensitivity, not a defence: the defence is the
 * compartment, which holds whether or not a phrase is listed here.
 */
const INSTRUCTION_LIKE = Object.freeze([
  // — English: override and role-play —
  /\bignore\s+(all\s+|any\s+|the\s+)?(previous|prior|above|preceding|earlier)\b/iu,
  /\bdisregard\s+(all\s+|any\s+|the\s+)?(previous|prior|above|preceding|earlier|instructions)\b/iu,
  /\bforget\s+(everything|all)\b/iu,
  /\byou\s+are\s+now\b/iu,
  /\bact\s+as\s+(an?|the)\b/iu,
  /\bpretend\s+(to\s+be|you\s+are)\b/iu,
  /\bfrom\s+now\s+on\b/iu,
  /\bnew\s+instructions?\b/iu,
  /\bsystem\s+(prompt|message)\b/iu,
  /\b(reveal|repeat|print|output|restate)\s+(your|the)\s+(instructions?|prompt|system|rules?)\b/iu,
  /\boverrides?\s+(the\s+)?(above|previous|prior|rules?|instructions?)\b/iu,
  /\bdo\s+not\s+follow\b/iu,
  // — frame forgery, language-independent —
  /<\/?\s*(system|instructions?|assistant|user)\s*>/iu,
  /\[\/?\s*(INST|SYSTEM|ASSISTANT)\s*\]/iu,
  /\bBEGIN\s+SYSTEM\b/iu,
  /\bEND\s+OF\s+(EVIDENCE|DATA|MATERIAL|CONTEXT)\b/iu,
  // — Romanian: override and role-play, with and without diacritics —
  /\bignor(a|ă|ati|ați|e|eaza|ează)\s+(toate\s+|orice\s+)?instruc(t|ț)iunile\b/iu,
  /\bnu\s+(mai\s+)?(tine|ține|tineti|țineți)\s+cont\s+de\b/iu,
  /\buit(a|ă|ati|ați)\s+(tot|totul|instruc(t|ț)iunile)\b/iu,
  /\b(esti|ești|sunte(t|ț)i)\s+acum\b/iu,
  /\bac(t|ț)ioneaz(a|ă)\s+ca\b/iu,
  /\bcomport(a|ă)-te\s+ca\b/iu,
  /\bprefa-te\s+c(a|ă)\b/iu,
  /\binstruc(t|ț)iuni\s+noi\b/iu,
  /\bde\s+acum\s+(inainte|înainte)\b/iu,
  /\bprompt(ul)?\s+de\s+sistem\b/iu,
  /\bmesaj(ul)?\s+de\s+sistem\b/iu,
  /\bdezv(a|ă)luie\s+(instruc(t|ț)iunile|promptul|regulile)\b/iu,
  /\bnu\s+urma\s+(instruc(t|ț)iunile|regulile)\b/iu,
  /\banuleaz(a|ă)\s+(instruc(t|ț)iunile|regulile)\b/iu
]);

function countInstructionLike(text: string): number {
  let hits = 0;
  for (const pattern of INSTRUCTION_LIKE) {
    if (pattern.test(text)) {
      hits += 1;
      if (hits >= HITS_CAP) return HITS_CAP;
    }
  }
  return hits;
}

function occurrences(haystack: string, needle: string): number {
  if (needle === "") return 0;
  return Math.min(haystack.split(needle).length - 1, HITS_CAP);
}

/**
 * Scan ONE hand-off. `frame` comes from the door (`readPromptFrame`), so the
 * scan sees exactly the bytes the provider saw and a caller cannot hand it a
 * different, tidier copy.
 */
export function scanPromptTripwires(input: {
  readonly frame: PromptFramePresence;
  readonly contractId: string;
  readonly answer: string;
}): readonly PromptTripwireSignal[] {
  const signals: PromptTripwireSignal[] = [];
  const canaryHits = occurrences(input.answer, input.frame.canary);
  if (canaryHits > 0) {
    signals.push(Object.freeze({
      signal: "PROMPT_CANARY_ECHOED" as const, contractId: input.contractId, field: null, hits: canaryHits
    }));
  }
  const fenceHits = occurrences(input.answer, input.frame.fence);
  if (fenceHits > 0) {
    signals.push(Object.freeze({
      signal: "PROMPT_FENCE_ECHOED" as const, contractId: input.contractId, field: null, hits: fenceHits
    }));
  }
  for (const field of input.frame.fields) {
    const hits = countInstructionLike(field.content);
    if (hits > 0) {
      signals.push(Object.freeze({
        signal: "PROMPT_MATERIAL_INSTRUCTION_LIKE" as const,
        contractId: input.contractId,
        field: field.name,
        hits
      }));
    }
  }
  return Object.freeze(signals);
}
