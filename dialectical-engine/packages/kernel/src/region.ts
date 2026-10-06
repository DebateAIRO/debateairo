/** The closed region vocabulary in the Turn 8 · 8a sign-up design. */
export const REGION_CONTINENTS = ["Africa", "Asia", "Europe", "Middle East", "North America", "South America", "Oceania"] as const;
export type RegionContinent = typeof REGION_CONTINENTS[number];
export interface RegionCountry { readonly code: string; readonly englishName: string; readonly continent: RegionContinent; }
export interface UsState { readonly code: string; readonly name: string; }
export interface DeclaredRegion { readonly country: string; readonly usState: string | null; }

const countryRows: Readonly<Record<RegionContinent, string>> = {
  Africa: "DZ Algeria,EG Egypt,ET Ethiopia,GH Ghana,KE Kenya,MA Morocco,NG Nigeria,RW Rwanda,SN Senegal,ZA South Africa,TN Tunisia,UG Uganda",
  Asia: "CN China,IN India,ID Indonesia,JP Japan,MY Malaysia,PK Pakistan,PH Philippines,SG Singapore,KR South Korea,TW Taiwan,TH Thailand,VN Vietnam",
  Europe: "AT Austria,BE Belgium,BG Bulgaria,HR Croatia,CY Cyprus,CZ Czechia,DK Denmark,EE Estonia,FI Finland,FR France,DE Germany,GR Greece,HU Hungary,IE Ireland,IT Italy,LV Latvia,LT Lithuania,LU Luxembourg,MT Malta,MD Moldova,NL Netherlands,NO Norway,PL Poland,PT Portugal,RO Romania,RS Serbia,SK Slovakia,SI Slovenia,ES Spain,SE Sweden,CH Switzerland,UA Ukraine,GB United Kingdom",
  "Middle East": "BH Bahrain,IL Israel,JO Jordan,KW Kuwait,LB Lebanon,OM Oman,QA Qatar,SA Saudi Arabia,TR Türkiye,AE United Arab Emirates",
  "North America": "CA Canada,CR Costa Rica,MX Mexico,PA Panama,US United States",
  "South America": "AR Argentina,BR Brazil,CL Chile,CO Colombia,EC Ecuador,PE Peru,UY Uruguay",
  Oceania: "AU Australia,FJ Fiji,NZ New Zealand"
};
const stateNames = "Alabama,Alaska,Arizona,Arkansas,California,Colorado,Connecticut,Delaware,District of Columbia,Florida,Georgia,Hawaii,Idaho,Illinois,Indiana,Iowa,Kansas,Kentucky,Louisiana,Maine,Maryland,Massachusetts,Michigan,Minnesota,Mississippi,Missouri,Montana,Nebraska,Nevada,New Hampshire,New Jersey,New Mexico,New York,North Carolina,North Dakota,Ohio,Oklahoma,Oregon,Pennsylvania,Rhode Island,South Carolina,South Dakota,Tennessee,Texas,Utah,Vermont,Virginia,Washington,West Virginia,Wisconsin,Wyoming";
const stateCodes = "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY";

export const REGION_COUNTRIES: readonly RegionCountry[] = REGION_CONTINENTS.flatMap((continent) => countryRows[continent].split(",").map((entry) => ({ code: entry.slice(0, 2), englishName: entry.slice(3), continent })));
export const REGION_COUNTRY_CODES: readonly string[] = REGION_COUNTRIES.map((country) => country.code);
export const US_STATES: readonly UsState[] = stateNames.split(",").map((name, index) => ({ code: stateCodes.split(" ")[index]!, name }));
export const US_STATE_CODES: readonly string[] = US_STATES.map((state) => state.code);

const countries = new Set(REGION_COUNTRY_CODES);
const states = new Set(US_STATE_CODES);

export function parseDeclaredRegion(body: Readonly<Record<string, unknown>>): DeclaredRegion | null {
  if (typeof body.country !== "string" || !countries.has(body.country)) return null;
  if (body.country === "US") return typeof body.us_state === "string" && states.has(body.us_state)
    ? { country: "US", usState: body.us_state } : null;
  return Object.hasOwn(body, "us_state") && body.us_state !== null ? null : { country: body.country, usState: null };
}

export function isDeclaredRegion(value: unknown): value is DeclaredRegion {
  if (typeof value !== "object" || value === null || Array.isArray(value) || !("country" in value) || !("usState" in value)) return false;
  const region = value as { country: unknown; usState: unknown };
  return parseDeclaredRegion({ country: region.country, ...(region.usState === null ? {} : { us_state: region.usState }) }) !== null
    && (region.country === "US" || region.usState === null);
}

export function declaredRegionFromPick(country: string | null, usState: string): DeclaredRegion | null {
  if (country === null || !countries.has(country)) return null;
  return country === "US" ? (states.has(usState) ? { country, usState } : null) : { country, usState: null };
}

export function regionContinentOf(code: string): RegionContinent | null {
  return REGION_COUNTRIES.find((country) => country.code === code)?.continent ?? null;
}

export function regionFlag(code: string): string {
  return [...code].map((letter) => String.fromCodePoint(0x1F1A5 + letter.charCodeAt(0))).join("");
}

export function regionCountryName(code: string, locale: string): string {
  const fallback = REGION_COUNTRIES.find((country) => country.code === code)?.englishName ?? code;
  try { return new Intl.DisplayNames([locale, "en"], { type: "region" }).of(code) ?? fallback; }
  catch { return fallback; }
}

export function regionCountriesOf(continent: RegionContinent, locale: string): readonly RegionCountry[] {
  let collator: Intl.Collator;
  try { collator = new Intl.Collator(locale); } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    collator = new Intl.Collator("en");
  }
  return REGION_COUNTRIES.filter((country) => country.continent === continent)
    .sort((a, b) => collator.compare(regionCountryName(a.code, locale), regionCountryName(b.code, locale)));
}
