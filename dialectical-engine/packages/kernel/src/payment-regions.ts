/**
 * Payment region geography: which closed-list region a billing address is in, read from its postal code and, for
 * the US and Canada, its typed region. Data plus one lookup; no I/O. The register's `countryPolicy.regions` decides
 * which of these regions may pay; this file only says where an address is.
 *
 * Sources (read 2026-10-20/21):
 * - US: the USPS three-digit ZIP prefix matrix, L002 effective 2026-10-01, CSV from
 *   https://fast.usps.com/fast/fastApp/resources/labelListFileDownloadFile.action?fileName=DMM_L002.csv&effectiveDate=10/01/2026
 *   says which prefixes are assigned. Its label column names the USPS sorting facility, which can sit in another
 *   state (254 Martinsburg WV is labelled Baltimore MD), so the state of each prefix is the state holding most of its
 *   land and water area in the Census 2020 ZCTA-to-county relationship file
 *   https://www2.census.gov/geo/docs/maps-data/data/rel2020/zcta520/tab20_zcta520_county20_natl.txt
 *   (largest cross-border share of any prefix in the eight states closed at launch: 199 DE, 0.4% MD). Prefixes with
 *   no ZCTA (PO-box or single-firm areas: 005, 055, 192, 311, 332, 375, 399, 459, 509, 555, 649, 733, 842, 876,
 *   885, 889, 901, 938, 942) take the state of their L002 label, which for these is the place itself.
 *   Puerto Rico, the Virgin Islands, Guam and military (AA/AE/AP) prefixes name no state; so do unassigned ones.
 * - Canada: the postal code's first letter, per Canada Post's forward sortation areas.
 * - France: La Poste's official postcode base (https://data.laposte.fr/datasets/laposte-hexasmal, data.gouv.fr
 *   "Base officielle des codes postaux"): 971 Guadeloupe, including Saint-Barthélemy 97133 and Saint-Martin 97150;
 *   972 Martinique; 973 French Guiana; 974 Réunion; 976 Mayotte. 975 is Saint-Pierre-et-Miquelon (not on the list).
 * - Spain, Finland, Greece, Italy, Germany: see EU_POSTCODES below, each with its source.
 */
import { US_STATES } from "./region.js";

/** A member of PAYMENT_REGION_IDS. */
export type PaymentRegionId = string;

export type PaymentRegionAddress = Readonly<{ country: string; postalCode: string | null; region: string | null }>;

export type PaymentRegions = Readonly<
  | { kind: "POSTCODE_INVALID"; regions: readonly PaymentRegionId[] }
  | { kind: "REGIONS"; regions: readonly PaymentRegionId[] }
>;

/** `[first ZIP3, last ZIP3] state`, inclusive, from the sources in the file header. */
const US_ZIP3_RANGES =
  "005 NY, 010-027 MA, 028-029 RI, 030-038 NH, 039-049 ME, 050-054 VT, 055 MA, 056-059 VT, 060-069 CT, 070-089 NJ, " +
  "100-149 NY, 150-196 PA, 197-199 DE, 200 DC, 201 VA, 202-205 DC, 206-212 MD, 214-219 MD, 220-246 VA, 247-268 WV, " +
  "270-289 NC, 290-299 SC, 300-319 GA, 320-339 FL, 341-342 FL, 344 FL, 346-347 FL, 349 FL, 350-352 AL, 354-369 AL, " +
  "370-385 TN, 386-397 MS, 398-399 GA, 400-418 KY, 420-427 KY, 430-459 OH, 460-479 IN, 480-499 MI, 500-516 IA, " +
  "520-528 IA, 530-532 WI, 534-535 WI, 537-549 WI, 550-551 MN, 553-567 MN, 570-577 SD, 580-588 ND, 590-599 MT, " +
  "600-620 IL, 622-629 IL, 630-631 MO, 633-641 MO, 644-658 MO, 660-662 KS, 664-679 KS, 680-681 NE, 683-693 NE, " +
  "700-701 LA, 703-708 LA, 710-714 LA, 716-729 AR, 730-731 OK, 733 TX, 734-741 OK, 743-749 OK, 750-770 TX, " +
  "772-799 TX, 800-816 CO, 820-831 WY, 832-838 ID, 840-847 UT, 850-853 AZ, 855-857 AZ, 859-860 AZ, 863-865 AZ, " +
  "870-871 NM, 873-884 NM, 885 TX, 889-891 NV, 893-895 NV, 897-898 NV, 900-908 CA, 910-928 CA, 930-961 CA, " +
  "967-968 HI, 970-979 OR, 980-986 WA, 988-994 WA, 995-999 AK";

