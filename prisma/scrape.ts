import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import orgs from "./data/orgs.json";
import { FEEDS, fetchFeedPosts } from "../src/lib/feeds";

type Link = {
  href: string;
  title: string;
  datetime: string;
};

type Post = {
  slug: string;
  title: string;
  url: string;
  publishedAt: string;
};

function run(args: string[]) {
  return execFileSync("agent-browser", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 45_000,
  });
}

function evalJson<T>(script: string): T {
  const out = run(["eval", script]);
  const line = out.trim().split("\n").pop();
  if (!line) {
    throw new Error("agent-browser eval returned no output");
  }

  let parsed: unknown = JSON.parse(line);
  if (typeof parsed === "string") {
    parsed = JSON.parse(parsed);
  }
  return parsed as T;
}

function cleanTitle(raw: string) {
  const lines = raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 8);
  return (lines[0] ?? raw).replace(/\s+/g, " ").slice(0, 160);
}

function dateFromText(text: string) {
  const withYear = text.match(
    /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2},?\s+\d{4}\b/i,
  );
  if (withYear) {
    return withYear[0];
  }

  const dayMonth = text.match(
    /\b(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december)\b/i,
  );
  if (dayMonth) {
    return `${dayMonth[0]} 2026`;
  }

  return "";
}

function dateFromUrl(href: string) {
  const ymd = href.match(/\/(20\d{2})\/(\d{1,2})\/(\d{1,2})\//);
  if (ymd) {
    return `${ymd[1]}-${ymd[2].padStart(2, "0")}-${ymd[3].padStart(2, "0")}`;
  }

  const ym = href.match(/\/(20\d{2})\/(\d{1,2})\//);
  if (ym) {
    return `${ym[1]}-${ym[2].padStart(2, "0")}-01`;
  }

  return "";
}

function looksLikeArticle(orgHost: string, href: string) {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return false;
  }

  const host = url.hostname.replace(/^www\./, "");
  const related =
    host.endsWith(orgHost) ||
    orgHost.endsWith(host) ||
    href.includes(orgHost.split(".").slice(-2).join("."));
  if (!related) {
    return false;
  }

  const path = url.pathname.toLowerCase();
  if (
    path === "/" ||
    path.endsWith("/blog") ||
    path.endsWith("/blog/") ||
    path.endsWith("/engineering") ||
    path.endsWith("/engineering/") ||
    path.endsWith("/news") ||
    path.endsWith("/news/") ||
    /\/(tag|tags|category|author|authors|page|topic|topics|feed|rss)\//.test(path)
  ) {
    return false;
  }

  return path.split("/").filter(Boolean).length >= 1;
}

function extractLinks(): Link[] {
  return evalJson<Link[]>(`
    JSON.stringify([...document.querySelectorAll("a[href]")].map((a) => {
      const root = a.closest("article, li, [class*='post'], [class*='card']") ?? a.parentElement;
      const time = root?.querySelector("time");
      const text = (a.innerText || "").trim();
      return {
        href: a.href,
        title: text,
        datetime: time?.getAttribute("datetime") || (time?.textContent || "").trim(),
      };
    }).filter((row) => row.title.length > 8 && row.title.length < 400))
  `);
}

function pickFromLinks(slug: string, host: string, links: Link[]) {
  const seen = new Set<string>();
  const posts: Post[] = [];

  for (const link of links) {
    const url = link.href.split("#")[0].split("?")[0];
    const title = cleanTitle(link.title);
    if (seen.has(url) || !looksLikeArticle(host, url) || !title) {
      continue;
    }

    const publishedAt = link.datetime || dateFromText(link.title) || dateFromUrl(url);
    if (!publishedAt || Number.isNaN(Date.parse(publishedAt))) {
      continue;
    }

    seen.add(url);
    posts.push({
      slug,
      title,
      url,
      publishedAt: new Date(publishedAt).toISOString(),
    });
  }

  return posts;
}

async function main() {
  const existing = JSON.parse(
    await readFile(new URL("./data/posts.json", import.meta.url), "utf8"),
  ) as Post[];
  const bySlug = new Map<string, Post[]>();
  for (const post of existing) {
    const list = bySlug.get(post.slug) ?? [];
    list.push(post);
    bySlug.set(post.slug, list);
  }

  try {
    run(["close", "--all"]);
  } catch {
    // no existing session
  }

  for (const org of orgs) {
    console.log(`scraping ${org.slug}`);
    const host = new URL(org.blogUrl).hostname.replace(/^www\./, "");
    let found: Post[] = [];

    if (FEEDS[org.slug]) {
      const feedPosts = await fetchFeedPosts(FEEDS[org.slug]);
      found = feedPosts.map((post) => ({ slug: org.slug, ...post }));
      console.log(`  feed ${found.length}`);
    }

    if (found.length === 0) {
      try {
        run(["open", org.blogUrl]);
        run(["wait", "2500"]);
        found = pickFromLinks(org.slug, host, extractLinks());
        console.log(`  browser ${found.length}`);
      } catch (error) {
        console.log(`  browser failed: ${error}`);
      }
    }

    const already = bySlug.get(org.slug) ?? [];
    const seen = new Set(already.map((post) => post.url));
    const merged = [...already];
    for (const post of found) {
      if (seen.has(post.url)) {
        continue;
      }
      seen.add(post.url);
      merged.push(post);
    }

    bySlug.set(org.slug, merged);
    console.log(`  kept ${merged.length}`);
  }

  const posts = [...bySlug.values()]
    .flat()
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));

  await writeFile(
    new URL("./data/posts.json", import.meta.url),
    `${JSON.stringify(posts, null, 2)}\n`,
  );

  try {
    run(["close", "--all"]);
  } catch {
    // ignore
  }

  console.log(`wrote ${posts.length} posts`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
