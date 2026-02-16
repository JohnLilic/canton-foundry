import type {
  ConfidenceTier,
  ObservatoryProject,
} from "../types.js";
import {
  OBSERVATORY_MANAGED_FIELDS,
  AUTO_DETECTED_FIELDS,
  MANUALLY_VERIFIED_FIELDS,
} from "../types.js";

/**
 * Assign confidence tier to a field based on its source.
 * Returns null if the field value is null (nothing to rate).
 */
export function assignTier(
  fieldName: string,
  fieldValue: unknown,
  source: "auto" | "manual" | "self_reported",
): ConfidenceTier | null {
  if (fieldValue === null || fieldValue === undefined) {
    return null;
  }

  if (OBSERVATORY_MANAGED_FIELDS.has(fieldName)) {
    return null;
  }

  if (source === "manual") {
    return "verified";
  }

  if (source === "self_reported") {
    return "self_reported";
  }

  return "auto_detected";
}

/**
 * Determine the default confidence source for a field.
 */
export function defaultSourceForField(
  fieldName: string,
): "auto" | "manual" | "self_reported" {
  if (AUTO_DETECTED_FIELDS.has(fieldName)) {
    return "auto";
  }
  if (MANUALLY_VERIFIED_FIELDS.has(fieldName)) {
    return "manual";
  }
  return "self_reported";
}

/**
 * Validate a confidence tier transition.
 * Returns true if the transition is allowed.
 */
export function isValidTransition(
  from: ConfidenceTier | null,
  to: ConfidenceTier | null,
): boolean {
  if (from === null || to === null) {
    return true;
  }

  // auto_detected -> verified (upgrade via manual review)
  if (from === "auto_detected" && to === "verified") {
    return true;
  }

  // self_reported -> verified (upgrade via evidence)
  if (from === "self_reported" && to === "verified") {
    return true;
  }

  // verified -> self_reported (downgrade if evidence lost)
  if (from === "verified" && to === "self_reported") {
    return true;
  }

  // Same tier is always valid
  if (from === to) {
    return true;
  }

  // auto_detected -> self_reported (override with claim)
  if (from === "auto_detected" && to === "self_reported") {
    return true;
  }

  return false;
}

/**
 * Build confidence map for a project.
 * Ensures null values have null confidence and
 * observatory-managed fields are excluded.
 */
export function buildConfidenceMap(
  project: Omit<ObservatoryProject, "data_confidence">,
  existingConfidence?: Record<string, ConfidenceTier | null>,
): Record<string, ConfidenceTier | null> {
  const confidence: Record<string, ConfidenceTier | null> = {};
  const record = project as unknown as Record<string, unknown>;

  for (const key of Object.keys(record)) {
    if (OBSERVATORY_MANAGED_FIELDS.has(key)) {
      continue;
    }

    const value = record[key];

    if (value === null || value === undefined) {
      confidence[key] = null;
      continue;
    }

    const existing = existingConfidence?.[key];
    if (existing) {
      confidence[key] = existing;
    } else {
      const source = defaultSourceForField(key);
      confidence[key] = assignTier(key, value, source);
    }
  }

  return confidence;
}

/**
 * Validate that a confidence map is consistent with project data.
 * Returns array of error messages (empty = valid).
 */
export function validateConfidenceMap(
  project: ObservatoryProject,
): string[] {
  const errors: string[] = [];
  const record = project as unknown as Record<string, unknown>;

  for (const [field, tier] of Object.entries(
    project.data_confidence,
  )) {
    if (OBSERVATORY_MANAGED_FIELDS.has(field)) {
      errors.push(
        `Field "${field}" is observatory-managed and should ` +
          `not have a confidence tier`,
      );
      continue;
    }

    if (!(field in record)) {
      errors.push(
        `Confidence tier for "${field}" but field does not ` +
          `exist on project`,
      );
      continue;
    }

    const value = record[field];
    if (value === null && tier !== null) {
      errors.push(
        `Field "${field}" is null but has confidence ` +
          `tier "${tier}"`,
      );
    }

    if (value !== null && tier === null) {
      errors.push(
        `Field "${field}" has value but confidence tier is null`,
      );
    }
  }

  return errors;
}
