import { isProductionDeployment } from "@/lib/production-traffic";

const MAX_FIELD_LENGTH = 200;

export async function POST(request: Request) {
  if (!isProductionDeployment()) {
    return new Response(null, { status: 204 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(null, { status: 400 });
  }

  // `body ?? {}` because a bare `null` payload is valid JSON and would throw here.
  const { q } = (body ?? {}) as Record<string, unknown>;
  if (typeof q !== "string" || q.length === 0) {
    return new Response(null, { status: 400 });
  }

  // JSON so the fields stay filterable in Vercel's runtime logs.
  console.log(JSON.stringify({ event: "search", q: q.slice(0, MAX_FIELD_LENGTH) }));

  return new Response(null, { status: 204 });
}
