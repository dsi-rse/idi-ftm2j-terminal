"""Parquet IO for `build_dataset`.

Named `io_utils` rather than `io` on purpose: a top-level `io` module would
shadow the standard library's, which pandas and pyarrow import.
"""

# Standard library imports
from pathlib import Path

# Third-party imports
import pandas as pd

# Local imports
from constants import CIK_WIDTH


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
