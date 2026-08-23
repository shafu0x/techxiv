"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function HowItWorks() {
  return (
    <Dialog>
      <DialogTrigger className="text-sm text-muted-foreground hover:text-foreground">
        How it works
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>How it works</DialogTitle>
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
      </DialogContent>
    </Dialog>
  );
}
