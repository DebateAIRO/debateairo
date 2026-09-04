import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("OBS-06 safe-view privacy boundary", () => {
  it("contains no private projection or direct agent grant", async () => {
    const sql = await readFile("migrations/0060_observation_throughput_views.sql", "utf8");
    expect(sql).not.toMatch(/question|prompt|parse_error|raw_text|metadata_json|content_ciphertext|user_id|session_id|asker_id|failure_code/iu);
    expect(sql).not.toMatch(/GRANT[\s\S]{0,100}(?:core\.|ledger\.)[\s\S]{0,100}debateai_observation_agent/iu);
  });
});
