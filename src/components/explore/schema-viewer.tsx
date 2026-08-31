"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { WeaveSchema } from "@/lib/schema/types";

interface SchemaViewerProps {
  schema: WeaveSchema | null;
  rawYaml: string | null;
}

export function SchemaViewer({ schema, rawYaml }: SchemaViewerProps) {
  if (!schema) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        Loading schema...
      </p>
    );
  }

  // Build datasource-entity mapping
  const datasourceEntityMap: Record<string, { serves: string[]; enriches: string[] }> = {};
  for (const [name, datasource] of Object.entries(schema.datasources)) {
    datasourceEntityMap[name] = {
      serves: datasource.serves ?? [],
      enriches: Object.keys(datasource.enriches ?? {}),
    };
  }

  return (
    <div className="space-y-4">
      {/* Entities overview */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Entities</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Entity</TableHead>
                <TableHead className="text-xs">Format</TableHead>
                <TableHead className="text-xs">Identifiers</TableHead>
                <TableHead className="text-xs">References</TableHead>
                <TableHead className="text-xs">Served By</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.entries(schema.entities).map(([name, entity]) => {
                const servedBy = Object.entries(datasourceEntityMap)
                  .filter(([, map]) => map.serves.includes(name))
                  .map(([provName]) => provName);

                return (
                  <TableRow key={name}>
                    <TableCell className="font-mono text-xs font-medium">
                      {name}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1.5 py-0"
                      >
                        {entity.format}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">
                      <div className="flex flex-wrap gap-1">
                        {Object.keys(entity.identifiers).map((id) => (
                          <Badge
                            key={id}
                            variant="secondary"
                            className="text-[10px] px-1.5 py-0"
                          >
                            {id}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">
                      {entity.references?.map((ref, i) => (
                        <div key={i} className="text-muted-foreground">
                          <span className="text-foreground">{ref.points_to}</span>{" "}
                          via {ref.as}
                        </div>
                      )) ?? (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">
                      <div className="flex flex-wrap gap-1">
                        {servedBy.map((p) => (
                          <Badge
                            key={p}
                            variant="outline"
                            className="text-[10px] px-1.5 py-0"
                          >
                            {p}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Datasources overview */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Datasources</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Datasource</TableHead>
                <TableHead className="text-xs">Provider</TableHead>
                <TableHead className="text-xs">Types</TableHead>
                <TableHead className="text-xs">Serves</TableHead>
                <TableHead className="text-xs">Enriches</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.entries(schema.datasources).map(([name, datasource]) => (
                <TableRow key={name}>
                  <TableCell className="font-mono text-xs font-medium">
                    {name}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className="text-[10px] px-1.5 py-0"
                    >
                      {datasource.provider}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {datasource.types.map((t) => (
                        <Badge
                          key={t}
                          variant="secondary"
                          className="text-[10px] px-1.5 py-0"
                        >
                          {t}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs font-mono">
                    {(datasource.serves ?? []).join(", ") || "-"}
                  </TableCell>
                  <TableCell className="text-xs font-mono">
                    {Object.keys(datasource.enriches ?? {}).join(", ") || "-"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Raw YAML */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Schema YAML</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px]">
            <pre className="text-xs font-mono whitespace-pre text-muted-foreground">
              {rawYaml ?? "Loading..."}
            </pre>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
