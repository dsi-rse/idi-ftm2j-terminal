import { ArrowUpRightIcon, ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import {
  type ComponentType,
  type PropsWithChildren,
  type SVGProps,
} from "react";

import {
  BlueskyIcon,
  FacebookIcon,
  GitHubIcon,
  InstagramIcon,
  LinkedInIcon,
  YouTubeIcon,
} from "@/components/icon";

/**
 * The root of the {@link Footer} compound component. Renders a `footer` tag
 * with a tapered, primary-colored gradient border along the top edge.
 */
function FooterRoot({ children }: PropsWithChildren) {
  return (
    <footer className="relative text-foreground">
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-px"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, var(--primary) 30%, var(--primary-hover) 50%, var(--primary) 70%, transparent 100%)",
        }}
      />
      {children}
    </footer>
  );
}
FooterRoot.displayName = "Footer.Root";

type FooterRowProps = { className?: string };

/**
 * A horizontal row inside the {@link Footer}. Applies the shared max-width and
 * horizontal padding; callers supply layout classes (grid, flex, gaps, etc.)
 * via {@link FooterRowProps.className}.
 */
function FooterRow({
  children,
  className = "",
}: PropsWithChildren<FooterRowProps>) {
  return (
    <div className={`mx-auto max-w-7xl px-6 ${className}`}>{children}</div>
  );
}
FooterRow.displayName = "Footer.Row";

type FooterColumnJustify = "left" | "center" | "right";

type FooterColumnProps = {
  justify?: FooterColumnJustify;
  className?: string;
};

const COLUMN_JUSTIFY_CLASSES: Record<FooterColumnJustify, string> = {
  left: "items-center md:items-start text-center md:text-left",
  center: "items-center text-center",
  right: "items-center md:items-end text-center md:text-right",
};

/**
 * A vertical column inside a {@link FooterRow}. Aligns its children per the
 * `justify` prop: `"left"` (default), `"center"`, or `"right"`.
 */
function FooterColumn({
  justify = "left",
  children,
  className = "",
}: PropsWithChildren<FooterColumnProps>) {
  return (
    <div
      className={`flex flex-col gap-4 ${COLUMN_JUSTIFY_CLASSES[justify]} ${className}`}
    >
      {children}
    </div>
  );
}
FooterColumn.displayName = "Footer.Column";

/**
 * A section heading inside a {@link FooterColumn}, styled as small,
 * uppercase, semibold text.
 */
function FooterSectionTitle({ children }: PropsWithChildren) {
  return (
    <h4 className="font-inter font-semibold text-foreground text-xs uppercase">
      {children}
    </h4>
  );
}
FooterSectionTitle.displayName = "Footer.SectionTitle";

/**
 * A body-text paragraph inside the {@link Footer}. Use for acknowledgments,
 * descriptions, and other prose that isn't the legal/copyright blob.
 */
function FooterParagraph({ children }: PropsWithChildren) {
  return (
    <p className="font-inter text-muted text-sm leading-relaxed">{children}</p>
  );
}
FooterParagraph.displayName = "Footer.Paragraph";

/**
 * A short, width-constrained tagline for the brand column of the
 * {@link Footer}. Rendered with the same typography as {@link FooterParagraph}
 * but capped at a narrow max-width.
 */
function FooterTagline({ children }: PropsWithChildren) {
  return (
    <p className="font-inter text-muted text-sm leading-relaxed max-w-xs">
      {children}
    </p>
  );
}
FooterTagline.displayName = "Footer.Tagline";

type FooterCopyrightProps = {
  year?: number;
  entity?: string;
};

/**
 * The self-contained legal blob at the bottom of the {@link Footer}. Renders
 * a copyright line composed from `year` and `entity`, followed by whatever
 * disclaimer text is passed as children.
 */
function FooterCopyright({
  year = new Date().getFullYear(),
  entity = "Inclusive Development International",
  children,
}: PropsWithChildren<FooterCopyrightProps>) {
  return (
    <p className="font-inter text-muted text-xs leading-relaxed text-center md:text-left">
      © {year} {entity}. All rights reserved. {children}
    </p>
  );
}
FooterCopyright.displayName = "Footer.Copyright";

