#!/usr/bin/env python3
"""Task 17 (P5): benchmark harness runner.

Drives the coordinator's HTTP API to create one debate per case in
cases/suite-v1.json, polls each to a terminal state under a per-case
timeout, THEN reads metrics directly from the coordinator's sqlite DB
(always opened read-only via a `file:` URI -- this process never writes to
the debate DB). Config tag (git SHA, DIALECTICAL_*/NEXT_PUBLIC_* flags,
model pool), spend cap, --dry-run, --limit, and --panel are implemented per
docs/improvement-plan-2026-07-22.md's P5 section and this task's brief.

Verdict band / lean are derived by importing the coordinator's own pure
functions (app.scoring.verdict.verdict_summary, app.scoring.lean.
compute_lean) rather than re-deriving that logic here -- the whole point of
reporting "verdict band" is that it must never drift from what production
actually serves. See the import block below for why this is safe (no DB/
network touched at import time).

Usage:
    python runner.py --dry-run
    python runner.py --out runs/baseline --max-spend-usd 5
    python runner.py --out runs/candidate --limit 5 --panel

See README.md in this directory for the full operating guide, including the
flip-gating rule and cost expectations.
"""
from __future__ import annotations

import argparse
import json
import statistics
import subprocess
import sqlite3
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from typing import Any, Callable

import httpx

ROOT = Path(__file__).resolve().parents[2]  # apps/dialectical-engine
SCRIPTS_ROOT = ROOT / "scripts"
COORDINATOR_ROOT = ROOT / "coordinator"
for _path in (SCRIPTS_ROOT, COORDINATOR_ROOT):
    if str(_path) not in sys.path:
        sys.path.insert(0, str(_path))

from _common import dev_user_token  # noqa: E402

# Reuses the coordinator's own pure derivation functions so this harness's
# "verdict band"/"lean" metrics can never drift from production semantics.
# Importing app.scoring.* triggers app/scoring/__init__.py's documented
# import cycle (app.scoring -> app.scoring.service -> app.services.
# orchestrator -> app.services.serialization -- see that module's own
# top-of-file comment for the full chain) -- proven import-safe by every
# coordinator test (conftest.py's `import app.main` warms this exact cycle
# before any test runs). Nothing on this import path touches the DB or the
# network: `load_settings()` -- the one call in this chain that reads
# ~/.dialectical/coordinator.toml -- is only invoked eagerly by app.main,
# never by this chain, so this module never touches ~/.dialectical.
from app.evidence.presence import evidence_presence  # noqa: E402
from app.scoring.lean import compute_lean, live_pro_con_node_ids  # noqa: E402
from app.scoring.lineage import lineage_family  # noqa: E402
from app.scoring.verdict import verdict_summary  # noqa: E402
from app.services.spend import MODEL_PRICING_USD_PER_MILLION_TOKENS  # noqa: E402


DEFAULT_BASE_URL = "http://127.0.0.1:8000"
DEFAULT_DB_PATH = Path("~/.dialectical/db.sqlite3").expanduser()
DEFAULT_SUITE_PATH = Path(__file__).resolve().parent / "cases" / "suite-v1.json"
DEFAULT_TIMEOUT_SECONDS = 900
DEFAULT_POLL_INTERVAL_SECONDS = 5.0
MANIFEST_SCHEMA_VERSION = "benchmark-manifest-v1"

_ENV_FLAG_PREFIXES = ("DIALECTICAL_", "NEXT_PUBLIC_")
_TERMINAL_STATUSES = {"complete", "failed"}


# ---------------------------------------------------------------------------
# Suite loading + schema validation (blueprint's "Evaluation unit" shape;
# the exact required fields and category/direction/trap invariants are the
# task brief's binding controller resolution).
# ---------------------------------------------------------------------------

_REQUIRED_CASE_FIELDS = (
    "id",
    "category",
    "claim_type",
    "topic",
    "user_intent",
    "expected_verdict_direction",
    "is_trap",
    "ground_truth_notes",
    "reference",
)
_VALID_CATEGORIES = {"ground_truth_true", "ground_truth_false", "contested_normative"}
_VALID_CLAIM_TYPES = {"empirical", "causal", "normative", "prediction", "mixed"}
_VALID_DIRECTIONS = {"supported", "unsupported", "contested"}
_EXPECTED_CATEGORY_COUNTS = {"ground_truth_true": 8, "ground_truth_false": 8, "contested_normative": 9}
_EXPECTED_DIRECTION_BY_CATEGORY = {
    "ground_truth_true": "supported",
    "ground_truth_false": "unsupported",
    "contested_normative": "contested",
}
_MIN_TRAP_COUNT = 3
_REQUIRED_NONEMPTY_TEXT_FIELDS = ("topic", "user_intent", "ground_truth_notes", "reference")


