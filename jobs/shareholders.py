"""Shareholder attach: resolves shareholder-tracker holdings to their issuer via the CUSIP->PermID map and attaches them to company records."""

# Standard library imports
import logging

# Third-party imports
import pandas as pd

# Local imports
from constants import (
    IDENTIFIER_TYPE_CUSIP,
    SHAREHOLDER_INVESTOR_TYPE_INSTITUTIONAL,
    SHAREHOLDER_SOURCE_NAME_13F,
    SHAREHOLDER_SOURCE_NAME_FALLBACK,
)
from helpers import (
    _clean,
    parse_last_processed_timestamp,
)


def build_issuer_cusip_map(
    company_info_df: pd.DataFrame, logger: logging.Logger
) -> dict[str, str]:
    """Maps a security CUSIP to the issuer's PermID, using company-info.

    The shareholder-tracker output identifies each holding's issuer by the
    security's CUSIP, never by a PermID. company-info is where that CUSIP was
    resolved: its `identifier_type == "cusip"` rows carry the CUSIP in
    `identifier` and the resolved issuer in `permid_id`. This is the only path
    from a holding to a company page, and it is why coverage is bounded by
    company-info's resolution rather than by anything the frontend does.

    A CUSIP identifies a single issuer, so it should resolve to one PermID. When
    company-info nonetheless carries the same CUSIP against different PermIDs,
    the most recent snapshot wins -- `last_processed` descending, tie-broken on
    `input_source` -- the same discriminator as `select_latest_snapshot`, so the
    choice is stable across runs rather than dependent on parquet row order.
    Conflicts are logged, since they point at an upstream anomaly.

    Args:
        company_info_df: The raw company-info dataset.
        logger: A standard logger instance.

    Returns:
        A dict from CUSIP to PermID. A CUSIP with no resolved PermID is omitted.
    """
    cusip_rows = company_info_df[
        company_info_df["identifier_type"].astype(str).str.strip().str.casefold()
        == IDENTIFIER_TYPE_CUSIP
    ]
    # Order rows most-recent-snapshot first so the first row seen for each CUSIP
    # is the winner; `input_source` breaks ties for a build-stable choice, and
    # unparseable stamps sort last. Mirrors `select_latest_snapshot`.
    order = pd.DataFrame(
        {
            "ts": cusip_rows["last_processed"].map(parse_last_processed_timestamp),
            "src": cusip_rows["input_source"].map(lambda v: _clean(v) or ""),
        },
        index=cusip_rows.index,
    )
    ranked = cusip_rows.loc[
        order.sort_values(
            ["ts", "src"], ascending=[False, True], na_position="last"
        ).index
    ]

    mapping: dict[str, str] = {}
    conflicts: dict[str, set[str]] = {}
    for cusip, permid in zip(ranked["identifier"], ranked["permid_id"], strict=True):
        clean_cusip = _clean(cusip)
        clean_permid = _clean(permid)
        if not (clean_cusip and clean_permid):
            continue
        winner = mapping.get(clean_cusip)
        if winner is None:
            mapping[clean_cusip] = clean_permid
        elif winner != clean_permid:
            # Same CUSIP, two issuers: an upstream anomaly. The most recent
            # snapshot already won (rows are recency-ordered); record the loser
            # only so the conflict is surfaced rather than silent.
            conflicts.setdefault(clean_cusip, {winner}).add(clean_permid)

    if conflicts:
        examples = ", ".join(
            f"{cusip}->{sorted(pids)}" for cusip, pids in list(conflicts.items())[:5]
        )
        logger.warning(
            "%d CUSIP(s) resolved to multiple PermIDs in company-info; kept the "
            "most recent snapshot's PermID for each. Examples: %s",
            len(conflicts),
            examples,
        )
    return mapping


def build_shareholder_source_name(investor_type: str | None, source: str | None) -> str:
    """Names the citation for one shareholding.

    Institutional holdings all come from SEC 13-F filings under a generic
    `source`, so they are named for the filing. Pension-fund holdings carry the
    fund's own name in `source`, which is a more useful citation than a generic
    label.

    Args:
        investor_type: The row's `investor_type`.
        source: The row's `source`.

    Returns:
        A citation name, never empty.
    """
    if _clean(investor_type) == SHAREHOLDER_INVESTOR_TYPE_INSTITUTIONAL:
        return SHAREHOLDER_SOURCE_NAME_13F
    return _clean(source) or SHAREHOLDER_SOURCE_NAME_FALLBACK


def _json_number(value: object) -> int | float | None:
    """Coerces one parsed numeric cell to a JSON-safe number or None.

    `json.dump` cannot serialize a numpy scalar, and a NaN must become null
    rather than the invalid JSON token `NaN`. Integers are emitted without a
    trailing `.0`.
    """
    if value is None or pd.isna(value):
        return None
    number = float(value)
    return int(number) if number.is_integer() else number


def _iso_date_column(values: pd.Series) -> list[str | None]:
    """Vectorized `parse_iso_date` over a whole column.

    Per-cell parsing is too slow at the shareholder-tracker's scale (~1.7M
    resolved rows), so dates are parsed once as a column and NaT becomes None.
    """
    parsed = pd.to_datetime(values, errors="coerce", utc=True).dt.strftime("%Y-%m-%d")
    return [None if pd.isna(text) else text for text in parsed.tolist()]


