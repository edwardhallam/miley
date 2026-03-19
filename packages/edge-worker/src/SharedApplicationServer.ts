import type { IncomingMessage, ServerResponse } from "node:http";
import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import { createLogger, type ILogger } from "miley-core";

/**
 * OAuth callback state for tracking flows
 */
export interface OAuthCallback {
	resolve: (credentials: {
		linearToken: string;
		linearWorkspaceId: string;
		linearWorkspaceName: string;
	}) => void;
	reject: (error: Error) => void;
	id: string;
}

/**
 * Approval callback state for tracking approval workflows
 */
export interface ApprovalCallback {
	resolve: (approved: boolean, feedback?: string) => void;
	reject: (error: Error) => void;
	sessionId: string;
	createdAt: number;
}

/**
 * Shared application server that handles both webhooks and OAuth callbacks on a single port
 * Consolidates functionality from SharedWebhookServer and CLI OAuth server
 */
export class SharedApplicationServer {
	private app: FastifyInstance | null = null;
	private internalApp: FastifyInstance | null = null;
	private webhookHandlers = new Map<
		string,
		{
			secret: string;
			handler: (body: string, signature: string, timestamp?: string) => boolean;
		}
	>();
	// Legacy handlers for direct Linear webhook registration (deprecated)
	private linearWebhookHandlers = new Map<
		string,
		(req: IncomingMessage, res: ServerResponse) => Promise<void>
	>();
	private oauthCallbacks = new Map<string, OAuthCallback>();
	private pendingApprovals = new Map<string, ApprovalCallback>();
	private port: number;
	private internalPort: number;
	private host: string;
	private isListening = false;
	private internalIsListening = false;
	private skipTunnel: boolean;
	private logger: ILogger;

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

	/**
	 * Register a raw body content-type parser on a Fastify instance.
	 * Preserves the raw request body for webhook signature verification (GitHub HMAC-SHA256).
	 * Fastify's default JSON parser discards the raw bytes, but signature checks need
	 * the exact payload GitHub sent. This replaces the default parser with one that
	 * stashes the raw string on `request.rawBody` before parsing.
	 */
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

	/**
	 * Initialize the Fastify app instance (must be called before registering routes)
	 */
	initializeFastify(): void {
		if (this.app) {
			return; // Already initialized
		}

		this.app = Fastify({ logger: false });
		this.registerRawBodyParser(this.app);
		this.initializeInternalFastify();
	}

	/**
	 * Initialize the internal Fastify instance (localhost-only server)
	 */
	initializeInternalFastify(): void {
		if (this.internalApp) {
			return; // Already initialized
		}

		this.internalApp = Fastify({ logger: false });
		this.registerRawBodyParser(this.internalApp);
	}

	/**
	 * Start the shared application server
	 */
	async start(): Promise<void> {
		if (this.isListening) {
			return; // Already listening
		}

		// Initialize Fastify if not already done
		this.initializeFastify();

		try {
			await this.app!.listen({
				port: this.port,
				host: this.host,
			});

			this.isListening = true;
			this.logger.info(
				`Shared application server listening on http://${this.host}:${this.port}`,
			);

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

			// Cloudflare tunnel client removed — tunnel must be managed externally if needed
			if (!this.skipTunnel && process.env.CLOUDFLARE_TOKEN) {
				this.logger.info(
					"CLOUDFLARE_TOKEN is set but tunnel client was removed. Manage tunnel externally.",
				);
			}
		} catch (error) {
			this.isListening = false;
			throw error;
		}
	}

	/**
	 * Stop the shared application server
	 */
	async stop(): Promise<void> {
		// Reject all pending approvals before shutdown
		for (const [sessionId, approval] of this.pendingApprovals) {
			approval.reject(new Error("Server shutting down"));
			this.logger.debug(
				`Rejected pending approval for session ${sessionId} due to shutdown`,
			);
		}
		this.pendingApprovals.clear();

		if (this.app && this.isListening) {
			await this.app.close();
			this.isListening = false;
			this.logger.info("Shared application server stopped");
		}

		if (this.internalApp && this.internalIsListening) {
			await this.internalApp.close();
			this.internalIsListening = false;
			this.logger.info("Internal server stopped");
		}
	}

	/**
	 * Get the port number the server is listening on
	 */
	getPort(): number {
		return this.port;
	}

	/**
	 * Get the Fastify instance for registering routes
	 * Initializes Fastify if not already done
	 */
	getFastifyInstance(): FastifyInstance {
		this.initializeFastify();
		return this.app!;
	}

	/**
	 * Get the internal Fastify instance for localhost-only routes (e.g. admin endpoints)
	 * Initializes the internal Fastify instance if not already done
	 */
	getInternalFastifyInstance(): FastifyInstance {
		this.initializeInternalFastify();
		return this.internalApp!;
	}

	/**
	 * Get the internal server port number
	 */
	getInternalPort(): number {
		return this.internalPort;
	}

