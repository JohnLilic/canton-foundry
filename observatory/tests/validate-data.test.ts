import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createValidator,
  validateDataset,
  checkUniqueIds,
  checkIdFormat,
  checkPartnershipRefs,
  checkConfidenceKeys,
  checkDateFields,
} from "../scripts/validate-data.js";
import type { ObservatoryProject } from "../scripts/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadFixtures(): ObservatoryProject[] {
  const raw = readFileSync(
    resolve(__dirname, "fixtures/sample-projects.json"),
    "utf-8",
  );
  return JSON.parse(raw) as ObservatoryProject[];
}

function makeMinimalProject(
  overrides: Partial<ObservatoryProject> = {},
): ObservatoryProject {
  return {
    project_id: "test-project",
    display_name: "Test Project",
    entity_name: null,
    entity_jurisdiction: null,
    foundation_member: false,
    validator_status: "none",
    website_url: null,
    contact_url: null,
    description: "A test project",
    category: ["developer-tools"],
    partnerships: [],
    status: "unknown",
    network: [],
    canton_sdk_version: null,
    last_verified_activity: null,
    launch_date: null,
    featured_app: null,
    open_source: false,
    repo_url: null,
    license_type: null,
    security_audit: null,
    has_tests: null,
    test_count: null,
    has_ci: null,
    ci_status: null,
    has_documentation: false,
    documentation_url: null,
    tech_stack: [],
    tx_count_30d: null,
    tx_count_90d: null,
    unique_parties_30d: null,
    cc_burned_30d: null,
    featured_markers_30d: null,
    onchain_since: null,
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
    claimed: false,
    claimed_by: null,
    claimed_at: null,
    data_confidence: {
      display_name: "verified",
      entity_name: null,
      entity_jurisdiction: null,
      foundation_member: "verified",
      validator_status: "verified",
      website_url: null,
      contact_url: null,
      description: "verified",
      status: "verified",
      network: null,
      canton_sdk_version: null,
      last_verified_activity: null,
      launch_date: null,
      featured_app: null,
      open_source: "verified",
      repo_url: null,
      license_type: null,
      security_audit: null,
      has_tests: null,
      test_count: null,
      has_ci: null,
      ci_status: null,
      has_documentation: "verified",
      documentation_url: null,
      tech_stack: null,
      tx_count_30d: null,
      tx_count_90d: null,
      unique_parties_30d: null,
      cc_burned_30d: null,
      featured_markers_30d: null,
      onchain_since: null,
    },
    last_auto_refresh: null,
    notes: null,
    ...overrides,
  };
}

