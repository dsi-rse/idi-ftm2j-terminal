"""Company-facts attach: each registrant's most recent 10-K / 20-F cover-page facts.

Facts are per-registrant scalars keyed on the registrant's CIK -- public float,
revenue, shares outstanding, the shell-company flag -- read off the company-facts
processor output and attached to `registrants[].facts` on the built company
records. Nothing is summed or maxed across a company's registrants: an operating
partnership and its REIT each carry their own figures.

Each figure carries its own citation rather than sharing one filing's. An
amendment (10-K/A) re-tags the cover page but usually leaves the financial
statements untagged when they were not amended, so the newest filing for a
fiscal period can carry public float and shares outstanding while reporting no
revenue at all. Reading only that filing would drop a revenue the original 10-K
reported. So a figure missing from the newest filing is backfilled from an
earlier filing *for the same fiscal period*, and the figure records which filing
it actually came from.
"""

# Standard library imports
import logging

# Third-party imports
import pandas as pd

# Local imports
from helpers import _clean, parse_amount, parse_iso_date
from output import normalize_cik


def parse_shell_flag(value: object) -> bool | None:
    """Reads the `is_shell_company` cell to a bool, or None when unreported.

    The processor writes `"true"`/`"false"`, and `""` for a filing that carries
    no shell-company flag at all. An absent flag is not the same as `false`, so
    it maps to None rather than being coerced.

    Args:
        value: A raw `is_shell_company` cell.

    Returns:
        `True`, `False`, or `None` when the flag is absent or unrecognized.
    """
    text = _clean(value)
    if text is None:
        return None
    lowered = text.casefold()
    if lowered == "true":
        return True
    if lowered == "false":
        return False
    return None


def build_source(row: pd.Series) -> dict | None:
    """Builds the `Source` citing one filing's primary document.

    Args:
        row: A single row of the company-facts dataset.

    Returns:
        A dict matching the serialized `Source` type, or None when the row
        carries no URL or no access date to cite.
    """
    primary_url = _clean(row["primary_url"])
    last_accessed = parse_iso_date(row["last_accessed"])
    if not primary_url or not last_accessed:
        return None
    form_type = _clean(row["form_type"]) or "filing"
    return {
        "name": f"SEC {form_type}",
        "url": primary_url,
        "lastAccessed": last_accessed,
    }


def build_figure(
    rows: list[pd.Series],
    value_column: str,
    as_of_column: str,
    currency_column: str | None = None,
) -> dict | None:
    """Builds a `CitedFigure` from the first filing that reports the figure.

    `rows` is newest filing first, so the newest report of a figure wins and an
    older filing is read only for what the newer one leaves untagged. The
    currency and as-of date always come from the same row as the value -- a
    figure is never assembled from two filings.

    Args:
        rows: The candidate filings, newest first, all for one fiscal period.
        value_column: The column holding the figure.
        as_of_column: The column holding the date the figure is measured as of.
        currency_column: The column holding the figure's ISO 4217 currency, or
            None for a non-monetary count.

    Returns:
        A dict matching the serialized `CitedFigure` type, or None when no
        filing reports the figure.
    """
    for row in rows:
        value = parse_amount(row[value_column])
        if value is None:
            continue
        return {
            "sources": [source] if (source := build_source(row)) else [],
            "value": value,
            "currency": _clean(row[currency_column]) if currency_column else None,
            "asOf": parse_iso_date(row[as_of_column]),
            "formType": _clean(row["form_type"]) or "",
        }
    return None


def build_shell_flag(rows: list[pd.Series]) -> dict | None:
    """Builds a `CitedFlag` from the first filing that reports the shell flag.

    Args:
        rows: The candidate filings, newest first, all for one fiscal period.

    Returns:
        A dict matching the serialized `CitedFlag` type, or None when no filing
        reports the flag.
    """
    for row in rows:
        value = parse_shell_flag(row["is_shell_company"])
        if value is None:
            continue
        return {
            "sources": [source] if (source := build_source(row)) else [],
            "value": value,
            "formType": _clean(row["form_type"]) or "",
        }
    return None


