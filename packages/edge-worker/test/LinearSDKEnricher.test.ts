import { describe, expect, it, vi } from "vitest";
import { LinearSDKEnricher } from "../src/LinearSDKEnricher.js";
import type { IIssueTrackerService } from "miley-core";

/** Minimal mock for IIssueTrackerService — only the methods LinearSDKEnricher calls. */
function createMockTracker(
	overrides: Partial<IIssueTrackerService> = {},
): IIssueTrackerService {
	return {
		fetchComments: vi.fn().mockResolvedValue({ nodes: [] }),
		fetchIssue: vi.fn().mockResolvedValue({
			parent: Promise.resolve(undefined),
			project: Promise.resolve(undefined),
			labels: vi.fn().mockResolvedValue({ nodes: [] }),
			inverseRelations: vi.fn().mockResolvedValue({ nodes: [] }),
		}),
		fetchIssueChildren: vi
			.fn()
			.mockResolvedValue({ children: [], childCount: 0 }),
		...overrides,
	} as unknown as IIssueTrackerService;
}

describe("LinearSDKEnricher", () => {
	it("returns empty context for issue with no data", async () => {
		const tracker = createMockTracker();
		const enricher = new LinearSDKEnricher(tracker);
		const ctx = await enricher.enrich("issue-id", "NEX-1");
		expect(ctx).toEqual({});
	});

	it("populates comments sorted newest-first", async () => {
		const tracker = createMockTracker({
			fetchComments: vi.fn().mockResolvedValue({
				nodes: [
					{
						body: "Older",
						createdAt: new Date("2026-04-10T10:00:00Z"),
						user: Promise.resolve({
							displayName: "Alice",
							name: "alice",
						}),
					},
					{
						body: "Newer",
						createdAt: new Date("2026-04-10T12:00:00Z"),
						user: Promise.resolve({
							displayName: "Bob",
							name: "bob",
						}),
					},
				],
			}),
		});
		const enricher = new LinearSDKEnricher(tracker);
		const ctx = await enricher.enrich("issue-id", "NEX-1");

		expect(ctx.comments).toHaveLength(2);
		expect(ctx.comments![0].author).toBe("Bob");
		expect(ctx.comments![0].body).toBe("Newer");
		expect(ctx.comments![1].author).toBe("Alice");
	});

	it("populates parent issue", async () => {
		const tracker = createMockTracker({
			fetchIssue: vi.fn().mockResolvedValue({
				parent: Promise.resolve({
					identifier: "NEX-100",
					title: "Parent",
					description: "Desc",
				}),
				project: Promise.resolve(undefined),
				labels: vi.fn().mockResolvedValue({ nodes: [] }),
				inverseRelations: vi.fn().mockResolvedValue({ nodes: [] }),
			}),
		});
		const enricher = new LinearSDKEnricher(tracker);
		const ctx = await enricher.enrich("issue-id", "NEX-1");

		expect(ctx.parentIssue).toEqual({
			identifier: "NEX-100",
			title: "Parent",
			description: "Desc",
		});
	});

	it("populates child issues with state names", async () => {
		const tracker = createMockTracker({
			fetchIssueChildren: vi.fn().mockResolvedValue({
				children: [
					{
						identifier: "NEX-2",
						title: "Child",
						state: Promise.resolve({ name: "Building" }),
					},
				],
				childCount: 1,
			}),
		});
		const enricher = new LinearSDKEnricher(tracker);
		const ctx = await enricher.enrich("issue-id", "NEX-1");

		expect(ctx.childIssues).toEqual([
			{ identifier: "NEX-2", title: "Child", stateName: "Building" },
		]);
	});

	it("returns partial context when one fetch fails", async () => {
		const tracker = createMockTracker({
			fetchComments: vi
				.fn()
				.mockRejectedValue(new Error("API down")),
			fetchIssueChildren: vi.fn().mockResolvedValue({
				children: [
					{
						identifier: "NEX-2",
						title: "Child",
						state: Promise.resolve({ name: "Done" }),
					},
				],
				childCount: 1,
			}),
		});
		const enricher = new LinearSDKEnricher(tracker);
		const ctx = await enricher.enrich("issue-id", "NEX-1");

		expect(ctx.comments).toBeUndefined();
		expect(ctx.childIssues).toHaveLength(1);
	});

	it("does not throw even if all fetches fail", async () => {
		const tracker = createMockTracker({
			fetchComments: vi
				.fn()
				.mockRejectedValue(new Error("fail")),
			fetchIssue: vi.fn().mockRejectedValue(new Error("fail")),
			fetchIssueChildren: vi
				.fn()
				.mockRejectedValue(new Error("fail")),
		});
		const enricher = new LinearSDKEnricher(tracker);
		const ctx = await enricher.enrich("issue-id", "NEX-1");
		expect(ctx).toEqual({});
	});
});
