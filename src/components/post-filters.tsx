"use client";

import Image from "next/image";
import { useState } from "react";
import posthog from "posthog-js";
import { useFilterSelection } from "@/lib/use-filter-selection";
import { CheckIcon, ChevronDownIcon } from "lucide-react";
import { Avatar, AvatarGroup, AvatarGroupCount, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type FilterOrganization = {
  slug: string;
  name: string;
  logo: string;
};

const MAX_STACKED_LOGOS = 5;
const MAX_STACKED_LOGOS_MOBILE = 3;
const posthogConfigured = Boolean(
  process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN && process.env.NEXT_PUBLIC_POSTHOG_HOST,
);

export function PostFilters({
  organizations,
  selected,
}: {
  organizations: FilterOrganization[];
  selected: string[];
}) {
  const [open, setOpen] = useState(false);
  const { selected: picked, pending, commit } = useFilterSelection(selected, "orgs");

  const allSelected = picked.length === 0;
  const ordered = [...organizations].sort((a, b) =>
    a.slug === "anthropic" ? -1 : b.slug === "anthropic" ? 1 : 0,
  );
  // With nothing checked every organization is included, so the trigger shows them all.
  const activeOrgs = allSelected ? ordered : ordered.filter((org) => picked.includes(org.slug));
  const shownOrgs = activeOrgs.slice(0, MAX_STACKED_LOGOS);
  const singleOrg = !allSelected && activeOrgs.length === 1 ? activeOrgs[0] : null;

  function changeSelection(next: string[]) {
    if (posthogConfigured) {
      posthog.capture("organization_filter_changed", {
        selected_organization_count: next.length,
        filter_mode: next.length === 0 ? "all" : "selected",
      });
    }
    commit(next);
  }

  return (
    <div className={cn("flex w-auto items-center transition-opacity", pending && "opacity-60")}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            role="combobox"
            aria-expanded={open}
            aria-label="Filter by organization"
            // Fixed width so changing the selection never reflows the toolbar.
            className="h-11 w-auto justify-center px-2.5 font-normal sm:h-9 sm:w-40 sm:justify-between sm:gap-2 sm:px-2.5"
          >
            {singleOrg ? (
              <span className="flex min-w-0 items-center gap-1.5">
                <Avatar className="size-5 bg-muted">
                  <AvatarImage src={singleOrg.logo} alt="" className="object-contain p-0.5" />
                </Avatar>
                <span className="hidden truncate text-sm sm:inline">{singleOrg.name}</span>
              </span>
            ) : (
              <AvatarGroup className="-space-x-1">
                {shownOrgs.map((org, index) => (
                  <Avatar
                    key={org.slug}
                    className={cn(
                      "size-5 bg-muted",
                      index >= MAX_STACKED_LOGOS_MOBILE && "hidden sm:flex",
                    )}
                  >
                    <AvatarImage src={org.logo} alt={org.name} className="object-contain p-0.5" />
                  </Avatar>
                ))}
                {activeOrgs.length > MAX_STACKED_LOGOS_MOBILE ? (
                  <AvatarGroupCount className="size-5 text-[0.625rem] sm:hidden">
                    +{activeOrgs.length - MAX_STACKED_LOGOS_MOBILE}
                  </AvatarGroupCount>
                ) : null}
                {activeOrgs.length > shownOrgs.length ? (
                  <AvatarGroupCount className="hidden size-5 text-[0.625rem] sm:flex">
                    +{activeOrgs.length - shownOrgs.length}
                  </AvatarGroupCount>
                ) : null}
              </AvatarGroup>
            )}
            <ChevronDownIcon className="hidden size-4 shrink-0 text-muted-foreground sm:block" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64 p-0">
          <Command>
            <CommandInput placeholder="Search organizations" />
            <CommandList>
              <CommandEmpty>No organizations found.</CommandEmpty>
              <CommandGroup>
                <CommandItem onSelect={() => changeSelection([])} className="gap-2">
                  <span
                    className={cn(
                      "flex size-4 shrink-0 items-center justify-center rounded-[4px] border",
                      allSelected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-input",
                    )}
                  >
                    {allSelected ? <CheckIcon className="size-3" /> : null}
                  </span>
                  <span className="font-medium">All organizations</span>
                </CommandItem>
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup>
                {ordered.map((org) => {
                  const checked = picked.includes(org.slug);
                  return (
                    <CommandItem
                      key={org.slug}
                      value={org.name}
                      onSelect={() =>
                        changeSelection(
                          checked
                            ? picked.filter((slug) => slug !== org.slug)
                            : [...picked, org.slug],
                        )
                      }
                      className="gap-2"
                    >
                      <span
                        className={cn(
                          "flex size-4 shrink-0 items-center justify-center rounded-[4px] border",
                          checked
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-input",
                        )}
                      >
                        {checked ? <CheckIcon className="size-3" /> : null}
                      </span>
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted p-1">
                        <Image
                          src={org.logo}
                          alt=""
                          width={16}
                          height={16}
                          className="size-full object-contain"
                          unoptimized
                        />
                      </span>
                      <span className="truncate">{org.name}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