	/**
	 * Register a webhook handler for a specific token (LEGACY - deprecated)
	 * Supports two signatures:
	 * 1. For ndjson-client: (token, secret, handler)
	 * 2. For legacy direct registration: (token, handler) where handler takes (req, res)
	 *
	 * NOTE: New code should use LinearEventTransport which registers routes directly with Fastify
	 */
	registerWebhookHandler(
		token: string,
		secretOrHandler:
			| string
			| ((req: IncomingMessage, res: ServerResponse) => Promise<void>),
		handler?: (body: string, signature: string, timestamp?: string) => boolean,
	): void {
		if (typeof secretOrHandler === "string" && handler) {
			// ndjson-client style registration
			this.webhookHandlers.set(token, { secret: secretOrHandler, handler });
			this.logger.debug(
				`Registered webhook handler (proxy-style) for token ending in ...${token.slice(-4)}`,
			);
		} else if (typeof secretOrHandler === "function") {
			// Legacy direct registration
			this.linearWebhookHandlers.set(token, secretOrHandler);
			this.logger.debug(
				`Registered webhook handler (legacy direct-style) for token ending in ...${token.slice(-4)}`,
			);
		} else {
			throw new Error("Invalid webhook handler registration parameters");
		}
	}

	/**
	 * Unregister a webhook handler
	 */
	unregisterWebhookHandler(token: string): void {
		const hadProxyHandler = this.webhookHandlers.delete(token);
		const hadDirectHandler = this.linearWebhookHandlers.delete(token);
		if (hadProxyHandler || hadDirectHandler) {
			this.logger.debug(
				`Unregistered webhook handler for token ending in ...${token.slice(-4)}`,
			);
		}
	}

	/**
	 * Start OAuth flow and return promise that resolves when callback is received
	 */
	async startOAuthFlow(proxyUrl: string): Promise<{
		linearToken: string;
		linearWorkspaceId: string;
		linearWorkspaceName: string;
	}> {
		return new Promise<{
			linearToken: string;
			linearWorkspaceId: string;
			linearWorkspaceName: string;
		}>((resolve, reject) => {
			// Generate unique ID for this flow
			const flowId = Date.now().toString();

			// Store callback for this flow
			this.oauthCallbacks.set(flowId, { resolve, reject, id: flowId });

			// Check if we should use direct Linear OAuth (when self-hosting)
			const isExternalHost =
				process.env.MILEY_HOST_EXTERNAL?.toLowerCase().trim() === "true";
			const useDirectOAuth = isExternalHost && process.env.LINEAR_CLIENT_ID;

			const callbackBaseUrl = `http://${this.host}:${this.port}`;
			let authUrl: string;

			if (useDirectOAuth) {
				// Use local OAuth authorize endpoint
				authUrl = `${callbackBaseUrl}/oauth/authorize?callback=${encodeURIComponent(`${callbackBaseUrl}/callback`)}`;
				this.logger.info(`Using direct OAuth mode (MILEY_HOST_EXTERNAL=true)`);
			} else {
				// Use proxy OAuth endpoint
				authUrl = `${proxyUrl}/oauth/authorize?callback=${encodeURIComponent(`${callbackBaseUrl}/callback`)}`;
			}

			this.logger.info(`Opening your browser to authorize with Linear...`);
			this.logger.info(`If the browser doesn't open, visit: ${authUrl}`);

			// Timeout after 5 minutes
			setTimeout(
				() => {
					if (this.oauthCallbacks.has(flowId)) {
						this.oauthCallbacks.delete(flowId);
						reject(new Error("OAuth timeout"));
					}
				},
				5 * 60 * 1000,
			);
		});
	}

	/**
	 * Get the webhook URL
	 */
	getWebhookUrl(): string {
		return `http://${this.host}:${this.port}/webhook`;
	}

	/**
	 * Get the OAuth callback URL for registration with proxy
	 */
	getOAuthCallbackUrl(): string {
		return `http://${this.host}:${this.port}/callback`;
	}

	/**
	 * Register an approval request and get approval URL
	 */
	registerApprovalRequest(sessionId: string): {
		promise: Promise<{ approved: boolean; feedback?: string }>;
		url: string;
	} {
		// Clean up expired approvals (older than 30 minutes)
		const now = Date.now();
		for (const [key, approval] of this.pendingApprovals) {
			if (now - approval.createdAt > 30 * 60 * 1000) {
				approval.reject(new Error("Approval request expired"));
				this.pendingApprovals.delete(key);
			}
		}

		// Create promise for this approval request
		const promise = new Promise<{ approved: boolean; feedback?: string }>(
			(resolve, reject) => {
				this.pendingApprovals.set(sessionId, {
					resolve: (approved, feedback) => resolve({ approved, feedback }),
					reject,
					sessionId,
					createdAt: now,
				});
			},
		);

		// Generate approval URL
		const url = `http://${this.host}:${this.port}/approval?session=${encodeURIComponent(sessionId)}`;

		this.logger.debug(
			`Registered approval request for session ${sessionId}: ${url}`,
		);

		return { promise, url };
	}
}
