"""Commercial-debt attach: resolves CDT debt-instrument extractions to instruments and holdings on the built company records."""

# Standard library imports
import logging
from collections import Counter
from urllib.parse import quote

# Third-party imports
import pandas as pd

# Local imports
from constants import (
    CDT_DASHBOARD_URL,
    CDT_FORM_TYPE_8K,
    CDT_ITEM_COLUMNS,
    CDT_LENDER_DISCLOSURE_COLLECTIVE_PRESENT,
    CDT_MEMBER_EDGE_TYPE,
    CIK_WIDTH,
    DEBT_CLOSED_STATUSES,
    DEBT_STATUS_LABELS,
    DEBT_STATUS_RENDERED_LABELS,
    DEBT_STATUS_UNKNOWN,
)
from helpers import (
    _clean,
    extract_parties,
    parse_amount,
    parse_iso_date,
)
from lifecycle import InstrumentStatus, derive_statuses
from output import normalize_cik


def build_debt_source_name(form_type: str | None, item: str | None) -> str:
    """Names the citation after the filing the instrument was disclosed in.

    Parallel to `build_source_name` for corporate structure: the citation says
    which part of which form it came from. An 8-K citation carries its item --
    1.01 and 1.02 (entering and terminating a material definitive agreement),
    2.03 and 2.04 (creating and accelerating a financial obligation), 7.01
    (Regulation FD), 8.01 (other events) -- the number EDGAR itself labels them
    with. A 6-K has no items; its `item` is CDT's internal window id, which means
    nothing to a reader, so the citation names the form alone.

    Args:
        form_type: `items.form_type`, `"8-K"` or `"6-K"`. Defaults to 8-K when
            blank.
        item: `items.item`.

    Returns:
        A source name such as `"SEC 8-K Item 1.01"` or `"SEC 6-K"`.
    """
    form = form_type or CDT_FORM_TYPE_8K
    if form != CDT_FORM_TYPE_8K or not item:
        return f"SEC {form}"
    return f"SEC {form} Item {item}"


# The `debt-instruments` columns `lifecycle.derive_status` reads, and the
# `debt-instrument-mentions` columns it reads (`decisive_event`,
# `planned_retirement_date`, `expected_start`, `recency_key`).
_LIFECYCLE_INSTRUMENT_COLUMNS: tuple[str, ...] = (
    "debt_instrument_id",
    "superseded_by_debt_instrument_id",
    "is_lineage_head",
    "retired_by_debt_instrument_ids",
    "maturity_date",
    "commitment_termination_date",
    "start_date",
)
_LIFECYCLE_DATE_COLUMNS: tuple[str, ...] = (
    "maturity_date",
    "commitment_termination_date",
    "start_date",
)
_LIFECYCLE_MENTION_COLUMNS: tuple[str, ...] = (
    "debt_instrument_mention_id",
    "date",
    "accession_number",
    "item_id",
    "status",
    "status_date",
    "dates_json",
)


def _lifecycle_records(df: pd.DataFrame, columns: tuple[str, ...]) -> list[dict]:
    """Turns frame rows into the plain dicts `lifecycle.py` was written against.

    The CDT dashboard hands `lifecycle.py` rows read with pyarrow, where a
    missing value is `None`. A pandas frame holds `NaN` instead, and `NaN` is
    truthy: `if not status` would let a blank status through as a decisive
    event, and `retired_by_ids` would parse the string "nan". So every missing
    cell becomes `None` here, and the vendored module stays untouched.
    """
    subset = df[list(columns)].astype(object)
    return subset.where(subset.notna(), None).to_dict("records")


