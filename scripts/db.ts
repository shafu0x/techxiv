import { config } from "dotenv";
import { PrismaNeonHttp } from "@prisma/adapter-neon";
import { type Category, type Kind, PrismaClient } from "../src/generated/prisma/client";
import { scoreVisiblePosts } from "../src/lib/virality";
import { canonicalPostUrl } from "../src/lib/url";

config({ path: ".env.local", quiet: true });

const select = {
  id: true,
  title: true,
  url: true,
  publishedAt: true,
  category: true,
  kind: true,
  viralityScore: true,
  viralityScoredAt: true,
  viralityAttemptedAt: true,
  viralityError: true,
  organization: { select: { name: true, slug: true } },
} as const;

function client() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }

  return new PrismaClient({ adapter: new PrismaNeonHttp(url, {}) });
}

async function findPosts(prisma: PrismaClient, query: string) {
  if (URL.canParse(query)) {
    const post = await prisma.post.findUnique({
      where: { url: canonicalPostUrl(query) },
      select,
    });
    return post ? [post] : [];
  }

  return prisma.post.findMany({
    where: {
      OR: [
        { title: { contains: query, mode: "insensitive" } },
        { url: { contains: query, mode: "insensitive" } },
      ],
    },
    select,
    orderBy: { publishedAt: "desc" },
    take: 20,
  });
}

function percentile(sorted: number[], q: number) {
  if (sorted.length === 0) {
    return null;
  }
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}

async function main() {
  const [command, query, value] = process.argv.slice(2);
  if (
    command !== "recent" &&
    command !== "find" &&
    command !== "virality" &&
    command !== "backfill" &&
    command !== "virality-stats"
  ) {
    console.error(
      "Usage:\n  npm run db -- recent [limit]\n  npm run db -- find <url-or-title>\n  npm run db -- virality <url-or-title> <score>\n  npm run db -- backfill [limit]\n  npm run db -- virality-stats",
    );
    process.exit(1);
  }
  if ((command === "find" || command === "virality") && !query) {
    throw new Error("url or title is required");
  }

  const prisma = client();
  try {
    if (command === "recent") {
      const limit = query === undefined ? 1 : Number(query);
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
        throw new Error("limit must be an integer 1–100");
      }

      const posts = await prisma.post.findMany({
        select,
        orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
        take: limit,
      });
      console.log(JSON.stringify(posts, null, 2));
      return;
    }

    if (command === "backfill") {
      const erroredOnly = query === "errors";
      const limitArg = erroredOnly ? value : query;
      const limit = limitArg === undefined ? undefined : Number(limitArg);
      if (limit !== undefined && (!Number.isInteger(limit) || limit < 1)) {
        throw new Error("limit must be a positive integer");
      }

      console.log(JSON.stringify(await scoreVisiblePosts(limit, erroredOnly), null, 2));
      return;
    }

    if (command === "virality-stats") {
      const thresholds = [40, 50, 60, 65, 67, 70, 73, 75, 80, 90];

      function summarize(scores: number[]) {
        const sorted = [...scores].sort((a, b) => a - b);
        return {
          scored: sorted.length,
          p50: percentile(sorted, 0.5),
          p75: percentile(sorted, 0.75),
          p80: percentile(sorted, 0.8),
          p90: percentile(sorted, 0.9),
          p95: percentile(sorted, 0.95),
          above: Object.fromEntries(
            thresholds.map((threshold) => {
              const count = sorted.filter((score) => score > threshold).length;
              return [
                threshold,
                {
                  count,
                  share:
                    sorted.length === 0 ? 0 : Number(((100 * count) / sorted.length).toFixed(1)),
                },
              ];
            }),
          ),
        };
      }

      const hiddenKinds: Kind[] = ["announcement", "release_note"];
      const hiddenCategories: Category[] = ["business_culture"];
      const visibleWhere = {
        kind: { notIn: hiddenKinds },
        category: { notIn: hiddenCategories },
        viralityScore: { not: null },
      };

      const all = await prisma.post.findMany({
        where: visibleWhere,
        select: { viralityScore: true },
      });
      const feed = await prisma.post.findMany({
        where: visibleWhere,
        select: { viralityScore: true },
        orderBy: { publishedAt: "desc" },
        take: 300,
      });

      console.log(
        JSON.stringify(
          {
            all: summarize(
              all
                .map((post) => post.viralityScore)
                .filter((score): score is number => score != null),
            ),
            feed: summarize(
              feed
                .map((post) => post.viralityScore)
                .filter((score): score is number => score != null),
            ),
          },
          null,
          2,
        ),
      );
      return;
    }

    const posts = await findPosts(prisma, query);
    if (command === "find") {
      console.log(JSON.stringify(posts, null, 2));
      return;
    }

    const score = Number(value);
    if (!Number.isInteger(score) || score < 0 || score > 100) {
      throw new Error("score must be an integer 0–100");
    }
    if (posts.length !== 1) {
      throw new Error(`expected 1 post, found ${posts.length}`);
    }

    const now = new Date();
    const updated = await prisma.post.update({
      where: { id: posts[0].id },
      data: {
        viralityScore: score,
        viralityScoredAt: now,
        viralityAttemptedAt: now,
        viralityError: null,
      },
      select,
    });
    console.log(JSON.stringify(updated, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
