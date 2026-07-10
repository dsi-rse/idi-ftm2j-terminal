import { Metadata } from "next";

import { Article } from "@/blocks";
import { StandardPageLayout } from "@/layouts";

/**
 * Metadata for the "Help" page.
 */
export const metadata: Metadata = {
  title: "Help | FTM2J Terminal | Inclusive Development International",
  description:
    "A quick orientation to finding companies, reading a profile, and exporting data on FTM2J.",
};

/**
 * The "Help" page.
 */
export default function HelpPage() {
  return (
    <StandardPageLayout narrow>
      {/** ARTICLE */}
      <Article id="help">
        {/** HEADER */}
        <Article.Header accentBar>
          <Article.Header.Eyebrow>Help</Article.Header.Eyebrow>
          <Article.Header.Title>
            Getting around FTM2J.
          </Article.Header.Title>
          <Article.Header.Lead>
            A quick orientation to finding companies, reading a profile, and
            exporting what you need.
          </Article.Header.Lead>
        </Article.Header>

        {/** PLACEHOLDER WALKTHROUGH VIDEO */}
        <Article.YouTubeEmbed
          videoId="HiOvq1rnUrs"
          title="FTM2J walkthrough"
        />

        {/** BODY */}
        <Article.Body>
          {/** GETTING STARTED */}
          <Article.Body.Section>
            <Article.Body.Section.Title>
              Getting started
            </Article.Body.Section.Title>
            <Article.Body.Section.Paragraph>
              Open <strong>Companies</strong> from the menu to browse the full
              list. Use the search bar to filter by company name, ticker, or
              country, and switch between the All, Recent, and Saved tabs to
              manage your working set. Select any company to load its profile.
            </Article.Body.Section.Paragraph>
          </Article.Body.Section>

          {/** FREQUENTLY ASKED */}
          <Article.Body.Section>
            <Article.Body.Section.Title>
              Frequently asked
            </Article.Body.Section.Title>

            <Article.Body.QA question="How current is the data?">
              The ownership graph is reconciled weekly. Each section of a
              company profile shows its own last-refreshed date.
            </Article.Body.QA>

            <Article.Body.QA question="Can I export a company profile?">
              Yes. Use the Export CSV and Cite buttons in the company header
              to download structured data or a formatted citation.
            </Article.Body.QA>

            <Article.Body.QA question="Why is a company missing?">
              Coverage currently centers on the extractive and agribusiness
              sectors and expands with each refresh. If a company you expect
              is absent, let us know.
            </Article.Body.QA>

            <Article.Body.QA question="How do I report a correction?">
              Email the team using the contact below with the company, the
              section, and a source. Verified corrections are folded into the
              next update.
            </Article.Body.QA>
          </Article.Body.Section>

          {/** CONTACT */}
          <Article.Body.Section>
            <Article.Body.Section.Title>Contact</Article.Body.Section.Title>
            <Article.Body.Section.Paragraph>
              For data questions, corrections, or partnership inquiries, reach
              the team at{" "}
              <a
                href="mailto:data@ftm2j.org"
                className="text-foreground font-medium underline decoration-primary/50 underline-offset-4 hover:decoration-primary"
              >
                data@ftm2j.org
              </a>
              .
            </Article.Body.Section.Paragraph>
          </Article.Body.Section>
        </Article.Body>
      </Article>
    </StandardPageLayout>
  );
}
