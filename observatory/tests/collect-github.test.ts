import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  collectLastActivity,
  collectSdkVersion,
  collectLicense,
  collectTests,
  collectCi,
  collectDocumentation,
  collectTechStack,
  collectFromGitHub,
  parseSdkVersion,
} from "../scripts/collect-github.js";
import {
  GitHubClient,
  isGitHubError,
  parseRepoUrl,
} from "../scripts/utils/github-client.js";
import type { GitHubError } from "../scripts/utils/github-client.js";

// Create a mock client that returns controlled responses
function createMockClient(
  responses: Record<string, unknown>,
): GitHubClient {
  const client = new GitHubClient({ token: "test-token" });

  // Override the get method
  vi.spyOn(client, "get").mockImplementation(
    async (path: string) => {
      for (const [pattern, response] of Object.entries(
        responses,
      )) {
        if (path.includes(pattern)) {
          if (response === null) {
            throw {
              status: 404,
              message: "Not found",
              retryable: false,
            } satisfies GitHubError;
          }
          if (
            typeof response === "object" &&
            response !== null &&
            "___error" in response
          ) {
            const err = response as unknown as GitHubError;
            throw err;
          }
          return {
            data: response,
            status: 200,
            rateLimit: { remaining: 4999, reset: 0 },
          };
        }
      }
      throw {
        status: 404,
        message: `No mock for path: ${path}`,
        retryable: false,
      } satisfies GitHubError;
    },
  );

  vi.spyOn(client, "getFileContent").mockImplementation(
    async (_owner: string, _repo: string, path: string) => {
      const key = `file:${path}`;
      if (key in responses) {
        return responses[key] as string | null;
      }
      return null;
    },
  );

  return client;
}

describe("parseRepoUrl", () => {
  it("parses standard GitHub URL", () => {
    const result = parseRepoUrl(
      "https://github.com/JohnLilic/canton-patterns",
    );
    expect(result).toEqual({
      owner: "JohnLilic",
      repo: "canton-patterns",
    });
  });

  it("parses URL with .git suffix", () => {
    const result = parseRepoUrl(
      "https://github.com/JohnLilic/canton-patterns.git",
    );
    expect(result).toEqual({
      owner: "JohnLilic",
      repo: "canton-patterns",
    });
  });

  it("parses URL with trailing slash", () => {
    const result = parseRepoUrl(
      "https://github.com/JohnLilic/canton-patterns/",
    );
    expect(result).toEqual({
      owner: "JohnLilic",
      repo: "canton-patterns",
    });
  });

  it("returns null for non-GitHub URL", () => {
    expect(parseRepoUrl("https://gitlab.com/foo/bar")).toBeNull();
  });

  it("returns null for invalid URL", () => {
    expect(parseRepoUrl("not-a-url")).toBeNull();
  });
});

describe("parseSdkVersion", () => {
  it("parses standard daml.yaml", () => {
    expect(
      parseSdkVersion("sdk-version: 2.9.0\nname: my-app\n"),
    ).toBe("2.9.0");
  });

  it("returns null for missing sdk-version", () => {
    expect(parseSdkVersion("name: my-app\nversion: 1.0.0\n")).toBeNull();
  });

  it("handles extra whitespace", () => {
    expect(parseSdkVersion("sdk-version:  2.8.1 \n")).toBe("2.8.1");
  });
});

describe("collectLastActivity", () => {
  it("extracts date from latest commit", async () => {
    const client = createMockClient({
      "/commits": [
        {
          commit: {
            author: { date: "2025-01-15T10:30:00Z" },
          },
        },
      ],
    });

    const notes: string[] = [];
    const result = await collectLastActivity(
      client,
      "owner",
      "repo",
      notes,
    );
    expect(result.last_verified_activity).toBe("2025-01-15");
    expect(notes).toHaveLength(0);
  });

  it("returns null for empty repo (no commits)", async () => {
    const client = createMockClient({
      "/commits": [],
    });

    const notes: string[] = [];
    const result = await collectLastActivity(
      client,
      "owner",
      "repo",
      notes,
    );
    expect(result.last_verified_activity).toBeNull();
    expect(notes).toContain("No commits found");
  });

  it("returns null for 409 (empty repo)", async () => {
    const client = createMockClient({
      "/commits": {
        ___error: true,
        status: 409,
        message: "Conflict",
        retryable: false,
      },
    });

    const notes: string[] = [];
    const result = await collectLastActivity(
      client,
      "owner",
      "repo",
      notes,
    );
    expect(result.last_verified_activity).toBeNull();
    expect(notes).toContain("Empty repository");
  });
});

