import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildLegalDocument,
  LEGAL_DOCUMENT_SOURCES,
  renderLegalModule
} from "../../apps/ui/scripts/generate-legal-data.mjs";
import { POLICY_JUMP, POLICY_SECTIONS, PRIVACY_POLICY } from "../../apps/ui/lib/privacyPolicy.js";
import { TERMS_JUMP, TERMS_OF_SERVICE, TERMS_SECTIONS } from "../../apps/ui/lib/termsOfService.js";
import type { LegalDocument, LegalSection } from "../../apps/ui/lib/legalDocument.js";

/**
 * The two legal documents the sign-up gate shows are DATA generated from the drafts under
 * `apps/ui/legal/` by `apps/ui/scripts/generate-legal-data.mjs`. These cases pin the contract of
 * that generation: the committed modules are exactly what the generator emits (so a hand edit or
 * a stale module fails here), the document chrome the modals show, the section numbering, how
 * markdown tables and lists arrive, and that no markdown syntax leaks into a string a reader
 * sees. Square-bracket placeholders are DELIBERATELY preserved: they are the drafts' own marks
 * for what counsel still has to fill in, and rendering them verbatim keeps the product honest
 * about that.
 */

const ACCENT_CYCLE = ["--ok-dot", "--gold", "--reasoning", "--con", "--ink", "--muted"] as const;

/** Any of these in a rendered string means markdown syntax leaked through the converter. */
const MARKDOWN_RESIDUE = /\*\*|\\\[|\\\]|&#9[13];|\]\(|`|^#|\| ---|^\|/m;

function texts(section: LegalSection): string[] {
  return section.blocks.flatMap((block) => (block.kind === "p" ? [block.text] : [...block.items]));
}

function allTexts(document: LegalDocument): string[] {
  return document.sections.flatMap(texts);
}

function section(document: LegalDocument, no: string): LegalSection {
  const found = document.sections.find((candidate) => candidate.no === no);
  expect(found, `missing section ${no}`).toBeDefined();
  return found!;
}

function twoDigit(count: number): string[] {
  return Array.from({ length: count }, (_, index) => String(index + 1).padStart(2, "0"));
}

