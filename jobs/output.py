"""Dataset output and validation: the NDJSON index + per-company detail files, plus the pre-write consistency checks and unresolved-row report."""

# Standard library imports
import json
import logging
from pathlib import Path

# Third-party imports
import pandas as pd

# Local imports


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