describe("collectSdkVersion", () => {
  it("extracts version from root daml.yaml", async () => {
    const client = createMockClient({
      "file:daml.yaml": "sdk-version: 2.9.0\nname: test\n",
    });

    const notes: string[] = [];
    const result = await collectSdkVersion(
      client,
      "owner",
      "repo",
      [],
      notes,
    );
    expect(result.canton_sdk_version).toBe("2.9.0");
  });

  it("returns null when no daml.yaml exists", async () => {
    const client = createMockClient({});

    const notes: string[] = [];
    const result = await collectSdkVersion(
      client,
      "owner",
      "repo",
      [],
      notes,
    );
    expect(result.canton_sdk_version).toBeNull();
  });

  it("finds daml.yaml in subdirectory via tree", async () => {
    const tree = [
      {
        path: "packages/core/daml.yaml",
        type: "blob",
      },
    ];
    const client = createMockClient({
      "file:packages/core/daml.yaml":
        "sdk-version: 2.8.0\nname: core\n",
    });

    const notes: string[] = [];
    const result = await collectSdkVersion(
      client,
      "owner",
      "repo",
      tree,
      notes,
    );
    expect(result.canton_sdk_version).toBe("2.8.0");
  });

  it("returns highest version from multiple daml.yaml files", async () => {
    const tree = [
      { path: "a/daml.yaml", type: "blob" },
      { path: "b/daml.yaml", type: "blob" },
    ];
    const client = createMockClient({
      "file:a/daml.yaml": "sdk-version: 2.7.0\n",
      "file:b/daml.yaml": "sdk-version: 2.9.0\n",
    });

    const notes: string[] = [];
    const result = await collectSdkVersion(
      client,
      "owner",
      "repo",
      tree,
      notes,
    );
    expect(result.canton_sdk_version).toBe("2.9.0");
    expect(notes.some((n) => n.includes("Multiple SDK"))).toBe(true);
  });
});

describe("collectLicense", () => {
  it("extracts SPDX identifier", async () => {
    const client = createMockClient({
      "/license": { license: { spdx_id: "MIT" } },
    });

    const notes: string[] = [];
    const result = await collectLicense(
      client,
      "owner",
      "repo",
      notes,
    );
    expect(result.license_type).toBe("MIT");
  });

  it("maps NOASSERTION to Custom", async () => {
    const client = createMockClient({
      "/license": { license: { spdx_id: "NOASSERTION" } },
    });

    const notes: string[] = [];
    const result = await collectLicense(
      client,
      "owner",
      "repo",
      notes,
    );
    expect(result.license_type).toBe("Custom");
  });

  it("returns null when no license", async () => {
    const client = createMockClient({
      "/license": null,
    });

    const notes: string[] = [];
    const result = await collectLicense(
      client,
      "owner",
      "repo",
      notes,
    );
    expect(result.license_type).toBeNull();
    expect(notes).toContain("No license detected");
  });
});

