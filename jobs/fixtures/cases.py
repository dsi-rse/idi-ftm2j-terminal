"""Fixture cases for `build_dataset`.

Each case is a function taking no arguments and raising `AssertionError` on
failure. Register it in `CASES` and the runner picks it up -- no harness changes.

Cases are grouped by the behavior they pin down. The multi-CIK cases exist
because production data has no multi-CIK company, so nothing else exercises
those paths.
"""

# Local imports
from .harness import company_rows, run_build, structure_rows

# A second, ordinary company whose CIK matches a structure row. Multi-CIK cases
# need it: `attach_relationships` raises when the join matches nothing at all,
# and a company under test may deliberately not match. Keeping that guard armed
# is worth more than the two extra lines.
COMPANION = {
    "permid_id": "5000000002",
    "permid_url": "https://permid.org/1-5000000002",
    "identifier": "0000000002",
    "standard_identifier": "Cik:0000000002",
    "investor_name": "Companion Co",
    "entity_name": "COMPANION CO",
}
COMPANION_STRUCTURE = {"parent_cik": "2", "name": "Companion Subsidiary LLC"}

# Two snapshots of one PermID, taken by different sources at different times.
OLDER = {
    "input_source": "commercial_debt_tracker",
    "last_processed": "20260101T000000",
}
NEWER = {
    "input_source": "shareholder_tracker_cik",
    "last_processed": "20260801T033040",
}
CANADA = "1 Older Street\nTORONTO\nONTARIO\nM5H 2N2\nCanada\n"
USA = "1 Newer Street\nTESTVILLE\nDELAWARE\n19801\nUnited States\n"


def smoke_single_cik() -> None:
    """One PermID, one CIK, one filing: the ordinary shape, end to end."""
    result = run_build(
        company_rows({}),
        structure_rows({}),
    )

    assert len(result.records) == 1, f"expected 1 record, got {len(result.records)}"
    record = result.by_permid("5000000001")
    assert record["name"] == "Fixture Co", record["name"]
    assert record["cik"] == "0000000001", record["cik"]
    assert record["hqCountry"] == "United States", record["hqCountry"]

    relationships = record["currentCorporateRelationships"]
    assert len(relationships) == 1, f"expected 1 relationship, got {len(relationships)}"
    assert relationships[0]["child"]["name"] == "Fixture Subsidiary LLC"
    assert relationships[0]["asOf"] == "2017-02-13", relationships[0]["asOf"]
    assert relationships[0]["sources"], "relationship carries no source"


def smoke_unmatched_cik_fails_the_build() -> None:
    """A structure dataset that joins to nothing must fail, not render empty.

    This guards the zero-match `RuntimeError` in `attach_relationships`. Without
    it a padding mismatch looks exactly like "the processor has no data yet".
    """
    result = run_build(
        company_rows({}),
        structure_rows({"parent_cik": "9999999"}),
        expect_failure=True,
    )
    assert result.records == [], "build should not have produced records"


def smoke_warning_capture() -> None:
    """The harness can assert on WARNINGs the build emits.

    A company with no `permid_url` has no source citation, which `main` reports
    as a WARNING. Cases that assert on the divergence guard rely on this
    machinery working.
    """
    result = run_build(
        company_rows({"permid_url": None}),
        structure_rows({}),
    )
    matches = result.warnings_matching("no source citation")
    assert matches, f"expected a source-citation WARNING, got {result.warnings()}"


# ---------------------------------------------------------------------------
# Snapshot selection -- scalar fields come from the most recent row
# ---------------------------------------------------------------------------


def snapshot_newer_row_wins() -> None:
    """Case 2: one CIK, two sources. The newer snapshot supplies the scalars."""
    result = run_build(
        company_rows(
            {**OLDER, "hq_address": CANADA},
            {**NEWER, "hq_address": USA},
            COMPANION,
        ),
        structure_rows({}, COMPANION_STRUCTURE),
    )

    record = result.by_permid("5000000001")
    assert record["hqCountry"] == "United States", record["hqCountry"]
    assert record["sources"][0]["lastAccessed"] == "2026-08-01", record["sources"]
    # The repeated CIK collapses: two rows, one identifier, one registrant.
    assert record["cik"] == "0000000001", record["cik"]


def snapshot_row_order_is_irrelevant() -> None:
    """Reversing the fixture's row order changes nothing. Recency decides."""
    forward = run_build(
        company_rows(
            {**OLDER, "hq_address": CANADA},
            {**NEWER, "hq_address": USA},
            COMPANION,
        ),
        structure_rows({}, COMPANION_STRUCTURE),
    ).by_permid("5000000001")
    reversed_ = run_build(
        company_rows(
            {**NEWER, "hq_address": USA},
            {**OLDER, "hq_address": CANADA},
            COMPANION,
        ),
        structure_rows({}, COMPANION_STRUCTURE),
    ).by_permid("5000000001")

    assert forward == reversed_, "row order changed the record"
    assert forward["hqCountry"] == "United States", forward["hqCountry"]