def derive_debt_statuses(
    instruments_df: pd.DataFrame,
    mentions_df: pd.DataFrame,
    edges_df: pd.DataFrame,
    run_date: str,
) -> dict[str, InstrumentStatus]:
    """Every instrument's status, decided exactly as the CDT dashboard decides it.

    The inputs are assembled the way the dashboard's publisher assembles them
    (`build_snapshot` in its `snapshot.py`): an instrument's mentions are those
    a `member` edge in `mention-cluster-edges` assigns to it, and the reference
    date is the build date. `lifecycle.derive_statuses` then decides. It reads
    the maturity and the commitment termination date (the later governs, so a
    revolver whose filing gives only a commitment end is dated by it), the
    newest decisive event among the mentions (repaid, terminated, exchanged,
    defaulted, announced), planned retirements and closings, amendment
    lineage, and retirement pointers.

    One input is normalized first: an instrument date that does not parse is
    read as absent. CDT's contract makes these ISO dates, so on contract data
    this changes nothing; off it, `lifecycle.py` compares dates as strings, and
    "as soon as practicable" would sort after every real date and read as a
    maturity still ahead.

    Args:
        instruments_df: The debt-instruments dataset.
        mentions_df: The debt-instrument-mentions dataset.
        edges_df: The mention-cluster-edges dataset, read narrow per
            `CDT_EDGE_COLUMNS`.
        run_date: ISO-8601 date this build ran.

    Returns:
        Each `debt_instrument_id` mapped to its `InstrumentStatus`.
    """
    instruments = _lifecycle_records(instruments_df, _LIFECYCLE_INSTRUMENT_COLUMNS)
    for instrument in instruments:
        for column in _LIFECYCLE_DATE_COLUMNS:
            instrument[column] = parse_iso_date(instrument[column])
        # `derive_status` tests `is_lineage_head is False`, which a numpy bool
        # would fail.
        head = instrument["is_lineage_head"]
        instrument["is_lineage_head"] = None if head is None else bool(head)

    mention_by_id = {
        str(mention["debt_instrument_mention_id"]): mention
        for mention in _lifecycle_records(mentions_df, _LIFECYCLE_MENTION_COLUMNS)
        if mention["debt_instrument_mention_id"] is not None
    }
    members = edges_df[edges_df["edge_type"] == CDT_MEMBER_EDGE_TYPE]
    mentions_by_instrument: dict[str, list[dict]] = {}
    for mention_id, instrument_id in zip(
        members["debt_instrument_mention_id"],
        members["debt_instrument_id"],
        strict=True,
    ):
        mention = mention_by_id.get(str(mention_id))
        if mention is not None:
            mentions_by_instrument.setdefault(str(instrument_id), []).append(mention)

    return derive_statuses(
        instruments, mentions_by_instrument, reference_date=run_date
    )


def debt_status_label(status: InstrumentStatus) -> str:
    """How a rendered status reads -- the CDT dashboard's `formatStatus`.

    Args:
        status: A status outside `DEBT_CLOSED_STATUSES`.

    Returns:
        A member of the `status` union in `web/src/types/domain.ts`, such as
        `"Active"`, `"Active - likely"`, or `"Unknown"`.

    Raises:
        `RuntimeError` if `lifecycle.py` returned a status, or a status and
            subtype, this build has no label for -- a newer copy of it added
            one, and the frontend type needs the new member before it can ship.
    """
    if status.status is None:
        return DEBT_STATUS_UNKNOWN
    label = DEBT_STATUS_LABELS.get(status.status)
    if label is None:
        raise RuntimeError(
            f"lifecycle.py returned the debt status {status.status!r}, which "
            "has no label in `DEBT_STATUS_LABELS`. Add it there and to the "
            "`status` union in `web/src/types/domain.ts`."
        )
    rendered = f"{label} - {status.subtype}" if status.subtype else label
    if rendered not in DEBT_STATUS_RENDERED_LABELS:
        raise RuntimeError(
            f"lifecycle.py returned the debt status {status.status!r} with the "
            f"subtype {status.subtype!r}, which reads {rendered!r} -- not a "
            "label in `DEBT_STATUS_RENDERED_LABELS`. Add it there and to the "
            "`status` union in `web/src/types/domain.ts`."
        )
    return rendered


