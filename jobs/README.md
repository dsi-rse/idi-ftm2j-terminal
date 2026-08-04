# jobs

Build-time data pipeline for the static web application.

`build_dataset.py` reads the company info and corporate structure processors'
outputs and writes JSON records matching the serialized `Company` type in
[`web/src/types/domain.ts`](../web/src/types/domain.ts). That TypeScript type is
the contract; if you change the shape here, change it there in the same commit.

## Running it

```bash
COMPANY_INFO_FILE_PATH=../data/input/latest_company_info.parquet \
CORPORATE_STRUCTURE_FILE_PATH=../data/input/latest_corporate_structure.parquet \
OUTPUT_FILE_PATH=../data/output/companies.json \
uv run python build_dataset.py
```

| Variable | Meaning |
| --- | --- |
| `COMPANY_INFO_FILE_PATH` | `company-info/latest.parquet` from the processed layer |
| `CORPORATE_STRUCTURE_FILE_PATH` | `corporate-structure/latest.parquet` from the processed layer |
| `OUTPUT_FILE_PATH` | Where to write the JSON the web build consumes |

In CI all three are set by [`deploy.yaml`](../.github/workflows/deploy.yaml), which
first syncs the processed layer out of S3. The web build then reads the output
via `INPUT_DATA_FILE_PATH`.

`data/` is gitignored, so the parquet and the JSON are local artifacts — not
fixtures committed to the repo.

## Input 1 — company info

`s3://{bucket}/database/company-info/latest.parquet`, produced by the IDI
company info processor from the LSEG PermID Entity Match and PermID Info APIs.
Schema is defined in the FTM2J Tech Spec under Processed Layer → Company info.

One row per `(identifier_type, identifier)`. Today that is one CIK per PermID,
but the Shareholder Tracker will introduce CUSIP-keyed rows and multiple
identifiers per PermID, so the script groups by `permid_id` rather than assuming
a 1:1 grain.

## Column mapping

| `Company` field | Source column |
| --- | --- |
| `permId` | `permid_id` |
| `cik` | `identifier` where `identifier_type == "cik"` |
| `lei` | `lei` |
| `name` | `investor_name` |
| `foundedOn` | `founded_date` |
| `website` | `url` |
| `hqCountry` | `hq_address`, last non-empty line |
| `incorporatedCountry` | `incorporated_in` |
| `domiciledCountry` | `domiciled_in` |
| `currentIndustry` | `primary_industry_group_label` |
| `currentSectors` | `primary_economic_sector_label`, `primary_business_sector_label` |
| `currentListing.ticker` | `ticker` |
| `currentListing.exchangeMic` | `exchange` |
| `currentListing.exchangeCode` | `exchange_code` |
| `sources[].url` | `permid_url` |
| `sources[].lastAccessed` | `last_processed` |

Unused columns: `entity_name`, `input_source`, `identifier_type` and
`standard_identifier` (routing only), `registered_address`, `fax_number`,
`phone_number`, `activity_status`, `ric`, and the three `*_comment` fields
(taxonomy descriptions, not company facts).

## Input 2 — corporate structure

`s3://{bucket}/database/corporate-structure/latest.parquet`, produced by the IDI
corporate structure processor from Exhibit 21 of 10-K filings and Exhibit 8 of
20-F filings. One row per disclosed subsidiary per filing, and a full historical
record — most registrants appear with more than one filing date.

Populates `Company.currentCorporateRelationships`:

| `CurrentCorporateRelationship` field | Source column |
| --- | --- |
| `child.name` | `name` |
| `childJurisdiction` | `location` |
| `asOf` | `filing_date` |
| `sources[].name` | derived from `form_type` + `exhibit_type` |
| `sources[].url` | `exhibit_url` |
| `sources[].lastAccessed` | `date_added`, date component |
| (join key) | `parent_cik` |
| (tie-break only) | `accession_number` |

`parent` comes from the `Company` record, not from the dataset's `parent_name`.
`child.permId` is always `None`: Exhibit 21 gives a name and a jurisdiction,
never an identifier.

Unused columns: `parent_name` (except to detect self-listing),
`parent_state_of_incorporation`, the seven `parent_business_*` address fields,
`parent_tickers`, `parent_exchanges`, and `source_quote`. Several of these would
fill gaps in company-info's coverage, but company-info stays the single source
for company identity — reconciling two sources for the same fact is its own
problem, not something to do implicitly here.

