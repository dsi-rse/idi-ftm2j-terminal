"""Machinery for running `build_dataset` against synthetic inputs.

No PermID in production carries more than one CIK, so the multi-CIK paths in
`build_dataset` cannot be exercised against real data at all. These fixtures are
not a supplement to production coverage -- they are the only coverage those code
paths will ever have.

A case declares only the columns it cares about; `DEFAULT_COMPANY_ROW` and
`DEFAULT_STRUCTURE_ROW` fill in the rest, so adding a case costs a few lines and
never touches this module.

The build is exercised end to end -- `build_dataset.main` is called with real
parquet files on disk, not by poking individual transform functions -- because
the bugs worth catching here live in how the stages compose.
"""

# Standard library imports
import contextlib
import importlib.util
import io
import json
import logging
import os
import tempfile
from collections.abc import Iterable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

# Third-party imports
import pandas as pd

JOBS_DIR = Path(__file__).resolve().parent.parent

# Every column `build_dataset` reads off a company-info row, plus the ones that
# define the grain. Values mirror the shape of production data -- `hq_address`
# is a newline-delimited block ending in a country, `last_processed` is compact
# basic ISO -- because the parsers care about both.
DEFAULT_COMPANY_ROW: dict[str, Any] = {
    "input_source": "shareholder_tracker_cik",
    "entity_name": "FIXTURE CO",
    "identifier_type": "cik",
    "identifier": "0000000001",
    "standard_identifier": "Cik:0000000001",
    "permid_url": "https://permid.org/1-5000000001",
    "investor_name": "Fixture Co",
    "permid_id": "5000000001",
    "hq_address": "1 Test Street\nTESTVILLE\nDELAWARE\n19801\nUnited States\n",
    "registered_address": None,
    "fax_number": None,
    "phone_number": None,
    "lei": None,
    "founded_date": None,
    "incorporated_in": "United States",
    "domiciled_in": "United States",
    "url": None,
    "activity_status": "tr-org:statusActive",
    "primary_business_sector_label": None,
    "primary_economic_sector_label": None,
    "primary_industry_group_label": None,
    "primary_business_sector_comment": None,
    "primary_economic_sector_comment": None,
    "primary_industry_group_comment": None,
    "ticker": None,
    "exchange": None,
    "exchange_code": None,
    "ric": None,
    "last_processed": "20260801T033040",
}

DEFAULT_STRUCTURE_ROW: dict[str, Any] = {
    "parent_cik": "1",
    "filing_date": "2017-02-13",
    "report_date": "2016-12-31",
    "form_type": "10-K",
    "exhibit_type": "EX-21",
    "accession_number": "0000000001-17-000001",
    "exhibit_url": "https://www.sec.gov/Archives/fixture/ex21.htm",
    "name": "Fixture Subsidiary LLC",
    "location": "Delaware",
    "parent_name": "FIXTURE CO",
    "parent_state_of_incorporation": "DE",
    "parent_business_street1": None,
    "parent_business_street2": None,
    "parent_business_city": None,
    "parent_business_state": None,
    "parent_business_zip": None,
    "parent_business_country": None,
    "parent_business_country_code": None,
    "parent_tickers": None,
    "parent_exchanges": None,
    "source_quote": None,
    "date_added": "2026-08-01",
}


