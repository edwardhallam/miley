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

// GitHub webhook utility stubs — all return safe defaults
export function extractRepoFullName(_event: GitHubWebhookEvent): string {
	return "";
}
export function extractRepoName(_event: GitHubWebhookEvent): string {
	return "";
}
export function extractRepoOwner(_event: GitHubWebhookEvent): string {
	return "";
}
export function extractPRNumber(_event: GitHubWebhookEvent): number {
	return 0;
}
export function extractPRTitle(_event: GitHubWebhookEvent): string {
	return "";
}
export function extractPRBranchRef(_event: GitHubWebhookEvent): string | null {
	return null;
}
export function extractPRBaseBranchRef(
	_event: GitHubWebhookEvent,
): string | null {
	return null;
}
export function extractCommentBody(_event: GitHubWebhookEvent): string {
	return "";
}
export function extractCommentAuthor(_event: GitHubWebhookEvent): string {
	return "";
}
export function extractCommentId(_event: GitHubWebhookEvent): number {
	return 0;
}
export function extractCommentUrl(_event: GitHubWebhookEvent): string {
	return "";
}
export function extractSessionKey(_event: GitHubWebhookEvent): string {
	return "";
}
export function isCommentOnPullRequest(_event: GitHubWebhookEvent): boolean {
	return false;
}
export function isIssueCommentPayload(_payload: any): boolean {
	return false;
}
export function isPullRequestReviewCommentPayload(_payload: any): boolean {
	return false;
}
export function isPullRequestReviewPayload(_payload: any): boolean {
	return false;
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
