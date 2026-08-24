import { sendSyncNotification } from "@/lib/discord";
import { ingestNewPosts } from "@/lib/ingest";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const result = await ingestNewPosts();
    console.log(JSON.stringify({ event: "ingest", ...result }));

    const errors = result.errors.length > 0 ? `, errors: ${result.errors.join("; ")}` : "";
    await sendSyncNotification(
      `found ${result.scanned}, inserted ${result.inserted}, shown ${result.shown}${errors}`,
    );
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ event: "ingest.failed", message }));
    await sendSyncNotification(`ingest failed: ${message}`);
    return Response.json({ ok: false }, { status: 500 });
  }
}
