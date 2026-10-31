import assert from "node:assert/strict";
import test from "node:test";
import { createLoader } from "./load-ts.mjs";

const { IngestCache } = createLoader()("src/lib/ingest-cache.ts");
const { fetchFeedPosts } = createLoader()("src/lib/feeds.ts");

function memoryStore() {
  const rows = new Map();
  let writes = 0;
  return {
    rows,
    get writes() { return writes; },
    getMany: async (keys) => keys.filter((key) => rows.has(key)).map((key) => ({ key, ...structuredClone(rows.get(key)) })),
    set: async (key, value) => { rows.set(key, structuredClone(value)); writes += 1; },
  };
}

test("a cold reader reuses parsed results on 304 and sends both validators", async (t) => {
  const store = memoryStore();
  const requests = [];
  let parses = 0;
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    requests.push(options.headers);
    return requests.length === 1
      ? new Response("index", { headers: { etag: '"one"', "last-modified": "Fri, 30 Oct 2026 00:00:00 GMT" } })
      : new Response(null, { status: 304 });
  });
  const parse = () => { parses += 1; return ["https://example.com/post"]; };
  await new IngestCache(store).read("index-v1", "https://example.com", parse);
  const cold = new IngestCache(store);
  assert.deepEqual(await cold.read("index-v1", "https://example.com", parse), ["https://example.com/post"]);
  assert.equal(parses, 1);
  assert.equal(store.writes, 1);
  assert.equal(requests[1].get("if-none-match"), '"one"');
  assert.equal(requests[1].get("if-modified-since"), "Fri, 30 Oct 2026 00:00:00 GMT");
  assert.equal(cold.stats.notModified, 1);
});

test("identical 200 responses avoid parsing and writes; changed bodies and parser versions refresh", async (t) => {
  const store = memoryStore();
  let body = "old";
  let parses = 0;
  t.mock.method(globalThis, "fetch", async () => new Response(body));
  const parse = (text) => { parses += 1; return { text }; };
  const source = new IngestCache(store);
  await source.read("v1", "https://example.com", parse);
  await source.read("v1", "https://example.com", parse);
  assert.equal(parses, 1);
  assert.equal(store.writes, 1);
  body = "new";
  assert.deepEqual(await source.read("v1", "https://example.com", parse), { text: "new" });
  await source.read("v2", "https://example.com", parse);
  assert.equal(parses, 3);
});

test("rejected pages retry with bounded backoff and reparse an unchanged body when due", async (t) => {
  const store = memoryStore();
  let now = Date.parse("2026-10-01T00:00:00Z");
  let valid = false;
  let requests = 0;
  t.mock.method(Date, "now", () => now);
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    requests += 1;
    assert.equal(options.headers.has("if-none-match"), false);
    return new Response("same metadata", { headers: { etag: '"same"' } });
  });
  const read = () => new IngestCache(store).read("article-v1", "https://example.com/post", () => valid ? { title: "recovered" } : null, { isRejected: (v) => v === null });
  for (let hour = 0; hour < 744; hour += 1) {
    await read();
    now += 3_600_000;
  }
  assert.equal(requests, 35); // Formerly 744 fetches/parses in a 31-day month.
  const state = [...store.rows.values()][0];
  assert.ok(state.retryAt.getTime() - now <= 24 * 3_600_000);
  now = state.retryAt.getTime();
  valid = true;
  assert.deepEqual(await read(), { title: "recovered" });
  assert.equal([...store.rows.values()][0].failures, 0);
  assert.equal([...store.rows.values()][0].retryAt, null);
});

test("HTTP and network article failures are deferred; source failures remain visible", async (t) => {
  for (const fail of [() => new Response(null, { status: 503 }), () => { throw new Error("timeout"); }]) {
    const source = new IngestCache(memoryStore());
    let requests = 0;
    t.mock.method(globalThis, "fetch", async () => { requests += 1; return fail(); });
    const options = { isRejected: (v) => v === null, onFailure: () => null };
    assert.equal(await source.read("article-v1", "https://example.com/post", () => null, options), null);
    await source.read("article-v1", "https://example.com/post", () => null, options);
    assert.equal(requests, 1);
    assert.equal(source.stats.failed, 1);
    await assert.rejects(source.read("index-v1", "https://example.com", () => []));
  }
});

const feed = (slug) => `<rss><item><title>${slug}</title><link>https://www.example.com/${slug}/?tracking=1</link><pubDate>2026-10-01</pubDate></item></rss>`;