def load_suite(path: Path | str) -> dict:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def validate_suite(suite: Any) -> list[str]:
    """Returns a list of human-readable error strings; empty == valid.
    Never raises -- malformed input just produces error strings."""
    errors: list[str] = []
    if not isinstance(suite, dict):
        return ["suite must be a JSON object"]
    cases = suite.get("cases")
    if not isinstance(cases, list):
        return ["suite.cases must be a list"]

    seen_ids: set[str] = set()
    category_counts: dict[str, int] = {}
    trap_count = 0
    for index, case in enumerate(cases):
        if not isinstance(case, dict):
            errors.append(f"case[{index}]: must be an object")
            continue
        label = case.get("id")
        prefix = f"case[{index}]" + (f" ({label})" if isinstance(label, str) and label else "")

        for field in _REQUIRED_CASE_FIELDS:
            if field not in case:
                errors.append(f"{prefix}: missing required field '{field}'")

        if isinstance(label, str) and label:
            if label in seen_ids:
                errors.append(f"{prefix}: duplicate id '{label}'")
            seen_ids.add(label)

        category = case.get("category")
        if category is not None:
            if category not in _VALID_CATEGORIES:
                errors.append(f"{prefix}: invalid category '{category}'")
            else:
                category_counts[category] = category_counts.get(category, 0) + 1

        claim_type = case.get("claim_type")
        if claim_type is not None and claim_type not in _VALID_CLAIM_TYPES:
            errors.append(f"{prefix}: invalid claim_type '{claim_type}'")

        direction = case.get("expected_verdict_direction")
        if direction is not None and direction not in _VALID_DIRECTIONS:
            errors.append(f"{prefix}: invalid expected_verdict_direction '{direction}'")
        expected_direction = _EXPECTED_DIRECTION_BY_CATEGORY.get(category)
        if expected_direction is not None and direction is not None and direction != expected_direction:
            errors.append(
                f"{prefix}: category '{category}' requires expected_verdict_direction "
                f"'{expected_direction}', got '{direction}'"
            )

        is_trap = case.get("is_trap")
        if is_trap is True:
            trap_count += 1
            if category != "ground_truth_false":
                errors.append(f"{prefix}: is_trap is only valid for category 'ground_truth_false'")
        elif is_trap is not None and is_trap is not False:
            errors.append(f"{prefix}: is_trap must be a boolean")

        for field in _REQUIRED_NONEMPTY_TEXT_FIELDS:
            value = case.get(field)
            if value is not None and (not isinstance(value, str) or not value.strip()):
                errors.append(f"{prefix}: field '{field}' must be a non-empty string")

    if len(cases) != 25:
        errors.append(f"suite must contain exactly 25 cases (found {len(cases)})")
    for category, expected_count in _EXPECTED_CATEGORY_COUNTS.items():
        actual = category_counts.get(category, 0)
        if actual != expected_count:
            errors.append(f"category '{category}' must have {expected_count} cases (found {actual})")
    if trap_count < _MIN_TRAP_COUNT:
        errors.append(f"suite must contain at least {_MIN_TRAP_COUNT} false-premise traps, found {trap_count}")

    return errors


def cases_from_suite(suite: dict, *, limit: int | None) -> list[dict]:
    cases = suite.get("cases", [])
    return cases if limit is None else cases[:limit]


# ---------------------------------------------------------------------------
# DB metrics -- always read-only, always via a `file:` URI.
# ---------------------------------------------------------------------------


def open_readonly_db(path: Path | str) -> sqlite3.Connection:
    resolved = Path(path).expanduser().resolve()
    uri = f"{resolved.as_uri()}?mode=ro"
    conn = sqlite3.connect(uri, uri=True)
    conn.row_factory = sqlite3.Row
    return conn


def _json_column(value: str | None) -> Any | None:
    if not value:
        return None
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return None


def parse_sqlite_datetime(value: str | None) -> datetime | None:
    """Parses the exact naive `YYYY-MM-DD HH:MM:SS[.ffffff]` text SQLAlchemy's
    sqlite dialect stores for a DateTime column (verified empirically against
    a real committed row -- see task-17-report.md; SQLite has no native
    datetime type, so SQLAlchemy stores a naive, always-UTC string here since
    every writer in this codebase sources timestamps from app.models.
    entities.now_utc())."""
    if not value:
        return None
    text = value.strip()
    if not text:
        return None
    if " " in text and "T" not in text:
        text = text.replace(" ", "T", 1)
    try:
        return datetime.fromisoformat(text)
    except ValueError:
        return None


def debate_wall_time_seconds(conn: sqlite3.Connection, debate_id: str) -> float | None:
    row = conn.execute("SELECT created_at, completed_at FROM debates WHERE id = ?", (debate_id,)).fetchone()
    if row is None:
        return None
    created = parse_sqlite_datetime(row["created_at"])
    completed = parse_sqlite_datetime(row["completed_at"])
    if created is None or completed is None:
        return None
    return (completed - created).total_seconds()


def branch_completion(conn: sqlite3.Connection, debate_id: str) -> dict:
    debate = conn.execute("SELECT root_node_id FROM debates WHERE id = ?", (debate_id,)).fetchone()
    root_node_id = debate["root_node_id"] if debate else None
    if not root_node_id:
        return {"completed": 0, "total": 0, "fraction": None}
    rows = conn.execute(
        "SELECT status FROM nodes WHERE debate_id = ? AND parent_id = ?", (debate_id, root_node_id)
    ).fetchall()
    total = len(rows)
    completed = sum(1 for row in rows if row["status"] == "complete")
    return {"completed": completed, "total": total, "fraction": (completed / total) if total else None}


def completed_branch_model_families(conn: sqlite3.Connection, debate_id: str) -> list[str]:
    debate = conn.execute("SELECT root_node_id FROM debates WHERE id = ?", (debate_id,)).fetchone()
    root_node_id = debate["root_node_id"] if debate else None
    if not root_node_id:
        return []
    all_nodes = conn.execute("SELECT id, parent_id, status FROM nodes WHERE debate_id = ?", (debate_id,)).fetchall()
    by_id = {row["id"]: row for row in all_nodes}
    completed_branch_ids = {
        row["id"] for row in all_nodes if row["parent_id"] == root_node_id and row["status"] == "complete"
    }
    if not completed_branch_ids:
        return []

    def top_branch_id(node_id: str) -> str | None:
        seen: set[str] = set()
        current = by_id.get(node_id)
        while current is not None and current["parent_id"] != root_node_id:
            if current["id"] in seen:
                return None
            seen.add(current["id"])
            current = by_id.get(current["parent_id"])
        return current["id"] if current is not None else None

    node_ids = [
        row["id"]
        for row in all_nodes
        if row["id"] in completed_branch_ids or top_branch_id(row["id"]) in completed_branch_ids
    ]
    if not node_ids:
        return []
    placeholders = ",".join("?" for _ in node_ids)
    gen_rows = conn.execute(
        f"SELECT DISTINCT model_id FROM generations WHERE node_id IN ({placeholders})", node_ids
    ).fetchall()
    families = {lineage_family(row["model_id"]) for row in gen_rows}
    families.discard(None)
    return sorted(families)


