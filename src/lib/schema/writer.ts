import { writeFileSync } from "fs";
import YAML from "yaml";
import { validateSchema } from "./validator";
import type { WeaveSchema } from "./types";
import { getProjectPaths } from "@/lib/projects";

export function saveSchema(projectId: string, schema: WeaveSchema): void {
  validateSchema(schema);

  const { schema: schemaPath } = getProjectPaths(projectId);
  const yamlContent = YAML.stringify(schema, {
    lineWidth: 120,
    defaultKeyType: "PLAIN",
    defaultStringType: "PLAIN",
  });

  writeFileSync(schemaPath, yamlContent, "utf-8");
}
