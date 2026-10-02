import type { LocationVerdict } from "@debateai/db";

/**
 * Spec §2.5.4 step 3. Two agreeing pieces of evidence settle the place of supply (the EU rule). A person who
 * confirmed their country at checkout (G3) is backed by the card alone. CONFLICTING charges stand, taxed at the
 * declared country, and are listed for the accountant. The verdict vocabulary is P1b's (0086's CHECK).
 */
export function locationVerdict(input: Readonly<{
  declaredCountry: string;
  ipCountry: string;
  cardCountry: string | null;
  countryConfirmed: boolean;
  card: "OK" | "MISMATCH" | "BLOCKED";
}>): LocationVerdict {
  if (input.card === "BLOCKED") return "BLOCKED";
  const cardAgrees = input.cardCountry === input.declaredCountry;
  if (input.countryConfirmed && cardAgrees) return "CONFIRMED_BY_PERSON";
  if (input.ipCountry === input.declaredCountry || cardAgrees) return "AGREED";
  return "CONFLICTING";
}
