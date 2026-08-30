"use client";

import { useEffect, useState, type ReactNode } from "react";
import Image from "next/image";
import { ArrowUpRight } from "lucide-react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import type { FeedPost } from "@/lib/feed";
import type { Preview } from "@/lib/preview";

const cache = new Map<string, Promise<Preview | null>>();

function loadPreview(id: string) {
  let pending = cache.get(id);
  if (!pending) {
    pending = fetch(`/api/preview?id=${encodeURIComponent(id)}`)
      .then((response) => (response.ok ? (response.json() as Promise<Preview>) : null))
      .catch(() => null);
    cache.set(id, pending);
  }
  return pending;
}

export function PostPreview({ post, children }: { post: FeedPost; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<Preview | null | undefined>();

  useEffect(() => {
    if (!open || preview !== undefined) {
      return;
    }

    let cancelled = false;
    void loadPreview(post.id).then((result) => {
      if (!cancelled) {
        setPreview(result);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, preview, post.id]);

  const loading = preview === undefined;

  return (
    <HoverCard open={open} onOpenChange={setOpen} openDelay={500} closeDelay={150}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent
        side="bottom"
        align="start"
        sideOffset={4}
        collisionPadding={16}
        className="hidden max-h-[75vh] w-[min(40rem,calc(100vw-2rem))] p-0 sm:flex sm:flex-col"
      >
        <header className="flex items-center gap-2.5 border-b px-5 py-3">
          <span className="flex size-6 shrink-0 items-center justify-center rounded bg-muted p-1">
            <Image
              src={post.organization.logo}
              alt=""
              width={16}
              height={16}
              className="size-full object-contain [color-scheme:light]"
              unoptimized
            />
          </span>
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
            {post.organization.name}
          </span>
          <a
            href={post.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            Open
            <ArrowUpRight className="size-3.5" aria-hidden="true" />
          </a>
        </header>

        <div className="min-h-0 overflow-y-auto overscroll-contain px-5 py-4">
          {loading ? (
            <div className="flex flex-col gap-2.5" aria-hidden>
              <span className="h-5 w-3/4 animate-pulse rounded bg-muted" />
              <span className="mt-2 h-3 w-full animate-pulse rounded bg-muted" />
              <span className="h-3 w-full animate-pulse rounded bg-muted" />
              <span className="h-3 w-5/6 animate-pulse rounded bg-muted" />
              <span className="h-3 w-full animate-pulse rounded bg-muted" />
              <span className="h-3 w-2/3 animate-pulse rounded bg-muted" />
            </div>
          ) : preview?.html ? (
            <article className="prose prose-sm prose-invert max-w-none prose-headings:font-medium prose-headings:tracking-tight prose-a:text-foreground prose-a:underline-offset-4 prose-img:rounded-md prose-pre:bg-muted prose-pre:text-foreground prose-code:before:content-none prose-code:after:content-none">
              <h1>{preview.title ?? post.title}</h1>
              <div dangerouslySetInnerHTML={{ __html: preview.html }} />
            </article>
          ) : (
            <p className="text-sm text-muted-foreground">
              Couldn&apos;t load this article here.{" "}
              <a
                href={post.url}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-4"
              >
                Read it on {post.organization.name}
              </a>
              .
            </p>
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
