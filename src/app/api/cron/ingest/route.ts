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
    console.log("cron ingest", result);
    await sendSyncNotification(
      `found ${result.scanned}, inserted ${result.inserted}${
        result.errors.length > 0 ? `, errors: ${result.errors.join("; ")}` : ""
      }`,
    );
    return Response.json(result);
  } catch (error) {
    console.error("cron ingest failed", error);
    await sendSyncNotification(
      `ingest failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return Response.json({ ok: false }, { status: 500 });
  }
}
