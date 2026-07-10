import { Metadata } from "next";

import { Article } from "@/blocks";
import { StandardPageLayout } from "@/layouts";

/**
 * Metadata for the "Methodology" page.
 */
export const metadata: Metadata = {
  title: "Methodology | FTM2J Terminal | Inclusive Development International",
  description:
    "How FTM2J assembles corporate ownership, shareholder, and debt data from primary disclosures.",
};

/**
 * The "Methodology" page.
 */
export default function MethodologyPage() {
  return (
    <StandardPageLayout narrow>
      {/** ARTICLE */}
      <Article id="methodology">
        {/** HEADER */}
        <Article.Header accentBar>
          <Article.Header.Eyebrow>Methodology</Article.Header.Eyebrow>
          <Article.Header.Title>
            How the data is built.
          </Article.Header.Title>
          <Article.Header.Lead>
            Every record in FTM2J is assembled from primary disclosures and
            reconciled against independent sources. This page summarizes our
            process and its limits.
          </Article.Header.Lead>
        </Article.Header>

        {/** BODY */}
        <Article.Body divided>
          {/** SOURCES */}
          <Article.Body.Section>
            <Article.Body.Section.Title number="01">
              Sources
            </Article.Body.Section.Title>
            <Article.Body.Section.Paragraph>
              Records are drawn from regulatory filings, corporate registries,
              securities disclosures (including Exhibit&nbsp;21 subsidiary
              lists and 13-F holdings), and established commercial ownership
              datasets. Each data point retains a citation back to the document
              it was derived from.
            </Article.Body.Section.Paragraph>
            <Article.Body.Section.Paragraph>
              In practice, company facts are derived from LSEG PermID; corporate
              trees are reconciled from GLEIF and SEC Exhibit&nbsp;21 subsidiary
              lists attached to 10-K and 20-F filings; institutional
              shareholders come from SEC Form&nbsp;13-F filings, augmented by
              13-D and 13-G beneficial-ownership disclosures; and commercial
              debt is extracted from SEC 8-K material-event filings using a
              custom NLP model, supplemented by bond prospectuses and
              syndicated-loan announcements.
            </Article.Body.Section.Paragraph>
          </Article.Body.Section>

          {/** BUILDING THE CORPORATE TREE */}
          <Article.Body.Section>
            <Article.Body.Section.Title number="02">
              Building the corporate tree
            </Article.Body.Section.Title>
            <Article.Body.Section.Paragraph>
              Parent&ndash;subsidiary relationships are extracted, normalized to
              a single entity per legal person, and merged into a directed
              ownership graph. Conflicting disclosures are resolved in favor of
              the most recent primary filing, and unresolved conflicts are
              flagged for manual review.
            </Article.Body.Section.Paragraph>
          </Article.Body.Section>

          {/** REFRESH CADENCE */}
          <Article.Body.Section>
            <Article.Body.Section.Title number="03">
              Refresh cadence
            </Article.Body.Section.Title>
            <Article.Body.Section.Paragraph>
              The graph is reconciled on a weekly cycle. Individual company
              pages display the date each section was last refreshed so that
              users can judge currency at a glance.
            </Article.Body.Section.Paragraph>
            <Article.Body.Section.Paragraph>
              Scrapers run on a rolling basis between cycles, and the most
              recent reconciliation timestamp is shown in the status bar of
              each company profile.
            </Article.Body.Section.Paragraph>
          </Article.Body.Section>

          {/** LIMITATIONS */}
          <Article.Body.Section>
            <Article.Body.Section.Title number="04">
              Limitations
            </Article.Body.Section.Title>
            <Article.Body.Section.Paragraph>
              Ownership disclosure varies widely by jurisdiction. Where
              beneficial ownership is not publicly reported, the chain may
              terminate at the last disclosed entity. FTM2J represents the
              public record and should be treated as a research starting point
              rather than a definitive legal determination.
            </Article.Body.Section.Paragraph>
            <Article.Body.Section.Paragraph>
              Private debt, off-balance-sheet vehicles, and beneficial owners
              below SEC reporting thresholds may not appear, and figures should
              be treated as illustrative rather than relied upon for investment
              decisions.
            </Article.Body.Section.Paragraph>
            <Article.Body.Section.Callout>
              Found an error or a missing link? Corrections from researchers
              and companies are reviewed and, where verified, incorporated into
              the next refresh.
            </Article.Body.Section.Callout>
          </Article.Body.Section>
        </Article.Body>
      </Article>
    </StandardPageLayout>
  );
}
