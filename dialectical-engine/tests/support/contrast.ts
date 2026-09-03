/** WCAG 2.2 relative luminance of an #RRGGBB colour. */
export function relativeLuminance(hex: string): number {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) {
    throw new TypeError(`Expected an #RRGGBB colour, received ${hex}`);
  }
  const channels = [1, 3, 5].map((offset) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

/** WCAG 2.2 contrast ratio, 1..21. Order-independent. */
export function contrastRatio(a: string, b: string): number {
  const first = relativeLuminance(a);
  const second = relativeLuminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

/** Every token and its worst ratio over the surface set, for one mode. */
export function worstRatios(
  tokens: Readonly<Record<string, string>>,
  surfaces: readonly string[]
): ReadonlyArray<{ token: string; surface: string; ratio: number }> {
  if (surfaces.length === 0) throw new TypeError("At least one surface is required");
  return Object.entries(tokens).map(([token, value]) => {
    const candidates = surfaces.map((surface) => ({
      token,
      surface,
      ratio: contrastRatio(value, surface)
    }));
    return candidates.reduce((worst, candidate) =>
      candidate.ratio < worst.ratio ? candidate : worst
    );
  });
}
