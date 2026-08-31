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
              The current release covers more than four thousand companies, and
              coverage differs sharply by dataset rather than being uniform
              across them. Roughly a quarter have a corporate tree traced from
              their subsidiary disclosures; a smaller share have commercial-debt
              instruments extracted from their 8-K filings; and institutional
              and pension-fund shareholdings are attached wherever a holder&rsquo;s
              disclosures resolve to the company. Every company page states what it does and
              does not have, and coverage expands as new filings are reconciled
              into the graph.
            </Article.Body.Section.Paragraph>
            <Article.Body.Section.Callout>
              FTM2J is an independent research project. Inclusion of a company
              in the database does not imply any finding of wrongdoing.
            </Article.Body.Section.Callout>
          </Article.Body.Section>
        </Article.Body>
      </Article>
    </StandardPageLayout>
  );
}