def evidence_breakdown(conn: sqlite3.Connection, debate_id: str) -> dict:
    rows = conn.execute(
        "SELECT metadata FROM nodes WHERE debate_id = ? AND node_type = 'EVIDENCE'", (debate_id,)
    ).fetchall()
    by_method: dict[str, int] = {}
    by_resolution_status: dict[str, int] = {}
    for row in rows:
        metadata = _json_column(row["metadata"]) or {}
        method = metadata.get("method") if isinstance(metadata, dict) else None
        resolution_status = metadata.get("resolution_status") if isinstance(metadata, dict) else None
        method_key = method if isinstance(method, str) and method else "none"
        status_key = resolution_status if isinstance(resolution_status, str) and resolution_status else "none"
        by_method[method_key] = by_method.get(method_key, 0) + 1
        by_resolution_status[status_key] = by_resolution_status.get(status_key, 0) + 1
    return {"total": len(rows), "by_method": by_method, "by_resolution_status": by_resolution_status}


def verification_verdict_counts(conn: sqlite3.Connection, debate_id: str) -> dict[str, int]:
    rows = conn.execute(
        "SELECT output FROM analyzer_runs WHERE debate_id = ? AND analyzer_type = 'evidence_verification'",
        (debate_id,),
    ).fetchall()
    counts: dict[str, int] = {}
    for row in rows:
        output = _json_column(row["output"]) or {}
        status = output.get("status") if isinstance(output, dict) else None
        key = status if isinstance(status, str) and status else "unknown"
        counts[key] = counts.get(key, 0) + 1
    return counts


def five_number_summary(values: list[float]) -> dict | None:
    if not values:
        return None
    ordered = sorted(values)
    if len(ordered) == 1:
        value = ordered[0]
        return {"n": 1, "min": value, "q1": value, "median": value, "q3": value, "max": value}
    q1, median, q3 = statistics.quantiles(ordered, n=4, method="inclusive")
    return {"n": len(ordered), "min": ordered[0], "q1": q1, "median": median, "q3": q3, "max": ordered[-1]}


def latest_score_distribution(conn: sqlite3.Connection, debate_id: str) -> dict | None:
    row = conn.execute(
        "SELECT output FROM analyzer_runs WHERE debate_id = ? AND analyzer_type = 'node_scoring' "
        "ORDER BY seq DESC, created_at DESC, id DESC LIMIT 1",
        (debate_id,),
    ).fetchone()
    if row is None:
        return None
    output = _json_column(row["output"])
    items = output.get("items") if isinstance(output, dict) else None
    if not isinstance(items, list) or not items:
        return None
    strengths: list[float] = []
    uncertainties: list[float] = []
    for item in items:
        scores = item.get("scores") if isinstance(item, dict) else None
        if not isinstance(scores, dict):
            continue
        strength = scores.get("strength")
        uncertainty = scores.get("uncertainty")
        if isinstance(strength, (int, float)) and not isinstance(strength, bool):
            strengths.append(float(strength))
        if isinstance(uncertainty, (int, float)) and not isinstance(uncertainty, bool):
            uncertainties.append(float(uncertainty))
    return {
        "scored_node_count": len(items),
        "strength": five_number_summary(strengths),
        "uncertainty": five_number_summary(uncertainties),
    }


def latest_protocol_output(conn: sqlite3.Connection, debate_id: str) -> dict | None:
    row = conn.execute(
        "SELECT output FROM analyzer_runs WHERE debate_id = ? AND analyzer_type = 'protocol_analysis' "
        "ORDER BY seq DESC, created_at DESC, id DESC LIMIT 1",
        (debate_id,),
    ).fetchone()
    if row is None:
        return None
    output = _json_column(row["output"])
    return output if isinstance(output, dict) else None


def verdict_band_and_lean(conn: sqlite3.Connection, debate_id: str, *, gate_enabled: bool = False) -> dict:
    """`gate_enabled` mirrors app.services.serialization.derive_debate_
    verdict's live `bool_env("DIALECTICAL_VERDICT_EVIDENCE_GATE", False)`
    read -- the exact value production computes verdictBand with for
    GET /api/debates/{id}. Callers must pass the run's real value (see
    gate_enabled_from_config); the False default here is only the same
    fail-safe default bool_env itself uses, not an assumption that the gate
    is off."""
    debate = conn.execute("SELECT root_node_id FROM debates WHERE id = ?", (debate_id,)).fetchone()
    root_node_id = debate["root_node_id"] if debate else None
    protocol_output = latest_protocol_output(conn, debate_id)
    node_rows = conn.execute(
        "SELECT id, node_type, status, claim FROM nodes WHERE debate_id = ?", (debate_id,)
    ).fetchall()
    presence = evidence_presence(
        [SimpleNamespace(node_type=row["node_type"], claim=row["claim"] or "") for row in node_rows]
    )
    verdict = verdict_summary(
        protocol_output, root_node_id=root_node_id, evidence_presence=presence, gate_enabled=gate_enabled
    )
    pro_ids, con_ids = live_pro_con_node_ids(
        [{"id": row["id"], "node_type": row["node_type"], "status": row["status"]} for row in node_rows]
    )
    lean = compute_lean(protocol_output, live_pro_node_ids=pro_ids, live_con_node_ids=con_ids)
    return {"verdict_band": verdict.get("verdictBand"), "lean": lean}


