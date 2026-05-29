import type { IIssueTrackerService } from "miley-core";
import type { EnrichedContext, IIssueEnricher } from "./IssueEnricher.js";

/**
 * Default enricher — uses the existing IIssueTrackerService (Linear SDK).
 * Never throws. Returns partial EnrichedContext on failure.
 */
export class LinearSDKEnricher implements IIssueEnricher {
	constructor(private issueTracker: IIssueTrackerService) {}

	async enrich(
		issueId: string,
		_issueIdentifier: string,
	): Promise<EnrichedContext> {
		const result: EnrichedContext = {};

		const [commentsResult, issueResult, childrenResult] =
			await Promise.allSettled([
				this.issueTracker.fetchComments(issueId),
				this.issueTracker.fetchIssue(issueId),
				this.issueTracker.fetchIssueChildren(issueId),
			]);

		// Comments — sort newest-first
		if (commentsResult.status === "fulfilled") {
			const nodes = commentsResult.value.nodes;
			if (nodes.length > 0) {
				const mapped = await Promise.all(
					nodes.map(async (c) => {
						const user = await c.user;
						return {
							author: user?.displayName ?? user?.name ?? "Unknown",
							body: c.body,
							createdAt: c.createdAt?.toISOString() ?? "",
						};
					}),
				);
				result.comments = mapped.sort((a, b) =>
					b.createdAt.localeCompare(a.createdAt),
				);
			}
		}

		// Parent, project, labels, relations (from full issue)
		if (issueResult.status === "fulfilled") {
			const issue = issueResult.value;

			const parent = await issue.parent;
			if (parent) {
				result.parentIssue = {
					identifier: parent.identifier,
					title: parent.title,
					description: parent.description ?? undefined,
				};
			}

			const project = await issue.project;
			if (project) {
				result.project = {
					name: project.name,
					description: project.description ?? undefined,
				};
			}

			const labelsConn = await issue.labels();
			if (labelsConn.nodes.length > 0) {
				result.labels = labelsConn.nodes.map((l) => ({
					name: l.name,
					color: l.color ?? undefined,
				}));
			}

			// Fetch both relation directions to match the Directus-era enricher.
			try {
				const [forwardRelationsResult, inverseRelationsResult] =
					await Promise.allSettled([
						issue.relations(),
						issue.inverseRelations(),
					]);
				const relatedIssues: NonNullable<EnrichedContext["relatedIssues"]> = [];

				if (forwardRelationsResult.status === "fulfilled") {
					for (const r of forwardRelationsResult.value.nodes) {
						const related = await r.relatedIssue;
						if (related) {
							relatedIssues.push({
								identifier: related.identifier,
								title: related.title,
								relationshipType: r.type ?? "related",
							});
						}
					}
				}

				if (inverseRelationsResult.status === "fulfilled") {
					for (const r of inverseRelationsResult.value.nodes) {
						const related = await r.issue;
						if (related) {
							relatedIssues.push({
								identifier: related.identifier,
								title: related.title,
								relationshipType: `inverse-${r.type ?? "related"}`,
							});
						}
					}
				}

				if (relatedIssues.length > 0) {
					result.relatedIssues = relatedIssues;
				}
			} catch {
				// Relations may not be available — non-critical
			}
		}

		// Children
		if (childrenResult.status === "fulfilled") {
			const { children } = childrenResult.value;
			if (children.length > 0) {
				result.childIssues = await Promise.all(
					children.map(async (c) => {
						const state = await c.state;
						return {
							identifier: c.identifier,
							title: c.title,
							stateName: state?.name ?? "Unknown",
						};
					}),
				);
			}
		}

		return result;
	}
}
