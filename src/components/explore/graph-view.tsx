"use client";

import { useMemo, useState, useCallback } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Panel,
  type Node,
  type Edge,
  type NodeTypes,
  type NodeProps,
  Handle,
  Position,
  ReactFlowProvider,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "dagre";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight } from "lucide-react";
import { EnrichmentPanel } from "./enrichment/enrichment-panel";
import type { GraphEntity, GraphEdge } from "@/lib/engine/types";
import type { WeaveSchema } from "@/lib/schema/types";
import { EntityCard } from "./entity-card";

// ============================================================
// Types
// ============================================================

interface GraphViewProps {
  entities: GraphEntity[];
  edges: GraphEdge[];
  seedIdentifierType: string;
  seedValue: string;
  schema: WeaveSchema | null;
  enrichments: Record<string, Record<string, unknown>>;
  onRunEnrichment: (
    entityId: string,
    datasource: string,
    queryName: string,
    as: string,
    timeRange?: { start: string; end: string },
    pagination?: { sid?: string; offset?: number; fetchAll?: boolean },
  ) => Promise<void>;
}

interface GroupInfo {
  type: string;
  entities: GraphEntity[];
  statusCounts: Record<string, number>;
  nodeId: string;
}

// ============================================================
// Color system
// ============================================================

const NODE_COLORS: Record<string, { bg: string; border: string; text: string; hex: string }> = {
  PipelineRun: { bg: "bg-sky-950/80", border: "border-sky-500/50", text: "text-sky-400", hex: "#38bdf8" },
  TaskRun:     { bg: "bg-violet-950/80", border: "border-violet-500/50", text: "text-violet-400", hex: "#8b5cf6" },
  Snapshot:    { bg: "bg-teal-950/80", border: "border-teal-500/50", text: "text-teal-400", hex: "#2dd4bf" },
  ConfigMap:   { bg: "bg-amber-950/80", border: "border-amber-500/50", text: "text-amber-400", hex: "#fbbf24" },
};

const DEFAULT_NODE = { bg: "bg-zinc-900/80", border: "border-zinc-600/50", text: "text-zinc-400", hex: "#71717a" };

const DATASOURCE_COLORS: Record<string, { stroke: string; label: string; dot: string }> = {
  "my-kubearchive": { stroke: "#38bdf8", label: "#7dd3fc", dot: "bg-sky-400" },
  "my-splunk":      { stroke: "#fb923c", label: "#fdba74", dot: "bg-orange-400" },
  "my-prometheus":  { stroke: "#fbbf24", label: "#fde68a", dot: "bg-amber-400" },
  "my-tempo":       { stroke: "#a78bfa", label: "#c4b5fd", dot: "bg-violet-400" },
  "my-kubernetes":  { stroke: "#fbbf24", label: "#fde68a", dot: "bg-amber-400" },
};

const DEFAULT_DATASOURCE = { stroke: "#71717a", label: "#a1a1aa", dot: "bg-zinc-400" };
const SEED_COLOR = "#e879f9";
const GROUP_THRESHOLD = 3; // min entities of same type to group

const STATUS_DOT: Record<string, string> = {
  Succeeded:  "bg-emerald-400",
  succeeded:  "bg-emerald-400",
  True:       "bg-emerald-400",
  Failed:     "bg-red-400",
  failed:     "bg-red-400",
  False:      "bg-red-400",
  Error:      "bg-red-400",
  Running:    "bg-blue-400",
  running:    "bg-blue-400",
  Pending:    "bg-amber-400",
  pending:    "bg-amber-400",
  Skipped:    "bg-zinc-500",
};

function getDatasourceColor(name: string) {
  return DATASOURCE_COLORS[name] ?? DEFAULT_DATASOURCE;
}

function getStatusDot(entity: GraphEntity): string {
  return STATUS_DOT[entity.status ?? ""] ?? "bg-zinc-500";
}

// ============================================================
// Seed Node
// ============================================================

type SeedNodeData = { identifierType: string; value: string };

