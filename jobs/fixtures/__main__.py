"""Runs every fixture case and reports pass/fail.

    uv run python -m fixtures            # all cases
    uv run python -m fixtures multi_cik  # cases whose name contains "multi_cik"

Exits non-zero if any case fails, so it can gate a build.
"""

# Standard library imports
import sys
import traceback

# Local imports
from .cases import CASES


def main(argv: list[str]) -> int:
    """Runs the selected cases.

    Args:
        argv: Optional substrings; a case runs if its name contains any of them.

    Returns:
        0 if every selected case passed, 1 otherwise.
    """
    selected = [c for c in CASES if not argv or any(a in c.__name__ for a in argv)]
    if not selected:
        print(f"No fixture case matches {argv}. Known cases:")
        for case in CASES:
            print(f"  {case.__name__}")
        return 1

    failures: list[str] = []
    for case in selected:
        try:
            case()
        except Exception:  # noqa: BLE001 - a failing case must not stop the run
            failures.append(case.__name__)
            print(f"FAIL  {case.__name__}")
            print(traceback.format_exc())
        else:
            print(f"ok    {case.__name__}")

    print(f"\n{len(selected) - len(failures)}/{len(selected)} passed")
    if failures:
        print("Failed: " + ", ".join(failures))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
