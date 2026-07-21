#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import sqlite3
import time
import urllib.request
from collections.abc import Callable
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlparse


DEFAULT_BASE_URL = "http://localhost:8000"
DEFAULT_TIMEOUT_SECONDS = 120
REQUIRED_MODEL = "gpt-5.6sol-medium"
MOCK_MARKERS = ("mock", "fake", "deterministic", "local")


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def fetch_json(
    url: str,
    *,
    method: str = "GET",
    user_token: str | None = None,
    timeout: float = 10,
) -> dict[str, Any]:
    headers = {"Accept": "application/json"}
    data = None
    if method != "GET":
        headers["Content-Type"] = "application/json"
        data = b"{}"
    if user_token:
        headers["Authorization"] = f"Bearer {user_token}"
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(request, timeout=timeout) as response:
        payload = json.loads(response.read().decode("utf-8", errors="replace"))
    if not isinstance(payload, dict):
        raise RuntimeError(f"{url} returned non-object JSON")
    return payload


def evaluate_v2_worker_judge_smoke(
    *,
    fetch_json: Callable[..., dict[str, Any]],
    base_url: str,
    debate_id: str | None,
    user_token: str | None = None,
    database_url: str | None = None,
    start_scoring_job: bool = False,
    timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS,
) -> dict[str, Any]:
    base_url = base_url.rstrip("/")
    report: dict[str, Any] = {
        "smoke": "v2_worker_judge",
        "checked_at": utc_now(),
        "base_url": base_url,
        "debate_id": debate_id,
        "status": "unavailable",
        "checks": {
            "v2_readiness": {"status": "not_checked"},
            "scoring_lifecycle": {"status": "not_checked"},
            "db_persistence": {"status": "not_checked"},
        },
    }

    try:
        backend_status = fetch_json(f"{base_url}/api/backends/status", user_token=user_token)
    except Exception as exc:  # noqa: BLE001
        report["checks"]["v2_readiness"] = {
            "status": "failed",
            "reason": f"Could not read backend status: {exc}",
        }
        return report

    readiness_check = evaluate_readiness(backend_status)
    report["checks"]["v2_readiness"] = readiness_check
    if readiness_check["status"] != "passed":
        return report

    if not debate_id:
        report["checks"]["scoring_lifecycle"] = {
            "status": "failed",
            "reason": "A real debate id is required; this smoke check does not create fake product data.",
        }
        return report

    scoring_check = evaluate_scoring_lifecycle(
        fetch_json=fetch_json,
        base_url=base_url,
        debate_id=debate_id,
        user_token=user_token,
        start_scoring_job=start_scoring_job,
        timeout_seconds=timeout_seconds,
    )
    report["checks"]["scoring_lifecycle"] = scoring_check
    if scoring_check["status"] != "passed":
        return report

    db_check = evaluate_db_persistence(
        database_url=database_url or default_database_url(),
        debate_id=debate_id,
    )
    report["checks"]["db_persistence"] = db_check
    if db_check["status"] == "passed":
        report["status"] = "passed"
    return report


