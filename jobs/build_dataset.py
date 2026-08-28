# Standard library imports
import datetime
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

# Value of `identifier_type` marking a row whose `identifier` holds a CUSIP.
# These rows are how a shareholding's issuer resolves to a PermID: the
# shareholder-tracker output carries no issuer PermID, only the security's
# CUSIP, and company-info is where that CUSIP was resolved -- see
# `attach_shareholders`.
IDENTIFIER_TYPE_CUSIP = "cusip"

# The shareholder-tracker blends SEC 13-F filings (institutional investors) with
# European pension-fund reports. The 13-F rows all carry the same generic
# `source` ("U.S. SECURITIES AND EXCHANGE COMMISSION (SEC)"), so the citation
# name is fixed rather than read from the row; pension rows carry the fund's own
# name in `source`, which is the better citation.
SHAREHOLDER_INVESTOR_TYPE_INSTITUTIONAL = "INSTITUTIONAL INVESTOR"
SHAREHOLDER_SOURCE_NAME_13F = "SEC Form 13-F"
SHAREHOLDER_SOURCE_NAME_FALLBACK = "Shareholder disclosure"

# CDT extracts debt instruments from 8-K material-event filings. 6-Ks are named
# in the spec as a future source and are not in the data yet.
CDT_FORM_TYPE = "8-K"

# An instrument whose end date is in the future is Active; one whose filing
# stated no end date is Undated. There is deliberately no matured or superseded
# variant -- those are filtered out here and never reach the frontend, so the
# type in `web/src/types/domain.ts` has two members rather than four.
DEBT_STATUS_ACTIVE = "Active"
DEBT_STATUS_UNDATED = "Undated"

# The three columns of `items` that a citation needs, plus the join key. The file
# is 26.5 MB of which its unread `text` column -- the full 8-K section body the
# extraction ran over -- is the bulk, and only ~1,900 of its ~26,000 rows are
# ever joined, so it is read narrow.
#
# `item_information` is deliberately absent. It is the human-readable gloss for
# `item`, but it is lowercase and runs to 135 characters ("triggering events that
# accelerate or increase a direct financial obligation or an obligation under an
# off-balance sheet arrangement"), which makes a poor citation name. The item
# number is the identifier EDGAR itself uses.
CDT_ITEM_COLUMNS: tuple[str, ...] = ("item_id", "url", "date", "item")

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


def extract_lender_labels(value: object, logger: logging.Logger) -> list[str]:
    """Reads lender labels out of the CDT `lenders_json` blob.

    The blob is a list of coreference groups, each holding character-offset
    spans into the 8-K text::

        [{"mentions": [{"char_start": 265, "char_end": 286, "tag_id": "tag-10",
                        "text": "Western Alliance Bank", "type": "organization"},
                       {"char_start": 304, "char_end": 308, "tag_id": "tag-11",
                        "text": "Bank", "type": "organization"}],
          "tag_ids": ["tag-10", "tag-11"]}]

    One group is one entity's chain of references, so most of its spans are
    anaphora -- "Bank" repeated five times -- rather than the name. Where the
    chain contains a name, that name is its longest span, which is what this
    returns.

    Nothing is filtered, and that is the whole point. Many groups contain no name
    anywhere: their longest span is a role word, and across the in-scope
    instruments "lenders" is the label of 35 groups, "underwriters" 28, "lenders
    party thereto" 24, "holders" 17. Those are returned as written.

    Two filters look obviously right here and are both wrong:

    Restricting to `type == "organization"` does not separate names from roles.
    "underwriters" and "Underwriters" are themselves tagged `organization`, so
    the roles survive anyway -- while 304 groups lose their only span and the
    instruments carrying a lender drop from 638 to 431.

    A stopword set of role words would work, and is the first step of separating
    roles from names. That is deferred, deliberately: it belongs with the rest of
    the lender-normalization work, and the labels this returns are the evidence
    that work needs. Filtering them here would hide the problem instead of
    scoping it. Note the difference from `parse_address_country`, which screens
    an open set and so must name what a country is *not*: the set of role words
    is closed and small, which is exactly why deferring costs nothing.

    Args:
        value: A raw `lenders_json` cell.
        logger: A standard logger instance.

    Returns:
        One label per group, de-duplicated in document order. Empty when the
        filing discloses no lender -- 494 of the 1,132 in-scope instruments.
    """
    text = _clean(value)
    if not text:
        return []

    try:
        groups = json.loads(text)
    except ValueError:
        logger.warning(
            "Could not parse a lenders_json cell as JSON; treating the "
            "instrument as disclosing no lender. Cell begins: %.80s",
            text,
        )
        return []

    if not isinstance(groups, list):
        logger.warning(
            "A lenders_json cell parsed to %s rather than a list of groups; "
            "treating the instrument as disclosing no lender.",
            type(groups).__name__,
        )
        return []

    labels: dict[str, None] = {}
    for group in groups:
        if not isinstance(group, dict):
            continue
        mentions = group.get("mentions")
        if not isinstance(mentions, list):
            continue
        spans = [
            span
            for span in (
                _clean(mention.get("text"))
                for mention in mentions
                if isinstance(mention, dict)
            )
            if span
        ]
        if not spans:
            continue
        # `max` keeps the first of equal-length spans, which is the earliest in
        # the document, so the result does not depend on dict iteration luck.
        labels.setdefault(max(spans, key=len), None)

    return list(labels)


