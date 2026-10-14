import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { LOCALES } from "../../apps/ui/lib/i18n/locales.js";

/**
 * RULING G01-C14 (email-locale S01): each draft's legal-chrome comment names the version twice, in
 * the `eyebrow` and in the `endMarker`, and both must name the version of the body's version line.
 * A draft that moves its body to a new version and leaves the chrome behind shows the reader two
 * versions for one text. This is a class guard over all 35 locales and both documents (70 pairs).
 * It reads version tokens only; the translated words of the chrome are not compared.
 */

const FILES = ["privacy-policy.md", "terms-of-service.md"] as const;

const PAIRS = LOCALES.flatMap(({ code }) => FILES.map((file) => [code, file] as const));

describe("legal chrome names the version of its body (RULING G01-C14)", () => {
  it.each(PAIRS.map(([code, file]) => [code, file]))(
    "%s/%s: the eyebrow and the endMarker name the body's version",
    (code, file) => {
      const markdown = readFileSync(resolve(process.cwd(), "apps/ui/legal", code, file), "utf8");
      const body = /^\*\*Version (\d+\.\d+) ·/m.exec(markdown)?.[1];
      const chrome = /<!-- legal-chrome\r?\n([\s\S]*?)\r?\n-->/.exec(markdown)?.[1] ?? "";
      const eyebrow = /^eyebrow: .* v(\d+\.\d+) ·/m.exec(chrome)?.[1];
      const endMarker = /^endMarker: .* v(\d+\.\d+)\s*$/m.exec(chrome)?.[1];
      expect(body).toBeDefined();
      expect(eyebrow).toBe(body);
      expect(endMarker).toBe(body);
    }
  );
});
