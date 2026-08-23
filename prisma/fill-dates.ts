import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";

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
    throw new Error("empty eval");
  }
  let parsed: unknown = JSON.parse(line);
  if (typeof parsed === "string") {
    parsed = JSON.parse(parsed);
  }
  return parsed as T;
}

function dateFromText(text: string) {
  const match = text.match(
    /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}\b/,
  );
  return match ? match[0] : "";
}

async function collect(slug: string, indexUrl: string, isArticle: (href: string) => boolean) {
  run(["open", indexUrl]);
  run(["wait", "2500"]);
  const hrefs = evalJson<string[]>(
    "JSON.stringify([...new Set([...document.querySelectorAll('a[href]')].map((a) => a.href.split('#')[0].split('?')[0]))])",
  );
  const posts: Post[] = [];
  const seen = new Set<string>();

  for (const href of hrefs) {
    if (posts.length >= 10 || seen.has(href) || !isArticle(href)) {
      continue;
    }
    seen.add(href);
    try {
      run(["open", href]);
      run(["wait", "1800"]);
    } catch {
      continue;
    }
    const title = evalJson<string>("JSON.stringify(document.title)");
    const body = evalJson<string>("JSON.stringify(document.body.innerText.slice(0, 800))");
    const publishedAt = dateFromText(body);
    const clean = title
      .replace(/\s*[|\-–].*$/, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!clean || !publishedAt || Number.isNaN(Date.parse(publishedAt))) {
      console.log(`  skip ${href}`);
      continue;
    }
    posts.push({
      slug,
      title: clean.slice(0, 160),
      url: href,
      publishedAt: new Date(publishedAt).toISOString(),
    });
    console.log(`  + ${clean}`);
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

  const extra: Post[] = [];
  extra.push(
    ...(await collect(
      "uber",
      "https://www.uber.com/us/en/blog/engineering/backend/",
      (href) =>
        /uber\.com\/us\/en\/blog\/[a-z0-9-]+\/?$/.test(href) &&
        !/\/blog\/(engineering|advertising|earn|ride|eat|merchants|business|health|transit)\/?$/.test(
          href,
        ),
    )),
  );
  extra.push(
    ...(await collect(
      "linkedin",
      "https://www.linkedin.com/blog/engineering/data-streaming-processing",
      (href) => /linkedin\.com\/blog\/engineering\/[a-z0-9-]+\/[a-z0-9-]+/.test(href),
    )),
  );
  extra.push(
    ...(await collect(
      "doordash",
      "https://careersatdoordash.com/blog/",
      (href) => /careersatdoordash\.com\/(blog|engineering-blog)\/[a-z0-9-]+/.test(href),
    )),
  );

  const seen = new Set(existing.map((post) => post.url));
  const merged = [...existing];
  for (const post of extra) {
    if (seen.has(post.url)) {
      continue;
    }
    if (merged.filter((row) => row.slug === post.slug).length >= 10) {
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
