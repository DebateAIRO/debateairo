import { EVALUATOR_CONTRACT_TEXT, evaluatorVerdictSchema } from "@debateai/runner";

/**
 * F-SEALEDROWS-B — the acceptance provider doubles' half of the T9 EVALUATOR
 * protocol, in ONE place.
 *
 * T9 replaced two provider limbs (per-segment `{conforms,findings}` conformance
 * and the post-compose `{pass}` R9 check) with a SINGLE evaluator verdict. Every
 * acceptance double kept answering the two retired organs, so none of them could
 * answer the call the runner actually makes: `ceremony.test.ts` served the head
 * of its FIFO queue to a request of a class it did not recognise, and
 * `panel-multi-maker.test.ts` refused with `PANEL_DOUBLE_UNCLASSIFIED_CALL` and
 * printed the unanswered packet verbatim.
 *
 * Three doubles carried three copies of a shape that had already drifted once.
 * They share this module so the next protocol move breaks them together and
 * loudly, rather than one at a time and silently.
 *
 * Nothing here is restated from memory: the discriminator IS the prompt the
 * runner sends, and the response is validated by the schema the runner parses
 * it with.
 */

/**
 * The discriminator is the SHIPPED constant, not a fragment copied out of it.
 *
 * `ceremony.test.ts`'s T3 N4 note records the trap this avoids: the rendered
 * packet reaches the wire JSON-encoded, so a discriminator containing a quote
 * arrives escaped (`\"`), never matches, and the double falls through to a
 * fallback that answers the wrong class — a dead check that looks alive. That
 * only stays true while the contract text itself carries no character JSON
 * escapes, so this asserts it at import instead of assuming it. A future edit
 * that puts a quote, backslash or newline into the prompt fails here, where the
 * cause is named, rather than three suites away as a schema error.
 */
const encoded = JSON.stringify(EVALUATOR_CONTRACT_TEXT);
if (encoded !== `"${EVALUATOR_CONTRACT_TEXT}"`) {
  throw new Error(
    "EVALUATOR_CONTRACT_TEXT_NOT_ESCAPE_SAFE: the EVALUATOR system prompt no longer survives "
    + "JSON encoding unchanged, so a substring match against it is a dead discriminator"
  );
}

/**
 * True when this wire body is the EVALUATOR role call — the request carrying
 * `EVALUATOR_CONTRACT_TEXT` as its system message.
 */
export function isEvaluatorPacket(requestBody: string): boolean {
  return requestBody.includes(EVALUATOR_CONTRACT_TEXT);
}

/**
 * A satisfied verdict in the CURRENT wire shape.
 *
 * `evaluatorVerdictSchema` is the runner's own strict parser for this response,
 * so `parse` fails here — at fixture construction, by name — if a criterion is
 * added, renamed or removed. That is the failure this module exists to force:
 * a double whose answer no longer fits the schema must stop the suite, never
 * quietly hand back a shape nobody asked for.
 *
 * Satisfied ends `runSynthesisLoop` in round 1, which is what these fixtures
 * want: they assert the SERVED ANSWER, not the loop's retry path. The retry
 * path is pinned by the round-aware double in
 * `tests/integration/t17-envelope-ledger.test.ts`.
 */
export function evaluatorSatisfied(): string {
  return JSON.stringify(evaluatorVerdictSchema.parse({
    satisfied: true,
    objection: null,
    criteria: {
      fairness_to_losers: true,
      statement_label_agreement: true,
      no_overstatement: true,
      restatement: true,
      citation_tracing: true
    }
  }));
}
