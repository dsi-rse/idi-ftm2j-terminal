import { CircleAlertIcon, DownloadIcon } from "lucide-react";
import { ComponentPropsWithoutRef, PropsWithChildren } from "react";

/**
 * The root of the {@link Article} compound component.
 * Articles are self-contained, independent pieces of content and render as `article` tags.
 */
function ArticleRoot({
  id,
  children,
  className = "",
}: PropsWithChildren<ComponentPropsWithoutRef<"article">>) {
  return (
    <article id={id} className={`flex flex-col gap-8 ${className}`}>
      {children}
    </article>
  );
}

type ArticleHeaderRootProps = ComponentPropsWithoutRef<"header"> & {
  accentBar?: boolean;
};

/**
 * The root of the article header compound component.
 * Contains the article title, eyebrow, and/or lead. Renders as a `header` tag,
 * with the option to add a gold accent bar in the left gutter.
 */
function ArticleHeaderRoot({
  children,
  accentBar = false,
  className = "",
}: PropsWithChildren<ArticleHeaderRootProps>) {
  return (
    <header
      className={`flex flex-col gap-2${accentBar ? " relative w-full" : ""} ${className}`}
    >
      {accentBar && (
        <div
          aria-hidden
          className="absolute inset-y-0 -left-8 md:-left-10 w-1 md:w-1.5 bg-primary rounded-full"
        />
      )}
      {children}
    </header>
  );
}
ArticleHeaderRoot.displayName = "Article.Header";

/**
 * The secondary article heading.
 * Smaller and less emphasized than the title. Renders as a `p` tag.
 */
function ArticleHeaderEyebrow({ children }: PropsWithChildren) {
  return (
    <p className="font-inter text-primary uppercase tracking-wide text-center text-xs md:text-left font-bold dark:font-normal">
      {children}
    </p>
  );
}
ArticleHeaderEyebrow.displayName = "Article.Header.Eyebrow";

/**
 * The primary article heading. Large and emphasized.
 * Renders as an `h1` element.
 */
function ArticleHeaderTitle({ children }: PropsWithChildren) {
  return (
    <h1 className="font-inter-tight tracking-tight font-semibold text-foreground text-3xl text-center md:text-5xl md:text-left m-0 leading-none">
      {children}
    </h1>
  );
}
ArticleHeaderTitle.displayName = "Article.Header.Title";

/**
 * A one-to-two-sentence hook for the article.
 * Renders as a `p` element.
 */
function ArticleHeaderLead({ children }: PropsWithChildren) {
  return (
    <p className="font-inter text-muted text-sm text-justified md:text-base md:text-left">
      {children}
    </p>
  );
}
ArticleHeaderLead.displayName = "Article.Header.Lead";

type ArticleYouTubeEmbedProps = {
  videoId: string;
  title?: string;
};

/**
 * An embedded YouTube video within an article.
 * Sits as a direct child of `Article`, between the header and body,
 * and renders responsively at a 16:9 aspect ratio.
 */
function ArticleYouTubeEmbed({
  videoId,
  title = "Embedded video",
}: ArticleYouTubeEmbedProps) {
  return (
    <div className="w-full aspect-video overflow-hidden rounded-md border border-muted/25 bg-overlay">
      <iframe
        src={`https://www.youtube.com/embed/${videoId}`}
        title={title}
        className="w-full h-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
      />
    </div>
  );
}
ArticleYouTubeEmbed.displayName = "Article.YouTubeEmbed";

type ArticleBulkDownloadProps = {
  label: string;
  title: string;
  description: string;
  size: string;
  updated: string;
  format: string;
  href: string;
};

/**
 * A prominent bulk-download CTA card for the top of a downloads article.
 * Sits as a direct child of `Article` between the header and body.
 */
