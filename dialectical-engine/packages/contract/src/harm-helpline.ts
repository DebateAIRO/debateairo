/** Confirmed help for anyone who feels they might hurt someone. */
export type HarmHelpline = Readonly<{
  name: string;
  phone: string;
  tel: string;
  website: string;
  sourceUrl: string;
  checkedAt: string;
  countries: readonly string[];
}>;

/** No source currently confirms a line with the required audience and country coverage. */
export const HARM_TO_OTHERS_HELPLINE: HarmHelpline | null = null;

export function isHarmHelpline(value: unknown): value is HarmHelpline {
  if (typeof value !== "object" || value === null) return false;
  const line = value as Partial<HarmHelpline>;
  if (![line.name, line.phone, line.tel, line.website].every((part) => typeof part === "string" && part.length > 0)) return false;
  try {
    if (new URL(line.sourceUrl ?? "").protocol !== "https:") return false;
    if (new URL(line.website ?? "").protocol !== "https:") return false;
  } catch { return false; }
  if (typeof line.checkedAt !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(line.checkedAt)) return false;
  if (Number.isNaN(Date.parse(`${line.checkedAt}T00:00:00Z`))) return false;
  const countries = line.countries;
  if (!Array.isArray(countries) || countries.length === 0) return false;
  if (!countries.every((country: unknown) => typeof country === "string" && /^[A-Z]{2}$/u.test(country))) return false;
  return countries.every((country: string, index: number) => index === 0 || countries[index - 1]! < country);
}

function forCountry(country: string | null, line: HarmHelpline | null): HarmHelpline | null {
  return country !== null && line !== null && line.countries.includes(country) ? line : null;
}

export function harmHelplineFor(country: string | null): HarmHelpline | null {
  return forCountry(country, HARM_TO_OTHERS_HELPLINE);
}
