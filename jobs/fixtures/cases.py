"""Fixture cases for `build_dataset`.

Each case is a function taking no arguments and raising `AssertionError` on
failure. Register it in `CASES` and the runner picks it up -- no harness changes.

Cases are grouped by the behavior they pin down. The multi-CIK cases exist
because production data has no multi-CIK company, so nothing else exercises
those paths.
"""

# Standard library imports
import datetime
import logging

# Local imports
from .harness import (
    CDT_URL,
    cdt_item_rows,
    cdt_mention_rows,
    cdt_rows,
    company_rows,
    run_build,
    structure_rows,
)

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


def structure_nameless_subsidiary_is_dropped() -> None:
    """A row with a blank `name` is dropped, counted, and does not render.

    `child.name` is a required string in the serialized type; a blank would ship
    as JSON null and draw an empty row in the tree. The named rows around it are
    unaffected, and the drop is reported so it is visible rather than silent.
    """
    rows = [
        {"accession_number": "0000000001-17-000001", "name": "Named Sub LLC"},
        {"accession_number": "0000000001-17-000001", "name": "   "},
    ]
    result = run_build(company_rows({}), structure_rows(*rows))

    relationships = result.by_permid("5000000001")["currentCorporateRelationships"]
    names = [r["child"]["name"] for r in relationships]
    assert names == ["Named Sub LLC"], f"expected the nameless row dropped, got {names}"
    assert result.messages(logging.INFO), "expected the drop to be reported"
    assert any(
        "1 subsidiary rows dropped for a missing name" in m
        for m in result.messages(logging.INFO)
    ), result.messages(logging.INFO)


def structure_all_nameless_leaves_an_empty_tree() -> None:
    """A company whose every row is nameless gets an empty tree, not a failure.

    The CIK join matched, so this is not the zero-match case that fails the
    build -- the rows are simply unrenderable. With this the only company, the
    build must still succeed with an empty tree rather than trip the zero-match
    guard as if the join had found nothing.
    """
    result = run_build(
        company_rows({}),
        structure_rows({"name": None}),
    )

    record = result.by_permid("5000000001")
    assert record["currentCorporateRelationships"] == [], (
        f"expected an empty tree, got {record['currentCorporateRelationships']}"
    )


def structure_missing_filing_date_fails_the_build() -> None:
    """A null `filing_date` yields a null `asOf`, which must fail the build.

    `asOf` is a required string; shipping null renders as literal "null" in the
    citation. Nothing downstream catches it -- `validate_companies` runs before
    relationships are attached -- so the build must refuse it here.
    """
    result = run_build(
        company_rows({}),
        structure_rows({"filing_date": None}),
        expect_failure=True,
    )
    assert result.records == [], "build should not have produced records"


def structure_missing_exhibit_url_fails_the_build() -> None:
    """A null `exhibit_url` yields a null citation URL, which must fail the build.

    Same contract as the date: `Source.url` is a required string, so a blank
    cell cannot be allowed to ship as null.
    """
    result = run_build(
        company_rows({}),
        structure_rows({"exhibit_url": None}),
        expect_failure=True,
    )
    assert result.records == [], "build should not have produced records"


def structure_20f_cites_exhibit_8_and_is_not_filtered() -> None:
    """A 20-F filer keeps its subsidiaries and is cited as Exhibit 8, not 21.

    No 20-F filer exists in the production company universe, so this path had no
    coverage at all -- issue 19 shipped with it recorded as unexercised. Two
    things could go wrong and neither would be visible on any real page: the
    citation could hardcode "Exhibit 21", and a filter on `exhibit_type` would
    silently drop every foreign private issuer.
    """
    result = run_build(
        company_rows({}),
        structure_rows({"form_type": "20-F", "exhibit_type": "8"}),
    )

    relationships = result.by_permid("5000000001")["currentCorporateRelationships"]
    assert len(relationships) == 1, (
        f"a 20-F filer lost its subsidiaries: got {len(relationships)}"
    )
    name = relationships[0]["sources"][0]["name"]
    assert name == "SEC 20-F Exhibit 8", name


