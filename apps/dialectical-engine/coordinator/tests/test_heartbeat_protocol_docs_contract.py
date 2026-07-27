from pathlib import Path


APP_ROOT = Path(__file__).resolve().parents[2]
SPINE = APP_ROOT / "docs" / "agent-protocols" / "debateai-heartbeat-protocol.md"
CODEX_ADAPTER = APP_ROOT / "docs" / "agent-protocols" / "codex-heartbeat-adapter.md"
CODEX_NODE_CONTRACTS = (
    APP_ROOT / ".codex" / "skills" / "heartbeat-protocol" / "SKILL.md",
    APP_ROOT / ".agents" / "skills" / "heartbeat-protocol" / "SKILL.md",
)
CLAUDE_NODE_CONTRACT = (
    APP_ROOT / ".claude" / "skills" / "heartbeat-protocol" / "SKILL.md"
)
GROK_NODE_CONTRACT = (
    APP_ROOT / ".grok" / "skills" / "heartbeat-protocol" / "SKILL.md"
)


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def test_goal_chain_and_unfinished_worker_retention_are_normative() -> None:
    spine = _read(SPINE)
    assert "### /goal launch and unfinished-worker retention" in spine
    assert "stops ALL agents" not in spine

    for path in CODEX_NODE_CONTRACTS:
        contract = _read(path)
        assert "Claude-Router must launch this Codex coordinator with" in contract
        assert "Every downstream agent launch starts with" in contract
        assert "FULLY DONE" in contract
        assert "Do not terminate" in contract

    claude_contract = _read(CLAUDE_NODE_CONTRACT)
    assert "The Main Orchestrator launches every worker" in claude_contract
    assert "kill ALL agents" not in claude_contract

    grok_contract = _read(GROK_NODE_CONTRACT)
    assert "Claude-Router launches every Grok" in grok_contract
    assert "launch that child with its own `/goal" in grok_contract
    assert "FULLY DONE" in grok_contract
    assert "Terminate it only after" in grok_contract


def test_codex_receipt_and_risk_contracts_are_present() -> None:
    adapter = _read(CODEX_ADAPTER)
    required_contracts = (
        "## /goal chain and worker lifetime",
        "## Lane preflight and two-phase completion",
        "LANE PREFLIGHT RECEIPT",
        "CANDIDATE COMPLETE",
        "ORCHESTRATOR VERIFICATION RECEIPT",
        "DURABLE LANE REGISTRY",
        "RESIDUAL RISK REGISTER",
        "FINAL AGENT SELF-REPORT",
        "568",
        "320",
    )

    for contract in required_contracts:
        assert contract in adapter
