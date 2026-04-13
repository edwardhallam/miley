import type { EnrichedContext } from "../IssueEnricher.js";

/** Escape XML-unsafe characters in user-provided content. */
function escapeXml(str: string): string {
	return str
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");
}

/**
 * Format EnrichedContext as structured XML blocks for the prompt.
 * Optionally includes a plugins block from repo config.
 * Returns empty string if context has no data and no plugins.
 */
export function formatEnrichedContext(
	ctx: EnrichedContext,
	plugins?: string[],
): string {
	const sections: string[] = [];

	// Comments
	if (ctx.comments && ctx.comments.length > 0) {
		const commentLines = ctx.comments.map(
			(c) =>
				`  <comment author="${escapeXml(c.author)}" timestamp="${escapeXml(c.createdAt)}">\n    ${escapeXml(c.body)}\n  </comment>`,
		);
		sections.push(
			`<issue-comments>\n${commentLines.join("\n")}\n</issue-comments>`,
		);
	}

	// Parent issue
	if (ctx.parentIssue) {
		const descTag = ctx.parentIssue.description
			? `\n  <description>${escapeXml(ctx.parentIssue.description)}</description>`
			: "";
		sections.push(
			`<parent-issue identifier="${escapeXml(ctx.parentIssue.identifier)}">\n  <title>${escapeXml(ctx.parentIssue.title)}</title>${descTag}\n</parent-issue>`,
		);
	}

	// Child issues
	if (ctx.childIssues && ctx.childIssues.length > 0) {
		const childLines = ctx.childIssues.map(
			(c) =>
				`  <issue identifier="${escapeXml(c.identifier)}" status="${escapeXml(c.stateName)}">${escapeXml(c.title)}</issue>`,
		);
		sections.push(`<child-issues>\n${childLines.join("\n")}\n</child-issues>`);
	}

	// Related issues
	if (ctx.relatedIssues && ctx.relatedIssues.length > 0) {
		const relatedLines = ctx.relatedIssues.map(
			(r) =>
				`  <issue identifier="${escapeXml(r.identifier)}" relationship="${escapeXml(r.relationshipType)}">${escapeXml(r.title)}</issue>`,
		);
		sections.push(
			`<related-issues>\n${relatedLines.join("\n")}\n</related-issues>`,
		);
	}

	// Project
	if (ctx.project) {
		const desc = ctx.project.description
			? `\n  ${escapeXml(ctx.project.description)}`
			: "";
		sections.push(
			`<project-context name="${escapeXml(ctx.project.name)}">${desc}\n</project-context>`,
		);
	}

	// Labels
	if (ctx.labels && ctx.labels.length > 0) {
		const labelLines = ctx.labels.map((l) => {
			const colorAttr = l.color ? ` color="${escapeXml(l.color)}"` : "";
			return `  <label name="${escapeXml(l.name)}"${colorAttr} />`;
		});
		sections.push(`<issue-labels>\n${labelLines.join("\n")}\n</issue-labels>`);
	}

	// Plugins (from repo config, not enrichment)
	if (plugins && plugins.length > 0) {
		const pluginLines = plugins.map(
			(p) => `  <plugin name="${escapeXml(p)}" />`,
		);
		sections.push(`<plugins>\n${pluginLines.join("\n")}\n</plugins>`);
	}

	if (sections.length === 0) return "";

	return `<enriched-context>\n\n${sections.join("\n\n")}\n\n</enriched-context>`;
}