test("cached feed pages preserve pagination and retry posts not yet stored", async (t) => {
  const store = memoryStore();
  let repeat = false;
  t.mock.method(globalThis, "fetch", async (raw) => {
    const url = new URL(raw);
    if (repeat) return new Response(null, { status: 304 });
    const slug = url.searchParams.get("paged") === "2" ? "older" : "latest";
    return new Response(feed(slug), { headers: { etag: `"${slug}"` } });
  });
  const first = await fetchFeedPosts("https://example.com/feed", new Set(), new IngestCache(store));
  assert.deepEqual(first.map((p) => p.url), ["https://example.com/latest", "https://example.com/older"]);
  repeat = true;
  const second = await fetchFeedPosts("https://example.com/feed", async () => new Set(["https://example.com/older"]), new IngestCache(store));
  assert.deepEqual(second.map((p) => p.title), ["latest"]);
});

function ingestionFixture(classify) {
  const store = memoryStore();
  const stored = new Map();
  const queries = [];
  const prisma = {
    organization: { findMany: async () => [{ id: "figma", slug: "figma", name: "Figma" }] },
    ingestCache: {
      findMany: ({ where }) => store.getMany(where.key.in),
      upsert: async ({ where, update }) => store.set(where.key, update),
    },
    post: {
      findMany: async (query) => {
        queries.push(query);
        return query.where.url.in.filter((url) => stored.has(url)).map((url) => ({ url }));
      },
      create: async ({ data }) => { stored.set(data.url, data); return data; },
    },
  };
  const { ingestNewPosts } = createLoader({ "./prisma": { getPrisma: () => prisma }, "./classify": { classifyPosts: classify } })("src/lib/ingest.ts");
  return { ingestNewPosts, stored, queries };
}

test("an unchanged index retains classification retries, skips rejected pages and finds new URLs immediately", async (t) => {
  let classifySucceeds = false;
  let indexChanged = false;
  const calls = [];
  const fixture = ingestionFixture(async (posts) => new Map(classifySucceeds ? posts.map((p) => [p.title, { category: "infrastructure", kind: "deep-dive" }]) : []));
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push(url);
    if (url.includes("/engineering/")) {
      if (options.headers.has("if-none-match") && !indexChanged) return new Response(null, { status: 304 });
      return new Response('<a href="/blog/good">post</a><a href="/blog/landing">landing</a>' + (indexChanged ? '<a href="/blog/new">new</a>' : ""), { headers: { etag: indexChanged ? '"two"' : '"one"' } });
    }
    if (url.endsWith("/landing")) return new Response("<title>Landing</title>");
    if (options.headers.has("if-none-match")) return new Response(null, { status: 304 });
    return new Response(`<title>${url.endsWith("/new") ? "New" : "Good"}</title><meta property="article:published_time" content="2026-10-01">`, { headers: { etag: '"article"' } });
  });
  assert.equal((await fixture.ingestNewPosts()).inserted, 0);
  classifySucceeds = true;
  assert.equal((await fixture.ingestNewPosts()).inserted, 1);
  assert.equal(calls.filter((url) => url.endsWith("/landing")).length, 1);
  const third = await fixture.ingestNewPosts();
  assert.equal(third.inserted, 0);
  assert.equal(third.sources.parsed, 0);
  assert.equal(calls.filter((url) => url.endsWith("/good")).length, 2);
  indexChanged = true;
  assert.equal((await fixture.ingestNewPosts()).inserted, 1);
  assert.equal(fixture.stored.size, 2);
  assert.ok(fixture.queries.every((q) => Array.isArray(q.where.url.in)));
});

test("cron invalidates posts only after inserts and keeps organization caches warm", async (t) => {
  process.env.CRON_SECRET = "fixture-secret";
  t.after(() => { delete process.env.CRON_SECRET; });
  t.mock.method(console, "log", () => {});
  const tags = [];
  let inserted = 0;
  const { GET } = createLoader({
    "next/cache": { revalidateTag: (...args) => tags.push(args) },
    "@/lib/discord": { sendSyncNotification: async () => {} },
    "@/lib/ingest": { ingestNewPosts: async () => ({ inserted, shown: 0, scanned: 0, errors: [], titles: [] }) },
  })("src/app/api/cron/ingest/route.ts");
  const request = new Request("https://example.com", { headers: { authorization: "Bearer fixture-secret" } });
  assert.equal((await GET(request)).status, 200);
  assert.deepEqual(tags, []);
  inserted = 1;
  await GET(request);
  assert.deepEqual(tags, [["posts", "max"]]);
  assert.equal((await GET(new Request("https://example.com"))).status, 401);
});
