import Image from "next/image";
import Link from "next/link";
import { CategoryFilter } from "@/components/category-filter";
import { PostFilters } from "@/components/post-filters";
import { TitleSearch } from "@/components/title-search";
import { Card } from "@/components/ui/card";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { getPrisma } from "@/lib/prisma";
import { HIDDEN_CATEGORIES, HIDDEN_KINDS, VISIBLE_CATEGORIES, type Category } from "@/lib/taxonomy";
import type { Category as PrismaCategory, Kind as PrismaKind } from "@/generated/prisma/client";

const PAGE_SIZE = 20;

function visiblePages(page: number, pageCount: number) {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, index) => index + 1);
  }

  const start = Math.max(2, page - 1);
  const end = Math.min(pageCount - 1, page + 1);
  const items: Array<number | "…"> = [1];

  if (start > 2) {
    items.push("…");
  }

  for (let number = start; number <= end; number++) {
    items.push(number);
  }

  if (end < pageCount - 1) {
    items.push("…");
  }

  items.push(pageCount);
  return items;
}

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const relativeFormatter = new Intl.RelativeTimeFormat("en-US", {
  numeric: "always",
});

const RELATIVE_UNITS = [
  { unit: "year", seconds: 31_536_000 },
  { unit: "month", seconds: 2_592_000 },
  { unit: "week", seconds: 604_800 },
  { unit: "day", seconds: 86_400 },
  { unit: "hour", seconds: 3_600 },
  { unit: "minute", seconds: 60 },
] as const;

function relativeTime(date: Date) {
  const elapsed = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));

  for (const { unit, seconds } of RELATIVE_UNITS) {
    if (elapsed >= seconds) {
      return relativeFormatter.format(-Math.floor(elapsed / seconds), unit);
    }
  }

  return "just now";
}

