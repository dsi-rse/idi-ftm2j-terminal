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
from collections.abc import Callable, Iterable
from dataclasses import dataclass, field
from decimal import Decimal
from pathlib import Path
from typing import Any

# Third-party imports
import pandas as pd

JOBS_DIR = Path(__file__).resolve().parent.parent

# The CDT generation `run_build` publishes, and the contract it stamps. Mirrors
# what `cdt.publish.write_final_output_tables` writes; kept literal rather than
# imported from `constants`, so a fixture notices if the build's expectation
# drifts from what CDT actually publishes.
FIXTURE_CDT_RUN_ID = "20261101T000000000000Z"
FIXTURE_CDT_STALE_RUN_ID = "20261001T000000000000Z"
FIXTURE_CDT_CONTRACT_VERSION = 1

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

# Every column `build_dataset` reads off a company-facts row, mirroring the
# idi-company-facts processor output. Numbers and dates are strings, the way the
# parquet carries them; the parsers turn them into typed values. A default row
# describes a single-CIK 10-K filer in USD, matching DEFAULT_COMPANY_ROW's CIK
# and PermID so a facts case needs only the columns it varies.
DEFAULT_COMPANY_FACTS_ROW: dict[str, Any] = {
    "company_cik": "0000000001",
    "accession_number": "0000000001-24-000001",
    "form_type": "10-K",
    "doc_type": "10-K",
    "primary_url": (
        "https://www.sec.gov/Archives/edgar/data/1/000000000124000001/"
        "fixture-20231231.htm"
    ),
    "filing_date": "2024-02-15",
    "report_date": "2023-12-31",
    "company_name": "Fixture Co",
    "market_value": "1000000000",
    "market_value_as_of_date": "2023-06-30",
    "market_value_currency": "USD",
    "shares_outstanding": "50000000",
    "shares_outstanding_as_of_date": "2024-02-01",
    "is_shell_company": "false",
    "revenue": "750000000",
    "revenue_as_of_date": "2023-12-31",
    "revenue_currency": "USD",
    "last_accessed": "2026-08-20",
    "all_security_names": "Common Stock",
    "all_tickers": "FIX",
    "all_exchanges": "New York Stock Exchange",
    "all_security_types": "common",
}

# The columns of an empty facts frame -- the default when a case says nothing
# about facts, so every registrant's `facts` stays None, the same way the CDT
# frames default to empty.
COMPANY_FACTS_COLUMNS: tuple[str, ...] = tuple(DEFAULT_COMPANY_FACTS_ROW)

CDT_ITEM_ID = "000000000116000001-1-01"
CDT_MENTION_ID = "dim::fixture000000000000000001"
CDT_URL = (
    "https://www.sec.gov/Archives/edgar/data/1/000000000116000001/"
    "0000000001-16-000001.txt"
)

# Every column of the three CDT outputs, in the order CDT's
# `publish_contract.json` (contract version 1) lists them, so an override naming
# a real column is accepted and a typo still raises. `cik` is unpadded here
# because production reports it that way -- that is the whole point of the
# padding guard. Amounts are decimals, as CDT publishes them.
#
# `maturity_date` defaults to None, which makes the default instrument Undated.
# A far-future date would have made it Active without a case having to say so,
# and any hardcoded future date silently becomes a past date eventually; the
# active case computes its own instead.
#
# The default parties name the borrower as well as the lender, so every debt
# case also checks that only `lender` parties render as lenders.
CDT_PARTIES_JSON = json.dumps(
    [
        {
            "role": "lender",
            "canonical_name": "Fixture National Bank",
            "kind": "named",
            "spans": [
                {
                    "tag_id": "tag-1",
                    "char_start": 0,
                    "char_end": 21,
                    "text": "Fixture National Bank",
                },
            ],
        },
        {
            "role": "borrower",
            "canonical_name": "Fixture Co",
            "kind": "named",
            "spans": [
                {
                    "tag_id": "tag-2",
                    "char_start": 40,
                    "char_end": 50,
                    "text": "Fixture Co",
                },
            ],
        },
    ]
)

