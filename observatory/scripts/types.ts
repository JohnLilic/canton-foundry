export type ConfidenceTier = "verified" | "self_reported" | "auto_detected";

export type Category =
  | "tokenized-assets"
  | "data-analytics"
  | "naas"
  | "developer-tools"
  | "wallets"
  | "exchanges"
  | "liquidity"
  | "interoperability"
  | "forensics-security"
  | "custody"
  | "stablecoins"
  | "payments"
  | "financing"
  | "compliance";

export const VALID_CATEGORIES: Category[] = [
  "tokenized-assets",
  "data-analytics",
  "naas",
  "developer-tools",
  "wallets",
  "exchanges",
  "liquidity",
  "interoperability",
  "forensics-security",
  "custody",
  "stablecoins",
  "payments",
  "financing",
  "compliance",
];

export interface SecurityAudit {
  auditor: string;
  date: string;
  report_url: string | null;
  scope: string;
}

export interface ObservatoryProject {
  // Identity & Governance
  project_id: string;
  display_name: string;
  entity_name: string | null;
  entity_jurisdiction: string | null;
  foundation_member: boolean;
  validator_status:
    | "super_validator"
    | "validator"
    | "app_provider"
    | "none";
  website_url: string | null;
  contact_url: string | null;
  description: string;
  category: Category[];
  partnerships: string[];

  // Operational Status
  status:
    | "production"
    | "testnet"
    | "development"
    | "inactive"
    | "unknown";
  network: ("mainnet" | "devnet")[];
  canton_sdk_version: string | null;
  last_verified_activity: string | null;
  launch_date: string | null;
  featured_app: boolean | null;

  // Technical Posture
  open_source: boolean;
  repo_url: string | null;
  license_type: string | null;
  security_audit: SecurityAudit | null;
  has_tests: boolean | null;
  test_count: number | null;
  has_ci: boolean | null;
  ci_status:
    | "passing"
    | "failing"
    | "stale"
    | "unknown"
    | null;
  has_documentation: boolean;
  documentation_url: string | null;
  tech_stack: string[];

  // On-Chain Footprint (Phase 2)
  tx_count_30d: number | null;
  tx_count_90d: number | null;
  unique_parties_30d: number | null;
  cc_burned_30d: number | null;
  featured_markers_30d: number | null;
  onchain_since: string | null;

  // Metadata
  created_at: string;
  updated_at: string;
  claimed: boolean;
  claimed_by: string | null;
  claimed_at: string | null;
  data_confidence: Record<string, ConfidenceTier | null>;
  last_auto_refresh: string | null;
  notes: string | null;
}

/** Fields managed by the Observatory (no confidence tier) */
export const OBSERVATORY_MANAGED_FIELDS = new Set([
  "project_id",
  "category",
  "created_at",
  "updated_at",
  "claimed",
  "claimed_by",
  "claimed_at",
  "data_confidence",
  "last_auto_refresh",
  "notes",
  "partnerships",
]);

/** Fields that are always auto-detected from GitHub */
export const AUTO_DETECTED_FIELDS = new Set([
  "last_verified_activity",
  "canton_sdk_version",
  "license_type",
  "has_tests",
  "test_count",
  "has_ci",
  "ci_status",
  "has_documentation",
  "documentation_url",
  "tech_stack",
]);

/** Fields that require manual verification */
export const MANUALLY_VERIFIED_FIELDS = new Set([
  "foundation_member",
  "validator_status",
  "featured_app",
  "security_audit",
  "status",
]);
