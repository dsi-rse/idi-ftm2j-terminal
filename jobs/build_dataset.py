# Standard library imports
import json
import logging
import os
from collections import Counter
from pathlib import Path

# Third-party imports
import pandas as pd

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

SOURCE_NAME = "LSEG PermID"

# SEC CIKs are canonically zero-padded to 10 digits, which is how company-info
# reports them. The corporate-structure dataset reports them unpadded, so both
# sides are normalized to this width before joining. Skipping this matches zero
# rows -- see `attach_relationships`.
CIK_WIDTH = 10

# Exhibit 21 lists "Subsidiaries of the Registrant"; the 20-F equivalent is
# "List of Subsidiaries". Neither reports an ownership percentage or a
# relationship start date, so every emitted relationship is a plain subsidiary
# with a null percent.
RELATIONSHIP_TYPE = "Subsidiary"

# LSEG's TRBC taxonomy is label-first and supplies no numeric code, unlike SIC
# and NAICS. The `Sector.code` field is deliberately empty for these.
SECTOR_SYSTEM = "TRBC"
SECTOR_CODE = ""

# US states and DC, used to reject an address that was truncated before its
# country line. LSEG formats addresses street / city / STATE / ZIP / country, so
# a truncated one ends on the ZIP (caught by the digit test) or on the state.
#
# Deliberately a closed set of states rather than an open one of countries.
# States are finite and stable; the set of countries LSEG can emit is neither,
# and an allowlist of them silently replaces any country it has not been told
# about. Territories LSEG reports as countries in their own right -- Puerto
# Rico, U.S. Virgin Islands, Guam -- are absent on purpose: they are legitimate
# values for this field and must pass through.
US_STATES: frozenset[str] = frozenset(
    state.casefold()
    for state in {
        "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado",
        "Connecticut", "Delaware", "District of Columbia", "Florida", "Georgia",
        "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky",
        "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan",
        "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada",
        "New Hampshire", "New Jersey", "New Mexico", "New York",
        "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon",
        "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota",
        "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington",
        "West Virginia", "Wisconsin", "Wyoming",
    }
)

# MIC placeholder meaning "no exchange reported". It does NOT mean the company
# is unlisted: every row carrying it has a real `exchange_code`, so it must
# fall through to that rather than being treated as missing.
UNKNOWN_MIC = "XXXX"

# Value of `identifier_type` marking a row whose `identifier` holds a CIK.
IDENTIFIER_TYPE_CIK = "cik"