DEFAULT_CDT_ROW: dict[str, Any] = {
    "debt_instrument_id": CDT_MENTION_ID,
    "cik": "1",
    "company_name": "FIXTURE CO",
    "seed_debt_instrument_mention_id": CDT_MENTION_ID,
    "amendment_of_debt_instrument_id": None,
    "retired_by_debt_instrument_ids": None,
    "split_of_debt_instrument_id": None,
    "superseded_by_debt_instrument_id": None,
    "lineage_family_id": CDT_MENTION_ID,
    "is_lineage_head": True,
    "first_seen_filing_date": "2016-01-04",
    "last_seen_filing_date": "2016-01-04",
    "mention_count": 1,
    "document_count": 1,
    "name": "revolving credit facility",
    "name_source_mention_id": CDT_MENTION_ID,
    "instrument_type": None,
    "instrument_type_source_mention_id": None,
    "start_date": "2016-01-04",
    "start_date_source_mention_id": CDT_MENTION_ID,
    "maturity_date": None,
    "maturity_source_mention_id": None,
    "commitment_termination_date": None,
    "commitment_termination_source_mention_id": None,
    "principal_amount": Decimal("10000000.00"),
    "principal_currency": "USD",
    "principal_amount_kind": "commitment",
    "principal_source_mention_id": CDT_MENTION_ID,
    "outstanding_balance": None,
    "outstanding_balance_currency": None,
    "outstanding_balance_as_of": None,
    "outstanding_balance_as_of_is_filing_date": None,
    "outstanding_balance_source_mention_id": None,
    "interest_rate_kind": None,
    "interest_rate_pct": None,
    "interest_rate_source_mention_id": None,
    "parties_json": CDT_PARTIES_JSON,
    "lender_disclosure": "complete",
    "amendment_inferred_by": None,
    "synthesized_only": False,
}

DEFAULT_CDT_MENTION_ROW: dict[str, Any] = {
    "debt_instrument_mention_id": CDT_MENTION_ID,
    "item_id": CDT_ITEM_ID,
    "accession_number": "000000000116000001",
    "cik": "1",
    "company_name": "FIXTURE CO",
    "date": "2016-01-04",
    "raw_id": "i-1",
    "name": "revolving credit facility",
    "instrument_type": None,
    "start_date": "2016-01-04",
    "maturity_date": None,
    "commitment_termination_date": None,
    "principal_amount": Decimal("10000000.00"),
    "principal_currency": "USD",
    "principal_amount_kind": "commitment",
    "status": None,
    "status_date": None,
    "interest_rate_kind": None,
    "interest_rate_pct": None,
    "amendment_of": None,
    "retired_by_json": None,
    "split_of": None,
    "parties_json": CDT_PARTIES_JSON,
    "name_json": None,
    "start_date_json": None,
    "maturity_date_json": None,
    "commitment_termination_date_json": None,
    "amounts_json": None,
    "status_json": None,
    "interest_rate_json": None,
    "dates_json": None,
    "lender_disclosure": "complete",
    "synthesized_by": None,
    "synthesized_from_mention_id": None,
}

DEFAULT_CDT_ITEM_ROW: dict[str, Any] = {
    "item_id": CDT_ITEM_ID,
    "item": "1.01",
    "accession_number": "000000000116000001",
    "cik": "1",
    "company_name": "FIXTURE CO",
    "url": CDT_URL,
    "text": "Item 1.01 Entry into a Material Definitive Agreement.\nFixture text.",
    "date": "2016-01-04",
    "resource_uri": None,
    "item_information": "entry into a material definitive agreement",
    "extraction_status": "ok",
    "duplicate_resolution": "single_heading",
    "section_heading": "Item 1.01 Entry into a Material Definitive Agreement.",
    "start_line": 1,
    "end_line": 2,
    "section_char_count": 67,
    "form_type": "8-K",
}