def structure_citation_matches_production_exactly() -> None:
    """The default fixture renders the citation production renders.

    Pins the fixture's own faithfulness rather than any build behavior. The
    default row once held `exhibit_type` "EX-21", which rendered "SEC 10-K
    Exhibit EX-21" -- a string the production file cannot produce, since it holds
    only "21" or "8". Nothing asserted on it, so nothing failed; the cost was
    that a fixture-built page shown to a human was subtly not what ships.
    """
    result = run_build(company_rows({}), structure_rows({}))

    relationships = result.by_permid("5000000001")["currentCorporateRelationships"]
    name = relationships[0]["sources"][0]["name"]
    assert name == "SEC 10-K Exhibit 21", name


def run_debt_build(
    *,
    debt=None,
    mentions=None,
    items=None,
    expect_failure: bool = False,
):
    """Runs a build with a complete, self-consistent CDT dataset.

    `run_build` defaults the three CDT frames to empty so that cases about
    corporate structure need not describe debt. Debt cases want the opposite
    default, and want to replace one frame while the other two stay consistent
    with it -- an instrument whose mention is missing tests the citation guard,
    not whatever the case was about.
    """
    return run_build(
        company_rows({}),
        structure_rows({}),
        debt=cdt_rows({}) if debt is None else debt,
        mentions=cdt_mention_rows({}) if mentions is None else mentions,
        items=cdt_item_rows({}) if items is None else items,
        expect_failure=expect_failure,
    )


def debt_smoke_one_instrument() -> None:
    """One company, one instrument, three CDT files: the ordinary shape.

    Also pins the citation, which is the reason CDT needs three files at all --
    `debt-instruments` carries no url, date, or accession, so a broken join shows
    up here as a missing source rather than as a wrong number.
    """
    result = run_debt_build()

    debt = result.by_permid("5000000001")["currentCommercialDebt"]
    assert len(debt) == 1, f"expected 1 instrument, got {len(debt)}"
    instrument = debt[0]
    assert instrument["instrumentName"] == "revolving credit facility", instrument
    assert instrument["status"] == "Undated", instrument["status"]
    assert instrument["asOf"] == "2016-01-04", instrument["asOf"]
    assert instrument["amount"] == 10000000, instrument["amount"]
    assert isinstance(instrument["amount"], int), type(instrument["amount"])
    assert instrument["currency"] == "USD", instrument["currency"]

    assert len(instrument["sources"]) == 1, instrument["sources"]
    source = instrument["sources"][0]
    assert source["name"] == "SEC 8-K Item 1.01", source["name"]
    assert source["url"] == CDT_URL, source["url"]
    assert source["url"].endswith(".txt"), "citation must be the filing, not a transform"
    # lastAccessed is when the pipeline ran, not when the 8-K was filed. Nothing
    # in the three CDT files records a retrieval date; asOf carries the filing.
    assert source["lastAccessed"] != source["name"], source
    assert source["lastAccessed"] > "2026-01-01", source["lastAccessed"]
    assert source["lastAccessed"] != instrument["asOf"], (
        "lastAccessed must not be the filing date"
    )


def debt_unmatched_cik_fails_the_build() -> None:
    """A CDT dataset that joins to no company must fail, not render empty.

    The production `cik` column is unpadded and company-info's is zero-padded to
    ten, so the unnormalized join matches zero of 228 CIKs -- silently, and
    indistinguishably from "the processor has no data for these companies".
    """
    result = run_debt_build(
        debt=cdt_rows({"cik": "9999999"}),
        mentions=cdt_mention_rows({"cik": "9999999"}),
        items=cdt_item_rows({"cik": "9999999"}),
        expect_failure=True,
    )
    assert result.records == [], "build should not have produced records"


def debt_unresolvable_document_fails_the_build() -> None:
    """An instrument whose 8-K cannot be found must fail the build.

    Every fact rendered on a company page carries a citation, so an instrument
    that cannot cite its filing is not a row to drop quietly -- it means the three
    CDT files are from different processor runs.
    """
    result = run_debt_build(
        items=cdt_item_rows({"item_id": "some-other-item"}),
        expect_failure=True,
    )
    assert result.records == [], "build should not have produced records"


def debt_matured_instrument_is_excluded() -> None:
    """An instrument whose end date has passed does not reach the frontend."""
    result = run_debt_build(
        debt=cdt_rows({"end_date": "2017-06-30"}),
    )
    debt = result.by_permid("5000000001")["currentCommercialDebt"]
    assert debt == [], f"matured instrument should have been excluded, got {debt}"


