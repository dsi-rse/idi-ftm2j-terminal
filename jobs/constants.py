# Standard library imports
# (none)

SOURCE_NAME = "LSEG PermID"

# SEC CIKs are canonically zero-padded to 10 digits, which is how company-info
# reports them. The corporate-structure dataset reports them unpadded, so both
# sides are normalized to this width before joining. Skipping this matches zero
# rows -- see `attach_relationships`.
CIK_WIDTH = 10

# Exhibit 21 lists "Subsidiaries of the Registrant"; the 20-F equivalent is
# "List of Subsidiaries". Neither reports an ownership percentage or a
# relationship start date, so every emitted relationship is a plain subsidiary
# with a null percent.
RELATIONSHIP_TYPE = "Subsidiary"

# LSEG's TRBC taxonomy is label-first and supplies no numeric code, unlike SIC
# and NAICS. The `Sector.code` field is deliberately empty for these.
SECTOR_SYSTEM = "TRBC"
SECTOR_CODE = ""

# US states and DC, used to reject an address that was truncated before its
# country line. LSEG formats addresses street / city / STATE / ZIP / country, so
# a truncated one ends on the ZIP (caught by the digit test) or on the state.
#
# Deliberately a closed set of states rather than an open one of countries.
# States are finite and stable; the set of countries LSEG can emit is neither,
# and an allowlist of them silently replaces any country it has not been told
# about. Territories LSEG reports as countries in their own right -- Puerto
# Rico, U.S. Virgin Islands, Guam -- are absent on purpose: they are legitimate
# values for this field and must pass through.
US_STATES: frozenset[str] = frozenset(
    state.casefold()
    for state in {
        "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado",
        "Connecticut", "Delaware", "District of Columbia", "Florida", "Georgia",
        "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky",
        "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan",
        "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada",
        "New Hampshire", "New Jersey", "New Mexico", "New York",
        "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon",
        "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota",
        "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington",
        "West Virginia", "Wisconsin", "Wyoming",
    }
)

# MIC placeholder meaning "no exchange reported". It does NOT mean the company
# is unlisted: every row carrying it has a real `exchange_code`, so it must
# fall through to that rather than being treated as missing.
UNKNOWN_MIC = "XXXX"

# Value of `identifier_type` marking a row whose `identifier` holds a CIK.
IDENTIFIER_TYPE_CIK = "cik"

# Value of `identifier_type` marking a row whose `identifier` holds a CUSIP.
# These rows are how a shareholding's issuer resolves to a PermID: the
# shareholder-tracker output carries no issuer PermID, only the security's
# CUSIP, and company-info is where that CUSIP was resolved -- see
# `attach_shareholders`.
IDENTIFIER_TYPE_CUSIP = "cusip"

# The shareholder-tracker blends SEC 13-F filings (institutional investors) with
# European pension-fund reports. The 13-F rows all carry the same generic
# `source` ("U.S. SECURITIES AND EXCHANGE COMMISSION (SEC)"), so the citation
# name is fixed rather than read from the row; pension rows carry the fund's own
# name in `source`, which is the better citation.
SHAREHOLDER_INVESTOR_TYPE_INSTITUTIONAL = "INSTITUTIONAL INVESTOR"
SHAREHOLDER_SOURCE_NAME_13F = "SEC Form 13-F"
SHAREHOLDER_SOURCE_NAME_FALLBACK = "Shareholder disclosure"

# CDT extracts debt instruments from 8-K material-event filings and from the
# 6-Ks foreign private issuers file instead; `items.form_type` says which. An
# 8-K row's `item` is the item number EDGAR labels it with ("1.01"). A 6-K has
# no items, and its row's `item` is CDT's internal window id, so a 6-K citation
# names the form alone.
CDT_FORM_TYPE_8K = "8-K"

# The `parties_json` role whose parties are rendered as an instrument's lenders.
# CDT labels every party cluster with one role (`lender`, `borrower`, `agent`,
# `trustee`, `underwriter`, `guarantor`, `other`); before it did, the borrower
# and the underwriters reached the frontend as "lenders".
CDT_LENDER_ROLE = "lender"

# The `parties_json` kind of a party the filing actually names. The other kind,
# `collective`, is a cluster whose every span is a role word or pronoun -- "the
# lenders party thereto", "Holders" -- which says a lender exists but not who.
# Only named lenders are rendered, matching the CDT dashboard's own party lists.
CDT_NAMED_PARTY_KIND = "named"

# An instrument whose end date is in the future is Active; one whose filing
# stated no end date is Undated. There is deliberately no matured or superseded
# variant -- those are filtered out here and never reach the frontend, so the
# type in `web/src/types/domain.ts` has two members rather than four.
DEBT_STATUS_ACTIVE = "Active"
DEBT_STATUS_UNDATED = "Undated"

# The columns of `items` that a citation needs, plus the join key. Most of the
# file is its unread `text` column -- the full section body the extraction ran
# over -- so it is read narrow.
#
# `item_information` is deliberately absent. It is the human-readable gloss for
# `item`, but it is lowercase and runs to 135 characters ("triggering events that
# accelerate or increase a direct financial obligation or an obligation under an
# off-balance sheet arrangement"), which makes a poor citation name. The item
# number is the identifier EDGAR itself uses.
CDT_ITEM_COLUMNS: tuple[str, ...] = ("item_id", "url", "date", "item", "form_type")

# CDT publishes each generation of its tables atomically: every table goes under
# an immutable `snapshots/snapshot=<run_id>/` prefix first, then one
# `latest.json` pointer naming them is replaced as the last step. Reading the
# per-table `<table>/latest.parquet` copies instead can mix two generations, so
# the build resolves these tables from the pointer -- see
# `resolve_snapshot_tables`.
CDT_POINTER_FILE_NAME = "latest.json"
CDT_DEBT_INSTRUMENTS_TABLE = "debt-instruments"
CDT_MENTIONS_TABLE = "debt-instrument-mentions"
CDT_ITEMS_TABLE = "items"
CDT_TABLES: tuple[str, ...] = (
    CDT_DEBT_INSTRUMENTS_TABLE,
    CDT_MENTIONS_TABLE,
    CDT_ITEMS_TABLE,
)

# The version of CDT's `publish_contract.json` (in CDT's `src/cdt/`) that the
# readers in `debt.py` and the CDT fixtures are written against. CDT bumps it,
# and stamps it into `latest.json`, when a change is one a reader must know
# about -- a renamed column or a reshaped payload, which has already shipped
# silently empty sections twice. So a mismatch fails the build: port the
# readers and fixtures to the new contract, then bump this number.
CDT_CONTRACT_VERSION = 1

# Company-level columns, all read off one winning row. Rows sharing an
# (input_source, last_processed) partition were built from a single
# `permid_data.json`, so these must agree inside a partition -- see
# `warn_on_snapshot_divergence`.
#
# Deliberately excluded: `identifier`, `entity_name` and `standard_identifier`
# are per-CIK and are *supposed* to differ; `ticker` is excluded because one
# snapshot can legitimately report several for a genuinely multi-ticker company.
SCALAR_COMPANY_FIELDS: tuple[str, ...] = (
    "permid_url",
    "investor_name",
    "lei",
    "founded_date",
    "hq_address",
    "incorporated_in",
    "domiciled_in",
    "url",
    "exchange",
    "exchange_code",
    "primary_industry_group_label",
    "primary_economic_sector_label",
    "primary_business_sector_label",
)
