"""Dataset IO and validation.

The read side (`load_parquet`, and `read_snapshot_pointer` /
`resolve_snapshot_tables` for processors that publish atomic generations) and
write side (`write_dataset`: the NDJSON
index + per-company detail files) of the pipeline, plus the pre-write
consistency checks, the unresolved-row report, and the `normalize_cik` key
helper the parquet joins rely on.
"""

# Standard library imports
import json
import logging
from dataclasses import dataclass
from pathlib import Path

# Third-party imports
import pandas as pd
import pyarrow.parquet as pq

# Local imports
from constants import CIK_WIDTH


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
    exactly by the web reader (`detailShard` in
    `web/src/domains/companies/dataset.ts`); if this changes, that must change
    with it.
    """
    return perm_id[:2] if len(perm_id) >= 2 else "_"


def build_index_entry(company: dict) -> dict:
    """The light per-company record written to `index.ndjson`.

    Carries only what page selection and search need without loading a
    company's heavy nested lists: identity fields, every registrant CIK (the
    web reader pins allowlisted CIKs to a page regardless of rank), and the
    content-depth counts `generateStaticParams` sorts on. Reading the full
    detail for all companies just to pick and order a subset is what did not
    scale.
    """
    return {
        "permId": company["permId"],
        "name": company["name"],
        "hqCountry": company["hqCountry"],
        "ciks": [registrant["cik"] for registrant in company["registrants"]],
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


@dataclass(frozen=True)
class SnapshotTable:
    """One table of a published generation, as its pointer names it.

    Attributes:
        path: Absolute path to the table's parquet file.
        rows: The row count the publisher recorded. `load_parquet` checks the
            file against it.
    """

    path: Path
    rows: int


def read_snapshot_pointer(root: str | Path, file_name: str, label: str) -> dict:
    """Reads the generation pointer a processor publishes beside its tables.

    A processor whose tables reference one another cannot replace them one file
    at a time -- a reader mid-way through would join two generations. So it
    writes the whole generation under an immutable snapshot prefix, then
    replaces one small pointer naming it. Reading the pointer first is what makes
    the set of tables consistent.

    Args:
        root: The processor's database root, holding the pointer.
        file_name: The pointer's file name, e.g. `latest.json`.
        label: Human-readable processor name, used in error messages.

    Returns:
        The pointer as a dict.

    Raises:
        `RuntimeError` if the pointer is missing, is not valid JSON, or is not a
            JSON object.
    """
    path = Path(root) / file_name
    if not path.is_file():
        raise RuntimeError(
            f"The {label} generation pointer was not found at: {path}. Without "
            "it the build cannot tell which snapshot's tables belong together."
        )
    try:
        pointer = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        raise RuntimeError(
            f"The {label} generation pointer at {path} is not valid JSON."
        ) from e
    if not isinstance(pointer, dict):
        raise RuntimeError(
            f"The {label} generation pointer at {path} is not a JSON object."
        )
    return pointer


def resolve_snapshot_tables(
    root: str | Path, pointer: dict, tables: tuple[str, ...], label: str
) -> dict[str, SnapshotTable]:
    """Resolves each named table to the file the generation pointer names.

    Follows the pointer's `tables.<name>.path` rather than building a file name,
    so the layout inside a snapshot is the publisher's to choose.

    Args:
        root: The processor's database root; every path is relative to it.
        pointer: The pointer, from `read_snapshot_pointer`.
        tables: The table names the build reads.
        label: Human-readable processor name, used in error messages.

    Returns:
        Each requested table name mapped to its `SnapshotTable`.

    Raises:
        `RuntimeError` if the pointer names no such table, gives it no usable
            path or row count, or points outside `root`.
    """
    root_path = Path(root).resolve()
    entries = pointer.get("tables")
    if not isinstance(entries, dict):
        raise RuntimeError(f"The {label} generation pointer has no `tables` map.")

    resolved: dict[str, SnapshotTable] = {}
    for name in tables:
        entry = entries.get(name)
        if not isinstance(entry, dict):
            raise RuntimeError(
                f'The {label} generation pointer names no "{name}" table.'
            )
        relative = entry.get("path")
        if not isinstance(relative, str) or not relative.strip():
            raise RuntimeError(
                f'The {label} generation pointer gives the "{name}" table no path.'
            )
        # A pointer is data from another system: never let it read outside the
        # processor's own root, whether by an absolute path or by `..`.
        path = (root_path / relative).resolve()
        if Path(relative).is_absolute() or not path.is_relative_to(root_path):
            raise RuntimeError(
                f'The {label} generation pointer\'s "{name}" path {relative!r} '
                f"is outside the database root {root_path}."
            )
        rows = entry.get("rows")
        if rows is None:
            raise RuntimeError(
                f'The {label} generation pointer gives the "{name}" table no row '
                "count, so the file cannot be checked against it."
            )
        if isinstance(rows, bool) or not isinstance(rows, int) or rows < 0:
            raise RuntimeError(
                f'The {label} generation pointer gives the "{name}" table an '
                f"invalid row count: {rows!r}."
            )
        resolved[name] = SnapshotTable(path=path, rows=rows)
    return resolved


def load_parquet(
    fpath: str | Path,
    label: str,
    columns: tuple[str, ...] | None = None,
    expected_rows: int | None = None,
) -> pd.DataFrame:
    """Loads one processor table's parquet file into a DataFrame.

    Args:
        fpath: Path to the parquet file.
        label: Human-readable dataset name, used in error messages.
        columns: Read only these columns. Worth passing for a file that is large
            mostly because of columns nothing here reads -- CDT `items` is 26.5 MB
            of which the unread 8-K body text is the bulk.
        expected_rows: The row count the publisher recorded for this file, if
            any. Checked against the parquet footer before the read, so a
            truncated or substituted file fails rather than loading short.

    Returns:
        The dataset as a Pandas DataFrame.

    Raises:
        `RuntimeError` if the path is not a single parquet file, cannot be read
            as one, or holds a different number of rows than `expected_rows`.
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
        if expected_rows is not None:
            actual_rows = pq.ParquetFile(path).metadata.num_rows
            if actual_rows != expected_rows:
                raise RuntimeError(
                    f"The {label} parquet file at {path} holds {actual_rows} rows "
                    f"but its publisher recorded {expected_rows}."
                )
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
