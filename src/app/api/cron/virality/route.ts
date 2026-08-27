import { revalidateTag } from "next/cache";
import { sendSyncNotification } from "@/lib/discord";
import { scoreRecentPosts } from "@/lib/virality";

export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const result = await scoreRecentPosts();
    console.log(JSON.stringify({ event: "virality", ...result }));

    if (result.raised > 0) {
      revalidateTag("posts", "max");
    }

    if (result.errors.length > 0) {
      await sendSyncNotification(
        `virality: scanned ${result.scanned}, scored ${result.scored}, raised ${result.raised}, errors: ${result.errors.join("; ")}`,
      );
    }

    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ event: "virality.failed", message }));
    await sendSyncNotification(`virality failed: ${message}`);
    return Response.json({ ok: false }, { status: 500 });
  }
}
