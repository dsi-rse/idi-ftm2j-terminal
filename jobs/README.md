# jobs

Build-time data pipeline for the static web application.

`build_dataset.py` reads the company info processor's output and writes JSON
records matching the serialized `Company` type in
[`web/src/types/domain.ts`](../web/src/types/domain.ts). That TypeScript type is
the contract; if you change the shape here, change it there in the same commit.

## Running it

```bash
RAW_COMPANIES_FILE_PATH=../data/input/latest_company_info.parquet OUTPUT_FILE_PATH=../data/output/companies.json uv run python build_dataset.py
```

| Variable | Meaning |
| --- | --- |
| `RAW_COMPANIES_FILE_PATH` | `company-info/latest.parquet` from the processed layer |
| `OUTPUT_FILE_PATH` | Where to write the JSON the web build consumes |

In CI both are set by [`deploy.yaml`](../.github/workflows/deploy.yaml), which
first syncs the processed layer out of S3. The web build then reads the output
via `INPUT_DATA_FILE_PATH`.

`data/` is gitignored, so the parquet and the JSON are local artifacts — not
fixtures committed to the repo.

## Input

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

**`last_processed` is compact basic ISO** (`20260801T033040`), unlike the
`YYYY-MM-DD` used elsewhere in the spec. Parsed defensively because the upstream
format is unsettled.

## Scope

The parquet currently covers only companies reached via the commercial debt
tracker — 219 PermIDs. Shareholder Tracker and Corporate Structure inputs are
not yet included, so the company universe grows as those processors land. No
filtering is applied here, including on `activity_status`: inactive companies
still get records.
