import Link from "next/link";
import { HowItWorks } from "@/components/how-it-works";

export function Header() {
  return (
    <header className="border-b border-foreground/10 pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <Link href="/" className="flex items-center tracking-tight">
          <svg viewBox="0 0 32 32" className="size-5 shrink-0" aria-hidden="true">
            <path
              fill="currentColor"
              d="M16 4.5 18.85 13.26H28.06L21.61 18.67 24.46 27.44 16 21.99 7.54 27.44 10.39 18.67 3.94 13.26H13.15Z"
            />
          </svg>
          <span className="ml-1.5 font-semibold">techxiv</span>
        </Link>
        <HowItWorks />
      </div>
    </header>
  );
}