def build_registrant_facts(rows: list[pd.Series]) -> dict:
    """Builds a `RegistrantFacts` record from one registrant's filings.

    Mirrors `web/src/types/domain.ts::RegistrantFacts`. Every monetary figure
    carries its own currency and as-of date because the cover-page concepts are
    measured on different dates, and currencies are never converted -- a foreign
    filer's figures stay in their reported currency, matching the commercial-debt
    amount rule. Each figure also carries its own source, since an amendment and
    the filing it amends can each supply part of the record.

    Args:
        rows: The registrant's filings for one fiscal period, newest first. The
            first row is the record's base: it fixes `reportDate` and `asOf`,
            and its figures win wherever it reports them.

    Returns:
        A dict matching the serialized `RegistrantFacts` type.
    """
    base = rows[0]
    report_date = parse_iso_date(base["report_date"])
    filing_date = parse_iso_date(base["filing_date"])
    last_accessed = parse_iso_date(base["last_accessed"])

    public_float = build_figure(
        rows, "market_value", "market_value_as_of_date", "market_value_currency"
    )
    revenue = build_figure(rows, "revenue", "revenue_as_of_date", "revenue_currency")
    shares = build_figure(
        rows, "shares_outstanding", "shares_outstanding_as_of_date"
    )
    shell = build_shell_flag(rows)

    # The record's own `sources` is the union of what its figures cite, in the
    # order the filings were considered, so a merged record cites the amendment
    # and the filing it amends -- and a record whose figures all came from one
    # filing still cites exactly that one.
    cited: list[dict] = []
    seen: set[str] = set()
    for field in (public_float, revenue, shares, shell):
        for source in field["sources"] if field else []:
            if source["url"] not in seen:
                seen.add(source["url"])
                cited.append(source)
    # A record with no figures at all cites its base filing, so it is never
    # uncited: `reportDate`, `asOf` and `formType` are themselves claims.
    if not cited and (source := build_source(base)):
        cited.append(source)

    return {
        # CitedEntity -- every filing that contributed a figure.
        "sources": cited,
        # SnapshotEntity -- the fiscal period the filing reports on, falling back
        # to the filing date, then the access date, so `asOf` is never null.
        "asOf": report_date or filing_date or last_accessed,
        "publicFloat": public_float,
        "revenue": revenue,
        "sharesOutstanding": shares,
        "isShellCompany": shell,
        # Shared by every filing merged into the record -- they are only merged
        # when their report dates match.
        "reportDate": report_date,
    }


def select_period_filings(group: pd.DataFrame) -> list[pd.Series]:
    """Picks one registrant's filings for its most recent fiscal period.

    `group` is one CIK's rows, already sorted newest first, so its first row is
    the winning filing. The rows returned alongside it are the earlier filings
    for the *same* `report_date` -- an amendment and the 10-K it amends. Only
    those are merge candidates: backfilling across fiscal periods would present
    last year's revenue as this year's.

    A filing whose `report_date` will not parse cannot be shown to cover the
    same period as anything else, so it is returned alone rather than merged on
    a guess.

    Args:
        group: One CIK's rows, sorted by `_report` then `_filing`, descending.

    Returns:
        The base filing first, then any earlier filing for the same period.
    """
    base = group.iloc[0]
    period = base["_report"]
    if pd.isna(period):
        return [base]
    same_period = group[group["_report"].eq(period)]
    return [row for _, row in same_period.iterrows()]


def attach_company_facts(
    companies: list[dict],
    facts_df: pd.DataFrame,
    logger: logging.Logger,
) -> None:
    """Attaches each registrant's most recent 10-K / 20-F facts.

    Mutates `companies` in place, filling `registrants[].facts`. Facts are
    per-registrant scalars keyed on `company_cik`, so each registrant reads only
    its own CIK's filings -- an operating partnership and its REIT get their own
    figures, never a value maxed or summed across a company's registrants.

    A CIK can carry several years of filings; the most recent by `report_date`
    (tie-broken on `filing_date`) wins, so the choice does not depend on parquet
    row order. Where that winner is an amendment that left a figure untagged,
    the figure is backfilled from an earlier filing for the same `report_date`
    -- see `select_period_filings` and `build_figure`.

    Args:
        companies: `Company` records, each carrying a `registrants` list.
        facts_df: The raw company-facts dataset.
        logger: A standard logger instance.
    """
    facts = facts_df.copy()
    facts["cik"] = normalize_cik(facts["company_cik"])
    # Most recent first, so the first row of each CIK group is the winner.
    # Unparseable dates sort last, beaten by any filing carrying a real stamp.
    facts["_report"] = pd.to_datetime(facts["report_date"], errors="coerce", utc=True)
    facts["_filing"] = pd.to_datetime(facts["filing_date"], errors="coerce", utc=True)
    facts = facts.sort_values(
        ["_report", "_filing"], ascending=False, na_position="last"
    )
    filings_by_cik = {
        cik: select_period_filings(group)
        for cik, group in facts.groupby("cik", sort=False)
    }

    matched_companies = 0
    matched_registrants = 0
    missing_registrants = 0
    merged_registrants = 0
    for company in companies:
        attached = False
        for registrant in company["registrants"]:
            rows = filings_by_cik.get(registrant["cik"])
            if rows is None:
                missing_registrants += 1
                continue
            record = build_registrant_facts(rows)
            registrant["facts"] = record
            matched_registrants += 1
            if len(record["sources"]) > 1:
                merged_registrants += 1
            attached = True
        if attached:
            matched_companies += 1

    logger.info(
        "Attached company facts to %d registrants across %d companies; "
        "%d drew figures from more than one filing; "
        "%d registrants had no in-scope filing.",
        matched_registrants,
        matched_companies,
        merged_registrants,
        missing_registrants,
    )
    if len(facts) and not matched_registrants:
        logger.warning(
            "The company-facts dataset has %d rows but matched no registrant "
            "CIK. Check that COMPANY_FACTS_FILE_PATH points at the right file.",
            len(facts),
        )
