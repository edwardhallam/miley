/**
 * Tests for the new MileyConfig schema (replacement for EdgeConfig).
 *
 * Key differences from EdgeConfig:
 * - Top-level `linear` block (not linearWorkspaces record)
 * - `preferLocalBranch` per-repo (default false)
 * - No `workspaceBaseDir` (computed as repositoryPath + /.worktrees/)
 * - No `labelPrompts` (classification removed)
 * - `server` block at top level (port + host)
 * - `appendInstruction` optional
 */

import { describe, expect, it } from "vitest";
import {
	type MileyConfig,
	MileyConfigSchema,
	type MileyRepositoryConfig,
	MileyRepositoryConfigSchema,
} from "../src/config-schemas.js";

describe("MileyRepositoryConfigSchema", () => {
	const validRepo: MileyRepositoryConfig = {
		id: "uuid-123",
		name: "nexus",
		repositoryPath: "/Users/edwardhallam/obsidian/nexus",
		baseBranch: "main",
		preferLocalBranch: true,
		projectKeys: ["n8n", "nexus"],
		teamKeys: ["NEX"],
		isActive: true,
	};

	it("accepts a valid repository config", () => {
		const result = MileyRepositoryConfigSchema.safeParse(validRepo);
		expect(result.success).toBe(true);
	});

	it("defaults preferLocalBranch to false when omitted", () => {
		const { preferLocalBranch, ...repoWithoutPref } = validRepo;
		const result = MileyRepositoryConfigSchema.safeParse(repoWithoutPref);
		expect(result.success).toBe(true);
		expect(result.data!.preferLocalBranch).toBe(false);
	});

	it("requires id, name, repositoryPath, baseBranch", () => {
		const result = MileyRepositoryConfigSchema.safeParse({});
		expect(result.success).toBe(false);
		const issues = result.error!.issues.map((i) => i.path[0]);
		expect(issues).toContain("id");
		expect(issues).toContain("name");
		expect(issues).toContain("repositoryPath");
		expect(issues).toContain("baseBranch");
	});

	it("does NOT have workspaceBaseDir field", () => {
		const withWorkspaceBaseDir = {
			...validRepo,
			workspaceBaseDir: "/some/path",
		};
		const result = MileyRepositoryConfigSchema.safeParse(withWorkspaceBaseDir);
		// Zod strips unknown keys by default, so it should parse fine
		// but the field should not be present in the output
		expect(result.success).toBe(true);
		expect(result.data).not.toHaveProperty("workspaceBaseDir");
	});

	it("does NOT have labelPrompts field", () => {
		const withLabelPrompts = {
			...validRepo,
			labelPrompts: { debugger: ["Bug"] },
		};
		const result = MileyRepositoryConfigSchema.safeParse(withLabelPrompts);
		expect(result.success).toBe(true);
		expect(result.data).not.toHaveProperty("labelPrompts");
	});

	it("does NOT have linearToken, linearRefreshToken, linearWorkspaceName per-repo", () => {
		const withLinearFields = {
			...validRepo,
			linearToken: "token",
			linearRefreshToken: "refresh",
			linearWorkspaceName: "My Workspace",
		};
		const result = MileyRepositoryConfigSchema.safeParse(withLinearFields);
		expect(result.success).toBe(true);
		expect(result.data).not.toHaveProperty("linearToken");
		expect(result.data).not.toHaveProperty("linearRefreshToken");
		expect(result.data).not.toHaveProperty("linearWorkspaceName");
	});

	it("accepts appendInstruction as optional", () => {
		const withInstruction = {
			...validRepo,
			appendInstruction: "Always run tests before committing",
		};
		const result = MileyRepositoryConfigSchema.safeParse(withInstruction);
		expect(result.success).toBe(true);
		expect(result.data!.appendInstruction).toBe(
			"Always run tests before committing",
		);
	});

	it("accepts optional fields: githubUrl, routingLabels, linearWorkspaceId, model, mcpConfigPath", () => {
		const full = {
			...validRepo,
			githubUrl: "https://github.com/user/repo",
			routingLabels: ["bug", "feature"],
			linearWorkspaceId: "ws-123",
			model: "opus",
			fallbackModel: "sonnet",
			mcpConfigPath: "/path/to/mcp.json",
			allowedTools: ["Bash", "Read"],
			disallowedTools: ["Write"],
			userAccessControl: { allowedUsers: ["user1"] },
		};
		const result = MileyRepositoryConfigSchema.safeParse(full);
		expect(result.success).toBe(true);
	});
});