function ArticleBulkDownload({
  label,
  title,
  description,
  size,
  updated,
  format,
  href,
}: ArticleBulkDownloadProps) {
  return (
    <div className="flex flex-col md:flex-row md:items-center gap-6 border border-muted/25 border-l-2 border-l-primary rounded-md p-6 bg-overlay">
      <div className="flex-1 space-y-2">
        <p className="font-inter text-primary uppercase tracking-wide text-xs">
          {label}
        </p>
        <h2 className="font-inter-tight tracking-tight font-bold text-foreground text-xl md:text-2xl">
          {title}
        </h2>
        <p className="font-inter text-muted text-sm md:text-base">
          {description}
        </p>
        <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1 font-mono text-xs uppercase tracking-wide text-muted">
          <span>{format}</span>
          <span aria-hidden>·</span>
          <span>{size}</span>
          <span aria-hidden>·</span>
          <span>Updated {updated}</span>
        </div>
      </div>
      <a
        href={href}
        className="inline-flex items-center justify-center gap-2 rounded-md border border-primary/60 bg-primary/10 px-5 py-3 font-inter text-sm font-medium text-foreground hover:bg-primary/20 hover:border-primary transition-colors self-start md:self-center"
      >
        <DownloadIcon className="size-4 text-primary" />
        Download {format}
      </a>
    </div>
  );
}
ArticleBulkDownload.displayName = "Article.BulkDownload";

/**
 * The article body. Contains heterogeneous content. Renders as a `div` tag.
 * When `divided` is true, thin rules are drawn above every child so sections
 * are visually separated.
 */
function ArticleBody({
  divided = false,
  children,
}: PropsWithChildren<{ divided?: boolean }>) {
  const spacingClasses = divided
    ? "border-t border-muted/25 divide-y divide-muted/25 [&>*]:pt-4 [&>*]:pb-8"
    : "space-y-8";
  return (
    <div
      className={`w-full ${spacingClasses} after:block after:content-[''] after:clear-both`}
    >
      {children}
    </div>
  );
}
ArticleBody.displayName = "Article.Body";

/**
 * The root of the article section compound component.
 * Contains the section title and heterogeneous content. Renders as a `section` tag.
 */
function ArticleSectionRoot({ children }: PropsWithChildren) {
  return <section className="space-y-4">{children}</section>;
}
ArticleSectionRoot.displayName = "Article.Body.Section";

/**
 * An article section title. Renders as an `h2` tag (secondary to the article title).
 * When `number` is provided, it is rendered in the accent color before the title text.
 */
function ArticleSectionTitle({
  number,
  children,
}: PropsWithChildren<{ number?: string }>) {
  return (
    <h2 className="text-xl font-inter-tight tracking-tight font-bold">
      {number && (
        <span className="text-primary mr-2 font-mono text-xs font-medium align-middle">
          {number}
        </span>
      )}
      {children}
    </h2>
  );
}
ArticleSectionTitle.displayName = "Article.Body.Section.Title";

/**
 * A paragraph within an article section. Renders as a `p` tag.
 */
function ArticleSectionParagraph({ children }: PropsWithChildren) {
  return (
    <p className="font-inter text-muted text-sm text-justified md:text-base md:text-left">
      {children}
    </p>
  );
}
ArticleSectionParagraph.displayName = "Article.Body.Section.Paragraph";

/**
 * A callout within an article.
 * Renders as a `div` with an accented left border and warning icon.
 */
function ArticleCallout({ children }: PropsWithChildren) {
  return (
    <div className="flex flex-row items-start gap-2 border-1 border-muted/25 border-l-2 border-l-primary pl-4 py-4">
      <CircleAlertIcon className="size-4 text-primary" />
      <p className="font-inter text-muted text-xs text-justified md:text-sm md:text-left">
        {children}
      </p>
    </div>
  );
}
ArticleCallout.displayName = "Article.Body.Callout";

type ArticleQAProps = {
  question: string;
};

/**
 * A stylistic question-and-answer pair within an article body.
 * The question renders as an `h3` and the answer as a paragraph,
 * both at a size larger than the standard section paragraph.
 */
function ArticleQA({ question, children }: PropsWithChildren<ArticleQAProps>) {
  return (
    <div className="space-y-3">
      <h3 className="text-lg md:text-xl font-inter-tight tracking-tight font-bold text-foreground">
        <span className="text-primary mr-2">Q.</span>
        {question}
      </h3>
      <p className="font-inter text-muted text-base md:text-lg text-justified md:text-left">
        {children}
      </p>
    </div>
  );
}
ArticleQA.displayName = "Article.Body.QA";

