import { readFile } from "node:fs/promises";

const supportedTypes = new Set([
  "array",
  "boolean",
  "integer",
  "null",
  "number",
  "object",
  "string",
]);
const approvedProviderKeywords = new Set([
  "additionalProperties",
  "const",
  "description",
  "enum",
  "items",
  "properties",
  "required",
  "type",
]);

export class CodexOutputSchemaPreflightError extends Error {
  constructor(readonly issues: string[]) {
    super(`Codex output schema preflight failed: ${issues.join("; ")}`);
    this.name = "CodexOutputSchemaPreflightError";
  }
}

function inspectSchemaNode(node: unknown, path: string, issues: string[]): void {
  if (typeof node !== "object" || node === null || Array.isArray(node)) {
    issues.push(`${path}: schema node must be an object`);
    return;
  }
  const schema = node as Record<string, unknown>;
  for (const keyword of Object.keys(schema)) {
    if (!approvedProviderKeywords.has(keyword)) {
      issues.push(`${path}.${keyword}: unsupported provider schema keyword`);
    }
  }

  if (!("type" in schema)) {
    issues.push(`${path}.type: explicit type is required`);
    return;
  }

  let effectiveType: string | undefined;
  if (typeof schema.type === "string") {
    effectiveType = schema.type;
    if (!supportedTypes.has(schema.type)) {
      issues.push(`${path}.type: unsupported type ${schema.type}`);
    }
  } else if (Array.isArray(schema.type)) {
    const types = schema.type;
    const uniqueTypes = new Set(types);
    const nonNullTypes = types.filter((type) => type !== "null");
    if (
      types.length !== 2 ||
      uniqueTypes.size !== 2 ||
      !types.includes("null") ||
      nonNullTypes.length !== 1 ||
      typeof nonNullTypes[0] !== "string" ||
      !supportedTypes.has(nonNullTypes[0])
    ) {
      issues.push(
        `${path}.type: nullable types must contain exactly one supported type and null`,
      );
    } else {
      effectiveType = nonNullTypes[0];
    }
  } else {
    issues.push(`${path}.type: type must be a string or explicit nullable type array`);
  }

  if ("const" in schema && effectiveType === undefined) {
    issues.push(`${path}.const: const fields require an explicit supported type`);
  }
  if ("enum" in schema) {
    if (!Array.isArray(schema.enum) || schema.enum.length === 0) {
      issues.push(`${path}.enum: enum must be a non-empty array`);
    }
    if (effectiveType === undefined) {
      issues.push(`${path}.enum: enum fields require an explicit supported type`);
    }
  }

  if (effectiveType === "object") {
    if (
      typeof schema.properties !== "object" ||
      schema.properties === null ||
      Array.isArray(schema.properties)
    ) {
      issues.push(`${path}.properties: object schemas require a properties object`);
      return;
    }
    if (!Array.isArray(schema.required)) {
      issues.push(`${path}.required: object schemas require an explicit required array`);
    }
    if (schema.additionalProperties !== false) {
      issues.push(`${path}.additionalProperties: must be false`);
    }

    const properties = schema.properties as Record<string, unknown>;
    const required = new Set(
      Array.isArray(schema.required)
        ? schema.required.filter((value): value is string => typeof value === "string")
        : [],
    );
    for (const propertyName of Object.keys(properties)) {
      if (!required.has(propertyName)) {
        issues.push(`${path}.required: missing property ${propertyName}`);
      }
      inspectSchemaNode(
        properties[propertyName],
        `${path}.properties.${propertyName}`,
        issues,
      );
    }
    for (const requiredName of required) {
      if (!(requiredName in properties)) {
        issues.push(`${path}.required: unknown property ${requiredName}`);
      }
    }
  }

  if (effectiveType === "array") {
    if (!("items" in schema)) {
      issues.push(`${path}.items: array schemas require typed items`);
    } else {
      inspectSchemaNode(schema.items, `${path}.items`, issues);
    }
  }
}

export function assertCodexOutputSchema(schema: unknown): void {
  const issues: string[] = [];
  inspectSchemaNode(schema, "$", issues);
  if (issues.length > 0) throw new CodexOutputSchemaPreflightError(issues);
}

export async function loadAndAssertCodexOutputSchema(path: string): Promise<void> {
  let schema: unknown;
  try {
    schema = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new CodexOutputSchemaPreflightError([
      `$: schema file must contain valid JSON (${error instanceof Error ? error.message : "unknown parse error"})`,
    ]);
  }
  assertCodexOutputSchema(schema);
}