def failover_event_count(conn: sqlite3.Connection, debate_id: str) -> int:
    row = conn.execute(
        "SELECT COUNT(*) AS n FROM job_transitions WHERE debate_id = ? AND channel = 'failover'", (debate_id,)
    ).fetchone()
    return int(row["n"]) if row else 0


def judge_call_count(conn: sqlite3.Connection, debate_id: str) -> int:
    row = conn.execute(
        "SELECT COUNT(*) AS n FROM judge_output_artifacts WHERE debate_id = ?", (debate_id,)
    ).fetchone()
    return int(row["n"]) if row else 0


def token_and_spend_totals(conn: sqlite3.Connection, debate_id: str, pricing: dict) -> dict:
    """Sums EVERY Generation row for the debate's nodes (not just each
    node's currently-active one) -- every generation call was a real,
    billed API call, matching app.services.spend.model_monthly_spend_usd's
    own no-is_active-filter accounting convention."""
    rows = conn.execute(
        "SELECT g.model_id AS model_id, g.tokens_in AS tokens_in, g.tokens_out AS tokens_out "
        "FROM generations g JOIN nodes n ON g.node_id = n.id WHERE n.debate_id = ?",
        (debate_id,),
    ).fetchall()
    by_model: dict[str, dict[str, int]] = {}
    total_in = total_out = 0
    for row in rows:
        model_id = row["model_id"] or "unknown"
        tokens_in = int(row["tokens_in"] or 0)
        tokens_out = int(row["tokens_out"] or 0)
        total_in += tokens_in
        total_out += tokens_out
        entry = by_model.setdefault(model_id, {"tokens_in": 0, "tokens_out": 0})
        entry["tokens_in"] += tokens_in
        entry["tokens_out"] += tokens_out

    known_total = 0.0
    spend_by_model: dict[str, float] = {}
    unpriced_model_ids: list[str] = []
    for model_id, counts in by_model.items():
        price = pricing.get(model_id)
        if price is None:
            unpriced_model_ids.append(model_id)
            continue
        cost = (counts["tokens_in"] / 1_000_000) * price["input"] + (counts["tokens_out"] / 1_000_000) * price["output"]
        spend_by_model[model_id] = round(cost, 6)
        known_total += cost

    return {
        "tokens_in": total_in,
        "tokens_out": total_out,
        "by_model": by_model,
        "spend_usd": {
            "known_total": round(known_total, 6),
            "by_model": spend_by_model,
            "unpriced_model_ids": sorted(unpriced_model_ids),
        },
    }


def collect_case_metrics(
    conn: sqlite3.Connection, debate_id: str, pricing: dict | None = None, *, gate_enabled: bool = False
) -> dict:
    """Composes every §1-style metric the brief lists, in one call, from
    already-open read-only DB rows -- the single entry point run_case uses.
    `gate_enabled` -- see verdict_band_and_lean's docstring -- must be the
    run's real DIALECTICAL_VERDICT_EVIDENCE_GATE value, not assumed off."""
    pricing = MODEL_PRICING_USD_PER_MILLION_TOKENS if pricing is None else pricing
    verdict_lean = verdict_band_and_lean(conn, debate_id, gate_enabled=gate_enabled)
    tokens_spend = token_and_spend_totals(conn, debate_id, pricing)
    return {
        "branch_completion": branch_completion(conn, debate_id),
        "model_families_completed_branches": completed_branch_model_families(conn, debate_id),
        "evidence": evidence_breakdown(conn, debate_id),
        "verification_verdict_counts": verification_verdict_counts(conn, debate_id),
        "score_distribution": latest_score_distribution(conn, debate_id),
        "verdict_band": verdict_lean["verdict_band"],
        "lean": verdict_lean["lean"],
        "failover_events": failover_event_count(conn, debate_id),
        "judge_calls": judge_call_count(conn, debate_id),
        "tokens_in": tokens_spend["tokens_in"],
        "tokens_out": tokens_spend["tokens_out"],
        "spend_usd": tokens_spend["spend_usd"],
        "wall_time_seconds_db": debate_wall_time_seconds(conn, debate_id),
    }


# ---------------------------------------------------------------------------
# Config tag: git SHA, DIALECTICAL_*/NEXT_PUBLIC_* flags, model pool.
# ---------------------------------------------------------------------------


