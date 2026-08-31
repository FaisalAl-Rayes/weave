"use client";

import { useState, useCallback, useMemo } from "react";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface DateTimePickerProps {
  value: string;
  onChange: (iso: string) => void;
  placeholder?: string;
  className?: string;
}

export function DateTimePicker({
  value,
  onChange,
  placeholder = "Pick date & time",
  className,
}: DateTimePickerProps) {
  const [open, setOpen] = useState(false);

  const date = useMemo(() => {
    if (!value) return undefined;
    const d = new Date(value);
    return isNaN(d.getTime()) ? undefined : d;
  }, [value]);

  const hours = date?.getHours() ?? 0;
  const minutes = date?.getMinutes() ?? 0;
  const seconds = date?.getSeconds() ?? 0;

  const emitChange = useCallback(
    (d: Date) => {
      onChange(d.toISOString());
    },
    [onChange],
  );

  const handleDateSelect = useCallback(
    (selected: Date | undefined) => {
      if (!selected) return;
      const next = new Date(selected);
      next.setHours(hours, minutes, seconds);
      emitChange(next);
    },
    [hours, minutes, seconds, emitChange],
  );

  const handleTimeChange = useCallback(
    (unit: "hours" | "minutes" | "seconds", val: number) => {
      const base = date ? new Date(date) : new Date();
      if (!date) {
        base.setHours(0, 0, 0, 0);
      }
      if (unit === "hours") base.setHours(val);
      else if (unit === "minutes") base.setMinutes(val);
      else base.setSeconds(val);
      emitChange(base);
    },
    [date, emitChange],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "h-7 justify-start text-left font-mono text-[11px] px-2.5 gap-1.5 border-border/30 bg-muted/20 hover:bg-muted/40",
            !value && "text-muted-foreground",
            className,
          )}
        >
          <CalendarIcon className="h-3 w-3 text-muted-foreground shrink-0" />
          {date ? (
            <span>{format(date, "MMM d, yyyy  HH:mm:ss")}</span>
          ) : (
            <span className="text-muted-foreground/60">{placeholder}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start" sideOffset={6}>
        <div className="flex">
          <Calendar
            mode="single"
            selected={date}
            onSelect={handleDateSelect}
            className="p-2"
          />
          <div className="flex border-l border-border/20">
            <TimeColumn
              label="H"
              count={24}
              value={hours}
              onChange={(v) => handleTimeChange("hours", v)}
            />
            <TimeColumn
              label="M"
              count={60}
              value={minutes}
              onChange={(v) => handleTimeChange("minutes", v)}
            />
            <TimeColumn
              label="S"
              count={60}
              value={seconds}
              onChange={(v) => handleTimeChange("seconds", v)}
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function TimeColumn({
  label,
  count,
  value,
  onChange,
}: {
  label: string;
  count: number;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col">
      <div className="px-2 py-1.5 text-center text-[9px] font-medium text-muted-foreground uppercase tracking-widest border-b border-border/20">
        {label}
      </div>
      <ScrollArea className="h-[252px]">
        <div className="flex flex-col p-0.5">
          {Array.from({ length: count }, (_, i) => (
            <button
              key={i}
              onClick={() => onChange(i)}
              className={cn(
                "w-9 rounded py-1 text-center text-[11px] font-mono transition-colors",
                i === value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
              )}
            >
              {String(i).padStart(2, "0")}
            </button>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
