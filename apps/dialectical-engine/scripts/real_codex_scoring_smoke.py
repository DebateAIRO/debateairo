#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Callable
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session


ROOT = Path(__file__).resolve().parents[1]
COORDINATOR_ROOT = ROOT / "coordinator"
if str(COORDINATOR_ROOT) not in sys.path:
    sys.path.insert(0, str(COORDINATOR_ROOT))

from app.core.config import load_settings  # noqa: E402
from app.core.db import SessionLocal  # noqa: E402
from app.models.entities import Debate, Generation, Node, now_utc  # noqa: E402
from app.providers import CodexCliProvider, ProviderError, ProviderRegistry  # noqa: E402
from app.scoring.judges import ScoringProviderRequest  # noqa: E402
from app.scoring.normalizer import normalize_claim  # noqa: E402
from app.scoring.parser import parse_judge_json  # noqa: E402
from app.scoring.reducer import reduce_assessments  # noqa: E402
from app.scoring.service import RegistryScoringProvider  # noqa: E402


SECRET_KEY_MARKERS = (
    "api_key",
    "apikey",
    "authorization",
    "bearer",
    "client_secret",
    "password",
    "secret",
    "token",
)
SECRET_TEXT_MARKERS = (
    "authorization:",
    "bearer ",
    "api_key=",
    "apikey=",
    "client_secret=",
    "password=",
    "secret=",
    "token=",
    "--api-key",
    "--token",
)
REDACTED = "[redacted]"


def sanitize_for_output(value: Any, *, key: str | None = None) -> Any:
    if key and _looks_secret_key(key):
        return REDACTED
    if isinstance(value, dict):
        return {str(item_key): sanitize_for_output(item_value, key=str(item_key)) for item_key, item_value in value.items()}
    if isinstance(value, list):
        return [sanitize_for_output(item) for item in value]
    if isinstance(value, tuple):
        return [sanitize_for_output(item) for item in value]
    if isinstance(value, str) and _looks_secret_text(value):
        return REDACTED
    return value


def run_smoke_check(
    *,
    debate: Debate | None,
    node: Node | None,
    argument_text: str | None,
    run_real_codex: bool,
    provider_factory: Callable[[], RegistryScoringProvider],
    judge_role: str = "judge",
    timeout_seconds: int = 30,
) -> dict[str, Any]:
    base_report = {
        "smoke": "real_codex_scoring",
        "checked_at": now_utc().isoformat(),
        "debate_id": debate.id if debate is not None else None,
        "node_id": node.id if node is not None else None,
        "provider": "codex",
        "judge_role": judge_role,
    }
    if not run_real_codex:
        return {
            **base_report,
            "status": "dry_run",
            "provider_called": False,
            "required_opt_in": "run_real_codex",
            "next_step": "Set run_real_codex by re-running with --run-real-codex to call the configured Codex provider on this local node.",
        }
    if debate is None or node is None:
        return {
            **base_report,
            "status": "unavailable",
            "provider_called": False,
            "reason": "No real local debate node is available for the Codex scoring smoke check.",
        }

    provider = provider_factory()
    claim = normalize_claim(node_id=node.id, raw_text=node.claim)
    try:
        result = provider.judge_node(
            ScoringProviderRequest(
                claim=claim,
                argument_text=argument_text,
                judge_role=judge_role,
                timeout_seconds=timeout_seconds,
            )
        )
    except TimeoutError:
        return {**base_report, "status": "unavailable", "provider_called": True, "reason": "Codex smoke call timed out."}
    except ProviderError:
        return {**base_report, "status": "unavailable", "provider_called": True, "reason": "Codex smoke call failed."}

    parsed = parse_judge_json(result.raw_output)
    if parsed.status != "available" or parsed.assessment is None:
        return sanitize_for_output(
            {
                **base_report,
                "status": "unavailable",
                "provider_called": True,
                "reason": parsed.reason or "Codex smoke output was unavailable.",
                "model_metadata": {
                    "provider": result.provider,
                    "model": result.model,
                    "checked_at": result.checked_at,
                    "status": "unavailable",
                },
            }
        )

    item = reduce_assessments(claim, parsed.assessment).model_dump(mode="json")
    return sanitize_for_output(
        {
            **base_report,
            "status": "available",
            "provider_called": True,
            "model_metadata": {
                "provider": result.provider,
                "model": result.model,
                "checked_at": result.checked_at,
                "status": "available",
            },
            "items": [item],
        }
    )


def load_target(db: Session, *, debate_id: str | None, node_id: str | None) -> tuple[Debate | None, Node | None, str | None]:
    node_query = select(Node).where(Node.status != "stale")
    if node_id:
        node_query = node_query.where(Node.id == node_id)
    if debate_id:
        node_query = node_query.where(Node.debate_id == debate_id)
    node_query = (
        node_query.join(Debate, Debate.id == Node.debate_id)
        .where(Debate.status != "archived")
        .order_by(Debate.created_at.desc(), Node.materialized_path.asc(), Node.depth.asc(), Node.position.asc())
        .limit(1)
    )
    node = db.scalars(node_query).first()
    if node is None:
        debate = db.get(Debate, debate_id) if debate_id else None
        return debate, None, None
    debate = db.get(Debate, node.debate_id)
    generation = db.get(Generation, node.active_generation_id) if node.active_generation_id else None
    return debate, node, generation.argument if generation is not None else None


def build_provider(*, judge_role: str, timeout_seconds: int) -> RegistryScoringProvider:
    settings = load_settings()
    registry = ProviderRegistry(
        providers={
            "codex": CodexCliProvider(
                executable=settings.codex_command,
                timeout_seconds=timeout_seconds,
            )
        }
    )
    return RegistryScoringProvider(registry, judge_role=judge_role)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Manually smoke-check real Codex scoring against one local debate node. "
            "Dry-run is the default; pass --run-real-codex to make a real model call."
        )
    )
    parser.add_argument("--debate-id", help="Optional local debate id to smoke check.")
    parser.add_argument("--node-id", help="Optional local node id to smoke check.")
    parser.add_argument("--judge-role", default="judge")
    parser.add_argument("--timeout-seconds", type=int, default=30)
    parser.add_argument(
        "--run-real-codex",
        action="store_true",
        help="Opt in to the real Codex/model provider call. Without this flag no provider is called.",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        with SessionLocal() as db:
            debate, node, argument_text = load_target(db, debate_id=args.debate_id, node_id=args.node_id)
            report = run_smoke_check(
                debate=debate,
                node=node,
                argument_text=argument_text,
                run_real_codex=args.run_real_codex,
                provider_factory=lambda: build_provider(
                    judge_role=args.judge_role,
                    timeout_seconds=args.timeout_seconds,
                ),
                judge_role=args.judge_role,
                timeout_seconds=args.timeout_seconds,
            )
    except Exception as exc:  # noqa: BLE001
        del exc
        report = {
            "smoke": "real_codex_scoring",
            "checked_at": now_utc().isoformat(),
            "status": "unavailable",
            "provider_called": False,
            "reason": "Local debate database could not be opened or queried.",
        }
    print(json.dumps(sanitize_for_output(report), indent=2, sort_keys=True))
    return 0 if report["status"] in {"available", "dry_run"} else 1


def _looks_secret_key(key: str) -> bool:
    lowered = key.lower()
    return any(marker in lowered for marker in SECRET_KEY_MARKERS)


def _looks_secret_text(value: str) -> bool:
    lowered = value.lower()
    return any(marker in lowered for marker in SECRET_TEXT_MARKERS)


if __name__ == "__main__":
    raise SystemExit(main())
