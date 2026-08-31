"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Compass, Loader2 } from "lucide-react";
import type { WeaveSchema } from "@/lib/schema/types";


interface SeedInputProps {
  schema: WeaveSchema | null;
  isLoading: boolean;
  onExplore: (seedType: string, seedValue: string) => void;
}

export function SeedInput({ schema, isLoading, onExplore }: SeedInputProps) {
  const seeds = schema?.seeds ?? [];
  const primarySeed = seeds.find((s) => s.primary) ?? seeds[0];

  const [seedType, setSeedType] = useState(primarySeed?.identifier ?? "");
  const [seedValue, setSeedValue] = useState("");

  useEffect(() => {
    if (primarySeed?.identifier) {
      setSeedType(primarySeed.identifier);
    }
  }, [primarySeed?.identifier]);

  const handleSubmit = () => {
    if (seedValue.trim()) {
      onExplore(seedType, seedValue.trim());
    }
  };

  const identifierLabel =
    schema?.identifiers?.[seedType]?.label ?? seedType ?? "Identifier";

  return (
    <div className="space-y-2">
      {/* Seed type selector — standalone dropdown, opens downward */}
      {seeds.length > 1 && (
        <div className="flex items-center gap-2">
          <Label className="text-xs text-muted-foreground shrink-0">
            Search by
          </Label>
          <Select value={seedType} onValueChange={setSeedType}>
            <SelectTrigger className="h-8 w-48 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {seeds.map((seed) => (
                <SelectItem key={seed.identifier} value={seed.identifier} className="text-xs">
                  {schema?.identifiers?.[seed.identifier]?.label ?? seed.identifier}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Search bar */}
      <div className="flex items-stretch rounded-lg border border-border/60 bg-card shadow-sm overflow-hidden focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 transition-[border-color,box-shadow]">
        <input
          id="seedValue"
          placeholder={`Enter ${identifierLabel}…`}
          value={seedValue}
          onChange={(e) => setSeedValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          className="flex-1 bg-transparent px-4 py-2.5 font-mono text-sm placeholder:text-muted-foreground/60 outline-none min-w-0"
          autoComplete="off"
          spellCheck={false}
        />
        <Button
          onClick={handleSubmit}
          disabled={isLoading || !seedValue.trim()}
          className="rounded-none m-0 h-auto px-5 shrink-0"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Compass className="h-4 w-4" />
          )}
          <span className="ml-1.5">{isLoading ? "Exploring…" : "Explore"}</span>
        </Button>
      </div>

    </div>
  );
}