/** Canada Post: the first letter of the postal code. X is shared by the Northwest Territories and Nunavut. */
const CA_FIRST_LETTERS =
  "A NL, B NS, C PE, E NB, G QC, H QC, J QC, K ON, L ON, M ON, N ON, P ON, R MB, S SK, T AB, V BC, X NT-NU, Y YT";

/** Province and territory codes with their full English and French names (the same word in both is listed once). */
const CA_NAMES: Readonly<Record<string, readonly string[]>> = {
  AB: ["Alberta"],
  BC: ["British Columbia", "Colombie-Britannique"],
  MB: ["Manitoba"],
  NB: ["New Brunswick", "Nouveau-Brunswick"],
  NL: ["Newfoundland and Labrador", "Terre-Neuve-et-Labrador"],
  NS: ["Nova Scotia", "Nouvelle-Écosse"],
  NT: ["Northwest Territories", "Territoires du Nord-Ouest"],
  NU: ["Nunavut"],
  ON: ["Ontario"],
  PE: ["Prince Edward Island", "Île-du-Prince-Édouard"],
  QC: ["Quebec", "Québec"],
  SK: ["Saskatchewan"],
  YT: ["Yukon"]
};

/**
 * EU territories outside the EU VAT area, by postcode prefix of a 5-digit code (sources read 2026-10-21).
 * - ES: Canary Islands = provinces 35 Las Palmas and 38 Santa Cruz de Tenerife (Agencia Tributaria postcode
 *   statistics list 35001 and 38001 in those provinces); Ceuta 51 and Melilla 52 (Orden de 27 de septiembre de 1995,
 *   https://www.boe.es/eli/es/o/1995/09/27/(1); BOE notices give "Ceuta 51001", "52003" Melilla).
 * - FI: Åland uses 22xxx (Åland Post's postcode table, https://www.alandpost.ax/privat/skicka/postnummer: every code
 *   22100–22950, Mariehamn 22100; the whole 22 prefix is taken as Åland).
 * - GR: Mount Athos, 63086 Karyes and 63087 Dafni. UNVERIFIED: no official postal source could be read (ELTA has
 *   no static list; the Holy Community's site is behind a bot check); both are the spec's values.
 * - IT: Livigno 23041 (the Comune di Livigno's own address, https://comune.livigno.so.it; Poste Italiane's search
 *   is not readable without a browser); Campione d'Italia 22061 (Swiss Post: only I-22061 applies since 2020,
 *   https://www.post.ch/it/chi-siamo/attualita/2019/campione-d-italia-entra-nello-spazio-doganale-europeo).
 * - DE: Heligoland 27498 (the Gemeinde's imprint, https://www.helgoland.de/rathaus/impressum/); Büsingen am
 *   Hochrhein 78266 (the Gemeinde's imprint, https://www.buesingen.de/impressum; it also has the Swiss code 8238,
 *   written with country CH). Deutsche Post's own search is not readable without a browser.
 */
const EU_POSTCODES: Readonly<Record<string, readonly (readonly [prefix: string, id: PaymentRegionId])[]>> = {
  ES: [["35", "ES-CN"], ["38", "ES-CN"], ["51", "ES-CE"], ["52", "ES-ML"]],
  FR: [["971", "FR-971"], ["972", "FR-972"], ["973", "FR-973"], ["974", "FR-974"], ["976", "FR-976"]],
  FI: [["22", "FI-01"]],
  GR: [["63086", "GR-69"], ["63087", "GR-69"]],
  IT: [["23041", "IT-LIVIGNO"], ["22061", "IT-CAMPIONE"]],
  DE: [["27498", "DE-HELGOLAND"], ["78266", "DE-BUESINGEN"]]
};

/** The closed list of region ids: 51 US (50 states + DC), 12 Canadian, 14 EU territories; sorted. */
export const PAYMENT_REGION_IDS: readonly PaymentRegionId[] = [
  ...US_STATES.map((state) => `US-${state.code}`),
  "CA-AB", "CA-BC", "CA-MB", "CA-NB", "CA-NL", "CA-NS", "CA-NT-NU", "CA-ON", "CA-PE", "CA-QC", "CA-SK", "CA-YT",
  "ES-CN", "ES-CE", "ES-ML", "FR-971", "FR-972", "FR-973", "FR-974", "FR-976", "FI-01", "GR-69",
  "IT-LIVIGNO", "IT-CAMPIONE", "DE-HELGOLAND", "DE-BUESINGEN"
].sort();

