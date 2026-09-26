import { readFileSync } from "node:fs";
import { parseScorecard, type Scorecard } from "@debateai/scorecard";

/** The engine version every scorecard test parses at: the root package.json version. */
export const TEST_ENGINE_VERSION = "0.1.0";

const EXAMPLE_SCORECARD_URL = new URL("../../packages/scorecard/fixtures/example-scorecard.json", import.meta.url);

/** A fresh, mutable copy of the example file, exactly as a caller reads it from disk. */
export function readExampleScorecardJson(): unknown {
  return JSON.parse(readFileSync(EXAMPLE_SCORECARD_URL, "utf8")) as unknown;
}

/** The example, parsed. A refusal here is a broken fixture, and it fails loudly. */
export function exampleScorecard(): Scorecard {
  const parsed = parseScorecard(readExampleScorecardJson(), TEST_ENGINE_VERSION);
  if (parsed.state !== "VALID") {
    throw new Error(`the example scorecard is refused: ${parsed.reason}: ${parsed.detail}`);
  }
  return parsed.scorecard;
}