type FooterLinkProps = { href: string };

/**
 * An internal navigation link, styled with a trailing chevron. Use for links
 * that stay within the site (e.g., the Site Map column).
 */
function FooterInternalLink({
  href,
  children,
}: PropsWithChildren<FooterLinkProps>) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 font-inter text-muted text-sm hover:text-primary transition-colors"
    >
      {children} <ChevronRightIcon className="size-3" aria-hidden />
    </Link>
  );
}
FooterInternalLink.displayName = "Footer.InternalLink";

/**
 * An external link, styled with a trailing up-right arrow. Opens in a new tab
 * with `rel="noopener noreferrer"`. Use for links that leave the site (e.g.,
 * the IDI Tool Suite column).
 */
function FooterExternalLink({
  href,
  children,
}: PropsWithChildren<FooterLinkProps>) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 font-inter text-muted text-sm hover:text-primary transition-colors"
    >
      {children} <ArrowUpRightIcon className="size-3" aria-hidden />
    </a>
  );
}
FooterExternalLink.displayName = "Footer.ExternalLink";

/**
 * A legal-row link (e.g., Privacy, Terms & Conditions). Smaller than a regular
 * footer link and without a trailing icon.
 */
function FooterLegalLink({
  href,
  children,
}: PropsWithChildren<FooterLinkProps>) {
  return (
    <Link
      href={href}
      className="text-muted text-xs hover:text-primary transition-colors"
    >
      {children}
    </Link>
  );
}
FooterLegalLink.displayName = "Footer.LegalLink";

/**
 * A flex row that groups social-media button links.
 */
function FooterSocialMediaRow({ children }: PropsWithChildren) {
  return <div className="flex gap-2">{children}</div>;
}
FooterSocialMediaRow.displayName = "Footer.SocialMediaRow";

type SocialButtonLinkProps = {
  href: string;
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
};

/**
 * Shared shell for social-media button links: a square, bordered anchor that
 * hosts one social icon.
 */
function SocialButtonLink({ href, label, Icon }: SocialButtonLinkProps) {
  return (
    <a
      href={href}
      aria-label={label}
      className="inline-flex items-center justify-center size-8 rounded-sm border border-muted/25 text-muted hover:text-primary hover:border-primary transition-colors"
    >
      <Icon className="size-3.5" />
    </a>
  );
}

type NamedSocialButtonLinkProps = { href: string; label?: string };

/**
 * A GitHub button link for the {@link FooterSocialMediaRow}.
 */
function FooterGitHubButtonLink({
  href,
  label = "GitHub",
}: NamedSocialButtonLinkProps) {
  return <SocialButtonLink href={href} label={label} Icon={GitHubIcon} />;
}
FooterGitHubButtonLink.displayName = "Footer.GitHubButtonLink";

/**
 * A Bluesky button link for the {@link FooterSocialMediaRow}.
 */
function FooterBlueskyButtonLink({
  href,
  label = "Bluesky",
}: NamedSocialButtonLinkProps) {
  return <SocialButtonLink href={href} label={label} Icon={BlueskyIcon} />;
}
FooterBlueskyButtonLink.displayName = "Footer.BlueskyButtonLink";

/**
 * A LinkedIn button link for the {@link FooterSocialMediaRow}.
 */
function FooterLinkedInButtonLink({
  href,
  label = "LinkedIn",
}: NamedSocialButtonLinkProps) {
  return <SocialButtonLink href={href} label={label} Icon={LinkedInIcon} />;
}
FooterLinkedInButtonLink.displayName = "Footer.LinkedInButtonLink";

/**
 * An Instagram button link for the {@link FooterSocialMediaRow}.
 */
function FooterInstagramButtonLink({
  href,
  label = "Instagram",
}: NamedSocialButtonLinkProps) {
  return <SocialButtonLink href={href} label={label} Icon={InstagramIcon} />;
}
FooterInstagramButtonLink.displayName = "Footer.InstagramButtonLink";

