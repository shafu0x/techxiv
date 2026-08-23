"use server";

import { after } from "next/server";

const DISCORD_AVATAR_URL = "https://techxiv.xyz/icon";

export async function sendDiscordNotification(content: string): Promise<void> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL?.trim();
  if (!webhookUrl) return;

  after(async () => {
    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
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
  });
}