def resolve_debt_documents(
    instruments_df: pd.DataFrame,
    mentions_df: pd.DataFrame,
    items_df: pd.DataFrame,
    logger: logging.Logger,
) -> pd.DataFrame:
    """Joins each debt instrument to the 8-K it was extracted from.

    `debt-instruments` carries no provenance at all -- no document link, filing
    date, accession number, or access date -- so a citation is only possible
    through the two sibling CDT outputs:

        debt-instruments.seed_debt_instrument_mention_id
          -> debt-instrument-mentions.debt_instrument_mention_id
          -> debt-instrument-mentions.item_id
          -> items.item_id                      (url, date, item, form_type)

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
        `instruments_df` with `url`, `date`, `item`, and `form_type` attached.
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
        mentions[["debt_instrument_mention_id", "item_id"]],
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
    site for a rule about invisible data. Closed instruments -- matured, repaid,
    superseded, and the rest of `DEBT_CLOSED_STATUSES` -- are outside the mask
    for the same reason.

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
            "they are closed -- so the build continues. This is "
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
        status: The instrument's status label, from `debt_status_label`.
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
                "name": build_debt_source_name(
                    _clean(row["form_type"]), _clean(row["item"])
                ),
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
        # The instrument's page on the CDT dashboard. The id is percent-encoded
        # whole (`di::` becomes `di%3A%3A`), as the dashboard's own links do.
        "cdtUrl": f"{CDT_DASHBOARD_URL}/debt-instrument/"
        f"{quote(str(row['debt_instrument_id']), safe='')}",
        "parties": extract_parties(row["parties_json"], logger),
        # The filings also describe lenders they never name. The CDT dashboard
        # ends such an instrument's lender list with "other lenders not
        # named"; the frontend notes it the same way, saying "lenders not
        # named" when no lender is named at all.
        "unnamedLenders": _clean(row["lender_disclosure"])
        == CDT_LENDER_DISCLOSURE_COLLECTIVE_PRESENT,
        # Amount and currency come from one CDT mention together, so the code
        # cannot detach from its figure. Nothing is converted: no CDT output
        # supplies an FX rate, so the spec's "Amount USD" cannot be produced, and
        # the code travels with the number for the UI to show.
        "amount": parse_amount(row["principal_amount"]),
        "currency": _clean(row["principal_currency"]),
        "startDate": parse_iso_date(row["start_date"]),
        "endDate": parse_iso_date(row["maturity_date"]),
        # A revolver's filing often states when the commitment ends rather
        # than a maturity. Status already reads it; this lets the row show it.
        "commitmentEndDate": parse_iso_date(row["commitment_termination_date"]),
        "status": status,
    }


def attach_commercial_debt(
    companies: list[dict],
    instruments_df: pd.DataFrame,
    mentions_df: pd.DataFrame,
    items_df: pd.DataFrame,
    edges_df: pd.DataFrame,
    run_date: str,
    logger: logging.Logger,
) -> None:
    """Attaches in-scope debt instruments to the companies that borrowed.

    Mutates `companies` in place, filling `currentCommercialDebt`.

    Scope is the CDT dashboard's lifecycle, not an end-date cutoff: every
    instrument `derive_debt_statuses` does not call closed renders, labelled
    with its status. That departs from the FTM2J tech spec, which admits an
    instrument only when its end date is in the future and so would discard the
    majority whose filings state none. Closed instruments -- matured, repaid,
    terminated, exchanged, defaulted, or superseded -- are excluded, as the
    spec requires; the terminal and the dashboard agree on which those are
    because both run the same `lifecycle.py`.

    Args:
        companies: `Company` records, each carrying a `registrants` list.
        instruments_df: The debt-instruments dataset.
        mentions_df: The debt-instrument-mentions dataset.
        items_df: The items dataset.
        edges_df: The mention-cluster-edges dataset.
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
    # filtered out as closed is a legitimate outcome for a small
    # dataset, and conflating it with a padding bug makes the guard fire on
    # correct input.
    if len(resolved) and not known_cik.any():
        raise RuntimeError(
            "The CDT CIK join matched no companies. Sample instrument CIK: "
            f"{resolved['cik'].iloc[0]}; sample company CIK: "
            f"{companies[0]['cik'] if companies else 'n/a'}. Both must be "
            f"zero-padded to {CIK_WIDTH} digits."
        )

    statuses = derive_debt_statuses(instruments_df, mentions_df, edges_df, run_date)
    status_of = resolved["debt_instrument_id"].map(lambda value: statuses[str(value)])
    closed = status_of.map(lambda status: status.status in DEBT_CLOSED_STATUSES)

    # The set that reaches a page, and so the set that must be citable. Unknown
    # CIKs were previously built and then dropped by the loop below, which read
    # only its own registrants -- the output is the same, but the citation guard
    # now covers exactly what ships rather than the whole file.
    renders = known_cik & ~closed
    require_renderable_citations(resolved, renders, logger)

    in_scope = resolved[renders]
    labels = [debt_status_label(status) for status in status_of[renders]]

    by_cik: dict[str, list[dict]] = {}
    for (_, row), status in zip(in_scope.iterrows(), labels, strict=True):
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

    # Counted off the records rather than off `labels`, which also holds
    # instruments belonging to a CIK that no company page covers. Reporting those
    # as attached would overstate coverage by exactly the rows that went nowhere.
    attached = Counter(
        instrument["status"]
        for company in companies
        for instrument in company["currentCommercialDebt"]
    )
    logger.info(
        "Attached %d debt instruments to %d of %d companies; %d have no "
        "in-scope commercial debt. By status: %s.",
        attached.total(),
        matched,
        len(companies),
        len(companies) - matched,
        _format_counts(attached),
    )

    # Exclusions are reported over the population that could have been rendered
    # -- instruments whose CIK has a company page -- so the numbers add up
    # against the attached count above rather than against the whole file.
    excluded = Counter(
        f"{status.status} - {status.subtype}" if status.subtype else status.status
        for status in status_of[known_cik & closed]
    )
    logger.info(
        "Excluded %d closed instruments of those whose CIK has a company page, "
        "as of %s: %s. A further %d in-scope instruments belong to %d CIKs "
        "that company-info has not resolved to a PermID, so they are not "
        "rendered anywhere.",
        excluded.total(),
        run_date,
        _format_counts(excluded) or "none",
        int((~known_cik & ~closed).sum()),
        resolved.loc[~known_cik, "cik"].nunique(),
    )


def _format_counts(counts: Counter) -> str:
    """Renders a `Counter` as `"Active 3, Unknown 1"`, largest first."""
    return ", ".join(f"{key} {count}" for key, count in counts.most_common())