describe("collectTests", () => {
  it("detects Daml test files", () => {
    const tree = [
      { path: "src/MainTest.daml", type: "blob" as const },
      { path: "src/UtilsTest.daml", type: "blob" as const },
      { path: "src/Main.daml", type: "blob" as const },
    ];

    const notes: string[] = [];
    const result = collectTests(tree, false, notes);
    expect(result.has_tests).toBe(true);
    expect(result.test_count).toBe(2);
  });

  it("detects TypeScript test files", () => {
    const tree = [
      { path: "src/app.test.ts", type: "blob" as const },
      { path: "src/utils.spec.ts", type: "blob" as const },
    ];

    const notes: string[] = [];
    const result = collectTests(tree, false, notes);
    expect(result.has_tests).toBe(true);
    expect(result.test_count).toBe(2);
  });

  it("detects Python test files", () => {
    const tree = [
      { path: "tests/test_main.py", type: "blob" as const },
      { path: "tests/utils_test.py", type: "blob" as const },
    ];

    const notes: string[] = [];
    const result = collectTests(tree, false, notes);
    expect(result.has_tests).toBe(true);
    expect(result.test_count).toBe(2);
  });

  it("detects Java test files", () => {
    const tree = [
      {
        path: "src/test/java/AppTest.java",
        type: "blob" as const,
      },
    ];

    const notes: string[] = [];
    const result = collectTests(tree, false, notes);
    expect(result.has_tests).toBe(true);
    expect(result.test_count).toBe(1);
  });

  it("returns false when no test files found", () => {
    const tree = [
      { path: "src/Main.daml", type: "blob" as const },
      { path: "README.md", type: "blob" as const },
    ];

    const notes: string[] = [];
    const result = collectTests(tree, false, notes);
    expect(result.has_tests).toBe(false);
    expect(result.test_count).toBeNull();
  });

  it("returns null for empty tree", () => {
    const notes: string[] = [];
    const result = collectTests([], false, notes);
    expect(result.has_tests).toBeNull();
    expect(result.test_count).toBeNull();
  });

  it("handles truncated tree", () => {
    const tree = [
      { path: "src/MainTest.daml", type: "blob" as const },
    ];

    const notes: string[] = [];
    const result = collectTests(tree, true, notes);
    expect(result.has_tests).toBe(true);
    expect(result.test_count).toBeNull();
    expect(
      notes.some((n) => n.includes("incomplete")),
    ).toBe(true);
  });

  it("filters out non-code files matching test pattern", () => {
    const tree = [
      {
        path: "fixtures/TestData.png",
        type: "blob" as const,
      },
    ];

    const notes: string[] = [];
    const result = collectTests(tree, false, notes);
    expect(result.has_tests).toBe(false);
  });
});