def _load_build_dataset():
    """Imports `build_dataset` by path.

    `jobs/` is not an installed package and the fixture runner may be invoked
    from either `jobs/` or the repo root, so a plain import is not reliable.
    """
    spec = importlib.util.spec_from_file_location(
        "build_dataset", JOBS_DIR / "build_dataset.py"
    )
    if spec is None or spec.loader is None:  # pragma: no cover - import guard
        raise RuntimeError(f"Could not import build_dataset.py from {JOBS_DIR}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def rows(defaults: dict[str, Any], overrides: Iterable[dict[str, Any]]) -> pd.DataFrame:
    """Expands partial row dicts into a full DataFrame.

    Args:
        defaults: `DEFAULT_COMPANY_ROW` or `DEFAULT_STRUCTURE_ROW`.
        overrides: One dict per row, holding only the columns that differ.

    Returns:
        A DataFrame with every column the production schema carries.

    Raises:
        `KeyError` if an override names a column the schema does not have --
        a typo would otherwise be silently ignored and the assertion it was
        meant to drive would pass for the wrong reason.
    """
    built = []
    for override in overrides:
        unknown = set(override) - set(defaults)
        if unknown:
            raise KeyError(
                f"Unknown fixture column(s) {sorted(unknown)}. "
                f"Known columns: {sorted(defaults)}"
            )
        built.append({**defaults, **override})
    return pd.DataFrame(built, columns=list(defaults))


def company_rows(*overrides: dict[str, Any]) -> pd.DataFrame:
    """Builds a company-info fixture frame from partial rows."""
    return rows(DEFAULT_COMPANY_ROW, overrides)


def structure_rows(*overrides: dict[str, Any]) -> pd.DataFrame:
    """Builds a corporate-structure fixture frame from partial rows."""
    return rows(DEFAULT_STRUCTURE_ROW, overrides)


@dataclass
class FixtureResult:
    """The output of one build run, plus everything the build said while running."""

    records: list[dict]
    log: list[logging.LogRecord] = field(default_factory=list)

    def by_permid(self, perm_id: str) -> dict:
        """Returns the single record for a PermID.

        Raises:
            `AssertionError` if there is not exactly one.
        """
        matches = [r for r in self.records if r["permId"] == perm_id]
        if len(matches) != 1:
            raise AssertionError(
                f"Expected exactly one record for PermID {perm_id}, got {len(matches)}"
            )
        return matches[0]

    def messages(self, level: int) -> list[str]:
        """Returns rendered log messages at exactly `level`."""
        return [r.getMessage() for r in self.log if r.levelno == level]

    def warnings(self) -> list[str]:
        """Returns rendered WARNING messages."""
        return self.messages(logging.WARNING)

    def warnings_matching(self, *needles: str) -> list[str]:
        """Returns WARNINGs containing every one of `needles`."""
        return [m for m in self.warnings() if all(n in m for n in needles)]


class _Capture(logging.Handler):
    """Collects log records so a fixture can assert on what the build reported."""

    def __init__(self) -> None:
        super().__init__(level=logging.DEBUG)
        self.records: list[logging.LogRecord] = []

    def emit(self, record: logging.LogRecord) -> None:
        self.records.append(record)


def run_build(
    companies: pd.DataFrame, structure: pd.DataFrame, *, expect_failure: bool = False
) -> FixtureResult:
    """Runs the whole `build_dataset` pipeline against two in-memory frames.

    Args:
        companies: A company-info frame, from `company_rows`.
        structure: A corporate-structure frame, from `structure_rows`.
        expect_failure: When true, a `RuntimeError` from the build is caught and
            recorded rather than raised -- for cases asserting the build refuses
            bad input.

    Returns:
        A `FixtureResult` holding the emitted records and captured log.
    """
    build_dataset = _load_build_dataset()
    capture = _Capture()
    logger = logging.getLogger("FIXTURE BUILD")
    logger.setLevel(logging.DEBUG)
    logger.handlers = [capture]
    logger.propagate = False

    with tempfile.TemporaryDirectory() as tmp:
        tmpdir = Path(tmp)
        company_path = tmpdir / "company_info.parquet"
        structure_path = tmpdir / "corporate_structure.parquet"
        output_path = tmpdir / "companies.json"
        companies.to_parquet(company_path, index=False)
        structure.to_parquet(structure_path, index=False)

        previous = {
            key: os.environ.get(key)
            for key in (
                "COMPANY_INFO_FILE_PATH",
                "CORPORATE_STRUCTURE_FILE_PATH",
                "OUTPUT_FILE_PATH",
            )
        }
        os.environ["COMPANY_INFO_FILE_PATH"] = str(company_path)
        os.environ["CORPORATE_STRUCTURE_FILE_PATH"] = str(structure_path)
        os.environ["OUTPUT_FILE_PATH"] = str(output_path)
        try:
            # The build prints nothing to stdout, but pandas and pyarrow may;
            # swallow it so the runner's own output stays readable.
            with contextlib.redirect_stdout(io.StringIO()):
                build_dataset.main(logger)
        except RuntimeError:
            if not expect_failure:
                raise
            return FixtureResult(records=[], log=capture.records)
        finally:
            for key, value in previous.items():
                if value is None:
                    os.environ.pop(key, None)
                else:
                    os.environ[key] = value

        records = json.loads(output_path.read_text(encoding="utf-8"))

    return FixtureResult(records=records, log=capture.records)
