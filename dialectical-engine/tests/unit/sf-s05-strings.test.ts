import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const templateDirectory = fileURLToPath(new URL("../../packages/support-kb/content/templates/", import.meta.url));
const locales = readdirSync(templateDirectory)
  .filter((name) => name.endsWith(".json"))
  .map((name) => name.slice(0, -5))
  .sort();
const newIds = ["OFF_TOPIC", "OFF_TOPIC_PART", "CRISIS_SUPPORT", "THREAT_LINE"] as const;

function templateFile(locale: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(templateDirectory, `${locale}.json`), "utf8")) as Record<string, unknown>;
}

describe("S05 fixed support replies", () => {
  it.each(locales)("template file %s carries four non-empty replies without placeholders", (locale) => {
    const templates = templateFile(locale);
    for (const id of newIds) {
      expect(templates[id], `${locale}/${id}`).toEqual(expect.any(String));
      expect((templates[id] as string).trim().length, `${locale}/${id}`).toBeGreaterThan(0);
      expect(templates[id], `${locale}/${id}`).not.toContain("{");
    }
  });

  it("pins the four English and the four Romanian templates byte for byte", () => {
    for (const [locale, expected] of Object.entries({
      en: {
        OFF_TOPIC: "I can only help with Dialectical Engine: your account, plans, debates, publishing and our policies. I can't help with that.",
        OFF_TOPIC_PART: "I can only help with Dialectical Engine, so I haven't answered the rest of your message.",
        CRISIS_SUPPORT: "What you wrote sounds very painful, and you don't have to face it alone. Here is where you can reach someone right now.",
        THREAT_LINE: "I can't help with that. If someone could get hurt, please get help right away."
      },
      ro: {
        OFF_TOPIC: "Te pot ajuta doar cu Dialectical Engine: contul tău, planurile, dezbaterile, publicarea și politicile noastre. Nu te pot ajuta cu asta.",
        OFF_TOPIC_PART: "Te pot ajuta doar cu Dialectical Engine, așa că nu am răspuns la restul mesajului tău.",
        CRISIS_SUPPORT: "Ce ați scris sună foarte dureros și nu trebuie să treceți prin asta fără sprijin. Iată unde puteți vorbi cu cineva chiar acum.",
        THREAT_LINE: "Nu vă pot ajuta cu asta. Dacă cineva ar putea fi rănit, vă rugăm să cereți ajutor imediat."
      }
    })) {
      const templates = templateFile(locale);
      expect(Object.fromEntries(newIds.map((id) => [id, templates[id]])), locale).toEqual(expected);
    }
  });
});
