# API Endpoint Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split Miley's single Fastify server into a public server (webhooks) and an internal server (admin/MCP), fix fail-open MCP auth, and add webhook audit logging.

**Architecture:** Two Fastify instances in `SharedApplicationServer` — public on `0.0.0.0:3457` and internal on `127.0.0.1:3458`. `EdgeWorker` routes each endpoint to the correct instance. `ConfigUpdater` and MCP endpoint register on the internal server. Webhook auth events are logged to stdout.

**Tech Stack:** Fastify, Zod, Vitest, TypeScript

**Spec:** `docs/superpowers/specs/2026-03-18-api-endpoint-hardening-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `apps/cli/src/config/constants.ts` | Modify | Add `DEFAULT_INTERNAL_PORT` constant |
| `packages/core/src/config-schemas.ts` | Modify | Add `internalPort` to `MileyServerConfigSchema` |
| `packages/core/src/config-types.ts` | Modify | Add `serverInternalPort` to `EdgeWorkerRuntimeConfig` |
| `packages/edge-worker/src/SharedApplicationServer.ts` | Modify | Add second Fastify instance for internal endpoints |
| `packages/edge-worker/src/EdgeWorker.ts` | Modify | Route registrations to correct server, fix MCP auth, update MCP URL |
| `packages/linear-event-transport/src/LinearEventTransport.ts` | Modify | Add audit logging to webhook auth |
| `apps/cli/src/services/WorkerService.ts` | Modify | Wire internal port through to SharedApplicationServer |
| `packages/edge-worker/test/SharedApplicationServer.internal.test.ts` | Create | Tests for dual-server behavior |
| `packages/edge-worker/test/EdgeWorker.mcp-auth-failclosed.test.ts` | Create | Test MCP auth rejects when no key set |

---

### Task 1: Add internal port constant and config schema

**Files:**
- Modify: `apps/cli/src/config/constants.ts`
- Modify: `packages/core/src/config-schemas.ts:390-395`
- Modify: `packages/core/src/config-types.ts:96-100`

- [ ] **Step 1: Add DEFAULT_INTERNAL_PORT constant**

In `apps/cli/src/config/constants.ts`, add after line 8:

```typescript
/**
 * Default internal server port for admin/MCP endpoints (localhost only)
 */
export const DEFAULT_INTERNAL_PORT = 3458;
```

- [ ] **Step 2: Add internalPort to MileyServerConfigSchema**

In `packages/core/src/config-schemas.ts`, update `MileyServerConfigSchema` (line 390):

```typescript
export const MileyServerConfigSchema = z.object({
	/** Port the server listens on */
	port: z.number(),
	/** Host the server binds to (e.g., "0.0.0.0" or "localhost") */
	host: z.string(),
	/** Port for internal admin/MCP endpoints (localhost only, default: port + 1) */
	internalPort: z.number().optional(),
});
```

- [ ] **Step 3: Add serverInternalPort to EdgeWorkerRuntimeConfig**

In `packages/core/src/config-types.ts`, add after `serverHost` (line 100):

```typescript
	/** Internal server port for admin/MCP endpoints (localhost only, default: serverPort + 1) */
	serverInternalPort?: number;
```

- [ ] **Step 4: Run typecheck to verify schema changes compile**

Run: `pnpm --filter miley-core typecheck`
Expected: PASS (no type errors)

- [ ] **Step 5: Handle pre-commit hook for config-schemas.ts**

The `.husky/pre-commit` hook runs a JSON schema sync check when `config-schemas.ts` is staged. If it fails, run `pnpm --filter miley-core generate:json-schema` (the filter name may still be `cyrus-core`) and stage any generated files in `packages/core/schemas/`.

- [ ] **Step 6: Commit**

```bash
git add apps/cli/src/config/constants.ts packages/core/src/config-schemas.ts packages/core/src/config-types.ts packages/core/schemas/
git commit -m "feat(core): add internal port config for admin endpoint isolation (NEX-508)"
```

---

### Task 2: Add internal Fastify instance to SharedApplicationServer

**Files:**
- Modify: `packages/edge-worker/src/SharedApplicationServer.ts`
- Create: `packages/edge-worker/test/SharedApplicationServer.internal.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/edge-worker/test/SharedApplicationServer.internal.test.ts`:

```typescript
import { describe, expect, it, afterEach } from "vitest";
import { SharedApplicationServer } from "../src/SharedApplicationServer.js";

