"use client";

import { useSyncExternalStore } from "react";
import Image from "next/image";
import { PostPreview } from "@/components/post-preview";
import { VIRAL_THRESHOLD, type FeedPost } from "@/lib/feed";
import { cn } from "@/lib/utils";

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

export function PostRow({ post, index }: { post: FeedPost; index: number }) {
  const publishedAt = new Date(post.publishedAt);
  const label = useSyncExternalStore(
    () => () => {},
    () => relativeTime(publishedAt),
    () => dateFormatter.format(publishedAt),
  );

  return (
    <li className="[content-visibility:auto] [contain-intrinsic-size:auto_80px]">
      <PostPreview post={post}>
        <a
          href={post.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-16 items-center gap-3 px-3 py-3 transition-colors duration-150 hover:bg-muted/40 focus-visible:outline-none focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring active:bg-muted/60 sm:gap-4 sm:px-4"
        >
          <span className="flex size-11 shrink-0 items-center justify-center sm:size-12">
            <span
              className={cn(
                "flex size-9 items-center justify-center rounded-md bg-muted p-1.5 sm:size-10 sm:p-2",
                post.viralityScore != null &&
                  post.viralityScore > VIRAL_THRESHOLD &&
                  "twitter-ring",
              )}
            >
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
          </span>

          <span className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-4">
            <span className="min-w-0 text-[0.95rem] leading-snug font-medium text-pretty line-clamp-2 sm:flex-1 sm:truncate sm:text-base">
              {post.title}
            </span>{" "}
            <time
              dateTime={post.publishedAt}
              title={dateFormatter.format(publishedAt)}
              className="shrink-0 text-xs text-muted-foreground tabular-nums sm:text-sm"
            >
              {label}
            </time>
          </span>
        </a>
      </PostPreview>
    </li>
  );
}