function SeedNode({ data }: NodeProps<Node<SeedNodeData>>) {
  return (
    <>
      <div
        className="rounded-xl px-5 py-3 text-center"
        style={{
          border: `2px solid ${SEED_COLOR}55`,
          background: `${SEED_COLOR}10`,
          boxShadow: `0 0 20px ${SEED_COLOR}15`,
        }}
      >
        <div className="text-[10px] font-semibold uppercase tracking-[0.15em] mb-1" style={{ color: `${SEED_COLOR}cc` }}>
          seed
        </div>
        <div className="text-xs font-mono text-foreground">{data.value}</div>
        <div className="text-[10px] text-muted-foreground mt-0.5">{data.identifierType}</div>
      </div>
      <Handle type="source" position={Position.Bottom} style={{ background: SEED_COLOR, border: `1px solid ${SEED_COLOR}`, width: 8, height: 8 }} />
    </>
  );
}

// ============================================================
// Entity Node
// ============================================================

type EntityNodeData = { entity: GraphEntity; selected: boolean };

function EntityNode({ data }: NodeProps<Node<EntityNodeData>>) {
  const { entity, selected } = data;
  const colors = NODE_COLORS[entity.type] ?? DEFAULT_NODE;
  const primaryId = Object.values(entity.identifiers)[0] ?? "";
  const statusDot = getStatusDot(entity);
  const providerColor = getDatasourceColor(entity.discoveredBy[0] ?? "");

  return (
    <>
      <Handle type="target" position={Position.Top} className="!bg-zinc-600 !border-zinc-500 !w-2 !h-2" />
      <div
        className={`rounded-lg border px-3 py-2 min-w-[180px] max-w-[280px] transition-all ${colors.bg} ${colors.border} ${
          selected ? "ring-2 ring-white/30 shadow-lg shadow-white/5" : ""
        }`}
      >
        <div className="flex items-center gap-2 mb-1">
          <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusDot}`} />
          <span className={`text-[10px] font-semibold uppercase tracking-wider ${colors.text}`}>
            {entity.type}
          </span>
          {entity.display.pipeline_type != null && (
            <Badge variant="outline" className="ml-auto text-[9px] px-1 py-0 h-4">
              {String(entity.display.pipeline_type)}
            </Badge>
          )}
        </div>
        <div className="text-[11px] font-mono truncate text-foreground">{primaryId}</div>
        {entity.display.task != null && (
          <div className="text-[10px] text-muted-foreground truncate mt-0.5">
            {String(entity.display.task)}
          </div>
        )}
        <div className="flex items-center gap-1.5 mt-1.5 pt-1 border-t border-white/5">
          <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${providerColor.dot}`} />
          <span className="text-[9px] font-mono text-muted-foreground">{entity.discoveredBy.join(", ")}</span>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-zinc-600 !border-zinc-500 !w-2 !h-2" />
    </>
  );
}

// ============================================================
// Group Node — collapsed view of multiple entities
// ============================================================

type GroupNodeData = {
  group: GroupInfo;
  selected: boolean;
  expanded: boolean;
};

