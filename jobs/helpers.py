"""Generic parsing and record-building helpers for `build_dataset`.

These are the dataset-agnostic building blocks -- cell cleaning, date parsing,
address/country screening, and the small `build_*` record constructors -- with
no knowledge of the pipeline that calls them. The pipeline orchestration lives
in `build_dataset.py`; parquet IO and dataset output live in `output.py`.
"""

# Standard library imports
import json
import logging

# Third-party imports
import pandas as pd

# Local imports
from constants import (
    CDT_LENDER_ROLE,
    CDT_NAMED_PARTY_KIND,
    IDENTIFIER_TYPE_CIK,
    IDENTIFIER_TYPE_CUSIP,
    SECTOR_CODE,
    SECTOR_SYSTEM,
    SOURCE_NAME,
    UNKNOWN_MIC,
    US_STATES,
)


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


def cusip_rows(identifier_types: pd.Series) -> pd.Series:
    """Boolean mask selecting the rows whose `identifier` holds a CUSIP.

    The counterpart of `cik_rows`, matched the same way. These rows are also
    what `build_issuer_cusip_map` joins shareholdings on, so the CUSIPs a
    company lists and the CUSIPs its holdings resolve through are one set.

    Args:
        identifier_types: The `identifier_type` column of a group of rows.

    Returns:
        A boolean mask aligned to `identifier_types`.
    """
    return identifier_types.str.strip().str.casefold() == IDENTIFIER_TYPE_CUSIP


def extract_lender_labels(value: object, logger: logging.Logger) -> list[str]:
    """Reads lender names out of the CDT `parties_json` blob.

    The blob lists every party cluster the extractor found in the filing, each
    with a `role`, a `canonical_name` (the longest span naming the party rather
    than its role, else the longest span), a `kind`, and evidence spans::

        [{"role": "lender", "canonical_name": "Western Alliance Bank",
          "kind": "named", "spans": [...]},
         {"role": "borrower", "canonical_name": "Fixture Co",
          "kind": "named", "spans": [...]}]

    Only `CDT_LENDER_ROLE` parties are lenders. The borrower, agents, trustees,
    underwriters and guarantors are parties to the instrument but not who holds
    the debt.

    Only `CDT_NAMED_PARTY_KIND` lenders are returned. A `collective` lender is
    one the filing never names -- "the lenders party thereto", "Holders" -- and
    its role phrase is not a lender anyone can look up or search for. An
    instrument whose lenders are all collective therefore carries no labels and
    renders as "Lender not named".

    Args:
        value: A raw `parties_json` cell.
        logger: A standard logger instance.

    Returns:
        One name per named lender cluster, de-duplicated in document order.
        Empty when the filing names no lender -- a public note series, a
        redemption notice, a syndicate described only as "the lenders".
    """
    text = _clean(value)
    if not text:
        return []

    try:
        parties = json.loads(text)
    except ValueError:
        logger.warning(
            "Could not parse a parties_json cell as JSON; treating the "
            "instrument as disclosing no lender. Cell begins: %.80s",
            text,
        )
        return []

    if not isinstance(parties, list):
        logger.warning(
            "A parties_json cell parsed to %s rather than a list of parties; "
            "treating the instrument as disclosing no lender.",
            type(parties).__name__,
        )
        return []

    labels: dict[str, None] = {}
    for party in parties:
        if not isinstance(party, dict):
            continue
        if party.get("role") != CDT_LENDER_ROLE:
            continue
        if party.get("kind") != CDT_NAMED_PARTY_KIND:
            continue
        name = _clean(party.get("canonical_name"))
        if name:
            labels.setdefault(name, None)
    return list(labels)


def parse_amount(value: object) -> int | float | None:
    """Parses a reported monetary or share figure to a JSON-safe number.

    Returns a Python `int` or `float`, never a numpy scalar: `json.dump` cannot
    serialize `numpy.int64` and would fail the whole build at the write step,
    long after this value was read.

    No scale or sanity check. In the CDT amounts six values dataset-wide are
    below 1,000 and at least three are plainly interest-rate margins the
    extractor put in the amount field -- 0.875 on a row named "ABR Loan", 1.875
    on "RFR Loan". They are passed through: no threshold separates a
    misextracted margin from a genuine small private note, and inventing one
    would silently drop real instruments. The fix belongs upstream.

    Args:
        value: A raw numeric cell (a debt `principal_amount`, which CDT
            publishes as a decimal, or a company-facts figure).

    Returns:
        The number, or `None` if the cell was blank or not a number.
    """
    text = _clean(value)
    if not text:
        return None
    parsed = pd.to_numeric(text, errors="coerce")
    if pd.isna(parsed):
        return None
    number = float(parsed)
    return int(number) if number.is_integer() else number