describe("Schema Validation", () => {
  it("valid fixture data passes validation", () => {
    const data = loadFixtures();
    const validate = createValidator();
    const result = validate(data);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("valid minimal project passes validation", () => {
    const project = makeMinimalProject();
    const validate = createValidator();
    const result = validate([project]);
    expect(result.valid).toBe(true);
  });

  it("missing required field fails validation", () => {
    const project = makeMinimalProject();
    const broken = { ...project } as Record<string, unknown>;
    delete broken["project_id"];

    const validate = createValidator();
    const result = validate([broken]);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => e.includes("project_id"))).toBe(
      true,
    );
  });

  it("invalid enum value fails validation", () => {
    const project = makeMinimalProject({
      status: "nonexistent" as ObservatoryProject["status"],
    });

    const validate = createValidator();
    const result = validate([project]);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("invalid category fails validation", () => {
    const project = makeMinimalProject({
      category: ["invalid_category" as ObservatoryProject["category"][number]],
    });

    const validate = createValidator();
    const result = validate([project]);
    expect(result.valid).toBe(false);
  });

  it("null fields are allowed where specified", () => {
    const project = makeMinimalProject({
      entity_name: null,
      entity_jurisdiction: null,
      website_url: null,
      contact_url: null,
      canton_sdk_version: null,
      last_verified_activity: null,
      launch_date: null,
      featured_app: null,
      repo_url: null,
      license_type: null,
      security_audit: null,
      has_tests: null,
      test_count: null,
      has_ci: null,
      ci_status: null,
      documentation_url: null,
      notes: null,
    });

    const validate = createValidator();
    const result = validate([project]);
    expect(result.valid).toBe(true);
  });

  it("invalid validator_status fails", () => {
    const project = makeMinimalProject({
      validator_status:
        "mega_validator" as ObservatoryProject["validator_status"],
    });

    const validate = createValidator();
    const result = validate([project]);
    expect(result.valid).toBe(false);
  });

  it("invalid jurisdiction format fails", () => {
    const project = makeMinimalProject({
      entity_jurisdiction: "usa",
    });

    const validate = createValidator();
    const result = validate([project]);
    expect(result.valid).toBe(false);
  });

  it("description over 280 chars fails", () => {
    const project = makeMinimalProject({
      description: "x".repeat(281),
    });

    const validate = createValidator();
    const result = validate([project]);
    expect(result.valid).toBe(false);
  });

  it("empty category array fails", () => {
    const project = makeMinimalProject({
      category: [],
    });

    const validate = createValidator();
    const result = validate([project]);
    expect(result.valid).toBe(false);
  });

  it("valid security audit passes", () => {
    const project = makeMinimalProject({
      security_audit: {
        auditor: "Trail of Bits",
        date: "2024-05-15",
        report_url: null,
        scope: "Smart contracts",
      },
      data_confidence: {
        ...makeMinimalProject().data_confidence,
        security_audit: "self_reported",
      },
    });

    const validate = createValidator();
    const result = validate([project]);
    expect(result.valid).toBe(true);
  });

  it("invalid security audit (missing fields) fails", () => {
    const project = makeMinimalProject({
      security_audit: {
        auditor: "Trail of Bits",
      } as ObservatoryProject["security_audit"],
    });

    const validate = createValidator();
    const result = validate([project]);
    expect(result.valid).toBe(false);
  });

  it("negative test_count fails", () => {
    const project = makeMinimalProject({
      has_tests: true,
      test_count: -1,
      data_confidence: {
        ...makeMinimalProject().data_confidence,
        has_tests: "auto_detected",
        test_count: "auto_detected",
      },
    });

    const validate = createValidator();
    const result = validate([project]);
    expect(result.valid).toBe(false);
  });
});

describe("Cross-Reference Checks", () => {
  it("detects duplicate project_ids", () => {
    const p1 = makeMinimalProject({ project_id: "dup" });
    const p2 = makeMinimalProject({ project_id: "dup" });
    const errors = checkUniqueIds([p1, p2]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("Duplicate");
  });

  it("passes with unique project_ids", () => {
    const p1 = makeMinimalProject({ project_id: "a" });
    const p2 = makeMinimalProject({ project_id: "b" });
    const errors = checkUniqueIds([p1, p2]);
    expect(errors).toHaveLength(0);
  });
});

describe("ID Format", () => {
  it("valid id passes", () => {
    const p = makeMinimalProject({ project_id: "canton-patterns" });
    expect(checkIdFormat([p])).toHaveLength(0);
  });

  it("single char id passes", () => {
    const p = makeMinimalProject({ project_id: "a" });
    expect(checkIdFormat([p])).toHaveLength(0);
  });

  it("uppercase fails", () => {
    const p = makeMinimalProject({ project_id: "Canton-Patterns" });
    expect(checkIdFormat([p]).length).toBeGreaterThan(0);
  });

  it("leading hyphen fails", () => {
    const p = makeMinimalProject({ project_id: "-bad" });
    expect(checkIdFormat([p]).length).toBeGreaterThan(0);
  });

  it("trailing hyphen fails", () => {
    const p = makeMinimalProject({ project_id: "bad-" });
    expect(checkIdFormat([p]).length).toBeGreaterThan(0);
  });

  it("spaces fail", () => {
    const p = makeMinimalProject({ project_id: "bad id" });
    expect(checkIdFormat([p]).length).toBeGreaterThan(0);
  });
});

describe("Partnership References", () => {
  it("valid reference passes", () => {
    const p1 = makeMinimalProject({
      project_id: "a",
      partnerships: ["b"],
    });
    const p2 = makeMinimalProject({ project_id: "b" });
    expect(checkPartnershipRefs([p1, p2])).toHaveLength(0);
  });

  it("invalid reference detected", () => {
    const p1 = makeMinimalProject({
      project_id: "a",
      partnerships: ["nonexistent"],
    });
    const errors = checkPartnershipRefs([p1]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("nonexistent");
  });
});

describe("Confidence Keys", () => {
  it("valid confidence map passes", () => {
    const p = makeMinimalProject();
    expect(checkConfidenceKeys([p])).toHaveLength(0);
  });

  it("detects null value with non-null confidence", () => {
    const p = makeMinimalProject({
      repo_url: null,
      data_confidence: {
        ...makeMinimalProject().data_confidence,
        repo_url: "verified",
      },
    });
    const errors = checkConfidenceKeys([p]);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.includes("repo_url"))).toBe(true);
  });

  it("detects confidence key for nonexistent field", () => {
    const p = makeMinimalProject();
    (p.data_confidence as Record<string, unknown>)[
      "nonexistent_field"
    ] = "verified";
    const errors = checkConfidenceKeys([p]);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.includes("nonexistent_field"))).toBe(
      true,
    );
  });

  it("detects observatory-managed field in confidence", () => {
    const p = makeMinimalProject();
    (p.data_confidence as Record<string, unknown>)[
      "project_id"
    ] = "verified";
    const errors = checkConfidenceKeys([p]);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.includes("observatory-managed"))).toBe(
      true,
    );
  });
});

describe("Date Fields", () => {
  it("valid dates pass", () => {
    const p = makeMinimalProject({
      last_verified_activity: "2025-01-15",
      launch_date: "2024-06-01",
    });
    expect(checkDateFields([p])).toHaveLength(0);
  });

  it("invalid date string detected", () => {
    const p = makeMinimalProject({
      last_verified_activity: "not-a-date",
    });
    const errors = checkDateFields([p]);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("null dates pass", () => {
    const p = makeMinimalProject({
      last_verified_activity: null,
      launch_date: null,
    });
    expect(checkDateFields([p])).toHaveLength(0);
  });
});

describe("Full Dataset Validation", () => {
  it("fixture data passes full validation", () => {
    const data = loadFixtures();
    const result = validateDataset(data);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("non-array input fails", () => {
    const result = validateDataset({ not: "an array" });
    expect(result.valid).toBe(false);
  });

  it("empty array passes", () => {
    const result = validateDataset([]);
    expect(result.valid).toBe(true);
  });
});
