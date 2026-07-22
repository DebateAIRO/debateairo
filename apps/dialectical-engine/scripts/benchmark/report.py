#!/usr/bin/env python3
"""Task 17 (P5): benchmark harness report.

Takes two run manifests (baseline, candidate) -- each a directory produced
by `runner.py --out DIR` -- and renders a one-page markdown diff: config
tags side by side, per-dimension LLM-panel means where panel ran (else a
per-metric-deltas fallback), and cost + wall time. Pure/deterministic:
`render_report` never touches the clock, the network, or the filesystem, so
identical inputs always produce byte-identical markdown.

Usage:
    python report.py --baseline runs/baseline --candidate runs/candidate
    python report.py --baseline runs/baseline --candidate runs/candidate --out diff.md
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


# Duplicated literal (not imported from runner.py): report.py is meant to
# stay a lightweight, standalone reader of manifest.json -- importing
# runner.py would pull in httpx and the coordinator's app.scoring import
# chain for ten label strings. Keep in sync with runner.py's PANEL_DIMENSIONS
# (same pattern the coordinator itself uses for cheap cross-module literals,
# e.g. app.services.serialization.PROTOCOL_ANALYSIS_TYPE).
PANEL_DIMENSIONS: tuple[tuple[str, str], ...] = (
    ("1_truthfulness", "Truthfulness / factual correctness"),
    ("2_hallucination_rate", "Hallucination rate"),
    ("3_evidence_quality", "Evidence quality"),
    ("4_argument_coverage", "Argument coverage"),
    ("5_counterargument_strength", "Counterargument strength"),
    ("6_wrongful_agreement_resistance", "Wrongful agreement resistance"),
    ("7_calibration", "Calibration"),
    ("8_relevance", "Relevance / answer fit"),
    ("9_insight_density", "Insight density"),
    ("10_completeness_concision_balance", "Completeness vs concision balance"),
)

_SUMMARY_METRIC_ROWS: tuple[tuple[str, str], ...] = (
    ("case_count", "Cases run"),
    ("branch_completion_fraction_mean", "Branch completion (mean fraction)"),
    ("evidence_resolution_rate", "Evidence resolution rate"),
    ("model_family_diversity_mean", "Model family diversity (mean)"),
)


def load_manifest(dir_path: Path | str) -> dict:
    return json.loads((Path(dir_path) / "manifest.json").read_text(encoding="utf-8"))


def _num(value: Any, digits: int = 4) -> str:
    if value is None:
        return "—"
    if isinstance(value, bool):
        return str(value)
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        return f"{value:.{digits}f}"
    return str(value)


def _delta(a: Any, b: Any, digits: int = 4) -> str:
    if isinstance(a, bool) or isinstance(b, bool) or not isinstance(a, (int, float)) or not isinstance(b, (int, float)):
        return "—"
    diff = b - a
    sign = "+" if diff >= 0 else ""
    if isinstance(a, int) and isinstance(b, int):
        return f"{sign}{diff}"
    return f"{sign}{diff:.{digits}f}"


def _md_table(headers: list[str], rows: list[list[str]]) -> str:
    lines = ["| " + " | ".join(headers) + " |", "| " + " | ".join(["---"] * len(headers)) + " |"]
    lines.extend("| " + " | ".join(row) + " |" for row in rows)
    return "\n".join(lines)


def _config_section(baseline: dict, candidate: dict) -> str:
    b_config = baseline.get("config") or {}
    c_config = candidate.get("config") or {}
    b_pool = b_config.get("model_pool") or {}
    c_pool = c_config.get("model_pool") or {}
    rows = [
        ["Git SHA", str(b_config.get("git_sha", "unknown")), str(c_config.get("git_sha", "unknown"))],
        [
            "Flags source",
            str((b_config.get("flags") or {}).get("source", "unknown")),
            str((c_config.get("flags") or {}).get("source", "unknown")),
        ],
        [
            "Enabled models",
            ", ".join(sorted(b_pool.get("enabled_models") or [])) or "—",
            ", ".join(sorted(c_pool.get("enabled_models") or [])) or "—",
        ],
        ["Run captured at", str(baseline.get("created_at") or "—"), str(candidate.get("created_at") or "—")],
    ]
    lines = ["## Config", "", _md_table(["", "Baseline", "Candidate"], rows)]

    b_flags = (b_config.get("flags") or {}).get("values") or {}
    c_flags = (c_config.get("flags") or {}).get("values") or {}
    if b_flags or c_flags:
        keys = sorted(set(b_flags) | set(c_flags))
        flag_rows = [[key, b_flags.get(key, "—"), c_flags.get(key, "—")] for key in keys]
        lines.extend(["", "**Flags:**", "", _md_table(["Flag", "Baseline", "Candidate"], flag_rows)])
    return "\n".join(lines)


def _panel_section(baseline_summary: dict, candidate_summary: dict) -> str:
    b_panel = baseline_summary.get("panel_dimension_means")
    c_panel = candidate_summary.get("panel_dimension_means")
    if not b_panel and not c_panel:
        return (
            "## Per-Dimension Scores (LLM panel, blueprint dims 1-10)\n\n"
            "Panel scoring (--panel) did not run for either config; dimension-level "
            "quality is unavailable. See Per-Metric Deltas below for a proxy signal "
            "(expected-direction match rate, evidence resolution rate)."
        )
    b_panel = b_panel or {}
    c_panel = c_panel or {}
    rows = [
        [title, _num(b_panel.get(key)), _num(c_panel.get(key)), _delta(b_panel.get(key), c_panel.get(key))]
        for key, title in PANEL_DIMENSIONS
        if key in b_panel or key in c_panel
    ]
    return "\n".join(
        ["## Per-Dimension Scores (LLM panel, blueprint dims 1-10)", "", _md_table(["Dimension", "Baseline", "Candidate", "Δ"], rows)]
    )


def _summary_metrics_section(baseline_summary: dict, candidate_summary: dict) -> str:
    rows = []
    for key, label in _SUMMARY_METRIC_ROWS:
        b_value = baseline_summary.get(key)
        c_value = candidate_summary.get(key)
        rows.append([label, _num(b_value), _num(c_value), _delta(b_value, c_value)])

    b_dir = baseline_summary.get("expected_direction_match") or {}
    c_dir = candidate_summary.get("expected_direction_match") or {}
    rows.append(
        [
            "Expected-direction match rate",
            _num(b_dir.get("rate")),
            _num(c_dir.get("rate")),
            _delta(b_dir.get("rate"), c_dir.get("rate")),
        ]
    )

    b_trap = baseline_summary.get("trap_expected_direction_match") or {}
    c_trap = candidate_summary.get("trap_expected_direction_match") or {}
    rows.append(
        [
            "Trap (false-premise) match rate",
            _num(b_trap.get("rate")),
            _num(c_trap.get("rate")),
            _delta(b_trap.get("rate"), c_trap.get("rate")),
        ]
    )

    lines = ["## Per-Metric Deltas", "", _md_table(["Metric", "Baseline", "Candidate", "Δ"], rows)]

    b_status = baseline_summary.get("status_counts") or {}
    c_status = candidate_summary.get("status_counts") or {}
    status_keys = sorted(set(b_status) | set(c_status))
    if status_keys:
        status_rows = [
            [key, _num(b_status.get(key, 0)), _num(c_status.get(key, 0)), _delta(b_status.get(key, 0), c_status.get(key, 0))]
            for key in status_keys
        ]
        lines.extend(["", "**Status counts:**", "", _md_table(["Status", "Baseline", "Candidate", "Δ"], status_rows)])

    b_band = baseline_summary.get("verdict_band_distribution") or {}
    c_band = candidate_summary.get("verdict_band_distribution") or {}
    band_keys = sorted(set(b_band) | set(c_band))
    if band_keys:
        band_rows = [
            [key, _num(b_band.get(key, 0)), _num(c_band.get(key, 0)), _delta(b_band.get(key, 0), c_band.get(key, 0))]
            for key in band_keys
        ]
        lines.extend(["", "**Verdict band distribution:**", "", _md_table(["Band", "Baseline", "Candidate", "Δ"], band_rows)])

    return "\n".join(lines)


def _cost_section(baseline_summary: dict, candidate_summary: dict) -> str:
    rows = [
        [
            "Judge calls (total)",
            _num(baseline_summary.get("judge_calls_total")),
            _num(candidate_summary.get("judge_calls_total")),
            _delta(baseline_summary.get("judge_calls_total"), candidate_summary.get("judge_calls_total")),
        ],
        [
            "Failover events (total)",
            _num(baseline_summary.get("failover_events_total")),
            _num(candidate_summary.get("failover_events_total")),
            _delta(baseline_summary.get("failover_events_total"), candidate_summary.get("failover_events_total")),
        ],
        [
            "Tokens in (total)",
            _num(baseline_summary.get("tokens_in_total")),
            _num(candidate_summary.get("tokens_in_total")),
            _delta(baseline_summary.get("tokens_in_total"), candidate_summary.get("tokens_in_total")),
        ],
        [
            "Tokens out (total)",
            _num(baseline_summary.get("tokens_out_total")),
            _num(candidate_summary.get("tokens_out_total")),
            _delta(baseline_summary.get("tokens_out_total"), candidate_summary.get("tokens_out_total")),
        ],
        [
            "Known spend (USD)",
            _num(baseline_summary.get("spend_usd_known_total")),
            _num(candidate_summary.get("spend_usd_known_total")),
            _delta(baseline_summary.get("spend_usd_known_total"), candidate_summary.get("spend_usd_known_total")),
        ],
        [
            "Wall time (mean seconds)",
            _num(baseline_summary.get("wall_time_seconds_mean")),
            _num(candidate_summary.get("wall_time_seconds_mean")),
            _delta(baseline_summary.get("wall_time_seconds_mean"), candidate_summary.get("wall_time_seconds_mean")),
        ],
    ]
    lines = ["## Cost & Wall Time", "", _md_table(["Metric", "Baseline", "Candidate", "Δ"], rows)]

    b_unpriced = sorted(baseline_summary.get("unpriced_model_ids") or [])
    c_unpriced = sorted(candidate_summary.get("unpriced_model_ids") or [])
    if b_unpriced or c_unpriced:
        lines.extend(
            [
                "",
                "Spend is tracked only for models with known pricing (`app/services/spend.py`). "
                f"Unpriced models this run -- baseline: {b_unpriced or 'none'}; candidate: {c_unpriced or 'none'}.",
            ]
        )
    return "\n".join(lines)


def render_report(baseline: dict, candidate: dict) -> str:
    """Pure, deterministic: no clock/network/filesystem access. Identical
    (baseline, candidate) dicts always produce byte-identical output."""
    baseline_summary = baseline.get("summary") or {}
    candidate_summary = candidate.get("summary") or {}
    sections = [
        "# Benchmark Report: Baseline vs Candidate",
        "",
        _config_section(baseline, candidate),
        "",
        _panel_section(baseline_summary, candidate_summary),
        "",
        _summary_metrics_section(baseline_summary, candidate_summary),
        "",
        _cost_section(baseline_summary, candidate_summary),
    ]
    return "\n".join(sections).rstrip("\n") + "\n"


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Benchmark harness baseline-vs-candidate report (Task 17, P5).")
    parser.add_argument("--baseline", required=True, help="Directory containing baseline manifest.json (from runner.py --out).")
    parser.add_argument("--candidate", required=True, help="Directory containing candidate manifest.json (from runner.py --out).")
    parser.add_argument("--out", default=None, help="Write markdown to this file instead of stdout.")
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_arg_parser()
    args = parser.parse_args(argv)
    baseline = load_manifest(args.baseline)
    candidate = load_manifest(args.candidate)
    text = render_report(baseline, candidate)
    if args.out:
        Path(args.out).write_text(text, encoding="utf-8")
    else:
        print(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
