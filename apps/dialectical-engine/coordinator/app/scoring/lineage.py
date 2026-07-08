from __future__ import annotations

SECRET_METADATA_MARKERS = (
    "api_key",
    "apikey",
    "authorization",
    "bearer ",
    "client_secret",
    "password",
    "secret",
    "token",
    "--api-key",
    "--token",
    "key=",
    "token=",
)

_FAMILY_SUBSTRINGS: tuple[tuple[str, str], ...] = (
    ("claude", "claude"),
    ("gpt", "gpt"),
    ("codex", "gpt"),
    ("gemini", "gemini"),
    ("llama", "llama"),
    ("mistral", "mistral"),
    ("deepseek", "deepseek"),
    ("grok", "grok"),
)


def lineage_family(model_id: str | None) -> str | None:
    """Derive an honest, coarse vendor "family" bucket from a model id string.

    Pure function, no I/O. Returns None only for None/empty input (no
    lineage to report). An unrecognized-but-concrete model string is
    returned lowercased, UNCHANGED -- it is its own family of one, never
    silently folded into another bucket and never collapsed to None.
    """
    if not model_id:
        return None
    lowered = model_id.strip().lower()
    if not lowered:
        return None
    for substring, family in _FAMILY_SUBSTRINGS:
        if substring in lowered:
            return family
    return lowered


def judge_lineage_metadata(
    *,
    arguer_model_id: str | None,
    judge_provider: str | None,
    judge_model_id: str | None,
) -> dict:
    """Assemble the always-on judge/arguer lineage recording block.

    Never fabricates independence: when either side's lineage is unknown,
    "independent" is None with an honest reason string rather than a
    guessed True/False.
    """
    judge_family = lineage_family(judge_model_id)
    judge_lineage = {"provider": judge_provider, "model": judge_model_id, "family": judge_family}

    if not arguer_model_id:
        return {
            "judgeLineage": judge_lineage,
            "arguerLineage": None,
            "independent": None,
            "independenceReason": "arguer_lineage_unknown",
        }

    arguer_family = lineage_family(arguer_model_id)
    arguer_lineage = {"model": arguer_model_id, "family": arguer_family}

    if not judge_family or not arguer_family:
        return {
            "judgeLineage": judge_lineage,
            "arguerLineage": arguer_lineage,
            "independent": None,
            "independenceReason": "judge_lineage_unknown",
        }

    independent = arguer_family != judge_family
    return {
        "judgeLineage": judge_lineage,
        "arguerLineage": arguer_lineage,
        "independent": independent,
        "independenceReason": "independent_lineage" if independent else "same_lineage",
    }


def _public_metadata_text(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    normalized = value.strip()
    if not normalized:
        return None
    lowered = normalized.lower()
    if any(marker in lowered for marker in SECRET_METADATA_MARKERS):
        return None
    return normalized
