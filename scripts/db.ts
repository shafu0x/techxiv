import { config } from "dotenv";
import { PrismaNeonHttp } from "@prisma/adapter-neon";
import { PrismaClient } from "../src/generated/prisma/client";
import { canonicalPostUrl } from "../src/lib/url";

config({ path: ".env.local" });

const select = {
  id: true,
  title: true,
  url: true,
  publishedAt: true,
  viralityScore: true,
  viralityScoredAt: true,
  organization: { select: { name: true } },
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

async function main() {
  const [command, query, value] = process.argv.slice(2);
  if (command !== "find" && command !== "virality") {
    console.error("Usage:\n  npm run db -- find <url-or-title>\n  npm run db -- virality <url-or-title> <score>");
    process.exit(1);
  }
  if (!query) {
    throw new Error("url or title is required");
  }

  const prisma = client();
  try {
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

    const updated = await prisma.post.update({
      where: { id: posts[0].id },
      data: { viralityScore: score, viralityScoredAt: new Date() },
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
