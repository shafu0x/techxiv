import { classifyPosts, type Label } from "./classify";
import { FEEDS, fetchFeedPosts } from "./feeds";
import { getPrisma } from "./prisma";
import type { Category, Kind } from "../generated/prisma/client";

/**
 * Orgs without a feed have to be scraped from an index page. `article` is an
 * allowlist: only same-host paths matching it are followed, because a blocklist
 * of junk paths always loses to the next marketing page a company ships.
 */
const HTML_INDEXES: Record<string, { index: string; article: RegExp }> = {
  anthropic: {
    index: "https://www.anthropic.com/engineering",
    article: /^\/engineering\/[a-z0-9-]+$/i,
  },
  shopify: {
    index: "https://shopify.engineering/latest",
    article: /^\/[a-z0-9-]+$/i,
  },
  figma: {
    index: "https://www.figma.com/blog/engineering/",
    article: /^\/blog\/[a-z0-9-]+$/i,
  },
  uber: {
    // Uber serves the same posts under /<country>/<language>/blog/<slug>.
    index: "https://www.uber.com/blog/engineering/",
    article: /^(?:\/[a-z]{2}\/[a-z]{2})?\/blog\/[a-z0-9-]+$/,
  },
  linkedin: {
    index: "https://www.linkedin.com/blog/engineering",
    article: /^\/blog\/engineering\/[a-z0-9-]+\/[a-z0-9-]+$/i,
  },
  notion: {
    index: "https://www.notion.com/blog/topic/tech",
    article: /^\/blog\/[a-z0-9-]+$/i,
  },
};

const HEADERS = { "user-agent": "Mozilla/5.0 (compatible; TechBlogsBot/1.0)" };

/** Amazon Science's feed mixes award and press announcements in with the research posts. */
const FEED_EXCLUDE: Record<string, RegExp> = {
  amazon: /\/(?:research-awards|latest-news)\//i,
};

type FoundPost = {
  slug: string;
  title: string;
  url: string;
  publishedAt: Date;
  organizationId: string;
};

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decode(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&([a-z]+);/gi, (match, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? match)
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .trim();
}

function cleanTitle(raw: string) {
  return raw.replace(/\s+/g, " ").slice(0, 160);
}

const MIN_YEAR = 2005;

function parseDate(raw: string | undefined) {
  if (!raw) {
    return null;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  // Reject placeholder years and anything the future, which is always bad metadata.
  if (parsed.getUTCFullYear() < MIN_YEAR || parsed.getTime() > Date.now() + 86_400_000) {
    return null;
  }

  return parsed;
}

/**
 * Reads the publish date a page states about *itself*. Every source here binds
 * the date to the page's own content, which is what makes a missing date a
 * reliable signal that the page is a listing or landing page, not an article.
 *
 * A bare `<time datetime>` is deliberately not consulted: on a category page the
 * first one belongs to the newest post in the list, which would make every
 * category page look like a freshly published article.
 */
function publishedFromHtml(html: string, url: string) {
  const stated =
    parseDate(
      html.match(/<meta[^>]+property="article:published_time"[^>]+content="([^"]+)"/i)?.[1],
    ) ??
    parseDate(html.match(/<meta[^>]+itemProp="datePublished"[^>]+content="([^"]+)"/i)?.[1]) ??
    parseDate(html.match(/"datePublished"\s*:\s*"([^"]+)"/i)?.[1]) ??
    parseDate(html.match(/data-published-date="([^"]+)"/i)?.[1]) ??
    parseDate(
      html.match(
        /<meta[^>]+name="(?:publish(?:ed)?[-_ ]?date|date|DC\.date[^"]*)"[^>]+content="([^"]+)"/i,
      )?.[1],
    ) ??
    // Visible dates count only when labelled, e.g. `Published <!-- -->May 25, 2026`.
    parseDate(
      html.match(
        /(?:Published|Posted)(?:\s+on)?\s*(?:<[^>]*>|<!--[^>]*-->|\s)*([A-Z][a-z]+ \d{1,2},? \d{4})/,
      )?.[1],
    );
  if (stated) {
    return stated;
  }

  const fromUrl = url.match(/\/(20\d{2})\/(\d{1,2})(?:\/(\d{1,2}))?(?:\/|$)/);
  if (fromUrl) {
    const [, year, month, day] = fromUrl;
    return parseDate(`${year}-${month.padStart(2, "0")}-${(day ?? "01").padStart(2, "0")}`);
  }

  return null;
}

