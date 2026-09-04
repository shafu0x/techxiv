import { after } from "next/server";
import { sendDiscordNotification } from "@/lib/discord";
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
  const { label, path, notify } = (body ?? {}) as Record<string, unknown>;
  if (typeof label !== "string" || typeof path !== "string") {
    return new Response(null, { status: 400 });
  }

  const clicked = label.slice(0, MAX_FIELD_LENGTH);
  // JSON so the fields stay filterable in Vercel's runtime logs.
  console.log(
    JSON.stringify({ event: "click", label: clicked, path: path.slice(0, MAX_FIELD_LENGTH) }),
  );

  if (notify === true) {
    after(() => sendDiscordNotification(`clicked ${clicked}`));
  }

  return new Response(null, { status: 204 });
}
