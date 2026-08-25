"use client";

import { useState, useSyncExternalStore } from "react";
import Image from "next/image";
import { Heart } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type Org = {
  name: string;
  logo: string;
};

const SEEN_KEY = "techxiv-about-seen";

// Identity must be stable or every render resubscribes. Nothing else writes the
// key, so there is no store to subscribe to.
const noSubscribe = () => () => {};

export function About({ orgs }: { orgs: Org[] }) {
  // localStorage is unreadable while rendering on the server, so the server
  // snapshot claims "seen" and the first visit only resolves after hydration.
  const seen = useSyncExternalStore(
    noSubscribe,
    () => localStorage.getItem(SEEN_KEY) !== null,
    () => true,
  );
  const [toggled, setToggled] = useState<boolean | null>(null);

  return (
    <Dialog
      open={toggled ?? !seen}
      onOpenChange={(next) => {
        setToggled(next);
        if (!next) {
          localStorage.setItem(SEEN_KEY, "1");
        }
      }}
    >
      <DialogTrigger className="text-sm text-muted-foreground hover:text-foreground">
        About
      </DialogTrigger>
      <DialogContent className="overflow-hidden sm:max-w-md">
        <div
          aria-hidden
          className="pointer-events-none -mx-4 -mt-4 flex overflow-hidden py-3 mask-[linear-gradient(to_right,transparent,black_12%,black_70%,transparent_92%)] [--gap:0.75rem] gap-(--gap)"
        >
          {Array.from({ length: 2 }, (_, copy) => (
            <div
              key={copy}
              className="flex shrink-0 animate-marquee items-center gap-(--gap) motion-reduce:animate-none"
            >
              {orgs.map((org) => (
                <span
                  key={`${copy}-${org.name}`}
                  className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted p-1.5"
                >
                  <Image
                    src={org.logo}
                    alt=""
                    width={20}
                    height={20}
                    className="size-full object-contain [color-scheme:light]"
                    unoptimized
                  />
                </span>
              ))}
            </div>
          ))}
        </div>
        <DialogHeader>
          <DialogTitle>Welcome!</DialogTitle>
          <DialogDescription className="text-pretty leading-relaxed">
            The real alpha is in technical blogs. I was reading them more and more, so I built a
            central place for the organizations I enjoy most.
          </DialogDescription>
        </DialogHeader>
        <p className="text-pretty text-sm leading-relaxed text-muted-foreground">
          I scrape over 20 organizations daily to show them all here. Hand-picked companies, newest
          posts first. Click a title and you go to the original. I don&apos;t host the articles or
          write summaries.
        </p>
        <p className="mt-4 flex flex-wrap items-center justify-center gap-1.5 text-sm text-muted-foreground">
          Made with
          <Heart className="size-3.5 fill-current" aria-hidden="true" />
          by{" "}
          <a
            href="https://x.com/shafu0x"
            target="_blank"
            rel="noopener noreferrer"
            className="text-inherit underline"
          >
            @shafu0x
          </a>
        </p>
      </DialogContent>
    </Dialog>
  );
}
