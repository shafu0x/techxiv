import { getPreview } from "@/lib/preview";

const ID = /^[a-z0-9]{1,64}$/i;

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id || !ID.test(id)) {
    return Response.json({ error: "Invalid id" }, { status: 400 });
  }

  const preview = await getPreview(id);
  if (!preview) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  return Response.json(preview, {
    headers: { "cache-control": "public, max-age=3600, s-maxage=86400" },
  });
}