def _stripped_column(values: pd.Series) -> list[str | None]:
    """Vectorized `_clean` over a whole column: stripped string, or None."""
    stripped = values.fillna("").astype(str).str.strip()
    return [text or None for text in stripped.tolist()]


def attach_shareholders(
    companies: list[dict],
    shareholders_df: pd.DataFrame,
    company_info_df: pd.DataFrame,
    logger: logging.Logger,
) -> None:
    """Attaches disclosed shareholdings to the companies they are holdings in.

    Mutates `companies` in place, filling `currentShareholders`.

    The join is on the issuer's CUSIP resolved to a PermID through company-info
    (`build_issuer_cusip_map`), NOT on a registrant CIK -- a holding is a stake
    in the *issuer*, and the issuer is identified by the security's CUSIP. No
    recency, ownership, or security-type filter is applied, per the issue: every
    resolved holding is attached, one row per holding (share classes are not
    collapsed).

    Args:
        companies: `Company` records keyed by `permId`.
        shareholders_df: The shareholder-tracker dataset.
        company_info_df: The company-info dataset, for the CUSIP->PermID map.
        logger: A standard logger instance.

    Raises:
        `RuntimeError` if the CUSIP join matches no issuer at all -- the same
            silent-zero guard the CIK joins carry. A key-format break (a
            prefixed CUSIP column, or company-info emitting no cusip rows) would
            otherwise leave every page's Shareholders section empty with no
            error. An individual unresolved CUSIP is expected and never fatal.
    """
    cusip_to_permid = build_issuer_cusip_map(company_info_df, logger)

    permids = shareholders_df["security_cusip"].astype(str).str.strip().map(
        cusip_to_permid
    )
    resolved_mask = permids.notna()

    # Guard the JOIN, not the attachment: a total miss means the two sides no
    # longer share a key format, which is a data-integrity bug invisible in the
    # logs. A partial miss is the normal steady state -- most CUSIPs in the file
    # are never resolved by company-info.
    if len(shareholders_df) and not resolved_mask.any():
        raise RuntimeError(
            "The shareholder CUSIP join matched no issuers. company-info carries "
            f"{len(cusip_to_permid)} CUSIP-keyed rows. The shareholder "
            "`security_cusip` and company-info's cusip `identifier` must be the "
            "same format."
        )

    permids_by_company = {company["permId"]: company for company in companies}

    # Keep only holdings that both resolve and land on a company that has a page;
    # a resolved CUSIP whose PermID has no record cannot render anywhere.
    renderable = resolved_mask & permids.isin(permids_by_company.keys())
    holdings_df = shareholders_df[renderable]
    holding_permids = permids[renderable].tolist()

    # Everything below is column-vectorized: per-cell parsing (parse_iso_date,
    # parse_amount, _clean) is far too slow across ~1.7M resolved rows. Parse
    # each column once, then a single Python pass assembles the records.
    names = _stripped_column(holdings_df["investor_name"])
    types = _stripped_column(holdings_df["investor_type"])
    countries = _stripped_column(holdings_df["investor_country_name"])
    security_types = _stripped_column(holdings_df["security_type"])
    urls = _stripped_column(holdings_df["url"])
    sources = _stripped_column(holdings_df["source"])
    as_of_dates = _iso_date_column(holdings_df["document_report_date"])
    accessed_dates = _iso_date_column(holdings_df["last_accessed_date"])
    shares = [
        _json_number(v)
        for v in pd.to_numeric(
            holdings_df["stock_number_of_shares"], errors="coerce"
        ).tolist()
    ]
    values = [
        _json_number(v)
        for v in pd.to_numeric(
            holdings_df["security_market_value_amount_usd"], errors="coerce"
        ).tolist()
    ]

    by_permid: dict[str, list[dict]] = {}
    for i, permid in enumerate(holding_permids):
        by_permid.setdefault(permid, []).append(
            {
                "sources": [
                    {
                        "name": build_shareholder_source_name(types[i], sources[i]),
                        "url": urls[i],
                        "lastAccessed": accessed_dates[i],
                    }
                ],
                "asOf": as_of_dates[i],
                # investor.permId is null: holders are not linked to their own
                # pages yet, though most resolve. See the plan's decision 4.
                "investor": {"name": names[i], "permId": None},
                # Coerced to "" (never None): the FE type declares investorType a
                # non-null string and searches it with an unguarded
                # `.toLowerCase()`, so a blank cell must not surface as null.
                "investorType": types[i] or "",
                "investorCountry": countries[i],
                "securityType": security_types[i],
                "sharesOwned": shares[i],
                "marketValueUsd": values[i],
            }
        )

    matched = 0
    for company in companies:
        holdings = by_permid.get(company["permId"])
        if not holdings:
            continue
        # Descending by USD market value, nulls last, so the largest holder
        # leads; investor name breaks ties for a stable order across runs.
        holdings.sort(
            key=lambda h: (
                h["marketValueUsd"] is not None,
                h["marketValueUsd"] or 0,
                h["investor"]["name"] or "",
            ),
            reverse=True,
        )
        company["currentShareholders"] = holdings
        matched += 1

    attached = sum(len(company["currentShareholders"]) for company in companies)
    logger.info(
        "Attached %d shareholdings to %d of %d companies; %d have no resolved "
        "shareholders. %d holdings did not resolve to any PermID and %d resolved "
        "to a PermID with no company page.",
        attached,
        matched,
        len(companies),
        len(companies) - matched,
        int((~resolved_mask).sum()),
        int(resolved_mask.sum()) - attached,
    )
