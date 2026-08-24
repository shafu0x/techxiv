import type { NextConfig } from "next";

// Paths readers and bots probe for a feed. They all resolve to the one feed
// rather than 404ing.
const FEED_ALIASES = [
  "/feed",
  "/rss",
  "/rss.xml",
  "/atom.xml",
  "/index.xml",
  "/all.rss",
  "/api/feed",
  "/api/feed.xml",
  "/api/rss",
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  turbopack: {
    root: import.meta.dirname,
  },
  redirects() {
    return FEED_ALIASES.map((source) => ({
      source,
      destination: "/feed.xml",
      permanent: true,
    }));
  },
};

export default nextConfig;
