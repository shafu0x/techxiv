"use client";

import { useEffect } from "react";
import posthog from "posthog-js";

const MAX_LABEL_LENGTH = 200;
const posthogConfigured = Boolean(
  process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN && process.env.NEXT_PUBLIC_POSTHOG_HOST,
);

function labelFromElement(element: Element): string | null {
  const time = element.querySelector("time");
  const date = time?.textContent?.trim();
  const title = time?.previousElementSibling?.textContent?.trim().replace(/\s+/g, " ");
  if (title && date) {
    return `${title} ${date}`;
  }

  // Sliced first: a click on a container would otherwise normalize the whole page's text.
  return (
    element.textContent
      ?.slice(0, MAX_LABEL_LENGTH * 4)
      .trim()
      .replace(/\s+/g, " ") || null
  );
}

/**
 * sendBeacon rather than a server action: clicks are not mutations, they must
 * survive the navigation they trigger, and Next.js dispatches server actions
 * one at a time per client, which would queue every click behind the last one.
 */
function track(label: string, notify: boolean) {
  const body = JSON.stringify({
    label: label.slice(0, MAX_LABEL_LENGTH),
    path: window.location.pathname,
    notify,
  });
  navigator.sendBeacon("/api/click", new Blob([body], { type: "application/json" }));
}

export function ClickNotifier() {
  useEffect(() => {
    function handleClick(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const anchor = target.closest("a[href]");
      if (anchor instanceof HTMLAnchorElement) {
        const isPostLink = anchor.closest("#posts") !== null;
        if (isPostLink && posthogConfigured) {
          posthog.capture("post_opened");
        }
        track(labelFromElement(anchor) ?? anchor.href, true);
        return;
      }

      const button = target.closest("button");
      if (button instanceof HTMLButtonElement) {
        const label = labelFromElement(button);
        track(label ?? "button", !button.disabled && label !== null);
        return;
      }

      track(labelFromElement(target) ?? target.tagName.toLowerCase(), false);
    }

    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  return null;
}
