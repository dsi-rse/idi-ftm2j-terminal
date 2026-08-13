import { Footer as FooterBlock } from "@/blocks";

const SITE_MAP_LINKS = [
  { label: "Home", href: "/" },
  {
    label: "Company Search",
    href: "#",
  },
  { label: "About", href: "/about" },
  { label: "Methodology", href: "/methodology" },
  { label: "Downloads", href: "/downloads" },
  { label: "Help", href: "/help" },
];

const TOOL_SUITE_LINKS = [
  { label: "DeBIT", href: "https://debit.inclusivedevelopment.net/" },
  {
    label: "Shareholder Tracker",
    href: "https://sharetracker.inclusivedevelopment.net/",
  },
  {
    label: "Commercial Debt Tracker",
    href: "https://commercial-debt-tracker-dashboard-dev.uchicago-dsi-account.workers.dev/",
  },
  {
    label: "Follow the Money Toolkit",
    href: "https://www.followingthemoney.org/",
  },
];

/**
 * The footer of the FTM2J Terminal site.
 */
export function Footer() {
  return (
    <FooterBlock.Root>
      <FooterBlock.Row className="pt-16 pb-6 grid grid-cols-1 gap-12 md:grid-cols-4">
        <FooterBlock.Column justify="left">
          <FooterBlock.Wordmark />
          <FooterBlock.Tagline>
            Exposing hidden financial networks. Mapping the money. Demanding
            accountability.
          </FooterBlock.Tagline>
          <FooterBlock.LogoImage
            srcLight="/idi-logo-teal.webp"
            srcDark="/idi-logo-white.webp"
            alt="Inclusive Development International"
          />
          <FooterBlock.LastUpdated date="Mar 6, 2026" />
        </FooterBlock.Column>

        <FooterBlock.Column justify="left">
          <FooterBlock.SectionTitle>Site Map</FooterBlock.SectionTitle>
          <ul className="flex flex-col gap-2 list-none p-0 m-0">
            {SITE_MAP_LINKS.map(({ label, href }) => (
              <li key={label}>
                <FooterBlock.InternalLink href={href}>
                  {label}
                </FooterBlock.InternalLink>
              </li>
            ))}
          </ul>
        </FooterBlock.Column>

        <FooterBlock.Column justify="left">
          <FooterBlock.SectionTitle>Acknowledgments</FooterBlock.SectionTitle>
          <FooterBlock.Paragraph>
            This project was built by Inclusive Development International in
            collaboration with the Software Development Core at the University
            of Chicago Data Science Institute, with financial support from
            generous benefactors.
          </FooterBlock.Paragraph>
        </FooterBlock.Column>

        <FooterBlock.Column justify="left">
          <FooterBlock.SectionTitle>IDI Tool Suite</FooterBlock.SectionTitle>
          <ul className="flex flex-col gap-2 list-none p-0 m-0">
            {TOOL_SUITE_LINKS.map(({ label, href }) => (
              <li key={label}>
                <FooterBlock.ExternalLink href={href}>
                  {label}
                </FooterBlock.ExternalLink>
              </li>
            ))}
          </ul>
        </FooterBlock.Column>
      </FooterBlock.Row>

      <FooterBlock.Row className="py-6">
        <FooterBlock.Copyright>
          The information on this site is provided for research and educational
          purposes only, is compiled from public sources, and does not
          constitute legal, financial, or investment advice. Inclusive
          Development International makes no warranty as to its accuracy or
          completeness.
        </FooterBlock.Copyright>
      </FooterBlock.Row>

      <FooterBlock.Row className="pb-6 flex flex-wrap items-center justify-center md:justify-end gap-6">
        <FooterBlock.SocialMediaRow>
          <FooterBlock.FacebookButtonLink href="https://www.facebook.com/inclusivedevelopmentinternational" />
          <FooterBlock.YouTubeButtonLink href="https://www.youtube.com/channel/UCvinYfIrsGw1anP9I1gBE6A" />
          <FooterBlock.LinkedInButtonLink href="https://www.linkedin.com/company/inclusive-development-international/" />
          <FooterBlock.InstagramButtonLink href="https://www.instagram.com/inclusivedevt/" />
          <FooterBlock.BlueskyButtonLink href="https://bsky.app/profile/inclusivedevt.bsky.social" />
          <FooterBlock.GitHubButtonLink href="https://github.com/dsi-rse/idi-ftm2j-terminal" />
        </FooterBlock.SocialMediaRow>
        <div className="flex gap-4">
          <FooterBlock.LegalLink href="#">Privacy</FooterBlock.LegalLink>
          <FooterBlock.LegalLink href="#">
            Terms & Conditions
          </FooterBlock.LegalLink>
        </div>
      </FooterBlock.Row>
    </FooterBlock.Root>
  );
}
