import Ajv from "ajv";
import addFormats from "ajv-formats";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { ObservatoryProject } from "./types.js";
import { OBSERVATORY_MANAGED_FIELDS } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Load and compile the JSON Schema validator.
 */
export function createValidator(): (data: unknown) => ValidationResult {
  const schemaPath = resolve(__dirname, "../data/schema.json");
  const schema = JSON.parse(readFileSync(schemaPath, "utf-8"));

  const ajv = new Ajv({
    allErrors: true,
    strict: false,
  });
  addFormats(ajv);

  const validate = ajv.compile(schema);

  return (data: unknown): ValidationResult => {
    const valid = validate(data);
    if (valid) {
      return { valid: true, errors: [] };
    }
    const errors = (validate.errors ?? []).map((e) => {
      const path = e.instancePath || "(root)";
      return `${path}: ${e.message ?? "unknown error"}`;
    });
    return { valid: false, errors };
  };
}

/**
 * Check project_id uniqueness across the dataset.
 */
export function checkUniqueIds(
  projects: ObservatoryProject[],
): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const p of projects) {
    if (seen.has(p.project_id)) {
      errors.push(`Duplicate project_id: "${p.project_id}"`);
    }
    seen.add(p.project_id);
  }
  return errors;
}

/**
 * Check project_id format: lowercase, alphanumeric, hyphens.
 */
export function checkIdFormat(
  projects: ObservatoryProject[],
): string[] {
  const errors: string[] = [];
  const pattern = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
  for (const p of projects) {
    if (!pattern.test(p.project_id)) {
      errors.push(
        `Invalid project_id format: "${p.project_id}" ` +
          `(must be lowercase alphanumeric with hyphens)`,
      );
    }
  }
  return errors;
}

/**
 * Check that partnership references point to existing projects.
 */
export function checkPartnershipRefs(
  projects: ObservatoryProject[],
): string[] {
  const errors: string[] = [];
  const ids = new Set(projects.map((p) => p.project_id));
  for (const p of projects) {
    for (const partner of p.partnerships) {
      if (!ids.has(partner)) {
        errors.push(
          `Project "${p.project_id}" references unknown ` +
            `partnership: "${partner}"`,
        );
      }
    }
  }
  return errors;
}

/**
 * Check that data_confidence keys match actual fields.
 */
export function checkConfidenceKeys(
  projects: ObservatoryProject[],
): string[] {
  const errors: string[] = [];
  for (const p of projects) {
    const record = p as unknown as Record<string, unknown>;
    for (const key of Object.keys(p.data_confidence)) {
      if (OBSERVATORY_MANAGED_FIELDS.has(key)) {
        errors.push(
          `Project "${p.project_id}": confidence key ` +
            `"${key}" is observatory-managed`,
        );
        continue;
      }
      if (!(key in record)) {
        errors.push(
          `Project "${p.project_id}": confidence key ` +
            `"${key}" does not match any project field`,
        );
      }
    }

    // Check null values don't have non-null confidence
    for (const [key, tier] of Object.entries(
      p.data_confidence,
    )) {
      const value = record[key];
      if (value === null && tier !== null) {
        errors.push(
          `Project "${p.project_id}": field "${key}" is ` +
            `null but confidence is "${tier}"`,
        );
      }
    }
  }
  return errors;
}

/**
 * Check ISO 8601 date fields are valid.
 */
export function checkDateFields(
  projects: ObservatoryProject[],
): string[] {
  const errors: string[] = [];
  const dateFields = [
    "last_verified_activity",
    "launch_date",
    "onchain_since",
  ];
  const datetimeFields = [
    "created_at",
    "updated_at",
    "claimed_at",
    "last_auto_refresh",
  ];

  for (const p of projects) {
    const record = p as unknown as Record<string, unknown>;
    for (const field of dateFields) {
      const val = record[field];
      if (typeof val === "string" && isNaN(Date.parse(val))) {
        errors.push(
          `Project "${p.project_id}": invalid date in ` +
            `"${field}": "${val}"`,
        );
      }
    }
    for (const field of datetimeFields) {
      const val = record[field];
      if (typeof val === "string" && isNaN(Date.parse(val))) {
        errors.push(
          `Project "${p.project_id}": invalid datetime in ` +
            `"${field}": "${val}"`,
        );
      }
    }
  }
  return errors;
}

/**
 * Run all validations on a dataset.
 */
export function validateDataset(
  data: unknown,
): ValidationResult {
  const allErrors: string[] = [];

  // Schema validation
  const schemaValidate = createValidator();
  const schemaResult = schemaValidate(data);
  allErrors.push(...schemaResult.errors);

  if (!Array.isArray(data)) {
    return { valid: false, errors: allErrors };
  }

  const projects = data as ObservatoryProject[];

  // Cross-reference checks
  allErrors.push(...checkUniqueIds(projects));
  allErrors.push(...checkIdFormat(projects));
  allErrors.push(...checkPartnershipRefs(projects));
  allErrors.push(...checkConfidenceKeys(projects));
  allErrors.push(...checkDateFields(projects));

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
  };
}

/**
 * CLI entry point: validate the observatory data file.
 */
function main(): void {
  const dataPath = resolve(
    __dirname,
    "../data/ecosystem-observatory.json",
  );

  let rawData: string;
  try {
    rawData = readFileSync(dataPath, "utf-8");
  } catch {
    console.error(`Cannot read data file: ${dataPath}`);
    process.exit(1);
  }

  let data: unknown;
  try {
    data = JSON.parse(rawData);
  } catch {
    console.error("Invalid JSON in data file");
    process.exit(1);
  }

  const result = validateDataset(data);

  if (result.valid) {
    const count = Array.isArray(data) ? data.length : 0;
    console.log(
      `Validation passed: ${count} projects, 0 errors`,
    );
  } else {
    console.error(
      `Validation failed with ${result.errors.length} errors:`,
    );
    for (const err of result.errors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  }
}

// Run CLI if invoked directly
const isMainModule =
  process.argv[1]?.endsWith("validate-data.ts") ||
  process.argv[1]?.endsWith("validate-data.js");
if (isMainModule) {
  main();
}