# Every column of `mention-cluster-edges`. A `member` edge assigns a mention to
# its instrument, which is how the build finds the mentions an instrument's
# status is read off. `run_build` derives one from each instrument's seed
# mention when a case passes no edges, as CDT does for a single-mention
# instrument.
DEFAULT_CDT_EDGE_ROW: dict[str, Any] = {
    "debt_instrument_mention_id": CDT_MENTION_ID,
    "debt_instrument_id": CDT_MENTION_ID,
    "cik": "1",
    "item_id": CDT_ITEM_ID,
    "edge_type": "member",
    "match_score": 1.0,
    "candidate_rank": 1,
    "match_via": "seed",
}

# The columns of the shareholder-tracker output that `attach_shareholders`
# reads. The issuer is identified by `security_cusip`, which company-info
# resolves to a PermID -- there is no issuer PermID or CIK in this file. The
# default is one institutional (13-F) holding; a case sets `security_cusip` to
# match a company-info cusip row to make it attach.
DEFAULT_SHAREHOLDER_ROW: dict[str, Any] = {
    "source": "U.S. SECURITIES AND EXCHANGE COMMISSION (SEC)",
    "document_report_date": "2025-09-30",
    "investor_type": "INSTITUTIONAL INVESTOR",
    "investor_name": "Fixture Asset Management LLC",
    "investor_country_name": "United States",
    "security_type": "COM",
    "security_cusip": "000000000",
    "stock_number_of_shares": 1000,
    "security_market_value_amount_usd": 50000,
    "url": "https://www.sec.gov/Archives/fixture/13f.txt",
    "last_accessed_date": "2025-12-18",
}

