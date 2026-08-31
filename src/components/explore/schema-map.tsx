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
import type { WeaveSchema } from "@/lib/schema/types";

// ============================================================
// Color palette
// ============================================================

const SEED_HEX = "#f472b6";
const ENTITY_HEX = "#60a5fa";
const DATASOURCE_HEX = "#34d399";
const GAP_HEX = "#ef4444";

const EDGE_COLORS = {
  serves: "#34d399",
  enriches: "#a78bfa",
  references: "#60a5fa",
  seed: "#f472b6",
};

const TYPE_BADGE_COLORS: Record<string, string> = {
  json: "#34d399",
  logs: "#fb923c",
  metrics: "#fbbf24",
  traces: "#a78bfa",
};

const DIM_OPACITY = 0.08;
const FULL_OPACITY = 1;

// ============================================================
// Edge category from edge id
// ============================================================

type EdgeCategory = "serves" | "enriches" | "references" | "seed";

function edgeCategory(edgeId: string): EdgeCategory {
  if (edgeId.includes(":serves")) return "serves";
  if (edgeId.includes(":enriches")) return "enriches";
  if (edgeId.includes(":ref:")) return "references";
  return "seed";
}

// ============================================================
// Seed Node
// ============================================================

type SeedNodeData = {
  identifier: string;
  label: string;
  primary: boolean;
  dimmed: boolean;
};

function SeedNodeComponent({ data }: NodeProps<Node<SeedNodeData>>) {
  return (
    <>
      <div
        className="rounded-lg px-4 py-2.5 text-center min-w-[120px] transition-opacity duration-200"
        style={{
          border: `2px solid ${SEED_HEX}55`,
          background: `${SEED_HEX}10`,
          boxShadow: `0 0 16px ${SEED_HEX}12`,
          opacity: data.dimmed ? DIM_OPACITY : FULL_OPACITY,
        }}
      >
        <div
          className="text-[9px] font-semibold uppercase tracking-[0.15em] mb-0.5"
          style={{ color: `${SEED_HEX}bb` }}
        >
          seed
        </div>
        <div className="text-xs font-mono text-foreground">{data.label}</div>
        {data.label !== data.identifier && (
          <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
            {data.identifier}
          </div>
        )}
        {data.primary && (
          <div
            className="text-[8px] font-semibold uppercase tracking-wider mt-1"
            style={{ color: `${SEED_HEX}99` }}
          >
            primary
          </div>
        )}
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        style={{
          background: SEED_HEX,
          border: `1px solid ${SEED_HEX}`,
          width: 7,
          height: 7,
          opacity: data.dimmed ? DIM_OPACITY : FULL_OPACITY,
        }}
      />
    </>
  );
}

// ============================================================
// Entity Node
// ============================================================

type EntityNodeData = {
  name: string;
  label: string;
  identifiers: string[];
  hasGap: boolean;
  dimmed: boolean;
};

function EntityNodeComponent({ data }: NodeProps<Node<EntityNodeData>>) {
  const borderColor = data.hasGap ? GAP_HEX : ENTITY_HEX;

  return (
    <>
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-zinc-600 !border-zinc-500 !w-2 !h-2"
      />
      <div
        className="rounded-lg px-3 py-2.5 min-w-[180px] max-w-[260px] transition-opacity duration-200"
        style={{
          border: `1.5px solid ${borderColor}44`,
          background: `${borderColor}08`,
          opacity: data.dimmed ? DIM_OPACITY : FULL_OPACITY,
        }}
      >
        <div className="flex items-center gap-2 mb-1">
          <div
            className="w-2 h-2 rounded-sm shrink-0"
            style={{ background: borderColor }}
          />
          <span
            className="text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: `${borderColor}cc` }}
          >
            {data.name}
          </span>
        </div>
        <div className="text-[10px] text-muted-foreground mb-1.5">
          {data.label}
        </div>
        <div className="flex flex-wrap gap-1">
          {data.identifiers.map((id) => (
            <span
              key={id}
              className="inline-block rounded bg-zinc-800/80 px-1.5 py-0.5 text-[9px] font-mono text-zinc-400"
            >
              {id}
            </span>
          ))}
        </div>
        {data.hasGap && (
          <div
            className="mt-1.5 pt-1 border-t text-[9px] font-semibold uppercase tracking-wider"
            style={{ borderColor: `${GAP_HEX}30`, color: `${GAP_HEX}cc` }}
          >
            no serving datasource
          </div>
        )}
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-zinc-600 !border-zinc-500 !w-2 !h-2"
      />
    </>
  );
}

