import type { MetadataRoute } from "next";
import { getOrganizations } from "@/lib/orgs";
import { getFeedPosts } from "@/lib/posts";
import { siteUrl } from "@/lib/site";
import { VISIBLE_CATEGORIES } from "@/lib/taxonomy";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [organizations, posts] = await Promise.all([getOrganizations(), getFeedPosts()]);
  const lastModified = posts[0]?.publishedAt;

  return [
    { url: siteUrl, lastModified, changeFrequency: "daily", priority: 1 },
    ...VISIBLE_CATEGORIES.map((category) => ({
      url: `${siteUrl}/?cats=${category}`,
      lastModified,
      changeFrequency: "daily" as const,
      priority: 0.6,
    })),
    ...organizations.map((organization) => ({
      url: `${siteUrl}/?orgs=${organization.slug}`,
      lastModified,
      changeFrequency: "daily" as const,
      priority: 0.5,
    })),
  ];
}