# Company-level columns, all read off one winning row. Rows sharing an
# (input_source, last_processed) partition were built from a single
# `permid_data.json`, so these must agree inside a partition -- see
# `warn_on_snapshot_divergence`.
#
# Deliberately excluded: `identifier`, `entity_name` and `standard_identifier`
# are per-CIK and are *supposed* to differ; `ticker` is excluded because one
# snapshot can legitimately report several for a genuinely multi-ticker company.
SCALAR_COMPANY_FIELDS: tuple[str, ...] = (
    "permid_url",
    "investor_name",
    "lei",
    "founded_date",
    "hq_address",
    "incorporated_in",
    "domiciled_in",
    "url",
    "exchange",
    "exchange_code",
    "primary_industry_group_label",
    "primary_economic_sector_label",
    "primary_business_sector_label",
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _clean(value: object) -> str | None:
    """Normalizes a parquet cell to a non-empty string or None.

    Args:
        value: A raw cell value.

    Returns:
        The stripped string, or `None` if the value was null or blank.
    """
    if value is None or pd.isna(value):
        return None
    text = str(value).strip()
    return text or None


def parse_last_processed_timestamp(value: object) -> pd.Timestamp:
    """Parses LSEG's `last_processed` stamp to a comparable timestamp.

    Used for ordering snapshots, which needs the time component that
    `parse_last_processed` drops. The compact basic ISO form
    ("20260801T033040") happens to string-sort correctly, but the upstream
    format is unsettled, so it is parsed rather than compared as text.

    Args:
        value: A raw `last_processed` cell.

    Returns:
        A `pd.Timestamp`, or `pd.NaT` if it could not be parsed.
    """
    text = _clean(value)
    if not text:
        return pd.NaT
    parsed = pd.to_datetime(text, format="%Y%m%dT%H%M%S", errors="coerce")
    if pd.isna(parsed):
        parsed = pd.to_datetime(text, errors="coerce")
    return parsed


def parse_last_processed(value: object) -> str | None:
    """Converts LSEG's `last_processed` stamp to an ISO-8601 date.

    The upstream format is compact basic ISO (e.g. "20260801T033040"), which
    differs from the "YYYY-MM-DD" convention used elsewhere in the data spec.
    Parsed defensively because the upstream format is unsettled.

    Args:
        value: A raw `last_processed` cell.

    Returns:
        An ISO-8601 date string, or `None` if it could not be parsed.
    """
    parsed = parse_last_processed_timestamp(value)
    if pd.isna(parsed):
        return None
    return parsed.strftime("%Y-%m-%d")


def parse_iso_date(value: object) -> str | None:
    """Converts a timestamp to an ISO-8601 date, dropping the time component.

    Args:
        value: A raw cell holding a date or timestamp.

    Returns:
        An ISO-8601 date string, or `None` if it could not be parsed.
    """
    text = _clean(value)
    if not text:
        return None
    parsed = pd.to_datetime(text, errors="coerce", utc=True)
    if pd.isna(parsed):
        return None
    return parsed.strftime("%Y-%m-%d")


def parse_address_country(
    address: object,
    logger: logging.Logger,
) -> str | None:
    """Extracts the country of headquarters from a newline-delimited address.

    The country is the last non-empty line. Because that is positional parsing
    of free text, the candidate is screened for the ways a truncated address
    fails -- a postal code, a state, a bare code -- and rejected if it looks
    like one. Anything else is trusted as written.

    Screening, not matching. An earlier version validated against an allowlist
    of countries built from the then-known company universe, and when the
    universe grew it replaced every country it had not been told about with the
    company's country of incorporation: Chinese and Hong Kong companies were
    shown as headquartered in the Cayman Islands and the British Virgin Islands.
    That is the specific claim this project exists to contradict, asserted as
    sourced fact. An allowlist of an open set fails that way by construction, so
    the check now names what a country is *not*.

    There is no fallback. A failed parse returns None and the UI renders "Not
    reported", because substituting the country of incorporation answers a
    different question than the one the field asks.

    Args:
        address: The raw address block.
        logger: A standard logger instance.

    Returns:
        The country of headquarters, or `None` if the address does not state one.
    """
    text = _clean(address)
    if not text:
        return None

    lines = [line.strip() for line in text.splitlines() if line.strip()]
    if not lines:
        return None

    candidate = lines[-1]

    if any(character.isdigit() for character in candidate):
        reason = "looks like a postal code"
    elif len(candidate) <= 2:
        reason = "too short to be a country name"
    elif candidate.casefold() in US_STATES:
        reason = "is a US state, so the address stops before its country"
    else:
        return candidate

    logger.warning(
        'Address does not end in a country (%s): "%s". Leaving the HQ country '
        "unset rather than guessing.",
        reason,
        candidate,
    )
    return None


def build_sources(permid_url: str | None, last_accessed: str | None) -> list[dict]:
    """Builds the provenance list for a company's LSEG-derived facts.

    The citation is the PermID record URL, not the company's own website: the
    PermID page is where these facts came from, and unlike the website it is
    populated for every row. The company's website is a fact *about* the
    company, carried separately on `Company.website`.

    Args:
        permid_url: The company's PermID record URL.
        last_accessed: ISO-8601 date the record was last processed.

    Returns:
        A list holding one source, or an empty list if there is no URL.
    """
    if not permid_url or not last_accessed:
        return []
    return [
        {
            "name": SOURCE_NAME,
            "url": permid_url,
            "lastAccessed": last_accessed,
        }
    ]


def build_sector(
    label: str | None, sources: list[dict], as_of: str | None
) -> dict | None:
    """Builds a CurrentSector from a TRBC label.

    Args:
        label: The TRBC classification label.
        sources: Provenance for the classification.
        as_of: ISO-8601 date the classification was observed.

    Returns:
        A CurrentSector dict, or `None` if there is no label.
    """
    if not label or not as_of:
        return None
    return {
        "sources": sources,
        "asOf": as_of,
        "name": label,
        "code": SECTOR_CODE,
        "system": SECTOR_SYSTEM,
    }


def build_listing(
    tickers: list[str],
    mic: str | None,
    exchange_code: str | None,
    sources: list[dict],
    as_of: str | None,
) -> dict | None:
    """Builds a CurrentListing from ticker and exchange columns.

    `XXXX` in the MIC column means "no exchange reported" and is normalized to
    `None`; the proprietary `exchange_code` remains available as a display
    fallback, so a company with an unknown MIC is not treated as unlisted.

    Args:
        tickers: Tickers associated with the company.
        mic: ISO 10383 MIC for the listing exchange.
        exchange_code: Source-proprietary exchange code.
        sources: Provenance for the listing.
        as_of: ISO-8601 date the listing was observed.

    Returns:
        A CurrentListing dict, or `None` if nothing is known.
    """
    normalized_mic = None if mic == UNKNOWN_MIC else mic
    if not tickers and not normalized_mic and not exchange_code:
        return None
    if not as_of:
        return None
    return {
        "sources": sources,
        "asOf": as_of,
        "ticker": tickers[0] if tickers else None,
        "exchangeMic": normalized_mic,
        "exchangeCode": exchange_code,
    }


def _collect(series: pd.Series) -> list[str]:
    """Collects a grouped column's non-null values, de-duplicated in order."""
    seen: dict[str, None] = {}
    for value in series:
        text = _clean(value)
        if text:
            seen.setdefault(text, None)
    return list(seen)


def cik_rows(identifier_types: pd.Series) -> pd.Series:
    """Boolean mask selecting the rows whose `identifier` holds a CIK.

    Matched case- and whitespace-insensitively: a mismatch here yields no CIK
    at all rather than an error, so it would be invisible if upstream ever
    changed the casing of this column.

    Args:
        identifier_types: The `identifier_type` column of a group of rows.

    Returns:
        A boolean mask aligned to `identifier_types`.
    """
    return identifier_types.str.strip().str.casefold() == IDENTIFIER_TYPE_CIK


# ---------------------------------------------------------------------------
# Load
# ---------------------------------------------------------------------------


def load_parquet(fpath: str | Path, label: str) -> pd.DataFrame:
    """Loads one processor's `latest.parquet` into a DataFrame.

    Args:
        fpath: Path to the parquet file.
        label: Human-readable dataset name, used in error messages.

    Returns:
        The dataset as a Pandas DataFrame.

    Raises:
        `RuntimeError` if the path is not a single parquet file, or cannot be
            read as one.
    """
    path = Path(fpath)
    # Insist on a file. Pointed at a directory, pyarrow reads it as a dataset
    # and schema-unions everything underneath — so a misconfigured path silently
    # merges unrelated processors' outputs into one table instead of failing.
    # That is a data-integrity bug, not a config error, and it is invisible in
    # the logs.
    if path.is_dir():
        raise RuntimeError(
            f"Expected a parquet file for {label} but got a directory: {path}. "
            "Check that the input path includes the file name — reading a "
            "directory would merge every dataset beneath it."
        )
    if not path.exists():
        raise RuntimeError(f"The {label} parquet file was not found at: {path}")

    try:
        return pd.read_parquet(path)
    except FileNotFoundError as e:
        raise RuntimeError(
            f"The {label} parquet file was not found at the given path."
        ) from e
    except (OSError, ValueError) as e:
        raise RuntimeError(
            f"The {label} file could not be read as a parquet dataset."
        ) from e


def normalize_cik(values: pd.Series) -> pd.Series:
    """Normalizes a CIK column to the canonical zero-padded 10-digit form.

    Args:
        values: A column of CIKs, padded or not.

    Returns:
        The column as zero-padded strings.
    """
    return values.astype(str).str.strip().str.zfill(CIK_WIDTH)


# ---------------------------------------------------------------------------
# Transform
# ---------------------------------------------------------------------------


def select_primary_cik(ciks: list[str]) -> str | None:
    """Chooses the primary CIK for a company.

    STUB, pending the company-facts processor. Lowest CIK is deterministic --
    CIKs are zero-padded, so string order is numeric order -- but it is
    demonstrably wrong for some registrant groups: it picks Entergy Arkansas
    over Entergy Corp, and NSTAR Electric over Eversource Energy.

    TODO: replace once company-facts lands. The replacement is the
    accession-number prefix, which is the transmitting CIK. Across the 203
    co-registrant accessions in corporate-structure it is one of the group's
    own CIKs 140 times (69%), correctly naming the parent -- including the two
    groups this stub gets wrong. The other 31% are agent-filed, where the
    prefix belongs to the filing agent (mostly 0001047469, Toppan Merrill), so
    it needs a guard: use the prefix only when it matches one of `ciks`.
    Lowest CIK stays the terminal fallback, both for the agent-filed 31% and
    for companies with no filing at all.

    Do NOT reach for the SEC's <FILER> ordering. It looks like an exact
    answer -- one block per co-registrant, apparently parent first, and it
    holds for Huntsman, AEP and Brixmor -- but across 25 self-filed
    co-registrant accessions the first block matches the transmitting CIK only
    18 times (72%), and where it disagrees the real parent sits at position 2,
    3, or 7 of 7 (Southern Co). The ordering is arbitrary, not hierarchical.

    Args:
        ciks: Every CIK rolling up to one PermID.

    Returns:
        The primary CIK, or `None` if the company has no CIK at all.
    """
    return min(ciks) if ciks else None


def build_registrants(
    group: pd.DataFrame, ciks: list[str], primary: str | None, company_as_of: str | None
) -> list[dict]:
    """Builds one Registrant per CIK rolling up to this PermID.

    Each registrant is read off its own CIK's most recent row, so
    `registrantName` is the name last reported against that CIK rather than the
    PermID's name -- "Brixmor Operating Partnership LP" against a company named
    "Brixmor Property Group Inc."

    Args:
        group: All source rows for a single PermID.
        ciks: Every CIK for the PermID, already cleaned and de-duplicated.
        primary: The CIK to mark primary, from `select_primary_cik`.
        company_as_of: The company's observation date, used only as a floor when
            a CIK's own rows carry no parseable stamp.

    Returns:
        Registrant dicts, primary first then ascending by CIK.
    """
    identifiers = group["identifier"].map(_clean)
    is_cik = group["identifier_type"] == "cik"

    registrants = []
    for cik in ciks:
        rows = group[is_cik & (identifiers == cik)]
        newest = select_latest_snapshot(rows).iloc[0]
        # A CIK whose rows carry no parseable stamp still has to appear --
        # dropping a registrant over a missing date would lose the join key
        # that a whole section depends on.
        as_of = parse_last_processed(newest["last_processed"]) or company_as_of
        registrants.append(
            {
                "sources": build_sources(_clean(newest["permid_url"]), as_of),
                "asOf": as_of,
                "cik": cik,
                "registrantName": _clean(newest["entity_name"]),
                "isPrimary": cik == primary,
            }
        )

    registrants.sort(key=lambda r: (not r["isPrimary"], r["cik"]))
    return registrants


def select_latest_snapshot(group: pd.DataFrame) -> pd.DataFrame:
    """Reduces a PermID's rows to those of its most recent snapshot.

    A PermID gets one row per (source, entity, identifier) link, and rows
    multiply two ways. Several CIKs under one source all read the same
    `permid_data.json`, so every company field including `last_processed` is
    identical. One CIK under several sources was fetched once per source --
    caches are per-source -- so `last_processed` differs and the company fields
    can differ with it, if LSEG changed between runs.

    That second case is what makes `group.iloc[0]` wrong: it picks a snapshot by
    row order. Recency is the discriminator, tie-broken on `input_source` so the
    choice is stable across runs rather than dependent on parquet row order.

    Rows whose `last_processed` cannot be parsed sort as oldest, so any row with
    a real stamp beats them.

    Args:
        group: All source rows for a single PermID.

    Returns:
        The subset of `group` sharing the winning
        `(last_processed, input_source)` partition. Never empty.
    """
    order = pd.DataFrame(
        {
            "ts": group["last_processed"].map(parse_last_processed_timestamp),
            "src": group["input_source"].map(lambda v: _clean(v) or ""),
        },
        index=group.index,
    )
    ranked = order.sort_values(
        ["ts", "src"], ascending=[False, True], na_position="last"
    )
    win_ts = ranked["ts"].iloc[0]
    win_src = ranked["src"].iloc[0]

    if pd.isna(win_ts):
        matches = order["ts"].isna()
    else:
        matches = order["ts"] == win_ts
    return group[matches & (order["src"] == win_src)]


def warn_on_snapshot_divergence(
    group: pd.DataFrame, perm_id: str | None, logger: logging.Logger
) -> None:
    """Warns when rows of a single snapshot disagree on a company-level field.

    Rows sharing an `(input_source, last_processed)` partition were all built
    from one `permid_data.json`, so a disagreement between them should be
    impossible and means something upstream is wrong.

    Divergence *across* snapshots is expected -- that is exactly what
    `select_latest_snapshot` resolves -- and is deliberately not reported here.
    Warning on it would fire for every company reached by more than one source,
    which is noise rather than signal.

    Args:
        group: All source rows for a single PermID.
        perm_id: The PermID, named in the warning.
        logger: A standard logger instance.
    """
    for (source, stamp), partition in group.groupby(
        ["input_source", "last_processed"], dropna=False, sort=False
    ):
        if len(partition) < 2:
            continue
        for column in SCALAR_COMPANY_FIELDS:
            if column not in partition.columns:
                continue
            values = {_clean(value) for value in partition[column]}
            if len(values) > 1:
                logger.warning(
                    'PermID %s: field "%s" holds %d distinct values within one '
                    "snapshot (input_source=%s, last_processed=%s): %s. Rows of "
                    "one snapshot come from a single upstream record, so they "
                    "should agree; the most recent row still wins.",
                    perm_id,
                    column,
                    len(values),
                    source,
                    stamp,
                    ", ".join(repr(v) for v in sorted(values, key=str)),
                )


def transform_company(group: pd.DataFrame, logger: logging.Logger) -> dict:
    """Builds one Company record from all rows sharing a PermID.

    The grain of the source is one row per (identifier_type, identifier), so a
    PermID may carry several CIKs. Company-level fields are read off the most
    recent snapshot; identifiers are collected across every row.

    Args:
        group: All source rows for a single PermID.
        logger: A standard logger instance.

    Returns:
        A dict matching the serialized `Company` type in
        `web/src/types/domain.ts`.
    """
    perm_id = _clean(group.iloc[0]["permid_id"])
    warn_on_snapshot_divergence(group, perm_id, logger)

    latest = select_latest_snapshot(group)
    first = latest.iloc[0]

    as_of = parse_last_processed(first["last_processed"])
    sources = build_sources(_clean(first["permid_url"]), as_of)

    # Tickers come from the winning snapshot only. Collecting across the whole
    # group would surface both sides of a ticker change between runs, producing
    # a listing no single fetch ever reported. Within one snapshot `_collect`
    # still handles a genuinely multi-ticker company.
    tickers = _collect(latest["ticker"])

    # CIKs are the one field collected across ALL rows regardless of recency.
    # company-info is the record of every CIK that rolls up to a PermID, and
    # recency decides field *values*, not which registrants exist -- filtering
    # here would drop a CIK that arrived from a different source.
    ciks = _collect(group.loc[cik_rows(group["identifier_type"]), "identifier"])

    primary_cik = select_primary_cik(ciks)
    registrants = build_registrants(group, ciks, primary_cik, as_of)

    incorporated_country = _clean(first["incorporated_in"])
    hq_country = parse_address_country(first["hq_address"], logger)

    industry = build_sector(
        _clean(first["primary_industry_group_label"]), sources, as_of
    )
    broader = [
        sector
        for sector in (
            build_sector(
                _clean(first["primary_economic_sector_label"]), sources, as_of
            ),
            build_sector(
                _clean(first["primary_business_sector_label"]), sources, as_of
            ),
        )
        if sector
    ]

    return {
        # CitedEntity
        "sources": sources,
        # Stable identifiers
        "permId": perm_id,
        "cik": primary_cik,
        "registrants": registrants,
        "ein": None,
        "lei": _clean(first["lei"]),
        # Core identity
        "name": _clean(first["investor_name"]),
        "aliases": [],
        "description": "",
        "foundedOn": parse_iso_date(first["founded_date"]),
        "website": _clean(first["url"]),
        # Country of record
        "hqCountry": hq_country,
        "incorporatedCountry": incorporated_country,
        "domiciledCountry": _clean(first["domiciled_in"]),
        # Current state
        "currentIndustry": industry,
        "currentSectors": broader,
        "currentListing": build_listing(
            tickers,
            _clean(first["exchange"]),
            _clean(first["exchange_code"]),
            sources,
            as_of,
        ),
        # Filled by `attach_relationships` once the corporate-structure dataset
        # is joined; stays empty for companies with no disclosed subsidiaries.
        "currentCorporateRelationships": [],
        # History — empty until a source supplies real date ranges. Do not
        # populate these by inventing a `from` date.
        "historicNames": [],
        "historicLeadership": [],
        "historicSectors": [],
        "historicIncorporationAddresses": [],
        "historicDomicileAddresses": [],
        "historicCorporateRelationships": [],
        "historicCommercialDebt": [],
        "historicSecurities": [],
        "historicProjectAffiliations": [],
    }


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
    return {
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
    duplicate_names_across_accessions = 0

    for company in companies:
        groups = [
            by_cik[registrant["cik"]]
            for registrant in company["registrants"]
            if registrant["cik"] in by_cik
        ]
        if not groups:
            continue
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
        matched += 1

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
        "dropped %d duplicate rows; %d duplicate child names survive across "
        "separate accessions (not deduped -- see the join contract in "
        "jobs/README.md).",
        multi_registrant,
        dropped_to_accession_collapse,
        duplicate_names_across_accessions,
    )


def build_companies(companies_df: pd.DataFrame, logger: logging.Logger) -> list[dict]:
    """Transforms the company info dataset into Company records.

    Args:
        companies_df: The raw company info dataset.
        logger: A standard logger instance.

    Returns:
        Company records sorted by name, so the output is stable across runs.
    """
    companies = [
        transform_company(group, logger)
        for _, group in companies_df.groupby("permid_id", sort=True)
    ]
    companies.sort(key=lambda c: (c["name"] or "").casefold())
    return companies


# ---------------------------------------------------------------------------
# Validate
# ---------------------------------------------------------------------------


def report_unresolved_rows(companies_df: pd.DataFrame, logger: logging.Logger) -> None:
    """Reports source rows that cannot become a company record.

    `groupby` drops null keys, so a row with no `permid_id` produces no record
    and appears in no count -- `nunique()` excludes nulls too, so a plain
    row-vs-PermID tally reads as full coverage while nearly half the file is
    absent. These rows carry a `permid_url`, an `entity_name` and a CIK but no
    entity facts at all, so they are dropped rather than rejected: an
    unresolved lookup is a known upstream state, not a corrupt file.

    Args:
        companies_df: The raw company info dataset.
        logger: A standard logger instance.
    """
    unresolved = companies_df["permid_id"].isna() | (
        companies_df["permid_id"].astype(str).str.strip() == ""
    )
    if not unresolved.any():
        return

    by_source = companies_df.loc[unresolved, "input_source"].value_counts()
    logger.warning(
        "%d of %d rows have no permid_id and produce no company record (%s). "
        "The upstream processor resolved a permid_url for these but returned "
        "no entity facts.",
        int(unresolved.sum()),
        len(companies_df),
        ", ".join(f"{source}: {count}" for source, count in by_source.items()),
    )


def validate_companies(companies: list[dict]) -> None:
    """Fails the build if a record violates a non-nullable `Company` field.

    `web/src/app/companies/[id]/page.tsx` asserts the output JSON is
    `Company[]` without checking it, so a null `name` reaches the DOM as an
    empty heading and a null `permId` becomes a bogus static route segment.

    Checks the two fields a broken value breaks a page through. It is not a
    full schema check: `sources` is also declared non-nullable but an empty
    list satisfies the type and only costs a citation footer, so that stays a
    warning in `main`.

    Args:
        companies: The transformed company records.

    Raises:
        `RuntimeError` if any record has no `permId` or no `name`.
    """
    for field in ("permId", "name"):
        bad = [company["permId"] for company in companies if not company[field]]
        if bad:
            raise RuntimeError(
                f"{len(bad)} records have no {field}, which `Company.{field}` "
                f"declares non-nullable. First few PermIDs: {bad[:3]}"
            )


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def main(logger: logging.Logger) -> None:
    """Builds the company dataset consumed by the static web application.

    Reads `company-info/latest.parquet` and
    `corporate-structure/latest.parquet` and writes JSON records matching the
    serialized `Company` type in `web/src/types/domain.ts`.

    Environment variables:
        COMPANY_INFO_FILE_PATH: Path to the company info parquet file.
        CORPORATE_STRUCTURE_FILE_PATH: Path to the corporate structure parquet
            file.
        OUTPUT_FILE_PATH: Path to write the output JSON file.

    Args:
        logger: A standard logger instance.

    Raises:
        `RuntimeError` if a required environment variable is missing or if the
            input cannot be read.

    Returns:
        `None`
    """
    logger.info("Parsing environment variables.")
    try:
        company_info_fpath = os.environ["COMPANY_INFO_FILE_PATH"]
        corporate_structure_fpath = os.environ["CORPORATE_STRUCTURE_FILE_PATH"]
        output_fpath = os.environ["OUTPUT_FILE_PATH"]
    except KeyError as e:
        raise RuntimeError(f'Missing required environment variable "{e}".') from e

    logger.info("Loading company info dataset.")
    companies_df = load_parquet(company_info_fpath, "company info")
    logger.info(
        "Loaded %d rows carrying %d resolved PermIDs.",
        len(companies_df),
        companies_df["permid_id"].nunique(),
    )
    report_unresolved_rows(companies_df, logger)

    logger.info("Loading corporate structure dataset.")
    structure_df = load_parquet(corporate_structure_fpath, "corporate structure")
    logger.info(
        "Loaded %d rows covering %d registrants.",
        len(structure_df),
        structure_df["parent_cik"].nunique(),
    )

    logger.info("Transforming to Company records.")
    companies = build_companies(companies_df, logger)
    validate_companies(companies)

    logger.info("Attaching disclosed corporate structures.")
    attach_relationships(companies, structure_df, logger)

    with_ticker = sum(1 for c in companies if (c["currentListing"] or {}).get("ticker"))
    with_exchange = sum(
        1
        for c in companies
        if (c["currentListing"] or {}).get("exchangeMic")
        or (c["currentListing"] or {}).get("exchangeCode")
    )
    with_industry = sum(1 for c in companies if c["currentIndustry"])
    logger.info(
        "Built %d companies: %d with a ticker, %d with an exchange, "
        "%d with an industry.",
        len(companies),
        with_ticker,
        with_exchange,
        with_industry,
    )

    missing_sources = [c["permId"] for c in companies if not c["sources"]]
    if missing_sources:
        logger.warning(
            "%d companies have no source citation: %s",
            len(missing_sources),
            ", ".join(missing_sources[:10]),
        )

    logger.info("Writing dataset to output JSON file.")
    Path(output_fpath).parent.mkdir(parents=True, exist_ok=True)
    with open(output_fpath, "w", encoding="utf-8") as f:
        json.dump(companies, f, ensure_ascii=False, indent=2)

    logger.info("Pipeline completed successfully.")


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO, format="%(name)s - %(levelname)s - %(message)s"
    )
    logger = logging.getLogger("BUILD DATASET")
    try:
        main(logger)
    except Exception as e:
        logger.error(f"An unexpected error occured: {e}.")
        exit(1)