function GroupNode({ data }: NodeProps<Node<GroupNodeData>>) {
  const { group, selected } = data;
  const colors = NODE_COLORS[group.type] ?? DEFAULT_NODE;
  const hex = NODE_COLORS[group.type]?.hex ?? DEFAULT_NODE.hex;
  const total = group.entities.length;
  const succeeded = group.statusCounts["succeeded"] ?? 0;
  const failed = group.statusCounts["failed"] ?? 0;
  const other = total - succeeded - failed;

  return (
    <>
      <Handle type="target" position={Position.Top} className="!bg-zinc-600 !border-zinc-500 !w-2 !h-2" style={{ zIndex: 10 }} />
      <div className="relative" style={{ width: 212, height: 78 }}>
        {/* Back card — brightest */}
        <div
          className="absolute rounded-lg"
          style={{
            width: 200, height: 65,
            top: 10, left: 8,
            border: `1.5px solid ${hex}55`,
            background: `color-mix(in srgb, ${hex} 18%, #09090b)`,
          }}
        />
        {/* Middle card */}
        <div
          className="absolute rounded-lg"
          style={{
            width: 200, height: 65,
            top: 5, left: 4,
            border: `1.5px solid ${hex}45`,
            background: `color-mix(in srgb, ${hex} 12%, #09090b)`,
          }}
        />
        {/* Front card */}
        <div
          className={`absolute rounded-lg px-3 py-2.5 ${
            selected ? "ring-2 ring-white/30 shadow-lg shadow-white/5" : ""
          }`}
          style={{
            width: 200, height: 65,
            top: 0, left: 0,
            border: `1.5px solid ${hex}40`,
            background: `color-mix(in srgb, ${hex} 8%, #09090b)`,
          }}
        >
          <div className="flex items-center gap-2 mb-1.5">
            <span className={`text-[10px] font-semibold uppercase tracking-wider ${colors.text}`}>
              {group.type}
            </span>
            <span className="ml-auto text-[11px] font-semibold text-foreground">
              {total}
            </span>
          </div>
          <div className="flex items-center gap-2.5 text-[10px] text-muted-foreground">
            {succeeded > 0 && (
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                {succeeded}
              </span>
            )}
            {failed > 0 && (
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                {failed}
              </span>
            )}
            {other > 0 && (
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 shrink-0" />
                {other}
              </span>
            )}
          </div>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-zinc-600 !border-zinc-500 !w-2 !h-2" style={{ zIndex: 10 }} />
    </>
  );
}

const nodeTypes: NodeTypes = { seed: SeedNode, entity: EntityNode, group: GroupNode };

// ============================================================
// Legend
// ============================================================

