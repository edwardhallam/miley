import type { FastifyInstance } from "fastify";
import { handleCheckGh } from "./handlers/checkGh.js";
import { handleConfigureMcp } from "./handlers/configureMcp.js";
import { handleMileyConfig } from "./handlers/mileyConfig.js";
import { handleMileyEnv } from "./handlers/mileyEnv.js";
import {
	handleRepository,
	handleRepositoryDelete,
} from "./handlers/repository.js";
import { handleTestMcp } from "./handlers/testMcp.js";
import type {
	ApiResponse,
	CheckGhPayload,
	ConfigureMcpPayload,
	DeleteRepositoryPayload,
	MileyConfigPayload,
	MileyEnvPayload,
	RepositoryPayload,
	TestMcpPayload,
} from "./types.js";

/**
 * ConfigUpdater registers configuration update routes with a Fastify server
 * Handles: miley-config, miley-env, repository, update/test-mcp, update/configure-mcp, check-gh endpoints
 */
export class ConfigUpdater {
	private fastify: FastifyInstance;
	private mileyHome: string;
	private apiKey: string;

	constructor(fastify: FastifyInstance, mileyHome: string, apiKey: string) {
		this.fastify = fastify;
		this.mileyHome = mileyHome;
		this.apiKey = apiKey;
	}

	/**
	 * Register all configuration update routes with the Fastify instance
	 */
	register(): void {
		// Register all routes with authentication
		this.registerRoute("/api/update/miley-config", this.handleMileyConfigRoute);
		this.registerRoute("/api/update/miley-env", this.handleMileyEnvRoute);
		this.registerRoute("/api/update/repository", this.handleRepositoryRoute);
		this.registerDeleteRoute(
			"/api/update/repository",
			this.handleRepositoryDeleteRoute,
		);
		this.registerRoute("/api/update/test-mcp", this.handleTestMcpRoute);
		this.registerRoute(
			"/api/update/configure-mcp",
			this.handleConfigureMcpRoute,
		);
		this.registerRoute("/api/check-gh", this.handleCheckGhRoute);
	}

	/**
	 * Register a route with authentication
	 */
	private registerRoute(
		path: string,
		handler: (payload: any) => Promise<ApiResponse>,
	): void {
		this.fastify.post(path, async (request, reply) => {
			// Verify authentication
			const authHeader = request.headers.authorization;
			if (!this.verifyAuth(authHeader)) {
				return reply.status(401).send({
					success: false,
					error: "Unauthorized",
				});
			}

			try {
				const response = await handler.call(this, request.body);
				const statusCode = response.success ? 200 : 400;
				return reply.status(statusCode).send(response);
			} catch (error) {
				return reply.status(500).send({
					success: false,
					error: "Internal server error",
					details: error instanceof Error ? error.message : String(error),
				});
			}
		});
	}

	/**
	 * Register a DELETE route with authentication
	 */
	private registerDeleteRoute(
		path: string,
		handler: (payload: any) => Promise<ApiResponse>,
	): void {
		this.fastify.delete(path, async (request, reply) => {
			// Verify authentication
			const authHeader = request.headers.authorization;
			if (!this.verifyAuth(authHeader)) {
				return reply.status(401).send({
					success: false,
					error: "Unauthorized",
				});
			}

			try {
				const response = await handler.call(this, request.body);
				const statusCode = response.success ? 200 : 400;
				return reply.status(statusCode).send(response);
			} catch (error) {
				return reply.status(500).send({
					success: false,
					error: "Internal server error",
					details: error instanceof Error ? error.message : String(error),
				});
			}
		});
	}

	/**
	 * Verify Bearer token authentication
	 */
	private verifyAuth(authHeader: string | undefined): boolean {
		if (!authHeader || !this.apiKey) {
			return false;
		}

		const expectedAuth = `Bearer ${this.apiKey}`;
		return authHeader === expectedAuth;
	}

	/**
	 * Handle miley-config update
	 */
	private async handleMileyConfigRoute(
		payload: MileyConfigPayload,
	): Promise<ApiResponse> {
		const response = await handleMileyConfig(payload, this.mileyHome);

		// Emit restart event if requested
		if (response.success && response.data?.restartMiley) {
			this.fastify.log.info("Config update requested Miley restart");
		}

		return response;
	}

	/**
	 * Handle miley-env update
	 */
	private async handleMileyEnvRoute(
		payload: MileyEnvPayload,
	): Promise<ApiResponse> {
		const response = await handleMileyEnv(payload, this.mileyHome);

		// Emit restart event if requested
		if (response.success && response.data?.restartMiley) {
			this.fastify.log.info("Env update requested Miley restart");
		}

		return response;
	}

	/**
	 * Handle repository clone/verify
	 */
	private async handleRepositoryRoute(
		payload: RepositoryPayload,
	): Promise<ApiResponse> {
		return handleRepository(payload, this.mileyHome);
	}

	/**
	 * Handle MCP connection test
	 */
	private async handleTestMcpRoute(
		payload: TestMcpPayload,
	): Promise<ApiResponse> {
		return handleTestMcp(payload);
	}

	/**
	 * Handle MCP server configuration
	 */
	private async handleConfigureMcpRoute(
		payload: ConfigureMcpPayload,
	): Promise<ApiResponse> {
		return handleConfigureMcp(payload, this.mileyHome);
	}

	/**
	 * Handle GitHub CLI check
	 */
	private async handleCheckGhRoute(
		payload: CheckGhPayload,
	): Promise<ApiResponse> {
		return handleCheckGh(payload, this.mileyHome);
	}

	/**
	 * Handle repository deletion
	 */
	private async handleRepositoryDeleteRoute(
		payload: DeleteRepositoryPayload,
	): Promise<ApiResponse> {
		return handleRepositoryDelete(payload, this.mileyHome);
	}
}
