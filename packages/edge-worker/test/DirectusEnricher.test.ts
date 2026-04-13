import { afterEach, describe, expect, it, vi } from "vitest";
import { DirectusEnricher } from "../src/DirectusEnricher.js";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

afterEach(() => {
	mockFetch.mockReset();
});

/** Helper: build a successful JSON response */
function jsonResponse(data: unknown): Response {
	return { ok: true, json: () => Promise.resolve(data) } as Response;
}

describe("DirectusEnricher", () => {
	const enricher = new DirectusEnricher(
		"http://directus.local:8055",
		"admin-token",
		"lin_api_test",
	);

	it("returns empty context when Directus returns no matching issue", async () => {
		// Directus: no match
		mockFetch.mockResolvedValueOnce(jsonResponse({ data: [] }));
		// Linear comments: empty
		mockFetch.mockResolvedValueOnce(
			jsonResponse({
				data: { issue: { comments: { nodes: [] } } },
			}),
		);
		// Linear relations: empty
		mockFetch.mockResolvedValueOnce(
			jsonResponse({
				data: {
					issue: {
						relations: { nodes: [] },
						inverseRelations: { nodes: [] },
					},
				},
			}),
		);

		const ctx = await enricher.enrich("issue-uuid", "NEX-1");
		expect(ctx.comments).toEqual([]);
		expect(ctx.relatedIssues).toBeUndefined();
	});

	it("populates labels and project from Directus", async () => {
		// Directus: issue row with labels and project
		mockFetch.mockResolvedValueOnce(
			jsonResponse({
				data: [
					{
						id: "uuid-1",
						identifier: "NEX-1",
						labels: [{ name: "bug", color: "#ff0000" }],
						project_name: "homelab-mvp",
						parent_id: null,
					},
				],
			}),
		);
		// Directus: children query — empty
		mockFetch.mockResolvedValueOnce(jsonResponse({ data: [] }));
		// Linear comments
		mockFetch.mockResolvedValueOnce(
			jsonResponse({
				data: { issue: { comments: { nodes: [] } } },
			}),
		);
		// Linear relations
		mockFetch.mockResolvedValueOnce(
			jsonResponse({
				data: {
					issue: {
						relations: { nodes: [] },
						inverseRelations: { nodes: [] },
					},
				},
			}),
		);

		const ctx = await enricher.enrich("issue-uuid", "NEX-1");
		expect(ctx.labels).toEqual([{ name: "bug", color: "#ff0000" }]);
		expect(ctx.project).toEqual({ name: "homelab-mvp" });
	});

	it("does not throw when Directus is unreachable", async () => {
		// Directus: network error
		mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));
		// Linear comments: succeeds
		mockFetch.mockResolvedValueOnce(
			jsonResponse({
				data: {
					issue: {
						comments: {
							nodes: [
								{
									body: "test",
									createdAt: "2026-04-10T10:00:00Z",
									user: { displayName: "A", name: "a" },
								},
							],
						},
					},
				},
			}),
		);
		// Linear relations
		mockFetch.mockResolvedValueOnce(
			jsonResponse({
				data: {
					issue: {
						relations: { nodes: [] },
						inverseRelations: { nodes: [] },
					},
				},
			}),
		);

		const ctx = await enricher.enrich("issue-uuid", "NEX-1");
		// Directus data missing, but Linear comments present
		expect(ctx.labels).toBeUndefined();
		expect(ctx.comments).toHaveLength(1);
		expect(ctx.comments![0].author).toBe("A");
	});

	it("fetches relations in both directions from Linear GraphQL", async () => {
		// Directus: no match
		mockFetch.mockResolvedValueOnce(jsonResponse({ data: [] }));
		// Linear comments: empty
		mockFetch.mockResolvedValueOnce(
			jsonResponse({
				data: { issue: { comments: { nodes: [] } } },
			}),
		);
		// Linear relations: forward + inverse
		mockFetch.mockResolvedValueOnce(
			jsonResponse({
				data: {
					issue: {
						relations: {
							nodes: [
								{
									type: "blocks",
									relatedIssue: {
										identifier: "NEX-2",
										title: "Blocked",
									},
								},
							],
						},
						inverseRelations: {
							nodes: [
								{
									type: "related",
									issue: {
										identifier: "NEX-3",
										title: "Related",
									},
								},
							],
						},
					},
				},
			}),
		);

		const ctx = await enricher.enrich("issue-uuid", "NEX-1");
		expect(ctx.relatedIssues).toHaveLength(2);
		expect(ctx.relatedIssues![0]).toEqual({
			identifier: "NEX-2",
			title: "Blocked",
			relationshipType: "blocks",
		});
		expect(ctx.relatedIssues![1]).toEqual({
			identifier: "NEX-3",
			title: "Related",
			relationshipType: "inverse-related",
		});
	});
});
