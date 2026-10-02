/**
 * A Romanian buyer's county and, in Bucharest, sector, written the way SmartBill names them in an invoice's
 * `client.county` and `client.city` (docs/architecture/smartbill-api-facts.md row 3), in ASCII as that row's own
 * example `Bucuresti` is. For a buyer in county `Bucuresti` the city must be `Sector 1` to `Sector 6`, or SPV will not
 * validate the e-Factura. The checkout offers exactly these choices, and the API's address check can import the same
 * lists, so the two never drift apart.
 */
export const BUCHAREST_COUNTY = "Bucuresti";

/** Romania's 41 counties plus the municipality of Bucharest, in alphabetical order. */
export const ROMANIA_COUNTIES: readonly string[] = Object.freeze([
  "Alba", "Arad", "Arges", "Bacau", "Bihor", "Bistrita-Nasaud", "Botosani", "Braila", "Brasov", BUCHAREST_COUNTY,
  "Buzau", "Calarasi", "Caras-Severin", "Cluj", "Constanta", "Covasna", "Dambovita", "Dolj", "Galati", "Giurgiu",
  "Gorj", "Harghita", "Hunedoara", "Ialomita", "Iasi", "Ilfov", "Maramures", "Mehedinti", "Mures", "Neamt", "Olt",
  "Prahova", "Salaj", "Satu Mare", "Sibiu", "Suceava", "Teleorman", "Timis", "Tulcea", "Valcea", "Vaslui", "Vrancea"
]);

/** The only cities SmartBill's e-Factura accepts for county `Bucuresti`. */
export const BUCHAREST_SECTORS: readonly string[] = Object.freeze([
  "Sector 1", "Sector 2", "Sector 3", "Sector 4", "Sector 5", "Sector 6"
]);

/** True when county and city are a pair SmartBill can put on a Romanian e-Factura (a listed county; Bucharest by sector). */
export function isRomanianInvoiceLocality(county: string, city: string): boolean {
  if (!ROMANIA_COUNTIES.includes(county)) return false;
  return county === BUCHAREST_COUNTY ? BUCHAREST_SECTORS.includes(city) : city.trim() !== "";
}