describe("collectCi", () => {
  it("detects GitHub Actions with passing status", async () => {
    const tree = [
      {
        path: ".github/workflows/ci.yml",
        type: "blob" as const,
      },
    ];

    const now = new Date();
    const recentDate = new Date(
      now.getTime() - 24 * 60 * 60 * 1000,
    );

    const client = createMockClient({
      "/actions/runs": {
        workflow_runs: [
          {
            conclusion: "success",
            updated_at: recentDate.toISOString(),
          },
        ],
      },
    });

    const notes: string[] = [];
    const result = await collectCi(
      client,
      "owner",
      "repo",
      tree,
      notes,
    );
    expect(result.has_ci).toBe(true);
    expect(result.ci_status).toBe("passing");
  });

  it("detects failing CI", async () => {
    const tree = [
      {
        path: ".github/workflows/ci.yml",
        type: "blob" as const,
      },
    ];

    const now = new Date();
    const recentDate = new Date(
      now.getTime() - 24 * 60 * 60 * 1000,
    );

    const client = createMockClient({
      "/actions/runs": {
        workflow_runs: [
          {
            conclusion: "failure",
            updated_at: recentDate.toISOString(),
          },
        ],
      },
    });

    const notes: string[] = [];
    const result = await collectCi(
      client,
      "owner",
      "repo",
      tree,
      notes,
    );
    expect(result.has_ci).toBe(true);
    expect(result.ci_status).toBe("failing");
  });

  it("marks stale CI (>90 days)", async () => {
    const tree = [
      {
        path: ".github/workflows/ci.yml",
        type: "blob" as const,
      },
    ];

    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 100);

    const client = createMockClient({
      "/actions/runs": {
        workflow_runs: [
          {
            conclusion: "success",
            updated_at: oldDate.toISOString(),
          },
        ],
      },
    });

    const notes: string[] = [];
    const result = await collectCi(
      client,
      "owner",
      "repo",
      tree,
      notes,
    );
    expect(result.has_ci).toBe(true);
    expect(result.ci_status).toBe("stale");
  });

  it("returns unknown for non-GitHub CI", async () => {
    const tree = [
      {
        path: ".circleci/config.yml",
        type: "blob" as const,
      },
    ];

    const client = createMockClient({});
    const notes: string[] = [];
    const result = await collectCi(
      client,
      "owner",
      "repo",
      tree,
      notes,
    );
    expect(result.has_ci).toBe(true);
    expect(result.ci_status).toBe("unknown");
  });

  it("returns false when no CI config found", async () => {
    const tree = [
      { path: "src/Main.daml", type: "blob" as const },
    ];

    const client = createMockClient({});
    const notes: string[] = [];
    const result = await collectCi(
      client,
      "owner",
      "repo",
      tree,
      notes,
    );
    expect(result.has_ci).toBe(false);
    expect(result.ci_status).toBeNull();
  });

  it("returns unknown when no completed runs", async () => {
    const tree = [
      {
        path: ".github/workflows/ci.yml",
        type: "blob" as const,
      },
    ];

    const client = createMockClient({
      "/actions/runs": { workflow_runs: [] },
    });

    const notes: string[] = [];
    const result = await collectCi(
      client,
      "owner",
      "repo",
      tree,
      notes,
    );
    expect(result.has_ci).toBe(true);
    expect(result.ci_status).toBe("unknown");
  });

  it("returns null for empty tree", async () => {
    const client = createMockClient({});
    const notes: string[] = [];
    const result = await collectCi(
      client,
      "owner",
      "repo",
      [],
      notes,
    );
    expect(result.has_ci).toBeNull();
    expect(result.ci_status).toBeNull();
  });
});

describe("collectDocumentation", () => {
  it("detects docs/ directory with markdown", async () => {
    const tree = [
      { path: "docs/guide.md", type: "blob" as const },
    ];

    const client = createMockClient({});
    const notes: string[] = [];
    const result = await collectDocumentation(
      client,
      "owner",
      "repo",
      tree,
      null,
      notes,
    );
    expect(result.has_documentation).toBe(true);
  });

  it("ignores docs/ with only .gitkeep", async () => {
    const tree = [
      { path: "docs/.gitkeep", type: "blob" as const },
    ];

    const client = createMockClient({});
    const notes: string[] = [];
    const result = await collectDocumentation(
      client,
      "owner",
      "repo",
      tree,
      { archived: false, has_pages: false, default_branch: "main", fork: false },
      notes,
    );
    expect(result.has_documentation).toBe(false);
  });

  it("detects large README", async () => {
    const tree = [
      { path: "README.md", type: "blob" as const },
    ];

    const client = createMockClient({
      "/contents/README.md": {
        content: "",
        encoding: "base64",
        size: 2500,
      },
    });

    const notes: string[] = [];
    const result = await collectDocumentation(
      client,
      "owner",
      "repo",
      tree,
      null,
      notes,
    );
    expect(result.has_documentation).toBe(true);
  });

  it("rejects small README (<500 bytes)", async () => {
    const tree = [
      { path: "README.md", type: "blob" as const },
    ];

    const client = createMockClient({
      "/contents/README.md": {
        content: "",
        encoding: "base64",
        size: 100,
      },
    });

    const notes: string[] = [];
    const result = await collectDocumentation(
      client,
      "owner",
      "repo",
      tree,
      { archived: false, has_pages: false, default_branch: "main", fork: false },
      notes,
    );
    expect(result.has_documentation).toBe(false);
  });

  it("detects GitHub Pages", async () => {
    const tree = [
      { path: "src/Main.daml", type: "blob" as const },
    ];
    const repoMeta = {
      archived: false,
      has_pages: true,
      default_branch: "main",
      fork: false,
    };

    const client = createMockClient({});
    const notes: string[] = [];
    const result = await collectDocumentation(
      client,
      "owner",
      "repo",
      tree,
      repoMeta,
      notes,
    );
    expect(result.has_documentation).toBe(true);
    expect(result.documentation_url).toBe(
      "https://owner.github.io/repo",
    );
  });
});

