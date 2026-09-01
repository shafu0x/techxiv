import { cacheLife, cacheTag } from "next/cache";
import { PAGE_SIZE, VIRAL_THRESHOLD, type FeedPost } from "@/lib/feed";
import { getPrisma } from "@/lib/prisma";
import { HIDDEN_CATEGORIES, HIDDEN_KINDS } from "@/lib/taxonomy";
import type { Category as PrismaCategory, Kind as PrismaKind } from "@/generated/prisma/client";

const FEED_SIZE = 50;

export type FeedView = "feed" | "all" | "news";

export type PostFilters = {
  slugs: string[];
  viral: boolean;
  view?: FeedView;
};

const orderBy = [{ publishedAt: "desc" as const }, { id: "desc" as const }];
const include = { organization: true } as const;

// Enum members are snake_case in the client but kebab-case in the URL.
function toPrismaEnum(value: string) {
  return value.replace(/-/g, "_");
}

const hiddenKinds = HIDDEN_KINDS.map((kind) => toPrismaEnum(kind) as PrismaKind);
const hiddenCategories = HIDDEN_CATEGORIES.map(
  (category) => toPrismaEnum(category) as PrismaCategory,
);

function buildWhere({ slugs, viral, view = "feed" }: PostFilters) {
  return {
    ...(view === "feed"
      ? { kind: { notIn: hiddenKinds }, category: { notIn: hiddenCategories } }
      : {}),
    ...(view === "news"
      ? { OR: [{ kind: { in: hiddenKinds } }, { category: { in: hiddenCategories } }] }
      : {}),
    ...(slugs.length > 0 ? { organization: { slug: { in: slugs } } } : {}),
    ...(viral ? { viralityScore: { gt: VIRAL_THRESHOLD } } : {}),
  };
}

export function parseCursor(value: string) {
  const sep = value.lastIndexOf("_");
  if (sep <= 0 || sep === value.length - 1) {
    return null;
  }

  const publishedAt = new Date(value.slice(0, sep));
  const id = value.slice(sep + 1);
  if (!id || Number.isNaN(publishedAt.getTime())) {
    return null;
  }

  return { publishedAt, id };
}

function encodeCursor(post: { publishedAt: Date; id: string }) {
  return `${post.publishedAt.toISOString()}_${post.id}`;
}

function serializePost(post: {
  id: string;
  title: string;
  url: string;
  publishedAt: Date;
  viralityScore: number | null;
  organization: { name: string; logo: string };
}): FeedPost {
  return {
    id: post.id,
    title: post.title,
    url: post.url,
    publishedAt: post.publishedAt.toISOString(),
    viralityScore: post.viralityScore,
    organization: {
      name: post.organization.name,
      logo: post.organization.logo,
    },
  };
}

function afterCursor(cursor: { publishedAt: Date; id: string }) {
  return {
    OR: [
      { publishedAt: { lt: cursor.publishedAt } },
      { publishedAt: cursor.publishedAt, id: { lt: cursor.id } },
    ],
  };
}

function paginate(rows: Parameters<typeof serializePost>[0][], take: number) {
  const hasMore = rows.length > take;
  const kept = hasMore ? rows.slice(0, take) : rows;
  return {
    posts: kept.map(serializePost),
    nextCursor: hasMore ? encodeCursor(kept[kept.length - 1]) : null,
  };
}

async function queryChunk(filters: PostFilters, cursor: string | null) {
  const parsed = cursor ? parseCursor(cursor) : null;
  if (cursor && !parsed) {
    throw new Error("Invalid cursor");
  }

  const where = buildWhere(filters);
  const prisma = getPrisma();

  if (filters.viral) {
    const rows = await prisma.post.findMany({
      where: parsed ? { AND: [where, afterCursor(parsed)] } : where,
      orderBy,
      take: PAGE_SIZE + 1,
      include,
    });
    return paginate(rows, PAGE_SIZE);
  }

  const pinned = await prisma.post.findFirst({
    where: { ...where, viralityScore: { gt: VIRAL_THRESHOLD } },
    orderBy,
    include,
  });

  const restWhere = {
    AND: [
      where,
      ...(pinned ? [{ id: { not: pinned.id } }] : []),
      ...(parsed ? [afterCursor(parsed)] : []),
    ],
  };

  if (!parsed && pinned) {
    const rest = await prisma.post.findMany({
      where: restWhere,
      orderBy,
      take: PAGE_SIZE,
      include,
    });
    const kept = rest.slice(0, PAGE_SIZE - 1);
    return {
      posts: [serializePost(pinned), ...kept.map(serializePost)],
      nextCursor:
        rest.length > PAGE_SIZE - 1 && kept.length > 0 ? encodeCursor(kept[kept.length - 1]) : null,
    };
  }

  const rows = await prisma.post.findMany({
    where: restWhere,
    orderBy,
    take: PAGE_SIZE + 1,
    include,
  });
  return paginate(rows, PAGE_SIZE);
}

async function cachedChunk(slugs: string[], viral: boolean, cursor: string | null, view: FeedView) {
  "use cache: remote";
  cacheTag("posts");
  cacheLife("days");

  return queryChunk({ slugs, viral, view }, cursor);
}

export async function getPosts(filters: PostFilters, cursor: string | null = null) {
  return cachedChunk([...filters.slugs].sort(), filters.viral, cursor, filters.view ?? "feed");
}

export async function getFeedPosts() {
  "use cache";
  cacheTag("posts");
  cacheLife("days");

  return getPrisma().post.findMany({
    where: buildWhere({ slugs: [], viral: false }),
    orderBy: { publishedAt: "desc" },
    take: FEED_SIZE,
    include: { organization: true },
  });
}
