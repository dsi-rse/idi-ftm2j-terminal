"""Company-info transform: registrants, snapshot selection, and the per-company record built from a PermID's grouped rows."""

# Standard library imports
import logging

# Third-party imports
import pandas as pd

# Local imports
from constants import (
    SCALAR_COMPANY_FIELDS,
)
from helpers import (
    _clean,
    _collect,
    build_listing,
    build_sector,
    build_sources,
    cik_rows,
    parse_address_country,
    parse_iso_date,
    parse_last_processed,
    parse_last_processed_timestamp,
)


def select_primary_cik(ciks: list[str]) -> str | None:
    """Chooses the primary CIK for a company.

    STUB, pending the company-facts processor. Lowest CIK is deterministic --
    CIKs are zero-padded, so string order is numeric order -- but it is
    demonstrably wrong for some registrant groups: it picks Entergy Arkansas
    over Entergy Corp, and NSTAR Electric over Eversource Energy.

    TODO: replace once company-facts lands. The replacement is the
    accession-number prefix, which is the transmitting CIK. Across the 203
    co-registrant accessions in corporate-structure it is one of the group's
    own CIKs 140 times (69%), correctly naming the parent -- including the two
    groups this stub gets wrong. The other 31% are agent-filed, where the
    prefix belongs to the filing agent (mostly 0001047469, Toppan Merrill), so
    it needs a guard: use the prefix only when it matches one of `ciks`.
    Lowest CIK stays the terminal fallback, both for the agent-filed 31% and
    for companies with no filing at all.

    Do NOT reach for the SEC's <FILER> ordering. It looks like an exact
    answer -- one block per co-registrant, apparently parent first, and it
    holds for Huntsman, AEP and Brixmor -- but across 25 self-filed
    co-registrant accessions the first block matches the transmitting CIK only
    18 times (72%), and where it disagrees the real parent sits at position 2,
    3, or 7 of 7 (Southern Co). The ordering is arbitrary, not hierarchical.

    Args:
        ciks: Every CIK rolling up to one PermID.

    Returns:
        The primary CIK, or `None` if the company has no CIK at all.
    """
    return min(ciks) if ciks else None


def build_registrants(
    group: pd.DataFrame, ciks: list[str], primary: str | None, company_as_of: str | None
) -> list[dict]:
    """Builds one Registrant per CIK rolling up to this PermID.

    Each registrant is read off its own CIK's most recent row, so
    `registrantName` is the name last reported against that CIK rather than the
    PermID's name -- "Brixmor Operating Partnership LP" against a company named
    "Brixmor Property Group Inc."

    Args:
        group: All source rows for a single PermID.
        ciks: Every CIK for the PermID, already cleaned and de-duplicated.
        primary: The CIK to mark primary, from `select_primary_cik`.
        company_as_of: The company's observation date, used only as a floor when
            a CIK's own rows carry no parseable stamp.

    Returns:
        Registrant dicts, primary first then ascending by CIK.
    """
    identifiers = group["identifier"].map(_clean)
    is_cik = cik_rows(group["identifier_type"])

    registrants = []
    for cik in ciks:
        rows = group[is_cik & (identifiers == cik)]
        newest = select_latest_snapshot(rows).iloc[0]
        # A CIK whose rows carry no parseable stamp still has to appear --
        # dropping a registrant over a missing date would lose the join key
        # that a whole section depends on.
        as_of = parse_last_processed(newest["last_processed"]) or company_as_of
        registrants.append(
            {
                "sources": build_sources(_clean(newest["permid_url"]), as_of),
                "asOf": as_of,
                "cik": cik,
                "registrantName": _clean(newest["entity_name"]),
                "isPrimary": cik == primary,
            }
        )

    registrants.sort(key=lambda r: (not r["isPrimary"], r["cik"]))
    return registrants


def select_latest_snapshot(group: pd.DataFrame) -> pd.DataFrame:
    """Reduces a PermID's rows to those of its most recent snapshot.

    A PermID gets one row per (source, entity, identifier) link, and rows
    multiply two ways. Several CIKs under one source all read the same
    `permid_data.json`, so every company field including `last_processed` is
    identical. One CIK under several sources was fetched once per source --
    caches are per-source -- so `last_processed` differs and the company fields
    can differ with it, if LSEG changed between runs.

    That second case is what makes `group.iloc[0]` wrong: it picks a snapshot by
    row order. Recency is the discriminator, tie-broken on `input_source` so the
    choice is stable across runs rather than dependent on parquet row order.

    Rows whose `last_processed` cannot be parsed sort as oldest, so any row with
    a real stamp beats them.

    Args:
        group: All source rows for a single PermID.

    Returns:
        The subset of `group` sharing the winning
        `(last_processed, input_source)` partition. Never empty.
    """
    order = pd.DataFrame(
        {
            "ts": group["last_processed"].map(parse_last_processed_timestamp),
            "src": group["input_source"].map(lambda v: _clean(v) or ""),
        },
        index=group.index,
    )
    ranked = order.sort_values(
        ["ts", "src"], ascending=[False, True], na_position="last"
    )
    win_ts = ranked["ts"].iloc[0]
    win_src = ranked["src"].iloc[0]

    if pd.isna(win_ts):
        matches = order["ts"].isna()
    else:
        matches = order["ts"] == win_ts
    return group[matches & (order["src"] == win_src)]


