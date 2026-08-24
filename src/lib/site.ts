export const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.NODE_ENV === "development" ? "http://localhost:3000" : "https://www.techxiv.dev");

export const siteName = "techxiv";

// Short enough to stay on one line in the OG image.
export const siteTagline = "The engineering blogs worth reading, in one feed.";

export const siteDescription =
  "Engineering posts from hand-picked company blogs, updated daily. Newest first, and every link goes straight to the source.";