/**
 * A container that renders its children as a divided vertical list.
 * Used for grouping `Article.Body.Dataset` rows and similar list-like content.
 */
function ArticleDatasetList({ children }: PropsWithChildren) {
  return (
    <div className="border-y border-muted/25 divide-y divide-muted/25">
      {children}
    </div>
  );
}
ArticleDatasetList.displayName = "Article.Body.DatasetList";

type ArticleDatasetFormat = {
  label: string;
  href: string;
};

type ArticleDatasetProps = {
  name: string;
  description: string;
  size: string;
  rows?: string;
  updated: string;
  formats: ArticleDatasetFormat[];
};

/**
 * A row in a dataset download list.
 * Displays the dataset name, description, monospaced metadata, and one
 * outlined button per available download format.
 */
function ArticleDataset({
  name,
  description,
  size,
  rows,
  updated,
  formats,
}: ArticleDatasetProps) {
  return (
    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 py-5">
      <div className="flex-1 space-y-1">
        <h3 className="font-inter-tight tracking-tight font-bold text-foreground text-base md:text-lg">
          {name}
        </h3>
        <p className="font-inter text-muted text-sm md:text-base">
          {description}
        </p>
        <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1 font-mono text-xs uppercase tracking-wide text-muted">
          <span>{size}</span>
          {rows && (
            <>
              <span aria-hidden>·</span>
              <span>{rows} rows</span>
            </>
          )}
          <span aria-hidden>·</span>
          <span>Updated {updated}</span>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 md:pt-1">
        {formats.map((f) => (
          <a
            key={f.label}
            href={f.href}
            className="inline-flex items-center rounded-md border border-muted/40 px-3 py-1.5 font-mono text-xs uppercase tracking-wide text-foreground hover:border-primary hover:text-primary transition-colors"
          >
            {f.label}
          </a>
        ))}
      </div>
    </div>
  );
}
ArticleDataset.displayName = "Article.Body.Dataset";

type ArticleBlockQuoteProps = {
  quote: {
    text: string;
    author: {
      name: string;
      affiliation: string;
    };
  };
};

/**
 * A block quote within an article.
 */
function ArticleBlockQuote({ quote }: ArticleBlockQuoteProps) {
  return (
    <figure className="md:float-right md:w-2/5 md:ml-8 md:mt-2 md:mb-4 mb-6 flex flex-col gap-4 border border-muted/25 border-l-2 border-l-primary rounded-md p-6 bg-overlay">
      <div
        aria-hidden
        className="font-inter-tight text-primary text-5xl leading-none"
      >
        &ldquo;
      </div>
      <blockquote className="font-inter-tight text-foreground text-lg leading-snug">
        {quote.text}
      </blockquote>
      <figcaption className="flex flex-col gap-0.5 mt-2">
        <span className="font-inter text-foreground text-sm font-medium">
          {quote.author.name}
        </span>
        <span className="font-inter text-muted text-xs uppercase tracking-wide">
          {quote.author.affiliation}
        </span>
      </figcaption>
    </figure>
  );
}
ArticleBlockQuote.displayName = "Article.Body.BlockQuote";

/**
 * A responsive compound component for articles.
 *
 * Capable of rendering a header with an eyebrow, title, and lead,
 * as well as one or more titled sections with paragraphs, callouts,
 * and other content.
 */
export const Article = Object.assign(ArticleRoot, {
  Header: Object.assign(ArticleHeaderRoot, {
    Title: ArticleHeaderTitle,
    Eyebrow: ArticleHeaderEyebrow,
    Lead: ArticleHeaderLead,
  }),
  YouTubeEmbed: ArticleYouTubeEmbed,
  BulkDownload: ArticleBulkDownload,
  Body: Object.assign(ArticleBody, {
    BlockQuote: ArticleBlockQuote,
    Callout: ArticleCallout,
    QA: ArticleQA,
    Dataset: ArticleDataset,
    DatasetList: ArticleDatasetList,
    Section: Object.assign(ArticleSectionRoot, {
      Title: ArticleSectionTitle,
      Paragraph: ArticleSectionParagraph,
      Callout: ArticleCallout,
    }),
  }),
});
