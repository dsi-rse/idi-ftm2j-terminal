"""Fixture cases for `build_dataset`.

Each case is a function taking no arguments and raising `AssertionError` on
failure. Register it in `CASES` and the runner picks it up -- no harness changes.

Cases are grouped by the behavior they pin down. The multi-CIK cases exist
because production data has no multi-CIK company, so nothing else exercises
those paths.
"""

# Local imports
from .harness import company_rows, run_build, structure_rows


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


CASES = [
    smoke_single_cik,
    smoke_unmatched_cik_fails_the_build,
    smoke_warning_capture,
]
