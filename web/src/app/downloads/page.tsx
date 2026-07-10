import { Metadata } from "next";

import { Article } from "@/blocks";
import { StandardPageLayout } from "@/layouts";

/**
 * Metadata for the "Downloads" page.
 */
export const metadata: Metadata = {
  title: "Downloads | FTM2J Terminal | Inclusive Development International",
  description:
    "Download every FTM2J dataset as flat files. CSV, Excel, and Parquet, refreshed weekly.",
};

const DATASETS = [
  {
    name: "Corporate structures",
    description:
      "Parent–subsidiary edges from GLEIF and SEC Exhibit 21 filings, normalized to a directed ownership graph.",
    size: "128 MB",
    rows: "4.2M",
    updated: "Jul 6, 2026",
  },
  {
    name: "Institutional shareholders",
    description:
      "Holdings from SEC Form 13-F, augmented with 13-D and 13-G beneficial-ownership disclosures.",
    size: "214 MB",
    rows: "9.6M",
    updated: "Jul 6, 2026",
  },
  {
    name: "Commercial debt",
    description:
      "Loan and bond obligations extracted from SEC 8-K filings, bond prospectuses, and syndicated-loan announcements.",
    size: "62 MB",
    rows: "340K",
    updated: "Jul 6, 2026",
  },
  {
    name: "Company facts",
    description:
      "Legal name, ticker, jurisdiction, and industry classification for every entity in the graph, keyed to LSEG PermID.",
    size: "48 MB",
    rows: "4.1K",
    updated: "Jul 6, 2026",
  },
  {
    name: "Filing citations",
    description:
      "Source documents and passage references backing each data point in the reconciliation.",
    size: "96 MB",
    rows: "18M",
    updated: "Jul 6, 2026",
  },
];

const FORMATS = [
  { label: "CSV", href: "#" },
  { label: "XLSX", href: "#" },
  { label: "Parquet", href: "#" },
];

/**
 * The "Downloads" page.
 */
export default function DownloadsPage() {
  return (
    <StandardPageLayout narrow>
      {/** ARTICLE */}
      <Article id="downloads">
        {/** HEADER */}
        <Article.Header accentBar>
          <Article.Header.Eyebrow>Downloads</Article.Header.Eyebrow>
          <Article.Header.Title>
            Every reconciliation, in a box.
          </Article.Header.Title>
          <Article.Header.Lead>
            Access every FTM2J dataset as flat files. Refreshed each Monday and
            distributed under an open license, so you can trace ownership
            offline, in your own tools, at your own pace.
          </Article.Header.Lead>
        </Article.Header>

        {/** BULK ARCHIVE CTA */}
        <Article.BulkDownload
          label="Bulk archive"
          title="Full historical archive"
          description="Every dataset and every weekly reconciliation since FTM2J launched, packaged as a single archive with one directory per week."
          size="1.2 GB"
          updated="Jul 6, 2026"
          format="ZIP"
          href="#"
        />

        {/** BODY */}
        <Article.Body>
          {/** WEEKLY DATASETS */}
          <Article.Body.Section>
            <Article.Body.Section.Title>
              Weekly datasets
            </Article.Body.Section.Title>
            <Article.Body.Section.Paragraph>
              Prefer to pull only what you need? Each dataset is published as a
              standalone file in three formats. Schemas and column definitions
              are shared across formats and stable between weekly releases.
            </Article.Body.Section.Paragraph>

            <Article.Body.DatasetList>
              {DATASETS.map((d) => (
                <Article.Body.Dataset
                  key={d.name}
                  name={d.name}
                  description={d.description}
                  size={d.size}
                  rows={d.rows}
                  updated={d.updated}
                  formats={FORMATS}
                />
              ))}
            </Article.Body.DatasetList>
          </Article.Body.Section>

          {/** REFRESH & LICENSE */}
          <Article.Body.Section>
            <Article.Body.Section.Title>
              Refresh &amp; license
            </Article.Body.Section.Title>
            <Article.Body.Section.Paragraph>
              Every dataset is regenerated each Monday from the most recent
              reconciliation. Previous weeks stay available inside the bulk
              archive above, so any analysis you publish can be replicated
              against the exact snapshot you used.
            </Article.Body.Section.Paragraph>
            <Article.Body.Section.Paragraph>
              FTM2J data is distributed under the Open Data Commons Attribution
              License. If you build on it, please cite Inclusive Development
              International as the source.
            </Article.Body.Section.Paragraph>
          </Article.Body.Section>
        </Article.Body>
      </Article>
    </StandardPageLayout>
  );
}
