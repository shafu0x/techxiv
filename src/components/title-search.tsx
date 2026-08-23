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
  const searchParamsRef = useRef(searchParams);

  useEffect(() => {
    searchParamsRef.current = searchParams;
  });

  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState(value);
  const [prevValue, setPrevValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (value !== prevValue) {
    setPrevValue(value);
    setQuery(value);
  }

  const commit = useCallback(
    (next: string) => {
      const trimmed = next.trim();
      if (trimmed === value) {
        return;
      }

      const params = new URLSearchParams(searchParamsRef.current);
      if (trimmed) {
        params.set("q", trimmed);
      } else {
        params.delete("q");
      }
      params.delete("page");

      const search = params.toString();
      startTransition(() => {
        router.replace(search ? `/?${search}` : "/", { scroll: false });
      });
    },
    [router, value],
  );

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed === value) {
      return;
    }

    debounceRef.current = setTimeout(() => commit(query), DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [query, value, commit]);

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
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    setQuery("");
    commit("");
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
