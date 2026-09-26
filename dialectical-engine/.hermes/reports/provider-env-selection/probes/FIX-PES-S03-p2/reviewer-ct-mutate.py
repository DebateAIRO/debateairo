import pathlib, sys
name, readme_path, test_path = sys.argv[1:]
p = pathlib.Path(readme_path)
text = p.read_text()
t = pathlib.Path(test_path)
src = t.read_text()

def drop_line(prefix):
    lines = text.split("\n")
    kept = [line for line in lines if not line.startswith(prefix)]
    if len(kept) == len(lines):
        raise SystemExit(f"prefix not found: {prefix}")
    return "\n".join(kept)

if name == "row-unique":
    text = drop_line("| `SUPPORT_ADMISSION_SCOPES_NOT_SEALED` |")
elif name == "row-price-zero":
    text = drop_line("| `PROVIDER_TARGET_PRICE_ZERO:`")
elif name == "price-one-env":
    old = '"authorization_file":"/etc/debateai/api/providers/acme.header","input_price_micros_per_million":3000000,"output_price_micros_per_million":15000000'
    new = '"authorization_file":"/etc/debateai/api/providers/acme.header"'
    if old not in text:
        raise SystemExit("api.env price pair not found")
    # only the api.env line contains that authorization path
    if text.count(old) != 1:
        raise SystemExit(f"api price pair count {text.count(old)}")
    text = text.replace(old, new, 1)
elif name == "daily-cap":
    old = "deployment still needs sealed cost envelopes (V-28)."
    new = "the daily call cap is the only ceiling until the cost envelope is published. deployment still needs sealed cost envelopes (V-28)."
    if old not in text:
        raise SystemExit("daily-cap anchor missing")
    text = text.replace(old, new, 1)
elif name == "cost-number":
    old = "The development seed publishes `600000`."
    new = "The development seed publishes a value."
    if old not in text:
        raise SystemExit("600000 sentence missing")
    text = text.replace(old, new, 1)
elif name == "stale-bullet":
    old = "Refreshed by Task 14 (2026-09-25)"
    new = old + "- **§11's hosted provider target example** does not carry\n  `input_price_micros_per_million`.\n"
    if old not in text:
        raise SystemExit("stale intro missing")
    text = text.replace(old, new, 1)
elif name == "r34-sentence":
    old = "when that version sealed none"
    new = "when that version sealed nothing"
    if text.count(old) != 1:
        raise SystemExit(f"r34 phrase count {text.count(old)}")
    text = text.replace(old, new, 1)
elif name == "row-wording":
    old = "With the shipped source it is unreachable at runtime."
    new = "With the shipped source it is unreachable in production."
    if text.count(old) != 1:
        raise SystemExit(f"row wording count {text.count(old)}")
    text = text.replace(old, new, 1)
elif name == "section10-old-code":
    old = "or `COST_ENVELOPE_POLICY_INVALID`."
    new = "or `COST_ENVELOPE_POLICY_INVALID`, or `COST_ENVELOPES_NOT_SEALED`."
    if text.count(old) != 1:
        raise SystemExit(f"section10 phrase count {text.count(old)}")
    text = text.replace(old, new, 1)
elif name == "retype":
    start = src.find("    const providers = await read(")
    end = src.find("    expect(union.size).toBe(12);")
    if start < 0 or end < 0:
        raise SystemExit(f"retype anchors missing {start} {end}")
    literal = '''    const union = new Set<string>([
      "COST_ENVELOPE_POLICY_INVALID",
      "COST_ENVELOPE_POLICY_UNRESOLVED",
      "CUSTODY_GROUP_UNRESOLVED",
      "PROVIDER_CREDENTIAL_FILE_ABSENT",
      "PROVIDER_CREDENTIAL_FILE_INVALID",
      "PROVIDER_DISCOVERY_TARGET_PRICE_INVALID",
      "PROVIDER_TARGET_PRICE_REQUIRED",
      "PROVIDER_TARGET_PRICE_ZERO",
      "SECRET_CUSTODY_INVALID",
      "SUPPORT_ADMISSION_SCOPES_NOT_SEALED",
      "SUPPORT_MODEL_CREDENTIAL_ABSENT",
      "SUPPORT_MODEL_PATH_NOT_RATIFIED"
    ]);
'''
    src = src[:start] + literal + src[end:]
    t.write_text(src)
else:
    raise SystemExit(f"unknown mutant {name}")

if name != "retype":
    p.write_text(text)
print(f"applied {name}")
