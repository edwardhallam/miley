import type { EnrichedContext, IIssueEnricher } from "./IssueEnricher.js";

/**
 * Personal enricher — fetches from Directus REST API (mirrored Linear data)
 * and falls back to Linear GraphQL for comments and relations (not mirrored).
 *
 * Never throws. Returns partial EnrichedContext on failure.
 */
export class DirectusEnricher implements IIssueEnricher {
	constructor(
		private directusUrl: string,
		private directusToken: string,
		private linearApiKey: string,
	) {}

	async enrich(
		issueId: string,
		issueIdentifier: string,
	): Promise<EnrichedContext> {
		const result: EnrichedContext = {};

		// Parallel: Directus for mirrored data, Linear GraphQL for comments + relations
		const [directusResult, commentsResult, relationsResult] =
			await Promise.allSettled([
				this.fetchFromDirectus(issueIdentifier),
				this.fetchCommentsFromLinear(issueId),
				this.fetchRelationsFromLinear(issueId),
			]);

		// Directus: labels, project, parent, children
		if (directusResult.status === "fulfilled" && directusResult.value) {
			const data = directusResult.value;
			result.labels = data.labels;
			result.project = data.project;
			result.parentIssue = data.parentIssue;
			result.childIssues = data.childIssues;
		}

		// Linear GraphQL: comments (sorted newest-first)
		if (commentsResult.status === "fulfilled") {
			result.comments = commentsResult.value;
		}

		// Linear GraphQL: relations (both directions)
		if (relationsResult.status === "fulfilled") {
			result.relatedIssues = relationsResult.value;
		}

		return result;
	}

	private async fetchFromDirectus(identifier: string): Promise<{
		labels?: EnrichedContext["labels"];
		project?: EnrichedContext["project"];
		parentIssue?: EnrichedContext["parentIssue"];
		childIssues?: EnrichedContext["childIssues"];
	} | null> {
		const headers = { Authorization: `Bearer ${this.directusToken}` };

		// Fetch the issue row with labels and project_name
		const issueRes = await fetch(
			`${this.directusUrl}/items/linear_issues?${new URLSearchParams({
				"filter[identifier][_eq]": identifier,
				"filter[trashed][_eq]": "false",
				fields: "id,identifier,title,description,labels,project_name,parent_id",
			})}`,
			{ headers },
		);
		const issueData = (await issueRes.json()) as {
			data?: Array<{
				id: string;
				identifier: string;
				labels?: Array<{ name: string; color?: string }>;
				project_name?: string;
				parent_id?: string;
			}>;
		};
		const row = issueData.data?.[0];
		if (!row) return null;

		const result: {
			labels?: EnrichedContext["labels"];
			project?: EnrichedContext["project"];
			parentIssue?: EnrichedContext["parentIssue"];
			childIssues?: EnrichedContext["childIssues"];
		} = {};

		// Labels — Directus returns [{id, name, color}] in the labels JSON field
		if (row.labels?.length) {
			result.labels = row.labels.map((l) => ({
				name: l.name,
				color: l.color,
			}));
		}

		// Project — project_name is a denormalized string in the mirror
		if (row.project_name) {
			result.project = { name: row.project_name };
		}

		// Parent issue — parent_id is a UUID; resolve to identifier+title
		if (row.parent_id) {
			try {
				const parentRes = await fetch(
					`${this.directusUrl}/items/linear_issues/${row.parent_id}?${new URLSearchParams(
						{
							fields: "identifier,title,description",
						},
					)}`,
					{ headers },
				);
				const parentData = (await parentRes.json()) as {
					data?: {
						identifier: string;
						title: string;
						description?: string;
					};
				};
				if (parentData.data) {
					result.parentIssue = {
						identifier: parentData.data.identifier,
						title: parentData.data.title,
						description: parentData.data.description ?? undefined,
					};
				}
			} catch {
				// Parent resolution failed — non-critical
			}
		}

		// Child issues — filter by parent_id in Directus
		try {
			const childRes = await fetch(
				`${this.directusUrl}/items/linear_issues?${new URLSearchParams({
					"filter[parent_id][_eq]": row.id,
					"filter[trashed][_eq]": "false",
					fields: "identifier,title,state_name",
				})}`,
				{ headers },
			);
			const childData = (await childRes.json()) as {
				data?: Array<{
					identifier: string;
					title: string;
					state_name: string;
				}>;
			};
			if (childData.data?.length) {
				result.childIssues = childData.data.map((c) => ({
					identifier: c.identifier,
					title: c.title,
					stateName: c.state_name,
				}));
			}
		} catch {
			// Child query failed — non-critical
		}

		return result;
	}

	private async fetchCommentsFromLinear(
		issueId: string,
	): Promise<EnrichedContext["comments"]> {
		const res = await fetch("https://api.linear.app/graphql", {
			method: "POST",
			headers: {
				Authorization: this.linearApiKey,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				query: `{ issue(id: "${issueId}") {
					comments { nodes { body createdAt user { displayName name } } }
				} }`,
			}),
		});
		const data = (await res.json()) as {
			data?: {
				issue?: {
					comments?: {
						nodes?: Array<{
							body: string;
							createdAt?: string;
							user?: { displayName?: string; name?: string };
						}>;
					};
				};
			};
		};
		const nodes = data.data?.issue?.comments?.nodes ?? [];
		return nodes
			.map((c) => ({
				author: c.user?.displayName ?? c.user?.name ?? "Unknown",
				body: c.body,
				createdAt: c.createdAt ?? "",
			}))
			.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
	}

	private async fetchRelationsFromLinear(
		issueId: string,
	): Promise<EnrichedContext["relatedIssues"]> {
		// Fetch BOTH directions — forward (relations) and inverse (inverseRelations)
		const res = await fetch("https://api.linear.app/graphql", {
			method: "POST",
			headers: {
				Authorization: this.linearApiKey,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				query: `{ issue(id: "${issueId}") {
					relations { nodes { type relatedIssue { identifier title } } }
					inverseRelations { nodes { type issue { identifier title } } }
				} }`,
			}),
		});
		const data = (await res.json()) as {
			data?: {
				issue?: {
					relations?: {
						nodes?: Array<{
							type?: string;
							relatedIssue?: {
								identifier: string;
								title: string;
							};
						}>;
					};
					inverseRelations?: {
						nodes?: Array<{
							type?: string;
							issue?: {
								identifier: string;
								title: string;
							};
						}>;
					};
				};
			};
		};
		const forward = data.data?.issue?.relations?.nodes ?? [];
		const inverse = data.data?.issue?.inverseRelations?.nodes ?? [];

		const results: NonNullable<EnrichedContext["relatedIssues"]> = [];
		for (const r of forward) {
			if (r.relatedIssue) {
				results.push({
					identifier: r.relatedIssue.identifier,
					title: r.relatedIssue.title,
					relationshipType: r.type ?? "related",
				});
			}
		}
		for (const r of inverse) {
			if (r.issue) {
				results.push({
					identifier: r.issue.identifier,
					title: r.issue.title,
					relationshipType: `inverse-${r.type ?? "related"}`,
				});
			}
		}
		return results.length > 0 ? results : undefined;
	}
}
