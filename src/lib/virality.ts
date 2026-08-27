import { ExactEvmScheme } from "@x402/evm";
import { wrapFetchWithPayment, x402Client } from "@x402/fetch";
import { privateKeyToAccount } from "viem/accounts";
import type { Category as PrismaCategory, Kind as PrismaKind } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/prisma";
import { HIDDEN_CATEGORIES, HIDDEN_KINDS } from "@/lib/taxonomy";

const SEARCH_URL = "https://glim.sh/api/v1/twitter/search";
const SCORE_AFTER_MS = 6 * 60 * 60 * 1000;
const CONCURRENCY = 3;
const MAX_PAGES = 5;
const RUN_CAP = 25;
const RETRY_BACKOFF_MS = 1000;

type Tweet = {
  id?: string;
  public_metrics?: {
    like_count?: number;
    retweet_count?: number;
    quote_count?: number;
    reply_count?: number;
  };
  entities?: { urls?: { expanded_url?: string }[] };
  quoted_tweet?: Tweet;
};

type SearchResponse = {
  tweets?: Tweet[];
  has_more?: boolean;
  next_cursor?: string;
};

function flattenTweets(tweets: Tweet[]) {
  const byKey = new Map<string, Tweet>();
  const seen = new Set<Tweet>();

  function key(tweet: Tweet) {
    if (tweet.id) {
      return tweet.id;
    }

    const urls = (tweet.entities?.urls ?? []).map((entry) => entry.expanded_url ?? "").join("|");
    const metrics = tweet.public_metrics ?? {};
    return `:${metrics.like_count ?? 0}:${metrics.retweet_count ?? 0}:${metrics.quote_count ?? 0}:${metrics.reply_count ?? 0}:${urls}`;
  }

  function add(tweet: Tweet) {
    if (seen.has(tweet)) {
      return;
    }
    seen.add(tweet);

    const tweetKey = key(tweet);
    if (!byKey.has(tweetKey)) {
      byKey.set(tweetKey, tweet);
    }

    if (tweet.quoted_tweet) {
      add(tweet.quoted_tweet);
    }
  }

  for (const tweet of tweets) {
    add(tweet);
  }

  return [...byKey.values()];
}

function articleHostPath(url: string) {
  const parsed = new URL(url);
  const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();
  const path = parsed.pathname.replace(/\/+$/, "");
  return { host, path };
}

function searchQuery(url: string) {
  const { host, path } = articleHostPath(url);
  const bare = `${host}${path}`;
  return `url:${bare} OR url:www.${bare}`;
}

function tweetMatchesArticle(tweet: Tweet, url: string) {
  const { host, path } = articleHostPath(url);
  return (tweet.entities?.urls ?? []).some((entry) => {
    if (!entry.expanded_url) {
      return false;
    }

    try {
      const expanded = new URL(entry.expanded_url);
      return (
        expanded.hostname.replace(/^www\./i, "").toLowerCase() === host &&
        expanded.pathname.replace(/\/+$/, "") === path
      );
    } catch {
      return false;
    }
  });
}

function engagement(tweets: Tweet[], url: string) {
  let likes = 0;
  let retweets = 0;
  let quotes = 0;
  let replies = 0;

  for (const tweet of tweets) {
    if (!tweetMatchesArticle(tweet, url)) {
      continue;
    }

    const metrics = tweet.public_metrics ?? {};
    likes += metrics.like_count ?? 0;
    retweets += metrics.retweet_count ?? 0;
    quotes += metrics.quote_count ?? 0;
    replies += metrics.reply_count ?? 0;
  }

  return likes + 2 * retweets + 2 * quotes + replies;
}

function scoreFromEngagement(value: number) {
  if (value <= 0) {
    return 0;
  }

  return Math.min(100, Math.round((100 * Math.log10(1 + value)) / Math.log10(1 + 10000)));
}

function paidFetch() {
  const key = process.env.X402_PRIVATE_KEY;
  if (!key) {
    throw new Error("X402_PRIVATE_KEY is not set");
  }

  const scheme = new ExactEvmScheme(privateKeyToAccount(key as `0x${string}`));
  const client = new x402Client()
    .register("eip155:8453", scheme)
    .registerV1("base", scheme)
    .setSpendControls({ maxAmountPerPayment: "$0.02" });

  return wrapFetchWithPayment(fetch, client);
}

