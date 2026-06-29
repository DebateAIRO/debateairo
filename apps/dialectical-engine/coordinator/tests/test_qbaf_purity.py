from __future__ import annotations

import ast
from pathlib import Path


ENGINE_ROOT = Path(__file__).resolve().parents[2]
QBAF_ROOT = ENGINE_ROOT / "coordinator" / "app" / "qbaf"

FORBIDDEN_MODULE_PREFIXES = (
    "app.api",
    "app.core",
    "app.db",
    "app.evidence",
    "app.orchestration",
    "app.providers",
    "app.scoring",
    "app.services",
    "app.worker",
    "datetime",
    "dotenv",
    "httpx",
    "neo4j",
    "openai",
    "os",
    "pathlib",
    "random",
    "requests",
    "socket",
    "sqlalchemy",
    "subprocess",
    "time",
    "uuid",
)

FORBIDDEN_CALLS = {
    "open",
    "print",
}

FORBIDDEN_ATTR_CALLS = {
    "read_text",
    "write_text",
    "read_bytes",
    "write_bytes",
    "exists",
    "mkdir",
    "unlink",
}


def qbaf_python_files() -> list[Path]:
    return sorted(QBAF_ROOT.rglob("*.py"))


def matches_forbidden_module(module: str, forbidden_prefix: str) -> bool:
    return module == forbidden_prefix or module.startswith(f"{forbidden_prefix}.")


def test_qbaf_modules_keep_direct_import_boundary() -> None:
    offenders: list[str] = []
    for path in qbaf_python_files():
        tree = ast.parse(path.read_text(), filename=str(path))
        for node in ast.walk(tree):
            imported_modules: list[str] = []
            if isinstance(node, ast.Import):
                imported_modules.extend(alias.name for alias in node.names)
            elif isinstance(node, ast.ImportFrom) and node.module:
                imported_modules.append(node.module)

            for module in imported_modules:
                if module == "app.qbaf" or module.startswith("app.qbaf."):
                    continue
                if any(
                    matches_forbidden_module(module, prefix)
                    for prefix in FORBIDDEN_MODULE_PREFIXES
                ):
                    offenders.append(f"{path.relative_to(ENGINE_ROOT)} imports {module}")

    assert offenders == []


def test_qbaf_modules_do_not_call_io_or_process_primitives() -> None:
    offenders: list[str] = []
    for path in qbaf_python_files():
        tree = ast.parse(path.read_text(), filename=str(path))
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call):
                continue
            if isinstance(node.func, ast.Name) and node.func.id in FORBIDDEN_CALLS:
                offenders.append(f"{path.relative_to(ENGINE_ROOT)} calls {node.func.id}")
            if isinstance(node.func, ast.Attribute) and node.func.attr in FORBIDDEN_ATTR_CALLS:
                offenders.append(f"{path.relative_to(ENGINE_ROOT)} calls .{node.func.attr}")

    assert offenders == []