def snapshot_ticker_is_not_unioned_across_snapshots() -> None:
    """Two snapshots reporting different tickers surface only the newer one."""
    result = run_build(
        company_rows(
            {**OLDER, "ticker": "OLD", "exchange": "XNMS", "exchange_code": "NMS"},
            {**NEWER, "ticker": "NEW", "exchange": "XNMS", "exchange_code": "NMS"},
            COMPANION,
        ),
        structure_rows({}, COMPANION_STRUCTURE),
    )

    listing = result.by_permid("5000000001")["currentListing"] or {}
    assert listing.get("ticker") == "NEW", listing
    assert "OLD" not in repr(listing), listing


def snapshot_fields_are_not_coalesced() -> None:
    """A null in the newer snapshot wins over a value in the older one.

    Coalescing field-by-field to the last non-null would assemble a record no
    single fetch ever returned.
    """
    result = run_build(
        company_rows(
            {**OLDER, "ticker": "OLD", "exchange": "XNMS", "exchange_code": "NMS"},
            {**NEWER, "ticker": None, "exchange": "XNMS", "exchange_code": "NMS"},
            COMPANION,
        ),
        structure_rows({}, COMPANION_STRUCTURE),
    )

    listing = result.by_permid("5000000001")["currentListing"] or {}
    assert not listing.get("ticker"), f"expected no ticker, got {listing.get('ticker')}"


# ---------------------------------------------------------------------------
# Divergence guard -- within a snapshot, not across snapshots
# ---------------------------------------------------------------------------


def divergence_identical_rows_of_one_snapshot_are_silent() -> None:
    """Case 1: 3 CIKs, one source, identical fields. Expected shape, no WARNING.

    This is the ordinary multi-CIK arrangement -- several registrants resolved
    from a single `permid_data.json` -- so it must not be reported as an
    anomaly.
    """
    result = run_build(
        company_rows(
            {"identifier": "0000000001", "entity_name": "FIXTURE CO A"},
            {"identifier": "0000000003", "entity_name": "FIXTURE CO B"},
            {"identifier": "0000000004", "entity_name": "FIXTURE CO C"},
            COMPANION,
        ),
        structure_rows({}, COMPANION_STRUCTURE),
    )

    assert len(result.records) == 2, f"expected 2 records, got {len(result.records)}"
    result.by_permid("5000000001")
    divergence = result.warnings_matching("within one snapshot")
    assert not divergence, f"unexpected divergence WARNING: {divergence}"


def divergence_within_one_snapshot_warns() -> None:
    """Rows of one snapshot disagreeing on a scalar raise a WARNING.

    Those rows all came from a single `permid_data.json`, so disagreement is an
    upstream anomaly. The build must still finish and still render the company:
    an upstream disagreement is a signal to investigate, not a reason to drop a
    page.
    """
    result = run_build(
        company_rows(
            {"identifier": "0000000001", "hq_address": USA},
            {"identifier": "0000000003", "hq_address": CANADA},
            COMPANION,
        ),
        structure_rows({}, COMPANION_STRUCTURE),
    )

    matches = result.warnings_matching("5000000001", "hq_address", "within one snapshot")
    assert matches, f"expected a divergence WARNING, got {result.warnings()}"
    record = result.by_permid("5000000001")
    assert record["name"] == "Fixture Co", "company should still be rendered"


def divergence_across_snapshots_is_silent() -> None:
    """Two snapshots disagreeing is expected drift, not an anomaly.

    Warning on this would fire for every company reached by more than one
    source, which is noise rather than signal.
    """
    result = run_build(
        company_rows(
            {**OLDER, "hq_address": CANADA},
            {**NEWER, "hq_address": USA},
            COMPANION,
        ),
        structure_rows({}, COMPANION_STRUCTURE),
    )

    divergence = result.warnings_matching("within one snapshot")
    assert not divergence, f"cross-snapshot drift should be silent: {divergence}"


CASES = [
    smoke_single_cik,
    smoke_unmatched_cik_fails_the_build,
    smoke_warning_capture,
    snapshot_newer_row_wins,
    snapshot_row_order_is_irrelevant,
    snapshot_ticker_is_not_unioned_across_snapshots,
    snapshot_fields_are_not_coalesced,
    divergence_identical_rows_of_one_snapshot_are_silent,
    divergence_within_one_snapshot_warns,
    divergence_across_snapshots_is_silent,
]
