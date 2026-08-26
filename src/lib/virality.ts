import { ExactEvmScheme } from "@x402/evm";
import { wrapFetchWithPayment, x402Client } from "@x402/fetch";
import { privateKeyToAccount } from "viem/accounts";
import { getPrisma } from "@/lib/prisma";
import { buildWhere } from "@/lib/posts";

const SEARCH_URL = "https://glim.sh/api/v1/twitter/search";
const LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
const CONCURRENCY = 3;

const SEED_SCORES = [
  { title: "Git at any scale", score: 100 },
  { title: "Reward hacking is swamping model intelligence gains", score: 94 },
  { title: "Asana cleared 5 years of engineering work in 2 weeks with Codex", score: 83 },
];

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

function flattenTweets(tweets: Tweet[]) {
  const byId = new Map<string, Tweet>();
  const extras: Tweet[] = [];
  const seen = new Set<Tweet>();

  function add(tweet: Tweet) {
    if (seen.has(tweet)) {
      return;
    }
    seen.add(tweet);

    if (tweet.id) {
      if (!byId.has(tweet.id)) {
        byId.set(tweet.id, tweet);
      }
    } else {
      extras.push(tweet);
    }

    if (tweet.quoted_tweet) {
      add(tweet.quoted_tweet);
    }
  }

  for (const tweet of tweets) {
    add(tweet);
  }

  return [...byId.values(), ...extras];
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

async function searchTwitter(fetchWithPay: typeof fetch, url: string, publishedAt: Date) {
  const response = await fetchWithPay(SEARCH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: searchQuery(url),
      sort: "top",
      start_date: publishedAt.toISOString().slice(0, 10),
    }),
  });

  if (!response.ok) {
    throw new Error(`glim.sh ${response.status}`);
  }

  const data = (await response.json()) as { tweets?: Tweet[] };
  return scoreFromEngagement(engagement(flattenTweets(data.tweets ?? []), url));
}

async function seedKnownViralScores() {
  const prisma = getPrisma();
  const now = new Date();
  let seeded = 0;

  for (const { title, score } of SEED_SCORES) {
    const post = await prisma.post.findFirst({
      where: { title },
      select: { id: true, viralityScore: true },
    });
    if (!post || (post.viralityScore != null && post.viralityScore >= score)) {
      continue;
    }

    await prisma.post.update({
      where: { id: post.id },
      data: { viralityScore: score, viralityScoredAt: now },
    });
    seeded += 1;
  }

  return seeded;
}

type ScoreTarget = {
  id: string;
  url: string;
  publishedAt: Date;
  viralityScore: number | null;
};

async function scorePosts(posts: ScoreTarget[], concurrency = CONCURRENCY) {
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

      try {
        const score = await searchTwitter(fetchWithPay, post.url, post.publishedAt);
        const higher = post.viralityScore == null || score > post.viralityScore;
        await prisma.post.update({
          where: { id: post.id },
          data: higher
            ? { viralityScore: score, viralityScoredAt: new Date() }
            : { viralityScoredAt: new Date() },
        });
        scored += 1;
        if (higher) {
          raised += 1;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`${post.url}: ${message}`);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, posts.length) }, () => worker()));

  return { scanned: posts.length, scored, raised, errors };
}

export async function scoreRecentPosts() {
  const seeded = await seedKnownViralScores();
  const posts = await getPrisma().post.findMany({
    where: {
      ...buildWhere({ slugs: [], viral: false }),
      publishedAt: { gte: new Date(Date.now() - LOOKBACK_MS) },
    },
    select: { id: true, url: true, publishedAt: true, viralityScore: true },
    orderBy: { publishedAt: "desc" },
  });

  return { ...(await scorePosts(posts)), seeded };
}