def evaluate_readiness(backend_status: dict[str, Any]) -> dict[str, Any]:
    readiness = backend_status.get("v2_generation_readiness")
    if not isinstance(readiness, dict):
        return {"status": "failed", "reason": "Backend status is missing v2_generation_readiness."}
    if readiness.get("ready") is not True or readiness.get("reason_code") != "ready":
        return {
            "status": "failed",
            "reason": str(readiness.get("reason") or "V2 generation readiness is not ready."),
            "reason_code": readiness.get("reason_code"),
        }

    online_names = [str(name) for name in readiness.get("online_worker_names") or [] if str(name).strip()]
    workers = backend_status.get("workers") if isinstance(backend_status.get("workers"), list) else []
    real_workers = [worker for worker in workers if isinstance(worker, dict) and worker.get("name") in online_names]
    for worker in real_workers:
        worker_name = str(worker.get("name") or "")
        capabilities = [str(capability) for capability in worker.get("capabilities") or []]
        lowered_name = worker_name.lower()
        lowered_capabilities = [capability.lower() for capability in capabilities]
        if any(marker in lowered_name for marker in MOCK_MARKERS) or "mock-local" in lowered_capabilities:
            return {
                "status": "failed",
                "reason": f"{worker_name} is mock/local/deterministic and cannot prove real V2 Codex readiness.",
            }
        if REQUIRED_MODEL not in capabilities:
            return {
                "status": "failed",
                "reason": f"{worker_name} does not advertise {REQUIRED_MODEL}.",
            }

    if not real_workers:
        return {
            "status": "failed",
            "reason": "Readiness reported ready but no matching online real worker was listed.",
        }
    return {
        "status": "passed",
        "required_model": readiness.get("required_model") or REQUIRED_MODEL,
        "online_worker_names": online_names,
    }


def evaluate_scoring_lifecycle(
    *,
    fetch_json: Callable[..., dict[str, Any]],
    base_url: str,
    debate_id: str,
    user_token: str | None,
    start_scoring_job: bool,
    timeout_seconds: float,
) -> dict[str, Any]:
    scoring_url = f"{base_url}/api/debates/{debate_id}/scoring"
    try:
        initial = fetch_json(scoring_url, user_token=user_token)
    except Exception as exc:  # noqa: BLE001
        return {"status": "failed", "reason": f"Could not read debate scoring: {exc}"}

    initial_status = str(initial.get("status") or "")
    if _has_public_raw_judge_output(initial):
        return {
            "status": "failed",
            "reason": "Public scoring API exposed raw judge output or provider metadata.",
        }
    if initial_status in {"available", "partial"} and _has_real_scoring_payload(initial):
        return {
            "status": "passed",
            "source": "existing_scoring_payload",
            "scoring_status": initial_status,
            "active_scoring_job_status": initial.get("active_scoring_job_status"),
        }

    active_job_id = initial.get("active_scoring_job_id")
    if isinstance(active_job_id, str) and active_job_id:
        return poll_scoring_job(
            fetch_json=fetch_json,
            base_url=base_url,
            debate_id=debate_id,
            job_id=active_job_id,
            user_token=user_token,
            timeout_seconds=timeout_seconds,
        )

    if not start_scoring_job:
        return {
            "status": "failed",
            "reason": str(initial.get("reason") or "No scoring payload or active scoring job is available."),
            "next_step": "Re-run with --start-scoring-job and --user-token to queue the real judge lifecycle.",
        }

    if not user_token:
        return {
            "status": "failed",
            "reason": "--user-token is required to start the real scoring job lifecycle.",
        }

    try:
        started = fetch_json(f"{scoring_url}/jobs", method="POST", user_token=user_token)
    except Exception as exc:  # noqa: BLE001
        return {"status": "failed", "reason": f"Could not start scoring job: {exc}"}

    job_id = started.get("job_id")
    if not isinstance(job_id, str) or not job_id:
        return {"status": "failed", "reason": "Scoring job start response did not include a job_id."}
    if started.get("status") == "failed":
        return {
            "status": "failed",
            "job_id": job_id,
            "job_status": "failed",
            "reason": str(started.get("error") or "Real scoring job failed to start."),
        }
    return poll_scoring_job(
        fetch_json=fetch_json,
        base_url=base_url,
        debate_id=debate_id,
        job_id=job_id,
        user_token=user_token,
        timeout_seconds=timeout_seconds,
    )


