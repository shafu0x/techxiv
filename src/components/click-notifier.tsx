"use client";

import { useEffect } from "react";
import { sendDiscordNotification } from "@/lib/discord";

function labelFromElement(element: HTMLElement): string | null {
  const date = element.querySelector("time")?.textContent?.trim();
  const title = element
    .querySelector("time")
    ?.previousElementSibling?.textContent?.trim()
    .replace(/\s+/g, " ");
  if (title && date) {
    return `${title} ${date}`;
  }

  const text = element.textContent?.trim().replace(/\s+/g, " ");
  if (!text) return null;
  return text;
}

export function ClickNotifier() {
  useEffect(() => {
    function handleClick(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const anchor = target.closest("a[href]");
      if (anchor instanceof HTMLAnchorElement) {
        const label = labelFromElement(anchor) ?? anchor.href;
        void sendDiscordNotification(`clicked ${label}`);
        return;
      }

      const button = target.closest("button");
      if (button instanceof HTMLButtonElement) {
        if (button.disabled) return;
        const label = labelFromElement(button);
        if (!label) return;
        void sendDiscordNotification(`clicked ${label}`);
      }
    }

    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  return null;
}