// Next.js passes repeated query keys (?q=a&q=b) as arrays; take the first.
function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const prisma = getPrisma();

  const slugs = (first(params.orgs)?.split(",") ?? []).filter(Boolean);
  const categories = (first(params.cats)?.split(",") ?? []).filter((value): value is Category =>
    VISIBLE_CATEGORIES.includes(value as Category),
  );
  const q = first(params.q)?.trim() ?? "";

  const where = {
    ...(HIDDEN_KINDS.length > 0
      ? {
          kind: {
            notIn: HIDDEN_KINDS.map((value) => value.replace(/-/g, "_") as PrismaKind),
          },
        }
      : {}),
    ...(slugs.length > 0 ? { organization: { slug: { in: slugs } } } : {}),
    // Enum members are snake_case in the client but kebab-case in the URL.
    ...(categories.length > 0
      ? {
          category: {
            in: categories.map((value) => value.replace(/-/g, "_") as PrismaCategory),
          },
        }
      : HIDDEN_CATEGORIES.length > 0
        ? {
            category: {
              notIn: HIDDEN_CATEGORIES.map((value) => value.replace(/-/g, "_") as PrismaCategory),
            },
          }
        : {}),
    ...(q ? { title: { contains: q, mode: "insensitive" as const } } : {}),
  };

  const requested = Number(first(params.page));
  const tentative = Number.isFinite(requested) ? Math.max(1, Math.trunc(requested)) : 1;

  const [organizations, total, firstPage] = await Promise.all([
    prisma.organization.findMany({ orderBy: { name: "asc" } }),
    prisma.post.count({ where }),
    prisma.post.findMany({
      where,
      orderBy: { publishedAt: "desc" },
      skip: (tentative - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { organization: true },
    }),
  ]);

  const known = new Set(organizations.map((org) => org.slug));
  const slugsKnown = slugs.filter((slug) => known.has(slug));

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(pageCount, tentative);
  const posts =
    page === tentative
      ? firstPage
      : await prisma.post.findMany({
          where,
          orderBy: { publishedAt: "desc" },
          skip: (page - 1) * PAGE_SIZE,
          take: PAGE_SIZE,
          include: { organization: true },
        });

  function pageHref(pageNumber: number) {
    const query = new URLSearchParams();
    if (categories.length > 0) {
      query.set("cats", categories.join(","));
    }
    if (slugsKnown.length > 0) {
      query.set("orgs", slugsKnown.join(","));
    }
    if (q) {
      query.set("q", q);
    }
    if (pageNumber > 1) {
      query.set("page", String(pageNumber));
    }

    const search = query.toString();
    return search ? `/?${search}` : "/";
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 pt-4 pb-[max(2rem,env(safe-area-inset-bottom))] sm:gap-10 sm:px-6 sm:pt-6 sm:pb-8">
      <a
        href="#posts"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2 focus:text-sm"
      >
        Skip to posts
      </a>
      <h1 className="sr-only">techxiv</h1>
      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:flex sm:justify-between">
          <div className="min-w-0 sm:w-56">
            <TitleSearch value={q} />
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:contents">
              <CategoryFilter selected={categories} />
            </div>
            <PostFilters
              organizations={organizations.map((org) => ({
                slug: org.slug,
                name: org.name,
                logo: org.logo,
              }))}
              selected={slugsKnown}
            />
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {posts.length === 0 ? (
            <Card className="items-center gap-2 py-12 text-center">
              <p className="text-sm font-medium">No posts match these filters.</p>
              <Link href="/" className="text-sm text-muted-foreground underline">
                Clear filters
              </Link>
            </Card>
          ) : (
            <Card className="overflow-hidden py-0">
              <ul id="posts" className="divide-y divide-border">
                {posts.map((post, index) => (
                  <li key={post.id}>
                    <a
                      href={post.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex min-h-16 items-center gap-3 px-3 py-3 transition-colors duration-150 hover:bg-muted/40 focus-visible:outline-none focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring active:bg-muted/60 sm:gap-4 sm:px-4"
                    >
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted p-1.5 sm:size-10 sm:p-2">
                        <Image
                          src={post.organization.logo}
                          alt={post.organization.name}
                          width={24}
                          height={24}
                          className="size-full object-contain [color-scheme:light]"
                          unoptimized
                          priority={index < 6}
                        />
                      </span>

                      <span className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-4">
                        <span className="min-w-0 text-[0.95rem] leading-snug font-medium text-pretty line-clamp-2 sm:flex-1 sm:truncate sm:text-base">
                          {post.title}
                        </span>{" "}
                        <time
                          dateTime={post.publishedAt.toISOString()}
                          title={dateFormatter.format(post.publishedAt)}
                          className="shrink-0 text-xs text-muted-foreground tabular-nums sm:text-sm"
                        >
                          {relativeTime(post.publishedAt)}
                        </time>
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {pageCount > 1 ? (
            <Pagination className="px-0">
              <PaginationContent className="w-full max-w-full justify-between gap-2 sm:w-auto sm:justify-center">
                <PaginationItem>
                  <PaginationPrevious
                    text="Prev"
                    className="min-h-11"
                    {...(page > 1
                      ? { href: pageHref(page - 1) }
                      : {
                          "aria-disabled": true,
                          tabIndex: -1,
                          className: "min-h-11 pointer-events-none opacity-40",
                        })}
                  />
                </PaginationItem>

                <PaginationItem className="sm:hidden">
                  <span className="px-2 text-sm text-muted-foreground tabular-nums">
                    {page} / {pageCount}
                  </span>
                </PaginationItem>

                {visiblePages(page, pageCount).map((item, index) =>
                  item === "…" ? (
                    <PaginationItem key={`ellipsis-${index}`} className="hidden sm:block">
                      <PaginationEllipsis />
                    </PaginationItem>
                  ) : (
                    <PaginationItem key={item} className="hidden sm:block">
                      <PaginationLink
                        href={pageHref(item)}
                        isActive={item === page}
                        className="min-h-11 min-w-11"
                      >
                        {item}
                      </PaginationLink>
                    </PaginationItem>
                  ),
                )}

                <PaginationItem>
                  <PaginationNext
                    className="min-h-11"
                    {...(page < pageCount
                      ? { href: pageHref(page + 1) }
                      : {
                          "aria-disabled": true,
                          tabIndex: -1,
                          className: "min-h-11 pointer-events-none opacity-40",
                        })}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          ) : null}
        </div>
      </div>
    </main>
  );
}