// ============================================================
// Datasource Node
// ============================================================

type DatasourceNodeData = {
  name: string;
  provider: string;
  types: string[];
  dimmed: boolean;
};

function DatasourceNodeComponent({
  data,
}: NodeProps<Node<DatasourceNodeData>>) {
  return (
    <>
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-zinc-600 !border-zinc-500 !w-2 !h-2"
      />
      <div
        className="rounded-lg px-3 py-2.5 min-w-[150px] max-w-[200px] transition-opacity duration-200"
        style={{
          border: `1.5px solid ${DATASOURCE_HEX}44`,
          background: `${DATASOURCE_HEX}08`,
          opacity: data.dimmed ? DIM_OPACITY : FULL_OPACITY,
        }}
      >
        <div className="flex items-center gap-2 mb-1">
          <div
            className="w-2 h-2 rounded-full shrink-0"
            style={{ background: DATASOURCE_HEX }}
          />
          <span
            className="text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: `${DATASOURCE_HEX}cc` }}
          >
            datasource
          </span>
        </div>
        <div className="text-xs font-mono text-foreground truncate">
          {data.name}
        </div>
        <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
          {data.provider}
        </div>
        <div className="flex gap-1 mt-1.5">
          {data.types.map((t) => (
            <span
              key={t}
              className="inline-block rounded px-1.5 py-0.5 text-[9px] font-mono"
              style={{
                background: `${TYPE_BADGE_COLORS[t] ?? "#71717a"}18`,
                color: TYPE_BADGE_COLORS[t] ?? "#a1a1aa",
              }}
            >
              {t}
            </span>
          ))}
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        style={{
          background: DATASOURCE_HEX,
          border: `1px solid ${DATASOURCE_HEX}`,
          width: 7,
          height: 7,
          opacity: data.dimmed ? DIM_OPACITY : FULL_OPACITY,
        }}
      />
    </>
  );
}

const nodeTypes: NodeTypes = {
  seed: SeedNodeComponent,
  entity: EntityNodeComponent,
  datasource: DatasourceNodeComponent,
};

// ============================================================
// Filter toolbar
// ============================================================