DEFAULT_STRUCTURE_ROW: dict[str, Any] = {
    "parent_cik": "1",
    "filing_date": "2017-02-13",
    "report_date": "2016-12-31",
    "form_type": "10-K",
    # "21", not "EX-21". `build_source_name` interpolates this straight into the
    # citation, so a prefixed value renders "SEC 10-K Exhibit EX-21" -- a string
    # production cannot produce, which quietly weakens every fixture-built page
    # someone eyeballs. Production holds only "21" (10-K Exhibit 21) or "8" (the
    # 20-F equivalent).
    "exhibit_type": "21",
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


def cdt_rows(*overrides: dict[str, Any]) -> pd.DataFrame:
    """Builds a CDT debt-instruments fixture frame from partial rows."""
    return rows(DEFAULT_CDT_ROW, overrides)


def cdt_mention_rows(*overrides: dict[str, Any]) -> pd.DataFrame:
    """Builds a CDT debt-instrument-mentions fixture frame from partial rows."""
    return rows(DEFAULT_CDT_MENTION_ROW, overrides)


def cdt_item_rows(*overrides: dict[str, Any]) -> pd.DataFrame:
    """Builds a CDT items fixture frame from partial rows."""
    return rows(DEFAULT_CDT_ITEM_ROW, overrides)


def cdt_edge_rows(*overrides: dict[str, Any]) -> pd.DataFrame:
    """Builds a CDT mention-cluster-edges fixture frame from partial rows."""
    return rows(DEFAULT_CDT_EDGE_ROW, overrides)


def seed_member_edges(debt: pd.DataFrame) -> pd.DataFrame:
    """One `member` edge per instrument, from its seed mention to it."""
    return cdt_edge_rows(
        *(
            {"debt_instrument_mention_id": seed, "debt_instrument_id": instrument}
            for seed, instrument in zip(
                debt["seed_debt_instrument_mention_id"],
                debt["debt_instrument_id"],
                strict=True,
            )
        )
    )


def shareholder_rows(*overrides: dict[str, Any]) -> pd.DataFrame:
    """Builds a shareholder-tracker fixture frame from partial rows."""
    return rows(DEFAULT_SHAREHOLDER_ROW, overrides)


def company_facts_rows(*overrides: dict[str, Any]) -> pd.DataFrame:
    """Builds a company-facts fixture frame from partial rows."""
    return rows(DEFAULT_COMPANY_FACTS_ROW, overrides)


@dataclass
class FixtureResult:
    """The output of one build run, plus everything the build said while running."""

    records: list[dict]
    log: list[logging.LogRecord] = field(default_factory=list)
    error: str | None = None

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


def _publish_cdt(
    root: Path,
    frames: dict[str, pd.DataFrame],
    *,
    pointer_hook: Callable[[dict], dict | None] | None,
    snapshot_file: Callable[[str], str] | None,
    stale: dict[str, pd.DataFrame] | None,
) -> None:
    """Lays CDT's tables out under `root` the way a CDT publish does.

    Each generation goes under `snapshots/snapshot=<run_id>/`, behind a
    `latest.json` naming every table's path and row count.

    Args:
        root: The CDT database root to create.
        frames: The current generation's frames, keyed by table name.
        pointer_hook: Rewrites the pointer before it is written; `None` from it
            means publish no pointer.
        snapshot_file: Maps a table name to its file inside a snapshot.
        stale: An older generation's frames, keyed by table name, or `None`.
    """
    file_in_snapshot = snapshot_file or (lambda name: f"{name}.parquet")

    def write_generation(run_id: str, generation: dict[str, pd.DataFrame]) -> dict:
        tables = {}
        for name, frame in generation.items():
            relative = f"snapshots/snapshot={run_id}/{file_in_snapshot(name)}"
            path = root / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            frame.to_parquet(path, index=False)
            tables[name] = {"path": relative, "rows": len(frame)}
        return tables

    if stale is not None:
        write_generation(FIXTURE_CDT_STALE_RUN_ID, stale)
        # The per-table copies a reader must not use: a publish refreshes them
        # one at a time after the pointer, so they can lag it.
        for name, frame in stale.items():
            copy = root / name / "latest.parquet"
            copy.parent.mkdir(parents=True, exist_ok=True)
            frame.to_parquet(copy, index=False)

    pointer = {
        "run_id": FIXTURE_CDT_RUN_ID,
        "written_at": "2026-11-01T00:00:00+00:00",
        "schema_version": 1,
        "contract_version": FIXTURE_CDT_CONTRACT_VERSION,
        "publish_format_version": 1,
        "tables": write_generation(FIXTURE_CDT_RUN_ID, frames),
    }
    if pointer_hook is not None:
        pointer = pointer_hook(pointer)
    if pointer is not None:
        (root / "latest.json").write_text(json.dumps(pointer), encoding="utf-8")


def run_build(
    companies: pd.DataFrame,
    structure: pd.DataFrame,
    *,
    debt: pd.DataFrame | None = None,
    mentions: pd.DataFrame | None = None,
    items: pd.DataFrame | None = None,
    edges: pd.DataFrame | None = None,
    shareholders: pd.DataFrame | None = None,
    facts: pd.DataFrame | None = None,
    cdt_pointer: Callable[[dict], dict | None] | None = None,
    cdt_snapshot_file: Callable[[str], str] | None = None,
    stale_cdt: dict[str, pd.DataFrame] | None = None,
    expect_failure: bool = False,
) -> FixtureResult:
    """Runs the whole `build_dataset` pipeline against in-memory frames.

    The CDT frames default to empty, so a case about corporate structure or
    registrants says nothing about debt. They cannot default to one instrument:
    a case that overrides the company CIK -- every multi-CIK case does -- would
    then trip the CDT join guard on a dataset it never meant to describe.

    Args:
        companies: A company-info frame, from `company_rows`.
        structure: A corporate-structure frame, from `structure_rows`.
        debt: A CDT debt-instruments frame, from `cdt_rows`.
        mentions: A CDT debt-instrument-mentions frame, from `cdt_mention_rows`.
        items: A CDT items frame, from `cdt_item_rows`.
        edges: A CDT mention-cluster-edges frame, from `cdt_edge_rows`.
            Defaults to `seed_member_edges(debt)`, so each instrument's seed
            mention is its one member mention.
        shareholders: A shareholder-tracker frame, from `shareholder_rows`.
            Defaults to empty, so a case about another section says nothing about
            shareholders.
        facts: A company-facts frame, from `company_facts_rows`. Defaults to
            empty, so a case about another section leaves every registrant's
            `facts` None.
        cdt_pointer: Rewrites CDT's `latest.json` before it is written; return
            `None` to publish no pointer at all. For cases about a bad pointer.
        cdt_snapshot_file: Maps a CDT table name to its file inside the
            snapshot. Defaults to CDT's `<table>.parquet`.
        stale_cdt: CDT frames, keyed by table name, published as an older
            generation beside the current one -- both as a prior snapshot and
            as the per-table `<table>/latest.parquet` copies -- so a case can
            prove the build reads only what the pointer names.
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

    debt = cdt_rows() if debt is None else debt
    mentions = cdt_mention_rows() if mentions is None else mentions
    items = cdt_item_rows() if items is None else items
    edges = seed_member_edges(debt) if edges is None else edges
    shareholders = shareholder_rows() if shareholders is None else shareholders
    facts = (
        pd.DataFrame(columns=list(COMPANY_FACTS_COLUMNS)) if facts is None else facts
    )

    with tempfile.TemporaryDirectory() as tmp:
        tmpdir = Path(tmp)
        company_path = tmpdir / "company_info.parquet"
        structure_path = tmpdir / "corporate_structure.parquet"
        cdt_root = tmpdir / "cdt"
        shareholders_path = tmpdir / "shareholders.parquet"
        facts_path = tmpdir / "company_facts.parquet"
        output_dir = tmpdir / "output"
        companies.to_parquet(company_path, index=False)
        structure.to_parquet(structure_path, index=False)
        _publish_cdt(
            cdt_root,
            {
                "debt-instruments": debt,
                "debt-instrument-mentions": mentions,
                "items": items,
                "mention-cluster-edges": edges,
            },
            pointer_hook=cdt_pointer,
            snapshot_file=cdt_snapshot_file,
            stale=stale_cdt,
        )
        shareholders.to_parquet(shareholders_path, index=False)
        facts.to_parquet(facts_path, index=False)

        previous = {
            key: os.environ.get(key)
            for key in (
                "COMPANY_INFO_FILE_PATH",
                "CORPORATE_STRUCTURE_FILE_PATH",
                "CDT_DATABASE_DIR",
                "COMPANY_FACTS_FILE_PATH",
                "SHAREHOLDERS_FILE_PATH",
                "OUTPUT_DIR",
            )
        }
        os.environ["COMPANY_INFO_FILE_PATH"] = str(company_path)
        os.environ["CORPORATE_STRUCTURE_FILE_PATH"] = str(structure_path)
        os.environ["CDT_DATABASE_DIR"] = str(cdt_root)
        os.environ["COMPANY_FACTS_FILE_PATH"] = str(facts_path)
        os.environ["SHAREHOLDERS_FILE_PATH"] = str(shareholders_path)
        os.environ["OUTPUT_DIR"] = str(output_dir)
        try:
            # The build prints nothing to stdout, but pandas and pyarrow may;
            # swallow it so the runner's own output stays readable.
            with contextlib.redirect_stdout(io.StringIO()):
                build_dataset.main(logger)
        except RuntimeError as e:
            if not expect_failure:
                raise
            return FixtureResult(records=[], log=capture.records, error=str(e))
        finally:
            for key, value in previous.items():
                if value is None:
                    os.environ.pop(key, None)
                else:
                    os.environ[key] = value

        records = _read_records(output_dir)

    return FixtureResult(records=records, log=capture.records)


def _read_records(output_dir: Path) -> list[dict]:
    """Reconstructs the company records from the split output layout.

    `build_dataset` no longer writes one JSON array; it writes `index.ndjson`
    plus one `detail/<shard>/<permId>.json` per company. Records are returned in
    index order, which is the order `build_companies` sorted them, so a case can
    still assert on ordering. Mirrors `output.index_shard`.
    """
    index_path = output_dir / "index.ndjson"
    if not index_path.exists():
        return []
    records: list[dict] = []
    for line in index_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        perm_id = json.loads(line)["permId"]
        shard = perm_id[:2] if len(perm_id) >= 2 else "_"
        detail = output_dir / "detail" / shard / f"{perm_id}.json"
        records.append(json.loads(detail.read_text(encoding="utf-8")))
    return records
