import { createHash } from "node:crypto";

type SourceState = {
  etag: string | null;
  lastModified: string | null;
  contentHash: string | null;
  payload: string;
  failures: number;
  retryAt: Date | null;
};

type Store = {
  getMany(keys: string[]): Promise<(SourceState & { key: string })[]>;
  set(key: string, state: SourceState): Promise<void>;
};

const HEADERS = { "user-agent": "Mozilla/5.0 (compatible; TechBlogsBot/1.0)" };
const HOUR_MS = 3_600_000;

/** Persistent parsed results, not HTML. Each cron gets its own reader/stats. */
export class IngestCache {
  private readonly states = new Map<string, SourceState | null>();
  readonly stats = {
    requests: 0,
    notModified: 0,
    unchanged: 0,
    parsed: 0,
    deferred: 0,
    rejected: 0,
    failed: 0,
  };

  constructor(private readonly store: Store) {}

  async prime(parserKey: string, urls: string[]) {
    const keys = [...new Set(urls.map((url) => `${parserKey}:${url}`))].filter(
      (key) => !this.states.has(key),
    );
    if (keys.length === 0) return;
    const rows = await this.store.getMany(keys);
    for (const key of keys) this.states.set(key, null);
    for (const row of rows) this.states.set(row.key, row);
  }

  async read<T>(
    parserKey: string,
    url: string,
    parse: (body: string) => T,
    options: { isRejected?: (value: T) => boolean; onFailure?: (status: number | null) => T } = {},
  ): Promise<T> {
    const key = `${parserKey}:${url}`;
    await this.prime(parserKey, [url]);
    const cached = this.states.get(key);
    if (cached?.retryAt && cached.retryAt.getTime() > Date.now()) {
      this.stats.deferred += 1;
      return JSON.parse(cached.payload) as T;
    }

    const headers = new Headers(HEADERS);
    // Rejected metadata may become valid even with an unchanged body (e.g. a
    // future publish date). Fetch and parse it again once its retry is due.
    if (cached && !cached.retryAt) {
      if (cached.etag) headers.set("if-none-match", cached.etag);
      if (cached.lastModified) headers.set("if-modified-since", cached.lastModified);
    }

    this.stats.requests += 1;
    const response = await fetch(url, {
      cache: "no-store",
      headers,
      signal: AbortSignal.timeout(30_000),
    }).catch((error: unknown) => {
      if (!options.onFailure) throw error;
      return null;
    });
    if (response?.status === 304 && cached && !cached.retryAt) {
      this.stats.notModified += 1;
      return JSON.parse(cached.payload) as T;
    }

    let value: T;
    let contentHash: string | null = null;
    if (!response?.ok) {
      this.stats.failed += 1;
      await response?.body?.cancel();
      if (!options.onFailure) throw new Error(`${url} → ${response?.status ?? "network failure"}`);
      value = options.onFailure(response?.status ?? null);
    } else {
      const body = await response.text();
      contentHash = createHash("sha256").update(body).digest("hex");
      if (cached && !cached.retryAt && cached.contentHash === contentHash) {
        this.stats.unchanged += 1;
        value = JSON.parse(cached.payload) as T;
      } else {
        this.stats.parsed += 1;
        value = parse(body);
      }
    }

    const rejected = options.isRejected?.(value) ?? false;
    const failures = rejected ? Math.min((cached?.failures ?? 0) + 1, 6) : 0;
    const state: SourceState = {
      etag: response?.ok ? response.headers.get("etag") : null,
      lastModified: response?.ok ? response.headers.get("last-modified") : null,
      contentHash,
      payload: JSON.stringify(value),
      failures,
      retryAt: rejected ? new Date(Date.now() + Math.min(2 ** (failures - 1), 24) * HOUR_MS) : null,
    };
    if (rejected) this.stats.rejected += 1;
    if (
      !cached ||
      rejected ||
      cached.retryAt ||
      cached.contentHash !== state.contentHash ||
      cached.etag !== state.etag ||
      cached.lastModified !== state.lastModified
    ) {
      await this.store.set(key, state);
    }
    this.states.set(key, state);
    return value;
  }
}