## Decisions worth knowing before you change this

**The citation is `permid_url`, not the company website.** The PermID record is
where these facts came from. It is also populated for every row, where `url` is
not, so `sources` is never empty. `website` is a fact *about* the company, not a
citation for it.

**`XXXX` in `exchange` does not mean unlisted.** It is a "no exchange reported"
MIC placeholder, and every row carrying it has a real `exchange_code`. It
normalizes to `None` for `exchangeMic` while `exchangeCode` still carries the
value, so those companies are not silently delisted. Coverage: 163 rows have a
MIC, 179 have a code, and the code set is a superset of the MIC set.

**`cik` is null unless unambiguous.** The data spec calls for Primary CIK
selection logic but does not define it. Guessing a tie-break would attach the
wrong filings to a company, so a PermID with several CIKs gets `null` and a log
line.

**HQ country is positional parsing of free text.** The country is the last line
of `hq_address`. All 219 rows currently end in a country, but nothing guarantees
that, so the parsed value is checked against `KNOWN_COUNTRIES` and falls back to
`incorporated_in` with a warning. Without that check a truncated address would
present a postal code to users as a country. Extend `KNOWN_COUNTRIES` when the
company universe grows.

**Sectors are TRBC labels with an empty `code`.** LSEG classifies by label and
supplies no numeric code. An earlier SIC/NAICS lookup table resolved only 14 of
74 LSEG labels because it was keyed to different sector names, so it was
removed. If a consumer needs SIC — the spec's Shareholder Tracker inputs list
`investor_industry_code` as SIC — that needs a real TRBC→SIC crosswalk, not a
partial map.

**`historic*` arrays are emitted empty.** LSEG reports current state with no
start date, so there is nothing to put a truthful `from` on. Current-state facts
live on the `current*` fields instead. Do not populate a `historic*` array by
inventing a `from` date; that was how the previous mock pipeline worked and it
produced 1970-01-01 everywhere.

**`parent_cik` is unpadded; company-info's CIK is zero-padded to 10.** This is
the one thing here you cannot infer from reading the code, and getting it wrong
does not raise: the naive join matches *zero* rows and every company page renders
an empty Corporate Tree, which looks exactly like "the processor has no data
yet". Both sides are normalized through `normalize_cik` before joining, and an
empty join fails the build rather than shipping 219 blank sections.

**Only the most recent filing per company contributes subsidiaries.** 111 of the
133 matched companies have more than one filing date. Merging rows across filings
would describe a structure no single document supports. Ties on filing date break
on the highest `accession_number` so runs are reproducible.

**No recency filter is applied to `filing_date`.** The tech spec says "filings
from the past 2 years", which would currently yield *zero* companies — every
matched company's most recent filing is 2016–2018, because the dataset is a
partial backfill. The UI shows the filing date instead, so a 2017 list is never
presented as current.

**`exhibit_type` is not filtered.** It takes two values and both are subsidiary
lists: `21` is the 10-K's Exhibit 21, `8` is the 20-F's Exhibit 8.1. Filtering to
`21` would silently drop every foreign private issuer. No 20-F filer is in the
current 219-company universe, so that path is correct but unexercised.

**A registrant listing itself is dropped.** Six rows do this. That is the tree's
root, not one of its own subsidiaries — and for one company (SpendSmart Networks)
it was the *only* row, so it correctly ends up with no disclosed structure.

**`location` is a jurisdiction, not a country, and is not normalized.** 317
distinct values mixing US states and countries, with `Delaware`, `DE`, and
`DELAWARE` all present, and 493 blanks. Blank becomes `None`. Do not "clean" this
into a country field; the value is what the filing says.

**`last_processed` is compact basic ISO** (`20260801T033040`), unlike the
`YYYY-MM-DD` used elsewhere in the spec. Parsed defensively because the upstream
format is unsettled.

## Scope

The company universe is set by company-info, which currently covers only
companies reached via the commercial debt tracker — 219 PermIDs. It grows as the
Shareholder Tracker lands. No filtering is applied here, including on
`activity_status`: inactive companies still get records.

Corporate structure covers 4,652 registrants, but only those that are also in the
company universe get a tree: **133 of 219** companies, carrying 8,807
subsidiaries between them. The other 86 render an empty state. That ratio
improves from both directions as the two processors fill in.