/**
 * Same-host links whose path matches the org's article pattern. Anything else on
 * the index page (nav, product pages, help center, other locales) is dropped.
 */
function articleHrefs(html: string, indexUrl: string, article: RegExp) {
  const index = new URL(indexUrl);
  // Localised copies of the index share its last segment, e.g. /de/de/blog/engineering.
  const indexLeaf = index.pathname.replace(/\/+$/, "").split("/").pop();
  const hrefs: string[] = [];
  const seen = new Set<string>();

  for (const match of html.matchAll(/href="([^"]+)"/gi)) {
    let url: URL;
    try {
      url = new URL(match[1], index);
    } catch {
      continue;
    }

    const path = url.pathname.replace(/\/+$/, "");
    if (
      url.hostname !== index.hostname ||
      path.split("/").pop() === indexLeaf ||
      !article.test(path)
    ) {
      continue;
    }

    const href = `${url.origin}${path}`;
    if (seen.has(href)) {
      continue;
    }

    seen.add(href);
    hrefs.push(href);
  }

  return hrefs;
}

async function postsFromHtml(
  { index, article }: { index: string; article: RegExp },
  slug: string,
  organizationId: string,
  existing: Set<string>,
) {
  const response = await fetch(index, { headers: HEADERS });
  if (!response.ok) {
    return [];
  }

  const candidates = articleHrefs(await response.text(), index, article).filter(
    (href) => !existing.has(href),
  );

  const posts: FoundPost[] = [];
  for (const url of candidates) {
    const response = await fetch(url, { headers: HEADERS });
    if (!response.ok) {
      continue;
    }

    const html = await response.text();
    const title = cleanTitle(
      decode(
        html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i)?.[1] ??
          html.match(/<title>([^<]+)/i)?.[1]?.replace(/\s*[|–—-].*$/, "") ??
          "",
      ),
    );
    if (!title) {
      continue;
    }

    // A page that never states a publish date is a landing page, not a post.
    const publishedAt = publishedFromHtml(html, url);
    if (!publishedAt) {
      continue;
    }

    posts.push({ slug, title, url, publishedAt, organizationId });
  }

  return posts;
}

export async function ingestNewPosts() {
  const prisma = getPrisma();
  const orgs = await prisma.organization.findMany();
  const rows = await prisma.post.findMany({
    select: { url: true, organizationId: true },
  });

  const existing = new Set(rows.map((row) => row.url.replace(/\/$/, "")));
  const found: FoundPost[] = [];
  const errors: string[] = [];

  await Promise.all(
    orgs.map(async (org) => {
      try {
        if (FEEDS[org.slug]) {
          const exclude = FEED_EXCLUDE[org.slug];
          const posts = (await fetchFeedPosts(FEEDS[org.slug], existing)).filter(
            (post) => !exclude?.test(post.url),
          );
          found.push(
            ...posts.map((post) => ({
              slug: org.slug,
              title: post.title,
              url: post.url,
              publishedAt: new Date(post.publishedAt),
              organizationId: org.id,
            })),
          );
          return;
        }

        const html = HTML_INDEXES[org.slug];
        if (html) {
          found.push(...(await postsFromHtml(html, org.slug, org.id, existing)));
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`ingest ${org.slug}: ${message}`);
        errors.push(`${org.slug}: ${message}`);
      }
    }),
  );

  const seen = new Set(existing);
  const created = found.filter((post) => {
    const url = post.url.replace(/\/$/, "");
    if (seen.has(url)) {
      return false;
    }
    seen.add(url);
    return true;
  });

  const labels: Map<string, Label> = created.length > 0 ? await classifyPosts(created) : new Map();

  let inserted = 0;
  let unlabeled = 0;
  for (const post of created) {
    const label = labels.get(post.title);
    if (!label) {
      // category and kind are required, so an unlabeled post cannot be stored.
      // Leaving it out means the next run retries it instead of losing it.
      unlabeled += 1;
      continue;
    }

    try {
      await prisma.post.create({
        data: {
          title: post.title,
          url: post.url.replace(/\/$/, ""),
          publishedAt: post.publishedAt,
          organizationId: post.organizationId,
          category: label.category.replace(/-/g, "_") as Category,
          kind: label.kind.replace(/-/g, "_") as Kind,
        },
      });
      inserted += 1;
    } catch (error) {
      console.error("ingest insert failed", post.url, error);
    }
  }

  if (unlabeled > 0) {
    errors.push(`${unlabeled} posts skipped: classification failed`);
  }

  return { inserted, scanned: found.length, errors };
}