describe("MileyConfigSchema", () => {
	const minimalConfig: MileyConfig = {
		server: { port: 3457, host: "0.0.0.0" },
		linear: {
			token: "lin_oauth_abc123",
			workspaceId: "ws-abc",
			workspaceName: "edwardhallam",
		},
		repositories: [],
	};

	it("accepts a minimal valid config", () => {
		const result = MileyConfigSchema.safeParse(minimalConfig);
		expect(result.success).toBe(true);
	});

	it("requires server, linear, and repositories", () => {
		const result = MileyConfigSchema.safeParse({});
		expect(result.success).toBe(false);
		const issues = result.error!.issues.map((i) => i.path[0]);
		expect(issues).toContain("server");
		expect(issues).toContain("linear");
		expect(issues).toContain("repositories");
	});

	it("requires server.port and server.host", () => {
		const result = MileyConfigSchema.safeParse({
			...minimalConfig,
			server: {},
		});
		expect(result.success).toBe(false);
		const paths = result.error!.issues.map((i) => i.path.join("."));
		expect(paths).toContain("server.port");
		expect(paths).toContain("server.host");
	});

	it("requires linear.token, linear.workspaceId, linear.workspaceName", () => {
		const result = MileyConfigSchema.safeParse({
			...minimalConfig,
			linear: {},
		});
		expect(result.success).toBe(false);
		const paths = result.error!.issues.map((i) => i.path.join("."));
		expect(paths).toContain("linear.token");
		expect(paths).toContain("linear.workspaceId");
		expect(paths).toContain("linear.workspaceName");
	});

	it("does NOT have linearWorkspaces (uses linear instead)", () => {
		const withLegacy = {
			...minimalConfig,
			linearWorkspaces: { "ws-abc": { linearToken: "token" } },
		};
		const result = MileyConfigSchema.safeParse(withLegacy);
		expect(result.success).toBe(true);
		expect(result.data).not.toHaveProperty("linearWorkspaces");
	});

	it("does NOT have ngrokAuthToken, stripeCustomerId", () => {
		const withSaaS = {
			...minimalConfig,
			ngrokAuthToken: "ngrok_123",
			stripeCustomerId: "cus_123",
		};
		const result = MileyConfigSchema.safeParse(withSaaS);
		expect(result.success).toBe(true);
		expect(result.data).not.toHaveProperty("ngrokAuthToken");
		expect(result.data).not.toHaveProperty("stripeCustomerId");
	});

	it("accepts a full config with repositories", () => {
		const fullConfig: MileyConfig = {
			server: { port: 3457, host: "0.0.0.0" },
			linear: {
				token: "lin_oauth_abc123",
				workspaceId: "ws-abc",
				workspaceName: "edwardhallam",
			},
			repositories: [
				{
					id: "uuid-1",
					name: "nexus",
					repositoryPath: "/Users/edwardhallam/obsidian/nexus",
					baseBranch: "main",
					preferLocalBranch: true,
					projectKeys: ["n8n", "nexus"],
					teamKeys: ["NEX"],
					appendInstruction: "Always check CLAUDE.md first",
					isActive: true,
				},
				{
					id: "uuid-2",
					name: "webapp",
					repositoryPath: "/Users/edwardhallam/code/webapp",
					baseBranch: "develop",
					projectKeys: ["web"],
					teamKeys: ["WEB"],
					isActive: true,
				},
			],
		};
		const result = MileyConfigSchema.safeParse(fullConfig);
		expect(result.success).toBe(true);
		// Second repo should get preferLocalBranch defaulted to false
		expect(result.data!.repositories[1]!.preferLocalBranch).toBe(false);
	});

	it("does NOT have promptDefaults or issueUpdateTrigger", () => {
		const withLegacy = {
			...minimalConfig,
			promptDefaults: { debugger: { allowedTools: "readOnly" } },
			issueUpdateTrigger: true,
		};
		const result = MileyConfigSchema.safeParse(withLegacy);
		expect(result.success).toBe(true);
		expect(result.data).not.toHaveProperty("promptDefaults");
		expect(result.data).not.toHaveProperty("issueUpdateTrigger");
	});
});

describe("MileyConfig worktree path computation", () => {
	it("worktree path is repositoryPath + /.worktrees/", () => {
		const repo: MileyRepositoryConfig = {
			id: "uuid-1",
			name: "nexus",
			repositoryPath: "/Users/edwardhallam/obsidian/nexus",
			baseBranch: "main",
			preferLocalBranch: false,
		};
		// The worktree path is NOT stored in config — it's computed
		const expectedWorktreePath = `${repo.repositoryPath}/.worktrees`;
		expect(expectedWorktreePath).toBe(
			"/Users/edwardhallam/obsidian/nexus/.worktrees",
		);
	});
});
