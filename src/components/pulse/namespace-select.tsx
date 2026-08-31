"use client";

import { useState, useRef, useEffect } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Check, ChevronsUpDown, X } from "lucide-react";

interface NamespaceSelectProps {
  namespaces: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
  loading?: boolean;
}

export function NamespaceSelect({
  namespaces,
  selected,
  onChange,
  loading,
}: NamespaceSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = namespaces.filter((ns) =>
    ns.toLowerCase().includes(search.toLowerCase()),
  );

  const toggle = (ns: string) => {
    onChange(
      selected.includes(ns)
        ? selected.filter((s) => s !== ns)
        : [...selected, ns],
    );
  };

  const remove = (ns: string) => {
    onChange(selected.filter((s) => s !== ns));
  };

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 0);
    } else {
      setSearch("");
    }
  }, [open]);

  return (
    <div className="space-y-1.5">
      {/* Trigger — just a button, no nested interactive elements */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 text-sm transition-colors hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
            disabled={loading}
            aria-expanded={open}
          >
            <span className="text-muted-foreground text-xs">
              {loading
                ? "Loading namespaces…"
                : selected.length === 0
                ? "Select namespaces…"
                : `${selected.length} namespace${selected.length !== 1 ? "s" : ""} selected`}
            </span>
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </button>
        </PopoverTrigger>

        <PopoverContent
          className="w-[var(--radix-popover-trigger-width)] p-0 overflow-hidden"
          align="start"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {/* Search */}
          <div className="flex items-center border-b px-3">
            <Input
              ref={inputRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
              placeholder="Search namespaces…"
              className="h-9 border-0 bg-transparent p-0 text-xs shadow-none focus-visible:ring-0 font-mono"
            />
          </div>

          {/* Scrollable list */}
          <div className="h-[240px] overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="py-6 text-center text-xs text-muted-foreground">
                {search ? "No namespaces match." : "No namespaces available."}
              </p>
            ) : (
              <div className="p-1">
                {filtered.map((ns) => {
                  const isSelected = selected.includes(ns);
                  return (
                    <button
                      key={ns}
                      type="button"
                      onClick={() => toggle(ns)}
                      className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs font-mono transition-colors hover:bg-accent hover:text-accent-foreground"
                    >
                      <div
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                          isSelected
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-muted-foreground/40"
                        }`}
                      >
                        {isSelected && <Check className="h-2.5 w-2.5" />}
                      </div>
                      <span className="flex-1 text-left">{ns}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          {selected.length > 0 && (
            <div className="border-t p-1">
              <Button
                variant="ghost"
                size="sm"
                className="w-full h-7 text-xs text-muted-foreground"
                onClick={() => onChange([])}
              >
                Clear all ({selected.length})
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>

      {/* Selected badges — rendered OUTSIDE the trigger button to avoid nested <button> */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selected.map((ns) => (
            <Badge
              key={ns}
              variant="secondary"
              className="text-[10px] px-1.5 py-0 gap-1 font-mono"
            >
              {ns}
              {/* span with role/keyboard support — not a <button> to avoid nesting */}
              <span
                role="button"
                tabIndex={0}
                onClick={() => remove(ns)}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && remove(ns)}
                className="ml-0.5 rounded-full hover:bg-muted-foreground/20 p-0.5 cursor-pointer"
                aria-label={`Remove ${ns}`}
              >
                <X className="h-2.5 w-2.5" />
              </span>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
