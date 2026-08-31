import YAML from "yaml";
import { validateSchema } from "./validator";
import type { WeaveSchema } from "./types";

export function parseSchemaYaml(yamlString: string): WeaveSchema {
  const raw = YAML.parse(yamlString);
  return validateSchema(raw);
}
