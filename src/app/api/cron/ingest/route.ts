import { revalidateTag } from "next/cache";
import { sendSyncNotification } from "@/lib/discord";
import { ingestNewPosts } from "@/lib/ingest";

export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const result = await ingestNewPosts();
    console.log(JSON.stringify({ event: "ingest", ...result }));

    revalidateTag("posts", "max");
    revalidateTag("orgs", "max");

    if (result.shown > 0 || result.errors.length > 0) {
      const errors = result.errors.length > 0 ? `, errors: ${result.errors.join("; ")}` : "";
      const names =
        result.titles.length > 0
          ? `\n${result.titles.map((title) => `- ${title}`).join("\n")}`
          : "";
      await sendSyncNotification(
        `found ${result.scanned}, inserted ${result.inserted}, shown ${result.shown}${errors}${names}`,
      );
    }
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ event: "ingest.failed", message }));
    await sendSyncNotification(`ingest failed: ${message}`);
    return Response.json({ ok: false }, { status: 500 });
  }
}