# ---------------------------------------------------------------------------
# Load
# ---------------------------------------------------------------------------


def load_parquet(
    fpath: str | Path, label: str, columns: tuple[str, ...] | None = None
) -> pd.DataFrame:
    """Loads one processor's `latest.parquet` into a DataFrame.

    Args:
        fpath: Path to the parquet file.
        label: Human-readable dataset name, used in error messages.
        columns: Read only these columns. Worth passing for a file that is large
            mostly because of columns nothing here reads -- CDT `items` is 26.5 MB
            of which the unread 8-K body text is the bulk.

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
        return pd.read_parquet(path, columns=list(columns) if columns else None)
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
    is_cik = cik_rows(group["identifier_type"])

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
        # Filled by `attach_commercial_debt` once the CDT datasets are joined;
        # stays empty for the 4,646 of 4,832 companies with no in-scope debt.
        "currentCommercialDebt": [],
        # Filled by `attach_shareholders` once the shareholder-tracker dataset is
        # joined; stays empty for companies whose issuer CUSIP company-info has
        # not resolved (the majority).
        "currentShareholders": [],
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


def build_debt_source_name(item: str | None) -> str:
    """Names the citation after the 8-K item the instrument was disclosed under.

    Parallel to `build_source_name` for corporate structure: the citation says
    which part of which form it came from. Six items appear -- 1.01 and 1.02
    (entering and terminating a material definitive agreement), 2.03 and 2.04
    (creating and accelerating a financial obligation), 7.01 (Regulation FD) and
    8.01 (other events) -- and the number is how EDGAR itself labels them.

    Args:
        item: The 8-K item number, e.g. `"1.01"`.

    Returns:
        A source name such as `"SEC 8-K Item 1.01"`.
    """
    if not item:
        return f"SEC {CDT_FORM_TYPE}"
    return f"SEC {CDT_FORM_TYPE} Item {item}"


def parse_amount(value: object) -> int | float | None:
    """Parses a reported instrument amount to a JSON-safe number.

    Returns a Python `int` or `float`, never a numpy scalar: `json.dump` cannot
    serialize `numpy.int64` and would fail the whole build at the write step,
    long after this value was read.

    No scale or sanity check. Six values dataset-wide are below 1,000 and at
    least three are plainly interest-rate margins the extractor put in the amount
    field -- 0.875 on a row named "ABR Loan", 1.875 on "RFR Loan". They are
    passed through: no threshold separates a misextracted margin from a genuine
    small private note, and inventing one would silently drop real instruments.
    The fix belongs upstream.

    Args:
        value: A raw `amount` cell.

    Returns:
        The amount, or `None` if the cell was blank or not a number.
    """
    text = _clean(value)
    if not text:
        return None
    parsed = pd.to_numeric(text, errors="coerce")
    if pd.isna(parsed):
        return None
    number = float(parsed)
    return int(number) if number.is_integer() else number


def parse_amount_currency(value: object, logger: logging.Logger) -> str | None:
    """Reads the ISO 4217 currency out of the CDT `amount_json` blob.

    The currency lives only in the mentions file -- `debt-instruments.amount` is
    a bare number with no currency column -- so this is the reason the mentions
    join carries anything beyond provenance.

    There is no conversion, here or anywhere: no CDT output supplies an FX rate,
    so the spec's "Amount USD" field cannot be produced. Amounts are reported in
    whatever the filing said, and the code travels with the number so the UI can
    show it.

    Args:
        value: A raw `amount_json` cell.
        logger: A standard logger instance.

    Returns:
        The currency code, or `None` if the blob names none.
    """
    text = _clean(value)
    if not text:
        return None
    try:
        payload = json.loads(text)
    except ValueError:
        logger.warning(
            "Could not parse an amount_json cell as JSON; leaving the currency "
            "unset. Cell begins: %.80s",
            text,
        )
        return None
    if not isinstance(payload, dict):
        return None
    return _clean(payload.get("currency"))


def collect_superseded_instrument_ids(instruments_df: pd.DataFrame) -> set[str]:
    """Collects the instruments that a later filing replaced.

    An instrument names its predecessor through one of three columns:
    `amendment_of_debt_instrument_id`, `retired_of_debt_instrument_id`, or
    `split_of_debt_instrument_id`. Every id they name is itself a row in the same
    table, so this is a membership test rather than a graph walk -- there is no
    chain to follow, and 65 of 1,640 instruments are named.

    Args:
        instruments_df: The debt-instruments dataset.

    Returns:
        The `debt_instrument_id` values that have been superseded.
    """
    superseded: set[str] = set()
    for column in (
        "amendment_of_debt_instrument_id",
        "retired_of_debt_instrument_id",
        "split_of_debt_instrument_id",
    ):
        superseded |= {
            text for text in (_clean(value) for value in instruments_df[column]) if text
        }
    return superseded


def resolve_debt_documents(
    instruments_df: pd.DataFrame,
    mentions_df: pd.DataFrame,
    items_df: pd.DataFrame,
    logger: logging.Logger,
) -> pd.DataFrame:
    """Joins each debt instrument to the 8-K it was extracted from.

    `debt-instruments/latest.parquet` carries no provenance at all -- no document
    link, filing date, accession number, or access date -- so a citation is only
    possible through the two sibling CDT outputs:

        debt-instruments.seed_debt_instrument_mention_id
          -> debt-instrument-mentions.debt_instrument_mention_id  (amount_json)
          -> debt-instrument-mentions.item_id
          -> items.item_id                                        (url, date, item)

    Both sides are de-duplicated first, and neither drop is cosmetic. `mentions`
    carries 23 duplicate ids -- exact repeats within one item -- and `items`
    carries 803 duplicate `item_id`s in which `company_name` is the only column
    that varies, because co-registrants on one 8-K each get a row. Joining either
    as-is multiplies instruments instead of failing.

    Args:
        instruments_df: The debt-instruments dataset.
        mentions_df: The debt-instrument-mentions dataset.
        items_df: The items dataset, read narrow per `CDT_ITEM_COLUMNS`.
        logger: A standard logger instance.

    Returns:
        `instruments_df` with `url`, `date`, `item`, and `amount_json` attached.
        A row that resolved no document keeps those columns as nulls rather than
        failing here -- whether that matters depends on whether the row renders,
        which this function cannot know. `require_renderable_citations` decides.

    Raises:
        `RuntimeError` if either merge changed the row count, which means the
            de-duplication above no longer covers how those files repeat.
    """
    mentions = mentions_df.drop_duplicates("debt_instrument_mention_id")
    items = items_df.drop_duplicates("item_id")
    logger.info(
        "De-duplicated the CDT auxiliary datasets: mentions %d -> %d rows, "
        "items %d -> %d rows. Joining either undeduplicated multiplies "
        "instruments.",
        len(mentions_df),
        len(mentions),
        len(items_df),
        len(items),
    )

    resolved = instruments_df.merge(
        mentions[["debt_instrument_mention_id", "item_id", "amount_json"]],
        left_on="seed_debt_instrument_mention_id",
        right_on="debt_instrument_mention_id",
        how="left",
        validate="many_to_one",
    ).merge(
        items[list(CDT_ITEM_COLUMNS)],
        on="item_id",
        how="left",
        validate="many_to_one",
    )

    if len(resolved) != len(instruments_df):
        raise RuntimeError(
            f"Resolving CDT documents changed the row count from "
            f"{len(instruments_df)} to {len(resolved)}. The mentions or items "
            "join matched more than one row per instrument, which means the "
            "de-duplication above no longer covers how those files repeat."
        )

    return resolved


def require_renderable_citations(
    resolved: pd.DataFrame, renders: pd.Series, logger: logging.Logger
) -> None:
    """Fails the build if an instrument that will render cannot cite or date itself.

    An instrument needs two things from the `items` row it resolved to, and
    neither is optional. The url is its citation, and an uncited fact does not
    belong on a company page. The date is `asOf`: `SnapshotEntity` declares it a
    `string`, and `sortDebt` in `company-debt-section.tsx` calls `localeCompare`
    on it, so a null does not render an empty cell -- it throws while prerendering
    every page that carries the instrument. `parse_iso_date` returning `None` is
    the only way that null can arise, which is why the same call decides it here.

    Both faults say the same thing about the inputs: the three CDT files did not
    come from one processor run. `items` supplies both fields and populates both
    on all 1,891 of its rows today, so neither is something one extraction can
    half-succeed at.

    Scoped to the instruments that reach a page, which is why this takes a mask
    rather than checking the frame. An instrument whose CIK company-info has not
    resolved to a PermID renders nowhere -- 14 of them today across 9 CIKs, a
    bucket that grows whenever CDT covers a company the PermID mapping does not
    yet -- and failing the whole build over a row no reader can reach trades the
    site for a rule about invisible data. Matured and superseded instruments are
    outside the mask for the same reason.

    Those rows still get reported. A processor-run mismatch that lands only on
    unrenderable instruments is worth knowing about before it lands on a
    renderable one, so it warns rather than passing in silence.

    Args:
        resolved: `resolve_debt_documents` output.
        renders: Boolean mask over `resolved`, True where the instrument reaches
            a company page.
        logger: A standard logger instance.

    Raises:
        `RuntimeError` if any instrument under `renders` resolved no url or no
            parseable date.
    """
    # Both checks run the way `build_debt_instrument` runs them -- `_clean` and
    # `parse_iso_date` per cell, not a vectorized approximation of either -- so
    # "the guard passed" and "the emitted record is well-formed" cannot come
    # apart on a value one accepts and the other does not.
    uncited = resolved["url"].map(lambda value: not _clean(value))
    undated = resolved["date"].map(lambda value: parse_iso_date(value) is None)
    incomplete = uncited | undated

    failing = incomplete & renders
    if failing.any():
        sample = resolved.loc[failing, "debt_instrument_id"].head(5).tolist()
        raise RuntimeError(
            f"{int(failing.sum())} of {int(renders.sum())} renderable debt "
            "instruments cannot be cited or dated: "
            f"{int((uncited & renders).sum())} resolved no 8-K url and "
            f"{int((undated & renders).sum())} no parseable filing date. Sample "
            f"debt_instrument_id: {sample}. Check that the mentions and items "
            "files are from the same processor run as debt-instruments."
        )

    hidden = incomplete & ~renders
    if hidden.any():
        logger.warning(
            "%d debt instruments resolved no 8-K url or no parseable filing "
            "date, but none of them renders -- their CIK has no company page, or "
            "they are matured or superseded -- so the build continues. This is "
            "still a sign the three CDT files are not from one processor run. "
            "Sample debt_instrument_id: %s",
            int(hidden.sum()),
            resolved.loc[hidden, "debt_instrument_id"].head(5).tolist(),
        )


def build_debt_instrument(
    row: pd.Series, status: str, run_date: str, logger: logging.Logger
) -> dict:
    """Builds one CurrentCommercialDebt from a resolved instrument row.

    Args:
        row: One row of `resolve_debt_documents` output.
        status: `DEBT_STATUS_ACTIVE` or `DEBT_STATUS_UNDATED`.
        run_date: ISO-8601 date this build ran, used as `lastAccessed`.
        logger: A standard logger instance.

    Returns:
        A dict matching the serialized `CurrentCommercialDebt` type in
        `web/src/types/domain.ts`.
    """
    return {
        # CitedEntity. The URL is `items.url` exactly as the processor emits it:
        # the complete-submission text file, which is the document the extraction
        # read. The filing's index page is a suffix swap away and renders in a
        # browser where this does not, but citing a transform of an address
        # instead of the address is how a citation quietly starts 404ing.
        "sources": [
            {
                "name": build_debt_source_name(_clean(row["item"])),
                "url": _clean(row["url"]),
                # Not the filing date -- that is `asOf` below. Nothing in the
                # three CDT files records when the document was retrieved, so
                # this is when the pipeline read it. It is the only
                # non-deterministic field in the output; do not "fix" that by
                # substituting the filing date, which would claim a 2016
                # retrieval of a document first read years later.
                "lastAccessed": run_date,
            }
        ],
        # SnapshotEntity -- the date the 8-K was filed, which is when the
        # instrument was disclosed rather than when its terms began. `startDate`
        # carries the latter when the filing states it.
        "asOf": parse_iso_date(row["date"]),
        "instrumentName": _clean(row["name"]),
        "lenders": extract_lender_labels(row["lenders_json"], logger),
        "amount": parse_amount(row["amount"]),
        "currency": parse_amount_currency(row["amount_json"], logger),
        "startDate": parse_iso_date(row["start_date"]),
        "endDate": parse_iso_date(row["end_date"]),
        "status": status,
    }


def attach_commercial_debt(
    companies: list[dict],
    instruments_df: pd.DataFrame,
    mentions_df: pd.DataFrame,
    items_df: pd.DataFrame,
    run_date: str,
    logger: logging.Logger,
) -> None:
    """Attaches in-scope debt instruments to the companies that borrowed.

    Mutates `companies` in place, filling `currentCommercialDebt`.

    Scope deliberately departs from the FTM2J tech spec. The spec admits an
    instrument only when its end date is in the future, which on this data means
    156 instruments across 55 of 4,832 companies -- and silently discards the 63%
    of rows whose filing stated no end date at all. Undated instruments are kept
    and labelled instead, which is 1,132 instruments across 186 companies.
    Matured and superseded instruments are excluded, as the spec requires.

    Args:
        companies: `Company` records, each carrying a `registrants` list.
        instruments_df: The debt-instruments dataset.
        mentions_df: The debt-instrument-mentions dataset.
        items_df: The items dataset.
        run_date: ISO-8601 date this build ran.
        logger: A standard logger instance.

    Raises:
        `RuntimeError` if the CIK join matches no companies at all, or if an
            instrument that will render cannot cite or date itself -- see
            `require_renderable_citations`.
    """
    resolved = resolve_debt_documents(instruments_df, mentions_df, items_df, logger)
    resolved["cik"] = normalize_cik(resolved["cik"])

    known_cik = resolved["cik"].isin(
        {
            registrant["cik"]
            for company in companies
            for registrant in company["registrants"]
        }
    )

    # Guard the JOIN, not the attachment. Both sides must be zero-padded or the
    # join silently matches nothing, leaving every company page with an empty
    # Commercial Debt section and no error -- indistinguishable from "the
    # processor has no data for these companies". Same failure class as the
    # corporate-structure join, and the same response.
    #
    # Deliberately not "no company ended up with debt": every instrument being
    # filtered out as matured or superseded is a legitimate outcome for a small
    # dataset, and conflating it with a padding bug makes the guard fire on
    # correct input.
    if len(resolved) and not known_cik.any():
        raise RuntimeError(
            "The CDT CIK join matched no companies. Sample instrument CIK: "
            f"{resolved['cik'].iloc[0]}; sample company CIK: "
            f"{companies[0]['cik'] if companies else 'n/a'}. Both must be "
            f"zero-padded to {CIK_WIDTH} digits."
        )

    superseded = collect_superseded_instrument_ids(instruments_df)
    is_superseded = resolved["debt_instrument_id"].map(
        lambda value: _clean(value) in superseded
    )

    # NaT covers both a blank end date and one that will not parse, and both mean
    # the same thing here: the filing gave us nothing to compare against, so the
    # instrument is Undated rather than assumed expired. Comparing against the
    # build date rather than a fresh `today()` per row keeps one run internally
    # consistent.
    end_dates = pd.to_datetime(resolved["end_date"], errors="coerce")
    as_of_build = pd.Timestamp(run_date)
    matured = end_dates <= as_of_build

    # The set that reaches a page, and so the set that must be citable. Unknown
    # CIKs were previously built and then dropped by the loop below, which read
    # only its own registrants -- the output is the same, but the citation guard
    # now covers exactly what ships rather than the whole file.
    renders = known_cik & ~is_superseded & ~matured
    require_renderable_citations(resolved, renders, logger)

    in_scope = resolved[renders]
    statuses = [
        DEBT_STATUS_UNDATED if pd.isna(end) else DEBT_STATUS_ACTIVE
        for end in end_dates[renders]
    ]

    by_cik: dict[str, list[dict]] = {}
    for (_, row), status in zip(in_scope.iterrows(), statuses, strict=True):
        by_cik.setdefault(row["cik"], []).append(
            build_debt_instrument(row, status, run_date, logger)
        )

    matched = 0
    for company in companies:
        instruments = [
            instrument
            for registrant in company["registrants"]
            if registrant["cik"] in by_cik
            for instrument in by_cik[registrant["cik"]]
        ]
        if not instruments:
            continue
        # Descending by disclosure date, so the most recently filed instrument
        # leads; name breaks ties so the output is stable across runs.
        instruments.sort(key=lambda i: ((i["asOf"] or ""), i["instrumentName"] or ""))
        instruments.reverse()
        company["currentCommercialDebt"] = instruments
        matched += 1

    # Counted off the records rather than off `statuses`, which also holds
    # instruments belonging to a CIK that no company page covers. Reporting those
    # as attached would overstate coverage by exactly the rows that went nowhere.
    attached = [
        instrument
        for company in companies
        for instrument in company["currentCommercialDebt"]
    ]
    active = sum(1 for i in attached if i["status"] == DEBT_STATUS_ACTIVE)
    logger.info(
        "Attached %d debt instruments to %d of %d companies; %d have no "
        "in-scope commercial debt. %d are active and %d undated.",
        len(attached),
        matched,
        len(companies),
        len(companies) - matched,
        active,
        len(attached) - active,
    )

    # Exclusions are reported over the population that could have been rendered
    # -- instruments whose CIK has a company page -- so the numbers add up
    # against the attached count above rather than against the whole file.
    logger.info(
        "Excluded %d superseded instruments (amended, retired, or split) and "
        "%d that matured on or before %s, of those whose CIK has a company "
        "page. A further %d in-scope instruments belong to %d CIKs that "
        "company-info has not resolved to a PermID, so they are not rendered "
        "anywhere.",
        int((known_cik & is_superseded & ~matured).sum()),
        int((known_cik & ~is_superseded & matured).sum()),
        run_date,
        int((~known_cik & ~is_superseded & ~matured).sum()),
        resolved.loc[~known_cik, "cik"].nunique(),
    )


def build_issuer_cusip_map(
    company_info_df: pd.DataFrame, logger: logging.Logger
) -> dict[str, str]:
    """Maps a security CUSIP to the issuer's PermID, using company-info.

    The shareholder-tracker output identifies each holding's issuer by the
    security's CUSIP, never by a PermID. company-info is where that CUSIP was
    resolved: its `identifier_type == "cusip"` rows carry the CUSIP in
    `identifier` and the resolved issuer in `permid_id`. This is the only path
    from a holding to a company page, and it is why coverage is bounded by
    company-info's resolution rather than by anything the frontend does.

    A CUSIP identifies a single issuer, so it should resolve to one PermID. When
    company-info nonetheless carries the same CUSIP against different PermIDs,
    the most recent snapshot wins -- `last_processed` descending, tie-broken on
    `input_source` -- the same discriminator as `select_latest_snapshot`, so the
    choice is stable across runs rather than dependent on parquet row order.
    Conflicts are logged, since they point at an upstream anomaly.

    Args:
        company_info_df: The raw company-info dataset.
        logger: A standard logger instance.

    Returns:
        A dict from CUSIP to PermID. A CUSIP with no resolved PermID is omitted.
    """
    cusip_rows = company_info_df[
        company_info_df["identifier_type"].astype(str).str.strip().str.casefold()
        == IDENTIFIER_TYPE_CUSIP
    ]
    # Order rows most-recent-snapshot first so the first row seen for each CUSIP
    # is the winner; `input_source` breaks ties for a build-stable choice, and
    # unparseable stamps sort last. Mirrors `select_latest_snapshot`.
    order = pd.DataFrame(
        {
            "ts": cusip_rows["last_processed"].map(parse_last_processed_timestamp),
            "src": cusip_rows["input_source"].map(lambda v: _clean(v) or ""),
        },
        index=cusip_rows.index,
    )
    ranked = cusip_rows.loc[
        order.sort_values(
            ["ts", "src"], ascending=[False, True], na_position="last"
        ).index
    ]

    mapping: dict[str, str] = {}
    conflicts: dict[str, set[str]] = {}
    for cusip, permid in zip(ranked["identifier"], ranked["permid_id"], strict=True):
        clean_cusip = _clean(cusip)
        clean_permid = _clean(permid)
        if not (clean_cusip and clean_permid):
            continue
        winner = mapping.get(clean_cusip)
        if winner is None:
            mapping[clean_cusip] = clean_permid
        elif winner != clean_permid:
            # Same CUSIP, two issuers: an upstream anomaly. The most recent
            # snapshot already won (rows are recency-ordered); record the loser
            # only so the conflict is surfaced rather than silent.
            conflicts.setdefault(clean_cusip, {winner}).add(clean_permid)

    if conflicts:
        examples = ", ".join(
            f"{cusip}->{sorted(pids)}" for cusip, pids in list(conflicts.items())[:5]
        )
        logger.warning(
            "%d CUSIP(s) resolved to multiple PermIDs in company-info; kept the "
            "most recent snapshot's PermID for each. Examples: %s",
            len(conflicts),
            examples,
        )
    return mapping


def build_shareholder_source_name(investor_type: str | None, source: str | None) -> str:
    """Names the citation for one shareholding.

    Institutional holdings all come from SEC 13-F filings under a generic
    `source`, so they are named for the filing. Pension-fund holdings carry the
    fund's own name in `source`, which is a more useful citation than a generic
    label.

    Args:
        investor_type: The row's `investor_type`.
        source: The row's `source`.

    Returns:
        A citation name, never empty.
    """
    if _clean(investor_type) == SHAREHOLDER_INVESTOR_TYPE_INSTITUTIONAL:
        return SHAREHOLDER_SOURCE_NAME_13F
    return _clean(source) or SHAREHOLDER_SOURCE_NAME_FALLBACK


def _json_number(value: object) -> int | float | None:
    """Coerces one parsed numeric cell to a JSON-safe number or None.

    `json.dump` cannot serialize a numpy scalar, and a NaN must become null
    rather than the invalid JSON token `NaN`. Integers are emitted without a
    trailing `.0`.
    """
    if value is None or pd.isna(value):
        return None
    number = float(value)
    return int(number) if number.is_integer() else number


def _iso_date_column(values: pd.Series) -> list[str | None]:
    """Vectorized `parse_iso_date` over a whole column.

    Per-cell parsing is too slow at the shareholder-tracker's scale (~1.7M
    resolved rows), so dates are parsed once as a column and NaT becomes None.
    """
    parsed = pd.to_datetime(values, errors="coerce", utc=True).dt.strftime("%Y-%m-%d")
    return [None if pd.isna(text) else text for text in parsed.tolist()]


def _stripped_column(values: pd.Series) -> list[str | None]:
    """Vectorized `_clean` over a whole column: stripped string, or None."""
    stripped = values.fillna("").astype(str).str.strip()
    return [text or None for text in stripped.tolist()]


def attach_shareholders(
    companies: list[dict],
    shareholders_df: pd.DataFrame,
    company_info_df: pd.DataFrame,
    logger: logging.Logger,
) -> None:
    """Attaches disclosed shareholdings to the companies they are holdings in.

    Mutates `companies` in place, filling `currentShareholders`.

    The join is on the issuer's CUSIP resolved to a PermID through company-info
    (`build_issuer_cusip_map`), NOT on a registrant CIK -- a holding is a stake
    in the *issuer*, and the issuer is identified by the security's CUSIP. No
    recency, ownership, or security-type filter is applied, per the issue: every
    resolved holding is attached, one row per holding (share classes are not
    collapsed).

    Args:
        companies: `Company` records keyed by `permId`.
        shareholders_df: The shareholder-tracker dataset.
        company_info_df: The company-info dataset, for the CUSIP->PermID map.
        logger: A standard logger instance.

    Raises:
        `RuntimeError` if the CUSIP join matches no issuer at all -- the same
            silent-zero guard the CIK joins carry. A key-format break (a
            prefixed CUSIP column, or company-info emitting no cusip rows) would
            otherwise leave every page's Shareholders section empty with no
            error. An individual unresolved CUSIP is expected and never fatal.
    """
    cusip_to_permid = build_issuer_cusip_map(company_info_df, logger)

    permids = shareholders_df["security_cusip"].astype(str).str.strip().map(
        cusip_to_permid
    )
    resolved_mask = permids.notna()

    # Guard the JOIN, not the attachment: a total miss means the two sides no
    # longer share a key format, which is a data-integrity bug invisible in the
    # logs. A partial miss is the normal steady state -- most CUSIPs in the file
    # are never resolved by company-info.
    if len(shareholders_df) and not resolved_mask.any():
        raise RuntimeError(
            "The shareholder CUSIP join matched no issuers. company-info carries "
            f"{len(cusip_to_permid)} CUSIP-keyed rows. The shareholder "
            "`security_cusip` and company-info's cusip `identifier` must be the "
            "same format."
        )

    permids_by_company = {company["permId"]: company for company in companies}

    # Keep only holdings that both resolve and land on a company that has a page;
    # a resolved CUSIP whose PermID has no record cannot render anywhere.
    renderable = resolved_mask & permids.isin(permids_by_company.keys())
    holdings_df = shareholders_df[renderable]
    holding_permids = permids[renderable].tolist()

    # Everything below is column-vectorized: per-cell parsing (parse_iso_date,
    # parse_amount, _clean) is far too slow across ~1.7M resolved rows. Parse
    # each column once, then a single Python pass assembles the records.
    names = _stripped_column(holdings_df["investor_name"])
    types = _stripped_column(holdings_df["investor_type"])
    countries = _stripped_column(holdings_df["investor_country_name"])
    security_types = _stripped_column(holdings_df["security_type"])
    urls = _stripped_column(holdings_df["url"])
    sources = _stripped_column(holdings_df["source"])
    as_of_dates = _iso_date_column(holdings_df["document_report_date"])
    accessed_dates = _iso_date_column(holdings_df["last_accessed_date"])
    shares = [
        _json_number(v)
        for v in pd.to_numeric(
            holdings_df["stock_number_of_shares"], errors="coerce"
        ).tolist()
    ]
    values = [
        _json_number(v)
        for v in pd.to_numeric(
            holdings_df["security_market_value_amount_usd"], errors="coerce"
        ).tolist()
    ]

    by_permid: dict[str, list[dict]] = {}
    for i, permid in enumerate(holding_permids):
        by_permid.setdefault(permid, []).append(
            {
                "sources": [
                    {
                        "name": build_shareholder_source_name(types[i], sources[i]),
                        "url": urls[i],
                        "lastAccessed": accessed_dates[i],
                    }
                ],
                "asOf": as_of_dates[i],
                # investor.permId is null: holders are not linked to their own
                # pages yet, though most resolve. See the plan's decision 4.
                "investor": {"name": names[i], "permId": None},
                # Coerced to "" (never None): the FE type declares investorType a
                # non-null string and searches it with an unguarded
                # `.toLowerCase()`, so a blank cell must not surface as null.
                "investorType": types[i] or "",
                "investorCountry": countries[i],
                "securityType": security_types[i],
                "sharesOwned": shares[i],
                "marketValueUsd": values[i],
            }
        )

    matched = 0
    for company in companies:
        holdings = by_permid.get(company["permId"])
        if not holdings:
            continue
        # Descending by USD market value, nulls last, so the largest holder
        # leads; investor name breaks ties for a stable order across runs.
        holdings.sort(
            key=lambda h: (
                h["marketValueUsd"] is not None,
                h["marketValueUsd"] or 0,
                h["investor"]["name"] or "",
            ),
            reverse=True,
        )
        company["currentShareholders"] = holdings
        matched += 1

    attached = sum(len(company["currentShareholders"]) for company in companies)
    logger.info(
        "Attached %d shareholdings to %d of %d companies; %d have no resolved "
        "shareholders. %d holdings did not resolve to any PermID and %d resolved "
        "to a PermID with no company page.",
        attached,
        matched,
        len(companies),
        len(companies) - matched,
        int((~resolved_mask).sum()),
        int(resolved_mask.sum()) - attached,
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


INDEX_FILE_NAME = "index.ndjson"
DETAIL_DIR_NAME = "detail"


def index_shard(perm_id: str) -> str:
    """The subdirectory bucket for a PermID's detail file.

    Two-character prefix, so no single directory holds every company. Mirrored
    exactly by the web reader (`detailShard` in the company route); if this
    changes, that must change with it.
    """
    return perm_id[:2] if len(perm_id) >= 2 else "_"


def build_index_entry(company: dict) -> dict:
    """The light per-company record written to `index.ndjson`.

    Carries only what page selection and search need without loading a
    company's heavy nested lists: identity fields and the content-depth counts
    `generateStaticParams` sorts on. Reading the full detail for all companies
    just to pick and order a subset is what did not scale.
    """
    return {
        "permId": company["permId"],
        "name": company["name"],
        "hqCountry": company["hqCountry"],
        "debtCount": len(company["currentCommercialDebt"]),
        "treeCount": len(company["currentCorporateRelationships"]),
        "shareholderCount": len(company["currentShareholders"]),
    }


def write_dataset(
    companies: list[dict], output_dir: str, logger: logging.Logger
) -> None:
    """Writes the dataset as an index plus one detail file per company.

    A single JSON array does not survive the data volume: with every
    shareholding kept, the array is >1 GB and the web reader cannot even hold it
    as one string (Node caps a string at ~536 MB). Splitting it means the reader
    loads a small index to select and order pages, then reads only the detail of
    each page it renders.

    Layout under `output_dir`:
        index.ndjson              one `build_index_entry` per line
        detail/<shard>/<permId>.json   the full Company record, one per file

    `index.ndjson` is newline-delimited rather than a JSON array so the reader
    can parse it line by line and never build one giant string.

    Args:
        companies: The transformed company records.
        output_dir: Directory to write into; created if absent.
        logger: A standard logger instance.
    """
    out = Path(output_dir)
    detail_root = out / DETAIL_DIR_NAME
    detail_root.mkdir(parents=True, exist_ok=True)

    index_path = out / INDEX_FILE_NAME
    with open(index_path, "w", encoding="utf-8") as index_file:
        for company in companies:
            index_file.write(
                json.dumps(build_index_entry(company), ensure_ascii=False)
            )
            index_file.write("\n")
            shard_dir = detail_root / index_shard(company["permId"])
            shard_dir.mkdir(parents=True, exist_ok=True)
            detail_path = shard_dir / f"{company['permId']}.json"
            with open(detail_path, "w", encoding="utf-8") as detail_file:
                json.dump(company, detail_file, ensure_ascii=False)

    logger.info(
        "Wrote %s (%d companies) and per-company detail files under %s.",
        index_path,
        len(companies),
        detail_root,
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

    Reads `company-info/latest.parquet`,
    `corporate-structure/latest.parquet`, and the three CDT outputs, and writes
    JSON records matching the serialized `Company` type in
    `web/src/types/domain.ts`.

    CDT needs three files for one section because the dataset holding the debt
    instruments carries no provenance -- see `resolve_debt_documents`.

    Environment variables:
        COMPANY_INFO_FILE_PATH: Path to the company info parquet file.
        CORPORATE_STRUCTURE_FILE_PATH: Path to the corporate structure parquet
            file.
        CDT_DEBT_INSTRUMENTS_FILE_PATH: Path to the CDT debt-instruments parquet.
        CDT_MENTIONS_FILE_PATH: Path to the CDT debt-instrument-mentions parquet.
        CDT_ITEMS_FILE_PATH: Path to the CDT items parquet.
        SHAREHOLDERS_FILE_PATH: Path to the shareholder-tracker parquet.
        OUTPUT_DIR: Directory to write the dataset into, as an index plus one
            detail file per company -- see `write_dataset`.

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
        cdt_instruments_fpath = os.environ["CDT_DEBT_INSTRUMENTS_FILE_PATH"]
        cdt_mentions_fpath = os.environ["CDT_MENTIONS_FILE_PATH"]
        cdt_items_fpath = os.environ["CDT_ITEMS_FILE_PATH"]
        shareholders_fpath = os.environ["SHAREHOLDERS_FILE_PATH"]
        output_dir = os.environ["OUTPUT_DIR"]
    except KeyError as e:
        raise RuntimeError(f'Missing required environment variable "{e}".') from e

    # Resolved once, so every instrument in a run shares a `lastAccessed` and the
    # Active/matured cutoff cannot shift midway through a long build.
    run_date = datetime.datetime.now(datetime.UTC).date().isoformat()

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

    logger.info("Loading CDT datasets.")
    instruments_df = load_parquet(cdt_instruments_fpath, "CDT debt instruments")
    mentions_df = load_parquet(cdt_mentions_fpath, "CDT debt instrument mentions")
    items_df = load_parquet(cdt_items_fpath, "CDT items", columns=CDT_ITEM_COLUMNS)
    logger.info(
        "Loaded %d debt instruments covering %d borrowers, %d mentions, and "
        "%d filing items.",
        len(instruments_df),
        instruments_df["cik"].nunique(),
        len(mentions_df),
        len(items_df),
    )

    logger.info("Transforming to Company records.")
    companies = build_companies(companies_df, logger)
    validate_companies(companies)

    logger.info("Attaching disclosed corporate structures.")
    attach_relationships(companies, structure_df, logger)

    logger.info("Attaching disclosed commercial debt.")
    attach_commercial_debt(
        companies, instruments_df, mentions_df, items_df, run_date, logger
    )

    logger.info("Loading shareholder-tracker dataset.")
    shareholders_df = load_parquet(shareholders_fpath, "shareholders")
    logger.info(
        "Loaded %d shareholdings covering %d distinct issuer CUSIPs.",
        len(shareholders_df),
        shareholders_df["security_cusip"].astype(str).str.strip().replace("", pd.NA).nunique(),
    )

    logger.info("Attaching disclosed shareholders.")
    attach_shareholders(companies, shareholders_df, companies_df, logger)

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

    logger.info("Writing dataset to output directory.")
    write_dataset(companies, output_dir, logger)

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
