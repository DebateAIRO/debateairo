"""Regenerate apps/ui/lib/crisisLineDirectory.ts:
  python3 docs/missions/crisis-check/gen-directory.py docs/missions/crisis-check/helplines-2026-09-30.json apps/ui/lib/crisisLineDirectory.ts
"""
import json, sys
src, out = sys.argv[1], sys.argv[2]
d = json.load(open(src))
def js(v): return json.dumps(v, ensure_ascii=False)
UNKNOWN = "unknown"
# Hand-curated from each line's published hours (research of 2026-09-30). Anything whose 24/7
# or hours came from press reports or was not on the confirming page is UNKNOWN: no tag shown.
HOURS = {
  ("AR",0): [{"from":"08:00","to":"00:00"}], ("AR",1): [{"from":"08:00","to":"00:00"}],
  ("CY",0): [{"from":"16:00","to":"00:00"}],
  ("DK",0): [{"from":"09:00","to":"05:00"}],
  ("EE",0): [{"from":"10:00","to":"24:00"}], ("EE",1): [{"from":"19:00","to":"07:00"}],
  ("HR",1): [{"days":["mon","tue","wed","thu","fri"],"from":"09:00","to":"20:00"}],
  ("ID",0): UNKNOWN, ("IL",0): UNKNOWN, ("LU",1): UNKNOWN, ("TW",1): UNKNOWN, ("SE",0): UNKNOWN,
  ("PT",0): UNKNOWN, ("MY",1): UNKNOWN, ("MT",0): UNKNOWN,
  ("LU",0): [{"days":["mon","tue","wed","thu","sun"],"from":"11:00","to":"23:00"},{"days":["fri","sat"],"from":"11:00","to":"03:00"}],
  ("MD",1): "247",
  ("MT",1): [{"days":["mon","tue","wed","thu","fri"],"from":"08:00","to":"20:00"},{"days":["sat"],"from":"08:00","to":"16:00"}],
  ("NZ",1): [{"from":"07:00","to":"00:00"}],
  ("RO",0): [{"days":["fri","sat","sun"],"from":"19:00","to":"07:00"}],
  ("SI",1): [{"from":"19:00","to":"07:00"}],
  ("UA",0): [{"from":"09:00","to":"05:00"}],
  ("VN",0): [{"days":["wed","thu","fri","sat","sun"],"from":"13:00","to":"20:30"}],
}
rows = []
for code in sorted(d["countries"]):
    c = d["countries"][code]
    lines = []
    for i, l in enumerate(c.get("lines", [])):
        if l.get("confidence") != "confirmed" or not (l.get("tel") or l.get("sms") or l.get("chat_url")): continue
        h = HOURS.get((code, i))
        if h is None:
            if l.get("hours") != "24/7": sys.exit(f"uncurated hours {code} {i}: {l.get('hours')}")
            h = "247"
        lines.append((l, h))
    lines.sort(key=lambda p: 0 if p[1] == "247" else 1)
    body = []
    for l, h in lines:
        body.append("      {\n" + ",\n".join([
            f"        name: {js(l['name'])}",
            f"        phone: {js(l.get('phone'))}",
            f"        tel: {js(l.get('tel'))}",
            f"        sms: {js(l.get('sms'))}",
            f"        chatUrl: {js(l.get('chat_url'))}",
            f"        website: {js(l['website'])}",
            f"        open247: {js(h == '247')}",
            f"        hours: {js(None if h in ('247', UNKNOWN) else h)}",
            f"        free: {js(l.get('free'))}",
            f"        sourceUrl: {js(l['source_url'])}",
        ]) + "\n      }")
    rows.append(f"  {code}: {{\n    emergency: {js(c['emergency'])},\n    lines: [\n" + ",\n".join(body) + ("\n" if body else "") + "    ]\n  }")
text = f'''// Generated from the helpline research of {d["researched_at"]} (crisis check, V 2026-09-30).
// Every line was confirmed on the page in its `sourceUrl` on that date; unconfirmed candidates
// were left out, and hours not confirmed on that page are not shown. Re-check before relying on
// a number: helplines change.
import type {{ CrisisCountry }} from "./crisisLines.js";

export const CRISIS_LINES_CHECKED_AT = {js(d["researched_at"])};

export const CRISIS_LINE_DIRECTORY: Readonly<Record<string, CrisisCountry>> = Object.freeze({{
''' + ",\n".join(rows) + "\n});\n"
open(out, "w").write(text)
print(len(rows), "countries,", sum(t.count("sourceUrl") for t in rows), "lines")
