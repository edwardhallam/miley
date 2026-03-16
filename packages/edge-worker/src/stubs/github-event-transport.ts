import { EventEmitter } from "node:events";

export interface GitHubWebhookEvent {
	eventType: string;
	deliveryId: string;
	payload: any;
	installationToken?: string;
}

export class GitHubEventTransport extends EventEmitter {
	constructor(_config: any) {
		super();
	}
	register(): void {}
}

export class GitHubCommentService {
	async postComment(_p: any): Promise<any> {
		return {};
	}
	async postIssueComment(_p: any): Promise<any> {
		return {};
	}
	async postReviewCommentReply(_p: any): Promise<any> {
		return {};
	}
	async addReaction(_p: any): Promise<any> {
		return {};
	}
}

export function extractRepoFullName(_e: GitHubWebhookEvent): string {
	return "";
}
export function extractRepoName(_e: GitHubWebhookEvent): string {
	return "";
}
export function extractRepoOwner(_e: GitHubWebhookEvent): string {
	return "";
}
export function extractPRNumber(_e: GitHubWebhookEvent): number {
	return 0;
}
export function extractPRTitle(_e: GitHubWebhookEvent): string {
	return "";
}
export function extractPRBranchRef(_e: GitHubWebhookEvent): string | null {
	return null;
}
export function extractPRBaseBranchRef(_e: GitHubWebhookEvent): string | null {
	return null;
}
export function extractCommentBody(_e: GitHubWebhookEvent): string {
	return "";
}
export function extractCommentAuthor(_e: GitHubWebhookEvent): string {
	return "";
}
export function extractCommentId(_e: GitHubWebhookEvent): number {
	return 0;
}
export function extractCommentUrl(_e: GitHubWebhookEvent): string {
	return "";
}
export function extractSessionKey(_e: GitHubWebhookEvent): string {
	return "";
}
export function isCommentOnPullRequest(_e: GitHubWebhookEvent): boolean {
	return false;
}
export function isIssueCommentPayload(_p: any): boolean {
	return false;
}
export function isPullRequestReviewCommentPayload(_p: any): boolean {
	return false;
}
export function isPullRequestReviewPayload(_p: any): boolean {
	return false;
}
export function stripMention(text: string, _h?: string): string {
	return text;
}

// Fixture stub for tests importing from miley-github-event-transport/test/fixtures
export const issueCommentPayload = {
	action: "created",
	issue: {
		number: 1,
		title: "Test PR",
		html_url: "",
		pull_request: { url: "" },
	},
	comment: {
		id: 1,
		body: "@mileyagent test",
		html_url: "",
		user: { login: "testuser" },
	},
	repository: {
		name: "repo",
		full_name: "test/repo",
		owner: { login: "test" },
	},
	sender: { login: "testuser" },
};
