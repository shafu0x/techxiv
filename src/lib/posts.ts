import { cacheLife, cacheTag } from "next/cache";
import { getPrisma } from "@/lib/prisma";
import { HIDDEN_CATEGORIES, HIDDEN_KINDS, type Category } from "@/lib/taxonomy";
import type { Category as PrismaCategory, Kind as PrismaKind } from "@/generated/prisma/client";

export const PAGE_SIZE = 20;
const FEED_SIZE = 50;

type PostFilters = {
  slugs: string[];
  categories: Category[];
  q: string;
};

// Enum members are snake_case in the client but kebab-case in the URL.
function toPrismaEnum(value: string) {
  return value.replace(/-/g, "_");
}

function buildWhere({ slugs, categories, q }: PostFilters) {
  return {
    ...(HIDDEN_KINDS.length > 0
      ? { kind: { notIn: HIDDEN_KINDS.map((kind) => toPrismaEnum(kind) as PrismaKind) } }
      : {}),
    ...(slugs.length > 0 ? { organization: { slug: { in: slugs } } } : {}),
    ...(categories.length > 0
      ? {
          category: {
            in: categories.map((category) => toPrismaEnum(category) as PrismaCategory),
          },
        }
      : HIDDEN_CATEGORIES.length > 0
        ? {
            category: {
              notIn: HIDDEN_CATEGORIES.map((category) => toPrismaEnum(category) as PrismaCategory),
            },
          }
        : {}),
    ...(q ? { title: { contains: q, mode: "insensitive" as const } } : {}),
  };
}

async function queryPage(filters: PostFilters, page: number) {
  const where = buildWhere(filters);
  const prisma = getPrisma();

  const [total, posts] = await Promise.all([
    prisma.post.count({ where }),
    prisma.post.findMany({
      where,
      orderBy: { publishedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { organization: true },
    }),
  ]);

  return { posts, total };
}

async function cachedPage(slugs: string[], categories: Category[], page: number) {
  "use cache: remote";
  cacheTag("posts");
  cacheLife("days");

  return queryPage({ slugs, categories, q: "" }, page);
}

function fetchPage(filters: PostFilters, page: number) {
  // Search terms are unbounded, so caching them would create an entry per
  // keystroke. Only the selections the filter UI can produce are cached, sorted
  // so that equivalent selections share one entry.
  if (filters.q) {
    return queryPage(filters, page);
  }

  return cachedPage([...filters.slugs].sort(), [...filters.categories].sort(), page);
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
    where: buildWhere({ slugs: [], categories: [], q: "" }),
    orderBy: { publishedAt: "desc" },
    take: FEED_SIZE,
    include: { organization: true },
  });
}
