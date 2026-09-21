import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { createRunnerProviderTopology } from "../../apps/runner/src/provider-topology.js";

describe("production runner provider topology", () => {
  it.each([1, 2, 4])("wires all %i configured providers without a fixed panel size", (size) => {
    const targets = Array.from({ length: size }, (_, index) => Object.freeze({
      providerRef: `provider-${index + 1}`,
      maker: `maker-${index + 1}`,
      baseUrl: `http://127.0.0.1:${9200 + index}/v1`,
      model: `model-${index + 1}`
    }));
    const topology = createRunnerProviderTopology(targets, (target) => ({
      call: async () => ({
        rawArtifactRef: "raw", ledgerEntryRef: "ledger", content: "{}",
        provider: "openai-compatible-http" as const, model: target.model,
        maker: target.maker, modelVersion: target.model
      })
    }));

    expect(topology.primary.providerRef).toBe("provider-1");
    expect(topology.critique?.providerRef).toBe(size > 1 ? "provider-2" : undefined);
    expect(topology.additionalMakers.map((row) => row.providerRef)).toEqual(
      Array.from({ length: Math.max(0, size - 2) }, (_, index) => `provider-${index + 3}`)
    );
    expect([
      topology.primary,
      ...(topology.critique === undefined ? [] : [topology.critique]),
      ...topology.additionalMakers
    ].map((row) => row.maker)).toEqual(targets.map((row) => row.maker));
  });

  it("uses the exact sealed configured-provider set at the real runner entrypoint", async () => {
    const source = await readFile("apps/runner/src/main.ts", "utf8");
    expect(source).toContain("readDeploymentMakerCapability");
    expect(source).toContain("parseProviderDiscoveryTargets");
    expect(source).toContain("createRunnerProviderTopology");
    expect(source).toContain("critique: providerTopology.critique");
    expect(source).toContain("additionalMakers: providerTopology.additionalMakers");
  });

  it("loads every mandatory runner policy from the selected sealed register version", async () => {
    const source = await readFile("apps/runner/src/main.ts", "utf8");
    expect(source).toContain("readDevelopmentRunnerPolicy(pool, environment.REGISTER_VERSION)");
    for (const setting of [
      "compositionRow: policy.compositionRow",
      "servePolicy:",
      "judgementPolicy: policy.judgementPolicy",
      "scoringOperator: policy.scoringOperator",
      "runDeathPolicy: policy.runDeathPolicy",
      "hiddenNodeScoreThreshold: policy.hiddenNodeScoreThreshold",
      // S06 B1 (codex r1): every served answer carries a code-derived label, so
      // the sealed T16 verdict-label family is a MANDATORY entry-point setting.
      // Omitting it does not disable the label — it makes the run stop after
      // spending judgement and propagation.
      "verdictLabelPolicy: policy.verdictLabelPolicy",
      // T3C (F33): T3's panel family is mandatory at the entry point for the same
      // reason the verdict-label family is — J12's claim-time gate reads it, so a
      // shipped composition that omits it refuses every multi-maker run on a
      // correctly sealed deployment.
      "panelPolicy: policy.panelPolicy",
      // T3C merge (T7): T7 landed ADAPTIVE_STOPPING_UNRESOLVED — a claim-time gate
      // on every multi-maker run — plus the acceptance composition, but never the
      // shipped one. At 44836ecf that made a correctly sealed deployment refuse
      // every multi-maker work item. Same class as the two entries above, so it is
      // pinned the same way rather than left to the next merge to rediscover.
      "stoppingPolicy: policy.stoppingPolicy",
      // T3C / F34 (J20): DR-182 VROW-5's claim-time re-probe. Its absence is not a
      // stop — both consumers are guarded by `!== undefined` — so a shipped
      // composition that omits it degrades SILENTLY: a member pinned at ask time
      // that has gone absent is trusted and no disclosure is emitted.
      "claimTimeProbe:",
      // codex r1 B1: the entry point must compose the OBSERVE-only probe. The
      // runner persists the claim-time verdict itself in both arms, so composing
      // the persisting `probeTarget` writes one re-probe as two append-only rows
      // under two evidence refs. Only a source assertion can pin this: the
      // behavioural arm composes its own probe and so cannot see what main.ts does.
      "observeProviderTarget(",
      "holdRecorder:"
    ]) expect(source).toContain(setting);
    // codex r2 B1: a `not.toContain("probeTarget({")` token guard does NOT reach the
    // real regression. Importing the persisting helper under the expected local name
    // — `probeTarget as observeProviderTarget` — restoring a repository and passing
    // it as `probes` is buildable, writes twice, and leaves the call site reading
    // `observeProviderTarget(`. Two assertions that DO reach it:
    //
    // (1) the providers import must bind the observe-only symbol WITHOUT aliasing,
    //     so `probeTarget` cannot enter this module under any local name;
    const providersImport = source
      .split("\n")
      .find((line) => line.includes("@debateai/providers") && line.startsWith("import"));
    expect(providersImport).toBeDefined();
    expect(providersImport).toContain("observeProviderTarget");
    expect(providersImport).not.toContain("probeTarget");
    // (2) the composed probe must hand NO recorder to the probe call. The runner
    //     owns persistence; a `probes:` member here is the double write, whatever
    //     the function is called locally.
    const claimTimeProbeBlock = source.slice(
      source.indexOf("claimTimeProbe:"),
      source.indexOf("holdRecorder:")
    );
    expect(claimTimeProbeBlock).not.toContain("probes:");
    expect(claimTimeProbeBlock).toContain("observeProviderTarget(");
  });

  /**
   * J27 — THE CLASS GATE. Three lanes each found one instance of the same defect: a
   * `WalkingSkeletonSettings` member that some caller wires (a test, the acceptance
   * composition) and the SHIPPED entry point does not. F33 was `panelPolicy`, F34
   * `claimTimeProbe`, and T7's `stoppingPolicy` arrived through a merge and made a
   * correctly sealed deployment refuse every multi-maker work item. Each was closed
   * with a per-setting pin, and a per-setting pin cannot catch the NEXT member.
   *
   * This enumerates BOTH sides and compares them semantically:
   *   - the interface's optional members, at depth 1 (not members of nested types);
   *   - the keys the entry point composes, at the TOP LEVEL of the settings literal
   *     (not keys nested inside a member's own object argument), with spreads resolved.
   *
   * Both halves must be depth-aware or the gate reports success while the class stays
   * open. Both mistakes have now actually been made here, and each has a mutant.
   */
  it("composes every optional WalkingSkeletonSettings member, or declares it intentionally absent", async () => {
    const runnerSource = await readFile("apps/runner/src/index.ts", "utf8");
    const mainSource = await readFile("apps/runner/src/main.ts", "utf8");

    /**
     * Blanks comments and string/template literals in place (length-preserving), so a
     * key-looking sequence inside a comment or a string cannot be read as a property.
     */
    const blank = (source: string): string => {
      let out = "";
      let index = 0;
      while (index < source.length) {
        const character = source.charAt(index);
        const next = source.charAt(index + 1);
        if (character === "/" && next === "/") {
          while (index < source.length && source.charAt(index) !== "\n") { out += " "; index += 1; }
          continue;
        }
        if (character === "/" && next === "*") {
          out += "  "; index += 2;
          while (index < source.length && !(source.charAt(index) === "*" && source.charAt(index + 1) === "/")) {
            out += source.charAt(index) === "\n" ? "\n" : " "; index += 1;
          }
          out += "  "; index += 2;
          continue;
        }
        if (character === '"' || character === "'" || character === "`") {
          out += " "; index += 1;
          while (index < source.length && source.charAt(index) !== character) {
            if (source.charAt(index) === "\\") { out += "  "; index += 2; continue; }
            out += source.charAt(index) === "\n" ? "\n" : " "; index += 1;
          }
          out += " "; index += 1;
          continue;
        }
        out += character; index += 1;
      }
      return out;
    };

    /** [openIndex, closeIndex] of the balanced pair starting at `start`. */
    const balanced = (source: string, start: number, open: string, close: string): [number, number] | null => {
      let depth = 0;
      for (let index = start; index < source.length; index += 1) {
        const character = source.charAt(index);
        if (character === open) depth += 1;
        else if (character === close) { depth -= 1; if (depth === 0) return [start, index]; }
      }
      return null;
    };

    /**
     * Keys an object literal contributes AT ITS OWN TOP LEVEL. Depth counts every
     * bracket family, so `clock:` inside `observeProviderTarget({ ... })` — which sits
     * at depth 2 within the settings literal — is NOT a composed setting. A spread at
     * depth 1 is resolved by collecting the keys of each object literal inside it, so
     * the conditional `...(x === undefined ? {} : { critique: x })` contributes
     * `critique`.
     */
    const literalKeys = (source: string, from: number, to: number): readonly string[] => {
      const keys: string[] = [];
      const spreads: number[] = [];
      let depth = 0;
      for (let index = from; index <= to; index += 1) {
        const character = source.charAt(index);
        if (character === "{" || character === "(" || character === "[") { depth += 1; continue; }
        if (character === "}" || character === ")" || character === "]") { depth -= 1; continue; }
        if (depth !== 1) continue;
        if (character === "." && source.charAt(index + 1) === "." && source.charAt(index + 2) === ".") {
          spreads.push(index + 3); index += 2; continue;
        }
        if (/[A-Za-z_$]/u.test(character)) {
          let wordEnd = index;
          while (wordEnd <= to && /[\w$]/u.test(source.charAt(wordEnd))) wordEnd += 1;
          const word = source.slice(index, wordEnd);
          let after = wordEnd;
          while (after <= to && /\s/u.test(source.charAt(after))) after += 1;
          if (source.charAt(after) === ":") keys.push(word);
          index = wordEnd - 1;
        }
      }
      for (const spreadStart of spreads) {
        let cursor = spreadStart;
        while (cursor < source.length && /\s/u.test(source.charAt(cursor))) cursor += 1;
        const opener = source.charAt(cursor);
        const span = opener === "(" ? balanced(source, cursor, "(", ")")
          : opener === "{" ? balanced(source, cursor, "{", "}")
            : null;
        if (span === null) continue;
        for (let index = span[0]; index <= span[1]; index += 1) {
          if (source.charAt(index) !== "{") continue;
          const block = balanced(source, index, "{", "}");
          if (block === null) continue;
          keys.push(...literalKeys(source, block[0], block[1]));
          index = block[1];
        }
      }
      return keys;
    };

    // ---- side 1: the interface's OPTIONAL members, at depth 1 -----------------
    // A regex over the whole interface body also matches members of NESTED types —
    // `resolveTerminalActivations`' return type declares `executedCheckRef?` and
    // `typeFallbackConsulted?`, which are not settings and can never be composed.
    // Anchored on the brace: a bare indexOf substring-matches a RENAMED interface
    // (`WalkingSkeletonSettingsRenamed` contains the searched string) and the gate
    // would read some other interface's members and pass vacuously.
    const blankedRunner = blank(runnerSource);
    const declaration = blankedRunner.search(/interface WalkingSkeletonSettings\s*\{/u);
    expect(declaration).toBeGreaterThan(-1);
    const interfaceSpan = balanced(blankedRunner, blankedRunner.indexOf("{", declaration), "{", "}");
    expect(interfaceSpan).not.toBeNull();
    let interfaceDepth = 0;
    let topLevelBody = "";
    for (let index = interfaceSpan![0]; index <= interfaceSpan![1]; index += 1) {
      const character = blankedRunner.charAt(index);
      if (character === "{") { interfaceDepth += 1; continue; }
      if (character === "}") { interfaceDepth -= 1; continue; }
      if (interfaceDepth === 1) topLevelBody += character;
    }
    const optionalMembers = [...topLevelBody.matchAll(/readonly\s+(\w+)\?\s*:/gu)].map((match) => match[1] ?? "");

    // ---- side 2: the TOP-LEVEL keys the entry point actually composes ---------
    const blankedMain = blank(mainSource);
    const constructor = blankedMain.indexOf("new WalkingSkeletonRunner(");
    expect(constructor).toBeGreaterThan(-1);
    const argumentSpan = balanced(blankedMain, blankedMain.indexOf("(", constructor), "(", ")");
    expect(argumentSpan).not.toBeNull();
    let argumentDepth = 0;
    let lastArgumentStart = argumentSpan![0] + 1;
    for (let index = argumentSpan![0] + 1; index < argumentSpan![1]; index += 1) {
      const character = blankedMain.charAt(index);
      if ("({[".includes(character)) argumentDepth += 1;
      else if (")}]".includes(character)) argumentDepth -= 1;
      else if (character === "," && argumentDepth === 0) lastArgumentStart = index + 1;
    }
    while (/\s/u.test(blankedMain.charAt(lastArgumentStart))) lastArgumentStart += 1;
    const settingsSpan = balanced(blankedMain, lastArgumentStart, "{", "}");
    expect(settingsSpan).not.toBeNull();
    const composed = [...new Set(literalKeys(blankedMain, settingsSpan![0], settingsSpan![1]))];

    // ---- the scan must PROVE its own depth and spread rules -------------------
    // Depth: `clock:` really is present inside the settings literal, nested one level
    // down inside `observeProviderTarget({ ... })`. A depth-blind scan reports it as
    // composed, and then adding `readonly clock?: () => Date;` to the interface would
    // be silently "accounted for" while nothing composes it. That is the exact hole
    // this gate exists to prevent, and it shipped in the first version.
    expect(mainSource).toContain("clock: () => new Date()");
    expect(composed).not.toContain("clock");
    // Spread: `critique` is contributed ONLY by a conditional top-level spread, so a
    // scan that ignores spreads would wrongly report a composed member as unwired.
    expect(mainSource).toContain("{ critique: providerTopology.critique }");
    expect(composed).toContain("critique");

    // ---- the enumeration must DISCRIMINATE ------------------------------------
    expect(optionalMembers.length).toBeGreaterThanOrEqual(10);
    for (const known of ["panelPolicy", "stoppingPolicy", "claimTimeProbe", "verdictLabelPolicy"]) {
      expect(optionalMembers).toContain(known);
    }
    expect(optionalMembers).not.toContain("executedCheckRef");
    expect(optionalMembers).not.toContain("typeFallbackConsulted");

    /**
     * Members the shipped entry point deliberately does NOT pass, each with the reason.
     * Empty today: all optional members are composed. An entry here is a claim that
     * absence is correct — state why; the pins below fail a stale or dishonest entry
     * (one that is listed AND composed, or listed but no longer a member).
     */
    const INTENTIONALLY_ABSENT: Readonly<Record<string, string>> = {};

    const unaccounted = optionalMembers
      .filter((member) => !composed.includes(member) && !(member in INTENTIONALLY_ABSENT));
    expect(unaccounted).toEqual([]);

    for (const [member, reason] of Object.entries(INTENTIONALLY_ABSENT)) {
      expect(optionalMembers).toContain(member);
      expect(composed).not.toContain(member);
      expect(reason.trim().length).toBeGreaterThan(40);
    }
  });
});