async function searchPage(
  fetchWithPay: typeof fetch,
  url: string,
  publishedAt: Date,
  cursor?: string,
) {
  const response = await fetchWithPay(SEARCH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: searchQuery(url),
      sort: "top",
      start_date: publishedAt.toISOString().slice(0, 10),
      ...(cursor ? { cursor } : {}),
    }),
  });

  if (!response.ok) {
    throw new Error(`glim.sh ${response.status}`);
  }

  return (await response.json()) as SearchResponse;
}

async function searchPageWithRetry(
  fetchWithPay: typeof fetch,
  url: string,
  publishedAt: Date,
  cursor?: string,
) {
  try {
    return await searchPage(fetchWithPay, url, publishedAt, cursor);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/^glim\.sh 5\d\d$/.test(message)) {
      throw error;
    }

    await new Promise((resolve) => setTimeout(resolve, RETRY_BACKOFF_MS));
    return searchPage(fetchWithPay, url, publishedAt, cursor);
  }
}

async function searchTwitter(fetchWithPay: typeof fetch, url: string, publishedAt: Date) {
  const tweets: Tweet[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    let data: SearchResponse;
    try {
      data = await searchPageWithRetry(fetchWithPay, url, publishedAt, cursor);
    } catch (error) {
      if (page === 0) {
        throw error;
      }
      break;
    }
    tweets.push(...(data.tweets ?? []));
    if (!data.has_more || !data.next_cursor) {
      break;
    }
    cursor = data.next_cursor;
  }

  return scoreFromEngagement(engagement(flattenTweets(tweets), url));
}

type ScoreTarget = {
  id: string;
  url: string;
  publishedAt: Date;
  viralityScore: number | null;
};

const scoreSelect = {
  id: true,
  url: true,
  publishedAt: true,
  viralityScore: true,
} as const;

function visibleWhere() {
  return {
    ...(HIDDEN_KINDS.length > 0
      ? {
          kind: { notIn: HIDDEN_KINDS.map((kind) => kind.replace(/-/g, "_") as PrismaKind) },
        }
      : {}),
    ...(HIDDEN_CATEGORIES.length > 0
      ? {
          category: {
            notIn: HIDDEN_CATEGORIES.map(
              (category) => category.replace(/-/g, "_") as PrismaCategory,
            ),
          },
        }
      : {}),
  };
}

async function scorePosts(posts: ScoreTarget[], concurrency = CONCURRENCY) {
  if (posts.length === 0) {
    return { scanned: 0, scored: 0, raised: 0, errors: [] };
  }

  const prisma = getPrisma();
  const fetchWithPay = paidFetch();
  const errors: string[] = [];
  let scored = 0;
  let raised = 0;
  let next = 0;

  async function worker() {
    while (next < posts.length) {
      const post = posts[next];
      next += 1;
      const now = new Date();

      try {
        const score = await searchTwitter(fetchWithPay, post.url, post.publishedAt);
        const changed = post.viralityScore == null || score !== post.viralityScore;
        await prisma.post.update({
          where: { id: post.id },
          data: {
            viralityScore: score,
            viralityScoredAt: now,
            viralityAttemptedAt: now,
            viralityError: null,
          },
        });
        scored += 1;
        if (changed) {
          raised += 1;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`${post.url}: ${message}`);
        await prisma.post.update({
          where: { id: post.id },
          data: { viralityAttemptedAt: now, viralityError: message },
        });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, posts.length) }, () => worker()));

  return { scanned: posts.length, scored, raised, errors };
}

export async function scoreRecentPosts() {
  const posts = await getPrisma().post.findMany({
    where: {
      ...visibleWhere(),
      publishedAt: { lte: new Date(Date.now() - SCORE_AFTER_MS) },
      viralityScoredAt: null,
    },
    select: scoreSelect,
    orderBy: { publishedAt: "asc" },
    take: RUN_CAP,
  });

  return scorePosts(posts);
}

export async function scoreVisiblePosts(limit?: number, erroredOnly = false) {
  const posts = await getPrisma().post.findMany({
    where: {
      ...visibleWhere(),
      ...(erroredOnly ? { viralityError: { not: null } } : {}),
    },
    select: scoreSelect,
    orderBy: { publishedAt: "desc" },
    ...(limit != null ? { take: limit } : {}),
  });

  return scorePosts(posts);
}
