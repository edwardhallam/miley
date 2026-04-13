/**
 * Context fetched by an enricher beyond the basic issue title+description.
 * All fields optional — enricher returns what it can fetch.
 */
export interface EnrichedContext {
	/** Comments on the issue (newest first, no cap) */
	comments?: Array<{
		author: string;
		body: string;
		createdAt: string;
	}>;
	/** Parent issue context (if this is a sub-issue) */
	parentIssue?: {
		identifier: string;
		title: string;
		description?: string;
	};
	/** Sub-issues (children) */
	childIssues?: Array<{
		identifier: string;
		title: string;
		stateName: string;
	}>;
	/** Linked/related issues */
	relatedIssues?: Array<{
		identifier: string;
		title: string;
		relationshipType: string;
	}>;
	/** Project context */
	project?: {
		name: string;
		description?: string;
	};
	/** Label metadata */
	labels?: Array<{
		name: string;
		color?: string;
	}>;
}

/**
 * Enriches an issue with additional context from the issue tracker.
 *
 * Implementations MUST NOT throw — return partial/empty EnrichedContext on failure.
 * Log errors internally and trigger notifications as appropriate.
 */
export interface IIssueEnricher {
	enrich(issueId: string, issueIdentifier: string): Promise<EnrichedContext>;
}
