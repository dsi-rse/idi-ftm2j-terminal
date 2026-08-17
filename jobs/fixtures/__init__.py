"""Synthetic fixtures exercising `build_dataset` paths production data cannot.

Run them with:

    uv run python -m fixtures
"""

# Local imports
from .harness import (
    DEFAULT_COMPANY_ROW,
    DEFAULT_STRUCTURE_ROW,
    FixtureResult,
    company_rows,
    run_build,
    structure_rows,
)

__all__ = [
    "DEFAULT_COMPANY_ROW",
    "DEFAULT_STRUCTURE_ROW",
    "FixtureResult",
    "company_rows",
    "run_build",
    "structure_rows",
]
