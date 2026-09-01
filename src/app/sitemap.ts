import type { MetadataRoute } from "next";
import { getOrganizations } from "@/lib/orgs";
import { getFeedPosts } from "@/lib/posts";
import { siteUrl } from "@/lib/site";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [organizations, posts] = await Promise.all([getOrganizations(), getFeedPosts()]);
  const lastModified = posts[0]?.publishedAt;

  return [
    { url: siteUrl, lastModified, changeFrequency: "daily", priority: 1 },
    { url: `${siteUrl}/news`, lastModified, changeFrequency: "daily", priority: 0.5 },
    ...organizations.map((organization) => ({
      url: `${siteUrl}/?orgs=${organization.slug}`,
      lastModified,
      changeFrequency: "daily" as const,
      priority: 0.5,
    })),
  ];
}
