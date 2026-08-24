import { getFeedPosts } from "@/lib/posts";
import { siteDescription, siteName, siteUrl } from "@/lib/site";

const XML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};

function escapeXml(value: string) {
  return value.replace(/[&<>"']/g, (character) => XML_ESCAPES[character]);
}

export async function GET() {
  const posts = await getFeedPosts();

  const items = posts.map((post) =>
    [
      "    <item>",
      `      <title>${escapeXml(post.title)}</title>`,
      `      <link>${escapeXml(post.url)}</link>`,
      `      <guid isPermaLink="true">${escapeXml(post.url)}</guid>`,
      `      <pubDate>${post.publishedAt.toUTCString()}</pubDate>`,
      `      <category>${escapeXml(post.organization.name)}</category>`,
      `      <description>${escapeXml(`${post.organization.name}: ${post.title}`)}</description>`,
      "    </item>",
    ].join("\n"),
  );

  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "  <channel>",
    `    <title>${siteName}</title>`,
    `    <link>${siteUrl}</link>`,
    `    <description>${escapeXml(siteDescription)}</description>`,
    "    <language>en</language>",
    `    <atom:link href="${siteUrl}/feed.xml" rel="self" type="application/rss+xml" />`,
    ...(posts.length > 0
      ? [`    <lastBuildDate>${posts[0].publishedAt.toUTCString()}</lastBuildDate>`]
      : []),
    ...items,
    "  </channel>",
    "</rss>",
    "",
  ].join("\n");

  return new Response(body, {
    headers: { "content-type": "application/rss+xml; charset=utf-8" },
  });
}