/**
 * A Facebook button link for the {@link FooterSocialMediaRow}.
 */
function FooterFacebookButtonLink({
  href,
  label = "Facebook",
}: NamedSocialButtonLinkProps) {
  return <SocialButtonLink href={href} label={label} Icon={FacebookIcon} />;
}
FooterFacebookButtonLink.displayName = "Footer.FacebookButtonLink";

/**
 * A YouTube button link for the {@link FooterSocialMediaRow}.
 */
function FooterYouTubeButtonLink({
  href,
  label = "YouTube",
}: NamedSocialButtonLinkProps) {
  return <SocialButtonLink href={href} label={label} Icon={YouTubeIcon} />;
}
FooterYouTubeButtonLink.displayName = "Footer.YouTubeButtonLink";

/**
 * The FTM2J wordmark, with the numeral "2" tinted with the primary color.
 */
function FooterWordmark() {
  return (
    <span className="text-lg font-bold tracking-wide text-foreground">
      FTM<span className="text-primary">2</span>J
    </span>
  );
}
FooterWordmark.displayName = "Footer.Wordmark";

type FooterLogoImageProps = {
  srcLight: string;
  srcDark: string;
  alt: string;
  width?: number;
  height?: number;
};

/**
 * A raster logo image for the {@link Footer} brand column, sized to the
 * footer's vertical rhythm. Swaps between light and dark variants via the
 * `dark:` class set by `next-themes`.
 */
function FooterLogoImage({
  srcLight,
  srcDark,
  alt,
  width = 250,
  height = 100,
}: FooterLogoImageProps) {
  return (
    <>
      <img
        src={srcLight}
        alt={alt}
        width={width}
        height={height}
        className="h-13 w-auto mt-2 dark:hidden"
      />
      <img
        src={srcDark}
        alt={alt}
        width={width}
        height={height}
        className="hidden h-13 w-auto mt-2 dark:block"
      />
    </>
  );
}
FooterLogoImage.displayName = "Footer.LogoImage";

type FooterLastUpdatedProps = { date: string };

/**
 * A "Last updated {date}" label with an animated pulse indicator, styled in
 * the primary color.
 */
function FooterLastUpdated({ date }: FooterLastUpdatedProps) {
  return (
    <span className="inline-flex items-center gap-2 text-primary text-xs uppercase tracking-wide">
      <span className="relative inline-flex size-1.5">
        <span className="absolute inset-0 rounded-full bg-primary opacity-75 animate-ping" />
        <span className="relative inline-flex size-1.5 rounded-full bg-primary" />
      </span>
      Last updated {date}
    </span>
  );
}
FooterLastUpdated.displayName = "Footer.LastUpdated";

/**
 * A compound footer component. Composes the site footer's tapered top border,
 * responsive column grid, legal/copyright blob, social-media button row, and
 * legal links via a set of dot-accessed subcomponents.
 */
export const Footer = Object.assign(FooterRoot, {
  Root: FooterRoot,
  Row: FooterRow,
  Column: FooterColumn,
  SectionTitle: FooterSectionTitle,
  Paragraph: FooterParagraph,
  Tagline: FooterTagline,
  Copyright: FooterCopyright,
  InternalLink: FooterInternalLink,
  ExternalLink: FooterExternalLink,
  LegalLink: FooterLegalLink,
  SocialMediaRow: FooterSocialMediaRow,
  GitHubButtonLink: FooterGitHubButtonLink,
  BlueskyButtonLink: FooterBlueskyButtonLink,
  LinkedInButtonLink: FooterLinkedInButtonLink,
  InstagramButtonLink: FooterInstagramButtonLink,
  FacebookButtonLink: FooterFacebookButtonLink,
  YouTubeButtonLink: FooterYouTubeButtonLink,
  Wordmark: FooterWordmark,
  LogoImage: FooterLogoImage,
  LastUpdated: FooterLastUpdated,
});
