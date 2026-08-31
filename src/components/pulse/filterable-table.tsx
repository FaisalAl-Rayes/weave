"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { ListFilter, Check, X } from "lucide-react";

export interface TableColumn {
  key: string;
  label: string;
  filterable?: boolean;
  /** "facet" (default) shows a pick-from-list popover; "regex" shows an inline text input */
  filterType?: "facet" | "regex";
  align?: "left" | "right";
  className?: string;
}

interface FilterableTableProps {
  columns: TableColumn[];
  rows: Record<string, unknown>[];
  maxHeight?: string;
  rowKey: (row: Record<string, unknown>, index: number) => string;
  renderCell: (column: TableColumn, value: unknown, row: Record<string, unknown>) => React.ReactNode;
  emptyMessage?: string;
}

// -------------------------------------------------------
// Per-column faceted filter popover
// -------------------------------------------------------

interface FacetedFilterProps {
  columnKey: string;
  label: string;
  // All values in this column across all rows, with counts
  facets: Map<string, number>;
  selected: string[];
  onChange: (selected: string[]) => void;
}

function FacetedFilter({ label, facets, selected, onChange }: FacetedFilterProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const isActive = selected.length > 0;

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 0);
    } else {
      setSearch("");
    }
  }, [open]);

  const entries = useMemo(() => {
    const all = [...facets.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    if (!search) return all;
    return all.filter(([val]) => val.toLowerCase().includes(search.toLowerCase()));
  }, [facets, search]);

  const toggle = (val: string) => {
    onChange(
      selected.includes(val)
        ? selected.filter((v) => v !== val)
        : [...selected, val],
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`inline-flex items-center justify-center rounded p-0.5 transition-colors hover:bg-accent ${
            isActive ? "text-primary" : "text-muted-foreground/40 hover:text-muted-foreground"
          }`}
          aria-label={`Filter ${label}`}
        >
          <ListFilter className="h-3 w-3" />
        </button>
      </PopoverTrigger>

      <PopoverContent className="w-52 p-0 overflow-hidden" align="start" side="bottom">
        {/* Search */}
        <div className="border-b px-2 py-1.5">
          <Input
            ref={inputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
            placeholder={`Search ${label.toLowerCase()}…`}
            className="h-7 text-xs border-0 bg-transparent p-0 shadow-none focus-visible:ring-0 font-mono"
          />
        </div>

        {/* Values list */}
        <div className="max-h-52 overflow-y-auto">
          {entries.length === 0 ? (
            <p className="px-3 py-3 text-xs text-muted-foreground text-center">No matches</p>
          ) : (
            <div className="p-1">
              {entries.map(([val, count]) => {
                const isChecked = selected.includes(val);
                return (
                  <button
                    key={val}
                    type="button"
                    onClick={() => toggle(val)}
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs transition-colors hover:bg-accent hover:text-accent-foreground"
                  >
                    <div
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                        isChecked
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-muted-foreground/40"
                      }`}
                    >
                      {isChecked && <Check className="h-2.5 w-2.5" />}
                    </div>
                    <span className="flex-1 text-left font-mono truncate">{val}</span>
                    <span className="text-[10px] text-muted-foreground tabular-nums">{count}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        {(isActive || selected.length > 0) && (
          <div className="border-t p-1">
            <button
              type="button"
              onClick={() => onChange([])}
              className="w-full rounded-sm px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent transition-colors text-center"
            >
              Clear filter ({selected.length} selected)
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

// -------------------------------------------------------
// Regex filter — inline text input in the column header
// -------------------------------------------------------

interface RegexFilterProps {
  columnKey: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}

function RegexFilter({ label, value, onChange }: RegexFilterProps) {
  const isActive = value.length > 0;
  const isInvalid = isActive && (() => { try { new RegExp(value, "i"); return false; } catch { return true; } })();

  return (
    <div className="flex items-center gap-1 min-w-0">
      <span className="shrink-0">{label}</span>
      <div className="relative flex items-center">
        <span className="absolute left-1 text-[9px] text-muted-foreground/50 select-none font-mono">/</span>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="regex…"
          className={`h-5 w-24 rounded border pl-3 pr-5 text-[10px] font-mono bg-transparent outline-none transition-colors
            ${isInvalid
              ? "border-red-500/60 text-red-400"
              : isActive
              ? "border-primary/60 text-foreground"
              : "border-border/40 text-muted-foreground placeholder:text-muted-foreground/30 focus:border-border"
            }`}
          title={isInvalid ? "Invalid regular expression" : `Filter by regex, e.g. stg|stage`}
        />
        {isActive && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute right-1 text-muted-foreground/50 hover:text-muted-foreground"
            aria-label="Clear filter"
          >
            <X className="h-2.5 w-2.5" />
          </button>
        )}
      </div>
    </div>
  );
}

// -------------------------------------------------------
// Main table
// -------------------------------------------------------

export function FilterableTable({
  columns,
  rows,
  maxHeight = "320px",
  rowKey,
  renderCell,
  emptyMessage = "No data",
}: FilterableTableProps) {
  const facetColumns = columns.filter((c) => c.filterable && c.filterType !== "regex");
  const regexColumns = columns.filter((c) => c.filterable && c.filterType === "regex");

  // Facet filter state: columnKey → array of selected values (empty = show all)
  const [filters, setFilters] = useState<Record<string, string[]>>({});
  // Regex filter state: columnKey → regex string
  const [regexFilters, setRegexFilters] = useState<Record<string, string>>({});

  // Compute facets (unique values + counts) per facet column, from ALL rows
  const facets = useMemo(() => {
    const result: Record<string, Map<string, number>> = {};
    for (const col of facetColumns) {
      const map = new Map<string, number>();
      for (const row of rows) {
        const val = String(row[col.key] ?? "");
        map.set(val, (map.get(val) ?? 0) + 1);
      }
      result[col.key] = map;
    }
    return result;
  }, [rows, facetColumns]);

  const filtered = useMemo(() => {
    const activeFacets = facetColumns.filter((col) => (filters[col.key]?.length ?? 0) > 0);
    const activeRegex = regexColumns.filter((col) => {
      const pattern = regexFilters[col.key] ?? "";
      if (!pattern) return false;
      try { new RegExp(pattern, "i"); return true; } catch { return false; }
    });

    if (activeFacets.length === 0 && activeRegex.length === 0) return rows;

    return rows.filter((row) => {
      const facetMatch = activeFacets.every((col) =>
        filters[col.key].includes(String(row[col.key] ?? "")),
      );
      const regexMatch = activeRegex.every((col) => {
        const re = new RegExp(regexFilters[col.key], "i");
        return re.test(String(row[col.key] ?? ""));
      });
      return facetMatch && regexMatch;
    });
  }, [rows, filters, facetColumns, regexFilters, regexColumns]);

  const setFilter = (key: string, selected: string[]) =>
    setFilters((prev) => ({ ...prev, [key]: selected }));

  const setRegexFilter = (key: string, value: string) =>
    setRegexFilters((prev) => ({ ...prev, [key]: value }));

  const hasActiveFilters =
    facetColumns.some((col) => (filters[col.key]?.length ?? 0) > 0) ||
    regexColumns.some((col) => (regexFilters[col.key]?.length ?? 0) > 0);

  return (
    <div className="rounded border border-border/30 overflow-hidden">
      <div style={{ maxHeight }} className="overflow-y-auto overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10 bg-card border-b border-border/40">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-2 py-2 font-normal text-muted-foreground whitespace-nowrap ${
                    col.align === "right" ? "text-right" : "text-left"
                  } ${col.className ?? ""}`}
                >
                  {col.filterable && col.filterType === "regex" ? (
                    <RegexFilter
                      columnKey={col.key}
                      label={col.label}
                      value={regexFilters[col.key] ?? ""}
                      onChange={(v) => setRegexFilter(col.key, v)}
                    />
                  ) : col.filterable ? (
                    <div className={`flex items-center gap-1 ${col.align === "right" ? "justify-end" : ""}`}>
                      <span>{col.label}</span>
                      <FacetedFilter
                        columnKey={col.key}
                        label={col.label}
                        facets={facets[col.key] ?? new Map()}
                        selected={filters[col.key] ?? []}
                        onChange={(selected) => setFilter(col.key, selected)}
                      />
                    </div>
                  ) : (
                    col.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-2 py-6 text-center text-muted-foreground">
                  {rows.length === 0 ? emptyMessage : "No rows match the current filters."}
                </td>
              </tr>
            ) : (
              filtered.map((row, i) => (
                <tr
                  key={rowKey(row, i)}
                  className="border-b border-border/20 last:border-0 hover:bg-muted/20"
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`px-2 py-1.5 ${
                        col.align === "right" ? "text-right tabular-nums" : ""
                      } ${col.className ?? ""}`}
                    >
                      {renderCell(col, row[col.key], row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="border-t border-border/20 px-2 py-1 bg-muted/10 text-[10px] text-muted-foreground flex items-center justify-between">
        <span>{filtered.length} of {rows.length} rows</span>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={() => { setFilters({}); setRegexFilters({}); }}
            className="hover:text-foreground transition-colors"
          >
            Clear all filters
          </button>
        )}
      </div>
    </div>
  );
}
