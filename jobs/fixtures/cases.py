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


# ---------------------------------------------------------------------------
# Registrants -- every CIK survives, exactly one is primary
# ---------------------------------------------------------------------------


def registrants_three_ciks_one_source() -> None:
    """Case 1: three CIKs under one source become three registrants."""
    result = run_build(
        company_rows(
            {"identifier": "0000000004", "entity_name": "FIXTURE CO C"},
            {"identifier": "0000000001", "entity_name": "FIXTURE CO A"},
            {"identifier": "0000000003", "entity_name": "FIXTURE CO B"},
            COMPANION,
        ),
        structure_rows({}, COMPANION_STRUCTURE),
    )

    record = result.by_permid("5000000001")
    registrants = record["registrants"]
    assert len(registrants) == 3, f"expected 3 registrants, got {len(registrants)}"

    primaries = [r for r in registrants if r["isPrimary"]]
    assert len(primaries) == 1, f"expected exactly 1 primary, got {len(primaries)}"
    assert registrants[0]["isPrimary"], "registrants must be sorted primary-first"
    assert record["cik"] == registrants[0]["cik"] == "0000000001", record["cik"]

    # registrantName is the name reported against that CIK, not the PermID name.
    by_cik = {r["cik"]: r for r in registrants}
    assert by_cik["0000000003"]["registrantName"] == "FIXTURE CO B", by_cik
    assert record["name"] == "Fixture Co", record["name"]
    assert all(r["sources"] for r in registrants), "registrant missing a citation"


def registrants_survive_across_sources() -> None:
    """Case 3: CIK A from one source, CIK B from another. Both survive.

    This is the case where filtering identifiers by recency -- rather than only
    field values -- would silently drop a registrant.
    """
    result = run_build(
        company_rows(
            {**OLDER, "identifier": "0000000001", "entity_name": "FIXTURE CO A"},
            {**NEWER, "identifier": "0000000003", "entity_name": "FIXTURE CO B"},
            COMPANION,
        ),
        structure_rows({}, COMPANION_STRUCTURE),
    )

    registrants = result.by_permid("5000000001")["registrants"]
    assert {r["cik"] for r in registrants} == {"0000000001", "0000000003"}, registrants


def registrants_primary_is_lowest_cik_for_aep() -> None:
    """The AEP group: lowest CIK happens to be right."""
    result = run_build(
        company_rows(
            *[
                {"identifier": cik, "entity_name": f"AEP UNIT {cik}"}
                for cik in (
                    "0000004904",
                    "0000006879",
                    "0000050172",
                    "0000073986",
                    "0000081027",
                    "0000092487",
                )
            ],
            COMPANION,
        ),
        structure_rows({"parent_cik": "4904"}, COMPANION_STRUCTURE),
    )

    record = result.by_permid("5000000001")
    assert record["cik"] == "0000004904", record["cik"]
    assert len(record["registrants"]) == 6, len(record["registrants"])


def registrants_primary_is_lowest_cik_for_entergy() -> None:
    """The Entergy group: lowest CIK is WRONG, and asserted anyway.

    0000007323 is Entergy Arkansas; the real parent is Entergy Corp
    (0000065984). Pinning the wrong answer makes replacing `select_primary_cik`
    a visible, deliberate diff rather than a silent behavior change.
    """
    result = run_build(
        company_rows(
            *[
                {"identifier": cik, "entity_name": f"ENTERGY UNIT {cik}"}
                for cik in (
                    "0000065984",
                    "0000007323",
                    "0000044570",
                    "0000055259",
                    "0000071508",
                    "0000202584",
                    "0001999371",
                )
            ],
            COMPANION,
        ),
        structure_rows({"parent_cik": "65984"}, COMPANION_STRUCTURE),
    )

    record = result.by_permid("5000000001")
    assert record["cik"] == "0000007323", (
        f"expected the documented-wrong stub answer 0000007323, got {record['cik']}"
    )


# ---------------------------------------------------------------------------
# Corporate structure -- union across CIKs, one extraction per accession
# ---------------------------------------------------------------------------

BRIXMOR_ACCESSION = "0001581068-17-000005"


def _brixmor_rows(shared: int, only_holdco: int, only_opco: int) -> list[dict]:
    """Two co-registrant extractions of one exhibit that disagree on row count.

    Mirrors the real Brixmor shape: both CIKs are attributed accession
    0001581068-17-000005, but the processor read a different set of names under
    each. Scaled down from 619/633 -- the ratio is not what the collapse turns
    on, the divergence is.
    """
    rows = []
    for cik in ("1581068", "1630031"):
        rows += [
            {
                "parent_cik": cik,
                "accession_number": BRIXMOR_ACCESSION,
                "name": f"Shared Sub {n} LLC",
                "parent_name": "BRIXMOR",
            }
            for n in range(shared)
        ]
    rows += [
        {
            "parent_cik": "1581068",
            "accession_number": BRIXMOR_ACCESSION,
            "name": f"Holdco Only Sub {n} LLC",
            "parent_name": "BRIXMOR",
        }
        for n in range(only_holdco)
    ]
    rows += [
        {
            "parent_cik": "1630031",
            "accession_number": BRIXMOR_ACCESSION,
            "name": f"Opco Only Sub {n} LLC",
            "parent_name": "BRIXMOR",
        }
        for n in range(only_opco)
    ]
    return rows


