import { Helmet } from "react-helmet-async";

const SITE_URL = "https://smartschooladmin.app";
const SITE_NAME = "SmartSchoolAdmin";
const SOCIAL_IMAGE = `${SITE_URL}/brand/og-image-1200x630.png`;

interface SeoProps {
  /** Page title without the brand suffix. */
  title: string;
  description: string;
  /** Route path, e.g. "/privacy". Used for canonical and og:url. */
  path: string;
  noIndex?: boolean;
  /** Extra JSON-LD blocks for this page. */
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
}

/**
 * Per-route head tags. Each public page owns its own title, description,
 * canonical and social preview so search results and shared links describe
 * the actual page rather than repeating the site-wide summary.
 */
export function Seo({ title, description, path, noIndex, jsonLd }: SeoProps) {
  const fullTitle = title.includes(SITE_NAME) ? title : `${title} | ${SITE_NAME}`;
  const url = `${SITE_URL}${path}`;
  const blocks = jsonLd ? (Array.isArray(jsonLd) ? jsonLd : [jsonLd]) : [];

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={url} />
      {noIndex ? <meta name="robots" content="noindex, follow" /> : null}

      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:type" content="website" />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      <meta property="og:image" content={SOCIAL_IMAGE} />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={SOCIAL_IMAGE} />

      {blocks.map((block, i) => (
        <script type="application/ld+json" key={i}>
          {JSON.stringify(block)}
        </script>
      ))}
    </Helmet>
  );
}
