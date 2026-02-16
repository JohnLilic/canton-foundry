import {
  GitHubClient,
  isGitHubError,
  parseRepoUrl,
} from "./utils/github-client.js";
import type { ObservatoryProject } from "./types.js";

interface TreeEntry {
  path: string;
  type: string;
  size?: number;
}

interface TreeResponse {
  tree: TreeEntry[];
  truncated: boolean;
}

interface CommitResponse {
  commit: { author: { date: string } };
}

interface LicenseResponse {
  license: { spdx_id: string };
}

interface RepoResponse {
  archived: boolean;
  has_pages: boolean;
  default_branch: string;
  fork: boolean;
}

interface WorkflowRun {
  conclusion: string;
  updated_at: string;
}

interface WorkflowRunsResponse {
  workflow_runs: WorkflowRun[];
}

interface LanguagesResponse {
  [key: string]: number;
}

interface FileContentResponse {
  content: string;
  encoding: string;
  size: number;
}

export interface CollectionResult {
  fields: Partial<ObservatoryProject>;
  notes: string[];
}

const TEST_FILE_PATTERNS = {
  daml: /Test\.daml$|Tests\.daml$/,
  typescript: /\.test\.ts$|\.spec\.ts$|__tests__\//,
  javascript: /\.test\.js$|\.spec\.js$|__tests__\//,
  java: /^src\/test\//,
  python: /test_.*\.py$|_test\.py$/,
};

const CODE_EXTENSIONS = new Set([
  ".ts",
  ".js",
  ".py",
  ".java",
  ".scala",
  ".daml",
  ".hs",
  ".rs",
  ".go",
  ".rb",
  ".kt",
]);

const CI_CONFIG_PATTERNS = [
  /^\.github\/workflows\/.*\.ya?ml$/,
  /^\.circleci\/config\.yml$/,
  /^Jenkinsfile$/,
  /^\.gitlab-ci\.yml$/,
  /^\.travis\.yml$/,
];

const FRAMEWORK_FILES: Record<string, string> = {
  "package.json": "Node.js",
  "daml.yaml": "Daml",
  "build.sbt": "Scala",
  "pom.xml": "Java/Maven",
  "Cargo.toml": "Rust",
  "go.mod": "Go",
  "requirements.txt": "Python",
  "pyproject.toml": "Python",
};

const STALE_CI_DAYS = 90;

/**
 * Collect all auto-detected fields for a project
 * from its GitHub repository.
 */
