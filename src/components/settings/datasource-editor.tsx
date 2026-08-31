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
  Check,
  Info,
} from "lucide-react";
import type {
  WeaveSchema,
  DatasourceDef,
  EnrichesEntityDef,
} from "@/lib/schema/types";
import { ProviderIcon } from "@/components/icons/provider-icons";

const PROVIDERS = ["rest", "splunk", "prometheus", "tempo", "kubernetes"];
const SIGNAL_TYPES = ["json", "logs", "metrics", "traces"];

interface DatasourceEditorProps {
  schema: WeaveSchema;
  onSave: (schema: WeaveSchema) => Promise<void>;
}

function ServesEditor({
  serves,
  entityNames,
  onChange,
}: {
  serves: string[];
  entityNames: string[];
  onChange: (serves: string[]) => void;
}) {
  const [newEntity, setNewEntity] = useState("");

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1">
        <Label className="text-xs text-muted-foreground">Serves</Label>
        <Tooltip>
          <TooltipTrigger asChild>
            <Info className="h-3 w-3 text-muted-foreground/50 cursor-help" />
          </TooltipTrigger>
          <TooltipContent side="right" className="max-w-64 text-xs">
            Entity types this datasource can discover via traversal. Query
            logic is defined on the entity&apos;s k8s config and the provider.
          </TooltipContent>
        </Tooltip>
      </div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {serves.map((entityType) => (
          <div key={entityType} className="flex items-center gap-1 rounded border border-border/50 px-2 py-0.5">
            <Badge variant="secondary" className="text-[10px] px-1 py-0 border-0">
              {entityType}
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              className="h-4 w-4 p-0"
              onClick={() => onChange(serves.filter((e) => e !== entityType))}
            >
              <Trash2 className="h-2.5 w-2.5 text-muted-foreground" />
            </Button>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <Select value={newEntity} onValueChange={setNewEntity}>
          <SelectTrigger className="h-7 text-xs flex-1">
            <SelectValue placeholder="Add entity..." />
          </SelectTrigger>
          <SelectContent>
            {entityNames
              .filter((n) => !serves.includes(n))
              .map((n) => (
                <SelectItem key={n} value={n}>{n}</SelectItem>
              ))}
          </SelectContent>
        </Select>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          disabled={!newEntity}
          onClick={() => {
            onChange([...serves, newEntity]);
            setNewEntity("");
          }}
        >
          <Plus className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

function EnrichesEditor({
  enriches,
  entityNames,
  onChange,
}: {
  enriches: Record<string, EnrichesEntityDef>;
  entityNames: string[];
  onChange: (enriches: Record<string, EnrichesEntityDef>) => void;
}) {
  const [newEntity, setNewEntity] = useState("");

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1">
        <Label className="text-xs text-muted-foreground">Enriches</Label>
        <Tooltip>
          <TooltipTrigger asChild>
            <Info className="h-3 w-3 text-muted-foreground/50 cursor-help" />
          </TooltipTrigger>
          <TooltipContent side="right" className="max-w-64 text-xs">
            On-demand enrichment queries. Does not drive traversal — adds
            metrics, logs, or traces to entities already discovered.
          </TooltipContent>
        </Tooltip>
      </div>
      <div className="space-y-2">
        {Object.entries(enriches).map(([entityType, enrichDef]) => (
          <div key={entityType} className="rounded border border-border/50 p-2 space-y-1">
            <div className="flex items-center justify-between">
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                {entityType}
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0"
                onClick={() => {
                  const next = { ...enriches };
                  delete next[entityType];
                  onChange(next);
                }}
              >
                <Trash2 className="h-2.5 w-2.5 text-muted-foreground" />
              </Button>
            </div>
            <textarea
              value={JSON.stringify(enrichDef, null, 2)}
              onChange={(e) => {
                try {
                  const parsed = JSON.parse(e.target.value);
                  onChange({ ...enriches, [entityType]: parsed });
                } catch {
                  // Invalid JSON
                }
              }}
              className="w-full h-20 bg-transparent text-[10px] font-mono p-1.5 rounded border border-border/30 resize-y outline-none"
              spellCheck={false}
            />
          </div>
        ))}
        <div className="flex items-center gap-2">
          <Select value={newEntity} onValueChange={setNewEntity}>
            <SelectTrigger className="h-7 text-xs flex-1">
              <SelectValue placeholder="Add entity..." />
            </SelectTrigger>
            <SelectContent>
              {entityNames
                .filter((n) => !(n in enriches))
                .map((n) => (
                  <SelectItem key={n} value={n}>{n}</SelectItem>
                ))}
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            disabled={!newEntity}
            onClick={() => {
              onChange({
                ...enriches,
                [newEntity]: { queries: {} },
              });
              setNewEntity("");
            }}
          >
            <Plus className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function DatasourceForm({
  name: initialName,
  datasource: initial,
  schema,
  isNew,
  onSave,
  onCancel,
}: {
  name: string;
  datasource: DatasourceDef;
  schema: WeaveSchema;
  isNew: boolean;
  onSave: (name: string, ds: DatasourceDef) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [provider, setProvider] = useState(initial.provider);
  const [types, setTypes] = useState<string[]>([...initial.types]);
  const [url, setUrl] = useState(initial.connection.url);
  const [authType, setAuthType] = useState(initial.connection.auth?.type ?? "none");
  const [serves, setServes] = useState<string[]>(
    initial.serves ? [...initial.serves] : [],
  );
  const [enriches, setEnriches] = useState<Record<string, EnrichesEntityDef>>(
    initial.enriches ? { ...initial.enriches } : {},
  );

  const entityNames = Object.keys(schema.entities);

  const handleSave = () => {
    const ds: DatasourceDef = {
      provider,
      types,
      connection: {
        url,
        auth: authType !== "none" ? { type: authType } : undefined,
      },
      serves: serves.length > 0 ? serves : undefined,
      enriches: Object.keys(enriches).length > 0 ? enriches : undefined,
    };
    onSave(name, ds);
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
        <Label className="text-xs">Provider</Label>
        <Select value={provider} onValueChange={setProvider}>
          <SelectTrigger className="h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PROVIDERS.map((p) => (
              <SelectItem key={p} value={p}>{p}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-[80px_1fr] gap-2 items-center">
        <Label className="text-xs">Types</Label>
        <div className="flex gap-1">
          {SIGNAL_TYPES.map((t) => (
            <Button
              key={t}
              variant={types.includes(t) ? "default" : "outline"}
              size="sm"
              className="h-6 text-[10px] px-2"
              onClick={() =>
                setTypes((prev) =>
                  prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t],
                )
              }
            >
              {t}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-[80px_1fr] gap-2 items-center">
        <Label className="text-xs">URL</Label>
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://... or ${ENV_VAR}"
          className="h-7 text-xs font-mono"
        />
      </div>

      <div className="grid grid-cols-[80px_1fr] gap-2 items-center">
        <Label className="text-xs">Auth</Label>
        <Select value={authType} onValueChange={setAuthType}>
          <SelectTrigger className="h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None</SelectItem>
            <SelectItem value="basic">Basic</SelectItem>
            <SelectItem value="bearer">Bearer</SelectItem>
            <SelectItem value="apikey">API Key</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <ServesEditor serves={serves} entityNames={entityNames} onChange={setServes} />
      <EnrichesEditor enriches={enriches} entityNames={entityNames} onChange={setEnriches} />

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          className="h-7 text-xs"
          onClick={handleSave}
          disabled={!name || !provider || types.length === 0 || !url}
        >
          <Check className="h-3 w-3 mr-1" />
          {isNew ? "Add Datasource" : "Save"}
        </Button>
      </div>
    </div>
  );
}

export function DatasourceEditor({ schema, onSave }: DatasourceEditorProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const handleSaveDatasource = useCallback(
    async (name: string, ds: DatasourceDef) => {
      const updated = { ...schema, datasources: { ...schema.datasources, [name]: ds } };
      await onSave(updated);
      setEditing(null);
      setExpanded(null);
      setAdding(false);
    },
    [schema, onSave],
  );

  const handleDelete = useCallback(
    async (name: string) => {
      const datasources = { ...schema.datasources };
      delete datasources[name];
      await onSave({ ...schema, datasources });
    },
    [schema, onSave],
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-medium">
              Datasource Definitions
            </CardTitle>
            <CardDescription>
              Schema definitions for datasources — provider, types, serves, and enriches.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={() => setAdding(true)}
            disabled={adding}
          >
            <Plus className="h-3 w-3" /> Add Datasource
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {adding && (
          <DatasourceForm
            name=""
            datasource={{
              provider: "rest",
              types: ["json"],
              connection: { url: "" },
            }}
            schema={schema}
            isNew
            onSave={handleSaveDatasource}
            onCancel={() => setAdding(false)}
          />
        )}

        {Object.entries(schema.datasources).map(([name, ds]) => {
          const isExpanded = expanded === name || editing === name;
          const isEditing = editing === name;
          const servesCount = (ds.serves ?? []).length;
          const enrichesCount = Object.keys(ds.enriches ?? {}).length;

          return (
            <Collapsible
              key={name}
              open={isExpanded}
              onOpenChange={(open) => {
                if (!open) {
                  setExpanded(null);
                  setEditing(null);
                } else {
                  setExpanded(name);
                }
              }}
            >
              <div className="flex items-center gap-2 rounded-md border border-border/50 px-3 py-2">
                <CollapsibleTrigger className="cursor-pointer">
                  <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                </CollapsibleTrigger>
                <span className="font-mono text-sm font-medium">{name}</span>
                <Badge variant="outline" className="gap-1 text-[10px] px-1.5 py-0">
                  <ProviderIcon provider={ds.provider} className="h-3 w-3" />
                  {ds.provider}
                </Badge>
                {ds.types.map((t) => (
                  <Badge key={t} variant="secondary" className="text-[10px] px-1.5 py-0">
                    {t}
                  </Badge>
                ))}

                {!isExpanded && (
                  <div className="flex gap-2 ml-2 text-[10px] text-muted-foreground">
                    <span>{servesCount} serve{servesCount !== 1 ? "s" : ""}</span>
                    <span className="text-muted-foreground/30">|</span>
                    <span>{enrichesCount} enrich{enrichesCount !== 1 ? "es" : ""}</span>
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
                        setEditing(null);
                      } else {
                        setExpanded(name);
                        setEditing(name);
                      }
                    }}
                  >
                    <Pencil className={`h-3 w-3 ${isEditing ? "text-primary" : "text-muted-foreground"}`} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => handleDelete(name)}
                  >
                    <Trash2 className="h-3 w-3 text-muted-foreground" />
                  </Button>
                </div>
              </div>
              <CollapsibleContent>
                {isEditing ? (
                  <DatasourceForm
                    name={name}
                    datasource={ds}
                    schema={schema}
                    isNew={false}
                    onSave={handleSaveDatasource}
                    onCancel={() => setEditing(null)}
                  />
                ) : (
                  <div className="ml-8 mt-2 space-y-3 pb-3">
                    <div className="text-xs font-mono text-muted-foreground">
                      url: {ds.connection.url}
                    </div>
                    {ds.serves && ds.serves.length > 0 && (
                      <div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Serves</div>
                        <div className="flex flex-wrap gap-1">
                          {ds.serves.map((e) => (
                            <Badge key={e} variant="outline" className="text-[10px] px-1.5 py-0 font-mono">{e}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
                    {ds.enriches && Object.keys(ds.enriches).length > 0 && (
                      <div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Enriches</div>
                        <div className="flex flex-wrap gap-1">
                          {Object.keys(ds.enriches).map((e) => (
                            <Badge key={e} variant="outline" className="text-[10px] px-1.5 py-0 font-mono">{e}</Badge>
                          ))}
                        </div>
                      </div>
                    )}
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