def debt_future_instrument_is_active() -> None:
    """An instrument whose end date is in the future is Active.

    The end date is computed rather than hardcoded: any literal future date in a
    fixture eventually becomes a past date and turns this case into a silent
    duplicate of the matured one.
    """
    future = (datetime.date.today() + datetime.timedelta(days=365)).isoformat()
    result = run_debt_build(
        debt=cdt_rows({"end_date": future}),
    )
    debt = result.by_permid("5000000001")["currentCommercialDebt"]
    assert len(debt) == 1, f"expected 1 instrument, got {len(debt)}"
    assert debt[0]["status"] == "Active", debt[0]["status"]
    assert debt[0]["endDate"] == future, debt[0]["endDate"]


def debt_unparseable_end_date_is_undated() -> None:
    """An end date that will not parse is Undated, not silently matured.

    Coercion turns both a blank and a garbage date into NaT, and treating NaT as
    "expired" would drop the instrument on the strength of a parse failure.
    """
    result = run_debt_build(
        debt=cdt_rows({"end_date": "as soon as practicable"}),
    )
    debt = result.by_permid("5000000001")["currentCommercialDebt"]
    assert len(debt) == 1, f"expected 1 instrument, got {len(debt)}"
    assert debt[0]["status"] == "Undated", debt[0]["status"]
    assert debt[0]["endDate"] is None, debt[0]["endDate"]


def debt_superseded_instrument_is_excluded() -> None:
    """An amended instrument drops out and its replacement stays.

    Lineage points from the newer instrument back at the older one, so the row
    naming a predecessor is the survivor -- the reverse of what the column name
    reads like.
    """
    original = "dim::fixture000000000000000001"
    replacement = "dim::fixture000000000000000002"
    result = run_debt_build(
        debt=cdt_rows(
            {},
            {
                "debt_instrument_id": replacement,
                "seed_debt_instrument_mention_id": replacement,
                "amendment_of_debt_instrument_id": original,
                "name": "amended revolving credit facility",
            },
        ),
        mentions=cdt_mention_rows(
            {},
            {"debt_instrument_mention_id": replacement},
        ),
    )
    debt = result.by_permid("5000000001")["currentCommercialDebt"]
    names = [i["instrumentName"] for i in debt]
    assert names == ["amended revolving credit facility"], (
        f"expected only the replacement to survive, got {names}"
    )


def debt_generic_lender_labels_survive() -> None:
    """Role words reach the frontend as lender labels, on purpose.

    A filing that names no counterparty says "the lenders party thereto", and the
    extraction records that phrase. Filtering it here is the first step of the
    lender-normalization work, which is deliberately not done yet -- so this case
    fails if someone adds a stopword set without also revisiting that decision.
    """
    result = run_debt_build(
        debt=cdt_rows(
            {
                "lenders_json": (
                    '[{"mentions": [{"char_end": 21, "char_start": 0,'
                    ' "tag_id": "tag-1", "text": "lenders party thereto",'
                    ' "type": "organization"}], "tag_ids": ["tag-1"]}]'
                )
            }
        ),
    )
    debt = result.by_permid("5000000001")["currentCommercialDebt"]
    assert len(debt) == 1, f"expected 1 instrument, got {len(debt)}"
    assert debt[0]["lenders"] == ["lenders party thereto"], debt[0]["lenders"]


def debt_currency_comes_from_the_mentions_file() -> None:
    """A non-USD amount keeps its own code and is not converted.

    `debt-instruments.amount` is a bare number; the currency lives only in
    `mentions.amount_json`, which is why the mentions join carries more than
    provenance. No CDT output supplies an FX rate, so nothing is converted.
    """
    result = run_debt_build(
        debt=cdt_rows({"amount": "500000000"}),
        mentions=cdt_mention_rows(
            {"amount_json": '{"currency": "EUR", "mentions": []}'}
        ),
    )
    instrument = result.by_permid("5000000001")["currentCommercialDebt"][0]
    assert instrument["currency"] == "EUR", instrument["currency"]
    assert instrument["amount"] == 500000000, instrument["amount"]