export async function collectFromGitHub(
  client: GitHubClient,
  repoUrl: string,
): Promise<CollectionResult> {
  const parsed = parseRepoUrl(repoUrl);
  if (!parsed) {
    return {
      fields: {},
      notes: [`Could not parse repo URL: ${repoUrl}`],
    };
  }

  const { owner, repo } = parsed;
  const notes: string[] = [];
  const fields: Partial<ObservatoryProject> = {};

  // Get repo metadata first (we need default_branch)
  let repoMeta: RepoResponse | null = null;
  try {
    const response = await client.get<RepoResponse>(
      `/repos/${owner}/${repo}`,
    );
    repoMeta = response.data;
    if (repoMeta.archived) {
      notes.push("Repository is archived");
    }
  } catch (error) {
    if (isGitHubError(error) && error.status === 404) {
      notes.push("Repository not found");
      return { fields, notes };
    }
    throw error;
  }

  // Get tree for file-based checks
  let tree: TreeEntry[] = [];
  let treeTruncated = false;
  try {
    const treeResponse = await client.get<TreeResponse>(
      `/repos/${owner}/${repo}/git/trees/` +
        `${repoMeta.default_branch}?recursive=1`,
    );
    tree = treeResponse.data.tree;
    treeTruncated = treeResponse.data.truncated;
    if (treeTruncated) {
      notes.push(
        "Repository too large for complete scan",
      );
    }
  } catch (error) {
    if (isGitHubError(error) && error.status === 409) {
      notes.push("Empty repository");
    } else {
      notes.push(
        `Could not fetch file tree: ${
          isGitHubError(error) ? error.message : "unknown"
        }`,
      );
    }
  }

  // Collect all fields concurrently
  const results = await Promise.allSettled([
    collectLastActivity(client, owner, repo, notes),
    collectSdkVersion(client, owner, repo, tree, notes),
    collectLicense(client, owner, repo, notes),
    collectTests(tree, treeTruncated, notes),
    collectCi(client, owner, repo, tree, notes),
    collectDocumentation(
      client,
      owner,
      repo,
      tree,
      repoMeta,
      notes,
    ),
    collectTechStack(client, owner, repo, tree, notes),
  ]);

  const settled = <T>(
    r: PromiseSettledResult<T>,
  ): T | null =>
    r.status === "fulfilled" ? r.value : null;

  const activity = settled(results[0]!);
  const sdk = settled(results[1]!);
  const license = settled(results[2]!);
  const tests = settled(results[3]!);
  const ci = settled(results[4]!);
  const docs = settled(results[5]!);
  const techStack = settled(results[6]!);

  if (activity) {
    fields.last_verified_activity =
      activity.last_verified_activity;
  }
  if (sdk) {
    fields.canton_sdk_version = sdk.canton_sdk_version;
  }
  if (license) {
    fields.license_type = license.license_type;
  }
  if (tests) {
    fields.has_tests = tests.has_tests;
    fields.test_count = tests.test_count;
  }
  if (ci) {
    fields.has_ci = ci.has_ci;
    fields.ci_status = ci.ci_status;
  }
  if (docs) {
    fields.has_documentation = docs.has_documentation;
    if (docs.documentation_url) {
      fields.documentation_url = docs.documentation_url;
    }
  }
  if (techStack) {
    fields.tech_stack = techStack.tech_stack;
  }

  return { fields, notes };
}

export async function collectLastActivity(
  client: GitHubClient,
  owner: string,
  repo: string,
  notes: string[],
): Promise<{ last_verified_activity: string | null }> {
  try {
    const response = await client.get<CommitResponse[]>(
      `/repos/${owner}/${repo}/commits?per_page=1`,
    );

    if (response.data.length === 0) {
      notes.push("No commits found");
      return { last_verified_activity: null };
    }

    const commitDate =
      response.data[0]?.commit.author.date;
    if (!commitDate) {
      return { last_verified_activity: null };
    }

    // Return date portion only (YYYY-MM-DD)
    return {
      last_verified_activity: commitDate.substring(0, 10),
    };
  } catch (error) {
    if (isGitHubError(error) && error.status === 409) {
      notes.push("Empty repository");
      return { last_verified_activity: null };
    }
    if (isGitHubError(error)) {
      notes.push(
        `Could not fetch commits: ${error.message}`,
      );
      return { last_verified_activity: null };
    }
    throw error;
  }
}

export async function collectSdkVersion(
  client: GitHubClient,
  owner: string,
  repo: string,
  tree: TreeEntry[],
  notes: string[],
): Promise<{ canton_sdk_version: string | null }> {
  // First, try root daml.yaml
  const content = await client.getFileContent(
    owner,
    repo,
    "daml.yaml",
  );

  if (content) {
    const version = parseSdkVersion(content);
    if (version) {
      return { canton_sdk_version: version };
    }
    notes.push("Could not parse daml.yaml");
    return { canton_sdk_version: null };
  }

  // Fallback: search tree for daml.yaml files
  const damlYamls = tree
    .filter(
      (e) =>
        e.type === "blob" && e.path.endsWith("/daml.yaml"),
    )
    .map((e) => e.path);

  if (damlYamls.length === 0) {
    return { canton_sdk_version: null };
  }

  const versions: string[] = [];
  for (const path of damlYamls) {
    const fileContent = await client.getFileContent(
      owner,
      repo,
      path,
    );
    if (fileContent) {
      const v = parseSdkVersion(fileContent);
      if (v) {
        versions.push(v);
      }
    }
  }

  if (versions.length === 0) {
    notes.push("Could not parse any daml.yaml files");
    return { canton_sdk_version: null };
  }

  if (versions.length > 1) {
    const unique = [...new Set(versions)];
    if (unique.length > 1) {
      notes.push(
        `Multiple SDK versions detected: ${unique.join(", ")}`,
      );
    }
  }

  // Return highest semver
  versions.sort(compareSemver);
  const highest = versions[versions.length - 1] ?? null;
  return { canton_sdk_version: highest };
}