function GraphLegend({ providers }: { providers: Set<string> }) {
  const nodeEntries = Object.entries(NODE_COLORS);
  const providerEntries = Object.entries(DATASOURCE_COLORS).filter(([name]) => providers.has(name));

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border/50 bg-zinc-950/90 backdrop-blur-sm px-3 py-2.5 text-[10px] min-w-[140px]">
      <div>
        <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Nodes</div>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: SEED_COLOR }} />
            <span className="text-muted-foreground">Seed</span>
          </div>
          {nodeEntries.map(([type, c]) => (
            <div key={type} className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: c.hex }} />
              <span className="text-muted-foreground">{type}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="border-t border-border/30 pt-2">
        <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Status</div>
        <div className="space-y-1">
          {[["Succeeded", "bg-emerald-400"], ["Failed", "bg-red-400"], ["Running", "bg-blue-400"]].map(([label, dot]) => (
            <div key={label} className="flex items-center gap-2">
              <div className={`w-1.5 h-1.5 rounded-full ${dot}`} />
              <span className="text-muted-foreground">{label}</span>
            </div>
          ))}
        </div>
      </div>
      {providerEntries.length > 0 && (
        <div className="border-t border-border/30 pt-2">
          <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Datasources</div>
          <div className="space-y-1">
            {providerEntries.map(([name, c]) => (
              <div key={name} className="flex items-center gap-2">
                <div className="w-4 h-0.5 rounded-full" style={{ background: c.stroke }} />
                <span className="text-muted-foreground font-mono">{name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Grouping logic
// ============================================================

const SEED_NODE_ID = "__seed__";
const GROUP_PREFIX = "__group__";

function buildGroups(
  entities: GraphEntity[],
  expandedTypes: Set<string>,
): { groups: Map<string, GroupInfo>; groupedEntityIds: Set<string> } {
  const typeCounts = new Map<string, GraphEntity[]>();
  for (const e of entities) {
    const list = typeCounts.get(e.type) ?? [];
    list.push(e);
    typeCounts.set(e.type, list);
  }

  const groups = new Map<string, GroupInfo>();
  const groupedEntityIds = new Set<string>();

  for (const [type, ents] of typeCounts) {
    if (ents.length < GROUP_THRESHOLD || expandedTypes.has(type)) continue;

    const nodeId = `${GROUP_PREFIX}${type}`;
    const statusCounts: Record<string, number> = {};
    for (const e of ents) {
      const s = e.status ?? "unknown";
      statusCounts[s] = (statusCounts[s] ?? 0) + 1;
    }

    groups.set(type, { type, entities: ents, statusCounts, nodeId });
    for (const e of ents) groupedEntityIds.add(e.id);
  }

  return { groups, groupedEntityIds };
}

function remapEdgeEndpoint(
  entityId: string,
  groupedEntityIds: Set<string>,
  entityTypeMap: Map<string, string>,
): string {
  if (!groupedEntityIds.has(entityId)) return entityId;
  const type = entityTypeMap.get(entityId);
  return type ? `${GROUP_PREFIX}${type}` : entityId;
}

// ============================================================
// Layout
// ============================================================

function computeLayout(
  entities: GraphEntity[],
  graphEdges: GraphEdge[],
  seedIdentifierType: string,
  seedValue: string,
  expandedTypes: Set<string>,
): { nodes: Node[]; edges: Edge[]; providers: Set<string>; groups: Map<string, GroupInfo> } {
  const { groups, groupedEntityIds } = buildGroups(entities, expandedTypes);

  // Build entity type map for edge remapping
  const entityTypeMap = new Map<string, string>();
  for (const e of entities) entityTypeMap.set(e.id, e.type);

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));

  // Visible entities = ungrouped individual entities
  const visibleEntities = entities.filter((e) => !groupedEntityIds.has(e.id));
  const totalVisible = visibleEntities.length + groups.size;
  const spacing = totalVisible > 12 ? { nodesep: 50, ranksep: 90 } : { nodesep: 30, ranksep: 70 };
  g.setGraph({ rankdir: "TB", ...spacing, marginx: 30, marginy: 30 });

  const nodeW = 230;
  const groupW = 200;
  const seedW = 180;
  const seedH = 60;
  const groupH = 80;
  const providers = new Set<string>();

  function entityHeight(e: GraphEntity): number {
    let h = 58;
    if (e.display.task != null) h += 14;
    h += 18;
    return h;
  }

  // Add seed node
  g.setNode(SEED_NODE_ID, { width: seedW, height: seedH });

  // Add individual entity nodes
  const heightMap = new Map<string, number>();
  for (const entity of visibleEntities) {
    const h = entityHeight(entity);
    heightMap.set(entity.id, h);
    g.setNode(entity.id, { width: nodeW, height: h });
    for (const ds of entity.discoveredBy) providers.add(ds);
  }

  // Add group nodes
  for (const [, group] of groups) {
    g.setNode(group.nodeId, { width: groupW, height: groupH });
    for (const e of group.entities) {
      for (const ds of e.discoveredBy) providers.add(ds);
    }
  }

  // Seed → depth-0 (individual or group)
  const depth0 = entities.filter((e) => e.depth === 0);
  const depth0Targets = new Set<string>();
  for (const e of depth0) {
    const target = groupedEntityIds.has(e.id) ? `${GROUP_PREFIX}${e.type}` : e.id;
    if (!depth0Targets.has(target)) {
      depth0Targets.add(target);
      g.setEdge(SEED_NODE_ID, target);
    }
  }

  // Entity/group edges (remapped and deduplicated)
  const edgeSet = new Set<string>();
  for (const edge of graphEdges) {
    const source = remapEdgeEndpoint(edge.source, groupedEntityIds, entityTypeMap);
    const target = remapEdgeEndpoint(edge.target, groupedEntityIds, entityTypeMap);
    if (source === target) continue; // skip self-loops within same group
    const key = `${source}->${target}`;
    if (!edgeSet.has(key)) {
      edgeSet.add(key);
      g.setEdge(source, target);
      providers.add(edge.datasourceName);
    }
  }

  dagre.layout(g);

  // Build nodes
  const nodes: Node[] = [];
  const seedPos = g.node(SEED_NODE_ID);
  nodes.push({
    id: SEED_NODE_ID,
    type: "seed",
    position: { x: seedPos.x - seedW / 2, y: seedPos.y - seedH / 2 },
    data: { identifierType: seedIdentifierType, value: seedValue },
    selectable: false,
    draggable: true,
  });

  for (const entity of visibleEntities) {
    const pos = g.node(entity.id);
    const h = heightMap.get(entity.id) ?? 70;
    nodes.push({
      id: entity.id,
      type: "entity",
      position: { x: pos.x - nodeW / 2, y: pos.y - h / 2 },
      data: { entity, selected: false },
    });
  }

  for (const [, group] of groups) {
    const pos = g.node(group.nodeId);
    nodes.push({
      id: group.nodeId,
      type: "group",
      position: { x: pos.x - groupW / 2, y: pos.y - groupH / 2 },
      data: { group, selected: false, expanded: false },
      style: { background: "transparent", border: "none", padding: 0 },
    });
  }

  // Build edges
  const flowEdges: Edge[] = [];
  const addedEdges = new Set<string>();
  const showLabels = edgeSet.size <= 20;

  // Seed edges
  for (const target of depth0Targets) {
    const key = `${SEED_NODE_ID}->${target}`;
    addedEdges.add(key);
    flowEdges.push({
      id: key,
      source: SEED_NODE_ID,
      target,
      label: seedIdentifierType,
      type: "default",
      animated: true,
      markerEnd: { type: "arrowclosed" as const, color: SEED_COLOR },
      style: { stroke: SEED_COLOR, strokeWidth: 2, opacity: 0.7 },
      labelStyle: { fontSize: 9, fill: `${SEED_COLOR}cc` },
      labelBgStyle: { fill: "#09090b", opacity: 0.9 },
      labelBgPadding: [4, 2] as [number, number],
    });
  }

  // Entity/group edges
  for (const edge of graphEdges) {
    const source = remapEdgeEndpoint(edge.source, groupedEntityIds, entityTypeMap);
    const target = remapEdgeEndpoint(edge.target, groupedEntityIds, entityTypeMap);
    if (source === target) continue;
    const key = `${source}->${target}`;
    if (addedEdges.has(key)) continue;
    addedEdges.add(key);

    // Don't show labels on edges involving group nodes — the identifier
    // type is ambiguous when multiple entities are grouped
    const involvesGroup = source.startsWith(GROUP_PREFIX) || target.startsWith(GROUP_PREFIX);
    const showLabel = showLabels && !involvesGroup;

    const pc = getDatasourceColor(edge.datasourceName);
    flowEdges.push({
      id: key,
      source,
      target,
      label: showLabel ? edge.identifierType : undefined,
      type: "default",
      animated: false,
      markerEnd: { type: "arrowclosed" as const, color: pc.stroke },
      style: { stroke: pc.stroke, strokeWidth: 1.5, opacity: 0.7 },
      ...(showLabel ? {
        labelStyle: { fontSize: 9, fill: pc.label },
        labelBgStyle: { fill: "#09090b", opacity: 0.9 },
        labelBgPadding: [4, 2] as [number, number],
      } : {}),
    });
  }

  return { nodes, edges: flowEdges, providers, groups };
}

function applySelectionStyling(
  layoutNodes: Node[],
  layoutEdges: Edge[],
  selectedId: string | null,
  entities: GraphEntity[],
): { nodes: Node[]; edges: Edge[] } {
  if (!selectedId) return { nodes: layoutNodes, edges: layoutEdges };

  const focusedNodes = new Set<string>([selectedId]);

  // Find neighbors from layout edges (already remapped)
  for (const edge of layoutEdges) {
    if (edge.source === selectedId) focusedNodes.add(edge.target);
    if (edge.target === selectedId) focusedNodes.add(edge.source);
  }

  // Include seed if any focused node is a seed target
  for (const edge of layoutEdges) {
    if (edge.source === SEED_NODE_ID && focusedNodes.has(edge.target)) {
      focusedNodes.add(SEED_NODE_ID);
      break;
    }
  }

  const styledNodes = layoutNodes.map((node) => {
    const isFocused = focusedNodes.has(node.id);
    const isSelected = node.id === selectedId;
    if ((node.type === "entity" || node.type === "group") && isSelected) {
      return { ...node, data: { ...node.data, selected: true } };
    }
    if (!isFocused) {
      return { ...node, style: { ...node.style, opacity: 0.15 } };
    }
    return node;
  });

  const styledEdges = layoutEdges.map((edge) => {
    const isFocused = focusedNodes.has(edge.source) && focusedNodes.has(edge.target);
    if (isFocused) {
      return { ...edge, animated: edge.source === SEED_NODE_ID, style: { ...edge.style, strokeWidth: 2, opacity: 0.7 } };
    }
    return { ...edge, label: undefined, animated: false, labelStyle: undefined, labelBgStyle: undefined, labelBgPadding: undefined, style: { ...edge.style, opacity: 0.08 } };
  });

  return { nodes: styledNodes, edges: styledEdges };
}

// ============================================================
// Group Detail Panel
// ============================================================

function GroupDetail({ group }: { group: GroupInfo }) {
  const colors = NODE_COLORS[group.type] ?? DEFAULT_NODE;

  return (
    <div className="rounded-lg border border-border/50 bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className={`text-sm font-semibold ${colors.text}`}>{group.type}</span>
        <Badge variant="secondary" className="text-xs">{group.entities.length}</Badge>
      </div>
      <div className="flex gap-3 text-xs text-muted-foreground">
        {Object.entries(group.statusCounts).map(([status, count]) => (
          <span key={status} className="flex items-center gap-1">
            <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[status] ?? "bg-zinc-500"}`} />
            {count} {status}
          </span>
        ))}
      </div>
      <div className="space-y-1 max-h-[400px] overflow-auto">
        {group.entities.map((e) => {
          const primaryId = Object.values(e.identifiers)[0] ?? "";
          const status = e.status ?? "unknown";
          return (
            <div key={e.id} className="flex items-center gap-2 text-xs rounded px-2 py-1 hover:bg-muted/30">
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[status] ?? "bg-zinc-500"}`} />
              <span className="font-mono truncate flex-1">{primaryId}</span>
              {e.display.task != null && (
                <span className="text-muted-foreground truncate">{String(e.display.task)}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// Main Component
// ============================================================

function GraphViewInner({ entities, edges: graphEdges, seedIdentifierType, seedValue, schema, enrichments, onRunEnrichment }: GraphViewProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(new Set());
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set());

  const entityTypeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of entities) counts.set(e.type, (counts.get(e.type) ?? 0) + 1);
    return counts;
  }, [entities]);

  const filteredEntities = useMemo(
    () => entities.filter((e) => !hiddenTypes.has(e.type)),
    [entities, hiddenTypes],
  );
  const filteredEdges = useMemo(
    () => graphEdges.filter((e) =>
      !hiddenTypes.has(e.source.split(":")[0]) &&
      !hiddenTypes.has(e.target.split(":")[0]),
    ),
    [graphEdges, hiddenTypes],
  );

  const layout = useMemo(
    () => computeLayout(filteredEntities, filteredEdges, seedIdentifierType, seedValue, expandedTypes),
    [filteredEntities, filteredEdges, seedIdentifierType, seedValue, expandedTypes],
  );

  const { nodes, edges } = useMemo(
    () => applySelectionStyling(layout.nodes, layout.edges, selectedId, filteredEntities),
    [layout, selectedId, filteredEntities],
  );

  const providers = layout.providers;

  const toggleType = useCallback((type: string) => {
    setHiddenTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
    setSelectedId(null);
  }, []);

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (node.id === SEED_NODE_ID) return;
      setSelectedId((prev) => (prev === node.id ? null : node.id));
    },
    [],
  );

  const handlePaneClick = useCallback(() => setSelectedId(null), []);

  const selectedEntity = selectedId && !selectedId.startsWith(GROUP_PREFIX)
    ? entities.find((e) => e.id === selectedId)
    : null;

  const selectedGroup = selectedId?.startsWith(GROUP_PREFIX)
    ? layout.groups.get(selectedId.slice(GROUP_PREFIX.length))
    : null;

  if (entities.length === 0) {
    return (
      <div className="flex items-center justify-center h-[400px] rounded-lg border border-dashed border-border/50">
        <p className="text-sm text-muted-foreground">No graph data to display.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] text-muted-foreground mr-1">Filter:</span>
        {Array.from(entityTypeCounts.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([type, count]) => {
            const hidden = hiddenTypes.has(type);
            const isGroupable = count >= GROUP_THRESHOLD;
            const isExpanded = expandedTypes.has(type);
            const color = NODE_COLORS[type]?.hex ?? DEFAULT_NODE.hex;
            return (
              <div key={type} className="inline-flex items-center gap-0">
                <button
                  onClick={() => toggleType(type)}
                  className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] transition-colors cursor-pointer ${
                    hidden ? "border-border/30 text-muted-foreground/40 line-through" : "border-border/60 text-foreground"
                  } ${isGroupable && !hidden ? "rounded-r-none border-r-0" : ""}`}
                >
                  <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: hidden ? "#52525b" : color }} />
                  {type}
                  <span className="text-muted-foreground/60">{count}</span>
                </button>
                {isGroupable && !hidden && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpandedTypes((prev) => {
                        const next = new Set(prev);
                        if (next.has(type)) next.delete(type);
                        else next.add(type);
                        return next;
                      });
                      setSelectedId(null);
                    }}
                    className="inline-flex items-center justify-center rounded-md rounded-l-none border border-border/60 px-1.5 py-1 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer"
                    title={isExpanded ? "Collapse group" : "Expand group"}
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5" />
                    )}
                  </button>
                )}
              </div>
            );
          })}
      </div>

      <div className="flex gap-4">
        <div className="flex-1 min-w-0 h-[600px] rounded-lg border border-border/50 overflow-hidden bg-zinc-950">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodeClick={handleNodeClick}
            onPaneClick={handlePaneClick}
            fitView
            fitViewOptions={{ padding: 0.12 }}
            minZoom={0.15}
            maxZoom={2}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={24} size={1} color="#27272a22" />
            <Controls
              showInteractive={false}
              className="!bg-zinc-900 !border-zinc-800 !shadow-none [&>button]:!bg-zinc-900 [&>button]:!border-zinc-800 [&>button]:!text-zinc-400 [&>button:hover]:!bg-zinc-800"
            />
            <MiniMap
              nodeColor={(node) => {
                if (node.id === SEED_NODE_ID) return SEED_COLOR;
                if (node.id.startsWith(GROUP_PREFIX)) {
                  const type = node.id.slice(GROUP_PREFIX.length);
                  return NODE_COLORS[type]?.hex ?? DEFAULT_NODE.hex;
                }
                const type = (node.data as EntityNodeData)?.entity?.type;
                return NODE_COLORS[type]?.hex ?? DEFAULT_NODE.hex;
              }}
              maskColor="#09090bdd"
              className="!bg-zinc-900/80 !border-zinc-800 !w-32 !h-20"
            />
            <Panel position="top-right">
              <GraphLegend providers={providers} />
            </Panel>
          </ReactFlow>
        </div>

        {selectedEntity && (
          <div className="w-[380px] shrink-0 h-[600px] overflow-y-auto">
            <EntityCard entity={selectedEntity} />
          </div>
        )}
        {selectedGroup && (
          <div className="w-[380px] shrink-0 h-[600px] overflow-y-auto">
            <GroupDetail group={selectedGroup} />
          </div>
        )}
      </div>

      {/* Enrichment panel — full width below graph, provider-specific views */}
      {selectedEntity && (
        <EnrichmentPanel
          entity={selectedEntity}
          schema={schema}
          enrichments={enrichments[selectedEntity.id] ?? {}}
          onRunEnrichment={onRunEnrichment}
        />
      )}
    </div>
  );
}

export function GraphView(props: GraphViewProps) {
  return (
    <ReactFlowProvider>
      <GraphViewInner {...props} />
    </ReactFlowProvider>
  );
}
