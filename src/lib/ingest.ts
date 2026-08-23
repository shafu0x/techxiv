import { getPrisma } from "./prisma";

const SKIP =
  /\b(hiring|career|changelog|newsletter|podcast|webinar|intern experience)\b/i;

const FEEDS: Record<string, string> = {
  openai: "https://openai.com/news/rss.xml",
  spotify: "https://engineering.atspotify.com/feed/",
  netflix: "https://netflixtechblog.com/feed",
  vercel: "https://vercel.com/atom",
  stripe: "https://stripe.com/blog/feed.rss",
  cloudflare: "https://blog.cloudflare.com/rss/",
  "jane-street": "https://blog.janestreet.com/feed.xml",
  flyio: "https://fly.io/blog/feed.xml",
  discord: "https://discord.com/blog/rss.xml",
  uber: "https://www.uber.com/blog/engineering/rss/",
  meta: "https://engineering.fb.com/feed/",
  dropbox: "https://dropbox.tech/feed",
  datadog: "https://www.datadoghq.com/blog/engineering/index.xml",
  shopify: "https://shopify.engineering/blogs/engineering.atom",
  github: "https://github.blog/engineering/feed/",
  deepmind: "https://deepmind.google/blog/rss.xml",
  linkedin: "https://www.linkedin.com/blog/engineering/rss",
  doordash: "https://careersatdoordash.com/engineering-blog/feed/",
};

const HTML_INDEXES: Record<string, string> = {
  anthropic: "https://www.anthropic.com/engineering",
};

const HEADERS = { "user-agent": "Mozilla/5.0 (compatible; TechBlogsBot/1.0)" };
const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

type FoundPost = {
  title: string;
  url: string;
  publishedAt: Date;
  organizationId: string;
};

function decode(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function cleanTitle(raw: string) {
  return raw.replace(/\s+/g, " ").slice(0, 160);
}

function postsFromFeed(xml: string, organizationId: string, cutoff: Date) {
  const items = xml.match(/<(?:item|entry)\b[\s\S]*?<\/(?:item|entry)>/gi) ?? [];
  const posts: FoundPost[] = [];

  for (const item of items) {
    if (posts.length >= 10) {
      break;
    }

    const title = cleanTitle(
      decode(item.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? ""),
    );
    const url = decode(
      item.match(/<link[^>]*href="([^"]+)"/i)?.[1] ??
        item.match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1] ??
        "",
    ).split("?")[0];
    const publishedRaw =
      item.match(
        /<(?:pubDate|published|updated|dc:date)[^>]*>([\s\S]*?)<\/(?:pubDate|published|updated|dc:date)>/i,
      )?.[1] ?? "";
    const publishedAt = new Date(publishedRaw);

    if (
      !title ||
      !url ||
      SKIP.test(title) ||
      Number.isNaN(publishedAt.getTime()) ||
      publishedAt <= cutoff
    ) {
      continue;
    }

    posts.push({ title, url, publishedAt, organizationId });
  }

  return posts;
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
  organizationId: string,
  existing: Set<string>,
) {
  const response = await fetch(pageUrl, { headers: HEADERS });
  if (!response.ok) {
    return [];
  }

  const host = new URL(pageUrl).hostname.replace(/^www\./, "");
  const candidates = articleHrefs(await response.text(), pageUrl).filter(
    (href) => {
      const path = new URL(href).pathname;
      return (
        href.includes(host) &&
        path.split("/").filter(Boolean).length >= 2 &&
        !/\/(tag|tags|category|author|page|topic|feed|rss)\//i.test(path) &&
        !existing.has(href) &&
        !existing.has(`${href}/`)
      );
    },
  );

  const posts: FoundPost[] = [];
  for (const url of candidates.slice(0, 3)) {
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
    if (!title || SKIP.test(title)) {
      continue;
    }

    posts.push({
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
    select: { url: true, publishedAt: true, organizationId: true },
  });

  const existing = new Set(rows.map((row) => row.url.replace(/\/$/, "")));
  const latestByOrg = new Map<string, Date>();
  for (const row of rows) {
    const prev = latestByOrg.get(row.organizationId);
    if (!prev || row.publishedAt > prev) {
      latestByOrg.set(row.organizationId, row.publishedAt);
    }
  }

  const found: FoundPost[] = [];
  const errors: string[] = [];

  await Promise.all(
    orgs.map(async (org) => {
      const cutoff =
        latestByOrg.get(org.id) ?? new Date(Date.now() - THIRTY_DAYS);

      try {
        if (FEEDS[org.slug]) {
          const response = await fetch(FEEDS[org.slug], { headers: HEADERS });
          if (!response.ok) {
            throw new Error(`${FEEDS[org.slug]} → ${response.status}`);
          }
          found.push(
            ...postsFromFeed(await response.text(), org.id, cutoff),
          );
          return;
        }

        if (HTML_INDEXES[org.slug]) {
          found.push(
            ...(await postsFromHtml(
              HTML_INDEXES[org.slug],
              org.id,
              existing,
            )),
          );
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

  let inserted = 0;
  for (const post of created) {
    try {
      await prisma.post.create({ data: post });
      inserted += 1;
    } catch (error) {
      console.error("ingest insert failed", post.url, error);
    }
  }

  return { inserted, scanned: found.length, errors };
}
