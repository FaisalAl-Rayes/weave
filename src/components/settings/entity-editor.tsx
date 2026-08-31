"use client";

import { useState, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ChevronRight,
  Plus,
  Trash2,
  Pencil,
  Info,
  Check,
} from "lucide-react";
import type { WeaveSchema, EntityDef, ReferenceDef, SourcedPath } from "@/lib/schema/types";

const SOURCE_COLORS: Record<string, string> = {
  generic: "#71717a",
  "tekton-pipelines": "#38bdf8",
  "pipelines-as-code": "#f97316",
  konflux: "#a78bfa",
  "cert-manager": "#34d399",
};

function SourceBadge({ source }: { source: string }) {
  const color = SOURCE_COLORS[source] ?? "#71717a";
  return (
    <span
      className="inline-flex items-center rounded px-1 py-0 text-[9px] font-mono shrink-0"
      style={{ background: `${color}18`, color }}
    >
      {source}
    </span>
  );
}

const FORMATS: EntityDef["format"][] = [
  "kubernetes_resource",
  "json",
];

interface EntityEditorProps {
  schema: WeaveSchema;
  onSave: (schema: WeaveSchema) => Promise<void>;
}

function ReferenceRow({
  reference,
  entityNames,
  identifierNames,
  onChange,
  onRemove,
}: {
  reference: ReferenceDef;
  entityNames: string[];
  identifierNames: string[];
  onChange: (ref: ReferenceDef) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Input
        value={reference.field}
        onChange={(e) => onChange({ ...reference, field: e.target.value })}
        placeholder="field path"
        className="h-7 text-xs font-mono flex-1"
      />
      <Select
        value={reference.points_to}
        onValueChange={(v) => onChange({ ...reference, points_to: v })}
      >
        <SelectTrigger className="h-7 text-xs w-32">
          <SelectValue placeholder="Entity" />
        </SelectTrigger>
        <SelectContent>
          {entityNames.map((n) => (
            <SelectItem key={n} value={n}>
              {n}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={reference.as}
        onValueChange={(v) => onChange({ ...reference, as: v })}
      >
        <SelectTrigger className="h-7 text-xs w-32">
          <SelectValue placeholder="Identifier" />
        </SelectTrigger>
        <SelectContent>
          {identifierNames.map((n) => (
            <SelectItem key={n} value={n}>
              {n}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {reference.source && <SourceBadge source={reference.source} />}
      <Button
        variant="ghost"
        size="sm"
        className="h-7 w-7 p-0"
        onClick={onRemove}
      >
        <Trash2 className="h-3 w-3 text-muted-foreground" />
      </Button>
    </div>
  );
}

function EntityForm({
  name: initialName,
  entity: initial,
  schema,
  isNew,
  onSave,
  onCancel,
}: {
  name: string;
  entity: EntityDef;
  schema: WeaveSchema;
  isNew: boolean;
  onSave: (name: string, entity: EntityDef) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [label, setLabel] = useState(initial.label);
  const [format, setFormat] = useState<EntityDef["format"]>(initial.format);
  const [identifiers, setIdentifiers] = useState<Record<string, SourcedPath>>(
    Object.fromEntries(Object.entries(initial.identifiers).map(([k, v]) => [k, { path: v.path, source: v.source }])),
  );
  const [references, setReferences] = useState<ReferenceDef[]>(
    initial.references ? [...initial.references] : [],
  );
  const [display, setDisplay] = useState<Record<string, SourcedPath>>(
    Object.fromEntries(Object.entries(initial.display ?? {}).map(([k, v]) => [k, { path: v.path, source: v.source }])),
  );

  const [newIdKey, setNewIdKey] = useState("");
  const [newIdPath, setNewIdPath] = useState("");
  const [newDispKey, setNewDispKey] = useState("");
  const [newDispPath, setNewDispPath] = useState("");

  const entityNames = Object.keys(schema.entities);
  const identifierNames = Object.keys(schema.identifiers);

  const handleSave = () => {
    const sourcedIdentifiers: Record<string, SourcedPath> = identifiers;
    const sourcedDisplay: Record<string, SourcedPath> | undefined =
      Object.keys(display).length > 0 ? display : undefined;
    const entity: EntityDef = {
      label,
      format,
      identifiers: sourcedIdentifiers,
      references,
      display: sourcedDisplay,
    };
    onSave(name, entity);
  };

  return (
    <div className="space-y-3 border border-border/50 rounded-lg p-4 bg-muted/10">
      <div className="grid grid-cols-[80px_1fr_80px_1fr] gap-2 items-center">
        <Label className="text-xs">Name</Label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={!isNew}
          className="h-7 text-xs font-mono"
        />
        <Label className="text-xs">Label</Label>
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="h-7 text-xs"
        />
      </div>

      <div className="grid grid-cols-[80px_1fr] gap-2 items-center">
        <Label className="text-xs">Format</Label>
        <Select value={format} onValueChange={(v) => setFormat(v as EntityDef["format"])}>
          <SelectTrigger className="h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FORMATS.map((f) => (
              <SelectItem key={f} value={f}>{f}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Identifiers */}
      <div>
        <div className="flex items-center gap-1.5">
          <Label className="text-xs text-muted-foreground">Identifiers</Label>
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-3 w-3 text-muted-foreground/50 cursor-help" />
            </TooltipTrigger>
            <TooltipContent side="right" className="max-w-64 text-xs">
              Map of identifier type to JSONPath within the entity. Used to
              extract identifier values from fetched data and to match queries
              from datasources.
            </TooltipContent>
          </Tooltip>
        </div>
        <div className="space-y-1 mt-1">
          {Object.entries(identifiers).map(([key, val]) => (
            <div key={key} className="flex items-center gap-2">
              <Input value={key} disabled className="h-7 text-xs font-mono w-36" />
              <Input
                value={val.path}
                onChange={(e) =>
                  setIdentifiers((prev) => ({ ...prev, [key]: { ...prev[key], path: e.target.value } }))
                }
                className="h-7 text-xs font-mono flex-1"
              />
              {val.source && <SourceBadge source={val.source} />}
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => {
                  const next = { ...identifiers };
                  delete next[key];
                  setIdentifiers(next);
                }}
              >
                <Trash2 className="h-3 w-3 text-muted-foreground" />
              </Button>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <Input
              value={newIdKey}
              onChange={(e) => setNewIdKey(e.target.value)}
              placeholder="key"
              className="h-7 text-xs font-mono w-36"
            />
            <Input
              value={newIdPath}
              onChange={(e) => setNewIdPath(e.target.value)}
              placeholder="JSONPath"
              className="h-7 text-xs font-mono flex-1"
            />
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              disabled={!newIdKey || !newIdPath}
              onClick={() => {
                setIdentifiers((prev) => ({ ...prev, [newIdKey]: { path: newIdPath } }));
                setNewIdKey("");
                setNewIdPath("");
              }}
            >
              <Plus className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </div>

      {/* References */}
      <div>
        <div className="flex items-center gap-1.5">
          <Label className="text-xs text-muted-foreground">References</Label>
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-3 w-3 text-muted-foreground/50 cursor-help" />
            </TooltipTrigger>
            <TooltipContent side="right" className="max-w-64 text-xs">
              Edges in the graph. Each reference extracts a value from this
              entity and uses it to discover another entity type. The engine
              follows these during BFS traversal.
            </TooltipContent>
          </Tooltip>
        </div>
        <div className="space-y-1 mt-1">
          {references.map((ref, i) => (
            <ReferenceRow
              key={i}
              reference={ref}
              entityNames={entityNames}
              identifierNames={identifierNames}
              onChange={(updated) => {
                const next = [...references];
                next[i] = updated;
                setReferences(next);
              }}
              onRemove={() => setReferences(references.filter((_, j) => j !== i))}
            />
          ))}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={() =>
              setReferences([...references, { field: "", points_to: "", as: "" }])
            }
          >
            <Plus className="h-3 w-3" /> Add Reference
          </Button>
        </div>
      </div>

      {/* Display fields */}
      <div>
        <div className="flex items-center gap-1.5">
          <Label className="text-xs text-muted-foreground">Display Fields</Label>
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-3 w-3 text-muted-foreground/50 cursor-help" />
            </TooltipTrigger>
            <TooltipContent side="right" className="max-w-64 text-xs">
              Fields extracted for rendering in the UI. Keys are display names,
              values are JSONPaths into the entity data. Also used as parameters
              for enrichment queries (e.g., pipeline name for PromQL).
            </TooltipContent>
          </Tooltip>
        </div>
        <div className="space-y-1 mt-1">
          {Object.entries(display).map(([key, val]) => (
            <div key={key} className="flex items-center gap-2">
              <Input value={key} disabled className="h-7 text-xs w-28" />
              <Input
                value={val.path}
                onChange={(e) =>
                  setDisplay((prev) => ({ ...prev, [key]: { ...prev[key], path: e.target.value } }))
                }
                className="h-7 text-xs font-mono flex-1"
              />
              {val.source && <SourceBadge source={val.source} />}
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => {
                  const next = { ...display };
                  delete next[key];
                  setDisplay(next);
                }}
              >
                <Trash2 className="h-3 w-3 text-muted-foreground" />
              </Button>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <Input
              value={newDispKey}
              onChange={(e) => setNewDispKey(e.target.value)}
              placeholder="key"
              className="h-7 text-xs w-28"
            />
            <Input
              value={newDispPath}
              onChange={(e) => setNewDispPath(e.target.value)}
              placeholder="JSONPath"
              className="h-7 text-xs font-mono flex-1"
            />
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              disabled={!newDispKey || !newDispPath}
              onClick={() => {
                setDisplay((prev) => ({ ...prev, [newDispKey]: { path: newDispPath } }));
                setNewDispKey("");
                setNewDispPath("");
              }}
            >
              <Plus className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          className="h-7 text-xs"
          onClick={handleSave}
          disabled={!name || !label || Object.keys(identifiers).length === 0}
        >
          <Check className="h-3 w-3 mr-1" />
          {isNew ? "Add Entity" : "Save"}
        </Button>
      </div>
    </div>
  );
}

export function EntityEditor({ schema, onSave }: EntityEditorProps) {
  const [expandedEntity, setExpandedEntity] = useState<string | null>(null);
  const [editingEntity, setEditingEntity] = useState<string | null>(null);
  const [addingEntity, setAddingEntity] = useState(false);

  const handleSaveEntity = useCallback(
    async (name: string, entity: EntityDef) => {
      const updated = { ...schema, entities: { ...schema.entities, [name]: entity } };
      await onSave(updated);
      setEditingEntity(null);
      setExpandedEntity(null);
      setAddingEntity(false);
    },
    [schema, onSave],
  );

  const handleDeleteEntity = useCallback(
    async (name: string) => {
      const entities = { ...schema.entities };
      delete entities[name];
      await onSave({ ...schema, entities });
    },
    [schema, onSave],
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-medium">Entities</CardTitle>
            <CardDescription>
              Entity types with their identifiers, references, and display fields.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={() => setAddingEntity(true)}
            disabled={addingEntity}
          >
            <Plus className="h-3 w-3" /> Add Entity
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {addingEntity && (
          <EntityForm
            name=""
            entity={{ label: "", format: "json", identifiers: {} }}
            schema={schema}
            isNew
            onSave={handleSaveEntity}
            onCancel={() => setAddingEntity(false)}
          />
        )}

        {Object.entries(schema.entities).map(([name, entity]) => {
          const isExpanded = expandedEntity === name || editingEntity === name;
          const isEditing = editingEntity === name;
          const idCount = Object.keys(entity.identifiers).length;
          const refCount = entity.references?.length ?? 0;
          const dispCount = Object.keys(entity.display ?? {}).length;

          return (
            <Collapsible
              key={name}
              open={isExpanded}
              onOpenChange={(open) => {
                if (!open) {
                  setExpandedEntity(null);
                  setEditingEntity(null);
                } else {
                  setExpandedEntity(name);
                }
              }}
            >
              <div className="flex items-center gap-2 rounded-md border border-border/50 px-3 py-2">
                <CollapsibleTrigger className="cursor-pointer">
                  <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                </CollapsibleTrigger>
                <span className="font-mono text-sm font-medium">{name}</span>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                  {entity.format}
                </Badge>

                {/* Counts summary — shown when collapsed */}
                {!isExpanded && (
                  <div className="flex gap-2 ml-2 text-[10px] text-muted-foreground">
                    <span>{idCount} identifier{idCount !== 1 ? "s" : ""}</span>
                    <span className="text-muted-foreground/30">|</span>
                    <span>{refCount} reference{refCount !== 1 ? "s" : ""}</span>
                    <span className="text-muted-foreground/30">|</span>
                    <span>{dispCount} display field{dispCount !== 1 ? "s" : ""}</span>
                  </div>
                )}

                <div className="ml-auto flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isEditing) {
                        setEditingEntity(null);
                      } else {
                        setExpandedEntity(name);
                        setEditingEntity(name);
                      }
                    }}
                  >
                    <Pencil className={`h-3 w-3 ${isEditing ? "text-primary" : "text-muted-foreground"}`} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => handleDeleteEntity(name)}
                  >
                    <Trash2 className="h-3 w-3 text-muted-foreground" />
                  </Button>
                </div>
              </div>
              <CollapsibleContent>
                {isEditing ? (
                  <EntityForm
                    name={name}
                    entity={entity}
                    schema={schema}
                    isNew={false}
                    onSave={handleSaveEntity}
                    onCancel={() => setEditingEntity(null)}
                  />
                ) : (
                  <div className="ml-8 mt-2 space-y-3 pb-3">
                    {/* Identifiers */}
                    <div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                        Identifiers
                      </div>
                      <div className="space-y-0.5">
                        {Object.entries(entity.identifiers).map(([key, val]) => (
                          <div key={key} className="flex items-center gap-2 text-xs">
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">
                              {key}
                            </Badge>
                            <span className="font-mono text-muted-foreground truncate">
                              {val.path}
                            </span>
                            {val.source && <SourceBadge source={val.source} />}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* References */}
                    <div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                        References
                      </div>
                      {entity.references && entity.references.length > 0 ? (
                        <div className="space-y-0.5">
                          {entity.references.map((ref, i) => (
                            <div key={i} className="flex items-center gap-2 text-xs">
                              <span className="font-mono text-muted-foreground truncate max-w-48">
                                {ref.field}
                              </span>
                              <span className="text-muted-foreground/40">→</span>
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono shrink-0">
                                {ref.points_to}
                              </Badge>
                              <span className="text-[10px] text-muted-foreground/60">
                                by {ref.as}
                              </span>
                              {ref.source && <SourceBadge source={ref.source} />}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground/40">
                          No outgoing references
                        </span>
                      )}
                    </div>

                    {/* Display fields */}
                    <div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                        Display Fields
                      </div>
                      {Object.keys(entity.display ?? {}).length > 0 ? (
                        <div className="space-y-0.5">
                          {Object.entries(entity.display ?? {}).map(([key, val]) => (
                            <div key={key} className="flex items-center gap-2 text-xs">
                              <span className="text-foreground shrink-0 w-24">{key}</span>
                              <span className="font-mono text-muted-foreground truncate">
                                {val.path}
                              </span>
                              {val.source && <SourceBadge source={val.source} />}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground/40">
                          No display fields
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </CardContent>
    </Card>
  );
}
