import { readFile } from "node:fs/promises";
import YAML from "yaml";
import {
  JurisdictionProfileSchema,
  SourceRegistrySchema,
  type JurisdictionProfile,
  type SourceRegistry,
} from "./contracts.js";

export async function loadSourceRegistry(path = "requirements/sources.yml"): Promise<SourceRegistry> {
  const raw = await readFile(path, "utf8");
  return SourceRegistrySchema.parse(YAML.parse(raw));
}

export async function loadJurisdictionProfile(path: string): Promise<JurisdictionProfile> {
  const raw = await readFile(path, "utf8");
  return JurisdictionProfileSchema.parse(YAML.parse(raw));
}
