import { describe, it, expect } from "vitest";
import {
  assignTier,
  defaultSourceForField,
  isValidTransition,
  buildConfidenceMap,
  validateConfidenceMap,
} from "../scripts/utils/confidence.js";
import type { ObservatoryProject } from "../scripts/types.js";

describe("assignTier", () => {
  it("returns null for null values", () => {
    expect(assignTier("repo_url", null, "auto")).toBeNull();
  });

  it("returns null for undefined values", () => {
    expect(assignTier("repo_url", undefined, "auto")).toBeNull();
  });

  it("returns null for observatory-managed fields", () => {
    expect(assignTier("project_id", "test", "auto")).toBeNull();
    expect(assignTier("created_at", "2025-01-01", "auto")).toBeNull();
    expect(assignTier("data_confidence", {}, "auto")).toBeNull();
  });

  it("returns verified for manual source", () => {
    expect(assignTier("status", "production", "manual")).toBe(
      "verified",
    );
  });

  it("returns self_reported for self_reported source", () => {
    expect(
      assignTier("entity_jurisdiction", "US", "self_reported"),
    ).toBe("self_reported");
  });

  it("returns auto_detected for auto source", () => {
    expect(assignTier("has_tests", true, "auto")).toBe(
      "auto_detected",
    );
  });
});

describe("defaultSourceForField", () => {
  it("returns auto for auto-detected fields", () => {
    expect(defaultSourceForField("has_tests")).toBe("auto");
    expect(defaultSourceForField("ci_status")).toBe("auto");
    expect(defaultSourceForField("license_type")).toBe("auto");
    expect(defaultSourceForField("tech_stack")).toBe("auto");
  });

  it("returns manual for manually verified fields", () => {
    expect(defaultSourceForField("foundation_member")).toBe("manual");
    expect(defaultSourceForField("validator_status")).toBe("manual");
    expect(defaultSourceForField("featured_app")).toBe("manual");
    expect(defaultSourceForField("security_audit")).toBe("manual");
    expect(defaultSourceForField("status")).toBe("manual");
  });

  it("returns self_reported for other fields", () => {
    expect(defaultSourceForField("display_name")).toBe(
      "self_reported",
    );
    expect(defaultSourceForField("entity_jurisdiction")).toBe(
      "self_reported",
    );
    expect(defaultSourceForField("website_url")).toBe(
      "self_reported",
    );
  });
});

describe("isValidTransition", () => {
  it("allows null transitions", () => {
    expect(isValidTransition(null, "verified")).toBe(true);
    expect(isValidTransition("verified", null)).toBe(true);
    expect(isValidTransition(null, null)).toBe(true);
  });

  it("allows same-tier transitions", () => {
    expect(isValidTransition("verified", "verified")).toBe(true);
    expect(
      isValidTransition("auto_detected", "auto_detected"),
    ).toBe(true);
    expect(
      isValidTransition("self_reported", "self_reported"),
    ).toBe(true);
  });

  it("allows upgrades to verified", () => {
    expect(isValidTransition("auto_detected", "verified")).toBe(true);
    expect(isValidTransition("self_reported", "verified")).toBe(true);
  });

  it("allows downgrade from verified to self_reported", () => {
    expect(isValidTransition("verified", "self_reported")).toBe(true);
  });

  it("allows auto_detected to self_reported", () => {
    expect(
      isValidTransition("auto_detected", "self_reported"),
    ).toBe(true);
  });

  it("rejects verified to auto_detected", () => {
    expect(isValidTransition("verified", "auto_detected")).toBe(
      false,
    );
  });

  it("rejects self_reported to auto_detected", () => {
    expect(
      isValidTransition("self_reported", "auto_detected"),
    ).toBe(false);
  });
});

describe("buildConfidenceMap", () => {
  it("builds map for project with null values", () => {
    const project = {
      project_id: "test",
      display_name: "Test",
      entity_name: null,
      entity_jurisdiction: null,
      foundation_member: false,
      validator_status: "none" as const,
      website_url: null,
      contact_url: null,
      description: "Test",
      category: ["devtools" as const],
      partnerships: [],
      status: "unknown" as const,
      network: [] as ("mainnet" | "devnet")[],
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
      tech_stack: [] as string[],
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
      last_auto_refresh: null,
      notes: null,
    };

    const map = buildConfidenceMap(project);

    // Null values should have null confidence
    expect(map["entity_name"]).toBeNull();
    expect(map["repo_url"]).toBeNull();
    expect(map["canton_sdk_version"]).toBeNull();

    // Non-null values should have appropriate tiers
    expect(map["foundation_member"]).toBe("verified");
    expect(map["has_documentation"]).toBe("auto_detected");
    expect(map["open_source"]).toBe("self_reported");

    // Observatory-managed fields should not be in the map
    expect(map["project_id"]).toBeUndefined();
    expect(map["created_at"]).toBeUndefined();
    expect(map["data_confidence"]).toBeUndefined();
  });

  it("preserves existing confidence tiers", () => {
    const project = {
      project_id: "test",
      display_name: "Test",
      entity_name: null,
      entity_jurisdiction: null,
      foundation_member: true,
      validator_status: "none" as const,
      website_url: null,
      contact_url: null,
      description: "Test",
      category: ["devtools" as const],
      partnerships: [],
      status: "production" as const,
      network: ["mainnet" as const],
      canton_sdk_version: "2.9.0",
      last_verified_activity: "2025-01-15",
      launch_date: null,
      featured_app: null,
      open_source: true,
      repo_url: "https://github.com/test/test",
      license_type: "MIT",
      security_audit: null,
      has_tests: true,
      test_count: 10,
      has_ci: true,
      ci_status: "passing" as const,
      has_documentation: true,
      documentation_url: "https://docs.test.com",
      tech_stack: ["Daml"],
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
      last_auto_refresh: null,
      notes: null,
    };

    const existing = {
      has_tests: "verified" as const,
      license_type: "self_reported" as const,
    };

    const map = buildConfidenceMap(project, existing);
    expect(map["has_tests"]).toBe("verified");
    expect(map["license_type"]).toBe("self_reported");
  });
});

describe("validateConfidenceMap", () => {
  it("returns no errors for valid project", () => {
    const project: ObservatoryProject = {
      project_id: "test",
      display_name: "Test",
      entity_name: null,
      entity_jurisdiction: null,
      foundation_member: false,
      validator_status: "none",
      website_url: null,
      contact_url: null,
      description: "Test",
      category: ["devtools"],
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
        network: "verified",
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
        has_documentation: "auto_detected",
        documentation_url: null,
        tech_stack: "auto_detected",
        tx_count_30d: null,
        tx_count_90d: null,
        unique_parties_30d: null,
        cc_burned_30d: null,
        featured_markers_30d: null,
        onchain_since: null,
      },
      last_auto_refresh: null,
      notes: null,
    };

    const errors = validateConfidenceMap(project);
    expect(errors).toHaveLength(0);
  });

  it("detects null value with non-null confidence", () => {
    const project: ObservatoryProject = {
      project_id: "test",
      display_name: "Test",
      entity_name: null,
      entity_jurisdiction: null,
      foundation_member: false,
      validator_status: "none",
      website_url: null,
      contact_url: null,
      description: "Test",
      category: ["devtools"],
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
        repo_url: "verified",
      },
      last_auto_refresh: null,
      notes: null,
    };

    const errors = validateConfidenceMap(project);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.includes("repo_url"))).toBe(true);
  });
});
