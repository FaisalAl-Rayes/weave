"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Check, Loader2 } from "lucide-react";
import type { WeaveSchema, TraversalConfig } from "@/lib/schema/types";

interface TraversalEditorProps {
  schema: WeaveSchema;
  onSave: (schema: WeaveSchema) => Promise<void>;
}

const FIELDS: { key: keyof TraversalConfig; label: string; suffix?: string }[] = [
  { key: "max_depth", label: "Max Depth" },
  { key: "max_queue_per_level", label: "Max Queue Per Level" },
  { key: "max_total_entities", label: "Max Total Entities" },
  { key: "timeout_seconds", label: "Timeout", suffix: "s" },
  { key: "concurrency", label: "Concurrency" },
];

export function TraversalEditor({ schema, onSave }: TraversalEditorProps) {
  const [values, setValues] = useState<TraversalConfig>({ ...schema.traversal });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const hasChanges = JSON.stringify(values) !== JSON.stringify(schema.traversal);

  const handleSave = useCallback(async () => {
    setSaving(true);
    await onSave({ ...schema, traversal: values });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }, [schema, values, onSave]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">
          Traversal Configuration
        </CardTitle>
        <CardDescription>
          Limits and controls for the graph traversal engine.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
          {FIELDS.map(({ key, label, suffix }) => (
            <div key={key} className="space-y-1">
              <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">
                {label}
              </Label>
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  value={values[key] as number}
                  onChange={(e) =>
                    setValues((prev) => ({
                      ...prev,
                      [key]: parseInt(e.target.value) || 0,
                    }))
                  }
                  className="h-8 text-sm font-mono"
                />
                {suffix && (
                  <span className="text-xs text-muted-foreground">{suffix}</span>
                )}
              </div>
            </div>
          ))}
        </div>

        {hasChanges && (
          <div className="flex justify-end items-center gap-2 mt-3">
            {saved && (
              <span className="text-xs text-emerald-400 flex items-center gap-1">
                <Check className="h-3 w-3" /> Saved
              </span>
            )}
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              Save
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