def debt_duplicate_items_do_not_multiply_instruments() -> None:
    """Co-registrant rows in `items` must not duplicate an instrument.

    Production `items` carries 803 duplicate `item_id`s differing only in
    `company_name`, because each co-registrant on one 8-K gets a row. Joining
    without de-duplicating turns 1,640 instruments into 1,861.
    """
    result = run_debt_build(
        items=cdt_item_rows({}, {"company_name": "CO-REGISTRANT CO"}),
    )
    debt = result.by_permid("5000000001")["currentCommercialDebt"]
    assert len(debt) == 1, f"duplicate items multiplied the instrument: {len(debt)}"


def debt_undated_document_fails_the_build() -> None:
    """An instrument whose 8-K has no filing date must fail the build.

    `asOf` comes from `items.date` and `SnapshotEntity` types it a `string`. The
    frontend does not treat it as optional either: `sortDebt` calls
    `localeCompare` on it, so a null crashes the prerender of every page carrying
    the instrument instead of leaving a cell blank. The url-only guard used to let
    this through -- the row cites its filing perfectly well and simply has no date.
    """
    result = run_debt_build(
        items=cdt_item_rows({"date": None}),
        expect_failure=True,
    )
    assert result.records == [], "build should not have produced records"


def debt_unparseable_document_date_fails_the_build() -> None:
    """A date that will not parse fails the same way a missing one does.

    `parse_iso_date` returns `None` for both, so both reach the frontend as
    `asOf: null`. The guard runs `parse_iso_date` itself rather than testing for
    emptiness, which is what makes these one case rather than two behaviours.
    """
    result = run_debt_build(
        items=cdt_item_rows({"date": "not a date"}),
        expect_failure=True,
    )
    assert result.records == [], "build should not have produced records"


def debt_unrenderable_instrument_does_not_fail_the_build() -> None:
    """An uncitable instrument that renders nowhere warns instead of failing.

    An instrument whose CIK company-info has not resolved to a PermID appears on
    no page -- 14 do today, across 9 CIKs, and that bucket grows whenever CDT
    covers a company the PermID mapping does not. Failing the whole build over a
    row no reader can reach trades the site for a rule about invisible data.

    Two instruments, because one unmatched CIK on its own is the padding bug the
    join guard exists to catch: the first is ordinary and keeps the join honest,
    the second names a CIK no company holds and resolves no document at all. The
    build must produce the first and say something about the second.
    """
    result = run_debt_build(
        debt=cdt_rows(
            {},
            {
                "debt_instrument_id": "orphan-1",
                "cik": "9999999",
                "seed_debt_instrument_mention_id": "no-such-mention",
            },
        ),
    )

    debt = result.by_permid("5000000001")["currentCommercialDebt"]
    assert len(debt) == 1, f"expected the renderable instrument only, got {len(debt)}"
    assert debt[0]["asOf"] == "2016-01-04", debt[0]["asOf"]

    matches = result.warnings_matching("none of them renders", "orphan-1")
    assert matches, f"expected a warning naming the skipped instrument, got {result.warnings()}"


def debt_every_rendered_instrument_carries_a_date() -> None:
    """`asOf` is a string on every emitted instrument, never null.

    The guard exists to make that true, so this asserts the property rather than
    the guard -- a future change that drops a row instead of failing, or defaults
    the date, has to keep this passing.
    """
    result = run_debt_build()
    for record in result.records:
        for instrument in record["currentCommercialDebt"]:
            assert isinstance(instrument["asOf"], str), instrument
            assert instrument["asOf"], instrument


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
    structure_nameless_subsidiary_is_dropped,
    structure_all_nameless_leaves_an_empty_tree,
    structure_missing_filing_date_fails_the_build,
    structure_missing_exhibit_url_fails_the_build,
    structure_20f_cites_exhibit_8_and_is_not_filtered,
    structure_citation_matches_production_exactly,
    debt_smoke_one_instrument,
    debt_unmatched_cik_fails_the_build,
    debt_unresolvable_document_fails_the_build,
    debt_matured_instrument_is_excluded,
    debt_future_instrument_is_active,
    debt_unparseable_end_date_is_undated,
    debt_superseded_instrument_is_excluded,
    debt_generic_lender_labels_survive,
    debt_currency_comes_from_the_mentions_file,
    debt_duplicate_items_do_not_multiply_instruments,
    debt_undated_document_fails_the_build,
    debt_unparseable_document_date_fails_the_build,
    debt_unrenderable_instrument_does_not_fail_the_build,
    debt_every_rendered_instrument_carries_a_date,
]
