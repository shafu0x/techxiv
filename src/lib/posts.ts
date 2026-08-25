import { cacheLife, cacheTag } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { HIDDEN_CATEGORIES, HIDDEN_KINDS } from "@/lib/taxonomy";
import type { Category as PrismaCategory, Kind as PrismaKind } from "@/generated/prisma/client";

export const PAGE_SIZE = 20;
export const VIRAL_THRESHOLD = 80;
const FEED_SIZE = 50;

type PostFilters = {
  slugs: string[];
  q: string;
  viral: boolean;
};

// Enum members are snake_case in the client but kebab-case in the URL.
function toPrismaEnum(value: string) {
  return value.replace(/-/g, "_");
}

export function buildWhere({ slugs, q, viral }: PostFilters) {
  return {
    ...(HIDDEN_KINDS.length > 0
      ? { kind: { notIn: HIDDEN_KINDS.map((kind) => toPrismaEnum(kind) as PrismaKind) } }
      : {}),
    ...(slugs.length > 0 ? { organization: { slug: { in: slugs } } } : {}),
    ...(HIDDEN_CATEGORIES.length > 0
      ? {
          category: {
            notIn: HIDDEN_CATEGORIES.map((category) => toPrismaEnum(category) as PrismaCategory),
          },
        }
      : {}),
    ...(q ? { title: { contains: q, mode: "insensitive" as const } } : {}),
    ...(viral ? { viralityScore: { gt: VIRAL_THRESHOLD } } : {}),
  };
}

async function queryPage(filters: PostFilters, page: number) {
  const where = buildWhere(filters);
  const prisma = getPrisma();
  const include = { organization: true } as const;

  if (filters.viral) {
    const [total, posts] = await Promise.all([
      prisma.post.count({ where }),
      prisma.post.findMany({
        where,
        orderBy: { publishedAt: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include,
      }),
    ]);

    return { posts, total };
  }

  const [total, pinned] = await Promise.all([
    prisma.post.count({ where }),
    prisma.post.findFirst({
      where: { ...where, viralityScore: { gt: VIRAL_THRESHOLD } },
      orderBy: { publishedAt: "desc" },
      include,
    }),
  ]);

  if (!pinned) {
    const posts = await prisma.post.findMany({
      where,
      orderBy: { publishedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include,
    });

    return { posts, total };
  }

  const rest = await prisma.post.findMany({
    where: { ...where, id: { not: pinned.id } },
    orderBy: { publishedAt: "desc" },
    skip: page === 1 ? 0 : (page - 1) * PAGE_SIZE - 1,
    take: page === 1 ? PAGE_SIZE - 1 : PAGE_SIZE,
    include,
  });

  return { posts: page === 1 ? [pinned, ...rest] : rest, total };
}

async function cachedPage(slugs: string[], viral: boolean, page: number) {
  "use cache: remote";
  cacheTag("posts");
  cacheLife("days");

  return queryPage({ slugs, q: "", viral }, page);
}

function fetchPage(filters: PostFilters, page: number) {
  // Search terms are unbounded, so caching them would create an entry per
  // keystroke. Only the selections the filter UI can produce are cached, sorted
  // so that equivalent selections share one entry.
  if (filters.q) {
    return queryPage(filters, page);
  }

  return cachedPage([...filters.slugs].sort(), filters.viral, page);
}

export async function getPosts(filters: PostFilters, requestedPage: number) {
  const requested = await fetchPage(filters, requestedPage);
  const pageCount = Math.max(1, Math.ceil(requested.total / PAGE_SIZE));

  if (requestedPage <= pageCount) {
    return { ...requested, page: requestedPage, pageCount };
  }

  const last = await fetchPage(filters, pageCount);
  return { ...last, page: pageCount, pageCount };
}

export async function getFeedPosts() {
  "use cache";
  cacheTag("posts");
  cacheLife("days");

  return getPrisma().post.findMany({
    where: buildWhere({ slugs: [], q: "", viral: false }),
    orderBy: { publishedAt: "desc" },
    take: FEED_SIZE,
    include: { organization: true },
  });
}
