/**
 * Web search (plan 2026-10-30 task W1-5; design PERPLEXITY-DESIGN.md §7.1 item 7, approved by the owner as written on
 * 2026-10-30): the two sentences the comparing judges and the final writers read when the material carries the extract a
 * looked-up point rests on. They live here because three packages send them (@debateai/judgement's comparing judges,
 * @debateai/serve's answer writer, @debateai/story's storyteller).
 *
 * OWNER-EDITABLE instruction text, byte for byte the approved wording. The judges' and the answer writer's are sealed
 * inside the contract variants that carry them (engineContractHash), so editing one is a new variant and a new register
 * version; the storyteller's are code's, recorded in each story call's contract hash (as the reader sentences are).
 *
 * Item 7 reads "Judges and writer: <first sentence>. Writer: <second sentence>.": the judges are told the first, the
 * writers the first and then the second.
 */

/** Item 7, first sentence: the comparing judges and the writers. */
export const WEB_EXTRACT_WEIGH_SENTENCE =
  "A point marked as looked up comes with the extract it rests on; weigh the extract, not only the point's wording.";

/** Item 7, second sentence: the writers only. */
export const WEB_WRITER_SOURCE_SENTENCE = "When you use a looked-up point, name its source.";

/** The writers' two sentences, in order, joined as one instruction addition. */
export const WEB_WRITER_SENTENCES = `${WEB_EXTRACT_WEIGH_SENTENCE} ${WEB_WRITER_SOURCE_SENTENCE}` as const;
