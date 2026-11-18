"""Builds the static web application's company dataset.

The pipeline entrypoint. Reads the processor parquet outputs, transforms and
joins them into `Company` records, and writes the NDJSON index + per-company
detail files. The transform/join stages live in sibling modules (`company`,
`facts`, `relationships`, `debt`, `shareholders`), parquet IO and dataset output live in
`output`, and the dataset-agnostic building blocks live in `constants` and
`helpers`.
"""

# Standard library imports
import datetime
import logging
import os

# Third-party imports
import pandas as pd

# Local imports
from company import assign_primary_registrants, build_companies
from constants import (
    CDT_CONTRACT_VERSION,
    CDT_DEBT_INSTRUMENTS_TABLE,
    CDT_EDGE_COLUMNS,
    CDT_EDGES_TABLE,
    CDT_ITEM_COLUMNS,
    CDT_ITEMS_TABLE,
    CDT_MENTIONS_TABLE,
    CDT_POINTER_FILE_NAME,
    CDT_TABLES,
)
from debt import attach_commercial_debt
from facts import attach_company_facts
from output import (
    load_parquet,
    read_snapshot_pointer,
    report_unresolved_rows,
    resolve_snapshot_tables,
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
    `corporate-structure/latest.parquet`, and four CDT outputs, and writes
    JSON records matching the serialized `Company` type in
    `web/src/types/domain.ts`.

    CDT needs four tables for one section. The dataset holding the debt
    instruments carries no provenance -- see `resolve_debt_documents` -- and its
    status is read off the instrument's mentions, which only
    `mention-cluster-edges` ties to it -- see `derive_debt_statuses`. Because
    they reference one another, all four are resolved from CDT's `latest.json`
    generation pointer rather than read from the per-table `latest.parquet`
    copies, which a CDT publish replaces one at a time.

    Environment variables:
        COMPANY_INFO_FILE_PATH: Path to the company info parquet file.
        CORPORATE_STRUCTURE_FILE_PATH: Path to the corporate structure parquet
            file.
        CDT_DATABASE_DIR: Path to CDT's database root, the directory holding
            `latest.json` and the `snapshots/` it points into.
        COMPANY_FACTS_FILE_PATH: Path to the company-facts parquet.
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
        cdt_database_dir = os.environ["CDT_DATABASE_DIR"]
        company_facts_fpath = os.environ["COMPANY_FACTS_FILE_PATH"]
        shareholders_fpath = os.environ["SHAREHOLDERS_FILE_PATH"]
        output_dir = os.environ["OUTPUT_DIR"]
    except KeyError as e:
        raise RuntimeError(f'Missing required environment variable "{e}".') from e

    # Resolved once, so every instrument in a run shares a `lastAccessed` and the
    # debt-status reference date cannot shift midway through a long build.
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

    logger.info("Resolving the current CDT generation.")
    cdt_pointer = read_snapshot_pointer(cdt_database_dir, CDT_POINTER_FILE_NAME, "CDT")
    contract_version = cdt_pointer.get("contract_version")
    if contract_version != CDT_CONTRACT_VERSION:
        raise RuntimeError(
            f"CDT published contract version {contract_version!r}, but this build "
            f"reads version {CDT_CONTRACT_VERSION}. Update the CDT readers for the "
            "new contract, then `CDT_CONTRACT_VERSION`."
        )
    cdt_tables = resolve_snapshot_tables(
        cdt_database_dir, cdt_pointer, CDT_TABLES, "CDT"
    )
    logger.info(
        "Reading CDT run %s, written %s, contract version %s.",
        cdt_pointer.get("run_id"),
        cdt_pointer.get("written_at"),
        contract_version,
    )

    logger.info("Loading CDT datasets.")
    instruments = cdt_tables[CDT_DEBT_INSTRUMENTS_TABLE]
    instruments_df = load_parquet(
        instruments.path, "CDT debt instruments", expected_rows=instruments.rows
    )
    mentions = cdt_tables[CDT_MENTIONS_TABLE]
    mentions_df = load_parquet(
        mentions.path, "CDT debt instrument mentions", expected_rows=mentions.rows
    )
    items = cdt_tables[CDT_ITEMS_TABLE]
    items_df = load_parquet(
        items.path, "CDT items", columns=CDT_ITEM_COLUMNS, expected_rows=items.rows
    )
    edges = cdt_tables[CDT_EDGES_TABLE]
    edges_df = load_parquet(
        edges.path,
        "CDT mention-cluster edges",
        columns=CDT_EDGE_COLUMNS,
        expected_rows=edges.rows,
    )
    logger.info(
        "Loaded %d debt instruments covering %d borrowers, %d mentions, "
        "%d filing items, and %d mention-cluster edges.",
        len(instruments_df),
        instruments_df["cik"].nunique(),
        len(mentions_df),
        len(items_df),
        len(edges_df),
    )

    logger.info("Loading company facts dataset.")
    facts_df = load_parquet(company_facts_fpath, "company facts")
    logger.info(
        "Loaded %d company-facts rows covering %d registrant CIKs.",
        len(facts_df),
        facts_df["company_cik"].nunique(),
    )

    logger.info("Transforming to Company records.")
    companies = build_companies(companies_df, logger)
    validate_companies(companies)

    logger.info("Attaching company facts.")
    attach_company_facts(companies, facts_df, logger)

    logger.info("Selecting the primary registrant per company.")
    assign_primary_registrants(companies, facts_df, structure_df, logger)

    logger.info("Attaching disclosed corporate structures.")
    attach_relationships(companies, structure_df, logger)

    logger.info("Attaching disclosed commercial debt.")
    attach_commercial_debt(
        companies, instruments_df, mentions_df, items_df, edges_df, run_date, logger
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
