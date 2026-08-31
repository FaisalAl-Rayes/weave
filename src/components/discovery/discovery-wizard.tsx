"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  Search,
  Check,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  AlertCircle,
} from "lucide-react";
import { useDatasources } from "@/hooks/use-explore";

interface ResourceTypeInfo {
  apiVersion: string;
  kind: string;
  group: string;
  resource: string;
}

interface Correlation {
  source: string;
  target: string;
  signal: string;
  confidence: number;
  evidence: {
    sourceField: string;
    targetField: string;
    matchedValues: string[];
    matchRatio: number;
  };
}

type Step = "datasource" | "types" | "namespaces" | "analyze" | "review";

interface DiscoveryWizardProps {
  projectId: string;
  onImport: (schemaYaml: string) => Promise<void> | void;
}

export function DiscoveryWizard({ projectId, onImport }: DiscoveryWizardProps) {
  const [step, setStep] = useState<Step>("datasource");
  const [selectedDatasource, setSelectedDatasource] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState(false);

  const { data: dsData } = useDatasources(projectId);
  const allDatasources: { name: string; provider: string }[] =
    dsData?.datasources ?? [];
  const k8sDatasources = allDatasources.filter(
    (ds) => ds.provider === "kubernetes",
  );

  // Step 2: resource types
  const [resourceTypes, setResourceTypes] = useState<ResourceTypeInfo[]>([]);
  const [selectedKinds, setSelectedKinds] = useState<Set<string>>(new Set());

  // Step 3: namespaces
  const [allNamespaces, setAllNamespaces] = useState<string[]>([]);
  const [selectedNamespaces, setSelectedNamespaces] = useState<Set<string>>(new Set());
  const [useGenericAnalyzers, setUseGenericAnalyzers] = useState(false);

  // Step 5: results
  const [correlations, setCorrelations] = useState<Correlation[]>([]);
  const [proposedSchema, setProposedSchema] = useState("");
  const [activePlugins, setActivePlugins] = useState<string[]>([]);
  const [stats, setStats] = useState<{
    typesAnalyzed: number;
    totalInstances: number;
    correlationsFound: number;
  } | null>(null);

  const handleEnumerate = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ projectId, datasource: selectedDatasource, action: "enumerate" });
      const res = await fetch(`/api/discovery?${params}`);
      if (!res.ok) { const { error } = await res.json(); throw new Error(error ?? `${res.status}`); }
      const data = await res.json();
      setResourceTypes(data.resourceTypes);
      setSelectedKinds(new Set(data.resourceTypes.map((r: ResourceTypeInfo) => r.kind)));
      setStep("types");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [projectId, selectedDatasource]);

  const handleLoadNamespaces = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ projectId, datasource: selectedDatasource, action: "namespaces" });
      const res = await fetch(`/api/discovery?${params}`);
      if (!res.ok) { const { error } = await res.json(); throw new Error(error ?? `${res.status}`); }
      const data = await res.json();
      setAllNamespaces(data.namespaces);
      setSelectedNamespaces(new Set());
      setStep("namespaces");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [projectId, selectedDatasource]);

  const handleAnalyze = useCallback(async () => {
    setLoading(true);
    setError(null);
    setImported(false);
    setStep("analyze");
    try {
      const res = await fetch("/api/discovery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          datasource: selectedDatasource,
          namespaces: Array.from(selectedNamespaces),
          selectedKinds: Array.from(selectedKinds),
          useGenericAnalyzers,
        }),
      });
      if (!res.ok) { const { error } = await res.json(); throw new Error(error ?? `${res.status}`); }
      const data = await res.json();
      setCorrelations(data.correlations);
      setProposedSchema(data.proposedSchema);
      setActivePlugins(data.activePlugins ?? []);
      setStats(data.stats);
      setStep("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStep("namespaces");
    } finally {
      setLoading(false);
    }
  }, [projectId, selectedDatasource, selectedNamespaces, selectedKinds, useGenericAnalyzers]);

  const toggleKind = (kind: string) => {
    setSelectedKinds((prev) => { const n = new Set(prev); if (n.has(kind)) n.delete(kind); else n.add(kind); return n; });
  };
  const toggleNamespace = (ns: string) => {
    setSelectedNamespaces((prev) => { const n = new Set(prev); if (n.has(ns)) n.delete(ns); else n.add(ns); return n; });
  };

  const signalColor: Record<string, string> = {
    owner_ref: "text-emerald-400 border-emerald-500/30",
    label_selector: "text-blue-400 border-blue-500/30",
    shared_label: "text-amber-400 border-amber-500/30",
    field_ref: "text-purple-400 border-purple-500/30",
    name_pattern: "text-zinc-400 border-zinc-500/30",
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Sparkles className="h-4 w-4" />
          Schema Discovery
        </CardTitle>
        <CardDescription>
          Analyze a Kubernetes cluster to automatically discover resource types and their correlations.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="flex items-start gap-2 text-xs text-destructive bg-destructive/10 rounded-md px-3 py-2">
            <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Step 1: Select datasource */}
        {step === "datasource" && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <span className="text-xs text-muted-foreground">Kubernetes Datasource</span>
              {k8sDatasources.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No Kubernetes datasources in live mode. Configure one in the Connections tab.
                </p>
              ) : (
                <Select value={selectedDatasource} onValueChange={setSelectedDatasource}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select a datasource..." /></SelectTrigger>
                  <SelectContent>
                    {k8sDatasources.map((ds) => (
                      <SelectItem key={ds.name} value={ds.name}>{ds.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <Button size="sm" className="w-full" onClick={handleEnumerate} disabled={loading || !selectedDatasource}>
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Search className="h-3.5 w-3.5 mr-1.5" />}
              Scan Resource Types
            </Button>
          </div>
        )}

        {/* Step 2: Select resource types */}
        {step === "types" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">{resourceTypes.length} resource types found.</p>
              <div className="flex gap-1.5">
                <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2"
                  onClick={() => setSelectedKinds(new Set(resourceTypes.map((r) => r.kind)))}>All</Button>
                <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2"
                  onClick={() => setSelectedKinds(new Set())}>None</Button>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-48 overflow-auto">
              {resourceTypes.map((rt) => (
                <button key={`${rt.apiVersion}/${rt.kind}`} onClick={() => toggleKind(rt.kind)}
                  className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition-colors cursor-pointer ${
                    selectedKinds.has(rt.kind) ? "bg-primary/10 border-primary/30 text-foreground" : "border-border/40 text-muted-foreground hover:border-border"
                  }`}>
                  {selectedKinds.has(rt.kind) && <Check className="h-2.5 w-2.5" />}
                  {rt.kind} <span className="text-muted-foreground/60">{rt.group || "core"}</span>
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setStep("datasource")}>
                <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back
              </Button>
              <Button size="sm" className="flex-1" onClick={handleLoadNamespaces} disabled={selectedKinds.size < 2 || loading}>
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                Select Namespaces <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Select namespaces */}
        {step === "namespaces" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">{allNamespaces.length} namespaces. Select which to sample from.</p>
              <div className="flex gap-1.5">
                <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2"
                  onClick={() => setSelectedNamespaces(new Set(allNamespaces))}>All</Button>
                <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2"
                  onClick={() => setSelectedNamespaces(new Set())}>None</Button>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-48 overflow-auto">
              {allNamespaces.map((ns) => (
                <button key={ns} onClick={() => toggleNamespace(ns)}
                  className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-mono transition-colors cursor-pointer ${
                    selectedNamespaces.has(ns) ? "bg-primary/10 border-primary/30 text-foreground" : "border-border/40 text-muted-foreground hover:border-border"
                  }`}>
                  {selectedNamespaces.has(ns) && <Check className="h-2.5 w-2.5" />}
                  {ns}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => setUseGenericAnalyzers((p) => !p)}
                className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border transition-colors ${
                  useGenericAnalyzers ? "bg-primary border-primary" : "bg-muted border-border"
                }`}
              >
                <span className={`inline-block h-3 w-3 rounded-full bg-background transition-transform ${
                  useGenericAnalyzers ? "translate-x-3" : "translate-x-0.5"
                } mt-px`} />
              </button>
              <span className="text-[11px] text-muted-foreground">
                Include generic analyzers
              </span>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setStep("types")}>
                <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back
              </Button>
              <Button size="sm" className="flex-1" onClick={handleAnalyze} disabled={selectedNamespaces.size === 0}>
                Analyze {selectedKinds.size} types in {selectedNamespaces.size} namespaces
                <ArrowRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 4: Analyzing */}
        {step === "analyze" && (
          <div className="flex flex-col items-center justify-center py-8 gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Sampling resources and analyzing correlations...</p>
          </div>
        )}

        {/* Step 5: Review */}
        {step === "review" && (
          <div className="space-y-4">
            {stats && (
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="text-[10px]">{stats.typesAnalyzed} types</Badge>
                <Badge variant="outline" className="text-[10px]">{stats.totalInstances} instances</Badge>
                <Badge variant="outline" className="text-[10px] text-emerald-400 border-emerald-500/30">
                  {stats.correlationsFound} correlations
                </Badge>
                {activePlugins.map((p) => (
                  <Badge key={p} variant="outline" className="text-[10px] text-blue-400 border-blue-500/30">{p}</Badge>
                ))}
              </div>
            )}
            <div className="space-y-1.5">
              <p className="text-xs font-medium">Detected Correlations</p>
              <div className="space-y-1 max-h-64 overflow-auto">
                {correlations.map((corr, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-md border border-border/40 px-3 py-2 text-xs">
                    <span className="font-medium">{corr.source}</span>
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                    <span className="font-medium">{corr.target}</span>
                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${signalColor[corr.signal] ?? ""}`}>
                      {corr.signal.replace(/_/g, " ")}
                    </Badge>
                    <span className="ml-auto text-muted-foreground tabular-nums">{Math.round(corr.confidence * 100)}%</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-medium">Proposed Schema</p>
              <pre className="text-[11px] font-mono bg-muted/50 rounded-md p-3 overflow-auto max-h-64 whitespace-pre-wrap">{proposedSchema}</pre>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setStep("namespaces")}>
                <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back
              </Button>
              <Button size="sm" className="flex-1" disabled={importing || imported}
                onClick={async () => {
                  setImporting(true);
                  try { await onImport(proposedSchema); setImported(true); }
                  catch { setError("Failed to import schema"); }
                  finally { setImporting(false); }
                }}>
                {imported ? (<><Check className="h-3.5 w-3.5 mr-1.5" /> Schema Imported</>) :
                 importing ? (<><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Importing...</>) :
                 (<><Sparkles className="h-3.5 w-3.5 mr-1.5" /> Import Schema to Project</>)}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
