import { describe, expect, it } from "vitest";
import english from "../../apps/ui/messages/en/staff.json" with { type: "json" };
import romanian from "../../apps/ui/messages/ro/staff.json" with { type: "json" };

const keys = [
  "staff.permission.THREAT_REPORT", "staff.threatReports.link",
  "staff.threatReports.title", "staff.threatReports.lede", "staff.threatReports.listTitle",
  "staff.threatReports.empty", "staff.threatReports.unread.one", "staff.threatReports.unread.few", "staff.threatReports.unread.other",
  "staff.threatReports.decision.UNREAD", "staff.threatReports.decision.REPORTED",
  "staff.threatReports.open", "staff.threatReports.backTeam", "staff.threatReports.backList",
  "staff.threatReports.itemTitle", "staff.threatReports.keptAt", "staff.threatReports.email",
  "staff.threatReports.userId", "staff.threatReports.decideHint", "staff.threatReports.reported",
  "staff.threatReports.notReported", "staff.threatReports.noAccess", "staff.threatReports.gone",
  "staff.threatReports.alreadyDecided", "staff.threatReports.loadFailed", "staff.threatReports.verifyFirst",
  "staff.event.THREAT_REPORT_LIST", "staff.event.THREAT_REPORT_READ",
  "staff.event.THREAT_REPORT_REPORTED", "staff.event.THREAT_REPORT_NOT_REPORTED"
].sort();
const placeholders = (text: string) => [...text.matchAll(/\{[A-Za-z][A-Za-z0-9_]*\}/gu)].map(match => match[0]);

describe("S04 staff message keys", () => {
  it("has exactly the 30 threat-report keys in English and Romanian with only the specified placeholders", () => {
    for (const catalog of [english, romanian]) {
      const actual = Object.keys(catalog).filter(key => key === "staff.permission.THREAT_REPORT" || key.startsWith("staff.threatReports.") || key.startsWith("staff.event.THREAT_REPORT_")).sort();
      expect(actual).toEqual(keys);
      for (const key of keys) expect(placeholders(catalog[key as keyof typeof catalog])).toEqual(key.startsWith("staff.threatReports.unread.") ? ["{count}"] : key === "staff.threatReports.decision.REPORTED" ? ["{date}"] : []);
    }
  });
});
