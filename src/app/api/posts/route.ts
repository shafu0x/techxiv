import { getPosts, parseCursor } from "@/lib/posts";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const cursor = searchParams.get("cursor");
  if (cursor && !parseCursor(cursor)) {
    return Response.json({ error: "Invalid cursor" }, { status: 400 });
  }

  const slugs = (searchParams.get("orgs")?.split(",") ?? []).filter(Boolean);
  const viral = searchParams.get("viral") === "1";
  const viewParam = searchParams.get("view");
  const view = viewParam === "all" || viewParam === "news" ? viewParam : "feed";

  const { posts, nextCursor } = await getPosts({ slugs, viral, view }, cursor);
  return Response.json({ posts, nextCursor });
}
