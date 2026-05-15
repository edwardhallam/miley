/**
 * Stub types and classes for removed packages.
 *
 * These packages were removed from the monorepo:
 *   - miley-github-event-transport
 *   - miley-slack-event-transport
 *   - miley-mcp-tools
 *   - miley-cloudflare-tunnel-client
 *
 * This file provides minimal type-compatible stubs so EdgeWorker.ts compiles.
 * The actual functionality (GitHub webhooks, Slack integration, MCP tools server,
 * Cloudflare tunnel) is disabled.
 */

import { EventEmitter } from "node:events";
import type { LinearClient } from "@linear/sdk";
import type { FastifyInstance } from "fastify";

// ---------------------------------------------------------------------------
// GitHub Event Transport stubs
// ---------------------------------------------------------------------------

export interface GitHubWebhookEvent {
	eventType: string;
	deliveryId: string;
	payload: any;
	installationToken?: string;
}

export interface GitHubEventTransportConfig {
	fastifyServer: FastifyInstance;
	verificationMode: string;
	secret: string;
}

export class GitHubEventTransport extends EventEmitter {
	constructor(_config: GitHubEventTransportConfig) {
		super();
	}
	register(): void {}
}

export class GitHubCommentService {
	async postComment(_params: any): Promise<any> {
		return {};
	}
	async postIssueComment(_params: any): Promise<any> {
		return {};
	}
	async postReviewCommentReply(_params: any): Promise<any> {
		return {};
	}
	async addReaction(_params: any): Promise<any> {
		return {};
	}
}

// GitHub webhook utility stubs for the subset Miley still uses after removing
// the old GitHub transport package.
export function extractRepoFullName(event: GitHubWebhookEvent): string {
	return event.payload?.repository?.full_name ?? "";
}
export function extractRepoName(event: GitHubWebhookEvent): string {
	return (
		event.payload?.repository?.name ??
		extractRepoFullName(event).split("/")[1] ??
		""
	);
}
export function extractRepoOwner(event: GitHubWebhookEvent): string {
	const owner = event.payload?.repository?.owner;
	return (
		owner?.login ??
		owner?.name ??
		extractRepoFullName(event).split("/")[0] ??
		""
	);
}
export function extractPRNumber(event: GitHubWebhookEvent): number {
	return (
		event.payload?.pull_request?.number ?? event.payload?.issue?.number ?? 0
	);
}
export function extractPRTitle(event: GitHubWebhookEvent): string {
	return (
		event.payload?.pull_request?.title ?? event.payload?.issue?.title ?? ""
	);
}
export function extractPRBranchRef(event: GitHubWebhookEvent): string | null {
	return event.payload?.pull_request?.head?.ref ?? null;
}
export function extractPRBaseBranchRef(
	event: GitHubWebhookEvent,
): string | null {
	return event.payload?.pull_request?.base?.ref ?? null;
}
export function extractCommentBody(event: GitHubWebhookEvent): string {
	return event.payload?.comment?.body ?? "";
}
export function extractCommentAuthor(event: GitHubWebhookEvent): string {
	return event.payload?.comment?.user?.login ?? "";
}
export function extractCommentId(event: GitHubWebhookEvent): number {
	return event.payload?.comment?.id ?? 0;
}
export function extractCommentUrl(event: GitHubWebhookEvent): string {
	return event.payload?.comment?.html_url ?? event.payload?.comment?.url ?? "";
}
export function extractSessionKey(event: GitHubWebhookEvent): string {
	return `${event.eventType}:${event.deliveryId}`;
}
export function isCommentOnPullRequest(event: GitHubWebhookEvent): boolean {
	return Boolean(event.payload?.issue?.pull_request);
}
export function isIssueCommentPayload(payload: any): boolean {
	return Boolean(payload?.issue && payload?.comment);
}
export function isPullRequestReviewCommentPayload(payload: any): boolean {
	return Boolean(payload?.pull_request && payload?.comment);
}
export function isPullRequestReviewPayload(payload: any): boolean {
	return Boolean(payload?.pull_request && payload?.review);
}
export function stripMention(text: string, _handle?: string): string {
	return text;
}

// ---------------------------------------------------------------------------
// Slack Event Transport stubs
// ---------------------------------------------------------------------------

export interface SlackWebhookEvent {
	eventId: string;
	slackBotToken?: string;
	payload: {
		text: string;
		channel: string;
		user: string;
		ts: string;
		thread_ts?: string;
	};
}

export class SlackEventTransport extends EventEmitter {
	constructor(_config: any) {
		super();
	}
	register(): void {}
}

// ---------------------------------------------------------------------------
// MCP Tools stubs
// ---------------------------------------------------------------------------

export interface MileyToolsOptions {
	parentSessionId?: string;
	onSessionCreated?: (childSessionId: string, parentId: string) => void;
	onFeedbackDelivery?: (
		childSessionId: string,
		message: string,
	) => Promise<boolean>;
}

export function createMileyToolsServer(
	_linearClient: LinearClient,
	_options?: MileyToolsOptions,
): { server: any } {
	return { server: null };
}
