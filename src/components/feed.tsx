import { Suspense } from "react";
import Link from "next/link";
import { About } from "@/components/about";
import { PostFilters } from "@/components/post-filters";
import { PostList } from "@/components/post-list";
import { ViralToggle } from "@/components/viral-toggle";
import { Card } from "@/components/ui/card";
import { getOrganizations } from "@/lib/orgs";
import { PAGE_SIZE } from "@/lib/feed";
import { getPosts } from "@/lib/posts";

// Next.js passes repeated query keys as arrays; take the first.
function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

type FeedSearchParams = Promise<{
  orgs?: string | string[];
  viral?: string | string[];
}>;

export function Feed({
  searchParams,
  includeHidden = false,
  basePath,
}: {
  searchParams: FeedSearchParams;
  includeHidden?: boolean;
  basePath: string;
}) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 pt-[max(0.5rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))] sm:gap-10 sm:px-6 sm:pt-[max(0.75rem,env(safe-area-inset-top))] sm:pb-8">
      <a
        href="#posts"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2 focus:text-sm"
      >
        Skip to posts
      </a>
      <Suspense fallback={<FeedSkeleton />}>
        <FeedList searchParams={searchParams} includeHidden={includeHidden} basePath={basePath} />
      </Suspense>
    </main>
  );
}

async function FeedList({
  searchParams,
  includeHidden,
  basePath,
}: {
  searchParams: FeedSearchParams;
  includeHidden: boolean;
  basePath: string;
}) {
  const params = await searchParams;

  const slugs = (first(params.orgs)?.split(",") ?? []).filter(Boolean);
  const viral = first(params.viral) === "1";

  const [organizations, { posts, nextCursor }] = await Promise.all([
    getOrganizations(),
    getPosts({ slugs, viral, includeHidden }),
  ]);

  const known = new Set(organizations.map((org) => org.slug));
  const slugsKnown = slugs.filter((slug) => known.has(slug));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link href="/" className="flex items-center tracking-tight">
            <svg viewBox="0 0 32 32" className="size-5 shrink-0" aria-hidden="true">
              <path
                fill="currentColor"
                d="M16 4.5 18.85 13.26H28.06L21.61 18.67 24.46 27.44 16 21.99 7.54 27.44 10.39 18.67 3.94 13.26H13.15Z"
              />
            </svg>
            <h1 className="ml-1.5 font-semibold">techxiv</h1>
          </Link>
          <p className="text-sm text-muted-foreground">
            by{" "}
            <a
              href="https://x.com/shafu0x"
              target="_blank"
              rel="noopener noreferrer"
              className="no-underline"
            >
              shafu
            </a>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ViralToggle viral={viral} />
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
      <About orgs={organizations.map((org) => ({ name: org.name, logo: org.logo }))} />

      {posts.length === 0 ? (
        <Card className="items-center gap-2 py-12 text-center">
          <p className="text-sm font-medium">No posts match these filters.</p>
          <Link href={basePath} className="text-sm text-muted-foreground underline">
            Clear filters
          </Link>
        </Card>
      ) : (
        <PostList
          key={`${slugsKnown.slice().sort().join(",")}\0${viral ? "1" : "0"}\0${includeHidden ? "1" : "0"}`}
          initialPosts={posts}
          nextCursor={nextCursor}
          slugs={slugsKnown}
          viral={viral}
          includeHidden={includeHidden}
        />
      )}
    </div>
  );
}

function FeedSkeleton() {
  return (
    <div className="flex flex-col gap-2" aria-hidden>
      <div className="flex items-center justify-between gap-3">
        <div className="h-5 w-24 animate-pulse rounded bg-muted" />
        <div className="flex items-center gap-3">
          <div className="h-11 w-10 shrink-0 animate-pulse rounded-md bg-muted sm:h-9 sm:w-21" />
          <div className="h-11 w-[126px] shrink-0 animate-pulse rounded-md bg-muted sm:h-9 sm:w-40" />
        </div>
      </div>

      <Card className="overflow-hidden py-0">
        <ul className="divide-y divide-border">
          {Array.from({ length: PAGE_SIZE }, (_, index) => (
            <li key={index} className="flex min-h-16 items-center gap-3 px-3 py-3 sm:gap-4 sm:px-4">
              <span className="size-9 shrink-0 animate-pulse rounded-md bg-muted sm:size-10" />
              <span className="h-4 w-full max-w-md animate-pulse rounded bg-muted" />
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
