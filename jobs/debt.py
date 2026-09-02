"""Commercial-debt attach: resolves CDT debt-instrument extractions to instruments and holdings on the built company records."""

# Standard library imports
import json
import logging

# Third-party imports
import pandas as pd

# Local imports
from constants import (
    CDT_FORM_TYPE,
    CDT_ITEM_COLUMNS,
    CIK_WIDTH,
    DEBT_STATUS_ACTIVE,
    DEBT_STATUS_UNDATED,
)
from helpers import (
    _clean,
    extract_lender_labels,
    parse_amount,
    parse_iso_date,
)
from output import normalize_cik


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
