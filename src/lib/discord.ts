const DISCORD_AVATAR_URL = "https://techxiv.xyz/icon";
const MAX_CONTENT_LENGTH = 2000;

async function postToDiscord(webhookUrl: string, content: string) {
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: content.slice(0, MAX_CONTENT_LENGTH),
        username: "techxiv",
        avatar_url: DISCORD_AVATAR_URL,
      }),
    });

    if (!response.ok) {
      console.error(`Discord webhook failed with status ${response.status}`);
    }
  } catch (error) {
    console.error("Discord webhook failed:", error);
  }
}

export async function sendSyncNotification(content: string): Promise<void> {
  const webhookUrl = process.env.DISCORD_SYNC_WEBHOOK_URL?.trim();
  if (!webhookUrl) return;

  await postToDiscord(webhookUrl, content);
}
