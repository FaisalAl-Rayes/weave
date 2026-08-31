import { z } from "zod/v4";
import type { WeaveSchema } from "./types";

const IdentifierDefSchema = z.object({
  label: z.string(),
  pattern: z.string().optional(),
  normalize: z.enum(["lowercase", "uppercase"]).optional(),
});

const SeedDefSchema = z.object({
  identifier: z.string(),
  primary: z.boolean().optional(),
});

const SourcedPathSchema = z.object({
  path: z.string(),
  source: z.string().optional(),
});

const ReferenceDefSchema = z.object({
  field: z.string(),
  points_to: z.string(),
  as: z.string(),
  source: z.string().optional(),
});

const EntityK8sConfigSchema = z.object({
  endpoint: z.string(),
  identifierSelectors: z.record(z.string(), z.union([z.string(), z.array(z.string())])).optional(),
});

const EntityStatusDefSchema = z.object({
  path: z.string(),
});

const EntityDefSchema = z.object({
  label: z.string(),
  description: z.string().optional(),
  format: z.enum(["kubernetes_resource", "json"]),
  identifiers: z.record(z.string(), SourcedPathSchema),
  references: z.array(ReferenceDefSchema).optional(),
  display: z.record(z.string(), SourcedPathSchema).optional(),
  status: EntityStatusDefSchema.optional(),
  k8s: EntityK8sConfigSchema.optional(),
});

const ResponseMappingSchema = z.object({
  list_path: z.string().optional(),
  field_map: z.record(z.string(), z.string()).optional(),
});

// EnrichQueryConfig — typed per provider
const EnrichQueryConfigSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("promql"),
    promql: z.string(),
    step: z.string().optional(),
    start: z.string().optional(),
    end: z.string().optional(),
  }),
  z.object({
    type: z.literal("splunk"),
    search: z.string(),
    mode: z.enum(["oneshot", "blocking", "normal"]).optional(),
  }),
  z.object({
    type: z.literal("rest"),
    endpoint: z.string(),
    method: z.string().optional(),
    params: z.record(z.string(), z.string()).optional(),
  }),
  z.object({
    type: z.literal("tempo"),
    traceId: z.string().optional(),
    tags: z.record(z.string(), z.string()).optional(),
    limit: z.number().optional(),
    endpoint: z.string().optional(),
  }),
]);

const EnrichesQueryEntrySchema = z.object({
  as: z.string(),
  format: z.string().optional(),
  query: EnrichQueryConfigSchema,
});

const EnrichesEntityDefSchema = z.object({
  queries: z.record(z.string(), EnrichesQueryEntrySchema),
});

const DatasourceDefSchema = z.object({
  provider: z.string(),
  types: z.array(z.string()),
  connection: z.object({
    url: z.string(),
    auth: z
      .object({
        type: z.string(),
        token: z.string().optional(),
        username: z.string().optional(),
        password: z.string().optional(),
        headers: z.record(z.string(), z.string()).optional(),
      })
      .catchall(z.unknown())
      .optional(),
    headers: z.record(z.string(), z.string()).optional(),
  }),
  // serves is now a simple list of entity type names — no query templates
  serves: z.array(z.string()).optional(),
  enriches: z.record(z.string(), EnrichesEntityDefSchema).optional(),
});

const TraversalConfigSchema = z.object({
  max_depth: z.number().int().positive().default(4),
  max_queue_per_level: z.number().int().positive().default(50),
  max_total_entities: z.number().int().positive().default(200),
  timeout_seconds: z.number().positive().default(30),
  concurrency: z.number().int().positive().default(10),
  priority: z.array(z.string()).optional(),
});

const ContextQueryDefSchema = z.object({
  datasource: z.string(),
  query: z.record(z.string(), z.unknown()),
  display: z.object({
    label: z.string(),
    type: z.enum(["timeseries", "scalar"]),
  }),
});

const WeaveSchemaValidator = z.object({
  identifiers: z.record(z.string(), IdentifierDefSchema),
  seeds: z.array(SeedDefSchema),
  entities: z.record(z.string(), EntityDefSchema),
  datasources: z.record(z.string(), DatasourceDefSchema),
  traversal: TraversalConfigSchema,
  context: z.record(z.string(), ContextQueryDefSchema).optional(),
});

export function validateSchema(raw: unknown): WeaveSchema {
  return WeaveSchemaValidator.parse(raw) as WeaveSchema;
}
