"""Generic parsing and record-building helpers for `build_dataset`.

These are the dataset-agnostic building blocks -- cell cleaning, date parsing,
address/country screening, and the small `build_*` record constructors -- with
no knowledge of the pipeline that calls them. The pipeline orchestration lives
in `build_dataset.py`; parquet IO lives in `io_utils.py`.
"""

# Standard library imports
import json
import logging

# Third-party imports
import pandas as pd

# Local imports
from constants import (
    IDENTIFIER_TYPE_CIK,
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
