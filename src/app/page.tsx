import Image from "next/image";
import { Card } from "@/components/ui/card";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { getPrisma } from "@/lib/prisma";

const PAGE_SIZE = 20;

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const requested = Number((await searchParams).page);
  const prisma = getPrisma();
  const total = await prisma.post.count();
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Number.isFinite(requested)
    ? Math.min(pageCount, Math.max(1, Math.trunc(requested)))
    : 1;

  const posts = await prisma.post.findMany({
    orderBy: { publishedAt: "desc" },
    skip: (page - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    include: { organization: true },
  });

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))] sm:gap-10 sm:px-6 sm:pt-16 sm:pb-16">
      <a
        href="#posts"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2 focus:text-sm"
      >
        Skip to posts
      </a>

      <header className="space-y-2">
        <h1 className="text-pretty text-2xl font-medium tracking-tight sm:text-3xl">
          Engineering Blogs
        </h1>
        <p className="max-w-xl text-pretty text-sm text-muted-foreground">
          Long engineering writeups from the companies that still publish them.
        </p>
      </header>

      {posts.length === 0 ? (
        <p className="text-sm text-muted-foreground">No posts yet.</p>
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
                      className="size-full object-contain"
                      unoptimized
                      priority={index < 6}
                    />
                  </span>

                  <span className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-4">
                    <span className="min-w-0 text-[0.95rem] leading-snug font-medium text-pretty line-clamp-2 sm:flex-1 sm:truncate sm:text-base">
                      {post.title}
                    </span>

                    <time
                      dateTime={post.publishedAt.toISOString()}
                      className="shrink-0 text-xs text-muted-foreground tabular-nums sm:text-sm"
                    >
                      {dateFormatter.format(post.publishedAt)}
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
                  ? { href: `/?page=${page - 1}` }
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

            {Array.from({ length: pageCount }, (_, index) => index + 1).map(
              (pageNumber) => (
                <PaginationItem key={pageNumber} className="hidden sm:block">
                  <PaginationLink
                    href={`/?page=${pageNumber}`}
                    isActive={pageNumber === page}
                    className="min-h-11 min-w-11"
                  >
                    {pageNumber}
                  </PaginationLink>
                </PaginationItem>
              ),
            )}

            <PaginationItem>
              <PaginationNext
                className="min-h-11"
                {...(page < pageCount
                  ? { href: `/?page=${page + 1}` }
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
    </main>
  );
}
