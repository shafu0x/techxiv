"use client";

import { useOptimistic, useTransition } from "react";
import posthog from "posthog-js";
import { useRouter, useSearchParams } from "next/navigation";
import { Toggle } from "@/components/ui/toggle";
import { cn } from "@/lib/utils";

const posthogConfigured = Boolean(
  process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN && process.env.NEXT_PUBLIC_POSTHOG_HOST,
);

export function ViralToggle({ viral }: { viral: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [pressed, setPressed] = useOptimistic(viral);

  function commit(next: boolean) {
    if (posthogConfigured) {
      posthog.capture("viral_filter_changed", { enabled: next });
    }

    const params = new URLSearchParams(searchParams);
    if (next) {
      params.set("viral", "1");
    } else {
      params.delete("viral");
    }
    params.delete("page");

    const search = params.toString();
    startTransition(() => {
      setPressed(next);
      router.replace(search ? `/?${search}` : "/", { scroll: false });
    });
  }

  return (
    <div className={cn("flex w-auto items-center transition-opacity", pending && "opacity-60")}>
      <Toggle
        variant="outline"
        size="sm"
        pressed={pressed}
        onPressedChange={commit}
        aria-label="Viral on X"
        className="h-11 border-transparent px-3 font-normal twitter-ring data-[state=on]:bg-transparent data-[state=on]:text-twitter data-[state=on]:hover:bg-transparent data-[state=on]:hover:text-twitter sm:h-9 sm:px-2.5"
      >
        <span className="hidden sm:inline">Viral on</span>
        <svg viewBox="0 0 24 24" className="size-3.5 shrink-0" aria-hidden="true">
          <path
            fill="currentColor"
            d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z"
          />
        </svg>
      </Toggle>
    </div>
  );
}
