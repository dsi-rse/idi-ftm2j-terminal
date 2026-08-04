# Standard library imports
import json
import logging
import os
from pathlib import Path

# Third-party imports
import pandas as pd

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

SOURCE_NAME = "LSEG PermID"

# LSEG's TRBC taxonomy is label-first and supplies no numeric code, unlike SIC
# and NAICS. The `Sector.code` field is deliberately empty for these.
SECTOR_SYSTEM = "TRBC"
SECTOR_CODE = ""

# Countries seen in the company-info dataset. Used to validate the country
# parsed off the end of a free-text address block: if the last line is not a
# recognized country the address did not end with one, and the value would
# otherwise be a state or a postal code presented to users as a country.
KNOWN_COUNTRIES: frozenset[str] = frozenset(
    {
        "Australia",
        "Canada",
        "Cayman Islands",
        "Greece",
        "Ireland",
        "Israel",
        "Jersey",
        "Marshall Islands",
        "Puerto Rico",
        "South Korea",
        "Switzerland",
        "United Kingdom",
        "United States",
    }
)

# MIC placeholder meaning "no exchange reported". It does NOT mean the company
# is unlisted: every row carrying it has a real `exchange_code`, so it must
# fall through to that rather than being treated as missing.
UNKNOWN_MIC = "XXXX"


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
    text = _clean(value)
    if not text:
        return None
    parsed = pd.to_datetime(text, format="%Y%m%dT%H%M%S", errors="coerce")
    if pd.isna(parsed):
        parsed = pd.to_datetime(text, errors="coerce")
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
    fallback: str | None,
    logger: logging.Logger,
) -> str | None:
    """Extracts the country from a newline-delimited address block.

    The country is the last non-empty line. This is positional parsing of
    free-text, so the result is validated against `KNOWN_COUNTRIES` and falls
    back rather than presenting a state or postal code as a country.

    Args:
        address: The raw address block.
        fallback: Country to use when parsing fails.
        logger: A standard logger instance.

    Returns:
        A country name, or the fallback, or `None`.
    """
    text = _clean(address)
    if not text:
        return fallback

    lines = [line.strip() for line in text.splitlines() if line.strip()]
    if not lines:
        return fallback

    candidate = lines[-1]
    if candidate in KNOWN_COUNTRIES:
        return candidate

    logger.warning(
        'Address did not end in a recognized country (got "%s"); falling back to %s.',
        candidate,
        fallback or "None",
    )
    return fallback


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


# ---------------------------------------------------------------------------
# Load
# ---------------------------------------------------------------------------


def load_company_info(company_info_fpath: Path) -> pd.DataFrame:
    """Loads the company info dataset produced by the IDI company processor.

    Args:
        company_info_fpath: Path to `company-info/latest.parquet`.

    Returns:
        The dataset as a Pandas DataFrame.

    Raises:
        `RuntimeError` if the file is missing or cannot be read as parquet.
    """
    try:
        return pd.read_parquet(company_info_fpath)
    except FileNotFoundError as e:
        raise RuntimeError(
            "The company info parquet file was not found at the given path."
        ) from e
    except (OSError, ValueError) as e:
        raise RuntimeError(
            "The company info file could not be read as a parquet dataset."
        ) from e


# ---------------------------------------------------------------------------
# Transform
# ---------------------------------------------------------------------------


def transform_company(group: pd.DataFrame, logger: logging.Logger) -> dict:
    """Builds one Company record from all rows sharing a PermID.

    The grain of the source is one row per (identifier_type, identifier), so a
    PermID may eventually carry several CIKs — the Shareholder Tracker will
    introduce these. Scalar fields take the first value; identifiers are
    collected into lists.

    Args:
        group: All source rows for a single PermID.
        logger: A standard logger instance.

    Returns:
        A dict matching the serialized `Company` type in
        `web/src/types/domain.ts`.
    """
    first = group.iloc[0]

    perm_id = _clean(first["permid_id"])
    as_of = parse_last_processed(first["last_processed"])
    sources = build_sources(_clean(first["permid_url"]), as_of)

    tickers = _collect(group["ticker"])
    ciks = _collect(group.loc[group["identifier_type"] == "cik", "identifier"])

    # Only claim a CIK when it is unambiguous. The data spec calls for Primary
    # CIK selection logic but does not define it, and guessing a tie-break
    # would silently attach the wrong filings to a company.
    cik = ciks[0] if len(ciks) == 1 else None
    if len(ciks) > 1:
        logger.info(
            "PermID %s has %d CIKs; leaving cik null pending primary-CIK logic.",
            perm_id,
            len(ciks),
        )

    incorporated_country = _clean(first["incorporated_in"])
    hq_country = parse_address_country(
        first["hq_address"], incorporated_country, logger
    )

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
        "cik": cik,
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
# Entry point
# ---------------------------------------------------------------------------


def main(logger: logging.Logger) -> None:
    """Builds the company dataset consumed by the static web application.

    Reads `company-info/latest.parquet` and writes JSON records matching the
    serialized `Company` type in `web/src/types/domain.ts`.

    Environment variables:
        COMPANY_INFO_FILE_PATH: Path to the company info parquet file.
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
        output_fpath = os.environ["OUTPUT_FILE_PATH"]
    except KeyError as e:
        raise RuntimeError(f'Missing required environment variable "{e}".') from e

    logger.info("Loading company info dataset.")
    companies_df = load_company_info(company_info_fpath)
    logger.info(
        "Loaded %d rows covering %d PermIDs.",
        len(companies_df),
        companies_df["permid_id"].nunique(),
    )

    logger.info("Transforming to Company records.")
    companies = build_companies(companies_df, logger)

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