describe("legal documents — generated data", () => {
  it("commits exactly what the generator emits from the in-repo drafts", () => {
    expect(LEGAL_DOCUMENT_SOURCES.map((entry) => entry.key)).toEqual(["privacy", "terms"]);
    expect(LEGAL_DOCUMENT_SOURCES.map((entry) => entry.source)).toEqual([
      "apps/ui/legal/en/privacy-policy.md",
      "apps/ui/legal/en/terms-of-service.md"
    ]);
    for (const entry of LEGAL_DOCUMENT_SOURCES) {
      const markdown = readFileSync(resolve(process.cwd(), entry.source), "utf8");
      const committed = readFileSync(resolve(process.cwd(), entry.output), "utf8");
      expect(renderLegalModule(markdown, entry.key), `${entry.output} is stale`).toBe(committed);
    }
  });

  it("rejects a leading zero that changes a frozen numbered heading", () => {
    const markdown = readFileSync(
      resolve(process.cwd(), "apps/ui/legal/en/privacy-policy.md"),
      "utf8"
    ).replace("## 1. Who is responsible", "## 01. Who is responsible");
    expect(() => buildLegalDocument(markdown, "privacy")).toThrow(/numbered headings/);
  });

  describe("Terms of Service", () => {
    it("carries the modal chrome derived from the draft's version line", () => {
      expect(TERMS_OF_SERVICE.key).toBe("terms");
      expect(TERMS_OF_SERVICE.eyebrow).toBe("TERMS OF SERVICE · v2.4 · EFFECTIVE 12 OCTOBER 2026");
      expect(TERMS_OF_SERVICE.title).toBe("What you agree to");
      expect(TERMS_OF_SERVICE.lede).toBe(
        "The contract between you and DMS Merchandise Shop S.R.L., in plain language. Nineteen sections and Annex A — scroll to the end."
      );
      expect(TERMS_OF_SERVICE.endMarker).toBe("END OF TERMS · v2.4");
      expect(TERMS_OF_SERVICE.contact).toBe("support@dezbatere.ro");
      expect(TERMS_OF_SERVICE.bodyLabel).toBe("Terms of Service text");
      expect(TERMS_OF_SERVICE.sectionIdPrefix).toBe("terms-section-");
      expect(TERMS_OF_SERVICE.titleId).toBe("terms-modal-title");
      expect(TERMS_OF_SERVICE.gateHintId).toBe("terms-modal-gate-hint");
      expect(TERMS_OF_SERVICE.jumps).toBe(TERMS_JUMP);
      expect(TERMS_OF_SERVICE.sections).toBe(TERMS_SECTIONS);
    });

    it("numbers the summary 00, the nineteen sections 01–19, the annex A and its parts A.1–A.7", () => {
      expect(TERMS_SECTIONS.map((entry) => entry.no)).toEqual([
        "00",
        ...twoDigit(19),
        "A",
        ...Array.from({ length: 7 }, (_, index) => `A.${index + 1}`)
      ]);
      const titles = TERMS_SECTIONS.map((entry) => entry.title);
      expect(titles[0]).toBe("In short");
      expect(titles[1]).toBe("Who we are and how to reach us");
      expect(titles[19]).toBe("Other terms");
      expect(titles[20]).toBe("Annex A — Regional terms");
      expect(titles[21]).toBe("European Union and European Economic Area");
      expect(titles[22]).toBe("United States");
      expect(titles[25]).toBe("Switzerland");
      expect(titles[27]).toBe("Asia-Pacific");
    });

    it("keeps the summary paragraph without its bold lead-in", () => {
      const summary = section(TERMS_OF_SERVICE, "00");
      expect(summary.blocks).toHaveLength(1);
      expect(summary.blocks[0]!.kind).toBe("p");
      expect(texts(summary)[0]!.startsWith("You must be 18 or over.")).toBe(true);
    });

    it("turns the contact table into a list block, in document order", () => {
      const who = section(TERMS_OF_SERVICE, "01");
      expect(who.blocks.map((block) => block.kind)).toEqual(["p", "list", "p"]);
      const table = who.blocks[1]!;
      if (table.kind !== "list") throw new Error("unreachable");
      expect(table.items).toHaveLength(12);
      expect(table.items[0]).toBe("Registered office — Str. 1 Decembrie 1918 nr. 80A, Piatra Neamț, Romania");
      expect(table.items[5]).toBe("Telephone — +40 748 793 490");
      expect(table.items[7]).toBe("Privacy and data protection — privacy@dezbatere.ro");
      expect(table.items[10]).toBe(
        "Removal orders for terrorist content (EU Regulation 2021/784) — office@dezbatere.ro — our contact point for these orders; Romanian and English; see section 10"
      );
      const closing = who.blocks[2]!;
      if (closing.kind !== "p") throw new Error("unreachable");
      expect(closing.text.startsWith("These details are also shown permanently")).toBe(true);
    });

    it("turns the two moderation bullets into a list block", () => {
      const reporting = section(TERMS_OF_SERVICE, "10");
      const lists = reporting.blocks.filter((block) => block.kind === "list");
      expect(lists).toHaveLength(1);
      const list = lists[0]!;
      if (list.kind !== "list") throw new Error("unreachable");
      expect(list.items).toHaveLength(2);
      expect(list.items[0]!.startsWith("Decisions inside the engine.")).toBe(true);
      expect(list.items[1]!.startsWith("Moderation decisions about content and accounts.")).toBe(true);
    });

    // FIX-SF-S03-p1 (t_89b5eedb): the statement-of-reasons paragraph promises exactly what S04-R11's refusal screens and
    // S01-R39's deletion notice give, and ends with the help-screen sentence (the end anchor `includes` above does not keep).
    it("pins the statement of reasons for a refused question and for a debate our check deletes, and its last sentence", () => {
      const reasons = texts(section(TERMS_OF_SERVICE, "10")).find((text) => text.startsWith("Statement of reasons.")) ?? "";
      expect(reasons).toContain(
        "the screen that tells you is our statement of reasons for it: it says that the debate did not start, that our automatic check refused the question with no person involved, which rule of these Terms the question falls under, and how to complain through the route below. For a refused question we promise nothing more."
      );
      expect(reasons).toContain(
        "When our check deletes a debate (section 9), the notice you see is our statement of reasons for it: it says what we did and how far it reaches, the facts we relied on, that no person was involved, which rule of these Terms applies, and how to complain through the route below; the other two routes this paragraph names stay open to you."
      );
      expect(reasons.endsWith("gets is help, not a statement of reasons.")).toBe(true);
    });

    // FIX-SF-S03-p2 (t_e324a1d9, V-95's default): POST /v1/asks runs the crisis phrase check before the sensitive-data
    // consent rule (apps/api/src/index.ts:3542 before :3548; S04-R1), so every sentence saying question contents are used
    // only with or after that consent states that one exception, in the same words. FIX-SF-S03-p3 (t_52ef891f N3): the
    // filter is the class regex of the correctness lens's consent-sweep.py, over BOTH English documents.
    const CRISIS_EXCEPTION = "our list of crisis phrases reads every question first, before that consent, only to show help numbers instead of a debate, and keeps nothing of it and sends it to no model";
    it("states the crisis-phrase exception in every sentence, in either document, that uses question contents only with or after the consent", () => {
      const absolute = /only with (?:your|that|the|such)|only after|only once|only if you (?:agree|consent)|until you (?:agree|consent)|not without (?:your|that) consent|only on (?:your|the) consent|with your (?:prior |separate |opt-in |explicit )?consent/i;
      const claims = [...allTexts(PRIVACY_POLICY), ...allTexts(TERMS_OF_SERVICE)]
        .flatMap((text) => text.split(/(?<=[.;])\s+/))
        .filter((sentence) => /consent/i.test(sentence) && absolute.test(sentence) && /question/i.test(sentence));
      expect(claims).toHaveLength(4);
      for (const claim of claims) expect(claim, claim.slice(0, 90)).toContain(`, except that ${CRISIS_EXCEPTION}`);
    });

    // FIX-SF-S03-p3 (t_52ef891f N3): the same four members carry ONE rendering of the exception in every locale. The four
    // member clauses are located in English by the exception (PP :269 is cut at its italic country markers); in each locale
    // the longest span they share, as a share of the line, must stay near English's (measured 0.99-1.28 of English at
    // FIX-SF-S03-p3; one member without it measures 0.08, one changed word 0.49).
    it("renders the crisis-phrase exception in the same words in the four members, in every locale", () => {
      const marker = /(?<!\*)\*[^*\n]{1,40}?[:：]\*(?!\*)/u;
      const read = (locale: string) => readFileSync(resolve(process.cwd(), `apps/ui/legal/${locale}/privacy-policy.md`), "utf8").split("\n");
      const english = read("en");
      const rows = english.flatMap((line, index) => (line.includes(CRISIS_EXCEPTION) ? [index] : []));
      const members = rows.flatMap((index) => english[index]!.split(marker).flatMap((part, segment) => (part.includes(CRISIS_EXCEPTION) ? [[index, segment] as const] : [])));
      expect(members).toHaveLength(4);
      const shared = (parts: readonly string[]) => {
        const shortest = parts.reduce((a, b) => (b.length < a.length ? b : a));
        let best = "";
        for (let i = 0; i < shortest.length; i += 1) {
          let j = i + best.length + 1;
          while (j <= shortest.length && parts.every((part) => part.includes(shortest.slice(i, j)))) { best = shortest.slice(i, j); j += 1; }
        }
        return best;
      };
      const base = CRISIS_EXCEPTION.length / english[rows[0]!]!.length;
      const locales = readdirSync(resolve(process.cwd(), "apps/ui/legal")).filter((name) => /^[a-z]{2}$/.test(name) && name !== "en");
      expect(locales).toHaveLength(34);
      for (const locale of locales) {
        const lines = read(locale);
        const parts = members.map(([index, segment]) => lines[index]?.split(marker)[segment] ?? "");
        const k = (shared(parts).length / (lines[rows[0]!] ?? "").length) / base;
        expect(k, `${locale} k=${k.toFixed(2)}`).toBeGreaterThan(0.75);
      }
    });

    // TEXT-SF-S03-p4 (V-111, S05 SPEC-v10 S05-L2, S05-L9, S05-L13, S05-L14): the support chat keeps nothing and opens no
    // case. PROPERTY: no sentence of either document says the support chat or its rules open a case, the Terms' "Contacting
    // a human" gives the support address and the "Talk to a human" button, and the Policy's §3 and Annex B.2 say nothing of
    // the chat is kept. Replaces FIX-SF-S03-p3's code-derived list of cases (escalation.ts goes with S05).
    it("says the support chat keeps nothing and opens no case, and that a person is reached at the support address", () => {
      const all = [...allTexts(PRIVACY_POLICY), ...allTexts(TERMS_OF_SERVICE)].flatMap((text) => text.split(/(?<=[.;])\s+/));
      const opensCase = all.filter((sentence) => /support chat|support assistant|our rules/i.test(sentence) && /\bopens? (?:a|one) case|case opens|cases? (?:opened|that a member)/i.test(sentence));
      expect(opensCase).toEqual([]);
      const human = texts(section(TERMS_OF_SERVICE, "10")).find((text) => text.startsWith("Contacting a human.")) ?? "";
      expect(human).toContain("You can write to a person at our support address, support@dezbatere.ro, at any time; the support assistant's \"Talk to a human\" button shows that address, and the chat itself passes nothing to a person.");
      const risk = texts(section(TERMS_OF_SERVICE, "10")).find((text) => text.startsWith("Serious risk to life or safety.")) ?? "";
      expect(risk.endsWith("who informs the competent authorities when the threat is credible.")).toBe(true);
      const health = allTexts(PRIVACY_POLICY).find((text) => text.startsWith("Health information.")) ?? "";
      expect(health.endsWith("then shows help numbers instead of an answer; we keep nothing of the message or of the reply, and the chat opens no case.")).toBe(true);
      const b2 = allTexts(PRIVACY_POLICY).find((text) => text.startsWith("Notice at collection.")) ?? "";
      expect(b2).toContain("What you write to the support chat we use without that consent only to answer you, and to recognise a message that reads like the words of a person in crisis and show help numbers instead of an answer (section 3); we keep nothing of it, and no case is opened.");
    });

    // TEXT-SF-S03-p4 (V-118; S05-L4, S05-L15): the Policy names Anthropic's support retention as the Register states it.
    // PROPERTY: every number of the Register's Anthropic retention text is in the Policy's §5 support sentence, the sentence
    // says zero data retention is not active exactly when the Register's support row says "no", and we never call the
    // support chat's messages unretained.
    it("names Anthropic's support retention as the Register states it, and says we do not retain the messages", async () => {
      const { SUPPORT_PROVIDER } = await import("../../apps/ui/lib/legal/pages.js");
      const legal = JSON.parse(readFileSync(resolve(process.cwd(), "apps/ui/messages/en/legal.json"), "utf8")) as Record<string, string>;
      const register = legal[SUPPORT_PROVIDER.retentionKey] ?? "";
      const sent = allTexts(PRIVACY_POLICY).find((text) => text.startsWith("What is sent.")) ?? "";
      const support = sent.slice(sent.indexOf("If you use the support chat"), sent.indexOf("A provider never receives"));
      expect(support).toContain("goes to an external model provider, Anthropic, so that its model Claude can answer you. We do not retain those messages, but Anthropic may, for the period our Register states");
      const numbers = register.match(/[0-9]+/g) ?? [];
      expect(numbers.length).toBeGreaterThan(0);
      for (const number of numbers) expect(support, `the Register's ${number}`).toMatch(new RegExp(`\\b${number}\\b`));
      expect(support.includes("zero data retention is not active for the endpoint we use")).toBe(SUPPORT_PROVIDER.zeroRetention === "no");
      for (const text of [...allTexts(PRIVACY_POLICY), ...allTexts(TERMS_OF_SERVICE)]) {
        if (/support (?:chat|assistant)/i.test(text)) expect(text, text.slice(0, 60)).not.toMatch(/unretained|not retained/i);
      }
    });

    it("names the EU redress routes, the terrorist-content contact point, the contract language and how the contract ends", () => {
      const reporting = texts(section(TERMS_OF_SERVICE, "10"));
      expect(reporting.some((text) => text.startsWith("Statement of reasons.") && text.includes(
        "through our complaints route below, through an out-of-court dispute settlement body certified under the EU Digital Services Act, or in court."
      ))).toBe(true);
      const outOfCourt = reporting.find((text) => text.startsWith("Out-of-court dispute settlement."));
      expect(outOfCourt).toContain("Article 21 of the EU Digital Services Act (Regulation (EU) 2022/2065)");
      expect(outOfCourt).toContain("digital-strategy.ec.europa.eu/en/policies/dsa-out-court-dispute-settlement");
      const terrorist = reporting.find((text) => text.startsWith("Terrorist content."));
      expect(terrorist).toContain("Regulation (EU) 2021/784");
      expect(terrorist).toContain("within one hour");
      expect(texts(section(TERMS_OF_SERVICE, "11"))[0]).toContain("Closing your account ends these Terms.");
      expect(texts(section(TERMS_OF_SERVICE, "19")).find((text) => text.startsWith("Language."))).toContain(
        "The contract is in the language you signed up in"
      );
    });

    it("keeps Tennessee out: section 2 lists the United States without it, and Annex A.2 says so first", () => {
      expect(texts(section(TERMS_OF_SERVICE, "02"))[0]).toContain("Moldova, the United States (except Tennessee), Canada,");
      expect(texts(section(TERMS_OF_SERVICE, "A.2"))[0]).toBe("Tennessee. We do not offer Dialectical Engine to people who live in Tennessee.");
    });

    it("lists the countries served in plain prose, and names none it does not serve (owner's ruling of 9 October 2026)", () => {
      expect(texts(section(TERMS_OF_SERVICE, "02"))[0]).toBe(
        "We offer Dialectical Engine to people who live in the European Union (27 countries) and the European Economic Area"
          + " (Norway, Iceland and Liechtenstein), Switzerland, Moldova, the United States (except Tennessee), Canada,"
          + " Australia, New Zealand, Singapore, Japan, South Korea and Taiwan. We do not offer it elsewhere."
          + " If you live outside those countries you may be able to reach the site, but we do not direct the service to you,"
          + " we do not accept payment from you, and these Terms and our Privacy Policy are not adapted to the law of your"
          + " country. Annex A sets out what applies in each region we serve."
      );
      for (const document of [TERMS_OF_SERVICE, PRIVACY_POLICY]) {
        const all = [...document.sections.map((entry) => entry.title), ...allTexts(document)].join("\n");
        expect(all).not.toMatch(/\bUK\b|Ukrain|Israel|Thailand|Philippines|only if listed|Reserved/u);
      }
      // The United Kingdom is not served (owner's ruling of 9 October 2026), but since the owner's answer of
      // 10 October 2026 the service is hosted there (OVHcloud, London). The Terms never name it; the Privacy
      // Policy names it only where it says where data is held or goes (since 12 October 2026 also in the summary,
      // section 5 and Annex B.4, all naming London).
      expect(allTexts(TERMS_OF_SERVICE).filter((text) => text.includes("United Kingdom"))).toEqual([]);
      const ukMentions = allTexts(PRIVACY_POLICY).filter((text) => text.includes("United Kingdom"));
      expect(ukMentions.length).toBeGreaterThan(0);
      for (const text of ukMentions) expect(text).toMatch(/OVHcloud|London|EU countries, the United Kingdom|other EU countries, the United Kingdom/u);
    });

    it("says the support chat sends text to a model too, right after the debate paragraph", () => {
      const content = texts(section(TERMS_OF_SERVICE, "08"));
      expect(content[2]!.startsWith("How your content reaches AI providers. To run a debate")).toBe(true);
      const support = content[3]!;
      expect(support.startsWith("What the support chat sends. The support assistant is also an AI model.")).toBe(true);
      expect(support).toContain("we send your message to an external model provider, Anthropic, so that its model Claude can answer");
      // TEXT-SF-S03-p4 (V-118, S05-L12): no case summary any more; we do not retain, Anthropic may.
      expect(support).toContain("We do not retain what you write in the chat, but Anthropic may keep it for the period stated in our AI Provider Register (below).");
      expect(support).not.toMatch(/summary|a case opens/i);
      expect(support).toContain("the model receives anything else you type in the chat");
    });

    it("decodes the HTML-entity bracket and preserves every placeholder verbatim", () => {
      expect(texts(section(TERMS_OF_SERVICE, "12"))[0]).toBe(
        "[Inactive until a paid plan exists. Do not launch a paid tier without completing every bracket here and the checkout interface it describes.]"
      );
      expect(allTexts(TERMS_OF_SERVICE).some((text) => text.includes("we refund the share of that period's price you have not used, measured by the plan's usage, however many days have passed"))).toBe(true);
    });

    it("leaves no markdown syntax in any string a reader sees", () => {
      const leaks = allTexts(TERMS_OF_SERVICE).filter((text) => MARKDOWN_RESIDUE.test(text));
      expect(leaks).toEqual([]);
      expect(TERMS_SECTIONS.map((entry) => entry.title).filter((title) => MARKDOWN_RESIDUE.test(title))).toEqual([]);
    });

    it("offers ten jump pills that each resolve to exactly one section", () => {
      expect(TERMS_JUMP.map((jump) => jump.label)).toEqual([
        "WHO WE ARE",
        "ACCEPTING",
        "WHAT IT IS",
        "YOUR ACCOUNT",
        "ACCEPTABLE USE",
        "YOUR CONTENT",
        "PUBLISHING",
        "REPORTING",
        "LIABILITY",
        "GOVERNING LAW"
      ]);
      expect(TERMS_JUMP.map((jump) => jump.target)).toEqual([
        "terms-section-01",
        "terms-section-03",
        "terms-section-05",
        "terms-section-06",
        "terms-section-07",
        "terms-section-08",
        "terms-section-09",
        "terms-section-10",
        "terms-section-15",
        "terms-section-18"
      ]);
      for (const jump of TERMS_JUMP) {
        const matches = TERMS_SECTIONS.filter((entry) => `terms-section-${entry.no}` === jump.target);
        expect(matches, `${jump.label} → ${jump.target}`).toHaveLength(1);
      }
    });
  });

  describe("Privacy Policy", () => {
    it("carries the modal chrome derived from the draft's version line", () => {
      expect(PRIVACY_POLICY.key).toBe("privacy");
      expect(PRIVACY_POLICY.eyebrow).toBe("PRIVACY POLICY · v3.5 · EFFECTIVE 12 OCTOBER 2026");
      expect(PRIVACY_POLICY.title).toBe("What we store, and why");
      expect(PRIVACY_POLICY.lede).toBe(
        "Your rights and our obligations under the GDPR (EU) 2016/679, in plain language. Fourteen sections and Annex B — scroll to the end."
      );
      expect(PRIVACY_POLICY.endMarker).toBe("END OF POLICY · GDPR (EU) 2016/679 · v3.5");
      expect(PRIVACY_POLICY.contact).toBe("privacy@dezbatere.ro");
      expect(PRIVACY_POLICY.bodyLabel).toBe("Privacy Policy text");
      expect(PRIVACY_POLICY.sectionIdPrefix).toBe("policy-section-");
      expect(PRIVACY_POLICY.titleId).toBe("policy-modal-title");
      expect(PRIVACY_POLICY.gateHintId).toBe("policy-modal-gate-hint");
      expect(PRIVACY_POLICY.jumps).toBe(POLICY_JUMP);
      expect(PRIVACY_POLICY.sections).toBe(POLICY_SECTIONS);
    });

    it("numbers the summary 00, the fourteen sections 01–14, the annex B and its parts B.1–B.7", () => {
      expect(POLICY_SECTIONS.map((entry) => entry.no)).toEqual([
        "00",
        ...twoDigit(14),
        "B",
        ...Array.from({ length: 7 }, (_, index) => `B.${index + 1}`)
      ]);
      const titles = POLICY_SECTIONS.map((entry) => entry.title);
      expect(titles[0]).toBe("In short");
      expect(titles[1]).toBe("Who is responsible for your data");
      expect(titles[14]).toBe("Changes to this policy");
      expect(titles[15]).toBe("Annex B — Regional privacy terms");
      expect(titles[16]).toBe("European Union and European Economic Area");
      expect(titles[20]).toBe("Switzerland");
      expect(titles[22]).toBe("Asia-Pacific");
      expect(texts(section(PRIVACY_POLICY, "00"))[0]!.startsWith("We collect what an account needs")).toBe(true);
    });

    it("turns the collection table into fourteen rows joined with em dashes", () => {
      const collect = section(PRIVACY_POLICY, "02");
      expect(collect.blocks.map((block) => block.kind)).toEqual(["p", "list", "p", "p"]);
      const table = collect.blocks[1]!;
      if (table.kind !== "list") throw new Error("unreachable");
      expect(table.items).toHaveLength(14);
      expect(table.items[0]!.startsWith("Account — Email address and recovery email address")).toBe(true);
      expect(table.items[0]!.endsWith("— You, at registration")).toBe(true);
    });

    it("reduces links and autolinks to their visible text", () => {
      const rights = texts(section(PRIVACY_POLICY, "10")).join("\n");
      expect(rights).toContain("anspdcp@dataprotection.ro");
      expect(rights).not.toContain("<anspdcp");
      const swiss = texts(section(PRIVACY_POLICY, "B.5")).join("\n");
      expect(swiss).toContain("edoeb.admin.ch");
      expect(swiss).not.toContain("](https://");
    });

    it("leaves no markdown syntax in any string a reader sees", () => {
      const leaks = allTexts(PRIVACY_POLICY).filter((text) => MARKDOWN_RESIDUE.test(text));
      expect(leaks).toEqual([]);
      expect(POLICY_SECTIONS.map((entry) => entry.title).filter((title) => MARKDOWN_RESIDUE.test(title))).toEqual([]);
    });

    it("offers eight jump pills that each resolve to exactly one section", () => {
      expect(POLICY_JUMP).toEqual([
        { label: "CONTROLLER", target: "policy-section-01" },
        { label: "WHAT WE COLLECT", target: "policy-section-02" },
        { label: "LAWFUL BASIS", target: "policy-section-04" },
        { label: "MODELS & TRANSFERS", target: "policy-section-05" },
        { label: "PUBLISHING", target: "policy-section-06" },
        { label: "RETENTION", target: "policy-section-07" },
        { label: "YOUR GDPR RIGHTS", target: "policy-section-10" },
        { label: "COOKIES", target: "policy-section-13" }
      ]);
      for (const jump of POLICY_JUMP) {
        const matches = POLICY_SECTIONS.filter((entry) => `policy-section-${entry.no}` === jump.target);
        expect(matches, `${jump.label} → ${jump.target}`).toHaveLength(1);
      }
    });
  });

  it("cycles every section accent through the six design tokens, in order", () => {
    for (const document of [TERMS_OF_SERVICE, PRIVACY_POLICY]) {
      document.sections.forEach((entry: LegalSection, index: number) => {
        expect(entry.accent, `${document.key} ${entry.no}`).toBe(ACCENT_CYCLE[index % ACCENT_CYCLE.length]);
      });
    }
  });

  it("gives the two modals distinct DOM ids and id prefixes", () => {
    expect(TERMS_OF_SERVICE.titleId).not.toBe(PRIVACY_POLICY.titleId);
    expect(TERMS_OF_SERVICE.gateHintId).not.toBe(PRIVACY_POLICY.gateHintId);
    expect(TERMS_OF_SERVICE.sectionIdPrefix).not.toBe(PRIVACY_POLICY.sectionIdPrefix);
  });
});
