/**
 * Migrate ecosystem.json (sourced from canton.network)
 * to Observatory format. Converts ~209 projects from the
 * canton.network scrape format to ObservatoryProject schema.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  ObservatoryProject,
  Category,
  ConfidenceTier,
} from "./types.js";
import { validateDataset } from "./validate-data.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface CantonNetworkProject {
  slug: string;
  name: string;
  description: string | null;
  categories: string[];
  canton_networks: string[];
  foundation_member: boolean;
  source_url: string;
  scraped_from: string;
  scraped_at: string;
  data_note: string;
}

const CATEGORY_MAP: Record<string, Category> = {
  "Tokenized Assets": "tokenized-assets",
  "Data & Analytics": "data-analytics",
  NaaS: "naas",
  "Developer Tools": "developer-tools",
  Wallets: "wallets",
  Exchanges: "exchanges",
  Liquidity: "liquidity",
  Interoperability: "interoperability",
  "Forensics & Security": "forensics-security",
  Custody: "custody",
  Stablecoins: "stablecoins",
  Payments: "payments",
  Financing: "financing",
  Compliance: "compliance",
};

function mapCategories(cats: string[]): Category[] {
  const mapped: Category[] = [];
  for (const cat of cats) {
    const m = CATEGORY_MAP[cat];
    if (m) {
      mapped.push(m);
    } else {
      console.warn(
        `Unknown category: "${cat}", skipping`,
      );
    }
  }
  if (mapped.length === 0) {
    return ["naas"];
  }
  return mapped;
}

function sanitizeSlug(slug: string): string {
  return slug
    .replace(/\./g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");
}

function convertProject(
  src: CantonNetworkProject,
  now: string,
): ObservatoryProject {
  const categories = mapCategories(src.categories);
  const description = src.description
    ? src.description.substring(0, 280)
    : `${src.name} — Canton Network ecosystem participant`;

  const confidence: Record<string, ConfidenceTier | null> =
    {
      display_name: "verified",
      entity_name: null,
      entity_jurisdiction: null,
      foundation_member: "verified",
      validator_status: null,
      website_url: "verified",
      contact_url: null,
      description: src.description
        ? "verified"
        : "self_reported",
      status: null,
      network: null,
      canton_sdk_version: null,
      last_verified_activity: null,
      launch_date: null,
      featured_app: null,
      open_source: null,
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
    };

  return {
    project_id: sanitizeSlug(src.slug),
    display_name: src.name,
    entity_name: null,
    entity_jurisdiction: null,
    foundation_member: src.foundation_member,
    validator_status: "none",
    website_url: src.source_url,
    contact_url: null,
    description,
    category: categories,
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
    has_documentation: true,
    documentation_url: null,
    tech_stack: [],
    tx_count_30d: null,
    tx_count_90d: null,
    unique_parties_30d: null,
    cc_burned_30d: null,
    featured_markers_30d: null,
    onchain_since: null,
    created_at: now,
    updated_at: now,
    claimed: false,
    claimed_by: null,
    claimed_at: null,
    data_confidence: confidence,
    last_auto_refresh: null,
    notes: src.data_note || null,
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
    projects: CantonNetworkProject[];
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
