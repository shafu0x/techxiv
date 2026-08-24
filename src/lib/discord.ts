"use server";

import { after } from "next/server";

const DISCORD_AVATAR_URL = "https://techxiv.xyz/icon";

async function postToDiscord(webhookUrl: string, payload: Record<string, unknown>) {
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "techxiv",
        avatar_url: DISCORD_AVATAR_URL,
        ...payload,
      }),
    });

    if (!response.ok) {
      console.error(`Discord webhook failed with status ${response.status}`);
    }
  } catch (error) {
    console.error("Discord webhook failed:", error);
  }
}

export async function sendDiscordNotification(content: string): Promise<void> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL?.trim();
  if (!webhookUrl) return;

  after(async () => {
    await postToDiscord(webhookUrl, { content });
  });
}

export async function sendSyncNotification(content: string): Promise<void> {
  const webhookUrl = process.env.DISCORD_SYNC_WEBHOOK_URL?.trim();
  if (!webhookUrl) return;

  await postToDiscord(webhookUrl, { content: content.slice(0, 2000) });
}