export function parseSdkVersion(
  yamlContent: string,
): string | null {
  const match = yamlContent.match(
    /^sdk-version:\s*(.+)$/m,
  );
  if (!match?.[1]) {
    return null;
  }
  return match[1].trim();
}

function compareSemver(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na !== nb) {
      return na - nb;
    }
  }
  return 0;
}

export async function collectLicense(
  client: GitHubClient,
  owner: string,
  repo: string,
  notes: string[],
): Promise<{ license_type: string | null }> {
  try {
    const response = await client.get<LicenseResponse>(
      `/repos/${owner}/${repo}/license`,
    );

    const spdxId = response.data.license.spdx_id;
    if (spdxId === "NOASSERTION") {
      return { license_type: "Custom" };
    }
    return { license_type: spdxId };
  } catch (error) {
    if (isGitHubError(error) && error.status === 404) {
      notes.push("No license detected");
      return { license_type: null };
    }
    if (isGitHubError(error)) {
      notes.push(
        `Could not fetch license: ${error.message}`,
      );
      return { license_type: null };
    }
    throw error;
  }
}

export function collectTests(
  tree: TreeEntry[],
  truncated: boolean,
  notes: string[],
): {
  has_tests: boolean | null;
  test_count: number | null;
} {
  if (tree.length === 0) {
    return { has_tests: null, test_count: null };
  }

  const testFiles = tree.filter((entry) => {
    if (entry.type !== "blob") return false;

    // Only code file extensions
    const ext = getExtension(entry.path);
    if (!CODE_EXTENSIONS.has(ext) && !ext.endsWith(".daml")) {
      return false;
    }

    return Object.values(TEST_FILE_PATTERNS).some((p) =>
      p.test(entry.path),
    );
  });

  if (testFiles.length === 0) {
    return { has_tests: false, test_count: null };
  }

  if (truncated) {
    notes.push(
      "Test count may be incomplete due to large repo",
    );
    return { has_tests: true, test_count: null };
  }

  notes.push(
    `Found ${testFiles.length} test files (approximate count)`,
  );
  return {
    has_tests: true,
    test_count: testFiles.length,
  };
}

export async function collectCi(
  client: GitHubClient,
  owner: string,
  repo: string,
  tree: TreeEntry[],
  notes: string[],
): Promise<{
  has_ci: boolean | null;
  ci_status: ObservatoryProject["ci_status"];
}> {
  if (tree.length === 0) {
    return { has_ci: null, ci_status: null };
  }

  const ciFiles = tree.filter(
    (e) =>
      e.type === "blob" &&
      CI_CONFIG_PATTERNS.some((p) => p.test(e.path)),
  );

  if (ciFiles.length === 0) {
    return { has_ci: false, ci_status: null };
  }

  const hasGitHubActions = ciFiles.some((f) =>
    f.path.startsWith(".github/workflows/"),
  );

  if (!hasGitHubActions) {
    notes.push("Non-GitHub CI detected; status unknown");
    return { has_ci: true, ci_status: "unknown" };
  }

  try {
    const response =
      await client.get<WorkflowRunsResponse>(
        `/repos/${owner}/${repo}/actions/runs` +
          `?per_page=1&status=completed`,
      );

    const runs = response.data.workflow_runs;
    if (runs.length === 0) {
      return { has_ci: true, ci_status: "unknown" };
    }

    const run = runs[0];
    if (!run) {
      return { has_ci: true, ci_status: "unknown" };
    }

    // Check stale rule
    const updatedAt = new Date(run.updated_at);
    const now = new Date();
    const daysSince = Math.floor(
      (now.getTime() - updatedAt.getTime()) /
        (1000 * 60 * 60 * 24),
    );

    if (daysSince > STALE_CI_DAYS) {
      notes.push(
        `Last CI run was ${daysSince} days ago (stale)`,
      );
      return { has_ci: true, ci_status: "stale" };
    }

    const ciStatus =
      run.conclusion === "success"
        ? "passing"
        : run.conclusion === "failure"
          ? "failing"
          : "unknown";

    return {
      has_ci: true,
      ci_status:
        ciStatus as ObservatoryProject["ci_status"],
    };
  } catch (error) {
    if (isGitHubError(error)) {
      notes.push(`Could not fetch CI runs: ${error.message}`);
    }
    return { has_ci: true, ci_status: "unknown" };
  }
}

