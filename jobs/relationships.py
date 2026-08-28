"""Corporate-structure attach: resolves Exhibit-21 subsidiary filings to parent/child relationships on the built company records."""

# Standard library imports
import logging
from collections import Counter

# Third-party imports
import pandas as pd

# Local imports
from constants import (
    CIK_WIDTH,
    RELATIONSHIP_TYPE,
)
from helpers import (
    _clean,
    parse_iso_date,
)
from io_utils import normalize_cik


def select_latest_filings(structure_df: pd.DataFrame) -> pd.DataFrame:
    """Reduces the corporate-structure dataset to one filing per company.

    `latest.parquet` is a full historical record, and most registrants appear
    with more than one filing date. Rows from two filings merged together would
    describe a corporate structure that no single document supports, so only the
    most recent filing per CIK survives.

    Same-day ties are not amendments. All three CIKs that carry more than one
    accession on their latest `filing_date` are delinquent registrants that
    caught up by filing several years of 10-Ks at once, so the tie is between
    fiscal periods and `report_date` decides it. Accession number cannot: it
    orders by filer agent and submission sequence, not by period. DOC DR, LLC
    (CIK 1583994) filed its FY2014 and FY2016 10-Ks on 2017-02-24 through
    different agents, and the higher accession is the FY2014 one — 94 disclosed
    subsidiaries where FY2016 has 261. Accession number stays as the final
    tie-break so the output is still stable across runs when two filings share
    both dates.

    `filing_date` remains the primary sort rather than `report_date`, so "most
    recent filing" keeps meaning what it says and matches the date rendered to
    users. That distinction only bites for a late-filed 10-K covering an older
    period than an on-time earlier filing, which no CIK in the dataset does.

    Rows where the registrant lists itself are dropped: that is the tree's root,
    not one of its own subsidiaries.

    Args:
        structure_df: The corporate-structure dataset, with a normalized `cik`.

    Returns:
        The subset of rows belonging to each company's most recent filing.
    """
    latest = structure_df
    for column in ("filing_date", "report_date", "accession_number"):
        # Blanks lose to any real value in the same group — seven 20FR12B rows
        # carry an empty `report_date`. Nulls are filled first because NaN does
        # not equal itself, so a group of all-null values would match no row and
        # silently cost that CIK its whole tree instead of falling through to
        # the next tie-break.
        values = latest[column].fillna("")
        winner = values.groupby(latest["cik"]).transform("max")
        latest = latest[values == winner]

    self_listed = (
        latest["name"].str.strip().str.casefold()
        == latest["parent_name"].str.strip().str.casefold()
    )
    return latest[~self_listed]


def build_source_name(form_type: str | None, exhibit_type: str | None) -> str:
    """Names the citation after the filing it came from.

    Exhibit 21 is the 10-K's subsidiary list; the 20-F carries the same
    disclosure as Exhibit 8. Reading both off the row keeps a 20-F from being
    miscited as a 10-K.

    Args:
        form_type: The SEC form type, e.g. `"10-K"`.
        exhibit_type: The exhibit number, e.g. `"21"`.

    Returns:
        A source name such as `"SEC 10-K Exhibit 21"`.
    """
    form = form_type or "filing"
    if not exhibit_type:
        return f"SEC {form}"
    return f"SEC {form} Exhibit {exhibit_type}"


def build_relationship(row: pd.Series, company: dict) -> dict:
    """Builds one CurrentCorporateRelationship from a disclosed subsidiary.

    The parent's name comes from the `Company` record rather than the dataset's
    own `parent_name` column: company-info is the source for company identity,
    and taking the name from two places invites them to disagree.

    The child carries no `permId`. Exhibit 21 gives a name and a jurisdiction,
    never an identifier, and resolving names to PermIDs is a fuzzy-matching
    problem that belongs upstream rather than in a display join.

    Args:
        row: One subsidiary row from the corporate-structure dataset.
        company: The parent's `Company` record.

    Returns:
        A dict matching the serialized `CurrentCorporateRelationship` type in
        `web/src/types/domain.ts`.
    """
    relationship = {
        # CitedEntity
        "sources": [
            {
                "name": build_source_name(
                    _clean(row["form_type"]), _clean(row["exhibit_type"])
                ),
                "url": _clean(row["exhibit_url"]),
                "lastAccessed": parse_iso_date(row["date_added"]),
            }
        ],
        # SnapshotEntity — the date the relationship was disclosed, which is not
        # the date it began. Do not reuse this as a `from`.
        "asOf": parse_iso_date(row["filing_date"]),
        "parent": {"name": company["name"], "permId": company["permId"]},
        "child": {"name": _clean(row["name"]), "permId": None},
        "relationshipType": RELATIONSHIP_TYPE,
        "ownershipPercent": None,
        "childJurisdiction": _clean(row["location"]),
        # Which of the company's registrants disclosed this. A multi-registrant
        # company renders one flat tree, so without this the rows lose track of
        # who said what.
        "disclosedByCik": _clean(row["cik"]),
    }

    # `url`, `lastAccessed` and `asOf` are required strings in the serialized
    # type (domain.ts), but `_clean`/`parse_iso_date` return None on a blank or
    # unparseable cell -- which ships as JSON null and renders as literal "null"
    # in the tree's citation. Nothing downstream catches it: `validate_companies`
    # runs before relationships are attached. Fail here, the way the CIK join
    # does, rather than emit a citation the UI cannot show. (`child.name` is
    # handled by the caller, which drops nameless subsidiaries outright.)
    source = relationship["sources"][0]
    missing = [
        field
        for field, value in (
            ("asOf", relationship["asOf"]),
            ("sources[0].url", source["url"]),
            ("sources[0].lastAccessed", source["lastAccessed"]),
        )
        if value is None
    ]
    if missing:
        raise RuntimeError(
            f"Corporate-structure row disclosed by CIK {relationship['disclosedByCik']} "
            f"(accession {_clean(row['accession_number'])}) is missing required "
            f"field(s): {', '.join(missing)}."
        )
    return relationship