def poll_scoring_job(
    *,
    fetch_json: Callable[..., dict[str, Any]],
    base_url: str,
    debate_id: str,
    job_id: str,
    user_token: str | None,
    timeout_seconds: float,
) -> dict[str, Any]:
    deadline = time.monotonic() + timeout_seconds
    status_url = f"{base_url}/api/debates/{debate_id}/scoring/jobs/{job_id}"
    last_payload: dict[str, Any] = {}
    while time.monotonic() < deadline:
        last_payload = fetch_json(status_url, user_token=user_token)
        job_status = str(last_payload.get("status") or "")
        if job_status == "complete":
            scoring_payload = fetch_json(f"{base_url}/api/debates/{debate_id}/scoring", user_token=user_token)
            if _has_public_raw_judge_output(scoring_payload):
                return {
                    "status": "failed",
                    "job_id": job_id,
                    "job_status": "complete",
                    "reason": "Public scoring API exposed raw judge output or provider metadata.",
                }
            if _has_real_scoring_payload(scoring_payload):
                return {
                    "status": "passed",
                    "source": "scoring_job",
                    "job_id": job_id,
                    "job_status": "complete",
                    "scoring_status": scoring_payload.get("status"),
                }
            return {
                "status": "failed",
                "job_id": job_id,
                "job_status": "complete",
                "reason": "Scoring job completed but no real scoring payload was available.",
            }
        if job_status == "failed":
            return {
                "status": "failed",
                "job_id": job_id,
                "job_status": "failed",
                "reason": str(last_payload.get("error") or "Scoring job failed."),
            }
        time.sleep(1)
    return {
        "status": "failed",
        "job_id": job_id,
        "job_status": last_payload.get("status"),
        "reason": "Scoring job did not complete before timeout.",
    }


def _has_real_scoring_payload(payload: dict[str, Any]) -> bool:
    items = payload.get("items")
    if isinstance(items, list) and items:
        return True
    pending = payload.get("pending")
    if isinstance(pending, list) and pending and payload.get("active_scoring_job_id"):
        return True
    return False


def default_database_url() -> str:
    return os.environ.get(
        "DIALECTICAL_DATABASE_URL",
        f"sqlite:///{Path.cwd() / '.dialectical-dev' / 'db.sqlite3'}",
    )


def evaluate_db_persistence(*, database_url: str, debate_id: str) -> dict[str, Any]:
    try:
        db_path = sqlite_path_from_url(database_url)
        with open_readonly_sqlite(db_path) as db:
            run = latest_judge_output_analyzer_run(db, debate_id)
            if run is None:
                return {
                    "status": "failed",
                    "reason": "No completed node_scoring analyzer run with judge_outputs provenance exists.",
                }
            artifact_rows = persisted_judge_artifacts(db, debate_id, run["id"])
    except Exception:  # noqa: BLE001
        return {
            "status": "failed",
            "reason": "Local debate database could not be opened or queried read-only.",
        }

    if not artifact_rows:
        return {
            "status": "failed",
            "analyzer_run_id": run["id"],
            "reason": "No persisted judge_output_artifacts rows were linked to the completed scoring run.",
        }

    return {
        "status": "passed",
        "analyzer_run_id": run["id"],
        "artifact_count": len(artifact_rows),
        "node_count": len({row["node_id"] for row in artifact_rows}),
        "judge_roles": sorted({row["judge_role"] for row in artifact_rows}),
        "providers": sorted({row["provider"] for row in artifact_rows}),
        "models": sorted({row["model"] for row in artifact_rows}),
    }


def sqlite_path_from_url(database_url: str) -> Path:
    if not database_url:
        raise ValueError("database_url is required")
    if database_url.startswith("sqlite:///"):
        parsed = urlparse(database_url)
        path = unquote(parsed.path)
        if parsed.netloc:
            path = f"//{parsed.netloc}{path}"
        if os.name == "nt" and path.startswith("/") and len(path) > 2 and path[2] == ":":
            path = path[1:]
        return Path(path)
    if database_url.startswith("sqlite://"):
        raise ValueError("Only file-backed sqlite:/// URLs are supported")
    return Path(database_url)


