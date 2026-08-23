export const FEEDS: Record<string, string> = {
  openai: "https://openai.com/news/rss.xml",
  spotify: "https://engineering.atspotify.com/feed/",
  netflix: "https://netflixtechblog.com/feed",
  vercel: "https://vercel.com/atom",
  stripe: "https://stripe.com/blog/feed.rss",
  cloudflare: "https://blog.cloudflare.com/rss/",
  "jane-street": "https://blog.janestreet.com/feed.xml",
  flyio: "https://fly.io/blog/feed.xml",
  discord: "https://discord.com/blog/rss.xml",
  meta: "https://engineering.fb.com/feed/",
  dropbox: "https://dropbox.tech/feed",
  datadog: "https://www.datadoghq.com/blog/engineering/index.xml",
  github: "https://github.blog/engineering/feed/",
  deepmind: "https://deepmind.google/blog/rss.xml",
  slack: "https://slack.engineering/feed/",
};

export type FeedPost = {
  title: string;
  url: string;
  publishedAt: string;
};

const HEADERS = { "user-agent": "Mozilla/5.0 (compatible; TechBlogsBot/1.0)" };

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

function parseFeed(xml: string): FeedPost[] {
  const items = xml.match(/<(?:item|entry)\b[\s\S]*?<\/(?:item|entry)>/gi) ?? [];
  const posts: FeedPost[] = [];

  for (const item of items) {
    const title = decode(item.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").replace(
      /\s+/g,
      " ",
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

    if (!title || !url || Number.isNaN(publishedAt.getTime())) {
      continue;
    }

    posts.push({ title: title.slice(0, 160), url, publishedAt: publishedAt.toISOString() });
  }

  return posts;
}

async function fetchXml(url: string) {
  const response = await fetch(url, { headers: HEADERS });
  if (!response.ok) {
    return "";
  }

  const text = await response.text();
  if (!/<(?:item|entry)\b/i.test(text)) {
    return "";
  }

  return text;
}

function withPage(feedUrl: string, param: string, page: number) {
  const url = new URL(feedUrl);
  url.searchParams.set(param, String(page));
  return url.href;
}

export async function fetchFeedPosts(feedUrl: string, known: Set<string> = new Set()) {
  const seen = new Set<string>();
  const posts: FeedPost[] = [];

  const take = (xml: string) => {
    let added = 0;
    for (const post of parseFeed(xml)) {
      const url = post.url.replace(/\/$/, "");
      if (seen.has(url) || known.has(url) || known.has(post.url)) {
        continue;
      }
      seen.add(url);
      posts.push(post);
      added += 1;
    }
    return added;
  };

  const first = await fetchXml(feedUrl);
  if (!first) {
    return posts;
  }
  take(first);

  for (let page = 2; page <= 80; page += 1) {
    let added = 0;
    for (const param of ["paged", "page"] as const) {
      const xml = await fetchXml(withPage(feedUrl, param, page));
      if (!xml) {
        continue;
      }
      added = take(xml);
      if (added > 0) {
        break;
      }
    }
    if (added === 0) {
      break;
    }
  }

  return posts;
}