describe("SharedApplicationServer - Internal Server", () => {
	let server: SharedApplicationServer;

	afterEach(async () => {
		if (server) {
			await server.stop();
		}
	});

	it("should expose getInternalFastifyInstance()", () => {
		server = new SharedApplicationServer(0, "127.0.0.1", false, undefined, 0);
		const internal = server.getInternalFastifyInstance();
		expect(internal).toBeDefined();
		expect(typeof internal.get).toBe("function");
		expect(typeof internal.post).toBe("function");
	});

	it("should return different Fastify instances for public and internal", () => {
		server = new SharedApplicationServer(0, "127.0.0.1", false, undefined, 0);
		const pub = server.getFastifyInstance();
		const internal = server.getInternalFastifyInstance();
		expect(pub).not.toBe(internal);
	});

	it("should start and stop both servers", async () => {
		server = new SharedApplicationServer(0, "127.0.0.1", false, undefined, 0);
		await server.start();
		// If no error, both servers started
		await server.stop();
	});

	it("should return the internal port", () => {
		server = new SharedApplicationServer(3457, "127.0.0.1", false, undefined, 3458);
		expect(server.getInternalPort()).toBe(3458);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter miley-edge-worker test:run -- SharedApplicationServer.internal`
Expected: FAIL — `getInternalFastifyInstance` and `getInternalPort` don't exist yet

- [ ] **Step 3: Implement internal server in SharedApplicationServer**

In `packages/edge-worker/src/SharedApplicationServer.ts`, add:

1. New private field `internalApp: FastifyInstance | null = null` after `app` (line 33)
2. New private field `internalPort: number` after `port` (line 48)
3. New private field `internalIsListening = false` after `isListening` (line 50)
4. Update constructor to accept `internalPort` parameter (default: `port + 1`)
5. New method `initializeInternalFastify()` — creates second Fastify instance with the same raw body content-type parser, bound to `127.0.0.1`
6. New method `getInternalFastifyInstance()` — returns internal Fastify instance
7. New method `getInternalPort()` — returns internal port number
8. Update `start()` to also start the internal server on `127.0.0.1:internalPort`
9. Update `stop()` to also stop the internal server

Constructor change (line 54-65):
```typescript
constructor(
	port: number = 3456,
	host: string = "localhost",
	skipTunnel: boolean = false,
	logger?: ILogger,
	internalPort?: number,
) {
	this.port = port;
	this.host = host;
	this.internalPort = internalPort ?? port + 1;
	this.skipTunnel = skipTunnel;
	this.logger =
		logger ?? createLogger({ component: "SharedApplicationServer" });
}
```

Extract the content-type parser registration into a private helper so it can be reused:
```typescript
private registerRawBodyParser(instance: FastifyInstance): void {
	instance.addContentTypeParser(
		"application/json",
		{ parseAs: "string" },
		(
			req: FastifyRequest,
			body: string,
			done: (err: Error | null, result?: unknown) => void,
		) => {
			(req as FastifyRequest & { rawBody: string }).rawBody = body;
			try {
				done(null, JSON.parse(body));
			} catch (err) {
				done(err as Error);
			}
		},
	);
}
```

Add `initializeInternalFastify()`:
```typescript
initializeInternalFastify(): void {
	if (this.internalApp) {
		return;
	}
	this.internalApp = Fastify({ logger: false });
	this.registerRawBodyParser(this.internalApp);
}
```

Update `initializeFastify()` to also call `this.initializeInternalFastify()` and use the extracted helper:
```typescript
initializeFastify(): void {
	if (this.app) {
		return;
	}
	this.app = Fastify({ logger: false });
	this.registerRawBodyParser(this.app);
	this.initializeInternalFastify();
}
```

Add `getInternalFastifyInstance()` and `getInternalPort()`:
```typescript
getInternalFastifyInstance(): FastifyInstance {
	this.initializeInternalFastify();
	return this.internalApp!;
}

getInternalPort(): number {
	return this.internalPort;
}
```

Update `start()` — after the public server listen block (line 116), add:
```typescript
// Start internal server on localhost only
this.initializeInternalFastify();
await this.internalApp!.listen({
	port: this.internalPort,
	host: "127.0.0.1",
});
this.internalIsListening = true;
this.logger.info(
	`Internal server listening on http://127.0.0.1:${this.internalPort}`,
);
```

Update `stop()` — after closing public app (line 148-152), add:
```typescript
if (this.internalApp && this.internalIsListening) {
	await this.internalApp.close();
	this.internalIsListening = false;
	this.logger.info("Internal server stopped");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter miley-edge-worker test:run -- SharedApplicationServer.internal`
Expected: PASS

- [ ] **Step 5: Run all edge-worker tests to verify no regressions**

Run: `pnpm --filter miley-edge-worker test:run`
Expected: PASS — existing tests mock SharedApplicationServer, so the new constructor param (optional) won't break them

- [ ] **Step 6: Commit**

```bash
git add packages/edge-worker/src/SharedApplicationServer.ts packages/edge-worker/test/SharedApplicationServer.internal.test.ts
git commit -m "feat(edge-worker): add internal Fastify server to SharedApplicationServer (NEX-508)"
```

---

### Task 3: Fix fail-open MCP auth

**Files:**
- Modify: `packages/edge-worker/src/EdgeWorker.ts:4196-4208`
- Create: `packages/edge-worker/test/EdgeWorker.mcp-auth-failclosed.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/edge-worker/test/EdgeWorker.mcp-auth-failclosed.test.ts`:

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EdgeWorker } from "../src/EdgeWorker.js";
import type { EdgeWorkerConfig, RepositoryConfig } from "../src/types.js";

// Use the same mock setup as EdgeWorker.status-endpoint.test.ts
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
			try { await edgeWorker.stop(); } catch {}
		}
	});

	it("should reject MCP requests when MILEY_API_KEY is not set", () => {
		// Ensure no API key is set
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

		// Access the private method
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter miley-edge-worker test:run -- mcp-auth-failclosed`
Expected: FAIL — first test expects `false` but gets `true` (current fail-open behavior)

- [ ] **Step 3: Fix the auth method**

In `packages/edge-worker/src/EdgeWorker.ts`, find `isMileyToolsMcpAuthorizationValid` (line 4196-4208). Change:

```typescript
if (!expectedHeader) {
	return true;
}
```

To:

```typescript
if (!expectedHeader) {
	return false;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter miley-edge-worker test:run -- mcp-auth-failclosed`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/edge-worker/src/EdgeWorker.ts packages/edge-worker/test/EdgeWorker.mcp-auth-failclosed.test.ts
git commit -m "fix(edge-worker): fail-closed MCP auth when MILEY_API_KEY is unset (NEX-508)"
```

---

### Task 4: Route endpoint registrations to correct server

**Files:**
- Modify: `packages/edge-worker/src/EdgeWorker.ts:547-571` (start method route registration)
- Modify: `packages/edge-worker/src/EdgeWorker.ts:3772-3874` (MCP endpoint registration)
- Modify: `packages/edge-worker/src/EdgeWorker.ts:4041-4049` (getMileyToolsMcpUrl)

- [ ] **Step 1: Pass internalPort from EdgeWorker constructor to SharedApplicationServer**

In `EdgeWorker.ts`, find where `SharedApplicationServer` is instantiated (around line 269). The current call is:

```typescript
this.sharedApplicationServer = new SharedApplicationServer(
    serverPort,
    serverHost,
    skipTunnel,
);
```

Add `internalPort` as the fifth argument:

```typescript
this.sharedApplicationServer = new SharedApplicationServer(
    serverPort,
    serverHost,
    skipTunnel,
    undefined, // logger
    this.config.serverInternalPort,
);
```

- [ ] **Step 2: Pass internal Fastify instance to ConfigUpdater**

In `EdgeWorker.ts`, find the ConfigUpdater instantiation (around line 548-551):

```typescript
this.configUpdater = new ConfigUpdater(
	this.sharedApplicationServer.getFastifyInstance(),
	this.mileyHome,
	process.env.MILEY_API_KEY || "",
);
```

Change `getFastifyInstance()` to `getInternalFastifyInstance()`:

```typescript
this.configUpdater = new ConfigUpdater(
	this.sharedApplicationServer.getInternalFastifyInstance(),
	this.mileyHome,
	process.env.MILEY_API_KEY || "",
);
```

- [ ] **Step 3: Update registerMileyToolsMcpEndpoint to use internal server**

In `EdgeWorker.ts`, find `registerMileyToolsMcpEndpoint()` (line 3772). Change line 3777:

```typescript
const fastify = this.sharedApplicationServer.getFastifyInstance() as any;
```

To:

```typescript
const fastify = this.sharedApplicationServer.getInternalFastifyInstance() as any;
```

- [ ] **Step 4: Update getMileyToolsMcpUrl to use internal port**

In `EdgeWorker.ts`, find `getMileyToolsMcpUrl()` (line 4041). Replace the entire method:

```typescript
private getMileyToolsMcpUrl(): string {
	const port = this.sharedApplicationServer.getInternalPort();
	return `http://127.0.0.1:${port}${this.mileyToolsMcpEndpoint}`;
}
```

- [ ] **Step 5: Verify status, version, and github-webhook stay on public server**

Confirm these all use `this.sharedApplicationServer.getFastifyInstance()` (NOT internal) — they should NOT be changed:
- `registerStatusEndpoint()` (line 578)
- `registerVersionEndpoint()` (line 594)
- `registerGitHubEventTransport()` (line 611) — stubbed but stays on public server

- [ ] **Step 6: Update SharedApplicationServer mock in all existing test files**

The following 10 test files mock `SharedApplicationServer` and MUST be updated to include `getInternalFastifyInstance` and `getInternalPort` in the mock:

1. `packages/edge-worker/test/EdgeWorker.status-endpoint.test.ts`
2. `packages/edge-worker/test/EdgeWorker.version-endpoint.test.ts`
3. `packages/edge-worker/test/EdgeWorker.multi-repo-tools.test.ts`
4. `packages/edge-worker/test/EdgeWorker.fetchPRBranchRef.test.ts`
5. `packages/edge-worker/test/EdgeWorker.feedback-delivery.test.ts`
6. `packages/edge-worker/test/EdgeWorker.issue-update-multiple-sessions.test.ts`
7. `packages/edge-worker/test/EdgeWorker.feedback-timeout.test.ts`
8. `packages/edge-worker/test/EdgeWorker.missing-session-recovery.test.ts`
9. `packages/edge-worker/test/EdgeWorker.screenshot-upload-hooks.test.ts`
10. `packages/edge-worker/test/EdgeWorker.linear-client-wrapper.test.ts`

In each file, find the `SharedApplicationServer` mock and add these two methods:

```typescript
getInternalFastifyInstance: vi.fn().mockReturnValue({
	get: vi.fn(),
	post: vi.fn(),
	register: vi.fn(),
	addHook: vi.fn(),
}),
getInternalPort: vi.fn().mockReturnValue(3458),
```

- [ ] **Step 7: Run all edge-worker tests**

Run: `pnpm --filter miley-edge-worker test:run`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add packages/edge-worker/src/EdgeWorker.ts
git commit -m "feat(edge-worker): route admin/MCP endpoints to internal server (NEX-508)"
```

---

### Task 5: Wire internal port through WorkerService

**Files:**
- Modify: `apps/cli/src/services/WorkerService.ts:43-98` (setup/idle modes)
- Modify: `apps/cli/src/services/WorkerService.ts:198-256` (startEdgeWorker)

- [ ] **Step 1: Import DEFAULT_INTERNAL_PORT**

At the top of `WorkerService.ts`, update the import from constants:

```typescript
import { DEFAULT_SERVER_PORT, DEFAULT_INTERNAL_PORT, parsePort } from "../config/constants.js";
```

- [ ] **Step 2: Update startSetupWaitingMode**

In `startSetupWaitingMode()` (line 43), add internal port parsing after `serverPort` (line 52):

```typescript
const internalPort = parsePort(
	process.env.MILEY_INTERNAL_PORT,
	DEFAULT_INTERNAL_PORT,
);
```

Update the `SharedApplicationServer` constructor call (line 57-60):

```typescript
this.setupWaitingServer = new SharedApplicationServer(
	serverPort,
	serverHost,
	false,
	undefined,
	internalPort,
);
```

Update the `ConfigUpdater` to use the internal Fastify instance (line 64-68):

```typescript
const configUpdater = new ConfigUpdater(
	this.setupWaitingServer.getInternalFastifyInstance(),
	this.mileyHome,
	process.env.MILEY_API_KEY || "",
);
```

Update the log message (line 85) to include internal port:

```typescript
this.logger.info(`🔗 Public server on port ${serverPort}, internal on port ${internalPort}`);
```

- [ ] **Step 3: Update startIdleMode (same changes)**

Apply the same three changes to `startIdleMode()` (line 104):
1. Parse `MILEY_INTERNAL_PORT` env var
2. Pass `internalPort` to `SharedApplicationServer` constructor
3. Use `getInternalFastifyInstance()` for `ConfigUpdater`
4. Update log message to show both ports

- [ ] **Step 4: Update startEdgeWorker**

In `startEdgeWorker()` (line 180), add internal port to the EdgeWorkerConfig (after `serverHost` on line 238):

```typescript
serverInternalPort: parsePort(process.env.MILEY_INTERNAL_PORT, DEFAULT_INTERNAL_PORT),
```

- [ ] **Step 5: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/cli/src/services/WorkerService.ts apps/cli/src/config/constants.ts
git commit -m "feat(cli): wire internal port through WorkerService (NEX-508)"
```

---

### Task 6: Add webhook audit logging

**Files:**
- Modify: `packages/linear-event-transport/src/LinearEventTransport.ts:108-190`

- [ ] **Step 1: Add audit log to direct webhook handler (success)**

In `handleDirectWebhook()`, after `reply.code(200).send({ success: true });` (line 148), add:

```typescript
this.logger.info(
	`[AUDIT] POST /webhook auth=linear-signature result=ok`,
);
```

- [ ] **Step 2: Add audit log to direct webhook handler (failures)**

After each `reply.code(401)` in `handleDirectWebhook()`:

After line 120 (missing signature):
```typescript
this.logger.warn(
	`[AUDIT] POST /webhook auth=linear-signature result=rejected reason=missing-signature`,
);
```

After line 135 (invalid signature):
```typescript
this.logger.warn(
	`[AUDIT] POST /webhook auth=linear-signature result=rejected reason=invalid-signature`,
);
```

After line 155 (verification error):
```typescript
this.logger.warn(
	`[AUDIT] POST /webhook auth=linear-signature result=rejected reason=verification-error`,
);
```

- [ ] **Step 3: Add audit log to proxy webhook handler**

After `reply.code(200)` success in `handleProxyWebhook()` (around line 190):
```typescript
this.logger.info(
	`[AUDIT] POST /webhook auth=bearer result=ok`,
);
```

After line 169 (missing auth header):
```typescript
this.logger.warn(
	`[AUDIT] POST /webhook auth=bearer result=rejected reason=missing-header`,
);
```

After line 176 (invalid token):
```typescript
this.logger.warn(
	`[AUDIT] POST /webhook auth=bearer result=rejected reason=invalid-token`,
);
```

- [ ] **Step 4: Run existing LinearEventTransport tests**

Run: `pnpm --filter miley-linear-event-transport test:run`
Expected: PASS (audit logs are additive, no behavior change)

- [ ] **Step 5: Commit**

```bash
git add packages/linear-event-transport/src/LinearEventTransport.ts
git commit -m "feat(linear): add webhook audit logging (NEX-508)"
```

---

### Task 7: Integration verification and final cleanup

- [ ] **Step 1: Run full typecheck**

Run: `pnpm typecheck`
Expected: PASS across all packages

- [ ] **Step 2: Run all tests**

Run: `pnpm test:packages:run`
Expected: PASS — all existing + new tests pass

- [ ] **Step 3: Run lint and format**

Run: `pnpm format`
Expected: Clean or auto-fixed

- [ ] **Step 4: Build all packages**

Run: `pnpm build`
Expected: PASS — clean build

- [ ] **Step 5: Final commit if any formatting changes**

```bash
git add -u
git commit -m "chore: format after API hardening changes (NEX-508)"
```
