"use client";

import type { ProviderViewProps } from "./types";
import { Button } from "@/components/ui/button";
import { CodeBlock } from "@/components/ui/code-block";
import { Play, Loader2 } from "lucide-react";

/**
 * Generic provider view — shows query config and renders JSON results.
 * Used as fallback for providers without a dedicated view.
 */
export function GenericView({ query, result, loading, onRun }: ProviderViewProps) {
  return (
    <div className="space-y-3">
      {/* Query display */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
            Query ({query.provider})
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-6 text-[10px] px-2 gap-1"
            onClick={onRun}
            disabled={loading}
          >
            {loading ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Play className="h-2.5 w-2.5" />}
            {loading ? "Running..." : "Run"}
          </Button>
        </div>
        <CodeBlock data={query.queryConfig} maxHeight="max-h-32" />
      </div>

      {/* Results */}
      {result !== undefined && (
        <div className="space-y-1">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Result</span>
          <CodeBlock data={result} maxHeight="max-h-80" />
        </div>
      )}
    </div>
  );
}
