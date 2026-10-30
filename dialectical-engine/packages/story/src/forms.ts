/**
 * DATA BLOCKS (owner decisions 2026-10-30): the kinds of question a report's charts and tables are chosen by. The block
 * call names one kind; code keeps only the blocks that kind's menu allows. The first nine compare things a reader can
 * see side by side; the last eight are answered in words, so their menu is empty and their report carries no block.
 * The ranking of the answers is code's, never on a menu: it goes in the list of points for a kind with an empty menu.
 */
export const STORY_QUESTION_FORMS = Object.freeze([
  "pick-option", "yes-no", "is-it-true", "how-much", "best-way", "money-tradeoff", "why-cause", "prediction", "trend",
  "values", "personal", "taste", "interpretation", "definition", "hypothetical", "private-person", "simple-fact"
] as const);
export type StoryQuestionForm = typeof STORY_QUESTION_FORMS[number];

/** What each kind of question is, as the block call reads it. */
export const STORY_QUESTION_FORM_MEANINGS: Readonly<Record<StoryQuestionForm, string>> = Object.freeze({
  "pick-option": "choosing among options the question names",
  "yes-no": "whether to do one thing",
  "is-it-true": "whether a claim is true",
  "how-much": "an amount, a price or a count",
  "best-way": "the best way to do something, among ways the debate found",
  "money-tradeoff": "a choice between ways of spending, saving or earning money",
  "why-cause": "why something happened",
  "prediction": "whether something will happen",
  "trend": "whether something is rising or falling over time",
  "values": "what is right or wrong",
  "personal": "a relationship, a feeling or a personal matter",
  "taste": "which is better as a matter of taste",
  "interpretation": "what a work, a text or an event means",
  "definition": "what a word or a category covers",
  "hypothetical": "what would have happened if things had been different",
  "private-person": "what a private person thinks, did or meant",
  "simple-fact": "a single fact with one answer"
});

/** A block a model may plan: the two chart kinds and the two table kinds. */
export type StoryBlockKind = "bar" | "scatter" | "compare" | "pros_cons";
export const STORY_BLOCK_KINDS: readonly StoryBlockKind[] = Object.freeze(["compare", "pros_cons", "bar", "scatter"]);

/** The blocks each kind of question may carry (owner decisions 2026-10-30). */
export const STORY_BLOCK_MENU: Readonly<Record<StoryQuestionForm, readonly StoryBlockKind[]>> = Object.freeze({
  "pick-option": Object.freeze(["compare", "pros_cons", "bar", "scatter"] as const),
  "yes-no": Object.freeze(["pros_cons", "bar"] as const),
  "is-it-true": Object.freeze(["pros_cons", "bar"] as const),
  "how-much": Object.freeze(["compare", "bar", "scatter"] as const),
  "best-way": Object.freeze(["compare", "pros_cons", "bar", "scatter"] as const),
  "money-tradeoff": Object.freeze(["compare", "pros_cons", "bar", "scatter"] as const),
  "why-cause": Object.freeze(["pros_cons", "bar"] as const),
  "prediction": Object.freeze(["pros_cons", "bar"] as const),
  "trend": Object.freeze(["compare", "bar", "scatter"] as const),
  "values": Object.freeze([] as const),
  "personal": Object.freeze([] as const),
  "taste": Object.freeze([] as const),
  "interpretation": Object.freeze([] as const),
  "definition": Object.freeze([] as const),
  "hypothetical": Object.freeze([] as const),
  "private-person": Object.freeze([] as const),
  "simple-fact": Object.freeze([] as const)
});

export function storyQuestionFormOf(value: unknown): StoryQuestionForm | null {
  return typeof value === "string" && (STORY_QUESTION_FORMS as readonly string[]).includes(value) ? value as StoryQuestionForm : null;
}

/** A kind of question answered in words only: no block in its story, its ranking in the list of points. */
export function storyFormIsProseOnly(form: StoryQuestionForm | null): boolean {
  return form !== null && STORY_BLOCK_MENU[form].length === 0;
}
