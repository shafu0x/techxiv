"use client";

import Image from "next/image";
import { useState } from "react";
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
  const activeOrgs = allSelected
    ? ordered
    : ordered.filter((org) => picked.includes(org.slug));
  const shownOrgs = activeOrgs.slice(0, MAX_STACKED_LOGOS);
  const singleOrg = !allSelected && activeOrgs.length === 1 ? activeOrgs[0] : null;

  return (
    <div className={cn("flex items-center transition-opacity", pending && "opacity-60")}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            role="combobox"
            aria-expanded={open}
            aria-label="Filter by organization"
            // Fixed width so changing the selection never reflows the toolbar.
            className="h-9 w-40 justify-between gap-2 px-2.5 font-normal"
          >
            {singleOrg ? (
              <span className="flex min-w-0 items-center gap-1.5">
                <Avatar className="size-5 bg-muted">
                  <AvatarImage
                    src={singleOrg.logo}
                    alt=""
                    className="object-contain p-0.5"
                  />
                </Avatar>
                <span className="truncate text-sm">{singleOrg.name}</span>
              </span>
            ) : (
              <AvatarGroup className="-space-x-1">
                {shownOrgs.map((org) => (
                  <Avatar key={org.slug} className="size-5 bg-muted">
                    <AvatarImage src={org.logo} alt={org.name} className="object-contain p-0.5" />
                  </Avatar>
                ))}
                {activeOrgs.length > shownOrgs.length ? (
                  <AvatarGroupCount className="size-5 text-[0.625rem]">
                    +{activeOrgs.length - shownOrgs.length}
                  </AvatarGroupCount>
                ) : null}
              </AvatarGroup>
            )}
            <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64 p-0">
          <Command>
            <CommandInput placeholder="Search organizations" />
            <CommandList>
              <CommandEmpty>No organizations found.</CommandEmpty>
              <CommandGroup>
                <CommandItem onSelect={() => commit([])} className="gap-2">
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
                        commit(
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
