"use client";

import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import Image from "next/image";
import { ArrowUpRight } from "lucide-react";
import { Slot } from "radix-ui";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
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

// Plain left clicks open the modal; modified clicks and middle clicks still open the source.
function isPlainClick(event: MouseEvent) {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
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
    <Dialog open={open} onOpenChange={setOpen}>
      <Slot.Root
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={(event: MouseEvent) => {
          if (!isPlainClick(event)) {
            return;
          }
          event.preventDefault();
          setOpen(true);
        }}
      >
        {children}
      </Slot.Root>
      <DialogContent
        aria-describedby={undefined}
        showCloseButton={false}
        className="flex max-h-[calc(100dvh-2rem)] w-[calc(100%-1rem)] max-w-none flex-col gap-0 p-0 sm:max-h-[88dvh] sm:w-[calc(100%-2rem)] sm:max-w-3xl"
      >
        <header className="flex items-center gap-2.5 border-b px-4 py-3 sm:px-6">
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
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="ml-2 shrink-0 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            Close
          </button>
        </header>

        <div className="min-h-0 overflow-y-auto overscroll-contain px-4 py-5 sm:px-6 sm:py-6">
          {loading ? (
            <div className="flex flex-col gap-2.5">
              <DialogTitle className="sr-only">{post.title}</DialogTitle>
              <span className="h-6 w-3/4 animate-pulse rounded bg-muted" aria-hidden />
              <span className="mt-3 h-3 w-full animate-pulse rounded bg-muted" aria-hidden />
              <span className="h-3 w-full animate-pulse rounded bg-muted" aria-hidden />
              <span className="h-3 w-5/6 animate-pulse rounded bg-muted" aria-hidden />
              <span className="h-3 w-full animate-pulse rounded bg-muted" aria-hidden />
              <span className="h-3 w-2/3 animate-pulse rounded bg-muted" aria-hidden />
            </div>
          ) : preview?.html ? (
            <article className="prose prose-invert max-w-none prose-headings:font-medium prose-headings:tracking-tight prose-a:text-foreground prose-a:underline-offset-4 prose-img:rounded-md prose-pre:bg-muted prose-pre:text-foreground prose-code:before:content-none prose-code:after:content-none">
              <DialogTitle asChild className="text-2xl leading-tight font-medium tracking-tight">
                <h1>{preview.title ?? post.title}</h1>
              </DialogTitle>
              <div dangerouslySetInnerHTML={{ __html: preview.html }} />
            </article>
          ) : (
            <>
              <DialogTitle className="text-lg font-medium tracking-tight">{post.title}</DialogTitle>
              <p className="mt-3 text-sm text-muted-foreground">
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
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