function FilterToolbar({
  datasourceNames,
  hiddenDatasources,
  toggleDatasource,
  edgeToggles,
  toggleEdgeType,
}: {
  datasourceNames: string[];
  hiddenDatasources: Set<string>;
  toggleDatasource: (name: string) => void;
  edgeToggles: Record<EdgeCategory, boolean>;
  toggleEdgeType: (cat: EdgeCategory) => void;
}) {
  const edgeEntries: { key: EdgeCategory; label: string; color: string }[] = [
    { key: "serves", label: "Serves", color: EDGE_COLORS.serves },
    { key: "enriches", label: "Enriches", color: EDGE_COLORS.enriches },
    { key: "references", label: "References", color: EDGE_COLORS.references },
  ];

  return (
    <div className="flex flex-wrap items-center gap-3 mb-3">
      {/* Edge type toggles */}
      <div className="flex items-center gap-1">
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider mr-1">
          Edges
        </span>
        {edgeEntries.map(({ key, label, color }) => {
          const active = edgeToggles[key];
          return (
            <button
              key={key}
              type="button"
              onClick={() => toggleEdgeType(key)}
              className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] font-mono transition-all cursor-pointer"
              style={{
                borderColor: active ? `${color}60` : "#27272a",
                background: active ? `${color}12` : "transparent",
                color: active ? color : "#52525b",
              }}
            >
              <div
                className="w-3 h-0.5 rounded-full"
                style={{
                  background: active ? color : "#52525b",
                  ...(key === "enriches"
                    ? {
                        backgroundImage: active
                          ? `repeating-linear-gradient(90deg, ${color} 0px, ${color} 3px, transparent 3px, transparent 5px)`
                          : undefined,
                        background: active ? "transparent" : "#52525b",
                      }
                    : {}),
                }}
              />
              {label}
            </button>
          );
        })}
      </div>

      <div className="w-px h-4 bg-border/50" />

      {/* Datasource filter chips */}
      <div className="flex items-center gap-1">
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider mr-1">
          Datasources
        </span>
        {datasourceNames.map((name) => {
          const hidden = hiddenDatasources.has(name);
          return (
            <button
              key={name}
              type="button"
              onClick={() => toggleDatasource(name)}
              className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] font-mono transition-all cursor-pointer"
              style={{
                borderColor: hidden ? "#27272a" : `${DATASOURCE_HEX}50`,
                background: hidden ? "transparent" : `${DATASOURCE_HEX}10`,
                color: hidden ? "#52525b" : DATASOURCE_HEX,
              }}
            >
              <div
                className="w-1.5 h-1.5 rounded-full"
                style={{
                  background: hidden ? "#52525b" : DATASOURCE_HEX,
                }}
              />
              {name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// Legend (compact, inside graph panel)
// ============================================================

function SchemaMapLegend({ gapCount }: { gapCount: number }) {
  return (
    <div className="flex flex-col gap-2.5 rounded-lg border border-border/50 bg-zinc-950/90 backdrop-blur-sm px-3 py-2 text-[10px] min-w-[110px]">
      <div>
        <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
          Nodes
        </div>
        <div className="space-y-0.5">
          {[
            { color: SEED_HEX, label: "Seed", shape: "rounded-full" },
            { color: ENTITY_HEX, label: "Entity", shape: "rounded-sm" },
            { color: DATASOURCE_HEX, label: "Datasource", shape: "rounded-full" },
          ].map(({ color, label, shape }) => (
            <div key={label} className="flex items-center gap-2">
              <div className={`w-2 h-2 shrink-0 ${shape}`} style={{ background: color }} />
              <span className="text-muted-foreground">{label}</span>
            </div>
          ))}
          {gapCount > 0 && (
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-sm shrink-0" style={{ background: GAP_HEX }} />
              <span style={{ color: GAP_HEX }}>Gap ({gapCount})</span>
            </div>
          )}
        </div>
      </div>
      <div className="text-[9px] text-muted-foreground/60 border-t border-border/30 pt-1.5">
        Click a node to focus
      </div>
    </div>
  );
}

// ============================================================
// Layout builder
// ============================================================

interface SchemaGraphData {
  allNodes: Node[];
  allEdges: Edge[];
  gapCount: number;
  datasourceNames: string[];
}

function buildSchemaGraph(schema: WeaveSchema): SchemaGraphData {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  const entityCount = Object.keys(schema.entities).length;
  const seedCount = schema.seeds.length;
  const totalNodes = entityCount + seedCount + Object.keys(schema.datasources).length;
  const nodesep = totalNodes > 10 ? 60 : 40;
  const ranksep = totalNodes > 10 ? 120 : 80;
  g.setGraph({
    rankdir: "TB",
    nodesep,
    ranksep,
    marginx: 40,
    marginy: 40,
  });

  const allNodes: Node[] = [];
  const allEdges: Edge[] = [];
  const addedEdges = new Set<string>();
  const datasourceNames: string[] = [];

  const servedEntities = new Set<string>();
  for (const ds of Object.values(schema.datasources)) {
    for (const entityType of (ds.serves ?? [])) {
      servedEntities.add(entityType);
    }
  }

  // Seeds
  for (const seed of schema.seeds) {
    const id = `seed:${seed.identifier}`;
    const identDef = schema.identifiers[seed.identifier];
    g.setNode(id, { width: 140, height: 65 });
    allNodes.push({
      id,
      type: "seed",
      position: { x: 0, y: 0 },
      data: {
        identifier: seed.identifier,
        label: identDef?.label ?? seed.identifier,
        primary: seed.primary ?? false,
        dimmed: false,
      },
    });

    for (const [entityName, entityDef] of Object.entries(schema.entities)) {
      if (seed.identifier in entityDef.identifiers) {
        const entityId = `entity:${entityName}`;
        const edgeKey = `${id}->${entityId}:seed`;
        if (!addedEdges.has(edgeKey)) {
          addedEdges.add(edgeKey);
          g.setEdge(id, entityId);
          allEdges.push(makeEdge(edgeKey, id, entityId, seed.identifier, "seed"));
        }
      }
    }
  }

  // Entities
  for (const [entityName, entityDef] of Object.entries(schema.entities)) {
    const id = `entity:${entityName}`;
    const hasGap = !servedEntities.has(entityName);
    const idCount = Object.keys(entityDef.identifiers).length;
    const idRows = Math.ceil(idCount / 3); // ~3 badges per row at 180px width
    const nodeHeight = 55 + idRows * 22 + (hasGap ? 25 : 0);
    g.setNode(id, { width: 200, height: nodeHeight });
    allNodes.push({
      id,
      type: "entity",
      position: { x: 0, y: 0 },
      data: {
        name: entityName,
        label: entityDef.description ?? entityDef.label,
        identifiers: Object.keys(entityDef.identifiers),
        hasGap,
        dimmed: false,
      },
    });

    if (entityDef.references) {
      for (const ref of entityDef.references) {
        const targetId = `entity:${ref.points_to}`;
        const edgeKey = `${id}->${targetId}:ref:${ref.as}`;
        if (!addedEdges.has(edgeKey)) {
          addedEdges.add(edgeKey);
          g.setEdge(id, targetId);
          allEdges.push(makeEdge(edgeKey, id, targetId, ref.as, "references"));
        }
      }
    }
  }

  // Datasources
  for (const [dsName, dsDef] of Object.entries(schema.datasources)) {
    const id = `ds:${dsName}`;
    datasourceNames.push(dsName);
    g.setNode(id, { width: 170, height: 85 });
    allNodes.push({
      id,
      type: "datasource",
      position: { x: 0, y: 0 },
      data: {
        name: dsName,
        provider: dsDef.provider,
        types: dsDef.types,
        dimmed: false,
      },
    });

    for (const entityType of (dsDef.serves ?? [])) {
      const targetId = `entity:${entityType}`;
      const edgeKey = `${id}->${targetId}:serves`;
      if (!addedEdges.has(edgeKey)) {
        addedEdges.add(edgeKey);
        g.setEdge(id, targetId);
        allEdges.push(makeEdge(edgeKey, id, targetId, "serves", "serves"));
      }
    }

    for (const entityType of Object.keys(dsDef.enriches ?? {})) {
      const targetId = `entity:${entityType}`;
      const edgeKey = `${id}->${targetId}:enriches`;
      if (!addedEdges.has(edgeKey)) {
        addedEdges.add(edgeKey);
        g.setEdge(id, targetId);
        allEdges.push(makeEdge(edgeKey, id, targetId, "enriches", "enriches"));
      }
    }
  }

  dagre.layout(g);

  for (const node of allNodes) {
    const pos = g.node(node.id);
    const w = pos.width ?? 160;
    const h = pos.height ?? 70;
    node.position = { x: pos.x - w / 2, y: pos.y - h / 2 };
  }

  const gapCount = Object.keys(schema.entities).length - servedEntities.size;

  return { allNodes, allEdges, gapCount, datasourceNames };
}

function makeEdge(
  id: string,
  source: string,
  target: string,
  label: string,
  category: EdgeCategory,
): Edge {
  const color = EDGE_COLORS[category];
  const isDashed = category === "enriches";

  return {
    id,
    source,
    target,
    label,
    type: "default",
    style: {
      stroke: color,
      strokeWidth: category === "serves" ? 2 : 1.5,
      strokeDasharray: isDashed ? "6 3" : undefined,
      opacity: 0.6,
    },
    labelStyle: { fontSize: 9, fill: `${color}aa` },
    labelBgStyle: { fill: "#09090b", opacity: 0.9 },
    labelBgPadding: [4, 2] as [number, number],
    markerEnd: { type: "arrowclosed" as const, color },
  };
}

// ============================================================
// Apply filters + focus
// ============================================================

function applyFilters(
  allNodes: Node[],
  allEdges: Edge[],
  hiddenDatasources: Set<string>,
  edgeToggles: Record<EdgeCategory, boolean>,
  focusedNodeId: string | null,
): { nodes: Node[]; edges: Edge[] } {
  // Build hidden node set from hidden datasources
  const hiddenNodeIds = new Set<string>();
  for (const dsName of hiddenDatasources) {
    hiddenNodeIds.add(`ds:${dsName}`);
  }

  // Filter edges by: edge type toggle + hidden datasources
  const visibleEdges = allEdges.filter((edge) => {
    const cat = edgeCategory(edge.id);
    if (cat !== "seed" && !edgeToggles[cat]) return false;
    if (hiddenNodeIds.has(edge.source) || hiddenNodeIds.has(edge.target)) return false;
    return true;
  });

  // Filter nodes: hide datasource nodes that are hidden
  const visibleNodes = allNodes.filter((n) => !hiddenNodeIds.has(n.id));

  // Focus logic: if a node is focused, dim everything not connected
  if (focusedNodeId) {
    const connectedNodes = new Set<string>([focusedNodeId]);
    for (const edge of visibleEdges) {
      if (edge.source === focusedNodeId || edge.target === focusedNodeId) {
        connectedNodes.add(edge.source);
        connectedNodes.add(edge.target);
      }
    }

    const focusedNodes = visibleNodes.map((n) => ({
      ...n,
      data: { ...n.data, dimmed: !connectedNodes.has(n.id) },
    }));

    const focusedEdges = visibleEdges.map((e) => {
      const connected =
        e.source === focusedNodeId || e.target === focusedNodeId;
      return {
        ...e,
        style: {
          ...e.style,
          opacity: connected ? 0.8 : 0.04,
        },
        labelStyle: {
          ...e.labelStyle,
          opacity: connected ? 1 : 0,
        },
      };
    });

    return { nodes: focusedNodes, edges: focusedEdges };
  }

  // No focus — reset all to visible
  const resetNodes = visibleNodes.map((n) => ({
    ...n,
    data: { ...n.data, dimmed: false },
  }));

  return { nodes: resetNodes, edges: visibleEdges };
}

// ============================================================
// Main component
// ============================================================

function SchemaMapInner({ schema }: { schema: WeaveSchema }) {
  const graphData = useMemo(() => buildSchemaGraph(schema), [schema]);

  const [hiddenDatasources, setHiddenDatasources] = useState<Set<string>>(
    new Set(),
  );
  const [edgeToggles, setEdgeToggles] = useState<
    Record<EdgeCategory, boolean>
  >({
    serves: true,
    enriches: true,
    references: true,
    seed: true,
  });
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);

  const toggleDatasource = useCallback((name: string) => {
    setHiddenDatasources((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  const toggleEdgeType = useCallback((cat: EdgeCategory) => {
    setEdgeToggles((prev) => ({ ...prev, [cat]: !prev[cat] }));
  }, []);

  const { nodes, edges } = useMemo(
    () =>
      applyFilters(
        graphData.allNodes,
        graphData.allEdges,
        hiddenDatasources,
        edgeToggles,
        focusedNodeId,
      ),
    [graphData, hiddenDatasources, edgeToggles, focusedNodeId],
  );

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      setFocusedNodeId((prev) => (prev === node.id ? null : node.id));
    },
    [],
  );

  const handlePaneClick = useCallback(() => {
    setFocusedNodeId(null);
  }, []);

  return (
    <div>
      <FilterToolbar
        datasourceNames={graphData.datasourceNames}
        hiddenDatasources={hiddenDatasources}
        toggleDatasource={toggleDatasource}
        edgeToggles={edgeToggles}
        toggleEdgeType={toggleEdgeType}
      />

      <div className="h-[550px] rounded-lg border border-border/50 overflow-hidden bg-zinc-950">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodeClick={handleNodeClick}
          onPaneClick={handlePaneClick}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          minZoom={0.3}
          maxZoom={2}
          nodesDraggable
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={24} size={1} color="#27272a22" />
          <Controls
            showInteractive={false}
            className="!bg-zinc-900 !border-zinc-800 !shadow-none [&>button]:!bg-zinc-900 [&>button]:!border-zinc-800 [&>button]:!text-zinc-400 [&>button:hover]:!bg-zinc-800"
          />
          <MiniMap
            nodeColor={(node) => {
              if (node.type === "seed") return SEED_HEX;
              if (node.type === "datasource") return DATASOURCE_HEX;
              if ((node.data as EntityNodeData)?.hasGap) return GAP_HEX;
              return ENTITY_HEX;
            }}
            maskColor="#09090bdd"
            className="!bg-zinc-900/80 !border-zinc-800"
          />
          <Panel position="top-right">
            <SchemaMapLegend gapCount={graphData.gapCount} />
          </Panel>
          {graphData.gapCount > 0 && (
            <Panel position="bottom-left">
              <div
                className="rounded-lg border px-3 py-2 text-xs"
                style={{
                  borderColor: `${GAP_HEX}40`,
                  background: `${GAP_HEX}10`,
                  color: `${GAP_HEX}cc`,
                }}
              >
                {graphData.gapCount}{" "}
                {graphData.gapCount === 1 ? "entity has" : "entities have"} no
                serving datasource
              </div>
            </Panel>
          )}
        </ReactFlow>
      </div>
    </div>
  );
}

export function SchemaMap({ schema }: { schema: WeaveSchema | null }) {
  if (!schema) {
    return (
      <div className="flex items-center justify-center h-[300px] rounded-lg border border-dashed border-border/50">
        <p className="text-sm text-muted-foreground">Loading schema...</p>
      </div>
    );
  }

  const hasEntities = Object.keys(schema.entities ?? {}).length > 0;
  const hasDatasources = Object.keys(schema.datasources ?? {}).length > 0;

  if (!hasEntities && !hasDatasources) {
    return (
      <div className="flex flex-col items-center justify-center h-[300px] rounded-lg border border-dashed border-border/50 gap-3">
        <div className="flex items-center justify-center h-12 w-12 rounded-full bg-muted">
          <svg className="h-6 w-6 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 7.125C2.25 6.504 2.754 6 3.375 6h6c.621 0 1.125.504 1.125 1.125v3.75c0 .621-.504 1.125-1.125 1.125h-6A1.125 1.125 0 012.25 10.875v-3.75zM14.25 8.625c0-.621.504-1.125 1.125-1.125h5.25c.621 0 1.125.504 1.125 1.125v8.25c0 .621-.504 1.125-1.125 1.125h-5.25a1.125 1.125 0 01-1.125-1.125v-8.25zM3.75 16.125c0-.621.504-1.125 1.125-1.125h5.25c.621 0 1.125.504 1.125 1.125v2.25c0 .621-.504 1.125-1.125 1.125h-5.25a1.125 1.125 0 01-1.125-1.125v-2.25z" />
          </svg>
        </div>
        <div className="text-center">
          <p className="text-sm font-medium">No schema defined yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Add entities and datasources in the Schema Editor tab to see your correlation map here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ReactFlowProvider>
      <SchemaMapInner schema={schema} />
    </ReactFlowProvider>
  );
}
