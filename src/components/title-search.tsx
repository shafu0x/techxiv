"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SearchIcon, XIcon } from "lucide-react";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { cn } from "@/lib/utils";

const DEBOUNCE_MS = 200;

export function TitleSearch({ value }: { value: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState(value);
  // Last value this component pushed into the URL, so we can tell our own
  // navigations apart from external ones (back/forward, "Clear filters").
  const [committed, setCommitted] = useState(value);
  const [prevValue, setPrevValue] = useState(value);

  // Adopt external URL changes, but never clobber typing that happened while
  // one of our own navigations was still in flight.
  if (value !== prevValue) {
    setPrevValue(value);
    if (value !== committed) {
      setCommitted(value);
      setQuery(value);
    }
  }

  const commit = useCallback(
    (next: string) => {
      setCommitted(next);

      const params = new URLSearchParams(searchParams);
      if (next) {
        params.set("q", next);
      } else {
        params.delete("q");
      }
      params.delete("page");

      const search = params.toString();
      startTransition(() => {
        router.replace(search ? `/?${search}` : "/", { scroll: false });
      });
    },
    [router, searchParams],
  );

  useEffect(() => {
    const next = query.trim();
    if (next === committed) {
      return;
    }

    const timeout = setTimeout(() => commit(next), DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [query, committed, commit]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  function clear() {
    setQuery("");
    if (committed !== "") {
      commit("");
    }
    inputRef.current?.focus();
  }

  return (
    <InputGroup className={cn("h-9 transition-opacity", pending && "opacity-60")}>
      <InputGroupAddon>
        <SearchIcon className="size-4 shrink-0 opacity-50" />
      </InputGroupAddon>
      <InputGroupInput
        ref={inputRef}
        type="text"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && query) {
            event.preventDefault();
            clear();
          }
        }}
        placeholder="Search titles"
        aria-label="Search titles"
        autoComplete="off"
        className="h-9"
      />
      {query ? (
        <InputGroupAddon align="inline-end">
          <InputGroupButton size="icon-xs" aria-label="Clear search" onClick={clear}>
            <XIcon />
          </InputGroupButton>
        </InputGroupAddon>
      ) : (
        <InputGroupAddon align="inline-end" className="hidden sm:flex">
          <kbd className="pointer-events-none rounded border bg-muted px-1.5 font-sans text-[10px] text-muted-foreground">
            ⌘K
          </kbd>
        </InputGroupAddon>
      )}
    </InputGroup>
  );
}