export async function collectDocumentation(
  client: GitHubClient,
  owner: string,
  repo: string,
  tree: TreeEntry[],
  repoMeta: RepoResponse | null,
  notes: string[],
): Promise<{
  has_documentation: boolean;
  documentation_url: string | null;
}> {
  if (tree.length === 0) {
    return {
      has_documentation: false,
      documentation_url: null,
    };
  }

  // Check for docs/ with content files
  const docsFiles = tree.filter(
    (e) =>
      e.type === "blob" &&
      e.path.startsWith("docs/") &&
      /\.(md|html|rst)$/.test(e.path) &&
      !e.path.endsWith(".gitkeep"),
  );

  if (docsFiles.length > 0) {
    return {
      has_documentation: true,
      documentation_url: null,
    };
  }

  // Check README size
  const readme = tree.find(
    (e) =>
      e.type === "blob" &&
      e.path.toLowerCase() === "readme.md",
  );

  if (readme) {
    try {
      const response = await client.get<FileContentResponse>(
        `/repos/${owner}/${repo}/contents/README.md`,
      );
      if (response.data.size > 500) {
        return {
          has_documentation: true,
          documentation_url: null,
        };
      }
    } catch {
      // Fall through
    }
  }

  // Check for OpenAPI specs
  const apiSpecs = tree.filter(
    (e) =>
      e.type === "blob" &&
      /^(openapi|swagger)\.(ya?ml|json)$/.test(e.path),
  );

  if (apiSpecs.length > 0) {
    return {
      has_documentation: true,
      documentation_url: null,
    };
  }

  // Check GitHub Pages
  if (repoMeta?.has_pages) {
    return {
      has_documentation: true,
      documentation_url:
        `https://${owner}.github.io/${repo}`,
    };
  }

  return {
    has_documentation: false,
    documentation_url: null,
  };
}

export async function collectTechStack(
  client: GitHubClient,
  owner: string,
  repo: string,
  tree: TreeEntry[],
  notes: string[],
): Promise<{ tech_stack: string[] }> {
  const stack: Set<string> = new Set();

  // Get languages
  try {
    const response = await client.get<LanguagesResponse>(
      `/repos/${owner}/${repo}/languages`,
    );

    const total = Object.values(response.data).reduce(
      (sum, bytes) => sum + bytes,
      0,
    );

    if (total > 0) {
      for (const [lang, bytes] of Object.entries(
        response.data,
      )) {
        if (bytes / total > 0.05) {
          stack.add(lang);
        }
      }
    }
  } catch (error) {
    if (isGitHubError(error)) {
      notes.push(
        `Could not fetch languages: ${error.message}`,
      );
    }
  }

  // Detect frameworks from files
  for (const entry of tree) {
    if (entry.type !== "blob") continue;
    const basename = entry.path.split("/").pop() ?? "";
    const framework = FRAMEWORK_FILES[basename];
    if (framework) {
      stack.add(framework);
    }
  }

  return { tech_stack: [...stack].sort() };
}

function getExtension(path: string): string {
  const dot = path.lastIndexOf(".");
  if (dot === -1) return "";
  return path.substring(dot);
}
