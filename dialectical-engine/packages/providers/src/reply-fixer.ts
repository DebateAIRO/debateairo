/**
 * LG-A (spec 2026-10-15, L31-L34; INTERFACE §2.3): the reply fixer and the failure classes.
 *  · STRUCTURE: unreadable JSON from a reply that ended normally and has visible text, or a schema refusal whose every issue
 *    is about form (an unknown key, a wrong nesting, a wrong container or text form);
 *  · CONTENT: a refusal that needs words or values only the AI can give;
 *  · CUT_OFF: the reply ended at its token limit;
 *  · EMPTY: no visible answer text.
 */
export const REPLY_FAILURE_CLASSES = Object.freeze(["STRUCTURE", "CONTENT", "CUT_OFF", "EMPTY"] as const);
export type ReplyFailureClass = typeof REPLY_FAILURE_CLASSES[number];