def warn_on_snapshot_divergence(
    group: pd.DataFrame, perm_id: str | None, logger: logging.Logger
) -> None:
    """Warns when rows of a single snapshot disagree on a company-level field.

    Rows sharing an `(input_source, last_processed)` partition were all built
    from one `permid_data.json`, so a disagreement between them should be
    impossible and means something upstream is wrong.

    Divergence *across* snapshots is expected -- that is exactly what
    `select_latest_snapshot` resolves -- and is deliberately not reported here.
    Warning on it would fire for every company reached by more than one source,
    which is noise rather than signal.

    Args:
        group: All source rows for a single PermID.
        perm_id: The PermID, named in the warning.
        logger: A standard logger instance.
    """
    for (source, stamp), partition in group.groupby(
        ["input_source", "last_processed"], dropna=False, sort=False
    ):
        if len(partition) < 2:
            continue
        for column in SCALAR_COMPANY_FIELDS:
            if column not in partition.columns:
                continue
            values = {_clean(value) for value in partition[column]}
            if len(values) > 1:
                logger.warning(
                    'PermID %s: field "%s" holds %d distinct values within one '
                    "snapshot (input_source=%s, last_processed=%s): %s. Rows of "
                    "one snapshot come from a single upstream record, so they "
                    "should agree; the most recent row still wins.",
                    perm_id,
                    column,
                    len(values),
                    source,
                    stamp,
                    ", ".join(repr(v) for v in sorted(values, key=str)),
                )


def transform_company(group: pd.DataFrame, logger: logging.Logger) -> dict:
    """Builds one Company record from all rows sharing a PermID.

    The grain of the source is one row per (identifier_type, identifier), so a
    PermID may carry several CIKs. Company-level fields are read off the most
    recent snapshot; identifiers are collected across every row.

    Args:
        group: All source rows for a single PermID.
        logger: A standard logger instance.

    Returns:
        A dict matching the serialized `Company` type in
        `web/src/types/domain.ts`.
    """
    perm_id = _clean(group.iloc[0]["permid_id"])
    warn_on_snapshot_divergence(group, perm_id, logger)

    latest = select_latest_snapshot(group)
    first = latest.iloc[0]

    as_of = parse_last_processed(first["last_processed"])
    sources = build_sources(_clean(first["permid_url"]), as_of)

    # Tickers come from the winning snapshot only. Collecting across the whole
    # group would surface both sides of a ticker change between runs, producing
    # a listing no single fetch ever reported. Within one snapshot `_collect`
    # still handles a genuinely multi-ticker company.
    tickers = _collect(latest["ticker"])

    # CIKs are the one field collected across ALL rows regardless of recency.
    # company-info is the record of every CIK that rolls up to a PermID, and
    # recency decides field *values*, not which registrants exist -- filtering
    # here would drop a CIK that arrived from a different source.
    ciks = _collect(group.loc[cik_rows(group["identifier_type"]), "identifier"])

    primary_cik = select_primary_cik(ciks)
    registrants = build_registrants(group, ciks, primary_cik, as_of)

    incorporated_country = _clean(first["incorporated_in"])
    hq_country = parse_address_country(first["hq_address"], logger)

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
        "cik": primary_cik,
        "registrants": registrants,
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
        # Filled by `attach_relationships` once the corporate-structure dataset
        # is joined; stays empty for companies with no disclosed subsidiaries.
        "currentCorporateRelationships": [],
        # Filled by `attach_commercial_debt` once the CDT datasets are joined;
        # stays empty for the 4,646 of 4,832 companies with no in-scope debt.
        "currentCommercialDebt": [],
        # Filled by `attach_shareholders` once the shareholder-tracker dataset is
        # joined; stays empty for companies whose issuer CUSIP company-info has
        # not resolved (the majority).
        "currentShareholders": [],
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