def attach_relationships(
    companies: list[dict],
    structure_df: pd.DataFrame,
    logger: logging.Logger,
) -> None:
    """Attaches disclosed subsidiaries to the companies they belong to.

    Mutates `companies` in place, filling `currentCorporateRelationships`.

    Args:
        companies: `Company` records, each carrying a `registrants` list.
        structure_df: The raw corporate-structure dataset.
        logger: A standard logger instance.

    Raises:
        `RuntimeError` if the CIK join matches no companies at all.
    """
    structure = structure_df.copy()
    structure["cik"] = normalize_cik(structure["parent_cik"])
    latest = select_latest_filings(structure)

    by_cik = {cik: group for cik, group in latest.groupby("cik", sort=False)}

    no_registrants = sum(1 for company in companies if not company["registrants"])
    if no_registrants:
        logger.info(
            "%d companies have no CIK at all and cannot be joined to a "
            "corporate structure.",
            no_registrants,
        )

    matched = 0
    multi_registrant = 0
    dropped_to_accession_collapse = 0
    dropped_to_missing_name = 0
    duplicate_names_across_accessions = 0

    for company in companies:
        groups = [
            by_cik[registrant["cik"]]
            for registrant in company["registrants"]
            if registrant["cik"] in by_cik
        ]
        if not groups:
            continue
        # Counted the moment the CIK join finds rows, not once a tree is built,
        # so dropping every row below for a blank name leaves an empty tree
        # rather than tripping the zero-match guard as if the join had failed.
        matched += 1
        if len(groups) > 1:
            multi_registrant += 1

        rows = pd.concat(groups)
        primary = company["cik"]

        # Co-registrants on a combined filing are each attributed the same
        # exhibit, so a naive union multiplies rows -- AEP's six CIKs carry the
        # same 22 names for 132 rows. Worse, the extractions are not identical:
        # on 68 of the 203 shared accessions the processor reports different row
        # counts per CIK (Brixmor reads 619 under one CIK and 633 under the
        # other from one `exhibit_url`). These are LLM parses of a single
        # document with no basis for judging which is more faithful, so take one
        # whole copy rather than merging -- a merge yields a list neither parse
        # produced.
        kept = []
        for _, block in rows.groupby("accession_number", sort=False):
            present = sorted(block["cik"].unique())
            chosen = primary if primary in present else present[0]
            copy = block[block["cik"] == chosen]
            dropped_to_accession_collapse += len(block) - len(copy)
            kept.append(copy)

        surviving = pd.concat(kept)

        # A subsidiary with no name is not renderable: `child.name` is a required
        # string, so a blank ships as JSON null and draws an empty row in the
        # tree. Drop it here, counted, rather than emit a nameless entity.
        named = surviving[surviving["name"].map(_clean).notna()]
        dropped_to_missing_name += len(surviving) - len(named)
        surviving = named
        if surviving.empty:
            continue

        # Surviving accessions are concatenated as-is: two registrants who filed
        # separately both contribute in full, so a subsidiary named in both
        # appears twice. Deduping that is deferred until a real multi-CIK
        # company exists to reason against -- name alone over-merges genuinely
        # distinct subsidiaries, and (name, jurisdiction) splits one subsidiary
        # in two wherever a parse left the jurisdiction blank. Counting them is
        # the evidence that decision needs.
        if surviving["accession_number"].nunique() > 1:
            names = [
                text
                for text in (_clean(value) for value in surviving["name"])
                if text
            ]
            folded = Counter(name.casefold() for name in names)
            duplicate_names_across_accessions += sum(
                count - 1 for count in folded.values() if count > 1
            )

        company["currentCorporateRelationships"] = [
            build_relationship(row, company)
            for _, row in surviving.sort_values("name").iterrows()
        ]

    # Both sides must be zero-padded or the join silently matches nothing,
    # leaving every company page with an empty Corporate Tree and no error. That
    # is a data-integrity failure that looks exactly like "the processor has no
    # data yet", so it fails the build instead.
    if not matched:
        raise RuntimeError(
            "The corporate-structure CIK join matched no companies. Sample "
            f"parent_cik: {structure['cik'].iloc[0] if len(structure) else 'n/a'}; "
            f"sample company CIK: {companies[0]['cik'] if companies else 'n/a'}. "
            f"Both must be zero-padded to {CIK_WIDTH} digits."
        )

    total = sum(len(c["currentCorporateRelationships"]) for c in companies)
    logger.info(
        "Attached %d subsidiaries to %d of %d companies; %d have no disclosed "
        "corporate structure.",
        total,
        matched,
        len(companies),
        len(companies) - matched,
    )
    # Reported unconditionally so the collapse is visible rather than assumed --
    # a silent 0 is itself the useful signal that no company is multi-registrant
    # yet.
    logger.info(
        "%d companies joined more than one registrant; the accession collapse "
        "dropped %d duplicate rows; %d subsidiary rows dropped for a missing "
        "name; %d duplicate child names survive across separate accessions (not "
        "deduped -- see the join contract in jobs/README.md).",
        multi_registrant,
        dropped_to_accession_collapse,
        dropped_to_missing_name,
        duplicate_names_across_accessions,
    )
