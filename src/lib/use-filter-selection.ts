"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useOptimistic, useTransition } from "react";

export function useFilterSelection<T extends string>(selected: T[], param: string) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(selected);

  function commit(next: T[]) {
    const params = new URLSearchParams(searchParams);
    if (next.length > 0) {
      params.set(param, next.join(","));
    } else {
      params.delete(param);
    }
    params.delete("page");
    const query = params.toString();
    startTransition(() => {
      setOptimistic(next);
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    });
  }

  return { selected: optimistic, pending, commit };
}
