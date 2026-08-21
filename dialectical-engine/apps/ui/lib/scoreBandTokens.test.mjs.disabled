import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const css = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");

function blockFor(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*\\{(?<body>[^}]*)\\}`, "m"));
  assert.ok(match?.groups?.body, `Missing CSS block for ${selector}`);
  return match.groups.body;
}

function scoreToken(metric, name) {
  const match = css.match(new RegExp(`--score-${metric}-${name}:\\s*oklch\\((?<value>[^)]+)\\)`));
  assert.ok(match?.groups?.value, `Missing --score-${metric}-${name}`);
  const [lightness, chroma, hue] = match.groups.value.trim().split(/\s+/).map(Number);
  assert.ok(Number.isFinite(lightness), `Invalid --score-${metric}-${name} lightness`);
  assert.ok(Number.isFinite(chroma), `Invalid --score-${metric}-${name} chroma`);
  assert.ok(Number.isFinite(hue), `Invalid --score-${metric}-${name} hue`);
  return { lightness, chroma, hue };
}

function oklchToLinearSrgb({ lightness, chroma, hue }) {
  const hueRadians = (hue * Math.PI) / 180;
  const a = chroma * Math.cos(hueRadians);
  const b = chroma * Math.sin(hueRadians);
  const lPrime = lightness + 0.3963377774 * a + 0.2158037573 * b;
  const mPrime = lightness - 0.1055613458 * a - 0.0638541728 * b;
  const sPrime = lightness - 0.0894841775 * a - 1.291485548 * b;
  const l = lPrime ** 3;
  const m = mPrime ** 3;
  const s = sPrime ** 3;

  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((channel) => Math.min(1, Math.max(0, channel)));
}

function relativeLuminance(oklchColor) {
  const [red, green, blue] = oklchToLinearSrgb(oklchColor);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(colorA, colorB) {
  const lighter = Math.max(relativeLuminance(colorA), relativeLuminance(colorB));
  const darker = Math.min(relativeLuminance(colorA), relativeLuminance(colorB));
  return (lighter + 0.05) / (darker + 0.05);
}

test("score badges use theme score band tokens instead of one-off colors", () => {
  for (const metric of ["strength", "uncertainty", "impact"]) {
    const tokenPrefix = `--score-${metric}`;
    assert.match(css, new RegExp(`${tokenPrefix}-border:\\s*oklch\\(`), `Missing ${tokenPrefix}-border token`);
    assert.match(css, new RegExp(`${tokenPrefix}-bg:\\s*oklch\\(`), `Missing ${tokenPrefix}-bg token`);
    assert.match(css, new RegExp(`${tokenPrefix}-text:\\s*oklch\\(`), `Missing ${tokenPrefix}-text token`);

    const badgeBlock = blockFor(`.scoreBadge.${metric}`);
    assert.match(badgeBlock, new RegExp(`border-color:\\s*var\\(${tokenPrefix}-border\\)`));
    assert.match(badgeBlock, new RegExp(`background:\\s*var\\(${tokenPrefix}-bg\\)`));
    assert.match(badgeBlock, new RegExp(`color:\\s*var\\(${tokenPrefix}-text\\)`));
    assert.doesNotMatch(badgeBlock, /oklch\(/, `${metric} badge should consume tokens, not raw colors`);
  }
});

test("score band text tokens keep tiny score badges readable", () => {
  for (const metric of ["strength", "uncertainty", "impact"]) {
    const ratio = contrastRatio(scoreToken(metric, "text"), scoreToken(metric, "bg"));

    assert.ok(ratio >= 15, `${metric} score text/background contrast ${ratio.toFixed(2)} is below 15:1`);
  }
});
