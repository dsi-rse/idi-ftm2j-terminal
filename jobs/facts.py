"""Company-facts attach: each registrant's most recent 10-K / 20-F cover-page facts.

Facts are per-registrant scalars keyed on the registrant's CIK -- public float,
revenue, shares outstanding, the shell-company flag -- read off the company-facts
processor output and attached to `registrants[].facts` on the built company
records. Nothing is summed or maxed across a company's registrants: an operating
partnership and its REIT each carry their own figures.
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


def build_registrant_facts(row: pd.Series) -> dict:
    """Builds a `RegistrantFacts` record from one company-facts row.

    Mirrors `web/src/types/domain.ts::RegistrantFacts`. Every monetary figure
    carries its own currency and as-of date because the cover-page concepts are
    measured on different dates, and currencies are never converted -- a foreign
    filer's figures stay in their reported currency, matching the commercial-debt
    amount rule. The one source is the filing's primary document.

    Args:
        row: A single row of the company-facts dataset, already selected as the
            registrant's most recent in-scope filing.

    Returns:
        A dict matching the serialized `RegistrantFacts` type.
    """
    form_type = _clean(row["form_type"]) or ""

    public_float = parse_amount(row["market_value"])
    revenue = parse_amount(row["revenue"])
    shares = parse_amount(row["shares_outstanding"])

    report_date = parse_iso_date(row["report_date"])
    filing_date = parse_iso_date(row["filing_date"])
    last_accessed = parse_iso_date(row["last_accessed"])

    primary_url = _clean(row["primary_url"])
    sources = (
        [
            {
                "name": f"SEC {form_type or 'filing'}",
                "url": primary_url,
                "lastAccessed": last_accessed,
            }
        ]
        if primary_url and last_accessed
        else []
    )

    return {
        # CitedEntity -- the SEC filing the facts were extracted from.
        "sources": sources,
        # SnapshotEntity -- the fiscal period the filing reports on, falling back
        # to the filing date, then the access date, so `asOf` is never null.
        "asOf": report_date or filing_date or last_accessed,
        # A currency is only meaningful alongside a figure, so it is carried only
        # when its figure is present.
        "publicFloat": public_float,
        "publicFloatCurrency": (
            _clean(row["market_value_currency"]) if public_float is not None else None
        ),
        "publicFloatAsOf": parse_iso_date(row["market_value_as_of_date"]),
        "revenue": revenue,
        "revenueCurrency": (
            _clean(row["revenue_currency"]) if revenue is not None else None
        ),
        "revenueAsOf": parse_iso_date(row["revenue_as_of_date"]),
        "sharesOutstanding": shares,
        "sharesOutstandingAsOf": parse_iso_date(row["shares_outstanding_as_of_date"]),
        "isShellCompany": parse_shell_flag(row["is_shell_company"]),
        "reportDate": report_date,
        "formType": form_type,
    }


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
    row order.

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
    latest_by_cik = {
        cik: group.iloc[0] for cik, group in facts.groupby("cik", sort=False)
    }

    matched_companies = 0
    matched_registrants = 0
    missing_registrants = 0
    for company in companies:
        attached = False
        for registrant in company["registrants"]:
            row = latest_by_cik.get(registrant["cik"])
            if row is None:
                missing_registrants += 1
                continue
            registrant["facts"] = build_registrant_facts(row)
            matched_registrants += 1
            attached = True
        if attached:
            matched_companies += 1

    logger.info(
        "Attached company facts to %d registrants across %d companies; "
        "%d registrants had no in-scope filing.",
        matched_registrants,
        matched_companies,
        missing_registrants,
    )
    if len(facts) and not matched_registrants:
        logger.warning(
            "The company-facts dataset has %d rows but matched no registrant "
            "CIK. Check that COMPANY_FACTS_FILE_PATH points at the right file.",
            len(facts),
        )
