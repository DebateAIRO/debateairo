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
    // Side-by-side spec §13 (S14): the configured set and the declared targets are main.ts's site reads
    // (readRunnerSiteContext, run-settings.ts, shared with the practice and check-version), which it calls.
    const siteReads = await readFile("apps/runner/src/run-settings.ts", "utf8");
    expect(source).toContain("await readRunnerSiteContext({ pool, environment, moneyInFlight })");
    expect(siteReads).toContain("const deploymentMakers = await readDeploymentMakerCapability(pool, environment.REGISTER_VERSION);");
    expect(siteReads).toContain("parseProviderDiscoveryTargets(");
    expect(source).toContain("createRunnerProviderTopology");
    expect(source).toContain("critique: providerTopology.critique");
    expect(source).toContain("additionalMakers: providerTopology.additionalMakers");
  });

  it("loads every mandatory runner policy from the selected sealed register version", async () => {
    const source = await readFile("apps/runner/src/main.ts", "utf8");
    // Side-by-side spec §13: the policy is read by the one per-version loader, for the version it loads (main.ts loads its
    // site version, REGISTER_VERSION, through it), and its debate members are mapped once, by runnerSettingsOfVersion,
    // which main.ts's settings literal spreads. The process members stay in main.ts's literal.
    const loader = await readFile("apps/runner/src/run-settings.ts", "utf8");
    expect(loader).toContain("readDevelopmentRunnerPolicy(pool, version)");
    expect(source).toContain("const siteVersionSettings = await runnerSettings.requireSettings(environment.REGISTER_VERSION);");
    expect(source).toContain("...runnerSettingsOfVersion(siteVersionSettings),");
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
      "stoppingPolicy: policy.stoppingPolicy"
      // S6: the mapping is its own module (run-debate-members.ts), re-exported by the loader.
    ]) expect(await readFile("apps/runner/src/run-debate-members.ts", "utf8")).toContain(setting);
    for (const setting of [
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
      // Spec 2026-10-11 busy model §2: both claim probes go through main.ts's one
      // `observeClaimTarget`, which composes the observe-only `observeClaimTimeTarget`
      // (observeProviderTarget, plus the preview's one resend after an unbilled refusal).
      "observeClaimTimeTarget(",
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
    expect(providersImport).toContain("observeClaimTimeTarget");
    expect(providersImport).not.toContain("probeTarget");
    // (2) the composed probe must hand NO recorder to the probe call. The runner
    //     owns persistence; a `probes:` member here is the double write, whatever
    //     the function is called locally.
    const claimTimeProbeBlock = source.slice(
      source.indexOf("claimTimeProbe:"),
      source.indexOf("holdRecorder:")
    );
    expect(claimTimeProbeBlock).not.toContain("probes:");
    expect(claimTimeProbeBlock).toContain("observeClaimTarget(");
    // (3) the one helper both claim probes call hands no recorder either.
    const claimHelper = source.slice(source.indexOf("function observeClaimTarget("), source.indexOf("const runner = new WalkingSkeletonRunner("));
    expect(claimHelper).toContain("observeClaimTimeTarget(");
    expect(claimHelper).not.toContain("probes:");
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
    // S6: the debate members' one mapping is its own module, re-exported by run-settings.ts.
    const mappingSource = await readFile("apps/runner/src/run-debate-members.ts", "utf8");

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
     * bracket family, so `failureCode:` inside the claim probe's returned object — which
     * sits at depth 2 or more within the settings literal — is NOT a composed setting. A spread at
     * depth 1 is resolved by collecting the keys of each object literal inside it, so
     * the conditional `...(x === undefined ? {} : { critique: x })` contributes
     * `critique`. A shorthand property (`debateShape,`) is a key as well.
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
          // A shorthand property (`debateShape,`) is a key too: the word stands alone between the literal's own
          // `{`/`,` and `,`/`}`. A spread's operand (`...x,`) is preceded by `.` and a value (`a: x,`) by `:`, so
          // neither is read as a key.
          let before = index - 1;
          while (before >= from && /\s/u.test(source.charAt(before))) before -= 1;
          const standsAlone = (source.charAt(before) === "{" || source.charAt(before) === ",")
            && (source.charAt(after) === "," || source.charAt(after) === "}");
          if (source.charAt(after) === ":" || standsAlone) keys.push(word);
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
    const literalComposed = literalKeys(blankedMain, settingsSpan![0], settingsSpan![1]);
    // Side-by-side spec §13: the version's debate members come from ONE mapping, `runnerSettingsOfVersion`
    // (run-settings.ts), spread at the top level of the literal. Its returned literal's keys count as composed ONLY
    // while main.ts's literal really spreads it; the same depth and spread rules read it.
    const settingsLiteral = blankedMain.slice(settingsSpan![0], settingsSpan![1]);
    const spreadsMapping = /^\s*\.\.\.runnerSettingsOfVersion\(siteVersionSettings\),$/mu.test(settingsLiteral);
    expect(spreadsMapping).toBe(true);
    const blankedMapping = blank(mappingSource);
    const mappingFunction = blankedMapping.indexOf("export function runnerSettingsOfVersion(");
    expect(mappingFunction).toBeGreaterThan(-1);
    const mappingSpan = balanced(blankedMapping, blankedMapping.indexOf("{", blankedMapping.indexOf("return Object.freeze(", mappingFunction)), "{", "}");
    expect(mappingSpan).not.toBeNull();
    const mapped = spreadsMapping ? literalKeys(blankedMapping, mappingSpan![0], mappingSpan![1]) : [];
    const mappingLiteral = mappingSource.slice(mappingSpan![0], mappingSpan![1]);
    // One source per member: no key is both mapped and set by main.ts's literal.
    expect(mapped.filter((key) => literalComposed.includes(key))).toEqual([]);
    const composed = [...new Set([...literalComposed, ...mapped])];

    // ---- the scan must PROVE its own depth and spread rules -------------------
    // Depth: `failureCode:` really is present inside the settings literal, nested one
    // level down inside the claim probe's returned object. A depth-blind scan reports
    // it as composed, and then adding `readonly failureCode?: string;` to the interface
    // would be silently "accounted for" while nothing composes it. That is the exact
    // hole this gate exists to prevent, and it shipped in the first version. (It was
    // `clock:` inside `observeProviderTarget({ ... })` until spec 2026-10-11 busy model
    // §2 moved that call into main.ts's `observeClaimTarget`, outside the literal.)
    expect(settingsLiteral).toContain("failureCode:");
    expect(composed).not.toContain("failureCode");
    // Spread: `critique` is contributed ONLY by a conditional top-level spread, so a
    // scan that ignores spreads would wrongly report a composed member as unwired.
    expect(mainSource).toContain("{ critique: providerTopology.critique }");
    expect(composed).toContain("critique");
    // Shorthand: `debateShape` (25a3bab58) was composed as `debateShape,` with no colon; a colon-only scan reported a
    // composed member as unwired. The scan must read a shorthand, and must not read a value or a spread's operand as a
    // key. Side-by-side spec §13 moved `debateShape` into the mapping (`debateShape: version.debateShape,`), so the
    // shorthand rule is proved on a literal of its own, and the moved member through the mapping.
    const sample = blank("{ shorthandKey, valued: someValue, ...spreadOperand, last }");
    expect(literalKeys(sample, 0, sample.length - 1)).toEqual(["shorthandKey", "valued", "last"]);
    expect(mappingLiteral).toContain("debateShape: version.debateShape,");
    expect(composed).toContain("debateShape");
    expect(mapped.length).toBeGreaterThanOrEqual(10);
    expect(mapped).toContain("factBundleVersion");
    expect(mapped).not.toContain("version");
    expect(mapped).not.toContain("policy");
    expect(composed).not.toContain("runnerCallScheduler");
    expect(composed).not.toContain("previewConfig");

    // ---- the enumeration must DISCRIMINATE ------------------------------------
    expect(optionalMembers.length).toBeGreaterThanOrEqual(10);
    for (const known of ["panelPolicy", "stoppingPolicy", "claimTimeProbe", "verdictLabelPolicy"]) {
      expect(optionalMembers).toContain(known);
    }
    expect(optionalMembers).not.toContain("executedCheckRef");
    expect(optionalMembers).not.toContain("typeFallbackConsulted");

    /**
     * Members the shipped entry point deliberately does NOT pass, each with the reason.
     * An entry here is a claim that absence is correct — state why; the pins below fail
     * a stale or dishonest entry (one that is listed AND composed, or listed but no
     * longer a member).
     */
    const INTENTIONALLY_ABSENT: Readonly<Record<string, string>> = {
      // c5e0b2862 (debate shape, map stage).
      mapChoices: "A storage seam only: absent, the runner stores and reads a shaped run's map with "
        + "new MapChoiceRepository(pool) on its own pool, which is the production store; nothing composes it today."
    };

    const unaccounted = optionalMembers
      .filter((member) => !composed.includes(member) && !(member in INTENTIONALLY_ABSENT));
    expect(unaccounted).toEqual([]);

    for (const [member, reason] of Object.entries(INTENTIONALLY_ABSENT)) {
      expect(optionalMembers).toContain(member);
      expect(composed).not.toContain(member);
      expect(reason.trim().length).toBeGreaterThan(40);
    }
    // The mapChoices claim is a fact of the runner: an absent seam falls back to the repository on the runner's pool.
    expect(runnerSource).toContain("this.#mapChoices = settings.mapChoices?.store ?? new MapChoiceRepository(pool);");
  });
});
