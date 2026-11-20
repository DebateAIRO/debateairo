import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The model providers we have checked work under terms that forbid training on what we send. The web search provider
 * does not: its terms let it keep the search phrases the models write, and the results, and use them for its own
 * business. The English Terms, Privacy Policy and provider register say "no training" of the checked model providers
 * by name, never of Perplexity, and say of web search what it receives and what its provider may do with it. (The
 * translations follow before release: English first.)
 */

const root = process.cwd();
const legal = (name: string): string => readFileSync(resolve(root, "apps/ui/legal/en", name), "utf8");
const registerTexts = JSON.parse(readFileSync(resolve(root, "apps/ui/messages/en/legal.json"), "utf8")) as Record<string, string>;

const KEEPS = "Perplexity's terms let it keep these search phrases and the results, and use them for its own business, such as improving its search.";
/** The promise as it read when it covered the search provider too: of every provider, or of Perplexity by name. */
const COVERS_SEARCH = /We use AI providers only under terms|we do not permit our providers to|DeepInfra, Anthropic and Perplexity do not allow/u;

describe("web search, in the English legal texts", () => {
  const terms = legal("terms-of-service.md");
  const privacy = legal("privacy-policy.md");

  it("the no-training promise names the model providers we have checked, never Perplexity", () => {
    for (const [name, text] of [["terms-of-service.md", terms], ["privacy-policy.md", privacy]] as const) {
      expect(text, name).toContain("The terms of DeepInfra, Anthropic and Amazon do not allow them to use your content to train or improve their models");
      expect(text, name).not.toMatch(COVERS_SEARCH);
    }
    expect(privacy).toContain("the terms of DeepInfra, Anthropic and Amazon do not allow them to; section 5 says for which company we have not confirmed this yet, and what the web search provider may do with the search phrases the models write.");
  });

  it("each text points from the promise to the web search paragraph", () => {
    expect(terms).toContain("Web search is different, and the paragraph on Perplexity below says how.");
    expect(privacy).toContain("Web search is different, and the paragraph on Perplexity above says how.");
    expect(terms).toContain("The web search provider receives only the short search phrases the models write (section 8).");
    expect(privacy).toContain("The web search provider receives only the short search phrases the models write (section 5).");
  });

  it("the web search paragraph says what Perplexity receives and what its terms let it do", () => {
    for (const [name, text] of [["terms-of-service.md", terms], ["privacy-policy.md", privacy]] as const) {
      expect(text, name).toContain("the short search phrases the models write from the debate, much like the few words you would type into a search engine; they can contain words from your question.");
      expect(text, name).toContain(KEEPS);
    }
  });

  it("the provider register says the same in its intro and in the Perplexity row", () => {
    const intro = registerTexts["legal.providers.intro"]!;
    expect(intro).toContain("Each entry below says whether the provider may train its models on your content");
    expect(intro).toContain("only that phrase goes to Perplexity");
    expect(intro).toContain("use them for its own business, such as improving its search");
    expect(registerTexts["legal.providers.retentionPerplexity"]).toBe(
      "No time limit stated. Perplexity receives only the short search phrases the models write, with nothing that says who you are. Its terms let it keep those phrases and the results, and use them for its own business, such as improving its search"
    );
  });
});
