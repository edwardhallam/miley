import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EdgeWorker } from "../src/EdgeWorker.js";
import type { EdgeWorkerConfig, RepositoryConfig } from "../src/types.js";

vi.mock("fs/promises", () => ({
	readFile: vi.fn(),
	writeFile: vi.fn(),
	mkdir: vi.fn(),
	rename: vi.fn(),
	readdir: vi.fn().mockResolvedValue([]),
}));
vi.mock("miley-claude-runner");
vi.mock("miley-codex-runner");
vi.mock("miley-gemini-runner");
vi.mock("miley-linear-event-transport");
vi.mock("@linear/sdk");
vi.mock("../src/SharedApplicationServer.js", () => ({
	SharedApplicationServer: vi.fn().mockImplementation(() => ({
		initializeFastify: vi.fn(),
		getFastifyInstance: vi.fn().mockReturnValue({
			get: vi.fn(),
			post: vi.fn(),
		}),
		getInternalFastifyInstance: vi.fn().mockReturnValue({
			get: vi.fn(),
			post: vi.fn(),
			register: vi.fn(),
			addHook: vi.fn(),
		}),
		start: vi.fn().mockResolvedValue(undefined),
		stop: vi.fn().mockResolvedValue(undefined),
		getWebhookUrl: vi.fn().mockReturnValue("http://localhost:3456/webhook"),
		getInternalPort: vi.fn().mockReturnValue(3458),
	})),
}));
vi.mock("../src/AgentSessionManager.js", () => ({
	AgentSessionManager: vi.fn().mockImplementation(() => ({
		getAllAgentRunners: vi.fn().mockReturnValue([]),
		getAllSessions: vi.fn().mockReturnValue([]),
		createMileyAgentSession: vi.fn(),
		getSession: vi.fn(),
		getActiveSessionsByIssueId: vi.fn().mockReturnValue([]),
		setActivitySink: vi.fn(),
		on: vi.fn(),
		emit: vi.fn(),
	})),
}));
vi.mock("miley-core", async (importOriginal) => {
	const actual = (await importOriginal()) as any;
	return {
		...actual,
		isAgentSessionCreatedWebhook: vi.fn().mockReturnValue(false),
		isAgentSessionPromptedWebhook: vi.fn().mockReturnValue(false),
		isIssueAssignedWebhook: vi.fn().mockReturnValue(false),
		isIssueCommentMentionWebhook: vi.fn().mockReturnValue(false),
		isIssueNewCommentWebhook: vi.fn().mockReturnValue(false),
		isIssueUnassignedWebhook: vi.fn().mockReturnValue(false),
		PersistenceManager: vi.fn().mockImplementation(() => ({
			loadEdgeWorkerState: vi.fn().mockResolvedValue(null),
			saveEdgeWorkerState: vi.fn().mockResolvedValue(undefined),
		})),
	};
});
vi.mock("file-type");
vi.mock("chokidar", () => ({
	watch: vi.fn().mockReturnValue({
		on: vi.fn().mockReturnThis(),
		close: vi.fn().mockResolvedValue(undefined),
	}),
}));

describe("EdgeWorker - MCP Auth Fail-Closed", () => {
	let edgeWorker: EdgeWorker;

	const mockRepository: RepositoryConfig = {
		id: "test-repo",
		name: "Test Repo",
		repositoryPath: "/test/repo",
		workspaceBaseDir: "/test/workspaces",
		baseBranch: "main",
		linearWorkspaceId: "test-workspace",
		isActive: true,
	};

	beforeEach(() => {
		vi.clearAllMocks();
		vi.spyOn(console, "log").mockImplementation(() => {});
		vi.spyOn(console, "error").mockImplementation(() => {});
		vi.spyOn(console, "warn").mockImplementation(() => {});
	});

	afterEach(async () => {
		if (edgeWorker) {
			try {
				await edgeWorker.stop();
			} catch {}
		}
	});

	it("should reject MCP requests when MILEY_API_KEY is not set", () => {
		delete process.env.MILEY_API_KEY;

		const mockConfig: EdgeWorkerConfig = {
			platform: "linear",
			mileyHome: "/test/.miley",
			repositories: [mockRepository],
			linearWorkspaces: {
				"test-workspace": { linearToken: "test-token" },
			},
		};

		edgeWorker = new EdgeWorker(mockConfig);

		const isValid = (edgeWorker as any).isMileyToolsMcpAuthorizationValid(
			"Bearer some-token",
		);

		expect(isValid).toBe(false);
	});

	it("should reject MCP requests with no auth header when key is set", () => {
		process.env.MILEY_API_KEY = "test-key";

		const mockConfig: EdgeWorkerConfig = {
			platform: "linear",
			mileyHome: "/test/.miley",
			repositories: [mockRepository],
			linearWorkspaces: {
				"test-workspace": { linearToken: "test-token" },
			},
		};

		edgeWorker = new EdgeWorker(mockConfig);

		const isValid = (edgeWorker as any).isMileyToolsMcpAuthorizationValid(
			undefined,
		);

		expect(isValid).toBe(false);

		delete process.env.MILEY_API_KEY;
	});
});
