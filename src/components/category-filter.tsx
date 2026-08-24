"use client";

import { useState } from "react";
import { useFilterSelection } from "@/lib/use-filter-selection";
import {
  Bot,
  Brain,
  CheckIcon,
  ChevronDownIcon,
  Database,
  Gauge,
  Globe,
  type LucideIcon,
  Server,
  Shield,
  Tags,
  Terminal,
  Users,
} from "lucide-react";
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
import { CATEGORY_LABELS, VISIBLE_CATEGORIES, type Category } from "@/lib/taxonomy";
import { cn } from "@/lib/utils";

const CATEGORY_ICONS: Record<Category, LucideIcon> = {
  "ai-models-research": Brain,
  "ai-agents-tooling": Bot,
  infrastructure: Server,
  "data-observability": Database,
  "web-frontend": Globe,
  "languages-performance": Gauge,
  security: Shield,
  "developer-experience": Terminal,
  "business-culture": Users,
};

// The trigger is a fixed width, so a single selection shows an abbreviated
// label that fits beside the icon without truncating.
const CATEGORY_SHORT_LABELS: Record<Category, string> = {
  "ai-models-research": "AI Research",
  "ai-agents-tooling": "AI Agents",
  infrastructure: "Infrastructure",
  "data-observability": "Data",
  "web-frontend": "Frontend",
  "languages-performance": "Performance",
  security: "Security",
  "developer-experience": "Dev Ex",
  "business-culture": "Business",
};

const MAX_STACKED_ICONS = 4;

export function CategoryFilter({ selected }: { selected: Category[] }) {
  const [open, setOpen] = useState(false);
  const { selected: picked, pending, commit } = useFilterSelection(selected, "cats");

  const allSelected = picked.length === 0;
  const shown = picked.slice(0, MAX_STACKED_ICONS);
  const single =
    picked.length === 1 ? { category: picked[0], Icon: CATEGORY_ICONS[picked[0]] } : null;

  return (
    <div
      className={cn(
        "flex w-full items-center transition-opacity sm:w-auto",
        pending && "opacity-60",
      )}
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            role="combobox"
            aria-expanded={open}
            aria-label="Filter by category"
            // Fixed width so changing the selection never reflows the toolbar.
            className="h-11 w-full justify-center px-2 font-normal sm:h-9 sm:w-40 sm:justify-between sm:gap-2 sm:px-2.5"
          >
            {allSelected ? (
              <span className="flex min-w-0 items-center gap-1.5">
                <Tags className="size-4 shrink-0 text-muted-foreground" />
                <span className="hidden truncate text-sm sm:inline">All topics</span>
              </span>
            ) : single ? (
              <span className="flex min-w-0 items-center gap-1.5">
                <single.Icon className="size-4 shrink-0" />
                <span className="hidden truncate text-sm sm:inline">
                  {CATEGORY_SHORT_LABELS[single.category]}
                </span>
              </span>
            ) : (
              <span className="flex min-w-0 items-center gap-1.5">
                {shown.map((category, index) => {
                  const Icon = CATEGORY_ICONS[category];
                  return (
                    <Icon
                      key={category}
                      className={cn("size-4 shrink-0", index > 0 && "hidden sm:block")}
                    />
                  );
                })}
                {picked.length > shown.length ? (
                  <span className="hidden text-xs text-muted-foreground tabular-nums sm:inline">
                    +{picked.length - shown.length}
                  </span>
                ) : null}
              </span>
            )}
            <ChevronDownIcon className="hidden size-4 shrink-0 text-muted-foreground sm:block" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto min-w-56 p-0">
          <Command>
            <CommandInput placeholder="Search topics" />
            <CommandList>
              <CommandEmpty>No topics found.</CommandEmpty>
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
                  <span className="font-medium">All topics</span>
                </CommandItem>
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup>
                {VISIBLE_CATEGORIES.map((category) => {
                  const checked = picked.includes(category);
                  const Icon = CATEGORY_ICONS[category];
                  return (
                    <CommandItem
                      key={category}
                      value={CATEGORY_LABELS[category]}
                      onSelect={() =>
                        commit(
                          checked
                            ? picked.filter((item) => item !== category)
                            : [...picked, category],
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
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted">
                        <Icon className="size-3.5" />
                      </span>
                      <span className="whitespace-nowrap">{CATEGORY_LABELS[category]}</span>
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