describe("collectTechStack", () => {
  it("collects languages above 5% threshold", async () => {
    const client = createMockClient({
      "/languages": {
        Haskell: 8000,
        JavaScript: 1500,
        Shell: 200,
      },
    });

    const tree = [
      { path: "daml.yaml", type: "blob" as const },
      { path: "package.json", type: "blob" as const },
    ];

    const notes: string[] = [];
    const result = await collectTechStack(
      client,
      "owner",
      "repo",
      tree,
      notes,
    );

    expect(result.tech_stack).toContain("Haskell");
    expect(result.tech_stack).toContain("JavaScript");
    expect(result.tech_stack).toContain("Daml");
    expect(result.tech_stack).toContain("Node.js");
    // Shell is < 5%, should be excluded
    expect(result.tech_stack).not.toContain("Shell");
  });

  it("returns empty array when no data", async () => {
    const client = createMockClient({
      "/languages": null,
    });

    const notes: string[] = [];
    const result = await collectTechStack(
      client,
      "owner",
      "repo",
      [],
      notes,
    );
    expect(result.tech_stack).toEqual([]);
  });
});

describe("collectFromGitHub (full)", () => {
  it("returns empty fields for unparseable URL", async () => {
    const client = createMockClient({});
    const result = await collectFromGitHub(
      client,
      "not-a-url",
    );
    expect(result.fields).toEqual({});
    expect(result.notes.length).toBeGreaterThan(0);
  });

  it("handles 404 repo gracefully", async () => {
    const client = createMockClient({});
    vi.spyOn(client, "get").mockRejectedValue({
      status: 404,
      message: "Not found",
      retryable: false,
    } satisfies GitHubError);

    const result = await collectFromGitHub(
      client,
      "https://github.com/owner/nonexistent",
    );
    expect(result.notes).toContain("Repository not found");
  });
});

describe("Error Handling", () => {
  it("handles 500 server error with retries then null", async () => {
    const client = createMockClient({
      "/commits": {
        ___error: true,
        status: 500,
        message: "Server error",
        retryable: true,
      },
    });

    const notes: string[] = [];
    const result = await collectLastActivity(
      client,
      "owner",
      "repo",
      notes,
    );
    expect(result.last_verified_activity).toBeNull();
    expect(
      notes.some((n) => n.includes("Could not fetch")),
    ).toBe(true);
  });

  it("handles network timeout gracefully", async () => {
    const client = createMockClient({
      "/license": {
        ___error: true,
        status: 0,
        message: "Network timeout",
        retryable: true,
      },
    });

    const notes: string[] = [];
    const result = await collectLicense(
      client,
      "owner",
      "repo",
      notes,
    );
    expect(result.license_type).toBeNull();
    expect(
      notes.some((n) => n.includes("Could not fetch")),
    ).toBe(true);
  });

  it("handles 403 rate limit as GitHubError", async () => {
    const client = createMockClient({
      "/license": {
        ___error: true,
        status: 403,
        message: "Rate limit exceeded",
        retryable: true,
      },
    });

    const notes: string[] = [];
    const result = await collectLicense(
      client,
      "owner",
      "repo",
      notes,
    );
    expect(result.license_type).toBeNull();
  });
});

describe("isGitHubError", () => {
  it("identifies GitHubError objects", () => {
    expect(
      isGitHubError({
        status: 404,
        message: "Not found",
        retryable: false,
      }),
    ).toBe(true);
  });

  it("rejects non-error objects", () => {
    expect(isGitHubError(null)).toBe(false);
    expect(isGitHubError("error")).toBe(false);
    expect(isGitHubError({ status: 404 })).toBe(false);
  });
});
