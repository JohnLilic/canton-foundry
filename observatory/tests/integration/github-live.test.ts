/**
 * Integration tests against real GitHub repos.
 * These hit the actual GitHub API and are rate-limited.
 * Only run in CI on main branch, not on every PR.
 *
 * To run locally:
 *   GITHUB_TOKEN=your_token npx vitest run tests/integration/
 */

import { describe, it, expect, beforeAll } from "vitest";
import { GitHubClient } from "../../scripts/utils/github-client.js";
import {
  collectLastActivity,
  collectSdkVersion,
  collectLicense,
  collectTests,
  collectCi,
  collectDocumentation,
  collectTechStack,
} from "../../scripts/collect-github.js";

const GITHUB_TOKEN = process.env["GITHUB_TOKEN"];

const describeIf = (condition: boolean) =>
  condition ? describe : describe.skip;

describeIf(!!GITHUB_TOKEN)(
  "GitHub Live Integration",
  () => {
    let client: GitHubClient;

    beforeAll(() => {
      client = new GitHubClient({
        token: GITHUB_TOKEN ?? "",
      });
    });

    describe("JohnLilic/canton-patterns", () => {
      const owner = "JohnLilic";
      const repo = "canton-patterns";

      it("has recent activity", async () => {
        const notes: string[] = [];
        const result = await collectLastActivity(
          client,
          owner,
          repo,
          notes,
        );
        expect(result.last_verified_activity).not.toBeNull();
        expect(result.last_verified_activity).toMatch(
          /^\d{4}-\d{2}-\d{2}$/,
        );
      });

      it("has a license", async () => {
        const notes: string[] = [];
        const result = await collectLicense(
          client,
          owner,
          repo,
          notes,
        );
        expect(result.license_type).not.toBeNull();
      });

      it("detects tech stack", async () => {
        const tree = await getTree(client, owner, repo);
        const notes: string[] = [];
        const result = await collectTechStack(
          client,
          owner,
          repo,
          tree,
          notes,
        );
        expect(result.tech_stack.length).toBeGreaterThan(0);
      });
    });

    describe("JohnLilic/canton-ci-templates", () => {
      const owner = "JohnLilic";
      const repo = "canton-ci-templates";

      it("has CI configuration", async () => {
        const tree = await getTree(client, owner, repo);
        const notes: string[] = [];
        const result = await collectCi(
          client,
          owner,
          repo,
          tree,
          notes,
        );
        expect(result.has_ci).toBe(true);
      });
    });

    describe("digital-asset/daml (large repo)", () => {
      const owner = "digital-asset";
      const repo = "daml";

      it("has recent activity", async () => {
        const notes: string[] = [];
        const result = await collectLastActivity(
          client,
          owner,
          repo,
          notes,
        );
        expect(result.last_verified_activity).not.toBeNull();
      });

      it("has a license", async () => {
        const notes: string[] = [];
        const result = await collectLicense(
          client,
          owner,
          repo,
          notes,
        );
        expect(result.license_type).not.toBeNull();
      });

      it("detects multiple languages", async () => {
        const notes: string[] = [];
        const result = await collectTechStack(
          client,
          owner,
          repo,
          [],
          notes,
        );
        expect(result.tech_stack.length).toBeGreaterThan(2);
      });

      it("has documentation", async () => {
        const tree = await getTree(client, owner, repo);
        const repoMeta = await client.get<{
          archived: boolean;
          has_pages: boolean;
          default_branch: string;
          fork: boolean;
        }>(`/repos/${owner}/${repo}`);
        const notes: string[] = [];
        const result = await collectDocumentation(
          client,
          owner,
          repo,
          tree,
          repoMeta.data,
          notes,
        );
        expect(result.has_documentation).toBe(true);
      });
    });

    async function getTree(
      c: GitHubClient,
      owner: string,
      repo: string,
    ): Promise<
      { path: string; type: string; size?: number }[]
    > {
      try {
        const repoData = await c.get<{
          default_branch: string;
        }>(`/repos/${owner}/${repo}`);
        const treeData = await c.get<{
          tree: { path: string; type: string; size?: number }[];
        }>(
          `/repos/${owner}/${repo}/git/trees/` +
            `${repoData.data.default_branch}?recursive=1`,
        );
        return treeData.data.tree;
      } catch {
        return [];
      }
    }
  },
);
