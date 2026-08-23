import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";

type Post = {
  slug: string;
  title: string;
  url: string;
  publishedAt: string;
};

type Link = { href: string; title: string; datetime: string };

const TARGETS = [
  {
    slug: "shopify",
    url: "https://shopify.engineering/latest",
    article: (href: string) =>
      /^https:\/\/shopify\.engineering\/[a-z0-9-]+\/?$/.test(href) &&
      !href.includes("/topics/"),
  },
  {
    slug: "uber",
    url: "https://www.uber.com/blog/engineering/",
    article: (href: string) =>
      /uber\.com\/.*\/blog\/[a-z0-9-]+\/?$/.test(href) &&
      !/\/blog\/(engineering|advertising|earn|ride|eat|merchants|business)\/?$/.test(
        href,
      ),
  },
  {
    slug: "linkedin",
    url: "https://www.linkedin.com/blog/engineering",
    article: (href: string) =>
      /linkedin\.com\/blog\/engineering\/[a-z0-9-]+\/[a-z0-9-]+/.test(href),
  },
  {
    slug: "doordash",
    url: "https://careersatdoordash.com/blog/",
    article: (href: string) =>
      /careersatdoordash\.com\/blog\/[a-z0-9-]+/.test(href) ||
      /doordash\.engineering\/[0-9]{4}\//.test(href),
  },
];

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
    throw new Error("empty eval");
  }
  let parsed: unknown = JSON.parse(line);
  if (typeof parsed === "string") {
    parsed = JSON.parse(parsed);
  }
  return parsed as T;
}

function linksOnPage(): Link[] {
  return evalJson<Link[]>(`
    JSON.stringify([...document.querySelectorAll("a[href]")].map((a) => {
      const root = a.closest("article, li") || a.parentElement;
      const time = root && root.querySelector("time");
      return {
        href: a.href.split("#")[0].split("?")[0],
        title: (a.innerText || "").trim(),
        datetime: (time && (time.getAttribute("datetime") || time.textContent)) || ""
      };
    }))
  `);
}

function dateOnPage() {
  return evalJson<string>(`
    JSON.stringify(
      (document.querySelector("time") && (document.querySelector("time").getAttribute("datetime") || document.querySelector("time").textContent))
      || (document.querySelector('meta[property="article:published_time"]') && document.querySelector('meta[property="article:published_time"]').getAttribute("content"))
      || ""
    )
  `);
}

function cleanTitle(raw: string) {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 16 && !/^(engineering|blog|read more)$/i.test(line))
    ?.replace(/\s+/g, " ")
    .slice(0, 160);
}

async function deepmindFromRss() {
  const xml = await (
    await fetch("https://deepmind.google/blog/rss.xml", {
      headers: { "user-agent": "Mozilla/5.0" },
    })
  ).text();
  const items = xml.match(/<item[\s\S]*?<\/item>/g) ?? [];
  const posts: Post[] = [];
  for (const item of items) {
    const title = item.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.trim() ?? "";
    const url = item.match(/<link>([\s\S]*?)<\/link>/)?.[1]?.trim() ?? "";
    const publishedAt = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] ?? "";
    if (!title || !url || Number.isNaN(Date.parse(publishedAt))) {
      continue;
    }
    if (
      /\b(partnership|announcing our partnership|we're launching|we're expanding)\b/i.test(
        title,
      )
    ) {
      continue;
    }
    posts.push({
      slug: "deepmind",
      title,
      url,
      publishedAt: new Date(publishedAt).toISOString(),
    });
    if (posts.length >= 10) {
      break;
    }
  }
  return posts;
}

async function main() {
  const existing = JSON.parse(
    await readFile(new URL("./data/posts.json", import.meta.url), "utf8"),
  ) as Post[];

  try {
    run(["close", "--all"]);
  } catch {
    // none
  }

  const extra: Post[] = await deepmindFromRss();
  console.log(`deepmind rss ${extra.length}`);

  for (const target of TARGETS) {
    console.log(`scraping ${target.slug}`);
    try {
      run(["open", target.url]);
      run(["wait", "3000"]);
    } catch (error) {
      console.log(`  open failed ${error}`);
      continue;
    }

    const seen = new Set<string>();
    const candidates = linksOnPage().filter((link) => {
      const title = cleanTitle(link.title);
      if (!title || seen.has(link.href) || !target.article(link.href)) {
        return false;
      }
      seen.add(link.href);
      return true;
    });

    console.log(`  candidates ${candidates.length}`);
    let added = 0;
    for (const candidate of candidates.slice(0, 14)) {
      if (added >= 10) {
        break;
      }
      const title = cleanTitle(candidate.title);
      if (!title) {
        continue;
      }

      let publishedAt = candidate.datetime;
      if (!publishedAt || Number.isNaN(Date.parse(publishedAt))) {
        try {
          run(["open", candidate.href]);
          run(["wait", "2000"]);
          publishedAt = dateOnPage();
        } catch {
          continue;
        }
      }
      if (!publishedAt || Number.isNaN(Date.parse(publishedAt))) {
        continue;
      }

      extra.push({
        slug: target.slug,
        title,
        url: candidate.href,
        publishedAt: new Date(publishedAt).toISOString(),
      });
      added += 1;
    }
    console.log(`  kept ${added}`);
  }

  const seen = new Set(existing.map((post) => post.url));
  const merged = [...existing];
  for (const post of extra) {
    if (seen.has(post.url)) {
      continue;
    }
    const count = merged.filter((row) => row.slug === post.slug).length;
    if (count >= 10) {
      continue;
    }
    seen.add(post.url);
    merged.push(post);
  }

  merged.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  await writeFile(
    new URL("./data/posts.json", import.meta.url),
    `${JSON.stringify(merged, null, 2)}\n`,
  );

  try {
    run(["close", "--all"]);
  } catch {
    // ignore
  }

  const counts = new Map<string, number>();
  for (const post of merged) {
    counts.set(post.slug, (counts.get(post.slug) ?? 0) + 1);
  }
  console.log("totals", Object.fromEntries(counts), "all", merged.length);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
