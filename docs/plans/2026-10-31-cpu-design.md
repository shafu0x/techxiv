# Reduce ingestion CPU without changing the hourly schedule

Keep hourly discovery and six-hour virality scoring. Prefer persistent parsed-source caching and change-aware invalidation over reducing cadence or changing runtimes. This follows Vercel's guidance to reuse work across requests and Next.js's tagged stale-while-revalidate API. Use Postgres rather than an instance-local cache so cron retries and cold starts share state.

1. Persist HTTP validators, a content hash and parsed results in an additive `IngestCache` table. Check feeds and indexes every run. A 304 reuses parsed results; an identical 200 avoids parsing. Cached index links and feed posts must still be checked against stored posts, so failed classification/insertion remains retryable.
2. Remember rejected article URLs with exponential retries from one hour to a maximum of 24 hours. New URLs are attempted immediately. Rejected metadata must be parsed again when due, even if unchanged. Do not permanently discard pages or cache classification failures as rejections.
3. Query known URLs in candidate batches using the existing unique URL index, instead of reading all historical post URLs. Preserve feed pagination and canonical URL deduplication.
4. Invalidate `posts` only after inserts. Ingestion does not change organizations, so leave `orgs` warm.
5. Verify conditional responses, no-validator sources, rejection recovery, failed classification, pagination, duplicate URLs and no-change cache behavior using deterministic fixtures. Run all existing CI checks. Record counters for requests, reused responses, parses and deferred retries.

Deployment requires applying the additive SQL first; do not apply production schema changes, push or deploy as part of this work. Compare active CPU and content freshness after a separately authorized rollout; network latency is not active CPU.
