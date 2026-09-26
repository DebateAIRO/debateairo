from pathlib import Path
import json, sys
results=json.loads(Path(sys.argv[1]).read_text())
for row in results:
    failures=[line for line in Path(row["log"]).read_text().splitlines() if line.startswith(" FAIL ")]
    assert any("names every start-up refusal the price and cost-envelope surfaces can raise" in line for line in failures), row["label"]
print("PIN_FAILURES_CONFIRMED", len(results))
