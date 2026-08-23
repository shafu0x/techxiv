import { classifyPosts, type Label } from "./classify";
import { FEEDS, fetchFeedPosts } from "./feeds";
import { getPrisma } from "./prisma";
import type { Category, Kind } from "../generated/prisma/client";

const HTML_INDEXES: Record<string, string> = {
  anthropic: "https://www.anthropic.com/engineering",
  shopify: "https://shopify.engineering/latest",
  figma: "https://www.figma.com/blog/engineering/",
  uber: "https://www.uber.com/blog/engineering/",
  linkedin: "https://www.linkedin.com/blog/engineering",
};

const HEADERS = { "user-agent": "Mozilla/5.0 (compatible; TechBlogsBot/1.0)" };

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
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&([a-z]+);/gi, (match, name: string) => NAMED_ENTITIES[name.toLowerCase()] ?? match)
    .trim();
}

function cleanTitle(raw: string) {
  return raw.replace(/\s+/g, " ").slice(0, 160);
}

function articleHrefs(html: string, pageUrl: string) {
  const origin = new URL(pageUrl).origin;
  const hrefs: string[] = [];
  const seen = new Set<string>();

  for (const match of html.matchAll(/href="([^"]+)"/gi)) {
    let url: URL;
    try {
      url = new URL(match[1], origin);
    } catch {
      continue;
    }

    const href = `${url.origin}${url.pathname}`.replace(/\/$/, "");
    if (seen.has(href)) {
      continue;
    }

    seen.add(href);
    hrefs.push(href);
  }

  return hrefs;
}

async function postsFromHtml(
  pageUrl: string,
  slug: string,
  organizationId: string,
  existing: Set<string>,
) {
  const response = await fetch(pageUrl, { headers: HEADERS });
  if (!response.ok) {
    return [];
  }

  const host = new URL(pageUrl).hostname.replace(/^www\./, "");
  const candidates = articleHrefs(await response.text(), pageUrl).filter((href) => {
    const path = new URL(href).pathname;
    return (
      href.includes(host) &&
      path.split("/").filter(Boolean).length >= 2 &&
      !/\/(tag|tags|category|author|page|topic|feed|rss)\//i.test(path) &&
      !existing.has(href) &&
      !existing.has(`${href}/`)
    );
  });

  const posts: FoundPost[] = [];
  for (const url of candidates) {
    const article = await fetch(url, { headers: HEADERS });
    if (!article.ok) {
      continue;
    }

    const html = await article.text();
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

    posts.push({
      slug,
      title,
      url,
      publishedAt: new Date(),
      organizationId,
    });
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
          const posts = await fetchFeedPosts(FEEDS[org.slug], existing);
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

        if (HTML_INDEXES[org.slug]) {
          found.push(...(await postsFromHtml(HTML_INDEXES[org.slug], org.slug, org.id, existing)));
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
          url: post.url,
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