def structure_one_extraction_per_accession() -> None:
    """Brixmor: both CIKs share one accession, so exactly one parse is kept.

    The primary's copy wins. Merging the two would produce a list neither parse
    returned -- the real-world version of that number is 634, which no
    extraction of the exhibit ever contained.
    """
    result = run_build(
        company_rows(
            {"identifier": "0001581068", "entity_name": "BRIXMOR PROPERTY GROUP INC"},
            {"identifier": "0001630031", "entity_name": "BRIXMOR OPERATING PTNSHP LP"},
            COMPANION,
        ),
        structure_rows(*_brixmor_rows(shared=6, only_holdco=2, only_opco=4)),
    )

    record = result.by_permid("5000000001")
    relationships = record["currentCorporateRelationships"]

    # Primary is the lower CIK, 0001581068, whose parse holds 6 + 2 = 8 names.
    assert record["cik"] == "0001581068", record["cik"]
    assert len(relationships) == 8, (
        f"expected the primary's 8-name parse, got {len(relationships)} "
        "(12 would mean the two parses were merged, 10 the wrong copy)"
    )
    assert not any("Opco Only" in r["child"]["name"] for r in relationships), (
        "rows from the non-chosen co-registrant's parse leaked in"
    )
    assert {r["disclosedByCik"] for r in relationships} == {"0001581068"}, (
        "every row should be attributed to the registrant whose parse was kept"
    )


def structure_co_registrants_collapse_to_one_list() -> None:
    """AEP: six CIKs carrying identical parses of one accession become one list.

    This is the case the accession collapse exists for -- a naive union renders
    132 rows describing 22 subsidiaries.
    """
    ciks = ("4904", "6879", "50172", "73986", "81027", "92487")
    rows = [
        {
            "parent_cik": cik,
            "accession_number": "0000004904-17-000019",
            "name": f"AEP Subsidiary {n} LLC",
            "parent_name": "AMERICAN ELECTRIC POWER CO INC",
        }
        for cik in ciks
        for n in range(22)
    ]
    result = run_build(
        company_rows(
            *[
                {"identifier": cik.zfill(10), "entity_name": f"AEP UNIT {cik}"}
                for cik in ciks
            ],
            COMPANION,
        ),
        structure_rows(*rows, COMPANION_STRUCTURE),
    )

    relationships = result.by_permid("5000000001")["currentCorporateRelationships"]
    assert len(relationships) == 22, (
        f"expected 22 subsidiaries, got {len(relationships)} (132 means no collapse)"
    )


def structure_separate_filings_are_not_deduped() -> None:
    """Two registrants filing separately both contribute, duplicates included.

    Cross-accession dedup is deliberately deferred. This pins the current
    behavior so adding it later is a visible change rather than a silent one.
    """
    rows = [
        {
            "parent_cik": "1581068",
            "accession_number": "0001581068-17-000005",
            "name": name,
            "parent_name": "HOLDCO",
        }
        for name in ("Shared Sub LLC", "Holdco Only LLC")
    ] + [
        {
            "parent_cik": "1630031",
            "accession_number": "0001630031-17-000009",
            "name": name,
            "parent_name": "OPCO",
        }
        for name in ("Shared Sub LLC", "Opco Only LLC")
    ]
    result = run_build(
        company_rows(
            {"identifier": "0001581068", "entity_name": "HOLDCO"},
            {"identifier": "0001630031", "entity_name": "OPCO"},
            COMPANION,
        ),
        structure_rows(*rows),
    )

    relationships = result.by_permid("5000000001")["currentCorporateRelationships"]
    names = [r["child"]["name"] for r in relationships]
    assert len(relationships) == 4, f"expected 4 rows, got {len(relationships)}: {names}"
    assert names.count("Shared Sub LLC") == 2, (
        f"the subsidiary named in both filings should appear twice: {names}"
    )

    # Two distinct disclosing registrants, two distinct source documents, so the
    # tree can be grouped by registrant from the record alone.
    shared = [r for r in relationships if r["child"]["name"] == "Shared Sub LLC"]
    assert {r["disclosedByCik"] for r in shared} == {
        "0001581068",
        "0001630031",
    }, shared
    assert len({r["sources"][0]["url"] for r in relationships}) >= 1
    assert all(r["disclosedByCik"] for r in relationships), "missing disclosedByCik"