def open_readonly_sqlite(db_path: Path) -> sqlite3.Connection:
    uri_path = db_path.resolve().as_posix()
    if os.name == "nt" and not uri_path.startswith("/"):
        uri_path = f"/{uri_path}"
    connection = sqlite3.connect(f"file:{uri_path}?mode=ro", uri=True)
    connection.row_factory = sqlite3.Row
    return connection


def latest_judge_output_analyzer_run(db: sqlite3.Connection, debate_id: str) -> dict[str, Any] | None:
    rows = db.execute(
        """
        SELECT id, provenance
        FROM analyzer_runs
        WHERE debate_id = ?
          AND analyzer_type = 'node_scoring'
          AND status = 'complete'
        ORDER BY created_at DESC
        """,
        (debate_id,),
    ).fetchall()
    for row in rows:
        provenance = _json_object(row["provenance"])
        if provenance.get("scoring_source") == "judge_outputs":
            return {"id": row["id"], "provenance": provenance}
    return None


def persisted_judge_artifacts(db: sqlite3.Connection, debate_id: str, analyzer_run_id: str) -> list[dict[str, str]]:
    rows = db.execute(
        """
        SELECT id, node_id, judge_role, provider, model, raw_output, raw_output_sha256, parse_status
        FROM judge_output_artifacts
        WHERE debate_id = ?
          AND analyzer_run_id = ?
          AND parse_status = 'available'
        ORDER BY created_at ASC, id ASC
        """,
        (debate_id, analyzer_run_id),
    ).fetchall()
    artifacts: list[dict[str, str]] = []
    for row in rows:
        values = {
            "id": str(row["id"] or ""),
            "node_id": str(row["node_id"] or ""),
            "judge_role": str(row["judge_role"] or ""),
            "provider": str(row["provider"] or ""),
            "model": str(row["model"] or ""),
            "raw_output": str(row["raw_output"] or ""),
            "raw_output_sha256": str(row["raw_output_sha256"] or ""),
        }
        if all(values.values()) and len(values["raw_output_sha256"]) == 64:
            artifacts.append({key: value for key, value in values.items() if key != "raw_output"})
    return artifacts


def _json_object(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    if isinstance(value, str) and value.strip():
        parsed = json.loads(value)
        if isinstance(parsed, dict):
            return parsed
    return {}


def _has_public_raw_judge_output(value: Any) -> bool:
    if isinstance(value, dict):
        for key, nested in value.items():
            normalized = str(key).lower()
            if normalized in {"raw_output", "raw_outputs", "provider_metadata", "prompt", "prompts"}:
                return True
            if normalized == "debug" and _has_public_raw_judge_output(nested):
                return True
            if _has_public_raw_judge_output(nested):
                return True
    if isinstance(value, list):
        return any(_has_public_raw_judge_output(item) for item in value)
    return False


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Smoke-check real V2 Codex worker readiness and final judge scoring lifecycle. "
            "This script never creates fake workers, debates, or judge output."
        )
    )
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--debate-id", help="Existing local debate id to inspect.")
    parser.add_argument(
        "--database-url",
        default=default_database_url(),
        help="SQLite database URL/path to inspect read-only (default: DIALECTICAL_DATABASE_URL or .dialectical-dev/db.sqlite3).",
    )
    parser.add_argument("--user-token", help="User token for authenticated scoring job start.")
    parser.add_argument(
        "--start-scoring-job",
        action="store_true",
        help="Queue and poll the real scoring job lifecycle when no scoring proof already exists.",
    )
    parser.add_argument("--timeout-seconds", type=float, default=DEFAULT_TIMEOUT_SECONDS)
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    report = evaluate_v2_worker_judge_smoke(
        fetch_json=fetch_json,
        base_url=args.base_url,
        debate_id=args.debate_id,
        user_token=args.user_token,
        database_url=args.database_url,
        start_scoring_job=args.start_scoring_job,
        timeout_seconds=args.timeout_seconds,
    )
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0 if report["status"] == "passed" else 1


if __name__ == "__main__":
    raise SystemExit(main())
