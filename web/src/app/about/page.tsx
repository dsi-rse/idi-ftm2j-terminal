import { Metadata } from "next";

import { Article } from "@/blocks";
import { StandardPageLayout } from "@/layouts";

/**
 * Metadata for the "About" page.
 */
export const metadata: Metadata = {
  title: "About | FTM2J Terminal | Inclusive Development International",
  description:
    "Trace the corporate structures and investment and supply chains of publicly-traded companies.",
};

/**
 * The "About" page.
 */
export default function AboutPage() {
  return (
    <StandardPageLayout narrow>
      {/** ARTICLE */}
      <Article id="about">
        {/** HEADER */}
        <Article.Header accentBar>
          <Article.Header.Eyebrow>About</Article.Header.Eyebrow>
          <Article.Header.Title>
            A public record of who owns what.
          </Article.Header.Title>
          <Article.Header.Lead>
            FTM2J brings scattered corporate disclosures into one navigable
            structure, making it possible to understand the entities behind
            extraction, trade, and finance.
          </Article.Header.Lead>
        </Article.Header>

        {/** BODY */}
        <Article.Body>
          {/** BLOCK QUOTE */}
          <Article.Body.BlockQuote
            quote={{
              text: "FTM2J is quickly becoming an indispensable starting point for anyone trying to trace who ultimately controls a company. It turns weeks of disclosure work into an afternoon.",
              author: {
                name: "Investigative Reporter",
                affiliation:
                  "International Consortium of Investigative Journalists",
              },
            }}
          />

          {/** MISSION */}
          <Article.Body.Section>
            <Article.Body.Section.Title>Our mission</Article.Body.Section.Title>
            <Article.Body.Section.Paragraph>
              Corporate accountability begins with knowing who is responsible.
              Ownership is often deliberately obscured across holding companies,
              offshore vehicles, and layered subsidiaries. FTM2J assembles the
              public record into a connected map so that responsibility can be
              traced from a local operation up to its ultimate parent.
            </Article.Body.Section.Paragraph>
            <Article.Body.Section.Paragraph>
              The database is built for investigative journalists, civil-society
              researchers, legal teams, and the communities most affected by the
              activities of these companies.
            </Article.Body.Section.Paragraph>
          </Article.Body.Section>

          {/** WHO WE ARE */}
          <Article.Body.Section>
            <Article.Body.Section.Title>Who we are</Article.Body.Section.Title>
            <Article.Body.Section.Paragraph>
              FTM2J is a free, publicly accessible research tool, developed by
              Inclusive Development International in collaboration with the
              University of Chicago Data Science Institute. It is maintained by
              a small team of data engineers, analysts, and regional
              specialists, with contributions from a network of partner
              organizations.
            </Article.Body.Section.Paragraph>
            <Article.Body.Section.Paragraph>
              Inclusive Development International supports communities around
              the world to defend their rights and resources in the face of
              harmful corporate activities and internationally financed
              development projects, and we fight for a more just and equitable
              global economy. We are working toward a world in ecological
              balance, in which communities and individuals determine their own
              development paths, and businesses respect their human rights and
              environmental responsibilities.
            </Article.Body.Section.Paragraph>
          </Article.Body.Section>

          {/** WHAT THE DATA COVERS */}
          <Article.Body.Section>
            <Article.Body.Section.Title>
              What the data covers
            </Article.Body.Section.Title>
            <Article.Body.Section.Paragraph>
              The current release covers every publicly-traded company the
              company-information source resolves &mdash; the landing page
              carries the live count &mdash; and coverage differs sharply by
              dataset rather than being uniform across them. Roughly a third
              have a corporate tree traced from their subsidiary disclosures; a
              smaller share have commercial-debt instruments extracted from
              their 8-K filings; and institutional and pension-fund
              shareholdings are attached wherever a holder&rsquo;s disclosures
              resolve to the company. Every company page states what it does and
              does not have, and coverage expands as new filings are reconciled
              into the graph.
            </Article.Body.Section.Paragraph>
            <Article.Body.Section.Callout>
              FTM2J is an independent research project. Inclusion of a company
              in the database does not imply any finding of wrongdoing.
            </Article.Body.Section.Callout>
          </Article.Body.Section>

          {/** HOW THE DATA IS BUILT (formerly the Methodology page) */}
          <Article.Body.Section>
            <Article.Body.Section.Title>
              How the data is built
            </Article.Body.Section.Title>
            <Article.Body.Section.Paragraph>
              Records are drawn from regulatory filings, corporate registries,
              securities disclosures (including Exhibit&nbsp;21 subsidiary
              lists and 13-F holdings), and established commercial ownership
              datasets. Each data point retains a citation back to the document
              it was derived from.
            </Article.Body.Section.Paragraph>
            <Article.Body.Section.Paragraph>
              In practice, company information &mdash; identity, industry
              classification, and listing &mdash; is derived from LSEG PermID;
              company facts such as public float and revenue come from SEC
              10-K and 20-F filings; corporate trees come from SEC
              Exhibit&nbsp;21 and Exhibit&nbsp;8 subsidiary lists attached to
              10-K and 20-F filings; institutional
              shareholders come from SEC Form&nbsp;13-F filings and
              pension-fund disclosures, attached to a company by resolving the
              security they report to its issuer; and commercial debt is
              extracted from SEC 8-K material-event filings using a custom NLP
              model.
            </Article.Body.Section.Paragraph>
            <Article.Body.Section.Paragraph>
              Financial figures shown in the company header &mdash; public float
              and revenue &mdash; are read from the cover page of the company&rsquo;s
              most recent 10-K or 20-F. Public float is the market value of shares
              held by non-affiliates as of the filing date; it is not market
              capitalization. Figures are reported in the filing&rsquo;s own
              currency and never converted.
            </Article.Body.Section.Paragraph>
          </Article.Body.Section>

          {/** BUILDING THE CORPORATE TREE */}
          <Article.Body.Section>
            <Article.Body.Section.Title>
              Building the corporate tree
            </Article.Body.Section.Title>
            <Article.Body.Section.Paragraph>
              Parent&ndash;subsidiary relationships are extracted from the
              subsidiary list a registrant attaches to its own annual report,
              and are presented as that filing discloses them. Where a company
              has filed more than once, only its most recent filing is shown,
              with the filing date alongside. Subsidiary names are reproduced as
              filed and are not resolved to company records, so a subsidiary
              that is itself a registrant elsewhere in the database is not yet
              linked to it.
            </Article.Body.Section.Paragraph>
          </Article.Body.Section>

          {/** REFRESH CADENCE */}
          <Article.Body.Section>
            <Article.Body.Section.Title>
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
            <Article.Body.Section.Title>
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
              below SEC reporting thresholds may not appear. Debt amounts are
              reproduced as the filing reported them and are not converted
              between currencies, so figures denominated differently are not
              comparable and are never totalled; interest rates are not
              extracted; and a lender appears as the filing describes it, which
              is sometimes a role rather than a name. Most disclosed instruments
              state no end date, and those are shown as undated rather than
              assumed current.
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
