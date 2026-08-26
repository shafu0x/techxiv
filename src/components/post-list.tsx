"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import posthog from "posthog-js";
import { PostRow } from "@/components/post-row";
import { Card } from "@/components/ui/card";
import type { FeedPost } from "@/lib/feed";

const posthogConfigured = Boolean(
  process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN && process.env.NEXT_PUBLIC_POSTHOG_HOST,
);

type PostListProps = {
  initialPosts: FeedPost[];
  nextCursor: string | null;
  slugs: string[];
  viral: boolean;
};

export function PostList({ initialPosts, nextCursor, slugs, viral }: PostListProps) {
  const [posts, setPosts] = useState(initialPosts);
  const [cursor, setCursor] = useState(nextCursor);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const cursorRef = useRef(nextCursor);
  const postsRef = useRef(initialPosts);
  const inFlight = useRef(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(async () => {
    const from = cursorRef.current;
    if (!from || inFlight.current) {
      return;
    }

    inFlight.current = true;
    setStatus("loading");

    try {
      const params = new URLSearchParams();
      params.set("cursor", from);
      if (slugs.length > 0) {
        params.set("orgs", slugs.join(","));
      }
      if (viral) {
        params.set("viral", "1");
      }

      const response = await fetch(`/api/posts?${params}`);
      if (!response.ok) {
        throw new Error("Failed to load posts");
      }

      const data = (await response.json()) as { posts?: FeedPost[]; nextCursor?: string | null };
      if (!Array.isArray(data.posts)) {
        throw new Error("Failed to load posts");
      }

      const seen = new Set(postsRef.current.map((post) => post.id));
      const next = [...postsRef.current, ...data.posts.filter((post) => !seen.has(post.id))];
      postsRef.current = next;
      cursorRef.current = data.nextCursor ?? null;
      setPosts(next);
      setCursor(data.nextCursor ?? null);
      setStatus("idle");
      if (posthogConfigured) {
        posthog.capture("feed_loaded", { count: next.length });
      }
    } catch {
      setStatus("error");
    } finally {
      inFlight.current = false;
    }
  }, [slugs, viral]);

  useEffect(() => {
    if (!cursor || status !== "idle") {
      return;
    }

    const node = sentinelRef.current;
    if (!node) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void loadMore();
        }
      },
      { rootMargin: "200% 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [cursor, status, loadMore]);

  return (
    <div className="flex flex-col gap-4">
      <Card className="overflow-hidden py-0">
        <ul id="posts" className="divide-y divide-border" aria-busy={status === "loading"}>
          {posts.map((post, index) => (
            <PostRow key={post.id} post={post} index={index} />
          ))}
          {status === "loading" ? (
            <li className="flex min-h-16 items-center gap-3 px-3 py-3 sm:gap-4 sm:px-4" aria-hidden>
              <span className="size-9 shrink-0 animate-pulse rounded-md bg-muted sm:size-10" />
              <span className="h-4 w-full max-w-md animate-pulse rounded bg-muted" />
            </li>
          ) : null}
        </ul>
      </Card>
      {cursor ? <div ref={sentinelRef} aria-hidden className="h-px" /> : null}
      {status === "error" ? (
        <p className="text-center text-sm text-muted-foreground">
          Couldn't load more.{" "}
          <button type="button" onClick={() => void loadMore()} className="underline">
            Retry
          </button>
        </p>
      ) : null}
      {!cursor ? <p className="text-center text-sm text-muted-foreground">That's all.</p> : null}
    </div>
  );
}
