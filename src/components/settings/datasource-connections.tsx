"use client";

import { useState, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  ChevronRight,
  Loader2,
  Check,
  X,
  Zap,
} from "lucide-react";
import { ProviderIcon } from "@/components/icons/provider-icons";
import { useDatasources } from "@/hooks/use-explore";

interface DatasourceInfo {
  name: string;
  provider: string;
  types: string[];
  serves: string[];
  enriches: string[];
  connection: {
    schemaUrl: string;
    resolvedUrl: string | null;
    effectiveUrl: string | null;
    authType: string;
    hasOverride: boolean;
    overrideUrl: string | null;
    overrideAuth: {
      type: string;
      username?: string;
      password?: string;
      token?: string;
    } | null;
  };
}

interface HealthResult {
  healthy: boolean;
  message: string;
}

function DatasourceConnectionCard({
  ds,
  onUpdate,
  projectId,
}: {
  ds: DatasourceInfo;
  onUpdate: () => void;
  projectId: string;
}) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState(ds.connection.overrideUrl ?? ds.connection.effectiveUrl ?? "");
  const [authType, setAuthType] = useState(ds.connection.overrideAuth?.type ?? ds.connection.authType);
  const [username, setUsername] = useState(ds.connection.overrideAuth?.username ?? "");
  const [password, setPassword] = useState(ds.connection.overrideAuth?.password ?? "");
  const [token, setToken] = useState(ds.connection.overrideAuth?.token ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [health, setHealth] = useState<HealthResult | null>(null);

  const handleSave = useCallback(async () => {
    setSaving(true);
    const auth: Record<string, unknown> = { type: authType };
    if (authType === "basic") { auth.username = username; auth.password = password; }
    else if (authType === "bearer") { auth.token = token; }

    const res = await fetch("/api/datasources", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, name: ds.name, url: url || undefined, auth }),
    });
    setSaving(false);
    if (!res.ok) return;
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
    onUpdate();
  }, [ds.name, url, authType, username, password, token, onUpdate, projectId]);

  const handleTest = useCallback(async () => {
    setTesting(true);
    setHealth(null);
    let testAuth: Record<string, unknown> | undefined;
    if (authType === "basic" && (username || password)) {
      testAuth = { type: authType, username, password };
    } else if (authType === "bearer" && token) {
      testAuth = { type: authType, token };
    }

    try {
      const res = await fetch("/api/datasources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          name: ds.name,
          url: url || undefined,
          auth: testAuth,
        }),
      });
      setHealth(await res.json());
    } catch {
      setHealth({ healthy: false, message: "Request failed" });
    }
    setTesting(false);
  }, [ds.name, url, authType, username, password, token, projectId]);

  return (
    <div className="rounded-lg border border-border/50 overflow-hidden">
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex items-center gap-3 px-4 py-3">
          <CollapsibleTrigger className="cursor-pointer">
            <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`} />
          </CollapsibleTrigger>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="font-mono text-sm font-medium">{ds.name}</span>
            <Badge variant="outline" className="gap-1 text-[10px] px-1.5 py-0">
              <ProviderIcon provider={ds.provider} className="h-3.5 w-3.5" />{ds.provider}
            </Badge>
            {ds.types.map((t) => (
              <Badge key={t} variant="secondary" className="text-[10px] px-1.5 py-0">{t}</Badge>
            ))}
          </div>
          <div className="flex items-center gap-2">
            {health && (
              <Badge variant="outline" className={`gap-1 text-[10px] px-1.5 py-0 ${health.healthy ? "text-emerald-400 border-emerald-500/30" : "text-red-400 border-red-500/30"}`}>
                {health.healthy ? <Check className="h-2.5 w-2.5" /> : <X className="h-2.5 w-2.5" />}
                {health.message.slice(0, 30)}
              </Badge>
            )}
            <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={handleTest} disabled={testing}>
              {testing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />} Test
            </Button>
          </div>
        </div>
        <CollapsibleContent>
          <div className="border-t border-border/50 px-4 py-3 space-y-3 bg-muted/20">
            <div className="grid grid-cols-[100px_1fr] gap-2 items-center">
              <Label className="text-xs text-muted-foreground">Schema URL</Label>
              <code className="text-xs text-muted-foreground font-mono truncate">{ds.connection.schemaUrl}</code>
            </div>
            <div className="grid grid-cols-[100px_1fr] gap-2 items-center">
              <Label className="text-xs">URL Override</Label>
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={ds.connection.resolvedUrl ?? ds.connection.schemaUrl} className="h-8 text-xs font-mono" />
            </div>
            <div className="grid grid-cols-[100px_1fr] gap-2 items-center">
              <Label className="text-xs">Auth Type</Label>
              <Select value={authType} onValueChange={setAuthType}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="basic">Basic (user/pass)</SelectItem>
                  <SelectItem value="bearer">Bearer Token</SelectItem>
                  <SelectItem value="apikey">API Key</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {authType === "basic" && (
              <>
                <div className="grid grid-cols-[100px_1fr] gap-2 items-center">
                  <Label className="text-xs">Username</Label>
                  <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="admin" className="h-8 text-xs" />
                </div>
                <div className="grid grid-cols-[100px_1fr] gap-2 items-center">
                  <Label className="text-xs">Password</Label>
                  <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="h-8 text-xs" />
                </div>
              </>
            )}
            {authType === "bearer" && (
              <div className="grid grid-cols-[100px_1fr] gap-2 items-center">
                <Label className="text-xs">Token</Label>
                <Input type="password" value={token} onChange={(e) => setToken(e.target.value)} className="h-8 text-xs font-mono" />
              </div>
            )}
            <div className="flex justify-end items-center gap-2 pt-1">
              {saved && <span className="text-xs text-emerald-400 flex items-center gap-1"><Check className="h-3 w-3" /> Saved</span>}
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null} Save & Set Live
              </Button>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

export function DatasourceConnectionPanel({ projectId }: { projectId: string }) {
  const { data, isLoading, mutate } = useDatasources(projectId);
  const handleUpdate = useCallback(() => mutate(), [mutate]);

  if (isLoading) {
    return <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}</div>;
  }

  const datasources: DatasourceInfo[] = data?.datasources ?? [];
  if (datasources.length === 0) {
    return <p className="text-sm text-muted-foreground">No datasources configured in schema.</p>;
  }

  return (
    <div className="space-y-2">
      {datasources.map((ds) => <DatasourceConnectionCard key={ds.name} ds={ds} onUpdate={handleUpdate} projectId={projectId} />)}
    </div>
  );
}
