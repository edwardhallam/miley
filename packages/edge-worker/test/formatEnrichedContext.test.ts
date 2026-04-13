import { describe, expect, it } from "vitest";
import { formatEnrichedContext } from "../src/prompt-assembly/formatEnrichedContext.js";
import type { EnrichedContext } from "../src/IssueEnricher.js";

describe("formatEnrichedContext", () => {
	it("returns empty string for empty context and no plugins", () => {
		const ctx: EnrichedContext = {};
		expect(formatEnrichedContext(ctx)).toBe("");
	});

	it("returns empty string for context with only empty arrays", () => {
		const ctx: EnrichedContext = {
			comments: [],
			childIssues: [],
			relatedIssues: [],
			labels: [],
		};
		expect(formatEnrichedContext(ctx)).toBe("");
	});

	it("formats comments as XML", () => {
		const ctx: EnrichedContext = {
			comments: [
				{
					author: "Eddie",
					body: "Looks good",
					createdAt: "2026-04-10T14:30:00Z",
				},
				{
					author: "Miley",
					body: "On it",
					createdAt: "2026-04-10T14:32:00Z",
				},
			],
		};
		const result = formatEnrichedContext(ctx);
		expect(result).toContain("<enriched-context>");
		expect(result).toContain("</enriched-context>");
		expect(result).toContain("<issue-comments>");
		expect(result).toContain(
			'<comment author="Eddie" timestamp="2026-04-10T14:30:00Z">',
		);
		expect(result).toContain("Looks good");
		expect(result).toContain("</issue-comments>");
	});

	it("formats parent issue", () => {
		const ctx: EnrichedContext = {
			parentIssue: {
				identifier: "NEX-600",
				title: "Parent epic",
				description: "The parent",
			},
		};
		const result = formatEnrichedContext(ctx);
		expect(result).toContain('<parent-issue identifier="NEX-600">');
		expect(result).toContain("<title>Parent epic</title>");
		expect(result).toContain("<description>The parent</description>");
		expect(result).toContain("</parent-issue>");
	});

	it("formats child issues", () => {
		const ctx: EnrichedContext = {
			childIssues: [
				{
					identifier: "NEX-652",
					title: "Sub-task A",
					stateName: "Building",
				},
			],
		};
		const result = formatEnrichedContext(ctx);
		expect(result).toContain("<child-issues>");
		expect(result).toContain(
			'<issue identifier="NEX-652" status="Building">Sub-task A</issue>',
		);
	});

	it("formats related issues", () => {
		const ctx: EnrichedContext = {
			relatedIssues: [
				{
					identifier: "NEX-508",
					title: "Harden API",
					relationshipType: "related",
				},
			],
		};
		const result = formatEnrichedContext(ctx);
		expect(result).toContain("<related-issues>");
		expect(result).toContain(
			'<issue identifier="NEX-508" relationship="related">Harden API</issue>',
		);
	});

	it("formats project context", () => {
		const ctx: EnrichedContext = {
			project: { name: "homelab-mvp", description: "The project" },
		};
		const result = formatEnrichedContext(ctx);
		expect(result).toContain('<project-context name="homelab-mvp">');
		expect(result).toContain("The project");
	});

	it("formats labels", () => {
		const ctx: EnrichedContext = {
			labels: [
				{ name: "has-description", color: "#eb5757" },
				{ name: "miley" },
			],
		};
		const result = formatEnrichedContext(ctx);
		expect(result).toContain("<issue-labels>");
		expect(result).toContain(
			'<label name="has-description" color="#eb5757" />',
		);
		expect(result).toContain('<label name="miley" />');
	});

	it("escapes XML-unsafe characters in user content", () => {
		const ctx: EnrichedContext = {
			comments: [
				{
					author: "User <admin>",
					body: "Use x && y < z",
					createdAt: "2026-04-10T14:30:00Z",
				},
			],
		};
		const result = formatEnrichedContext(ctx);
		expect(result).toContain('author="User &lt;admin&gt;"');
		expect(result).toContain("Use x &amp;&amp; y &lt; z");
	});

	it("omits sections with no data", () => {
		const ctx: EnrichedContext = {
			project: { name: "only-project" },
		};
		const result = formatEnrichedContext(ctx);
		expect(result).toContain("<project-context");
		expect(result).not.toContain("<issue-comments>");
		expect(result).not.toContain("<parent-issue");
		expect(result).not.toContain("<child-issues>");
		expect(result).not.toContain("<related-issues>");
		expect(result).not.toContain("<issue-labels>");
	});

	it("formats a full context with all sections", () => {
		const ctx: EnrichedContext = {
			comments: [
				{ author: "A", body: "B", createdAt: "2026-01-01T00:00:00Z" },
			],
			parentIssue: { identifier: "P-1", title: "Parent" },
			childIssues: [
				{ identifier: "C-1", title: "Child", stateName: "Done" },
			],
			relatedIssues: [
				{
					identifier: "R-1",
					title: "Related",
					relationshipType: "blocks",
				},
			],
			project: { name: "proj" },
			labels: [{ name: "bug" }],
		};
		const result = formatEnrichedContext(ctx);
		expect(result).toContain("<issue-comments>");
		expect(result).toContain("<parent-issue");
		expect(result).toContain("<child-issues>");
		expect(result).toContain("<related-issues>");
		expect(result).toContain("<project-context");
		expect(result).toContain("<issue-labels>");
	});

	it("formats plugins as XML block", () => {
		const ctx: EnrichedContext = {};
		const result = formatEnrichedContext(ctx, ["leeboard"]);
		expect(result).toContain("<plugins>");
		expect(result).toContain('<plugin name="leeboard" />');
		expect(result).toContain("</plugins>");
	});

	it("returns empty string with empty plugins and empty context", () => {
		const ctx: EnrichedContext = {};
		expect(formatEnrichedContext(ctx, [])).toBe("");
	});
});