def git_sha(repo_root: Path | str) -> str:
    try:
        completed = subprocess.run(
            ["git", "-C", str(repo_root), "rev-parse", "HEAD"],
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
    except (OSError, subprocess.SubprocessError):
        return "unknown"
    if completed.returncode != 0:
        return "unknown"
    sha = completed.stdout.strip().lower()
    if len(sha) != 40 or any(char not in "0123456789abcdef" for char in sha):
        return "unknown"
    return sha


def flags_from_env_file(path: Path | str | None) -> dict:
    """The coordinator exposes no live-flag-listing endpoint (checked:
    /api/ops only serves job transitions + verdict-shadow telemetry,
    /api/settings only serves routing/spend) -- so an operator-supplied
    env-file (the same file used to configure the coordinator's launchd
    plist / .env) is the only honest source. Absent that, flags are
    honestly recorded as unknown rather than guessed."""
    if path is None:
        return {"source": "unknown"}
    path = Path(path)
    if not path.exists():
        return {"source": "unknown"}
    values: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if stripped.startswith("export "):
            stripped = stripped[len("export "):].strip()
        if "=" not in stripped:
            continue
        key, _, value = stripped.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key.startswith(_ENV_FLAG_PREFIXES):
            values[key] = value
    return {"source": "env_file", "path": str(path), "values": values}


def _auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def fetch_settings(client: httpx.Client, base_url: str, token: str) -> dict | None:
    try:
        response = client.get(f"{base_url}/api/settings", headers=_auth_headers(token))
        response.raise_for_status()
        return response.json()
    except httpx.HTTPError:
        return None


def resolve_config_tag(
    *, repo_root: Path, env_file: Path | str | None, client: httpx.Client, base_url: str, token: str
) -> dict:
    return {
        "git_sha": git_sha(repo_root),
        "flags": flags_from_env_file(env_file),
        "model_pool": fetch_settings(client, base_url, token),
    }


# Mirrors app.core.config.bool_env's truthy vocabulary exactly -- this is not
# a live env lookup (bool_env reads os.environ by name), it parses an
# already-captured flag *value* string from the run's own config tag.
_TRUTHY_FLAG_VALUES = {"1", "true", "yes", "on"}


def gate_enabled_from_config(config: dict | None) -> bool:
    """DIALECTICAL_VERDICT_EVIDENCE_GATE, read from the run's own captured
    config-tag flags (see flags_from_env_file), not hardcoded. Mirrors
    app.services.serialization.derive_debate_verdict's live
    `bool_env("DIALECTICAL_VERDICT_EVIDENCE_GATE", False)` read -- the exact
    value production computes verdictBand with for GET /api/debates/{id} --
    so this harness's verdict_band metric can never silently diverge from
    what a real client sees once flip-plan stage 6 flips that flag on.
    Absent --env-file (flags source "unknown") or the flag simply not being
    present in the captured file, this honestly defaults to False -- the
    same default bool_env itself uses, never a guess."""
    if not isinstance(config, dict):
        return False
    values = (config.get("flags") or {}).get("values")
    if not isinstance(values, dict):
        return False
    raw = values.get("DIALECTICAL_VERDICT_EVIDENCE_GATE")
    if not isinstance(raw, str):
        return False
    return raw.strip().lower() in _TRUTHY_FLAG_VALUES


# ---------------------------------------------------------------------------
# Coordinator HTTP driving.
# ---------------------------------------------------------------------------


def create_debate(client: httpx.Client, base_url: str, token: str, topic: str) -> dict:
    response = client.post(f"{base_url}/api/debates", headers=_auth_headers(token), json={"topic": topic})
    response.raise_for_status()
    return response.json()


def fetch_debate(client: httpx.Client, base_url: str, token: str, debate_id: str) -> dict:
    response = client.get(f"{base_url}/api/debates/{debate_id}", headers=_auth_headers(token))
    response.raise_for_status()
    return response.json()


def is_terminal_status(status: Any) -> bool:
    return status in _TERMINAL_STATUSES


def poll_until_terminal(
    client: httpx.Client,
    base_url: str,
    token: str,
    debate_id: str,
    *,
    timeout_seconds: float,
    poll_interval_seconds: float,
    sleep_fn: Callable[[float], None] = time.sleep,
    clock_fn: Callable[[], float] = time.monotonic,
) -> dict:
    start = clock_fn()
    while True:
        debate = fetch_debate(client, base_url, token, debate_id)
        elapsed = clock_fn() - start
        if is_terminal_status(debate.get("status")):
            return {"debate": debate, "elapsed_seconds": elapsed, "timed_out": False}
        if elapsed >= timeout_seconds:
            return {"debate": debate, "elapsed_seconds": elapsed, "timed_out": True}
        sleep_fn(poll_interval_seconds)


# ---------------------------------------------------------------------------
# LLM-panel scoring (dims 1-10) -- default OFF, real CLI provider calls.
# NO code in this section runs in tests; only the pure helpers
# (PANEL_DIMENSIONS, mean_panel_scores, parse_panel_json_scores,
# build_panel_prompt) are unit-tested.
# ---------------------------------------------------------------------------

PANEL_DIMENSIONS: tuple[tuple[str, str], ...] = (
    ("1_truthfulness", "Truthfulness / factual correctness"),
    ("2_hallucination_rate", "Hallucination rate (1.0 = no fabrication, 0.0 = severe fabrication)"),
    ("3_evidence_quality", "Evidence quality"),
    ("4_argument_coverage", "Argument coverage"),
    ("5_counterargument_strength", "Counterargument strength / adversarial robustness"),
    ("6_wrongful_agreement_resistance", "Wrongful agreement / sycophancy resistance"),
    ("7_calibration", "Calibration"),
    ("8_relevance", "Relevance / answer fit"),
    ("9_insight_density", "Insight density"),
    ("10_completeness_concision_balance", "Completeness vs concision balance"),
)
PANEL_JUDGE_FAMILIES = ("claude", "gemini")
_PANEL_DEFAULT_MODEL_BY_FAMILY = {
    "claude": "claude-sonnet-5-high-loop",
    "gemini": "gemini-3.5-flash-high",
}


def build_panel_prompt(topic: str, synthesis_text: str) -> str:
    dimension_lines = "\n".join(f"- {key}: {title}" for key, title in PANEL_DIMENSIONS)
    keys = ", ".join(f'"{key}"' for key, _title in PANEL_DIMENSIONS)
    return f"""You are an independent judge scoring a debate synthesis for a benchmark harness.

Debate topic:
{topic}

Synthesis to score:
{synthesis_text}

Score the synthesis on these dimensions, each as a float from 0.0 (worst) to 1.0 (best).
Higher is always better, including for hallucination_rate (1.0 = no fabrication found).

{dimension_lines}

Output exactly one JSON object with keys {keys}, each mapped to a 0.0-1.0 float. No prose, no markdown fences."""


def parse_panel_json_scores(text: str) -> dict | None:
    if not isinstance(text, str):
        return None
    decoder = json.JSONDecoder()
    for index, char in enumerate(text):
        if char != "{":
            continue
        try:
            payload, _ = decoder.raw_decode(text[index:])
        except json.JSONDecodeError:
            continue
        if isinstance(payload, dict):
            return payload
    return None


def mean_panel_scores(score_dicts: list[dict]) -> dict:
    if not score_dicts:
        return {}
    totals: dict[str, float] = {}
    counts: dict[str, int] = {}
    for scores in score_dicts:
        for key, value in scores.items():
            if not isinstance(value, (int, float)) or isinstance(value, bool):
                continue
            totals[key] = totals.get(key, 0.0) + float(value)
            counts[key] = counts.get(key, 0) + 1
    return {key: totals[key] / counts[key] for key in totals}


def synthesis_text_from_debate_json(debate_json: dict) -> str | None:
    synthesis = debate_json.get("synthesis") if isinstance(debate_json, dict) else None
    if not isinstance(synthesis, dict):
        return None
    parts = [synthesis.get("verdict") or "", synthesis.get("strongest_pro") or "", synthesis.get("strongest_con") or ""]
    text = "\n\n".join(part for part in parts if isinstance(part, str) and part.strip())
    return text or None


def run_panel_scoring(topic: str, synthesis_text: str, *, families: tuple[str, ...] = PANEL_JUDGE_FAMILIES) -> dict:
    """Real in-process CLI provider calls, reusing the coordinator's own
    provider-registry pattern for a cross-family panel (app.providers.
    judge_panel_providers.panel_cli_provider_for_family -- Task 6's judge
    panel machinery). Only reached when --panel is passed; never exercised
    by tests."""
    from app.providers.judge_panel_providers import panel_cli_provider_for_family

    judges: dict[str, dict] = {}
    for family in families:
        provider = panel_cli_provider_for_family(family)
        if provider is None:
            judges[family] = {"available": False, "reason": f"no coordinator-side CLI provider for family {family!r}"}
            continue
        model = _PANEL_DEFAULT_MODEL_BY_FAMILY.get(family, family)
        try:
            response = provider.generate(
                [{"role": "user", "content": build_panel_prompt(topic, synthesis_text)}],
                model=model,
                response_format="json",
                role="benchmark_panel_judge",
            )
        except Exception as exc:  # noqa: BLE001 - one judge's failure must not sink the panel
            judges[family] = {"available": True, "model": model, "error": str(exc)}
            continue
        scores = parse_panel_json_scores(response.text)
        judges[family] = {"available": True, "model": model, "scores": scores, "raw_parse_ok": scores is not None}
    means = mean_panel_scores([judge["scores"] for judge in judges.values() if isinstance(judge.get("scores"), dict)])
    return {"judges": judges, "mean": means}


# ---------------------------------------------------------------------------
# Per-case orchestration.
# ---------------------------------------------------------------------------


def _case_result_shell(case: dict) -> dict:
    return {
        "case_id": case["id"],
        "category": case["category"],
        "claim_type": case["claim_type"],
        "topic": case["topic"],
        "expected_verdict_direction": case["expected_verdict_direction"],
        "is_trap": case["is_trap"],
        "status": None,
        "debate_id": None,
        "error": None,
        "wall_time_seconds": None,
        "metrics": None,
        "panel": None,
    }


def run_case(
    client: httpx.Client,
    base_url: str,
    token: str,
    db_path: Path | str,
    case: dict,
    *,
    timeout_seconds: float,
    poll_interval_seconds: float,
    panel: bool,
    gate_enabled: bool = False,
    sleep_fn: Callable[[float], None] = time.sleep,
) -> dict:
    result = _case_result_shell(case)
    # Creation and polling are wrapped in ONE try/except: a poll-time failure
    # (coordinator restart, network blip, malformed response) must degrade
    # this one case to status="error" exactly like a create-time failure --
    # never propagate out and abort every remaining case in the run.
    try:
        created = create_debate(client, base_url, token, case["topic"])
        debate_id = created.get("id")
        result["debate_id"] = debate_id
        if not debate_id:
            result["status"] = "error"
            result["error"] = f"coordinator response had no debate id: {created!r}"
            return result
        poll = poll_until_terminal(
            client,
            base_url,
            token,
            debate_id,
            timeout_seconds=timeout_seconds,
            poll_interval_seconds=poll_interval_seconds,
            sleep_fn=sleep_fn,
        )
    except Exception as exc:  # noqa: BLE001 - one case's failure must not sink the run
        result["status"] = "error"
        result["error"] = f"create_debate/poll failed: {exc}"
        return result

    result["wall_time_seconds"] = poll["elapsed_seconds"]
    final_status = poll["debate"].get("status")
    if poll["timed_out"]:
        result["status"] = "timed_out"
    elif final_status == "complete":
        result["status"] = "completed"
    else:
        result["status"] = "failed"

    try:
        conn = open_readonly_db(db_path)
        try:
            result["metrics"] = collect_case_metrics(conn, debate_id, gate_enabled=gate_enabled)
        finally:
            conn.close()
    except Exception as exc:  # noqa: BLE001 - metrics failure must not lose the run's HTTP result
        result["error"] = f"metrics collection failed: {exc}"

    if panel:
        synthesis_text = synthesis_text_from_debate_json(poll["debate"])
        if synthesis_text:
            try:
                result["panel"] = run_panel_scoring(case["topic"], synthesis_text)
            except Exception as exc:  # noqa: BLE001 - panel failure must not lose the run's metrics
                result["panel"] = {"error": str(exc)}

    return result


def _skipped_result(case: dict, status: str) -> dict:
    result = _case_result_shell(case)
    result["status"] = status
    return result


# ---------------------------------------------------------------------------
# Suite-wide execution, spend cap, manifest assembly.
# ---------------------------------------------------------------------------


def _mean(values: list[float]) -> float | None:
    return (sum(values) / len(values)) if values else None


def summarize_results(results: list[dict]) -> dict:
    status_counts: dict[str, int] = {}
    branch_fractions: list[float] = []
    verdict_band_counts: dict[str, int] = {}
    direction_matched = direction_evaluated = 0
    trap_matched = trap_evaluated = 0
    resolved_found = resolved_attempted = 0
    judge_calls_total = failover_events_total = 0
    tokens_in_total = tokens_out_total = 0
    spend_known_total = 0.0
    unpriced: set[str] = set()
    wall_times: list[float] = []
    family_counts: list[int] = []
    panel_means: list[dict] = []

    for result in results:
        status_counts[result["status"]] = status_counts.get(result["status"], 0) + 1
        metrics = result.get("metrics") or {}

        branch = metrics.get("branch_completion") or {}
        if branch.get("fraction") is not None:
            branch_fractions.append(branch["fraction"])

        band = metrics.get("verdict_band")
        if band is not None:
            verdict_band_counts[band] = verdict_band_counts.get(band, 0) + 1
            direction_evaluated += 1
            matched = band == result.get("expected_verdict_direction")
            if matched:
                direction_matched += 1
            if result.get("is_trap"):
                trap_evaluated += 1
                if matched:
                    trap_matched += 1

        evidence = metrics.get("evidence") or {}
        for key, count in (evidence.get("by_resolution_status") or {}).items():
            if key == "none":
                continue
            resolved_attempted += count
            if key == "resolved_quote_found":
                resolved_found += count

        judge_calls_total += int(metrics.get("judge_calls") or 0)
        failover_events_total += int(metrics.get("failover_events") or 0)
        tokens_in_total += int(metrics.get("tokens_in") or 0)
        tokens_out_total += int(metrics.get("tokens_out") or 0)
        spend = metrics.get("spend_usd") or {}
        spend_known_total += float(spend.get("known_total") or 0.0)
        unpriced.update(spend.get("unpriced_model_ids") or [])

        if result.get("wall_time_seconds") is not None:
            wall_times.append(result["wall_time_seconds"])
        families = metrics.get("model_families_completed_branches")
        if families:
            family_counts.append(len(families))

        panel = result.get("panel")
        if isinstance(panel, dict) and isinstance(panel.get("mean"), dict) and panel["mean"]:
            panel_means.append(panel["mean"])

    return {
        "case_count": len(results),
        "status_counts": status_counts,
        "branch_completion_fraction_mean": _mean(branch_fractions),
        "verdict_band_distribution": verdict_band_counts,
        "expected_direction_match": {
            "matched": direction_matched,
            "evaluated": direction_evaluated,
            "rate": (direction_matched / direction_evaluated) if direction_evaluated else None,
        },
        "trap_expected_direction_match": {
            "matched": trap_matched,
            "evaluated": trap_evaluated,
            "rate": (trap_matched / trap_evaluated) if trap_evaluated else None,
        },
        "evidence_resolution_rate": (resolved_found / resolved_attempted) if resolved_attempted else None,
        "judge_calls_total": judge_calls_total,
        "failover_events_total": failover_events_total,
        "tokens_in_total": tokens_in_total,
        "tokens_out_total": tokens_out_total,
        "spend_usd_known_total": round(spend_known_total, 6),
        "unpriced_model_ids": sorted(unpriced),
        "wall_time_seconds_mean": _mean(wall_times),
        "model_family_diversity_mean": _mean(family_counts),
        "panel_dimension_means": mean_panel_scores(panel_means) or None,
    }


def iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _run_block(args: argparse.Namespace) -> dict:
    return {
        "limit": args.limit,
        "max_spend_usd": args.max_spend_usd,
        "dry_run": bool(args.dry_run),
        "timeout_seconds": args.timeout_seconds,
        "poll_interval_seconds": args.poll_interval_seconds,
    }


def _empty_manifest(args: argparse.Namespace, *, suite_validation_errors: list[str]) -> dict:
    return {
        "schema_version": MANIFEST_SCHEMA_VERSION,
        "created_at": iso_now(),
        "suite_path": str(args.suite),
        "suite_schema_version": None,
        "suite_validation_errors": suite_validation_errors,
        "case_count_total": None,
        "case_count_run": 0,
        "config": None,
        "run": _run_block(args),
        "summary": None,
        "spend": None,
    }


def _build_manifest(
    args: argparse.Namespace, suite: dict, cases: list[dict], config: dict, results: list[dict], *, spend_info: dict
) -> dict:
    return {
        "schema_version": MANIFEST_SCHEMA_VERSION,
        "created_at": iso_now(),
        "suite_path": str(args.suite),
        "suite_schema_version": suite.get("schema_version"),
        "suite_validation_errors": [],
        "case_count_total": len(suite.get("cases", [])),
        "case_count_run": len(cases),
        "config": config,
        "run": _run_block(args),
        "summary": summarize_results(results),
        "spend": spend_info,
    }


def execute_run(
    args: argparse.Namespace,
    client: httpx.Client,
    *,
    run_case_fn: Callable[..., dict] = run_case,
    resolve_config_tag_fn: Callable[..., dict] = resolve_config_tag,
    sleep_fn: Callable[[float], None] = time.sleep,
) -> tuple[dict, list[dict]]:
    suite = load_suite(args.suite)
    validation_errors = validate_suite(suite)
    if validation_errors:
        return _empty_manifest(args, suite_validation_errors=validation_errors), []

    cases = cases_from_suite(suite, limit=args.limit)
    token = args.user_token or dev_user_token()
    config = resolve_config_tag_fn(repo_root=ROOT, env_file=args.env_file, client=client, base_url=args.base_url, token=token)
    # See gate_enabled_from_config's docstring: this is what production's
    # own live bool_env read would resolve to for this run, so verdict_band
    # never silently diverges from what GET /api/debates/{id} actually
    # serves once DIALECTICAL_VERDICT_EVIDENCE_GATE is flipped on.
    gate_enabled = gate_enabled_from_config(config)

    if args.dry_run:
        results = [_skipped_result(case, "skipped_dry_run") for case in cases]
        spend_info = {
            "known_usd_total": 0.0,
            "unpriced_model_ids": [],
            "cap_usd": args.max_spend_usd,
            "stopped_for_cap": False,
            "cases_skipped_for_cap": [],
        }
        return _build_manifest(args, suite, cases, config, results, spend_info=spend_info), results

    results: list[dict] = []
    spent = 0.0
    unpriced: set[str] = set()
    stopped_for_cap = False
    skipped_for_cap: list[str] = []
    for case in cases:
        if args.max_spend_usd is not None and spent >= args.max_spend_usd:
            stopped_for_cap = True
            skipped_for_cap.append(case["id"])
            results.append(_skipped_result(case, "skipped_spend_cap"))
            continue
        result = run_case_fn(
            client,
            args.base_url,
            token,
            args.db,
            case,
            timeout_seconds=args.timeout_seconds,
            poll_interval_seconds=args.poll_interval_seconds,
            panel=args.panel,
            gate_enabled=gate_enabled,
            sleep_fn=sleep_fn,
        )
        results.append(result)
        spend = (result.get("metrics") or {}).get("spend_usd") or {}
        spent += float(spend.get("known_total") or 0.0)
        unpriced.update(spend.get("unpriced_model_ids") or [])

    spend_info = {
        "known_usd_total": round(spent, 6),
        "unpriced_model_ids": sorted(unpriced),
        "cap_usd": args.max_spend_usd,
        "stopped_for_cap": stopped_for_cap,
        "cases_skipped_for_cap": skipped_for_cap,
    }
    return _build_manifest(args, suite, cases, config, results, spend_info=spend_info), results


def write_run_outputs(out_dir: Path | str, manifest: dict, results: list[dict]) -> None:
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    (out_dir / "results.json").write_text(json.dumps(results, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def render_run_summary(manifest: dict, results: list[dict]) -> str:
    lines = [f"Benchmark run: {manifest['case_count_run']} case(s), {len(results)} result(s)."]
    summary = manifest.get("summary") or {}
    if summary:
        lines.append(f"Status counts: {summary.get('status_counts')}")
        lines.append(f"Expected-direction match: {summary.get('expected_direction_match')}")
        lines.append(f"Spend (known): ${summary.get('spend_usd_known_total', 0.0):.4f}")
    spend = manifest.get("spend") or {}
    if spend.get("stopped_for_cap"):
        lines.append(f"Stopped early for spend cap; skipped: {spend.get('cases_skipped_for_cap')}")
    if manifest.get("suite_validation_errors"):
        lines.append("Suite validation errors:")
        lines.extend(f"  - {error}" for error in manifest["suite_validation_errors"])
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# CLI.
# ---------------------------------------------------------------------------


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Dialectical engine benchmark harness runner (Task 17, P5).")
    parser.add_argument("--suite", type=Path, default=DEFAULT_SUITE_PATH, help="Path to the case suite JSON.")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL, help="Coordinator base URL.")
    parser.add_argument("--db", default=str(DEFAULT_DB_PATH), help="Coordinator sqlite DB path (read-only).")
    parser.add_argument("--out", default=None, help="Directory to write manifest.json + results.json into.")
    parser.add_argument("--limit", type=int, default=None, help="Run only the first N cases.")
    parser.add_argument("--dry-run", action="store_true", help="Validate suite + connectivity; create nothing.")
    parser.add_argument("--max-spend-usd", type=float, default=None, help="Soft cap: stop launching new cases once known spend reaches this.")
    parser.add_argument("--panel", action="store_true", help="Run the 2-judge LLM panel over each synthesis (real CLI calls; costs money).")
    parser.add_argument("--timeout-seconds", type=int, default=DEFAULT_TIMEOUT_SECONDS, help="Per-case terminal-state poll timeout.")
    parser.add_argument("--poll-interval-seconds", type=float, default=DEFAULT_POLL_INTERVAL_SECONDS, help="Seconds between debate status polls.")
    parser.add_argument("--env-file", type=Path, default=None, help="Coordinator env file to read DIALECTICAL_*/NEXT_PUBLIC_* flags from.")
    parser.add_argument("--user-token", default=None, help="Bearer token; defaults to DIALECTICAL_USER_TOKEN/USER_TOKEN or the dev default.")
    return parser


def main(argv: list[str] | None = None, *, client_factory: Callable[[], httpx.Client] | None = None) -> int:
    parser = build_arg_parser()
    args = parser.parse_args(argv)
    make_client = client_factory or (lambda: httpx.Client(timeout=30.0))
    with make_client() as client:
        manifest, results = execute_run(args, client)

    if manifest.get("suite_validation_errors"):
        print("Suite validation failed:", file=sys.stderr)
        for error in manifest["suite_validation_errors"]:
            print(f"  - {error}", file=sys.stderr)
        return 1

    print(render_run_summary(manifest, results))
    if args.out:
        write_run_outputs(args.out, manifest, results)
        print(f"Wrote {args.out}/manifest.json and {args.out}/results.json")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