def structure_registrants_may_file_on_different_dates() -> None:
    """Two registrants filing on different days give one record two `asOf`s.

    This is the data precondition for the tree subtitle's filing range. Each row
    keeps its own correct `asOf`; nothing is normalized to a single date.
    """
    rows = [
        {
            "parent_cik": "1581068",
            "accession_number": "0001581068-17-000005",
            "filing_date": "2017-02-13",
            "name": "Holdco Sub LLC",
            "parent_name": "HOLDCO",
        },
        {
            "parent_cik": "1630031",
            "accession_number": "0001630031-17-000009",
            "filing_date": "2017-03-01",
            "name": "Opco Sub LLC",
            "parent_name": "OPCO",
        },
    ]
    result = run_build(
        company_rows(
            {"identifier": "0001581068", "entity_name": "HOLDCO"},
            {"identifier": "0001630031", "entity_name": "OPCO"},
            COMPANION,
        ),
        structure_rows(*rows),
    )

    relationships = result.by_permid("5000000001")["currentCorporateRelationships"]
    dates = {r["asOf"] for r in relationships}
    assert dates == {"2017-02-13", "2017-03-01"}, dates

    by_name = {r["child"]["name"]: r for r in relationships}
    assert by_name["Holdco Sub LLC"]["asOf"] == "2017-02-13", by_name
    assert by_name["Opco Sub LLC"]["asOf"] == "2017-03-01", by_name


def structure_disclosed_by_cik_matches_a_registrant() -> None:
    """Every row's disclosedByCik resolves to one of the company's registrants."""
    result = run_build(
        company_rows({}, COMPANION),
        structure_rows({}, COMPANION_STRUCTURE),
    )

    for record in result.records:
        known = {r["cik"] for r in record["registrants"]}
        for relationship in record["currentCorporateRelationships"]:
            assert relationship["disclosedByCik"] in known, (
                f"{relationship['disclosedByCik']} not in {known}"
            )


def structure_same_day_filings_break_on_report_date() -> None:
    """Two 10-Ks filed the same day: the later fiscal period wins, not the
    higher accession.

    Modeled on DOC DR, LLC (CIK 1583994), which filed its FY2014 and FY2016
    10-Ks on 2017-02-24 through different filer agents. The accessions are
    arranged as they are in production -- the FY2014 one sorts higher -- so this
    case fails if accession number is the tie-break.
    """
    rows = [
        {
            "accession_number": "0001583994-17-000009",
            "filing_date": "2017-02-24",
            "report_date": "2014-12-31",
            "name": "Stale Period Sub LLC",
        },
        {
            "accession_number": "0001574540-17-000007",
            "filing_date": "2017-02-24",
            "report_date": "2016-12-31",
            "name": "Latest Period Sub LLC",
        },
    ]
    result = run_build(company_rows({}), structure_rows(*rows))

    relationships = result.by_permid("5000000001")["currentCorporateRelationships"]
    names = [r["child"]["name"] for r in relationships]
    assert names == ["Latest Period Sub LLC"], (
        f"expected only the FY2016 filing's subsidiary, got {names}"
    )


def structure_same_day_filings_without_report_date_still_resolve() -> None:
    """A blank `report_date` falls through to the accession tie-break.

    Seven 20FR12B rows carry no `report_date`. Comparing a null against itself
    is false, so a group with nothing to compare must fall through rather than
    match no row at all and cost the company its tree.
    """
    rows = [
        {
            "accession_number": "0000000001-17-000005",
            "report_date": None,
            "name": "Lower Accession Sub LLC",
        },
        {
            "accession_number": "0000000001-17-000009",
            "report_date": None,
            "name": "Higher Accession Sub LLC",
        },
    ]
    result = run_build(company_rows({}), structure_rows(*rows))

    relationships = result.by_permid("5000000001")["currentCorporateRelationships"]
    names = [r["child"]["name"] for r in relationships]
    assert names == ["Higher Accession Sub LLC"], (
        f"expected the highest accession to win, got {names}"
    )


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
    registrants_three_ciks_one_source,
    registrants_survive_across_sources,
    registrants_primary_is_lowest_cik_for_aep,
    registrants_primary_is_lowest_cik_for_entergy,
    structure_one_extraction_per_accession,
    structure_co_registrants_collapse_to_one_list,
    structure_separate_filings_are_not_deduped,
    structure_registrants_may_file_on_different_dates,
    structure_same_day_filings_break_on_report_date,
    structure_same_day_filings_without_report_date_still_resolve,
    structure_disclosed_by_cik_matches_a_registrant,
]
