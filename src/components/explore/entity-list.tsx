"use client";

import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronRight } from "lucide-react";
import { EntityCard } from "./entity-card";
import type { GraphEntity } from "@/lib/engine/types";
import { useState } from "react";

interface EntityListProps {
  entities: GraphEntity[];
}

function EntityGroup({
  type,
  entities,
}: {
  type: string;
  entities: GraphEntity[];
}) {
  const [open, setOpen] = useState(true);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-2 w-full py-1.5 hover:bg-muted/50 rounded px-2 transition-colors cursor-pointer">
        <ChevronRight
          className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`}
        />
        <span className="text-sm font-medium">
          {entities[0]?.label ?? type}
        </span>
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
          {entities.length}
        </Badge>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="pl-6 space-y-2 mt-1">
          {entities.map((entity) => (
            <EntityCard key={entity.id} entity={entity} />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function EntityList({ entities }: EntityListProps) {
  const grouped: Record<string, GraphEntity[]> = {};
  for (const entity of entities) {
    if (!grouped[entity.type]) grouped[entity.type] = [];
    grouped[entity.type].push(entity);
  }

  if (entities.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        No entities found. Try a different seed value.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {Object.entries(grouped).map(([type, ents]) => (
        <EntityGroup key={type} type={type} entities={ents} />
      ))}
    </div>
  );
}
