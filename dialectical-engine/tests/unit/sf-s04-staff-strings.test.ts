import { describe, expect, it } from "vitest";
import english from "../../apps/ui/messages/en/staff.json" with { type: "json" };
import romanian from "../../apps/ui/messages/ro/staff.json" with { type: "json" };

// 2026-11-19: the threat reports page was removed. The grant panel still labels the THREAT_REPORT capability (staff who
// hold it keep a working team page until the database takes it away), and the audit log still labels old threat-report
// events; nothing else about threat reports is left in the catalogs.
const keys = [
  "staff.permission.THREAT_REPORT",
  "staff.event.THREAT_REPORT_LIST", "staff.event.THREAT_REPORT_READ",
  "staff.event.THREAT_REPORT_REPORTED", "staff.event.THREAT_REPORT_NOT_REPORTED"
].sort();
const placeholders = (text: string) => [...text.matchAll(/\{[A-Za-z][A-Za-z0-9_]*\}/gu)].map(match => match[0]);

describe("S04 staff message keys", () => {
  it("keeps only the capability label and the four audit labels in English and Romanian, with no placeholders", () => {
    for (const catalog of [english, romanian]) {
      const actual = Object.keys(catalog).filter(key => /threat/iu.test(key)).sort();
      expect(actual).toEqual(keys);
      for (const key of keys) expect(placeholders(catalog[key as keyof typeof catalog])).toEqual([]);
    }
  });
});
