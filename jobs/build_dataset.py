"""Builds the static web application's company dataset.

The pipeline entrypoint. Reads the processor parquet outputs, transforms and
joins them into `Company` records, and writes the NDJSON index + per-company
detail files. The transform/join/output stages live in sibling modules
(`company`, `relationships`, `debt`, `shareholders`, `output`); the
dataset-agnostic building blocks live in `constants`, `helpers`, and
`io_utils`.
"""

# Standard library imports
import datetime
import logging
import os

# Third-party imports
import pandas as pd

# Local imports
from company import build_companies
from constants import CDT_ITEM_COLUMNS
from debt import attach_commercial_debt
from io_utils import load_parquet
from output import (
    report_unresolved_rows,
    validate_companies,
    write_dataset,
)
from relationships import attach_relationships
from shareholders import attach_shareholders


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