/** A postal code is checked against these formats (after normalisation); other countries' codes are never checked. */
const POSTCODE_FORMATS: Readonly<Record<string, RegExp>> = {
  US: /^\d{5}(?:\d{4})?$/,
  CA: /^[ABCEGHJ-NPRSTVXY]\d[A-Z]\d[A-Z]\d$/,
  ES: /^\d{5}$/,
  FR: /^\d{5}$/,
  FI: /^\d{5}$/,
  GR: /^\d{5}$/,
  IT: /^\d{5}$/,
  DE: /^\d{5}$/
};

export const POSTCODE_CHECKED_COUNTRIES: ReadonlySet<string> = new Set(Object.keys(POSTCODE_FORMATS));

const usByZip3: ReadonlyMap<string, PaymentRegionId> = new Map(US_ZIP3_RANGES.split(", ").flatMap((entry) => {
  const [span = "", state = ""] = entry.split(" ");
  const [first = "", last = first] = span.split("-");
  return Array.from({ length: Number(last) - Number(first) + 1 }, (_, offset) =>
    [String(Number(first) + offset).padStart(3, "0"), `US-${state}`] as const);
}));

const caByFirstLetter: ReadonlyMap<string, PaymentRegionId> = new Map(CA_FIRST_LETTERS.split(", ")
  .map((entry) => [entry.slice(0, 1), `CA-${entry.slice(2)}`] as const));

/**
 * The whole name, compared whole (never a part of it): accents dropped, apostrophes (' ’ ʻ) dropped so "Hawaiʻi"
 * is "Hawaii", and every run of spaces, hyphens (- ‐ ‑ – —) and dots made one space, on the table's names and the
 * typed text alike; so "Rhode-Island" and "Terre Neuve et Labrador" match, "New Jersey City" still does not.
 */
const nameKey = (text: string): string => text.normalize("NFD").replace(/\p{M}/gu, "").replace(/['’ʻ]/gu, "")
  .replace(/[\s\-‐‑–—.]+/gu, " ").trim().toLowerCase();

const typedNames: Readonly<Record<"US" | "CA", ReadonlyMap<string, PaymentRegionId>>> = {
  US: new Map(US_STATES.flatMap((state) =>
    [[nameKey(state.code), `US-${state.code}`], [nameKey(state.name), `US-${state.code}`]] as const)),
  CA: new Map(Object.entries(CA_NAMES).flatMap(([code, names]) => {
    const id = code === "NT" || code === "NU" ? "CA-NT-NU" : `CA-${code}`;
    return [code, ...names].map((name) => [nameKey(name), id] as const);
  }))
};

/** Upper case, spaces removed, a leading `F-`/`E-`/`D-`/`I-`/`GR-`/`AX-`/`FI-` stripped, then dashes removed. */
function normalisePostalCode(raw: string): string {
  return raw.toUpperCase().replace(/\s+/g, "").replace(/^(?:GR|AX|FI|F|E|D|I)-/, "").replace(/-/g, "");
}

function postalRegionsOf(country: string, code: string): readonly PaymentRegionId[] {
  const id = country === "US" ? usByZip3.get(code.slice(0, 3))
    : country === "CA" ? caByFirstLetter.get(code.slice(0, 1))
      : EU_POSTCODES[country]?.find(([prefix]) => code.startsWith(prefix))?.[1];
  return id === undefined ? [] : [id];
}

function typedRegionsOf(country: string, region: string | null): readonly PaymentRegionId[] {
  if (region === null || (country !== "US" && country !== "CA")) return [];
  const id = typedNames[country].get(nameKey(region));
  return id === undefined ? [] : [id];
}

/**
 * Every region the billing address names, by either signal. A postal code that doesn't fit its country's format
 * (in POSTCODE_CHECKED_COUNTRIES only) gives POSTCODE_INVALID, still carrying the typed region's regions so a closed
 * region can refuse. No postal code and no typed region names nothing (the pricing page's first quote).
 */
export function paymentRegionsOf(address: PaymentRegionAddress): PaymentRegions {
  const country = address.country.trim().toUpperCase();
  const typed = typedRegionsOf(country, address.region);
  const format = POSTCODE_FORMATS[country];
  // Absent = null or blank. A present code that normalises to nothing ("-") is checked, so it can't slip through.
  if (address.postalCode === null || address.postalCode.trim() === "" || format === undefined) {
    return { kind: "REGIONS", regions: typed };
  }
  const code = normalisePostalCode(address.postalCode);
  if (!format.test(code)) return { kind: "POSTCODE_INVALID", regions: typed };
  return { kind: "REGIONS", regions: [...new Set([...typed, ...postalRegionsOf(country, code)])].sort() };
}
