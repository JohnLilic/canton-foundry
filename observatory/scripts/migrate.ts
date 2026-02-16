/**
 * Migrate existing ecosystem.json to Observatory format.
 * Converts ~62 projects from the simple ecosystem directory
 * format to the full ObservatoryProject schema.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  ObservatoryProject,
  Category,
  ConfidenceTier,
} from "./types.js";
import { VALID_CATEGORIES } from "./types.js";
import { validateDataset } from "./validate-data.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface EcosystemProject {
  name: string;
  description: string;
  category: string;
  url: string | null;
  github: string | null;
  status: string;
  openSource: boolean;
  cantonFoundry: boolean;
  stack: string[];
  relatedTo: string[];
  installCommand: string | null;
  mcpConfig: string | null;
  addedDate: string;
  featuredApp: boolean | null;
}

const CATEGORY_MAP: Record<string, Category> = {
  DeFi: "defi",
  DEX: "dex",
  Lending: "lending",
  Tokenization: "tokenization",
  Wallets: "wallets",
  DevTools: "devtools",
  Analytics: "analytics",
  Infrastructure: "infrastructure",
  Bridges: "bridges",
  AI: "ai",
  Payments: "payments",
  Identity: "identity",
  NaaS: "naas",
};

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function mapCategory(cat: string): Category {
  const mapped = CATEGORY_MAP[cat];
  if (!mapped) {
    console.warn(`Unknown category: "${cat}", defaulting to "infrastructure"`);
    return "infrastructure";
  }
  return mapped;
}

function convertProject(
  src: EcosystemProject,
  now: string,
): ObservatoryProject {
  const projectId = slugify(src.name);
  const category = mapCategory(src.category);
  const isFeatured = src.featuredApp === true;

  const confidence: Record<string, ConfidenceTier | null> = {
    display_name: "verified",
    entity_name: null,
    entity_jurisdiction: null,
    foundation_member: "verified",
    validator_status: "verified",
    website_url: src.url ? "self_reported" : null,
    contact_url: null,
    description: "self_reported",
    status: "self_reported",
    network: null,
    canton_sdk_version: null,
    last_verified_activity: null,
    launch_date: null,
    featured_app: isFeatured ? "verified" : null,
    open_source: "verified",
    repo_url: src.github ? "verified" : null,
    license_type: null,
    security_audit: null,
    has_tests: null,
    test_count: null,
    has_ci: null,
    ci_status: null,
    has_documentation: "self_reported",
    documentation_url: null,
    tech_stack: src.stack.length > 0 ? "self_reported" : null,
    tx_count_30d: null,
    tx_count_90d: null,
    unique_parties_30d: null,
    cc_burned_30d: null,
    featured_markers_30d: null,
    onchain_since: null,
  };

  // For non-null featured_app false, set confidence
  if (src.featuredApp === false) {
    confidence["featured_app"] = "verified";
  }

  return {
    project_id: projectId,
    display_name: src.name,
    entity_name: null,
    entity_jurisdiction: null,
    foundation_member: false,
    validator_status: "none",
    website_url: src.url,
    contact_url: null,
    description: src.description.substring(0, 280),
    category: [category],
    partnerships: [],
    status: "unknown",
    network: [],
    canton_sdk_version: null,
    last_verified_activity: null,
    launch_date: null,
    featured_app: src.featuredApp ?? null,
    open_source: src.openSource,
    repo_url: src.github,
    license_type: null,
    security_audit: null,
    has_tests: null,
    test_count: null,
    has_ci: null,
    ci_status: null,
    has_documentation: src.url !== null,
    documentation_url: null,
    tech_stack: src.stack,
    tx_count_30d: null,
    tx_count_90d: null,
    unique_parties_30d: null,
    cc_burned_30d: null,
    featured_markers_30d: null,
    onchain_since: null,
    created_at: now,
    updated_at: now,
    claimed: src.cantonFoundry,
    claimed_by: src.cantonFoundry ? "canton-foundry" : null,
    claimed_at: src.cantonFoundry ? now : null,
    data_confidence: confidence,
    last_auto_refresh: null,
    notes: null,
  };
}

function main(): void {
  const sourcePath = resolve(
    __dirname,
    "../../ecosystem/ecosystem.json",
  );
  const outputPath = resolve(
    __dirname,
    "../data/ecosystem-observatory.json",
  );

  console.log(`Reading source: ${sourcePath}`);
  const raw = readFileSync(sourcePath, "utf-8");
  const source = JSON.parse(raw) as {
    projects: EcosystemProject[];
  };

  const now = new Date().toISOString();

  console.log(
    `Converting ${source.projects.length} projects...`,
  );
  const projects = source.projects.map((p) =>
    convertProject(p, now),
  );

  // Check for duplicate IDs and resolve
  const ids = new Map<string, number>();
  for (const p of projects) {
    const count = ids.get(p.project_id) ?? 0;
    if (count > 0) {
      p.project_id = `${p.project_id}-${count + 1}`;
    }
    ids.set(
      p.project_id.replace(/-\d+$/, ""),
      count + 1,
    );
  }

  // Validate
  console.log("Validating...");
  const result = validateDataset(projects);

  if (!result.valid) {
    console.error("Validation errors:");
    for (const err of result.errors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  }

  writeFileSync(
    outputPath,
    JSON.stringify(projects, null, 2) + "\n",
  );
  console.log(
    `Wrote ${projects.length} projects to ${outputPath}`,
  );
  console.log("Validation passed.");
}

main();
